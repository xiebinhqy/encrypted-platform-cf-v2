// ============================================================
// v6.1.0 — 登录页面 JavaScript 逻辑（ES Module）
// 重构版：保持所有功能和样式不变，优化代码结构
// ============================================================

'use strict';

// ====================== 共享模块导入 ======================
import { getKeyHash, hashPassword } from "../../shared/crypto/index.js";
import { API_BASE, loginUser, registerUser, resetPassword, verifyRecoveryCode, resetPasswordViaRecovery } from "../../shared/api/index.js";
import { clearAllCache } from "../../shared/utils/note-cache.js";

// ============================================================
// 工具函数模块
// ============================================================
const Utils = {
  /**
   * 生成16位恢复码（格式：XXXX-XXXX-XXXX-XXXX）
   */
  generateRecoveryCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const segments = Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    );
    return segments.join('-');
  },

  /**
   * Toast 提示框
   */
  showAlert(message, type = 'info') {
    const existing = document.querySelector('.custom-alert');
    if (existing) existing.remove();

    const alert = document.createElement('div');
    alert.className = `custom-alert glass-effect rounded-lg p-4 shadow-lg max-w-sm transform transition-all duration-300 ${
      type === 'error' ? 'border-red-500/30' : 
      type === 'success' ? 'border-emerald-500/30' : 
      'border-indigo-500/30'
    }`;

    const iconMap = {
      error: { icon: 'circle-exclamation', color: 'text-red-400' },
      success: { icon: 'circle-check', color: 'text-emerald-400' },
      info: { icon: 'info-circle', color: 'text-indigo-400' }
    };
    const { icon, color } = iconMap[type] || iconMap.info;

    alert.innerHTML = `
      <div class="flex items-start space-x-3">
        <i class="fa-solid fa-${icon} ${color} text-lg mt-0.5"></i>
        <div class="flex-1">
          <p class="text-white text-sm">${message}</p>
        </div>
        <button class="text-gray-400 hover:text-white" onclick="this.parentElement.parentElement.remove()">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
    `;

    document.body.appendChild(alert);

    setTimeout(() => {
      if (alert.parentElement) {
        alert.style.opacity = '0';
        alert.style.transform = 'translateX(100%)';
        setTimeout(() => alert.remove(), 300);
      }
    }, 5000);
  },

  /**
   * 显示模态弹窗
   */
  showModal(modal) {
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  /**
   * 隐藏所有模态弹窗
   */
  hideAllModals() {
    document.querySelectorAll('[id$="-modal"]').forEach(m => m.classList.add('hidden'));
    document.body.style.overflow = '';
  },

  /**
   * 初始化卡片入场动画
   */
  initCardAnimations() {
    document.querySelectorAll('.card-transition').forEach((card, index) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      setTimeout(() => {
        card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, 100 + (index * 100));
    });
  }
};

