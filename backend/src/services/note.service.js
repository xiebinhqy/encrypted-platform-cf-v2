// note.service.js v4.0.0
/**
 * 笔记业务逻辑层
 * 从原始 worker.js 提取的笔记相关核心逻辑
 * 处理笔记的增删改查
 * 所有数据端对端加密，服务器只存储不解密
 * 
 * v4.0.0 变更：
 * - 删除自动列名检测，固定使用 title/content/category/tags 列（与数据库一致）
 * - 外部输出统一使用 title_cipher/ciphertext/category_cipher/tags_cipher 字段名（v1 风格）
 * - 消除列名检测不一致导致的 "未命名笔记" 问题
 */

import { getDB } from "../config/database.js";
import { getPaginationDefaults } from "../config/constants.js";
import * as cache from "./cache.service.js";
import { rebuildNotesListCache, onNoteAccessed } from "./hot-cold.service.js";

// ✅ 固定列名映射：数据库存储使用 title/content/tags，对外输出使用 title_cipher/ciphertext/tags_cipher
const DB_COLUMNS = {
  title: 'title',
  content: 'content', 
  category: 'category',
  tags: 'tags'
};

// 笔记列表获取（核心！优先走 KV 缓存）

export const getNotes = async (env, userId, options = {}) => {
  const defaults = getPaginationDefaults();
  const page = options.page || defaults.page;
  const limit = Math.min(options.limit || defaults.limit, defaults.maxLimit);
  const includeContent = options.includeContent || false;

  try {
    // ===== 策略 1: 优先从 KV 缓存读取 =====
    const cachedList = await cache.getCachedNotesList(env, userId);
    if (cachedList && cachedList.notes) {
      return getNotesFromCache(cachedList, page, limit, includeContent, userId);
    }

    // ===== 策略 2: KV 未命中，从 D1 读取 =====
    return await getNotesFromD1(env, userId, page, limit, includeContent);
  } catch (error) {
    console.error("获取笔记列表失败:", error);
    return await getNotesFromD1(env, userId, page, limit, includeContent);
  }
};

/**
 * 从 KV 缓存中提取分页数据
 */
function getNotesFromCache(cachedList, page, limit, includeContent, userId) {
  const { notes: notesMap, hot_ids = [], cold_ids = [] } = cachedList;
  const allIds = [...hot_ids, ...cold_ids];
  const total = allIds.length;
  const offset = (page - 1) * limit;
  const pageIds = allIds.slice(offset, offset + limit);

  const notes = pageIds.map(id => {
    const summary = notesMap[id];
    if (!summary) return null;
    return {
      id,
      title_cipher: summary.title_cipher || "",
      ciphertext: includeContent ? "" : undefined,
      category_cipher: summary.category_cipher || "",
      tags_cipher: summary.tags_cipher || "",
      updated_at: summary.updated_at,
      created_at: summary.created_at,
      revision_count: summary.revision_count || 1,
      is_hot: summary.is_hot || false
    };
  }).filter(Boolean);

  return { notes, total, page, limit, hasMore: offset + limit < total, fromCache: true };
}

/**
 * 从 D1 数据库读取笔记列表
 * 🚀 统一使用 title/content/category/tags 列（与数据库一致）
 * 🚀 返回时映射为 title_cipher/ciphertext/category_cipher/tags_cipher（与前端一致）
 */
/**
 * 从 D1 数据库读取笔记列表
 * 🚀 性能优化：
 * - 首页不查 COUNT（直接用 results.length + hasMore 判断）
 * - 仅非首页或需要 total 时查 COUNT
 * - 使用覆盖索引 idx_notes_user_deleted_updated
 */
