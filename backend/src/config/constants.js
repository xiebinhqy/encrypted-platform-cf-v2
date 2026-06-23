// constants.js v2.1.0
/**
 * 应用常量配置
 * 支持三环境（development/staging/production）的环境感知常量
 * 优先级：环境变量 > wrangler.toml [vars] > 默认值
 */

/**
 * 获取 CORS 跨域头配置
 * 根据环境自动适配允许的源
 * @param {Object} env - Workers 环境变量
 * @returns {Object} CORS 头部
 */
export const getCorsHeaders = (env) => {
  const environment = env?.ENVIRONMENT || "development";

  const origins = {
    development: "*",           // 本地开发允许所有源
    staging: "https://notestest.dee.us.kg",
    production: "https://notes.dee.us.kg"
  };

  return {
    "Access-Control-Allow-Origin": origins[environment] || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-User-Id, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400"
  };
};

/**
 * 获取前端域名（用于生成分享链接）
 * @param {Object} env - Workers 环境变量
 * @returns {string} 前端域名
 */
export const getFrontendDomain = (env) => {
  // 如果 wrangler.toml 中定义了 FRONTEND_DOMAIN 则优先使用
  if (env?.FRONTEND_DOMAIN) {
    return env.FRONTEND_DOMAIN;
  }

  // 根据环境回退到默认值
  const environment = env?.ENVIRONMENT || "development";
  const domains = {
    development: "http://localhost:8787",
    staging: "https://notestest.dee.us.kg",
    production: "https://notes.dee.us.kg"
  };

  return domains[environment] || domains.development;
};

/**
 * 获取登录速率限制的 KV 命名空间
 * @param {Object} env - Workers 环境变量
 * @returns {Object} KV 命名空间
 */
export const getRateLimitKV = (env) => {
  return env.LOGIN_RATE_LIMIT;
};

/**
 * 获取笔记历史 KV 命名空间
 * @param {Object} env - Workers 环境变量
 * @returns {Object} KV 命名空间
 */
export const getNoteHistoryKV = (env) => {
  return env.NOTE_HISTORY;
};

/**
 * 获取笔记备份 KV 命名空间
 * @param {Object} env - Workers 环境变量
 * @returns {Object} KV 命名空间
 */
export const getNotesBackupKV = (env) => {
  return env.NOTES_BACKUP;
};

/**
 * 获取笔记缓存 KV 命名空间（冷热数据分离缓存层）
 * 用于存储热笔记列表和热笔记完整内容
 * 读取速度比 D1 快 5-10 倍
 * @param {Object} env - Workers 环境变量
 * @returns {Object} KV 命名空间
 */
export const getNotesCacheKV = (env) => {
  return env.NOTES_CACHE;
};

/**
 * 获取系统事件日志 KV 命名空间
 * 用于持久化存储系统级别的操作事件日志
 * 如无可用的 SYSTEM_EVENTS 命名空间，回退到 NOTES_CACHE
 * @param {Object} env - Workers 环境变量
 * @returns {Object} KV 命名空间
 */
export const getSystemEventsKV = (env) => {
  return env.SYSTEM_EVENTS || env.NOTES_CACHE;
};

/**
 * 获取热数据判定阈值（毫秒）
 * 超过此时间未访问的笔记将被降级为冷数据
 * 默认 15 天（单位：毫秒）
 */
export const HOT_DATA_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

/**
 * 获取分页默认配置
 */
export const getPaginationDefaults = () => ({
  page: 1,
  limit: 50,
  maxLimit: 200
});
/**
 * 获取当前环境名称
 * @param {Object} env - Workers 环境变量
 * @returns {string} 环境名称
 */
export const getEnvironment = (env) => {
  return env?.ENVIRONMENT || "development";
};

/**
 * 判断是否为开发环境
 * @param {Object} env - Workers 环境变量
 * @returns {boolean}
 */
export const isDevelopment = (env) => {
  return getEnvironment(env) === "development";
};

/**
 * 判断是否为测试环境
 * @param {Object} env - Workers 环境变量
 * @returns {boolean}
 */
export const isStaging = (env) => {
  return getEnvironment(env) === "staging";
};

/**
 * 判断是否为生产环境
 * @param {Object} env - Workers 环境变量
 * @returns {boolean}
 */
export const isProduction = (env) => {
  return getEnvironment(env) === "production";
};