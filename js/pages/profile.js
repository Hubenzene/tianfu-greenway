// 个人中心：积分、统计、昵称修改、积分明细、消息通知、关于
import { api } from '../api/index.js';
import { registerAction } from '../core/actions.js';
import { getState, loadMe } from '../core/store.js';
import { resetLocalData } from '../core/local-api.js';
import {
  $,
  badge,
  emptyState,
  escapeHtml,
  fmtDate,
  fmtDateTime,
  openModal,
  setBusy,
  setUnreadDot,
  toast,
} from '../core/dom.js';

const POINT_REASON_LABELS = {
  report_created: '提交问题上报',
  adoption_created: '认养绿道',
  report_resolved: '上报问题已解决',
};

let initialized = false;

function render(me) {
  const user = me?.user || {};
  const stats = me?.stats || {};
  const nickname = user.nickname || '绿道守护者';

  const avatar = $('#profile-avatar');
  if (avatar) avatar.textContent = Array.from(nickname)[0] || '绿';
  const nicknameEl = $('#profile-nickname');
  if (nicknameEl) nicknameEl.textContent = nickname;
  const meta = $('#profile-meta');
  if (meta) {
    const shortId = String(user.id || '').slice(0, 8);
    meta.textContent = `设备 ${shortId || '未知'} · 加入于 ${fmtDate(user.created_at) || '—'}`;
  }
  const points = $('#profile-points');
  if (points) points.textContent = String(user.total_points ?? 0);
  const adoptions = $('#profile-adoptions');
  if (adoptions) adoptions.textContent = String(stats.adoptions_active ?? 0);
  const reports = $('#profile-reports');
  if (reports) reports.textContent = String(stats.reports_total ?? 0);

  setUnreadDot(me?.unread_notifications ?? 0);
}

function editProfile() {
  const me = getState().me;
  if (!me?.user) {
    toast('用户信息尚未加载');
    return;
  }
  let modal = null;
  modal = openModal({
    title: '修改昵称',
    body: `
      <label class="text-muted" for="profile-nickname-input" style="font-size:12px">昵称</label>
      <input class="field" id="profile-nickname-input" maxlength="30" style="margin-top:6px"
        value="${escapeHtml(me.user.nickname || '')}">
    `,
    actions: [
      { label: '取消', variant: 'ghost', onClick: () => modal?.close() },
      {
        label: '保存',
        variant: 'primary',
        onClick: async (button) => {
          const input = $('#profile-nickname-input');
          const value = (input?.value || '').trim();
          if (!value) {
            toast('昵称不能为空', { type: 'error' });
            return;
          }
          setBusy(button, true, '保存中…');
          try {
            await api.me.update({ nickname: value });
            const fresh = await loadMe(true);
            render(fresh);
            toast('昵称已更新');
            modal?.close();
          } catch (err) {
            toast(err.message || '保存失败', { type: 'error' });
            setBusy(button, false);
          }
        },
      },
    ],
  });
}

async function showPoints() {
  let modal = null;
  modal = openModal({
    title: '积分明细',
    body: '<div class="skeleton" style="height:70px"></div>',
    actions: [{ label: '关闭', variant: 'ghost', onClick: () => modal?.close() }],
  });
  if (!modal) return;
  try {
    const data = await api.me.transactions({ limit: 50 });
    const items = Array.isArray(data.items) ? data.items : [];
    modal.bodyEl.innerHTML = items.length
      ? items
          .map(
            (item) => `
            <div class="detail-row">
              <div>
                <p style="margin:0;font-size:13px">${escapeHtml(POINT_REASON_LABELS[item.reason] || item.reason || '积分变动')}</p>
                <p class="text-muted" style="margin:2px 0 0;font-size:11px">${escapeHtml(fmtDateTime(item.created_at))}</p>
              </div>
              <span style="font-weight:700;color:${Number(item.delta) > 0 ? '#059669' : '#b91c1c'}">
                ${Number(item.delta) > 0 ? '+' : ''}${Number(item.delta) || 0}
              </span>
            </div>`,
          )
          .join('')
      : emptyState('star', '暂无积分记录');
  } catch (err) {
    modal.bodyEl.innerHTML = emptyState('star', err.message || '加载失败');
    toast(err.message || '加载失败', { type: 'error' });
  }
}

