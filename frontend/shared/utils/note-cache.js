// note-cache.js v1.1.0
/**
 * IndexedDB 本地缓存模块
 * 缓存已解密的笔记、分类、仪表盘数据和笔记内容
 * 避免每次刷新页面都重新从后端获取 + 解密
 * 
 * 策略：
 * 1. 登录后，将解密后的笔记和分类存入 IndexedDB
 * 2. 刷新页面时，先从 IndexedDB 读取缓存数据，立即渲染
 * 3. 后端数据仍会获取（增量同步），但 UI 不需要等待解密
 * 4. 仪表盘数据单独缓存（聚合结果，含统计数据）
 * 5. 笔记内容按需缓存（避免重复获取相同内容）
 * 6. 退出登录时清除缓存
 */

const DB_NAME = 'encrypted-notes-cache';
const DB_VERSION = 2;
const STORE_NAME = 'notes-data';
const CACHE_KEY_NOTES = 'decrypted-notes';
const CACHE_KEY_CATEGORIES = 'decrypted-categories';
const CACHE_KEY_TIMESTAMP = 'last-sync-timestamp';
const CACHE_KEY_DASHBOARD = 'dashboard-stats';
const CACHE_KEY_CONTENT_PREFIX = 'note-content:';
const CACHE_TTL_MS = 86400000; // 24 小时缓存有效期
const DASHBOARD_TTL_MS = 300000; // 5 分钟仪表盘缓存

/**
 * 打开 IndexedDB 数据库
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 从 IndexedDB 读取数据
 */
async function getFromDB(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

/**
 * 写入 IndexedDB
 */
async function setToDB(key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('IndexedDB 写入失败:', e);
  }
}

/**
 * 从 IndexedDB 删除数据
 */
async function deleteFromDB(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {}
}

/**
 * 获取缓存的笔记列表（如果未过期）
 * @returns {Promise<Array|null>} 缓存的笔记数组或 null
 */
export async function getCachedNotes() {
  try {
    const [notes, timestamp] = await Promise.all([
      getFromDB(CACHE_KEY_NOTES),
      getFromDB(CACHE_KEY_TIMESTAMP)
    ]);
    if (notes && timestamp && (Date.now() - timestamp < CACHE_TTL_MS)) {
      return notes;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 缓存笔记列表
 * @param {Array} notes - 已解密的笔记数组
 */
export async function setCachedNotes(notes) {
  try {
    await Promise.all([
      setToDB(CACHE_KEY_NOTES, notes),
      setToDB(CACHE_KEY_TIMESTAMP, Date.now())
    ]);
  } catch (e) {
    console.warn('缓存笔记失败:', e);
  }
}

/**
 * 获取缓存的分类列表
 */
export async function getCachedCategories() {
  try {
    return await getFromDB(CACHE_KEY_CATEGORIES) || null;
  } catch (e) {
    return null;
  }
}

/**
 * 缓存分类列表
 */
export async function setCachedCategories(categories) {
  try {
    await setToDB(CACHE_KEY_CATEGORIES, categories);
  } catch (e) {
    console.warn('缓存分类失败:', e);
  }
}

/**
 * 获取缓存的仪表盘数据
 * @returns {Promise<Object|null>}
 */
export async function getCachedDashboard() {
  try {
    const data = await getFromDB(CACHE_KEY_DASHBOARD);
    if (data && data.timestamp && (Date.now() - data.timestamp < DASHBOARD_TTL_MS)) {
      return data.stats;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 缓存仪表盘数据
 * @param {Object} stats - 仪表盘统计数据
 */
export async function setCachedDashboard(stats) {
  try {
    await setToDB(CACHE_KEY_DASHBOARD, {
      stats,
      timestamp: Date.now()
    });
  } catch (e) {
    console.warn('缓存仪表盘失败:', e);
  }
}

/**
 * 获取缓存的笔记内容
 * @param {string} noteId
 * @returns {Promise<string|null>}
 */
export async function getCachedNoteContent(noteId) {
  try {
    const key = CACHE_KEY_CONTENT_PREFIX + noteId;
    const data = await getFromDB(key);
    if (data && data.timestamp && (Date.now() - data.timestamp < CACHE_TTL_MS)) {
      return data.content;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 缓存笔记内容
 * @param {string} noteId
 * @param {string} content - 解密后的内容
 */
export async function setCachedNoteContent(noteId, content) {
  try {
    const key = CACHE_KEY_CONTENT_PREFIX + noteId;
    await setToDB(key, {
      content,
      timestamp: Date.now()
    });
  } catch (e) {
    // 静默失败，笔记内容缓存不是关键路径
  }
}

/**
 * 清除所有缓存（退出登录时调用）
 */
export async function clearAllCache() {
  try {
    const db = await openDB();
    // 清空整个 store
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('清除缓存失败:', e);
  }
}
