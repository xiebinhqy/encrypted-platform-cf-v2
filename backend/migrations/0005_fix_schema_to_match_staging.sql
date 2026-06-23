-- 修正本地数据库 schema 以匹配远程 staging 数据库
-- 直接创建正确的表结构，不需要数据迁移（数据从导出的 SQL 导入）

-- ==============================================
-- 1. 删除旧表（如果存在）
-- ==============================================
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS note_versions;
DROP TABLE IF EXISTS shares;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;

-- ==============================================
-- 2. 创建 users 表（匹配远程 staging 结构）
-- ==============================================
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL,
    recovery_code TEXT NOT NULL,
    recovery_used INTEGER DEFAULT 0,
    created_at INTEGER,
    verify_token TEXT,
    is_active INTEGER DEFAULT 1,
    email TEXT
);

-- ==============================================
-- 3. 创建 categories 表（匹配远程 staging 结构）
-- ==============================================
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name_cipher TEXT NOT NULL,
    created_at INTEGER,
    color TEXT DEFAULT ''
);

-- ==============================================
-- 4. 创建 notes 表（匹配远程 staging 结构）
-- ==============================================
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title_cipher TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    category_cipher TEXT DEFAULT '',
    tags_cipher TEXT DEFAULT '',
    revision_count INTEGER DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER,
    last_access_at DATETIME DEFAULT NULL,
    is_hot INTEGER DEFAULT 1,
    deleted_at DATETIME DEFAULT NULL,
    tags TEXT DEFAULT ''
);

-- ==============================================
-- 5. 创建 shares 表（匹配远程 staging 结构）
-- ==============================================
CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    share_key TEXT,
    max_views INTEGER DEFAULT 0,
    current_views INTEGER DEFAULT 0,
    expires_at INTEGER,
    created_at INTEGER
);

-- ==============================================
-- 6. 创建 note_versions 表
-- ==============================================
CREATE TABLE IF NOT EXISTS note_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    title_cipher TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    category_cipher TEXT DEFAULT '',
    tags_cipher TEXT DEFAULT '',
    created_at INTEGER,
    FOREIGN KEY (note_id) REFERENCES notes(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==============================================
-- 7. 创建 user_settings 表
-- ==============================================
CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    settings_json TEXT DEFAULT '{}',
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==============================================
-- 8. 创建索引
-- ==============================================
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_shares_note_id ON shares(note_id);
CREATE INDEX IF NOT EXISTS idx_shares_owner_id ON shares(owner_id);
CREATE INDEX IF NOT EXISTS idx_note_versions_note_id ON note_versions(note_id);
CREATE INDEX IF NOT EXISTS idx_note_versions_user_id ON note_versions(user_id);