// 全局常量：同源部署，接口前缀集中在此，便于后续迁移微信小程序
export const APP_NAME = '天府绿道';
export const API_PREFIX = '/api/v1';

// 纯静态演示版：不访问后端，数据保存在浏览器 localStorage
export const STATIC_MODE = true;

export const PAGE_TITLES = {
  home: '首页',
  report: '问题上报',
  adopt: '绿道认养',
  'adopt-detail': '认养详情',
  'my-reports': '我的记录',
  profile: '个人中心',
  'my-adoptions': '我的认养',
  'my-suggestions': '建议反馈',
};

// 显示底部导航的主页面
export const MAIN_PAGES = new Set(['home', 'report', 'adopt', 'my-reports', 'profile']);

export const MAX_IMAGES = 3;
export const MAX_IMAGE_MB = 5;
// 静态版数据存在 localStorage，压缩得更小一些，避免超出浏览器配额
export const IMAGE_MAX_EDGE = 1000;
export const IMAGE_QUALITY = 0.7;

export const ADOPTION_DAYS = 30;
export const MONTH_REPORT_REQUIRED = 3;
