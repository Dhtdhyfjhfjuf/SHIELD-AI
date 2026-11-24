const input = document.getElementById('scanInput');
const counter = document.getElementById('charCount');
const result = document.getElementById('result');
const button = document.getElementById('scanButton');
let ocrReviewRequired = false;

input.addEventListener('input', () => {
  counter.textContent = `${input.value.length} / 5000`;

  if (ocrReviewRequired) {
    ocrReviewRequired = false;
    button.disabled = false;
    button.innerHTML = '<span>✦</span> ابدأ الفحص الذكي';
    ocrStatus.textContent = 'تم تعديل النص يدويًا. يمكنك الآن فحصه.';
  }
});

function addText(parent, tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value;
  parent.appendChild(element);
  return element;
}

async function scanText(source = 'text') {
  if (ocrReviewRequired) {
    ocrStatus.textContent = 'راجع النص المستخرج وعدّله أولًا.';
    return;
  }

  const text = input.value.trim();

  if (!text) {
    result.classList.remove('hidden');
    result.textContent = 'من فضلك أدخل رسالة أو رابطًا للفحص.';
    return;
  }

  if (text.length > 5000) {
    result.classList.remove('hidden');
    result.textContent = 'الحد الأقصى للفحص هو 5000 حرف.';
    return;
  }

  button.disabled = true;
  button.textContent = 'جارٍ الفحص...';
  result.classList.remove('hidden');
  result.textContent = 'جارٍ تحليل المؤشرات...';

  try {
    const response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'فشل الفحص');
    }

    const score = Math.max(0, Math.min(100, Number(data.score) || 0));

    const level = score >= 50
      ? 'high'
      : score >= 25
        ? 'medium'
        : 'low';

    const levelText = {
      low: 'خطورة منخفضة',
      medium: 'خطورة متوسطة',
      high: 'خطورة مرتفعة'
    };

    const tips = {
      low: 'استمر في التحقق من مصدر الرسائل والروابط قبل التفاعل معها.',
      medium: 'تجنب الضغط على الروابط أو مشاركة بياناتك حتى تتأكد من المصدر.',
      high: 'لا تفتح الروابط ولا ترسل أموالًا أو رموز تحقق. تحقق من الجهة عبر قنواتها الرسمية.'
    };

    result.replaceChildren();
    result.className = `result risk-${level}`;

    const header = document.createElement('div');
    header.className = 'result-head';

    addText(header, 'strong', '', data.title || 'تقرير الفحص');
    addText(header, 'span', 'risk-score', `${score}/100`);
    result.appendChild(header);

    addText(result, 'div', 'risk-label', levelText[level]);

    const track = document.createElement('div');
    track.className = 'risk-track';

    const fill = document.createElement('div');
    fill.className = 'risk-fill';
    fill.style.width = `${score}%`;

    track.appendChild(fill);
    result.appendChild(track);

    addText(result, 'p', 'result-description', data.message || '');

    addText(result, 'strong', '', 'المؤشرات المكتشفة');

    const list = document.createElement('ul');

    [...new Set(Array.isArray(data.indicators) ? data.indicators : [])].forEach(item => {
      addText(list, 'li', '', item);
    });

    result.appendChild(list);

    addText(result, 'div', 'result-tip', `💡 نصيحة SHIELD AI: ${tips[level]}`);

    addText(result, 'small', 'result-notice', data.notice || '');

    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (error) {
    result.className = 'result';
    result.textContent = `تعذر إتمام الفحص: ${error.message}`;
  } finally {
    button.disabled = false;
    button.innerHTML = '<span>✦</span> ابدأ الفحص الذكي';
  }
}


// SHIELD VISION 2.1 - Multiple local image variants
async function prepareImageForOCR(file, mode = 'gray') {
  const imageURL = URL.createObjectURL(file);

  try {
    const img = new Image();

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageURL;
    });

    const scale = Math.min(2.5, Math.max(1, 1800 / img.width));
    const canvas = document.createElement('canvas');

    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = frame.data;

    for (let i = 0; i < pixels.length; i += 4) {
      const gray =
        0.299 * pixels[i] +
        0.587 * pixels[i + 1] +
        0.114 * pixels[i + 2];

      let value;

      if (mode === 'threshold') {
        value = gray > 165 ? 255 : 0;
      } else {
        value = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
      }

      pixels[i] = value;
      pixels[i + 1] = value;
      pixels[i + 2] = value;
    }

    ctx.putImageData(frame, 0, 0);

    return await new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('تعذر تجهيز الصورة'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(imageURL);
  }
}

// SHIELD VISION - Local OCR
const imageInput = document.getElementById('imageInput');
const imageButton = document.getElementById('imageButton');
const imagePreview = document.getElementById('imagePreview');
const ocrStatus = document.getElementById('ocrStatus');

imageButton.addEventListener('click', () => {
  imageInput.click();
});

