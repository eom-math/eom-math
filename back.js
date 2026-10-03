// 엄형국 수학 — 모든 학생 화면 왼쪽 위 「← 뒤로」 버튼
// <body data-back="돌아갈 기본 주소"> 가 있는 페이지에서 .topbar 맨 앞에 뒤로 버튼을 붙임.
// 사이트 안에서 들어왔으면 브라우저 뒤로 가기, 링크(카톡 등)로 바로 열었으면 기본 주소로 이동.
(function () {
  function goBack(fallback) {
    var ref = document.referrer || '';
    var same = ref.indexOf(location.origin) === 0 && ref.split('#')[0] !== location.href.split('#')[0];
    if (same && history.length > 1) history.back();
    else location.href = fallback;
  }
  window.smartBack = goBack;

  function mount() {
    var body = document.body;
    var fb = body.getAttribute('data-back');
    // 학부모처럼 학생 코드 없이 링크로 연 경우엔 메인으로
    var guest = body.getAttribute('data-back-guest');
    if (guest) { var code = null; try { code = localStorage.getItem('omrStudentCode'); } catch (e) {} if (!code) fb = guest; }
    // 따로 만든 뒤로 링크도 같은 방식으로 (예: tower.html 의 a.back[data-smart-back])
    Array.prototype.forEach.call(document.querySelectorAll('a[data-smart-back]'), function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); goBack(a.getAttribute('href')); });
    });
    if (!fb) return;
    var css = document.createElement('style');
    css.textContent =
      '.nav-l{display:flex;align-items:center;gap:10px;min-width:0;}' +
      '.nav-back{flex:0 0 auto;width:36px;height:36px;border-radius:50%;border:1px solid rgba(17,17,20,.14);background:#fff;color:#111114;' +
      'display:grid;place-items:center;padding:0;cursor:pointer;transition:border-color .2s,color .2s;-webkit-tap-highlight-color:transparent;}' +
      '.nav-back:hover{border-color:#111114;color:#D6301F;}' +
      '.nav-back svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;}' +
      '.topbar.nav-auto{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 0;border-bottom:1px solid rgba(17,17,20,.14);margin-bottom:18px;}' +
      '.topbar.nav-auto .brand{font-weight:800;font-size:15px;text-decoration:none;color:#111114;} .topbar.nav-auto .brand span{color:#D6301F;}' +
      '@media print{.nav-back,.topbar.nav-auto{display:none !important;}}';
    document.head.appendChild(css);
    var bar = document.querySelector('.topbar');
    if (!bar) {
      var wrap = document.querySelector('.wrap') || body;
      bar = document.createElement('div');
      bar.className = 'topbar nav-auto';
      bar.innerHTML = '<a class="brand" href="' + (body.getAttribute('data-home') || '../index.html') + '">엄형국 <span>수학</span></a>';
      wrap.insertBefore(bar, wrap.firstChild);
    }
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-back';
    btn.setAttribute('aria-label', '뒤로 가기');
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>';
    btn.addEventListener('click', function () { goBack(fb); });
    var first = bar.firstElementChild;
    var g = document.createElement('div');
    g.className = 'nav-l';
    bar.insertBefore(g, first);
    g.appendChild(btn);
    if (first) g.appendChild(first);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
