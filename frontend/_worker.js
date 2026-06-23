// ============================================================
// 前端 Worker - 统一服务现代版 + 经典版 + API 代理
//
// 功能：
//   1. 静态资源服务（modern/classic/shared）
//   2. API 代理：/api/* 和 v1 兼容路由 → 后端 Worker
//
// 访问路径：
//   /              → /modern/login.html（默认入口，现代版）
//   /modern/*      → modern/*（现代版）
//   /classic/*     → classic/*（经典版）
//   /shared/*      → shared/*（共享模块）
//   /api/*         → 代理到后端 Worker
//   其他           → classic/*（兼容旧链接）
// ============================================================

// 后端 Worker URL 配置
function getBackendUrl(hostname) {
  if (hostname.includes("test")) {
    return "https://notes-api-staging.dea.workers.dev";
  }
  return "https://encrypted-notes-production-backend.dea.workers.dev";
}

// 判断是否为 API 请求（需要代理到后端）
function isApiRequest(pathname) {
  return pathname.startsWith("/api/") ||
    pathname === "/user/login" || pathname === "/user/register" || pathname === "/user/reset-password" ||
    pathname === "/notes" || pathname.startsWith("/notes/") ||
    pathname === "/note" || pathname === "/note/" || pathname === "/note/restore" || pathname === "/note/permanent" || pathname.startsWith("/note/versions") ||
    pathname === "/categories" || pathname === "/category" || pathname === "/category/" ||
    pathname === "/settings" || pathname.startsWith("/settings/") ||
    pathname.startsWith("/share/");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let path = url.pathname;
    let response;

    // 0) API 代理 → 后端 Worker
    if (isApiRequest(path)) {
      const backendUrl = getBackendUrl(url.hostname);
      const cloned = request.clone();
      const backendRequest = new Request(backendUrl + url.pathname + url.search, {
        method: cloned.method,
        headers: cloned.headers,
        body: cloned.body
      });
      // 使用 AbortController 设置 15 秒超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(backendRequest, { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
      } catch (err) {
        clearTimeout(timeoutId);
        console.error(`[Frontend Worker] API 代理失败: ${path}`, err.message);
        if (err.name === 'AbortError') {
          return new Response(JSON.stringify({ error: '后端请求超时' }), {
            status: 504,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
        return new Response(JSON.stringify({ error: '后端服务不可用' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // 1) 现代版路由 - /modern/*
    if (path === '/modern') {
      url.pathname = '/modern/login.html';
      response = await env.ASSETS.fetch(url);
    } else if (path.startsWith('/modern/')) {
      response = await env.ASSETS.fetch(request);
    }
    // 2) 经典版路由 - /classic/*
    else if (path === '/classic') {
      url.pathname = '/classic/index.html';
      response = await env.ASSETS.fetch(url);
    } else if (path.startsWith('/classic/')) {
      response = await env.ASSETS.fetch(request);
    }
    // 3) 共享资源
    else if (path.startsWith('/shared/')) {
      response = await env.ASSETS.fetch(request);
    }
    // 4) 根路径 → 现代版登录页
    else if (path === '/') {
      url.pathname = '/modern/login.html';
      response = await env.ASSETS.fetch(url);
    }
    // 5) /index.html → 现代版主页
    else if (path === '/index.html') {
      url.pathname = '/modern/index.html';
      response = await env.ASSETS.fetch(url);
    }
    // 6) 其他资源 → 经典版（兼容）
    else {
      const rewritePath = '/classic' + (path.startsWith('/') ? path : '/' + path);
      url.pathname = rewritePath;
      try {
        response = await env.ASSETS.fetch(url);
      } catch (e) {
        return new Response('Not Found', { status: 404 });
      }
    }

    // ===== 添加静态资源缓存头 =====
    const resp = new Response(response.body, response);
    if (path.endsWith('.js') || path.endsWith('.css')) {
      // JS/CSS 静态资源：缓存 1 天（有文件名哈希时可更长）
      resp.headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      resp.headers.set('ETag', `"${path}"`);
    } else if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.svg') || path.endsWith('.woff2') || path.endsWith('.ico')) {
      // 图片和字体：缓存 7 天
      resp.headers.set('Cache-Control', 'public, max-age=604800, s-maxage=604800');
    } else if (path.endsWith('.html') || path === '/' || path === '/index.html') {
      // HTML 页面：短缓存，确保更新及时
      resp.headers.set('Cache-Control', 'public, max-age=0, s-maxage=60');
      resp.headers.set('X-Content-Type-Options', 'nosniff');
      resp.headers.set('X-Frame-Options', 'DENY');
    }
    // 共享 JS/CSS 模块（加密、API 等）：缓存 7 天
    if (path.startsWith('/shared/')) {
      resp.headers.set('Cache-Control', 'public, max-age=604800, s-maxage=604800');
    }
    // Service Worker：不要缓存，确保及时更新
    if (path === '/sw.js') {
      resp.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    // 安全头
    resp.headers.set('X-Content-Type-Options', 'nosniff');
    resp.headers.set('X-Frame-Options', 'DENY');
    resp.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    return resp;
  }
};
