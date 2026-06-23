-- 0006_add_recovery_code_used.sql
-- 为三层密码体系增加支持字段
-- 1. recovery_code_used: 恢复码是否已被使用（一次性使用）
-- 2. failed_attempts: 登录失败尝试次数

ALTER TABLE users ADD COLUMN recovery_code_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN failed_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN last_failed_attempt DATETIME;