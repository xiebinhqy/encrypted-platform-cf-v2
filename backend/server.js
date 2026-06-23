// server.js v2.0.0 — Docker 版 Express 入口（支持 ESM 路由模块）
/**
 * Encrypted Notes v2 — 本地部署版本
 * 替代 Cloudflare Workers fetch handler 的 Express 服务
 * 
 * 注意：后端路由使用 ES Module（import/export），
 * 所以使用 route-adapter 通过动态 import() 加载
 * 
 * 启动方式: node server.js
 * 环境变量: 参见 .env.example
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./src/config/database.docker');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== 全局中间件 ==========
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// ========== 数据库初始化（启动时执行） ==========
let db;
(async () => {
  try {
    db = await initDatabase();
    console.log('✅ 数据库初始化完成');
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err.message);
    process.exit(1);
  }
})();

// ========== 注入数据库和 env 到请求上下文 ==========
app.use((req, res, next) => {
  req.db = db;
  req.env = {
    JWT_SECRET: process.env.JWT_SECRET || 'change-this-to-a-random-secret',
    PBKDF2_ITERATIONS: process.env.PBKDF2_ITERATIONS || '100000',
    ENVIRONMENT: process.env.NODE_ENV || 'development',
    ALLOW_PUBLIC_REGISTRATION: process.env.ALLOW_PUBLIC_REGISTRATION || 'true',
  };
  next();
});

// ========== 健康检查 ==========
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '2.0.0',
  });
});

// ========== API 路由挂载（通过 route-adapter 动态加载 ESM 模块） ==========
async function mountRoutes() {
  try {
    const { createRouteHandler } = require('./docker/route-adapter');

    // 用户认证路由（不需要 X-User-Id）
    app.use('/api/auth', createRouteHandler('src/routes/user.routes', 'handleUserRoute'));

    // 笔记路由
    app.use('/api/notes', createRouteHandler('src/routes/note.routes', 'handleNoteRoute'));

    // 分类路由
    app.use('/api/categories', createRouteHandler('src/routes/category.routes', 'handleCategoryRoute'));

    // 分享路由
    app.use('/api/shares', createRouteHandler('src/routes/share.routes', 'handleShareRoute'));

    // 设置路由（settings.routes.js 是 CommonJS 导出，导出名为 settingsRoutes）
    app.use('/api/settings', createRouteHandler('src/routes/settings.routes', 'settingsRoutes'));

    // 事件日志路由
    app.use('/api/events', createRouteHandler('src/routes/event.routes', 'handleEventRoute'));

    console.log('✅ 所有路由挂载完成');
  } catch (err) {
    console.error('❌ 路由挂载失败:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// ========== 静态文件服务（前端） ==========
const frontendPath = path.join(__dirname, '../frontend/modern');
app.use(express.static(frontendPath));

// ========== SPA 回退 ==========
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not Found' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ========== 全局错误处理 ==========
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  console.error('[ERROR] Stack:', err.stack);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
  });
});

// ========== 启动服务 ==========
async function startServer() {
  // 等待数据库就绪
  let retries = 0;
  while (!db && retries < 10) {
    await new Promise(r => setTimeout(r, 1000));
    retries++;
  }
  if (!db) {
    console.error('❌ 数据库未就绪，退出');
    process.exit(1);
  }

  // 挂载路由
  await mountRoutes();

  // 启动监听
  app.listen(PORT, '0.0.0.0', () => {
    console.log('==========================================');
    console.log('  🔐 Encrypted Notes v2');
    console.log('  🌐 地址: http://localhost:' + PORT);
    console.log('  📝 环境:', process.env.NODE_ENV || 'development');
    console.log('==========================================');
  });
}

startServer().catch(err => {
  console.error('❌ 启动失败:', err.message);
  process.exit(1);
});