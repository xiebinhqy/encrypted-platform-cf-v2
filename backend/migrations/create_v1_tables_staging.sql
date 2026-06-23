-- 创建与生产环境 v1 同款表结构
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    key_hash TEXT UNIQUE NOT NULL,
    recovery_code TEXT,
    recovery_used INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    verify_token TEXT,
    is_active INTEGER DEFAULT 1,
    email TEXT
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name_cipher TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title_cipher TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    category_cipher TEXT,
    tags_cipher TEXT,
    revision_count INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    share_key TEXT UNIQUE NOT NULL,
    max_views INTEGER,
    current_views INTEGER DEFAULT 0,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (note_id) REFERENCES notes(id),
    FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS system_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    level TEXT DEFAULT 'INFO',
    ip TEXT,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sync_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    note_id TEXT,
    action TEXT NOT NULL,
    client_timestamp INTEGER NOT NULL,
    server_timestamp INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    details TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_shares_note_id ON shares(note_id);
CREATE INDEX IF NOT EXISTS idx_shares_user_id ON shares(owner_id);