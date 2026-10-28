// 纯静态演示版的数据层：用 localStorage 模拟后端 /api/v1 接口。
// 页面与 api/index.js 完全不用改，只由 core/http.js 在 STATIC_MODE 下转到本文件。
// 注意：数据只存在当前浏览器，换设备/清缓存会丢失，开发者后台也只能看到本机数据。
import { getAdminKey, getDeviceId } from '../session.js';

const DB_KEY = 'tfg.static.db.v1';
export const STATIC_ADMIN_KEY = 'demo123';

const ADOPTION_DAYS = 30;
const MONTH_REPORT_REQUIRED = 3;
const POINTS_REPORT_CREATED = 10;
const POINTS_ADOPTION_CREATED = 20;
const POINTS_REPORT_RESOLVED = 10;
const MAX_IMAGES = 3;

const REPORT_KIND_LABELS = { issue: '绿道问题', bug: '小程序问题' };

const REPORT_TYPE_LABELS = {
  infra: '基础设施老化',
  vegetation: '植被退化',
  facility: '配套设施功能丧失',
  management: '管理问题',
  conflict: '占道冲突',
  other: '其他',
  app_bug: '程序问题',
};

const REPORT_STATUS_LABELS = {
  pending: '待处理',
  processing: '处理中',
  resolved: '已解决',
  rejected: '已驳回',
};

const SUGGESTION_STATUS_LABELS = {
  pending: '待处理',
  reviewing: '审核中',
  replied: '已回复',
  closed: '已关闭',
};

const REGION_STATUS_LABELS = {
  open: '可认养',
  closed: '已满',
  maintenance: '维护中',
};

const REPORT_TYPES_BY_KIND = {
  issue: ['infra', 'vegetation', 'facility', 'management', 'conflict', 'other'],
  bug: ['app_bug', 'other'],
};

const ALLOWED_TRANSITIONS = {
  pending: ['pending', 'processing', 'rejected'],
  processing: ['processing', 'resolved', 'pending'],
  resolved: ['resolved', 'pending'],
  rejected: ['rejected', 'pending'],
};

class LocalError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'LocalError';
    this.status = status;
    this.code = code;
  }
}

function fail(status, code, message) {
  throw new LocalError(status, code, message);
}

/* ---------------- 存储 ---------------- */

// localStorage 不可用（隐私模式）时退回内存，保证页面仍可演示
let memoryOnly = false;
let memoryText = null;

function readRaw() {
  if (memoryOnly) return memoryText;
  try {
    const text = window.localStorage.getItem(DB_KEY);
    return text === null ? memoryText : text;
  } catch {
    memoryOnly = true;
    return memoryText;
  }
}

function writeRaw(text) {
  if (memoryOnly) {
    memoryText = text;
    return;
  }
  try {
    window.localStorage.setItem(DB_KEY, text);
    memoryText = null;
  } catch (err) {
    const quota =
      err &&
      (err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 ||
        err.code === 1014);
    if (quota) {
      fail(
        413,
        'STORAGE_FULL',
        '本地演示存储空间已满：请在「我的 → 关于项目 → 重置演示数据」后重试，或减少上传图片数量。',
      );
    }
    memoryOnly = true;
    memoryText = text;
  }
}

export function resetLocalData() {
  memoryOnly = false;
  memoryText = null;
  try {
    window.localStorage.removeItem(DB_KEY);
  } catch {
    // 忽略：隐私模式下本来就没有持久化
  }
}

function loadDb() {
  const text = readRaw();
  if (text) {
    try {
      const db = JSON.parse(text);
      if (db && db.version === 1 && db.user && db.user.id === getDeviceId()) return db;
    } catch {
      // 数据损坏时重新播种
    }
  }
  const db = seedDb();
  writeRaw(JSON.stringify(db));
  return db;
}

function saveDb(db) {
  writeRaw(JSON.stringify(db));
}

/* ---------------- 工具 ---------------- */

const clone = (value) =>
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

const nowIso = () => new Date().toISOString();

const pad2 = (value) => String(value).padStart(2, '0');

function localDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function monthStartMs() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function daysLeft(expiresAt) {
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
}

function nextId(db, key) {
  db.seq[key] = (db.seq[key] || 0) + 1;
  return db.seq[key];
}

function toInt(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function toFloat(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new LocalError(400, 'IMAGE_READ_FAILED', '图片读取失败，请换一张图片'));
    reader.readAsDataURL(file);
  });
}

/* ---------------- 种子数据 ---------------- */

