// cache.service.js v1.0.0
/**
 * KV 缓存服务层
 * 冷热数据分离架构的核心缓存层
 * 
 * 职责：
 * 1. 热笔记列表缓存（KV 读取速度 5-10ms，比 D1 快 5-10x）
 * 2. 热笔记完整内容缓存
 * 3. 冷热数据自动升级（冷→热）
 * 
 * KV Key 设计：
 *   "notes:{userId}"                    — 用户笔记摘要列表（含冷热标记）
 *   "hot:{userId}:{noteId}"             — 热笔记完整内容（含 ciphertext）
 *   "access:{userId}:{noteId}"          — 最后访问时间戳
 *   "categories:{userId}"              — 分类列表缓存
 */

import { getNotesCacheKV, HOT_DATA_THRESHOLD_MS } from "../config/constants.js";

// ==============================================
// KV Key 生成
// ==============================================

const Keys = {
  notesList: (userId) => `notes:${userId}`,
  hotNote: (userId, noteId) => `hot:${userId}:${noteId}`,
  access: (userId, noteId) => `access:${userId}:${noteId}`,
  categories: (userId) => `categories:${userId}`
};

// ==============================================
// 笔记列表缓存（核心！所有读取优先走这里）
// ==============================================

/**
 * 从缓存获取笔记摘要列表
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @returns {Promise<Object|null>} { notes, hot_ids, cold_ids } 或 null
 */
export const getCachedNotesList = async (env, userId) => {
  try {
    const KV = getNotesCacheKV(env);
    const data = await KV.get(Keys.notesList(userId), "json");
    return data || null;
  } catch (error) {
    console.error("获取缓存笔记列表失败:", error);
    return null; // 缓存失败回退到 D1
  }
};

/**
 * 写入笔记摘要列表到缓存
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @param {Object} data - 缓存数据 { notes, hot_ids, cold_ids }
 */
export const setCachedNotesList = async (env, userId, data) => {
  try {
    const KV = getNotesCacheKV(env);
    await KV.put(Keys.notesList(userId), JSON.stringify(data), {
      expirationTtl: 86400 * 30 // 30 天 TTL（冷热升降级机制维护）
    });
  } catch (error) {
    console.error("写入缓存笔记列表失败:", error);
  }
};

/**
 * 从缓存中删除笔记列表（笔记创建/删除时调用）
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 */
export const deleteCachedNotesList = async (env, userId) => {
  try {
    const KV = getNotesCacheKV(env);
    await KV.delete(Keys.notesList(userId));
  } catch (error) {
    console.error("删除缓存笔记列表失败:", error);
  }
};

// ==============================================
// 热笔记内容缓存
// ==============================================

/**
 * 获取热笔记完整内容
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @param {string} noteId - 笔记 ID
 * @returns {Promise<Object|null>} 笔记内容或 null
 */
export const getCachedHotNote = async (env, userId, noteId) => {
  try {
    const KV = getNotesCacheKV(env);
    const data = await KV.get(Keys.hotNote(userId, noteId), "json");
    return data || null;
  } catch (error) {
    console.error("获取热笔记缓存失败:", error);
    return null;
  }
};

/**
 * 写入热笔记完整内容到缓存
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @param {string} noteId - 笔记 ID
 * @param {Object} noteData - 笔记数据 { title_cipher, ciphertext, category_cipher, tags_cipher, updated_at }
 */
export const setCachedHotNote = async (env, userId, noteId, noteData) => {
  try {
    const KV = getNotesCacheKV(env);
    await KV.put(Keys.hotNote(userId, noteId), JSON.stringify(noteData), {
      expirationTtl: 86400 * 30 // 30 天 TTL（由冷热升降级维护）
    });
  } catch (error) {
    console.error("写入热笔记缓存失败:", error);
  }
};

/**
 * 删除热笔记缓存
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @param {string} noteId - 笔记 ID
 */
export const deleteCachedHotNote = async (env, userId, noteId) => {
  try {
    const KV = getNotesCacheKV(env);
    await KV.delete(Keys.hotNote(userId, noteId));
  } catch (error) {
    console.error("删除热笔记缓存失败:", error);
  }
};

// ==============================================
// 最后访问时间（用于冷热判定）
// ==============================================

/**
 * 记录笔记最后访问时间
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @param {string} noteId - 笔记 ID
 */
export const recordAccess = async (env, userId, noteId) => {
  try {
    const KV = getNotesCacheKV(env);
    const now = new Date().toISOString();
    await KV.put(Keys.access(userId, noteId), now, {
      expirationTtl: 86400 * 60 // 60 天 TTL（冷热判定足够）
    });
  } catch (error) {
    console.error("记录访问时间失败:", error);
  }
};

/**
 * 获取笔记最后访问时间
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @param {string} noteId - 笔记 ID
 * @returns {Promise<string|null>} ISO 时间字符串或 null
 */
export const getLastAccess = async (env, userId, noteId) => {
  try {
    const KV = getNotesCacheKV(env);
    return await KV.get(Keys.access(userId, noteId));
  } catch (error) {
    return null;
  }
};

// ==============================================
// 分类缓存
// ==============================================

/**
 * 获取缓存的分类列表
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @returns {Promise<Array|null>} 分类列表或 null
 */
export const getCachedCategories = async (env, userId) => {
  try {
    const KV = getNotesCacheKV(env);
    return await KV.get(Keys.categories(userId), "json");
  } catch (error) {
    return null;
  }
};

/**
 * 写入分类列表到缓存
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @param {Array} categories - 分类列表
 */
export const setCachedCategories = async (env, userId, categories) => {
  try {
    const KV = getNotesCacheKV(env);
    await KV.put(Keys.categories(userId), JSON.stringify(categories), {
      expirationTtl: 86400 * 7 // 7 天 TTL（分类变化频率低）
    });
  } catch (error) {
    console.error("写入分类缓存失败:", error);
  }
};

/**
 * 删除分类缓存
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 */
export const deleteCachedCategories = async (env, userId) => {
  try {
    const KV = getNotesCacheKV(env);
    await KV.delete(Keys.categories(userId));
  } catch (error) {
    console.error("删除分类缓存失败:", error);
  }
};

// ==============================================
// 缓存健康检查
// ==============================================

/**
 * 检查 KV 缓存是否可用
 * @param {Object} env - Workers 环境变量
 * @returns {Promise<boolean>}
 */
export const isCacheHealthy = async (env) => {
  try {
    const KV = getNotesCacheKV(env);
    await KV.get("health:check");
    return true;
  } catch (error) {
    return false;
  }
};