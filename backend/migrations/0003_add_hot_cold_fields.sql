-- 0003_add_hot_cold_fields.sql
-- 冷热数据分离 - 为 notes 表增加热数据标记和最后访问时间字段
-- 用于支持 KV 缓存 + D1 混合存储架构

-- 1. 新增字段：最后访问时间（用于冷热判定）
ALTER TABLE notes ADD COLUMN last_access_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- 2. 新增字段：热数据标记（0=冷数据，1=热数据）
ALTER TABLE notes ADD COLUMN is_hot INTEGER DEFAULT 1;

-- 3. 创建最后访问时间索引（用于冷热升降级 cron job 扫描）
CREATE INDEX IF NOT EXISTS idx_notes_last_access ON notes(last_access_at);

-- 注意：idx_notes_deleted_at 已在 add_deleted_at_to_notes.sql 中创建，不再重复

-- 4. 将现有所有笔记初始化为热数据（上线后 cron job 会自动降级）
UPDATE notes SET is_hot = 1, last_access_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL;