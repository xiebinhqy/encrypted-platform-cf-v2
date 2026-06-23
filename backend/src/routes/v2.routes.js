// compat.routes.js v4.0.0
/**
 * 兼容路由层 - v1 API 到 v2 的桥接
 * 
 * v4.0.0 变更：
 * - 删除 detectNotesSchema / detectCategoriesSchema 自动检测
 * - 统一使用 title/content/category/tags 存储列（与数据库一致）
 * - 统一对外输出 title_cipher/ciphertext/category_cipher/tags_cipher（与前端一致）
 * - 消除 v1/v2 列名不一致导致的解密失败问题
 * 
 * 路径转换：
 *   /user/login          → /api/auth/login
 *   /user/register       → /api/auth/register
 *   /user/reset-password → /api/auth/recover
 *   /notes               → /api/notes (GET)
 *   /note                → /api/notes (POST) / /api/notes/:id (DELETE)
 *   /categories          → /api/categories (GET)
 *   /category            → /api/categories (POST) / /api/categories/:id (DELETE)
 *   /share/create        → /api/shares (POST)
 *   /share/:key          → /api/shares/:key (GET)
 */

import { getDB } from "../config/database.js";
import { ERRORS } from "../utils/error.js";
import { jsonSuccess, jsonError } from "../utils/response.js";
import * as versionService from "../services/version.service.js";

// ==============================================
// 统一列名常量
// ==============================================
// 数据库存储使用 title/content/category/tags（v2 列名）
// 对外输出使用 title_cipher/ciphertext/category_cipher/tags_cipher（v1 风格字段名）
// 前端始终读取 title_cipher/ciphertext，在 _decryptOneNote 中解密

// ==============================================
// 认证兼容 - v1 /user/login, /user/register
// ==============================================

/**
 * v1 登录接口
 * POST /user/login
 * Body: { key_hash }  → v2: publicKey
 * 返回: { user_id }   → v2: { userId }
 */
async function compatLogin(request, env) {
  try {
    const body = await request.json();
    const publicKey = body.key_hash;
    
    const DB = getDB(env);
    const user = await DB.prepare(
      "SELECT id FROM users WHERE public_key = ?"
    ).bind(publicKey).first();

    if (!user) {
      return jsonError("用户未找到", 404, env);
    }

    return jsonSuccess({ user_id: user.id }, env);
  } catch (error) {
    return jsonError("登录失败", 500, env);
  }
}

/**
 * v1 注册接口
 * POST /user/register
 * Body: { key_hash }
 * 返回: { user_id, recovery_code }
 */
async function compatRegister(request, env) {
  try {
    const body = await request.json();
    const publicKey = body.key_hash;
    
    const DB = getDB(env);
    
    const existing = await DB.prepare(
      "SELECT public_key FROM users WHERE public_key = ?"
    ).bind(publicKey).first();

    if (existing) {
      return jsonError("密钥已存在", 409, env);
    }

    const recoveryCode = generateRecoveryCode();
    const recoveryCodeHash = await sha256Hash(recoveryCode);

    const result = await DB.prepare(
      "INSERT INTO users (public_key, recovery_code_hash) VALUES (?, ?)"
    ).bind(publicKey, recoveryCodeHash).run();

    return jsonSuccess({
      user_id: result.meta?.last_row_id,
      recovery_code: recoveryCode
    }, env);
  } catch (error) {
    return jsonError("注册失败", 500, env);
  }
}

/**
 * v1 重置密码接口
 * POST /user/reset-password
 * Body: { recovery_code, new_key_hash }
 * 返回: { new_recovery_code }
 */
async function compatResetPassword(request, env) {
  try {
    const body = await request.json();
    const recoveryCode = body.recovery_code;
    const newPublicKey = body.new_key_hash;
    const recoveryCodeHash = await sha256Hash(recoveryCode);

    const DB = getDB(env);

    const user = await DB.prepare(
      "SELECT id FROM users WHERE recovery_code_hash = ?"
    ).bind(recoveryCodeHash).first();

    if (!user) {
      return jsonError("无效恢复码", 400, env);
    }

    const newRecoveryCode = generateRecoveryCode();
    const newRecoveryCodeHash = await sha256Hash(newRecoveryCode);

    await DB.prepare(
      "UPDATE users SET public_key = ?, recovery_code_hash = ? WHERE id = ?"
    ).bind(newPublicKey, newRecoveryCodeHash, user.id).run();

    return jsonSuccess({ new_recovery_code: newRecoveryCode }, env);
  } catch (error) {
    return jsonError("重置失败", 500, env);
  }
}

