// 导出生产环境数据脚本 (CommonJS)
const { execSync } = require("child_process");
const fs = require("fs");

const tables = ["users", "categories", "notes", "shares"];
let allSql = "-- 从生产环境导出的数据\nBEGIN TRANSACTION;\n";

function parseWranglerOutput(output, tableName) {
  // 解析 wrangler 表格输出
  const lines = output.split("\n");
  let columns = [];
  let results = [];
  let parsing = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 检测表格开始 (存在分隔线)
    if (line.includes("├") && line.includes("┤")) {
      parsing = false;
      continue;
    }
    
    // 表头行
    if (line.includes("│") && !parsing && !line.includes("─")) {
      columns = line.split("│").map(c => c.trim()).filter(c => c.length > 0);
      parsing = true;
      continue;
    }
    
    // 数据行
    if (parsing && line.includes("│")) {
      const values = line.split("│").map(c => c.trim()).filter(c => c.length > 0);
      if (values.length === columns.length) {
        let row = {};
        for (let j = 0; j < columns.length; j++) {
          // 尝试转换为数字
          const val = values[j];
          row[columns[j]] = isNaN(val) ? val : Number(val);
        }
        results.push(row);
      }
    }
  }
  
  return results;
}

for (const table of tables) {
  console.log(`正在导出 ${table} 数据...`);
  
  try {
    const cmd = `npx wrangler d1 execute notes-db --command="SELECT * FROM ${table}" --env production --remote`;
    const output = execSync(cmd, { 
      cwd: "g:\\hexol-blog\\encrypted-notes-v2\\backend", 
      encoding: "utf8", 
      timeout: 30000,
      shell: "powershell.exe"
    });
    
    // 保存原始输出用于调试
    fs.writeFileSync(`g:\\hexol-blog\\encrypted-notes-v2\\backend\\prod_${table}_raw.txt`, output, "utf8");
    
    // 输出中包含表格，放在 JSON 里
    const jsonMatch = output.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      console.log(`  无法从 ${table} 输出中找到 JSON，检查原始文件`);
      continue;
    }
    
    const data = JSON.parse(jsonMatch[0]);
    const rows = data[0]?.results || [];
    
    if (rows.length === 0) {
      console.log(`  ${table}: 无数据`);
      continue;
    }
    
    const rowKeys = Object.keys(rows[0]);
    
    for (const row of rows) {
      const values = rowKeys.map(key => {
        const val = row[key];
        if (val === null || val === undefined) return "NULL";
        if (typeof val === "number") return val.toString();
        return `'${String(val).replace(/'/g, "''")}'`;
      });
      allSql += `INSERT INTO ${table} (${rowKeys.join(", ")}) VALUES (${values.join(", ")});\n`;
    }
    
    console.log(`  ${table}: ${rows.length} 行数据已导出`);
  } catch (err) {
    console.error(`  导出 ${table} 失败:`, err.message);
  }
}

allSql += "COMMIT;\n";

fs.writeFileSync("g:\\hexol-blog\\encrypted-notes-v2\\backend\\migrations\\import_prod_data.sql", allSql, "utf8");
console.log(`\nSQL 已保存到 migrations/import_prod_data.sql (${allSql.length} 字节)`);