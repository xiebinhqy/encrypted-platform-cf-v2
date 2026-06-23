// response.js v2.1.0
/**
 * 统一响应处理工具
 * 支持三环境（development/staging/production）的响应处理
 * 所有响应函数现在需要 env 参数以获取正确的 CORS 头
 */

import { getCorsHeaders } from "../config/constants.js";

/**
 * 创建 JSON 成功响应
 * @param {any} data - 响应体数据
 * @param {Object} env - Workers 环境变量
 * @param {number} [status=200] - HTTP 状态码
 * @returns {Response}
 */
export const jsonSuccess = (data, env, status = 200) => {
  return Response.json(data, { status, headers: getCorsHeaders(env) });
};

/**
 * 创建 JSON 错误响应
 * @param {string} message - 错误消息
 * @param {number} status - HTTP 状态码
 * @param {Object} env - Workers 环境变量
 * @returns {Response}
 */
export const jsonError = (message, status, env) => {
  return Response.json({ err: message }, { status, headers: getCorsHeaders(env) });
};

/**
 * 创建纯文本响应
 * @param {string} text - 文本内容
 * @param {Object} env - Workers 环境变量
 * @param {number} [status=200] - HTTP 状态码
 * @returns {Response}
 */
export const textResponse = (text, env, status = 200) => {
  return new Response(text, {
    status,
    headers: { ...getCorsHeaders(env), "Content-Type": "text/plain; charset=utf-8" }
  });
};
