/**
 * 恢复对话框 - 重开笔记时检测未保存的本地草稿
 * 显示三个选项：恢复草稿 / 查看版本历史 / 丢弃草稿
 */
import { computeDiff, renderDiffAsHtml, getDiffStats } from '../../shared/utils/diff.js';

/**
 * 显示恢复对话框
 * @param {Object} params
 * @param {Object} params.localDraft - 本地草稿 { title, content, savedAt }
 * @param {Object} params.serverNote - 服务端最新笔记 { title, content, updatedAt }
 * @param {Function} params.onRestore - 恢复草稿回调
 * @param {Function} params.onDiscard - 丢弃草稿回调
 * @param {Function} params.onShowHistory - 查看版本历史回调
 * @returns {HTMLElement} 对话框 DOM 元素
 */
export function showRestoreDialog({ localDraft, serverNote, onRestore, onDiscard, onShowHistory, onPushToServer }) {
  // 移除已存在的对话框
  const existing = document.getElementById('restore-dialog-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'restore-dialog-overlay';
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '10000';

  // 解密内容用于显示（如果可能）
  let localContent = localDraft?.content || '';
  let serverContent = serverNote?.content || '';

  // 尝试解密（使用 decrypt）
  // 注：前端解密需要 masterKey，这里使用原始内容（密文）进行差异比较
  // 解密逻辑由调用方在 onRestore 回调中处理

  // 生成差异对比
  const diffs = computeDiff(serverContent, localContent);
  const stats = getDiffStats(diffs);
  const diffHtml = renderDiffAsHtml(diffs);

  const savedAt = localDraft?.savedAt ? new Date(localDraft.savedAt).toLocaleString('zh-CN') : '未知';
  const updatedAt = serverNote?.updatedAt ? new Date(serverNote.updatedAt).toLocaleString('zh-CN') : '未知';

  overlay.innerHTML = `
    <div class="modal-content restore-dialog">
      <div class="restore-dialog-header">
        <h3>📝 检测到本地草稿</h3>
        <button class="modal-close-btn" id="restore-dialog-close">&times;</button>
      </div>
      <div class="restore-dialog-body">
        <div class="restore-info">
          <div class="restore-info-item">
            <span class="restore-label">本地草稿：</span>
            <span class="restore-time">${savedAt}</span>
          </div>
          <div class="restore-info-item">
            <span class="restore-label">服务端版本：</span>
            <span class="restore-time">${updatedAt}</span>
          </div>
        </div>

        <div class="restore-stats">
          <span class="stat-add">+${stats.additions} 新增</span>
          <span class="stat-del">-${stats.deletions} 删除</span>
          <span class="stat-equal">${stats.unchanged} 未变</span>
        </div>

        <div class="restore-diff" id="restore-diff-content">
          <pre class="diff-pre">${diffHtml}</pre>
        </div>
      </div>

      <div class="restore-dialog-footer">
        <button class="btn btn-secondary" id="restore-btn-discard">丢弃草稿</button>
        <button class="btn btn-secondary" id="restore-btn-history">📋 版本历史</button>
        <button class="btn btn-primary" id="restore-btn-push">⬆ 推送到服务端</button>
        <button class="btn btn-primary" id="restore-btn-restore">恢复草稿</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 事件绑定
  overlay.querySelector('#restore-btn-restore').addEventListener('click', () => {
    overlay.remove();
    onRestore?.();
  });

  overlay.querySelector('#restore-btn-discard').addEventListener('click', () => {
    overlay.remove();
    onDiscard?.();
  });

  overlay.querySelector('#restore-btn-history').addEventListener('click', () => {
    overlay.remove();
    onShowHistory?.();
  });

  overlay.querySelector('#restore-btn-push').addEventListener('click', () => {
    overlay.remove();
    onPushToServer?.();
  });

  overlay.querySelector('#restore-dialog-close').addEventListener('click', () => {
    overlay.remove();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  return overlay;
}