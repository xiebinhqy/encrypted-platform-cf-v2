// services/sidebar-manager.js — 侧边栏分类渲染
'use strict';

import AppState from "../core/state.js";
import { Utils } from "../core/utils.js";

let _noteEditor = null;
let _chartManager = null;

export function injectDeps(deps) {
  _noteEditor = deps.noteEditor;
  _chartManager = deps.chartManager;
}

export const SidebarManager = {
  renderCategories() {
    const state = AppState;
    const container = Utils.getElement('sidebar-categories');
    if (!container) return;
    const colorList = ['#3b82f6','#a855f7','#ec4899','#f97316','#10b981','#8b5cf6','#f59e0b','#06b6d4'];
    if (state.allCategories.length === 0) {
      container.innerHTML = '<h3 class="text-xs uppercase text-gray-500 font-semibold mb-2 px-3 flex items-center justify-between"><span>分类</span><button class="sidebar-add-cat-btn text-indigo-400 hover:text-indigo-300 transition-colors" title="新建分类"><i class="fa-solid fa-plus text-xs"></i></button></h3><div class="text-gray-500 text-xs px-3 py-2">暂无分类</div>';
      const addBtnEmpty = container.querySelector('.sidebar-add-cat-btn');
      if (addBtnEmpty) {
        addBtnEmpty.addEventListener('click', function(e) { e.stopPropagation(); _openNewCategoryDialog(); });
      }
      return;
    }
    let html = '<h3 class="text-xs uppercase text-gray-500 font-semibold mb-2 px-3 flex items-center justify-between"><span>分类</span><button class="sidebar-add-cat-btn text-indigo-400 hover:text-indigo-300 transition-colors" title="新建分类"><i class="fa-solid fa-plus text-xs"></i></button></h3>';
    state.allCategories.forEach((cat, i) => {
      const color = cat.color || colorList[i % colorList.length];
      const escapedName = Utils.escapeHtml(cat.name);
      html += `<div class="group flex items-center px-3 py-2 rounded-lg text-gray-400 hover:bg-dark-lighter hover:text-white transition-all sidebar-cat-link" data-cat-name="${escapedName}" data-cat-id="${cat.id}" data-cat-color="${color}" style="cursor:pointer">
        <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${color}"></span>
        <span class="text-sm truncate flex-1 ml-3">${escapedName}</span>
        <div class="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
          <button class="sidebar-cat-rename-btn p-1 text-gray-500 hover:text-indigo-400 hover:bg-dark-lighter rounded transition-colors" data-cat-id="${cat.id}" data-cat-name="${escapedName}" title="重命名"><i class="fa-solid fa-pen text-[10px]"></i></button>
          <button class="sidebar-cat-delete-btn p-1 text-gray-500 hover:text-red-400 hover:bg-dark-lighter rounded transition-colors" data-cat-id="${cat.id}" title="删除分类"><i class="fa-solid fa-trash text-[10px]"></i></button>
        </div>
      </div>`;
    });
    container.innerHTML = html;
    container.querySelectorAll('.sidebar-cat-link').forEach(link => {
      link.addEventListener('click', function(e) {
        if (e.target.closest('button')) return;
        e.preventDefault();
        const catName = this.getAttribute('data-cat-name');
        const dialog = Utils.getElement('category-dialog');
        if (dialog) {
          if (_chartManager) _chartManager.updateCategoryDetail(catName);
          dialog.style.display = 'flex';
          dialog.style.zIndex = '9999';
        }
      });
    });
    container.querySelectorAll('.sidebar-cat-rename-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const catId = this.getAttribute('data-cat-id');
        const catName = this.getAttribute('data-cat-name');
        _openEditCategoryDialog(catId, catName);
      });
    });
    container.querySelectorAll('.sidebar-cat-delete-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const catId = this.getAttribute('data-cat-id');
        if (confirm('确认删除此分类？该操作不可撤销。')) {
          _deleteCategory(catId);
        }
      });
    });
    const addBtn = container.querySelector('.sidebar-add-cat-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        _openNewCategoryDialog();
      });
    }
  }
};

// 需要从 category-manager 导入
import { _openNewCategoryDialog, _openEditCategoryDialog, _deleteCategory } from "../components/category-manager.js";