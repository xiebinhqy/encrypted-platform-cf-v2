// sw.js v1.1.0 — Service Worker 缓存策略
// 缓存静态资源 + API 响应，提升二次访问速度
// 策略：静态资源缓存优先，API 响应 stale-while-revalidate

const CACHE_NAME = 'encrypted-notes-v2-v5';
const API_CACHE_NAME = 'encrypted-notes-api-v1';
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

// API 请求：stale-while-revalidate + 自动重试
async function fetchWithCache(request) {
  // 尝试从缓存获取
  const cachedResponse = await caches.open(API_CACHE_NAME).then(cache => cache.match(request));
  
  // 并发：从网络获取最新数据
  const fetchPromise = fetch(request.clone()).then(async (response) => {
    if (response && response.status === 200) {
      const cache = await caches.open(API_CACHE_NAME);
      // 只缓存 GET 请求（非敏感 API）
      if (request.method === 'GET') {
        cache.put(request, response.clone());
      }
    }
    return response;
  }).catch(async (err) => {
    console.warn('[SW] API 网络请求失败:', err.message);
    // 如果有缓存，返回缓存（容忍过期）
    if (cachedResponse) {
      return cachedResponse;
    }
    // 无缓存→返回错误响应
    return new Response(JSON.stringify({ error: '网络不可用' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 503
    });
  });

  // 如果有缓存，立即返回（即使可能过期），同时后台更新
  if (cachedResponse) {
    // 后台静默更新缓存（不阻塞 UI）
    fetchPromise.then(() => {}).catch(() => {});
    return cachedResponse;
  }

  // 无缓存 → 等待网络结果
  return fetchPromise;
}

// 请求拦截
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. 跨域请求直接 passthrough
  if (url.origin !== self.location.origin) {
    return;
  }

  // 2. 只处理 GET 请求
  if (event.request.method !== 'GET') return;

  // 3. API 请求：stale-while-revalidate 策略（先返回缓存，后台刷新）
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/user/') || 
      url.pathname.startsWith('/notes') || url.pathname.startsWith('/note/') || 
      url.pathname.startsWith('/categories') || url.pathname.startsWith('/category') || 
      url.pathname.startsWith('/share/') || url.pathname.startsWith('/settings')) {
    event.respondWith(fetchWithCache(event.request));
    return;
  }

  // 4. 静态资源：缓存优先 + 网络回退
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/modern/login.html');
        }
        return new Response('');
      });
    })
  );
});