async function getNotesFromD1(env, userId, page, limit, includeContent) {
  const DB = getDB(env);
  const offset = (page - 1) * limit;

  const selectFields = includeContent
    ? `id, ${DB_COLUMNS.title}, ${DB_COLUMNS.content}, ${DB_COLUMNS.category}, ${DB_COLUMNS.tags}, revision_count, updated_at, created_at, is_hot`
    : `id, ${DB_COLUMNS.title}, ${DB_COLUMNS.category}, ${DB_COLUMNS.tags}, revision_count, updated_at, created_at, is_hot`;

  // 🚀 性能优化：查询 limit+1 条记录，用多出的一条判断是否有下一页，避免 COUNT 全表扫描
  const notes = await DB.prepare(
    `SELECT ${selectFields} FROM notes WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ? OFFSET ?`
  ).bind(userId, limit + 1, offset).all();

  const hasMore = notes.results.length > limit;
  const pageResults = hasMore ? notes.results.slice(0, limit) : notes.results;

  const result = pageResults.map(note => ({
    id: note.id,
    title_cipher: note[DB_COLUMNS.title] || "",
    ciphertext: includeContent ? (note[DB_COLUMNS.content] || "") : undefined,
    category_cipher: note[DB_COLUMNS.category] || "",
    tags_cipher: note[DB_COLUMNS.tags] || "",
    updated_at: new Date(note.updated_at).getTime(),
    created_at: new Date(note.created_at).getTime(),
    revision_count: note.revision_count || 1,
    is_hot: !!note.is_hot
  }));

  // 仅首页或需要精确 total 时查 COUNT（避免每次翻页都全表扫描）
  let total = 0;
  if (page === 1) {
    // 用缓存的 total 或查一次 COUNT
    try {
      const countResult = await DB.prepare(
        "SELECT COUNT(*) as total FROM notes WHERE user_id = ? AND deleted_at IS NULL"
      ).bind(userId).first();
      total = countResult?.total || 0;
    } catch (_) {
      // COUNT 失败时用估算值
      total = hasMore ? offset + limit + 1 : offset + result.length;
    }
  } else {
    // 非首页：用 offset + pageResults + hasMore 估算 total
    total = hasMore ? offset + limit + 999 : offset + result.length;
  }

  try {
    rebuildNotesListCache(env, userId).catch(() => {});
  } catch (_) {}

  return { notes: result, total, page, limit, hasMore, fromCache: false };
}

// ==============================================
// 获取单条笔记详情
// ==============================================

export const getNoteById = async (env, noteId, userId) => {
  try {
    // ===== 策略 1: 尝试从 KV 获取热笔记 =====
    const hotNote = await cache.getCachedHotNote(env, userId, noteId);
    if (hotNote) {
      try {
        await cache.recordAccess(env, userId, noteId);
        const DB = getDB(env);
        DB.prepare(
          "UPDATE notes SET last_access_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
        ).bind(noteId, userId).run().catch(() => {});
      } catch (_) {}

      return {
        id: hotNote.id,
        title_cipher: hotNote.title_cipher || "",
        ciphertext: hotNote.ciphertext || "",
        category_cipher: hotNote.category_cipher || "",
        tags_cipher: hotNote.tags_cipher || "",
        updated_at: hotNote.updated_at,
        fromCache: true
      };
    }

    // ===== 策略 2: 从 D1 读取 =====
    const DB = getDB(env);
    const note = await DB.prepare(
      `SELECT id, ${DB_COLUMNS.title}, ${DB_COLUMNS.content}, ${DB_COLUMNS.category}, ${DB_COLUMNS.tags}, updated_at FROM notes WHERE id = ? AND user_id = ?`
    ).bind(noteId, userId).first();

    if (!note) return null;

    return {
      id: note.id,
      title_cipher: note[DB_COLUMNS.title] || "",
      ciphertext: note[DB_COLUMNS.content] || "",
      category_cipher: note[DB_COLUMNS.category] || "",
      tags_cipher: note[DB_COLUMNS.tags] || "",
      updated_at: new Date(note.updated_at).getTime(),
      fromCache: false
    };
  } catch (error) {
    console.error("获取笔记详情失败:", error);
    const DB = getDB(env);
    const note = await DB.prepare(
      `SELECT id, ${DB_COLUMNS.title}, ${DB_COLUMNS.content}, ${DB_COLUMNS.category}, updated_at FROM notes WHERE id = ? AND user_id = ?`
    ).bind(noteId, userId).first();
    if (!note) return null;
    return {
      id: note.id,
      title_cipher: note[DB_COLUMNS.title] || "",
      ciphertext: note[DB_COLUMNS.content] || "",
      category_cipher: note[DB_COLUMNS.category] || "",
      updated_at: new Date(note.updated_at).getTime()
    };
  }
};

// ==============================================
// 创建笔记
// ==============================================

