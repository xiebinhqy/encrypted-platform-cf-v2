/**
 * 版本历史面板 - 显示笔记的所有历史版本
 * 支持版本对比和恢复
 */
import { fetchNoteVersions, restoreNoteVersion, fetchVersionDetail } from '../../shared/api/version.api.js';
import { computeDiff, renderDiffAsHtml, getDiffStats } from '../../shared/utils/diff.js';
import { decrypt } from '../../shared/crypto/index.js';

let currentPanel = null;

/**
 * 显示版本历史面板
 * @param {Object} params
 * @param {string} params.apiBase - API 基础地址
 * @param {string} params.userId - 用户 ID
 * @param {string} params.noteId - 笔记 ID
 * @param {Function} params.onRestore - 恢复后回调（接收 { title, content }）
 */
let _masterKey = '';

export async function showVersionHistory({ apiBase, userId, noteId, onRestore, masterKey }) {
  _masterKey = masterKey || '';
  closeVersionHistory();

  // 创建面板
  const panel = document.createElement('div');
  panel.id = 'version-history-panel';
  panel.className = 'version-history-panel';
  panel.innerHTML = `
    <div class="vh-header">
      <h3>📋 版本历史</h3>
      <button class="vh-close-btn" id="vh-close">&times;</button>
    </div>
    <div class="vh-body" id="vh-body">
      <div class="vh-loading">加载中...</div>
    </div>
  `;

  document.body.appendChild(panel);
  currentPanel = panel;

  // 关闭按钮
  panel.querySelector('#vh-close').addEventListener('click', closeVersionHistory);

  try {
    // 获取版本列表
    const res = await fetchNoteVersions(apiBase, userId, noteId);
    const data = await res.json();
    const versions = Array.isArray(data) ? data : (data.data || []);

    if (versions.length === 0) {
      panel.querySelector('#vh-body').innerHTML = `
        <div class="vh-empty">
          <p>暂无历史版本</p>
          <p class="vh-empty-hint">每次保存笔记时会自动创建版本</p>
        </div>
      `;
      return;
    }

    // 渲染版本列表
    renderVersionList(panel, versions, { apiBase, userId, noteId, onRestore });

  } catch (error) {
    panel.querySelector('#vh-body').innerHTML = `
      <div class="vh-error">加载版本历史失败: ${error.message}</div>
    `;
  }
}

