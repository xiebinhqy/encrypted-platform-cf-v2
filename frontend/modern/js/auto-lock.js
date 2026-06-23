/**
 * 自动锁定模块
 * 
 * 功能：
 * 1. 用户闲置超时后自动锁定系统
 * 2. 锁定时清除内存中的主密钥
 * 3. 锁定前倒计时警告
 * 4. 支持用户自定义锁定时长
 * 5. 锁定页面覆盖整个视口
 */

import { getUserSettings, updateUserSettings } from '../../shared/api/settings.api.js';
import { getKeyHash, clearKeyCache } from '../../shared/crypto/index.js';

// 锁定超时选项（分钟），0 表示永不锁定
const LOCK_TIMEOUT_OPTIONS = [5, 10, 30, 0];
const LOCK_TIMEOUT_LABELS = {
  5: '5 分钟',
  10: '10 分钟',
  30: '30 分钟',
  0: '永不锁定'
};

const WARNING_SECONDS = 30; // 锁定前警告秒数

class AutoLockManager {
  constructor() {
    this.idleTimer = null;
    this.warningTimer = null;
    this.warningCountdown = null;
    this.timeoutMinutes = 10;
    this.isLocked = false;
    this.isWarning = false;
    this.remainingSeconds = 0;
    this.onLock = null;           // 锁定时回调（清除 masterKey）
    this.onUnlock = null;         // 解锁回调（通过 hash 验证）
    this.onSettingsChange = null;
    this._activityHandler = null;
    this._boundResetIdle = null;
    
    this._eventTypes = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
  }

  async init() {
    await this._loadSettings();
    this._boundResetIdle = this._resetIdleTimer.bind(this);
    this._startListening();
    this._startIdleTimer();
  }

  async _loadSettings() {
    try {
      const res = await getUserSettings();
      if (res && res.data && res.data.lockTimeout !== undefined) {
        this.timeoutMinutes = res.data.lockTimeout;
      }
    } catch (err) {
      console.warn('加载锁定设置失败，使用默认值:', err);
      this.timeoutMinutes = 10;
    }
  }

  _startListening() {
    this._eventTypes.forEach(eventType => {
      document.addEventListener(eventType, this._boundResetIdle, { passive: true });
    });
  }

  _stopListening() {
    this._eventTypes.forEach(eventType => {
      document.removeEventListener(eventType, this._boundResetIdle);
    });
  }

  _resetIdleTimer() {
    if (this.isLocked) return;
    if (this.isWarning) {
      this._cancelWarning();
    }
    this._startIdleTimer();
  }

  _startIdleTimer() {
    this._clearTimers();
    if (this.timeoutMinutes <= 0) return;
    const timeoutMs = this.timeoutMinutes * 60 * 1000;
    const warningStartMs = timeoutMs - WARNING_SECONDS * 1000;
    if (warningStartMs <= 0) {
      this.idleTimer = setTimeout(() => { this._lock(); }, timeoutMs);
    } else {
      this.idleTimer = setTimeout(() => { this._startWarning(); }, warningStartMs);
    }
  }

  _startWarning() {
    this.isWarning = true;
    this.remainingSeconds = WARNING_SECONDS;
    this._showWarningDialog();
    this.warningCountdown = setInterval(() => {
      this.remainingSeconds--;
      this._updateWarningCountdown();
      if (this.remainingSeconds <= 0) {
        this._lock();
      }
    }, 1000);
  }

  _cancelWarning() {
    this.isWarning = false;
    this.remainingSeconds = 0;
    if (this.warningCountdown) {
      clearInterval(this.warningCountdown);
      this.warningCountdown = null;
    }
    this._hideWarningDialog();
  }