imageInput.addEventListener('change', async () => {
  const file = imageInput.files[0];

  if (!file) return;

  if (!file.type.startsWith('image/')) {
    ocrStatus.textContent = 'الملف المحدد ليس صورة.';
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    ocrStatus.textContent = 'حجم الصورة أكبر من 8 ميجابايت.';
    imageInput.value = '';
    return;
  }

  const previewURL = URL.createObjectURL(file);
  imagePreview.replaceChildren();

  const img = document.createElement('img');
  img.src = previewURL;
  img.alt = 'الصورة المحددة للفحص';
  imagePreview.appendChild(img);
  imagePreview.classList.remove('hidden');

  if (!window.Tesseract) {
    ocrStatus.textContent = 'تعذر تحميل مكتبة قراءة الصور. تأكد من الإنترنت ثم حدّث الصفحة.';
    return;
  }

  imageButton.disabled = true;
  ocrStatus.textContent = 'جارٍ قراءة النص من الصورة...';

  try {
    const variants = ['gray', 'threshold'];
    const attempts = [];

    for (let i = 0; i < variants.length; i++) {
      ocrStatus.textContent =
        `جارٍ تحسين الصورة وقراءتها: المحاولة ${i + 1} من ${variants.length}`;

      const processedImage = await prepareImageForOCR(file, variants[i]);

      const resultOCR = await Tesseract.recognize(
        processedImage,
        'ara+eng',
        {
          logger: info => {
            if (info.status === 'recognizing text') {
              ocrStatus.textContent =
                `المحاولة ${i + 1}: استخراج النص ${Math.round(info.progress * 100)}%`;
            }
          }
        }
      );

      const text = resultOCR.data.text.trim();
      const words = text.match(/[a-zA-Z]{2,}|[\u0600-\u06FF]{2,}/g) || [];
      

      attempts.push({
        text,
        confidence: Number(resultOCR.data.confidence || 0),
        quality: words.length * 3 + Number(resultOCR.data.confidence || 0)
      });
    }

    attempts.sort((a, b) => b.quality - a.quality);

    const extracted = attempts[0].text;
    const bestConfidence = attempts[0].confidence;

    if (!extracted) {
      ocrStatus.textContent = 'لم نتمكن من قراءة نص واضح. جرب صورة أوضح.';
      return;
    }

    input.value = extracted.slice(0, 5000);
    counter.textContent = `${input.value.length} / 5000`;

    const compactText = extracted.replace(/\s/g, '');
    const readableChars = (extracted.match(/[a-zA-Z0-9\u0600-\u06FF]/g) || []).length;
    const readability = compactText.length
      ? readableChars / compactText.length
      : 0;

    const words = extracted.match(/[a-zA-Z]{2,}|[\u0600-\u06FF]{2,}/g) || [];

    if (
      extracted.length < 8 ||
      readableChars < 8 ||
      readability < 0.45 ||
      bestConfidence < 55 ||
      words.length < 6
    ) {
      ocrReviewRequired = true;
      button.disabled = true;
      button.textContent = 'عدّل النص المستخرج أولًا';

      result.replaceChildren();
      result.className = 'result hidden';

      ocrStatus.textContent =
        '⚠️ قراءة الصورة غير موثوقة. عدّل النص المستخرج يدويًا أولًا. لم يتم فحص الصورة ولم يتم اعتبارها آمنة.';
      return;
    }

    ocrStatus.textContent = 'تم استخراج النص. جارٍ بدء الفحص...';

    await scanText('image');

    ocrStatus.textContent = 'اكتملت قراءة الصورة وفحص النص المستخرج.';

  } catch (error) {
    ocrStatus.textContent = 'حدث خطأ أثناء قراءة الصورة: ' + error.message;
  } finally {
    imageButton.disabled = false;
    imageInput.value = '';
    URL.revokeObjectURL(previewURL);
  }
});

// SHIELD HISTORY
const historyList = document.getElementById('historyList');
const historySearch = document.getElementById('historySearch');
const historyFilters = document.querySelectorAll('.history-filter');

let historyData = [];
let currentHistoryFilter = 'all';

function historyLevel(score) {
  return score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';
}

