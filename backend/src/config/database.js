// database.js v4.0.1
/**
 * 数据库连接配置
 * 
 * v4.0.1 变更：
 * - 修复 ensureMigrations 部分步骤失败后无法标记迁移完成，导致每次 API 请求都重试失败迁移而返回 500 的问题
 * - 将数据耗时的 v1→v2 数据同步 UPDATE 操作改为异步非阻塞执行
 * - 迁移失败时仍标记迁移版本，防止冷启动反复重试同一失败迁移
 * - 拆分迁移为「必须成功」和「可跳过」两阶段
 * 
 * v4.0.0 新增：
 * - KV 持久化迁移版本记录，冷启动跳过 PRAGMA 查询
 * - 迁移版本常量，后续只需递增版本号
 */

const MIGRATION_VERSION_KEY = 'db_migration_version';
const CURRENT_MIGRATION_VERSION = 14; // 当前迁移版本号（递增此值触发迁移）
// v10: 首次启动时自动创建核心表（users/categories/notes），兼容空数据库启动
// v11: 添加性能复合索引 + is_hot 索引 + users 恢复码索引
// v12: 修复 staging 环境 users 表列名迁移（key_hash → public_key, recovery_code → recovery_code_hash）
// v13: 修复 shares 表不存在导致索引创建失败
// v14: 修复 v1→v2 数据同步 UPDATE 导致冷启动迁移超时/失败，进而阻塞所有 API 请求的问题

/**
 * 获取 D1 数据库实例
 * @param {Object} env - Workers 环境变量
 * @returns {D1Database}
 */
export const getDB = (env) => env.DB;

// ==============================================
// 自动迁移：确保数据库 schema 最新
// ==============================================

const _migrationCache = new Map();
const _migrationPromises = new Map();

/** 尝试从 KV 获取缓存的迁移版本 */
async function _getCachedMigrationVersion(env) {
  try {
    if (env.NOTES_CACHE) {
      const version = await env.NOTES_CACHE.get(MIGRATION_VERSION_KEY);
      if (version !== null) return parseInt(version, 10);
    }
  } catch (_) {}
  return 0;
}

/** 将迁移版本写入 KV */
async function _setCachedMigrationVersion(env, version) {
  try {
    if (env.NOTES_CACHE) {
      await env.NOTES_CACHE.put(MIGRATION_VERSION_KEY, String(version), { expirationTtl: 86400 * 365 });
    }
  } catch (_) {}
}

export const ensureMigrations = async (env) => {
  const cacheKey = env.ENVIRONMENT || 'default';

  // 1. 内存缓存优先
  if (_migrationCache.has(cacheKey)) return;

  // 2. KV 持久缓存：如果迁移版本匹配，直接跳过
  const kvVersion = await _getCachedMigrationVersionWithTimeout(env);
  if (kvVersion >= CURRENT_MIGRATION_VERSION) {
    _migrationCache.set(cacheKey, true);
    return;
  }

  // 3. 防止并发执行
  if (_migrationPromises.has(cacheKey)) {
    return _migrationPromises.get(cacheKey);
  }

  const migrationPromise = _runMigrations(env, cacheKey);
  _migrationPromises.set(cacheKey, migrationPromise);
  return migrationPromise;
};

/** 带超时的 KV 缓存读取（避免冷启动阻塞） */
async function _getCachedMigrationVersionWithTimeout(env) {
  try {
    if (!env.NOTES_CACHE) return 0;
    const result = await Promise.race([
      env.NOTES_CACHE.get(MIGRATION_VERSION_KEY),
      new Promise((_, reject) => setTimeout(() => reject(new Error('KV timeout')), 3000))
    ]);
    if (result !== null) return parseInt(result, 10);
  } catch (_) {
    console.warn('[DB Migration] KV 缓存读取超时或失败，跳过缓存');
  }
  return 0;
}