// ==============================================
// 笔记兼容（统一使用 title/content/category/tags 列）
// ==============================================

/**
 * v1 获取笔记列表
 * GET /notes
 * Headers: X-User-Id
 */
async function compatGetNotes(request, env) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return jsonError("未授权", 401, env);

    const DB = getDB(env);

    // 确保必要列存在
    try { await DB.prepare("ALTER TABLE notes ADD COLUMN revision_count INTEGER DEFAULT 1").run(); } catch (_) {}
    try { await DB.prepare("ALTER TABLE notes ADD COLUMN deleted_at DATETIME DEFAULT NULL").run(); } catch (_) {}

    const notes = await DB.prepare(
      "SELECT id, title, content, category, tags, revision_count, updated_at, created_at FROM notes WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 50"
    ).bind(userId).all();

    const result = notes.results.map(note => ({
      id: note.id,
      // 统一映射：数据库 title → 前端 title_cipher
      title_cipher: note.title || "",
      ciphertext: note.content || "",
      category_cipher: note.category || "",
      tags_cipher: note.tags || "",
      updated_at: new Date(note.updated_at).getTime(),
      created_at: new Date(note.created_at).getTime(),
      revision_count: note.revision_count || 1
    }));

    return jsonSuccess(result, env);
  } catch (error) {
    console.error("获取笔记失败:", error);
    return jsonError("获取笔记失败", 500, env);
  }
}

/**
 * v1 保存笔记（创建或更新）
 * POST /note
 * Body: { id, title_cipher, ciphertext, category_cipher, tags_cipher }
 * ✅ v4.0.0: 统一写入 title/content/category/tags 列
 */
async function compatSaveNote(request, env) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return jsonError("未授权", 401, env);

    const body = await request.json();
    const noteId = body.id;
    const title = body.title_cipher || "";
    const content = body.ciphertext || "";
    const category = body.category_cipher || "";
    const tagsCipher = body.tags_cipher || "";

    const DB = getDB(env);

    // 确保 revision_count 和 deleted_at 列存在
    try { await DB.prepare("ALTER TABLE notes ADD COLUMN revision_count INTEGER DEFAULT 1").run(); } catch (_) {}
    try { await DB.prepare("ALTER TABLE notes ADD COLUMN deleted_at DATETIME DEFAULT NULL").run(); } catch (_) {}

    // 检查笔记是否存在
    const existing = await DB.prepare(
      "SELECT id, title, content, category, tags FROM notes WHERE id = ? AND user_id = ?"
    ).bind(noteId, userId).first();

    if (existing) {
      // 更新前自动创建版本记录
      try {
        if (existing.title || existing.content) {
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

      // 🚨 修复：同时更新 title_cipher/ciphertext/category_cipher/tags_cipher（兼容 v1 旧表 NOT NULL 约束）
      await DB.prepare(
        "UPDATE notes SET title = ?, content = ?, category = ?, tags = ?, title_cipher = ?, ciphertext = ?, category_cipher = ?, tags_cipher = ?, revision_count = revision_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
      ).bind(title, content, category, tagsCipher, title, content, category, tagsCipher, noteId, userId).run();

      try {
        const { rebuildNotesListCache } = await import("../services/hot-cold.service.js");
        rebuildNotesListCache(env, userId).catch(() => {});
      } catch (_) {}
      
      try { await versionService.cleanupOldVersions(env, noteId, userId, 50); } catch (_) {}
    } else {
      const now = new Date().toISOString();
      // 🚨 修复：同时写入 title_cipher/ciphertext/category_cipher/tags_cipher（兼容 v1 旧表 NOT NULL 约束）
      await DB.prepare(
        "INSERT INTO notes (id, user_id, title, content, category, tags, title_cipher, ciphertext, category_cipher, tags_cipher, revision_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
      ).bind(noteId, userId, title, content, category, tagsCipher, title, content, category, tagsCipher, now, now).run();
    }

    return jsonSuccess({ success: true }, env);
  } catch (error) {
    console.error("保存笔记失败:", error);
    return jsonError("保存失败", 500, env);
  }
}

/**
 * v1 软删除笔记（移入回收站）
 * DELETE /note
 * Body: { id }
 */
