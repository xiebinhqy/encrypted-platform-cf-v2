// ============================================================
// v2.1.0-modern 现代版UI基础结构
// components.js — 通用 UI 组件（弹窗、通知）
// ============================================================

'use strict';

// ---------- 通知系统 ----------
const Toast = {
  /**
   * 显示提示通知
   * @param {string} message - 提示内容
   * @param {'success'|'error'|'warning'|'info'} type - 提示类型
   * @param {number} duration - 自动关闭时间（毫秒），0 表示不自动关闭
   */
  show: function (message, type, duration) {
    type = type || 'info';
    duration = duration !== undefined ? duration : 3000;

    // 选择图标和颜色
    var iconMap = {
      success: 'fa-check-circle',
      error: 'fa-times-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };
    var colorMap = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#6366f1'
    };
    var icon = iconMap[type] || iconMap.info;
    var color = colorMap[type] || colorMap.info;

    // 创建通知元素
    var toast = document.createElement('div');
    toast.className = 'glass-effect rounded-lg p-4 shadow-lg custom-alert';
    toast.style.borderLeft = '4px solid ' + color;
    toast.innerHTML =
      '<div class="flex items-center space-x-3">' +
        '<i class="fa-solid ' + icon + '" style="color:' + color + '"></i>' +
        '<p class="text-white text-sm">' + this._escapeHtml(message) + '</p>' +
      '</div>';

    document.body.appendChild(toast);

    // 自动关闭
    if (duration > 0) {
      setTimeout(function () {
        toast.classList.add('fade-out');
        setTimeout(function () {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        }, 300);
      }, duration);
    }

    return toast;
  },

  /**
   * 成功提示
   */
  success: function (message, duration) {
    return this.show(message, 'success', duration);
  },

  /**
   * 错误提示
   */
  error: function (message, duration) {
    return this.show(message, 'error', duration);
  },

  /**
   * 警告提示
   */
  warning: function (message, duration) {
    return this.show(message, 'warning', duration);
  },

  /**
   * 信息提示
   */
  info: function (message, duration) {
    return this.show(message, 'info', duration);
  },

  /**
   * 移除指定通知
   */
  remove: function (toast) {
    if (toast && toast.parentNode) {
      toast.classList.add('fade-out');
      setTimeout(function () {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }
  },

  /**
   * HTML 转义（防 XSS）
   */
  _escapeHtml: function (text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }
};

// ---------- 弹窗系统 ----------
const Modal = {
  /**
   * 打开一个模态弹窗
   * @param {string} id - 弹窗元素的 ID
   */
  open: function (id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  /**
   * 关闭一个模态弹窗
   * @param {string} id - 弹窗元素的 ID
   */
  close: function (id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  },

  /**
   * 初始化弹窗系统：绑定关闭按钮和点击遮罩关闭
   * @param {string|string[]} ids - 弹窗 ID 或 ID 数组
   */
  init: function (ids) {
    var self = this;

    // 如果传入单个 ID，转换为数组
    if (typeof ids === 'string') {
      ids = [ids];
    }

    ids.forEach(function (id) {
      var modal = document.getElementById(id);
      if (!modal) {
        console.warn('[Modal] 未找到弹窗元素: #' + id);
        return;
      }

      // 点击关闭按钮
      var closeButtons = modal.querySelectorAll('.close-modal');
      closeButtons.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          self.close(id);
        });
      });

      // 点击遮罩（弹窗外区域）关闭
      modal.addEventListener('click', function (e) {
        if (e.target === modal) {
          self.close(id);
        }
      });

      // ESC 键关闭
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          if (!modal.classList.contains('hidden')) {
            self.close(id);
          }
        }
      });
    });
  }
};

// ============================================================
// 导出（当使用 ES Module 时）
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Toast: Toast, Modal: Modal };
}