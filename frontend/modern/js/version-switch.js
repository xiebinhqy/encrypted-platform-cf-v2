// ============================================================
// 版本切换工具 - 经典版 / 新UI 互跳
// 适配本地 wrangler dev + 生产环境
//
// 本地开发：
//   后端 Worker (API + 静态资源): cd backend && npm run dev → http://localhost:8787
//   前端 Worker (仅静态资源):     cd frontend && npm run dev → http://localhost:8790
//
// 生产环境（同一域名）：
//   经典版: ${origin}/classic/index.html
//   新UI:   ${origin}/modern/index.html
// ============================================================

function getSwitchUrl(targetVersion, page = 'login') {
  const host = window.location.hostname;
  const port = window.location.port;
  
  // 本地开发：通过端口区分
  if (host === 'localhost' || host === '127.0.0.1') {
    if (targetVersion === 'modern') {
      // 新UI在端口 8790（前端 Worker）或 8787（后端 Worker）
      const modernPort = (port === '8790' || port === '8787') ? port : '8790';
      return `http://${host}:${modernPort}/modern/${page === 'login' ? 'login.html' : 'index.html'}`;
    } else {
      // 经典版在端口 8790（前端 Worker）或 8787（后端 Worker）
      const classicPort = (port === '8790' || port === '8787') ? port : '8790';
      return `http://${host}:${classicPort}/classic/index.html${page === 'login' ? '#login' : ''}`;
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
