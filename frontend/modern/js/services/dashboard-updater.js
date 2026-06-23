// services/dashboard-updater.js — 仪表盘更新 + 对话框填充
'use strict';

import AppState from "../core/state.js";
import { Utils } from "../core/utils.js";
import { decrypt } from "../../../shared/crypto/index.js";
import { API_BASE, fetchTrashNotes, restoreNote, permanentDeleteNote, clearTrash, deleteNote as apiDeleteNote } from "../../../shared/api/index.js";
import { clearAllCache, getCachedDashboard, setCachedDashboard } from "../../../shared/utils/note-cache.js";

// 从 standalone-functions 和 category-manager 导入被引用的函数
import { _previewNote, _editNote, _showCategoryNotes, _updateEditorDialogTitle } from "./standalone-functions.js";
import { _openEditCategoryDialog, _deleteCategory as _catDeleteCategory } from "../components/category-manager.js";
import { _openEditTagDialog, _deleteTag as _tagDeleteTag } from "../components/tag-manager.js";

let _toastManager = null;
let _showVersionHistory = null;
let _showRestoreDialog = null;
let _logManager = null;
let _eventLogger = null;
let _dataLoader = null;
let _chartManager = null;
let _countAnimation = null;
let _draftManager = null;

export function injectDeps(deps) {
  _toastManager = deps.toastManager;
  _logManager = deps.logManager;
  _eventLogger = deps.eventLogger;
  _dataLoader = deps.dataLoader;
  _chartManager = deps.chartManager;
  _countAnimation = deps.countAnimation;
  _draftManager = deps.draftManager;
}

// 动态导入版本历史和恢复对话框（避免循环依赖）
async function _getVersionHistory() {
  if (!_showVersionHistory) {
const mod = await import("../version-history.js");
    _showVersionHistory = mod.showVersionHistory;
  }
  return _showVersionHistory;
}
async function _getRestoreDialog() {
  if (!_showRestoreDialog) {
    const mod = await import("./restore-dialog.js");
    _showRestoreDialog = mod.showRestoreDialog;
  }
  return _showRestoreDialog;
}

