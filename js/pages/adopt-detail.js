// 认养详情：介绍、名额进度、理由填写与真实认养
import { api } from '../api/index.js';
import { ADOPTION_DAYS, MONTH_REPORT_REQUIRED } from '../config.js';
import { invalidate } from '../core/store.js';
import { $, badge, emptyState, escapeHtml, icon, safeImageSrc, setBusy, toast } from '../core/dom.js';
import { navigate } from '../core/router.js';

const state = { region: null };
let initialized = false;

function render() {
  const host = $('#adopt-detail-body');
  const region = state.region;
  if (!host || !region) return;

  const capacity = Math.max(1, Number(region.capacity) || 1);
  const count = Number(region.adopt_count) || 0;
  const percent = Math.min(100, Math.round((count / capacity) * 100));
  const canAdopt = region.status === 'open' && !region.is_full && !region.adopted_by_me;

  const footer = canAdopt
    ? `<div class="card" style="margin-top:14px">
         <h2 class="section-title">认养理由</h2>
         <textarea class="field" id="adopt-reason" rows="3" maxlength="200"
           placeholder="说说你想认养这段绿道的原因（至少 5 个字）" style="margin-top:10px"></textarea>
         <button class="btn btn-primary" type="button" data-action="adopt-submit" style="width:100%;margin-top:12px">
           ${icon('heart', 'icon icon-sm')}确认认养（+20 积分）
         </button>
       </div>`
    : region.adopted_by_me
      ? ''
      : `<button class="btn btn-ghost" type="button" disabled style="width:100%;margin-top:14px">
           ${region.is_full ? '认养名额已满' : '该区域暂不可认养'}
         </button>`;

  host.innerHTML = `
    <div class="hero-card" style="border-radius:18px">
      <img src="${safeImageSrc(region.cover_image)}" alt="${escapeHtml(region.name || '')}" style="height:200px">
      <div class="hero-overlay">
        <h2>${escapeHtml(region.name || '')}</h2>
        <p>${escapeHtml(region.section || '')} · ${Number(region.length_km || 0).toFixed(1)} km</p>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="flex items-center justify-between">
        <h2 class="section-title">绿道介绍</h2>
        ${badge(region.status, region.status_label)}
      </div>
      <p style="margin:10px 0 0;font-size:13px;line-height:1.8;color:#374151">${escapeHtml(region.description || '')}</p>
      <div class="meta-row" style="margin-top:12px">
        <span>${icon('map', 'icon')}${escapeHtml(region.section || '')}</span>
        <span>${icon('leaf', 'icon')}${Number(region.length_km || 0).toFixed(1)} km</span>
        <span>${icon('user', 'icon')}${count}/${capacity} 人认养</span>
      </div>
      <div class="progress-track" style="margin-top:12px">
        <div class="progress-fill" style="width:${percent}%"></div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h2 class="section-title">认养说明</h2>
      <ul class="rule-list">
        <li>认养有效期 ${ADOPTION_DAYS} 天，到期后可再次认养；</li>
        <li>每月至少上报 ${MONTH_REPORT_REQUIRED} 次绿道维护情况；</li>
        <li>认养成功可获得 20 环保积分，上报问题还能继续得分。</li>
      </ul>
    </div>

    ${region.adopted_by_me
      ? `<div class="card" style="margin-top:14px">
           <p style="margin:0;font-size:13px;color:#047857">您已认养该区域，可在「我的认养」查看维护进度。</p>
           <button class="btn btn-ghost" type="button" data-nav="my-adoptions" style="width:100%;margin-top:12px">查看我的认养</button>
         </div>`
      : ''}

    ${footer}
  `;
}

async function submit(button) {
  const region = state.region;
  if (!region) return;
  if (button?.disabled) return;

  const reasonEl = $('#adopt-reason');
  const reason = (reasonEl?.value || '').trim();
  if (reason.length < 5) {
    toast('请填写至少 5 个字的认养理由', { type: 'error' });
    reasonEl?.focus();
    return;
  }

  setBusy(button, true, '提交中…');
  try {
    await api.adoptions.create({ region_id: region.id, reason });
    invalidate('me', 'home', 'regions');
    toast('认养成功，获得 20 积分');
    navigate('my-adoptions');
  } catch (err) {
    toast(err.message || '认养失败，请稍后重试', { type: 'error' });
  } finally {
    setBusy(button, false);
  }
}

function init() {
  if (initialized) return;
  initialized = true;
  $('#adopt-detail-body')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="adopt-submit"]');
    if (button) submit(button);
  });
}

async function enter(params) {
  state.region = null;
  const host = $('#adopt-detail-body');
  const regionId = Number(params?.regionId);
  if (!regionId) {
    if (host) host.innerHTML = emptyState('map', '未找到该绿道区域');
    navigate('adopt', {}, { replace: true });
    return;
  }
  if (host) host.innerHTML = '<div class="skeleton" style="height:220px"></div>';

  try {
    const data = await api.regions.get(regionId);
    state.region = data.region;
    render();
  } catch (err) {
    console.error('[adopt-detail]', err);
    if (host) {
      host.innerHTML = emptyState(
        'map',
        err.message || '加载失败，请稍后重试',
        '<button class="btn btn-ghost btn-sm" type="button" data-nav="adopt" style="margin-top:12px">返回列表</button>',
      );
    }
    toast(err.message || '加载失败', { type: 'error' });
  }
}

export default { id: 'adopt-detail', init, enter };
