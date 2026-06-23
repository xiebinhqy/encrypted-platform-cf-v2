// jwt.js v1.0.0
/**
 * JWT Token 工具模块
 * 基于 Web Crypto API 的 JWT 签发与验证
 * 兼容 Cloudflare Workers 运行时（无 Node.js 依赖）
 * 
 * 算法：HMAC-SHA256
 * 过期时间：24 小时
 */

const ALGORITHM = { name: 'HMAC', hash: 'SHA-256' };
const EXPIRY_SECONDS = 86400; // 24 小时

/**
 * 将 Base64URL 编码的字符串解码为 Uint8Array
 */
function base64UrlToUint8Array(base64Url) {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 将 Uint8Array 编码为 Base64URL 字符串
 */
function uint8ArrayToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 将对象编码为 Base64URL 的 JSON
 */
function encodeJson(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  return uint8ArrayToBase64Url(bytes);
}

/**
 * 将 Base64URL 解码为对象
 */
function decodeJson(base64Url) {
  const bytes = base64UrlToUint8Array(base64Url);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

/**
 * 从 env 获取密钥，确保为 CryptoKey 对象
 */
async function getKeyFromSecret(env) {
  const secret = env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET 未配置');
  
  const keyData = new TextEncoder().encode(secret);
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    ALGORITHM,
    false,
    ['sign', 'verify']
  );
}

/**
 * 签发 JWT Token
 * @param {Object} env - Workers 环境变量
 * @param {Object} payload - 载荷数据（至少包含 userId）
 * @returns {Promise<string>} JWT Token 字符串
 */
export async function signToken(env, payload) {
  const key = await getKeyFromSecret(env);
  
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = {
    ...payload,
    iat: now,
    exp: now + EXPIRY_SECONDS
  };
  
  const headerEncoded = encodeJson(header);
  const bodyEncoded = encodeJson(body);
  const signatureInput = `${headerEncoded}.${bodyEncoded}`;
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signatureInput)
  );
  
  const signatureEncoded = uint8ArrayToBase64Url(new Uint8Array(signature));
  return `${signatureInput}.${signatureEncoded}`;
}

/**
 * 验证并解码 JWT Token
 * @param {Object} env - Workers 环境变量
 * @param {string} token - JWT Token 字符串
 * @returns {Promise<Object|null>} 解码后的载荷，验证失败返回 null
 */
export async function verifyToken(env, token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [headerEncoded, bodyEncoded, signatureEncoded] = parts;
    const key = await getKeyFromSecret(env);
    
    // 验证签名
    const signatureInput = `${headerEncoded}.${bodyEncoded}`;
    const signature = base64UrlToUint8Array(signatureEncoded);
    
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      new TextEncoder().encode(signatureInput)
    );
    
    if (!valid) return null;
    
    // 解码载荷
    const payload = decodeJson(bodyEncoded);
    
    // 检查过期时间
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    
    return payload;
  } catch (e) {
    console.error('JWT 验证失败:', e.message);
    return null;
  }
}