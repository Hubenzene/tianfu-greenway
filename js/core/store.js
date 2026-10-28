// 轻量缓存：me / home / regions，写操作后 invalidate 并广播
import { api } from '../api/index.js';

const TTL = 20000;
const state = { me: null, home: null, regions: null };
const timestamps = { me: 0, home: 0, regions: 0 };
const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

function emit(event, payload) {
  for (const handler of listeners.get(event) || []) {
    try {
      handler(payload);
    } catch (err) {
      console.error('[store] listener error', err);
    }
  }
}

function isFresh(key) {
  return Date.now() - timestamps[key] < TTL;
}

export async function loadMe(force = false) {
  if (!force && state.me && isFresh('me')) return state.me;
  const data = await api.me.get();
  state.me = data;
  timestamps.me = Date.now();
  emit('me', data);
  return data;
}

export function setMe(data) {
  state.me = data;
  timestamps.me = Date.now();
  emit('me', data);
}

export async function loadHome(force = false) {
  if (!force && state.home && isFresh('home')) return state.home;
  const data = await api.home();
  state.home = data;
  timestamps.home = Date.now();
  return data;
}

export async function loadRegions(force = false) {
  if (!force && state.regions && isFresh('regions')) return state.regions;
  const data = await api.regions.list();
  state.regions = data;
  timestamps.regions = Date.now();
  return data;
}

export function updateUnread(count) {
  if (!state.me) return;
  state.me = { ...state.me, unread_notifications: Math.max(0, Number(count) || 0) };
  timestamps.me = Date.now();
  emit('me', state.me);
}

export function invalidate(...keys) {
  for (const key of keys) {
    if (key in timestamps) timestamps[key] = 0;
  }
}

export function getState() {
  return state;
}
