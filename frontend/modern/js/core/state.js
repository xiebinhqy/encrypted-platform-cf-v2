// core/state.js — 全局状态管理
'use strict';

const AppState = {
  _charts: {},
  _masterKey: "",
  _userId: "",
  _allNotes: [],
  _allCategories: [],
  _noteContentCache: {},
  _eventLogs: [],
  // 三层密码体系字段
  _isDecrypted: false,    // 是否已解密（false = 加密模式，显示密文）
  _loginPassword: "",     // 登录密码（原始文本，用于 hash 验证）
  _decryptKey: "",        // 解密密码（AES-GCM 密钥原材料）
  _lockPassword: "",      // 锁屏密码

  get charts() { return this._charts; },
  set charts(v) { this._charts = v; },
  get masterKey() { return this._masterKey; },
  set masterKey(v) { this._masterKey = v; },
  get userId() { return this._userId; },
  set userId(v) { this._userId = v; },
  get allNotes() { return this._allNotes; },
  set allNotes(v) { this._allNotes = v; },
  get allCategories() { return this._allCategories; },
  set allCategories(v) { this._allCategories = v; },
  get noteContentCache() { return this._noteContentCache; },
  get eventLogs() { return this._eventLogs; },
  set eventLogs(v) { this._eventLogs = v; },
  get isDecrypted() { return this._isDecrypted; },
  set isDecrypted(v) { this._isDecrypted = v; },
  get loginPassword() { return this._loginPassword; },
  set loginPassword(v) { this._loginPassword = v; },
  get decryptKey() { return this._decryptKey; },
  set decryptKey(v) { this._decryptKey = v; },
  get lockPassword() { return this._lockPassword; },
  set lockPassword(v) { this._lockPassword = v; },

  // 从 sessionStorage 恢复登录态
  restoreSession() {
    this._userId = sessionStorage.getItem('userId') || "";
    this._masterKey = sessionStorage.getItem('masterKey') || "";
    this._decryptKey = sessionStorage.getItem('decryptKey') || "";
    this._lockPassword = sessionStorage.getItem('lockPassword') || "";
    return this._userId && !!this._masterKey;
  },

  // 清除解密态（锁定/登出时调用）
  // 仅清理解密相关状态，保留 masterKey（登录态）
  clearDecryptedState() {
    this._isDecrypted = false;
    this._decryptKey = "";
    this._lockPassword = "";
    sessionStorage.removeItem('decryptKey');
    sessionStorage.removeItem('lockPassword');
  },

  // 设置解密态
  // decryptKey = 解密密码（AES-GCM 密钥），与 masterKey（登录密码）严格分离
  setDecrypted(decryptKey) {
    this._decryptKey = decryptKey;
    this._isDecrypted = true;
    sessionStorage.setItem('decryptKey', decryptKey);
  }
};

export default AppState;