const SEED_REGIONS = [
  {
    id: 1,
    code: 'south-1',
    name: '天府绿道南段1号',
    section: '南段',
    description: '紧邻城市公园，植被茂密，适合亲子漫步与骑行。',
    length_km: 1.2,
    cover_image: 'assets/images/region-1.svg',
    capacity: 10,
    base_adopt_count: 3,
    status: 'open',
    map_marker_x: 20,
    map_marker_y: 30,
    sort_order: 1,
  },
  {
    id: 2,
    code: 'east-2',
    name: '天府绿道东段2号',
    section: '东段',
    description: '沿河而建，视野开阔，是观鸟和晨跑的热门路段。',
    length_km: 0.8,
    cover_image: 'assets/images/region-2.svg',
    capacity: 10,
    base_adopt_count: 5,
    status: 'open',
    map_marker_x: 50,
    map_marker_y: 45,
    sort_order: 2,
  },
  {
    id: 3,
    code: 'north-3',
    name: '天府绿道北段3号',
    section: '北段',
    description: '连接社区与商业区，人流密集，认养名额已满。',
    length_km: 1.5,
    cover_image: 'assets/images/region-3.svg',
    capacity: 10,
    base_adopt_count: 10,
    status: 'closed',
    map_marker_x: 70,
    map_marker_y: 60,
    sort_order: 3,
  },
  {
    id: 4,
    code: 'west-4',
    name: '天府绿道西段4号',
    section: '西段',
    description: '田园风光段，春季花海与秋季银杏是最大亮点。',
    length_km: 1.0,
    cover_image: 'assets/images/region-4.svg',
    capacity: 10,
    base_adopt_count: 2,
    status: 'open',
    map_marker_x: 30,
    map_marker_y: 75,
    sort_order: 4,
  },
];

function seedDb() {
  const now = Date.now();
  const at = (daysAgo = 0, hoursAgo = 0) =>
    new Date(now - daysAgo * 86400000 - hoursAgo * 3600000).toISOString();
  const userId = getDeviceId();

  const user = {
    id: userId,
    nickname: '绿道守护者',
    avatar: null,
    total_points: 50,
    created_at: at(10),
    last_seen_at: at(0),
  };

  const adoptions = [
    {
      id: 1,
      user_id: userId,
      region_id: 2,
      reason: '希望和邻居一起维护这段绿道，周末带孩子来巡查。',
      status: 'active',
      started_at: at(5),
      expires_at: new Date(now + 25 * 86400000).toISOString(),
      ended_at: null,
    },
  ];

  const reports = [
    {
      id: 1,
      user_id: userId,
      kind: 'issue',
      type: 'infra',
      description: '南段塑胶跑道出现裂缝，约 2 米长，跑步时容易被绊到。',
      location_text: '南段1号入口向东约 200 米',
      latitude: null,
      longitude: null,
      location_source: 'manual',
      region_id: 1,
      adoption_id: null,
      status: 'resolved',
      admin_note: '已联系养护单位完成修复，感谢您的反馈。',
      points_awarded: 10,
      created_at: at(4),
      updated_at: at(2),
      resolved_at: at(2),
      images: [{ path: 'assets/images/region-1.svg' }],
    },
    {
      id: 2,
      user_id: userId,
      kind: 'issue',
      type: 'vegetation',
      description: '东段2号沿河绿篱有部分枯死，建议补植并检查灌溉。',
      location_text: '东段2号驿站向东约 150 米',
      latitude: null,
      longitude: null,
      location_source: 'manual',
      region_id: 2,
      adoption_id: 1,
      status: 'pending',
      admin_note: null,
      points_awarded: 0,
      created_at: at(0, 3),
      updated_at: at(0, 3),
      resolved_at: null,
      images: [],
    },
  ];

  const suggestions = [
    {
      id: 1,
      user_id: userId,
      content: '希望增加夜间照明和更多休息座椅，方便晚上散步。',
      contact: null,
      status: 'replied',
      admin_reply: '感谢建议，已在东段2号增设两组座椅，照明改造列入下月计划。',
      replied_at: at(1),
      created_at: at(3),
    },
  ];

  const transactions = [
    {
      id: 1,
      user_id: userId,
      delta: 10,
      reason: 'adoption_created',
      ref_type: 'adoption',
      ref_id: 1,
      idempotency_key: 'adoption:1:created',
      created_at: at(5),
    },
    {
      id: 2,
      user_id: userId,
      delta: 10,
      reason: 'report_created',
      ref_type: 'report',
      ref_id: 1,
      idempotency_key: 'report:1:created',
      created_at: at(4),
    },
    {
      id: 3,
      user_id: userId,
      delta: 10,
      reason: 'report_resolved',
      ref_type: 'report',
      ref_id: 1,
      idempotency_key: 'report:1:resolved',
      created_at: at(2),
    },
    {
      id: 4,
      user_id: userId,
      delta: 10,
      reason: 'report_created',
      ref_type: 'report',
      ref_id: 2,
      idempotency_key: 'report:2:created',
      created_at: at(0, 3),
    },
  ];
  // 种子积分为 20 + 10 + 10 + 10 = 50，与 user.total_points 保持一致
  transactions[0].delta = 20;

  const notifications = [
    {
      id: 1,
      user_id: userId,
      title: '欢迎加入天府绿道',
      body: '认养一段绿道，参与城市生态共建。完成认养与上报可获得环保积分。',
      type: 'system',
      ref_type: null,
      ref_id: null,
      is_read: 1,
      created_at: at(10),
    },
    {
      id: 2,
      user_id: userId,
      title: '认养成功',
      body: '您已成功认养「天府绿道东段2号」，有效期 30 天，记得每月上报维护情况哦。',
      type: 'system',
      ref_type: 'adoption',
      ref_id: 1,
      is_read: 1,
      created_at: at(5),
    },
    {
      id: 3,
      user_id: userId,
      title: '上报状态更新',
      body: '您的上报「基础设施老化」状态更新为「已解决」。管理员回复：已联系养护单位完成修复，感谢您的反馈。',
      type: 'report_status',
      ref_type: 'report',
      ref_id: 1,
      is_read: 1,
      created_at: at(2),
    },
    {
      id: 4,
      user_id: userId,
      title: '建议已收到回复',
      body: '您提交的建议有了新回复：感谢建议，已在东段2号增设两组座椅，照明改造列入下月计划。',
      type: 'suggestion_reply',
      ref_type: 'suggestion',
      ref_id: 1,
      is_read: 0,
      created_at: at(1),
    },
  ];

  return {
    version: 1,
    user,
    regions: SEED_REGIONS.map((item) => ({ ...item })),
    adoptions,
    reports,
    suggestions,
    transactions,
    notifications,
    settings: {
      banners: [
        {
          title: '守护天府绿道',
          subtitle: '认养一段绿道，参与城市生态共建',
          image: 'assets/images/hero-greenway.svg',
        },
      ],
      bulletins: [
        {
          title: '天府绿道秋季养护行动启动',
          summary: '本月将对南段、东段开展植被补植与设施检修。',
          date: '2026-10-20',
        },
        {
          title: '居民认养计划新增 4 个段落',
          summary: '新增段落已开放认养，欢迎居民报名参与日常巡护。',
          date: '2026-10-12',
        },
        {
          title: '环保积分兑换即将上线',
          summary: '参与上报与巡护获得的积分，可在积分商城兑换绿道纪念品。',
          date: '2026-10-01',
        },
      ],
    },
    seq: { adoption: 1, report: 2, suggestion: 1, tx: 4, notification: 4 },
  };
}

