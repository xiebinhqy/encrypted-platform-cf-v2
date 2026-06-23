// key.js - 密钥派生核心 ⚠️ 核心加密代码，禁止修改
/**
 * ⚠️ 端对端加密密钥派生模块
 * 从原始 index.html 精确提取的密钥派生逻辑
 * 所有算法、函数名、参数保持一字不差
 * 
 * 使用 PBKDF2-like 方式（SHA-256 哈希）从用户主密钥派生 AES-GCM 密钥
 * 不可逆，确保主密钥安全性
 * 
 * 性能优化：密钥派生结果在内存中缓存，同一密钥只计算一次
 */

// ===== 密钥缓存（性能优化） =====
// 整个会话中密钥不变，避免每次加解密都重新执行 SHA-256 + importKey
let _cachedKey = null;
let _cachedSecret = null;

/**
 * ⚠️ 核心加密代码（函数签名和行为不变）
 * 从主密钥派生 AES-GCM 加密密钥
 * 
 * 流程：
 * 1. 检查缓存，如果密钥相同则直接返回缓存的 CryptoKey
 * 2. 将主密钥字符串编码为 UTF-8 字节
 * 3. 使用 SHA-256 哈希生成 32 字节摘要
 * 4. 将摘要导入为 AES-GCM 密钥，仅用于加密/解密
 * 5. 缓存结果供后续调用复用
 * 
 * @param {string} secret - 用户主密钥
 * @returns {Promise<CryptoKey>} AES-GCM 密钥对象
 * 
 * （从原始 index.html 精确提取，函数名和参数不变）
 */
export async function getKey(secret) {
  // 命中缓存：同一密钥直接返回，跳过 SHA-256 + importKey
  if (_cachedKey && _cachedSecret === secret) {
    return _cachedKey;
  }
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(secret));
  const key = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  // 缓存结果
  _cachedKey = key;
  _cachedSecret = secret;
  return key;
}

/**
 * 清除密钥缓存（锁定系统时调用，确保安全）
 */
export function clearKeyCache() {
  _cachedKey = null;
  _cachedSecret = null;
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