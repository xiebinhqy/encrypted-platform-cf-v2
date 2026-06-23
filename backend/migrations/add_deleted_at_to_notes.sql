-- 为 notes 表添加 deleted_at 字段，支持软删除
ALTER TABLE notes ADD COLUMN deleted_at DATETIME DEFAULT NULL;

-- 创建回收站查询索引
CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at);