# 线上测试环境故障修复计划

## 错误分析

从浏览器Network日志可以看到两个主要问题：

### 问题1：Service Worker返回503
```
login	503	fetch	user.api.js:17	(ServiceWorker)
```
Service Worker (`sw.js`) 拦截了 API 请求，转发给后端时连接失败，catch 返回 503。

### 问题2：ERR_CONNECTION_CLOSED
```
login	(failed)net::ERR_CONNECTION_CLOSED	fetch	sw.js:60
rum	(failed)net::ERR_CONNECTION_CLOSED		…
```
Service Worker 的 `fetch(event.request)` 到 Cloudflare 边缘网络时连接被关闭，说明后端 Worker 处理超时或崩溃。

### 根本原因

**每次冷启动时 `ensureMigrations()` 执行了完整的数据库迁移流程（CREATE TABLE、ALTER TABLE、CREATE INDEX 等大量 DDL 操作），耗时过长导致 Worker 超时，连接被 Cloudflare 关闭。** Service Worker 捕获到这个错误，返回 503。

## 修复方案

1. **`frontend/_worker.js`** - API 代理增加超时控制和错误处理
2. **`frontend/sw.js`** - Service Worker API 请求增加重试机制，不直接返回 503
3. **`backend/src/config/database.js`** - 迁移逻辑优化，减少冷启动时的 DDL 操作量
4. **`backend/src/index.js`** - CSP connect-src 添加测试环境域名