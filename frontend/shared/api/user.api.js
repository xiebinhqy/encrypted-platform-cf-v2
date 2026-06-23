// user.api.js - 用户认证 API ⚠️ 保持原始请求路径、参数、请求头完全不变
/**
 * 用户认证相关 API 调用
 * 从原始 index.html 精确提取
 * 
 * API_BASE 由 index.js 统一导出
 * 所有请求路径、参数、请求头与原始代码完全一致
 */

/**
 * 用户登录（验证主密钥哈希）
 * POST /api/auth/login
 * Body: { publicKey }
 * 返回: { userId }
 */
export async function loginUser(apiBase, keyHash) {
  const res = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey: keyHash })
  });
  return res;
}

/**
 * 用户注册（创建新账号）
 * POST /api/auth/register
 * Body: { publicKey, recoveryCodeHash }
 * 返回: { success }
 */
export async function registerUser(apiBase, keyHash, recoveryCodeHash) {
  const res = await fetch(`${apiBase}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: keyHash,
      recoveryCodeHash: recoveryCodeHash
    })
  });
  return res;
}

/**
 * 使用恢复码重置主密钥（旧版兼容）
 * POST /api/auth/recover
 * Body: { publicKey, recoveryCodeHash }
 * 返回: { success }
 * 
 * @param {string} apiBase - API 基础地址
 * @param {string} recoveryCodeHash - 恢复码的 SHA-256 哈希（非明文）
 * @param {string} newKeyHash - 新主密钥的 SHA-256 哈希
 */
export async function resetPassword(apiBase, recoveryCodeHash, newKeyHash) {
  const res = await fetch(`${apiBase}/api/auth/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: newKeyHash,
      recoveryCodeHash: recoveryCodeHash
    })
  });
  return res;
}

/**
 * 验证恢复码（一次性使用）
 * POST /api/auth/recovery-code/verify
 * @param {string} apiBase - API 基础地址
 * @param {string} recoveryCodeHash - 恢复码的 SHA-256 哈希
 * @returns {Promise<Response>}
 */
export async function verifyRecoveryCode(apiBase, recoveryCodeHash) {
  return await fetch(`${apiBase}/api/auth/recovery-code/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recoveryCodeHash })
  });
}

/**
 * 恢复码验证后重置密码
 * POST /api/auth/recovery-code/reset
 * @param {string} apiBase - API 基础地址
 * @param {number} userId - 用户 ID
 * @param {string} newPublicKey - 新登录密码的 SHA-256 哈希
 * @param {string} newRecoveryCodeHash - 新恢复码的 SHA-256 哈希
 * @returns {Promise<Response>}
 */
export async function resetPasswordViaRecovery(apiBase, userId, newPublicKey, newRecoveryCodeHash) {
  return await fetch(`${apiBase}/api/auth/recovery-code/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, newPublicKey, newRecoveryCodeHash })
  });
}
