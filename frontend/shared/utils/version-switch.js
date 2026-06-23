// ============================================================
// 版本切换工具 - 经典版 / 新UI 互跳
// 自动适应本地开发和生产环境
//
// 部署架构：
// - 经典版和新UI在同一域名下，通过路径区分
// - 经典版: /classic/index.html
// - 新UI:   /modern/index.html (或 /modern/login.html)
//
// 本地开发（两个终端）：
//   后端 Worker (API + 静态资源): cd backend && npm run dev → http://localhost:8787
//   前端 Worker (仅静态资源):     cd frontend && npm run dev → http://localhost:8790
// ============================================================

/**
 * 检测当前环境并返回正确的版本切换 URL
 * @param {'modern'|'classic'} targetVersion - 目标版本
 * @param {'login'|'app'} page - 目标页面
 * @returns {string} 完整的切换 URL
 */
function getSwitchUrl(targetVersion, page = 'login') {
  const host = window.location.hostname;
  const port = window.location.port;
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  if (isLocal) {
    // 本地开发：同一端口下通过路径区分
    const base = port ? `http://${host}:${port}` : `http://${host}:8787`;
    if (targetVersion === 'modern') {
      return `${base}/modern/${page === 'login' ? 'login.html' : 'index.html'}`;
    } else {
      return `${base}/classic/index.html${page === 'login' ? '#login' : ''}`;
    }
  }

  // 生产环境 / 测试环境：同一域名，不同路径
  const origin = window.location.origin;
  if (targetVersion === 'modern') {
    return `${origin}/modern/${page === 'login' ? 'login.html' : 'index.html'}`;
  } else {
    return `${origin}/classic/index.html${page === 'login' ? '#login' : ''}`;
  }
}
