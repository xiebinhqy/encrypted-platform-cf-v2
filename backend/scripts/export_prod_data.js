// 导出生产环境数据到 SQL 文件
// 运行：node scripts/export_prod_data.js
import { execSync } from "child_process";
import { writeFileSync } from "fs";

const tables = ["users", "categories", "notes", "shares"];

async function main() {
  let allSql = "-- 从生产环境导出的数据\n";
  
  for (const table of tables) {
    console.log(`导出 ${table} 数据...`);
    
    // 获取 JSON 数据
    const cmd = `npx wrangler d1 execute notes-db --command='SELECT * FROM ${table};' --env production --remote --json`;
    
    try {
      const output = execSync(cmd, { cwd: "g:\\hexol-blog\\encrypted-notes-v2\\backend", encoding: "utf8", shell: "cmd.exe" });
      
      // 从输出中提取 JSON 部分
      const jsonMatch = output.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error(`无法解析 ${table} 的 JSON 输出`);
        continue;
      }
      
      const data = JSON.parse(jsonMatch[0]);
      
      // 从第一个结果中获取数据行
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
      
      console.log(`${table}: ${rows.length} 行数据已导出`);
    } catch (err) {
      console.error(`导出 ${table} 失败:`, err.message);
    }
  }
  
  writeFileSync("g:\\hexol-blog\\encrypted-notes-v2\\backend\\migrations\\import_prod_data.sql", allSql, "utf8");
  console.log(`\nSQL 已保存到 migrations/import_prod_data.sql`);
}

main().catch(console.error);