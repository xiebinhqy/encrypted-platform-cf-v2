#! /usr/bin/env node

/**
 * scripts/migrate-from-d1.js v1.0.0
 * 
 * 用途：将 Cloudflare D1 数据库导出为本地 SQLite
 * 
 * 前置条件：
 *   1. 已通过 wrangler 从 D1 导出数据（JSON 格式）
 *   2. 本地 SQLite 数据库文件已存在（可通过 docker compose 启动生成）
 * 
 * 使用方式：
 *   从 D1 导出数据：
 *     npx wrangler d1 execute notes-db --command="SELECT * FROM notes" --env production --json > d1_export_notes.json
 *     npx wrangler d1 execute notes-db --command="SELECT * FROM categories" --env production --json > d1_export_categories.json
 *     npx wrangler d1 execute notes-db --command="SELECT * FROM users" --env production --json > d1_export_users.json
 *     npx wrangler d1 execute notes-db --command="SELECT * FROM shares" --env production --json > d1_export_shares.json
 *     npx wrangler d1 execute notes-db --command="SELECT * FROM event_logs" --env production --json > d1_export_events.json
 *     npx wrangler d1 execute notes-db --command="SELECT * FROM user_settings" --env production --json > d1_export_settings.json
 *     npx wrangler d1 execute notes-db --command="SELECT * FROM note_versions" --env production --json > d1_export_versions.json
 * 
 *   导入到本地：
 *     node scripts/migrate-from-d1.js
 * 
 *   指定数据库路径：
 *     node scripts/migrate-from-d1.js --db ./backend/data/notes.db
 * 
 *   指定导出文件目录：
 *     node scripts/migrate-from-d1.js --dir ./d1_exports
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// ========== 配置 ==========
const DEFAULT_DB_PATH = path.join(__dirname, '../backend/data/notes.db');
const DEFAULT_EXPORT_DIR = path.join(__dirname, '../d1_exports');

// ========== 解析命令行参数 ==========
const args = process.argv.slice(2);
let dbPath = DEFAULT_DB_PATH;
let exportDir = DEFAULT_EXPORT_DIR;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--db' && args[i + 1]) {
    dbPath = path.resolve(args[i + 1]);
    i++;
  } else if (args[i] === '--dir' && args[i + 1]) {
    exportDir = path.resolve(args[i + 1]);
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
使用方式:
  node scripts/migrate-from-d1.js [选项]

选项:
  --db <路径>     SQLite 数据库路径（默认: ./backend/data/notes.db）
  --dir <目录>    D1 导出文件目录（默认: ./d1_exports）
  --help, -h      显示此帮助信息

前置条件:
  1. 先通过 wrangler 导出 D1 数据到 ${DEFAULT_EXPORT_DIR}/
  2. 确保目标 SQLite 数据库已存在（可先启动 Docker 生成）

导出 D1 数据示例:
  npx wrangler d1 execute notes-db --command="SELECT * FROM notes" --env production --json > ${DEFAULT_EXPORT_DIR.replace(/\\/g, '/')}/notes.json
    `);
    process.exit(0);
  }
}

// ========== 表映射配置 ==========
const TABLES = [
  { name: 'users',      file: 'users.json',         keyMap: {} },
  { name: 'categories', file: 'categories.json',     keyMap: {} },
  { name: 'notes',      file: 'notes.json',          keyMap: {} },
  { name: 'shares',     file: 'shares.json',          keyMap: {} },
  { name: 'event_logs', file: 'event_logs.json',     keyMap: {} },
  { name: 'user_settings', file: 'user_settings.json', keyMap: {} },
  { name: 'note_versions', file: 'note_versions.json', keyMap: {} },
];

// ========== 主逻辑 ==========
let stats = { total: 0, imported: 0, skipped: 0, errors: 0 };

async function migrate() {
  console.log('========================================');
  console.log('  🔐 Encrypted Notes v2');
  console.log('  D1 → 本地 SQLite 数据迁移工具');
  console.log('========================================');
  console.log();

  // 1. 检查导出目录
  if (!fs.existsSync(exportDir)) {
    console.log(`[ℹ] 导出目录不存在: ${exportDir}`);
    console.log(`[ℹ] 正在创建目录...`);
    fs.mkdirSync(exportDir, { recursive: true });
    console.log(`[ℹ] 目录已创建，请将 D1 导出的 JSON 文件放入此目录`);
    console.log();
    console.log(`导出 D1 数据的命令示例:`);
    console.log(`  cd ${path.dirname(exportDir)}`);
    TABLES.forEach(t => {
      console.log(`  npx wrangler d1 execute notes-db --command="SELECT * FROM ${t.name}" --env production --json > ${path.basename(exportDir)}/${t.file}`);
    });
    process.exit(0);
  }

  // 2. 检查数据库
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`[ℹ] 数据库目录已创建: ${dbDir}`);
  }

  console.log(`📂 导出目录: ${exportDir}`);
  console.log(`🗄️  数据库路径: ${dbPath}`);
  console.log();

  // 3. 打开数据库连接
  let db;
  try {
    db = new Database(dbPath);
    db.pragma('journal_mode = OFF');  // 加速批量导入
    db.pragma('synchronous = OFF');
    db.pragma('foreign_keys = OFF');  // 临时关闭外键约束
    console.log('[✓] 数据库连接成功');
  } catch (err) {
    console.error('[✗] 数据库连接失败:', err.message);
    process.exit(1);
  }

  // 4. 逐个表导入
  console.log('开始导入数据...');
  console.log();

  for (const table of TABLES) {
    await importTable(db, table);
  }

  // 5. 恢复数据库设置
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // 6. 输出统计
  console.log('========================================');
  console.log('  导入完成');
  console.log('========================================');
  console.log(`  ✅ 成功导入: ${stats.imported} 条`);
  console.log(`  ⏭️  跳过:     ${stats.skipped} 条`);
  console.log(`  ❌ 错误:     ${stats.errors} 条`);
  console.log(`  📊 总计处理: ${stats.total} 条`);
  console.log();
  console.log(`  🗄️  数据库: ${dbPath}`);
  console.log();

  // 7. 验证数据
  console.log('数据验证:');
  for (const table of TABLES) {
    try {
      const count = db.prepare(`SELECT COUNT(*) as cnt FROM ${table.name}`).get();
      console.log(`  ${table.name.padEnd(15)} ${count.cnt} 行`);
    } catch (err) {
      console.log(`  ${table.name.padEnd(15)} 查询失败: ${err.message}`);
    }
  }

  db.close();
  console.log();
  console.log('✅ 迁移完成！');
}

/**
 * 导入单个表的数据
 */
