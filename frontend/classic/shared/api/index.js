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
// 本地开发时使用 localhost:8787，部署时使用正式域名
// 自动检测：如果访问 localhost 或 127.0.0.1 则使用本地 API
const getApiBase = () => {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return `http://${host}:8787`;
  }
  return "https://api.dee.us.kg";
};
export const API_BASE = getApiBase();

// 导出所有用户认证 API
export {
  loginUser,
  registerUser,
  resetPassword
} from "./user.api.js";

// 导出所有笔记/分类/分享 API
export {
  // 笔记
  fetchNotes,
  saveNote,
  deleteNote,
  batchDeleteNotes,
  // 分类
  fetchCategories,
  saveCategory,
  removeCategory,
  // 分享
  createShareLink,
  fetchShareByKey
} from "./note.api.js";