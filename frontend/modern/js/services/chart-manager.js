// services/chart-manager.js — 图表管理
'use strict';

import AppState from "../core/state.js";
import { Utils } from "../core/utils.js";

const CONFIG = {
  CHART_DESTROY_DELAY: 100,
  CHART_COLORS: {
    primary: '#6366f1', secondary: '#8b5cf6',
    cyan: '#06b6d4', emerald: '#10b981',
    text: '#94a3b8', grid: 'rgba(51,65,85,0.5)'
  },
  CHART_DEFAULTS: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#94a3b8' } } },
    scales: {
      x: { grid: { color: 'rgba(51,65,85,0.5)' }, ticks: { color: '#94a3b8' } },
      y: { grid: { color: 'rgba(51,65,85,0.5)' }, ticks: { color: '#94a3b8' } }
    }
  },
  TIME_FILTER_DATA: {
    week: { labels: ['周一','周二','周三','周四','周五','周六','周日'], create: [3,5,2,4,6,1,0], edit: [1,3,2,4,5,0,0] },
    month: { labels: ['1月','2月','3月','4月','5月'], create: [15,25,20,35,45], edit: [5,15,10,20,25] },
    year: { labels: ['2021','2022','2023','2024','2025','2026'], create: [120,180,220,280,350,45], edit: [50,80,120,150,200,25] }
  }
};

// 依赖注入
let _toastManager = null;
let _logManager = null;

export function injectDeps(deps) {
  _toastManager = deps.toastManager;
  _logManager = deps.logManager;
}

