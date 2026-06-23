// services/event-manager.js — 事件监听管理
'use strict';

import AppState from "../core/state.js";
import { Utils } from "../core/utils.js";
import { API_BASE, createNoteV2, deleteNote as apiDeleteNote } from "../../../shared/api/index.js";
import { encrypt } from "../../../shared/crypto/index.js";
import { clearAllCache } from "../../../shared/utils/note-cache.js";

let _logManager = null;
let _toastManager = null;
let _chartManager = null;
let _noteEditor = null;
let _dialogManager = null;
let _dashboardUpdater = null;
let _dataLoader = null;
let _draftManager = null;
let _eventLogger = null;
let _profileManager = null;
let _logoutManager = null;
let _currentEditorState = null;
let _autoLockManager = null;
let _loadingOverlay = null;

export function injectDeps(deps) {
  _logManager = deps.logManager;
  _toastManager = deps.toastManager;
  _chartManager = deps.chartManager;
  _noteEditor = deps.noteEditor;
  _dialogManager = deps.dialogManager;
  _dashboardUpdater = deps.dashboardUpdater;
  _dataLoader = deps.dataLoader;
  _draftManager = deps.draftManager;
  _eventLogger = deps.eventLogger;
  _profileManager = deps.profileManager;
  _logoutManager = deps.logoutManager;
  _currentEditorState = deps.currentEditorState;
  _autoLockManager = deps.autoLockManager;
  _loadingOverlay = deps.loadingOverlay;
}

