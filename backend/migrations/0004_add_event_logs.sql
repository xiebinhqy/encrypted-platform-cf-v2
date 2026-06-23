-- 创建事件日志表
-- 用于持久化用户操作事件记录（KV 存近1个月，DB 存更早的）

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

-- 索引
CREATE INDEX IF NOT EXISTS idx_event_logs_user_id ON event_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_time ON event_logs(time);
CREATE INDEX IF NOT EXISTS idx_event_logs_user_time ON event_logs(user_id, time);