// 应用入口：注册页面、启动路由、全局事件委托与错误兜底
import { hasAction, registerAction, runAction } from './core/actions.js';
import { on } from './core/store.js';
import { setUnreadDot, toast } from './core/dom.js';
import { back, initRouter, navigate, register } from './core/router.js';

import homePage from './pages/home.js';
import reportPage from './pages/report.js';
import adoptPage from './pages/adopt.js';
import adoptDetailPage from './pages/adopt-detail.js';
import myReportsPage from './pages/my-reports.js';
import profilePage from './pages/profile.js';
import myAdoptionsPage from './pages/my-adoptions.js';
import mySuggestionsPage from './pages/my-suggestions.js';

register(homePage);
register(reportPage);
register(adoptPage);
register(adoptDetailPage);
register(myReportsPage);
register(profilePage);
register(myAdoptionsPage);
register(mySuggestionsPage);

registerAction('back', () => back());

// 全局事件委托：data-nav 统一跳转，data-action 命中注册表才处理
document.addEventListener('click', (event) => {
  const navEl = event.target.closest('[data-nav]');
  if (navEl) {
    event.preventDefault();
    navigate(navEl.dataset.nav);
    return;
  }

  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const actionName = actionEl.dataset.action;
  if (!hasAction(actionName)) return;

  event.preventDefault();
  const result = runAction(actionName, actionEl, event);
  if (result && typeof result.catch === 'function') {
    result.catch((err) => {
      console.error('[action]', actionName, err);
      toast(err?.message || '操作失败，请稍后重试', { type: 'error' });
    });
  }
});

// 未读通知角标随 store 广播更新
on('me', (data) => {
  setUnreadDot(data?.unread_notifications ?? 0);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandledrejection]', event.reason);
});

try {
  initRouter();
  window.__tfgBooted = true;
} catch (err) {
  console.error('[boot]', err);
  const main = document.getElementById('app-main');
  if (main) {
    main.innerHTML = `<div class="boot-error">应用启动失败：${String(err?.message || err)}<br>请刷新页面重试。</div>`;
  }
}
