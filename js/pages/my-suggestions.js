// 建议反馈：提交 + 历史记录（含官方回复）
import { api } from '../api/index.js';
import { registerAction } from '../core/actions.js';
import { invalidate } from '../core/store.js';
import { $, badge, emptyState, escapeHtml, fmtDateTime, setBusy, toast } from '../core/dom.js';

let initialized = false;

function render(items) {
  const host = $('#my-suggestions-list');
  if (!host) return;
  host.innerHTML = items.length
    ? items
        .map(
          (item) => `
          <div class="card">
            <div class="flex items-center justify-between" style="gap:8px">
              <span class="text-muted" style="font-size:11px">${escapeHtml(fmtDateTime(item.created_at))}</span>
              ${badge(item.status, item.status_label)}
            </div>
            <p style="margin:8px 0 0;font-size:13px;line-height:1.7;color:#374151;white-space:pre-wrap">${escapeHtml(item.content || '')}</p>
            ${item.contact ? `<p class="text-muted" style="margin:6px 0 0;font-size:11px">联系方式：${escapeHtml(item.contact)}</p>` : ''}
            ${item.admin_reply
              ? `<div class="notice">
                   <p class="notice-title">官方回复</p>
                   <p class="notice-text">${escapeHtml(item.admin_reply)}</p>
                   ${item.replied_at ? `<p class="text-muted" style="margin:6px 0 0;font-size:11px">${escapeHtml(fmtDateTime(item.replied_at))}</p>` : ''}
                 </div>`
              : ''}
          </div>`,
        )
        .join('')
    : emptyState('bulb', '还没有提交过建议');
}

async function load(showToast) {
  const host = $('#my-suggestions-list');
  if (host && !host.children.length) {
    host.innerHTML = '<div class="skeleton" style="height:90px"></div>';
  }
  try {
    const data = await api.suggestions.mine();
    render(Array.isArray(data.items) ? data.items : []);
    if (showToast) toast('已刷新');
  } catch (err) {
    console.error('[my-suggestions]', err);
    if (host) host.innerHTML = emptyState('bulb', '加载失败，请稍后重试');
    toast(err.message || '加载失败', { type: 'error' });
  }
}

async function submit() {
  const contentEl = $('#suggestion-content');
  const contactEl = $('#suggestion-contact');
  const content = (contentEl?.value || '').trim();
  const contact = (contactEl?.value || '').trim();
  if (content.length < 5) {
    toast('请填写至少 5 个字的建议', { type: 'error' });
    contentEl?.focus();
    return;
  }

  const button = $('#suggestion-submit');
  setBusy(button, true, '提交中…');
  try {
    await api.suggestions.create({ content, contact: contact || null });
    if (contentEl) contentEl.value = '';
    if (contactEl) contactEl.value = '';
    invalidate('me');
    toast('建议已提交，感谢您的反馈');
    await load(false);
  } catch (err) {
    toast(err.message || '提交失败，请稍后重试', { type: 'error' });
  } finally {
    setBusy(button, false);
  }
}

function init() {
  if (initialized) return;
  initialized = true;
  $('#suggestion-submit')?.addEventListener('click', submit);
  registerAction('refresh-suggestions', () => load(true));
}

async function enter() {
  await load(false);
}

export default { id: 'my-suggestions', init, enter };
