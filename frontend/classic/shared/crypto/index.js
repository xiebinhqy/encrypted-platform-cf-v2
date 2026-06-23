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

export { getKey, getKeyHash } from "./key.js";
export { encrypt, decrypt } from "./aes.js";