/* ---------------- 视图组装（与后端字段保持一致） ---------------- */

function userStats(db) {
  const userId = db.user.id;
  return {
    adoptions_active: db.adoptions.filter((item) => item.user_id === userId && item.status === 'active').length,
    reports_total: db.reports.filter((item) => item.user_id === userId).length,
    reports_resolved: db.reports.filter((item) => item.user_id === userId && item.status === 'resolved').length,
    suggestions_total: db.suggestions.filter((item) => item.user_id === userId).length,
  };
}

function unreadCount(db) {
  return db.notifications.filter((item) => item.user_id === db.user.id && !item.is_read).length;
}

function regionView(db, region) {
  const activeCount = db.adoptions.filter(
    (item) => item.region_id === region.id && item.status === 'active',
  ).length;
  const adoptCount = region.base_adopt_count + activeCount;
  const adoptedByMe = db.adoptions.some(
    (item) => item.region_id === region.id && item.status === 'active' && item.user_id === db.user.id,
  );
  return {
    id: region.id,
    code: region.code,
    name: region.name,
    section: region.section,
    description: region.description,
    length_km: region.length_km,
    cover_image: region.cover_image,
    capacity: region.capacity,
    adopt_count: adoptCount,
    status: region.status,
    status_label: REGION_STATUS_LABELS[region.status] || region.status,
    is_full: adoptCount >= region.capacity,
    adopted_by_me: adoptedByMe,
    map_marker_x: region.map_marker_x,
    map_marker_y: region.map_marker_y,
    sort_order: region.sort_order,
  };
}