async function compatDeleteNote(request, env) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return jsonError("未授权", 401, env);

    const body = await request.json();
    const noteId = body.id;

    const DB = getDB(env);
    try { await DB.prepare("ALTER TABLE notes ADD COLUMN deleted_at DATETIME DEFAULT NULL").run(); } catch (_) {}
    
    await DB.prepare(
      "UPDATE notes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
    ).bind(noteId, userId).run();

    return jsonSuccess({ success: true }, env);
  } catch (error) {
    return jsonError("删除失败", 500, env);
  }
}

/**
 * v1 获取回收站笔记列表
 * GET /notes/trash
 */
async function compatGetTrashNotes(request, env) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return jsonError("未授权", 401, env);

    const DB = getDB(env);
    try { await DB.prepare("ALTER TABLE notes ADD COLUMN deleted_at DATETIME DEFAULT NULL").run(); } catch (_) {}

    const notes = await DB.prepare(
      "SELECT id, title, content, category, tags, revision_count, updated_at, created_at, deleted_at FROM notes WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC"
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
}

/**
 * v1 恢复回收站笔记
 * POST /note/restore
 * Body: { id }
 */
async function compatRestoreNote(request, env) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return jsonError("未授权", 401, env);

    const body = await request.json();
    const noteId = body.id;

    const DB = getDB(env);
    await DB.prepare(
      "UPDATE notes SET deleted_at = NULL WHERE id = ? AND user_id = ?"
    ).bind(noteId, userId).run();

    return jsonSuccess({ success: true }, env);
  } catch (error) {
    return jsonError("恢复失败", 500, env);
  }
}

/**
 * v1 永久删除回收站笔记
 * DELETE /note/permanent
 * Body: { id }
 */
async function compatPermanentDeleteNote(request, env) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return jsonError("未授权", 401, env);

    const body = await request.json();
    const noteId = body.id;

    const DB = getDB(env);
    await DB.prepare(
      "DELETE FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL"
    ).bind(noteId, userId).run();

    return jsonSuccess({ success: true }, env);
  } catch (error) {
    return jsonError("永久删除失败", 500, env);
  }
}

/**
 * v1 清空回收站
 * DELETE /notes/trash
 */
async function compatClearTrash(request, env) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return jsonError("未授权", 401, env);

    const DB = getDB(env);
    await DB.prepare(
      "DELETE FROM notes WHERE user_id = ? AND deleted_at IS NOT NULL"
    ).bind(userId).run();

    return jsonSuccess({ success: true }, env);
  } catch (error) {
    return jsonError("清空回收站失败", 500, env);
  }
}

// ==============================================
// 分类兼容（统一使用 name/color 列）
// ==============================================

/**
 * v1 获取分类列表
 * GET /categories
 * ✅ v4.0.0: 统一从 name/color 列读取，输出 name_cipher 字段
 */
async function compatGetCategories(request, env) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return jsonError("未授权", 401, env);

    const DB = getDB(env);
    try { await DB.prepare("ALTER TABLE categories ADD COLUMN color TEXT DEFAULT ''").run(); } catch (_) {}

    const categories = await DB.prepare(
      "SELECT id, name, color FROM categories WHERE user_id = ? ORDER BY id"
    ).bind(userId).all();

    const result = categories.results.map(cat => ({
      id: cat.id,
      name_cipher: cat.name || "",  // 统一映射：name → name_cipher
      color: cat.color || ""
    }));

    return jsonSuccess(result, env);
  } catch (error) {
    console.error("获取分类失败:", error);
    return jsonError("获取分类失败", 500, env);
  }
}

/**
 * v1 保存分类
 * POST /category
 * Body: { id, name_cipher, color }
 */
async function compatSaveCategory(request, env) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return jsonError("未授权", 401, env);

    const body = await request.json();
    const catId = body.id;
    const name = body.name_cipher || "";
    const color = body.color || "";

    const DB = getDB(env);
    try { await DB.prepare("ALTER TABLE categories ADD COLUMN color TEXT DEFAULT ''").run(); } catch (_) {}

    const existing = await DB.prepare(
      "SELECT id FROM categories WHERE id = ? AND user_id = ?"
    ).bind(catId, userId).first();

    if (existing) {
      // 🚨 修复：同时更新 name_cipher（兼容 v1 旧表 NOT NULL 约束）
      await DB.prepare(
        "UPDATE categories SET name = ?, name_cipher = ?, color = ? WHERE id = ? AND user_id = ?"
      ).bind(name, name, color, catId, userId).run();
    } else {
      // 🚨 修复：同时写入 name_cipher（兼容 v1 旧表 NOT NULL 约束）
      await DB.prepare(
        "INSERT INTO categories (id, user_id, name, name_cipher, color) VALUES (?, ?, ?, ?, ?)"
      ).bind(catId, userId, name, name, color).run();
    }

    return jsonSuccess({ success: true }, env);
  } catch (error) {
    return jsonError("保存分类失败", 500, env);
  }
}

