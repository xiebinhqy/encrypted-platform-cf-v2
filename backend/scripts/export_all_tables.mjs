// export_all_tables.mjs - 从 staging 导出所有 D1 表数据到 SQL 文件（PowerShell 方式）
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const BACKEND_DIR = process.cwd();
const STAGING_DIR = path.join(BACKEND_DIR, "staging-data");
const OUT_FILE = path.join(STAGING_DIR, "import_local.sql");

const TABLES = ["users", "categories", "notes", "user_settings", "note_versions", "shares", "event_logs"];

function runTable(table) {
  // 写入 SQL 文件
  const sqlFile = path.join(STAGING_DIR, `_q_${table}.sql`);
  fs.writeFileSync(sqlFile, `SELECT * FROM ${table};\n`, "utf8");
  
  // 用 --file 方式执行（避免 cmd 引号问题）
  const cmd = `npx wrangler d1 execute staging-notes-db --file="${sqlFile}" --env staging --remote`;
  try {
    return execSync(cmd, { cwd: BACKEND_DIR, encoding: "utf8", timeout: 60000 });
  } catch (e) {
    if (e.stdout) return e.stdout;
    console.log(`  [FAIL] ${table}: ${e.message}`);
    return null;
  }
}

function parseTable(output) {
  if (!output) return [];
  const rows = [];
  let columns = [];
  let parsingHeader = true;
  
  // 找表格部分（│ 分隔）
  const lines = output.split("\n");
  for (const line of lines) {
    if (!line.includes("│")) continue;
    const cells = line.split("│").map(c => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    
    // 跳过分隔线
    if (cells.some(c => c.includes("─"))) continue;
    if (cells.every(c => c.includes("┼") || c.includes("┬") || c.includes("┴"))) continue;
    
    if (parsingHeader) {
      columns = cells;
      parsingHeader = false;
    } else {
      const row = {};
      columns.forEach((col, i) => {
        const raw = cells[i] || "";
        const val = raw.trim();
        const num = Number(val);
        row[col] = val === "" ? null : (isNaN(num) ? val : num);
      });
      rows.push(row);
    }
  }
  return rows;
}

fs.mkdirSync(STAGING_DIR, { recursive: true });
let sql = "-- 从 staging 导出的数据\nBEGIN TRANSACTION;\n\n";

for (const table of TABLES) {
  process.stdout.write(`📦 ${table}... `);
  const raw = runTable(table);
  if (!raw) { console.log("失败"); continue; }
  
  const rows = parseTable(raw);
  if (rows.length === 0) { console.log("无数据"); sql += `-- ${table}: 无数据\n\n`; continue; }

  console.log(`${rows.length} 行`);
  fs.writeFileSync(path.join(STAGING_DIR, `${table}.json`), JSON.stringify(rows, null, 2), "utf8");

  const cols = Object.keys(rows[0]);
  for (const row of rows) {
    const vals = cols.map(c => {
      const v = row[c];
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "number") return String(v);
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    sql += `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${vals.join(", ")});\n`;
  }
  sql += "\n";
}

sql += "COMMIT;\n";
fs.writeFileSync(OUT_FILE, sql, "utf8");
console.log(`\n✅ SQL 保存到: ${OUT_FILE} (${sql.length} 字节)`);