async function importTable(db, table) {
  const filePath = path.join(exportDir, table.file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`  [⏭️] ${table.name}: 导出文件不存在 (${table.file})`);
    stats.skipped++;
    return;
  }

  let data;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`  [✗] ${table.name}: 文件解析失败 - ${err.message}`);
    stats.errors++;
    return;
  }

  // D1 导出的数据格式可能是 { results: [...] } 或直接数组
  let rows = Array.isArray(data) ? data : (data.results || []);

  if (rows.length === 0) {
    console.log(`  [ℹ] ${table.name}: 无数据`);
    return;
  }

  // 获取表的列信息
  let columns;
  try {
    columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
  } catch (err) {
    console.error(`  [✗] ${table.name}: 表不存在 - ${err.message}`);
    stats.errors++;
    return;
  }

  const columnNames = columns.map(c => c.name);
  
  // 过滤出表中存在的列
  const validColumns = Object.keys(rows[0]).filter(k => columnNames.includes(k));
  
  if (validColumns.length === 0) {
    console.error(`  [✗] ${table.name}: 无有效列可导入`);
    stats.errors++;
    return;
  }

  // 构建 INSERT 语句
  const placeholders = validColumns.map(() => '?').join(', ');
  const insertSql = `INSERT OR REPLACE INTO ${table.name} (${validColumns.join(', ')}) VALUES (${placeholders})`;

  // 使用事务批量插入
  let imported = 0;
  let errors = 0;

  try {
    const insertStmt = db.prepare(insertSql);
    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        try {
          const values = validColumns.map(k => row[k] !== undefined ? row[k] : null);
          insertStmt.run(...values);
          imported++;
        } catch (err) {
          errors++;
          console.warn(`    [⚠] 行 ${imported + errors} 导入失败: ${err.message}`);
        }
      }
    });

    insertMany(rows);
  } catch (err) {
    console.error(`  [✗] ${table.name}: 批量导入失败 - ${err.message}`);
    errors = rows.length;
  }

  stats.total += rows.length;
  stats.imported += imported;
  stats.errors += errors;
  
  console.log(`  [${errors > 0 ? '⚠' : '✓'}] ${table.name}: ${imported}/${rows.length} 行导入${errors > 0 ? ` (${errors} 错误)` : ''}`);
}

// ========== 执行 ==========
migrate().catch(err => {
  console.error('迁移失败:', err.message);
  process.exit(1);
});