export const createNote = async (env, userId, noteId, title, content, category, tagsCipher) => {
  const DB = getDB(env);

  const now = new Date().toISOString();
  // 🚨 修复：同时写入 title_cipher/ciphertext/category_cipher/tags_cipher（兼容 v1 旧表结构）
  // 旧表（staging/production 迁移后）保留了 title_cipher NOT NULL 约束，只写 title 列会导致 NULL constraint failed
  const result = await DB.prepare(
    `INSERT INTO notes (id, user_id, ${DB_COLUMNS.title}, ${DB_COLUMNS.content}, ${DB_COLUMNS.category}, ${DB_COLUMNS.tags}, title_cipher, ciphertext, category_cipher, tags_cipher, revision_count, created_at, updated_at, is_hot, last_access_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1, ?)`
  ).bind(noteId, userId, title, content, category || "", tagsCipher || "", title, content, category || "", tagsCipher || "", now, now, now).run();

  if (noteId) {
    try {
      await cache.setCachedHotNote(env, userId, String(noteId), {
        id: String(noteId),
        title_cipher: title || "", ciphertext: content || "", category_cipher: category || "",
        updated_at: now, last_access_at: now
      });
      // 🚨 修复：await 重建缓存，确保下次读取时能看到新笔记
      await rebuildNotesListCache(env, userId);
    } catch (_) {}
  }

  return { id: noteId, success: true };
};

// ==============================================
// 更新笔记
// ==============================================

export const updateNote = async (env, noteId, userId, title, content, category, tagsCipher) => {
  const DB = getDB(env);

  // 🚨 修复：同时更新 title_cipher/ciphertext/category_cipher/tags_cipher（兼容 v1 旧表结构）
  const result = await DB.prepare(
    `UPDATE notes SET ${DB_COLUMNS.title} = ?, ${DB_COLUMNS.content} = ?, ${DB_COLUMNS.category} = ?, ${DB_COLUMNS.tags} = ?, title_cipher = ?, ciphertext = ?, category_cipher = ?, tags_cipher = ?, revision_count = revision_count + 1, updated_at = CURRENT_TIMESTAMP, last_access_at = CURRENT_TIMESTAMP, is_hot = 1 WHERE id = ? AND user_id = ?`
  ).bind(title, content, category || "", tagsCipher || "", title, content, category || "", tagsCipher || "", noteId, userId).run();

  try {
    // 🚀 优化：只更新 KV 热笔记和列表缓存中的单条，不触发 rebuild
    await cache.setCachedHotNote(env, userId, noteId, {
      id: noteId, title_cipher: title || "", ciphertext: content || "", category_cipher: category || "", tags_cipher: tagsCipher || "",
      updated_at: new Date().toISOString(), last_access_at: new Date().toISOString()
    });

    // 🚀 直接更新 KV 列表缓存中的摘要（避免 get+set 两次）
    const cachedList = await cache.getCachedNotesList(env, userId);
    if (cachedList && cachedList.notes) {
      if (cachedList.notes[noteId]) {
        cachedList.notes[noteId].title_cipher = title || "";
        cachedList.notes[noteId].category_cipher = category || "";
        cachedList.notes[noteId].tags_cipher = tagsCipher || "";
        cachedList.notes[noteId].updated_at = Date.now();
        cachedList.notes[noteId].is_hot = true;
      }
      // 🚀 确保 noteId 在 hot_ids 中
      if (!cachedList.hot_ids.includes(noteId)) {
        cachedList.hot_ids.push(noteId);
        cachedList.cold_ids = (cachedList.cold_ids || []).filter(id => id !== noteId);
      }
      cachedList.updated_at = Date.now();
      await cache.setCachedNotesList(env, userId, cachedList);
    }
  } catch (_) {}

  return { success: result.meta?.changes > 0 };
};

// ==============================================
// 删除笔记
// ==============================================

/**
 * 删除笔记（软删除 → 移入回收站）
 * 🚀 软删除性能更好：不需要索引重组，仅更新 deleted_at 字段
 */
export const deleteNote = async (env, noteId, userId) => {
  const DB = getDB(env);

  const result = await DB.prepare(
    "UPDATE notes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND deleted_at IS NULL"
  ).bind(noteId, userId).run();

  try {
    await cache.deleteCachedHotNote(env, userId, noteId);
    rebuildNotesListCache(env, userId).catch(() => {});
  } catch (_) {}

  return { success: result.meta?.changes > 0 };
};
