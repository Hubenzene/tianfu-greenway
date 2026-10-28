// data-action 注册表：页面在 init() 中注册，app.js 统一事件委托
const handlers = new Map();

export function registerAction(name, handler) {
  if (typeof handler === 'function') handlers.set(name, handler);
}

export function hasAction(name) {
  return handlers.has(name);
}

export function runAction(name, element, event) {
  const handler = handlers.get(name);
  if (!handler) return null;
  return Promise.resolve(handler(element, event));
}
