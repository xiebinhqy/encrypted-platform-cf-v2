// note.routes.js v3.1.0
/**
 * 笔记路由
 * 只处理请求分发，不包含业务逻辑
 * 适配三环境配置
 * 
 * v3.1.0 变更：
 * - 新增 /api/notes/trash、/restore、/permanent、/clear-trash 路由
 * - 新增 /api/notes/:id/restore、/api/notes/:id/permanent 路由
 */

import { jsonSuccess, jsonError } from "../utils/response.js";
import { ERRORS } from "../utils/error.js";
import * as noteService from "../services/note.service.js";
import * as versionService from "../services/version.service.js";
import { getDB } from "../config/database.js";

/**
 * 处理笔记相关路由
 * @param {Request} request - 原始请求对象
 * @param {Object} env - Workers 环境变量
 * @param {URL} url - 解析后的 URL 对象
 * @param {string} userId - 用户 ID
 * @returns {Promise<Response>}
 */
export const handleNoteRoute = async (request, env, url, userId) => {
  const { method } = request;

  // ===== /api/notes/trash 路由（优先匹配，避免被 /:id 吞掉） =====
  if (url.pathname === "/api/notes/trash") {
    if (method === "GET") return handleGetTrashNotes(env, userId);
    if (method === "DELETE") return handleClearTrash(env, userId);
  }

  switch (url.pathname) {
    case "/api/notes":
      if (method === "GET") {
        return handleGetNotes(env, userId, url);
      } else if (method === "POST") {
        const body = await request.json();
        return handleCreateNote(env, userId, body);
      }
      break;
    default:
      // /api/notes/:id
      if (url.pathname.startsWith("/api/notes/")) {
        const segments = url.pathname.split("/api/notes/");
        const noteId = segments[1];

        // /api/notes/:id/restore
        if (noteId && noteId.endsWith("/restore")) {
          const realId = noteId.replace("/restore", "");
          if (method === "POST") return handleRestoreNote(env, realId, userId);
        }

        // /api/notes/:id/permanent
        if (noteId && noteId.endsWith("/permanent")) {
          const realId = noteId.replace("/permanent", "");
          if (method === "DELETE") return handlePermanentDeleteNote(env, realId, userId);
        }

        // /api/notes/:id (基础操作)
        if (method === "GET") return handleGetNote(env, noteId, userId);
        if (method === "PUT") {
          const body = await request.json();
          return handleUpdateNote(env, noteId, userId, body);
        }
        if (method === "DELETE") return handleDeleteNote(env, noteId, userId);
      }
      break;
  }

  return jsonError(ERRORS.NOT_FOUND.message, ERRORS.NOT_FOUND.status, env);
};

/**
 * 获取笔记列表（支持分页）
 * GET /api/notes?page=1&limit=50&include_content=false
 * 
 * 参数说明：
 * - page: 页码（从1开始），默认1
 * - limit: 每页条数，默认50，最大200
 * - include_content: 是否包含内容，默认false（列表页不需要 content）
 * 
 * 向后兼容：
 * - 无参数时默认 page=1, limit=50
 * - 返回格式兼容旧版（但增加分页元数据）
 */
const handleGetNotes = async (env, userId, url) => {
  try {
    // 解析分页参数
    const page = parseInt(url.searchParams.get("page")) || 1;
    const limit = parseInt(url.searchParams.get("limit")) || 50;
    const includeContent = url.searchParams.get("include_content") === "true";

    const result = await noteService.getNotes(env, userId, {
      page,
      limit,
      includeContent
    });

    // 返回格式兼容旧版：直接返回 notes 数组，但增加分页元数据
    return jsonSuccess({
      notes: result.notes,
      total: result.total,
      page: result.page,
      limit: result.limit,
      hasMore: result.hasMore
    }, env);
  } catch (error) {
    console.error("[NOTE ROUTE] 获取笔记列表失败:", error.message, error.stack);
    return jsonError("获取笔记列表失败: " + (error.message || "未知错误"), 500, env);
  }
};

/**
 * 获取单个笔记
 * GET /api/notes/:id
 */
const handleGetNote = async (env, noteId, userId) => {
  try {
    const note = await noteService.getNoteById(env, noteId, userId);
    if (!note) {
      return jsonError("笔记不存在", 404, env);
    }
    return jsonSuccess(note, env);
  } catch (error) {
    return jsonError("获取笔记失败", 500, env);
  }
};

/**
 * 创建笔记
 * POST /api/notes
 * Body: { title_cipher, ciphertext, category_cipher, tags_cipher }
 * 数据端对端加密，服务器只存储不解密
 */
const handleCreateNote = async (env, userId, body) => {
  try {
    const { id, title_cipher, ciphertext, category_cipher, tags_cipher } = body;
    const noteId = id || crypto.randomUUID();
    const result = await noteService.createNote(env, userId, noteId, title_cipher, ciphertext, category_cipher, tags_cipher);
    return jsonSuccess({ id: noteId, success: true }, env, 201);
  } catch (error) {
    console.error("[NOTE ROUTE] 创建笔记失败:", error.message, error.stack);
    // 区分外键约束错误（用户不存在）和一般错误
    if (error.message && error.message.includes("FOREIGN KEY constraint failed")) {
      return jsonError("用户不存在，创建笔记失败", 500, env);
    }
    if (error.message && error.message.includes("UNIQUE constraint failed")) {
      return jsonError("笔记ID已存在", 409, env);
    }
    return jsonError("创建笔记失败: " + (error.message || "未知错误"), 500, env);
  }
};