// ============================================================
// 认证核心模块
// ============================================================
const LoginCore = {
  masterKey: '',
  userId: '',

  /**
   * 登录或注册
   */
  async loginOrRegister() {
    const key = document.getElementById('master-key').value.trim();
    if (key.length < 8) {
      Utils.showAlert('主密钥至少需要8位', 'error');
      return;
    }

    this.masterKey = key;
    const keyHash = await getKeyHash(key);

    try {
      const loginRes = await loginUser(API_BASE, keyHash);

      if (loginRes.ok) {
        const data = await loginRes.json();
        this.userId = data.userId;
        this.authToken = data.token || null; // JWT Token
        this._onLoginSuccess();
      } else if (loginRes.status === 401 || loginRes.status === 404) {
        // 用户不存在是正常流程——新用户首次登录会进入注册
        console.log('🔑 用户不存在，正在为您创建新账户...');
        await this._handleRegistration(keyHash);
      } else {
        const err = await loginRes.json();
        Utils.showAlert(err.err || '登录失败', 'error');
      }
    } catch (e) {
      console.error(e);
      Utils.showAlert('网络错误，请检查网络连接', 'error');
    }
  },

  /**
   * 处理新用户注册
   */
  async _handleRegistration(keyHash) {
    const recoveryCode = Utils.generateRecoveryCode();
    const recoveryCodeHash = await getKeyHash(recoveryCode);
    const registerRes = await registerUser(API_BASE, keyHash, recoveryCodeHash);

    if (registerRes.ok) {
      const data = await registerRes.json();
      this.userId = data.userId;
      this.authToken = data.token || null; // JWT Token
      // 🔐 先保存登录态但不跳转，显示恢复码让用户保存
      sessionStorage.setItem('userId', this.userId);
      sessionStorage.setItem('masterKey', this.masterKey);
      if (this.authToken) {
        sessionStorage.setItem('authToken', this.authToken);
      }
      // 🔐 清除旧缓存，防止残留数据污染（BUG-009 + BUG-020）
      try { await clearAllCache(); } catch (e) {}
      // 清除 localStorage 中的草稿和编辑器暂存状态
      try { localStorage.removeItem('encrypted_notes_drafts'); } catch (e) {}
      try { localStorage.removeItem('encrypted_notes_current_editor'); } catch (e) {}
      // 显示恢复码弹窗 → 用户确认后弹出设置密码弹窗
      this._showRecoveryCodeModal(recoveryCode, () => {
        this._showSetupPasswordModal(() => {
          // 设置完成后跳转到主页（加密模式，decryptKey 不存 sessionStorage）
          window.location.href = '/modern/index.html';
        });
      });
    } else {
      const err = await registerRes.json();
      Utils.showAlert(err.err || '注册失败', 'error');
    }
  },

  /**
   * 登录成功处理
   */
  async _onLoginSuccess() {
    sessionStorage.setItem('userId', this.userId);
    sessionStorage.setItem('masterKey', this.masterKey);
    if (this.authToken) {
      sessionStorage.setItem('authToken', this.authToken);
    }
    // 🔐 清除旧缓存，防止残留数据污染（BUG-009 + BUG-020）
    try { await clearAllCache(); } catch (e) {}
    // 清除 localStorage 中的草稿和编辑器暂存状态
    try { localStorage.removeItem('encrypted_notes_drafts'); } catch (e) {}
    try { localStorage.removeItem('encrypted_notes_current_editor'); } catch (e) {}
    Utils.showAlert('验证成功！正在为你跳转...', 'success');
    setTimeout(() => {
      window.location.href = '/modern/index.html';
    }, 1000);
  },

  /**
   * 使用恢复码重置主密钥（v2 一次性恢复码流程）
   * 步骤：
   *   1. verifyRecoveryCode 验证恢复码（后端标记为已使用）
   *   2. 验证成功 → 生成新恢复码显示给用户
   *   3. 用户确认保存新恢复码 → resetPasswordViaRecovery 重置密码
   *   4. 重置后处于未解密状态，需用新密码重新登录
   */
  async resetWithRecoveryCode() {
    const recoveryCode = document.getElementById('recoveryCode').value.trim();
    const newKey = document.getElementById('newMasterKey').value;

    if (!recoveryCode) {
      Utils.showAlert('请输入恢复码', 'error');
      return;
    }
    if (newKey.length < 8) {
      Utils.showAlert('新主密钥至少需要8位', 'error');
      return;
    }

    const newKeyHash = await getKeyHash(newKey);
    const recoveryCodeHash = await getKeyHash(recoveryCode);

    try {
      // 第 1 步：验证恢复码（一次性）
      const verifyRes = await verifyRecoveryCode(API_BASE, recoveryCodeHash);
      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        Utils.showAlert(err.err || '恢复码无效或已被使用', 'error');
        return;
      }
      const verifyData = await verifyRes.json();
      const userId = verifyData.userId;

      // 第 2 步：生成新恢复码
      const newRecoveryCode = Utils.generateRecoveryCode();
      const newRecoveryCodeHash = await getKeyHash(newRecoveryCode);

      // 第 3 步：显示新恢复码弹窗，用户确认后重置密码
      this._showRecoveryCodeModal(newRecoveryCode, async () => {
        try {
          const resetRes = await resetPasswordViaRecovery(API_BASE, userId, newKeyHash, newRecoveryCodeHash);
          if (resetRes.ok) {
            Utils.showAlert('密钥重置成功，请使用新密钥登录', 'success');
            Utils.hideAllModals();
            document.getElementById('recoveryCode').value = '';
            document.getElementById('newMasterKey').value = '';
            document.getElementById('master-key').focus();
          } else {
            const err = await resetRes.json();
            Utils.showAlert(err.err || '重置失败', 'error');
          }
        } catch (e) {
          console.error(e);
          Utils.showAlert('网络错误', 'error');
        }
      });
    } catch (e) {
      console.error(e);
      Utils.showAlert('网络错误', 'error');
    }
  },

  /**
   * 显示恢复码弹窗
   * @param {string} recoveryCode - 恢复码
   * @param {Function} onConfirm - 用户点击"我已保存"后的回调
   */
  _showRecoveryCodeModal(recoveryCode, onConfirm) {
    const existing = document.getElementById('recoveryCodeDisplayModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'recoveryCodeDisplayModal';
    modal.className = 'fixed inset-0 bg-dark/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4';

    modal.innerHTML = `
      <div class="glass-effect rounded-2xl p-6 w-full max-w-md modal-enter">
        <div class="text-center mb-6">
          <div class="text-5xl mb-4 text-warning"><i class="fa-solid fa-shield-halved"></i></div>
          <h3 class="text-xl font-bold text-white mb-2">⚠️ 请立即保存恢复码</h3>
          <p class="text-gray-300 text-sm">恢复码是找回主密钥的唯一方式，请务必妥善保存！</p>
        </div>
        <div class="bg-dark border border-dark-lighter p-4 rounded-lg mb-4 text-center">
          <code class="text-lg font-mono text-indigo-400 break-all">${recoveryCode}</code>
        </div>
        <p class="text-xs text-gray-400 text-center mb-6">此恢复码仅显示一次，关闭后将无法再次查看</p>
        <button id="btnRecoverySaved"
                class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-medium transition-all touch-friendly">
          <i class="fa-solid fa-check mr-2"></i> 我已保存恢复码
        </button>
      </div>
    `;

    document.body.appendChild(modal);
    document.getElementById('btnRecoverySaved').addEventListener('click', () => {
      modal.remove();
      if (typeof onConfirm === 'function') {
        onConfirm();
      }
    });
  },

  /**
   * 显示设置密码弹窗（注册后第二步）
   * 用户需设置解密密码（AES-GCM 解密）和锁屏密码（Ctrl+L 解锁）
   * @param {Function} onConfirm - 用户设置完成后的回调
   */
  _showSetupPasswordModal(onConfirm) {
    const existing = document.getElementById('setupPasswordModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'setupPasswordModal';
    modal.className = 'fixed inset-0 bg-dark/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4';

    modal.innerHTML = `
      <div class="glass-effect rounded-2xl p-6 w-full max-w-md modal-enter">
        <div class="text-center mb-6">
          <div class="text-5xl mb-4 text-indigo-400"><i class="fa-solid fa-key"></i></div>
          <h3 class="text-xl font-bold text-white mb-2">🔐 设置安全密码</h3>
          <p class="text-gray-300 text-sm">请设置解密密码和锁屏密码，用于保护您的笔记内容</p>
        </div>

        <div class="mb-4">
          <label class="block text-sm text-gray-300 mb-1">解密密码 <span class="text-red-400">*</span></label>
          <p class="text-xs text-gray-500 mb-2">用于解密笔记内容，每次登录后需输入此密码才能查看明文</p>
          <input type="password" id="setupDecryptKey" placeholder="输入解密密码（至少8位）"
                 class="w-full px-3 py-2.5 rounded-lg bg-dark border border-dark-lighter text-white outline-none focus:border-indigo-500 transition-colors">
          <div class="flex items-center mt-2">
            <input type="checkbox" id="setupDecryptKeyToggle" class="rounded bg-dark-lighter border-gray-600 text-indigo-600 focus:ring-indigo-500">
            <label for="setupDecryptKeyToggle" class="text-xs text-gray-400 ml-2">显示密码</label>
          </div>
        </div>

        <div class="mb-6">
          <label class="block text-sm text-gray-300 mb-1">锁屏密码 <span class="text-red-400">*</span></label>
          <p class="text-xs text-gray-500 mb-2">用于 Ctrl+L 锁定后解锁，快捷恢复解密模式</p>
          <input type="password" id="setupLockPassword" placeholder="输入锁屏密码（至少4位）"
                 class="w-full px-3 py-2.5 rounded-lg bg-dark border border-dark-lighter text-white outline-none focus:border-indigo-500 transition-colors">
          <div class="flex items-center mt-2">
            <input type="checkbox" id="lockSameAsDecrypt" checked
                   class="rounded bg-dark-lighter border-gray-600 text-indigo-600 focus:ring-indigo-500">
            <label for="lockSameAsDecrypt" class="text-xs text-gray-400 ml-2">同解密密码</label>
          </div>
        </div>

        <button id="btnConfirmPassword"
                class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-medium transition-all touch-friendly">
          <i class="fa-solid fa-check mr-2"></i> 确认并进入
        </button>
        <p id="setupPasswordError" class="text-xs text-red-400 text-center mt-2 hidden"></p>
      </div>
    `;

    document.body.appendChild(modal);

    // 同解密密码勾选联动
    const decryptInput = document.getElementById('setupDecryptKey');
    const lockInput = document.getElementById('setupLockPassword');
    const sameCheckbox = document.getElementById('lockSameAsDecrypt');

    sameCheckbox.addEventListener('change', () => {
      if (sameCheckbox.checked) {
        lockInput.value = decryptInput.value;
        lockInput.disabled = true;
        lockInput.classList.add('opacity-50');
      } else {
        lockInput.disabled = false;
        lockInput.classList.remove('opacity-50');
      }
    });

    decryptInput.addEventListener('input', () => {
      if (sameCheckbox.checked) {
        lockInput.value = decryptInput.value;
      }
    });

    // 显示/隐藏密码
    document.getElementById('setupDecryptKeyToggle').addEventListener('change', function() {
      decryptInput.type = this.checked ? 'text' : 'password';
    });

    document.getElementById('btnConfirmPassword').addEventListener('click', async () => {
      const decryptKey = decryptInput.value.trim();
      const lockPassword = lockInput.value.trim();
      const errorEl = document.getElementById('setupPasswordError');

      if (decryptKey.length < 8) {
        errorEl.textContent = '解密密码至少需要8位';
        errorEl.classList.remove('hidden');
        return;
      }
      if (lockPassword.length < 4) {
        errorEl.textContent = '锁屏密码至少需要4位';
        errorEl.classList.remove('hidden');
        return;
      }

      // 锁屏密码 hash 后存储（用于 Ctrl+L 解锁验证）
      const lockHash = await hashPassword(lockPassword);
      sessionStorage.setItem('lockPassword', lockHash);
      // 解密密码不存 sessionStorage！用户将在主页点击"解密"按钮后手动输入

      modal.remove();
      if (typeof onConfirm === 'function') {
        onConfirm();
      }
    });
  }
};

// ============================================================
// 导航功能模块
// ============================================================
const NavFeature = {
  /**
   * 初始化所有模态弹窗的事件绑定
   */
  initModals() {
    const modalConfigs = [
      { btnId: 'app-menu-btn', modalId: 'app-modal' },
      { btnId: 'notification-btn', modalId: 'notification-modal' },
      { btnId: 'settings-btn', modalId: 'settings-modal' },
      { btnId: 'help-btn', modalId: 'help-modal' }
    ];

    modalConfigs.forEach(({ btnId, modalId }) => {
      const btn = document.getElementById(btnId);
      const modal = document.getElementById(modalId);
      if (btn && modal) btn.addEventListener('click', () => Utils.showModal(modal));
    });

    // 关闭按钮
    document.querySelectorAll('.close-modal').forEach(btn =>
      btn.addEventListener('click', Utils.hideAllModals)
    );

    // 点击背景关闭
    document.querySelectorAll('[id$="-modal"]').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) Utils.hideAllModals();
      });
    });

    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const visibleModal = document.querySelector('[id$="-modal"]:not(.hidden)');
        if (visibleModal) Utils.hideAllModals();
      }
    });
  },

  /**
   * 初始化通知标记全部已读
   */
  initNotificationMarkAllRead() {
    const markAll = document.getElementById('mark-all-read');
    if (!markAll) return;

    markAll.addEventListener('click', () => {
      document.querySelectorAll('.border-l-2.border-indigo-500').forEach(item => {
        item.classList.remove('border-l-2', 'border-indigo-500');
        item.classList.add('opacity-70');
      });
      markAll.textContent = '已全部标记为已读';
      markAll.classList.add('opacity-70');
      const badge = document.querySelector('.notification-badge');
      if (badge) badge.style.display = 'none';
      Utils.showAlert('所有通知已标记为已读', 'success');
    });
  },

  /**
   * 初始化主题切换
   */
  initThemeSwitcher() {
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.theme-btn').forEach(b => {
          b.classList.remove('active', 'border-indigo-500');
          b.classList.add('border-transparent');
        });
        btn.classList.add('active', 'border-indigo-500');
        btn.classList.remove('border-transparent');
        Utils.showAlert('已切换主题', 'success');
      });
    });
  }
};

