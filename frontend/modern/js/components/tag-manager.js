// components/tag-manager.js — 标签管理
'use strict';

import { encrypt } from "../../../shared/crypto/index.js";
import { API_BASE, saveNote as apiSave, deleteNote as apiDeleteNote } from "../../../shared/api/index.js";
import { DataLoader } from "../services/data-loader.js";
import AppState from "../core/state.js";
import { Utils } from "../core/utils.js";

let _toastManager = null;
let _logManager = null;
let _dashboardUpdater = null;

export function injectDeps(deps) {
  _toastManager = deps.toastManager;
  _logManager = deps.logManager;
  _dashboardUpdater = deps.dashboardUpdater;
}

export function _openEditTagDialog(tagName) {
  const dialog = Utils.getElement('edit-tag-dialog');
  if (!dialog) return;
  const oldNameInput = Utils.getElement('edit-tag-old-name');
  const newNameInput = Utils.getElement('edit-tag-new-name');
  if (oldNameInput) oldNameInput.value = tagName;
  if (newNameInput) { newNameInput.value = tagName; newNameInput.focus(); newNameInput.select(); }
  window._editTagOldName = tagName;
  const errEl = Utils.getElement('edit-tag-error');
  if (errEl) { errEl.classList.add('hidden'); errEl.textContent = ''; }
  dialog.style.display = 'flex';
  dialog.style.zIndex = '9999';
}

export function initEditTagDialogEvents() {
  const editTagSaveBtn = Utils.getElement('edit-tag-save-btn');
  if (!editTagSaveBtn) return;
  editTagSaveBtn.addEventListener('click', async function() {
    const oldNameInput = Utils.getElement('edit-tag-old-name');
    const newNameInput = Utils.getElement('edit-tag-new-name');
    const errEl = Utils.getElement('edit-tag-error');
    if (!oldNameInput || !newNameInput) return;
    const oldName = oldNameInput.value.trim();
    const newName = newNameInput.value.trim();
    if (!newName) {
      if (errEl) { errEl.textContent = '请输入新标签名称'; errEl.classList.remove('hidden'); }
      _toastManager.show('请输入新标签名称', 'error');
      return;
    }
    if (oldName === newName) {
      _toastManager.show('标签名称未变更', 'info');
      const dialog = Utils.getElement('edit-tag-dialog');
      if (dialog) dialog.style.display = 'none';
      return;
    }
    const state = AppState;
    const taggedNotes = state.allNotes.filter(n => n.tags && n.tags.includes(oldName));
    if (taggedNotes.length === 0) {
      _toastManager.show('未找到包含此标签的笔记', 'info');
      const dialog = Utils.getElement('edit-tag-dialog');
      if (dialog) dialog.style.display = 'none';
      return;
    }
    try {
      let successCount = 0;
      for (const note of taggedNotes) {
        const newTags = note.tags.map(t => t === oldName ? newName : t);
        const tagsData = newTags.length > 0 ? JSON.stringify(newTags) : '';
        const tagsCipher = tagsData ? await encrypt(tagsData, state.masterKey) : '';
        const noteContent = note.content || await DataLoader.loadNoteContent(note.id) || '';
        const contentCipher = await encrypt(noteContent, state.masterKey);
        const categoryCipher = await encrypt(note.category || '未分类', state.masterKey);
        const titleCipher = await encrypt(note.title, state.masterKey);
        const res = await apiSave(API_BASE, state.userId, {
          id: note.id, title_cipher: titleCipher, ciphertext: contentCipher,
          category_cipher: categoryCipher, tags_cipher: tagsCipher
        });
        if (res.ok) successCount++;
      }
      if (successCount > 0) {
        _toastManager.show(`已更新标签「${oldName}」为「${newName}」(更新${successCount}篇笔记)`, 'success');
        const dialog = Utils.getElement('edit-tag-dialog');
        if (dialog) dialog.style.display = 'none';
        // 🚀 使用 loadAll 但不显示 loading（标签更新涉及笔记内容修改，需要完整刷新）
        await DataLoader.loadAll();
        _dashboardUpdater.refreshAll();
        _dashboardUpdater._populateTagsDialog();
      } else {
        _toastManager.show('更新标签失败', 'error');
      }
    } catch (e) {
      _toastManager.show('更新标签失败: ' + e.message, 'error');
    }
  });
}

export async function _deleteTag(tagName) {
  const state = AppState;
  const taggedNotes = state.allNotes.filter(n => n.tags && n.tags.includes(tagName));
  if (taggedNotes.length === 0) {
    _toastManager.show('未找到包含此标签的笔记', 'info');
    return;
  }
  let successCount = 0;
  for (const note of taggedNotes) {
    try {
      const res = await apiDeleteNote(API_BASE, state.userId, note.id);
      if (res.ok) successCount++;
    } catch (e) {}
  }
  if (successCount > 0) {
    _toastManager.show(`已将标签「${tagName}」对应的 ${successCount} 篇笔记移入回收站`, 'success');
    await DataLoader.loadAll();
    _dashboardUpdater.refreshAll();
    _dashboardUpdater._populateTagsDialog();
  } else {
    _toastManager.show('删除失败', 'error');
  }
}