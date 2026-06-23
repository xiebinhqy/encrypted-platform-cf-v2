// app.js - 经典版 UI 主应用逻辑
/**
 * 从原始 index.html 精确提取的完整应用逻辑
 * 保持原有界面和功能100%不变
 * 
 * 依赖（已提取到 shared/ 目录）：
 * - shared/crypto/index.js  → 加密核心（getKey, getKeyHash, encrypt, decrypt）
 * - shared/api/index.js     → API 调用（loginUser, fetchNotes, 等）
 */

import { getKeyHash, encrypt, decrypt } from "../shared/crypto/index.js";
import { API_BASE, loginUser, registerUser, resetPassword, fetchNotes, fetchNotesPaginated, saveNote, createNoteV2, updateNoteV2, deleteNote, batchDeleteNotes, fetchCategories, saveCategory, updateCategory, removeCategory, createShareLink, fetchShareByKey } from "../shared/api/index.js";

// ====================== 全局状态 ======================
let masterKey = "", userId = "";
let notes = [], categories = [], currentNoteId = null;
let currentView = "dashboard";
let currentKnowledgeView = "home";
let currentKnowledgeCategory = null;
let currentKnowledgeNote = null;
let foldState = {};
let searchKeyword = "";
let isSidebarOpen = false;

// ====================== 响应式布局状态管理 ======================
function getScreenSize() {
  if (window.innerWidth < 640) return 'xs';
  if (window.innerWidth < 768) return 'sm';
  if (window.innerWidth < 1024) return 'md';
  if (window.innerWidth < 1280) return 'lg';
  return 'xl';
}

function isMobile() {
  return window.innerWidth < 768;
}

function isTablet() {
  return window.innerWidth >= 768 && window.innerWidth < 1024;
}

function isDesktop() {
  return window.innerWidth >= 1024;
}

// ====================== 侧边栏控制 ======================
function toggleSidebar() {
  isSidebarOpen = !isSidebarOpen;
  const sidebar = document.getElementById('mobileSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  
  if (isSidebarOpen) {
    sidebar.classList.remove('hidden');
    sidebar.classList.remove('sidebar-leave');
    sidebar.classList.add('sidebar-enter');
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  } else {
    sidebar.classList.remove('sidebar-enter');
    sidebar.classList.add('sidebar-leave');
    overlay.classList.add('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      sidebar.classList.add('hidden');
    }, 300);
  }
}

function closeSidebar() {
  if (isSidebarOpen) {
    toggleSidebar();
  }
}

// ====================== 排序配置全局变量 ======================
const SORT_TYPE = {
  UPDATE_TIME: 'update_time',
  CREATE_TIME: 'create_time',
  TITLE: 'title',
  REVISION_COUNT: 'revision_count'
};
const SORT_ORDER = {
  DESC: 'desc',
  ASC: 'asc'
};
let sortSettings = {
  type: SORT_TYPE.UPDATE_TIME,
  order: SORT_ORDER.DESC
};

// ====================== 回收站配置 ======================
const RECYCLE_BIN_RETENTION_DAYS = 30;

// ====================== 分类颜色配置 ======================
const CAT_COLOR_COUNT = 8;

// ====================== 草稿体系重构 核心全局变量 ======================
const DRAFT_TYPE = {
  EXISTING_NOTE: 'existing_note',
  NEW_NOTE: 'new_note'
};
let autoSaveTimer = null;
let currentDraftType = null;

// ====================== 闲置锁定功能全局变量 ======================
let idleLockTimer = null;
let idleWarningTimer = null;
let isLocked = false;
let lockSettings = {
  enabled: true,
  timeout: 10 * 60 * 1000,
  warningTime: 30 * 1000
};
let lastActivityTime = Date.now();

// ====================== 自定义Toast ======================
function showToast(message, type = 'success') {
  const oldToast = document.getElementById('customToast');
  if (oldToast) oldToast.remove();

  const toast = document.createElement('div');
  toast.id = 'customToast';
  toast.className = `fixed top-4 right-4 z-[9999] px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 toast-enter ${
    type === 'success' ? 'bg-success/95 text-white' : 
    type === 'error' ? 'bg-danger/95 text-white' : 
    type === 'warning' ? 'bg-warning/95 text-white' :
    'bg-dark-800/95 text-white border border-dark-700'
  }`;
  
  if (isMobile()) {
    toast.className = `fixed bottom-20 left-4 right-4 z-[9999] px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 toast-enter ${
      type === 'success' ? 'bg-success/95 text-white' : 
      type === 'error' ? 'bg-danger/95 text-white' : 
      type === 'warning' ? 'bg-warning/95 text-white' :
      'bg-dark-800/95 text-white border border-dark-700'
    }`;
  }
  
  const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-info-circle';
  toast.innerHTML = `<i class="fa-solid ${icon} text-lg"></i><span>${message}</span>`;
  
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-leave');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ====================== 防抖函数 ======================
function debounce(func, wait = 300) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// ====================== 工具函数 ======================
function requireAuth(callback) {
  return function(...args) {
    if (!userId || !masterKey) {
      showToast("⚠️ 请先输入密码解锁", 'error');
      return;
    }
    return callback.apply(this, args);
  };
}

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString();
}

// ====================== 元数据存储（兼容现有后端） ======================
function encodeMetaToTags(tagsArray, metaObj) {
  const cleanTags = tagsArray.filter(tag => !tag.startsWith('__meta:'));
  const metaJson = JSON.stringify(metaObj);
  const metaBase64 = btoa(metaJson);
  return ['__meta:' + metaBase64, ...cleanTags];
}

function decodeMetaFromTags(tagsArray) {
  const metaTag = tagsArray.find(tag => tag.startsWith('__meta:'));
  if (!metaTag) {
    return { is_top: false, top_at: 0, is_deleted: false, deleted_at: 0 };
  }
  try {
    const metaBase64 = metaTag.replace('__meta:', '');
    const metaJson = atob(metaBase64);
    const meta = JSON.parse(metaJson);
    return {
      is_top: !!meta.is_top,
      top_at: meta.top_at || 0,
      is_deleted: !!meta.is_deleted,
      deleted_at: meta.deleted_at || 0
    };
  } catch (e) {
    console.error('元数据解码失败:', e);
    return { is_top: false, top_at: 0, is_deleted: false, deleted_at: 0 };
  }
}

function extractCleanTags(tagsArray) {
  return tagsArray.filter(tag => !tag.startsWith('__meta:'));
}

// ====================== 分类颜色管理 ======================
function getCategoryColorIndex(catId) {
  if (!catId || typeof catId !== 'string') return 0;
  let hash = 0;
  for (let i = 0; i < catId.length; i++) {
    hash = ((hash << 5) - hash) + catId.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % CAT_COLOR_COUNT;
}

// ====================== 排序设置持久化 ======================
function loadSortSettings() {
  try {
    const saved = localStorage.getItem(`sortSettings_${userId}`);
    if (saved) {
      sortSettings = JSON.parse(saved);
    }
  } catch (e) {
    console.error('加载排序设置失败:', e);
  }
}

function saveSortSettings() {
  if (!userId) return;
  localStorage.setItem(`sortSettings_${userId}`, JSON.stringify(sortSettings));
}

// ====================== 笔记排序核心逻辑 ======================
function sortNotes(notesArray) {
  const sorted = [...notesArray];
  sorted.sort((a, b) => {
    if (a.meta.is_top && !b.meta.is_top) return -1;
    if (!a.meta.is_top && b.meta.is_top) return 1;
    if (a.meta.is_top && b.meta.is_top) return b.meta.top_at - a.meta.top_at;
    return 0;
  });

  const nonTopNotes = sorted.filter(note => !note.meta.is_top);
  const topNotes = sorted.filter(note => note.meta.is_top);
  
  nonTopNotes.sort((a, b) => {
    let compareResult = 0;
    switch (sortSettings.type) {
      case SORT_TYPE.UPDATE_TIME: compareResult = b.updated_at - a.updated_at; break;
      case SORT_TYPE.CREATE_TIME: compareResult = b.created_at - a.created_at; break;
      case SORT_TYPE.TITLE: compareResult = a.title.localeCompare(b.title, 'zh-CN'); break;
      case SORT_TYPE.REVISION_COUNT: compareResult = b.revision_count - a.revision_count; break;
      default: compareResult = b.updated_at - a.updated_at;
    }
    return sortSettings.order === SORT_ORDER.ASC ? -compareResult : compareResult;
  });

  return [...topNotes, ...nonTopNotes];
}

// ====================== 置顶/取消置顶功能 ======================
const toggleNoteTop = requireAuth(async function(noteId) {
  const targetNote = notes.find(n => n.id === noteId);
  if (!targetNote) { showToast('笔记不存在', 'error'); return; }

  const newMeta = { ...targetNote.meta, is_top: !targetNote.meta.is_top, top_at: Date.now() };
  const title_cipher = await encrypt(targetNote.title, masterKey);
  const ciphertext = await encrypt(targetNote.content, masterKey);
  const category_cipher = await encrypt(targetNote.category, masterKey);
  const tagsWithMeta = encodeMetaToTags(targetNote.tags, newMeta);
  const tags_cipher = await encrypt(JSON.stringify(tagsWithMeta), masterKey);

  try {
    const res = await saveNote(API_BASE, userId, { id: noteId, title_cipher, ciphertext, category_cipher, tags_cipher });
    if (!res.ok) { showToast('操作失败', 'error'); return; }
    await loadAllData();
    showToast(newMeta.is_top ? '✅ 笔记已置顶' : '✅ 已取消置顶');
  } catch (e) { console.error(e); showToast('操作失败', 'error'); }
});

// ====================== 切换排序方式 ======================
function changeSortType(sortType) {
  if (sortSettings.type === sortType) {
    sortSettings.order = sortSettings.order === SORT_ORDER.DESC ? SORT_ORDER.ASC : SORT_ORDER.DESC;
  } else {
    sortSettings.type = sortType;
    sortSettings.order = SORT_ORDER.DESC;
  }
  saveSortSettings();
  renderNotes();
  renderSortControl();
}

function renderSortControl() {
  const sortControl = document.getElementById('sortControl');
  if (!sortControl) return;

  sortControl.innerHTML = `
    <div class="flex items-center gap-2 w-full">
      <div class="relative flex-1">
        <select onchange="changeSortType(this.value)" 
                class="w-full bg-dark-900 border border-dark-700 rounded p-2 pr-8 focus:outline-none focus:ring-1 focus:ring-primary sort-control">
          <option value="${SORT_TYPE.UPDATE_TIME}" ${sortSettings.type === SORT_TYPE.UPDATE_TIME ? 'selected' : ''}>按更新时间</option>
          <option value="${SORT_TYPE.CREATE_TIME}" ${sortSettings.type === SORT_TYPE.CREATE_TIME ? 'selected' : ''}>按创建时间</option>
          <option value="${SORT_TYPE.TITLE}" ${sortSettings.type === SORT_TYPE.TITLE ? 'selected' : ''}>按笔记标题</option>
          <option value="${SORT_TYPE.REVISION_COUNT}" ${sortSettings.type === SORT_TYPE.REVISION_COUNT ? 'selected' : ''}>按修改次数</option>
        </select>
      </div>
      <button onclick="changeSortType(sortSettings.type)" 
              class="sort-order-btn ${sortSettings.order === SORT_ORDER.DESC ? 'active' : ''} p-2 border border-dark-700 rounded touch-friendly">
        <i class="fa-solid fa-sort-${sortSettings.order === SORT_ORDER.DESC ? 'amount-down' : 'amount-up'}"></i>
      </button>
    </div>
  `;
}

// ====================== 回收站核心功能 ======================
// 回收站功能 - 使用服务端 deleted_at 机制（与Modern版统一）
import { fetchTrashNotes as apiFetchTrashNotes, restoreNote as apiRestoreNote, permanentDeleteNote as apiPermanentDeleteNote, clearTrash as apiClearTrash } from "../shared/api/index.js";

const moveToRecycleBin = requireAuth(async function(noteId) {
  if (!confirm('⚠️ 确定将这篇笔记移到回收站吗？')) return;
  const targetNote = notes.find(n => n.id === noteId);
  if (!targetNote) { showToast('笔记不存在', 'error'); return; }

  try {
    // 使用服务端软删除（设置deleted_at），与Modern版统一
    const res = await fetch(`${API_BASE}/note`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify({ id: noteId })
    });
    if (!res.ok) { showToast('操作失败', 'error'); return; }
    await loadAllData();
    switchView('dashboard');
    showToast('✅ 笔记已移到回收站', 'info');
  } catch (e) { console.error(e); showToast('操作失败', 'error'); }
});

const restoreNoteFromRecycleBin = requireAuth(async function(noteId) {
  if (!confirm('确定恢复这篇笔记吗？')) return;
  try {
    // 使用服务端恢复（清除deleted_at），与Modern版统一
    const res = await apiRestoreNote(API_BASE, userId, noteId);
    if (!res.ok) { showToast('恢复失败', 'error'); return; }
    await loadAllData();
    renderRecycleBinView();
    showToast('✅ 笔记已恢复');
  } catch (e) { console.error(e); showToast('恢复失败', 'error'); }
});

