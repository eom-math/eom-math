// 엄형국 수학 — 칭찬 공지 (메인 화면 배너 + 팝업 카드). 관리 화면(omr/notice.html)의 미리보기도 같은 코드를 씀
(function (global) {
  var KINDS = {
    focus:   { emoji: '⏱️', label: '순공왕',    title: '순공왕',          color: '#E8432F', soft: '#FFF1EC' },
    planner: { emoji: '📒', label: '플래너왕',  title: '우수 스터디 플래너', color: '#F29B1F', soft: '#FFF6E6' },
    exam:    { emoji: '🏆', label: '시험 1등',  title: '1등',             color: '#C9A227', soft: '#FFF9E3' },
    qna:     { emoji: '🙋', label: '질문왕',    title: '질문왕',          color: '#3B6FE0', soft: '#EEF3FF' },
    review:  { emoji: '🔁', label: '복습왕',    title: '복습왕',          color: '#1F7A4D', soft: '#EAF6EF' },
    game:    { emoji: '🎮', label: '개념게임왕', title: '개념게임왕',       color: '#7A4FE0', soft: '#F3EEFF' },
    custom:  { emoji: '✏️', label: '직접 쓰기', title: '칭찬 공지',        color: '#111114', soft: '#F1F0EC' },
  };
  var SUBJ_C = { '1': '#FF7B63', '2': '#F2B92B', '3': '#5BB2E0', '4': '#5DBE7E', '5': '#A88BE8' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hm(sec) { var m = Math.round(sec / 60); return m >= 60 ? Math.floor(m / 60) + '시간 ' + (m % 60) + '분' : m + '분'; }
  function md(d) { if (!d) return ''; var t = new Date(d + 'T00:00:00'); return isNaN(t) ? '' : (t.getMonth() + 1) + '/' + t.getDate() + '(' + '일월화수목금토'[t.getDay()] + ')'; }

  function detailHtml(n) {
    var d = n.detail || {}, k = n.kind, h = '';
    if (k === 'focus') {
      h += '<div class="np-chips">' + (d.sessions ? '<span>⏱️ 집중 ' + d.sessions + '회</span>' : '') + (d.days ? '<span>📅 ' + d.days + '일 공부</span>' : '') + '</div>';
      if (d.top && d.top.length) {
        var mx = d.top[0].sec || 1;
        h += '<div class="np-sub">이번 주 순공 TOP 3</div><div class="np-rank">' + d.top.map(function (t, i) {
          return '<div><span class="m">' + ['🥇', '🥈', '🥉'][i] + '</span><span class="nm">' + esc(t.nick) + '</span><span class="bar"><i style="width:' + Math.max(6, t.sec / mx * 100) + '%"></i></span><span class="v">' + hm(t.sec) + '</span></div>';
        }).join('') + '</div>';
      }
    } else if (k === 'planner') {
      if (d.pledge) h += '<div class="np-pledge">✏️ “' + esc(d.pledge) + '”</div>';
      if (d.todos && d.todos.length) {
        h += '<div class="np-sub">' + md(d.date) + ' 플래너 · 할 일 ' + (d.done || 0) + '/' + (d.total || 0) + (d.sticker ? ' ' + esc(d.sticker) : '') + '</div><ul class="np-todo">' + d.todos.map(function (t) {
          return '<li class="' + (t.done ? 'dn' : '') + '"><i style="background:' + (SUBJ_C[t.subj] || SUBJ_C['5']) + '"></i><span class="ck">' + (t.done ? '✓' : '') + '</span>' + esc(t.text) + '</li>';
        }).join('') + '</ul>';
      }
      if (d.bySubj && d.bySubj.length) {
        var tot = d.bySubj.reduce(function (s, x) { return s + x.min; }, 0) || 1;
        h += '<div class="np-sub">그날 공부 시간 ' + hm((d.studyMin || tot) * 60) + '</div><div class="np-stack">' + d.bySubj.map(function (x) {
          return '<i style="flex:' + x.min + ';background:' + (SUBJ_C[x.k] || SUBJ_C['5']) + '" title="' + esc(x.name) + '"></i>';
        }).join('') + '</div><div class="np-leg">' + d.bySubj.map(function (x) { return '<span><i style="background:' + (SUBJ_C[x.k] || SUBJ_C['5']) + '"></i>' + esc(x.name) + ' ' + hm(x.min * 60) + '</span>'; }).join('') + '</div>';
      }
      if (d.week && d.week.length) {
        var wm = Math.max.apply(null, d.week.map(function (w) { return w.min; }).concat([60]));
        h += '<div class="np-sub">일주일 기록</div><div class="np-week">' + d.week.map(function (w) {
          return '<div><span class="b"><i style="height:' + Math.max(w.min ? 8 : 0, w.min / wm * 100) + '%"></i></span><small>' + '일월화수목금토'[new Date(w.d + 'T00:00:00').getDay()] + '</small></div>';
        }).join('') + '</div>';
      }
    } else if (k === 'exam') {
      h += '<div class="np-chips">' + (d.grade ? '<span class="g">' + d.grade + '등급</span>' : '') + (d.rank ? '<span>석차 ' + d.rank + (d.n ? '/' + d.n : '') + '</span>' : '')
        + (d.avg != null ? '<span>반 평균 ' + d.avg + '</span>' : '') + (d.max ? '<span>만점 ' + d.max + '</span>' : '') + '</div>';
      if (d.avg != null && d.max) {
        h += '<div class="np-vs"><div><small>' + esc(n.name) + '</small><span class="b"><i style="width:' + (d.score / d.max * 100) + '%"></i></span><b>' + d.score + '</b></div>'
          + '<div class="avg"><small>반 평균</small><span class="b"><i style="width:' + (d.avg / d.max * 100) + '%"></i></span><b>' + d.avg + '</b></div></div>';
      }
    } else if (k === 'qna') {
      h += '<div class="np-chips">' + (d.subjects || []).map(function (s) { return '<span>' + esc(s.k) + ' ' + s.n + '</span>'; }).join('') + '</div>'
        + '<div class="np-note">모르는 걸 그냥 넘기지 않고 끝까지 물어보는 게 실력이 되는 가장 빠른 길이에요.</div>';
    } else if (k === 'review') {
      if (d.tests && d.tests.length) {
        h += '<div class="np-sub">이번 주 복습 테스트</div><div class="np-week tall">' + d.tests.map(function (t) {
          var p = t.max ? t.score / t.max * 100 : t.score;
          return '<div><b>' + t.score + '</b><span class="b"><i style="height:' + Math.max(6, p) + '%"></i></span><small>' + md(t.date).replace(/\(.\)/, '') + '</small></div>';
        }).join('') + '</div>';
      }
    } else if (k === 'game') {
      h += '<div class="np-chips">' + (d.game ? '<span>🎮 ' + esc(d.game) + '</span>' : '') + (d.tries ? '<span>도전 ' + d.tries + '회</span>' : '')
        + (d.timeMs ? '<span>⏱ ' + Math.round(d.timeMs / 1000) + '초</span>' : '') + '</div>';
    }
    return h;
  }

  function popupHtml(n, preview) {
    var K = KINDS[n.kind] || KINDS.custom;
    return '<div class="np" style="--nc:' + K.color + ';--ns:' + K.soft + '">'
      + '<div class="np-top"><span class="np-k">' + K.emoji + ' ' + esc(K.label) + '</span>' + (preview ? '' : '<button type="button" class="np-x" aria-label="닫기">✕</button>') + '</div>'
      + '<div class="np-hero"><div class="np-e">' + K.emoji + '</div><div class="np-t">' + esc(n.title) + '</div>'
      + (n.name ? '<div class="np-n">' + esc(n.name) + (n.className ? ' <small>' + esc(n.className) + '</small>' : '') + '</div>' : '') + '</div>'
      + (n.stat ? '<div class="np-stat"><b>' + esc(n.stat) + '</b>' + (n.statLabel ? '<span>' + esc(n.statLabel) + '</span>' : '') + '</div>' : '')
      + '<div class="np-body">' + detailHtml(n) + '</div>'
      + (n.message ? '<div class="np-msg"><span>선생님 한마디</span>' + esc(n.message) + '</div>' : '')
      + '<div class="np-foot">엄형국 수학 · 칭찬 게시판 👏</div></div>';
  }

  // 메인 화면 배너
  function mount(box) {
    if (!box || !global.firebase || !global.OMR) return;
    var db = global.OMR.db, toDate = global.OMR.toDate;
    db.collection('notices').where('active', '==', true).get().then(function (qs) {
      var list = qs.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; })
        .sort(function (a, b) { return (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0); }).slice(0, 12);
      if (!list.length) { box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = '<div class="nb-h"><span class="nb-k">📣 칭찬 게시판</span><span class="nb-s">이번 주 열심히 한 친구들 · 눌러서 기록 보기</span></div>'
        + '<div class="nb-row">' + list.map(function (n, i) {
          var K = KINDS[n.kind] || KINDS.custom;
          return '<button type="button" class="nb-c" data-i="' + i + '" style="--nc:' + K.color + ';--ns:' + K.soft + '"><span class="e">' + K.emoji + '</span>'
            + '<span class="tx"><span class="t">' + esc(n.title) + '</span><span class="n">' + esc(n.name || '') + (n.stat ? ' · <b>' + esc(n.stat) + '</b>' : '') + '</span></span><span class="go">›</span></button>';
        }).join('') + '</div>';
      box.querySelectorAll('.nb-c').forEach(function (b) { b.onclick = function () { open(list[+b.dataset.i]); }; });
    }).catch(function (e) { console.warn(e); box.hidden = true; });
  }
  function open(n) {
    var m = document.getElementById('npModal');
    if (!m) { m = document.createElement('div'); m.id = 'npModal'; m.className = 'np-bg'; document.body.appendChild(m);
      m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('.np-x')) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); }); }
    m.innerHTML = popupHtml(n);
    m.hidden = false; document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { m.classList.add('on'); });
  }
  function close() { var m = document.getElementById('npModal'); if (!m || m.hidden) return; m.classList.remove('on'); document.body.style.overflow = ''; setTimeout(function () { m.hidden = true; }, 200); }

  global.NOTICE = { KINDS: KINDS, popupHtml: popupHtml, mount: mount, open: open };
})(typeof window !== 'undefined' ? window : globalThis);
