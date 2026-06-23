// components/toast.js — Toast 提示组件
'use strict';

const CONFIG = {
  TOAST_DURATION: 1200,
  ALERT_STYLES: {
    error: { icon: 'circle-exclamation', color: 'text-red-400' },
    success: { icon: 'circle-check', color: 'text-emerald-400' },
    info: { icon: 'info-circle', color: 'text-indigo-400' }
  }
};

export const ToastManager = {
  show(message, type = 'info') {
    this.removeExisting();
    const alert = this.createAlert(message, type);
    document.body.appendChild(alert);
    setTimeout(() => this.autoRemove(alert), CONFIG.TOAST_DURATION);
  },
  removeExisting() {
    const existing = document.querySelector('.custom-alert');
    if (existing) existing.remove();
  },
  createAlert(message, type) {
    const styleConfig = CONFIG.ALERT_STYLES[type] || CONFIG.ALERT_STYLES.info;
    const borderClass = { error: 'border-red-500/30', success: 'border-emerald-500/30', info: 'border-indigo-500/30' }[type] || 'border-indigo-500/30';
    const alert = document.createElement('div');
    alert.className = `custom-alert glass-effect rounded-lg p-4 shadow-lg max-w-sm transform transition-all duration-300 ${borderClass}`;
    alert.innerHTML = `<div class="flex items-start space-x-3"><i class="fa-solid fa-${styleConfig.icon} ${styleConfig.color} text-lg mt-0.5"></i><div class="flex-1"><p class="text-white text-sm">${message}</p></div><button class="text-gray-400 hover:text-white" onclick="this.parentElement.parentElement.remove()"><i class="fa-solid fa-times"></i></button></div>`;
    return alert;
  },
  autoRemove(alert) {
    if (alert.parentElement) {
      alert.classList.add('toast-fade-out');
      setTimeout(() => alert.remove(), 300);
    }
  }
};