// ============================================================
// 密码输入交互模块
// ============================================================
const PasswordUI = {
  /**
   * 初始化密码显示/隐藏切换
   */
  initToggle() {
    const toggleBtn = document.getElementById('toggle-password');
    const input = document.getElementById('master-key');
    if (!toggleBtn || !input) return;

    toggleBtn.addEventListener('click', () => {
      const isPassword = input.getAttribute('type') === 'password';
      input.setAttribute('type', isPassword ? 'text' : 'password');
      const icon = toggleBtn.querySelector('i');
      icon.classList.toggle('fa-eye');
      icon.classList.toggle('fa-eye-slash');
    });
  },

  /**
   * 初始化密码强度检测
   */
  initStrengthDetection() {
    const input = document.getElementById('master-key');
    const bar = document.getElementById('strength-bar');
    const text = document.getElementById('strength-text');
    const btn = document.getElementById('start-btn');
    if (!input || !bar || !text || !btn) return;

    input.addEventListener('input', function() {
      const v = this.value;
      const strength = PasswordUI._calcStrength(v);
      const { width, color, label } = PasswordUI._getStrengthInfo(strength);

      bar.className = `h-full ${color} rounded-full`;
      bar.style.width = width;
      text.textContent = label;

      btn.disabled = v.length < 8;
      btn.classList.toggle('opacity-50', v.length < 8);
      btn.classList.toggle('cursor-not-allowed', v.length < 8);
    });
  },

  /**
   * 计算密码强度得分
   */
  _calcStrength(value) {
    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[a-z]/.test(value)) score += 1;
    if (/[A-Z]/.test(value)) score += 1;
    if (/[0-9]/.test(value)) score += 1;
    if (/[^a-zA-Z0-9]/.test(value)) score += 1;
    return score;
  },

  /**
   * 根据强度得分返回样式信息
   */
  _getStrengthInfo(score) {
    switch (score) {
      case 0: case 1: return { width: '25%', color: 'bg-red-500', label: '弱' };
      case 2: case 3: return { width: '50%', color: 'bg-yellow-500', label: '中' };
      case 4: return { width: '75%', color: 'bg-blue-500', label: '强' };
      default: return { width: '100%', color: 'bg-emerald-500', label: '非常强' };
    }
  }
};

