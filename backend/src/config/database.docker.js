// database.docker.js v1.0.0 — Docker 版数据库配置
/**
 * 替代 Cloudflare Workers D1 binding 的本地 SQLite 数据库
 * 使用 better-sqlite3 实现同步操作，自动执行迁移脚本
 * 
 * 与 database.js（Workers 版）的区别：
 * - Workers 版：异步 D1 API + KV 缓存迁移版本
 * - Docker 版：同步 better-sqlite3 + 文件系统迁移
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');
const DEFAULT_DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/notes.db');

class DockerDatabase {
  /**
   * @param {string} dbPath - SQLite 数据库文件路径
   */
  constructor(dbPath) {
    this.dbPath = dbPath || DEFAULT_DB_PATH;
    
    // 确保数据目录存在
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    console.log(`📦 数据库路径: ${this.dbPath}`);
  }

  /**
   * 初始化数据库连接并执行迁移
   */
  init() {
    this.db = new Database(this.dbPath);
    
    // 启用 WAL 模式 — 提升并发性能
    this.db.pragma('journal_mode = WAL');
    
    // 启用外键约束
    this.db.pragma('foreign_keys = ON');
    
    // 设置忙等待超时（5秒）
    this.db.pragma('busy_timeout = 5000');
    
    // 同步模式：NORMAL 平衡性能与安全性
    this.db.pragma('synchronous = NORMAL');
    
    // 缓存大小：64MB
    this.db.pragma('cache_size = -64000');
    
    console.log('✅ 数据库连接已建立');
    
    return this;
  }

  /**
   * 执行迁移脚本
   */
  runMigrations() {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.warn('⚠️ 迁移目录不存在:', MIGRATIONS_DIR);
      return;
    }
    
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    if (files.length === 0) {
      console.log('ℹ️ 没有找到迁移脚本');
      return;
    }
    
    console.log(`📋 开始执行 ${files.length} 个迁移脚本...`);
    
    for (const file of files) {
      try {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
        // 分割多个 SQL 语句并逐个执行
        const statements = sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);
        
        for (const stmt of statements) {
          this.db.exec(stmt + ';');
        }
        console.log(`  ✅ ${file}`);
      } catch (err) {
        console.warn(`  ⚠️  ${file} 跳过（可能已存在）: ${err.message}`);
      }
    }
    
    console.log('🎉 所有迁移脚本执行完毕');
  }

  /**
   * 创建核心表（安全兜底：如果迁移脚本未创建）
   */
  ensureCoreTables() {
    // 复制 database.js 中的 CREATE TABLE IF NOT EXISTS 逻辑
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        public_key TEXT NOT NULL UNIQUE,
        recovery_code_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        color TEXT DEFAULT '',
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      
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
      );
      
      CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        share_key TEXT NOT NULL UNIQUE,
        max_views INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (note_id) REFERENCES notes(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      
      CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        settings TEXT NOT NULL DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      );
      
      CREATE TABLE IF NOT EXISTS note_versions (
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
      );
      
      CREATE TABLE IF NOT EXISTS event_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        time TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        operator TEXT DEFAULT '管理员',
        status TEXT DEFAULT '成功',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('✅ 核心表已确保存在');
  }

  /**
   * 创建索引
   */
  ensureIndexes() {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_notes_last_access ON notes(last_access_at);
      CREATE INDEX IF NOT EXISTS idx_notes_user_deleted_updated ON notes(user_id, deleted_at, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id, id);
      CREATE INDEX IF NOT EXISTS idx_notes_user_is_hot ON notes(user_id, is_hot);
      CREATE INDEX IF NOT EXISTS idx_notes_user_category ON notes(user_id, category);
      CREATE INDEX IF NOT EXISTS idx_users_recovery_code ON users(recovery_code_hash);
      CREATE INDEX IF NOT EXISTS idx_shares_user_created ON shares(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_event_logs_user_id ON event_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_event_logs_time ON event_logs(time);
      CREATE INDEX IF NOT EXISTS idx_event_logs_user_time ON event_logs(user_id, time);
    `);
    
    console.log('✅ 索引已确保存在');
  }

  /**
   * 关闭数据库连接
   */
  close() {
    if (this.db) {
      this.db.close();
      console.log('👋 数据库连接已关闭');
    }
  }

  // ========== D1 兼容接口 ==========

  /**
   * 兼容 D1 的 prepare 方法
   * @param {string} sql - SQL 语句
   * @returns {DockerStatement} 语句对象
   */
  prepare(sql) {
    return new DockerStatement(this.db, sql);
  }

  /**
   * 兼容 D1 的 exec 方法
   * @param {string} sql - SQL 语句
   */
  exec(sql) {
    return this.db.exec(sql);
  }
}

/**
 * D1 兼容的 Statement 包装类
 * 使 better-sqlite3 的 API 与 D1 的 API 兼容
 */
class DockerStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this._binds = [];
  }

  bind(...args) {
    this._binds = args;
    return this;
  }

  /**
   * 运行（插入/更新/删除）
   * @returns {{ success: boolean, meta: { changes: number, last_row_id: number } }}
   */
  run() {
    try {
      const stmt = this.db.prepare(this.sql);
      const result = stmt.run(...this._binds);
      return {
        success: true,
        meta: {
          changes: result.changes,
          last_row_id: result.lastInsertRowid,
        },
      };
    } catch (err) {
      console.error('[DB Error]', this.sql, this._binds, err.message);
      throw err;
    }
  }

  /**
   * 查询首行
   * @returns {Object|null}
   */
  first() {
    try {
      const stmt = this.db.prepare(this.sql);
      return stmt.get(...this._binds) || null;
    } catch (err) {
      console.error('[DB Error]', this.sql, this._binds, err.message);
      throw err;
    }
  }

  /**
   * 查询所有行
   * @returns {{ results: Array }}
   */
  all() {
    try {
      const stmt = this.db.prepare(this.sql);
      const results = stmt.all(...this._binds);
      return { results };
    } catch (err) {
      console.error('[DB Error]', this.sql, this._binds, err.message);
      throw err;
    }
  }

  /**
   * 原始运行（直接执行，不返回结果）
   */
  raw() {
    try {
      const stmt = this.db.prepare(this.sql);
      return stmt.run(...this._binds);
    } catch (err) {
      console.error('[DB Error]', this.sql, this._binds, err.message);
      throw err;
    }
  }
}

// ========== 单例 ==========
let instance = null;

/**
 * 初始化数据库（单例模式）
 * @param {string} dbPath - 可选的数据库路径
 * @returns {DockerDatabase}
 */
async function initDatabase(dbPath) {
  if (instance) return instance;
  
  const dockerDb = new DockerDatabase(dbPath);
  dockerDb.init();
  
  // 按顺序初始化
  dockerDb.ensureCoreTables();
  dockerDb.runMigrations();
  dockerDb.ensureIndexes();
  
  instance = dockerDb;
  return dockerDb;
}

module.exports = { initDatabase, DockerDatabase, DockerStatement };