/**
 * Diff 工具 - 用于比较两段文本的差异
 * 支持加密内容（Base64）的逐字符对比
 * 
 * 使用 LCS（最长公共子序列）算法生成差异
 */

/**
 * 计算两个字符串的差异
 * @param {string} oldText - 旧文本
 * @param {string} newText - 新文本
 * @returns {Array<{type: string, text: string}>} 差异片段数组
 *   type: 'equal' | 'delete' | 'insert'
 */
export function computeDiff(oldText, newText) {
  if (!oldText && !newText) return [];
  if (!oldText) return [{ type: 'insert', text: newText }];
  if (!newText) return [{ type: 'delete', text: oldText }];

  const m = oldText.length;
  const n = newText.length;

  // 对于超长文本，使用简化比较（LCS 对长文本性能差）
  if (m > 5000 || n > 5000) {
    return computeSimpleDiff(oldText, newText);
  }

  // 构建 LCS 表
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldText[i - 1] === newText[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯生成差异
  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldText[i - 1] === newText[j - 1]) {
      result.unshift({ type: 'equal', text: oldText[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'insert', text: newText[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'delete', text: oldText[i - 1] });
      i--;
    }
  }

  // 合并连续相同类型的片段
  return mergeDiff(result);
}

/**
 * 简化比较 - 对长文本使用段落级对比
 */
function computeSimpleDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let idx = 0; idx < maxLen; idx++) {
    if (idx >= oldLines.length) {
      result.push({ type: 'insert', text: newLines[idx] + '\n' });
    } else if (idx >= newLines.length) {
      result.push({ type: 'delete', text: oldLines[idx] + '\n' });
    } else if (oldLines[idx] === newLines[idx]) {
      result.push({ type: 'equal', text: oldLines[idx] + '\n' });
    } else {
      result.push({ type: 'delete', text: oldLines[idx] + '\n' });
      result.push({ type: 'insert', text: newLines[idx] + '\n' });
    }
  }

  return result;
}

/**
 * 合并连续相同类型的差异片段
 */
function mergeDiff(diffs) {
  if (diffs.length === 0) return [];

  const merged = [diffs[0]];
  for (let i = 1; i < diffs.length; i++) {
    const last = merged[merged.length - 1];
    if (last.type === diffs[i].type) {
      last.text += diffs[i].text;
    } else {
      merged.push({ ...diffs[i] });
    }
  }
  return merged;
}

/**
 * 将差异渲染为 HTML（用颜色标记变化）
 * @param {Array} diffs - computeDiff 返回的差异数组
 * @returns {string} HTML 字符串
 */
export function renderDiffAsHtml(diffs) {
  return diffs.map(d => {
    const escaped = escapeHtml(d.text);
    switch (d.type) {
      case 'insert':
        return `<span class="diff-insert">${escaped}</span>`;
      case 'delete':
        return `<span class="diff-delete">${escaped}</span>`;
      default:
        return `<span class="diff-equal">${escaped}</span>`;
    }
  }).join('');
}

/**
 * 获取差异统计
 * @param {Array} diffs - computeDiff 返回的差异数组
 * @returns {{ additions: number, deletions: number, unchanged: number }}
 */
export function getDiffStats(diffs) {
  let additions = 0, deletions = 0, unchanged = 0;
  for (const d of diffs) {
    if (d.type === 'insert') additions += d.text.length;
    else if (d.type === 'delete') deletions += d.text.length;
    else unchanged += d.text.length;
  }
  return { additions, deletions, unchanged };
}

/**
 * 简单内容比较（不生成详细diff，只判断是否相同）
 * @param {string} a 
 * @param {string} b 
 * @returns {boolean}
 */
export function isContentEqual(a, b) {
  return (a || '') === (b || '');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}