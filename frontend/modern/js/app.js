// ============================================================
// v6.2.0 — 主应用入口（极薄层，仅依赖注入 + 初始化）
// 所有业务逻辑已拆分到 modules/ 和 services/ 目录
// ============================================================
'use strict';

// === Promise.allSettled polyfill ===
if (typeof Promise.allSettled !== 'function') {
  Promise.allSettled = function(promises) {
    return Promise.all(promises.map(p =>
      Promise.resolve(p).then(value => ({ status: 'fulfilled', value }),
                         reason => ({ status: 'rejected', reason }))
    ));
  };
}

// === 核心 ===
import AppState from "./core/state.js";
import { Utils, TimeManager, CountAnimation } from "./core/utils.js";

// === 独立函数（预览、编辑、切换等） ===
import { switchToClassic, _previewNote, _editNote, _showCategoryNotes, _updateEditorDialogTitle, DedupUtil } from "./services/standalone-functions.js";

// === 组件 ===
import { ToastManager } from "./components/toast.js";
import { NoteEditor } from "./components/note-editor.js";
import { _openNewCategoryDialog, _openEditCategoryDialog, _saveNewCategory, _editCategory, _deleteCategory, checkDuplicateCategories, initCategoryDialogEvents } from "./components/category-manager.js";
import { _openEditTagDialog, _deleteTag, initEditTagDialogEvents } from "./components/tag-manager.js";

// === 服务 ===
import { DataLoader } from "./services/data-loader.js";
import { DraftManager } from "./services/draft-manager.js";
import { LoadingOverlay } from "./services/loading-overlay.js";
import { LogManager, EventLogger } from "./services/event-logger.js";
import { DashboardUpdater } from "./services/dashboard-updater.js";
import { ChartManager } from "./services/chart-manager.js";
import { SidebarManager } from "./services/sidebar-manager.js";
import { DialogManager, ProfileManager, LogoutManager } from "./services/dialog-manager.js";
import { CurrentEditorState } from "./services/current-editor-state.js";
import { EventManager } from "./services/event-manager.js";
import { clearKeyCache } from "../../shared/crypto/index.js";
import autoLockManager from "./auto-lock.js";

// ====================== 依赖注入 ======================
const deps = {
  toastManager: ToastManager,
  logManager: LogManager,
  eventLogger: EventLogger,
  dataLoader: DataLoader,
  draftManager: DraftManager,
  loadingOverlay: LoadingOverlay,
  dashboardUpdater: DashboardUpdater,
  chartManager: ChartManager,
  sidebarManager: SidebarManager,
  dialogManager: DialogManager,
  profileManager: ProfileManager,
  logoutManager: LogoutManager,
  currentEditorState: CurrentEditorState,
  autoLockManager: autoLockManager,
  noteEditor: NoteEditor,
  countAnimation: CountAnimation
};

// 注入到所有模块
import { injectDeps as injectDataLoader } from "./services/data-loader.js";
import { injectDeps as injectDashboardUpdater } from "./services/dashboard-updater.js";
import { injectDeps as injectChartManager } from "./services/chart-manager.js";
import { injectDeps as injectSidebarManager } from "./services/sidebar-manager.js";
import { injectDeps as injectDialogManager } from "./services/dialog-manager.js";
import { injectDeps as injectStandalone } from "./services/standalone-functions.js";
import { injectDeps as injectEventManager } from "./services/event-manager.js";
import { injectDeps as injectDraftManager } from "./services/draft-manager.js";
import { injectDeps as injectNoteEditor } from "./components/note-editor.js";
import { injectDeps as injectCategoryManager } from "./components/category-manager.js";
import { injectDeps as injectTagManager } from "./components/tag-manager.js";

injectDataLoader(deps);
injectDashboardUpdater(deps);
injectChartManager(deps);
injectSidebarManager(deps);
injectDialogManager(deps);
injectStandalone(deps);
injectEventManager(deps);
injectDraftManager(deps);
injectNoteEditor(deps);
injectCategoryManager(deps);
injectTagManager(deps);

