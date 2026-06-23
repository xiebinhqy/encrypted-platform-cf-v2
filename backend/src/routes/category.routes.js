// category.routes.js v2.1.0
/**
 * 分类路由
 * 只处理请求分发，不包含业务逻辑
 * 适配三环境配置
 */

import { jsonSuccess, jsonError } from "../utils/response.js";
import { ERRORS } from "../utils/error.js";
import * as categoryService from "../services/category.service.js";

/**
 * 处理分类相关路由
 * @param {Request} request - 原始请求对象
 * @param {Object} env - Workers 环境变量
 * @param {URL} url - 解析后的 URL 对象
 * @param {string} userId - 用户 ID
 * @returns {Promise<Response>}
 */
export const handleCategoryRoute = async (request, env, url, userId) => {
  switch (url.pathname) {
    case "/api/categories":
      if (request.method === "GET") {
        return handleGetCategories(env, userId);
      } else if (request.method === "POST") {
        const body = await request.json();
        return handleCreateCategory(env, userId, body);
      }
      break;
    default:
      // /api/categories/:id
      if (url.pathname.startsWith("/api/categories/") && request.method === "PUT") {
        const categoryId = url.pathname.split("/api/categories/")[1];
        const body = await request.json();
        return handleUpdateCategory(env, categoryId, userId, body);
      } else if (url.pathname.startsWith("/api/categories/") && request.method === "DELETE") {
        const categoryId = url.pathname.split("/api/categories/")[1];
        return handleDeleteCategory(env, categoryId, userId);
      }
      break;
  }

  return jsonError(ERRORS.NOT_FOUND.message, ERRORS.NOT_FOUND.status, env);
};

/**
 * 获取分类列表
 * GET /api/categories
 */
const handleGetCategories = async (env, userId) => {
  try {
    const categories = await categoryService.getCategories(env, userId);
    return jsonSuccess(categories, env);
  } catch (error) {
    return jsonError("获取分类列表失败", 500, env);
  }
};

/**
 * 创建分类
 * POST /api/categories
 * Body: { name_cipher, color }
 * 数据端对端加密，服务器只存储不解密
 */
const handleCreateCategory = async (env, userId, body) => {
  try {
    const { id, name_cipher, color } = body;
    if (!name_cipher) {
      return jsonError("分类名称不能为空", 400, env);
    }
    const result = await categoryService.createCategory(env, userId, name_cipher, color, id || crypto.randomUUID());
    return jsonSuccess(result, env, 201);
  } catch (error) {
    console.error("[Category Route] 创建分类失败:", error.message, error.stack);
    return jsonError("创建分类失败: " + (error.message || "未知错误"), 500, env);
  }
};

/**
 * 更新分类
 * PUT /api/categories/:id
 * Body: { name_cipher, color }
 * 数据端对端加密，服务器只存储不解密
 */
const handleUpdateCategory = async (env, categoryId, userId, body) => {
  try {
    const { name_cipher, color } = body;
    const result = await categoryService.updateCategory(env, categoryId, userId, name_cipher, color);
    if (!result.success) {
      return jsonError("分类不存在", 404, env);
    }
    return jsonSuccess(result, env);
  } catch (error) {
    return jsonError("更新分类失败", 500, env);
  }
};

/**
 * 删除分类
 * DELETE /api/categories/:id
 */
const handleDeleteCategory = async (env, categoryId, userId) => {
  try {
    const result = await categoryService.deleteCategory(env, categoryId, userId);
    if (!result.success) {
      return jsonError("分类不存在", 404, env);
    }
    return jsonSuccess(result, env);
  } catch (error) {
    return jsonError("删除分类失败", 500, env);
  }
};