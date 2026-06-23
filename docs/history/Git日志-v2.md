# 📜 Git 版本日志（v2 存档）

> **存档时间：** 2026-06-23
> **此文件为 v2 历史存档，存档前内容。**
> **当前状态请查看 docs/Git日志.md**

---

## 2026-06-17

| Commit | 说明 |
|--------|------|
| `f939a7c` (HEAD -> dev) | **fix: user.routes.js login 401/404 降级为 console.log + 更新阶段清单/BUG日志**<br>• user.routes.js：login 401/404 降级 console.log<br>• 文档同步更新 |

## 2026-06-14

| Commit | 说明 |
|--------|------|
| `28ee54e` | **fix: login 401 no longer shows as ERROR + update BUG log with BUG-010/011**<br>• login.js：401/404 改为 console.log（非 ERROR）<br>• BUG日志新增 BUG-010 sw.js 503、BUG-011 新用户 ERROR |
| `d2fecd4` | **docs: add git version log for commit history tracking** |
| `23bd4e6` | **fix: v4.0.0 user service column unification + recovery code modal flow fix**<br>• 删除 detectSchema v1/v2 检测，统一 public_key 列<br>• login.js 注册后先显示恢复码，用户确认后再跳转<br>• _showRecoveryCodeModal 支持 onConfirm 回调 |
| `a23ee0b` | **fix: v10 - create core tables before migration, support empty DB startup**<br>• 先 CREATE TABLE IF NOT EXISTS 再检查旧列<br>• 解决空数据库 "no such table" 错误<br>• 兼容旧版 title_cipher → title 迁移 |
| `49b94ef` | **fix: add categories.name migration + bump to v9** |
| `15dd2e7` | **feat: v4.0.0 - unify column names, remove auto-detection, fix BUG-008 root cause**<br>• note.service.js 删除自动列名检测<br>• compat.routes.js 删除 v1/v2 分支逻辑<br>• 统一使用 title/content/category/tags 列 |
| `0d93a41` | **fix: add fallback for v2->v1 column mismatch in decryption**<br>• _decryptOneNote 中 title→title_cipher 兼容 |
| `03cbd5c` | **fix: BUG-008 - add id field to noteBody for createNoteV2** |
| `444ca4e` | **docs: add bug tracking log with all 8 bugs recorded** |
| `65144a1` | **docs: detailed execution plan with all 3 phases and task breakdown** |
| `40e7fee` | **fix: initLogManagerOverride call path - EventLogger vs DashboardUpdater**<br>• DashboardUpdater→EventLogger |
| `d88d4f4` | **fix: createNote missing id/tags, version table schema migration** |
| `68f2cf8` | **fix: phase1 - fix decrypt crash, lazy content loading, v2 save API**<br>• 解密加固 + 按需加载 + v2 API 基础 |

## 更早提交

| Commit | 说明 |
|--------|------|
| `b103e89` (origin/dev) | fix: revert paginated API to v1 endpoint to fix 500 error |
| `2062c1d` | Revert "perf: replace Tailwind CDN with precompiled static CSS (22KB vs 300KB)" |
| `5d2c884` | perf: replace Tailwind CDN with precompiled static CSS (22KB vs 300KB) |
| `1917950` | Revert "perf: replace Tailwind CDN with precompiled static CSS (29KB vs 300KB)" |
| `9f9fe57` | perf: add Service Worker for static asset caching (instant repeat load) |
| `3fe9ade` | perf: replace Tailwind CDN with precompiled static CSS (29KB vs 300KB) |
| `b369697` | perf: switch to paginated API for note loading |
| `3b05dea` | perf: loading speed optimization - chart lazy init + parallel decrypt + key cache |
| `12ea6b5` | feat: v2.1.0 - 笔记版本历史功能与系统优化 |
| `5a6d5f8` | fix: 修复分类显示、创建/编辑失败、版本历史、回收站互通等BUG |
| `d90f8cf` (origin/master, master) | init: initial commit - encrypted notes platform v2 |

---

> **用法：** 需要回退到某个版本时，执行：
> ```
> git log --oneline          # 看所有 commit
> git checkout <commit-hash>  # 切换到指定版本
> git checkout dev            # 切回最新版本