function renderVersionList(panel, versions, ctx) {
  const body = panel.querySelector('#vh-body');

  body.innerHTML = `
    <div class="vh-version-list">
      ${versions.map((v, idx) => `
        <div class="vh-version-item" data-version-id="${v.id}" data-idx="${idx}">
          <div class="vh-version-header">
            <span class="vh-version-label">${escapeHtml(v.version_label || '版本 ' + v.version_number)}</span>
            <span class="vh-version-num">#${v.version_number}</span>
          </div>
          <div class="vh-version-meta">
            ${formatTime(v.created_at)}
          </div>
          <div class="vh-version-actions">
            <button class="vh-btn vh-btn-diff" data-idx="${idx}" title="查看差异">🔍</button>
            <button class="vh-btn vh-btn-restore" data-version-id="${v.id}" title="恢复到此版本">♻️</button>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="vh-compare-section" id="vh-compare-section" style="display:none;">
      <div class="vh-compare-header">
        <span id="vh-compare-title">差异对比</span>
        <button class="vh-btn vh-btn-close-compare" id="vh-close-compare">&times;</button>
      </div>
      <div class="vh-compare-stats" id="vh-compare-stats"></div>
      <div class="vh-compare-diff" id="vh-compare-diff"></div>
      <div class="vh-compare-actions">
        <button class="btn btn-primary btn-sm" id="vh-restore-selected">恢复此版本</button>
      </div>
    </div>
  `;

  // 绑定差异查看
  body.querySelectorAll('.vh-btn-diff').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      showVersionDiff(panel, versions[idx], versions[idx + 1] || null, ctx);
    });
  });

  // 绑定恢复按钮
  body.querySelectorAll('.vh-btn-restore').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const versionId = btn.dataset.versionId;
      handleRestoreVersion(ctx, versionId, versions.find(v => v.id == versionId));
    });
  });

  // 关闭对比
  body.querySelector('#vh-close-compare')?.addEventListener('click', () => {
    body.querySelector('#vh-compare-section').style.display = 'none';
  });
}

async function showVersionDiff(panel, currentVersion, previousVersion, ctx) {
  const section = panel.querySelector('#vh-compare-section');
  const diffDiv = panel.querySelector('#vh-compare-diff');
  const statsDiv = panel.querySelector('#vh-compare-stats');
  const titleSpan = panel.querySelector('#vh-compare-title');
  const restoreBtn = panel.querySelector('#vh-restore-selected');

  section.style.display = 'block';
  diffDiv.innerHTML = '<div class="vh-loading">加载版本内容...</div>';

  try {
    // 获取两个版本的详细内容
    const [currentData, previousData] = await Promise.all([
      getVersionDetail(ctx.apiBase, ctx.userId, currentVersion.id),
      previousVersion ? getVersionDetail(ctx.apiBase, ctx.userId, previousVersion.id) : null
    ]);

    // 内容已经是密文，直接用于差异比较
    const currentContent = currentData?.content || '';
    const previousContent = previousData?.content || '';

    titleSpan.textContent = previousVersion
      ? `版本 #${currentVersion.version_number} vs #${previousVersion.version_number}`
      : `版本 #${currentVersion.version_number}（最新）`;

    const diffs = computeDiff(previousContent, currentContent);
    const stats = getDiffStats(diffs);

    statsDiv.innerHTML = `
      <span class="stat-add">+${stats.additions}</span>
      <span class="stat-del">-${stats.deletions}</span>
      <span class="stat-equal">${stats.unchanged}</span>
    `;

    diffDiv.innerHTML = `<pre class="diff-pre">${renderDiffAsHtml(diffs)}</pre>`;

    // 恢复按钮
    restoreBtn.onclick = () => handleRestoreVersion(ctx, currentVersion.id, currentVersion);

  } catch (error) {
    diffDiv.innerHTML = `<div class="vh-error">加载失败: ${error.message}</div>`;
  }
}

async function handleRestoreVersion(ctx, versionId, versionInfo) {
  if (!confirm(`确定要恢复到 "${versionInfo.version_label || '版本 ' + versionInfo.version_number}" 吗？`)) return;

  try {
    const res = await restoreNoteVersion(ctx.apiBase, ctx.userId, versionId);
    const data = await res.json();

    if (res.ok && data) {
      const versionData = data.data || data;
      if (versionData && versionData.content) {
        // 版本数据是密文，需要先解密再放入编辑器
        let title = versionData.title || '';
        let content = versionData.content || '';
        let category = versionData.category || '';
        let tags = versionData.tags || '';
        if (_masterKey) {
          try { title = await decrypt(title, _masterKey); } catch (e) {}
          try { content = await decrypt(content, _masterKey); } catch (e) {}
          try { category = await decrypt(category, _masterKey); } catch (e) {}
          try { tags = await decrypt(tags, _masterKey); } catch (e) {}
        }
        ctx.onRestore?.({ title, content, category, tags });
        closeVersionHistory();
      } else {
        alert('恢复失败: 版本内容为空');
      }
    } else {
      alert('恢复失败: ' + (data.err || '未知错误'));
    }
  } catch (error) {
    alert('恢复失败: ' + error.message);
  }
}

async function getVersionDetail(apiBase, userId, versionId) {
  const res = await fetchVersionDetail(apiBase, userId, versionId);
  const data = await res.json();
  const raw = data.data || data || null;
  if (!raw || !_masterKey) return raw;
  // 解密版本内容
  const result = { ...raw };
  if (result.title) {
    try { result.title = await decrypt(result.title, _masterKey); } catch (e) {}
  }
  if (result.content) {
    try { result.content = await decrypt(result.content, _masterKey); } catch (e) {}
  }
  return result;
}

export function closeVersionHistory() {
  const panel = document.getElementById('version-history-panel');
  if (panel) {
    panel.remove();
    currentPanel = null;
  }
}

function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;
  return date.toLocaleDateString('zh-CN');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}