/**
 * v1 删除分类
 * DELETE /category
 * Body: { id }
 */
async function compatDeleteCategory(request, env) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return jsonError("未授权", 401, env);

    const body = await request.json();
    const catId = body.id;

    const DB = getDB(env);
    await DB.prepare(
      "DELETE FROM categories WHERE id = ? AND user_id = ?"
    ).bind(catId, userId).run();

    return jsonSuccess({ success: true }, env);
  } catch (error) {
    return jsonError("删除分类失败", 500, env);
  }
}

// ==============================================
// 分享兼容
// ==============================================

async function compatCreateShare(request, env) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return jsonError("未授权", 401, env);

    const body = await request.json();
    const noteId = body.note_id;
    const maxViews = body.max_views || 0;
    const expiresInHours = body.expires_in_hours || 0;

    const DB = getDB(env);
    const note = await DB.prepare(
      "SELECT id FROM notes WHERE id = ? AND user_id = ?"
    ).bind(noteId, userId).first();

    if (!note) return jsonError("笔记不存在", 404, env);

    const shareKey = crypto.randomUUID().replace(/-/g, "").substring(0, 16);
    const expiresAt = expiresInHours > 0 
      ? new Date(Date.now() + expiresInHours * 3600000).toISOString()
      : null;

    await DB.prepare(
      "INSERT INTO shares (id, note_id, user_id, max_views, expires_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(shareKey, noteId, userId, maxViews, expiresAt).run();

    const shareUrl = `${env?.FRONTEND_DOMAIN || "https://api.dee.us.kg"}/share/${shareKey}`;

    return jsonSuccess({ share_url: shareUrl, share_key: shareKey }, env);
  } catch (error) {
    return jsonError("创建分享失败", 500, env);
  }
}

async function compatGetShare(request, env, key) {
  try {
    const DB = getDB(env);
    const share = await DB.prepare("SELECT * FROM shares WHERE id = ?").bind(key).first();

    if (!share) return jsonError("分享链接不存在", 404, env);
    if (share.expires_at && new Date(share.expires_at) < new Date()) return jsonError("分享链接已过期", 410, env);
    if (share.max_views > 0 && share.view_count >= share.max_views) return jsonError("分享链接已失效", 410, env);

    const note = await DB.prepare(
      "SELECT id, title, content, updated_at FROM notes WHERE id = ?"
    ).bind(share.note_id).first();

    if (!note) return jsonError("笔记不存在", 404, env);

    await DB.prepare("UPDATE shares SET view_count = view_count + 1 WHERE id = ?").bind(key).run();

    return jsonSuccess({
      title: note.title,
      content: note.content,
      updated_at: note.updated_at
    }, env);
  } catch (error) {
    return jsonError("获取分享失败", 500, env);
  }
}

// ==============================================
// 设置兼容
// ==============================================

async function compatGetSettings(request, env) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return jsonError("未授权", 401, env);

    const DB = getDB(env);
    try {
      await DB.prepare(`CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        settings TEXT NOT NULL DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      )`).run();
    } catch (_) {}

    const result = await DB.prepare("SELECT settings FROM user_settings WHERE user_id = ?").bind(userId).first();

    if (result) return jsonSuccess(JSON.parse(result.settings), env);

    return jsonSuccess({ lockTimeout: 10, lockWarningTime: 30 }, env);
  } catch (error) {
    return jsonError("获取设置失败", 500, env);
  }
}

async function compatUpdateSettings(request, env) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return jsonError("未授权", 401, env);

    const DB = getDB(env);
    const body = await request.json();

    try {
      await DB.prepare(`CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        settings TEXT NOT NULL DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      )`).run();
    } catch (_) {}

    const existing = await DB.prepare("SELECT settings FROM user_settings WHERE user_id = ?").bind(userId).first();
    const currentSettings = existing ? JSON.parse(existing.settings) : {};
    const newSettings = { ...currentSettings, ...body };

    if (existing) {
      await DB.prepare("UPDATE user_settings SET settings = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?").bind(JSON.stringify(newSettings), userId).run();
    } else {
      await DB.prepare("INSERT INTO user_settings (user_id, settings) VALUES (?, ?)").bind(userId, JSON.stringify(newSettings)).run();
    }

    return jsonSuccess(newSettings, env);
  } catch (error) {
    return jsonError("更新设置失败", 500, env);
  }
}

