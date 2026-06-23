// hot-cold.service.js v1.0.0
/**
 * 冷热数据升降级服务
 * 
 * 核心理念：
 * 用户 85% 的操作集中在最近 20% 的笔记上
 * → 热笔记存在 KV（5ms 读取），冷笔记存在 D1（50ms 读取）
 * → 自动升降级，用户无感知
 * 
 * 热数据判定规则：
 * - last_access_at 在 15 天内 → 热数据（存入 KV）
 * - last_access_at 超过 15 天 → 冷数据（仅 D1，KV 保留摘要）
 * 
 * 触发时机：
 * 1. 用户点击/编辑笔记时 → 记录访问时间 + 自动提升为热数据
 * 2. 每日 Cron Job → 批量扫描冷数据，从 KV 降级
 * 3. 写入操作 → 同时写 D1 + KV（保持热数据新鲜）
 */

import { getDB } from "../config/database.js";
import { HOT_DATA_THRESHOLD_MS } from "../config/constants.js";
import * as cache from "./cache.service.js";

// ==============================================
// 冷热判定
// ==============================================

/**
 * 判断笔记是否为热数据
 * @param {string} lastAccessISO - 最后访问时间的 ISO 字符串
 * @returns {boolean}
 */
export const isHotData = (lastAccessISO) => {
  if (!lastAccessISO) return true; // 无记录时默认热数据
  const lastAccess = new Date(lastAccessISO).getTime();
  const now = Date.now();
  return (now - lastAccess) < HOT_DATA_THRESHOLD_MS;
};

/**
 * 判断笔记是否为冷数据
 * @param {string} lastAccessISO - 最后访问时间的 ISO 字符串
 * @returns {boolean}
 */
export const isColdData = (lastAccessISO) => {
  return !isHotData(lastAccessISO);
};

// ==============================================
// 热数据提升（冷→热）
// ==============================================

/**
 * 将笔记提升为热数据（标记 + 写入 KV 缓存）
 * 在用户访问笔记时自动触发
 * 
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @param {Object} note - 笔记数据（来自 D1 的完整数据）
 */
export const promoteToHot = async (env, userId, note) => {
  try {
    const DB = getDB(env);

    // 1. 更新 D1 中的热标记和访问时间
    await DB.prepare(
      "UPDATE notes SET is_hot = 1, last_access_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
    ).bind(note.id, userId).run();

    // 2. 写入热笔记内容到 KV
    await cache.setCachedHotNote(env, userId, note.id, {
      id: note.id,
      title_cipher: note.title || "",
      ciphertext: note.content || "",
      category_cipher: note.category || "",
      tags_cipher: note.tags || "",
      updated_at: note.updated_at,
      last_access_at: new Date().toISOString()
    });

    // 3. 记录访问时间
    await cache.recordAccess(env, userId, note.id);

    // 4. 更新 KV 中的笔记列表（更新热/冷标记）
    await updateNoteListCache(env, userId, note.id, true);

  } catch (error) {
    console.error("提升热数据失败:", error);
    // 失败不影响主流程，只是缓存失效
  }
};

// ==============================================
// 降级为冷数据（热→冷）
// ==============================================

/**
 * 将笔记降级为冷数据（从 KV 中移除完整内容，仅保留摘要）
 * 由 Cron Job 批量调用
 * 
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @param {string} noteId - 笔记 ID
 */
export const demoteToCold = async (env, userId, noteId) => {
  try {
    const DB = getDB(env);

    // 1. 更新 D1 中的热标记
    await DB.prepare(
      "UPDATE notes SET is_hot = 0 WHERE id = ? AND user_id = ?"
    ).bind(noteId, userId).run();

    // 2. 从 KV 中删除热笔记完整内容
    await cache.deleteCachedHotNote(env, userId, noteId);

    // 3. 更新 KV 中的笔记列表（更新热/冷标记）
    await updateNoteListCache(env, userId, noteId, false);

  } catch (error) {
    console.error("降级冷数据失败:", error);
  }
};

// ==============================================
// 记录笔记访问 + 自动提升
// ==============================================

/**
 * 记录用户访问笔记，自动做冷热提升
 * 在前端请求笔记详情时调用
 * 
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @param {string} noteId - 笔记 ID
 * @param {Object} noteData - 笔记完整数据（来自 D1）
 */
export const onNoteAccessed = async (env, userId, noteId, noteData) => {
  try {
    // 1. 记录访问时间到 KV（快速）
    await cache.recordAccess(env, userId, noteId);

    // 2. 更新 D1 的 last_access_at（异步，不阻塞）
    const DB = getDB(env);
    DB.prepare(
      "UPDATE notes SET last_access_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
    ).bind(noteId, userId).run().catch(() => {});

    // 3. 检查是否需要提升为热数据
    const lastAccess = await cache.getLastAccess(env, userId, noteId);
    if (isHotData(lastAccess || new Date().toISOString())) {
      // 已经是热数据，只需更新 KV 中的内容
      await cache.setCachedHotNote(env, userId, noteId, {
        id: noteId,
        title_cipher: noteData.title || "",
        ciphertext: noteData.content || "",
        category_cipher: noteData.category || "",
        tags_cipher: noteData.tags || "",
        updated_at: noteData.updated_at,
        last_access_at: new Date().toISOString()
      });
    }
  } catch (error) {
    // 静默失败，不影响主流程
    console.error("onNoteAccessed 错误:", error);
  }
};

// ==============================================
// 冷热升降级扫描（Cron Job 用）
// ==============================================

