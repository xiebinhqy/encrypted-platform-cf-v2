/**
 * export_staging_data.js
 * 从 Cloudflare staging 环境导出 D1 数据库和 KV 数据到本地文件
 * 
 * 用法: node scripts/export_staging_data.js [--db-only | --kv-only]
 * 
 * 输出:
 *   staging-data/d1/          - D1 各表 JSON 数据
 *   staging-data/d1.sql       - D1 全表 INSERT SQL
 *   staging-data/kv/          - KV 各命名空间 JSON 数据
 *   staging-data/export-manifest.json - 导出清单
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ============================================
// 配置
// ============================================

const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const BACKEND_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(BACKEND_DIR, "staging-data");

const D1_TABLES = [
  "users",
  "categories",
  "notes",
  "shares",
  "note_versions",
  "user_settings",
];

const KV_NAMESPACES = [
  { binding: "LOGIN_RATE_LIMIT", id: "752f93008c2e4fdeb17fa8456f6fdad8" },
  { binding: "NOTE_HISTORY", id: "db4e2eded4084eafa2b7b59e1ca39fe1" },
  { binding: "NOTES_BACKUP", id: "c4cf44f2a5d547f68df71ab772995635" },
  { binding: "NOTES_CACHE", id: "c4cf44f2a5d547f68df71ab772995635" },
];

// 解析命令行参数
const args = process.argv.slice(2);
const dbOnly = args.includes("--db-only");
const kvOnly = args.includes("--kv-only");

// ============================================
// 工具函数
// ============================================

function runCommand(cmd, options = {}) {
  try {
    const output = execSync(cmd, {
      cwd: BACKEND_DIR,
      encoding: "utf8",
      timeout: 120000,
      shell: "cmd.exe",
      ...options,
    });
    return output;
  } catch (err) {
    console.error(`  [命令失败] ${cmd}`);
    console.error(`  ${err.message}`);
    return null;
  }
}

function parseWranglerJson(output) {
  // wrangler v4 d1 execute --json 输出格式:
  // [{ "results": [row1, row2, ...], "success": true, "meta": {...} }]
  // 注意：results 是行对象数组，不是 {columns, values} 格式
  try {
    // 找到第一个 [ 开始的 JSON 数组
    const arrayStart = output.indexOf("[");
    if (arrayStart !== -1) {
      let depth = 0;
      let arrayEnd = -1;
      for (let i = arrayStart; i < output.length; i++) {
        if (output[i] === "[") depth++;
        if (output[i] === "]") depth--;
        if (depth === 0) {
          arrayEnd = i;
          break;
        }
      }
      
      if (arrayEnd !== -1) {
        const jsonStr = output.substring(arrayStart, arrayEnd + 1);
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed) && parsed[0] && parsed[0].results) {
          return parsed[0].results;
        }
        return parsed;
      }
    }
  } catch (e) {
    // JSON 解析失败
  }
  return null;
}

function wranglerResultsToRows(results) {
  if (!results || results.length === 0) return [];
  
  const rows = [];
  for (const result of results) {
    // wrangler v4 格式: results 是行对象数组 [{id: ..., name: ...}, ...]
    // 旧格式: results 是 [{columns: [...], values: [[...], ...]}]
    if (Array.isArray(result)) {
      // 旧格式: result 是数组
      rows.push(...result);
    } else if (typeof result === "object" && result !== null) {
      // 检查是否是 {columns, values} 格式
      if (result.columns && result.values) {
        const columns = result.columns;
        for (const valueRow of result.values) {
          const row = {};
          for (let i = 0; i < columns.length; i++) {
            row[columns[i]] = valueRow[i];
          }
          rows.push(row);
        }
      } else {
        // 直接是行对象
        rows.push(result);
      }
    }
  }
  return rows;
}

function escapeSqlValue(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return val.toString();
  if (typeof val === "boolean") return val ? "1" : "0";
  return `'${String(val).replace(/'/g, "''")}'`;
}

// ============================================
// D1 导出
// ============================================

function exportD1Table(tableName) {
  console.log(`\n📦 导出 D1 表: ${tableName}`);
  
  // 使用 --json 获取结构化数据（更可靠）
  const cmd = `npx wrangler d1 execute staging-notes-db --command "SELECT * FROM ${tableName}" --env staging --remote --json`;
  const output = runCommand(cmd);
  
  if (!output) {
    console.log(`  ❌ 无法获取 ${tableName} 数据`);
    return { tableName, rows: [], success: false };
  }
  
  // 尝试 JSON 解析
  let results = parseWranglerJson(output);
  let rows = wranglerResultsToRows(results);
  
  // 如果 JSON 解析失败，尝试解析表格格式
  if (rows.length === 0 && output.includes("\u2502")) {
    console.log(`  ⚠️ JSON 解析未获取到数据，尝试表格解析...`);
    rows = parseWranglerTable(output);
  }
  
  console.log(`  ✅ 获取到 ${rows.length} 行数据`);
  return { tableName, rows, success: true };
}

// 解析 wrangler 表格输出
function parseWranglerTable(output) {
  const lines = output.split("\n");
  let columns = [];
  let results = [];
  let headerFound = false;
  
  for (const line of lines) {
    // 跳过表格边框行 (├───┤ 或 ┌───┐ 或 └───┘)
    if (line.includes("├") || line.includes("┌") || line.includes("└")) {
      continue;
    }
    
    // 检测表头行 (包含 │，未找到过表头，且不包含 ─)
    if (line.includes("│") && !headerFound && !line.includes("─")) {
      columns = line.split("│").map(c => c.trim()).filter(c => c.length > 0);
      if (columns.length > 0) {
        headerFound = true;
      }
      continue;
    }
    
    // 数据行 (已找到表头，包含 │，且不以 ┌ ├ └ 开头)
    if (headerFound && line.includes("│") && !line.startsWith("─")) {
      const values = line.split("│").map(c => c.trim()).filter(c => c.length > 0);
      if (values.length === columns.length) {
        let row = {};
        for (let j = 0; j < columns.length; j++) {
          const val = values[j];
          // 处理特殊值
          if (val === "null" || val === "") {
            row[columns[j]] = null;
          } else if (!isNaN(val) && val !== "") {
            row[columns[j]] = Number(val);
          } else {
            row[columns[j]] = val;
          }
        }
        results.push(row);
      }
    }
  }
  
  return results;
}

function exportAllD1() {
  console.log("=".repeat(60));
  console.log("📊 开始导出 D1 数据库 (staging-notes-db)");
  console.log("=".repeat(60));
  
  const d1Dir = path.join(OUTPUT_DIR, "d1");
  if (!fs.existsSync(d1Dir)) {
    fs.mkdirSync(d1Dir, { recursive: true });
  }
  
  const allTableData = {};
  let totalRows = 0;
  
  for (const table of D1_TABLES) {
    const { tableName, rows, success } = exportD1Table(table);
    allTableData[tableName] = rows;
    totalRows += rows.length;
    
    if (success) {
      // 保存为 JSON
      const jsonPath = path.join(d1Dir, `${tableName}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), "utf8");
      console.log(`  💾 已保存: d1/${tableName}.json (${rows.length} 行)`);
    }
  }
  
  // 生成合并 SQL
  let sql = `-- ==============================================\n`;
  sql += `-- Staging D1 数据导出 - ${new Date().toISOString()}\n`;
  sql += `-- 表: ${D1_TABLES.join(", ")}\n`;
  sql += `-- 总行数: ${totalRows}\n`;
  sql += `-- ==============================================\n\n`;
  sql += `BEGIN TRANSACTION;\n\n`;
  
  for (const table of D1_TABLES) {
    const rows = allTableData[table];
    if (rows.length === 0) continue;
    
    sql += `-- ${table} (${rows.length} 行)\n`;
    const columns = Object.keys(rows[0]);
    
    for (const row of rows) {
      const values = columns.map((col) => escapeSqlValue(row[col]));
      sql += `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")});\n`;
    }
    sql += "\n";
  }
  
  sql += `COMMIT;\n`;
  
  const sqlPath = path.join(OUTPUT_DIR, "d1.sql");
  fs.writeFileSync(sqlPath, sql, "utf8");
  console.log(`\n💾 已保存合并 SQL: d1.sql (${sql.length} 字节, ${totalRows} 行)`);
  
  return allTableData;
}

// ============================================
// KV 导出
// ============================================

function exportKVNamespace(binding, namespaceId) {
  console.log(`\n📦 导出 KV: ${binding} (${namespaceId})`);
  
  const kvDir = path.join(OUTPUT_DIR, "kv", binding);
  if (!fs.existsSync(kvDir)) {
    fs.mkdirSync(kvDir, { recursive: true });
  }
  
  // 获取所有 key
  const cmd = `npx wrangler kv key list --namespace-id ${namespaceId} --env staging --remote`;
  const output = runCommand(cmd);
  
  if (!output) {
    console.log(`  ❌ 无法获取 ${binding} 的 key 列表`);
    return [];
  }
  
  // 解析 key 列表 (JSON 格式)
  let keys = [];
  try {
    const jsonMatch = output.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      keys = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.log(`  ⚠️ 无法解析 ${binding} 的 key 列表，可能为空`);
    return [];
  }
  
  if (keys.length === 0) {
    console.log(`  ℹ️ ${binding} 无数据`);
    return [];
  }
  
  console.log(`  找到 ${keys.length} 个 key`);
  
  // 导出所有 key-value
  const allEntries = [];
  for (const keyInfo of keys) {
    const key = keyInfo.name || keyInfo.key;
    if (!key) continue;
    
    // 获取 value - wrangler v4: key 作为位置参数，用 -- 保护
    const valCmd = `npx wrangler kv key get "${key}" --namespace-id ${namespaceId} --env staging --remote`;
    const value = runCommand(valCmd);
    
    allEntries.push({
      key,
      value: value !== null ? value.trim() : "",
      expiration: keyInfo.expiration || null,
      metadata: keyInfo.metadata || null,
    });
  }
  
  // 保存为 JSON
  const jsonPath = path.join(kvDir, "entries.json");
  fs.writeFileSync(jsonPath, JSON.stringify(allEntries, null, 2), "utf8");
  console.log(`  ✅ ${binding}: 导出 ${allEntries.length} 个 key`);
  
  return allEntries;
}

function exportAllKV() {
  console.log("\n" + "=".repeat(60));
  console.log("🔑 开始导出 KV 命名空间 (staging)");
  console.log("=".repeat(60));
  
  const allKVData = {};
  
  // 去重（NOTES_BACKUP 和 NOTES_CACHE 共享同一个 namespace ID）
  const seenIds = new Set();
  
  for (const ns of KV_NAMESPACES) {
    if (seenIds.has(ns.id)) {
      console.log(`\n⏭️ 跳过 ${ns.binding} (与之前的命名空间共享 ID: ${ns.id})`);
      allKVData[ns.binding] = allKVData[Object.keys(allKVData).find(k => {
        const found = KV_NAMESPACES.find(n => n.binding === k);
        return found && found.id === ns.id;
      })] || [];
      continue;
    }
    seenIds.add(ns.id);
    allKVData[ns.binding] = exportKVNamespace(ns.binding, ns.id);
  }
  
  return allKVData;
}

// ============================================
// 主函数
// ============================================

function main() {
  console.log("🚀 Staging 数据导出工具");
  console.log(`输出目录: ${OUTPUT_DIR}`);
  console.log(`模式: ${dbOnly ? "仅 D1" : kvOnly ? "仅 KV" : "全部"}`);
  
  // 确保输出目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const startTime = Date.now();
  const manifest = {
    exportedAt: new Date().toISOString(),
    environment: "staging",
    d1Database: "staging-notes-db (815c893f-b1b3-4f05-b737-c544becdaa0f)",
    kvNamespaces: KV_NAMESPACES.map(ns => `${ns.binding} (${ns.id})`),
    tables: {},
    kvNamespaces_exported: {},
  };
  
  // 导出 D1
  if (!kvOnly) {
    const d1Data = exportAllD1();
    for (const [table, rows] of Object.entries(d1Data)) {
      manifest.tables[table] = rows.length;
    }
  }
  
  // 导出 KV
  if (!dbOnly) {
    const kvData = exportAllKV();
    for (const [ns, entries] of Object.entries(kvData)) {
      manifest.kvNamespaces_exported[ns] = entries.length;
    }
  }
  
  // 保存清单
  const manifestPath = path.join(OUTPUT_DIR, "export-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log("\n" + "=".repeat(60));
  console.log("✅ 导出完成!");
  console.log(`⏱️ 耗时: ${elapsed}s`);
  console.log(`📁 输出: ${OUTPUT_DIR}`);
  console.log("=".repeat(60));
  
  // 打印摘要
  console.log("\n📊 导出摘要:");
  if (!kvOnly) {
    console.log("  D1 表:");
    for (const [table, count] of Object.entries(manifest.tables)) {
      console.log(`    ${table}: ${count} 行`);
    }
  }
  if (!dbOnly) {
    console.log("  KV 命名空间:");
    for (const [ns, count] of Object.entries(manifest.kvNamespaces_exported)) {
      console.log(`    ${ns}: ${count} 个 key`);
    }
  }
  console.log(`\n  清单文件: export-manifest.json`);
}

main();