// services/event-logger.js — 事件日志系统
'use strict';

import { API_BASE } from "../../../shared/api/index.js";
import AppState from "../core/state.js";
import { Utils } from "../core/utils.js";

const CONFIG = {
  LOG_TYPES: { SUCCESS: 'log-success', WARNING: 'log-warning', ERROR: 'log-error', INFO: 'log-info' },
  MAX_LOG_ENTRIES: 50
};

// 实时日志管理器（独立于事件系统，避免循环依赖）
export const LogManager = {
  add(type, message) {
    const container = Utils.getElement('real-time-log');
    if (!container) return;
    const time = Utils.formatTime(new Date());
    const typeClass = CONFIG.LOG_TYPES[type] || CONFIG.LOG_TYPES.INFO;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">[${time}]</span><span class="${typeClass}">${type}</span><span> ${message}</span>`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
    if (container.children.length > CONFIG.MAX_LOG_ENTRIES) container.removeChild(container.firstChild);
  },
  info(m) { this.add('INFO', m); },
  success(m) { this.add('SUCCESS', m); },
  warning(m) { this.add('WARNING', m); },
  error(m) { this.add('ERROR', m); }
};

// 事件日志持久化服务
const EventPersistence = {
  _pendingEvents: [],
  _flushTimer: null,

  async loadHistory() {
    const state = AppState;
    try {
      const token = sessionStorage.getItem('authToken');
      const headers = { 'X-User-Id': state.userId };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/events?userId=${state.userId}`, { headers });
      if (!res.ok) throw new Error('获取事件历史失败');
      const data = await res.json();
      if (data && data.ok && Array.isArray(data.events)) {
        const existingIds = new Set(state.eventLogs.map(e => e.id));
        const remoteEvents = data.events.filter(e => !existingIds.has('remote_' + e.id));
        const mapped = remoteEvents.map(e => ({
          id: 'remote_' + e.id, time: e.time, type: e.type,
          typeColor: EventLogger._getTypeStyle(e.type),
          description: e.description, operator: e.operator || '管理员',
          status: e.status || '成功',
          statusColor: e.status === '成功' ? 'green' : e.status === '失败' ? 'red' : 'amber'
        }));
        state.eventLogs = [...mapped, ...state.eventLogs].sort((a, b) => new Date(b.time) - new Date(a.time));
        if (state.eventLogs.length > 500) state.eventLogs.length = 500;
      }
    } catch (e) {
      console.warn('加载历史事件失败:', e.message);
    }
  },

  pushEvent(entry) {
    this._pendingEvents.push(entry);
    if (!this._flushTimer) {
      this._flushTimer = setTimeout(() => this._flush(), 5000);
    }
  },

  async _flush() {
    this._flushTimer = null;
    if (this._pendingEvents.length === 0) return;
    const batch = this._pendingEvents.splice(0, 50);
    const token = sessionStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', 'X-User-Id': AppState.userId };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      await fetch(`${API_BASE}/api/events`, {
        method: 'POST', headers,
        body: JSON.stringify({ events: batch.map(e => ({ time: e.time, type: e.type, description: e.description, operator: e.operator, status: e.status })) })
      });
    } catch (e) {
      console.warn('批量推送事件失败:', e.message);
    }
  }
};

// 事件日志核心
export const EventLogger = {
  _nextId: 1,

  _getTypeStyle(type) {
    const map = { 创建: 'amber', 编辑: 'purple', 删除: 'red', 系统: 'blue', 读取: 'teal', API: 'cyan', 缓存: 'emerald', 同步: 'indigo', 成功: 'green', 失败: 'red' };
    return map[type] || 'blue';
  },

  _getTypeFrom(actionType) {
    const map = { create: '创建', edit: '编辑', delete: '删除', read: '读取', api: 'API', cache: '缓存', sync: '同步', system: '系统' };
    return map[actionType] || '系统';
  },

  log(actionType, description, operator = '管理员', status = '成功') {
    const state = AppState;
    const id = this._nextId++;
    const typeName = this._getTypeFrom(actionType);
    const entry = {
      id, time: new Date().toISOString(), type: typeName,
      typeColor: this._getTypeStyle(typeName), description, operator, status,
      statusColor: status === '成功' ? 'green' : status === '失败' ? 'red' : 'amber'
    };
    state.eventLogs.unshift(entry);
    // 同步到实时日志
    LogManager.info(description);
    // 异步推送到后端
    if (state.userId) {
      try { EventPersistence.pushEvent(entry); } catch (_) {}
    }
    if (state.eventLogs.length > 200) state.eventLogs.length = 200;
    return entry;
  },

  getFiltered(filterType = '全部', dateFrom = '', dateTo = '') {
    const state = AppState;
    let result = state.eventLogs;
    if (filterType !== '全部') result = result.filter(e => e.type === filterType);
    if (dateFrom) { const from = new Date(dateFrom); result = result.filter(e => new Date(e.time) >= from); }
    if (dateTo) { const to = new Date(dateTo); to.setHours(23, 59, 59, 999); result = result.filter(e => new Date(e.time) <= to); }
    return result;
  },

  renderTable(filterType = '全部', dateFrom = '', dateTo = '') {
    const tbody = Utils.getElement('events-table-body');
    if (!tbody) return;
    const filtered = this.getFiltered(filterType, dateFrom, dateTo);
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400 text-sm">暂无事件记录</td></tr>';
      return;
    }
    tbody.innerHTML = filtered.map(e => {
      const timeStr = new Date(e.time).toLocaleString('zh-CN', { hour12: false });
      const typeColorMap = { amber: 'bg-amber-500/10 text-amber-400', purple: 'bg-purple-500/10 text-purple-400', red: 'bg-red-500/10 text-red-400', blue: 'bg-blue-500/10 text-blue-400', green: 'bg-green-500/10 text-green-400', teal: 'bg-teal-500/10 text-teal-400', cyan: 'bg-cyan-500/10 text-cyan-400', emerald: 'bg-emerald-500/10 text-emerald-400', indigo: 'bg-indigo-500/10 text-indigo-400' };
      const statusColorMap = { green: 'bg-green-500/10 text-green-400', red: 'bg-red-500/10 text-red-400', amber: 'bg-amber-500/10 text-amber-400' };
      return `<tr class="hover:bg-dark-lighter/50 transition-colors">
        <td class="py-3 px-4 text-sm text-gray-400">${timeStr}</td>
        <td class="py-3 px-4"><span class="px-2 py-1 ${typeColorMap[e.typeColor] || typeColorMap.blue} text-xs rounded">${e.type}</span></td>
        <td class="py-3 px-4 text-sm text-gray-300">${Utils.escapeHtml(e.description)}</td>
        <td class="py-3 px-4 text-sm text-gray-300">${Utils.escapeHtml(e.operator)}</td>
        <td class="py-3 px-4"><span class="px-2 py-1 ${statusColorMap[e.statusColor] || statusColorMap.green} text-xs rounded">${e.status}</span></td>
      </tr>`;
    }).join('');
  },

  initEventFilters() {
    const filterBtns = Utils.queryAll('#events-page .events-filter-btn');
    const dateFrom = Utils.getElement('events-date-from');
    const dateTo = Utils.getElement('events-date-to');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', function() {
        filterBtns.forEach(b => { b.classList.remove('bg-indigo-600', 'text-white'); b.classList.add('bg-dark-lighter', 'hover:bg-dark', 'text-gray-300'); });
        this.classList.remove('bg-dark-lighter', 'hover:bg-dark', 'text-gray-300');
        this.classList.add('bg-indigo-600', 'text-white');
        EventLogger.renderTable(this.getAttribute('data-filter') || '全部', dateFrom ? dateFrom.value : '', dateTo ? dateTo.value : '');
      });
    });
    if (dateFrom) dateFrom.addEventListener('change', () => EventLogger.renderTable(
      document.querySelector('#events-page .events-filter-btn.bg-indigo-600')?.getAttribute('data-filter') || '全部',
      dateFrom.value, dateTo ? dateTo.value : ''
    ));
    if (dateTo) dateTo.addEventListener('change', () => EventLogger.renderTable(
      document.querySelector('#events-page .events-filter-btn.bg-indigo-600')?.getAttribute('data-filter') || '全部',
      dateFrom ? dateFrom.value : '', dateTo.value
    ));
  },

  /**
   * 从后端加载历史事件（在页面初始化时调用）
   */
  async loadHistory() {
    await EventPersistence.loadHistory();
  },

  // 重写 LogManager 以同时写入事件日志（避免递归）
  initLogManagerOverride() {
    const originalInfo = LogManager.info;
    const originalSuccess = LogManager.success;
    const originalWarning = LogManager.warning;
    const originalError = LogManager.error;

    const noisyPrefixes = ['统计:', '切换到', '打开', '关闭所有', '触发快捷键', '页面加载', '请求笔记', '从缓存', '数据已缓存'];

    const _pushEvent = (actionType, description, operator = '管理员', status = '成功') => {
      const state = AppState;
      const entry = {
        id: this._nextId++,
        time: new Date().toISOString(),
        type: this._getTypeFrom(actionType),
        typeColor: this._getTypeStyle(this._getTypeFrom(actionType)),
        description, operator, status,
        statusColor: status === '成功' ? 'green' : status === '失败' ? 'red' : 'amber'
      };
      state.eventLogs.unshift(entry);
      if (state.eventLogs.length > 200) state.eventLogs.length = 200;
      if (state.userId) {
        try { EventPersistence.pushEvent(entry); } catch (_) {}
      }
    };

    LogManager.info = (m) => {
      originalInfo.call(LogManager, m);
      if (!m.startsWith('触发') && !m.startsWith('切换') && !noisyPrefixes.some(p => m.startsWith(p))) {
        _pushEvent('system', m);
      }
    };
    LogManager.success = (m) => {
      originalSuccess.call(LogManager, m);
      _pushEvent('system', m);
    };
    LogManager.error = (m) => {
      originalError.call(LogManager, m);
      _pushEvent('system', '错误: ' + m, '系统', '失败');
    };
  }
};