export const DashboardUpdater = {
  async updateStats() {
    const state = AppState;
    const totalNotes = state.allNotes.length;
    const totalCategories = state.allCategories.length;
    const tagsSet = new Set();
    state.allNotes.forEach(n => {
      if (n.tags && n.tags.length > 0) {
        n.tags.forEach(t => {
          const tag = t.trim();
          if (tag && !tag.startsWith('__meta:')) tagsSet.add(tag);
        });
      }
    });
    const totalTags = tagsSet.size;
    this._updateCard('总笔记数', totalNotes);
    this._updateCard('总分类数', totalCategories);
    this._updateCard('总标签数', totalTags);
    const countElements = Utils.queryAll('.animate-count');
    if (countElements.length >= 3) {
      countElements[0].setAttribute('data-target', totalNotes);
      countElements[1].setAttribute('data-target', totalCategories);
      countElements[2].setAttribute('data-target', totalTags);
    }
    if (_countAnimation) _countAnimation.init();
    if (_logManager) _logManager.info(`统计: ${totalNotes} 笔记, ${totalCategories} 分类, ${totalTags} 标签`);
    // 缓存仪表盘聚合结果（仅在有数据时）
    if (totalNotes > 0) {
      try {
        await setCachedDashboard({ totalNotes, totalCategories, totalTags });
      } catch (_) {}
    }
  },

  _updateCard(label, value) {
    Utils.queryAll('.compact-card').forEach(card => {
      const p = card.querySelector('p');
      if (p && p.textContent.trim() === label) {
        const h3 = card.querySelector('h3');
        if (h3) h3.textContent = value;
        if (label === '回收站') {
          const statusDiv = card.querySelector('.flex.items-center.text-xs');
          if (statusDiv) {
            const span = statusDiv.querySelector('span:last-child');
            if (span) {
              const count = parseInt(value) || 0;
              if (count > 0) {
                span.textContent = count + '条笔记';
                span.className = 'trash-status-active font-medium';
                statusDiv.querySelector('i')?.classList.replace('text-emerald-400', 'text-red-400');
              } else {
                span.textContent = '已清空';
                span.className = 'trash-status-empty font-medium';
                statusDiv.querySelector('i')?.classList.replace('text-red-400', 'text-emerald-400');
              }
            }
          }
        }
      }
    });
  },

  updateRecentUpdates() {
    const state = AppState;
    const container = Utils.getElement('recent-updates-container');
    if (!container) return;
    const sorted = [...state.allNotes].sort((a, b) => b.updated_at - a.updated_at).slice(0, 5);
    if (sorted.length === 0) {
      container.innerHTML = '<div class="text-center text-gray-500 py-8 text-sm">暂无笔记数据</div>';
      return;
    }
    const catColorMap = {};
    state.allCategories.forEach(cat => { catColorMap[cat.name] = cat.color; });
    container.innerHTML = sorted.map(note => {
      const cc = catColorMap[note.category] || '#64748b';
      return `<div class="flex items-start space-x-3 p-3 bg-dark rounded-lg border border-dark-lighter hover:border-indigo-500/50 transition-colors cursor-pointer group"><div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style="background:${cc}20;color:${cc}"><i class="fa-solid fa-file-pen text-sm"></i></div><div class="flex-1 min-w-0"><h4 class="text-sm font-medium text-white truncate group-hover:text-rose-400 transition-colors">${this._escapeHtml(note.title)}</h4><div class="flex items-center mt-1"><span class="text-xs text-gray-400 bg-dark-lighter px-2 py-0.5 rounded mr-2">${this._escapeHtml(note.category)}</span><span class="text-xs text-gray-500">修改${note.revision_count}次</span></div><div class="flex items-center justify-between mt-1"><span class="text-xs text-gray-500">${Utils.timeAgo(note.updated_at)}</span></div></div></div>`;
    }).join('');
  },

  updateRecentActivity() {
    const state = AppState;
    const container = Utils.getElement('activity-list');
    if (!container) return;
    const activities = [];
    state.allNotes.forEach(note => {
      activities.push({ type: 'create', title: note.title, time: note.created_at, icon: 'fa-plus', iconBg: 'bg-green-500/20', iconColor: 'text-green-400' });
      if (note.revision_count > 1 && note.updated_at > note.created_at + 60000) {
        activities.push({ type: 'edit', title: note.title, time: note.updated_at, icon: 'fa-pencil', iconBg: 'bg-blue-500/20', iconColor: 'text-blue-400' });
      }
    });
    activities.sort((a, b) => b.time - a.time);
    const recent = activities.slice(0, 10);
    if (recent.length === 0) {
      container.innerHTML = '<div class="text-center py-4 text-gray-500 text-xs">暂无活动记录</div>';
      return;
    }
    container.innerHTML = recent.map(act => {
      const verb = act.type === 'create' ? '创建了笔记' : act.type === 'edit' ? '编辑了笔记' : '删除了笔记';
      return `<div class="flex items-start space-x-3">
        <div class="w-5 h-5 rounded-full ${act.iconBg} flex items-center justify-center ${act.iconColor} flex-shrink-0 mt-0.5"><i class="fa-solid ${act.icon} text-[10px]"></i></div>
        <div class="flex-1 min-w-0"><p class="text-sm text-gray-300 truncate">${verb} <span class="text-white font-medium">${DashboardUpdater._escapeHtml(act.title)}</span></p><p class="text-xs text-gray-500 mt-0.5">${Utils.timeAgo(act.time)}</p></div>
      </div>`;
    }).join('');
  },

  refreshAll() {
    this.updateStats();
    this.updateRecentUpdates();
    this._updateCard('待保存草稿', _draftManager ? _draftManager.getAll().filter(d => d.status !== 'saved').length : 0);
    if (_chartManager) {
      _chartManager.updateCategoryPieChart();
      _chartManager.updateTrendChart();
      _chartManager.initDashboardCharts();
    }
  },

  async refreshTrashCount() {
    const state = AppState;
    try {
      const res = await fetchTrashNotes(API_BASE, state.userId);
      if (res.ok) {
        const rawData = await res.json();
        this._updateCard('回收站', rawData.length || 0);
      }
    } catch (e) {}
  },

  populateDialog(dialogId) {
    switch (dialogId) {
      case 'total-notes-dialog': this._populateNotesDialog(); break;
      case 'total-categories-dialog': this._populateCategoriesDialog(); break;
      case 'total-tags-dialog': this._populateTagsDialog(); break;
      case 'drafts-dialog': if (_draftManager) _draftManager.refreshDisplay(); break;
      case 'trash-dialog': this._populateTrashDialog(); break;
      case 'recent-updates-dialog': this._populateRecentUpdatesDialog(); break;
    }
  },

  _populateRecentUpdatesDialog() {
    const state = AppState;
    const container = Utils.getElement('recent-updates-content');
    if (!container) return;
    const sorted = [...state.allNotes].sort((a, b) => b.updated_at - a.updated_at);
    if (sorted.length === 0) {
      container.innerHTML = '<div class="text-center text-gray-500 py-8 text-sm">暂无笔记数据</div>';
      return;
    }
    const catColorMap = {};
    state.allCategories.forEach(cat => { catColorMap[cat.name] = cat.color; });
    let html = '<div class="grid grid-cols-2 gap-3">';
    sorted.forEach(note => {
      const cc = catColorMap[note.category] || '#64748b';
      html += `<div class="flex items-start space-x-3 p-3 bg-dark rounded-lg border border-dark-lighter hover:border-indigo-500/50 transition-colors cursor-pointer group" data-note-id="${note.id}">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style="background:${cc}20;color:${cc}"><i class="fa-solid fa-file-pen text-sm"></i></div>
        <div class="flex-1 min-w-0">
          <h4 class="text-sm font-medium text-white truncate group-hover:text-rose-400 transition-colors">${this._escapeHtml(note.title)}</h4>
          <div class="flex items-center mt-1"><span class="text-xs text-gray-400 bg-dark-lighter px-2 py-0.5 rounded mr-2">${this._escapeHtml(note.category)}</span><span class="text-xs text-gray-500">修改${note.revision_count}次</span></div>
          <div class="flex items-center justify-between mt-1"><span class="text-xs text-gray-500">${Utils.timeAgo(note.updated_at)}</span></div>
        </div>
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
    // 绑定行点击预览事件
    container.querySelectorAll('[data-note-id]').forEach(row => {
      row.addEventListener('click', function() {
        const noteId = this.getAttribute('data-note-id');
        _previewNote(noteId);
      });
    });
  },

  async _populateTrashDialog() {
    const state = AppState;
    const container = Utils.getElement('trash-content');
    if (!container) return;
    try {
      const res = await fetchTrashNotes(API_BASE, state.userId);
      if (!res.ok) throw new Error('获取回收站失败');
      const rawData = await res.json();
      const decrypted = [];
      for (const note of rawData) {
        try {
          const title = await decrypt(note.title_cipher, state.masterKey);
          decrypted.push({ id: note.id, title: title || '未命名笔记', deleted_at: note.deleted_at });
        } catch (e) {
          decrypted.push({ id: note.id, title: '(加密内容)', deleted_at: note.deleted_at });
        }
      }
      if (decrypted.length === 0) {
        container.innerHTML = '<div class="text-center py-12"><div class="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4"><i class="fa-solid fa-trash-can-arrow-up text-green-400 text-3xl"></i></div><h3 class="text-white font-medium mb-2">回收站为空</h3><p class="text-gray-400 text-sm">您的回收站中没有任何笔记</p></div>';
        this._setTrashButtonsDisabled(true);
        this._updateCard('回收站', 0);
        return;
      }
      this._updateCard('回收站', decrypted.length);
      const noteCount = decrypted.length;
      container.innerHTML = decrypted.map(note => {
        const timeAgoStr = note.deleted_at ? Utils.timeAgo(note.deleted_at) : '未知';
        return `<div class="flex items-start space-x-3 p-3 bg-dark rounded-lg border border-dark-lighter hover:border-red-500/50 transition-colors group" data-note-id="${note.id}">
          <div class="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 flex-shrink-0 mt-0.5"><i class="fa-solid fa-trash text-sm"></i></div>
          <div class="flex-1 min-w-0">
            <h4 class="text-sm font-medium text-white truncate">${this._escapeHtml(note.title)}</h4>
            <div class="flex items-center mt-1"><span class="text-xs text-gray-500">删除于 ${timeAgoStr}</span></div>
          </div>
          <div class="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0">
            <button class="trash-restore-btn p-1.5 text-emerald-400 hover:text-white hover:bg-emerald-500/20 rounded transition-colors" data-note-id="${note.id}" title="恢复"><i class="fa-solid fa-rotate-left text-xs"></i></button>
            <button class="trash-permanent-delete-btn p-1.5 text-red-400 hover:text-white hover:bg-red-500/20 rounded transition-colors" data-note-id="${note.id}" title="永久删除"><i class="fa-solid fa-trash-can text-xs"></i></button>
          </div>
        </div>`;
      }).join('');
      this._setTrashButtonsDisabled(false);
      // 绑定回收站操作事件
      container.querySelectorAll('.trash-restore-btn').forEach(btn => {
        btn.addEventListener('click', async function(e) {
          e.stopPropagation();
          const noteId = this.getAttribute('data-note-id');
          try {
            const r = await restoreNote(API_BASE, AppState.userId, noteId);
            if (r.ok) {
              _toastManager.show('笔记已恢复', 'success');
              await _dataLoader.loadAll();
              DashboardUpdater._populateTrashDialog();
            } else {
              _toastManager.show('恢复失败', 'error');
            }
          } catch (e) {
            _toastManager.show('恢复失败: ' + e.message, 'error');
          }
        });
      });
      container.querySelectorAll('.trash-permanent-delete-btn').forEach(btn => {
        btn.addEventListener('click', async function(e) {
          e.stopPropagation();
          const noteId = this.getAttribute('data-note-id');
          const noteTitle = this.closest('[data-note-id]')?.querySelector('h4')?.textContent || '此笔记';
          if (!confirm(`确定要永久删除「${noteTitle}」吗？此操作不可撤销！`)) return;
          try {
            const r = await permanentDeleteNote(API_BASE, AppState.userId, noteId);
            if (r.ok) {
              _toastManager.show('笔记已永久删除', 'info');
              await _dataLoader.loadAll();
              DashboardUpdater._populateTrashDialog();
            } else {
              _toastManager.show('删除失败', 'error');
            }
          } catch (e) {
            _toastManager.show('删除失败: ' + e.message, 'error');
          }
        });
      });
      // 批量操作按钮
      const dialog = container.closest('.dialog-content');
      if (dialog) {
        const restoreAllBtn = dialog.querySelector('.trash-restore-all-btn');
        if (restoreAllBtn) {
          restoreAllBtn.disabled = false;
          restoreAllBtn.addEventListener('click', async function(e) {
            if (!confirm(`确定要恢复全部 ${noteCount} 篇笔记吗？`)) return;
            for (const note of decrypted) {
              try { await restoreNote(API_BASE, AppState.userId, note.id); } catch(e) {}
            }
            _toastManager.show(`已恢复 ${noteCount} 篇笔记`, 'success');
            await _dataLoader.loadAll();
            DashboardUpdater._populateTrashDialog();
          });
        }
        const deleteAllBtn = dialog.querySelector('.trash-delete-all-btn');
        if (deleteAllBtn) {
          deleteAllBtn.disabled = false;
          deleteAllBtn.addEventListener('click', async function(e) {
            if (!confirm(`确定要永久删除全部 ${noteCount} 篇笔记吗？此操作不可撤销！`)) return;
            for (const note of decrypted) {
              try { await permanentDeleteNote(API_BASE, AppState.userId, note.id); } catch(e) {}
            }
            _toastManager.show(`已永久删除 ${noteCount} 篇笔记`, 'info');
            await _dataLoader.loadAll();
            DashboardUpdater._populateTrashDialog();
          });
        }
        const clearBtn = dialog.querySelector('.trash-clear-btn');
        if (clearBtn) {
          clearBtn.disabled = false;
          clearBtn.addEventListener('click', async function(e) {
            if (!confirm('确定要清空回收站吗？所有笔记将被永久删除，此操作不可撤销！')) return;
            try {
              await clearTrash(API_BASE, AppState.userId);
              _toastManager.show('回收站已清空', 'info');
              await _dataLoader.loadAll();
              DashboardUpdater._populateTrashDialog();
            } catch (e) {
              _toastManager.show('清空失败: ' + e.message, 'error');
            }
          });
        }
      }
    } catch (e) {
      console.error('加载回收站失败:', e);
      container.innerHTML = '<div class="text-center py-8 text-red-400 text-sm">加载回收站失败</div>';
    }
  },

  _setTrashButtonsDisabled(disabled) {
    const dialog = Utils.getElement('trash-dialog');
    if (!dialog) return;
    ['trash-clear-btn', 'trash-restore-all-btn', 'trash-delete-all-btn'].forEach(cls => {
      const btn = dialog.querySelector('.' + cls);
      if (btn) btn.disabled = disabled;
    });
  },

  _populateNotesDialog() {
    const state = AppState;
    const container = Utils.getElement('total-notes-list');
    const countEl = Utils.getElement('total-notes-count');
    if (!container) return;
    const searchInput = Utils.getElement('total-notes-search');
    const sortSelect = Utils.getElement('total-notes-sort');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const sort = sortSelect ? sortSelect.value : 'updated_desc';
    let filtered = state.allNotes;
    if (query) {
      filtered = state.allNotes.filter(n =>
        (n.title && n.title.toLowerCase().includes(query)) ||
        (n.category && n.category.toLowerCase().includes(query)) ||
        (n.tagsStr && n.tagsStr.toLowerCase().includes(query))
      );
    }
    const sorted = [...filtered].sort((a, b) => {
      switch (sort) {
        case 'updated_asc': return a.updated_at - b.updated_at;
        case 'created_desc': return b.created_at - a.created_at;
        case 'created_asc': return a.created_at - b.created_at;
        case 'title_asc': return (a.title || '').localeCompare(b.title || '');
        case 'title_desc': return (b.title || '').localeCompare(a.title || '');
        case 'updated_desc': default: return b.updated_at - a.updated_at;
      }
    });
    if (countEl) countEl.textContent = `(${sorted.length}/${state.allNotes.length})`;
    if (sorted.length === 0) {
      container.innerHTML = '<div class="text-center py-8 text-gray-400 text-sm">' + (query ? '没有找到匹配的笔记' : '暂无笔记') + '</div>';
      return;
    }
    const catColorMap = {};
    state.allCategories.forEach(cat => { catColorMap[cat.name] = cat.color; });
    container.innerHTML = sorted.map(note => {
      const cc = catColorMap[note.category] || '#64748b';
      return `<div class="flex items-start space-x-3 p-3 bg-dark rounded-lg border border-dark-lighter hover:border-indigo-500/50 transition-colors cursor-pointer group" data-note-id="${note.id}">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style="background:${cc}20;color:${cc}"><i class="fa-solid fa-file-pen text-sm"></i></div>
        <div class="flex-1 min-w-0">
          <h4 class="text-sm font-medium text-white truncate group-hover:text-indigo-400 transition-colors">${this._escapeHtml(note.title)}</h4>
          <div class="flex items-center gap-2 mt-1 flex-wrap">
            <span class="text-xs text-gray-400 bg-dark-lighter px-2 py-0.5 rounded">${this._escapeHtml(note.category)}</span>
            <span class="text-xs text-gray-500">修改${note.revision_count}次</span>
            <span class="text-xs text-gray-500">${Utils.timeAgo(note.updated_at)}</span>
          </div>
        </div>
        <div class="flex items-center space-x-1 flex-shrink-0 mt-0.5">
          <button class="note-history-btn p-1.5 text-indigo-400 hover:text-white hover:bg-indigo-500/20 rounded transition-colors" data-note-id="${note.id}" title="历史版本"><i class="fa-solid fa-clock-rotate-left text-xs"></i></button>
          <button class="note-preview-btn p-1.5 text-indigo-400 hover:text-white hover:bg-indigo-500/20 rounded transition-colors" data-note-id="${note.id}" title="预览"><i class="fa-solid fa-eye text-xs"></i></button>
          <button class="note-delete-btn p-1.5 text-red-400 hover:text-white hover:bg-red-500/20 rounded transition-colors" data-note-id="${note.id}" title="删除"><i class="fa-solid fa-trash text-xs"></i></button>
        </div>
      </div>`;
    }).join('');
    // 绑定事件（历史版本、预览、删除、行点击）
    container.querySelectorAll('.note-history-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const noteId = this.getAttribute('data-note-id');
        const note = AppState.allNotes.find(n => n.id === noteId);
        if (!note) { if (_toastManager) _toastManager.show('笔记不存在', 'error'); return; }
        (async () => {
          const showVersionHistory = await _getVersionHistory();
          showVersionHistory({
            apiBase: API_BASE,
            userId: AppState.userId,
            noteId: noteId,
            masterKey: AppState.masterKey,
            onRestore: (restored) => {
              if (_toastManager) _toastManager.show('版本内容已恢复，请记得保存', 'success');
              _dataLoader.loadAll();
            }
          });
        })();
      });
    });
    container.querySelectorAll('.note-preview-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const noteId = this.getAttribute('data-note-id');
        const note = AppState.allNotes.find(n => n.id === noteId);
        if (note) _previewNote(noteId);
      });
    });
    container.querySelectorAll('.note-delete-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const nid = this.getAttribute('data-note-id');
        const note = AppState.allNotes.find(n => n.id === nid);
        if (!confirm(`确定要删除笔记「${note ? note.title : '未知'}」吗？`)) return;
        (async () => {
          try {
            const res = await apiDeleteNote(API_BASE, AppState.userId, nid);
            if (res.ok) {
              if (_eventLogger) _eventLogger.log('delete', `删除笔记: ${note ? note.title : nid} (前端→后端→D1)`, '管理员', '成功');
              _toastManager.show('笔记已删除到回收站', 'success');
              await _dataLoader.loadAll();
              DashboardUpdater._populateNotesDialog();
            } else {
              _toastManager.show('删除失败', 'error');
            }
          } catch (e) {
            _toastManager.show('删除失败: ' + e.message, 'error');
          }
        })();
      });
    });
    // 行点击预览
    container.querySelectorAll('[data-note-id]').forEach(row => {
      row.addEventListener('click', function(e) {
        if (e.target.closest('button')) return;
        _previewNote(this.getAttribute('data-note-id'));
      });
    });
  },

  initTotalNotesDialogEvents() {
    const searchInput = Utils.getElement('total-notes-search');
    const sortSelect = Utils.getElement('total-notes-sort');
    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => DashboardUpdater._populateNotesDialog(), 200);
      });
    }
    if (sortSelect) {
      sortSelect.addEventListener('change', function() {
        DashboardUpdater._populateNotesDialog();
      });
    }
  },

  _populateCategoriesDialog() {
    const state = AppState;
    const container = Utils.getElement('total-categories-content');
    if (!container) return;
    if (state.allCategories.length === 0) {
      container.innerHTML = '<div class="text-center text-gray-500 py-8 text-sm">暂无分类</div>';
      return;
    }
    const colorList = ['#3b82f6','#a855f7','#ec4899','#f97316','#10b981','#8b5cf6','#f59e0b','#06b6d4'];
    const catCount = {};
    state.allNotes.forEach(note => { const c = note.category || '未分类'; catCount[c] = (catCount[c] || 0) + 1; });
    container.innerHTML = state.allCategories.map((cat, i) => {
      const color = cat.color || colorList[i % colorList.length];
      const count = catCount[cat.name] || 0;
      return `<div class="flex items-center space-x-3 p-3 bg-dark rounded-lg border border-dark-lighter hover:border-indigo-500/50 transition-colors cursor-pointer group" data-cat-name="${this._escapeHtml(cat.name)}">
        <span class="w-3 h-3 rounded-full flex-shrink-0" style="background:${color}"></span>
        <div class="flex-1 min-w-0">
          <h4 class="text-sm font-medium text-white truncate" title="${this._escapeHtml(cat.name)} (点击查看笔记)">${this._escapeHtml(cat.name)}</h4>
        </div>
        <span class="text-xs text-gray-400 bg-dark-lighter px-2 py-0.5 rounded">${count} 篇</span>
        <button class="cat-edit-btn p-1.5 text-gray-500 hover:text-indigo-400 hover:bg-dark-lighter rounded transition-colors opacity-0 group-hover:opacity-100" data-cat-id="${cat.id}" title="编辑分类"><i class="fa-solid fa-pen text-xs"></i></button>
        <button class="cat-delete-btn p-1.5 text-gray-500 hover:text-red-400 hover:bg-dark-lighter rounded transition-colors opacity-0 group-hover:opacity-100" data-cat-id="${cat.id}" title="删除分类"><i class="fa-solid fa-trash text-xs"></i></button>
      </div>`;
    }).join('');
    // 绑定分类对话框事件（编辑、删除、点击查看笔记）
    container.querySelectorAll('[data-cat-name]').forEach(row => {
      row.addEventListener('click', function(e) {
        if (e.target.closest('button')) return;
        const catName = this.getAttribute('data-cat-name');
        _showCategoryNotes(catName);
      });
    });
    container.querySelectorAll('.cat-edit-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const catId = this.getAttribute('data-cat-id');
        const catName = this.getAttribute('data-cat-name');
        _openEditCategoryDialog(catId, catName);
      });
    });
    container.querySelectorAll('.cat-delete-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const catId = this.getAttribute('data-cat-id');
        if (confirm('确认删除此分类？该操作不可撤销。')) {
          _catDeleteCategory(catId);
        }
      });
    });
  },

  _populateTagsDialog() {
    const state = AppState;
    const container = Utils.getElement('total-tags-content');
    if (!container) return;
    const tagMap = {};
    state.allNotes.forEach(note => {
      if (note.tags && note.tags.length > 0) {
        note.tags.forEach(t => {
          const tag = t.trim();
          if (tag && !tag.startsWith('__meta:')) {
            tagMap[tag] = (tagMap[tag] || 0) + 1;
          }
        });
      }
    });
    const tagNames = Object.keys(tagMap);
    if (tagNames.length === 0) {
      container.innerHTML = '<div class="text-center py-12"><div class="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4"><i class="fa-solid fa-tag text-blue-400 text-3xl"></i></div><h3 class="text-white font-medium mb-2">暂无标签</h3><p class="text-gray-400 text-sm">您的标签列表为空</p></div>';
      return;
    }
    container.innerHTML = tagNames.map(tag => `<div class="flex items-center space-x-3 p-3 bg-dark rounded-lg border border-dark-lighter hover:border-indigo-500/50 transition-colors group" data-tag-name="${this._escapeHtml(tag)}">
      <div class="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 flex-shrink-0"><i class="fa-solid fa-tag text-sm"></i></div>
      <div class="flex-1 min-w-0"><h4 class="text-sm font-medium text-white truncate">${this._escapeHtml(tag)} <span class="text-xs text-gray-400 ml-1">(${tagMap[tag]})</span></h4></div>
      <div class="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0">
        <button class="tag-edit-btn p-1.5 text-indigo-400 hover:text-white hover:bg-indigo-500/20 rounded transition-colors" data-tag-name="${this._escapeHtml(tag)}" title="编辑标签"><i class="fa-solid fa-pen text-xs"></i></button>
        <button class="tag-delete-btn p-1.5 text-red-400 hover:text-white hover:bg-red-500/20 rounded transition-colors" data-tag-name="${this._escapeHtml(tag)}" title="删除标签"><i class="fa-solid fa-trash text-xs"></i></button>
      </div>
    </div>`).join('');
    // 绑定标签对话框事件（编辑、删除）
    container.querySelectorAll('.tag-edit-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const tagName = this.getAttribute('data-tag-name');
        _openEditTagDialog(tagName);
      });
    });
    container.querySelectorAll('.tag-delete-btn').forEach(btn => {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        const tagName = this.getAttribute('data-tag-name');
        if (!confirm(`确认要删除标签「${tagName}」吗？此操作将把该标签对应的所有笔记移入回收站。`)) return;
        await _tagDeleteTag(tagName);
      });
    });
  },

  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};