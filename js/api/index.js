// 数据访问层：只返回数据，不碰 DOM；未来小程序迁移只替换 core/http.js
import { http } from '../core/http.js';

function queryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  home: () => http.get('/api/v1/home'),

  me: {
    get: () => http.get('/api/v1/me'),
    update: (payload) => http.patch('/api/v1/me', payload),
    transactions: (params = {}) => http.get(`/api/v1/me/transactions${queryString(params)}`),
    notifications: (params = {}) => http.get(`/api/v1/me/notifications${queryString(params)}`),
    readNotifications: (ids = null) => http.post('/api/v1/me/notifications/read', { ids }),
  },

  regions: {
    list: (params = {}) => http.get(`/api/v1/regions${queryString(params)}`),
    get: (id) => http.get(`/api/v1/regions/${id}`),
  },

  adoptions: {
    create: (payload) => http.post('/api/v1/adoptions', payload),
    mine: (params = {}) => http.get(`/api/v1/adoptions/mine${queryString(params)}`),
  },

  reports: {
    list: (params = {}) => http.get(`/api/v1/reports${queryString(params)}`),
    get: (id) => http.get(`/api/v1/reports/${id}`),
    create: (formData) => http.request('/api/v1/reports', { method: 'POST', body: formData }),
  },

  suggestions: {
    mine: () => http.get('/api/v1/suggestions/mine'),
    create: (payload) => http.post('/api/v1/suggestions', payload),
  },

  admin: {
    login: (key) => http.post('/api/v1/admin/login', { key }),
    reports: (params = {}) => http.get(`/api/v1/admin/reports${queryString(params)}`, { admin: true }),
    report: (id) => http.get(`/api/v1/admin/reports/${id}`, { admin: true }),
    updateReport: (id, payload) => http.patch(`/api/v1/admin/reports/${id}`, payload, { admin: true }),
    suggestions: (params = {}) => http.get(`/api/v1/admin/suggestions${queryString(params)}`, { admin: true }),
    updateSuggestion: (id, payload) => http.patch(`/api/v1/admin/suggestions/${id}`, payload, { admin: true }),
    stats: () => http.get('/api/v1/admin/stats', { admin: true }),
    regions: () => http.get('/api/v1/admin/regions', { admin: true }),
  },
};
