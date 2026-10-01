// 엄형국 수학 — 홈 화면 앱(PWA) 공통: 서비스 워커 등록 + 「앱으로 설치」 안내
(function () {
  var me = document.currentScript, base = me ? new URL('.', me.src) : new URL('./', location.href);
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(new URL('sw.js', base).href).catch(function (e) { console.warn('SW', e); });
    });
  }
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  if (standalone) document.documentElement.classList.add('pwa');
  // 설치 안내는 메인·학생 포털에서만 (data-pwa-prompt 가 있는 페이지)
  if (standalone || !document.querySelector('[data-pwa-prompt]')) return;
  var KEY = 'pwaPromptHide', now = Date.now();
  try { if (+localStorage.getItem(KEY) > now) return; } catch (e) {}
  var ua = navigator.userAgent || '', ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && 'ontouchend' in document);
  var inApp = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(ua);
  var deferred = null;

  function css() {
    if (document.getElementById('pwaCss')) return;
    var s = document.createElement('style'); s.id = 'pwaCss';
    s.textContent = '.pwa-bar{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:150;max-width:520px;margin:0 auto;'
      + 'display:flex;align-items:center;gap:12px;background:#111114;color:#fff;border-radius:16px;padding:12px 12px 12px 14px;box-shadow:0 14px 34px rgba(17,17,20,.28);'
      + 'font-family:inherit;animation:pwaUp .35s ease;}@keyframes pwaUp{from{transform:translateY(20px);opacity:0}}'
      + '.pwa-bar img{width:42px;height:42px;border-radius:11px;flex:0 0 auto;}'
      + '.pwa-bar .tx{flex:1;min-width:0;font-size:13px;line-height:1.45;color:rgba(255,255,255,.78);}.pwa-bar .tx b{display:block;color:#fff;font-size:14.5px;font-weight:800;}'
      + '.pwa-bar .go{flex:0 0 auto;border:0;background:#D6301F;color:#fff;font:inherit;font-size:13.5px;font-weight:800;padding:10px 13px;border-radius:10px;cursor:pointer;}'
      + '.pwa-bar .x{flex:0 0 auto;border:0;background:none;color:rgba(255,255,255,.55);font-size:20px;line-height:1;padding:4px;cursor:pointer;}'
      + '.pwa-ios{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;vertical-align:-4px;margin:0 2px;}';
    document.head.appendChild(s);
  }
  function hide(days) {
    var b = document.getElementById('pwaBar'); if (b) b.remove();
    try { localStorage.setItem(KEY, String(now + (days || 14) * 864e5)); } catch (e) {}
  }
  function show(html, btn, onGo) {
    if (document.getElementById('pwaBar') || document.body.classList.contains('gate-open')) return;
    css();
    var bar = document.createElement('div'); bar.className = 'pwa-bar'; bar.id = 'pwaBar'; bar.setAttribute('role', 'dialog');
    bar.innerHTML = '<img src="' + new URL('icons/icon-192.png', base).href + '" alt=""><div class="tx">' + html + '</div>'
      + (btn ? '<button class="go" type="button">' + btn + '</button>' : '') + '<button class="x" type="button" aria-label="닫기">×</button>';
    document.body.appendChild(bar);
    bar.querySelector('.x').onclick = function () { hide(14); };
    if (btn) bar.querySelector('.go').onclick = onGo;
  }
  var SHARE = '<svg class="pwa-ios" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  // 안드로이드 크롬·삼성 인터넷·PC 크롬: 설치 버튼
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    setTimeout(function () {
      show('<b>엄형국 수학 앱 설치</b>홈 화면에서 바로 열고, 시험·과제·리포트를 앱처럼 써요.', '설치', function () {
        deferred.prompt();
        deferred.userChoice.then(function (r) { hide(r && r.outcome === 'accepted' ? 3650 : 14); deferred = null; });
      });
    }, 1500);
  });
  window.addEventListener('appinstalled', function () { hide(3650); });
  // 아이폰: 사파리에서 「공유 → 홈 화면에 추가」 안내
  if (ios) setTimeout(function () {
    if (inApp) show('<b>앱처럼 쓰려면 사파리로 열어 주세요</b>오른쪽 아래 메뉴에서 「Safari로 열기」를 누른 뒤 홈 화면에 추가하세요.', '', null);
    else show('<b>홈 화면에 앱으로 추가하기</b>아래 ' + SHARE + ' 공유 버튼 → 「홈 화면에 추가」를 누르세요.', '', null);
  }, 2500);
})();
