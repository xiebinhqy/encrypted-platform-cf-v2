// services/loading-overlay.js — 加载遮罩管理
'use strict';

export const LoadingOverlay = {
  show(text, subtext) {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    const textEl = overlay.querySelector('.loader-text');
    const subtextEl = overlay.querySelector('.loader-subtext');
    if (textEl && text) textEl.textContent = text;
    if (subtextEl && subtext) subtextEl.textContent = subtext;
    overlay.classList.remove('hidden');
  },
  hide() {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
  }
};