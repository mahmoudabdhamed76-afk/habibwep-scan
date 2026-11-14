const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'habib-scan-state.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/state', (req, res) => {
  if (fs.existsSync(STATE_FILE)) {
    try {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      return res.json(JSON.parse(raw));
    } catch (err) {
      return res.status(500).json({ error: 'Failed to read state' });
    }
  }
  res.json(null);
});

app.post('/api/state', (req, res) => {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save state' });
  }
});

app.get(['/cms', '/cms/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cms.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`HABIB SCAN Server running on http://localhost:${PORT}`);
});