// ============================================================
// 快捷键模块
// ============================================================
const Shortcuts = {
  init() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        Utils.showAlert('快捷键: 回车=提交 | Ctrl+/=帮助 | ESC=关闭弹窗', 'info');
      }
    });
  }
};

// ============================================================
// 版本切换（全局方法，供 onclick 调用）
// ============================================================
function switchToClassic() {
  // 从现代版切换到经典版，保留登录状态（如果已登录则跳转到经典笔记页面）
  const savedUserId = sessionStorage.getItem('userId');
  const savedMasterKey = sessionStorage.getItem('masterKey');
  if (savedUserId && savedMasterKey) {
    sessionStorage.setItem('userId', savedUserId);
    sessionStorage.setItem('masterKey', savedMasterKey);
    window.location.href = '/classic';
  } else {
    sessionStorage.clear();
    window.location.href = '/classic';
  }
}
window.switchToClassic = switchToClassic;

// ============================================================
// DOM 初始化
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // --- 密码输入交互 ---
  PasswordUI.initToggle();
  PasswordUI.initStrengthDetection();

  // --- 主登录按钮 ---
  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => LoginCore.loginOrRegister());
  }

  // --- 主密钥输入框回车提交 ---
  const masterKeyInput = document.getElementById('master-key');
  if (masterKeyInput) {
    masterKeyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && masterKeyInput.value.length >= 8) {
        e.preventDefault();
        LoginCore.loginOrRegister();
      }
    });
    masterKeyInput.focus();
  }

  // --- 恢复码弹窗 ---
  const recoveryBtn = document.getElementById('recovery-code-btn');
  const recoveryModal = document.getElementById('recovery-modal');
  if (recoveryBtn && recoveryModal) {
    recoveryBtn.addEventListener('click', () => Utils.showModal(recoveryModal));
  }

  // --- 恢复码重置按钮 ---
  const resetBtn = document.getElementById('btnResetRecovery');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => LoginCore.resetWithRecoveryCode());
  }

  // --- 恢复码弹窗内回车提交 ---
  document.querySelectorAll('#recoveryCode, #newMasterKey').forEach(el => {
    if (el) {
      el.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          LoginCore.resetWithRecoveryCode();
        }
      });
    }
  });

  // --- 登录提示关闭 ---
  const closeTip = document.getElementById('close-tip');
  if (closeTip) {
    closeTip.addEventListener('click', () => {
      document.getElementById('login-tip')?.classList.add('hidden');
    });
  }

  // --- 导航功能 ---
  NavFeature.initModals();
  NavFeature.initNotificationMarkAllRead();
  NavFeature.initThemeSwitcher();

  // --- 卡片动画 ---
  Utils.initCardAnimations();

  // --- 快捷键 ---
  Shortcuts.init();

  // --- 已登录状态提示 ---
  if (sessionStorage.getItem('isLoggedIn') === 'true' || localStorage.getItem('isLoggedIn') === 'true') {
    const tip = document.getElementById('login-tip');
    if (tip) tip.classList.remove('hidden');
  }

  // --- 控制台输出 ---
  console.log('%c🔐 加密笔记 - 登录页面', 'color: #6366f1; font-size: 16px; font-weight: bold;');
  console.log('%c版本: v6.1.0 (重构版)', 'color: #8b5cf6;');
});