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
 * POST /user/login
 * Body: { key_hash }
 * 
 * （从原始 index.html 精确提取，请求路径/方法/参数/请求头不变）
 */
export async function loginUser(apiBase, keyHash) {
  const res = await fetch(`${apiBase}/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key_hash: keyHash })
  });
  return res;
}

/**
 * 用户注册（创建新账号）
 * POST /user/register
 * Body: { key_hash }
 * 返回包含 recovery_code
 * 
 * （从原始 index.html 精确提取，请求路径/方法/参数/请求头不变）
 */
export async function registerUser(apiBase, keyHash) {
  const res = await fetch(`${apiBase}/user/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key_hash: keyHash })
  });
  return res;
}

/**
 * 使用恢复码重置主密钥
 * POST /user/reset-password
 * Body: { recovery_code, new_key_hash }
 * 返回新的恢复码
 * 
 * （从原始 index.html 精确提取，请求路径/方法/参数/请求头不变）
 */
export async function resetPassword(apiBase, recoveryCode, newKeyHash) {
  const res = await fetch(`${apiBase}/user/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recovery_code: recoveryCode,
      new_key_hash: newKeyHash
    })
  });
  return res;
}