function renderNotifications(host, items) {
  host.innerHTML = items.length
    ? items
        .map(
          (item) => `
          <div class="notif-item${item.is_read ? '' : ' unread'}">
            <div class="flex items-center justify-between" style="gap:8px">
              <p style="margin:0;font-size:13px;font-weight:600">${escapeHtml(item.title || '')}</p>
              ${item.is_read ? '' : '<span class="badge badge-mine">未读</span>'}
            </div>
            <p style="margin:5px 0 0;font-size:12px;line-height:1.7;color:#4b5563">${escapeHtml(item.body || '')}</p>
            <p class="text-muted" style="margin:6px 0 0;font-size:11px">${escapeHtml(fmtDateTime(item.created_at))}</p>
          </div>`,
        )
        .join('')
    : emptyState('bell', '暂无消息');
}

async function showNotifications() {
  let modal = null;
  modal = openModal({
    title: '消息通知',
    body: '<div class="skeleton" style="height:70px"></div>',
    actions: [
      {
        label: '全部已读',
        variant: 'ghost',
        onClick: async (button) => {
          setBusy(button, true, '处理中…');
          try {
            await api.me.readNotifications(null);
            const data = await api.me.notifications();
            renderNotifications(modal.bodyEl, Array.isArray(data.items) ? data.items : []);
            const fresh = await loadMe(true);
            render(fresh);
            toast('已全部标记为已读');
          } catch (err) {
            toast(err.message || '操作失败', { type: 'error' });
          } finally {
            setBusy(button, false);
          }
        },
      },
      { label: '关闭', onClick: () => modal?.close() },
    ],
  });
  if (!modal) return;
  try {
    const data = await api.me.notifications();
    renderNotifications(modal.bodyEl, Array.isArray(data.items) ? data.items : []);
  } catch (err) {
    modal.bodyEl.innerHTML = emptyState('bell', err.message || '加载失败');
    toast(err.message || '加载失败', { type: 'error' });
  }
}

function showAbout() {
  let modal = null;
  modal = openModal({
    title: '关于项目',
    body: `
      <p style="margin:0 0 10px;font-size:13px;line-height:1.8;color:#374151">
        天府绿道居民认养计划用于演示居民认养、问题上报、建议反馈与积分激励的完整流程。
      </p>
      <ul class="rule-list">
        <li>匿名设备身份，无需注册登录；</li>
        <li>认养有效期 30 天，每月建议上报 3 次；</li>
        <li>当前为纯静态演示版，数据仅保存在本机浏览器；</li>
        <li>开发者后台密钥：demo123。</li>
      </ul>
      <p class="text-muted" style="font-size:11px;margin-top:14px">版本 1.0.0 · 静态演示版 · 大创赛演示项目</p>
    `,
    actions: [
      {
        label: '重置演示数据',
        variant: 'danger',
        onClick: () => {
          if (!window.confirm('将清空本机演示数据并恢复初始状态，确定吗？')) return;
          resetLocalData();
          window.location.reload();
        },
      },
      { label: '知道了', variant: 'primary', onClick: () => modal?.close() },
    ],
  });
}

function init() {
  if (initialized) return;
  initialized = true;
  registerAction('edit-profile', editProfile);
  registerAction('open-points', showPoints);
  registerAction('open-notifications', showNotifications);
  registerAction('open-about', showAbout);
}

async function enter() {
  try {
    const me = await loadMe(true);
    render(me);
  } catch (err) {
    console.error('[profile]', err);
    toast(err.message || '用户信息加载失败', { type: 'error' });
  }
}

export default { id: 'profile', init, enter };
