// note.api.js - 笔记 API
/**
 * 笔记相关 API 调用
 * 
 * v2 新 API（现代版前端用）：
 * - GET /api/notes?page=1&limit=50 → 分页获取笔记列表
 * - GET /api/notes/:id → 获取单条笔记详情
 * 
 * 所有请求同时发送 JWT Token 和 X-User-Id（向后兼容）
 */

/**
 * 构建认证头（同时发送 JWT 和 X-User-Id）
 */
function authHeaders(userId) {
  const headers = { 'X-User-Id': userId || '' };
  const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('authToken') : null;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * 构建带 Content-Type 的认证头
 */
function authHeadersJSON(userId) {
  return { 'Content-Type': 'application/json', ...authHeaders(userId) };
}

// ==============================================
// 笔记 API
// ==============================================

/**
 * 获取用户所有笔记列表（v2 API）
 * GET /api/notes
 */
export async function fetchNotes(apiBase, userId) {
  return await fetch(`${apiBase}/api/notes`, { headers: authHeaders(userId) });
}

/**
 * 分页获取笔记列表（v2 新 API）
 * GET /api/notes?page=1&limit=50&include_content=false
 */
export async function fetchNotesPaginated(apiBase, userId, options = {}) {
  const page = options.page || 1;
  const limit = options.limit || 50;
  const includeContent = options.includeContent || false;
  const params = new URLSearchParams({ page, limit, include_content: includeContent });
  return await fetch(`${apiBase}/api/notes?${params}`, { headers: authHeaders(userId) });
}

/**
 * 获取单条笔记详情（v2 新 API）
 */
export async function fetchNoteById(apiBase, userId, noteId) {
  return await fetch(`${apiBase}/api/notes/${noteId}`, { headers: authHeaders(userId) });
}

/**
 * 创建或更新笔记（v1 兼容路由，经典版使用）
 * POST /note
 * @deprecated 仅经典版前端使用，现代版请用 createNoteV2 / updateNoteV2
 */
export async function saveNote(apiBase, userId, noteData) {
  return await fetch(`${apiBase}/note`, {
    method: 'POST',
    headers: authHeadersJSON(userId),
    body: JSON.stringify(noteData)
  }).catch(e => {
    console.error('saveNote 网络错误:', e);
    return new Response(JSON.stringify({ err: '网络错误: ' + e.message }), { status: 500, statusText: 'Network Error' });
  });
}

/**
 * 创建笔记（v2 API，现代版使用）
 * POST /api/notes
 * Body: { title_cipher, ciphertext, category_cipher, tags_cipher }
 */
export async function createNoteV2(apiBase, userId, noteData) {
  return await fetch(`${apiBase}/api/notes`, {
    method: 'POST',
    headers: authHeadersJSON(userId),
    body: JSON.stringify(noteData)
  }).catch(e => {
    console.error('createNoteV2 网络错误:', e);
    return new Response(JSON.stringify({ err: '网络错误: ' + e.message }), { status: 500, statusText: 'Network Error' });
  });
}

/**
 * 更新笔记（v2 API，现代版使用）
 * PUT /api/notes/:id
 * Body: { title_cipher, ciphertext, category_cipher, tags_cipher }
 */
export async function updateNoteV2(apiBase, userId, noteId, noteData) {
  return await fetch(`${apiBase}/api/notes/${noteId}`, {
    method: 'PUT',
    headers: authHeadersJSON(userId),
    body: JSON.stringify(noteData)
  }).catch(e => {
    console.error('updateNoteV2 网络错误:', e);
    return new Response(JSON.stringify({ err: '网络错误: ' + e.message }), { status: 500, statusText: 'Network Error' });
  });
}
/**
 * 永久删除笔记
 * DELETE /api/notes/:id
 */
export async function deleteNote(apiBase, userId, noteId) {
  return await fetch(`${apiBase}/api/notes/${noteId}`, {
    method: 'DELETE',
    headers: authHeadersJSON(userId),
  });
}

/**
 * 永久删除笔记（v1 兼容，经典版使用）
 * @deprecated 仅经典版前端使用
 */
async function deleteNoteV1(apiBase, userId, noteId) {
  return await fetch(`${apiBase}/note`, {
    method: 'DELETE',
    headers: authHeadersJSON(userId),
    body: JSON.stringify({ id: noteId })
  });
}

/**
 * 批量永久删除笔记
 * DELETE /api/notes/:id × N
 */
export async function batchDeleteNotes(apiBase, userId, noteIds) {
  return Promise.all(
    noteIds.map(noteId =>
      fetch(`${apiBase}/api/notes/${noteId}`, {
        method: 'DELETE',
        headers: authHeadersJSON(userId),
      })
    )
  );
}

// ==============================================
// 分类 API
// ==============================================

/**
 * 获取用户所有分类列表
 * GET /api/categories
 */
export async function fetchCategories(apiBase, userId) {
  return await fetch(`${apiBase}/api/categories`, { headers: authHeaders(userId) });
}

/**
 * 创建分类
 * POST /api/categories
 */
export async function saveCategory(apiBase, userId, categoryData) {
  return await fetch(`${apiBase}/api/categories`, {
    method: 'POST',
    headers: authHeadersJSON(userId),
    body: JSON.stringify(categoryData)
  });
}

/**
 * 更新分类
 * PUT /api/categories/:id
 */
export async function updateCategory(apiBase, userId, categoryId, categoryData) {
  return await fetch(`${apiBase}/api/categories/${categoryId}`, {
    method: 'PUT',
    headers: authHeadersJSON(userId),
    body: JSON.stringify(categoryData)
  });
}

/**
 * 删除分类
 * DELETE /api/categories/:id
 */
export async function removeCategory(apiBase, userId, categoryId) {
  return await fetch(`${apiBase}/api/categories/${categoryId}`, {
    method: 'DELETE',
    headers: authHeadersJSON(userId)
  });
}

// ==============================================
// 回收站 API
// ==============================================

/**
 * 获取回收站笔记列表
 * GET /api/notes/trash
 */
export async function fetchTrashNotes(apiBase, userId) {
  return await fetch(`${apiBase}/api/notes/trash`, { headers: authHeaders(userId) });
}

/**
 * 恢复回收站笔记
 * POST /api/notes/:id/restore
 */
export async function restoreNote(apiBase, userId, noteId) {
  return await fetch(`${apiBase}/api/notes/${noteId}/restore`, {
    method: 'POST',
    headers: authHeadersJSON(userId),
    body: JSON.stringify({ id: noteId })
  });
}

/**
 * 永久删除笔记（从回收站）
 * DELETE /api/notes/:id/permanent
 */
export async function permanentDeleteNote(apiBase, userId, noteId) {
  return await fetch(`${apiBase}/api/notes/${noteId}/permanent`, {
    method: 'DELETE',
    headers: authHeadersJSON(userId),
    body: JSON.stringify({ id: noteId })
  });
}

/**
 * 清空回收站
 * DELETE /api/notes/trash
 */
export async function clearTrash(apiBase, userId) {
  return await fetch(`${apiBase}/api/notes/trash`, {
    method: 'DELETE',
    headers: authHeaders(userId)
  });
}

// ==============================================
// 分享 API
// ==============================================

/**
 * 创建分享链接
 * POST /api/shares
 */
export async function createShareLink(apiBase, userId, shareData) {
  return await fetch(`${apiBase}/api/shares`, {
    method: 'POST',
    headers: authHeadersJSON(userId),
    body: JSON.stringify(shareData)
  });
}

/**
 * 通过分享码获取分享内容（公开访问，无需认证）
 * GET /api/shares/public/:shareKey
 */
export async function fetchShareByKey(apiBase, shareKey) {
  return await fetch(`${apiBase}/api/shares/public/${shareKey}`);
}
