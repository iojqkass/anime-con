/**
 * 次元汇 PWA Service Worker
 * 功能：离线缓存、快速加载、资源预缓存
 */

const CACHE_NAME = 'ciyuanhui-v1';
const ASSETS_TO_PRECACHE = [
  '.',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

// 安装事件 - 预缓存关键资源
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching app shell');
        return cache.addAll(ASSETS_TO_PRECACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 拦截网络请求 - 缓存优先策略
self.addEventListener('fetch', (event) => {
  // 跳过非GET请求和跨域请求
  if (event.request.method !== 'GET') return;
  
  // 跳过Chrome扩展等非http(s)请求
  if (!event.request.url.startsWith('http')) return;
  
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // 如果有缓存，返回缓存（同时后台更新）
        if (cachedResponse) {
          // 后台更新缓存
          fetchAndCache(event.request);
          return cachedResponse;
        }
        
        // 没有缓存，从网络获取
        return fetchAndCache(event.request);
      })
      .catch(() => {
        // 网络失败且无缓存时，返回离线页面（可选）
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      })
  );
});

// 获取并缓存资源
async function fetchAndCache(request) {
  try {
    const response = await fetch(request);
    
    // 只缓存成功的响应
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.log('[SW] Fetch failed:', error);
    throw error;
  }
}

// 后台同步（可选，用于离线操作）
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  // 可在此处理离线时的数据同步
});

// 推送通知（可选）
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');
  
  const options = {
    body: event.data ? event.data.text() : '次元汇有新内容更新！',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      { action: 'explore', title: '查看详情' },
      { action: 'close', title: '关闭' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('次元汇', options)
  );
});

// 通知点击事件
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event.action);
  
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