const permanentlyDeleteNote = requireAuth(async function(noteId) {
  if (!confirm('⚠️ 确定彻底删除？此操作不可恢复！')) return;
  try {
    await apiPermanentDeleteNote(API_BASE, userId, noteId);
    await loadAllData();
    renderRecycleBinView();
    showToast('✅ 笔记已彻底删除');
  } catch (e) { console.error(e); showToast('删除失败', 'error'); }
});

const emptyRecycleBin = requireAuth(async function() {
  try {
    // 获取回收站数据确认数量
    const res = await apiFetchTrashNotes(API_BASE, userId);
    if (!res.ok) { showToast('获取回收站失败', 'error'); return; }
    const trashNotes = await res.json();
    if (trashNotes.length === 0) { showToast('回收站暂无内容', 'warning'); return; }
    if (!confirm(`⚠️ 确定清空回收站？将永久删除 ${trashNotes.length} 篇笔记，不可恢复！`)) return;
    await apiClearTrash(API_BASE, userId);
    await loadAllData();
    renderRecycleBinView();
    showToast('✅ 回收站已清空');
  } catch (e) { console.error(e); showToast('清空失败', 'error'); }
});

async function renderRecycleBinView() {
  const recycleBinList = document.getElementById('recycleBinList');
  const recycleBinCount = document.getElementById('recycleBinCount');
  if (!recycleBinList || !recycleBinCount) return;

  // 从服务端回收站API获取数据（使用deleted_at，与Modern统一）
  let recycleBinNotes = [];
  try {
    const res = await apiFetchTrashNotes(API_BASE, userId);
    if (res.ok) {
      const trashData = await res.json();
      // 解密回收站数据
      for (const note of trashData) {
        try {
          const decryptedTitle = await decrypt(note.title_cipher, masterKey);
          recycleBinNotes.push({
            id: note.id,
            title: decryptedTitle || '无标题',
            deleted_at: note.deleted_at || Date.now(),
            category: note.category_cipher || ''
          });
        } catch (e) {
          recycleBinNotes.push({
            id: note.id,
            title: '(加密内容)',
            deleted_at: note.deleted_at || Date.now(),
            category: note.category_cipher || ''
          });
        }
      }
    }
  } catch (e) {
    console.error('获取回收站失败:', e);
  }

  recycleBinCount.textContent = recycleBinNotes.length;

  let html = '';
  if (recycleBinNotes.length === 0) {
    html = '<div class="text-center text-secondary py-16">回收站暂无内容</div>';
  } else {
    html = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">';
    recycleBinNotes.sort((a, b) => b.deleted_at - a.deleted_at).forEach(note => {
      const catName = categories.find(c => c.id === note.category)?.name || '未分类';
      html += `
        <div class="p-4 border border-dark-700 rounded-lg hover:border-danger transition-all bg-dark-900">
          <div class="flex justify-between items-start mb-2">
            <h3 class="text-lg font-medium">${note.title || '无标题'}</h3>
            <span class="text-xs px-2 py-1 rounded bg-danger/20 text-danger border border-danger">已删除</span>
          </div>
          <div class="text-sm text-secondary mb-3">
            <i class="fa-solid fa-folder mr-1"></i> ${catName} · 
            <i class="fa-solid fa-trash mr-1"></i> 删除于 ${timeAgo(note.deleted_at)}
          </div>
          <div class="flex gap-2 justify-end">
            <button onclick="permanentlyDeleteNote('${note.id}')" 
                    class="px-3 py-2 bg-danger/20 text-danger rounded hover:bg-danger/30 transition-all touch-friendly">
              <i class="fa-solid fa-trash mr-1"></i> 彻底删除
            </button>
            <button onclick="restoreNoteFromRecycleBin('${note.id}')" 
                    class="px-3 py-2 bg-primary rounded hover:bg-primary/90 transition-all text-white touch-friendly">
              <i class="fa-solid fa-rotate-left mr-1"></i> 恢复笔记
            </button>
          </div>
        </div>
      `;
    });
    html += '</div>';
  }
  recycleBinList.innerHTML = html;
}

// ====================== 草稿加密存储核心 ======================
function getDraftStorageKey(draftType, noteId = null) {
  if (!userId) return null;
  if (draftType === DRAFT_TYPE.NEW_NOTE) return `draft_${userId}_new_note`;
  if (draftType === DRAFT_TYPE.EXISTING_NOTE && noteId) return `draft_${userId}_note_${noteId}`;
  return null;
}

async function encryptDraft(draftData) {
  if (!masterKey) return null;
  try {
    const plaintext = JSON.stringify(draftData);
    return await encrypt(plaintext, masterKey);
  } catch (e) { console.error('草稿加密失败:', e); return null; }
}

async function decryptDraft(encryptedDraft) {
  if (!masterKey || !encryptedDraft) return null;
  try {
    const plaintext = await decrypt(encryptedDraft, masterKey);
    return JSON.parse(plaintext);
  } catch (e) { console.error('草稿解密失败:', e); return null; }
}

async function saveDraft(draftType, noteId = null, draftData) {
  if (!userId || !masterKey || isLocked) return;
  const storageKey = getDraftStorageKey(draftType, noteId);
  if (!storageKey) return;

  const fullDraftData = { ...draftData, draftType, noteId, savedAt: Date.now() };
  updateDraftIndicator('saving');
  
  try {
    const encryptedDraft = await encryptDraft(fullDraftData);
    if (encryptedDraft) {
      localStorage.setItem(storageKey, encryptedDraft);
      updateDraftIndicator('saved');
      setTimeout(() => {
        const indicator = document.getElementById('draftIndicator');
        if (indicator && indicator.classList.contains('saved')) updateDraftIndicator('draft');
      }, 3000);
    }
  } catch (e) { console.error('保存草稿失败:', e); updateDraftIndicator(''); }
}

async function getDraft(draftType, noteId = null) {
  const storageKey = getDraftStorageKey(draftType, noteId);
  if (!storageKey) return null;
  const encryptedDraft = localStorage.getItem(storageKey);
  if (!encryptedDraft) return null;
  return await decryptDraft(encryptedDraft);
}

function deleteDraft(draftType, noteId = null) {
  const storageKey = getDraftStorageKey(draftType, noteId);
  if (storageKey) localStorage.removeItem(storageKey);
  updateDraftIndicator('');
}

async function getAllDrafts() {
  if (!userId) return [];
  const drafts = [];
  const keys = Object.keys(localStorage);
  
  const newDraftKey = getDraftStorageKey(DRAFT_TYPE.NEW_NOTE);
  if (keys.includes(newDraftKey)) {
    const draft = await getDraft(DRAFT_TYPE.NEW_NOTE);
    if (draft) drafts.push(draft);
  }

  const noteDraftPrefix = `draft_${userId}_note_`;
  for (const key of keys) {
    if (key.startsWith(noteDraftPrefix)) {
      const noteId = key.replace(noteDraftPrefix, '');
      const draft = await getDraft(DRAFT_TYPE.EXISTING_NOTE, noteId);
      if (draft) drafts.push(draft);
    }
  }

  // 同时读取现代版草稿（encrypted_notes_drafts）以保持双版本草稿箱一致
  try {
    const modernDrafts = JSON.parse(localStorage.getItem('encrypted_notes_drafts') || '[]');
    const existingNoteIds = drafts.map(d => d.noteId).filter(Boolean);
    const existingTitles = drafts.map(d => d.title);
    for (const md of modernDrafts) {
      if (md.status === 'saved') continue;
      // 去重：如果经典版已有相同 noteId 或标题的草稿，跳过
      if (md.noteId && existingNoteIds.includes(md.noteId)) continue;
      if (md.title && existingTitles.includes(md.title)) continue;
      drafts.push({
        draftType: md.noteId ? DRAFT_TYPE.EXISTING_NOTE : DRAFT_TYPE.NEW_NOTE,
        noteId: md.noteId || null,
        title: md.title || '',
        content: md.content || '',
        category: md.category || '',
        tags: md.tags || '',
        savedAt: md.updatedAt || md.createdAt || Date.now(),
        _source: 'modern'
      });
    }
  } catch (e) {}

  return drafts.sort((a, b) => b.savedAt - a.savedAt);
}

function updateDraftIndicator(status) {
  const indicator = document.getElementById('draftIndicator');
  if (!indicator) return;
  indicator.classList.remove('saving', 'saved', 'draft');
  if (status === 'saving') {
    indicator.classList.add('saving');
    indicator.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1"></i> 正在保存草稿...';
  } else if (status === 'saved') {
    indicator.classList.add('saved');
    indicator.innerHTML = '<i class="fa-solid fa-check mr-1"></i> 草稿已保存';
  } else if (status === 'draft') {
    indicator.classList.add('draft');
    indicator.innerHTML = '<i class="fa-solid fa-file-pen mr-1"></i> 草稿状态';
  } else {
    indicator.innerHTML = '';
  }
}

// ====================== 自动保存机制 ======================
function setupAutoSave() {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  autoSaveTimer = setInterval(() => {
    if (currentView === 'editor' && !isLocked) {
      const draftData = {
        title: document.getElementById('noteTitle').value,
        content: document.getElementById('noteContent').innerHTML,
        category: document.getElementById('noteCategory').value,
        tags: document.getElementById('noteTags').value
      };
      if (currentDraftType === DRAFT_TYPE.NEW_NOTE) {
        saveDraft(DRAFT_TYPE.NEW_NOTE, null, draftData);
      } else if (currentDraftType === DRAFT_TYPE.EXISTING_NOTE && currentNoteId) {
        saveDraft(DRAFT_TYPE.EXISTING_NOTE, currentNoteId, draftData);
      }
    }
  }, 30 * 1000);
}

// ====================== 闲置锁定功能 ======================
function recordActivity() {
  lastActivityTime = Date.now();
  if (idleWarningTimer) { clearTimeout(idleWarningTimer); idleWarningTimer = null; }
  const lockWarning = document.getElementById('lockWarning');
  if (lockWarning) lockWarning.classList.add('hidden');
  resetIdleLockTimer();
}

function resetIdleLockTimer() {
  if (!lockSettings.enabled || isLocked) return;
  if (idleLockTimer) clearTimeout(idleLockTimer);
  idleLockTimer = setTimeout(() => showLockWarning(), lockSettings.timeout - lockSettings.warningTime);
}

function showLockWarning() {
  const lockWarning = document.getElementById('lockWarning');
  if (!lockWarning) return;
  lockWarning.classList.remove('hidden');
  let countdown = lockSettings.warningTime / 1000;
  const countdownEl = document.getElementById('lockWarningCountdown');
  if (countdownEl) countdownEl.textContent = countdown;
  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdownEl) countdownEl.textContent = countdown;
    if (countdown <= 0) clearInterval(countdownInterval);
  }, 1000);
  idleWarningTimer = setTimeout(() => lockSystem(), lockSettings.warningTime);
}

function lockSystem() {
  if (isLocked) return;
  isLocked = true;
  // 设置锁定标志到 sessionStorage，防止刷新页面后绕过锁定
  sessionStorage.setItem('isLocked', 'true');
  if (idleLockTimer) clearTimeout(idleLockTimer);
  if (idleWarningTimer) clearTimeout(idleWarningTimer);
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  const lockWarning = document.getElementById('lockWarning');
  if (lockWarning) lockWarning.classList.add('hidden');
  showLockScreen();
}