/**
 * 更新笔记
 * PUT /api/notes/:id
 * Body: { title_cipher, ciphertext, category_cipher, tags_cipher }
 * 数据端对端加密，服务器只存储不解密
 */
const handleUpdateNote = async (env, noteId, userId, body) => {
  try {
    const { title_cipher, ciphertext, category_cipher, tags_cipher } = body;
    // 🚨 修复：记录请求关键信息便于排查
    if (!noteId) {
      return jsonError("缺少笔记ID", 400, env);
    }
    if (!userId) {
      return jsonError("未授权", 401, env);
    }
    
    // 更新前自动创建版本记录（保存当前内容作为历史版本）
    try {
      const DB = getDB(env);
      // 🚀 优化：只查询必要的字段，使用更精简的查询
      const existing = await DB.prepare(
        "SELECT title, content, category, tags FROM notes WHERE id = ? AND user_id = ?"
      ).bind(noteId, userId).first();
      if (existing && (existing.title || existing.content)) {
        await versionService.createVersion(env, noteId, userId, {
          title: existing.title || "",
          content: existing.content || "",
          category: existing.category || "",
          tags: existing.tags || ""
        }, "自动保存");
      }
    } catch (versionError) {
      console.error("创建版本记录失败:", versionError);
    }

    const result = await noteService.updateNote(env, noteId, userId, title_cipher, ciphertext, category_cipher, tags_cipher);
    if (!result.success) {
      return jsonError("笔记不存在", 404, env);
    }
    
    // 清理旧版本（保留最近50个版本）
    try { await versionService.cleanupOldVersions(env, noteId, userId, 50); } catch (_) {}
    
    return jsonSuccess(result, env);
  } catch (error) {
    return jsonError("更新笔记失败", 500, env);
  }
};

/**
 * 删除笔记
 * DELETE /api/notes/:id
 */
const handleDeleteNote = async (env, noteId, userId) => {
  try {
    const result = await noteService.deleteNote(env, noteId, userId);
    if (!result.success) {
      return jsonError("笔记不存在", 404, env);
    }
    return jsonSuccess(result, env);
  } catch (error) {
    return jsonError("删除笔记失败", 500, env);
  }
};

// ==============================================
// 回收站 API（v3.1.0 新增）
// ==============================================

/**
 * 获取回收站笔记列表
 * GET /api/notes/trash
 */
const handleGetTrashNotes = async (env, userId) => {
  try {
    const DB = getDB(env);
    const notes = await DB.prepare(
      `SELECT id, title, content, category, tags, updated_at, created_at, deleted_at, revision_count
       FROM notes WHERE user_id = ? AND deleted_at IS NOT NULL
       ORDER BY deleted_at DESC`
    ).bind(userId).all();

    return jsonSuccess(notes.results.map(note => ({
      id: note.id,
      title_cipher: note.title || "",
      ciphertext: note.content || "",
      category_cipher: note.category || "",
      tags_cipher: note.tags || "",
      updated_at: new Date(note.updated_at).getTime(),
      created_at: new Date(note.created_at).getTime(),
      deleted_at: new Date(note.deleted_at).getTime(),
      revision_count: note.revision_count || 1
    })), env);
  } catch (error) {
    console.error("获取回收站失败:", error);
    return jsonError("获取回收站失败", 500, env);
  }
};

/**
 * 恢复回收站笔记
 * POST /api/notes/:id/restore
 */
const handleRestoreNote = async (env, noteId, userId) => {
  try {
    const DB = getDB(env);
    await DB.prepare(
      "UPDATE notes SET deleted_at = NULL WHERE id = ? AND user_id = ?"
    ).bind(noteId, userId).run();

    return jsonSuccess({ success: true }, env);
  } catch (error) {
    return jsonError("恢复失败", 500, env);
  }
};

/**
 * 永久删除回收站笔记
 * DELETE /api/notes/:id/permanent
 */
const handlePermanentDeleteNote = async (env, noteId, userId) => {
  try {
    const DB = getDB(env);
    await DB.prepare(
      "DELETE FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL"
    ).bind(noteId, userId).run();

    return jsonSuccess({ success: true }, env);
  } catch (error) {
    return jsonError("永久删除失败", 500, env);
  }
};

/**
 * 清空回收站
 * DELETE /api/notes/trash
 */
const handleClearTrash = async (env, userId) => {
  try {
    const DB = getDB(env);
    await DB.prepare(
      "DELETE FROM notes WHERE user_id = ? AND deleted_at IS NOT NULL"
    ).bind(userId).run();

    return jsonSuccess({ success: true }, env);
  } catch (error) {
    return jsonError("清空回收站失败", 500, env);
  }
};
