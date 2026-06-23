// sw.js v1.0.0 — Service Worker 缓存策略
// 缓存静态资源，提升二次访问速度和离线体验

const CACHE_NAME = 'encrypted-notes-v2-v4';
const STATIC_ASSETS = [
  '/modern/css/tailwind.css',
  '/modern/css/global.css',
  '/modern/css/app.css',
  '/modern/css/login.css',
  '/modern/js/app.js',
  '/modern/login.html',
  '/modern/manifest.json',
  '/shared/crypto/index.js',
  '/shared/crypto/aes.js',
  '/shared/crypto/key.js',
  '/shared/utils/note-cache.js'
];

// 安装：预缓存核心静态资源（仅同源资源，跨域资源由浏览器直接请求）
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] 预缓存部分资源失败:', err);
        // 逐个缓存，失败的跳过
        return Promise.allSettled(
          STATIC_ASSETS.map(url => cache.add(url).catch(() => null))
        );
      });
    })
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// API 请求自动重试函数
async function fetchWithRetry(request, maxRetries) {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const response = await fetch(request);
      // 如果是 503 且还有重试次数，等待后重试
      if (response.status === 503 && i < maxRetries) {
        console.warn(`[SW] API 返回 503，第 ${i + 1} 次重试...`);
        await new Promise(r => setTimeout(r, (i + 1) * 1000)); // 递增延迟
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
      if (i < maxRetries) {
        console.warn(`[SW] API 请求失败 (${err.message})，第 ${i + 1} 次重试...`);
        await new Promise(r => setTimeout(r, (i + 1) * 1000));
        continue;
      }
    }
  }
  console.error('[SW] API 请求所有重试均失败:', lastError?.message);
  return new Response(JSON.stringify({ error: '网络不可用' }), {
    headers: { 'Content-Type': 'application/json' },
    status: 503
  });
}

// 请求拦截：缓存优先策略（静态资源） / 网络优先策略（API请求）
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. 跨域请求直接 passthrough（Font Awesome 字体、Google Fonts、CDN 等）
  //    不拦截、不缓存，让浏览器直接走网络
  if (url.origin !== self.location.origin) {
    return; // 不调用 event.respondWith()，让浏览器默认处理
  }

  // 2. API 请求：网络优先，不缓存，支持自动重试
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/user/') || url.pathname.startsWith('/notes') || url.pathname.startsWith('/note/') || url.pathname.startsWith('/categories') || url.pathname.startsWith('/category') || url.pathname.startsWith('/share/') || url.pathname.startsWith('/settings')) {
    event.respondWith(
      fetchWithRetry(event.request, 2) // 最多重试 2 次（共 3 次尝试）
    );
    return;
  }

  // 3. 静态资源：缓存优先，仅处理同源 GET 请求
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // 只缓存成功的同源基本响应
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // 克隆响应（因为 response body 只能读取一次）
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // 离线时返回离线页面（如果是导航请求）
        if (event.request.mode === 'navigate') {
          return caches.match('/modern/login.html');
        }
        // 离线时对无法缓存的请求返回空响应（不返回 408，避免干扰）
        return new Response('');
      });
    })
  );
});