function showLockScreen() {
  const lockScreen = document.createElement('div');
  lockScreen.className = 'fixed inset-0 bg-dark-950 flex items-center justify-center z-[99999] lock-enter';
  lockScreen.id = 'lockScreen';
  lockScreen.innerHTML = `
    <div class="bg-dark-800 p-8 rounded-2xl max-w-md w-full border border-dark-700 mx-4 ${isMobile() ? 'modal-fullscreen-xs' : ''}">
      <div class="text-center mb-8">
        <div class="text-6xl mb-4 text-primary"><i class="fa-solid fa-lock"></i></div>
        <h2 class="text-2xl font-bold mb-2">系统已锁定</h2>
        <p class="text-secondary">由于长时间无操作，系统已自动锁定，请输入主密钥解锁</p>
      </div>
      <input type="password" id="unlockKey" placeholder="输入主密钥解锁" 
             class="w-full p-3 bg-dark-900 border border-dark-700 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-primary">
      <button onclick="unlockSystem()" class="w-full bg-primary hover:bg-primary/90 text-white p-3 rounded-lg font-medium transition-all touch-friendly">
        <i class="fa-solid fa-unlock mr-2"></i> 解锁
      </button>
      <div class="mt-4 text-center">
        <button onclick="logoutFromLock()" class="text-secondary hover:text-white text-sm touch-friendly">
          <i class="fa-solid fa-sign-out mr-1"></i> 退出登录
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(lockScreen);
  setTimeout(() => {
    const unlockInput = document.getElementById('unlockKey');
    if (unlockInput) unlockInput.focus();
  }, 100);
  const unlockHandler = (e) => { if (e.key === 'Enter') unlockSystem(); };
  setTimeout(() => {
    const unlockInput = document.getElementById('unlockKey');
    if (unlockInput) unlockInput.addEventListener('keypress', unlockHandler);
  }, 100);
}

async function unlockSystem() {
  const unlockKey = document.getElementById('unlockKey').value;
  if (!unlockKey) { showToast('请输入主密钥', 'error'); return; }
  const keyHash = await getKeyHash(unlockKey);
  // 优先使用内存中的 masterKey，若为空（刷新后）则从 sessionStorage 恢复
  const currentMasterKey = masterKey || sessionStorage.getItem('masterKey') || '';
  const originalKeyHash = await getKeyHash(currentMasterKey);
  if (keyHash !== originalKeyHash) { showToast('主密钥错误', 'error'); return; }
  
  // 如果 masterKey 被清除（如 Ctrl+L 后刷新），恢复它
  if (!masterKey && currentMasterKey) {
    masterKey = currentMasterKey;
  }
  
  isLocked = false;
  // 清除锁定标志
  sessionStorage.removeItem('isLocked');
  const lockScreen = document.getElementById('lockScreen');
  if (lockScreen) lockScreen.remove();
  recordActivity();
  setupAutoSave();
  resetIdleLockTimer();
  showToast('✅ 解锁成功');
}

function logoutFromLock() {
  isLocked = false;
  // 清除锁定标志
  sessionStorage.removeItem('isLocked');
  const lockScreen = document.getElementById('lockScreen');
  if (lockScreen) lockScreen.remove();
  logout();
}

function setupIdleLockListeners() {
  const events = ['mousemove', 'mousedown', 'click', 'scroll', 'keydown', 'keyup', 'touchstart', 'touchmove'];
  events.forEach(event => {
    document.addEventListener(event, () => { if (!isLocked) recordActivity(); }, { passive: true });
  });
  // Ctrl+L 快捷键：立即锁定系统
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      if (!isLocked) {
        masterKey = '';
        lockSystem();
        showToast('🔒 已通过快捷键锁定系统', 'info');
      }
    }
  });
}

function loadLockSettings() {
  try {
    const saved = localStorage.getItem(`lockSettings_${userId}`);
    if (saved) lockSettings = JSON.parse(saved);
  } catch (e) { console.error('加载锁定设置失败:', e); }
}

function saveLockSettings() {
  if (!userId) return;
  localStorage.setItem(`lockSettings_${userId}`, JSON.stringify(lockSettings));
}

function showLockSettingsModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]';
  modal.id = 'lockSettingsModal';
  modal.innerHTML = `
    <div class="bg-dark-800 rounded-lg p-6 w-full max-w-md mx-4 ${isMobile() ? 'modal-fullscreen-xs' : ''}">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-lg font-bold">安全设置</h3>
        <button onclick="document.getElementById('lockSettingsModal').remove()" class="text-secondary hover:text-white touch-friendly">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
      <div class="space-y-4 mb-6">
        <div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" id="lockEnabled" ${lockSettings.enabled ? 'checked' : ''} 
                   class="w-4 h-4 rounded bg-dark-900 border-dark-700">
            <span>启用闲置自动锁定</span>
          </label>
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">锁定时长</label>
          <select id="lockTimeout" class="w-full p-2 bg-dark-900 border border-dark-700 rounded focus:outline-none focus:ring-1 focus:ring-primary">
            <option value="300000" ${lockSettings.timeout === 5 * 60 * 1000 ? 'selected' : ''}>5分钟</option>
            <option value="600000" ${lockSettings.timeout === 10 * 60 * 1000 ? 'selected' : ''}>10分钟</option>
            <option value="1800000" ${lockSettings.timeout === 30 * 60 * 1000 ? 'selected' : ''}>30分钟</option>
            <option value="0" ${lockSettings.timeout === 0 ? 'selected' : ''}>从不锁定</option>
          </select>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <button onclick="document.getElementById('lockSettingsModal').remove()" class="px-4 py-2 bg-dark-700 rounded hover:bg-dark-600 transition-all touch-friendly">取消</button>
        <button onclick="saveLockSettingsFromModal()" class="px-4 py-2 bg-primary rounded hover:bg-primary/90 transition-all text-white touch-friendly">保存设置</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function saveLockSettingsFromModal() {
  const enabled = document.getElementById('lockEnabled').checked;
  const timeout = parseInt(document.getElementById('lockTimeout').value);
  lockSettings.enabled = enabled;
  lockSettings.timeout = timeout === 0 ? 0 : timeout;
  if (lockSettings.timeout === 0) lockSettings.enabled = false;
  saveLockSettings();
  if (idleLockTimer) clearTimeout(idleLockTimer);
  if (idleWarningTimer) clearTimeout(idleWarningTimer);
  if (lockSettings.enabled && lockSettings.timeout > 0) resetIdleLockTimer();
  document.getElementById('lockSettingsModal').remove();
  showToast('✅ 设置已保存');
}

// ====================== 分类/标签弹窗功能 ======================
function showAllCategoriesModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]';
  modal.id = 'allCategoriesModal';
  modal.innerHTML = `
    <div class="bg-dark-800 rounded-lg p-6 w-full max-w-lg max-h-[80vh] flex flex-col mx-4 ${isMobile() ? 'modal-fullscreen-xs' : ''}">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold">全部分类</h3>
        <button onclick="document.getElementById('allCategoriesModal').remove()" class="text-secondary hover:text-white touch-friendly">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto scrollbar-hide">
        <div class="grid grid-cols-1 gap-2">
          <div class="p-3 border border-dark-700 rounded-lg hover:border-primary cursor-pointer transition-all touch-friendly" 
               onclick="filterByCategory(''); document.getElementById('allCategoriesModal').remove();">
            <div class="flex justify-between items-center">
              <span class="font-medium"><i class="fa-solid fa-folder mr-2"></i> 全部笔记</span>
              <span class="text-sm text-secondary">${notes.filter(n => !n.meta.is_deleted).length} 篇</span>
            </div>
          </div>
          <div class="p-3 border border-dark-700 rounded-lg hover:border-info cursor-pointer transition-all touch-friendly" 
               onclick="switchView('drafts'); document.getElementById('allCategoriesModal').remove();">
            <div class="flex justify-between items-center">
              <span class="font-medium text-info"><i class="fa-solid fa-file-pen mr-2"></i> 草稿管理</span>
              <span class="text-sm text-secondary">点击查看</span>
            </div>
          </div>
          ${categories.map(cat => {
            const catNotes = notes.filter(note => note.category === cat.id && !note.meta.is_deleted);
            return `
              <div class="p-3 border border-dark-700 rounded-lg hover:border-primary cursor-pointer transition-all touch-friendly" 
                   onclick="filterByCategory('${cat.id}'); document.getElementById('allCategoriesModal').remove();">
                <div class="flex justify-between items-center">
                  <span class="font-medium"><i class="fa-solid fa-folder mr-2"></i> ${cat.name}</span>
                  <span class="text-sm text-secondary">${catNotes.length} 篇</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function showAllTagsModal() {
  const allTags = new Set();
  notes.filter(n => !n.meta.is_deleted).forEach(note => {
    const cleanTags = extractCleanTags(note.tags);
    cleanTags.forEach(tag => allTags.add(tag));
  });
  const tagList = Array.from(allTags);

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]';
  modal.id = 'allTagsModal';
  modal.innerHTML = `
    <div class="bg-dark-800 rounded-lg p-6 w-full max-w-lg max-h-[80vh] flex flex-col mx-4 ${isMobile() ? 'modal-fullscreen-xs' : ''}">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold">全部标签</h3>
        <button onclick="document.getElementById('allTagsModal').remove()" class="text-secondary hover:text-white touch-friendly">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto scrollbar-hide">
        <div class="flex flex-wrap gap-2">
          ${tagList.map(tag => {
            const tagNotes = notes.filter(note => {
              const cleanTags = extractCleanTags(note.tags);
              return cleanTags.includes(tag) && !note.meta.is_deleted;
            });
            return `
              <div class="px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg hover:border-primary cursor-pointer transition-all tag-badge touch-friendly" 
                   onclick="filterNotesByTag('${tag}'); document.getElementById('allTagsModal').remove();">
                <span class="font-medium"># ${tag}</span>
                <span class="text-xs text-secondary ml-1">${tagNotes.length}</span>
              </div>
            `;
          }).join('')}
          ${tagList.length === 0 ? '<div class="w-full text-center text-secondary py-8">暂无标签</div>' : ''}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function filterNotesByTag(tag) {
  const filtered = notes.filter(note => {
    const cleanTags = extractCleanTags(note.tags);
    return cleanTags.includes(tag) && !note.meta.is_deleted;
  });
  switchView('dashboard');
  setTimeout(() => {
    renderNotes(filtered);
    showToast(`已筛选标签「${tag}」的笔记`, 'info');
  }, 100);
}

// ====================== 【核心修复】视图切换逻辑，完全保留三列布局 ======================
function switchView(view) {
  currentView = view;
  
  const dashboardView = document.getElementById('dashboardView');
  const editorView = document.getElementById('editorView');
  const knowledgeView = document.getElementById('knowledgeView');
  const draftsView = document.getElementById('draftsView');
  const recycleBinView = document.getElementById('recycleBinView');
  const noteListColumn = document.getElementById('noteListColumn');
  const contentColumn = document.getElementById('contentColumn');

  if (dashboardView) dashboardView.classList.add('hidden');
  if (editorView) editorView.classList.add('hidden');
  if (knowledgeView) knowledgeView.classList.add('hidden');
  if (draftsView) draftsView.classList.add('hidden');
  if (recycleBinView) recycleBinView.classList.add('hidden');

  if (isMobile()) {
    closeSidebar();
  }

  if (noteListColumn) {
    if (isDesktop()) {
      noteListColumn.classList.remove('hidden');
    } else {
      noteListColumn.classList.add('hidden');
    }
  }
  if (contentColumn) {
    contentColumn.classList.remove('lg:col-span-10');
    contentColumn.classList.add('lg:col-span-7');
  }

  if (view === 'dashboard' && dashboardView) dashboardView.classList.remove('hidden');
  if (view === 'editor' && editorView) editorView.classList.remove('hidden');
  if (view === 'knowledge' && knowledgeView) knowledgeView.classList.remove('hidden');
  if (view === 'drafts' && draftsView) draftsView.classList.remove('hidden');
  if (view === 'recycleBin' && recycleBinView) recycleBinView.classList.remove('hidden');

  renderCategories();
  if (view === 'dashboard') renderDashboard();
  if (view === 'drafts') renderDraftsView();
  if (view === 'recycleBin') renderRecycleBinView();
  if (view === 'knowledge') {
    currentKnowledgeView = 'home';
    currentKnowledgeCategory = null;
    currentKnowledgeNote = null;
    renderKnowledgeView();
  }
  
  updateBottomNav(view);
}

function updateBottomNav(view) {
  const navItems = document.querySelectorAll('.bottom-nav-item');
  navItems.forEach(item => {
    item.classList.remove('text-primary', 'bg-primary/10');
    item.classList.add('text-secondary');
  });
  
  const activeItem = document.querySelector(`.bottom-nav-item[data-view="${view}"]`);
  if (activeItem) {
    activeItem.classList.remove('text-secondary');
    activeItem.classList.add('text-primary', 'bg-primary/10');
  }
}

// ====================== 草稿管理视图 ======================
async function renderDraftsView() {
  const draftsList = document.getElementById('draftsList');
  if (!draftsList) return;
  const drafts = await getAllDrafts();
  let html = '';
  if (drafts.length === 0) {
    html = '<div class="text-center text-secondary py-16">暂无待保存的草稿</div>';
  } else {
    html = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">';
    drafts.forEach(draft => {
      const isNewNoteDraft = draft.draftType === DRAFT_TYPE.NEW_NOTE;
      const catName = isNewNoteDraft ? '新建草稿' : categories.find(c => c.id === draft.category)?.name || '未分类';
      const noteTitle = draft.title || '无标题';
      html += `
        <div class="p-4 border border-dark-700 rounded-lg hover:border-info transition-all bg-dark-900">
          <div class="flex justify-between items-start mb-2">
            <h3 class="text-lg font-medium">${noteTitle}</h3>
            <span class="text-xs px-2 py-1 rounded draft-tag">${isNewNoteDraft ? '新建草稿' : '编辑草稿'}</span>
          </div>
          <div class="text-sm text-secondary mb-3">
            <i class="fa-solid fa-folder mr-1"></i> ${catName} · 
            <i class="fa-solid fa-clock mr-1"></i> ${timeAgo(draft.savedAt)}
          </div>
          <div class="text-xs text-secondary mb-4 line-clamp-2">
            ${(draft.content || '').replace(/<[^>]*>/g, '').substring(0, 100)}${(draft.content || '').replace(/<[^>]*>/g, '').length > 100 ? '...' : ''}
          </div>
          <div class="flex gap-2 justify-end">
            <button onclick="deleteDraft('${draft.draftType}', '${draft.noteId || ''}'); renderDraftsView();" 
                    class="px-3 py-2 bg-danger/20 text-danger rounded hover:bg-danger/30 transition-all touch-friendly">
              <i class="fa-solid fa-trash mr-1"></i> 删除
            </button>
            <button onclick="openDraft('${draft.draftType}', '${draft.noteId || ''}');" 
                    class="px-3 py-2 bg-primary rounded hover:bg-primary/90 transition-all text-white touch-friendly">
              <i class="fa-solid fa-edit mr-1"></i> 打开编辑
            </button>
          </div>
        </div>
      `;
    });
    html += '</div>';
  }
  draftsList.innerHTML = html;
}

async function openDraft(draftType, noteId) {
  const draft = await getDraft(draftType, noteId || null);
  if (!draft) { showToast('草稿不存在或已损坏', 'error'); return; }
  renderCategories();
  await new Promise(resolve => setTimeout(resolve, 10));
  currentDraftType = draftType;
  currentNoteId = noteId || crypto.randomUUID();
  
  document.getElementById('noteTitle').value = draft.title;
  document.getElementById('noteContent').innerHTML = draft.content;
  document.getElementById('noteCategory').value = draft.category;
  document.getElementById('noteTags').value = draft.tags;

  const noteMeta = document.getElementById('noteMeta');
  if (draftType === DRAFT_TYPE.NEW_NOTE) {
    noteMeta.innerHTML = `新建草稿 · 最后保存: ${formatTime(draft.savedAt)}`;
  } else {
    const targetNote = notes.find(n => n.id === noteId);
    noteMeta.innerHTML = `编辑草稿 · 原笔记修改${targetNote?.revision_count || 0}次 · 最后保存: ${formatTime(draft.savedAt)}`;
  }

  document.getElementById('noteWordCount').textContent = `${draft.content.length} 字`;
  updateDraftIndicator('draft');
  switchView('editor');
}

// ====================== 登录/注册核心逻辑 ======================
async function loginOrRegister() {
  const key = document.getElementById('loginKey').value;
  if (key.length < 8) { showToast('密码至少需要8位', 'error'); return; }
  masterKey = key;
  const keyHash = await getKeyHash(key);

  try {
    const loginRes = await loginUser(API_BASE, keyHash);

    if (loginRes.ok) {
      const data = await loginRes.json();
      userId = data.userId;
      // 保存登录状态到 sessionStorage，支持刷新后恢复
      sessionStorage.setItem('userId', userId);
      sessionStorage.setItem('masterKey', masterKey);
      onLoginSuccess();
    } else {
      const registerRes = await registerUser(API_BASE, keyHash);

      if (registerRes.ok) {
        const data = await registerRes.json();
        userId = data.userId;
        // 保存登录状态到 sessionStorage，支持刷新后恢复
        sessionStorage.setItem('userId', userId);
        sessionStorage.setItem('masterKey', masterKey);
        showRecoveryCodeModal(data.recovery_code);
        onLoginSuccess();
      } else {
        const err = await registerRes.json();
        showToast(err.err || '操作失败', 'error');
      }
    }
  } catch (e) { console.error(e); showToast('网络错误', 'error'); }
}


function showRecoveryCodeModal(code) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]';
  modal.id = 'recoveryCodeModal';
  modal.innerHTML = `
    <div class="bg-dark-800 p-8 rounded-2xl max-w-md w-full border border-dark-700 mx-4 ${isMobile() ? 'modal-fullscreen-xs' : ''}">
      <div class="text-center mb-6">
        <div class="text-5xl mb-4 text-warning"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <h2 class="text-2xl font-bold mb-2">请务必保存好你的恢复码</h2>
        <p class="text-secondary">恢复码仅显示这一次，丢失无法找回！</p>
      </div>
      <div class="bg-dark-900 p-4 rounded-lg border border-dark-700 text-center mb-6">
        <div class="text-2xl font-mono font-bold tracking-wider text-primary">${code}</div>
      </div>
      <p class="text-xs text-secondary text-center mb-6">⚠️ 请截图或复制保存，关闭后将无法再次查看</p>
      <button onclick="document.getElementById('recoveryCodeModal').remove()" class="w-full bg-primary text-white p-3 rounded-lg hover:bg-primary/90 touch-friendly">
        我已保存，关闭
      </button>
    </div>
  `;
  document.body.appendChild(modal);
}

function showRecoveryModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]';
  modal.id = 'recoveryModal';
  modal.innerHTML = `
    <div class="bg-dark-800 rounded-lg p-6 w-full max-w-md mx-4 ${isMobile() ? 'modal-fullscreen-xs' : ''}">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-xl font-bold">恢复码重置主密钥</h2>
        <button onclick="document.getElementById('recoveryModal').remove()" class="text-secondary hover:text-white touch-friendly">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
      <div class="space-y-4 mb-6">
        <div>
          <label class="block text-sm font-medium mb-2">恢复码</label>
          <input id="recoveryCodeInput" type="text" placeholder="输入你的恢复码" 
                 class="w-full p-3 bg-dark-900 border border-dark-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">新主密钥</label>
          <input id="newPasswordInput" type="password" placeholder="新密码至少8位" 
                 class="w-full p-3 bg-dark-900 border border-dark-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
        </div>
      </div>
      <button onclick="resetPasswordByRecovery()" class="w-full bg-primary text-white p-3 rounded-lg hover:bg-primary/90 touch-friendly">
        确认重置
      </button>
    </div>
  `;
  document.body.appendChild(modal);
}

async function resetPasswordByRecovery() {
  const recoveryCode = document.getElementById('recoveryCodeInput').value.trim().toUpperCase();
  const newPassword = document.getElementById('newPasswordInput').value;
  if (!recoveryCode) { showToast('请输入恢复码', 'error'); return; }
  if (newPassword.length < 8) { showToast('新密码至少8位', 'error'); return; }

  try {
    const newKeyHash = await getKeyHash(newPassword);
    const res = await resetPassword(API_BASE, recoveryCode, newKeyHash);

    if (!res.ok) { const err = await res.json(); showToast(err.err || '重置失败', 'error'); return; }
    const data = await res.json();
    document.getElementById('recoveryModal').remove();
    showRecoveryCodeModal(data.new_recovery_code);
    showToast('✅ 重置成功！请使用新密码登录');
    document.getElementById('loginKey').value = newPassword;
  } catch (e) { console.error(e); showToast('网络错误', 'error'); }
}

function onLoginSuccess() {
  const loginPage = document.getElementById('loginPage');
  const appPage = document.getElementById('appPage');
  loginPage.classList.add('hidden', 'page-hidden');
  appPage.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  loadLockSettings();
  loadSortSettings();
  loadAllData();
  switchView('dashboard');
  lastActivityTime = Date.now();
  setupIdleLockListeners();
  resetIdleLockTimer();
  setupAutoSave();
}

function logout() {
  if (!confirm('确定退出吗？')) return;
  if (idleLockTimer) clearTimeout(idleLockTimer);
  if (idleWarningTimer) clearTimeout(idleWarningTimer);
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  const lockWarning = document.getElementById('lockWarning');
  if (lockWarning) lockWarning.classList.add('hidden');
  isLocked = false;
  masterKey = '';
  userId = '';
  notes = [];
  categories = [];
  currentNoteId = null;
  currentDraftType = null;
  currentKnowledgeView = 'home';
  currentKnowledgeCategory = null;
  currentKnowledgeNote = null;
  // 清除 sessionStorage 中的登录和锁定状态
  sessionStorage.removeItem('userId');
  sessionStorage.removeItem('masterKey');
  sessionStorage.removeItem('isLocked');
  
  const loginPage = document.getElementById('loginPage');
  const appPage = document.getElementById('appPage');
  loginPage.classList.remove('hidden', 'page-hidden');
  appPage.classList.add('hidden');
  document.getElementById('loginKey').value = '';
  document.body.style.overflow = 'hidden';
}

// ====================== 数据加载（性能优化版） ======================
// 采用懒加载策略：首次只解密标题/分类/标签，内容在打开笔记时按需解密
// 大幅减少页面加载时的计算量（1000笔记从4000次解密降至1000次）

const loadAllData = requireAuth(async function() {
  try {
    // 使用 v2 API 获取分类（与Modern UI保持一致）
    const catRes = await fetchCategories(API_BASE, userId);
    const catData = await catRes.json();
    // v2 API 返回格式: { data: [...] }
    const encryptedCats = catData?.data || catData || [];
    const newCategories = [];
    if (Array.isArray(encryptedCats)) {
      for (const cat of encryptedCats) {
        if (!cat || !cat.name_cipher) {
          console.warn('[经典版] 分类数据格式异常:', cat);
          continue;
        }
        const decryptedName = await decrypt(cat.name_cipher, masterKey);
        const catId = cat.id || `cat_${cat.name_cipher.substring(0, 8)}`;
        newCategories.push({ id: catId, name: decryptedName || '未命名分类' });
      }
    } else {
      console.warn('[经典版] 分类API返回非数组:', encryptedCats);
    }
    categories = newCategories;

    // 使用 v2 API 分页获取笔记（与Modern UI保持一致）
    const notesRes = await fetchNotesPaginated(API_BASE, userId, {
      page: 1,
      limit: 500,
      includeContent: true  // 经典页需要内容，方便预览
    });
    const notesData = await notesRes.json();
    // v2 API 返回格式: { notes: [...], total, page, limit, hasMore }
    const encryptedNotes = notesData?.notes || notesData?.data || (Array.isArray(notesData) ? notesData : []);
    const newNotes = [];
    if (Array.isArray(encryptedNotes)) {
      for (const note of encryptedNotes) {
        if (!note || !note.id) {
          console.warn('[经典版] 笔记数据格式异常:', note);
          continue;
        }
        // 只解密标题、分类和标签，内容按需懒加载
        const decryptedTitle = await decrypt(note.title_cipher || '', masterKey);
        const decryptedCategory = await decrypt(note.category_cipher || '', masterKey);
        const decryptedTags = await decrypt(note.tags_cipher || '', masterKey);
        
        let parsedTags = [];
        try {
          parsedTags = decryptedTags ? JSON.parse(decryptedTags) : [];
          if (!Array.isArray(parsedTags)) parsedTags = [];
        } catch (e) { parsedTags = []; }

        const meta = decodeMetaFromTags(parsedTags);
        newNotes.push({
          id: note.id,
          title: decryptedTitle || '无标题',
          content: '',           // 内容懒加载，打开笔记时解密
          _encryptedContent: note.ciphertext || '', // 保存密文供后续按需解密
          category: decryptedCategory || '',
          tags: parsedTags,
          meta: meta,
          revision_count: note.revision_count || 0,
          created_at: note.created_at || Date.now(),
          updated_at: note.updated_at || Date.now()
        });
      }
    } else {
      console.warn('[经典版] 笔记API返回非数组:', encryptedNotes);
    }
    notes = newNotes;
    renderCategories();
    renderNotes();
    renderDashboard();
    if (currentView === 'knowledge') renderKnowledgeView();
  } catch (e) { console.error(e); showToast('数据加载失败', 'error'); }
});

// ====================== 分类渲染 ======================
function renderCategories() {
  const categoryList = document.getElementById('categoryList');
  const mobileCategoryList = document.getElementById('mobileCategoryList');
  
  const renderHTML = () => {
    let html = `
      <div class="p-2 rounded hover:bg-dark-800 cursor-pointer ${currentView === 'dashboard' ? 'bg-primary/20 text-white' : 'text-secondary'}" onclick="switchView('dashboard')">
        <i class="fa-solid fa-chart-line mr-2"></i> 仪表盘
      </div>
      <div class="p-2 rounded hover:bg-dark-800 cursor-pointer ${currentView === 'drafts' ? 'bg-info/20 text-white' : 'text-secondary'}" onclick="switchView('drafts')">
        <i class="fa-solid fa-file-pen mr-2"></i> 草稿管理
      </div>
      <div class="p-2 rounded hover:bg-dark-800 cursor-pointer ${currentView === 'recycleBin' ? 'bg-danger/20 text-white' : 'text-secondary'}" onclick="switchView('recycleBin')">
        <i class="fa-solid fa-trash mr-2"></i> 回收站
      </div>
      <div class="p-2 rounded hover:bg-dark-800 cursor-pointer text-secondary" onclick="filterByCategory('')">
        <i class="fa-solid fa-book mr-2"></i> 全部笔记
      </div>
    `;
    
    for (const cat of categories) {
      const colorIndex = getCategoryColorIndex(cat.id);
      html += `
        <div class="flex justify-between items-center p-2 rounded hover:bg-dark-800 cursor-pointer text-secondary group">
          <span onclick="filterByCategory('${cat.id}')" class="flex items-center gap-2">
            <i class="fa-solid fa-folder"></i> 
            <span class="category-badge px-2 py-0.5 rounded text-xs cat-color-${colorIndex}">${cat.name}</span>
          </span>
          <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onclick="event.stopPropagation(); editCategory('${cat.id}')" class="text-secondary hover:text-primary text-xs touch-friendly"><i class="fa-solid fa-edit"></i></button>
            <button onclick="event.stopPropagation(); deleteCategory('${cat.id}')" class="text-secondary hover:text-danger text-xs touch-friendly"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      `;
    }
    return html;
  };
  
  if (categoryList) categoryList.innerHTML = renderHTML();
  if (mobileCategoryList) mobileCategoryList.innerHTML = renderHTML();

  const noteCategory = document.getElementById('noteCategory');
  if (noteCategory) {
    let selectHtml = '<option value="">无分类</option>';
    for (const cat of categories) {
      selectHtml += `<option value="${cat.id}">${cat.name}</option>`;
    }
    noteCategory.innerHTML = selectHtml;
  }
}

// ====================== 分类操作 ======================
function showCreateCategoryModal() {
  document.getElementById('categoryNameInput').value = '';
  document.getElementById('createCategoryModal').classList.remove('hidden');
  document.getElementById('categoryNameInput').focus();
}

const createCategoryConfirm = requireAuth(async function() {
  const name = document.getElementById('categoryNameInput').value.trim();
  if (!name) { showToast('请输入分类名称', 'error'); return; }
  
  const existingCat = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existingCat) { showToast('该分类已存在', 'warning'); return; }
  
  const id = crypto.randomUUID();
  const name_cipher = await encrypt(name, masterKey);
  await saveCategory(API_BASE, userId, { id, name_cipher });
  await loadAllData();
  document.getElementById('createCategoryModal').classList.add('hidden');
  showToast('✅ 分类创建成功');
});

const editCategory = requireAuth(async function(catId) {
  const cat = categories.find(c => c.id === catId);
  const newName = prompt('输入新分类名：', cat.name);
  if (!newName || newName === cat.name) return;
  
  const existingCat = categories.find(c => c.id !== catId && c.name.toLowerCase() === newName.toLowerCase());
  if (existingCat) { showToast('该分类已存在', 'warning'); return; }
  
  const name_cipher = await encrypt(newName, masterKey);
  // 使用 v2 API 更新分类（PUT /api/categories/:id），与Modern UI保持一致
  await updateCategory(API_BASE, userId, catId, { name_cipher, color: '#6366f1' });
  await loadAllData();
  showToast('✅ 分类修改成功');
});

const deleteCategory = requireAuth(async function(id) {
  if (!confirm('确定删除这个分类吗？分类下的笔记不会删除')) return;
  await removeCategory(API_BASE, userId, id);
  await loadAllData();
  showToast('✅ 分类删除成功');
});

// ====================== 仪表盘渲染 ======================
async function renderDashboard() {
  const statNotes = document.getElementById('statNotes');
  const statCats = document.getElementById('statCats');
  const statTags = document.getElementById('statTags');
  const statDrafts = document.getElementById('statDrafts');
  const statRecycleBin = document.getElementById('statRecycleBin');
  const statLastUpdate = document.getElementById('statLastUpdate');
  const recentNotes = document.getElementById('recentNotes');

  if (!statNotes || !recentNotes) return;

  const activeNotes = notes.filter(note => !note.meta.is_deleted);
  const recycleBinNotes = notes.filter(note => note.meta.is_deleted);
  const totalNotes = activeNotes.length;
  const totalCats = categories.length;
  const allTags = new Set();
  activeNotes.forEach(note => {
    const cleanTags = extractCleanTags(note.tags);
    cleanTags.forEach(tag => allTags.add(tag));
  });
  const totalTags = allTags.size;
  const lastUpdate = activeNotes.length > 0 ? Math.max(...activeNotes.map(n => n.updated_at)) : 0;
  const allDrafts = await getAllDrafts();
  const totalDrafts = allDrafts.length;

  if (statNotes) statNotes.textContent = totalNotes;
  if (statCats) statCats.textContent = totalCats;
  if (statTags) statTags.textContent = totalTags;
  if (statDrafts) statDrafts.textContent = totalDrafts;
  if (statRecycleBin) statRecycleBin.textContent = recycleBinNotes.length;
  if (statLastUpdate) statLastUpdate.textContent = lastUpdate ? timeAgo(lastUpdate) : '暂无';

  let html = '';
  if (activeNotes.length === 0) {
    html = '<div class="text-center text-secondary py-8">暂无笔记，点击右上角「新建笔记」开始</div>';
  } else {
    const sortedNotes = sortNotes(activeNotes).slice(0, 12);
    html = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">';
    sortedNotes.forEach(note => {
      const catName = categories.find(c => c.id === note.category)?.name || '未分类';
      const colorIndex = getCategoryColorIndex(note.category);
      const cleanTags = extractCleanTags(note.tags);
      html += `
        <div class="p-3 border border-dark-700 rounded-lg hover:border-primary transition-all cursor-pointer touch-friendly bg-dark-900/50" onclick="openNote('${note.id}')">
          <div class="flex items-start justify-between mb-2">
            <h4 class="font-semibold text-sm truncate flex-1">${note.title || '无标题'}</h4>
            ${note.meta.is_top ? '<i class="fa-solid fa-thumbtack text-warning text-xs ml-2"></i>' : ''}
          </div>
          <div class="flex flex-wrap gap-1.5 mb-2">
            <span class="category-badge px-1.5 py-0.5 rounded text-xs cat-color-${colorIndex}">
              ${catName}
            </span>
            ${cleanTags.slice(0, 2).map(tag => `
              <span class="tag-badge px-1.5 py-0.5 rounded text-xs">
                #${tag}
              </span>
            `).join('')}
          </div>
          <div class="text-xs text-secondary flex justify-between items-center">
            <span class="text-info">修改${note.revision_count}次</span>
            <span class="text-secondary/70">${timeAgo(note.updated_at)}</span>
          </div>
        </div>
      `;
    });
    html += '</div>';
  }
  recentNotes.innerHTML = html;
}

// ====================== 笔记渲染 ======================
function renderNotes(filteredNotes = null) {
  const notesList = document.getElementById('notesList');
  if (!notesList) return;

  const activeNotes = notes.filter(note => !note.meta.is_deleted);
  const notesToRender = filteredNotes || sortNotes(activeNotes);
  
  let html = '';
  if (notesToRender.length === 0) {
    html = '<div class="text-center text-secondary py-8">暂无笔记</div>';
  } else {
    for (const note of notesToRender) {
      const categoryName = categories.find(c => c.id === note.category)?.name || '未分类';
      const colorIndex = getCategoryColorIndex(note.category);
      const isTop = note.meta.is_top;
      const cleanTags = extractCleanTags(note.tags);
      
      html += `
        <div class="p-3 border border-dark-700 rounded-lg hover:border-primary cursor-pointer transition-all ${currentNoteId === note.id ? 'border-primary bg-primary/10' : ''} ${isTop ? 'note-item-top' : ''}" onclick="openNote('${note.id}')">
          <div class="flex justify-between items-start">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                ${isTop ? '<span class="text-xs px-2 py-0.5 rounded top-tag"><i class="fa-solid fa-thumbtack mr-1"></i> 置顶</span>' : ''}
                <h4 class="font-medium truncate">${note.title || '无标题'}</h4>
              </div>
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="category-badge px-2 py-0.5 rounded text-xs cat-color-${colorIndex}">
                  <i class="fa-solid fa-folder mr-1"></i> ${categoryName}
                </span>
                ${cleanTags.slice(0, 2).map(tag => `
                  <span class="tag-badge px-2 py-0.5 rounded text-xs">
                    # ${tag}
                  </span>
                `).join('')}
              </div>
              <div class="text-xs text-secondary">
                修改${note.revision_count}次 · ${timeAgo(note.updated_at)}
              </div>
            </div>
            <button onclick="event.stopPropagation(); toggleNoteTop('${note.id}')" 
                    class="ml-2 p-1.5 rounded hover:bg-dark-700 transition-all ${isTop ? 'top-btn-active' : 'text-secondary'} touch-friendly">
              <i class="fa-solid fa-thumbtack"></i>
            </button>
          </div>
        </div>
      `;
    }
  }
  notesList.innerHTML = html;
  renderSortControl();
}

function filterByCategory(categoryId) {
  let filtered = notes.filter(note => !note.meta.is_deleted);
  if (categoryId) filtered = filtered.filter(note => note.category === categoryId);
  renderNotes(sortNotes(filtered));
  switchView('dashboard');
}

// ====================== 新建/打开笔记逻辑 ======================
const createNewNote = requireAuth(async function() {
  const newDraft = await getDraft(DRAFT_TYPE.NEW_NOTE);
  
  if (newDraft) {
    currentDraftType = DRAFT_TYPE.NEW_NOTE;
    currentNoteId = crypto.randomUUID();
    renderCategories();
    await new Promise(resolve => setTimeout(resolve, 10));
    document.getElementById('noteTitle').value = newDraft.title;
    document.getElementById('noteContent').innerHTML = newDraft.content;
    document.getElementById('noteCategory').value = newDraft.category;
    document.getElementById('noteTags').value = newDraft.tags;
    document.getElementById('noteMeta').innerHTML = `恢复新建草稿 · 最后保存: ${formatTime(newDraft.savedAt)}`;
    document.getElementById('noteWordCount').textContent = `${newDraft.content.length} 字`;
    updateDraftIndicator('draft');
    showToast('✅ 已恢复未保存的新建草稿', 'info');
  } else {
    currentNoteId = crypto.randomUUID();
    currentDraftType = DRAFT_TYPE.NEW_NOTE;
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').innerHTML = '';
    document.getElementById('noteCategory').value = '';
    document.getElementById('noteTags').value = '';
    document.getElementById('noteMeta').innerHTML = `新建笔记 · ${formatTime(Date.now())}`;
    document.getElementById('noteWordCount').textContent = '0 字';
    updateDraftIndicator('');
  }
  switchView('editor');
  renderNotes();
  recordActivity();
});

// 按需解密笔记内容（懒加载，仅当打开笔记时调用）
async function ensureNoteContentLoaded(note) {
  if (!note || note.content) return note; // 内容已加载
  if (note._encryptedContent) {
    note.content = await decrypt(note._encryptedContent, masterKey) || '';
    delete note._encryptedContent; // 释放密文内存
  }
  // 如果还是没有内容（KV缓存未返回ciphertext），则从后端按 ID 单独获取完整笔记内容
  if (!note.content) {
    try {
      const noteRes = await fetchNoteById(API_BASE, userId, note.id);
      if (noteRes.ok) {
        const noteData = await noteRes.json();
        const rawNote = noteData.note || noteData;
        if (rawNote && rawNote.ciphertext) {
          note.content = await decrypt(rawNote.ciphertext, masterKey) || '';
        }
      }
    } catch (e) {
      console.error('[经典版] 获取笔记内容失败:', e);
    }
  }
  return note;
}

const openNote = requireAuth(async function(id) {
  currentNoteId = id;
  currentDraftType = DRAFT_TYPE.EXISTING_NOTE;
  const targetNote = notes.find(n => n.id === id);
  if (!targetNote) { showToast('笔记不存在', 'error'); return; }

  // 懒加载：按需解密该笔记的内容（性能优化）
  await ensureNoteContentLoaded(targetNote);

  // 先切换到编辑器视图（switchView内部会调用renderCategories重建下拉框）
  switchView('editor');
  renderNotes();
  
  await new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTimeout(resolve, 50));
    });
  });

  const draft = await getDraft(DRAFT_TYPE.EXISTING_NOTE, id);
  let useDraft = false;
  
  if (draft && draft.savedAt > targetNote.updated_at) {
    useDraft = await showDraftRecoveryPrompt(draft);
    if (!useDraft) deleteDraft(DRAFT_TYPE.EXISTING_NOTE, id);
  }

  if (useDraft && draft) {
    document.getElementById('noteTitle').value = draft.title;
    document.getElementById('noteContent').innerHTML = draft.content;
    
    // 恢复草稿时，优先使用草稿的分类，回退到笔记原始分类
    const draftCategory = draft.category || targetNote.category || '';
    const noteCategoryEl = document.getElementById('noteCategory');
    if (noteCategoryEl) {
      let optionExists = false;
      for (let i = 0; i < noteCategoryEl.options.length; i++) {
        if (noteCategoryEl.options[i].value === draftCategory) {
          optionExists = true;
          break;
        }
      }
      if (draftCategory && !optionExists) {
        const tempOption = document.createElement('option');
        tempOption.value = draftCategory;
        const catName = categories.find(c => c.id === draftCategory)?.name || '未分类';
        tempOption.textContent = catName;
        noteCategoryEl.appendChild(tempOption);
      }
      noteCategoryEl.value = draftCategory;
    }
    
    document.getElementById('noteTags').value = draft.tags;
    updateDraftIndicator('draft');
    showToast('✅ 已恢复编辑草稿', 'info');
  } else {
    document.getElementById('noteTitle').value = targetNote.title;
    document.getElementById('noteContent').innerHTML = targetNote.content;
    
    const noteCategoryEl = document.getElementById('noteCategory');
    if (noteCategoryEl) {
      let optionExists = false;
      for (let i = 0; i < noteCategoryEl.options.length; i++) {
        if (noteCategoryEl.options[i].value === targetNote.category) {
          optionExists = true;
          break;
        }
      }
      
      if (targetNote.category && !optionExists) {
        const tempOption = document.createElement('option');
        tempOption.value = targetNote.category;
        const catName = categories.find(c => c.id === targetNote.category)?.name || '未分类';
        tempOption.textContent = catName;
        noteCategoryEl.appendChild(tempOption);
      }
      
      noteCategoryEl.value = targetNote.category;
    }
    
    document.getElementById('noteTags').value = extractCleanTags(targetNote.tags).join(', ');
    
    updateDraftIndicator('');
  }
  
  const isTop = targetNote.meta.is_top;
  const wordCount = targetNote.content.length;
  
  document.getElementById('noteMeta').innerHTML = `
    ${isTop ? '<span class="top-tag px-2 py-0.5 rounded text-xs mr-2"><i class="fa-solid fa-thumbtack mr-1"></i> 置顶笔记</span>' : ''}
    创建于: ${formatTime(targetNote.created_at)} · 
    修改${targetNote.revision_count}次 · 
    最近更新: ${timeAgo(targetNote.updated_at)}
  `;
  
  document.getElementById('noteWordCount').textContent = `${wordCount} 字`;

  recordActivity();
});

async function showDraftRecoveryPrompt(draft) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] lock-enter';
    modal.id = 'draftRecoveryModal';
    modal.innerHTML = `
      <div class="bg-dark-800 p-8 rounded-2xl max-w-lg w-full border border-dark-700 mx-4 ${isMobile() ? 'modal-fullscreen-xs' : ''}">
        <div class="text-center mb-6">
          <div class="text-5xl mb-4 text-warning"><i class="fa-solid fa-file-circle-question"></i></div>
          <h2 class="text-2xl font-bold mb-2">发现未保存的编辑草稿</h2>
          <p class="text-secondary">检测到这篇笔记有未保存的编辑草稿（保存于 ${formatTime(draft.savedAt)}），比正式版本更新，是否恢复？</p>
        </div>
        <div class="bg-dark-900 p-4 rounded-lg border border-dark-700 mb-6 max-h-40 overflow-y-auto">
          <div class="text-sm text-secondary mb-2">草稿标题：${draft.title || '无标题'}</div>
          <div class="text-xs text-secondary">${(draft.content || '').substring(0, 200)}${draft.content.length > 200 ? '...' : ''}</div>
        </div>
        <div class="flex gap-3">
          <button onclick="document.getElementById('draftRecoveryModal').dataset.result='discard'; document.getElementById('draftRecoveryModal').remove();" 
                  class="flex-1 px-4 py-2 bg-dark-700 rounded hover:bg-dark-600 transition-all touch-friendly">
            不恢复，删除草稿
          </button>
          <button onclick="document.getElementById('draftRecoveryModal').dataset.result='recover'; document.getElementById('draftRecoveryModal').remove();" 
                  class="flex-1 px-4 py-2 bg-primary rounded hover:bg-primary/90 transition-all text-white touch-friendly">
            恢复草稿
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const checkModal = setInterval(() => {
      if (!document.getElementById('draftRecoveryModal')) {
        clearInterval(checkModal);
        const result = modal.dataset.result;
        resolve(result === 'recover');
      }
    }, 100);
  });
}

