// api/index.js - API 模块统一导出入口
/**
 * 统一导出所有 API 函数
 * 定义默认 API_BASE 地址
 * 
 * 模块划分：
 * - user.api.js → 用户认证（登录/注册/重置密码）
 * - note.api.js → 笔记 + 分类 + 分享（CRUD 操作）
 */

// 默认 API 服务器地址
// 前端和后端从同一个域名提供（Cloudflare Worker 或 Docker Express 都如此），
// 所以直接使用当前域名即可。
// 本地开发时：wrangler dev 或 Docker 都在同一端口提供服务。
const getApiBase = () => {
  // 使用当前页面的 origin（协议+域名+端口），API 和前端同源
  return window.location.origin;
};
export const API_BASE = getApiBase();

/**
 * 构建 API 请求的认证头
 * 同时发送 JWT Token（新）和 X-User-Id（向后兼容）
 * @param {string} userId - 用户 ID
 * @returns {Object} Headers 对象
 */
export function getAuthHeaders(userId) {
  const headers = { 'X-User-Id': userId || '' };
  const token = sessionStorage.getItem('authToken');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * 构建带 Content-Type 的认证头
 * @param {string} userId - 用户 ID
 * @returns {Object} Headers 对象
 */
export function getAuthHeadersWithContentType(userId) {
  return {
    'Content-Type': 'application/json',
    ...getAuthHeaders(userId)
  };
}

// 导出所有用户认证 API
export {
  loginUser,
  registerUser,
  resetPassword,
  verifyRecoveryCode,
  resetPasswordViaRecovery
} from "./user.api.js";

// 导出所有笔记/分类/分享 API
export {
  // 笔记
  fetchNotes,
  fetchNotesPaginated,    // v2 分页获取
  fetchNoteById,          // v2 获取单条
  saveNote,               // v1 兼容（经典版）
  createNoteV2,           // v2 创建（现代版）
  updateNoteV2,           // v2 更新（现代版）
  deleteNote,
  batchDeleteNotes,
  // 回收站
  fetchTrashNotes,
  restoreNote,
  permanentDeleteNote,
  clearTrash,
  // 分类
  fetchCategories,
  saveCategory,
  updateCategory,
  removeCategory,
  // 分享
  createShareLink,
  fetchShareByKey
} from "./note.api.js";
