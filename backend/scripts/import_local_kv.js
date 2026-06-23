/**
 * import_local_kv.js
 * 将导出的 KV 数据导入到本地 D1/KV 命名空间
 * 
 * 用法: node scripts/import_local_kv.js
 * 
 * 依赖: 需要先运行 export_staging_data.js 导出数据
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BACKEND_DIR = path.resolve(__dirname, "..");
const KV_DATA_DIR = path.join(BACKEND_DIR, "staging-data", "kv");

// 本地 KV 命名空间（wrangler.toml 中的 namespace id）
const LOCAL_KV_NAMESPACES = {
  LOGIN_RATE_LIMIT: "752f93008c2e4fdeb17fa8456f6fdad8",
  NOTE_HISTORY: "db4e2eded4084eafa2b7b59e1ca39fe1",
  NOTES_BACKUP: "c4cf44f2a5d547f68df71ab772995635",
  NOTES_CACHE: "c4cf44f2a5d547f68df71ab772995635",
};

function runCommand(cmd) {
  try {
    const output = execSync(cmd, {
      cwd: BACKEND_DIR,
      encoding: "utf8",
      timeout: 30000,
      shell: "powershell.exe",
    });
    return output;
  } catch (err) {
    console.error(`  [命令失败] ${cmd}`);
    console.error(`  ${err.message}`);
    return null;
  }
}

function importKVNamespace(binding) {
  const entriesFile = path.join(KV_DATA_DIR, binding, "entries.json");
  
  if (!fs.existsSync(entriesFile)) {
    console.log(`  ⏭️ 跳过 ${binding} (entries.json 不存在)`);
    return 0;
  }
  
  const entries = JSON.parse(fs.readFileSync(entriesFile, "utf8"));
  console.log(`\n📦 导入 KV: ${binding} (${entries.length} 个 key)`);
  
  if (entries.length === 0) {
    console.log(`  ⏭️ 无数据，跳过`);
    return 0;
  }
  
  const namespaceId = LOCAL_KV_NAMESPACES[binding];
  if (!namespaceId) {
    console.log(`  ❌ 未找到 ${binding} 的本地 namespace ID`);
    return 0;
  }
  
  let imported = 0;
  for (const entry of entries) {
    const key = entry.key;
    const value = entry.value;
    
    // 使用 wrangler kv key put 写入本地 KV
    // 写入临时文件存储 value
    const tempFile = path.join(KV_DATA_DIR, `_temp_value.txt`);
    fs.writeFileSync(tempFile, value, "utf8");
    
    let cmd = `npx wrangler kv key put "${key}" --path="${tempFile}" --namespace-id=${namespaceId} --local`;
    
    if (entry.expiration) {
      cmd += ` --expiration=${entry.expiration}`;
    }
    
    const output = runCommand(cmd);
    if (output !== null) {
      imported++;
    }
    
    // 清理临时文件
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
  
  console.log(`  ✅ ${binding}: ${imported}/${entries.length} 个 key 导入成功`);
  return imported;
}

function main() {
  console.log("🚀 本地 KV 数据导入工具");
  console.log(`数据目录: ${KV_DATA_DIR}`);
  
  if (!fs.existsSync(KV_DATA_DIR)) {
    console.log("\n❌ 未找到 KV 数据目录！");
    console.log("请先运行: node scripts/export_staging_data.js");
    process.exit(1);
  }
  
  const bindings = Object.keys(LOCAL_KV_NAMESPACES);
  const seenIds = new Set();
  let totalImported = 0;
  
  for (const binding of bindings) {
    const nsId = LOCAL_KV_NAMESPACES[binding];
    if (seenIds.has(nsId)) {
      console.log(`\n⏭️ 跳过 ${binding} (与之前的命名空间共享 ID)`);
      continue;
    }
    seenIds.add(nsId);
    totalImported += importKVNamespace(binding);
  }
  
  console.log("\n" + "=".repeat(60));
  console.log(`✅ KV 导入完成! 共导入 ${totalImported} 个 key`);
  console.log("=".repeat(60));
}

main();