const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

const DATA_DIR = path.join(__dirname, '../data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, '[]', 'utf8');
}

function readHistory() {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveHistory(item) {
  const history = readHistory();
  history.unshift(item);
  fs.writeFileSync(
    HISTORY_FILE,
    JSON.stringify(history.slice(0, 500), null, 2),
    'utf8'
  );
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/status', (req, res) => {
  res.json({
    name: 'SHIELD AI',
    status: 'online',
    version: '1.1.0'
  });
});

app.get('/api/history', (req, res) => {
  res.json({
    total: readHistory().length,
    history: readHistory()
  });
});

app.delete('/api/history', (req, res) => {
  try {
    fs.writeFileSync(HISTORY_FILE, '[]', 'utf8');
    res.json({
      success: true,
      message: 'تم مسح سجل الفحوصات.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'تعذر مسح سجل الفحوصات.'
    });
  }
});

app.post('/api/scan', (req, res) => {
  const text = String(req.body?.text || '').trim();

  if (!text) {
    return res.status(400).json({
      title: 'لا يوجد محتوى للفحص',
      message: 'أدخل رسالة أو رابطًا أولًا.'
    });
  }

  if (text.length > 5000) {
    return res.status(413).json({
      title: 'المحتوى طويل جدًا',
      message: 'الحد الأقصى هو 5000 حرف.'
    });
  }

  let score = 0;
  const indicators = [];

  function flag(condition, points, message) {
    if (condition) {
      score += points;
      indicators.push(message);
    }
  }

  flag(
    /(كلمة المرور|password|login|تسجيل الدخول|بياناتك البنكية|بيانات البطاقة)/i.test(text),
    25,
    'المحتوى يطلب بيانات دخول أو بيانات مالية.'
  );

  flag(
    /(رمز التحقق|رمز التأكيد|otp|verification code|كود التفعيل)/i.test(text),
    20,
    'المحتوى يشير إلى رموز تحقق يجب عدم مشاركتها مع الآخرين.'
  );

  flag(
    /(اربح|فزت|جائزة|هدية مجانية|مبروك|winner|free prize|claim your prize)/i.test(text),
    15,
    'توجد عبارات جوائز أو مكافآت قد تُستخدم كطُعم احتيالي.'
  );

  flag(
    /(بشكل عاجل|فورًا|خلال دقائق|آخر فرصة|سيتم إغلاق حسابك|عاجل جدًا|urgent|act now|account suspended)/i.test(text),
    15,
    'توجد لغة استعجال أو تهديد بالتصرف السريع.'
  );

  flag(
    /(تحويل أموال|أرسل المبلغ|رسوم استلام|ادفع الآن|transfer money|payment required)/i.test(text),
    20,
    'المحتوى يطلب تحويل أموال أو دفع رسوم.'
  );

  const urls = text.match(/https?:\/\/[^\s<>"']+/gi) || [];

  const shorteners = [
    'bit.ly', 'tinyurl.com', 't.co', 'is.gd',
    'cutt.ly', 'rb.gy', 'shorturl.at'
  ];

  for (const raw of urls) {
    try {
      const clean = raw.replace(/[),.!?]+$/, '');
      const parsed = new URL(clean);
      const host = parsed.hostname.toLowerCase();

      flag(parsed.protocol !== 'https:', 10,
        'يوجد رابط لا يستخدم اتصال HTTPS المشفر.');

      flag(shorteners.includes(host), 20,
        'يوجد رابط مختصر يخفي عنوان الوجهة الحقيقي.');

      flag(/^(\d{1,3}\.){3}\d{1,3}$/.test(host), 25,
        'عنوان الرابط يستخدم عنوان IP بدل اسم نطاق معتاد.');

      flag(host.includes('xn--'), 20,
        'اسم النطاق يحتوي على ترميز قد يخفي تشابهًا بصريًا.');

      flag(parsed.username !== '' || parsed.password !== '', 25,
        'عنوان الرابط يحتوي على بيانات قبل اسم النطاق وقد يكون مضللًا.');

    } catch {
      indicators.push('تعذر قراءة أحد الروابط الموجودة في النص.');
      score += 5;
    }
  }

  score = Math.min(score, 100);

  let title;
  let message;

  if (score >= 50) {
    title = 'مؤشرات خطورة مرتفعة';
    message = 'تم العثور على عدة مؤشرات تستدعي الحذر. لا تضغط على الروابط ولا ترسل بيانات أو أموالًا.';
  } else if (score >= 25) {
    title = 'مؤشرات تستحق الانتباه';
    message = 'وجدنا بعض العلامات المريبة. تحقق من مصدر الرسالة قبل التفاعل معها.';
  } else {
    title = 'لم تظهر مؤشرات واضحة';
    message = 'لم يرصد الفحص الأولي علامات قوية في النص، لكن هذا لا يثبت أن المحتوى آمن.';
  }

  if (indicators.length === 0) {
    indicators.push('لم يتم رصد مؤشرات واضحة وفق القواعد الحالية.');
  }

  const result = {
    score,
    title,
    message,
    indicators,
    notice: 'هذا فحص أولي محلي وليس حكمًا نهائيًا على سلامة المحتوى.'
  };

  const historyItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    source: req.body?.source === 'image' ? 'image' : 'text',
    text,
    ...result
  };

  try {
    saveHistory(historyItem);
  } catch (error) {
    console.error('History save error:', error.message);
  }

  res.json(result);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SHIELD AI running on http://localhost:${PORT}`);
});
