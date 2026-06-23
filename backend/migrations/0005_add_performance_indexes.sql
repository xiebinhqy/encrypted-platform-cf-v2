-- Migration 0005: 性能索引优化
-- 目标：500+ 笔记下 API 响应时间 < 500ms
--
-- 索引说明：
-- - D1 (SQLite) 中复合索引遵循最左前缀原则
-- - 查询模式: WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC
--   → 最佳索引: (user_id, deleted_at, updated_at DESC)
-- - 查询模式: WHERE user_id = ? AND is_hot = 1
--   → 索引: (user_id, is_hot)

-- ==============================================
-- 1. 笔记表（notes）索引
-- ==============================================

-- ⚡ 核心查询索引：笔记列表（按用户 + 软删除状态 + 更新时间排序）
-- 覆盖查询: WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC
CREATE INDEX IF NOT EXISTS idx_notes_user_deleted_updated ON notes(user_id, deleted_at, updated_at DESC);

-- 热笔记查询索引（hot-cold service 使用 is_hot = 1 筛选）
-- 覆盖查询: WHERE user_id = ? AND is_hot = 1
CREATE INDEX IF NOT EXISTS idx_notes_user_is_hot ON notes(user_id, is_hot);

-- 分类筛选索引（支持按分类过滤笔记）
-- 覆盖查询: WHERE user_id = ? AND category = ?
CREATE INDEX IF NOT EXISTS idx_notes_user_category ON notes(user_id, category);

-- 软删除回收站查询索引
-- 覆盖查询: WHERE user_id = ? AND deleted_at IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at);

-- ==============================================
-- 2. 事件日志表（event_logs）索引
-- ==============================================

-- 事件日志查询（按用户 + 时间倒序）
-- 覆盖查询: WHERE user_id = ? ORDER BY time DESC
CREATE INDEX IF NOT EXISTS idx_event_logs_user_time ON event_logs(user_id, time DESC);

-- ==============================================
-- 3. 用户表（users）索引
-- ==============================================

-- 恢复码查询索引（用户恢复流程使用）
-- 覆盖查询: WHERE recovery_code_hash = ?
CREATE INDEX IF NOT EXISTS idx_users_recovery_code ON users(recovery_code_hash);

-- ==============================================
-- 4. 分享表（shares）索引
-- ==============================================

-- 用户分享列表查询
-- 覆盖查询: WHERE user_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_shares_user_created ON shares(user_id, created_at DESC);