// ====================== 全局 API 暴露 ======================
// 这些函数被 HTML 中的 onclick 或 DOM 事件引用
window.switchToClassic = switchToClassic;
window._previewNote = _previewNote;
window._editNote = _editNote;
window._showCategoryNotes = _showCategoryNotes;
window._updateEditorDialogTitle = _updateEditorDialogTitle;
window._openNewCategoryDialog = _openNewCategoryDialog;
window._openEditCategoryDialog = _openEditCategoryDialog;
window._saveNewCategory = _saveNewCategory;
window._editCategory = _editCategory;
window._deleteCategory = _deleteCategory;
window._openEditTagDialog = _openEditTagDialog;
window._deleteTag = _deleteTag;
window._editingNoteId = null;

// Toast 全局引用（供内联 onclick 使用）
window.ToastManager = ToastManager;
window.DialogManager = DialogManager;
window.LogoutManager = LogoutManager;
window.ProfileManager = ProfileManager;

// ====================== 初始化 ======================
document.addEventListener('DOMContentLoaded', async () => {
  // 注册 Service Worker（缓存静态资源，提速二次加载）
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      LogManager.info('Service Worker 注册成功');
      // 检查是否有等待激活的 worker，强制激活
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch (e) {
      console.warn('Service Worker 注册失败:', e);
    }
  }

  // 初始化基础组件
  TimeManager.init();
  CountAnimation.init();
  ChartManager.initDashboardCharts();

  // 初始化分类/标签对话框事件
  initCategoryDialogEvents();
  initEditTagDialogEvents();

  // 初始化事件绑定
  EventManager.init();

  LogManager.info('页面加载完成');

  // 加载数据
  // 注意：AppState 中的 userId/masterKey 会在 DataLoader.loadAll 中从 sessionStorage 恢复
  await DataLoader.loadAll();

  // 初始化自动锁定（三层密码体系）
  const state = AppState;
  if (state.masterKey) {
    const savedMasterKey = state.masterKey;
    autoLockManager.onLock = () => {
      LogManager.info('系统已锁定');
      // 清理解密态（保留 masterKey 登录态，清除 decryptKey）
      state.clearDecryptedState();
      clearKeyCache();
    };
    autoLockManager.onUnlock = async (inputKey) => {
      const { hashPassword } = await import("../../shared/crypto/index.js");
      const savedLockPwd = sessionStorage.getItem('lockPassword') || '';
      if (!savedLockPwd) {
        // 未设置锁屏密码 → 先用解密密码验证，失败则回退到登录密码（兼容旧账户）
        if (state.decryptKey && inputKey === state.decryptKey) {
          state._isDecrypted = true;
          LogManager.info('系统解锁成功（解密密码）');
          return true;
        }
        // 兼容旧账户：decryptKey 为空时，直接用登录密码验证
        if (inputKey === savedMasterKey) {
          state._isDecrypted = true;
          state._decryptKey = inputKey;
          sessionStorage.setItem('decryptKey', inputKey);
          LogManager.info('系统解锁成功（登录密码兼容旧账户）');
          return true;
        }
        return false;
      }
      const inputHash = await hashPassword(inputKey);
      if (inputHash === savedLockPwd) {
        // 锁屏密码正确 → 恢复解密态
        state._isDecrypted = true;
        LogManager.info('系统解锁成功（锁屏密码）');
        return true;
      }
      return false;
    };
    autoLockManager.init();
  }

  // 跨标签页数据同步
  window.addEventListener('storage', (e) => {
    if (e.key === 'encrypted_notes_drafts' ||
        (e.key && e.key.startsWith('draft_')) ||
        e.key === 'encrypted_notes_current_editor') {
      LogManager.info('检测到其他标签页的数据变更，正在同步...');
      DataLoader.loadAll().catch(() => {});
    }
  });

  console.log(`%c🔐 加密笔记 - 主应用`, `color: #6366f1; font-size: 16px; font-weight: bold;`);
  console.log(`%c版本: v6.2.0 (模块化重构版)`, 'color: #8b5cf6;');
});

// ====================== 全局错误边界 ======================
window.addEventListener('error', (event) => {
  console.error('全局未捕获错误:', event.message, event.filename, event.lineno);
  LoadingOverlay.hide();
  try { ToastManager.show('发生未知错误，请刷新页面重试', 'error'); } catch (_) {}
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的 Promise 拒绝:', event.reason);
  LoadingOverlay.hide();
  try { LogManager.error('异步操作失败: ' + (event.reason?.message || event.reason || '未知')); } catch (_) {}
});