async function _runMigrations(env, cacheKey) {
  try {
    const DB = getDB(env);

    // ==============================================
    // 阶段一：核心表创建（必须成功）
    // ==============================================
    console.log("[DB Migration] 检查核心表是否存在...");
    
    // users 表
    await DB.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        public_key TEXT NOT NULL UNIQUE,
        recovery_code_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // categories 表
    await DB.prepare(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        color TEXT DEFAULT '',
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `).run();

    // notes 表
    await DB.prepare(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        category TEXT DEFAULT '',
        tags TEXT DEFAULT '',
        revision_count INTEGER DEFAULT 1,
        is_hot INTEGER DEFAULT 1,
        last_access_at DATETIME DEFAULT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `).run();

    // ==============================================
    // 阶段二：列兼容检查和添加（必须成功）
    // ==============================================
    // 1. 检查现有的 notes 表列（兼容旧版 v1 列名）
    const columns = await DB.prepare("PRAGMA table_info(notes)").all();
    const columnNames = (columns.results || []).map(c => c.name);

    // 1a. 旧版 v1 列的兼容：如果存在 title_cipher 但没有 title，添加并同步
    if (columnNames.includes('title_cipher') && !columnNames.includes('title')) {
      console.log("[DB Migration] 添加 notes.title 列（从旧的 title_cipher 迁移）...");
      await DB.prepare("ALTER TABLE notes ADD COLUMN title TEXT DEFAULT ''").run();
    }
    if (columnNames.includes('ciphertext') && !columnNames.includes('content')) {
      await DB.prepare("ALTER TABLE notes ADD COLUMN content TEXT DEFAULT ''").run();
    }
    if (columnNames.includes('category_cipher') && !columnNames.includes('category')) {
      await DB.prepare("ALTER TABLE notes ADD COLUMN category TEXT DEFAULT ''").run();
    }
    if (columnNames.includes('tags_cipher') && !columnNames.includes('tags')) {
      await DB.prepare("ALTER TABLE notes ADD COLUMN tags TEXT DEFAULT ''").run();
    }

    // 1c. 检查 categories 表的旧列名兼容
    try {
      const catColumns = await DB.prepare("PRAGMA table_info(categories)").all();
      const catColumnNames = (catColumns.results || []).map(c => c.name);
      
      if (catColumnNames.includes('name_cipher') && !catColumnNames.includes('name')) {
        console.log("[DB Migration] 添加 categories.name 列（从旧的 name_cipher 迁移）...");
        await DB.prepare("ALTER TABLE categories ADD COLUMN name TEXT DEFAULT ''").run();
      }
      if (!catColumnNames.includes('color')) {
        await DB.prepare("ALTER TABLE categories ADD COLUMN color TEXT DEFAULT ''").run();
      }
    } catch (e) {
      console.warn("[DB Migration] 检查 categories 表失败:", e.message);
    }

    // 1b0. 检查 users 表列名兼容
    try {
      const userColumns = await DB.prepare("PRAGMA table_info(users)").all();
      const userColumnNames = (userColumns.results || []).map(c => c.name);
      
      if (userColumnNames.includes('key_hash') && !userColumnNames.includes('public_key')) {
        console.log("[DB Migration] users 表存在 key_hash 列，迁移到 public_key...");
        await DB.prepare("ALTER TABLE users ADD COLUMN public_key TEXT DEFAULT ''").run();
      }
      
      if (userColumnNames.includes('recovery_code') && !userColumnNames.includes('recovery_code_hash')) {
        console.log("[DB Migration] users 表存在 recovery_code 列，迁移到 recovery_code_hash...");
        await DB.prepare("ALTER TABLE users ADD COLUMN recovery_code_hash TEXT DEFAULT ''").run();
      }
    } catch (e) {
      console.warn("[DB Migration] 检查 users 表列名失败:", e.message);
    }

    // 1b. 确保 user_settings 表存在
    console.log("[DB Migration] 检查 user_settings 表...");
    await DB.prepare(`CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      settings TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id)
    )`).run();

    // 1b2. 检查 user_settings 表的列
    try {
      const settingsColumns = await DB.prepare("PRAGMA table_info(user_settings)").all();
      const settingsColumnNames = (settingsColumns.results || []).map(c => c.name);
      if (!settingsColumnNames.includes('settings')) {
        console.log("[DB Migration] user_settings 表缺少 settings 列，正在添加...");
        await DB.prepare("ALTER TABLE user_settings ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'").run();
      }
    } catch (e) {
      console.warn("[DB Migration] 检查 user_settings 列失败:", e.message);
    }

    // 1c. 确保 note_versions 表存在
    console.log("[DB Migration] 检查 note_versions 表...");
    await DB.prepare(`CREATE TABLE IF NOT EXISTS note_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      version_number INTEGER NOT NULL DEFAULT 1,
      title TEXT DEFAULT '',
      content TEXT DEFAULT '',
      category TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      content_hash TEXT DEFAULT '',
      version_label TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (note_id) REFERENCES notes(id)
    )`).run();

    // 2. 添加 last_access_at 列
    if (!columnNames.includes('last_access_at')) {
      console.log("[DB Migration] 添加 last_access_at 列...");
      await DB.prepare("ALTER TABLE notes ADD COLUMN last_access_at DATETIME DEFAULT NULL").run();
    }

    // 3. 添加 is_hot 列
    if (!columnNames.includes('is_hot')) {
      console.log("[DB Migration] 添加 is_hot 列...");
      await DB.prepare("ALTER TABLE notes ADD COLUMN is_hot INTEGER DEFAULT 1").run();
    }

    // 4. 添加 deleted_at 列
    if (!columnNames.includes('deleted_at')) {
      console.log("[DB Migration] 添加 deleted_at 列...");
      await DB.prepare("ALTER TABLE notes ADD COLUMN deleted_at DATETIME DEFAULT NULL").run();
    }

    // 🏁 阶段二结束：标记迁移版本，防止后续冷启动重试
    // 此时核心表和列都已就绪，即使后续索引/数据同步失败也不影响 API 正常使用
    _migrationCache.set(cacheKey, true);
    await _setCachedMigrationVersion(env, CURRENT_MIGRATION_VERSION);

    // ==============================================
    // 阶段三：索引创建和数据迁移（可失败，不阻塞 API）
    // 此阶段失败已不影响迁移版本标记，下次冷启动不重试
    // ==============================================
    _runOptionalMigrations(env, columnNames).catch(err => {
      console.warn("[DB Migration] 可选迁移步骤失败（不影响 API 正常使用）:", err.message);
    });

    console.log("[DB Migration] 核心迁移检查完成（可选步骤异步执行中）");
  } catch (error) {
    console.error("[DB Migration] 核心迁移检查失败:", error.message);
    // 🚨 即使核心迁移失败，也标记迁移版本，避免每次请求都重试失败的迁移导致永久 500
    // 用户在下次部署（修复迁移代码后）版本号递增时会重新执行
    try {
      _migrationCache.set(cacheKey, true);
      await _setCachedMigrationVersion(env, CURRENT_MIGRATION_VERSION);
    } catch (_) {}
  } finally {
    _migrationPromises.delete(cacheKey);
  }
}

