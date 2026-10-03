// 엄형국 수학 — 10분 단위 시간 범위 드래그 선택기
// TR.mount(host, { start:'18:00', end:'21:00', min:7*60, max:24*60, onChange(s,e) }) → { get(), set(s,e), str() }
(function (global) {
  var STEP = 10;
  function pad(n) { return String(n).padStart(2, '0'); }
  function toMin(s) { var m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function toStr(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function dur(m) { var h = Math.floor(m / 60), r = m % 60; return (h ? h + '시간' : '') + (r ? (h ? ' ' : '') + r + '분' : '') || '0분'; }
  // '14:00~17:00' / '14:00' → [s, e]
  function parse(t) {
    var p = String(t || '').split(/[~\-–]/).map(function (x) { return toMin(x.trim()); });
    return p[0] == null ? null : [p[0], p[1] != null ? p[1] : p[0] + 60];
  }
  var CSS = '.tr{user-select:none;-webkit-user-select:none;touch-action:none;padding:2px 0 4px;}'
    + '.tr-top{display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;}'
    + '.tr-v{font-size:17px;font-weight:900;font-variant-numeric:tabular-nums;letter-spacing:-.01em;}'
    + '.tr-d{font-size:12px;font-weight:700;color:#63636B;background:#F1F0EC;border-radius:99px;padding:2px 8px;}'
    + '.tr-nb{margin-left:auto;display:flex;gap:3px;}'
    + '.tr-nb button{border:1px solid rgba(17,17,20,.12);background:#fff;border-radius:7px;height:28px;min-width:28px;padding:0 6px;font-size:12px;font-weight:800;color:#111114;}'
    + '.tr-nb small{align-self:center;font-size:11px;font-weight:800;color:#9A9AA2;margin:0 2px;}'
    + '.tr-track{position:relative;height:44px;cursor:pointer;}'
    + '.tr-rail{position:absolute;left:0;right:0;top:12px;height:12px;border-radius:99px;background:#ECEAE4;}'
    + '.tr-sel{position:absolute;top:12px;height:12px;border-radius:99px;background:#111114;}'
    + '.tr-h{position:absolute;top:4px;width:28px;height:28px;margin-left:-14px;border-radius:50%;background:#fff;border:3px solid #111114;box-shadow:0 2px 6px rgba(0,0,0,.18);cursor:grab;touch-action:none;}'
    + '.tr-h.on{background:#D6301F;border-color:#D6301F;cursor:grabbing;transform:scale(1.12);}'
    + '.tr-tk{position:absolute;top:30px;font-size:10px;font-weight:700;color:#9A9AA2;transform:translateX(-50%);white-space:nowrap;pointer-events:none;}'
    + '.tr-tk:before{content:"";position:absolute;left:50%;top:-6px;width:1px;height:4px;background:#C9C7C0;}';
  function injectCss() { if (document.getElementById('trCss')) return; var s = document.createElement('style'); s.id = 'trCss'; s.textContent = CSS; document.head.appendChild(s); }

  function mount(host, o) {
    injectCss(); o = o || {};
    var min = o.min != null ? o.min : 7 * 60, max = o.max != null ? o.max : 24 * 60;
    var s = toMin(o.start), e = toMin(o.end);
    if (s == null) s = 18 * 60; if (e == null || e <= s) e = Math.min(max, s + 120);
    var active = 1; // 화살표 버튼이 움직일 손잡이 (0 시작, 1 끝)
    var ticks = ''; for (var h = Math.ceil(min / 60); h * 60 <= max; h++) { if ((h - Math.ceil(min / 60)) % 2) continue;
      ticks += '<span class="tr-tk" style="left:' + ((h * 60 - min) / (max - min) * 100) + '%">' + h + '시</span>'; }
    host.innerHTML = '<div class="tr"><div class="tr-top"><span class="tr-v"></span><span class="tr-d"></span>'
      + '<span class="tr-nb"><small class="tr-which">끝</small><button type="button" data-n="-10" aria-label="10분 앞으로">−10분</button><button type="button" data-n="10" aria-label="10분 뒤로">+10분</button></span></div>'
      + '<div class="tr-track"><div class="tr-rail"></div><div class="tr-sel"></div>' + ticks
      + '<div class="tr-h" data-h="0" role="slider" tabindex="0" aria-label="시작 시간"></div><div class="tr-h" data-h="1" role="slider" tabindex="0" aria-label="끝 시간"></div></div></div>';
    var tr = host.querySelector('.tr-track'), hs = host.querySelectorAll('.tr-h');
    function pct(m) { return (m - min) / (max - min) * 100; }
    function draw() {
      hs[0].style.left = pct(s) + '%'; hs[1].style.left = pct(e) + '%';
      var sel = host.querySelector('.tr-sel'); sel.style.left = pct(s) + '%'; sel.style.width = (pct(e) - pct(s)) + '%';
      host.querySelector('.tr-v').textContent = toStr(s) + ' ~ ' + toStr(e);
      host.querySelector('.tr-d').textContent = dur(e - s);
      host.querySelector('.tr-which').textContent = active ? '끝' : '시작';
      hs[0].setAttribute('aria-valuetext', toStr(s)); hs[1].setAttribute('aria-valuetext', toStr(e));
    }
    function emit() { draw(); if (o.onChange) o.onChange(toStr(s), toStr(e)); }
    function setHandle(i, m) {
      m = Math.max(min, Math.min(max, Math.round(m / STEP) * STEP));
      if (i === 0) s = Math.min(m, e - STEP); else e = Math.max(m, s + STEP);
    }
    function minAt(x) { var r = tr.getBoundingClientRect(); return min + (Math.max(0, Math.min(r.width, x - r.left)) / r.width) * (max - min); }
    var drag = null;
    tr.addEventListener('pointerdown', function (ev) {
      var h = ev.target.closest('.tr-h'), m = minAt(ev.clientX);
      var i = h ? +h.dataset.h : (Math.abs(m - s) <= Math.abs(m - e) ? 0 : 1);
      drag = i; active = i; hs[i].classList.add('on');
      try { tr.setPointerCapture(ev.pointerId); } catch (x) {}
      setHandle(i, m); emit(); ev.preventDefault();
    });
    tr.addEventListener('pointermove', function (ev) { if (drag == null) return; setHandle(drag, minAt(ev.clientX)); emit(); });
    function end() { if (drag == null) return; hs[drag].classList.remove('on'); drag = null; }
    tr.addEventListener('pointerup', end); tr.addEventListener('pointercancel', end);
    host.querySelector('.tr-nb').addEventListener('click', function (ev) { var b = ev.target.closest('[data-n]'); if (!b) return; setHandle(active, (active ? e : s) + (+b.dataset.n)); emit(); });
    hs.forEach(function (h) { h.addEventListener('keydown', function (ev) {
      var d = ev.key === 'ArrowRight' || ev.key === 'ArrowUp' ? STEP : ev.key === 'ArrowLeft' || ev.key === 'ArrowDown' ? -STEP : 0;
      if (!d) return; active = +h.dataset.h; setHandle(active, (active ? e : s) + d); emit(); ev.preventDefault(); });
      h.addEventListener('focus', function () { active = +h.dataset.h; draw(); }); });
    draw();
    return {
      get: function () { return [toStr(s), toStr(e)]; },
      str: function () { return toStr(s) + '~' + toStr(e); },
      set: function (a, b) { var x = toMin(a), y = toMin(b); if (x == null) return; s = Math.max(min, x); e = y != null && y > s ? Math.min(max, y) : Math.min(max, s + 60); draw(); },
    };
  }
  global.TR = { mount: mount, parse: parse, toMin: toMin, toStr: toStr };
})(typeof window !== 'undefined' ? window : globalThis);
