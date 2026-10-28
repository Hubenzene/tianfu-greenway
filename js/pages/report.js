// 问题上报：拍照/相册、类型选择、位置、描述，multipart 真实提交
import { api } from '../api/index.js';
import { MAX_IMAGES, MAX_IMAGE_MB } from '../config.js';
import { invalidate, loadRegions } from '../core/store.js';
import { $, escapeHtml, icon, setBusy, toast } from '../core/dom.js';
import { compressImage } from '../core/image.js';
import { navigate } from '../core/router.js';

const ISSUE_TYPES = [
  ['infra', '基础设施老化'],
  ['vegetation', '植被退化'],
  ['facility', '配套设施功能丧失'],
  ['management', '管理问题'],
  ['conflict', '占道冲突'],
  ['other', '其他问题'],
];

const BUG_TYPES = [
  ['app_bug', '功能异常'],
  ['other', '界面 / 其他问题'],
];

const PLACEHOLDERS = {
  issue: '请描述发现的问题，例如：护栏松动、照明损坏、垃圾堆积……',
  bug: '请描述遇到的问题，例如：点击上报按钮无响应、页面显示异常……',
};

const state = {
  kind: 'issue',
  type: 'infra',
  images: [],
  coords: null,
  adoptionId: null,
  submitting: false,
};

let initialized = false;

function currentTypes() {
  return state.kind === 'bug' ? BUG_TYPES : ISSUE_TYPES;
}

function renderTypes() {
  const host = $('#report-types');
  if (!host) return;
  host.innerHTML = currentTypes()
    .map(
      ([value, label]) => `
      <button type="button" class="type-option${value === state.type ? ' selected' : ''}" data-type="${value}">
        <span class="dot"></span><span>${escapeHtml(label)}</span>
      </button>`,
    )
    .join('');
}

function renderPreviews() {
  const grid = $('#report-previews');
  if (!grid) return;
  grid.innerHTML = state.images
    .map(
      (item, index) => `
      <div class="preview-item">
        <img src="${item.url}" alt="上传预览 ${index + 1}">
        <button type="button" class="preview-remove" data-remove-index="${index}" aria-label="移除图片">
          ${icon('close')}
        </button>
      </div>`,
    )
    .join('');
}

function removeImage(index) {
  const [removed] = state.images.splice(index, 1);
  if (removed) URL.revokeObjectURL(removed.url);
  renderPreviews();
}

async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  for (const file of files) {
    if (state.images.length >= MAX_IMAGES) {
      toast(`最多上传 ${MAX_IMAGES} 张图片`, { type: 'error' });
      break;
    }
    if (!file.type.startsWith('image/')) {
      toast('请选择图片文件', { type: 'error' });
      continue;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      toast(`单张图片不能超过 ${MAX_IMAGE_MB}MB`, { type: 'error' });
      continue;
    }
    try {
      const compressed = await compressImage(file);
      state.images.push({ file: compressed, url: URL.createObjectURL(compressed) });
    } catch (err) {
      toast(err.message || '图片处理失败', { type: 'error' });
    }
  }
  renderPreviews();
}

function setKind(kind) {
  if (state.kind === kind) return;
  state.kind = kind;
  state.type = kind === 'bug' ? BUG_TYPES[0][0] : ISSUE_TYPES[0][0];
  document.querySelectorAll('#page-report [data-role="report-kind"] [data-kind]').forEach((button) => {
    button.classList.toggle('active', button.dataset.kind === kind);
  });
  const desc = $('#report-desc');
  if (desc) desc.placeholder = PLACEHOLDERS[kind] || PLACEHOLDERS.issue;
  renderTypes();
}

function updateLocationAvailability() {
  const button = $('#gps-btn');
  const hint = $('#location-hint');
  const canLocate = Boolean(window.isSecureContext && navigator.geolocation);
  if (button) button.classList.toggle('hidden', !canLocate);
  if (hint && !state.coords) {
    hint.style.color = '';
    hint.textContent = canLocate
      ? '可获取当前位置，也可以手动补充具体位置。'
      : '当前环境无法获取定位，请手动描述位置。';
  }
}

function locate() {
  if (!window.isSecureContext || !navigator.geolocation) {
    toast('当前环境无法定位，请手动填写位置', { type: 'error' });
    return;
  }
  const button = $('#gps-btn');
  setBusy(button, true, '定位中…');
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      const hint = $('#location-hint');
      if (hint) {
        hint.style.color = '#047857';
        hint.textContent = `已获取定位（精度约 ${Math.round(position.coords.accuracy)} 米），可补充具体位置。`;
      }
      setBusy(button, false);
      toast('定位成功');
    },
    () => {
      setBusy(button, false);
      toast('定位失败，请手动填写位置', { type: 'error' });
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}

