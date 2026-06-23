// share.service.js v2.0.0
/**
 * 分享业务逻辑层
 * 从原始 worker.js 提取的分享相关核心逻辑
 * 处理分享链接的创建、访问、验证
 */

import { getDB } from "../config/database.js";
import { ERRORS } from "../utils/error.js";
import { getFrontendDomain } from "../config/constants.js";

/**
 * 创建笔记分享链接
 * @param {Object} env - Workers 环境变量
 * @param {string} noteId - 笔记 ID
 * @param {string} userId - 用户 ID
 * @param {Object} options - 分享选项
 * @param {number} [options.maxViews] - 最大访问次数
 * @param {number} [options.expireInDays] - 过期天数
 * @returns {Promise<Object>} 分享结果，包含分享链接
 */
export const createShareLink = async (env, noteId, userId, options = {}) => {
  const DB = getDB(env);

  // 生成唯一分享码
  const shareCode = crypto.randomUUID().replace(/-/g, "").substring(0, 16);
  const { maxViews, expireInDays } = options;

  let expireAt = null;
  if (expireInDays) {
    const date = new Date();
    date.setDate(date.getDate() + expireInDays);
    expireAt = date.toISOString();
  }

  await DB.prepare(
    "INSERT INTO shares (note_id, user_id, share_code, max_views, expire_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(noteId, userId, shareCode, maxViews || null, expireAt).run();

  const shareUrl = `${getFrontendDomain(env)}/#/shared/${shareCode}`;

  return { shareCode, shareUrl };
};

/**
 * 获取用户的分享列表
 * @param {Object} env - Workers 环境变量
 * @param {string} userId - 用户 ID
 * @returns {Promise<Array>} 分享列表
 */
export const getShareLinks = async (env, userId) => {
  const DB = getDB(env);

  const shares = await DB.prepare(
    `SELECT s.id, s.share_code, s.max_views, s.view_count, s.expire_at, s.created_at,
            n.title as note_title
     FROM shares s
     LEFT JOIN notes n ON s.note_id = n.id
     WHERE s.user_id = ?
     ORDER BY s.created_at DESC`
  ).bind(userId).all();

  return shares.results;
};

/**
 * 通过分享码获取分享信息（公开访问）
 * @param {Object} env - Workers 环境变量
 * @param {string} shareCode - 分享码
 * @returns {Promise<Object>} 分享信息，包含笔记内容
 */
export const getShareByCode = async (env, shareCode) => {
  const DB = getDB(env);

  const share = await DB.prepare(
    `SELECT s.id, s.note_id, s.max_views, s.view_count, s.expire_at,
            n.title, n.content, n.category, n.updated_at
     FROM shares s
     JOIN notes n ON s.note_id = n.id
     WHERE s.share_code = ?`
  ).bind(shareCode).first();

  if (!share) {
    throw { type: ERRORS.INVALID_SHARE_LINK };
  }

  // 检查过期
  if (share.expire_at && new Date(share.expire_at) < new Date()) {
    throw { type: ERRORS.SHARE_EXPIRED };
  }

  // 检查访问上限
  if (share.max_views && share.view_count >= share.max_views) {
    throw { type: ERRORS.SHARE_MAX_VIEWS };
  }

  // 增加访问计数
  await DB.prepare(
    "UPDATE shares SET view_count = view_count + 1 WHERE id = ?"
  ).bind(share.id).run();

  return {
    title: share.title,
    content: share.content,
    category: share.category,
    updatedAt: share.updated_at
  };
};

/**
 * 删除分享链接
 * @param {Object} env - Workers 环境变量
 * @param {string} shareId - 分享 ID
 * @param {string} userId - 用户 ID
 * @returns {Promise<Object>} 删除结果
 */
export const deleteShareLink = async (env, shareId, userId) => {
  const DB = getDB(env);

  const result = await DB.prepare(
    "DELETE FROM shares WHERE id = ? AND user_id = ?"
  ).bind(shareId, userId).run();

  return { success: result.meta?.changes > 0 };
};