function allRegions(db) {
  return [...db.regions].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

function reportView(report) {
  return {
    id: report.id,
    kind: report.kind,
    kind_label: REPORT_KIND_LABELS[report.kind] || report.kind,
    type: report.type,
    type_label: REPORT_TYPE_LABELS[report.type] || report.type,
    description: report.description,
    location_text: report.location_text,
    latitude: report.latitude,
    longitude: report.longitude,
    location_source: report.location_source,
    region_id: report.region_id,
    adoption_id: report.adoption_id,
    status: report.status,
    status_label: REPORT_STATUS_LABELS[report.status] || report.status,
    admin_note: report.admin_note,
    points_awarded: report.points_awarded,
    created_at: report.created_at,
    updated_at: report.updated_at,
    resolved_at: report.resolved_at,
    images: Array.isArray(report.images) ? report.images.map((image) => ({ path: image.path })) : [],
  };
}

function monthReports(db, regionId) {
  const start = monthStartMs();
  return db.reports.filter(
    (item) =>
      item.user_id === db.user.id &&
      item.region_id === regionId &&
      new Date(item.created_at).getTime() >= start,
  ).length;
}

function adoptionView(db, adoption) {
  const region = db.regions.find((item) => item.id === adoption.region_id) || {};
  return {
    id: adoption.id,
    region_id: adoption.region_id,
    region: {
      id: region.id,
      name: region.name,
      section: region.section,
      length_km: region.length_km,
      cover_image: region.cover_image,
    },
    reason: adoption.reason,
    status: adoption.status,
    started_at: adoption.started_at,
    expires_at: adoption.expires_at,
    days_left: adoption.status === 'active' ? daysLeft(adoption.expires_at) : 0,
    month_reports: monthReports(db, adoption.region_id),
    month_reports_required: MONTH_REPORT_REQUIRED,
  };
}

function suggestionView(suggestion) {
  return {
    id: suggestion.id,
    content: suggestion.content,
    contact: suggestion.contact,
    status: suggestion.status,
    status_label: SUGGESTION_STATUS_LABELS[suggestion.status] || suggestion.status,
    admin_reply: suggestion.admin_reply,
    replied_at: suggestion.replied_at,
    created_at: suggestion.created_at,
  };
}

function addPoints(db, delta, reason, refType, refId) {
  const key = `${reason}:${refType}:${refId}`;
  if (db.transactions.some((item) => item.idempotency_key === key)) return false;
  db.transactions.push({
    id: nextId(db, 'tx'),
    user_id: db.user.id,
    delta,
    reason,
    ref_type: refType,
    ref_id: refId,
    idempotency_key: key,
    created_at: nowIso(),
  });
  db.user.total_points += delta;
  return true;
}

function addNotification(db, title, body, type = 'system', refType = null, refId = null) {
  db.notifications.push({
    id: nextId(db, 'notification'),
    user_id: db.user.id,
    title,
    body,
    type,
    ref_type: refType,
    ref_id: refId,
    is_read: 0,
    created_at: nowIso(),
  });
}

function adminStats(db) {
  const reports = db.reports;
  const counts = { pending: 0, processing: 0, resolved: 0, rejected: 0 };
  const typeCounts = new Map();
  for (const report of reports) {
    if (counts[report.status] !== undefined) counts[report.status] += 1;
    typeCounts.set(report.type, (typeCounts.get(report.type) || 0) + 1);
  }

  const today = localDate(nowIso());
  const todayCount = reports.filter((item) => localDate(item.created_at) === today).length;

  const byDay = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const day = localDate(date.toISOString());
    byDay.push({
      date: day,
      count: reports.filter((item) => localDate(item.created_at) === day).length,
    });
  }

  const byType = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      type,
      label: REPORT_TYPE_LABELS[type] || type,
      count,
    }));

  return {
    total: reports.length,
    pending: counts.pending,
    processing: counts.processing,
    resolved: counts.resolved,
    rejected: counts.rejected,
    today: todayCount,
    by_type: byType,
    by_day: byDay,
    suggestions_total: db.suggestions.length,
    adoptions_active: db.adoptions.filter((item) => item.status === 'active').length,
  };
}

/* ---------------- 路由分发 ---------------- */

const ok = (result, dirty = false) => ({ result, dirty });

