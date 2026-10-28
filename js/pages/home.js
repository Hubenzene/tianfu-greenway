// 首页：横幅、快捷入口、地图标记、绿色足迹、环保动态
import { loadHome, loadMe } from '../core/store.js';
import { $, escapeHtml, emptyState, icon, safeImageSrc, setUnreadDot, toast } from '../core/dom.js';
import { navigate } from '../core/router.js';

let initialized = false;

function setText(selector, value) {
  const el = $(selector);
  if (el) el.textContent = String(value ?? 0);
}

function renderHero(data) {
  const banner = Array.isArray(data.banners) && data.banners.length ? data.banners[0] : null;
  if (!banner) return;
  const image = $('#hero-img');
  if (image && banner.image) image.src = safeImageSrc(banner.image);
  const title = $('#hero-title');
  if (title && banner.title) title.textContent = banner.title;
  const subtitle = $('#hero-subtitle');
  if (subtitle && banner.subtitle) subtitle.textContent = banner.subtitle;
}

function renderMarkers(data) {
  const host = $('#home-markers');
  if (!host) return;
  const markers = Array.isArray(data.markers) ? data.markers : [];
  host.innerHTML = markers
    .map((marker) => {
      const x = Math.max(0, Math.min(100, Number(marker.x) || 0));
      const y = Math.max(0, Math.min(100, Number(marker.y) || 0));
      const classes = ['map-marker'];
      if (marker.adopted_by_me) classes.push('mine');
      else if (marker.is_full || marker.status !== 'open') classes.push('closed');
      return `<button type="button" class="${classes.join(' ')}" style="left:${x}%;top:${y}%" data-region-id="${Number(marker.region_id)}" aria-label="${escapeHtml(marker.name || '')}">${Number(marker.region_id)}</button>`;
    })
    .join('');
}

function renderBulletins(data) {
  const host = $('#home-bulletins');
  if (!host) return;
  const bulletins = Array.isArray(data.bulletins) ? data.bulletins : [];
  if (!bulletins.length) {
    host.innerHTML = emptyState('leaf', '暂无环保动态');
    return;
  }
  host.style.padding = '6px 16px';
  host.innerHTML = bulletins
    .map(
      (item, index) => `
      <div class="list-row" style="cursor:default;${index === 0 ? 'padding-top:10px' : ''}">
        <span class="list-icon">${icon('leaf', 'icon icon-sm')}</span>
        <div style="flex:1;min-width:0">
          <p style="margin:0;font-size:13px;font-weight:600;color:#111827">${escapeHtml(item.title || '')}</p>
          <p class="text-muted line-clamp-2" style="margin:3px 0 0;font-size:11px;line-height:1.6">${escapeHtml(item.summary || '')}</p>
        </div>
        <span class="text-muted" style="font-size:10px;white-space:nowrap">${escapeHtml(item.date || '')}</span>
      </div>`,
    )
    .join('');
}

function renderMe(me) {
  const user = me?.user || {};
  const stats = me?.stats || {};
  setText('#home-points', user.total_points ?? 0);
  setText('#home-adoptions', stats.adoptions_active ?? 0);
  setText('#home-reports', stats.reports_total ?? 0);
  setText('#home-resolved', stats.reports_resolved ?? 0);
  setUnreadDot(me?.unread_notifications ?? 0);
}

function init() {
  if (initialized) return;
  initialized = true;
  $('#home-markers')?.addEventListener('click', (event) => {
    const marker = event.target.closest('[data-region-id]');
    if (marker) navigate('adopt-detail', { regionId: Number(marker.dataset.regionId) });
  });
}

async function enter() {
  const [homeResult, meResult] = await Promise.allSettled([loadHome(), loadMe()]);

  if (homeResult.status === 'fulfilled') {
    renderHero(homeResult.value);
    renderMarkers(homeResult.value);
    renderBulletins(homeResult.value);
  } else {
    console.error('[home]', homeResult.reason);
    const markers = $('#home-markers');
    if (markers) markers.innerHTML = '';
    const bulletins = $('#home-bulletins');
    if (bulletins) bulletins.innerHTML = emptyState('leaf', '环保动态加载失败，请稍后重试');
    if (meResult.status === 'rejected') toast('数据加载失败，请刷新页面重试', { type: 'error' });
  }

  if (meResult.status === 'fulfilled') renderMe(meResult.value);
}

export default { id: 'home', init, enter };
