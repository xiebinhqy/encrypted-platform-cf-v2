// share.routes.js v2.1.0
/**
 * 分享路由
 * 只处理请求分发，不包含业务逻辑
 * 注意：访问分享内容的路由不需要认证（通过分享码访问）
 * 适配三环境配置
 */

import { jsonSuccess, jsonError } from "../utils/response.js";
import { ERRORS } from "../utils/error.js";
import * as shareService from "../services/share.service.js";

/**
 * 处理分享相关路由
 * @param {Request} request - 原始请求对象
 * @param {Object} env - Workers 环境变量
 * @param {URL} url - 解析后的 URL 对象
 * @param {string|null} userId - 用户 ID（公开访问时为 null）
 * @returns {Promise<Response>}
 */
export const handleShareRoute = async (request, env, url, userId) => {
  switch (url.pathname) {
    case "/api/shares":
      if (request.method === "GET") {
        return handleGetShares(env, userId);
      } else if (request.method === "POST") {
        const body = await request.json();
        return handleCreateShare(env, userId, body);
      }
      break;
    case "/api/shares/public":
      if (request.method === "POST") {
        const body = await request.json();
        return handleGetShareByCode(env, body);
      }
      break;
    default:
      // /api/shares/:id
      if (url.pathname.startsWith("/api/shares/") && request.method === "DELETE") {
        const shareId = url.pathname.split("/api/shares/")[1];
        return handleDeleteShare(env, shareId, userId);
      }
      break;
  }

  return jsonError(ERRORS.NOT_FOUND.message, ERRORS.NOT_FOUND.status, env);
};

/**
 * 获取用户的分享列表
 * GET /api/shares
 */
const handleGetShares = async (env, userId) => {
  try {
    const shares = await shareService.getShareLinks(env, userId);
    return jsonSuccess(shares, env);
  } catch (error) {
    return jsonError("获取分享列表失败", 500, env);
  }
};

/**
 * 创建分享链接
 * POST /api/shares
 * Body: { noteId, maxViews, expireInDays }
 */
const handleCreateShare = async (env, userId, body) => {
  try {
    const { noteId, maxViews, expireInDays } = body;
    const result = await shareService.createShareLink(env, noteId, userId, { maxViews, expireInDays });
    return jsonSuccess(result, env, 201);
  } catch (error) {
    return jsonError("创建分享链接失败", 500, env);
  }
};

/**
 * 通过分享码获取分享内容（公开接口，不需要认证）
 * POST /api/shares/public
 * Body: { shareCode }
 */
const handleGetShareByCode = async (env, body) => {
  try {
    const { shareCode } = body;
    const result = await shareService.getShareByCode(env, shareCode);
    return jsonSuccess(result, env);
  } catch (error) {
    if (error.type) {
      return jsonError(error.type.message, error.type.status, env);
    }
    return jsonError("获取分享内容失败", 500, env);
  }
};

/**
 * 删除分享链接
 * DELETE /api/shares/:id
 */
const handleDeleteShare = async (env, shareId, userId) => {
  try {
    const result = await shareService.deleteShareLink(env, shareId, userId);
    if (!result.success) {
      return jsonError("分享链接不存在", 404, env);
    }
    return jsonSuccess(result, env);
  } catch (error) {
    return jsonError("删除分享链接失败", 500, env);
  }
};