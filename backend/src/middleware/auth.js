// auth.js v3.0.0
/**
 * 认证中间件
 * 支持双模式认证：JWT Token（推荐）+ X-User-Id Header（向后兼容）
 * 
 * v3.0.0 变更：
 * - 新增 JWT Token 验证（Authorization: Bearer <token>）
 * - 保留 X-User-Id 头兼容旧客户端
 * - 优先使用 JWT 认证，无 JWT 时回退到 Header 认证
 */

import { jsonError } from "../utils/response.js";
import { ERRORS } from "../utils/error.js";
import { verifyToken } from "../utils/jwt.js";

/**
 * 用户认证核心
 * 认证优先级：JWT Token > X-User-Id Header
 * @param {Request} request - 原始请求对象
 * @param {string} pathname - URL 路径名
 * @param {Object} env - Workers 环境变量
 * @returns {{ userId: string|null, authResponse: Response|null }}
 */
export const authenticateRequest = async (request, pathname, env) => {
  // 非 API 路由不需要认证
  if (!pathname.startsWith("/api/")) {
    return { userId: null, authResponse: null };
  }

  // 分享路由不需要认证
  if (pathname === "/api/shares/public" || pathname.startsWith("/api/shares/public/")) {
    return { userId: null, authResponse: null };
  }

  // 策略 1：尝试 JWT Token 认证
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const payload = await verifyToken(env, token);
    if (payload && payload.userId) {
      return { userId: payload.userId, authResponse: null };
    }
    // JWT 无效但存在 → 回退到 X-User-Id（兼容 token 过期/刷新场景）
    console.warn("[Auth] JWT 验证失败，回退到 X-User-Id 认证");
  }

  // 策略 2：回退到 X-User-Id Header（向后兼容旧客户端）
  const userId = request.headers.get("X-User-Id");
  if (userId) {
    return { userId, authResponse: null };
  }

  // 无认证信息
  return { userId: null, authResponse: jsonError(ERRORS.UNAUTHORIZED.message, ERRORS.UNAUTHORIZED.status, env) };
};
