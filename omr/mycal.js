// 엄형국 수학 — 학생이 직접 넣는 "내 일정" (달력 날짜 팝업)
// 저장: studentCal/{학생코드} = { items:[{id,date,endDate,title,time,note}] } — 학생 본인만(코드로) 읽고 써요.
// 선생님 일정(classEvents)은 팝업에 🔒로 보이기만 하고 학생이 고치거나 지울 수 없어요.
(function (global) {
  var OMR = global.OMR, CAL = global.CAL;
  var MAX = 300, DOW = '일월화수목금토';
  function esc(s) { return OMR.esc(s); }
  function load(code) {
    return OMR.db.collection('studentCal').doc(code).get().then(function (d) { return d.exists ? (d.data().items || []) : []; }).catch(function () { return []; });
  }
  function save(code, items) {
    items = items.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    if (items.length > MAX) items = items.slice(items.length - MAX);   // 너무 많으면 오래된 것부터 정리
    return OMR.db.collection('studentCal').doc(code).set({ items: items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }).then(function () { return items; });
  }
  function toEvents(items) {
    return (items || []).map(function (x) { return { id: 'my_' + x.id, myId: x.id, kind: 'mine', date: x.date, endDate: x.endDate || null, title: x.title, time: x.time || '', note: x.note || '', classNames: ['*'] }; });
  }

  var CSS = '.my-bg{position:fixed;inset:0;z-index:90;background:rgba(17,17,20,.45);display:flex;align-items:flex-end;justify-content:center;}'
    + '.my-bg[hidden]{display:none;} @media (min-width:640px){.my-bg{align-items:center;padding:20px;}}'
    + '.my-m{background:#FAFAF8;width:100%;max-width:480px;max-height:92vh;overflow:auto;border-radius:20px 20px 0 0;padding:18px 18px 22px;box-shadow:0 20px 50px rgba(0,0,0,.25);font-family:inherit;color:#111114;}'
    + '@media (min-width:640px){.my-m{border-radius:20px;}}'
    + '.my-h{display:flex;align-items:center;gap:8px;margin-bottom:10px;} .my-h b{font-size:19px;font-weight:900;} .my-h .hn{font-size:12px;font-weight:800;color:#D6301F;}'
    + '.my-h .x{margin-left:auto;width:34px;height:34px;border-radius:50%;border:0;background:#EFEDE8;font-size:15px;}'
    + '.my-s{font-size:12px;font-weight:900;color:#63636B;margin:14px 0 6px;}'
    + '.my-l{display:grid;gap:6px;}'
    + '.my-i{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid rgba(17,17,20,.09);border-radius:12px;padding:9px 10px;}'
    + '.my-i .k{flex:0 0 auto;font-size:11px;font-weight:900;padding:3px 7px;border-radius:6px;white-space:nowrap;}'
    + '.my-i .t{min-width:0;flex:1;font-weight:800;font-size:14px;overflow-wrap:anywhere;} .my-i .t small{display:block;font-size:11.5px;color:#63636B;font-weight:600;}'
    + '.my-i .lk{flex:0 0 auto;font-size:11px;font-weight:800;color:#9A9AA2;}'
    + '.my-i .ops{display:flex;gap:4px;flex:0 0 auto;} .my-i .ops button{border:1px solid rgba(17,17,20,.12);background:#fff;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:800;color:#111114;}'
    + '.my-i .ops .del{color:#D6301F;border-color:#F3C9C2;} .my-i.off .t{text-decoration:line-through;color:#9A9AA2;}'
    + '.my-f{background:#fff;border:1px solid rgba(17,17,20,.09);border-radius:14px;padding:12px;display:grid;gap:10px;}'
    + '.my-in{width:100%;box-sizing:border-box;border:1.5px solid rgba(17,17,20,.12);border-radius:10px;padding:10px 12px;font:inherit;font-size:15px;background:#fff;color:#111114;}'
    + '.my-in:focus{outline:none;border-color:#111114;}'
    + '.my-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;} .my-lab{display:block;font-size:12px;font-weight:800;color:#63636B;margin-bottom:4px;}'
    + '.my-chk{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;} .my-chk input{width:17px;height:17px;}'
    + '.my-btn{border:0;border-radius:12px;padding:13px;font:inherit;font-size:15px;font-weight:900;background:#C2185B;color:#fff;width:100%;}'
    + '.my-btn:disabled{opacity:.5;} .my-cancel{border:0;background:none;font:inherit;font-size:13px;font-weight:800;color:#63636B;justify-self:start;padding:2px 0;}'
    + '.my-none{font-size:13px;color:#9A9AA2;}';
  function injectCss() { if (document.getElementById('myCalCss')) return; var s = document.createElement('style'); s.id = 'myCalCss'; s.textContent = CSS; document.head.appendChild(s); }

  var st = null, tr = null;
  function modal() {
    var m = document.getElementById('myCalM');
    if (m) return m;
    injectCss();
    m = document.createElement('div'); m.id = 'myCalM'; m.className = 'my-bg'; m.hidden = true;
    m.innerHTML = '<div class="my-m" role="dialog" aria-modal="true" aria-labelledby="myDate">'
      + '<div class="my-h"><b id="myDate"></b><span class="hn" id="myHol"></span><button type="button" class="x" id="myX" aria-label="닫기">✕</button></div>'
      + '<div class="my-s">이날 일정</div><div class="my-l" id="myList"></div>'
      + '<div class="my-s" id="myFormT">＋ 내 일정 추가</div>'
      + '<div class="my-f"><input class="my-in" id="myTitle" maxlength="30" placeholder="예: 학원 숙제 · 수행평가 · 병원">'
      + '<div><label class="my-chk"><input type="checkbox" id="myTimeOn"> 시간 지정 <span style="font-weight:600;color:#9A9AA2;">(10분 단위로 끌어서)</span></label><div id="myTR" hidden></div></div>'
      + '<div class="my-row"><div><label class="my-lab" for="myEnd">끝나는 날 (여러 날이면)</label><input class="my-in" type="date" id="myEnd"></div>'
      + '<div><label class="my-lab" for="myNote">메모 (선택)</label><input class="my-in" id="myNote" maxlength="60"></div></div>'
      + '<button type="button" class="my-btn" id="mySave">저장</button><button type="button" class="my-cancel" id="myCancel" hidden>수정 그만하기</button></div>'
      + '<p style="font-size:11.5px;color:#9A9AA2;margin:10px 2px 0;">🔒 선생님이 넣은 일정은 학생이 고치거나 지울 수 없어요. 내 일정은 나만 보여요.</p></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('#myX')) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !m.hidden) close(); });
    tr = global.TR.mount(m.querySelector('#myTR'), { start: '15:00', end: '16:00', min: 6 * 60, max: 24 * 60 });
    m.querySelector('#myTimeOn').onchange = function () { m.querySelector('#myTR').hidden = !this.checked; };
    m.querySelector('#myCancel').onclick = function () { resetForm(); };
    m.querySelector('#myList').onclick = function (e) {
      var ed = e.target.closest('[data-me]'), dl = e.target.closest('[data-md]');
      if (ed) { var x = st.items.find(function (i) { return i.id === ed.dataset.me; }); if (x) fillForm(x); }
      if (dl) {
        var y = st.items.find(function (i) { return i.id === dl.dataset.md; });
        if (!y || !confirm("'" + y.title + "' 일정을 지울까요?")) return;
        commit(st.items.filter(function (i) { return i.id !== y.id; }), '지웠어요');
      }
    };
    m.querySelector('#mySave').onclick = function () {
      var $ = function (id) { return m.querySelector('#' + id); };
      var title = $('myTitle').value.trim(), end = $('myEnd').value;
      if (!title) { OMR.toast('일정 이름을 적어 주세요'); $('myTitle').focus(); return; }
      if (end && end < st.date) { OMR.toast('끝나는 날이 시작보다 빨라요'); return; }
      var item = { id: st.editId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), date: st.editDate || st.date, endDate: end && end !== (st.editDate || st.date) ? end : null,
        title: title, time: $('myTimeOn').checked ? tr.str() : '', note: $('myNote').value.trim() };
      var items = st.items.filter(function (i) { return i.id !== item.id; }).concat(item);
      commit(items, st.editId ? '고쳤어요' : '내 일정을 넣었어요');
    };
    return m;
  }
  function commit(items, msg) {
    var b = document.getElementById('mySave'); b.disabled = true;
    save(st.code, items).then(function (saved) {
      st.items = saved; OMR.toast(msg); resetForm(); draw(); if (st.onSaved) st.onSaved(saved);
    }).catch(function (e) { console.error(e); OMR.toast('저장하지 못했어요. 잠시 후 다시 시도해 주세요.'); }).then(function () { b.disabled = false; });
  }
  function resetForm() {
    var m = modal(); st.editId = null; st.editDate = null;
    m.querySelector('#myTitle').value = ''; m.querySelector('#myEnd').value = ''; m.querySelector('#myNote').value = '';
    m.querySelector('#myTimeOn').checked = false; m.querySelector('#myTR').hidden = true;
    m.querySelector('#myFormT').textContent = '＋ 내 일정 추가'; m.querySelector('#mySave').textContent = '저장'; m.querySelector('#myCancel').hidden = true;
  }
  function fillForm(x) {
    var m = modal(); st.editId = x.id; st.editDate = x.date;
    m.querySelector('#myTitle').value = x.title || ''; m.querySelector('#myEnd').value = x.endDate || ''; m.querySelector('#myNote').value = x.note || '';
    var p = global.TR.parse(x.time); m.querySelector('#myTimeOn').checked = !!p; m.querySelector('#myTR').hidden = !p; if (p) tr.set(global.TR.toStr(p[0]), global.TR.toStr(p[1]));
    m.querySelector('#myFormT').textContent = '✎ 내 일정 수정'; m.querySelector('#mySave').textContent = '수정 저장'; m.querySelector('#myCancel').hidden = false;
    m.querySelector('#myTitle').focus();
  }
  function draw() {
    var m = modal(), d = st.date, dow = new Date(d + 'T00:00:00').getDay();
    var L = CAL.dayLessons(d, dow, st.schedules || [], st.events || [], st.className, st.school, st.grade);
    var rows = L.regular.map(function (r) {
      return '<div class="my-i ' + (L.cancelled ? 'off' : '') + '"><span class="k" style="background:' + (r.changed ? '#7B3FD0' : '#111114') + ';color:#fff">' + (r.changed ? '변경' : '수업') + '</span>'
        + '<span class="t">' + esc(r.start) + (r.end ? ' ~ ' + esc(r.end) : '') + '<small>정규 수업' + (L.cancelled ? ' · 휴강' : '') + (r.place ? ' · ' + esc(r.place) : '') + '</small></span><span class="lk">🔒 선생님</span></div>';
    });
    L.events.filter(function (e) { return e.kind !== 'change'; }).forEach(function (e) {
      var K = CAL.KINDS[e.kind] || CAL.KINDS.event, multi = e.endDate && e.endDate !== e.date;
      rows.push('<div class="my-i"><span class="k" style="color:' + K.color + ';background:' + K.bg + '">' + K.label + '</span><span class="t">' + esc(e.title || K.label) + (e.time ? ' · ' + esc(e.time) : '')
        + '<small>' + (multi ? e.date.slice(5).replace('-', '/') + ' ~ ' + e.endDate.slice(5).replace('-', '/') : '') + (e.note ? (multi ? ' · ' : '') + esc(e.note) : '') + '</small></span><span class="lk">🔒 선생님</span></div>');
    });
    st.items.filter(function (x) { return d >= x.date && d <= (x.endDate || x.date); }).forEach(function (x) {
      var K = CAL.KINDS.mine, multi = x.endDate && x.endDate !== x.date;
      rows.push('<div class="my-i"><span class="k" style="color:' + K.color + ';background:' + K.bg + '">' + K.label + '</span><span class="t">' + esc(x.title) + (x.time ? ' · ' + esc(x.time.replace('~', ' ~ ')) : '')
        + '<small>' + (multi ? x.date.slice(5).replace('-', '/') + ' ~ ' + x.endDate.slice(5).replace('-', '/') : '') + (x.note ? (multi ? ' · ' : '') + esc(x.note) : '') + '</small></span>'
        + '<span class="ops"><button type="button" data-me="' + esc(x.id) + '">수정</button><button type="button" class="del" data-md="' + esc(x.id) + '">삭제</button></span></div>');
    });
    m.querySelector('#myList').innerHTML = rows.join('') || '<div class="my-none">이날은 일정이 없어요.</div>';
  }
  /** opt: { date, code, items, events(선생님 일정, 이미 내 반·학교·학년으로 거른 것), schedules, className, school, grade, onSaved(items) } */
  function open(opt) {
    st = Object.assign({}, opt, { items: (opt.items || []).slice(), editId: null });
    var m = modal(), t = new Date(opt.date + 'T00:00:00');
    m.querySelector('#myDate').textContent = (t.getMonth() + 1) + '월 ' + t.getDate() + '일 (' + DOW[t.getDay()] + ')';
    m.querySelector('#myHol').textContent = CAL.HOLIDAYS[opt.date] || '';
    resetForm(); draw(); m.hidden = false; document.body.style.overflow = 'hidden';
  }
  function close() { var m = document.getElementById('myCalM'); if (m) { m.hidden = true; document.body.style.overflow = ''; } }
  global.MYCAL = { load: load, save: save, toEvents: toEvents, open: open, close: close };
})(typeof window !== 'undefined' ? window : globalThis);
