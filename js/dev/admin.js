// 开发者后台：登录鉴权、上报管理、建议反馈、认养概览（全部走 /api/v1/admin/*）
import { api } from '../api/index.js';
import { clearAdminKey, getAdminKey, setAdminKey } from '../session.js';
import { badge, escapeHtml, fmtDateTime, safeImageSrc, setBusy, toast } from '../core/dom.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const REPORT_STATUS_LABELS = {
  pending: '待处理',
  processing: '处理中',
  resolved: '已解决',
  rejected: '已驳回',
};

// 与后端 services/reports.py 的 ALLOWED_TRANSITIONS 保持一致
const REPORT_TRANSITIONS = {
  pending: ['pending', 'processing', 'rejected'],
  processing: ['processing', 'resolved', 'pending'],
  resolved: ['resolved', 'pending'],
  rejected: ['rejected', 'pending'],
};

const SUGGESTION_STATUSES = ['pending', 'reviewing', 'replied', 'closed'];

const REGION_STATUS_LABELS = {
  open: '可认养',
  closed: '已满',
  maintenance: '维护中',
};

const state = {
  tab: 'reports',
  reports: [],
  reportsTotal: 0,
  suggestions: [],
  stats: null,
  regions: [],
  chart: null,
};

/* ---------------- 弹层 ---------------- */
let modalEl = null;

function closeAdminModal() {
  if (!modalEl) return;
  modalEl.remove();
  modalEl = null;
  document.removeEventListener('keydown', escHandler);
}

let escHandler = (event) => {
  if (event.key === 'Escape') closeAdminModal();
};

function openAdminModal({ title = '详情', body = '', footer = [] } = {}) {
  closeAdminModal();
  const host = $('#admin-modal-host');
  if (!host) return null;

  const layer = document.createElement('div');
  layer.className = 'admin-modal-layer';
  layer.innerHTML = `
    <div class="admin-modal" role="dialog" aria-modal="true">
      <div class="admin-modal-head">
        <h3></h3>
        <button type="button" class="admin-close" aria-label="关闭">×</button>
      </div>
      <div class="admin-modal-body"></div>
      <div class="admin-modal-footer"></div>
    </div>`;

  layer.querySelector('h3').textContent = title;
  const bodyEl = layer.querySelector('.admin-modal-body');
  bodyEl.innerHTML = body;

  const footerEl = layer.querySelector('.admin-modal-footer');
  const close = () => closeAdminModal();
  layer.querySelector('.admin-close').addEventListener('click', close);
  layer.addEventListener('click', (event) => {
    if (event.target === layer) close();
  });
  document.addEventListener('keydown', escHandler);

  footer.forEach((action) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `admin-btn ${action.variant || ''}`.trim();
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      if (typeof action.onClick === 'function') action.onClick(btn, close);
      else close();
    });
    footerEl.appendChild(btn);
  });
  if (!footer.length) footerEl.remove();

  host.appendChild(layer);
  modalEl = layer;
  return { bodyEl, footerEl, close };
}

/* ---------------- 登录 ---------------- */
const loginLayer = $('#login-layer');
const loginError = $('#login-error');

function showLogin(message = '') {
  if (!loginLayer) return;
  loginLayer.classList.remove('hidden');
  if (loginError) {
    loginError.textContent = message;
    loginError.classList.toggle('hidden', !message);
  }
  $('#login-key')?.focus();
}

function hideLogin() {
  loginLayer?.classList.add('hidden');
}

function handleError(err) {
  console.error('[admin]', err);
  if (err && err.status === 401) {
    clearAdminKey();
    showLogin('管理密钥已失效，请重新输入');
    return;
  }
  toast((err && err.message) || '操作失败，请稍后重试', { type: 'error' });
}

async function onLoginSubmit(event) {
  event.preventDefault();
  const input = $('#login-key');
  const button = $('#login-submit');
  const key = (input?.value || '').trim();
  if (!key) {
    showLogin('请输入管理密钥');
    return;
  }
  setBusy(button, true, '验证中…');
  try {
    await api.admin.login(key);
    setAdminKey(key);
    if (input) input.value = '';
    hideLogin();
    await loadAll();
    toast('登录成功');
  } catch (err) {
    if (err && err.status === 401) showLogin('管理密钥无效，请重试');
    else showLogin((err && err.message) || '登录失败，请确认服务已启动');
  } finally {
    setBusy(button, false);
  }
}

