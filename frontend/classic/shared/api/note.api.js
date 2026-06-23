// note.api.js - 笔记 API ⚠️ 保持原始请求路径、参数、请求头完全不变
/**
 * 笔记相关 API 调用
 * 从原始 index.html 精确提取
 * 
 * 所有请求路径、参数、请求头与原始代码完全一致
 * - GET /notes → 获取笔记列表
 * - POST /note → 创建/更新笔记
 * - DELETE /note → 永久删除笔记（清空回收站用）
 */

/**
 * 获取用户所有笔记列表
 * GET /notes
 * Headers: { X-User-Id }
 * 
 * （从原始 index.html 精确提取，请求路径/方法/参数/请求头不变）
 * 原始调用：fetch(${API_BASE}/notes, { headers: { 'X-User-Id': userId } })
 */
export async function fetchNotes(apiBase, userId) {
  const res = await fetch(`${apiBase}/notes`, {
    headers: { 'X-User-Id': userId }
  });
  return res;
}

/**
 * 创建或更新笔记
 * POST /note
 * Headers: { Content-Type, X-User-Id }
 * Body: { id, title_cipher, ciphertext, category_cipher, tags_cipher }
 * 
 * （从原始 index.html 精确提取，请求路径/方法/参数/请求头不变）
 * 原始调用：fetch(${API_BASE}/note, { method: 'POST', headers: {...}, body: JSON.stringify({...}) })
 */
export async function saveNote(apiBase, userId, noteData) {
  const res = await fetch(`${apiBase}/note`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId
    },
    body: JSON.stringify(noteData)
  });
  return res;
}

/**
 * 永久删除笔记
 * DELETE /note
 * Headers: { Content-Type, X-User-Id }
 * Body: { id }
 * 
 * （从原始 index.html 精确提取，请求路径/方法/参数/请求头不变）
 * 原始调用：fetch(${API_BASE}/note, { method: 'DELETE', headers: {...}, body: JSON.stringify({ id }) })
 */
export async function deleteNote(apiBase, userId, noteId) {
  const res = await fetch(`${apiBase}/note`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId
    },
    body: JSON.stringify({ id: noteId })
  });
  return res;
}

/**
 * 批量永久删除笔记（清空回收站）
 * DELETE /note (多次调用)
 * 
 * 原始调用：recycleBinNotes.map(note => fetch(${API_BASE}/note, { method: 'DELETE', headers: {...}, body: JSON.stringify({ id: note.id }) }))
 */
export async function batchDeleteNotes(apiBase, userId, noteIds) {
  return Promise.all(
    noteIds.map(noteId =>
      fetch(`${apiBase}/note`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId
        },
        body: JSON.stringify({ id: noteId })
      })
    )
  );
}

// ==============================================
// 分类 API
// ==============================================

/**
 * 获取用户所有分类列表
 * GET /categories
 * Headers: { X-User-Id }
 * 
 * （从原始 index.html 精确提取）
 * 原始调用：fetch(${API_BASE}/categories, { headers: { 'X-User-Id': userId } })
 */
export async function fetchCategories(apiBase, userId) {
  const res = await fetch(`${apiBase}/categories`, {
    headers: { 'X-User-Id': userId }
  });
  return res;
}

/**
 * 创建或更新分类
 * POST /category
 * Headers: { Content-Type, X-User-Id }
 * Body: { id, name_cipher }
 * 
 * （从原始 index.html 精确提取）
 * 原始调用：fetch(${API_BASE}/category, { method: 'POST', headers: {...}, body: JSON.stringify({ id, name_cipher }) })
 */
export async function saveCategory(apiBase, userId, categoryData) {
  const res = await fetch(`${apiBase}/category`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId
    },
    body: JSON.stringify(categoryData)
  });
  return res;
}

/**
 * 删除分类
 * DELETE /category
 * Headers: { Content-Type, X-User-Id }
 * Body: { id }
 * 
 * （从原始 index.html 精确提取）
 * 原始调用：fetch(${API_BASE}/category, { method: 'DELETE', headers: {...}, body: JSON.stringify({ id }) })
 */
export async function removeCategory(apiBase, userId, categoryId) {
  const res = await fetch(`${apiBase}/category`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId
    },
    body: JSON.stringify({ id: categoryId })
  });
  return res;
}

// ==============================================
// 分享 API
// ==============================================

/**
 * 创建分享链接
 * POST /share/create
 * Headers: { Content-Type, X-User-Id }
 * Body: { note_id, max_views, expires_in_hours }
 * 
 * （从原始 index.html 精确提取）
 * 原始调用：fetch(${API_BASE}/share/create, { method: 'POST', headers: {...}, body: JSON.stringify({ note_id, max_views, expires_in_hours }) })
 */
export async function createShareLink(apiBase, userId, shareData) {
  const res = await fetch(`${apiBase}/share/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId
    },
    body: JSON.stringify(shareData)
  });
  return res;
}

/**
 * 通过分享码获取分享内容（公开访问，无需认证）
 * GET /share/:shareKey
 * 
 * （从原始 index.html 精确提取）
 * 原始调用：fetch(${API_BASE}/share/${shareKey})
 */
export async function fetchShareByKey(apiBase, shareKey) {
  const res = await fetch(`${apiBase}/share/${shareKey}`);
  return res;
}
