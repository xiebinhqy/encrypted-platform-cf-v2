/**
 * import_staging_data.js
 * 将导出的 staging 数据导入到本地 D1 数据库
 * 
 * 用法: node scripts/import_staging_data.js [--drop-tables]
 * 
 * 依赖: 需要先运行 export_staging_data.js 导出数据
 * 数据来源: staging-data/d1.sql 或 staging-data/d1/*.json
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ============================================
// 配置
// ============================================

const BACKEND_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(BACKEND_DIR, "staging-data");
const SQL_FILE = path.join(DATA_DIR, "d1.sql");
const D1_JSON_DIR = path.join(DATA_DIR, "d1");

// 本地 D1 数据库名（wrangler.toml 中的 database_name）
const LOCAL_DB_NAME = "staging-notes-db";

const D1_TABLES = [
  "user_settings",
  "note_versions",
  "shares",
  "notes",
  "categories",
  "users",
];

// 解析命令行参数
const args = process.argv.slice(2);
const dropTables = args.includes("--drop-tables");

// ============================================
// 工具函数
// ============================================

function runCommand(cmd) {
  try {
    const output = execSync(cmd, {
      cwd: BACKEND_DIR,
      encoding: "utf8",
      timeout: 120000,
      shell: "powershell.exe",
    });
    return output;
  } catch (err) {
    console.error(`  [命令失败] ${cmd}`);
    console.error(`  ${err.message}`);
    return null;
  }
}

// ============================================
// 从 SQL 文件导入
// ============================================

function importFromSqlFile() {
  console.log("📦 从 SQL 文件导入...");
  
  if (!fs.existsSync(SQL_FILE)) {
    console.log(`  ❌ SQL 文件不存在: ${SQL_FILE}`);
    console.log(`  请先运行: node scripts/export_staging_data.js`);
    return false;
  }
  
  const sqlContent = fs.readFileSync(SQL_FILE, "utf8");
  console.log(`  📄 读取 SQL 文件: ${sqlContent.length} 字节`);
  
  // wrangler d1 execute 可以接受 SQL 文件
  const cmd = `npx wrangler d1 execute ${LOCAL_DB_NAME} --file="${SQL_FILE}" --local`;
  console.log(`  🚀 执行导入...`);
  const output = runCommand(cmd);
  
  if (output) {
    console.log(`  ✅ SQL 文件导入成功`);
    // 输出 wrangler 的响应
    const lines = output.split("\n").filter(l => l.trim());
    lines.forEach(l => console.log(`    ${l}`));
    return true;
  }
  
  return false;
}

// ============================================
// 从 JSON 文件导入（逐表导入）
// ============================================

function importFromJsonFiles() {
  console.log("📦 从 JSON 文件导入...");
  
  if (!fs.existsSync(D1_JSON_DIR)) {
    console.log(`  ❌ JSON 目录不存在: ${D1_JSON_DIR}`);
    return false;
  }
  
  let success = true;
  
  for (const table of D1_TABLES) {
    const jsonFile = path.join(D1_JSON_DIR, `${table}.json`);
    if (!fs.existsSync(jsonFile)) {
      console.log(`  ⏭️ 跳过 ${table} (JSON 文件不存在)`);
      continue;
    }
    
    const rows = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
    console.log(`\n📦 导入表: ${table} (${rows.length} 行)`);
    
    if (rows.length === 0) {
      console.log(`  ⏭️ 无数据，跳过`);
      continue;
    }
    
    // 生成 INSERT SQL
    const columns = Object.keys(rows[0]);
    let sql = "";
    
    for (const row of rows) {
      const values = columns.map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return "NULL";
        if (typeof val === "number") return val.toString();
        if (typeof val === "boolean") return val ? "1" : "0";
        return `'${String(val).replace(/'/g, "''")}'`;
      });
      sql += `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")});\n`;
    }
    
    // 写入临时 SQL 文件
    const tempSql = path.join(DATA_DIR, `_temp_import.sql`);
    fs.writeFileSync(tempSql, sql, "utf8");
    
    // 执行导入
    const cmd = `npx wrangler d1 execute ${LOCAL_DB_NAME} --file="${tempSql}" --local`;
    const output = runCommand(cmd);
    
    if (output) {
      console.log(`  ✅ ${table}: ${rows.length} 行导入成功`);
    } else {
      console.log(`  ❌ ${table}: 导入失败`);
      success = false;
    }
    
    // 清理临时文件
    if (fs.existsSync(tempSql)) {
      fs.unlinkSync(tempSql);
    }
  }
  
  return success;
}

// ============================================
// 删除旧表（可选）
// ============================================

function dropExistingTables() {
  console.log("🗑️ 删除现有表...");
  
  let sql = "";
  for (const table of D1_TABLES) {
    sql += `DROP TABLE IF EXISTS ${table};\n`;
  }
  
  const tempSql = path.join(DATA_DIR, `_temp_drop.sql`);
  fs.writeFileSync(tempSql, sql, "utf8");
  
  const cmd = `npx wrangler d1 execute ${LOCAL_DB_NAME} --file="${tempSql}" --local`;
  const output = runCommand(cmd);
  
  if (fs.existsSync(tempSql)) {
    fs.unlinkSync(tempSql);
  }
  
  if (output) {
    console.log("  ✅ 旧表已删除");
    return true;
  }
  
  return false;
}

// ============================================
// 重建表结构（从 migrations）
// ============================================

function recreateTables() {
  console.log("🔨 重建表结构...");
  
  const migrationsDir = path.join(BACKEND_DIR, "migrations");
  const initSql = path.join(migrationsDir, "0000_init.sql");
  
  if (!fs.existsSync(initSql)) {
    console.log(`  ❌ 初始化 SQL 不存在: ${initSql}`);
    return false;
  }
  
  // 按顺序执行迁移文件
  const migrationFiles = [
    "0000_init.sql",
    "add_deleted_at_to_notes.sql",
    "0001_add_note_versions.sql",
    "0002_add_user_settings.sql",
    "0003_add_hot_cold_fields.sql",
    "0005_fix_schema_to_match_staging.sql",
  ];
  
  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`  ⏭️ 跳过 ${file} (不存在)`);
      continue;
    }
    
    console.log(`  📄 执行迁移: ${file}`);
    const cmd = `npx wrangler d1 execute ${LOCAL_DB_NAME} --file="${filePath}" --local`;
    const output = runCommand(cmd);
    
    if (!output) {
      console.log(`  ⚠️ 迁移 ${file} 可能已执行或失败`);
    }
  }
  
  return true;
}

// ============================================
// 主函数
// ============================================

function main() {
  console.log("🚀 Staging 数据导入工具");
  console.log(`数据目录: ${DATA_DIR}`);
  
  // 检查数据是否存在
  const hasSql = fs.existsSync(SQL_FILE);
  const hasJson = fs.existsSync(D1_JSON_DIR);
  
  if (!hasSql && !hasJson) {
    console.log("\n❌ 未找到导出数据！");
    console.log("请先运行: node scripts/export_staging_data.js");
    process.exit(1);
  }
  
  // 可选：删除旧表
  if (dropTables) {
    dropExistingTables();
    recreateTables();
  }
  
  // 优先从 SQL 文件导入
  let success;
  if (hasSql) {
    success = importFromSqlFile();
  } else {
    success = importFromJsonFiles();
  }
  
  if (success) {
    console.log("\n" + "=".repeat(60));
    console.log("✅ 导入完成!");
    console.log("=".repeat(60));
    console.log("\n💡 提示:");
    console.log("  本地 D1 数据库已更新");
    console.log("  运行 'npm run dev' 启动本地开发服务器");
    console.log("  运行 'npm run dev:remote' 连接远程 staging 数据库");
  } else {
    console.log("\n❌ 导入过程中有错误，请检查输出");
    process.exit(1);
  }
}

main();