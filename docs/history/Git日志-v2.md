# 📜 Git 版本日志

> 每次 Git 提交后自动记录在此，方便回溯历史版本。
> 如需回退到某个版本，执行 `git checkout <commit-hash>` 即可。

---

## 2026-06-14

| Commit | 说明 |
|--------|------|
| `28ee54e` | **fix: login 401 不再显示 ERROR + 更新 BUG 日志**<br>• login.js：401/404 改为 console.log（非 ERROR）<br>• BUG日志新增 BUG-010 sw.js 503、BUG-011 新用户 ERROR |
| `23bd4e6` | **user.service 列名统一 + 恢复码弹窗流程修复**<br>• 删除 detectSchema v1/v2 检测，统一 public_key 列<br>• login.js 注册后先显示恢复码，用户确认后再跳转<br>• _showRecoveryCodeModal 支持 onConfirm 回调 |
| `a23ee0b` | **database.js v10：首次启动自动创建核心表**<br>• 先 CREATE TABLE IF NOT EXISTS 再检查旧列<br>• 解决空数据库 "no such table" 错误<br>• 兼容旧版 title_cipher → title 迁移 |
| `49b94ef` | **database.js v9：增加 categories.name 自动迁移** |
| `15dd2e7` | **v4.0.0 列名统一 — 核心改动**<br>• note.service.js 删除自动列名检测<br>• compat.routes.js 删除 v1/v2 分支逻辑<br>• 统一使用 title/content/category/tags 列 |
| `0d93a41` | **BUG-008: 前端解密 fallback**<br>• _decryptOneNote 中 title→title_cipher 兼容 |
| `03cbd5c` | **BUG-008: createNoteV2 body 添加 id 字段** |
| `444ca4e` | **docs: BUG日志.md 首次创建** |
| `65144a1` | **docs: 执行计划.md 首次创建** |
| `40e7fee` | **BUG-007: initLogManagerOverride 调用路径修复**<br>• DashboardUpdater→EventLogger |
| `d88d4f4` | **BUG-006: createNote 修复 + BUG-005: 版本历史表迁移** |
| `68f2cf8` | **阶段一首批修复**<br>• 解密加固 + 按需加载 + v2 API 基础 |

---

> **用法：** 需要回退到某个版本时，执行：
> ```
> git log --oneline          # 看所有 commit
> git checkout <commit-hash>  # 切换到指定版本
> git checkout dev            # 切回最新版本