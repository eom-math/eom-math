// 엄형국 수학 — 메인 게시판 (공지 + 학생 글)
// 글 종류: public 공개(이름 가림) · anon 익명(모두 보지만 이름 없음) · teacher 선생님께 · staff 조교 선생님께
// 누가 썼는지는 boardAuthors/{글id}에 따로 저장 (관리자만 읽음). 익명 글 문서에는 학생 정보가 없어요.
(function (global) {
  var OMR = global.OMR;
  var VIS = {
    public:  { tag: '자유', cls: '', desc: '모두가 볼 수 있어요' },
    anon:    { tag: '익명', cls: 'an', desc: '모두가 볼 수 있어요 · 이름이 보이지 않아요' },
    teacher: { tag: '🔒 선생님께', cls: 'pv', desc: '선생님만 볼 수 있어요' },
    staff:   { tag: '🔒 조교쌤께', cls: 'pv', desc: '조교 선생님만 볼 수 있어요' },
  };
  VIS.private = VIS.teacher;   // 예전 '비공개' 글
  var SECRET = { teacher: 1, staff: 1, private: 1 };
  function vis(p) { return VIS[p.visibility] || VIS.public; }
  // 머리말
  var HEADS = [
    ['study', '열공인증', '#C2410C', '#FFEDD5'], ['goal', '목표선언', '#B45309', '#FEF3C7'], ['exam', '시험후기', '#B91C1C', '#FEE2E2'],
    ['ask', '질문', '#1D4ED8', '#DBEAFE'], ['brag', '자랑', '#A21CAF', '#FAE8FF'], ['cheer', '응원', '#BE185D', '#FCE7F3'],
    ['worry', '고민', '#4338CA', '#E0E7FF'], ['chat', '잡담', '#047857', '#D1FAE5'], ['idea', '건의', '#475569', '#E2E8F0'],
  ];
  var HD = {}; HEADS.forEach(function (h) { HD[h[0]] = h; });
  function headTag(k) { var h = HD[k]; return h ? '<span class="bd-hd" style="color:' + h[2] + ';background:' + h[3] + '">' + h[1] + '</span>' : ''; }
  var MAXPIC = 4;
  function esc(s) { return OMR.esc(s); }
  function fmt(t) { var d = OMR.toDate(t); if (!d || isNaN(d)) return ''; var n = new Date(); return d.toDateString() === n.toDateString() ? (d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0')) : (d.getMonth() + 1) + '/' + d.getDate(); }
  var st = { me: null, list: [], mine: [], more: false, flt: '' };

  function load(box) {
    var db = OMR.db;
    var code = null; try { code = localStorage.getItem('omrStudentCode'); } catch (e) {}
    var meP = code ? OMR.studentByCode(code).catch(function () { return null; }) : Promise.resolve(null);
    meP.then(function (me) {
      st.me = me;
      return Promise.all([
        Promise.all(['public', 'anon'].map(function (v) {
          return db.collection('boardPosts').where('visibility', '==', v).get().then(function (q) { return q.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }); }).catch(function (e) { console.warn(e); return []; });
        })).then(function (a) { return a[0].concat(a[1]); }),
        me ? db.collection('boardLinks').doc(me.code).get().then(function (x) { return x.exists ? (x.data().items || []) : []; }).catch(function () { return []; }) : [],
      ]);
    }).then(function (r) {
      var pub = r[0], ids = r[1].slice(-30);
      var have = {}; pub.forEach(function (p) { have[p.id] = 1; });
      return Promise.all(ids.filter(function (id) { return !have[id]; }).map(function (id) {
        return db.collection('boardPosts').doc(id).get().then(function (d) { if (!d.exists) return null; var x = d.data(); x.id = d.id; return x; }).catch(function () { return null; });
      })).then(function (mine) {
        st.mine = ids;
        st.list = pub.concat(mine.filter(function (x) { return x && SECRET[x.visibility]; }))
          .sort(function (a, b) { return (b.kind === 'notice' && b.pinned ? 1 : 0) - (a.kind === 'notice' && a.pinned ? 1 : 0) || (OMR.toDate(b.createdAt) || 0) - (OMR.toDate(a.createdAt) || 0); });
        render(box);
      });
    });
  }

  function render(box) {
    var fb = box.querySelector('#bdFlt');
    if (fb) fb.innerHTML = [['', '전체'], ['notice', '📌 공지']].concat(HEADS.map(function (h) { return [h[0], h[1]]; })).map(function (f) {
      return '<button type="button" data-f="' + f[0] + '" class="' + (st.flt === f[0] ? 'on' : '') + '">' + f[1] + '</button>'; }).join('');
    var list = st.list.filter(function (p) { return !st.flt || (st.flt === 'notice' ? p.kind === 'notice' : p.head === st.flt); }), show = st.more ? list.slice(0, 40) : list.slice(0, 8);
    box.querySelector('#bdList').innerHTML = list.length ? show.map(function (p, i) {
      var notice = p.kind === 'notice', V = vis(p), mine = st.mine.indexOf(p.id) >= 0;
      return '<button type="button" class="bd-i ' + (notice ? 'nt' : '') + '" data-id="' + esc(p.id) + '">'
        // 공개 글은 머리말을 앞 칸에, 익명·🔒 글은 앞 칸에 종류를 두고 제목 앞에 머리말
        + (!notice && p.visibility === 'public' && HD[p.head] ? '<span class="tg" style="color:' + HD[p.head][2] + ';background:' + HD[p.head][3] + '">' + HD[p.head][1] + '</span>'
          : '<span class="tg ' + (notice ? 'nt' : V.cls) + '">' + (notice ? (p.pinned ? '📌 공지' : '공지') : V.tag) + '</span>')
        + '<span class="tt">' + (p.visibility === 'public' ? '' : headTag(p.head)) + esc(p.title) + (p.files && p.files.length ? '<span class="pic">📷</span>' : '') + (p.reply && p.reply.text ? ' <em class="rp">답변</em>' : '') + '</span>'
        + '<span class="mt">' + (notice ? '선생님' : (p.visibility === 'anon' ? '익명' : esc(p.nick || '')) + (mine ? ' · 나' : '')) + ' · ' + fmt(p.createdAt) + '</span></button>';
    }).join('') : '<div class="bd-none">' + (st.flt ? '이 머리말의 글이 아직 없어요.' : '아직 글이 없어요. 첫 글을 남겨 보세요!') + '</div>';
    var mb = box.querySelector('#bdMore');
    mb.hidden = list.length <= 8;
    mb.textContent = st.more ? '접기 ↑' : '글 더 보기 (' + list.length + ') ↓';
  }

  function openPost(p) {
    var notice = p.kind === 'notice', V = vis(p);
    modal('<div class="bd-m-h"><span class="tg ' + (notice ? 'nt' : V.cls) + '">' + (notice ? '공지' : V.tag) + '</span>'
      + '<button type="button" class="bd-x" aria-label="닫기">✕</button></div>'
      + '<h3>' + headTag(p.head) + esc(p.title) + '</h3><div class="bd-m-meta">' + (notice ? '엄형국 선생님' : p.visibility === 'anon' ? '익명' : esc(p.nick || '') + (p.className ? ' · ' + esc(p.className) : '')) + ' · ' + fmt(p.createdAt) + '</div>'
      + (p.body ? '<div class="bd-m-body">' + esc(p.body) + '</div>' : '')
      + (p.files && p.files.length ? '<div class="bd-m-img">' + p.files.map(function (f) { return '<a href="' + esc(f.url) + '" target="_blank" rel="noopener"><img src="' + esc(f.url) + '" alt="첨부 사진" loading="lazy"></a>'; }).join('') + '</div>' : '')
      + (p.reply && p.reply.text ? '<div class="bd-m-rp"><span>' + (p.reply.by === 'ta' ? '조교 선생님' : '선생님') + ' 답변 · ' + fmt(p.reply.at) + '</span>' + esc(p.reply.text) + '</div>' : (!notice ? '<div class="bd-m-wait">선생님이 확인하면 답변이 여기에 달려요.</div>' : '')));
  }
  function openWrite(box) {
    if (!st.me) { if (global.openGate) global.openGate(); return; }
    modal('<div class="bd-m-h"><b>글쓰기</b><button type="button" class="bd-x" aria-label="닫기">✕</button></div>'
      + '<div class="bd-heads" id="bwHeads">' + HEADS.map(function (h) { return '<button type="button" data-h="' + h[0] + '">' + h[1] + '</button>'; }).join('') + '</div>'
      + '<input class="bd-in" id="bwTitle" maxlength="60" placeholder="제목">'
      + '<textarea class="bd-in" id="bwBody" rows="6" maxlength="3000" placeholder="궁금한 점, 건의, 하고 싶은 말을 자유롭게 적어요"></textarea>'
      + '<div class="bd-pics" id="bwPics"></div>'
      + '<div class="bd-vis">'
      + '<label><input type="radio" name="bwVis" value="public" checked> 공개 <small>모두가 볼 수 있어요 (이름은 ' + esc(OMR.maskName(st.me.name)) + '처럼 가려져요)</small></label>'
      + '<label><input type="radio" name="bwVis" value="anon"> 익명 <small>' + VIS.anon.desc + '</small></label>'
      + '<label><input type="radio" name="bwVis" value="teacher"> 🔒 선생님께 <small>' + VIS.teacher.desc + '</small></label>'
      + '<label><input type="radio" name="bwVis" value="staff"> 🔒 조교 선생님께 <small>' + VIS.staff.desc + '</small></label></div>'
      + '<p class="bd-msg" id="bwMsg"></p><button type="button" class="bd-send" id="bwSend">올리기</button>');
    var head = '', pics = [];
    function drawHeads() { [].forEach.call(document.querySelectorAll('#bwHeads button'), function (b) { var h = HD[b.dataset.h], on = b.dataset.h === head;
      b.style.background = on ? h[2] : '#fff'; b.style.borderColor = on ? h[2] : ''; b.style.color = on ? '#fff' : ''; }); }
    document.getElementById('bwHeads').onclick = function (e) { var b = e.target.closest('[data-h]'); if (!b) return; head = head === b.dataset.h ? '' : b.dataset.h; drawHeads(); document.getElementById('bwMsg').textContent = ''; };
    function drawPics() {
      var el = document.getElementById('bwPics');
      el.innerHTML = pics.map(function (f, i) { return '<div class="ph"><img src="' + f.prev + '" alt=""><button type="button" data-rm="' + i + '" aria-label="사진 빼기">✕</button></div>'; }).join('')
        + (pics.length < MAXPIC ? '<label>📷<br>사진 ' + pics.length + '/' + MAXPIC + '<input type="file" accept="image/*" multiple hidden id="bwFile"></label>' : '');
      var fi = document.getElementById('bwFile');
      if (fi) fi.onchange = function () { [].slice.call(fi.files, 0, MAXPIC - pics.length).forEach(function (f) { pics.push({ file: f, prev: URL.createObjectURL(f) }); }); drawPics(); };
    }
    document.getElementById('bwPics').onclick = function (e) { var b = e.target.closest('[data-rm]'); if (!b) return; pics.splice(+b.dataset.rm, 1); drawPics(); };
    drawPics();
    document.getElementById('bwSend').onclick = function () {
      var t = document.getElementById('bwTitle').value.trim(), b = document.getElementById('bwBody').value.trim();
      if (!head) { document.getElementById('bwMsg').textContent = '머리말을 골라 주세요.'; return; }
      var vis = (document.querySelector('input[name=bwVis]:checked') || {}).value || 'public';
      if (!t) { document.getElementById('bwMsg').textContent = '제목을 적어 주세요.'; return; }
      var btn = this; btn.disabled = true; btn.textContent = '올리는 중…';
      var db = OMR.db, ref = db.collection('boardPosts').doc(), TS = firebase.firestore.FieldValue.serverTimestamp();
      // 사진은 글 번호 폴더(board/{글id}/)에 먼저 올려요. 학생 코드는 주소에 안 들어가요
      var upload = pics.reduce(function (pr, x, i) { return pr.then(function (arr) {
        return OMR.shrinkImage(x.file).then(function (f) {
          var path = 'board/' + ref.id + '/' + i + '_' + OMR.genToken().slice(0, 10) + '.jpg';
          return firebase.storage().ref(path).put(f, { contentType: f.type || 'image/jpeg' }).then(function (snap) { return snap.ref.getDownloadURL(); })
            .then(function (url) { arr.push({ path: path, url: url }); return arr; });
        }); }); }, Promise.resolve([]));
      // 익명 글에는 학생 정보를 넣지 않아요. 누가 썼는지는 boardAuthors(관리자만 읽음)에 같이 저장
      upload.then(function (files) {
        var post = vis === 'anon' ? { kind: 'post', head: head, title: t, body: b, files: files, visibility: vis, nick: '익명', createdAt: TS }
          : { kind: 'post', head: head, title: t, body: b, files: files, visibility: vis, sid: st.me.studentId, nick: OMR.maskName(st.me.name), className: st.me.className, createdAt: TS };
        var batch = db.batch();
        batch.set(ref, post);
        batch.set(db.collection('boardAuthors').doc(ref.id), { sid: st.me.studentId, name: String(st.me.name || '').slice(0, 20), className: String(st.me.className || '').slice(0, 40), createdAt: TS });
        return batch.commit();
      })
        .then(function () { return db.collection('boardLinks').doc(st.me.code).get(); })
        .then(function (lk) { var items = (lk.exists ? lk.data().items || [] : []).concat(ref.id).slice(-200); return db.collection('boardLinks').doc(st.me.code).set({ items: items }); })
        .then(function () { closeModal(); OMR.toast(vis === 'teacher' ? '선생님께 보냈어요' : vis === 'staff' ? '조교 선생님께 보냈어요' : vis === 'anon' ? '익명으로 올렸어요' : '글을 올렸어요'); load(box); })
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
    var fb = box.querySelector('#bdFlt'); if (fb) fb.onclick = function (e) { var b = e.target.closest('[data-f]'); if (!b) return; st.flt = b.dataset.f; st.more = false; render(box); };
    load(box);
  }
  global.BOARD = { mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
