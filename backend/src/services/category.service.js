// category.service.js v2.1.0
/**
 * 分类业务逻辑层
 * 从原始 worker.js 提取的分类相关核心逻辑
 * 处理分类的增删改查
 * 
 * v2.1.0 变更：
 * - 新增 KV 缓存层（缓存分类列表，减少 D1 查询）
 * - 分类变化频率低，缓存有效期 7 天
 * - 写入操作同时更新缓存
 */

import { getDB } from "../config/database.js";
import { getNotesCacheKV } from "../config/constants.js";
import * as cache from "./cache.service.js";

/**
 * 获取用户所有分类
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @returns {Promise<Array>} 分类列表
 */
export const getCategories = async (env, userId) => {
  const DB = getDB(env);

  // ===== 策略 1: 优先从 KV 缓存读取 =====
  try {
    const cached = await cache.getCachedCategories(env, userId);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
  } catch (_) {}

  // ===== 策略 2: 从 D1 读取并写入缓存 =====
  const categories = await DB.prepare(
    "SELECT id, name, color FROM categories WHERE user_id = ? ORDER BY id"
  ).bind(userId).all();

  const result = categories.results.map(cat => ({
    id: cat.id,
    name_cipher: cat.name || "",
    color: cat.color || ""
  }));

  // 异步写入缓存（不阻塞返回）
  try {
    await cache.setCachedCategories(env, userId, result);
  } catch (_) {}

  return result;
};

/**
 * 创建分类
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @param {string} name - 分类名称
 * @param {string} color - 分类颜色
 * @returns {Promise<Object>} 创建结果
 */
export const createCategory = async (env, userId, name, color, categoryId) => {
  const DB = getDB(env);

  // 使用前端提供的 UUID，如果没有则生成一个
  const id = categoryId || crypto.randomUUID();
  
  // 先检查是否已存在相同 ID（防止前端重复提交）
  const existing = await DB.prepare(
    "SELECT id FROM categories WHERE id = ?"
  ).bind(id).first();
  
  if (existing) {
    // 已存在则更新
    // 🚨 修复：同时写入 name_cipher（兼容 v1 旧表 NOT NULL 约束）
    await DB.prepare(
      "UPDATE categories SET name = ?, name_cipher = ?, color = ? WHERE id = ?"
    ).bind(name, name, color || "", id).run();
  } else {
    const now = new Date().toISOString();
    // 🚨 修复：同时写入 name_cipher（兼容 v1 旧表 NOT NULL 约束）
    // 🚨 修复：同时写入 created_at（兼容 staging 数据库 NOT NULL 约束）
    await DB.prepare(
      "INSERT INTO categories (id, user_id, name, name_cipher, color, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(id, userId, name, name, color || "", now).run();
  }

  // 使分类缓存失效（下次读取自动重建）
  try {
    await cache.deleteCachedCategories(env, userId);
  } catch (_) {}

  return { id: id, success: true };
};

/**
 * 更新分类
 * @param {Object} env - Workers 环境变量
 * @param {string} categoryId - 分类 ID
 * @param {string} userId - 用户 ID
 * @param {string} name - 分类名称
 * @param {string} color - 分类颜色
 * @returns {Promise<Object>} 更新结果
 */
export const updateCategory = async (env, categoryId, userId, name, color) => {
  const DB = getDB(env);

  // 🚨 修复：同时更新 name_cipher（兼容 v1 旧表 NOT NULL 约束）
  const result = await DB.prepare(
    "UPDATE categories SET name = ?, name_cipher = ?, color = ? WHERE id = ? AND user_id = ?"
  ).bind(name, name, color, categoryId, userId).run();

  // 使分类缓存失效（下次读取自动重建）
  try {
    await cache.deleteCachedCategories(env, userId);
  } catch (_) {}

  return { success: result.meta?.changes > 0 };
};

/**
 * 删除分类
 * @param {Object} env - Workers 环境变量
 * @param {string} categoryId - 分类 ID
 * @param {string} userId - 用户 ID
 * @returns {Promise<Object>} 删除结果
 */
export const deleteCategory = async (env, categoryId, userId) => {
  const DB = getDB(env);

  const result = await DB.prepare(
    "DELETE FROM categories WHERE id = ? AND user_id = ?"
  ).bind(categoryId, userId).run();

  // 使分类缓存失效（下次读取自动重建）
  try {
    await cache.deleteCachedCategories(env, userId);
  } catch (_) {}

  return { success: result.meta?.changes > 0 };
};