/* ---------------- 统计 ---------------- */
function setText(selector, value) {
  const el = $(selector);
  if (el) el.textContent = String(value ?? 0);
}

async function loadStats() {
  const stats = await api.admin.stats();
  state.stats = stats;
  setText('#rs-total', stats.total);
  setText('#rs-pending', stats.pending);
  setText('#rs-processing', stats.processing);
  setText('#rs-resolved', stats.resolved);
  setText('#rs-today', stats.today);
  setText('#ov-total', stats.total);
  setText('#ov-pending', stats.pending);
  setText('#ov-adoptions', stats.adoptions_active);
  setText('#ov-suggestions', stats.suggestions_total);
  renderTypeSummary();
}

function renderTypeSummary() {
  const host = $('#type-summary');
  if (!host) return;
  const items = (state.stats && state.stats.by_type) || [];
  if (!items.length) {
    host.innerHTML = '<p class="muted">暂无上报数据</p>';
    return;
  }
  const max = Math.max(...items.map((item) => Number(item.count) || 0), 1);
  host.innerHTML = items
    .map((item) => {
      const pct = Math.max(4, Math.round(((Number(item.count) || 0) / max) * 100));
      return `
        <div class="type-row">
          <span>${escapeHtml(item.label)}</span>
          <span class="muted">${Number(item.count) || 0} 条</span>
          <div class="type-bar"><div style="width:${pct}%"></div></div>
        </div>`;
    })
    .join('');
}