function resetForm() {
  for (const image of state.images) URL.revokeObjectURL(image.url);
  state.images = [];
  state.coords = null;
  state.adoptionId = null;
  state.kind = 'issue';
  state.type = ISSUE_TYPES[0][0];

  const desc = $('#report-desc');
  if (desc) {
    desc.value = '';
    desc.placeholder = PLACEHOLDERS.issue;
  }
  const counter = $('#desc-count');
  if (counter) counter.textContent = '0';
  const location = $('#report-location');
  if (location) location.value = '';
  const region = $('#report-region');
  if (region) region.value = '';

  document.querySelectorAll('#page-report [data-role="report-kind"] [data-kind]').forEach((button) => {
    button.classList.toggle('active', button.dataset.kind === 'issue');
  });
  updateLocationAvailability();
  renderTypes();
  renderPreviews();
}

async function submit() {
  if (state.submitting) return;
  const button = $('#report-submit');
  const description = ($('#report-desc')?.value || '').trim();
  if (!state.type) {
    toast('请选择问题类型', { type: 'error' });
    return;
  }
  if (description.length < 5) {
    toast('请至少填写 5 个字的描述', { type: 'error' });
    $('#report-desc')?.focus();
    return;
  }

  const form = new FormData();
  form.append('kind', state.kind);
  form.append('type', state.type);
  form.append('description', description);

  const regionId = $('#report-region')?.value;
  if (regionId) form.append('region_id', regionId);
  if (state.adoptionId) form.append('adoption_id', String(state.adoptionId));

  const locationText = ($('#report-location')?.value || '').trim();
  if (locationText) form.append('location_text', locationText);

  if (state.coords) {
    form.append('latitude', String(state.coords.latitude));
    form.append('longitude', String(state.coords.longitude));
    form.append('location_source', 'gps');
  } else {
    form.append('location_source', 'manual');
  }

  state.images.forEach((image, index) => {
    form.append('images', image.file, image.file.name || `photo-${index + 1}.jpg`);
  });

  state.submitting = true;
  setBusy(button, true, '提交中…');
  try {
    const result = await api.reports.create(form);
    toast(`上报成功，获得 ${result.points_awarded ?? 10} 积分`);
    invalidate('me', 'home', 'regions');
    resetForm();
    navigate('my-reports');
  } catch (err) {
    toast(err.message || '提交失败，请稍后重试', { type: 'error' });
  } finally {
    state.submitting = false;
    setBusy(button, false);
  }
}

async function enter(params) {
  state.adoptionId = Number(params?.query?.adoption_id) || null;
  updateLocationAvailability();

  try {
    const data = await loadRegions();
    const items = data.items || [];
    const select = $('#report-region');
    if (!select) return;
    const preferred = String(params?.query?.region_id || select.value || '');
    select.innerHTML =
      '<option value="">请选择段落（可选）</option>' +
      items
        .map((item) => `<option value="${Number(item.id)}">${escapeHtml(item.name)}</option>`)
        .join('');
    if (preferred && Array.from(select.options).some((option) => option.value === preferred)) {
      select.value = preferred;
    }
  } catch (err) {
    console.error('[report] regions', err);
    toast('绿道段落加载失败，可稍后重试', { type: 'error' });
  }
}

function init() {
  if (initialized) return;
  initialized = true;

  document.querySelector('#page-report [data-role="report-kind"]')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-kind]');
    if (button) setKind(button.dataset.kind);
  });

  $('#report-types')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-type]');
    if (!button) return;
    state.type = button.dataset.type;
    renderTypes();
  });

  $('#report-previews')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-index]');
    if (button) removeImage(Number(button.dataset.removeIndex));
  });

  document.querySelector('#page-report [data-action="pick-camera"]')?.addEventListener('click', () => {
    $('#input-camera')?.click();
  });
  document.querySelector('#page-report [data-action="pick-gallery"]')?.addEventListener('click', () => {
    $('#input-gallery')?.click();
  });

  $('#input-camera')?.addEventListener('change', (event) => {
    handleFiles(event.target.files);
    event.target.value = '';
  });
  $('#input-gallery')?.addEventListener('change', (event) => {
    handleFiles(event.target.files);
    event.target.value = '';
  });

  $('#report-desc')?.addEventListener('input', (event) => {
    const counter = $('#desc-count');
    if (counter) counter.textContent = String(event.target.value.length);
  });

  $('#report-submit')?.addEventListener('click', submit);
  $('#gps-btn')?.addEventListener('click', locate);

  renderTypes();
  renderPreviews();
}

export default { id: 'report', init, enter };
