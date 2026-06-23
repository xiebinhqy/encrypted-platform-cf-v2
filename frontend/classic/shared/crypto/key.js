// key.js - 密钥派生核心 ⚠️ 核心加密代码，禁止修改
/**
 * ⚠️ 端对端加密密钥派生模块
 * 从原始 index.html 精确提取的密钥派生逻辑
 * 所有算法、函数名、参数保持一字不差
 * 
 * 使用 PBKDF2-like 方式（SHA-256 哈希）从用户主密钥派生 AES-GCM 密钥
 * 不可逆，确保主密钥安全性
 */

/**
 * ⚠️ 核心加密代码，禁止修改
 * 从主密钥派生 AES-GCM 加密密钥
 * 
 * 流程：
 * 1. 将主密钥字符串编码为 UTF-8 字节
 * 2. 使用 SHA-256 哈希生成 32 字节摘要
 * 3. 将摘要导入为 AES-GCM 密钥，仅用于加密/解密
 * 
 * @param {string} secret - 用户主密钥
 * @returns {Promise<CryptoKey>} AES-GCM 密钥对象
 * 
 * （从原始 index.html 精确提取，函数名和参数不变）
 */
export async function getKey(secret) {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(secret));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * ⚠️ 核心加密代码，禁止修改
 * 计算主密钥的十六进制哈希值（用于身份验证）
 * 
 * 流程：
 * 1. 将主密钥字符串编码为 UTF-8 字节
 * 2. 使用 SHA-256 哈希生成 32 字节摘要
 * 3. 将摘要转换为十六进制字符串
 * 
 * @param {string} secret - 用户主密钥
 * @returns {Promise<string>} 64字符的十六进制哈希字符串
 * 
 * （从原始 index.html 精确提取，函数名和参数不变）
 */
export async function getKeyHash(secret) {
  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(secret));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}