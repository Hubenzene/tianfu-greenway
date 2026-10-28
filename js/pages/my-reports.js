// 我的记录：状态统计、分类筛选、详情弹层（含管理员回复与图片）
import { api } from '../api/index.js';
import { registerAction } from '../core/actions.js';
import {
  $,
  badge,
  emptyState,
  escapeHtml,
  fmtDateTime,
  icon,
  openModal,
  safeImageSrc,
  toast,
} from '../core/dom.js';

const state = { kind: '', reports: [], total: 0 };
let initialized = false;

function setStat(selector, value) {
  const el = $(selector);
  if (el) el.textContent = String(value ?? 0);
}

function renderStats() {
  const counts = { pending: 0, processing: 0, resolved: 0 };
  for (const report of state.reports) {
    if (counts[report.status] !== undefined) counts[report.status] += 1;
  }
  setStat('#mr-total', state.total || state.reports.length);
  setStat('#mr-pending', counts.pending);
  setStat('#mr-processing', counts.processing);
  setStat('#mr-resolved', counts.resolved);
}

function reportCard(report) {
  const imageCount = Array.isArray(report.images) ? report.images.length : 0;
  return `
    <button type="button" class="card report-card" data-report-id="${Number(report.id)}">
      <div class="flex items-center justify-between" style="gap:8px">
        <span class="chip">${escapeHtml(report.kind_label || '')}</span>
        ${badge(report.status, report.status_label)}
      </div>
      <p style="margin:9px 0 0;font-size:14px;font-weight:600">${escapeHtml(report.type_label || '')}</p>
      <p class="text-muted line-clamp-2" style="margin:5px 0 0;font-size:12px;line-height:1.6">${escapeHtml(report.description || '')}</p>
      <div class="meta-row" style="margin-top:9px">
        ${report.location_text ? `<span>${icon('location', 'icon')}${escapeHtml(report.location_text)}</span>` : ''}
        <span>${icon('clock', 'icon')}${escapeHtml(fmtDateTime(report.created_at))}</span>
        ${imageCount ? `<span>${icon('image', 'icon')}${imageCount} 张</span>` : ''}
      </div>
    </button>`;
}

function renderList() {
  const host = $('#my-reports-list');
  if (!host) return;
  const items = state.reports.filter((report) => !state.kind || report.kind === state.kind);
  host.innerHTML = items.length
    ? items.map(reportCard).join('')
    : emptyState(
        'file',
        state.kind ? '该分类暂无上报记录' : '还没有上报过问题',
        '<button class="btn btn-ghost btn-sm" type="button" data-nav="report" style="margin-top:12px">去上报</button>',
      );
}

function detailHtml(report) {
  const images = Array.isArray(report.images) ? report.images : [];
  const thumbs = images.length
    ? `<div class="thumb-grid">${images
        .map((image) => `<img class="detail-thumb" src="${safeImageSrc(image.path)}" alt="上报图片">`)
        .join('')}</div>`
    : '';

  return `
    <div class="flex items-center justify-between" style="gap:8px;margin-bottom:12px">
      <span class="chip">${escapeHtml(report.kind_label || '')}</span>
      ${badge(report.status, report.status_label)}
    </div>
    <p style="margin:0 0 12px;font-size:15px;font-weight:700">${escapeHtml(report.type_label || '')}</p>
    <p class="detail-text">${escapeHtml(report.description || '')}</p>
    ${thumbs}
    <div style="margin-top:12px">
      <div class="detail-row"><span>具体位置</span><span>${escapeHtml(report.location_text || '未填写')}</span></div>
      <div class="detail-row"><span>关联段落</span><span>${report.region_id ? `段落 #${Number(report.region_id)}` : '未关联'}</span></div>
      <div class="detail-row"><span>提交时间</span><span>${escapeHtml(fmtDateTime(report.created_at))}</span></div>
      <div class="detail-row"><span>解决奖励</span><span>${Number(report.points_awarded) ? `+${Number(report.points_awarded)} 积分` : '解决后发放'}</span></div>
    </div>
    ${report.admin_note
      ? `<div class="notice"><p class="notice-title">管理员回复</p><p class="notice-text">${escapeHtml(report.admin_note)}</p></div>`
      : ''}
  `;
}

async function openDetail(id) {
  let modal = null;
  modal = openModal({
    title: '上报详情',
    body: '<div class="skeleton" style="height:80px"></div>',
    actions: [{ label: '关闭', variant: 'ghost', onClick: () => modal?.close() }],
  });
  if (!modal) return;
  try {
    const data = await api.reports.get(id);
    modal.bodyEl.innerHTML = detailHtml(data.report);
  } catch (err) {
    console.error('[my-reports] detail', err);
    modal.bodyEl.innerHTML = emptyState('file', err.message || '详情加载失败');
    toast(err.message || '详情加载失败', { type: 'error' });
  }
}

async function load(showToast) {
  const host = $('#my-reports-list');
  if (host && !state.reports.length) {
    host.innerHTML = '<div class="skeleton" style="height:96px"></div>';
  }
  try {
    const data = await api.reports.list({ limit: 100 });
    state.reports = Array.isArray(data.items) ? data.items : [];
    state.total = Number(data.total) || state.reports.length;
    renderStats();
    renderList();
    if (showToast) toast('已刷新');
  } catch (err) {
    console.error('[my-reports]', err);
    if (host) host.innerHTML = emptyState('file', '加载失败，请稍后重试');
    toast(err.message || '加载失败', { type: 'error' });
  }
}

function init() {
  if (initialized) return;
  initialized = true;

  document.querySelector('#page-my-reports [data-role="my-reports-kind"]')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-kind]');
    if (!button) return;
    state.kind = button.dataset.kind || '';
    document.querySelectorAll('#page-my-reports [data-role="my-reports-kind"] [data-kind]').forEach((item) => {
      item.classList.toggle('active', item.dataset.kind === state.kind);
    });
    renderList();
  });

  $('#my-reports-list')?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-report-id]');
    if (card) openDetail(Number(card.dataset.reportId));
  });

  registerAction('refresh-reports', () => load(true));
}

async function enter() {
  await load(false);
}

export default { id: 'my-reports', init, enter };
