// index.js v2.1.0
/**
 * 应用入口文件
 * 整合所有路由，统一请求分发
 * 适配三环境配置（development/staging/production）
 * 
 * 路由规则：
 * - /api/*  → Worker 后端 API 逻辑
 * - /user/, /notes, /note, /categories, /category, /share/ → v1 兼容 API
 * - /modern/* → 现代版前端页面
 * - /classic/* → 经典版前端页面
 * - /shared/* → 共享资源
 * - / → 现代版登录页（默认入口）
 * - /index.html → 现代版笔记主页面
 * - 其他 → 尝试从经典版加载（兼容旧链接）
 */

import { handleCorsPreflight } from "./middleware/cors.js";
import { authenticateRequest } from "./middleware/auth.js";
import { handleUserRoute } from "./routes/user.routes.js";
import { handleNoteRoute } from "./routes/note.routes.js";
import { handleCategoryRoute } from "./routes/category.routes.js";
import { handleShareRoute } from "./routes/share.routes.js";
import { handleCompatRoute } from "./routes/v2.routes.js";
import { handleCronRoute } from "./routes/cron.routes.js";
import { handleEventRoute } from "./routes/event.routes.js";
import { jsonError, jsonSuccess } from "./utils/response.js";
import { ERRORS } from "./utils/error.js";
import { ensureMigrations } from "./config/database.js";
import { checkRateLimit, getRateLimitHeaders, rateLimitResponse } from "./middleware/rateLimit.js";

/**
 * 前端静态资源路由
 * 将 URL 重写为正确的静态资源路径
 */
async function serveFrontend(request, env) {
  const url = new URL(request.url);
  let path = url.pathname;

  // 1) 现代版路由 - /modern/*
  if (path === '/modern') {
    url.pathname = '/modern/login.html';
    return env.ASSETS.fetch(url);
  }
  if (path.startsWith('/modern/')) {
    return env.ASSETS.fetch(request);
  }

  // 2) 经典版路由 - /classic/*
  if (path === '/classic') {
    url.pathname = '/classic/index.html';
    return env.ASSETS.fetch(url);
  }
  if (path.startsWith('/classic/')) {
    return env.ASSETS.fetch(request);
  }

  // 3) 共享资源
  if (path.startsWith('/shared/')) {
    return env.ASSETS.fetch(request);
  }

  // 4) 根路径 → 现代版登录页（默认入口）
  if (path === '/') {
    url.pathname = '/modern/login.html';
    return env.ASSETS.fetch(url);
  }

  // 5) 直接访问 /index.html → 现代版主页
  if (path === '/index.html') {
    url.pathname = '/modern/index.html';
    return env.ASSETS.fetch(url);
  }

  // 6) 其他资源尝试从经典版加载（兼容旧链接）
  let rewritePath = '/classic' + (path.startsWith('/') ? path : '/' + path);
  url.pathname = rewritePath;
  try {
    return await env.ASSETS.fetch(url);
  } catch (e) {
    return new Response('Not Found', { status: 404 });
  }
}

