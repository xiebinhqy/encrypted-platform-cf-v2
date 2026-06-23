// services/draft-manager.js — 草稿管理
'use strict';

import { Utils } from "../core/utils.js";

const DRAFT_KEY = 'encrypted_notes_drafts';

let _noteEditor = null;
let _toastManager = null;

export function injectDeps(deps) {
  _noteEditor = deps.noteEditor;
  _toastManager = deps.toastManager;
}

export const DraftManager = {
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) || '[]');
    } catch (e) { return []; }
  },
  save(draft) {
    const drafts = this.getAll();
    const idx = drafts.findIndex(d => d.id === draft.id);
    if (idx !== -1) drafts[idx] = draft;
    else drafts.push(draft);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  },
  update(draft) { this.save(draft); },
  delete(id) {
    const drafts = this.getAll().filter(d => d.id !== id);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  },
  remove(id) { this.delete(id); },
  getById(id) {
    return this.getAll().find(d => d.id === id);
  },
  markAsSaved(id) {
    this.update({ id, status: 'saved', statusText: '已保存到云端' });
  },
  clear() {
    localStorage.removeItem(DRAFT_KEY);
  },
  refreshDisplay() {
    const container = Utils.getElement('drafts-content');
    if (!container) return;
    const drafts = this.getAll().filter(d => d.status !== 'saved');
    const countEl = Utils.getElement('drafts-count');
    if (countEl) countEl.textContent = `(${drafts.length})`;
    if (drafts.length === 0) {
      container.innerHTML = `<div class="text-center py-12"><div class="w-20 h-20 rounded-full bg-cyan-500/10 flex items-center justify-center mx-auto mb-4"><i class="fa-solid fa-pen-nib text-cyan-400 text-3xl"></i></div><h3 class="text-white font-medium mb-2">暂无草稿</h3><p class="text-gray-400 text-sm">您没有未保存的草稿</p></div>`;
      const ce = Utils.queryAll('.animate-count');
      if (ce.length >= 4) ce[3].textContent = '0';
      return;
    }
    const unsavedCount = drafts.length;
    const ce = Utils.queryAll('.animate-count');
    if (ce.length >= 4) { ce[3].textContent = unsavedCount; ce[3].setAttribute('data-target', unsavedCount); }
    const sc = { draft: 'text-amber-400 bg-amber-500/10', failed: 'text-red-400 bg-red-500/10', saved: 'text-emerald-400 bg-emerald-500/10' };
    const si = { draft: 'fa-pen-nib', failed: 'fa-triangle-exclamation', saved: 'fa-check' };
    container.innerHTML = drafts.slice(0, 20).map(d => {
      const c = sc[d.status] || 'text-gray-400 bg-gray-500/10';
      const icon = si[d.status] || 'fa-file';
      const t = new Date(d.updatedAt).toLocaleString('zh-CN', { hour12: false });
      const preview = d.content ? d.content.replace(/<[^>]*>/g, '').substring(0, 80) : '';
      return `<div class="bg-dark rounded-lg p-4 border border-dark-lighter hover:border-indigo-500/50 transition-colors"><div class="flex items-start justify-between"><div class="flex-1 min-w-0"><h3 class="text-white font-medium mb-1 truncate">${d.title || ''}</h3><p class="text-gray-400 text-sm mb-2 line-clamp-2">${preview}</p><div class="flex items-center text-xs text-gray-500 flex-wrap gap-1"><span>${t}</span><span class="mx-1">\u2022</span><span>${d.category || ''}</span></div><div class="mt-1"><span class="inline-flex items-center gap-1 px-2 py-0.5 ${c} rounded text-xs"><i class="fa-solid ${icon}"></i>${d.statusText || ''}</span></div></div><div class="flex items-center space-x-2 ml-4 flex-shrink-0"><button class="draft-retry-btn p-2 text-indigo-400 hover:text-white hover:bg-dark-lighter rounded transition-colors" data-id="${d.id}" title="重新保存"><i class="fa-solid fa-rotate"></i></button><button class="draft-delete-btn p-2 text-gray-400 hover:text-red-400 hover:bg-dark-lighter rounded transition-colors" data-id="${d.id}" title="删除草稿"><i class="fa-solid fa-trash"></i></button></div></div></div>`;
    }).join('');
    container.querySelectorAll('.draft-retry-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const drafts = DraftManager.getAll();
        const draft = drafts.find(d => d.id === this.getAttribute('data-id'));
        if (!draft) return;
        const title = Utils.getElement('new-note-title');
        const editor = Utils.getElement('new-note-editor');
        const catSelect = Utils.getElement('new-note-category');
        const tagsInput = Utils.getElement('new-note-tags');
        if (title) title.value = draft.title;
        if (editor) editor.innerHTML = draft.content;
        if (catSelect) catSelect.value = draft.category || '未分类';
        if (tagsInput) tagsInput.value = draft.tags || '';
        const nd = Utils.getElement('new-note-dialog');
        if (nd) { nd.style.display = 'flex'; if (_noteEditor) _noteEditor._initTagDropdown(); }
      });
    });
    container.querySelectorAll('.draft-delete-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        if (confirm('确认删除此草稿？')) {
          DraftManager.delete(this.getAttribute('data-id'));
          DraftManager.refreshDisplay();
          if (_toastManager) _toastManager.show('草稿已删除', 'info');
        }
      });
    });
  }
};