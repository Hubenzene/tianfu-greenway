// Hash 路由：稳定页面 id + 参数，刷新/返回键均可用
import { MAIN_PAGES, PAGE_TITLES } from '../config.js';
import { toast } from './dom.js';

const pages = new Map();
const stack = [];
let currentId = null;

export function register(page) {
  if (!page || !page.id) throw new Error('页面模块缺少 id');
  pages.set(page.id, page);
}

export function getPage(id) {
  return pages.get(id);
}

export function currentPage() {
  return currentId;
}

function parseQuery(text) {
  const params = {};
  new URLSearchParams(text).forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

function parseRoute() {
  let raw = location.hash.replace(/^#/, '');
  if (!raw.startsWith('/')) raw = `/${raw}`;
  const [pathPart, queryPart = ''] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const pageId = segments[0] || 'home';
  const params = { query: parseQuery(queryPart) };
  if (pageId === 'adopt-detail') {
    params.regionId = Number(segments[1] || 0) || 0;
  }
  return { pageId, params };
}

function buildHash(pageId, params = {}) {
  let hash = `#/${pageId}`;
  if (pageId === 'adopt-detail' && params.regionId) hash += `/${params.regionId}`;
  const query = new URLSearchParams();
  if (params.query) {
    Object.entries(params.query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, value);
    });
  }
  const queryText = query.toString();
  return queryText ? `${hash}?${queryText}` : hash;
}

export function navigate(pageId, params = {}, { replace = false } = {}) {
  const targetId = pages.has(pageId) ? pageId : 'home';
  const hash = buildHash(targetId, params);
  if (location.hash === hash) {
    handleRoute();
    return;
  }
  if (replace) {
    history.replaceState(null, '', hash);
    handleRoute();
  } else {
    location.hash = hash;
  }
}

export function back() {
  if (stack.length > 1) {
    stack.pop();
    const target = stack[stack.length - 1];
    if (target) {
      location.hash = target;
      return;
    }
  }
  navigate('home', {}, { replace: true });
}

async function handleRoute() {
  const { pageId, params } = parseRoute();
  const page = pages.get(pageId) || pages.get('home');
  if (!page) return;

  const hash = location.hash;
  const seenAt = stack.lastIndexOf(hash);
  if (seenAt >= 0) stack.length = seenAt + 1;
  else stack.push(hash);
  if (stack.length === 0) stack.push(hash);

  const previous = pages.get(currentId);
  if (previous && previous.id !== page.id) {
    try {
      previous.leave?.();
    } catch (err) {
      console.error('[router] leave', previous.id, err);
    }
  }

  document.querySelectorAll('.page').forEach((section) => {
    section.classList.toggle('active', section.dataset.page === page.id);
  });
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.nav === page.id);
  });
  const nav = document.getElementById('bottom-nav');
  if (nav) nav.classList.toggle('hidden', !MAIN_PAGES.has(page.id));

  const scroller = document.querySelector(`#page-${page.id} .page-scroll`);
  if (scroller) scroller.scrollTop = 0;

  currentId = page.id;
  document.title = `${PAGE_TITLES[page.id] || '天府绿道'} · 天府绿道`;

  try {
    await page.enter?.(params, previous || null);
  } catch (err) {
    console.error('[router] enter', page.id, err);
    toast(err?.message || '页面加载失败，请稍后重试', { type: 'error' });
  }
}

export function initRouter() {
  for (const page of pages.values()) {
    try {
      page.init?.();
    } catch (err) {
      console.error('[router] init', page.id, err);
    }
  }
  if (!location.hash) history.replaceState(null, '', '#/home');
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
