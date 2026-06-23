/**
 * 笔记版本历史服务
 * 处理笔记版本的创建、查询、恢复
 * 版本存储在 D1 数据库的 note_versions 表中
 */

import { getDB } from "../config/database.js";

/**
 * 计算内容哈希（用于快速比较内容是否变化）
 * @param {string} content - 内容字符串
 * @returns {Promise<string>} SHA-256 哈希值
 */
async function computeHash(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content || "");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 创建笔记版本（在更新笔记前调用）
 * @param {Object} env - Workers 环境变量
 * @param {string} noteId - 笔记 ID
 * @param {string} userId - 用户 ID
 * @param {Object} noteData - 当前笔记数据 { title, content, category, tags }
 * @param {string} versionLabel - 版本标签（可选）
 * @returns {Promise<Object>} 创建结果
 */
export const createVersion = async (env, noteId, userId, noteData, versionLabel = "") => {
  const DB = getDB(env);

  // 确保表存在
  await ensureTableExists(DB);

  // 获取当前版本号
  const lastVersion = await DB.prepare(
    "SELECT MAX(version_number) as max_ver FROM note_versions WHERE note_id = ? AND user_id = ?"
  ).bind(noteId, userId).first();

  const nextVersion = (lastVersion?.max_ver || 0) + 1;

  // 计算内容哈希
  const contentHash = await computeHash(noteData.content);

  // 插入版本记录
  const result = await DB.prepare(
    `INSERT INTO note_versions (note_id, user_id, version_number, title, content, category, tags, content_hash, version_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    noteId,
    userId,
    nextVersion,
    noteData.title || "",
    noteData.content || "",
    noteData.category || "",
    noteData.tags || "",
    contentHash,
    versionLabel || `版本 ${nextVersion}`
  ).run();

  return {
    success: true,
    versionId: result.meta?.last_row_id,
    versionNumber: nextVersion
  };
};

/**
 * 获取笔记的所有版本历史
 * @param {Object} env - Workers 环境变量
 * @param {string} noteId - 笔记 ID
 * @param {string} userId - 用户 ID
 * @returns {Promise<Array>} 版本列表
 */
export const getVersions = async (env, noteId, userId) => {
  const DB = getDB(env);

  await ensureTableExists(DB);

  const versions = await DB.prepare(
    `SELECT id, note_id, version_number, version_label, content_hash, created_at
     FROM note_versions
     WHERE note_id = ? AND user_id = ?
     ORDER BY version_number DESC`
  ).bind(noteId, userId).all();

  return versions.results || [];
};

/**
 * 获取指定版本的详细内容
 * @param {Object} env - Workers 环境变量
 * @param {string} versionId - 版本 ID
 * @param {string} userId - 用户 ID
 * @returns {Promise<Object>} 版本详情
 */
export const getVersionById = async (env, versionId, userId) => {
  const DB = getDB(env);

  await ensureTableExists(DB);

  const version = await DB.prepare(
    `SELECT id, note_id, version_number, title, content, category, tags, content_hash, version_label, created_at
     FROM note_versions
     WHERE id = ? AND user_id = ?`
  ).bind(versionId, userId).first();

  return version;
};

/**
 * 获取笔记的最新版本号
 * @param {Object} env - Workers 环境变量
 * @param {string} noteId - 笔记 ID
 * @param {string} userId - 用户 ID
 * @returns {Promise<number>} 最新版本号
 */
export const getLatestVersionNumber = async (env, noteId, userId) => {
  const DB = getDB(env);

  await ensureTableExists(DB);

  const result = await DB.prepare(
    "SELECT MAX(version_number) as max_ver FROM note_versions WHERE note_id = ? AND user_id = ?"
  ).bind(noteId, userId).first();

  return result?.max_ver || 0;
};

/**
 * 恢复笔记到指定版本
 * @param {Object} env - Workers 环境变量
 * @param {string} versionId - 要恢复的版本 ID
 * @param {string} userId - 用户 ID
 * @returns {Promise<Object>} 恢复的版本内容
 */
export const restoreVersion = async (env, versionId, userId) => {
  const DB = getDB(env);

  await ensureTableExists(DB);

  const version = await DB.prepare(
    "SELECT * FROM note_versions WHERE id = ? AND user_id = ?"
  ).bind(versionId, userId).first();

  if (!version) return null;

  return {
    title: version.title,
    content: version.content,
    category: version.category,
    tags: version.tags,
    versionNumber: version.version_number,
    createdAt: version.created_at
  };
};

/**
 * 清理旧版本（保留最近 N 个版本）
 * @param {Object} env - Workers 环境变量
 * @param {string} noteId - 笔记 ID
 * @param {string} userId - 用户 ID
 * @param {number} keepCount - 保留版本数
 */
export const cleanupOldVersions = async (env, noteId, userId, keepCount = 50) => {
  const DB = getDB(env);

  await ensureTableExists(DB);

  // 获取要删除的版本
  const oldVersions = await DB.prepare(
    `SELECT id FROM note_versions
     WHERE note_id = ? AND user_id = ?
     ORDER BY version_number DESC
     LIMIT -1 OFFSET ?`
  ).bind(noteId, userId, keepCount).all();

  if (oldVersions.results && oldVersions.results.length > 0) {
    const ids = oldVersions.results.map(v => v.id);
    const placeholders = ids.map(() => "?").join(",");
    await DB.prepare(
      `DELETE FROM note_versions WHERE id IN (${placeholders})`
    ).bind(...ids).run();
  }
};

/**
 * 确保 note_versions 表存在（自动迁移）
 * @param {D1Database} DB - 数据库实例
 */
async function ensureTableExists(DB) {
  try {
    // 创建表（如果不存在）
    await DB.prepare(`
      CREATE TABLE IF NOT EXISTS note_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        version_number INTEGER NOT NULL DEFAULT 1,
        title_cipher TEXT DEFAULT '',
        ciphertext TEXT DEFAULT '',
        category_cipher TEXT DEFAULT '',
        tags_cipher TEXT DEFAULT '',
        content_hash TEXT DEFAULT '',
        version_label TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // TODO: 如果表已存在但缺少新列，尝试添加（静默忽略已存在的列）
    const newColumns = [
      "ALTER TABLE note_versions ADD COLUMN title TEXT DEFAULT ''",
      "ALTER TABLE note_versions ADD COLUMN content TEXT DEFAULT ''",
      "ALTER TABLE note_versions ADD COLUMN category TEXT DEFAULT ''",
      "ALTER TABLE note_versions ADD COLUMN tags TEXT DEFAULT ''"
    ];
    for (const sql of newColumns) {
      try { await DB.prepare(sql).run(); } catch (_) {}
    }

    // 创建索引
    try {
      await DB.prepare("CREATE INDEX IF NOT EXISTS idx_note_versions_note_id ON note_versions(note_id, user_id)").run();
    } catch (_) {}
    try {
      await DB.prepare("CREATE INDEX IF NOT EXISTS idx_note_versions_created ON note_versions(note_id, created_at DESC)").run();
    } catch (_) {}
  } catch (_) {}
}