/* ---------------- 上报管理 ---------------- */
async function loadReports() {
  const tbody = $('#reports-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="muted center">加载中…</td></tr>';
  const params = {
    status: $('#filter-status')?.value || '',
    kind: $('#filter-kind')?.value || '',
    q: ($('#filter-q')?.value || '').trim(),
    limit: 100,
  };
  const data = await api.admin.reports(params);
  state.reports = Array.isArray(data.items) ? data.items : [];
  state.reportsTotal = Number(data.total) || state.reports.length;
  renderReports();
}

function renderReports() {
  const tbody = $('#reports-tbody');
  if (!tbody) return;
  const countEl = $('#reports-count');
  if (countEl) countEl.textContent = `共 ${state.reportsTotal} 条`;

  if (!state.reports.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted center">没有符合条件的上报</td></tr>';
    return;
  }
  tbody.innerHTML = state.reports
    .map((report) => {
      const nickname = report.user_nickname || (report.user_id ? `${report.user_id.slice(0, 8)}…` : '匿名用户');
      return `
        <tr>
          <td class="mono">#${Number(report.id)}</td>
          <td class="nowrap">${escapeHtml(fmtDateTime(report.created_at))}</td>
          <td>${escapeHtml(nickname)}</td>
          <td>
            <span class="type-chip">${escapeHtml(report.kind_label || '')}</span>
            <div class="small muted">${escapeHtml(report.type_label || '')}</div>
          </td>
          <td><div class="cell-desc">${escapeHtml(report.description || '')}</div></td>
          <td>${badge(report.status, report.status_label)}</td>
          <td><button type="button" class="admin-btn ghost small" data-report-id="${Number(report.id)}">详情</button></td>
        </tr>`;
    })
    .join('');
}

function reportDetailBody(report) {
  const images = Array.isArray(report.images) ? report.images : [];
  const transitions = REPORT_TRANSITIONS[report.status] || [report.status];
  const options = transitions
    .map(
      (status) =>
        `<option value="${status}" ${status === report.status ? 'selected' : ''}>${escapeHtml(
          REPORT_STATUS_LABELS[status] || status,
        )}</option>`,
    )
    .join('');
  const nickname = report.user_nickname || (report.user_id ? `${report.user_id.slice(0, 8)}…` : '匿名用户');
  const info = [
    ['分类', escapeHtml(report.kind_label || '')],
    ['问题类型', escapeHtml(report.type_label || '')],
    ['提交用户', escapeHtml(nickname)],
    ['提交时间', escapeHtml(fmtDateTime(report.created_at))],
    ['具体位置', escapeHtml(report.location_text || '未填写')],
    ['关联段落', report.region_id ? `段落 #${Number(report.region_id)}` : '未关联'],
    ['解决奖励', Number(report.points_awarded) ? `+${Number(report.points_awarded)} 积分` : '未发放'],
    ['解决时间', report.resolved_at ? escapeHtml(fmtDateTime(report.resolved_at)) : '—'],
  ];

  return `
    <div class="detail-grid">
      ${info
        .map(
          ([label, value]) => `
            <div>
              <span class="detail-label" style="margin:0">${label}</span>
              <span>${value}</span>
            </div>`,
        )
        .join('')}
    </div>
    <div class="detail-block">
      <span class="detail-label">问题描述</span>
      <p class="detail-content">${escapeHtml(report.description || '')}</p>
    </div>
    ${
      images.length
        ? `<div class="detail-block">
             <span class="detail-label">现场照片</span>
             <div class="admin-thumbs">${images
               .map((image) => `<img src="${safeImageSrc(image.path)}" alt="上报图片">`)
               .join('')}</div>
           </div>`
        : ''
    }
    <div class="detail-block">
      <label class="detail-label" for="detail-status">处理状态</label>
      <select class="admin-input" id="detail-status" style="width:100%">${options}</select>
    </div>
    <div class="detail-block">
      <label class="detail-label" for="detail-note">管理员回复（保存后会通知用户）</label>
      <textarea class="admin-input" id="detail-note" rows="4" maxlength="1000" placeholder="填写处理说明或回复内容">${escapeHtml(
        report.admin_note || '',
      )}</textarea>
    </div>`;
}

async function openReport(id) {
  let report;
  try {
    const data = await api.admin.report(id);
    report = data.report;
    // 详情接口不含昵称，用列表数据补齐
    const summary = state.reports.find((item) => Number(item.id) === Number(id));
    if (summary) report = { ...report, user_nickname: summary.user_nickname };
  } catch (err) {
    handleError(err);
    return;
  }

  const modal = openAdminModal({
    title: `上报详情 #${report.id}`,
    body: reportDetailBody(report),
    footer: [
      { label: '关闭', variant: 'ghost' },
      {
        label: '保存修改',
        onClick: async (button) => {
          const statusEl = $('#detail-status', modal.bodyEl);
          const noteEl = $('#detail-note', modal.bodyEl);
          const nextStatus = statusEl ? statusEl.value : report.status;
          const note = noteEl ? noteEl.value.trim() : report.admin_note || '';

          const payload = {};
          if (nextStatus !== report.status) payload.status = nextStatus;
          if (note !== (report.admin_note || '')) payload.admin_note = note;
          if (!Object.keys(payload).length) {
            toast('没有需要保存的修改');
            return;
          }

          setBusy(button, true, '保存中…');
          try {
            await api.admin.updateReport(report.id, payload);
            toast('上报已更新');
            modal.close();
            await loadStats();
            await loadReports();
            if (state.tab === 'overview') {
              await loadRegions();
              renderChart();
            }
          } catch (err) {
            setBusy(button, false);
            handleError(err);
          }
        },
      },
    ],
  });
}

/* ---------------- 建议反馈 ---------------- */
async function loadSuggestions() {
  const host = $('#suggestions-list');
  if (host) host.innerHTML = '<div class="admin-card muted center">加载中…</div>';
  const data = await api.admin.suggestions({
    status: $('#suggestion-status')?.value || '',
    q: ($('#suggestion-q')?.value || '').trim(),
  });
  state.suggestions = Array.isArray(data.items) ? data.items : [];
  renderSuggestions();
}

function renderSuggestions() {
  const host = $('#suggestions-list');
  if (!host) return;
  const countEl = $('#suggestions-count');
  if (countEl) countEl.textContent = `共 ${state.suggestions.length} 条`;

  if (!state.suggestions.length) {
    host.innerHTML = '<div class="admin-card muted center">没有符合条件的建议</div>';
    return;
  }

  host.innerHTML = state.suggestions
    .map((item) => {
      const nickname = item.user_nickname || (item.user_id ? `${item.user_id.slice(0, 8)}…` : '匿名用户');
      return `
        <article class="admin-card">
          <div class="suggestion-head">
            <div>
              <div class="suggestion-meta">
                ${badge(item.status, item.status_label)}
                <span class="muted small">${escapeHtml(nickname)} · ${escapeHtml(fmtDateTime(item.created_at))}</span>
                ${item.contact ? `<span class="muted small">联系方式：${escapeHtml(item.contact)}</span>` : ''}
              </div>
              <p class="suggestion-content">${escapeHtml(item.content || '')}</p>
              ${
                item.admin_reply
                  ? `<div class="admin-reply"><span class="reply-label">管理员回复</span><p>${escapeHtml(
                      item.admin_reply,
                    )}</p></div>`
                  : ''
              }
            </div>
            <button type="button" class="admin-btn ghost small" data-suggestion-id="${Number(item.id)}">${
              item.admin_reply ? '修改回复' : '处理'
            }</button>
          </div>
        </article>`;
    })
    .join('');
}

function openSuggestion(item) {
  const statusOptions = SUGGESTION_STATUSES.map((status) => {
    const labels = { pending: '待处理', reviewing: '审核中', replied: '已回复', closed: '已关闭' };
    return `<option value="${status}" ${status === item.status ? 'selected' : ''}>${labels[status]}</option>`;
  }).join('');
  const nickname = item.user_nickname || (item.user_id ? `${item.user_id.slice(0, 8)}…` : '匿名用户');

  const modal = openAdminModal({
    title: `建议详情 #${item.id}`,
    body: `
      <div class="detail-grid">
        <div><span class="detail-label" style="margin:0">提交用户</span><span>${escapeHtml(nickname)}</span></div>
        <div><span class="detail-label" style="margin:0">提交时间</span><span>${escapeHtml(
          fmtDateTime(item.created_at),
        )}</span></div>
        <div><span class="detail-label" style="margin:0">联系方式</span><span>${escapeHtml(
          item.contact || '未填写',
        )}</span></div>
        <div><span class="detail-label" style="margin:0">当前状态</span><span>${badge(
          item.status,
          item.status_label,
        )}</span></div>
      </div>
      <div class="detail-block">
        <span class="detail-label">建议内容</span>
        <p class="detail-content">${escapeHtml(item.content || '')}</p>
      </div>
      <div class="detail-block">
        <label class="detail-label" for="sug-status">处理状态</label>
        <select class="admin-input" id="sug-status" style="width:100%">${statusOptions}</select>
      </div>
      <div class="detail-block">
        <label class="detail-label" for="sug-reply">回复内容（保存后推送到用户消息中心）</label>
        <textarea class="admin-input" id="sug-reply" rows="4" maxlength="1000" placeholder="填写回复内容">${escapeHtml(
          item.admin_reply || '',
        )}</textarea>
      </div>`,
    footer: [
      { label: '关闭', variant: 'ghost' },
      {
        label: '保存回复',
        onClick: async (button) => {
          const statusEl = $('#sug-status', modal.bodyEl);
          const replyEl = $('#sug-reply', modal.bodyEl);
          const reply = replyEl ? replyEl.value.trim() : '';
          let nextStatus = statusEl ? statusEl.value : item.status;

          const payload = {};
          if (reply && reply !== (item.admin_reply || '')) {
            payload.admin_reply = reply;
            if (nextStatus === item.status && nextStatus !== 'replied') nextStatus = 'replied';
          }
          if (nextStatus !== item.status) payload.status = nextStatus;
          if (!Object.keys(payload).length) {
            toast('没有需要保存的修改');
            return;
          }

          setBusy(button, true, '保存中…');
          try {
            await api.admin.updateSuggestion(item.id, payload);
            toast('建议已更新');
            modal.close();
            await loadSuggestions();
            await loadStats();
          } catch (err) {
            setBusy(button, false);
            handleError(err);
          }
        },
      },
    ],
  });
}

/* ---------------- 认养概览 ---------------- */
async function loadRegions() {
  const data = await api.admin.regions();
  state.regions = Array.isArray(data.items) ? data.items : [];
  renderRegions();
}

function renderRegions() {
  const tbody = $('#regions-tbody');
  if (!tbody) return;
  if (!state.regions.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted center">暂无段落数据</td></tr>';
    return;
  }
  tbody.innerHTML = state.regions
    .map((region) => {
      const capacity = Number(region.capacity) || 0;
      const adoptCount = Number(region.adopt_count) || 0;
      const pct = capacity ? Math.min(100, Math.round((adoptCount / capacity) * 100)) : 0;
      return `
        <tr>
          <td>${escapeHtml(region.name || '')}<div class="small muted mono">${escapeHtml(region.code || '')}</div></td>
          <td>${escapeHtml(region.section || '')}</td>
          <td class="nowrap">${Number(region.length_km || 0).toFixed(1)} km</td>
          <td>${adoptCount} / ${capacity}</td>
          <td>
            <div class="mini-progress"><div style="width:${pct}%"></div></div>
            <div class="small muted">${pct}%</div>
          </td>
          <td>${badge(region.status, REGION_STATUS_LABELS[region.status] || region.status)}</td>
        </tr>`;
    })
    .join('');
}

function renderChart() {
  const canvas = $('#chart-days');
  const wrap = canvas ? canvas.parentElement : null;
  if (!wrap || !state.stats) return;

  if (!window.Chart) {
    wrap.innerHTML = '<p class="muted">图表库未加载，可在左侧查看类型分布</p>';
    return;
  }

  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }

  const days = state.stats.by_day || [];
  const labels = days.map((day) => String(day.date || '').slice(5));
  const values = days.map((day) => Number(day.count) || 0);

  state.chart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '上报数量',
          data: values,
          backgroundColor: 'rgba(16, 185, 129, 0.72)',
          hoverBackgroundColor: '#059669',
          borderRadius: 8,
          maxBarThickness: 42,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { displayColors: false },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b' } },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: '#64748b' },
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
        },
      },
    },
  });
}

