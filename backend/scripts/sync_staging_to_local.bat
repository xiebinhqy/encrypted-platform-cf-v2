@echo off
chcp 65001 >nul
title 同步 Staging 数据到本地
echo ============================================
echo  🚀 从 Staging 环境同步数据到本地开发环境
echo ============================================
echo.

set BACKEND_DIR=g:\hexol-blog\encrypted-notes-v2\backend
cd /d %BACKEND_DIR%

echo [1/6] 创建导出目录...
if not exist staging-data mkdir staging-data
if not exist staging-data\kv mkdir staging-data\kv

echo [2/6] 导出 D1 数据库表...
echo   → 导出 users 表...
npx wrangler d1 execute staging-notes-db --command="SELECT * FROM users" --env staging --remote > staging-data\users.json 2>&1
echo   → 导出 categories 表...
npx wrangler d1 execute staging-notes-db --command="SELECT * FROM categories" --env staging --remote > staging-data\categories.json 2>&1
echo   → 导出 notes 表...
npx wrangler d1 execute staging-notes-db --command="SELECT * FROM notes" --env staging --remote > staging-data\notes.json 2>&1
echo   → 导出 user_settings 表...
npx wrangler d1 execute staging-notes-db --command="SELECT * FROM user_settings" --env staging --remote > staging-data\user_settings.json 2>&1
echo   → 导出 note_versions 表...
npx wrangler d1 execute staging-notes-db --command="SELECT * FROM note_versions" --env staging --remote > staging-data\note_versions.json 2>&1
echo   → 导出 shares 表...
npx wrangler d1 execute staging-notes-db --command="SELECT * FROM shares" --env staging --remote > staging-data\shares.json 2>&1
echo   → 导出 event_logs 表...
npx wrangler d1 execute staging-notes-db --command="SELECT * FROM event_logs" --env staging --remote > staging-data\event_logs.json 2>&1

echo [3/6] 重置本地 D1 数据库...
echo   正在删除旧数据库...
npx wrangler d1 delete staging-notes-db --skip-confirmation 2>nul
echo   正在创建新数据库（使用备份数据库 ID 加速）...
npx wrangler d1 create staging-notes-db 2>&1 | findstr /C:"database_id"

echo [4/6] 生成本地导入 SQL...
node scripts\generate_insert_sql.cjs

echo [5/6] 导入数据到本地 D1...
if exist staging-data\import_local.sql (
  npx wrangler d1 execute staging-notes-db --file=staging-data\import_local.sql --local
  echo   ✅ D1 数据导入完成
) else (
  echo   ⚠️ 未生成导入 SQL，跳过
)

echo [6/6] 同步 KV 数据...
REM 目前暂不下载 KV 数据，本地开发直接连接远程 KV

echo.
echo ============================================
echo  ✅ 数据同步完成！
echo  运行前端: cd frontend ^&^& npm run dev
echo  运行后端: cd backend ^&^& npm run dev
echo ============================================
pause