function formatHistoryDate(date) {
  return new Date(date).toLocaleString('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

async function loadHistory() {
  historyList.textContent = 'جارٍ تحميل السجل...';

  try {
    const response = await fetch('/api/history');
    if (!response.ok) throw new Error('فشل تحميل السجل');

    const data = await response.json();
    historyData = Array.isArray(data.history) ? data.history : [];

    document.getElementById('totalScans').textContent = historyData.length;
    document.getElementById('highScans').textContent =
      historyData.filter(item => historyLevel(item.score) === 'high').length;
    document.getElementById('mediumScans').textContent =
      historyData.filter(item => historyLevel(item.score) === 'medium').length;
    document.getElementById('lowScans').textContent =
      historyData.filter(item => historyLevel(item.score) === 'low').length;

    renderHistory();
  } catch (error) {
    historyList.textContent = 'تعذر تحميل سجل الفحوصات: ' + error.message;
  }
}

function renderHistory() {
  const query = historySearch.value.trim().toLowerCase();

  const fromDate = document.getElementById('historyFrom').value;
  const toDate = document.getElementById('historyTo').value;

  const filtered = historyData.filter(item => {
    const matchesLevel =
      currentHistoryFilter === 'all' ||
      historyLevel(item.score) === currentHistoryFilter;

    const matchesSearch =
      String(item.text || '').toLowerCase().includes(query) ||
      String(item.title || '').toLowerCase().includes(query);

    const itemDate = String(item.date || '').slice(0, 10);
    const matchesFrom = !fromDate || itemDate >= fromDate;
    const matchesTo = !toDate || itemDate <= toDate;

    return matchesLevel && matchesSearch && matchesFrom && matchesTo;
  });

  historyList.replaceChildren();

  if (!filtered.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'لا توجد فحوصات مطابقة.';
    historyList.appendChild(empty);
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement('article');
    card.className = 'history-card';

    const top = document.createElement('div');
    top.className = 'history-card-top';

    const title = document.createElement('span');
    title.className = 'history-card-title';
    title.textContent = item.title || 'تقرير فحص';

    const score = document.createElement('span');
    score.className = 'history-card-score';
    score.textContent = `${item.score}/100`;

    top.append(title, score);
    card.appendChild(top);

    const date = document.createElement('small');
    date.className = 'history-card-date';
    date.textContent = formatHistoryDate(item.date);
    card.appendChild(date);

    const source = document.createElement('small');
    source.className = 'history-card-source';
    source.textContent = item.source === 'image' ? '📷 فحص صورة' : '✍️ فحص نص';
    card.appendChild(source);

    const text = document.createElement('p');
    text.className = 'history-card-text';
    text.textContent = String(item.text || '').slice(0, 180);
    card.appendChild(text);

    const actions = document.createElement('div');
    actions.className = 'history-card-actions';

    const detailsButton = document.createElement('button');
    detailsButton.type = 'button';
    detailsButton.textContent = 'عرض التفاصيل';

    detailsButton.addEventListener('click', () => {
      const oldDetail = card.querySelector('.history-detail');
      if (oldDetail) {
        oldDetail.remove();
        detailsButton.textContent = 'عرض التفاصيل';
        return;
      }

      const detail = document.createElement('div');
      detail.className = 'history-detail';

      const fullText = document.createElement('p');
      fullText.textContent = `النص الكامل: ${item.text || ''}`;

      const source = document.createElement('p');
      source.textContent =
        `المصدر: ${item.source === 'image' ? 'صورة' : 'كتابة يدوية'}`;

      const message = document.createElement('p');
      message.textContent = item.message || '';

      const indicatorsTitle = document.createElement('strong');
      indicatorsTitle.textContent = 'المؤشرات المكتشفة:';

      const indicators = document.createElement('ul');
      [...new Set(Array.isArray(item.indicators) ? item.indicators : [])].forEach(value => {
        const li = document.createElement('li');
        li.textContent = value;
        indicators.appendChild(li);
      });

      detail.append(fullText, source, message, indicatorsTitle, indicators);
      card.appendChild(detail);
      detailsButton.textContent = 'إخفاء التفاصيل';
    });

    actions.appendChild(detailsButton);
    card.appendChild(actions);
    historyList.appendChild(card);
  });
}


document.getElementById('historyFrom').addEventListener('change', renderHistory);
document.getElementById('historyTo').addEventListener('change', renderHistory);

document.getElementById('resetHistoryDates').addEventListener('click', () => {
  document.getElementById('historyFrom').value = '';
  document.getElementById('historyTo').value = '';
  renderHistory();
});

historySearch.addEventListener('input', renderHistory);

historyFilters.forEach(filter => {
  filter.addEventListener('click', () => {
    currentHistoryFilter = filter.dataset.filter;

    historyFilters.forEach(button => button.classList.remove('active'));
    filter.classList.add('active');

    renderHistory();
  });
});

document.getElementById('refreshHistory').addEventListener('click', loadHistory);

document.getElementById('clearHistory').addEventListener('click', async () => {
  if (!historyData.length) {
    alert('السجل فارغ بالفعل.');
    return;
  }

  if (!confirm('هل أنت متأكد من مسح جميع سجلات الفحص؟ لا يمكن التراجع عن هذا الإجراء.')) {
    return;
  }

  try {
    const response = await fetch('/api/history', { method: 'DELETE' });
    if (!response.ok) throw new Error('تعذر مسح السجل');

    await loadHistory();
    alert('تم مسح سجل الفحوصات.');
  } catch (error) {
    alert(error.message);
  }
});

loadHistory();
