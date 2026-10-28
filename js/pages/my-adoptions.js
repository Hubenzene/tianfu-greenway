// 我的认养：有效认养、剩余天数、本月维护进度与快捷上报
import { api } from '../api/index.js';
import { $, badge, emptyState, escapeHtml, icon, safeImageSrc, toast } from '../core/dom.js';
import { navigate } from '../core/router.js';

const STATUS_LABELS = { active: '有效', expired: '已过期', cancelled: '已取消' };
let initialized = false;

function adoptionCard(adoption) {
  const region = adoption.region || {};
  const required = Math.max(1, Number(adoption.month_reports_required) || 3);
  const done = Math.max(0, Number(adoption.month_reports) || 0);
  const percent = Math.min(100, Math.round((done / required) * 100));
  const active = adoption.status === 'active';
  const remaining = active ? `剩余 ${Number(adoption.days_left) || 0} 天` : '已结束';

  return `
    <div class="card">
      <div class="flex items-center" style="gap:12px">
        <img src="${safeImageSrc(region.cover_image)}" alt="${escapeHtml(region.name || '')}"
          style="width:64px;height:64px;border-radius:12px;object-fit:cover;flex:0 0 auto">
        <div style="flex:1;min-width:0">
          <div class="flex items-center justify-between" style="gap:8px">
            <p style="margin:0;font-size:14px;font-weight:700;color:#064e3b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${escapeHtml(region.name || '')}
            </p>
            ${badge(adoption.status, STATUS_LABELS[adoption.status] || adoption.status)}
          </div>
          <p class="text-muted" style="margin:4px 0 0;font-size:11px">
            ${escapeHtml(region.section || '')} · ${Number(region.length_km || 0).toFixed(1)} km · ${remaining}
          </p>
        </div>
      </div>
      <p style="margin:10px 0 0;font-size:12px;color:#4b5563;line-height:1.7">
        认养理由：${escapeHtml(adoption.reason || '')}
      </p>
      <div style="margin-top:10px">
        <div class="flex items-center justify-between" style="font-size:11px;color:#6b7280">
          <span>本月维护上报</span><span>${done}/${required}</span>
        </div>
        <div class="progress-track" style="margin-top:4px">
          <div class="progress-fill" style="width:${percent}%"></div>
        </div>
      </div>
      <div class="flex" style="gap:8px;margin-top:12px">
        <button class="btn btn-ghost btn-sm" type="button" data-view-region="${Number(adoption.region_id)}" style="flex:1">
          查看段落
        </button>
        ${active
          ? `<button class="btn btn-primary btn-sm" type="button" data-report-region="${Number(adoption.region_id)}"
               data-adoption-id="${Number(adoption.id)}" style="flex:1">${icon('camera', 'icon icon-sm')}上报维护</button>`
          : ''}
      </div>
    </div>`;
}

function render(items) {
  const active = items.filter((item) => item.status === 'active');
  const pending = active.filter(
    (item) => (Number(item.month_reports) || 0) < (Number(item.month_reports_required) || 3),
  ).length;
  const totalEl = $('#ma-total');
  if (totalEl) totalEl.textContent = String(active.length);
  const pendingEl = $('#ma-pending');
  if (pendingEl) pendingEl.textContent = String(pending);

  const host = $('#my-adoptions-list');
  if (!host) return;
  host.innerHTML = items.length
    ? items.map(adoptionCard).join('')
    : emptyState(
        'leaf',
        '还没有认养任何绿道',
        '<button class="btn btn-primary btn-sm" type="button" data-nav="adopt" style="margin-top:12px">去认养</button>',
      );
}

function init() {
  if (initialized) return;
  initialized = true;
  $('#my-adoptions-list')?.addEventListener('click', (event) => {
    const reportButton = event.target.closest('[data-report-region]');
    if (reportButton) {
      navigate('report', {
        query: {
          region_id: reportButton.dataset.reportRegion,
          adoption_id: reportButton.dataset.adoptionId,
        },
      });
      return;
    }
    const viewButton = event.target.closest('[data-view-region]');
    if (viewButton) navigate('adopt-detail', { regionId: Number(viewButton.dataset.viewRegion) });
  });
}

async function enter() {
  const host = $('#my-adoptions-list');
  if (host && !host.children.length) {
    host.innerHTML = '<div class="skeleton" style="height:140px"></div>';
  }
  try {
    const data = await api.adoptions.mine();
    render(Array.isArray(data.items) ? data.items : []);
  } catch (err) {
    console.error('[my-adoptions]', err);
    if (host) host.innerHTML = emptyState('leaf', '加载失败，请稍后重试');
    toast(err.message || '加载失败', { type: 'error' });
  }
}

export default { id: 'my-adoptions', init, enter };