// ====================== 保存笔记 ======================
function showSaveOptionsModal() {
  if (!currentNoteId) { showToast('请先创建或打开笔记', 'error'); return; }
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]';
  modal.id = 'saveOptionsModal';
  modal.innerHTML = `
    <div class="bg-dark-800 rounded-lg p-6 w-full max-w-md mx-4 ${isMobile() ? 'modal-fullscreen-xs' : ''}">
      <div class="text-center mb-6">
        <div class="text-4xl mb-4 text-primary"><i class="fa-solid fa-floppy-disk"></i></div>
        <h3 class="text-xl font-bold">选择保存方式</h3>
      </div>
      <div class="space-y-3 mb-6">
        <button onclick="saveAsDraft(); document.getElementById('saveOptionsModal').remove();" 
                class="w-full p-4 bg-dark-900 border border-dark-700 rounded-lg hover:border-info transition-all text-left touch-friendly">
          <div class="flex items-center gap-3">
            <div class="text-2xl text-info"><i class="fa-solid fa-file-pen"></i></div>
            <div>
              <div class="font-bold">仅保存为草稿</div>
              <div class="text-xs text-secondary">保存在本地，不更新服务器，下次打开自动恢复</div>
            </div>
          </div>
        </button>
        <button onclick="saveAsFormalNote(); document.getElementById('saveOptionsModal').remove();" 
                class="w-full p-4 bg-dark-900 border border-dark-700 rounded-lg hover:border-primary transition-all text-left touch-friendly">
          <div class="flex items-center gap-3">
            <div class="text-2xl text-primary"><i class="fa-solid fa-cloud-arrow-up"></i></div>
            <div>
              <div class="font-bold">正式保存笔记</div>
              <div class="text-xs text-secondary">加密上传到服务器，永久保存，同步到所有设备</div>
            </div>
          </div>
        </button>
      </div>
      <button onclick="document.getElementById('saveOptionsModal').remove()" 
              class="w-full px-4 py-2 bg-dark-700 rounded hover:bg-dark-600 transition-all touch-friendly">
        取消
      </button>
    </div>
  `;
  document.body.appendChild(modal);
}

