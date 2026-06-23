// 从纯 JSON 文件生成 INSERT SQL
const fs = require("fs");

const tables = ["users", "categories", "notes", "shares"];
let allSql = "-- 从生产环境导出的数据\nBEGIN TRANSACTION;\n";

for (const table of tables) {
  const filePath = `g:\\hexol-blog\\encrypted-notes-v2\\backend\\prod_${table}_clean.json`;
  
  if (!fs.existsSync(filePath)) {
    console.log(`文件不存在: ${filePath}`);
    continue;
  }
  
  const content = fs.readFileSync(filePath, "utf8").trim();
  
  try {
    const data = JSON.parse(content);
    const rows = data[0]?.results || [];
    
    if (rows.length === 0) {
      console.log(`${table}: 无数据`);
      continue;
    }
    
    const columns = Object.keys(rows[0]);
    
    for (const row of rows) {
      const values = columns.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return "NULL";
        if (typeof val === "number") return val.toString();
        // 转义单引号
        return `'${String(val).replace(/'/g, "''")}'`;
      });
      
      allSql += `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")});\n`;
    }
    
    console.log(`${table}: ${rows.length} 行`);
  } catch (e) {
    console.log(`${table}: JSON 解析错误: ${e.message}`);
  }
}

allSql += "COMMIT;\n";

const outPath = "g:\\hexol-blog\\encrypted-notes-v2\\backend\\migrations\\import_prod_data.sql";
fs.writeFileSync(outPath, allSql, "utf8");
console.log(`\nSQL 已保存: ${outPath}`);
console.log(`总大小: ${allSql.length} 字节`);