/**
 * 批量扫描所有用户的所有笔记，执行冷热升降级
 * 由 Cron Job 每日触发一次
 * 
 * @param {Object} env - Workers 环境变量
 * @param {Object} ctx - Workers 上下文（用于 waitUntil）
 * @returns {Promise<Object>} 统计数据
 */
export const scanAndBalance = async (env, ctx) => {
  const DB = getDB(env);
  const stats = { scanned: 0, promoted: 0, demoted: 0, errors: 0 };

  try {
    // 1. 获取所有活跃用户
    const users = await DB.prepare(
      "SELECT DISTINCT user_id FROM notes WHERE deleted_at IS NULL"
    ).all();

    if (!users.results || users.results.length === 0) {
      return { ...stats, message: "无用户数据" };
    }

    // 2. 对每个用户执行冷热平衡
    for (const { user_id: userId } of users.results) {
      try {
        const result = await balanceUserNotes(env, userId);
        stats.scanned += result.scanned;
        stats.promoted += result.promoted;
        stats.demoted += result.demoted;
        stats.errors += result.errors;
      } catch (error) {
        console.error(`用户 ${userId} 冷热平衡失败:`, error);
        stats.errors++;
      }
    }

    // 3. 返回统计
    return {
      ...stats,
      message: `扫描完成: ${stats.scanned} 条笔记, ${stats.promoted} 条提升, ${stats.demoted} 条降级`
    };
  } catch (error) {
    console.error("冷热扫描失败:", error);
    return { ...stats, message: "扫描失败: " + error.message };
  }
};

/**
 * 对单个用户执行冷热平衡
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @returns {Promise<Object>} 统计信息
 */
async function balanceUserNotes(env, userId) {
  const DB = getDB(env);
  const stats = { scanned: 0, promoted: 0, demoted: 0, errors: 0 };

  // 获取该用户所有未删除的笔记
  const notes = await DB.prepare(
    "SELECT id, title, content, category, tags, updated_at, last_access_at, is_hot FROM notes WHERE user_id = ? AND deleted_at IS NULL"
  ).bind(userId).all();

  if (!notes.results) return stats;

  for (const note of notes.results) {
    try {
      stats.scanned++;
      const lastAccess = note.last_access_at;
      const hot = isHotData(lastAccess);

      if (hot && !note.is_hot) {
        // 应该是热数据但 D1 标记为冷 → 提升
        await promoteToHot(env, userId, note);
        stats.promoted++;
      } else if (!hot && note.is_hot) {
        // 应该是冷数据但 D1 标记为热 → 降级
        await demoteToCold(env, userId, note.id);
        stats.demoted++;
      }
    } catch (error) {
      console.error(`笔记 ${note.id} 处理失败:`, error);
      stats.errors++;
    }
  }

  // 重建 KV 笔记列表缓存
  await rebuildNotesListCache(env, userId);

  return stats;
}

// ==============================================
// KV 笔记列表缓存重建
// ==============================================

/**
 * 重建用户的笔记列表缓存（从 D1 读取最新数据重建）
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 */
export const rebuildNotesListCache = async (env, userId) => {
  try {
    const DB = getDB(env);

    const notes = await DB.prepare(
      "SELECT id, title, content, category, tags, revision_count, updated_at, created_at, is_hot FROM notes WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC"
    ).bind(userId).all();

    if (!notes.results) return;

    const hotIds = [];
    const coldIds = [];
    const notesMap = {};

    for (const note of notes.results) {
      // 列表只存摘要（不含 content），减小体积
      const summary = {
        title_cipher: note.title || "",
        category_cipher: note.category || "",
        tags_cipher: note.tags || "",
        updated_at: new Date(note.updated_at).getTime(),
        created_at: new Date(note.created_at).getTime(),
        revision_count: note.revision_count || 1,
        is_hot: !!note.is_hot
      };

      notesMap[note.id] = summary;

      if (note.is_hot) {
        hotIds.push(note.id);
      } else {
        coldIds.push(note.id);
      }
    }

    await cache.setCachedNotesList(env, userId, {
      notes: notesMap,
      hot_ids: hotIds,
      cold_ids: coldIds,
      updated_at: Date.now()
    });
  } catch (error) {
    console.error("重建笔记列表缓存失败:", error);
  }
};

// ==============================================
// 更新单条笔记在 KV 列表缓存中的状态
// ==============================================

/**
 * 更新 KV 笔记列表缓存中的单条笔记状态
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @param {string} noteId - 笔记 ID
 * @param {boolean} isHot - 是否为热数据
 */
async function updateNoteListCache(env, userId, noteId, isHot) {
  try {
    const cachedList = await cache.getCachedNotesList(env, userId);
    if (!cachedList || !cachedList.notes) return;

    // 更新热/冷标记
    if (cachedList.notes[noteId]) {
      cachedList.notes[noteId].is_hot = isHot;
    }

    // 更新 hot_ids / cold_ids
    cachedList.hot_ids = cachedList.hot_ids || [];
    cachedList.cold_ids = cachedList.cold_ids || [];

    if (isHot) {
      cachedList.hot_ids = [...new Set([...cachedList.hot_ids, noteId])];
      cachedList.cold_ids = cachedList.cold_ids.filter(id => id !== noteId);
    } else {
      cachedList.cold_ids = [...new Set([...cachedList.cold_ids, noteId])];
      cachedList.hot_ids = cachedList.hot_ids.filter(id => id !== noteId);
    }

    cachedList.updated_at = Date.now();
    await cache.setCachedNotesList(env, userId, cachedList);
  } catch (error) {
    console.error("更新列表缓存失败:", error);
  }
}