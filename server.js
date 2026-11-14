const express = require('express');
const dns = require('dns').promises;
const net = require('net');
const tls = require('tls');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SECURITY_HEADERS = [
  { key: 'strict-transport-security', label: 'HSTS (Strict-Transport-Security)', weight: 15 },
  { key: 'content-security-policy', label: 'CSP (Content-Security-Policy)', weight: 15 },
  { key: 'x-frame-options', label: 'X-Frame-Options', weight: 10 },
  { key: 'x-content-type-options', label: 'X-Content-Type-Options', weight: 10 },
  { key: 'referrer-policy', label: 'Referrer-Policy', weight: 5 },
  { key: 'permissions-policy', label: 'Permissions-Policy', weight: 5 }
];

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80')
    );
  }
  return true;
}

async function resolveAndValidateHost(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error('Private or loopback IP addresses are not allowed');
    }
    return [hostname];
  }
  const records = await dns.lookup(hostname, { all: true });
  const ips = records.map((r) => r.address);
  if (ips.length === 0 || ips.some(isPrivateIp)) {
    throw new Error('Target resolves to a private or disallowed IP address');
  }
  return ips;
}

function inspectTls(hostname, port = 443) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized: false, timeout: 6000 },
      () => {
        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;
        const protocol = socket.getProtocol();
        socket.end();

        if (!cert || !cert.valid_to) {
          return resolve({ available: false, error: 'No certificate returned' });
        }

        const validToMs = Date.parse(cert.valid_to);
        const daysRemaining = Math.floor((validToMs - Date.now()) / (1000 * 60 * 60 * 24));

        resolve({
          available: true,
          authorized,
          protocol,
          subject: cert.subject?.CN || hostname,
          issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown',
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          daysRemaining
        });
      }
    );

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ available: false, error: 'TLS handshake timed out' });
    });

    socket.on('error', (err) => {
      resolve({ available: false, error: err.message });
    });
  });
}

function extractMeta(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descMatch =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);

  return {
    title: titleMatch ? titleMatch[1].trim().slice(0, 140) : null,
    description: descMatch ? descMatch[1].trim().slice(0, 240) : null
  };
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'habibwep-scan', timestamp: new Date().toISOString() });
});

app.post('/api/scan', async (req, res) => {
  try {
    let rawUrl = String(req.body?.url || '').trim();
    if (!rawUrl) {
      return res.status(400).json({ error: 'يرجى إدخال رابط الموقع (URL)' });
    }
    if (!/^https?:\/\//i.test(rawUrl)) {
      rawUrl = `https://${rawUrl}`;
    }

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'الرابط غير صالح' });
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'يُسمح فقط ببروتوكول HTTP أو HTTPS' });
    }

    const ips = await resolveAndValidateHost(parsed.hostname);

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    let response;
    let bodyText = '';
    try {
      response = await fetch(parsed.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'HabibWepScan/1.0 (+https://railway.app)' }
      });
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        bodyText = (await response.text()).slice(0, 120000);
      }
    } finally {
      clearTimeout(timer);
    }

    const latencyMs = Date.now() - start;
    const finalUrl = response.url || parsed.toString();
    const finalParsed = new URL(finalUrl);

    const tlsInfo =
      finalParsed.protocol === 'https:'
        ? await inspectTls(finalParsed.hostname, Number(finalParsed.port) || 443)
        : { available: false, error: 'Site is not using HTTPS' };

    const headersChecklist = SECURITY_HEADERS.map((item) => {
      const value = response.headers.get(item.key);
      return {
        key: item.key,
        label: item.label,
        present: Boolean(value),
        value: value || null,
        weight: item.weight
      };
    });

    let score = 0;
    if (response.status >= 200 && response.status < 400) score += 20;
    if (finalParsed.protocol === 'https:' && tlsInfo.available && tlsInfo.authorized) score += 20;
    else if (finalParsed.protocol === 'https:' && tlsInfo.available) score += 10;

    for (const h of headersChecklist) {
      if (h.present) score += h.weight;
    }

    res.json({
      target: parsed.toString(),
      finalUrl,
      hostname: finalParsed.hostname,
      ips,
      status: response.status,
      statusText: response.statusText,
      latencyMs,
      server: response.headers.get('server') || null,
      poweredBy: response.headers.get('x-powered-by') || null,
      tls: tlsInfo,
      securityHeaders: headersChecklist,
      meta: bodyText ? extractMeta(bodyText) : { title: null, description: null },
      score: Math.min(100, score),
      scannedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'فشل فحص الموقع' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`HabibWep Scan running on http://0.0.0.0:${PORT}`);
});
