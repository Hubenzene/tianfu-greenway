// 通用 DOM / 展示工具（所有动态文本一律走 escapeHtml）
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

export function icon(name, cls = 'icon') {
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function fmtDateTime(value) {
  const date = toDate(value);
  if (!date) return value ? String(value) : '';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function fmtDate(value) {
  const date = toDate(value);
  if (!date) return value ? String(value) : '';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

export function timeAgo(value) {
  const date = toDate(value);
  if (!date) return fmtDate(value);
  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return fmtDate(value);
}

const BADGE_CLASS = {
  pending: 'badge-pending',
  processing: 'badge-processing',
  reviewing: 'badge-processing',
  resolved: 'badge-resolved',
  replied: 'badge-resolved',
  rejected: 'badge-rejected',
  closed: 'badge-closed',
  expired: 'badge-closed',
  cancelled: 'badge-rejected',
  active: 'badge-open',
  open: 'badge-open',
  maintenance: 'badge-processing',
  mine: 'badge-mine',
};

export function badgeClass(status) {
  return BADGE_CLASS[status] || 'badge-pending';
}

export function badge(status, label) {
  return `<span class="badge ${badgeClass(status)}">${escapeHtml(label || status || '')}</span>`;
}

// 仅允许站内相对资源、上传目录与 data:image（静态演示版用 data URL 存图片）
export function safeImageSrc(path) {
  const value = String(path || '');
  if (
    value.startsWith('assets/') ||
    value.startsWith('/assets/') ||
    value.startsWith('/uploads/') ||
    value.startsWith('data:image/')
  ) {
    return value;
  }
  return 'assets/images/report-placeholder.svg';
}

export function emptyState(iconName, text, extraHtml = '') {
  return `<div class="empty-state">${icon(iconName)}<p style="margin:0">${escapeHtml(text)}</p>${extraHtml}</div>`;
}

export function setUnreadDot(count) {
  const value = Math.max(0, Number(count) || 0);
  const dot = document.getElementById('notif-dot');
  if (dot) dot.classList.toggle('hidden', value === 0);
  const badgeEl = document.getElementById('profile-unread');
  if (badgeEl) {
    badgeEl.textContent = value > 99 ? '99+' : String(value);
    badgeEl.classList.toggle('hidden', value === 0);
  }
}

export function setBusy(button, busy, busyText = '处理中…') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.textContent = busyText;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

export function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

/* ---------------- Toast ---------------- */
export function toast(message, { type = 'info', duration = 2600 } = {}) {
  const host = document.getElementById('toast-host');
  if (!host) {
    console.log('[toast]', message);
    return;
  }
  while (host.children.length >= 3) host.firstElementChild?.remove();
  const node = document.createElement('div');
  node.className = type === 'error' ? 'toast error' : 'toast';
  node.textContent = String(message);
  host.appendChild(node);
  window.setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .2s ease';
    window.setTimeout(() => node.remove(), 220);
  }, duration);
}

/* ---------------- 底部弹层 ---------------- */
let modalEl = null;
let escHandler = null;

function setModalBody(target, content) {
  if (content instanceof Node) {
    target.replaceChildren(content);
  } else {
    target.innerHTML = content;
  }
}

export function closeModal() {
  if (!modalEl) return;
  modalEl.remove();
  modalEl = null;
  if (escHandler) {
    document.removeEventListener('keydown', escHandler);
    escHandler = null;
  }
}

export function openModal({ title = '提示', body = '', actions = [] } = {}) {
  closeModal();
  const host = document.getElementById('modal-host');
  if (!host) return null;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const panel = document.createElement('div');
  panel.className = 'modal';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  const header = document.createElement('div');
  header.className = 'modal-header';
  const heading = document.createElement('h2');
  heading.className = 'modal-title';
  heading.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'icon-btn';
  closeBtn.style.marginLeft = 'auto';
  closeBtn.setAttribute('aria-label', '关闭');
  closeBtn.innerHTML = icon('close', 'icon icon-sm');
  closeBtn.addEventListener('click', closeModal);
  header.append(heading, closeBtn);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'modal-body';
  setModalBody(bodyEl, body);

  panel.append(header, bodyEl);

  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'modal-actions';
    for (const action of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${action.variant === 'primary' ? 'btn-primary' : action.variant === 'danger' ? 'btn-danger-ghost' : 'btn-ghost'}`;
      btn.textContent = action.label || '确定';
      btn.addEventListener('click', () => {
        if (typeof action.onClick === 'function') action.onClick(btn);
        else closeModal();
      });
      row.appendChild(btn);
    }
    panel.appendChild(row);
  }

  backdrop.appendChild(panel);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeModal();
  });
  host.appendChild(backdrop);
  modalEl = backdrop;

  escHandler = (event) => {
    if (event.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', escHandler);

  return { bodyEl, close: closeModal };
}