/**
 * Cloudflare Workers 入口
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // ==============================================
      // 全局 CORS 预检请求处理
      // 所有跨域 OPTIONS 请求统一返回 CORS 头
      // （包括 v1 兼容路由和 v2 API 路由）
      // ==============================================
      if (request.method === "OPTIONS") {
        return handleCorsPreflight(env);
      }

      // ==============================================
      // 兼容 v1 API 路由（经典版前端）
      // v1 路径不带 /api/ 前缀
      // ==============================================
      if (pathname.startsWith("/user/") || pathname.startsWith("/notes/") || pathname.startsWith("/note/") || pathname === "/notes" || pathname === "/note" ||
          pathname.startsWith("/categories/") || pathname === "/categories" || pathname === "/category" || pathname.startsWith("/share/") || pathname === "/settings" || pathname === "/settings/") {
        // API 请求前确保数据库 schema 正确
        await ensureMigrations(env);
    const v2Result = await handleCompatRoute(request, env, url);
        if (v2Result) return v2Result;
      }

      // ==============================================
      // v2 API 路由处理（/api/* 前缀）
      // ==============================================
      if (pathname.startsWith("/api/")) {
        // ===== 认证路由（不需要 X-User-Id 和迁移） =====
        // 不阻塞等待迁移，后台异步执行以免冷启动时登录超时
        if (pathname.startsWith("/api/auth/")) {
          ensureMigrations(env).catch(e => console.warn("[Auth] 后台迁移失败（不影响本次请求）:", e.message));
          return await handleUserRoute(request, env, url);
        }

        // Cron Job 路由（使用 CRON_SECRET 认证，不需要 X-User-Id）
        if (pathname.startsWith("/api/cron/")) {
          return await handleCronRoute(request, env, url);
        }

        // 其他 API 请求前确保数据库 schema 正确
        await ensureMigrations(env);

        // ===== 全局 API 速率限制（120次/分钟） =====
        const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
        const globalRate = await checkRateLimit(env, clientIP, "global", 120, 60);
        if (globalRate.blocked) {
          return rateLimitResponse(globalRate.resetAt);
        }

        // 公开分享路由（不需要认证）
        if (pathname === "/api/shares/public") {
          return await handleShareRoute(request, env, url, null);
        }

        // 需要认证的路由
        const { userId, authResponse } = await authenticateRequest(request, pathname, env);
        if (authResponse) return authResponse;

        // ===== 笔记接口速率限制（60次/分钟） =====
        if (pathname.startsWith("/api/notes") || pathname.startsWith("/api/categories")) {
          const noteRate = await checkRateLimit(env, userId || clientIP, "notes", 60, 60);
          if (noteRate.blocked) {
            return rateLimitResponse(noteRate.resetAt);
          }
        }

        // ===== 事件日志速率限制（100次/分钟） =====
        if (pathname === "/api/events") {
          const eventRate = await checkRateLimit(env, userId || clientIP, "events", 100, 60);
          if (eventRate.blocked) {
            return rateLimitResponse(eventRate.resetAt);
          }
        }

        // 笔记路由
        if (pathname.startsWith("/api/notes")) {
          return await handleNoteRoute(request, env, url, userId);
        }

        // 分类路由
        if (pathname.startsWith("/api/categories")) {
          return await handleCategoryRoute(request, env, url, userId);
        }

        // 设置路由（/api/settings）
        if (pathname === "/api/settings") {
          if (request.method === "GET") {
            const result = await env.DB.prepare("SELECT settings FROM user_settings WHERE user_id = ?").bind(userId).first();
            if (result) {
              return jsonSuccess(JSON.parse(result.settings), env);
            }
            return jsonSuccess({ lockTimeout: 10, lockWarningTime: 30 }, env);
          } else if (request.method === "PUT") {
            const body = await request.json();
            const existing = await env.DB.prepare("SELECT settings FROM user_settings WHERE user_id = ?").bind(userId).first();
            const currentSettings = existing ? JSON.parse(existing.settings) : {};
            const newSettings = { ...currentSettings, ...body };
            if (existing) {
              await env.DB.prepare("UPDATE user_settings SET settings = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?").bind(JSON.stringify(newSettings), userId).run();
            } else {
              await env.DB.prepare("INSERT INTO user_settings (user_id, settings) VALUES (?, ?)").bind(userId, JSON.stringify(newSettings)).run();
            }
            return jsonSuccess(newSettings, env);
          }
        }

        // 事件日志路由
        if (pathname === "/api/events") {
          return await handleEventRoute(request, env, url, userId);
        }

        // 分享路由
        if (pathname.startsWith("/api/shares")) {
          return await handleShareRoute(request, env, url, userId);
        }

        // 版本历史路由（/api/note/versions*）
        if (pathname.startsWith("/api/note/versions")) {
          const v2Result = await handleCompatRoute(request, env, url);
          if (v2Result) return v2Result;
        }

        return jsonError(ERRORS.NOT_FOUND.message, ERRORS.NOT_FOUND.status, env);
      }

      // ==============================================
      // 非 API 请求 → 提供前端静态资源（带安全头）
      // ==============================================
      const frontendResponse = await serveFrontend(request, env);
      const response = new Response(frontendResponse.body, frontendResponse);
      // 添加安全响应头
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Frame-Options', 'DENY');
      response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      // CSP: 限制脚本和资源来源
      // 已移除 tailwindcss.com CDN（已使用预编译 CSS）
      if (pathname.endsWith('.html') || pathname === '/' || pathname.endsWith('.css')) {
        response.headers.set('Content-Security-Policy', [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
          "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
          "connect-src 'self' https://apitest.dee.us.kg https://api.dee.us.kg",
          "worker-src 'self'",
          "img-src 'self' data: blob:",
          "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'"
        ].join('; '));
      }
      return response;
    } catch (error) {
      console.error("🚨 API 全局错误:", error.message, error.stack);
      // 生产环境隐藏详细错误，防止信息泄露
      const isStaging = env.ENVIRONMENT === 'staging';
      const isDev = env.ENVIRONMENT === 'development';
      const showDetail = isDev || isStaging;
      const errorDetail = showDetail ? (error.message || "未知错误") : "服务器内部错误";
      return jsonError(errorDetail, 500, env);
    }
  }
};