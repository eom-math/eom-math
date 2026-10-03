// 엄형국 수학 — 메인 게시판 (공지 + 학생 글, 공개/비공개). 비공개 글은 쓴 학생과 선생님만 봐요.
(function (global) {
  var OMR = global.OMR;
  function esc(s) { return OMR.esc(s); }
  function fmt(t) { var d = OMR.toDate(t); if (!d || isNaN(d)) return ''; var n = new Date(); return d.toDateString() === n.toDateString() ? (d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0')) : (d.getMonth() + 1) + '/' + d.getDate(); }
  var st = { me: null, list: [], mine: [], more: false };

  function load(box) {
    var db = OMR.db;
    var code = null; try { code = localStorage.getItem('omrStudentCode'); } catch (e) {}
    var meP = code ? OMR.studentByCode(code).catch(function () { return null; }) : Promise.resolve(null);
    meP.then(function (me) {
      st.me = me;
      return Promise.all([
        db.collection('boardPosts').where('visibility', '==', 'public').get().then(function (q) { return q.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }); }).catch(function (e) { console.warn(e); return []; }),
        me ? db.collection('boardLinks').doc(me.code).get().then(function (x) { return x.exists ? (x.data().items || []) : []; }).catch(function () { return []; }) : [],
      ]);
    }).then(function (r) {
      var pub = r[0], ids = r[1].slice(-30);
      var have = {}; pub.forEach(function (p) { have[p.id] = 1; });
      return Promise.all(ids.filter(function (id) { return !have[id]; }).map(function (id) {
        return db.collection('boardPosts').doc(id).get().then(function (d) { if (!d.exists) return null; var x = d.data(); x.id = d.id; return x; }).catch(function () { return null; });
      })).then(function (mine) {
        st.mine = ids;
        st.list = pub.concat(mine.filter(function (x) { return x && x.visibility === 'private'; }))
          .sort(function (a, b) { return (b.kind === 'notice' && b.pinned ? 1 : 0) - (a.kind === 'notice' && a.pinned ? 1 : 0) || (OMR.toDate(b.createdAt) || 0) - (OMR.toDate(a.createdAt) || 0); });
        render(box);
      });
    });
  }

  function render(box) {
    var list = st.list, show = st.more ? list.slice(0, 40) : list.slice(0, 8);
    box.querySelector('#bdList').innerHTML = list.length ? show.map(function (p, i) {
      var notice = p.kind === 'notice', priv = p.visibility === 'private', mine = st.mine.indexOf(p.id) >= 0;
      return '<button type="button" class="bd-i ' + (notice ? 'nt' : '') + '" data-id="' + esc(p.id) + '">'
        + '<span class="tg ' + (notice ? 'nt' : priv ? 'pv' : '') + '">' + (notice ? (p.pinned ? '📌 공지' : '공지') : priv ? '🔒 비공개' : '자유') + '</span>'
        + '<span class="tt">' + esc(p.title) + (p.reply && p.reply.text ? ' <em class="rp">답변</em>' : '') + '</span>'
        + '<span class="mt">' + (notice ? '선생님' : esc(p.nick || '') + (mine ? ' · 나' : '')) + ' · ' + fmt(p.createdAt) + '</span></button>';
    }).join('') : '<div class="bd-none">아직 글이 없어요. 첫 글을 남겨 보세요!</div>';
    var mb = box.querySelector('#bdMore');
    mb.hidden = list.length <= 8;
    mb.textContent = st.more ? '접기 ↑' : '글 더 보기 (' + list.length + ') ↓';
  }

  function openPost(p) {
    var notice = p.kind === 'notice', priv = p.visibility === 'private';
    modal('<div class="bd-m-h"><span class="tg ' + (notice ? 'nt' : priv ? 'pv' : '') + '">' + (notice ? '공지' : priv ? '🔒 비공개 · 나와 선생님만' : '자유') + '</span>'
      + '<button type="button" class="bd-x" aria-label="닫기">✕</button></div>'
      + '<h3>' + esc(p.title) + '</h3><div class="bd-m-meta">' + (notice ? '엄형국 선생님' : esc(p.nick || '') + (p.className ? ' · ' + esc(p.className) : '')) + ' · ' + fmt(p.createdAt) + '</div>'
      + '<div class="bd-m-body">' + esc(p.body || '') + '</div>'
      + (p.reply && p.reply.text ? '<div class="bd-m-rp"><span>선생님 답변 · ' + fmt(p.reply.at) + '</span>' + esc(p.reply.text) + '</div>' : (!notice ? '<div class="bd-m-wait">선생님이 확인하면 답변이 여기에 달려요.</div>' : '')));
  }
  function openWrite(box) {
    if (!st.me) { if (global.openGate) global.openGate(); return; }
    modal('<div class="bd-m-h"><b>글쓰기</b><button type="button" class="bd-x" aria-label="닫기">✕</button></div>'
      + '<input class="bd-in" id="bwTitle" maxlength="60" placeholder="제목">'
      + '<textarea class="bd-in" id="bwBody" rows="6" maxlength="3000" placeholder="궁금한 점, 건의, 하고 싶은 말을 자유롭게 적어요"></textarea>'
      + '<div class="bd-vis"><label><input type="radio" name="bwVis" value="public" checked> 공개 <small>모두가 볼 수 있어요 (이름은 ' + esc(OMR.maskName(st.me.name)) + '처럼 가려져요)</small></label>'
      + '<label><input type="radio" name="bwVis" value="private"> 🔒 비공개 <small>나와 선생님만 볼 수 있어요</small></label></div>'
      + '<p class="bd-msg" id="bwMsg"></p><button type="button" class="bd-send" id="bwSend">올리기</button>');
    document.getElementById('bwSend').onclick = function () {
      var t = document.getElementById('bwTitle').value.trim(), b = document.getElementById('bwBody').value.trim();
      var vis = (document.querySelector('input[name=bwVis]:checked') || {}).value || 'public';
      if (!t) { document.getElementById('bwMsg').textContent = '제목을 적어 주세요.'; return; }
      var btn = this; btn.disabled = true; btn.textContent = '올리는 중…';
      var db = OMR.db, ref = db.collection('boardPosts').doc();
      ref.set({ kind: 'post', title: t, body: b, visibility: vis, sid: st.me.studentId, nick: OMR.maskName(st.me.name), className: st.me.className,
        createdAt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(function () { return db.collection('boardLinks').doc(st.me.code).get(); })
        .then(function (lk) { var items = (lk.exists ? lk.data().items || [] : []).concat(ref.id).slice(-200); return db.collection('boardLinks').doc(st.me.code).set({ items: items }); })
        .then(function () { closeModal(); OMR.toast(vis === 'private' ? '비공개로 올렸어요. 선생님만 볼 수 있어요' : '글을 올렸어요'); load(box); })
        .catch(function (e) { console.error(e); btn.disabled = false; btn.textContent = '올리기'; document.getElementById('bwMsg').textContent = '올리지 못했어요. 잠시 후 다시 시도해 주세요.'; });
    };
    setTimeout(function () { var el = document.getElementById('bwTitle'); if (el) el.focus(); }, 60);
  }
  function modal(html) {
    var m = document.getElementById('bdModal');
    if (!m) { m = document.createElement('div'); m.id = 'bdModal'; m.className = 'bd-bg'; document.body.appendChild(m);
      m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('.bd-x')) closeModal(); }); }
    m.innerHTML = '<div class="bd-m">' + html + '</div>'; m.hidden = false; document.body.style.overflow = 'hidden';
  }
  function closeModal() { var m = document.getElementById('bdModal'); if (m) { m.hidden = true; document.body.style.overflow = ''; } }

  function mount(box) {
    if (!box || !OMR) return;
    box.querySelector('#bdList').onclick = function (e) { var b = e.target.closest('.bd-i'); if (!b) return; var p = st.list.find(function (x) { return x.id === b.dataset.id; }); if (p) openPost(p); };
    box.querySelector('#bdWrite').onclick = function () { openWrite(box); };
    box.querySelector('#bdMore').onclick = function () { st.more = !st.more; render(box); };
    load(box);
  }
  global.BOARD = { mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
