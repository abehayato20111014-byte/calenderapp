// sw.js の修正後
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    return self.clients.claim();
});

// ❌ 以下の fetch イベント処理は削除してください
// self.addEventListener('fetch', (event) => {});