  _clearTimers() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.warningCountdown) {
      clearInterval(this.warningCountdown);
      this.warningCountdown = null;
    }
  }

  async _lock() {
    if (this.isLocked) return;
    this._clearTimers();
    this.isWarning = false;
    this._hideWarningDialog();
    this.isLocked = true;
    // 设置锁定标志到 sessionStorage，防止刷新页面后绕过锁定
    sessionStorage.setItem('isLocked', 'true');
    // 清除密钥缓存，防止锁定期间密钥仍可用于解密
    clearKeyCache();
    if (this.onLock) {
      this.onLock(); // 清除 masterKey
    }
    this._showLockScreen();
  }

  async unlock(masterKeyInput) {
    // 使用 onUnlock 回调进行 hash 验证
    if (this.onUnlock) {
      const valid = await this.onUnlock(masterKeyInput);
      if (!valid) {
        return false;
      }
    }
    this.isLocked = false;
    // 清除锁定标志
    sessionStorage.removeItem('isLocked');
    this._hideLockScreen();
    this._startIdleTimer();
    return true;
  }

  _immediateLock() {
    if (this.isLocked) return;
    this._clearTimers();
    this.isWarning = false;
    this._hideWarningDialog();
    this.isLocked = true;
    // 设置锁定标志到 sessionStorage，防止刷新页面后绕过锁定
    sessionStorage.setItem('isLocked', 'true');
    // 清除密钥缓存，防止锁定期间密钥仍可用于解密
    clearKeyCache();
    if (this.onLock) {
      this.onLock();
    }
    this._showLockScreen();
  }

  async updateTimeout(minutes) {
    this.timeoutMinutes = minutes;
    try {
      await updateUserSettings({ lockTimeout: minutes });
    } catch (err) {
      console.error('保存锁定设置失败:', err);
    }
    if (!this.isLocked) {
      this._resetIdleTimer();
    }
    if (this.onSettingsChange) {
      this.onSettingsChange(minutes);
    }
  }

  getTimeout() {
    return this.timeoutMinutes;
  }

  _showWarningDialog() {
    let dialog = document.getElementById('auto-lock-warning');
    if (!dialog) {
      dialog = document.createElement('div');
      dialog.id = 'auto-lock-warning';
      dialog.className = 'auto-lock-warning';
      dialog.innerHTML = `
        <div class="auto-lock-warning-content">
          <div class="auto-lock-warning-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <div class="auto-lock-warning-text">
            <h4>系统即将锁定</h4>
            <p>由于长时间未操作，系统将在 <span id="lock-countdown">${WARNING_SECONDS}</span> 秒后自动锁定</p>
            <p class="auto-lock-warning-hint">移动鼠标或按键可取消锁定</p>
          </div>
          <div class="auto-lock-warning-progress">
            <div class="auto-lock-warning-progress-bar" id="lock-progress-bar"></div>
          </div>
        </div>
      `;
      document.body.appendChild(dialog);
    }
    const progressBar = document.getElementById('lock-progress-bar');
    if (progressBar) {
      progressBar.style.transition = 'none';
      progressBar.style.width = '100%';
      progressBar.offsetHeight;
      progressBar.style.transition = `width ${WARNING_SECONDS}s linear`;
      progressBar.style.width = '0%';
    }
    requestAnimationFrame(() => {
      dialog.classList.add('show');
    });
  }

  _updateWarningCountdown() {
    const countdownEl = document.getElementById('lock-countdown');
    if (countdownEl) {
      countdownEl.textContent = this.remainingSeconds;
    }
  }

  _hideWarningDialog() {
    const dialog = document.getElementById('auto-lock-warning');
    if (dialog) {
      dialog.classList.remove('show');
      setTimeout(() => { dialog.remove(); }, 300);
    }
  }

  _showLockScreen() {
    let lockScreen = document.getElementById('auto-lock-screen');
    if (!lockScreen) {
      lockScreen = document.createElement('div');
      lockScreen.id = 'auto-lock-screen';
      lockScreen.style.cssText = 'position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;background:#0a0f1d!important;z-index:2147483647!important;display:flex!important;align-items:center!important;justify-content:center!important;margin:0!important;padding:0!important;overflow:hidden!important;';
      lockScreen.innerHTML = `
        <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;padding:2rem;max-width:28rem;width:92%;margin:0 1rem;position:relative;z-index:2147483648;">
          <div style="text-align:center;margin-bottom:2rem;">
            <div style="font-size:4rem;margin-bottom:1rem;color:#6366f1"><i class="fa-solid fa-lock"></i></div>
            <h2 style="color:white;font-size:1.5rem;font-weight:700;margin-bottom:0.5rem;">系统已锁定</h2>
            <p style="color:#94a3b8;">由于长时间无操作，系统已自动锁定，请输入主密钥解锁</p>
          </div>
          <input type="password" id="auto-lock-masterkey-input" placeholder="输入主密钥解锁" 
                 style="width:100%;padding:0.75rem;border-radius:0.5rem;margin-bottom:1rem;background:#0f172a;border:1px solid #334155;color:#e2e8f0;outline:none;box-sizing:border-box;">
          <button id="auto-lock-unlock-btn" style="width:100%;padding:0.75rem;border-radius:0.5rem;font-weight:500;background:#4f46e5;color:white;border:none;cursor:pointer;font-size:1rem;">
            <i class="fa-solid fa-unlock" style="margin-right:0.5rem;"></i> 解锁
          </button>
          <div id="auto-lock-error" style="display:none;color:#f87171;font-size:0.875rem;text-align:center;margin-top:1rem;"></div>
        </div>
      `;
      document.body.appendChild(lockScreen);
      
      const input = document.getElementById('auto-lock-masterkey-input');
      const btn = document.getElementById('auto-lock-unlock-btn');
      
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._handleUnlock();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          this._handleUnlock();
        }
      });
    }
    
    requestAnimationFrame(() => {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      setTimeout(() => {
        const input = document.getElementById('auto-lock-masterkey-input');
        if (input) input.focus();
      }, 100);
    });
  }

  _hideLockScreen() {
    const lockScreen = document.getElementById('auto-lock-screen');
    if (lockScreen) {
      lockScreen.remove();
    }
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
  }

  async _handleUnlock() {
    const input = document.getElementById('auto-lock-masterkey-input');
    const errorEl = document.getElementById('auto-lock-error');
    const btn = document.getElementById('auto-lock-unlock-btn');
    
    if (!input) return;
    
    const masterKeyInput = input.value.trim();
    if (!masterKeyInput) {
      this._showUnlockError('请输入主密钥');
      return;
    }
    
    if (btn) btn.disabled = true;
    input.disabled = true;
    
    try {
      const success = await this.unlock(masterKeyInput);
      if (!success) {
        this._showUnlockError('主密钥错误，请重试');
        input.value = '';
        input.focus();
      }
    } catch (err) {
      this._showUnlockError('解锁失败: ' + (err.message || '未知错误'));
    } finally {
      if (btn) btn.disabled = false;
      input.disabled = false;
    }
  }

  _showUnlockError(message) {
    const errorEl = document.getElementById('auto-lock-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      errorEl.classList.add('shake');
      setTimeout(() => errorEl.classList.remove('shake'), 500);
    }
  }

  destroy() {
    this._stopListening();
    this._clearTimers();
    this._hideWarningDialog();
    this._hideLockScreen();
    this.isLocked = false;
    this.isWarning = false;
  }
}

const autoLockManager = new AutoLockManager();

export { autoLockManager, LOCK_TIMEOUT_OPTIONS, LOCK_TIMEOUT_LABELS };
export default autoLockManager;