async function saveAsDraft() {
  const draftData = {
    title: document.getElementById('noteTitle').value,
    content: document.getElementById('noteContent').innerHTML,
    category: document.getElementById('noteCategory').value,
    tags: document.getElementById('noteTags').value
  };
  if (currentDraftType === DRAFT_TYPE.NEW_NOTE) {
    await saveDraft(DRAFT_TYPE.NEW_NOTE, null, draftData);
  } else if (currentDraftType === DRAFT_TYPE.EXISTING_NOTE && currentNoteId) {
    await saveDraft(DRAFT_TYPE.EXISTING_NOTE, currentNoteId, draftData);
  }
  showToast('✅ 草稿已保存', 'info');
}

const saveAsFormalNote = requireAuth(async function() {
  if (!currentNoteId) createNewNote();
  const title = document.getElementById('noteTitle').value.trim();
  const content = document.getElementById('noteContent').innerHTML;
  const categoryId = document.getElementById('noteCategory').value;
  const tagsInput = document.getElementById('noteTags').value;
  
  const tagsArray = [...new Set(tagsInput.split(',').map(t => t.trim()).filter(t => t))];

  if (!title) { showToast('请输入标题', 'error'); return; }
  try {
    const title_cipher = await encrypt(title, masterKey);
    const ciphertext = await encrypt(content, masterKey);
    const category_cipher = await encrypt(categoryId, masterKey);
    
    const currentNote = notes.find(n => n.id === currentNoteId);
    const metaObj = currentNote ? {
      ...currentNote.meta,
      is_deleted: false,
      deleted_at: 0
    } : { is_top: false, top_at: 0, is_deleted: false, deleted_at: 0 };
    
    const tagsWithMeta = encodeMetaToTags(tagsArray, metaObj);
    const tags_cipher = await encrypt(JSON.stringify(tagsWithMeta), masterKey);

    const res = await saveNote(API_BASE, userId, { 
      id: currentNoteId, 
      title_cipher, 
      ciphertext, 
      category_cipher, 
      tags_cipher
    });

    if (!res.ok) { const err = await res.json(); showToast('保存失败: ' + (err.err || '未知错误'), 'error'); return; }
    await loadAllData();
    
    if (currentDraftType === DRAFT_TYPE.NEW_NOTE) {
      deleteDraft(DRAFT_TYPE.NEW_NOTE);
    } else if (currentDraftType === DRAFT_TYPE.EXISTING_NOTE) {
      deleteDraft(DRAFT_TYPE.EXISTING_NOTE, currentNoteId);
    }
    
    currentDraftType = DRAFT_TYPE.EXISTING_NOTE;
    document.getElementById('noteWordCount').textContent = `${content.length} 字`;
    showToast('✅ 笔记已正式保存');
  } catch (e) { console.error(e); showToast('保存失败', 'error'); }
});

