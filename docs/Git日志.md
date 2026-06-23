# 📜 Git 版本日志

> 每次 Git 提交后自动记录在此，方便回溯历史版本。
> 如需回退到某个版本，执行 `git checkout <commit-hash>` 即可。

---

## 2026-06-23

| Commit | 说明 |
|--------|------|
| `7a31be9` (HEAD -> dev, master) | **fix: 工作流触发分支改为 master+dev，增加文件验证步骤**<br>• CI/CD 触发条件适配<br>• 构建前验证关键文件存在 |
| `b682cd3` | **fix: 添加 backend/package.json 用于 Docker 构建**<br>• 新增 package.json 修复 Docker 构建失败 |
| `d2e4007` | **fix: .gitignore 排除 backend/package.json 导致 Docker 构建失败**<br>• 修复 .gitignore 配置 |
| `e0ee4d4` | **fix: Dockerfile 在根目录，移除 PROJECT_DIR 前缀**<br>• 修正 Dockerfile 路径配置 |
| `efab0ed` | **feat: Docker 自动构建 + GitHub Actions 支持**<br>• 新增 Dockerfile, docker-compose.yml, start-docker.bat<br>• 新增 .github/workflows/docker-build.yml CI/CD<br>• 新增 backend/server.js Express入口<br>• 新增 backend/package.json, backend/docker/route-adapter.js<br>• 新增 backend/src/config/database.docker.js<br>• 新增 scripts/migrate-from-d1.js |

## 2026-06-17

| Commit | 说明 |
|--------|------|
| `f939a7c` (origin/dev, origin/master) | **fix: user.routes.js login 401/404 降级为 console.log + 更新阶段清单/BUG日志**<br>• user.routes.js：login 401/404 降级 console.log<br>• 文档同步更新 |

## 2026-06-14

| Commit | 说明 |
|--------|------|
| `28ee54e` | **fix: login 401 no longer shows as ERROR + update BUG log with BUG-010/011** |
| `d2fecd4` | **docs: add git version log for commit history tracking** |
| `23bd4e6` | **fix: v4.0.0 user service column unification + recovery code modal flow fix** |
| `a23ee0b` | **fix: v10 - create core tables before migration, support empty DB startup** |
| `49b94ef` | **fix: add categories.name migration + bump to v9** |
| `15dd2e7` | **feat: v4.0.0 - unify column names, remove auto-detection, fix BUG-008 root cause** |
| `0d93a41` | **fix: add fallback for v2->v1 column mismatch in decryption** |
| `03cbd5c` | **fix: BUG-008 - add id field to noteBody for createNoteV2** |
| `444ca4e` | **docs: add bug tracking log with all 8 bugs recorded** |
| `65144a1` | **docs: detailed execution plan with all 3 phases and task breakdown** |
| `40e7fee` | **fix: initLogManagerOverride call path - EventLogger vs DashboardUpdater** |
| `d88d4f4` | **fix: createNote missing id/tags, version table schema migration** |
| `68f2cf8` | **fix: phase1 - fix decrypt crash, lazy content loading, v2 save API** |

## 更早提交

| Commit | 说明 |
|--------|------|
| `b103e89` | fix: revert paginated API to v1 endpoint to fix 500 error |
| `2062c1d` | Revert "perf: replace Tailwind CDN with precompiled static CSS (22KB vs 300KB)" |
| `5d2c884` | perf: replace Tailwind CDN with precompiled static CSS (22KB vs 300KB) |
| `1917950` | Revert "perf: replace Tailwind CDN with precompiled static CSS (29KB vs 300KB)" |
| `9f9fe57` | perf: add Service Worker for static asset caching (instant repeat load) |
| `3fe9ade` | perf: replace Tailwind CDN with precompiled static CSS (29KB vs 300KB) |
| `b369697` | perf: switch to paginated API for note loading |
| `3b05dea` | perf: loading speed optimization - chart lazy init + parallel decrypt + key cache |
| `12ea6b5` | feat: v2.1.0 - 笔记版本历史功能与系统优化 |
| `5a6d5f8` | fix: 修复分类显示、创建/编辑失败、版本历史、回收站互通等BUG |
| `d90f8cf` | init: initial commit - encrypted notes platform v2 |

---

> **用法：** 需要回退到某个版本时，执行：
> ```
> git log --oneline          # 看所有 commit
> git checkout <commit-hash>  # 切换到指定版本
> git checkout dev            # 切回最新版本