async function dispatch(db, method, path, params, body) {
  /* ---------- 基础 ---------- */
  if (method === 'GET' && path === '/api/v1/health') {
    return ok({ status: 'ok', version: 'static', db: 'local' });
  }

  if (method === 'GET' && path === '/api/v1/home') {
    const markers = allRegions(db).map((region) => {
      const view = regionView(db, region);
      return {
        region_id: view.id,
        x: view.map_marker_x,
        y: view.map_marker_y,
        status: view.status,
        name: view.name,
        adopted_by_me: view.adopted_by_me,
        is_full: view.is_full,
      };
    });
    return ok({
      banners: db.settings.banners,
      bulletins: db.settings.bulletins,
      markers,
    });
  }

  /* ---------- 区域 ---------- */
  if (method === 'GET' && path === '/api/v1/regions') {
    const section = params.get('section') || '';
    const status = params.get('status') || '';
    const items = allRegions(db)
      .filter((region) => (!section || region.section === section) && (!status || region.status === status))
      .map((region) => regionView(db, region));
    return ok({ items });
  }

  let match = path.match(/^\/api\/v1\/regions\/(\d+)\/photos$/);
  if (method === 'GET' && match) return ok({ items: [] });

  match = path.match(/^\/api\/v1\/regions\/(\d+)$/);
  if (method === 'GET' && match) {
    const region = db.regions.find((item) => item.id === Number(match[1]));
    if (!region) fail(404, 'REGION_NOT_FOUND', '认养区域不存在');
    return ok({ region: regionView(db, region) });
  }

  /* ---------- 当前用户 ---------- */
  if (method === 'GET' && path === '/api/v1/me') {
    return ok({
      user: {
        id: db.user.id,
        nickname: db.user.nickname,
        avatar: db.user.avatar,
        total_points: db.user.total_points,
        created_at: db.user.created_at,
      },
      stats: userStats(db),
      unread_notifications: unreadCount(db),
    });
  }

  if (method === 'PATCH' && path === '/api/v1/me') {
    const payload = body || {};
    if (payload.nickname !== undefined) {
      const nickname = String(payload.nickname).trim();
      if (!nickname || nickname.length > 30) fail(400, 'INVALID_NICKNAME', '昵称长度为 1-30 个字符');
      db.user.nickname = nickname;
    }
    if (payload.avatar !== undefined) db.user.avatar = String(payload.avatar || '').trim() || null;
    return ok(
      {
        user: {
          id: db.user.id,
          nickname: db.user.nickname,
          avatar: db.user.avatar,
          total_points: db.user.total_points,
          created_at: db.user.created_at,
        },
      },
      true,
    );
  }

  if (method === 'GET' && path === '/api/v1/me/transactions') {
    const limit = Math.max(1, Math.min(toInt(params.get('limit'), 50), 100));
    const offset = Math.max(0, toInt(params.get('offset'), 0));
    const items = [...db.transactions]
      .filter((item) => item.user_id === db.user.id)
      .sort((a, b) => b.id - a.id)
      .slice(offset, offset + limit)
      .map((item) => ({
        id: item.id,
        delta: item.delta,
        reason: item.reason,
        ref_type: item.ref_type,
        ref_id: item.ref_id,
        created_at: item.created_at,
      }));
    return ok({ items });
  }

  if (method === 'GET' && path === '/api/v1/me/notifications') {
    const unreadOnly = params.get('unread_only') === 'true';
    const items = [...db.notifications]
      .filter((item) => item.user_id === db.user.id && (!unreadOnly || !item.is_read))
      .sort((a, b) => b.id - a.id)
      .slice(0, 100);
    return ok({ items });
  }

  if (method === 'POST' && path === '/api/v1/me/notifications/read') {
    const ids = body && Array.isArray(body.ids) ? body.ids.map(Number) : null;
    let updated = 0;
    for (const item of db.notifications) {
      if (item.user_id !== db.user.id) continue;
      if (!ids || ids.includes(item.id)) {
        if (!item.is_read) updated += 1;
        item.is_read = 1;
      }
    }
    return ok({ updated }, true);
  }

  /* ---------- 认养 ---------- */
  if (method === 'POST' && path === '/api/v1/adoptions') {
    const payload = body || {};
    const regionId = toInt(payload.region_id);
    const region = db.regions.find((item) => item.id === regionId);
    if (!region) fail(404, 'REGION_NOT_FOUND', '认养区域不存在');
    if (region.status !== 'open') fail(409, 'REGION_CLOSED', '该区域当前不可认养');

    const existing = db.adoptions.find(
      (item) => item.user_id === db.user.id && item.region_id === regionId && item.status === 'active',
    );
    if (existing) fail(409, 'ALREADY_ADOPTED', '您已认养该区域，无需重复认养');

    const activeCount = db.adoptions.filter(
      (item) => item.region_id === regionId && item.status === 'active',
    ).length;
    if (region.base_adopt_count + activeCount >= region.capacity) {
      fail(409, 'REGION_FULL', '该区域认养名额已满');
    }

    const reason = String(payload.reason || '').trim();
    if (!reason) fail(400, 'REASON_REQUIRED', '请填写认养理由');

    const now = new Date();
    const adoption = {
      id: nextId(db, 'adoption'),
      user_id: db.user.id,
      region_id: regionId,
      reason,
      status: 'active',
      started_at: now.toISOString(),
      expires_at: new Date(now.getTime() + ADOPTION_DAYS * 86400000).toISOString(),
      ended_at: null,
    };
    db.adoptions.push(adoption);
    addPoints(db, POINTS_ADOPTION_CREATED, 'adoption_created', 'adoption', adoption.id);
    addNotification(
      db,
      '认养成功',
      `您已成功认养「${region.name}」，有效期 ${ADOPTION_DAYS} 天，记得每月上报维护情况哦。`,
      'system',
      'adoption',
      adoption.id,
    );
    return ok({ adoption: adoptionView(db, adoption) }, true);
  }

  if (method === 'GET' && path === '/api/v1/adoptions/mine') {
    const status = params.get('status') || '';
    const items = [...db.adoptions]
      .filter((item) => item.user_id === db.user.id && (!status || item.status === status))
      .sort((a, b) => b.id - a.id)
      .map((item) => adoptionView(db, item));
    return ok({ items });
  }

  /* ---------- 上报 ---------- */
  if (method === 'GET' && path === '/api/v1/reports') {
    const status = params.get('status') || '';
    const kind = params.get('kind') || '';
    const limit = Math.max(1, Math.min(toInt(params.get('limit'), 50), 100));
    const offset = Math.max(0, toInt(params.get('offset'), 0));
    const filtered = [...db.reports]
      .filter(
        (item) =>
          item.user_id === db.user.id &&
          (!status || item.status === status) &&
          (!kind || item.kind === kind),
      )
      .sort((a, b) => b.id - a.id);
    return ok({
      items: filtered.slice(offset, offset + limit).map(reportView),
      total: filtered.length,
    });
  }

  match = path.match(/^\/api\/v1\/reports\/(\d+)$/);
  if (method === 'GET' && match) {
    const report = db.reports.find((item) => item.id === Number(match[1]));
    if (!report) fail(404, 'REPORT_NOT_FOUND', '上报记录不存在');
    if (report.user_id !== db.user.id) fail(403, 'REPORT_FORBIDDEN', '无权查看该上报记录');
    return ok({ report: reportView(report) });
  }

  if (method === 'POST' && path === '/api/v1/reports') {
    if (typeof FormData === 'undefined' || !(body instanceof FormData)) {
      fail(400, 'INVALID_BODY', '上报数据格式不正确');
    }
    const kind = String(body.get('kind') || '');
    const type = String(body.get('type') || '');
    if (!REPORT_TYPES_BY_KIND[kind]) fail(400, 'INVALID_KIND', '上报类型无效');
    if (!REPORT_TYPES_BY_KIND[kind].includes(type)) {
      fail(400, 'INVALID_TYPE', '问题类型与上报分类不匹配');
    }

    const description = String(body.get('description') || '').trim();
    if (!description) fail(400, 'DESCRIPTION_REQUIRED', '请填写详细描述');
    if (description.length > 500) fail(400, 'DESCRIPTION_TOO_LONG', '描述不能超过 500 字');

    const regionId = toInt(body.get('region_id'));
    if (regionId !== null && !db.regions.some((item) => item.id === regionId)) {
      fail(404, 'REGION_NOT_FOUND', '关联的认养区域不存在');
    }

    const adoptionId = toInt(body.get('adoption_id'));
    if (
      adoptionId !== null &&
      !db.adoptions.some((item) => item.id === adoptionId && item.user_id === db.user.id)
    ) {
      fail(404, 'ADOPTION_NOT_FOUND', '关联的认养记录不存在');
    }

    const files = Array.from(body.getAll('images') || []).filter(
      (file) => file && typeof file === 'object' && Number(file.size) > 0,
    );
    if (files.length > MAX_IMAGES) fail(413, 'TOO_MANY_IMAGES', `最多上传 ${MAX_IMAGES} 张图片`);

    const images = [];
    for (const file of files) {
      if (!String(file.type || '').startsWith('image/')) {
        fail(415, 'UNSUPPORTED_IMAGE', '仅支持 JPG / PNG / WebP 图片');
      }
      images.push({ path: await readFileAsDataUrl(file) });
    }

    let locationSource = String(body.get('location_source') || 'manual');
    if (!['gps', 'manual', 'default'].includes(locationSource)) locationSource = 'manual';

    const now = nowIso();
    const report = {
      id: nextId(db, 'report'),
      user_id: db.user.id,
      kind,
      type,
      description,
      location_text: String(body.get('location_text') || '').trim() || null,
      latitude: toFloat(body.get('latitude')),
      longitude: toFloat(body.get('longitude')),
      location_source: locationSource,
      region_id: regionId,
      adoption_id: adoptionId,
      status: 'pending',
      admin_note: null,
      points_awarded: 0,
      created_at: now,
      updated_at: now,
      resolved_at: null,
      images,
    };
    db.reports.push(report);
    addPoints(db, POINTS_REPORT_CREATED, 'report_created', 'report', report.id);
    return ok({ report: reportView(report), points_awarded: POINTS_REPORT_CREATED }, true);
  }

  /* ---------- 建议 ---------- */
  if (method === 'GET' && path === '/api/v1/suggestions/mine') {
    const items = [...db.suggestions]
      .filter((item) => item.user_id === db.user.id)
      .sort((a, b) => b.id - a.id)
      .map(suggestionView);
    return ok({ items });
  }

  if (method === 'POST' && path === '/api/v1/suggestions') {
    const payload = body || {};
    const content = String(payload.content || '').trim();
    if (!content) fail(400, 'CONTENT_REQUIRED', '请填写建议内容');
    if (content.length > 500) fail(400, 'CONTENT_TOO_LONG', '建议内容不能超过 500 字');
    const contact = String(payload.contact || '').trim() || null;
    const now = nowIso();
    const suggestion = {
      id: nextId(db, 'suggestion'),
      user_id: db.user.id,
      content,
      contact,
      status: 'pending',
      admin_reply: null,
      replied_at: null,
      created_at: now,
      updated_at: now,
    };
    db.suggestions.push(suggestion);
    return ok({ suggestion: suggestionView(suggestion) }, true);
  }

  /* ---------- 管理端 ---------- */
  if (method === 'POST' && path === '/api/v1/admin/login') {
    const key = String((body && body.key) || '');
    if (key !== STATIC_ADMIN_KEY) fail(401, 'ADMIN_UNAUTHORIZED', '管理密钥无效');
    return ok({ ok: true });
  }

  if (method === 'GET' && path === '/api/v1/admin/reports') {
    const status = params.get('status') || '';
    const kind = params.get('kind') || '';
    const type = params.get('type') || '';
    const keyword = (params.get('q') || '').trim().toLowerCase();
    const limit = Math.max(1, Math.min(toInt(params.get('limit'), 100), 200));
    const offset = Math.max(0, toInt(params.get('offset'), 0));

    const filtered = [...db.reports]
      .filter(
        (item) =>
          (!status || item.status === status) &&
          (!kind || item.kind === kind) &&
          (!type || item.type === type) &&
          (!keyword ||
            String(item.description || '').toLowerCase().includes(keyword) ||
            String(item.location_text || '').toLowerCase().includes(keyword) ||
            String(db.user.nickname || '').toLowerCase().includes(keyword)),
      )
      .sort((a, b) => b.id - a.id);

    const items = filtered.slice(offset, offset + limit).map((item) => ({
      ...reportView(item),
      user_id: item.user_id,
      user_nickname: db.user.nickname,
    }));
    return ok({ items, total: filtered.length });
  }

  match = path.match(/^\/api\/v1\/admin\/reports\/(\d+)$/);
  if (method === 'GET' && match) {
    const report = db.reports.find((item) => item.id === Number(match[1]));
    if (!report) fail(404, 'REPORT_NOT_FOUND', '上报记录不存在');
    return ok({ report: reportView(report) });
  }

  if (method === 'PATCH' && match) {
    const report = db.reports.find((item) => item.id === Number(match[1]));
    if (!report) fail(404, 'REPORT_NOT_FOUND', '上报记录不存在');
    const payload = body || {};
    const hasStatus = payload.status !== undefined && payload.status !== null;
    const hasNote = Object.prototype.hasOwnProperty.call(payload, 'admin_note');
    if (!hasStatus && !hasNote) fail(400, 'NOTHING_TO_UPDATE', '没有需要更新的内容');

    const current = report.status;
    if (hasStatus) {
      const allowed = ALLOWED_TRANSITIONS[current] || [current];
      if (!allowed.includes(payload.status)) {
        fail(
          409,
          'INVALID_STATUS_TRANSITION',
          `不允许从「${REPORT_STATUS_LABELS[current] || current}」直接变更为「${
            REPORT_STATUS_LABELS[payload.status] || payload.status
          }」`,
        );
      }
    }

    const now = nowIso();
    const next = hasStatus ? payload.status : current;
    if (next === 'resolved' && !report.resolved_at) report.resolved_at = now;
    if (next !== 'resolved') report.resolved_at = null;

    if (next === 'resolved' && !report.points_awarded) {
      if (addPoints(db, POINTS_REPORT_RESOLVED, 'report_resolved', 'report', report.id)) {
        report.points_awarded = POINTS_REPORT_RESOLVED;
      }
    }

    report.status = next;
    if (hasNote) report.admin_note = String(payload.admin_note || '').trim() || null;
    report.updated_at = now;

    if (next !== current || hasNote) {
      let text = `您的上报「${REPORT_TYPE_LABELS[report.type] || report.type}」状态更新为「${
        REPORT_STATUS_LABELS[next] || next
      }」`;
      if (report.admin_note) {
        text += `。管理员回复：${report.admin_note.slice(0, 60)}${report.admin_note.length > 60 ? '…' : ''}`;
      }
      addNotification(db, '上报状态更新', text, 'report_status', 'report', report.id);
    }
    return ok({ report: reportView(report) }, true);
  }

  if (method === 'GET' && path === '/api/v1/admin/suggestions') {
    const status = params.get('status') || '';
    const keyword = (params.get('q') || '').trim().toLowerCase();
    const items = [...db.suggestions]
      .filter(
        (item) =>
          (!status || item.status === status) &&
          (!keyword ||
            String(item.content || '').toLowerCase().includes(keyword) ||
            String(item.contact || '').toLowerCase().includes(keyword)),
      )
      .sort((a, b) => b.id - a.id)
      .slice(0, 200)
      .map((item) => ({
        ...suggestionView(item),
        user_id: item.user_id,
        user_nickname: db.user.nickname,
      }));
    return ok({ items });
  }

  match = path.match(/^\/api\/v1\/admin\/suggestions\/(\d+)$/);
  if (method === 'PATCH' && match) {
    const suggestion = db.suggestions.find((item) => item.id === Number(match[1]));
    if (!suggestion) fail(404, 'SUGGESTION_NOT_FOUND', '建议不存在');
    const payload = body || {};
    const hasStatus = payload.status !== undefined && payload.status !== null;
    const hasReply = Object.prototype.hasOwnProperty.call(payload, 'admin_reply');

    if (hasStatus) {
      if (!SUGGESTION_STATUS_LABELS[payload.status]) fail(400, 'INVALID_STATUS', '建议状态无效');
      suggestion.status = payload.status;
    }
    if (hasReply) {
      const reply = String(payload.admin_reply || '').trim();
      suggestion.admin_reply = reply || null;
      if (reply) {
        suggestion.status = hasStatus ? suggestion.status : 'replied';
        suggestion.replied_at = nowIso();
        addNotification(
          db,
          '建议已收到回复',
          `您提交的建议有了新回复：${reply.slice(0, 60)}${reply.length > 60 ? '…' : ''}`,
          'suggestion_reply',
          'suggestion',
          suggestion.id,
        );
      }
    }
    suggestion.updated_at = nowIso();
    return ok({ suggestion: suggestionView(suggestion) }, true);
  }

  if (method === 'GET' && path === '/api/v1/admin/stats') {
    return ok(adminStats(db));
  }

  if (method === 'GET' && path === '/api/v1/admin/regions') {
    const items = allRegions(db).map((region) => {
      const view = regionView(db, region);
      const activeCount = db.adoptions.filter(
        (item) => item.region_id === region.id && item.status === 'active',
      ).length;
      return {
        id: region.id,
        code: region.code,
        name: region.name,
        section: region.section,
        length_km: region.length_km,
        capacity: region.capacity,
        base_adopt_count: region.base_adopt_count,
        active_count: activeCount,
        adopt_count: view.adopt_count,
        status: region.status,
      };
    });
    return ok({ items });
  }

  fail(404, 'NOT_FOUND', `接口不存在：${method} ${path}`);
}

/* ---------------- 对外入口 ---------------- */

export async function localRequest(path, { method = 'GET', body = null } = {}) {
  const db = loadDb();
  const work = clone(db);
  const url = new URL(path, 'https://local.invalid');
  const upper = String(method || 'GET').toUpperCase();

  // 管理端鉴权（登录接口本身除外）
  if (url.pathname.startsWith('/api/v1/admin') && url.pathname !== '/api/v1/admin/login') {
    if (getAdminKey() !== STATIC_ADMIN_KEY) fail(401, 'ADMIN_UNAUTHORIZED', '管理密钥无效');
  }

  const { result, dirty } = await dispatch(work, upper, url.pathname, url.searchParams, body);
  if (dirty) {
    work.user.last_seen_at = nowIso();
    saveDb(work);
  }
  return result;
}