const saveCurrentNote = requireAuth(function() {
  showSaveOptionsModal();
});

const deleteCurrentNote = requireAuth(async function() {
  if (!currentNoteId) return;
  moveToRecycleBin(currentNoteId);
});

// ====================== 分享功能 ======================
function showShareModal() {
  if (!currentNoteId) { showToast('请先选择笔记', 'error'); return; }
  document.getElementById('shareModal').classList.remove('hidden');
  document.getElementById('shareResult').classList.add('hidden');
  recordActivity();
}

function hideShareModal() {
  document.getElementById('shareModal').classList.add('hidden');
}

const createShare = requireAuth(async function() {
  const maxViews = parseInt(document.getElementById('shareMaxViews').value) || 0;
  const expiresIn = parseInt(document.getElementById('shareExpires').value) || 0;
  try {
    const res = await createShareLink(API_BASE, userId, { note_id: currentNoteId, max_views: maxViews, expires_in_hours: expiresIn });
    if (res.ok) {
      const data = await res.json();
      document.getElementById('shareLink').value = data.share_url;
      document.getElementById('shareResult').classList.remove('hidden');
      showToast('✅ 分享链接生成成功');
    } else {
      showToast('创建分享失败', 'error');
    }
  } catch (e) { console.error(e); showToast('创建分享失败', 'error'); }
});

function copyShareLink() {
  const link = document.getElementById('shareLink');
  link.select();
  navigator.clipboard.writeText(link.value);
  showToast('✅ 链接已复制');
}

// ====================== 知识库核心功能 ======================
function renderKnowledgeView() {
  const knowledgeHomeView = document.getElementById('knowledgeHomeView');
  const knowledgeCategoryView = document.getElementById('knowledgeCategoryView');
  const knowledgeDetailView = document.getElementById('knowledgeDetailView');
  
  if (knowledgeHomeView) knowledgeHomeView.classList.add('hidden');
  if (knowledgeCategoryView) knowledgeCategoryView.classList.add('hidden');
  if (knowledgeDetailView) knowledgeDetailView.classList.add('hidden');

  if (currentKnowledgeView === 'home') {
    if (knowledgeHomeView) knowledgeHomeView.classList.remove('hidden');
    renderKnowledgeHome();
  } else if (currentKnowledgeView === 'category') {
    if (knowledgeCategoryView) knowledgeCategoryView.classList.remove('hidden');
    renderKnowledgeCategory();
  } else if (currentKnowledgeView === 'detail') {
    if (knowledgeDetailView) knowledgeDetailView.classList.remove('hidden');
    renderKnowledgeDetail();
  }
  renderKnowledgeTree();
  renderKnowledgeBreadcrumb();
}

function renderKnowledgeBreadcrumb() {
  const knowledgeBreadcrumb = document.getElementById('knowledgeBreadcrumb');
  if (!knowledgeBreadcrumb) return;
  let html = `<span class="cursor-pointer hover:text-primary" onclick="switchKnowledgeHome()">知识库</span>`;
  if (currentKnowledgeView === 'category' || currentKnowledgeView === 'detail') {
    const catName = currentKnowledgeCategory === 'uncategorized' 
      ? '未分类' 
      : categories.find(c => c.id === currentKnowledgeCategory)?.name || '未分类';
    html += `<i class="fa-solid fa-chevron-right mx-2 text-secondary text-xs"></i>
             <span class="${currentKnowledgeView === 'category' ? '' : 'cursor-pointer hover:text-primary'}" 
                   onclick="${currentKnowledgeView === 'detail' ? `switchKnowledgeCategory('${currentKnowledgeCategory}')` : ''}">${catName}</span>`;
  }
  if (currentKnowledgeView === 'detail') {
    const note = notes.find(n => n.id === currentKnowledgeNote);
    html += `<i class="fa-solid fa-chevron-right mx-2 text-secondary text-xs"></i>
             <span>${note?.title || '无标题'}</span>`;
  }
  knowledgeBreadcrumb.innerHTML = html;
}

function switchKnowledgeHome() {
  currentKnowledgeView = 'home';
  currentKnowledgeCategory = null;
  currentKnowledgeNote = null;
  renderKnowledgeView();
  recordActivity();
}

