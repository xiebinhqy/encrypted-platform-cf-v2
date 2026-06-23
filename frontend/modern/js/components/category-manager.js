// components/category-manager.js — 分类管理
'use strict';

import { encrypt, decrypt } from "../../../shared/crypto/index.js";
import { API_BASE, saveCategory as apiSaveCategory, updateCategory as apiUpdateCategory, removeCategory as apiRemoveCategory } from "../../../shared/api/index.js";
import AppState from "../core/state.js";
import { Utils } from "../core/utils.js";

// 依赖注入
let _toastManager = null;
let _logManager = null;
let _dataLoader = null;
let _sidebarManager = null;
let _dashboardUpdater = null;
let _chartManager = null;
let _noteEditor = null;

export function injectDeps(deps) {
  _toastManager = deps.toastManager;
  _logManager = deps.logManager;
  _dataLoader = deps.dataLoader;
  _sidebarManager = deps.sidebarManager;
  _dashboardUpdater = deps.dashboardUpdater;
  _chartManager = deps.chartManager;
  _noteEditor = deps.noteEditor;
}

export async function _deleteCategory(catId) {
  if (!catId || catId === 'null' || catId === 'undefined') {
    _toastManager.show('分类ID无效，无法删除', 'error');
    return;
  }
  const state = AppState;
  try {
    const res = await apiRemoveCategory(API_BASE, state.userId, catId);
    if (res.ok) {
      _toastManager.show('分类已删除', 'success');
      _logManager.success('删除分类成功');
      // 🚀 轻量刷新：只更新分类，不重新加载+解密全部笔记
      await _dataLoader.refreshCategoriesOnly();
    } else {
      const err = await res.json();
      _toastManager.show('删除分类失败: ' + (err.err || '未知错误'), 'error');
    }
  } catch (e) {
    _toastManager.show('删除分类失败: ' + e.message, 'error');
  }
}

let _savingCategory = false;

/**
 * 同步分类到设置-基本设置-默认分类下拉框
 */
function _syncDefaultCategorySelect() {
  const catSelect = document.getElementById('settings-default-category');
  if (!catSelect) return;
  const currentValue = catSelect.value;
  // 清除旧选项（保留第一个"未分类"）
  while (catSelect.options.length > 1) {
    catSelect.remove(1);
  }
  const cats = AppState.allCategories;
  if (cats && cats.length > 0) {
    cats.forEach(cat => {
      if (cat.name && cat.name !== '未分类') {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.textContent = cat.name;
        catSelect.appendChild(opt);
      }
    });
  }
  // 恢复选中的值
  if (currentValue) {
    catSelect.value = currentValue;
  }
}

export async function _saveNewCategory(name, color) {
  if (_savingCategory) return false;
  _savingCategory = true;
  const state = AppState;
  if (!name.trim()) {
    _toastManager.show('请输入分类名称', 'error');
    _savingCategory = false;
    return false;
  }
  const duplicate = state.allCategories.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    _toastManager.show(`分类「${name}」已存在，请使用其他名称`, 'error');
    _savingCategory = false;
    return false;
  }
  try {
    const nameCipher = await encrypt(name, state.masterKey);
    const res = await apiSaveCategory(API_BASE, state.userId, {
      id: crypto.randomUUID(),
      name_cipher: nameCipher,
      color: color || '#3b82f6'
    });
    if (res.ok) {
      _toastManager.show('分类已创建', 'success');
      _logManager.success(`创建分类: ${name}`);
      // 同步到设置-默认分类下拉框
      _syncDefaultCategorySelect();
      _savingCategory = false;
      return true;
    } else {
      const err = await res.json();
      _toastManager.show('创建分类失败: ' + (err.err || '未知错误'), 'error');
      _savingCategory = false;
      return false;
    }
  } catch (e) {
    _toastManager.show('创建分类失败: ' + e.message, 'error');
    _savingCategory = false;
    return false;
  }
}

export async function _editCategory(catId, newName, newColor) {
  // 验证 catId
  if (!catId || catId === 'null' || catId === 'undefined') {
    const state = AppState;
    // 尝试通过名称查找
    const fallback = state.allCategories.find(c => c.name === newName);
    if (fallback && fallback.id && fallback.id !== 'null') {
      catId = fallback.id;
    } else {
      _toastManager.show('分类ID无效', 'error');
      return;
    }
  }
  const state = AppState;
  try {
    const nameCipher = await encrypt(newName, state.masterKey);
    const body = { name_cipher: nameCipher };
    if (newColor) body.color = newColor;
    const res = await apiUpdateCategory(API_BASE, state.userId, catId, body);
    if (res.ok) {
      _toastManager.show('分类已更新', 'success');
      _logManager.success(`更新分类: ${newName}`);
      // 🚀 轻量刷新：只更新分类，不重新加载+解密全部笔记（从~5s降到~0.3s）
      await _dataLoader.refreshCategoriesOnly();
    } else {
      const err = await res.json();
      _toastManager.show('更新分类失败: ' + (err.err || '未知错误'), 'error');
    }
  } catch (e) {
    _toastManager.show('更新分类失败: ' + e.message, 'error');
  }
}