async function loadOverview() {
  await Promise.all([loadStats(), loadRegions()]);
  renderChart();
  const updated = $('#overview-updated');
  if (updated) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    updated.textContent = `更新于 ${hh}:${mm}`;
  }
}

/* ---------------- 数据加载与导航 ---------------- */
async function loadAll() {
  await Promise.all([loadStats(), loadReports(), loadSuggestions(), loadRegions()]);
  if (state.tab === 'overview') renderChart();
}

function refreshCurrent() {
  if (state.tab === 'suggestions') return loadSuggestions();
  if (state.tab === 'overview') return loadOverview();
  return Promise.all([loadStats(), loadReports()]);
}

function switchTab(tab) {
  if (!tab) return;
  state.tab = tab;
  $$('.admin-tabs button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  $$('.admin-panel').forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.panel !== tab);
  });

  const loaders = {
    reports: () => Promise.all([loadStats(), loadReports()]),
    suggestions: () => loadSuggestions(),
    overview: () => loadOverview(),
  };
  const loader = loaders[tab];
  if (loader) Promise.resolve(loader()).catch(handleError);
}

function onLogout() {
  clearAdminKey();
  state.reports = [];
  state.reportsTotal = 0;
  state.suggestions = [];
  state.stats = null;
  state.regions = [];
  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }
  closeAdminModal();
  showLogin('已退出登录');
}

