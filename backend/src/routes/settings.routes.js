const { Hono } = require('hono');
const { authMiddleware } = require('../middleware/auth');
const { success, error } = require('../utils/response');

const settings = new Hono();

// 获取用户设置
settings.get('/', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const db = c.env.DB;
    
    // 查询用户设置
    const result = await db.prepare(
      'SELECT settings FROM user_settings WHERE user_id = ?'
    ).bind(userId).first();
    
    if (result) {
      return c.json(success(JSON.parse(result.settings)));
    }
    
    // 返回默认设置
    return c.json(success({
      lockTimeout: 10, // 默认10分钟
      lockWarningTime: 30, // 锁定前30秒警告
    }));
  } catch (err) {
    console.error('获取用户设置失败:', err);
    return c.json(error('获取设置失败'), 500);
  }
});

// 更新用户设置
settings.put('/', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const db = c.env.DB;
    const body = await c.req.json();
    
    // 获取现有设置
    const existing = await db.prepare(
      'SELECT settings FROM user_settings WHERE user_id = ?'
    ).bind(userId).first();
    
    const currentSettings = existing ? JSON.parse(existing.settings) : {};
    const newSettings = { ...currentSettings, ...body };
    
    if (existing) {
      await db.prepare(
        'UPDATE user_settings SET settings = ?, updated_at = datetime("now") WHERE user_id = ?'
      ).bind(JSON.stringify(newSettings), userId).run();
    } else {
      await db.prepare(
        'INSERT INTO user_settings (user_id, settings) VALUES (?, ?)'
      ).bind(userId, JSON.stringify(newSettings)).run();
    }
    
    return c.json(success(newSettings));
  } catch (err) {
    console.error('更新用户设置失败:', err);
    return c.json(error('更新设置失败'), 500);
  }
});

module.exports = { settingsRoutes: settings };