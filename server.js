const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SERVICES = [
  {
    id: 'mri-3t',
    name: 'الرنين المغناطيسي 3 تسلا (MRI 3T)',
    category: 'تصوير بالرنين',
    duration: '25 - 40 دقيقة',
    price: '1,850 ج.م',
    prep: 'يُرجى إزالة جميع المعادن والمجوهرات، وإبلاغ الطبيب في حال وجود منظم ضربات قلب أو شرائح معدنية.',
    description: 'دقة فائقة لتصوير المخ والأعصاب والعمود الفقري والمفاصل بدون أي إشعاع.'
  },
  {
    id: 'ct-128',
    name: 'الأشعة المقطعية 128 مقطع (CT Scan)',
    category: 'تصوير مقطعي',
    duration: '10 - 15 دقيقة',
    price: '1,200 ج.م',
    prep: 'في حال الفحص بالصبغة يلزم الصيام 4 ساعات وإحضار تحليل وظائف كلى حديث.',
    description: 'تصوير ثلاثي الأبعاد فائق السرعة للشرايين التاجية والصدر والبطن والحوض.'
  },
  {
    id: 'us-4d',
    name: 'السونار رباعي الأبعاد والدوبلر (4D Ultrasound)',
    category: 'موجات فوق صوتية',
    duration: '15 - 20 دقيقة',
    price: '650 ج.م',
    prep: 'لفحص البطن يلزم الصيام 6 ساعات، ولفحص الحوض يُنصح بشرب الماء قبل الفحص.',
    description: 'متابعة دقيقة للحمل والأجنة وفحص الأوعية الدموية والبطن بأحدث أجهزة الموجات.'
  },
  {
    id: 'xray-digital',
    name: 'الأشعة الرقمية المتطورة (Digital X-Ray)',
    category: 'أشعة عادية',
    duration: '5 - 10 دقائق',
    price: '320 ج.م',
    prep: 'لا يتطلب تحضيراً مسبقاً، مع إبلاغ الفني في حال وجود حمل.',
    description: 'تصوير رقمي فوري للعظام والصدر والمفاصل بأقل جرعة إشعاع ممكنة.'
  },
  {
    id: 'mammo',
    name: 'الماموجرام الرقمي ثلاثي الأبعاد',
    category: 'صحة المرأة',
    duration: '15 دقيقة',
    price: '950 ج.م',
    prep: 'يُفضل تجنب استخدام مزيلات العرق أو البودرة يوم الفحص.',
    description: 'فحص دقيق ومريح للكشف المبكر عن أورام الثدي بأعلى حساسية تشخيصية.'
  },
  {
    id: 'dexa',
    name: 'قياس كثافة العظام (DEXA Scan)',
    category: 'فحص العظام',
    duration: '10 دقائق',
    price: '550 ج.م',
    prep: 'التوقف عن مكملات الكالسيوم قبل الفحص بـ 24 ساعة.',
    description: 'تقييم شامل لصحة العظام والكشف المبكر عن هشاشة العظام.'
  }
];

const APPOINTMENTS = [];

const SAMPLE_RESULTS = {
  'HS-2026': {
    code: 'HS-2026',
    patientName: 'أحمد محمد محمود',
    serviceName: 'الرنين المغناطيسي 3 تسلا (MRI 3T)',
    branch: 'فرع المهندسين',
    date: '2026-11-14',
    status: 'جاهز للاستلام',
    doctor: 'د. كريم عبد الرحمن — استشاري الأشعة التشخيصية',
    summary: 'تمت مراجعة الصور واعتماد التقرير الطبي النهائي بنجاح. جميع المؤشرات طبيعية ولا توجد ملاحظات حرجة.'
  },
  'HS-1042': {
    code: 'HS-1042',
    patientName: 'سارة علي حسن',
    serviceName: 'الأشعة المقطعية 128 مقطع (CT Scan)',
    branch: 'فرع مدينة نصر',
    date: '2026-11-14',
    status: 'قيد المراجعة الطبية',
    doctor: 'د. نهى طارق — أستاذ مساعد الأشعة',
    summary: 'الصور قيد المراجعة النهائية من قِبل استشاري الأشعة، وسيتم إرسال التقرير خلال ساعتين.'
  }
};

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'habibwep-scan',
    service: 'Habib Scan Advanced Radiology Center',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/services', (_req, res) => {
  res.json({ services: SERVICES });
});

app.post('/api/appointments', (req, res) => {
  const { patientName, phone, serviceId, branch, date, time, notes } = req.body || {};

  if (!patientName || !phone || !serviceId || !date) {
    return res.status(400).json({ error: 'يرجى إدخال الاسم ورقم الهاتف ونوع الفحص والتاريخ.' });
  }

  const service = SERVICES.find((s) => s.id === serviceId);
  if (!service) {
    return res.status(400).json({ error: 'نوع الفحص المحدد غير متاح.' });
  }

  const code = `HS-${Math.floor(1000 + Math.random() * 9000)}`;
  const booking = {
    code,
    patientName: String(patientName).trim(),
    phone: String(phone).trim(),
    serviceId,
    serviceName: service.name,
    branch: branch || 'فرع المعادي',
    date,
    time: time || '12:00 ظهراً',
    notes: notes ? String(notes).trim() : '',
    status: 'تم تأكيد الحجز المبدئي',
    createdAt: new Date().toISOString()
  };

  APPOINTMENTS.push(booking);

  SAMPLE_RESULTS[code] = {
    code,
    patientName: booking.patientName,
    serviceName: booking.serviceName,
    branch: booking.branch,
    date: booking.date,
    status: 'في انتظار إجراء الفحص',
    doctor: 'فريق الأشعة المناوب — حبيب سكان',
    summary: `موعدك محجوز بتاريخ ${booking.date} الساعة ${booking.time}. تعليمات التحضير: ${service.prep}`
  };

  res.status(201).json({ booking });
});

app.get('/api/results/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const result = SAMPLE_RESULTS[code];
  if (!result) {
    return res.status(404).json({
      error: 'لم يتم العثور على تقرير بهذا الكود. جرب الكود التجريبي HS-2026 أو احجز موعداً جديداً.'
    });
  }
  res.json({ result });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Habib Scan Radiology Center running on http://0.0.0.0:${PORT}`);
});