export const ChartManager = {
  initAll() {
    if (typeof Chart === 'undefined') return;
    this.destroyAll();
    this.createTrendChart();
    this.createCategoryPieChart();
    this.createDetailPieChart();
    this.createActivityChart();
    this.createTagChart();
    this.createLengthChart();
    this.createEditTimeChart();
  },

  /** 仅初始化仪表盘图表 */
  initDashboardCharts() {
    if (typeof Chart === 'undefined') return;
    this.destroyAll();
    this.createTrendChart();
    this.createCategoryPieChart();
    this.createDetailPieChart();
    this.updateTrendChart();
    this.updateCategoryPieChart();
  },

  /** 初始化分析页面图表 */
  initAnalysisCharts() {
    if (typeof Chart === 'undefined') return;
    this.createActivityChart();
    this.createTagChart();
    this.createLengthChart();
    this.createEditTimeChart();
  },

  destroyAll() {
    const charts = AppState.charts;
    Object.values(charts).forEach(c => { try { c.destroy(); } catch(e) {} });
  },

  createTrendChart() {
    const charts = AppState.charts;
    const ctx = Utils.getElement('noteTrendChart');
    if (!ctx) return;
    const now = new Date();
    const labels = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(`${d.getMonth() + 1}月`);
    }
    charts.noteTrend = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '创建笔记数', data: [0,0,0,0,0,0], borderColor: CONFIG.CHART_COLORS.secondary, backgroundColor: 'rgba(139,92,246,0.1)', fill: true, tension: 0.4, pointBackgroundColor: CONFIG.CHART_COLORS.secondary, pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 5 },
          { label: '修改次数', data: [0,0,0,0,0,0], borderColor: CONFIG.CHART_COLORS.cyan, backgroundColor: 'rgba(6,182,212,0.1)', fill: true, tension: 0.4, pointBackgroundColor: CONFIG.CHART_COLORS.cyan, pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 5 }
        ]
      },
      options: { ...CONFIG.CHART_DEFAULTS }
    });
  },

  createCategoryPieChart() {
    const charts = AppState.charts;
    const ctx = Utils.getElement('categoryPieChart');
    if (!ctx) return;
    charts.categoryPie = new Chart(ctx.getContext('2d'), {
      type: 'doughnut',
      data: { labels: ['加载中...'], datasets: [{ data: [1], backgroundColor: ['#64748b'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 15, font: { size: 11 } } } }, cutout: '65%' }
    });
  },

  createDetailPieChart() {
    const charts = AppState.charts;
    const state = AppState;
    const ctx = Utils.getElement('categoryDetailPieChart');
    if (!ctx) return;
    charts.categoryDetailPie = new Chart(ctx.getContext('2d'), {
      type: 'doughnut',
      data: { labels: ['全部笔记', '其他分类'], datasets: [{ data: [state.allNotes.length || 0, 0], backgroundColor: ['#6366f1', '#334155'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 15, font: { size: 11 } } } }, cutout: '65%' }
    });
  },

  createActivityChart() {
    const charts = AppState.charts;
    const state = AppState;
    const ctx = Utils.getElement('activityChart');
    if (!ctx) return;
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dayCount = [0, 0, 0, 0, 0, 0, 0];
    state.allNotes.forEach(note => { const d = new Date(note.updated_at); dayCount[d.getDay()] += note.revision_count; });
    charts.activity = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: { labels: dayNames, datasets: [{ label: '编辑次数', data: dayCount, backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 4 }] },
      options: { ...CONFIG.CHART_DEFAULTS }
    });
  },

  createTagChart() {
    const charts = AppState.charts;
    const state = AppState;
    const ctx = Utils.getElement('tagChart');
    if (!ctx) return;
    const catNotes = {};
    state.allNotes.forEach(note => { const c = note.category || '未分类'; catNotes[c] = (catNotes[c] || 0) + 1; });
    const labels = Object.keys(catNotes), data = Object.values(catNotes);
    charts.tag = new Chart(ctx.getContext('2d'), {
      type: 'polarArea',
      data: { labels: labels.length > 0 ? labels : ['暂无数据'], datasets: [{ data: data.length > 0 ? data : [1], backgroundColor: ['rgba(99,102,241,0.7)', 'rgba(139,92,246,0.7)', 'rgba(236,72,153,0.7)', 'rgba(249,115,22,0.7)', 'rgba(16,185,129,0.7)', 'rgba(139,92,246,0.7)'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 15, font: { size: 11 } } } } }
    });
  },

  createLengthChart() {
    const charts = AppState.charts;
    const state = AppState;
    const ctx = Utils.getElement('lengthChart');
    if (!ctx) return;
    const ranges = ['<100字', '100-500字', '500-1000字', '1000-2000字', '>2000字'];
    const counts = [0, 0, 0, 0, 0];
    state.allNotes.forEach(note => { const l = note.content ? note.content.length : 0; if (l < 100) counts[0]++; else if (l < 500) counts[1]++; else if (l < 1000) counts[2]++; else if (l < 2000) counts[3]++; else counts[4]++; });
    charts.length = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: { labels: ranges, datasets: [{ label: '笔记数量', data: counts, backgroundColor: 'rgba(6,182,212,0.7)', borderRadius: 4 }] },
      options: { ...CONFIG.CHART_DEFAULTS }
    });
  },

  createEditTimeChart() {
    const charts = AppState.charts;
    const state = AppState;
    const ctx = Utils.getElement('editTimeChart');
    if (!ctx) return;
    const now = new Date();
    const monthMap = {};
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; monthMap[k] = { label: `${d.getMonth() + 1}月`, totalRev: 0, count: 0 }; }
    state.allNotes.forEach(note => { const d = new Date(note.created_at); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; if (monthMap[k]) { monthMap[k].totalRev += note.revision_count; monthMap[k].count++; } });
    const labels = Object.values(monthMap).map(m => m.label);
    const avg = Object.values(monthMap).map(m => m.count > 0 ? Math.round(m.totalRev / m.count * 10) / 10 : 0);
    charts.editTime = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: { labels, datasets: [{ label: '平均修改次数', data: avg, borderColor: CONFIG.CHART_COLORS.emerald, backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.4, pointBackgroundColor: CONFIG.CHART_COLORS.emerald, pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 5 }] },
      options: { ...CONFIG.CHART_DEFAULTS }
    });
  },

  updateTrendFilter(period) {
    const charts = AppState.charts;
    const d = CONFIG.TIME_FILTER_DATA[period] || CONFIG.TIME_FILTER_DATA.month;
    if (charts.noteTrend) {
      charts.noteTrend.data.labels = d.labels;
      charts.noteTrend.data.datasets[0].data = d.create;
      charts.noteTrend.data.datasets[1].data = d.edit;
      charts.noteTrend.update();
    }
  },

  updateTrendChart() {
    const charts = AppState.charts;
    const state = AppState;
    const monthMap = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; monthMap[k] = { label: `${d.getMonth() + 1}月`, count: 0, editCount: 0 }; }
    state.allNotes.forEach(note => {
      const d = new Date(note.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthMap[k]) { monthMap[k].count++; monthMap[k].editCount += (note.revision_count - 1); }
      else { const keys = Object.keys(monthMap); if (keys.length > 0) { monthMap[keys[0]].count++; monthMap[keys[0]].editCount += (note.revision_count - 1); } }
    });
    const labels = Object.values(monthMap).map(m => m.label);
    const createData = Object.values(monthMap).map(m => m.count);
    const editData = Object.values(monthMap).map(m => m.editCount);
    if (charts.noteTrend) {
      charts.noteTrend.data.labels = labels;
      charts.noteTrend.data.datasets[0].data = createData;
      charts.noteTrend.data.datasets[1].data = editData;
      charts.noteTrend.update();
    }
  },

  updateCategoryPieChart() {
    const charts = AppState.charts;
    const state = AppState;
    const catCount = {}, catColor = {};
    state.allCategories.forEach(cat => { catCount[cat.name] = 0; catColor[cat.name] = cat.color; });
    catCount['未分类'] = 0; catColor['未分类'] = '#64748b';
    state.allNotes.forEach(note => { const c = note.category || '未分类'; if (catCount[c] !== undefined) catCount[c]++; else { catCount[c] = 1; catColor[c] = '#64748b'; } });
    const labels = Object.keys(catCount), data = Object.values(catCount), colors = labels.map(l => catColor[l] || '#64748b');
    if (charts.categoryPie) {
      charts.categoryPie.data.labels = labels;
      charts.categoryPie.data.datasets[0].data = data;
      charts.categoryPie.data.datasets[0].backgroundColor = colors;
      charts.categoryPie.update();
    }
  },

  updateCategoryDetail(name) {
    const charts = AppState.charts;
    const state = AppState;
    const cn = state.allNotes.filter(n => n.category === name);
    const other = state.allNotes.length - cn.length;
    if (charts.categoryDetailPie) {
      charts.categoryDetailPie.data.datasets[0].data = [cn.length, other];
      charts.categoryDetailPie.data.labels = [name, '其他分类'];
      charts.categoryDetailPie.update();
    }
    const t = Utils.getElement('category-dialog-title');
    const n = Utils.getElement('category-name');
    const cnt = Utils.getElement('category-note-count');
    if (t) t.textContent = name + ' - 分类详情';
    if (n) n.textContent = name;
    if (cnt) cnt.textContent = `该分类下共有 ${cn.length} 篇笔记`;
    const notesList = Utils.getElement('category-notes-list');
    if (!notesList) return;
    if (cn.length === 0) {
      notesList.innerHTML = '<div class="text-center py-8 text-gray-400 text-sm">该分类下暂无笔记</div>';
      return;
    }
    const catColor = state.allCategories.find(c => c.name === name)?.color || '#6366f1';
    const getPreview = (content) => {
      if (!content) return '';
      const stripped = content.replace(/<[^>]*>/g, '').trim();
      return stripped.length > 40 ? stripped.substring(0, 40) + '...' : stripped;
    };
    notesList.innerHTML = cn.sort((a, b) => b.updated_at - a.updated_at).map(note => {
      const preview = getPreview(note.content);
      return `<div class="flex items-start space-x-3 p-3 bg-dark rounded-lg border border-dark-lighter hover:border-indigo-500/50 transition-colors cursor-pointer group" data-note-id="${note.id}">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style="background:${catColor}20;color:${catColor}"><i class="fa-solid fa-file-pen text-sm"></i></div>
        <div class="flex-1 min-w-0">
          <h4 class="text-sm font-medium text-white truncate group-hover:text-indigo-400 transition-colors">${Utils.escapeHtml(note.title)}</h4>
          <p class="text-xs text-gray-400 mt-0.5 line-clamp-2">${Utils.escapeHtml(preview)}</p>
          <p class="text-xs text-gray-500 mt-1">最后更新: ${new Date(note.updated_at).toLocaleDateString('zh-CN')} • 修改${note.revision_count}次</p>
        </div>
        <div class="flex items-center space-x-1 flex-shrink-0 mt-0.5">
          <button class="cat-note-preview-btn p-1.5 text-indigo-400 hover:text-white hover:bg-indigo-500/20 rounded transition-colors" data-note-id="${note.id}" title="预览"><i class="fa-solid fa-eye text-xs"></i></button>
          <button class="cat-note-trash-btn p-1.5 text-red-400 hover:text-white hover:bg-red-500/20 rounded transition-colors" data-note-id="${note.id}" title="删除"><i class="fa-solid fa-trash text-xs"></i></button>
        </div>
      </div>`;
    }).join('');
  }
};