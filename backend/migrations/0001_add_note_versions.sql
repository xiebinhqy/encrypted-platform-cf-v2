-- 0001_add_note_versions.sql
-- 笔记版本历史表
-- 用于存储笔记的历史版本，支持版本对比和恢复

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

-- 索引：按笔记ID查询版本历史
CREATE INDEX IF NOT EXISTS idx_note_versions_note_id ON note_versions(note_id, user_id);

-- 索引：按创建时间排序
CREATE INDEX IF NOT EXISTS idx_note_versions_created ON note_versions(note_id, created_at DESC);