function switchKnowledgeCategory(catId) {
  currentKnowledgeView = 'category';
  currentKnowledgeCategory = catId;
  currentKnowledgeNote = null;
  renderKnowledgeView();
  recordActivity();
}

function openKnowledgeNote(noteId) {
  currentKnowledgeView = 'detail';
  currentKnowledgeNote = noteId;
  const note = notes.find(n => n.id === noteId);
  currentKnowledgeCategory = note?.category || 'uncategorized';
  renderKnowledgeView();
  recordActivity();
}

function renderKnowledgeHome() {
  const knowledgeHomeContent = document.getElementById('knowledgeHomeContent');
  if (!knowledgeHomeContent) return;
  const activeNotes = notes.filter(note => !note.meta.is_deleted);
  const totalNotes = activeNotes.length;
  const totalCats = categories.length;

  let html = `
    <div class="mb-8">
      <h1 class="text-3xl sm:text-4xl font-bold mb-4">我的知识库</h1>
      <p class="text-secondary text-base sm:text-lg mb-6">这里是你的个人知识空间，所有内容端对端加密，仅你可查看。</p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div class="bg-dark-900 p-4 rounded-xl border border-dark-700">
          <div class="text-secondary text-sm mb-1">总笔记数</div>
          <div class="text-2xl sm:text-3xl font-bold">${totalNotes}</div>
        </div>
        <div class="bg-dark-900 p-4 rounded-xl border border-dark-700">
          <div class="text-secondary text-sm mb-1">总分类数</div>
          <div class="text-2xl sm:text-3xl font-bold">${totalCats}</div>
        </div>
        <div class="bg-dark-900 p-4 rounded-xl border border-dark-700">
          <div class="text-secondary text-sm mb-1">最近更新</div>
          <div class="text-lg sm:text-xl font-bold">${totalNotes > 0 ? timeAgo(Math.max(...activeNotes.map(n => n.updated_at))) : '暂无'}</div>
        </div>
      </div>
    </div>
    <h2 class="text-xl sm:text-2xl font-bold mb-4">文档分类</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
  `;

  const uncategorizedNotes = activeNotes.filter(note => !note.category || note.category === '');
  html += `
    <div class="bg-dark-900 p-6 rounded-xl border border-dark-700 hover:border-primary transition-all cursor-pointer touch-friendly" 
         onclick="switchKnowledgeCategory('uncategorized')">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-folder text-yellow-500 text-xl"></i>
          <h3 class="text-lg sm:text-xl font-bold">未分类</h3>
        </div>
        <span class="text-secondary">${uncategorizedNotes.length} 篇</span>
      </div>
      <div class="text-secondary text-sm">
        ${uncategorizedNotes.slice(0, 3).map(note => `· ${note.title || '无标题'}`).join('<br>')}
        ${uncategorizedNotes.length > 3 ? `<br>· 还有${uncategorizedNotes.length - 3}篇文档` : ''}
      </div>
    </div>
  `;

  categories.forEach(cat => {
    const catNotes = activeNotes.filter(note => note.category === cat.id);
    html += `
      <div class="bg-dark-900 p-6 rounded-xl border border-dark-700 hover:border-primary transition-all cursor-pointer touch-friendly" 
           onclick="switchKnowledgeCategory('${cat.id}')">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-folder text-yellow-500 text-xl"></i>
            <h3 class="text-lg sm:text-xl font-bold category-badge px-2 py-0.5 rounded cat-color-${getCategoryColorIndex(cat.id)}">${cat.name}</h3>
          </div>
          <span class="text-secondary">${catNotes.length} 篇</span>
        </div>
        <div class="text-secondary text-sm">
          ${catNotes.slice(0, 3).map(note => `· ${note.title || '无标题'}`).join('<br>')}
          ${catNotes.length > 3 ? `<br>· 还有${catNotes.length - 3}篇文档` : ''}
        </div>
      </div>
    `;
  });

  html += `</div>`;
  knowledgeHomeContent.innerHTML = html;
}

function renderKnowledgeCategory() {
  const knowledgeCategoryContent = document.getElementById('knowledgeCategoryContent');
  if (!knowledgeCategoryContent) return;
  const activeNotes = notes.filter(note => !note.meta.is_deleted);
  let catNotes = [];
  let catName = '未分类';

  if (currentKnowledgeCategory === 'uncategorized') {
    catNotes = activeNotes.filter(note => !note.category || note.category === '');
  } else {
    const cat = categories.find(c => c.id === currentKnowledgeCategory);
    catName = cat?.name || '未分类';
    catNotes = activeNotes.filter(note => note.category === currentKnowledgeCategory);
  }

  let html = `
    <div class="mb-6">
      <h1 class="text-2xl sm:text-3xl font-bold mb-2">${catName}</h1>
      <p class="text-secondary">共 ${catNotes.length} 篇文档</p>
    </div>
    <div class="grid grid-cols-1 gap-3">
  `;

  if (catNotes.length === 0) {
    html += `<div class="text-center text-secondary py-8">该分类下暂无文档</div>`;
  } else {
    sortNotes(catNotes).forEach(note => {
      html += `
        <div class="p-4 border border-dark-700 rounded-lg hover:border-primary transition-all cursor-pointer touch-friendly" 
             onclick="openKnowledgeNote('${note.id}')">
          <h3 class="text-lg sm:text-xl font-medium mb-2">${note.title || '无标题'}</h3>
          <div class="flex justify-between items-center text-sm text-secondary">
            <span>修改${note.revision_count}次</span>
            <span>${timeAgo(note.updated_at)}</span>
          </div>
        </div>
      `;
    });
  }
  html += `</div>`;
  knowledgeCategoryContent.innerHTML = html;
}

function renderKnowledgeDetail() {
  const note = notes.find(n => n.id === currentKnowledgeNote);
  const knowledgeDetailTitle = document.getElementById('knowledgeDetailTitle');
  const knowledgeDetailMeta = document.getElementById('knowledgeDetailMeta');
  const knowledgeDetailContent = document.getElementById('knowledgeDetailContent');
  
  if (!note || !knowledgeDetailTitle) return;
  knowledgeDetailTitle.textContent = note.title || '无标题';
  if (knowledgeDetailMeta) {
    knowledgeDetailMeta.innerHTML = `
      <span>修改${note.revision_count}次</span>
      <span class="mx-2">·</span>
      <span>最近更新：${formatTime(note.updated_at)}</span>
    `;
  }
  if (knowledgeDetailContent) {
    knowledgeDetailContent.innerHTML = note.content || '';
  }
}

function editCurrentKnowledgeNote() {
  if (!currentKnowledgeNote) return;
  openNote(currentKnowledgeNote);
}

function renderKnowledgeTree() {
  const knowledgeTree = document.getElementById('knowledgeTree');
  if (!knowledgeTree) return;
  const activeNotes = notes.filter(note => !note.meta.is_deleted);

  let html = '';
  const uncategorizedNotes = activeNotes.filter(note => !note.category || note.category === '');
  const filteredUncategorized = uncategorizedNotes.filter(note => 
    note.title.toLowerCase().includes(searchKeyword) || note.content.toLowerCase().includes(searchKeyword)
  );

  html += `
    <div class="mb-2">
      <div class="flex items-center p-2 rounded hover:bg-dark-800 cursor-pointer touch-friendly" onclick="toggleFold('uncategorized')">
        <i class="fa-solid fa-caret-down tree-fold ${foldState['uncategorized'] ? 'folded' : ''} mr-2 text-secondary"></i>
        <i class="fa-solid fa-folder mr-2 text-yellow-500"></i>
        <span onclick="switchKnowledgeCategory('uncategorized')" class="hover:text-primary">未分类</span>
        <span class="ml-2 text-xs text-secondary">(${filteredUncategorized.length})</span>
      </div>
      <div class="ml-6 ${foldState['uncategorized'] ? 'hidden' : ''}">
        ${sortNotes(filteredUncategorized).map(note => `
          <div class="p-2 rounded hover:bg-dark-800 cursor-pointer ${currentKnowledgeNote === note.id ? 'bg-primary/20' : ''} touch-friendly" onclick="openKnowledgeNote('${note.id}')">
            <i class="fa-solid fa-file-lines mr-2 text-secondary"></i>
            <span class="truncate">${note.title || '无标题'}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  categories.forEach(cat => {
    const catNotes = activeNotes.filter(note => note.category === cat.id);
    const filteredNotes = catNotes.filter(note => 
      note.title.toLowerCase().includes(searchKeyword) || note.content.toLowerCase().includes(searchKeyword)
    );
    const colorIndex = getCategoryColorIndex(cat.id);

    html += `
      <div class="mb-2">
        <div class="flex items-center p-2 rounded hover:bg-dark-800 cursor-pointer touch-friendly" onclick="toggleFold('${cat.id}')">
          <i class="fa-solid fa-caret-down tree-fold ${foldState[cat.id] ? 'folded' : ''} mr-2 text-secondary"></i>
          <i class="fa-solid fa-folder mr-2 text-yellow-500"></i>
          <span onclick="switchKnowledgeCategory('${cat.id}')" class="hover:text-primary category-badge px-2 py-0.5 rounded text-xs cat-color-${colorIndex}">${cat.name}</span>
          <span class="ml-2 text-xs text-secondary">(${filteredNotes.length})</span>
        </div>
        <div class="ml-6 ${foldState[cat.id] ? 'hidden' : ''}">
          ${sortNotes(filteredNotes).map(note => `
            <div class="p-2 rounded hover:bg-dark-800 cursor-pointer ${currentKnowledgeNote === note.id ? 'bg-primary/20' : ''} touch-friendly" onclick="openKnowledgeNote('${note.id}')">
              <i class="fa-solid fa-file-lines mr-2 text-secondary"></i>
              <span class="truncate">${note.title || '无标题'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  });
  knowledgeTree.innerHTML = html;
}

function toggleFold(catId) {
  foldState[catId] = !foldState[catId];
  renderKnowledgeTree();
}

// ====================== 窗口大小变化处理 ======================
function handleResize() {
  if (currentView === 'dashboard') renderDashboard();
  if (currentView === 'knowledge') renderKnowledgeView();
  
  if (isMobile() && isSidebarOpen) {
    closeSidebar();
  }
  
  const noteListColumn = document.getElementById('noteListColumn');
  if (noteListColumn) {
    if (currentView !== 'knowledge') {
      if (isDesktop()) {
        noteListColumn.classList.remove('hidden');
      } else {
        noteListColumn.classList.add('hidden');
      }
    }
  }
}

// ====================== 分享页面渲染 ======================
async function renderSharePage(shareKey) {
  const loginPage = document.getElementById('loginPage');
  const appPage = document.getElementById('appPage');
  const sharePage = document.getElementById('sharePage');
  
  loginPage.classList.add('hidden', 'page-hidden');
  appPage.classList.add('hidden');
  sharePage.classList.remove('hidden');
  
  try {
    const res = await fetchShareByKey(API_BASE, shareKey);
    if (!res.ok) {
      document.getElementById('shareTitle').textContent = '分享链接无效或已过期';
      document.getElementById('shareContent').innerHTML = '<p class="text-secondary">该分享链接可能已被删除、过期或达到最大查看次数。</p>';
      return;
    }
    
    const data = await res.json();
    document.getElementById('shareTitle').textContent = data.title || '无标题';
    document.getElementById('shareContent').innerHTML = data.content || '';
  } catch (e) {
    console.error(e);
    document.getElementById('shareTitle').textContent = '加载失败';
    document.getElementById('shareContent').innerHTML = '<p class="text-secondary">网络错误，请稍后重试。</p>';
  }
}

// ====================== 导入/导出功能 ======================

/**
 * 显示导出弹窗 - 选择明文或密文导出
 */
function showExportModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]';
  modal.id = 'exportModal';
  modal.innerHTML = `
    <div class="bg-dark-800 rounded-lg p-6 w-full max-w-md mx-4 ${isMobile() ? 'modal-fullscreen-xs' : ''}">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-lg font-bold"><i class="fa-solid fa-file-export mr-2"></i> 导出笔记</h3>
        <button onclick="document.getElementById('exportModal').remove()" class="text-secondary hover:text-white touch-friendly">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
      <p class="text-secondary text-sm mb-4">选择导出格式：</p>
      <div class="space-y-3 mb-6">
        <button onclick="exportNotes('encrypted'); document.getElementById('exportModal').remove();" 
                class="w-full p-4 bg-dark-900 border border-dark-700 rounded-lg hover:border-primary transition-all text-left touch-friendly">
          <div class="flex items-center gap-3">
            <div class="text-2xl text-primary"><i class="fa-solid fa-lock"></i></div>
            <div>
              <div class="font-bold">密文导出（推荐）</div>
              <div class="text-xs text-secondary">导出加密后的数据，安全可靠，可在其他设备导入</div>
            </div>
          </div>
        </button>
        <button onclick="exportNotes('plaintext'); document.getElementById('exportModal').remove();" 
                class="w-full p-4 bg-dark-900 border border-dark-700 rounded-lg hover:border-warning transition-all text-left touch-friendly">
          <div class="flex items-center gap-3">
            <div class="text-2xl text-warning"><i class="fa-solid fa-file-lines"></i></div>
            <div>
              <div class="font-bold">明文导出（测试用）</div>
              <div class="text-xs text-secondary">导出解密后的可读内容，仅用于本地验证数据完整性</div>
            </div>
          </div>
        </button>
      </div>
      <button onclick="document.getElementById('exportModal').remove()" 
              class="w-full px-4 py-2 bg-dark-700 rounded hover:bg-dark-600 transition-all touch-friendly">取消</button>
    </div>
  `;
  document.body.appendChild(modal);
}

