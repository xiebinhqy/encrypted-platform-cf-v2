// cors.js v2.1.0
/**
 * CORS 跨域中间件
 * 支持三环境（development/staging/production）的 CORS 配置
 * 处理 OPTIONS 预检请求
 */

import { getCorsHeaders } from "../config/constants.js";

/**
 * 处理 OPTIONS 预检请求
 * @param {Object} env - Workers 环境变量，用于确定当前环境的 CORS 头
 * @returns {Response}
 */
export const handleCorsPreflight = (env) => {
  return new Response(null, { headers: getCorsHeaders(env) });
};
