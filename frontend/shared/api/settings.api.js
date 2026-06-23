import { API_BASE } from './index.js';

/**
 * 构建认证头
 */
function authHeaders(userId) {
  const headers = { 'X-User-Id': userId || '' };
  const token = sessionStorage.getItem('authToken');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers}

/**
 * 获取用户设置
 */
export async function getUserSettings() {
  const userId = sessionStorage.getItem('userId');
  return await fetch(`${API_BASE}/api/settings`, { headers: authHeaders(userId) }).then(r => r.json());
}

/**
 * 更新用户设置
 */
export async function updateUserSettings(settings) {
  const userId = sessionStorage.getItem('userId');
  return await fetch(`${API_BASE}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(userId) },
    body: JSON.stringify(settings),
  }).then(r => r.json());
}
