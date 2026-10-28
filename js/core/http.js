// 唯一网络出口：迁移微信小程序时只需替换本文件为 wx.request / wx.uploadFile
import { getDeviceId, getAdminKey } from '../session.js';
import { STATIC_MODE } from '../config.js';
import { localRequest } from './local-api.js';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const DEFAULT_TIMEOUT = 15000;

export async function request(
  path,
  { method = 'GET', body = null, headers = {}, timeout = DEFAULT_TIMEOUT, admin = false } = {},
) {
  // 静态演示版：同签名调用本地数据层，页面代码无需改动
  if (STATIC_MODE) {
    try {
      return await localRequest(path, { method, body });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err?.message || '操作失败，请稍后重试', {
        status: Number(err?.status) || 0,
        code: err?.code || 'LOCAL_ERROR',
        details: err?.details ?? null,
      });
    }
  }

  const finalHeaders = { 'X-Device-Id': getDeviceId(), ...headers };
  if (admin) {
    const key = getAdminKey();
    if (key) finalHeaders['X-Admin-Key'] = key;
  }

  let payload = body;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body && typeof body === 'object' && !isFormData) {
    finalHeaders['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), timeout) : null;

  let response;
  try {
    response = await fetch(path, {
      method,
      headers: finalHeaders,
      body: payload,
      signal: controller ? controller.signal : undefined,
      credentials: 'same-origin',
    });
  } catch (err) {
    if (timer) window.clearTimeout(timer);
    if (err && err.name === 'AbortError') {
      throw new ApiError('请求超时，请检查网络后重试', { code: 'TIMEOUT' });
    }
    throw new ApiError('网络连接失败，请确认服务已启动', { code: 'NETWORK_ERROR' });
  }
  if (timer) window.clearTimeout(timer);

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const payloadError = data && typeof data === 'object' && data.error ? data.error : null;
    throw new ApiError(payloadError?.message || `请求失败（${response.status}）`, {
      status: response.status,
      code: payloadError?.code || 'HTTP_ERROR',
      details: payloadError?.details ?? null,
    });
  }
  return data;
}

export const http = {
  request,
  get: (path, options = {}) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body }),
  del: (path, options = {}) => request(path, { ...options, method: 'DELETE' }),
};