export function _openNewCategoryDialog() {
  const dialog = Utils.getElement('new-category-dialog');
  if (!dialog) return;
  const nameInput = Utils.getElement('new-category-name');
  if (nameInput) nameInput.value = '';
  const state = AppState;
  const colorList = ['#3b82f6','#a855f7','#ec4899','#f97316','#10b981','#8b5cf6','#f59e0b','#06b6d4','#ef4444','#14b8a6'];
  const nextColor = colorList[state.allCategories.length % colorList.length];
  const colorPicker = Utils.getElement('category-color-picker');
  if (colorPicker) {
    colorPicker.querySelectorAll('button').forEach((b) => {
      b.classList.remove('ring-2', 'ring-offset-2', 'ring-offset-dark-light');
      if (b.getAttribute('data-color') === nextColor) {
        b.classList.add('ring-2', 'ring-offset-2', 'ring-offset-dark-light');
      }
    });
    window._selectedCategoryColor = nextColor;
  }
  const errEl = Utils.getElement('new-category-error');
  if (errEl) { errEl.classList.add('hidden'); errEl.textContent = ''; }
  dialog.style.display = 'flex';
  dialog.style.zIndex = '9999';
}

export function _openEditCategoryDialog(catId, currentName) {
  const dialog = Utils.getElement('edit-category-dialog');
  if (!dialog) return;
  const nameInput = Utils.getElement('edit-category-name');
  // BUG 4 修复：填写原分类名称，用户方便比对
  if (nameInput) nameInput.value = currentName || '';
  const state = AppState;
  const cat = state.allCategories.find(c => c.id === catId);
  const currentColor = cat ? cat.color : '#3b82f6';
  // 同时设置旧名称显示
  const oldNameEl = Utils.getElement('edit-category-old-name');
  if (oldNameEl) oldNameEl.textContent = '原分类: ' + (currentName || cat?.name || '');
  const colorPicker = Utils.getElement('edit-category-color-picker');
  if (colorPicker) {
    colorPicker.querySelectorAll('button').forEach(btn => {
      btn.classList.remove('ring-2', 'ring-offset-2', 'ring-offset-dark-light');
      const btnColor = btn.getAttribute('data-color');
      if (btnColor === currentColor) {
        btn.classList.add('ring-2', 'ring-offset-2', 'ring-offset-dark-light');
        window._editCategoryColor = btnColor;
      }
    });
  }
  window._editCategoryId = catId;
  const errEl = Utils.getElement('edit-category-error');
  if (errEl) { errEl.classList.add('hidden'); errEl.textContent = ''; }
  dialog.style.display = 'flex';
  dialog.style.zIndex = '9999';
}

// 兼容旧导出：保留为无操作（实际去重已由 data-loader._deduplicateCategories 处理）
export function checkDuplicateCategories() {
  return [];
}

// 初始化分类对话框事件
export function initCategoryDialogEvents() {
  // 新建分类颜色选择
  const newColorPicker = Utils.getElement('category-color-picker');
  if (newColorPicker) {
    newColorPicker.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', function() {
        newColorPicker.querySelectorAll('button').forEach(b => b.classList.remove('ring-2', 'ring-offset-2', 'ring-offset-dark-light'));
        this.classList.add('ring-2', 'ring-offset-2', 'ring-offset-dark-light');
        window._selectedCategoryColor = this.getAttribute('data-color') || '#3b82f6';
      });
    });
  }
  // 新建分类保存
  const saveNewBtn = Utils.getElement('create-category-btn');
  if (saveNewBtn) {
    saveNewBtn.addEventListener('click', async function() {
      const nameInput = Utils.getElement('new-category-name');
      if (!nameInput) return;
      const success = await _saveNewCategory(nameInput.value.trim(), window._selectedCategoryColor);
      if (success) {
        const dialog = Utils.getElement('new-category-dialog');
        if (dialog) dialog.style.display = 'none';
        // 🚀 轻量刷新：只更新分类，不重新加载+解密全部笔记
        await _dataLoader.refreshCategoriesOnly();
        _noteEditor.populateCategories();
      }
    });
  }
  // 编辑分类颜色选择
  const editColorPicker = Utils.getElement('edit-category-color-picker');
  if (editColorPicker) {
    editColorPicker.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', function() {
        editColorPicker.querySelectorAll('button').forEach(b => b.classList.remove('ring-2', 'ring-offset-2', 'ring-offset-dark-light'));
        this.classList.add('ring-2', 'ring-offset-2', 'ring-offset-dark-light');
        window._editCategoryColor = this.getAttribute('data-color') || '#3b82f6';
      });
    });
  }
  // 编辑分类保存
  const editSaveBtn = Utils.getElement('edit-category-save-btn');
  if (editSaveBtn) {
    editSaveBtn.addEventListener('click', async function() {
      const nameInput = Utils.getElement('edit-category-name');
      if (!nameInput) return;
      const name = nameInput.value.trim();
      if (!name) {
        const errEl = Utils.getElement('edit-category-error');
        if (errEl) { errEl.textContent = '请输入分类名称'; errEl.classList.remove('hidden'); }
        _toastManager.show('请输入分类名称', 'error');
        return;
      }
      await _editCategory(window._editCategoryId, name, window._editCategoryColor || '#3b82f6');
      const dialog = Utils.getElement('edit-category-dialog');
      if (dialog) dialog.style.display = 'none';
    });
  }
}