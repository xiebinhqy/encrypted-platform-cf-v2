// error.js v2.0.0
/**
 * 统一错误处理工具
 * 从原始 worker.js 提取的所有错误消息和状态码
 */

import { jsonError } from "./response.js";

/**
 * 错误消息常量
 * 与原始 worker.js 中的错误消息完全一致
 */
export const ERRORS = {
  /** 注册已关闭 */
  REGISTRATION_CLOSED: { message: "注册已关闭", status: 403 },
  /** 密钥已存在 */
  KEY_EXISTS: { message: "密钥已存在", status: 400 },
  /** 用户不存在 */
  USER_NOT_FOUND: { message: "用户不存在", status: 401 },
  /** 恢复码无效或已被使用 */
  INVALID_RECOVERY_CODE: { message: "恢复码无效或已被使用", status: 400 },
  /** 恢复码已被使用 */
  RECOVERY_CODE_USED: { message: "恢复码已被使用（一次性凭证）", status: 410 },
  /** 未授权 */
  UNAUTHORIZED: { message: "未授权", status: 401 },
  /** 无效链接 */
  INVALID_SHARE_LINK: { message: "无效链接", status: 404 },
  /** 链接已过期 */
  SHARE_EXPIRED: { message: "链接已过期", status: 410 },
  /** 已达访问上限 */
  SHARE_MAX_VIEWS: { message: "已达访问上限", status: 410 },
  /** 未找到路由 */
  NOT_FOUND: { message: "Not Found", status: 404 }
};

/**
 * 创建错误响应
 * @param {string} message - 错误消息
 * @param {number} status - HTTP 状态码
 * @param {Object} env - Workers 环境变量
 * @returns {Response}
 */
export const createErrorResponse = (message, status, env) => {
  return jsonError(message, status, env);
};
