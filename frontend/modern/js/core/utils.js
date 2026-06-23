// core/utils.js — 工具函数模块
'use strict';

export const Utils = {
  getElement(id) { return document.getElementById(id); },
  queryAll(selector) { return document.querySelectorAll(selector); },
  query(selector) { return document.querySelector(selector); },
  toggleClass(el, className, force) { if (el) el.classList.toggle(className, force); },
  getAttr(el, attr) { return el ? el.getAttribute(attr) : null; },
  formatTime(date) { return date.toLocaleTimeString('zh-CN', { hour12: false }); },
  formatDateTime(date) { return date.toLocaleString('zh-CN', { hour12: false }); },
  timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return '刚刚';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  },
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// 时间管理器
export const TimeManager = {
  init() { this.update(); setInterval(() => this.update(), 1000); },
  update() { const el = Utils.getElement('current-time'); if (el) el.textContent = Utils.formatTime(new Date()); }
};

// 数字增长动画
export const CountAnimation = {
  DURATION: 1000,
  INTERVAL: 16,
  init() { Utils.queryAll('.animate-count').forEach(counter => { this.animate(counter); }); },
  animate(counter) {
    const target = parseInt(Utils.getAttr(counter, 'data-target')) || 0;
    const step = target / (this.DURATION / this.INTERVAL);
    let current = 0;
    const timer = setInterval(() => {
      current += step;
      if (current >= target) { counter.textContent = target; clearInterval(timer); }
      else { counter.textContent = Math.floor(current); }
    }, this.INTERVAL);
  }
};