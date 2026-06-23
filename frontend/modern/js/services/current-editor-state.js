// services/current-editor-state.js — 编辑器自动暂存
'use strict';

import { Utils } from "../core/utils.js";

const EDITOR_STATE_KEY = 'encrypted_notes_current_editor';

export const CurrentEditorState = {
  _saveTimer: null,
  save() {
    const title = Utils.getElement('new-note-title');
    const editor = Utils.getElement('new-note-editor');
    const catSelect = Utils.getElement('new-note-category');
    const tagsInput = Utils.getElement('new-note-tags');
    if (!title || !editor) return;
    const titleText = title.value.trim();
    const contentHtml = editor.innerHTML.trim();
    if (!titleText && !contentHtml) return;
    const state = {
      title: title.value, content: editor.innerHTML,
      category: catSelect ? catSelect.value : '未分类',
      tags: tagsInput ? tagsInput.value : '',
      editingNoteId: window._editingNoteId || null,
      savedAt: Date.now()
    };
    localStorage.setItem(EDITOR_STATE_KEY, JSON.stringify(state));
  },
  get() {
    try {
      const raw = localStorage.getItem(EDITOR_STATE_KEY);
      if (!raw) return null;
      const state = JSON.parse(raw);
      if (state.savedAt && Date.now() - state.savedAt > 86400000) {
        this.clear(); return null;
      }
      return state;
    } catch { return null; }
  },
  clear() { localStorage.removeItem(EDITOR_STATE_KEY); },
  restoreToEditor() {
    const state = this.get();
    if (!state) return false;
    const title = Utils.getElement('new-note-title');
    const editor = Utils.getElement('new-note-editor');
    const catSelect = Utils.getElement('new-note-category');
    const tagsInput = Utils.getElement('new-note-tags');
    if (title) title.value = state.title || '';
    if (editor) editor.innerHTML = state.content || '';
    if (catSelect) catSelect.value = state.category || '未分类';
    if (tagsInput) tagsInput.value = state.tags || '';
    if (state.editingNoteId) window._editingNoteId = state.editingNoteId;
    return true;
  },
  startAutoSave() {
    const editor = Utils.getElement('new-note-editor');
    const title = Utils.getElement('new-note-title');
    if (!editor || !title) return;
    const handler = () => {
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this.save(), 800);
    };
    editor.addEventListener('input', handler);
    title.addEventListener('input', handler);
  }
};