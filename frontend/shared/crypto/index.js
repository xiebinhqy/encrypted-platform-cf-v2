 // crypto/index.js - 加密模块统一导出入口 ⚠️ 核心加密代码，禁止修改
/**
 * ⚠️ 端对端加密核心模块
 * 统一导出所有加密相关函数
 * 
 * 导出函数列表（与原始 index.html 中的函数名和参数完全一致）：
 * - getKey(secret)          → key.js：派生 AES-GCM 密钥
 * - getKeyHash(secret)      → key.js：计算十六进制哈希
 * - encrypt(plaintext, secret) → aes.js：AES-GCM 加密
 * - decrypt(ciphertextStr, secret) → aes.js：AES-GCM 解密
 */

export { getKey, getKeyHash, clearKeyCache } from "./key.js";
export { encrypt, decrypt } from "./aes.js";

/**
 * 纯 SHA-256 哈希（用于登录密码验证，不关联 AES-GCM 密钥）
 * @param {string} text - 要哈希的文本
 * @returns {Promise<string>} 十六进制哈希字符串
 */
export async function hashPassword(text) {
  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(text));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
