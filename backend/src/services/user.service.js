// user.service.js v5.0.0
/**
 * 用户业务逻辑层
 * v5.0.0 新增：
 * - verifyRecoveryCode(): 验证恢复码（一次性使用）
 * - resetPassword(): 重置登录密码
 * - loginOrRegister: 注册时存储 recoveryCodeHash，登录后标记恢复码为已创建
 * - getUserById(): 获取用户信息
 */

import { getDB } from "../config/database.js";
import { ERRORS } from "../utils/error.js";

/**
 * 用户注册
 * 存储公钥和恢复码哈希
 * @param {Object} env - Workers 环境变量
 * @param {string} publicKey - 用户公钥（SHA-256 哈希）
 * @param {string} recoveryCodeHash - 恢复码哈希
 * @returns {Promise<Object>} 注册结果
 */
export const registerUser = async (env, publicKey, recoveryCodeHash) => {
  const DB = getDB(env);

  const existing = await DB.prepare("SELECT public_key FROM users WHERE public_key = ?").bind(publicKey).first();
  if (existing) {
    throw { type: ERRORS.KEY_EXISTS };
  }
  await DB.prepare(
    "INSERT INTO users (public_key, recovery_code_hash, recovery_code_used, failed_attempts) VALUES (?, ?, 0, 0)"
  ).bind(publicKey, recoveryCodeHash).run();

  return { success: true };
};

/**
 * 用户登录（验证密钥）
 * @param {Object} env - Workers 环境变量
 * @param {string} publicKey - 用户公钥（SHA-256 哈希）
 * @returns {Promise<Object>} 登录结果，包含 userId
 */
export const loginUser = async (env, publicKey) => {
  const DB = getDB(env);

  const user = await DB.prepare("SELECT id FROM users WHERE public_key = ?").bind(publicKey).first();

  if (!user) {
    throw { type: ERRORS.USER_NOT_FOUND };
  }

  return { userId: user.id };
};

/**
 * 验证恢复码（一次性使用）
 * @param {Object} env - Workers 环境变量
 * @param {string} recoveryCodeHash - 恢复码哈希
 * @returns {Promise<Object>} 验证结果，包含 userId
 */
export const verifyRecoveryCode = async (env, recoveryCodeHash) => {
  const DB = getDB(env);

  const user = await DB.prepare(
    "SELECT id, recovery_code_used FROM users WHERE recovery_code_hash = ?"
  ).bind(recoveryCodeHash).first();

  if (!user) {
    throw { type: ERRORS.INVALID_RECOVERY_CODE };
  }

  if (user.recovery_code_used === 1) {
    throw { type: ERRORS.RECOVERY_CODE_USED };
  }

  // 标记恢复码已使用（一次性）
  await DB.prepare("UPDATE users SET recovery_code_used = 1 WHERE id = ?").bind(user.id).run();

  return { userId: user.id, success: true };
};

/**
 * 重置登录密码（忘记密码后）
 * @param {Object} env - Workers 环境变量
 * @param {number} userId - 用户 ID
 * @param {string} newPublicKey - 新的登录密码哈希
 * @param {string} newRecoveryCodeHash - 新的恢复码哈希
 * @returns {Promise<Object>} 重置结果
 */
export const resetPassword = async (env, userId, newPublicKey, newRecoveryCodeHash) => {
  const DB = getDB(env);

  await DB.prepare(
    "UPDATE users SET public_key = ?, recovery_code_hash = ?, recovery_code_used = 0, failed_attempts = 0 WHERE id = ?"
  ).bind(newPublicKey, newRecoveryCodeHash, userId).run();

  return { success: true };
};

/**
 * 获取用户信息
 * @param {Object} env - Workers 环境变量
 * @param {number} userId - 用户 ID
 * @returns {Promise<Object>} 用户信息
 */
export const getUserById = async (env, userId) => {
  const DB = getDB(env);
  const user = await DB.prepare("SELECT id, public_key, recovery_code_hash, recovery_code_used, created_at FROM users WHERE id = ?").bind(userId).first();
  return user || null;
};

/**
 * 用户恢复（旧版兼容保留）
 * 通过恢复码重置公钥
 * @param {Object} env - Workers 环境变量
 * @param {string} publicKey - 新用户公钥
 * @param {string} recoveryCodeHash - 恢复码哈希
 * @returns {Promise<Object>} 恢复结果
 */
export const recoverUser = async (env, publicKey, recoveryCodeHash) => {
  const DB = getDB(env);

  const user = await DB.prepare("SELECT id FROM users WHERE recovery_code_hash = ?").bind(recoveryCodeHash).first();
  if (!user) {
    throw { type: ERRORS.INVALID_RECOVERY_CODE };
  }
  await DB.prepare("UPDATE users SET public_key = ? WHERE id = ?").bind(publicKey, user.id).run();

  return { success: true };
};

/**
 * 登录或注册（v1 兼容）
 * @param {Object} env - Workers 环境变量
 * @param {string} publicKey - 用户公钥
 * @param {string} recoveryCodeHash - 恢复码哈希
 * @returns {Promise<Object>} 结果
 */
export const loginOrRegister = async (env, publicKey, recoveryCodeHash) => {
  try {
    await loginUser(env, publicKey);
    const user = await DB.prepare("SELECT id FROM users WHERE public_key = ?").bind(publicKey).first();
    return { success: true, userId: user?.id };
  } catch (error) {
    if (error.type && error.type === ERRORS.USER_NOT_FOUND) {
      await registerUser(env, publicKey, recoveryCodeHash);
      const user = await DB.prepare("SELECT id FROM users WHERE public_key = ?").bind(publicKey).first();
      return { success: true, userId: user?.id };
    }
    throw error;
  }
};
