// 옛 주소에 설치된 서비스 워커를 정리합니다 (저장된 옛 화면 삭제 후 스스로 해제).
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.registration.unregister(); })
  );
});
