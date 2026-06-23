# BUG 日志

## 已修复

### 2026-06-21: v1 旧表兼容问题（title_cipher/name_cipher NOT NULL 约束失败 + 笔记列表缓存不同步）

**现象**：
1. 创建分类失败：`NULL constraint failed: categories.name_cipher`
2. 创建笔记成功（无 500）但刷新后笔记列表不显示新笔记
3. （上一轮）创建笔记失败：`NULL constraint failed: notes.title_cipher`

**根因分析**：

#### 问题 1：notes.title_cipher NULL 约束失败
staging 数据库源自 v1 表结构（`create_v1_tables_staging.sql`），其中：
```sql
title_cipher TEXT NOT NULL,
ciphertext TEXT NOT NULL
```
自动迁移（`database.js`）通过 `ALTER TABLE` 添加了新列 `title`/`content`，但**保留了旧列 `title_cipher`/`ciphertext` 的 `NOT NULL` 约束**。

而 `note.service.js` 的 `createNote`/`updateNote` 只写入新列（`title`/`content`），未写入旧列，导致 `title_cipher` 为 NULL → 违反 NOT NULL 约束。

**修复**：在笔记 INSERT 和 UPDATE SQL 中同时写入旧列名（`title_cipher`/`ciphertext`/`category_cipher`/`tags_cipher`），值相同。

#### 问题 2：categories.name_cipher NULL 约束失败
与问题 1 相同的原因——v1 旧表有 `name_cipher TEXT NOT NULL`，但 `category.service.js` 的 INSERT/UPDATE 只写 `name` 列。

**修复**：在分类 INSERT 和 UPDATE SQL 中同时写入 `name_cipher` 列。

#### 问题 3：笔记保存成功但列表不显示
`createNote` 中调用 `rebuildNotesListCache(env, userId).catch(() => {})` 使用 `.catch()` 异步执行，没有 `await`。导致：
- API 响应已返回"创建成功"给前端
- 但列表缓存尚未重建完成
- 前端紧接着请求列表时，KV 缓存仍是旧数据（没有新笔记）
- 重复刷新也看不到，因为 KV 缓存 TTL 为 30 天

**修复**：改为 `await rebuildNotesListCache(env, userId)`，确保缓存重建完成后再返回响应。

#### 问题 4：兼容路由（v2.routes.js）同样存在上述问题
`compatSaveNote` 和 `compatSaveCategory` 中的直接 SQL 操作也使用新列名，经典版前端（走 v1 兼容路由）也会触发相同错误。

**修复**：同步修复 `v2.routes.js` 中所有 notes/categories 的 INSERT/UPDATE SQL。

**修复的文件**：
1. `backend/src/services/note.service.js` — createNote/updateNote 补充旧列 + await 重建缓存
2. `backend/src/services/category.service.js` — createCategory/updateCategory 补充旧列
3. `backend/src/routes/v2.routes.js` — compatSaveNote/compatSaveCategory 补充旧列

**验证**：部署到 staging 环境后：
- 新建笔记应成功保存并立即显示在列表
- 新建分类应成功
- 刷新页面后笔记和分类仍正常显示

---

### 2026-06-20: 创建笔记返回 500 错误

**现象**：测试环境（staging）新建笔记点击保存后，弹出"创建笔记失败：创建笔记失败，已保存到草稿箱"，Network 显示 `notes 500 fetch`。

**根因分析**：

#### 问题 1：迁移阻塞（核心原因）
`backend/src/config/database.js` 中的 `_runMigrations()` 将**所有迁移步骤串联执行**，且**任一步骤失败后不标记迁移完成**，导致：
- 第一次冷启动时，耗时的 `v1→v2` 数据同步 SQL（`UPDATE notes SET title = title_cipher WHERE ...`）在笔记量大时超时
- 或 `shares` 表不存在导致索引创建失败（v13 修复过但仍有类似问题）
- 迁移失败后 `_migrationCache` 未设置，`KV 迁移版本`未写入
- **每次 API 请求都会重试同一失败的迁移** → 每次都失败 → 永远返回 500
- 用户只能不断看到 `"创建笔记失败"`，因为迁移从未成功完成

**修复**：
- 拆分迁移为三阶段：核心建表（必须成功）→ 列兼容（必须成功）→ 索引/数据同步（可失败异步执行）
- 在阶段二完成后立即标记迁移版本，后续请求跳过迁移
- 可选步骤移到 `_runOptionalMigrations()` 异步执行，catch 静默失败
- 即使核心迁移也失败，仍在 catch 中标记迁移版本（避免死循环）
- 版本号从 v13 递增到 v14

#### 问题 2：错误日志不详细
`handleCreateNote()` 的 catch 只返回 `jsonError("创建笔记失败", 500, env)`，**没有任何 console.error**，导致无法从 Cloudflare 日志中排查具体错误。

**修复**：
```javascript
console.error("[NOTE ROUTE] 创建笔记失败:", error.message, error.stack);
// 区分外键约束、唯一约束等错误类型
```

#### 问题 3：CORS 缺少 Authorization 头
前端发送 JWT Token 使用 `Authorization: Bearer <token>` 头，但 `getCorsHeaders()` 的 `Access-Control-Allow-Headers` 中未包含 `Authorization`。
- 浏览器 CORS 预检（OPTIONS）返回的允许头列表中没有 `Authorization`
- 浏览器的安全策略会阻止带 `Authorization` 头的实际请求
- 虽然同源请求不受 CORS 限制，但 Service Worker 拦截并转发 API 请求时可能触发跨域行为

**修复**：在 constants.js 的 CORS 头中增加 `Authorization`：
```javascript
"Access-Control-Allow-Headers": "Content-Type, X-User-Id, Authorization",
"Access-Control-Allow-Credentials": "true",
"Access-Control-Max-Age": "86400"
```

#### 问题 4：全局错误隐藏
`index.js` 的全局 catch 在生产环境下隐藏详细错误为 `"服务器内部错误"`，但 staging 环境也应显示详细错误以便排查。

**修复**：增加 `isDev` 判断，development 和 staging 环境都显示详细错误信息。

**修复的文件**：
1. `backend/src/config/database.js` — 迁移拆分+阻塞修复
2. `backend/src/routes/note.routes.js` — 错误日志+参数校验
3. `backend/src/config/constants.js` — CORS 头补充
4. `backend/src/index.js` — 全局错误处理

**验证**：部署到 staging 环境后，冷启动首次迁移应在 10s 内完成，API 恢复正常。后续启动跳过迁移，响应正常。

---

### 2026-06-20: 生产环境 NOTES_CACHE 和 NOTES_BACKUP 使用同一 KV 命名空间

**现象**：生产环境 `wrangler.toml` 中 `NOTES_BACKUP` 和 `NOTES_CACHE` 的 KV ID 均为 `cfd23ee25c2b4769a8331def0296f1d9`。

**影响**：缓存操作和备份操作会互相覆盖数据，可能导致笔记数据丢失或缓存异常。

**修复建议**：在生产环境申请独立的 KV 命名空间用于 `NOTES_CACHE`，与 `NOTES_BACKUP` 分离。

---

## 排查中

- [ ] 暂无