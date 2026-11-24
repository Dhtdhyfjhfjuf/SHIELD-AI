const input = document.getElementById('scanInput');
const counter = document.getElementById('charCount');
const result = document.getElementById('result');
const button = document.getElementById('scanButton');

input.addEventListener('input', () => {
  counter.textContent = `${input.value.length} / 5000`;
});

function addText(parent, tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value;
  parent.appendChild(element);
  return element;
}

async function scanText(source = 'text') {
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

    (Array.isArray(data.indicators) ? data.indicators : []).forEach(item => {
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
    const resultOCR = await Tesseract.recognize(
      file,
      'ara+eng',
      {
        logger: info => {
          if (info.status === 'recognizing text') {
            ocrStatus.textContent =
              `جارٍ استخراج النص: ${Math.round(info.progress * 100)}%`;
          }
        }
      }
    );

    const extracted = resultOCR.data.text.trim();

    if (!extracted) {
      ocrStatus.textContent = 'لم نتمكن من قراءة نص واضح. جرب صورة أوضح.';
      return;
    }

    input.value = extracted.slice(0, 5000);
    counter.textContent = `${input.value.length} / 5000`;

    ocrStatus.textContent = 'تم استخراج النص بنجاح. جارٍ بدء الفحص...';

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
      (Array.isArray(item.indicators) ? item.indicators : []).forEach(value => {
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
