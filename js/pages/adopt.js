// 认养列表：搜索 + 分段筛选 + 认养进度
import { loadRegions } from '../core/store.js';
import { registerAction } from '../core/actions.js';
import { $, badge, debounce, emptyState, escapeHtml, icon, safeImageSrc, toast } from '../core/dom.js';
import { navigate } from '../core/router.js';

const state = { section: '', q: '' };
let regions = [];
let initialized = false;

function filteredRegions() {
  const keyword = state.q.trim().toLowerCase();
  return regions.filter((region) => {
    if (state.section && region.section !== state.section) return false;
    if (!keyword) return true;
    const text = `${region.name || ''}${region.section || ''}${region.description || ''}`.toLowerCase();
    return text.includes(keyword);
  });
}

function regionCard(region) {
  const capacity = Math.max(1, Number(region.capacity) || 1);
  const count = Number(region.adopt_count) || 0;
  const percent = Math.min(100, Math.round((count / capacity) * 100));
  return `
    <button type="button" class="region-card" data-region-id="${Number(region.id)}">
      <img src="${safeImageSrc(region.cover_image)}" alt="${escapeHtml(region.name || '')}">
      <div style="flex:1;min-width:0">
        <div class="flex items-center" style="gap:8px">
          <p class="region-name" style="flex:1;min-width:0">${escapeHtml(region.name || '')}</p>
          ${badge(region.status, region.status_label)}
        </div>
        <p class="region-desc">${escapeHtml(region.description || '')}</p>
        <div class="meta-row">
          <span>${icon('map', 'icon')}${escapeHtml(region.section || '')}</span>
          <span>${icon('leaf', 'icon')}${Number(region.length_km || 0).toFixed(1)} km</span>
          ${region.adopted_by_me ? '<span class="badge badge-mine">我的认养</span>' : ''}
        </div>
        <div style="margin-top:8px">
          <div class="flex items-center justify-between" style="font-size:11px;color:#6b7280">
            <span>认养进度</span><span>${count}/${capacity}</span>
          </div>
          <div class="progress-track" style="margin-top:4px">
            <div class="progress-fill" style="width:${percent}%"></div>
          </div>
        </div>
      </div>
      <span class="list-arrow" style="align-self:center">${icon('chevron', 'icon icon-sm')}</span>
    </button>`;
}

function render() {
  const host = $('#adopt-list');
  if (!host) return;
  const items = filteredRegions();
  host.innerHTML = items.length
    ? items.map(regionCard).join('')
    : emptyState('map', '没有符合条件的绿道', '<p class="text-muted" style="font-size:12px;margin-top:6px">试试切换段落或清空搜索</p>');
}

async function refresh(force, showToast) {
  const host = $('#adopt-list');
  if (force && host && !regions.length) {
    host.innerHTML = '<div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:120px;margin-top:12px"></div>';
  }
  try {
    const data = await loadRegions(force);
    regions = data.items || [];
    render();
    if (showToast) toast('已刷新');
  } catch (err) {
    console.error('[adopt]', err);
    if (host) host.innerHTML = emptyState('map', '加载失败，请稍后重试');
    toast(err.message || '加载失败', { type: 'error' });
  }
}

function init() {
  if (initialized) return;
  initialized = true;

  $('#adopt-list')?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-region-id]');
    if (card) navigate('adopt-detail', { regionId: Number(card.dataset.regionId) });
  });

  document.querySelector('#page-adopt [data-role="adopt-section"]')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-section]');
    if (!button) return;
    state.section = button.dataset.section || '';
    document.querySelectorAll('#page-adopt [data-role="adopt-section"] [data-section]').forEach((item) => {
      item.classList.toggle('active', item.dataset.section === state.section);
    });
    render();
  });

  const search = $('#adopt-search');
  search?.addEventListener(
    'input',
    debounce(() => {
      state.q = search.value || '';
      render();
    }, 200),
  );

  registerAction('refresh-adopt', () => refresh(true, true));
}

async function enter() {
  await refresh(true, false);
}

export default { id: 'adopt', init, enter };