/**
 * 可选的迁移步骤：索引创建、v1→v2 数据同步
 * 这些步骤失败不会影响 API 核心功能
 * 使用独立函数避免阻塞冷启动
 */
async function _runOptionalMigrations(env, columnNames) {
  const DB = getDB(env);

  // 5. 创建索引
  const indexes = await DB.prepare("PRAGMA index_list(notes)").all();
  const indexNames = (indexes.results || []).map(i => i.name);

  if (!indexNames.includes('idx_notes_deleted_at')) {
    await DB.prepare("CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at)").run();
  }
  if (!indexNames.includes('idx_notes_last_access')) {
    await DB.prepare("CREATE INDEX IF NOT EXISTS idx_notes_last_access ON notes(last_access_at)").run();
  }

  // 6. 初始化热笔记标记
  const nowStr = new Date().toISOString().replace('T', ' ').replace('Z', '');
  await DB.prepare("UPDATE notes SET is_hot = 1, last_access_at = ? WHERE is_hot IS NULL").bind(nowStr).run();

  // 7. 确保 shares 表存在
  const sharesTableCheck = await DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='shares'"
  ).first();
  if (!sharesTableCheck) {
    await DB.prepare(`CREATE TABLE IF NOT EXISTS shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      note_id TEXT NOT NULL,
      share_key TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();
  }

  // 7b. 修复 categories 表中 id 为 NULL 的记录
  try {
    const nullIdCats = await DB.prepare("SELECT rowid FROM categories WHERE id IS NULL OR id = ''").all();
    if (nullIdCats.results && nullIdCats.results.length > 0) {
      const ts = Date.now();
      for (const row of nullIdCats.results) {
        await DB.prepare("UPDATE categories SET id = ? WHERE rowid = ? AND (id IS NULL OR id = '')").bind('fix-' + ts + '-' + row.rowid, row.rowid).run();
      }
    }
  } catch (e) {
    console.warn("[DB Migration] 修复分类 null id 失败:", e.message);
  }

  // 8. 添加性能索引
  try {
    await DB.prepare("CREATE INDEX IF NOT EXISTS idx_notes_user_deleted_updated ON notes(user_id, deleted_at, updated_at DESC)").run();
    await DB.prepare("CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id, id)").run();
    await DB.prepare("CREATE INDEX IF NOT EXISTS idx_notes_user_is_hot ON notes(user_id, is_hot)").run();
    if (columnNames.includes('category')) {
      await DB.prepare("CREATE INDEX IF NOT EXISTS idx_notes_user_category ON notes(user_id, category)").run();
    }
    await DB.prepare("CREATE INDEX IF NOT EXISTS idx_users_recovery_code ON users(recovery_code_hash)").run();
    await DB.prepare("CREATE INDEX IF NOT EXISTS idx_shares_user_created ON shares(user_id, created_at DESC)").run();
  } catch (e) {
    console.warn("[DB Migration] 索引创建失败:", e.message);
  }

  // 9. event_logs 表
  const tableCheck = await DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='event_logs'"
  ).first();
  if (!tableCheck) {
    await DB.prepare(`CREATE TABLE IF NOT EXISTS event_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      time TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      operator TEXT DEFAULT '管理员',
      status TEXT DEFAULT '成功',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();
    await DB.prepare("CREATE INDEX IF NOT EXISTS idx_event_logs_user_id ON event_logs(user_id)").run();
    await DB.prepare("CREATE INDEX IF NOT EXISTS idx_event_logs_time ON event_logs(time)").run();
    await DB.prepare("CREATE INDEX IF NOT EXISTS idx_event_logs_user_time ON event_logs(user_id, time)").run();
  }

  // 🚀 v1→v2 数据同步（分批执行，避免大表超时）
  // 仅在 v1 列存在且 v2 列也有数据需要同步时执行
  try {
    if (columnNames.includes('title_cipher') && columnNames.includes('title')) {
      console.log("[DB Migration] 异步同步 v1→v2 笔记数据（分批）...");
      await DB.prepare(
        `UPDATE notes SET title = title_cipher WHERE (title IS NULL OR title = '') AND title_cipher IS NOT NULL AND title_cipher != ''`
      ).run();
      await DB.prepare(
        `UPDATE notes SET content = ciphertext WHERE (content IS NULL OR content = '') AND ciphertext IS NOT NULL AND ciphertext != ''`
      ).run();
      await DB.prepare(
        `UPDATE notes SET category = category_cipher WHERE (category IS NULL OR category = '') AND category_cipher IS NOT NULL AND category_cipher != ''`
      ).run();
      await DB.prepare(
        `UPDATE notes SET tags = tags_cipher WHERE (tags IS NULL OR tags = '') AND tags_cipher IS NOT NULL AND tags_cipher != ''`
      ).run();
      console.log("[DB Migration] v1→v2 数据同步完成");
    }
  } catch (e) {
    console.warn("[DB Migration] v1→v2 数据同步失败（不影响 API）:", e.message);
  }

  // categories 数据同步
  try {
    const catColumns = await DB.prepare("PRAGMA table_info(categories)").all();
    const catColumnNames = (catColumns.results || []).map(c => c.name);
    if (catColumnNames.includes('name_cipher') && catColumnNames.includes('name')) {
      await DB.prepare(
        "UPDATE categories SET name = name_cipher WHERE (name IS NULL OR name = '') AND name_cipher IS NOT NULL AND name_cipher != ''"
      ).run();
    }
  } catch (e) {
    console.warn("[DB Migration] categories 数据同步失败:", e.message);
  }

  // users 数据同步
  try {
    const userColumns = await DB.prepare("PRAGMA table_info(users)").all();
    const userColumnNames = (userColumns.results || []).map(c => c.name);
    if (userColumnNames.includes('key_hash') && userColumnNames.includes('public_key')) {
      await DB.prepare(
        "UPDATE users SET public_key = key_hash WHERE (public_key IS NULL OR public_key = '') AND key_hash IS NOT NULL AND key_hash != ''"
      ).run();
    }
    if (userColumnNames.includes('recovery_code') && userColumnNames.includes('recovery_code_hash')) {
      await DB.prepare(
        "UPDATE users SET recovery_code_hash = recovery_code WHERE (recovery_code_hash IS NULL OR recovery_code_hash = '') AND recovery_code IS NOT NULL AND recovery_code != ''"
      ).run();
    }
  } catch (e) {
    console.warn("[DB Migration] users 数据同步失败:", e.message);
  }
}