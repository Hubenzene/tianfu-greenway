// 会话：匿名设备号 + 管理端密钥（仅这两项允许落 localStorage）
const DEVICE_KEY = 'tfg.device_id';
const ADMIN_KEY = 'tfg.admin_key';

function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, String(value));
  } catch {
    // 隐私模式下 localStorage 可能不可写，忽略即可
  }
}

function newDeviceId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return `dev-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function getDeviceId() {
  let id = read(DEVICE_KEY);
  if (!id || id.length < 8) {
    id = newDeviceId();
    write(DEVICE_KEY, id);
  }
  return id;
}

export function getAdminKey() {
  return read(ADMIN_KEY) || '';
}

export function setAdminKey(key) {
  write(ADMIN_KEY, key || '');
}

export function clearAdminKey() {
  write(ADMIN_KEY, null);
}