function bindEvents() {
  $('#login-form')?.addEventListener('submit', onLoginSubmit);

  $$('.admin-tabs button').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });

  $('#refresh-btn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    setBusy(button, true, '刷新中…');
    try {
      await refreshCurrent();
      toast('已刷新');
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(button, false);
    }
  });

  $('#logout-btn')?.addEventListener('click', onLogout);

  $('#apply-filter')?.addEventListener('click', () => {
    loadReports().catch(handleError);
  });
  $('#reset-filter')?.addEventListener('click', () => {
    const statusEl = $('#filter-status');
    const kindEl = $('#filter-kind');
    const qEl = $('#filter-q');
    if (statusEl) statusEl.value = '';
    if (kindEl) kindEl.value = '';
    if (qEl) qEl.value = '';
    loadReports().catch(handleError);
  });
  $('#filter-q')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loadReports().catch(handleError);
    }
  });

  $('#apply-suggestion-filter')?.addEventListener('click', () => {
    loadSuggestions().catch(handleError);
  });
  $('#reset-suggestion-filter')?.addEventListener('click', () => {
    const statusEl = $('#suggestion-status');
    const qEl = $('#suggestion-q');
    if (statusEl) statusEl.value = '';
    if (qEl) qEl.value = '';
    loadSuggestions().catch(handleError);
  });
  $('#suggestion-q')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loadSuggestions().catch(handleError);
    }
  });

  $('#reports-tbody')?.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-report-id]');
    if (trigger) openReport(Number(trigger.dataset.reportId));
  });

  $('#suggestions-list')?.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-suggestion-id]');
    if (!trigger) return;
    const id = Number(trigger.dataset.suggestionId);
    const item = state.suggestions.find((suggestion) => Number(suggestion.id) === id);
    if (item) openSuggestion(item);
  });
}

async function boot() {
  bindEvents();
  if (!getAdminKey()) {
    showLogin();
    return;
  }
  // 已有密钥先隐藏登录层，验证失败再弹回
  hideLogin();
  try {
    await loadAll();
  } catch (err) {
    if (err && err.status === 401) {
      clearAdminKey();
      showLogin('管理密钥已失效，请重新输入');
    } else {
      showLogin((err && err.message) || '无法连接后台服务，请确认服务已启动');
    }
  }
}

boot();
