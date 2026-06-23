// components/note-editor.js — 笔记编辑器
'use strict';

import { encrypt } from "../../../shared/crypto/index.js";
import { API_BASE, saveNote as apiSave, createNoteV2, updateNoteV2 } from "../../../shared/api/index.js";
import AppState from "../core/state.js";
import { Utils } from "../core/utils.js";

let _toastManager = null;
let _logManager = null;
let _eventLogger = null;
let _dataLoader = null;
let _draftManager = null;

export function injectDeps(deps) {
  _toastManager = deps.toastManager;
  _logManager = deps.logManager;
  _eventLogger = deps.eventLogger;
  _dataLoader = deps.dataLoader;
  _draftManager = deps.draftManager;
}

export const NoteEditor = {
  populateCategories() {
    const state = AppState;
    const select = Utils.getElement('new-note-category');
    if (!select) return;
    select.innerHTML = '<option value="">未分类</option>';
    state.allCategories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.dataset.catId = cat.id;
      opt.textContent = cat.name;
      select.appendChild(opt);
    });
  },

  _initTagDropdown() {
    const state = AppState;
    const select = Utils.getElement('tag-select-dropdown');
    if (!select) return;
    const tagSet = new Set();
    state.allNotes.forEach(n => {
      if (n.tags && n.tags.length > 0) {
        n.tags.forEach(t => { if (t.trim()) tagSet.add(t.trim()); });
      }
    });
    const drafts = _draftManager ? _draftManager.getAll() : [];
    drafts.forEach(d => { if (d.title) tagSet.add(d.title); });
    const tags = Array.from(tagSet).sort();
    select.innerHTML = '<option value="">选标签</option>';
    tags.forEach(tag => {
      const opt = document.createElement('option');
      opt.value = tag;
      opt.textContent = tag;
      select.appendChild(opt);
    });
    select.addEventListener('change', function() {
      const tag = this.value;
      if (!tag) return;
      const input = Utils.getElement('new-note-tags');
      if (!input) return;
      const currentTags = input.value.split(',').map(t => t.trim()).filter(Boolean);
      if (!currentTags.includes(tag)) {
        currentTags.push(tag);
        input.value = currentTags.join(', ');
      }
      this.value = '';
      input.focus();
    });
  },

  resetEditor() {
    ['new-note-title', 'new-note-editor', 'new-note-tags'].forEach(id => {
      const el = Utils.getElement(id);
      if (el) id === 'new-note-editor' ? el.innerHTML = '' : el.value = '';
    });
    const si = Utils.getElement('share-link-input'); if (si) si.value = '';
    const ss = Utils.getElement('share-status'); if (ss) { ss.classList.add('hidden'); ss.textContent = ''; }
    const od = Utils.getElement('save-options-dialog'); if (od) od.style.display = 'none';
    const sd = Utils.getElement('share-dialog'); if (sd) sd.style.display = 'none';
    this._initTagDropdown();
  },

  _getEditorData() {
    const title = Utils.getElement('new-note-title');
    const editor = Utils.getElement('new-note-editor');
    const catSelect = Utils.getElement('new-note-category');
    const tagsInput = Utils.getElement('new-note-tags');
    if (!title || !editor) return null;
    const titleText = title.value.trim();
    const contentHtml = editor.innerHTML.trim();
    const category = catSelect ? catSelect.value : '未分类';
    const tags = tagsInput ? tagsInput.value.trim() : '';
    if (!titleText) { _toastManager.show('请输入笔记标题', 'error'); return null; }
    if (!contentHtml) { _toastManager.show('请输入笔记内容', 'error'); return null; }
    const state = AppState;
    if (!state.userId || !state.masterKey) { _toastManager.show('请先登录', 'error'); return null; }
    return { titleText, contentHtml, category, tags };
  },

  _saveToDraftOnFailure(data, noteId) {
    if (!_draftManager) return;
    const draft = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      noteId: noteId,
      title: data.titleText,
      content: data.contentHtml,
      category: data.category,
      tags: data.tags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'failed',
      statusText: '保存失败'
    };
    _draftManager.save(draft);
  },

  async saveNote(type) {
    if (!type) {
      const od = Utils.getElement('save-options-dialog');
      if (od) od.style.display = 'flex';
      return;
    }
    const data = this._getEditorData();
    if (!data) return;
    const isEditing = !!window._editingNoteId;
    let noteId;
    if (isEditing) {
      noteId = window._editingNoteId;
    } else {
      noteId = crypto.randomUUID();
    }
    const state = AppState;
    try {
      const titleCipher = await encrypt(data.titleText, state.masterKey);
      const contentCipher = await encrypt(data.contentHtml, state.masterKey);
      const categoryCipher = await encrypt(data.category, state.masterKey);
      const tagArray = data.tags.split(',').map(t => t.trim()).filter(Boolean);
      const tagsCipher = tagArray.length > 0 ? await encrypt(JSON.stringify(tagArray), state.masterKey) : '';
      let res;
      if (type === 'draft') {
        const draft = {
          id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
          noteId: isEditing ? noteId : null,
          title: data.titleText, content: data.contentHtml,
          category: data.category, tags: data.tags,
          createdAt: Date.now(), updatedAt: Date.now(),
          status: 'draft', statusText: '草稿'
        };
        if (_draftManager) _draftManager.save(draft);
        _toastManager.show('草稿已保存', 'success');
        if (_eventLogger) _eventLogger.log('create', `保存草稿: ${data.titleText}`, '管理员', '成功');
        return;
      }
      if (isEditing) {
        res = await updateNoteV2(API_BASE, state.userId, noteId, {
          title_cipher: titleCipher, ciphertext: contentCipher,
          category_cipher: categoryCipher, tags_cipher: tagsCipher
        });
      } else {
        res = await createNoteV2(API_BASE, state.userId, {
          id: noteId, title_cipher: titleCipher, ciphertext: contentCipher,
          category_cipher: categoryCipher, tags_cipher: tagsCipher
        });
      }
      if (res.ok) {
        if (_eventLogger) _eventLogger.log(isEditing ? 'edit' : 'create', `${isEditing ? '更新' : '创建'}笔记: ${data.titleText}`, '管理员', '成功');
        _toastManager.show(isEditing ? '笔记已更新' : '笔记已创建', 'success');
        const dialog = Utils.getElement('new-note-dialog');
        if (dialog) dialog.style.display = 'none';
        // 切换回数据看板
        const dashboardTab = Utils.getElement('nav-tab-dashboard') || document.querySelector('.nav-tab[data-tab="dashboard"]');
        if (dashboardTab) dashboardTab.click();
        if (_draftManager && window._editingNoteId) {
          const drafts = _draftManager.getAll();
          const existing = drafts.find(d => d.noteId === window._editingNoteId || d.id === window._editingNoteId);
          if (existing) _draftManager.delete(existing.id);
        }
        window._editingNoteId = null;
        await _dataLoader.loadAll();
      } else {
        const err = await res.json();
        // 保存失败时自动存到草稿箱，防止内容丢失
        this._saveToDraftOnFailure(data, isEditing ? noteId : null);
        _toastManager.show(`${isEditing ? '更新' : '创建'}笔记失败: ${err.err || '未知'}，已保存到草稿箱`, 'error');
      }
    } catch (e) {
      // 保存失败时自动存到草稿箱，防止内容丢失
      this._saveToDraftOnFailure(data, isEditing ? noteId : null);
      _toastManager.show(`${isEditing ? '更新' : '创建'}笔记失败: ${e.message}，已保存到草稿箱`, 'error');
    }
  },

  async generateShareLink() {
    const input = Utils.getElement('share-link-input');
    const status = Utils.getElement('share-status');
    if (!input || !status) return;
    const key = Math.random().toString(36).substring(2,10) + Math.random().toString(36).substring(2,6);
    input.value = `${window.location.origin}/share/${key}`;
    status.textContent = '分享链接已生成！';
    status.className = 'text-sm text-emerald-400';
    status.classList.remove('hidden');
    _toastManager.show('分享链接已生成', 'success');
  }
};
