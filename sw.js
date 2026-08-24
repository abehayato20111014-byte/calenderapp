// sw.js （ファイル内に以下を記述）
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // キャッシュ処理等を記述しない場合は空でも問題ありません
});