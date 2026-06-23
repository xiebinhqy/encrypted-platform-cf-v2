// services/standalone-functions.js — 独立函数（预览、编辑、切换等）
'use strict';

import AppState from "../core/state.js";
import { Utils } from "../core/utils.js";

let _toastManager = null;
let _dataLoader = null;
let _currentEditorState = null;
let _noteEditor = null;
let _chartManager = null;
let _dialogManager = null;
let _dashboardUpdater = null;
let _loadingOverlay = null;

export function injectDeps(deps) {
  _toastManager = deps.toastManager;
  _dataLoader = deps.dataLoader;
  _currentEditorState = deps.currentEditorState;
  _noteEditor = deps.noteEditor;
  _chartManager = deps.chartManager;
  _dialogManager = deps.dialogManager;
  _dashboardUpdater = deps.dashboardUpdater;
  _loadingOverlay = deps.loadingOverlay;
}

// 版本切换
export function switchToClassic() {
  if (_loadingOverlay) _loadingOverlay.show('正在切换到经典版', '请稍候，正在加载经典界面...');
  setTimeout(() => { window.location.href = '/classic'; }, 300);
}

// 更新编辑器标题
export function _updateEditorDialogTitle(title) {
  const el = Utils.getElement('new-note-dialog-title');
  if (el) el.innerHTML = '<i class="fa-solid fa-file-pen text-indigo-400 mr-2"></i>' + title;
}

// 预览笔记
export async function _previewNote(noteId) {
  const state = AppState;
  const note = state.allNotes.find(n => n.id === noteId);
  if (!note) {
    if (_toastManager) _toastManager.show('笔记不存在', 'error');
    return;
  }
  const dialog = Utils.getElement('preview-dialog');
  const titleEl = Utils.getElement('preview-dialog-title');
  const content = Utils.getElement('preview-content');
  if (!dialog || !titleEl || !content) return;
  titleEl.textContent = note.title;
  titleEl._noteId = noteId;
  const noteContent = note.content || await _dataLoader.loadNoteContent(noteId);
  content.innerHTML = `<div class="mb-3 flex items-center gap-2 flex-wrap">
    <span class="text-xs text-gray-400 bg-dark-lighter px-2 py-0.5 rounded">${Utils.escapeHtml(note.category)}</span>
    <span class="text-xs text-gray-500">修改${note.revision_count}次</span>
    <span class="text-xs text-gray-500">${new Date(note.updated_at).toLocaleString('zh-CN', {hour12: false})}</span>
  </div>
  <div class="prose prose-invert max-w-none">${noteContent || '<span class="text-gray-400">内容为空</span>'}</div>`;
  dialog.style.zIndex = '10001';
  dialog.style.display = 'flex';
}

// 编辑笔记
export function _editNote(noteId) {
  const state = AppState;
  const note = state.allNotes.find(n => n.id === noteId);
  if (!note) {
    if (_toastManager) _toastManager.show('笔记不存在', 'error');
    return;
  }
  if (_dialogManager) _dialogManager.closeAll();
  window._editingNoteId = noteId;
  const localState = _currentEditorState ? _currentEditorState.get() : null;
  const hasLocalDraft = localState && localState.editingNoteId === noteId;
  if (hasLocalDraft) {
    _openEditorWithDraft(note, localState);
  } else {
    _openEditorWithNote(note);
  }
}

function _openEditorWithDraft(note, localState) {
  const titleEl = Utils.getElement('new-note-title');
  const editorEl = Utils.getElement('new-note-editor');
  const catSelectEl = Utils.getElement('new-note-category');
  const tagsInputEl = Utils.getElement('new-note-tags');
  if (titleEl) titleEl.value = localState.title || note.title;
  if (editorEl) editorEl.innerHTML = localState.content || '';
  if (catSelectEl) { if (_noteEditor) _noteEditor.populateCategories(); catSelectEl.value = localState.category || note.categoryId || ''; }
  if (tagsInputEl) tagsInputEl.value = localState.tags || '';
  if (_noteEditor) _noteEditor._initTagDropdown();
  if (_currentEditorState) _currentEditorState.clear();
  const nd = Utils.getElement('new-note-dialog');
  if (nd) { nd.style.display = 'flex'; nd.style.zIndex = '9999'; }
  if (_currentEditorState) _currentEditorState.startAutoSave();
  _updateEditorDialogTitle('编辑' + note.title + ' - 草稿');
  if (_toastManager) _toastManager.show('已加载本地草稿，编辑完后点击保存即可同步到服务器', 'info');
}

async function _openEditorWithNote(note) {
  const title = Utils.getElement('new-note-title');
  const editor = Utils.getElement('new-note-editor');
  const catSelect = Utils.getElement('new-note-category');
  const tagsInput = Utils.getElement('new-note-tags');
  const noteContent = note.content || await _dataLoader.loadNoteContent(note.id);
  if (title) title.value = note.title;
  if (editor) editor.innerHTML = noteContent || '';
  if (catSelect) {
    if (_noteEditor) _noteEditor.populateCategories();
    catSelect.value = note.categoryId || note.category || '';
  }
  if (tagsInput) tagsInput.value = (note.tags && Array.isArray(note.tags)) ? note.tags.join(', ') : '';
  if (_noteEditor) _noteEditor._initTagDropdown();
  if (_currentEditorState) _currentEditorState.clear();
  const nd = Utils.getElement('new-note-dialog');
  if (nd) { nd.style.display = 'flex'; nd.style.zIndex = '9999'; }
  if (_currentEditorState) _currentEditorState.startAutoSave();
  _updateEditorDialogTitle('编辑' + note.title + ' 笔记');
  if (_toastManager) _toastManager.show('正在编辑笔记: ' + note.title, 'info');
}

// 显示分类笔记
export function _showCategoryNotes(catName) {
  const dialog = Utils.getElement('category-dialog');
  if (dialog) {
    if (_chartManager) _chartManager.updateCategoryDetail(catName);
    dialog.style.display = 'flex';
    dialog.style.zIndex = '9999';
  }
}

// 去重工具
export const DedupUtil = {
  generateUniqueName(baseName, existingNames) {
    if (!existingNames.includes(baseName)) return baseName;
    let suffix = 1;
    let newName = baseName + suffix;
    while (existingNames.includes(newName)) {
      suffix++;
      newName = baseName + suffix;
    }
    return newName;
  }
};