// ==============================================
// 版本历史兼容
// ==============================================

async function compatGetVersionDetail(request, env, versionId) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return jsonError("未授权", 401, env);

    const version = await versionService.getVersionById(env, versionId, userId);
    if (!version) return jsonError("版本不存在", 404, env);

    return jsonSuccess(version, env);
  } catch (error) {
    return jsonError("获取版本详情失败", 500, env);
  }
}

async function compatGetVersions(request, env) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return jsonError("未授权", 401, env);

    const url = new URL(request.url);
    const noteId = url.searchParams.get("note_id");
    if (!noteId) return jsonError("缺少 note_id 参数", 400, env);

    const versions = await versionService.getVersions(env, noteId, userId);
    return jsonSuccess(versions, env);
  } catch (error) {
    return jsonError("获取版本历史失败", 500, env);
  }
}

async function compatRestoreVersion(request, env) {
  try {
    const userId = request.headers.get("X-User-Id");
    if (!userId) return jsonError("未授权", 401, env);

    const body = await request.json();
    const versionId = body.version_id;
    if (!versionId) return jsonError("缺少 version_id", 400, env);

    const versionData = await versionService.restoreVersion(env, versionId, userId);
    if (!versionData) return jsonError("版本不存在", 404, env);

    return jsonSuccess(versionData, env);
  } catch (error) {
    return jsonError("恢复版本失败", 500, env);
  }
}

// ==============================================
// 兼容路由总入口
// ==============================================

export const handleCompatRoute = async (request, env, url) => {
  const pathname = url.pathname;
  const method = request.method;

  try {
  // 统一路径匹配（兼容 /api/ 前缀和 v1 无前缀两种格式）
  const normalizedPath = pathname.replace(/^\/api/, '') || pathname;
  
  switch (normalizedPath) {
    case "/user/login": return await compatLogin(request, env);
    case "/user/register": return await compatRegister(request, env);
    case "/user/reset-password": return await compatResetPassword(request, env);
    case "/notes": if (method === "GET") return await compatGetNotes(request, env); break;
    case "/notes/trash":
      if (method === "GET") return await compatGetTrashNotes(request, env);
      if (method === "DELETE") return await compatClearTrash(request, env);
      break;
    case "/note":
      if (method === "POST") return await compatSaveNote(request, env);
      if (method === "DELETE") return await compatDeleteNote(request, env);
      break;
    case "/note/restore": if (method === "POST") return await compatRestoreNote(request, env); break;
    case "/note/permanent": if (method === "DELETE") return await compatPermanentDeleteNote(request, env); break;
    case "/note/versions": if (method === "GET") return await compatGetVersions(request, env); break;
    case "/note/versions/restore": if (method === "POST") return await compatRestoreVersion(request, env); break;
    case "/categories": if (method === "GET") return await compatGetCategories(request, env); break;
    case "/category":
      if (method === "POST") return await compatSaveCategory(request, env);
      if (method === "DELETE") return await compatDeleteCategory(request, env);
      break;
    case "/settings":
      if (method === "GET") return await compatGetSettings(request, env);
      if (method === "PUT") return await compatUpdateSettings(request, env);
      break;
    case "/share/create": if (method === "POST") return await compatCreateShare(request, env); break;
    default:
        if (normalizedPath.startsWith("/share/") && method === "GET") {
          const key = normalizedPath.split("/share/")[1];
          return await compatGetShare(request, env, key);
        }
        if (normalizedPath.startsWith("/note/versions/") && method === "GET") {
          const versionId = normalizedPath.split("/note/versions/")[1];
          if (versionId && versionId !== "restore") return await compatGetVersionDetail(request, env, versionId);
        }
        return null;
    }
  } catch (error) {
    return jsonError("内部错误", 500, env);
  }

  return null;
};

// ==============================================
// 工具函数
// ==============================================

function generateRecoveryCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (i < 3) code += "-";
  }
  return code;
}

async function sha256Hash(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}