/**
 * 版本历史 API 调用
 * 获取笔记的历史版本和恢复功能
 */

/**
 * 获取笔记的版本历史
 * GET /note/versions?note_id=xxx
 */
export async function fetchNoteVersions(apiBase, userId, noteId) {
  const res = await fetch(`${apiBase}/note/versions?note_id=${noteId}`, {
    headers: { 'X-User-Id': userId }
  });
  return res;
}

/**
 * 恢复笔记到指定版本
 * POST /note/versions/restore
 * Body: { version_id }
 */
export async function restoreNoteVersion(apiBase, userId, versionId) {
  const res = await fetch(`${apiBase}/note/versions/restore`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId
    },
    body: JSON.stringify({ version_id: versionId })
  });
  return res;
}

/**
 * 获取单个版本详情
 * GET /note/versions/:id
 */
export async function fetchVersionDetail(apiBase, userId, versionId) {
  const res = await fetch(`${apiBase}/note/versions/${versionId}`, {
    headers: { 'X-User-Id': userId }
  });
  return res;
}
