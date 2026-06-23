// route-adapter.js v1.0.0 — Workers 路由 → Express 兼容适配器
/**
 * 将 Cloudflare Workers 风格的路由处理函数（request, env, url）
 * 适配为 Express 中间件（req, res, next）
 * 
 * 适配逻辑：
 *   Workers Request  → Express req（body 已解析）
 *   Workers env.DB   → req.db（SQLite 实例）
 *   Workers env.xxx  → req.env.xxx
 *   Workers Response → Express res（状态码 + JSON 响应）
 */

const path = require('path');
const fs = require('fs');

/**
 * 加载路由模块（支持 ES module 和 CommonJS）
 */
async function loadRouteModule(modulePath) {
  const absPath = path.resolve(__dirname, '..', modulePath);
  
  // 检查文件是否存在
  if (!fs.existsSync(absPath + '.js')) {
    throw new Error(`路由文件不存在: ${absPath}.js`);
  }
  
  try {
    // 使用动态 import 加载 ES module
    return await import('file://' + absPath + '.js');
  } catch (err) {
    // 如果 ES module 加载失败，尝试作为 CommonJS
    if (err.code === 'ERR_REQUIRE_ESM') {
      // 已经是 ESM，但 import 失败
      throw err;
    }
    // 回退到 CommonJS
    return require(absPath);
  }
}

/**
 * 创建 Express 路由处理器
 * @param {string} routeModulePath - 相对于 backend/ 的路由模块路径
 * @param {string} handlerName - 导出处理函数名
 * @returns {Function} Express 中间件
 */
function createRouteHandler(routeModulePath, handlerName) {
  let handlerModule = null;
  
  return async (req, res, next) => {
    try {
      // 懒加载路由模块
      if (!handlerModule) {
        const mod = await loadRouteModule(routeModulePath);
        handlerModule = mod[handlerName];
        if (!handlerModule) {
          throw new Error(`路由模块 ${routeModulePath} 未导出 ${handlerName}`);
        }
      }

      // ===== 构造 Workers 风格的 request 对象 =====
      const requestBody = JSON.stringify(req.body || {});
      
      const workersRequest = {
        method: req.method,
        headers: {
          get: (name) => {
            const headers = {
              'Content-Type': 'application/json',
              'Authorization': req.headers.authorization,
              'X-User-Id': req.headers['x-user-id'],
              'CF-Connecting-IP': req.ip || req.connection?.remoteAddress,
            };
            return headers[name] || null;
          },
        },
        json: async () => req.body || {},
      };

      // ===== 构造 env 对象 =====
      const env = {
        ...req.env,
        DB: req.db,  // 数据库实例（已兼容 D1 API）
        ENVIRONMENT: process.env.NODE_ENV || 'development',
      };

      // ===== 构造 URL 对象 =====
      const url = new URL(req.originalUrl || req.url, `http://${req.headers.host || 'localhost'}`);

      // ===== 调用 Workers 路由处理函数 =====
      const workersResponse = await handlerModule(workersRequest, env, url);

      // ===== 解析 Workers Response → Express 响应 =====
      if (!workersResponse) {
        return next();
      }

      const status = workersResponse.status || 200;
      
      // 读取响应体
      let body;
      if (workersResponse.body) {
        body = await new Response(workersResponse.body).json();
      } else {
        body = workersResponse._body || {};
      }

      // 复制响应头
      if (workersResponse.headers) {
        const headers = workersResponse.headers;
        if (typeof headers.forEach === 'function') {
          headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
        }
      }

      res.status(status).json(body);
    } catch (err) {
      console.error(`[Route Adapter] ${routeModulePath} 处理失败:`, err.message);
      console.error(err.stack);
      res.status(500).json({
        error: process.env.NODE_ENV === 'production' 
          ? '服务器内部错误' 
          : err.message,
      });
    }
  };
}

module.exports = { createRouteHandler, loadRouteModule };