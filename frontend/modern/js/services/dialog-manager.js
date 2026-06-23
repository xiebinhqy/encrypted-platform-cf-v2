// services/dialog-manager.js — 弹窗管理 + 个人资料 + 退出登录
'use strict';

import AppState from "../core/state.js";
import { Utils } from "../core/utils.js";
import { DataLoader } from "./data-loader.js";
import { getKeyHash } from "../../../shared/crypto/index.js";
import { clearAllCache } from "../../../shared/utils/note-cache.js";

let _logManager = null;
let _toastManager = null;
let _currentEditorState = null;

export function injectDeps(deps) {
  _logManager = deps.logManager;
  _toastManager = deps.toastManager;
  _currentEditorState = deps.currentEditorState;
}

/**
 * 显示解密对话框
 * @param {Function} onDecrypted - 解密成功后的回调
 */
export function showDecryptDialog(onDecrypted) {
  // 移除已存在的对话框
  const existing = document.getElementById('decrypt-dialog-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'decrypt-dialog-overlay';
  overlay.className = 'dialog-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:2147483646;display:flex;align-items:center;justify-content:center;';

  overlay.innerHTML = `
    <div class="dialog-content small p-0" style="max-width:420px;width:90vw;">
      <div class="flex items-center justify-between p-5 border-b border-dark-lighter">
        <h2 class="text-xl font-bold text-white flex items-center">
          <i class="fa-solid fa-unlock text-indigo-400 mr-2"></i>解密笔记内容
        </h2>
        <button class="text-gray-400 hover:text-white transition-colors dialog-close" id="decrypt-dialog-close">
          <i class="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>
      <div class="p-5 space-y-4">
        <p class="text-gray-400 text-sm">请输入解密密码以查看笔记的明文内容。</p>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">解密密码</label>
          <input type="password" id="decrypt-key-input" placeholder="输入解密密码"
            class="w-full bg-dark border border-dark-lighter rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500">
        </div>
        <div id="decrypt-error" class="text-red-400 text-sm hidden"></div>
        <div class="flex items-center">
          <input type="checkbox" id="decrypt-use-masterkey" class="w-4 h-4 bg-dark border border-dark-lighter rounded focus:ring-indigo-500">
          <label for="decrypt-use-masterkey" class="ml-2 text-sm text-gray-400">使用登录密码作为解密密码</label>
        </div>
      </div>
      <div class="flex items-center justify-end p-5 border-t border-dark-lighter space-x-3">
        <button class="px-4 py-2 bg-dark-lighter hover:bg-dark text-gray-300 rounded-lg transition-colors dialog-close">取消</button>
        <button id="decrypt-confirm-btn" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center space-x-2">
          <i class="fa-solid fa-unlock"></i><span>解密</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = overlay.querySelector('#decrypt-key-input');
  const errorEl = overlay.querySelector('#decrypt-error');
  const confirmBtn = overlay.querySelector('#decrypt-confirm-btn');
  const useMasterKeyCheck = overlay.querySelector('#decrypt-use-masterkey');

  // 检查是否已有 decryptKey
  const savedDecryptKey = sessionStorage.getItem('decryptKey');
  if (savedDecryptKey) {
    // 已有 key 则尝试直接用
    AppState.setDecrypted(savedDecryptKey);
    overlay.remove();
    if (typeof onDecrypted === 'function') onDecrypted();
    DataLoader.loadAll().catch(() => {});
    return;
  }

  // 关闭按钮
  overlay.querySelectorAll('.dialog-close').forEach(btn => {
    btn.addEventListener('click', () => overlay.remove());
  });

  const handleDecrypt = async () => {
    let key = input.value.trim();
    if (useMasterKeyCheck.checked) {
      key = sessionStorage.getItem('masterKey') || key;
    }
    if (!key) {
      errorEl.textContent = '请输入解密密码';
      errorEl.classList.remove('hidden');
      return;
    }

    // 验证解密密码是否能正确解密第一条笔记
    const userId = AppState.userId;
    if (!userId) {
      errorEl.textContent = '请先登录';
      errorEl.classList.remove('hidden');
      return;
    }

    try {
      // getKeyHash 已从顶部静态导入，无需动态导入
      AppState.setDecrypted(key);
      await DataLoader.loadAll();
      
      // 检查是否成功解密（第一条笔记的title不是密文格式）
      const firstNote = AppState.allNotes[0];
      if (firstNote && firstNote._isEncrypted) {
        // 还是加密模式 → 解密失败
        AppState.isDecrypted = false;
        AppState.decryptKey = '';
        sessionStorage.removeItem('decryptKey');
        sessionStorage.removeItem('masterKey');
        errorEl.textContent = '解密密码错误，请重试';
        errorEl.classList.remove('hidden');
        input.value = '';
        input.focus();
        return;
      }

      overlay.remove();
      if (typeof onDecrypted === 'function') onDecrypted();
      if (_toastManager) _toastManager.show('解密成功，笔记内容已可见', 'success');
    } catch (e) {
      AppState.isDecrypted = false;
      AppState.decryptKey = '';
      sessionStorage.removeItem('decryptKey');
      errorEl.textContent = '解密失败: ' + (e.message || '密码错误');
      errorEl.classList.remove('hidden');
    }
  };

  confirmBtn.addEventListener('click', handleDecrypt);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleDecrypt();
  });
  input.focus();

  // 预填 masterKey
  const mk = sessionStorage.getItem('masterKey');
  if (mk && mk.length >= 8) {
    useMasterKeyCheck.checked = true;
    input.value = mk;
  }
}

export const DialogManager = {
  open(dialogId) {
    const d = Utils.getElement(dialogId);
    if (d) {
      d.style.display = 'flex';
      if (_logManager) _logManager.info(`打开${dialogId}`);
    }
  },
  closeAll(skipEditorSave) {
    const editorDialog = Utils.getElement('new-note-dialog');
    if (!skipEditorSave && editorDialog && editorDialog.style.display === 'flex') {
      const title = Utils.getElement('new-note-title');
      const editor = Utils.getElement('new-note-editor');
      if (title && editor && (title.value.trim() || editor.innerHTML.trim())) {
        if (_currentEditorState) _currentEditorState.save();
      }
    }
    window._editingNoteId = null;
    Utils.queryAll('.dialog-overlay').forEach(d => d.style.display = 'none');
    if (_logManager) _logManager.info('关闭所有对话框');
  },
  close(el) {
    const o = el.closest('.dialog-overlay');
    if (o) { o.style.display = 'none'; }
  }
};

export const ProfileManager = {
  openDialog() {
    const dialog = Utils.getElement('profile-dialog');
    if (!dialog) return;
    const uid = sessionStorage.getItem('userId') || '-';
    const usernameEl = Utils.getElement('profile-username');
    const userIdEl = Utils.getElement('profile-user-id');
    const userIdDisplayEl = Utils.getElement('profile-userid-display');
    const keyStatusEl = Utils.getElement('profile-key-status');
    if (usernameEl) usernameEl.textContent = '管理员';
    if (userIdEl) userIdEl.textContent = `用户ID: ${uid.substring(0, 8)}...`;
    if (userIdDisplayEl) userIdDisplayEl.textContent = uid;
    if (keyStatusEl) keyStatusEl.textContent = '已登录';
    dialog.style.display = 'flex';
    if (_logManager) _logManager.info('打开个人资料');
  }
};

export const LogoutManager = {
  async logout() {
    if (!confirm('确定要退出登录吗？')) return;
    sessionStorage.removeItem('userId');
    sessionStorage.removeItem('masterKey');
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('isLoggedIn');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('encrypted_notes_drafts');
    try { await clearAllCache(); } catch (e) {}
    if (_toastManager) _toastManager.show('已退出登录', 'info');
    if (_logManager) _logManager.info('用户退出登录');
    setTimeout(() => { window.location.href = '/modern/login.html'; }, 500);
  }
};