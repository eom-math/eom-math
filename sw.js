// 엄형국 수학 — 서비스 워커 (홈 화면 앱)
// 원칙: 항상 최신 사이트를 먼저 받고(network-first), 인터넷이 끊겼을 때만 저장해 둔 화면을 보여줌.
// Firebase·외부 요청은 건드리지 않음 (실시간 데이터는 언제나 서버에서).
const VERSION = 'eom-v3';
const CORE = ['./', 'index.html', 'offline.html', 'omr/', 'omr/index.html', 'omr/omr.css?v=6',
  'icons/icon-192.png', 'icons/icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                // Firebase·폰트·CDN은 그대로 통과
  e.respondWith((async () => {
    try {
      // 페이지·스크립트·스타일은 항상 서버에 새 버전이 있는지 확인 (브라우저 캐시 때문에 옛 화면이 뜨지 않게)
      const res = await fetch(req, { cache: 'no-cache' });
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match('offline.html')) || Response.error();
      return Response.error();
    }
  })());
});