export const EventManager = {
  init() {
    this.initNavTabs();
    this.initNewNoteDropdown();
    this.initDialogTriggers();
    this.initDialogClosers();
    this.initThemeToggle();
    this.initLoginForm();
    this.initTimeFilters();
    this.initSettingsTabs();
    this.initSecuritySettings();
    this.initBackupSettings();
    this.initBasicSettings();
    this.initNewNoteUI();
    this.initEscKey();
    this.initProfileAndLogout();
    this.initDecryptToggle();
    this.initEncryptedModeGuard();
    if (_dashboardUpdater) _dashboardUpdater.initTotalNotesDialogEvents();
    if (_eventLogger) {
      _eventLogger.initEventFilters();
      _eventLogger.initLogManagerOverride();
    }
  },

  initDecryptToggle() {
    const btn = Utils.getElement('decrypt-toggle-btn');
    if (!btn) return;
    const state = AppState;
    const syncDecryptBadge = () => {
      const badge = Utils.getElement('encrypt-status-badge');
      if (!badge) return;
      if (state.isDecrypted) {
        badge.textContent = '开启';
        badge.className = 'text-emerald-400';
      } else {
        badge.textContent = '关闭';
        badge.className = 'text-amber-400';
      }
    };
    const updateIcon = () => {
      const icon = btn.querySelector('i');
      if (!icon) return;
      if (state.isDecrypted) {
        icon.className = 'fa-solid fa-eye';
        btn.title = '已解密，点击重新加密';
        btn.className = 'p-2 rounded-lg text-emerald-400 transition-colors relative';
      } else {
        icon.className = 'fa-solid fa-eye-slash';
        btn.title = '未解密，点击输入解密密码';
        btn.className = 'p-2 rounded-lg text-amber-400 animate-pulse transition-colors relative';
      }
      syncDecryptBadge();
    };
    // 初始状态
    updateIcon();
    // 点击事件
    btn.addEventListener('click', async () => {
      if (state.isDecrypted) {
        // 已解密 → 切换回加密模式
        state.isDecrypted = false;
        updateIcon();
        // 重新加载数据（加密模式）
        if (_dataLoader) {
          _dataLoader.loadAll();
        }
        if (_toastManager) _toastManager.show('已切换回加密模式', 'info');
      } else {
        // 未解密 → 弹出解密对话框
        showDecryptDialog(() => {
          updateIcon();
        });
      }
    });
    // 数据看板说明卡片的解密按钮同步绑定
    const dashBtn = Utils.getElement('decrypt-dashboard-btn');
    if (dashBtn) {
      dashBtn.addEventListener('click', async () => {
        if (state.isDecrypted) {
          state.isDecrypted = false;
          updateIcon();
          if (_dataLoader) _dataLoader.loadAll();
          if (_toastManager) _toastManager.show('已切换回加密模式', 'info');
        } else {
          showDecryptDialog(() => updateIcon());
        }
      });
    }

    // 监听 AppState.isDecrypted 变更（通过轮询 storage 事件兼容解锁后更新）
    window.addEventListener('storage', (e) => {
      if (e.key === 'decryptKey' || e.key === 'isDecrypted') {
        updateIcon();
      }
    });
  },

  initProfileAndLogout() {
    const profileLink = Utils.getElement('profile-link');
    if (profileLink) {
      profileLink.addEventListener('click', function(e) {
        e.preventDefault();
        const parent = this.closest('.group');
        if (parent) {
          const dropdown = parent.querySelector('.absolute');
          if (dropdown) dropdown.classList.add('hidden');
        }
        if (_profileManager) _profileManager.openDialog();
      });
    }
    const logoutDropdownBtn = Utils.getElement('logout-dropdown-btn');
    if (logoutDropdownBtn) {
      logoutDropdownBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (_logoutManager) _logoutManager.logout();
      });
    }
    const logoutBtn = Utils.getElement('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (_logoutManager) _logoutManager.logout();
      });
    }
  },

  initNavTabs() {
    Utils.queryAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', function() {
        Utils.queryAll('.nav-tab').forEach(t => { t.classList.remove('text-indigo-400', 'border-b-2', 'border-indigo-400', 'font-medium'); t.classList.add('text-gray-400', 'hover:text-white'); });
        this.classList.remove('text-gray-400', 'hover:text-white');
        this.classList.add('text-indigo-400', 'border-b-2', 'border-indigo-400', 'font-medium');
        Utils.queryAll('.page-content').forEach(p => { p.classList.add('hidden'); p.classList.remove('active'); });
        const tabName = this.getAttribute('data-tab');
        const pageId = tabName + '-page';
        const page = Utils.getElement(pageId);
        if (page) {
          page.classList.remove('hidden');
          setTimeout(() => page.classList.add('active'), 10);
        } else {
          const container = Utils.getElement('content-container');
          if (container) {
            const placeholder = document.createElement('div');
            placeholder.className = 'page-content active p-5 flex items-center justify-center';
            placeholder.id = pageId;
            placeholder.style.minHeight = '60vh';
            placeholder.innerHTML = `<div class="text-center"><div class="w-24 h-24 rounded-full bg-indigo-500/10 flex items-center justify-center mx-auto mb-6"><i class="fa-solid fa-tools text-indigo-400 text-4xl"></i></div><h2 class="text-2xl font-bold text-white mb-3">功能开发中</h2><p class="text-gray-400 text-lg mb-2">页面正在紧锣密鼓地开发中...</p><p class="text-gray-500 text-sm">敬请期待！</p></div>`;
            container.appendChild(placeholder);
            setTimeout(() => placeholder.classList.add('active'), 10);
          }
        }
        if (pageId === 'analysis-page') {
          setTimeout(() => { if (_chartManager) { _chartManager.initDashboardCharts(); _chartManager.initAnalysisCharts(); } }, 100);
        }
        if (_logManager) _logManager.info(`切换到${this.textContent}页面`);
      });
    });
  },

  initNewNoteDropdown() {
    const toggle = Utils.getElement('new-note-toggle');
    const dropdown = Utils.getElement('new-note-dropdown');
    if (toggle && dropdown) {
      toggle.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('show'); });
    }
    document.addEventListener('click', (e) => {
      if (dropdown && !e.target.closest('#new-note-container')) dropdown.classList.remove('show');
    });
  },

  initDialogTriggers() {
    Utils.queryAll('[data-dialog]').forEach(trigger => {
      trigger.addEventListener('click', function(e) {
        e.preventDefault();
        const dialogId = this.getAttribute('data-dialog') + '-dialog';
        const dialog = Utils.getElement(dialogId);
        if (!dialog) return;
        dialog.style.display = 'flex';
        if (dialogId === 'category-dialog') {
          const name = Utils.getAttr(this, 'data-category-name') || '分类';
          if (_chartManager) _chartManager.updateCategoryDetail(name);
        }
        if (dialogId === 'new-note-dialog') {
          if (_noteEditor) { _noteEditor.populateCategories(); _noteEditor.resetEditor(); _noteEditor._initTagDropdown(); }
          _updateEditorDialogTitle('新建笔记');
          if (_currentEditorState) _currentEditorState.startAutoSave();
        }
        if (_dashboardUpdater) _dashboardUpdater.populateDialog(dialogId);
        if (_logManager) _logManager.info(`打开${this.textContent.trim()}对话框`);
      });
    });
  },

  initDialogClosers() {
    Utils.queryAll('.dialog-close').forEach(btn => {
      btn.addEventListener('click', function() {
        if (_dialogManager) _dialogManager.close(this);
      });
    });
    Utils.queryAll('.dialog-overlay').forEach(overlay => {
      overlay.addEventListener('click', function(e) {
        if (e.target === this && _dialogManager) _dialogManager.close(this);
      });
    });
  },

  initThemeToggle() {
    const t = Utils.getElement('theme-toggle');
    if (!t) return;

    // 从 localStorage 恢复主题，默认为暗色模式
    const savedTheme = localStorage.getItem('encrypted_notes_theme');
    if (savedTheme === 'light') {
      document.body.classList.remove('dark');
      const icon = t.querySelector('i');
      if (icon) { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); }
    } else {
      // 默认强制暗色模式
      document.body.classList.add('dark');
      localStorage.setItem('encrypted_notes_theme', 'dark');
      const icon = t.querySelector('i');
      if (icon) { icon.classList.remove('fa-sun'); icon.classList.add('fa-moon'); }
    }

    t.addEventListener('click', function() {
      const icon = this.querySelector('i');
      icon.classList.toggle('fa-sun');
      icon.classList.toggle('fa-moon');
      const isDark = document.body.classList.toggle('dark');
      localStorage.setItem('encrypted_notes_theme', isDark ? 'dark' : 'light');
      // 同步外观设置开关
      const appearanceCheckbox = document.querySelector('#appearance-toggle-checkbox');
      if (appearanceCheckbox) appearanceCheckbox.checked = isDark;
      if (_logManager) _logManager.info(isDark ? '切换深色模式' : '切换亮色模式');
    });

    // 外观设置开关同步到主题按钮
    const appearanceCheckbox = document.querySelector('#appearance-toggle-checkbox');
    if (appearanceCheckbox) {
      appearanceCheckbox.addEventListener('change', function() {
        const isDark = this.checked;
        document.body.classList.toggle('dark', isDark);
        localStorage.setItem('encrypted_notes_theme', isDark ? 'dark' : 'light');
        const icon = t.querySelector('i');
        if (icon) {
          if (isDark) { icon.classList.remove('fa-sun'); icon.classList.add('fa-moon'); }
          else { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); }
        }
      });
    }
  },

  initLoginForm() {
    const f = Utils.getElement('login-form');
    if (!f) return;
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const pwd = Utils.getElement('password');
      if (pwd && pwd.value) {
        if (_logManager) _logManager.success('登录成功');
        if (_toastManager) _toastManager.show('登录成功', 'success');
      } else {
        if (_logManager) _logManager.error('请输入密码');
        if (_toastManager) _toastManager.show('请输入密码', 'error');
      }
    });
  },

  initTimeFilters() {
    Utils.queryAll('.time-filter').forEach(btn => {
      btn.addEventListener('click', function() {
        Utils.queryAll('.time-filter').forEach(b => { b.classList.remove('bg-indigo-600', 'text-white'); b.classList.add('hover:bg-dark-lighter'); });
        this.classList.remove('hover:bg-dark-lighter');
        this.classList.add('bg-indigo-600', 'text-white');
        if (_chartManager) _chartManager.updateTrendFilter(Utils.getAttr(this, 'data-period') || 'month');
        if (_logManager) _logManager.info(`切换到${this.textContent}视图`);
      });
    });
  },

  /**
   * 设置页面标签切换
   * 点击左侧选项卡，切换右侧对应的设置面板
   */
  initSettingsTabs() {
    Utils.queryAll('.settings-tab').forEach(tab => {
      tab.addEventListener('click', function() {
        // 更新选项卡高亮
        Utils.queryAll('.settings-tab').forEach(t => {
          t.classList.remove('bg-indigo-600', 'text-white');
          t.classList.add('text-gray-300', 'hover:bg-dark-lighter');
        });
        this.classList.remove('text-gray-300', 'hover:bg-dark-lighter');
        this.classList.add('bg-indigo-600', 'text-white');

        // 切换对应的设置面板
        const tabName = this.getAttribute('data-settings-tab');
        Utils.queryAll('.settings-content').forEach(content => {
          content.classList.add('hidden');
        });
        const target = document.querySelector(`.settings-content[data-settings-content="${tabName}"]`);
        if (target) target.classList.remove('hidden');
      });
    });
  },

  initSecuritySettings() {
    const lockSelect = Utils.getElement('settings-lock-timeout');
    const saveBtn = Utils.getElement('settings-save-security');
    if (lockSelect) {
      if (_autoLockManager) {
        const currentTimeout = _autoLockManager.getTimeout();
        lockSelect.value = String(currentTimeout);
      }
      lockSelect.addEventListener('change', function() {
        const minutes = parseInt(this.value);
        if (_autoLockManager) _autoLockManager.updateTimeout(minutes);
        if (_logManager) _logManager.info(`设置锁定时长: ${minutes} 分钟`);
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        if (!lockSelect) return;
        const minutes = parseInt(lockSelect.value);
        if (_autoLockManager) _autoLockManager.updateTimeout(minutes);
        if (_toastManager) _toastManager.show(`锁定时间已设置为 ${minutes === 0 ? '永不锁定' : minutes + ' 分钟'}`, 'success');
        if (_logManager) _logManager.info(`保存锁定时长设置: ${minutes} 分钟`);
      });
    }
  },

  /**
   * 基本设置保存
   * 用户名、邮箱、默认分类、自动保存间隔、自动备份、回收站自动清理 → 存入 localStorage
   * 保存成功后弹窗提示
   */
  initBackupSettings() {
    const exportBtn = Utils.getElement('settings-export-data');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        try {
          // 收集所有数据
          const state = AppState;
          const allNotes = state.allNotes || [];
          const categories = state.allCategories || [];
          
          // 构建导出数据对象
          const exportData = {
            version: '2.0',
            exportedAt: new Date().toISOString(),
            userId: state.userId,
            summary: {
              totalNotes: allNotes.length,
              totalCategories: categories.length
            },
            data: {
              notes: allNotes.map(n => ({
                id: n.id,
                title: n.title,
                content: n.content,
                category: n.category,
                tags: n.tags,
                isEncrypted: n.isEncrypted || false,
                createdAt: n.createdAt,
                updatedAt: n.updatedAt
              })),
              categories: categories.map(c => ({
                id: c.id,
                name: c.name,
                color: c.color || '#6366f1',
                createdAt: c.createdAt
              }))
            }
          };

          // 创建并下载 JSON 文件
          const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
          a.download = `encrypted-notes-backup-${timestamp}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          if (_toastManager) _toastManager.show(`数据导出成功，共 ${allNotes.length} 条笔记`, 'success');
          if (_logManager) _logManager.info(`导出数据: ${allNotes.length} 条笔记, ${categories.length} 个分类`);
        } catch (e) {
          if (_toastManager) _toastManager.show('导出失败: ' + (e.message || '未知错误'), 'error');
          if (_logManager) _logManager.error('导出数据失败: ' + e.message);
        }
      });
    }

    // 清理缓存按钮
    const clearCacheBtn = Utils.getElement('settings-clear-cache');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', async () => {
        if (!confirm('确定要清理所有本地缓存数据吗？清理后需要重新从服务器加载数据。')) return;
        try {
          await clearAllCache();
          // 也清理 localStorage 中的草稿和编辑器状态
          localStorage.removeItem('encrypted_notes_drafts');
          localStorage.removeItem('encrypted_notes_current_editor');
          // 清除 sessionStorage 中的解密密钥（保留登录态）
          sessionStorage.removeItem('decryptKey');
          if (_toastManager) _toastManager.show('本地缓存已清理，正在重新加载数据...', 'success');
          if (_logManager) _logManager.info('本地缓存已清理');
          // 重新加载数据
          if (_dataLoader) {
            setTimeout(() => _dataLoader.loadAll(), 500);
          }
        } catch (e) {
          if (_toastManager) _toastManager.show('清理缓存失败: ' + (e.message || '未知错误'), 'error');
        }
      });
    }

    // 页面的"清理缓存"按钮（系统页面中的快捷操作）
    const quickClearBtns = document.querySelectorAll('[data-dialog="clear-cache"]');
    quickClearBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('确定要清理所有本地缓存数据吗？')) return;
        try {
          await clearAllCache();
          if (_toastManager) _toastManager.show('本地缓存已清理', 'success');
        } catch (e) {}
      });
    });

    // 导入数据按钮
    const importBtn = Utils.getElement('settings-import-data');
    const importFileInput = Utils.getElement('settings-import-file');
    if (importBtn && importFileInput) {
      importBtn.addEventListener('click', () => {
        importFileInput.click();
      });
      importFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          
          // 验证导入数据格式
          if (!data.version || !data.data) {
            if (_toastManager) _toastManager.show('无效的备份文件格式', 'error');
            return;
          }

          if (!confirm(`即将导入 ${data.summary?.totalNotes || 0} 条笔记和 ${data.summary?.totalCategories || 0} 个分类。\n此操作将覆盖部分本地数据，是否继续？`)) {
            importFileInput.value = '';
            return;
          }

          // 将导入的数据存储到 localStorage 供页面使用
          const importedNotes = data.data.notes || [];
          const importedCategories = data.data.categories || [];

          // 如果当前有笔记和分类，进行合并
          const state = AppState;
          if (state.allNotes && state.allNotes.length > 0) {
            // 合并笔记，以导入的为准
            const existingIds = new Set(state.allNotes.map(n => n.id));
            importedNotes.forEach(n => {
              if (!existingIds.has(n.id)) {
                state.allNotes.push(n);
              } else {
                // 替换已存在的
                const idx = state.allNotes.findIndex(ex => ex.id === n.id);
                if (idx >= 0) state.allNotes[idx] = n;
              }
            });
          } else {
            state.allNotes = importedNotes;
          }

          // 合并分类
          if (state.allCategories && state.allCategories.length > 0) {
            const existingCatIds = new Set(state.allCategories.map(c => c.id));
            importedCategories.forEach(c => {
              if (!existingCatIds.has(c.id)) {
                state.allCategories.push(c);
              }
            });
          } else {
            state.allCategories = importedCategories;
          }

          if (_toastManager) _toastManager.show(`数据导入成功！共 ${importedNotes.length} 条笔记, ${importedCategories.length} 个分类`, 'success');
          if (_logManager) _logManager.info(`导入数据: ${importedNotes.length} 条笔记, ${importedCategories.length} 个分类`);
          
          // 刷新UI
          if (_dashboardUpdater) _dashboardUpdater.refreshAll();
          if (_dataLoader) {
            // 标记需要刷新
            setTimeout(() => _dataLoader.loadAll().catch(() => {}), 300);
          }

          importFileInput.value = '';
        } catch (e) {
          if (_toastManager) _toastManager.show('导入失败: ' + (e.message || '文件解析错误'), 'error');
          if (_logManager) _logManager.error('导入数据失败: ' + e.message);
          importFileInput.value = '';
        }
      });
    }

    // 系统页面中的"导出所有数据"快捷按钮
    const systemExportBtns = document.querySelectorAll('.bg-dark-light .space-y-3 button');
    systemExportBtns.forEach(btn => {
      if (btn.textContent.includes('导出所有数据')) {
        btn.addEventListener('click', () => {
          const exportRealBtn = Utils.getElement('settings-export-data');
          if (exportRealBtn) exportRealBtn.click();
        });
      }
    });

    // 系统页面中的"清理缓存"快捷按钮
    const systemClearBtns = document.querySelectorAll('.bg-dark-light .space-y-3 button');
    systemClearBtns.forEach(btn => {
      if (btn.textContent.includes('清理缓存')) {
        btn.addEventListener('click', () => {
          const clearRealBtn = Utils.getElement('settings-clear-cache');
          if (clearRealBtn) clearRealBtn.click();
        });
      }
    });
  },

  initBasicSettings() {
    const saveBtn = Utils.getElement('settings-save-basic');
    if (!saveBtn) return;

    // 加载已保存的设置
    const saved = localStorage.getItem('encrypted_notes_settings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        const usernameEl = Utils.getElement('settings-username');
        const emailEl = Utils.getElement('settings-email');
        const categoryEl = Utils.getElement('settings-default-category');
        const intervalEl = Utils.getElement('settings-auto-save-interval');
        const autoBackupEl = Utils.getElement('settings-auto-backup');
        const trashCleanEl = Utils.getElement('settings-trash-auto-clean');
        if (usernameEl && settings.username) usernameEl.value = settings.username;
        if (emailEl && settings.email) emailEl.value = settings.email;
        if (categoryEl && settings.defaultCategory) categoryEl.value = settings.defaultCategory;
        if (intervalEl && settings.autoSaveInterval) intervalEl.value = String(settings.autoSaveInterval);
        if (autoBackupEl) autoBackupEl.checked = settings.autoBackup !== false;
        if (trashCleanEl) trashCleanEl.checked = settings.trashAutoClean !== false;
      } catch (e) {}
    }

    // 用户标识
    const userIdEl = Utils.getElement('settings-user-id');
    if (userIdEl) {
      const uid = sessionStorage.getItem('userId') || '';
      userIdEl.value = uid.substring(0, 12) + (uid.length > 12 ? '...' : '');
    }

    // 动态加载分类列表到默认分类选择框
    const catSelect = Utils.getElement('settings-default-category');
    if (catSelect) {
      const cats = AppState.allCategories;
      if (cats && cats.length > 0) {
        cats.forEach(cat => {
          if (cat.name && cat.name !== '未分类') {
            const opt = document.createElement('option');
            opt.value = cat.name;
            opt.textContent = cat.name;
            catSelect.appendChild(opt);
          }
        });
      }
    }

    /**
     * 同步用户名/邮箱到侧边栏底部
     */
    const syncSidebarUser = () => {
      const saved = localStorage.getItem('encrypted_notes_settings');
      if (saved) {
        try {
          const settings = JSON.parse(saved);
          const sidebarName = Utils.getElement('sidebar-username');
          const sidebarEmail = Utils.getElement('sidebar-email');
          if (sidebarName && settings.username) sidebarName.textContent = settings.username;
          if (sidebarEmail && settings.email) sidebarEmail.textContent = settings.email;
        } catch (e) {}
      }
    };

    // 初始化时同步侧边栏
    syncSidebarUser();

    // 保存按钮事件
    saveBtn.addEventListener('click', () => {
      const username = Utils.getElement('settings-username')?.value.trim() || '';
      const email = Utils.getElement('settings-email')?.value.trim() || '';
      const defaultCategory = Utils.getElement('settings-default-category')?.value || '';
      const autoSaveInterval = parseInt(Utils.getElement('settings-auto-save-interval')?.value || '60');
      const autoBackup = Utils.getElement('settings-auto-backup')?.checked || false;
      const trashAutoClean = Utils.getElement('settings-trash-auto-clean')?.checked || false;

      // 读取旧设置
      const oldSettings = localStorage.getItem('encrypted_notes_settings');
      let oldAutoBackup = false;
      let oldTrashClean = false;
      if (oldSettings) {
        try {
          const parsed = JSON.parse(oldSettings);
          oldAutoBackup = parsed.autoBackup !== false;
          oldTrashClean = parsed.trashAutoClean !== false;
        } catch (e) {}
      }

      const settings = { username, email, defaultCategory, autoSaveInterval, autoBackup, trashAutoClean };
      localStorage.setItem('encrypted_notes_settings', JSON.stringify(settings));

      // 同步到侧边栏
      syncSidebarUser();

      // 记录详细事件日志
      if (_logManager) {
        _logManager.info('基本设置已保存');
        if (autoBackup !== oldAutoBackup) {
          _logManager.info(autoBackup ? '自动备份: 开启' : '自动备份: 关闭');
        }
        if (trashAutoClean !== oldTrashClean) {
          _logManager.info(trashAutoClean ? '回收站自动清理: 开启' : '回收站自动清理: 关闭');
        }
      }
      if (_eventLogger) {
        if (autoBackup !== oldAutoBackup) {
          _eventLogger.log('system', autoBackup ? '开启自动备份' : '关闭自动备份', '管理员', '成功');
        }
        if (trashAutoClean !== oldTrashClean) {
          _eventLogger.log('system', trashAutoClean ? '开启回收站自动清理' : '关闭回收站自动清理', '管理员', '成功');
        }
        _eventLogger.log('system', '保存基本设置', '管理员', '成功');
      }
      if (_toastManager) _toastManager.show('保存配置已成功', 'success');
    });
  },

  initNewNoteUI() {
    // 工具栏按钮
    Utils.queryAll('#editor-toolbar .toolbar-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const cmd = this.getAttribute('data-cmd');
        const value = this.getAttribute('data-value') || null;
        const editor = Utils.getElement('new-note-editor');
        if (!editor) return;
        editor.focus();
        if (cmd === 'insertImage') { const url = prompt('请输入图片URL:'); if (url) document.execCommand('insertImage', false, url); return; }
        if (cmd === 'createLink') { const url = prompt('请输入链接URL:'); if (url) document.execCommand('createLink', false, url); return; }
        if (cmd === 'heading') { document.execCommand('formatBlock', false, value || '<h2>'); return; }
        document.execCommand(cmd, false, value);
        this.classList.add('bg-indigo-500/30', 'text-white');
        setTimeout(() => this.classList.remove('bg-indigo-500/30', 'text-white'), 300);
      });
    });
    // 编辑器鼠标/键盘事件跟踪工具栏状态
    const editor = Utils.getElement('new-note-editor');
    if (editor) {
      editor.addEventListener('mouseup', () => {});
      editor.addEventListener('keyup', () => {});
    }
    // 保存按钮
    const saveBtn = Utils.getElement('new-note-save');
    const saveDraftBtn = Utils.getElement('new-note-save-draft');
    if (saveBtn) saveBtn.addEventListener('click', () => { if (_noteEditor) _noteEditor.saveNote(); });
    if (saveDraftBtn) saveDraftBtn.addEventListener('click', () => { if (_noteEditor) _noteEditor.saveNote('draft'); });
    // 保存选项对话框
    Utils.queryAll('.save-options-close').forEach(btn => {
      btn.addEventListener('click', () => { const od = Utils.getElement('save-options-dialog'); if (od) od.style.display = 'none'; });
    });
    const sad = Utils.getElement('save-as-draft-btn');
    if (sad) sad.addEventListener('click', () => { if (_noteEditor) _noteEditor.saveNote('draft'); });
    const saf = Utils.getElement('save-as-formal-btn');
    if (saf) saf.addEventListener('click', () => { if (_noteEditor) _noteEditor.saveNote('formal'); });
    // 分享
    const sb = Utils.getElement('new-note-share-btn');
    if (sb) sb.addEventListener('click', () => { const sd = Utils.getElement('share-dialog'); if (sd) sd.style.display = 'flex'; });
    const gs = Utils.getElement('share-generate-btn');
    if (gs) gs.addEventListener('click', () => { if (_noteEditor) _noteEditor.generateShareLink(); });
    const cb = Utils.getElement('share-copy-btn');
    if (cb) cb.addEventListener('click', () => { const input = Utils.getElement('share-link-input'); if (input && input.value) navigator.clipboard.writeText(input.value).then(() => { if (_toastManager) _toastManager.show('已复制到剪贴板', 'success'); }); });
    const db = Utils.getElement('new-note-delete-btn');
    if (db) db.addEventListener('click', () => { if (confirm('确认清空所有内容？')) { if (_noteEditor) _noteEditor.resetEditor(); if (_toastManager) _toastManager.show('已清空', 'info'); } });
    // 版本历史
    const vhBtn = Utils.getElement('version-history-btn');
    if (vhBtn) {
      vhBtn.addEventListener('click', async () => {
        const noteId = window._editingNoteId;
        if (!noteId) { if (_toastManager) _toastManager.show('请先打开一篇笔记再查看版本历史', 'info'); return; }
        const { showVersionHistory } = await import("../version-history.js");
        showVersionHistory({
          apiBase: API_BASE,
          userId: AppState.userId,
          noteId: noteId,
          masterKey: AppState.masterKey,
          onRestore: (restored) => {
            const titleEl = Utils.getElement('new-note-title');
            const editorEl = Utils.getElement('new-note-editor');
            if (titleEl) titleEl.value = restored.title || '';
            if (editorEl) editorEl.innerHTML = restored.content || '';
            if (_toastManager) _toastManager.show('版本已恢复到编辑器，请记得保存', 'success');
          }
        });
      });
    }
    // 新建分类按钮（包装一层以兼容 category-manager 的带参版本）
    const saveNewCategoryBtn = Utils.getElement('save-new-category') || Utils.getElement('create-category-btn');
    if (saveNewCategoryBtn) {
      saveNewCategoryBtn.addEventListener('click', function() {
        _saveNewCategory(
          (Utils.getElement('new-category-name')?.value || '').trim(),
          window._selectedCategoryColor || '#3b82f6'
        );
      });
    }
    // 分类颜色选择
    const colorPicker = Utils.getElement('category-color-picker');
    if (colorPicker) {
      let selectedColor = '#3b82f6';
      colorPicker.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', function() {
          colorPicker.querySelectorAll('button').forEach(b => b.classList.remove('ring-2', 'ring-offset-2', 'ring-offset-dark-light'));
          this.classList.add('ring-2', 'ring-offset-2', 'ring-offset-dark-light');
          selectedColor = this.getAttribute('data-color') || '#3b82f6';
          window._selectedCategoryColor = selectedColor;
        });
      });
      const firstColorBtn = colorPicker.querySelector('button');
      if (firstColorBtn) {
        firstColorBtn.classList.add('ring-2', 'ring-offset-2', 'ring-offset-dark-light');
        selectedColor = firstColorBtn.getAttribute('data-color') || '#3b82f6';
      }
      window._selectedCategoryColor = selectedColor;
    }
    // 新建分类入口
    const newCategoryFromBtn = Utils.getElement('new-category-from-btn');
    if (newCategoryFromBtn) newCategoryFromBtn.addEventListener('click', function(e) {
      e.preventDefault();
      _openNewCategoryDialog();
      const dropdown = Utils.getElement('new-note-dropdown');
      if (dropdown) dropdown.classList.remove('show');
    });
    const sidebarNewCat = Utils.getElement('sidebar-new-category');
    if (sidebarNewCat) sidebarNewCat.addEventListener('click', function(e) {
      e.preventDefault();
      _openNewCategoryDialog();
    });
    // 预览编辑按钮
    const previewEditBtn = Utils.getElement('preview-edit-btn');
    if (previewEditBtn) {
      previewEditBtn.addEventListener('click', function() {
        const dialog = Utils.getElement('preview-dialog');
        if (dialog) dialog.style.display = 'none';
        const titleEl = Utils.getElement('preview-dialog-title');
        if (titleEl && titleEl._noteId) {
          _editNote(titleEl._noteId);
        }
      });
    }
    // 一键保存/删除草稿

    const draftsSaveAllBtn = Utils.getElement('drafts-save-all-btn');
    if (draftsSaveAllBtn) {
      draftsSaveAllBtn.addEventListener('click', async function() {
        const drafts = (_draftManager ? _draftManager.getAll() : []).filter(d => d.status !== 'saved');
        if (drafts.length === 0) { if (_toastManager) _toastManager.show('没有需要保存的草稿', 'info'); return; }
        if (!confirm(`即将一键保存 ${drafts.length} 篇草稿到云端，是否继续？`)) return;
        const state = AppState;
        const results = await Promise.allSettled(drafts.map(async (draft) => {
          try {
            const tagsData = draft.tags ? JSON.stringify(draft.tags.split(',').map(t => t.trim()).filter(Boolean)) : '';
            const [titleCipher, contentCipher, categoryCipher, tagsCipher] = await Promise.all([
              encrypt(draft.title, state.masterKey), encrypt(draft.content, state.masterKey),
              encrypt(draft.category, state.masterKey), tagsData ? encrypt(tagsData, state.masterKey) : Promise.resolve('')
            ]);
            const noteId = draft.noteId || crypto.randomUUID();
            const res = await createNoteV2(API_BASE, state.userId, { id: noteId, title_cipher: titleCipher, ciphertext: contentCipher, category_cipher: categoryCipher, tags_cipher: tagsCipher });
            if (res.ok) { if (_draftManager) _draftManager.delete(draft.id); return 'success'; }
            return 'fail';
          } catch (e) { return 'fail'; }
        }));
        const successCount = results.filter(r => r.value === 'success').length;
        const failCount = results.filter(r => r.value === 'fail').length;
        if (_toastManager) _toastManager.show(`一键保存完成：成功 ${successCount} 篇，失败 ${failCount} 篇`, failCount > 0 ? 'warning' : 'success');
        if (_draftManager) _draftManager.refreshDisplay();
        await clearAllCache();
        if (_dataLoader) await _dataLoader.loadAll();
        if (_dashboardUpdater) _dashboardUpdater.refreshAll();
        if (Utils.getElement('total-notes-dialog')?.style.display === 'flex') {
          if (_dashboardUpdater) _dashboardUpdater._populateNotesDialog();
        }
      });
    }
    const draftsClearAllBtn = Utils.getElement('drafts-clear-all-btn');
    if (draftsClearAllBtn) {
      draftsClearAllBtn.addEventListener('click', async function() {
        const drafts = (_draftManager ? _draftManager.getAll() : []).filter(d => d.status !== 'saved');
        if (drafts.length === 0) { if (_toastManager) _toastManager.show('没有需要清空的草稿', 'info'); return; }
        if (!confirm(`确认要清空 ${drafts.length} 篇草稿吗？已有笔记的草稿将移入回收站。`)) return;
        let trashCount = 0;
        const state = AppState;
        for (const draft of drafts) {
          if (draft.noteId) {
            try { const res = await apiDeleteNote(API_BASE, state.userId, draft.noteId); if (res.ok) trashCount++; } catch(e) {}
          }
          if (_draftManager) _draftManager.delete(draft.id);
        }
        let msg = `已清理 ${drafts.length} 篇草稿`;
        if (trashCount > 0) msg += `,其中 ${trashCount} 篇已移入回收站`;
        if (_toastManager) _toastManager.show(msg, 'success');
        if (_draftManager) _draftManager.refreshDisplay();
        if (trashCount > 0 && _dataLoader) await _dataLoader.loadAll();
      });
    }
  },

  /**
   * 加密模式下阻止所有编辑操作并弹窗提示
   */
  initEncryptedModeGuard() {
    const state = AppState;
    const blockMsg = '请先解密笔记内容（点击说明卡片右上角"解密密匙"按钮）后再进行此操作';
    document.addEventListener('click', function(e) {
      if (state.isDecrypted) return;
      const target = e.target.closest('button');
      if (!target) return;
      const editSelectors = [
        '[data-dialog="new-note"]', '#new-category-from-btn', '#sidebar-new-category',
        '#new-note-save', '#new-note-save-draft', '#save-as-draft-btn', '#save-as-formal-btn',
        '.note-preview-btn', '.note-history-btn', '.note-delete-btn', '#preview-edit-btn',
        '#drafts-save-all-btn', '#drafts-clear-all-btn', '#edit-category-save-btn',
        '#edit-tag-save-btn', '#create-category-btn', '#new-note-share-btn', '#new-note-delete-btn',
        '.trash-restore-btn', '.trash-permanent-delete-btn', '.trash-restore-all-btn',
        '.trash-delete-all-btn', '.trash-clear-btn', '.cat-edit-btn', '.cat-delete-btn',
        '.tag-edit-btn', '.tag-delete-btn'
      ];
      for (const sel of editSelectors) {
        if (target.matches(sel) || target.closest(sel)) {
          e.preventDefault();
          e.stopPropagation();
          if (_toastManager) _toastManager.show(blockMsg, 'warning');
          return;
        }
      }
    }, true);
  },

  initEscKey() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (_dialogManager) _dialogManager.closeAll();
        const od = Utils.getElement('save-options-dialog'); if (od) od.style.display = 'none';
        const sd = Utils.getElement('share-dialog'); if (sd) sd.style.display = 'none';
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        e.stopPropagation();
        if (_logManager) _logManager.info('触发快捷键锁定 (Ctrl+L)');
        if (_autoLockManager) _autoLockManager._immediateLock();
      }
    });
  }
};

// 从 category-manager 和 standalone-functions 导入
import { _openNewCategoryDialog, _saveNewCategory } from "../components/category-manager.js";
import { _editNote, _updateEditorDialogTitle, switchToClassic } from "./standalone-functions.js";
import { showDecryptDialog } from "./dialog-manager.js";