/**
 * 执行导出
 * @param {'encrypted'|'plaintext'} mode - 导出模式
 */
const exportNotes = requireAuth(async function(mode) {
  try {
    const exportData = {
      version: 1,
      exported_at: new Date().toISOString(),
      mode: mode,
      categories: [],
      notes: []
    };

    // 导出分类
    for (const cat of categories) {
      const catItem = {
        id: cat.id,
        name: cat.name
      };
      exportData.categories.push(catItem);
    }

    // 导出笔记
    for (const note of notes) {
      if (mode === 'encrypted') {
        // 密文导出：从服务器重新获取加密数据
        const notesRes = await fetchNotes(API_BASE, userId);
        const encryptedNotes = await notesRes.json();
        const encryptedNote = encryptedNotes.find(n => n.id === note.id);
        if (encryptedNote) {
          exportData.notes.push({
            id: note.id,
            title_cipher: encryptedNote.title_cipher || "",
            ciphertext: encryptedNote.ciphertext || "",
            category_cipher: encryptedNote.category_cipher || "",
            tags_cipher: encryptedNote.tags_cipher || "",
            created_at: note.created_at,
            updated_at: note.updated_at
          });
        }
      } else {
        // 明文导出（仅用于测试验证）
        exportData.notes.push({
          id: note.id,
          title: note.title,
          content: note.content,
          category: note.category,
          category_name: categories.find(c => c.id === note.category)?.name || '未分类',
          tags: extractCleanTags(note.tags),
          is_top: note.meta.is_top,
          created_at: new Date(note.created_at).toISOString(),
          updated_at: new Date(note.updated_at).toISOString()
        });
      }
    }

    // 生成并下载 JSON 文件
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `notes-${mode}-export-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`✅ 成功导出 ${exportData.notes.length} 篇笔记（${mode === 'encrypted' ? '密文' : '明文'}）`);
  } catch (e) {
    console.error(e);
    showToast('导出失败', 'error');
  }
});

/**
 * 显示导入弹窗 - 选择明文或密文导入
 */
function showImportModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]';
  modal.id = 'importModal';
  modal.innerHTML = `
    <div class="bg-dark-800 rounded-lg p-6 w-full max-w-md mx-4 ${isMobile() ? 'modal-fullscreen-xs' : ''}">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-lg font-bold"><i class="fa-solid fa-file-import mr-2"></i> 导入笔记</h3>
        <button onclick="document.getElementById('importModal').remove()" class="text-secondary hover:text-white touch-friendly">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
      <p class="text-secondary text-sm mb-4">选择导入格式：</p>
      <div class="space-y-3 mb-6">
        <button onclick="showImportFilePicker('encrypted'); document.getElementById('importModal').remove();" 
                class="w-full p-4 bg-dark-900 border border-dark-700 rounded-lg hover:border-primary transition-all text-left touch-friendly">
          <div class="flex items-center gap-3">
            <div class="text-2xl text-primary"><i class="fa-solid fa-lock"></i></div>
            <div>
              <div class="font-bold">密文导入（推荐）</div>
              <div class="text-xs text-secondary">导入之前导出的加密数据，需使用相同主密钥</div>
            </div>
          </div>
        </button>
        <button onclick="showImportFilePicker('plaintext'); document.getElementById('importModal').remove();" 
                class="w-full p-4 bg-dark-900 border border-dark-700 rounded-lg hover:border-warning transition-all text-left touch-friendly">
          <div class="flex items-center gap-3">
            <div class="text-2xl text-warning"><i class="fa-solid fa-file-lines"></i></div>
            <div>
              <div class="font-bold">明文导入（测试用）</div>
              <div class="text-xs text-secondary">导入之前明文导出的数据，用于恢复测试</div>
            </div>
          </div>
        </button>
      </div>
      <button onclick="document.getElementById('importModal').remove()" 
              class="w-full px-4 py-2 bg-dark-700 rounded hover:bg-dark-600 transition-all touch-friendly">取消</button>
    </div>
  `;
  document.body.appendChild(modal);
}

/**
 * 显示文件选择器并导入
 * @param {'encrypted'|'plaintext'} mode - 导入模式
 */
const importNotes = requireAuth(async function(mode, file) {
  try {
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const importData = JSON.parse(e.target.result);

        // 验证数据格式
        if (!importData.notes || !Array.isArray(importData.notes)) {
          showToast('无效的导入文件格式', 'error');
          return;
        }

        if (importData.mode !== mode) {
          showToast(`文件模式不匹配：期望 ${mode}，实际 ${importData.mode}`, 'error');
          return;
        }

        let importCount = 0;
        let skipCount = 0;

        if (mode === 'encrypted') {
          // 密文导入：直接将加密数据保存到服务器
          for (const note of importData.notes) {
            if (!note.title_cipher && !note.ciphertext) {
              skipCount++;
              continue;
            }
            try {
              const res = await saveNote(API_BASE, userId, {
                id: note.id || crypto.randomUUID(),
                title_cipher: note.title_cipher || "",
                ciphertext: note.ciphertext || "",
                category_cipher: note.category_cipher || "",
                tags_cipher: note.tags_cipher || ""
              });
              if (res.ok) importCount++;
              else skipCount++;
            } catch (e) {
              skipCount++;
            }
          }
        } else {
          // 明文导入：先加密再上传（仅用于测试验证）
          for (const note of importData.notes) {
            if (!note.title && !note.content) {
              skipCount++;
              continue;
            }
            try {
              const title_cipher = await encrypt(note.title || "", masterKey);
              const ciphertext = await encrypt(note.content || "", masterKey);
              const category_cipher = await encrypt(note.category || "", masterKey);

              // 构建 tags（包含置顶元数据）
              let tagsArray = note.tags || [];
              if (note.is_top) {
                const metaObj = { is_top: true, top_at: Date.now(), is_deleted: false, deleted_at: 0 };
                tagsArray = encodeMetaToTags(tagsArray, metaObj);
              }
              const tags_cipher = await encrypt(JSON.stringify(tagsArray), masterKey);

              const res = await saveNote(API_BASE, userId, {
                id: note.id || crypto.randomUUID(),
                title_cipher,
                ciphertext,
                category_cipher,
                tags_cipher
              });
              if (res.ok) importCount++;
              else skipCount++;
            } catch (e) {
              skipCount++;
            }
          }
        }

        await loadAllData();
        showToast(`✅ 导入完成：成功 ${importCount} 篇，跳过 ${skipCount} 篇`);
      } catch (parseError) {
        showToast('文件解析失败，请确认文件格式正确', 'error');
      }
    };
    reader.readAsText(file);
  } catch (e) {
    console.error(e);
    showToast('导入失败', 'error');
  }
});

function showImportFilePicker(mode) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    importNotes(mode, file);
  };
  input.click();
}

// ====================== 页面初始化 ======================
document.addEventListener('DOMContentLoaded', function() {
  // 检测是否从现代版切换过来（共享 sessionStorage 登录状态）
  const savedUserId = sessionStorage.getItem('userId');
  const savedMasterKey = sessionStorage.getItem('masterKey');
  
  if (savedUserId && savedMasterKey) {
    userId = savedUserId;
    masterKey = savedMasterKey;
    
    // 检查是否处于锁定状态
    const isLocked = sessionStorage.getItem('isLocked') === 'true';
    
    // 自动加载数据
    (async () => {
      try {
        loadLockSettings();
        setupIdleLockListeners();
        await loadAllData();
        onLoginSuccess();
        // 加载分类列表到侧边栏
        renderCategories();
        // 恢复上次排序设置
        loadSortSettings();
        
        // 如果处于锁定状态，加载完成后立即显示锁屏
        if (isLocked) {
          lockSystem();
        }
      } catch (e) {
        console.error('自动加载数据失败:', e);
      }
    })();
  }

  const loginKey = document.getElementById('loginKey');
  if (loginKey) {
    loginKey.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') loginOrRegister();
    });
  }

  const knowledgeSearch = document.getElementById('knowledgeSearch');
  if (knowledgeSearch) {
    knowledgeSearch.addEventListener('input', debounce(function(e) {
      searchKeyword = e.target.value.toLowerCase();
      renderKnowledgeTree();
    }));
  }

  const categoryNameInput = document.getElementById('categoryNameInput');
  if (categoryNameInput) {
    categoryNameInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') createCategoryConfirm();
    });
  }

  // ESC 键关闭所有弹窗
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      // 1) 处理 HTML 中已有的静态弹窗（用 hidden 类控制的，不能 remove）
      const staticModalIds = ['createCategoryModal', 'shareModal'];
      staticModalIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) {
          el.classList.add('hidden');
        }
      });
      // 2) 处理动态创建的弹窗（用 remove 移除）
      const dynamicModalIds = [
        'lockSettingsModal',
        'recoveryCodeModal',
        'recoveryModal',
        'draftRecoveryModal',
        'saveOptionsModal',
        'allCategoriesModal',
        'allTagsModal',
        'lockScreen'
      ];
      dynamicModalIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
    }
  });

  const path = window.location.pathname;
  if (path.startsWith('/share/')) {
    const shareKey = path.split('/').pop();
    renderSharePage(shareKey);
  }
  
  window.addEventListener('resize', debounce(handleResize, 150));
  
  handleResize();
});

// ====================== 暴露函数到全局作用域（ES Module 下 HTML onclick 属性需要） ======================
// 登录相关
window.loginOrRegister = loginOrRegister;
window.showRecoveryModal = showRecoveryModal;
window.showRecoveryCodeModal = showRecoveryCodeModal;
window.resetPasswordByRecovery = resetPasswordByRecovery;
window.onLoginSuccess = onLoginSuccess;
window.logout = logout;

// 侧边栏
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;

// 视图切换
window.switchView = switchView;
window.switchKnowledgeHome = switchKnowledgeHome;
window.switchKnowledgeCategory = switchKnowledgeCategory;
window.openKnowledgeNote = openKnowledgeNote;
window.editCurrentKnowledgeNote = editCurrentKnowledgeNote;
window.toggleFold = toggleFold;

// 笔记操作
window.createNewNote = createNewNote;
window.openNote = openNote;
window.saveCurrentNote = saveCurrentNote;
window.deleteCurrentNote = deleteCurrentNote;
window.saveAsDraft = saveAsDraft;
window.saveAsFormalNote = saveAsFormalNote;
window.toggleNoteTop = toggleNoteTop;
window.changeSortType = changeSortType;
window.filterByCategory = filterByCategory;
window.filterNotesByTag = filterNotesByTag;

// 分类操作
window.showCreateCategoryModal = showCreateCategoryModal;
window.createCategoryConfirm = createCategoryConfirm;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
window.showAllCategoriesModal = showAllCategoriesModal;
window.showAllTagsModal = showAllTagsModal;

// 回收站
window.moveToRecycleBin = moveToRecycleBin;
window.restoreNoteFromRecycleBin = restoreNoteFromRecycleBin;
window.permanentlyDeleteNote = permanentlyDeleteNote;
window.emptyRecycleBin = emptyRecycleBin;

// 草稿
window.deleteDraft = deleteDraft;
window.openDraft = openDraft;

// 分享
window.showShareModal = showShareModal;
window.hideShareModal = hideShareModal;
window.createShare = createShare;
window.copyShareLink = copyShareLink;

// 闲置锁定
window.recordActivity = recordActivity;
window.showLockSettingsModal = showLockSettingsModal;
window.saveLockSettingsFromModal = saveLockSettingsFromModal;
window.unlockSystem = unlockSystem;
window.logoutFromLock = logoutFromLock;

// 导入导出
window.showExportModal = showExportModal;
window.exportNotes = exportNotes;
window.showImportModal = showImportModal;
window.importNotes = importNotes;

// 数据加载
// ====================== 版本切换 ======================
function switchToModern(page = 'login') {
  // 从经典版切换到新UI时保留登录状态
  sessionStorage.setItem('userId', userId);
  sessionStorage.setItem('masterKey', masterKey);
  window.location.href = `/modern/${page === 'login' ? 'login.html' : 'index.html'}`;
}
window.switchToModern = switchToModern;

window.loadAllData = loadAllData;