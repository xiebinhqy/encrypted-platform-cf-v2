// aes.js - AES-GCM 加密/解密核心 ⚠️ 核心加密代码，禁止修改
/**
 * ⚠️ 端对端加密核心模块
 * 从原始 index.html 精确提取的 AES-GCM 加密/解密逻辑
 * 所有算法、函数名、参数保持一字不差
 * 
 * 使用 AES-GCM 256-bit 认证加密算法
 * - 加密：随机生成 12 字节 IV → AES-GCM 加密 → base64(JSON{iv, ct})
 * - 解密：base64 解码 → 提取 iv 和 ct → AES-GCM 解密 → UTF-8 文本
 */

import { getKey } from "./key.js";

/**
 * ⚠️ 核心加密代码，禁止修改
 * AES-GCM 加密
 * 
 * 流程：
 * 1. 空文本直接返回空字符串
 * 2. 从主密钥派生 AES-GCM 密钥（调用 getKey）
 * 3. 生成 12 字节随机 IV
 * 4. 使用 AES-GCM 模式加密 UTF-8 编码的明文
 * 5. 将 IV 和密文打包为 JSON → base64 编码返回
 * 
 * @param {string} plaintext - 待加密的明文
 * @param {string} secret - 用户主密钥
 * @returns {Promise<string>} base64 编码的加密数据
 * 
 * （从原始 index.html 精确提取，函数名和参数不变）
 */
export async function encrypt(plaintext, secret) {
  if (!plaintext) return '';
  const key = await getKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  return btoa(JSON.stringify({
    iv: Array.from(iv),
    ct: Array.from(new Uint8Array(ciphertext))
  }));
}

/**
 * ⚠️ 核心加密代码，禁止修改
 * AES-GCM 解密
 * 
 * 流程：
 * 1. 空字符串直接返回空字符串
 * 2. base64 解码 → 解析 JSON 提取 iv 和 ct
 * 3. 从主密钥派生 AES-GCM 密钥（调用 getKey）
 * 4. 使用 AES-GCM 模式解密
 * 5. 将解密后的字节数组解码为 UTF-8 文本返回
 * 6. 任何错误返回空字符串并打印错误日志
 * 
 * @param {string} ciphertextStr - base64 编码的加密数据
 * @param {string} secret - 用户主密钥
 * @returns {Promise<string>} 解密后的明文
 * 
 * （从原始 index.html 精确提取，函数名和参数不变）
 */
export async function decrypt(ciphertextStr, secret) {
  if (!ciphertextStr) return '';
  try {
    const { iv, ct } = JSON.parse(atob(ciphertextStr));
    const key = await getKey(secret);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      new Uint8Array(ct)
    );
    return new TextDecoder().decode(plaintext);
  } catch (e) {
    console.error('解密失败:', e);
    return '';
  }
}