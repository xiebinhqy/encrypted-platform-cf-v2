// cron.routes.js v1.0.0
/**
 * Cron Job 定时任务路由
 * 
 * 任务列表：
 * 1. POST /api/cron/balance → 冷热数据升降级（每日执行）
 * 2. POST /api/cron/cleanup → 清理过期回收站笔记（每周执行）
 * 
 * 安全：所有 Cron 路由必须验证 CRON_SECRET 令牌
 */

import { jsonSuccess, jsonError } from "../utils/response.js";
import { ERRORS } from "../utils/error.js";
import { scanAndBalance } from "../services/hot-cold.service.js";
import { getDB } from "../config/database.js";

/**
 * 验证 Cron Job 请求的授权令牌
 * @param {Request} request
 * @returns {boolean}
 */
function validateCronSecret(request, env) {
  const authHeader = request.headers.get("Authorization");
  const expectedSecret = env?.CRON_SECRET || "dev-cron-secret-change-in-production";
  
  if (!authHeader) return false;
  // 支持 Bearer token 格式
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7) === expectedSecret;
  }
  return authHeader === expectedSecret;
}

/**
 * 处理 Cron Job 相关路由
 * @param {Request} request
 * @param {Object} env
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export const handleCronRoute = async (request, env, url) => {
  // 所有 Cron 路由需要验证
  if (!validateCronSecret(request, env)) {
    return jsonError("未授权", 401, env);
  }

  // POST /api/cron/balance — 冷热数据平衡（每日执行）
  if (url.pathname === "/api/cron/balance" && request.method === "POST") {
    return handleBalance(env);
  }

  // POST /api/cron/cleanup — 清理过期回收站（每周执行）
  if (url.pathname === "/api/cron/cleanup" && request.method === "POST") {
    return handleCleanup(env);
  }

  return jsonError(ERRORS.NOT_FOUND.message, ERRORS.NOT_FOUND.status, env);
};

/**
 * 冷热数据平衡任务
 * 扫描所有用户笔记，执行冷热升降级
 */
async function handleBalance(env) {
  try {
    const result = await scanAndBalance(env, null);
    return jsonSuccess(result, env);
  } catch (error) {
    return jsonError("冷热平衡任务失败: " + error.message, 500, env);
  }
}

/**
 * 清理过期回收站任务
 * 删除超过 30 天的回收站笔记
 */
async function handleCleanup(env) {
  try {
    const DB = getDB(env);
    
    // 删除 deleted_at 超过 30 天的笔记
    const result = await DB.prepare(
      "DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')"
    ).run();

    const deletedCount = result.meta?.changes || 0;

    return jsonSuccess({
      deletedCount,
      message: `已清理 ${deletedCount} 条过期回收站笔记`
    }, env);
  } catch (error) {
    return jsonError("清理任务失败: " + error.message, 500, env);
  }
}