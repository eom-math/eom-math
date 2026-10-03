// 엄형국 수학 — 월간 달력 (학생 개인 페이지 · 관리자 수업 달력에서 같이 씀)
(function (global) {
  // 공휴일 (대체공휴일 포함). 임시공휴일이 새로 정해지면 관리자 달력에서 '일정'이나 '방학'으로 추가하면 돼요.
  var HOLIDAYS = {
    '2026-01-01': '신정', '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴',
    '2026-03-01': '삼일절', '2026-03-02': '대체공휴일', '2026-05-05': '어린이날', '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일',
    '2026-06-03': '지방선거', '2026-06-06': '현충일', '2026-08-15': '광복절', '2026-08-17': '대체공휴일',
    '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴', '2026-09-28': '대체공휴일',
    '2026-10-03': '개천절', '2026-10-05': '대체공휴일', '2026-10-09': '한글날', '2026-12-25': '성탄절',
    '2027-01-01': '신정', '2027-02-06': '설날 연휴', '2027-02-07': '설날', '2027-02-08': '설날 연휴', '2027-02-09': '대체공휴일',
    '2027-03-01': '삼일절', '2027-05-05': '어린이날', '2027-05-13': '부처님오신날', '2027-06-06': '현충일',
    '2027-08-15': '광복절', '2027-08-16': '대체공휴일', '2027-09-14': '추석 연휴', '2027-09-15': '추석', '2027-09-16': '추석 연휴',
    '2027-10-03': '개천절', '2027-10-04': '대체공휴일', '2027-10-09': '한글날', '2027-10-11': '대체공휴일',
    '2027-12-25': '성탄절', '2027-12-27': '대체공휴일',
  };
  var KINDS = {
    cancel:  { label: '휴강',       color: '#9A9AA2', bg: '#F1F0EC' },
    makeup:  { label: '직보',       color: '#3B6FE0', bg: '#EEF3FF' },
    bogang:  { label: '보강',       color: '#0E8A8A', bg: '#E6F6F5' },
    exam:    { label: '시험기간',   color: '#D6301F', bg: '#FFF1EC' },
    examday: { label: '시험일',     color: '#fff',    bg: '#D6301F' },
    change:  { label: '시간 변경',  color: '#7B3FD0', bg: '#F3ECFF' },
    event:   { label: '일정',       color: '#1F7A4D', bg: '#EAF6EF' },
    holiday: { label: '방학',       color: '#D6301F', bg: '#FFF5F5' },
    trip:    { label: '수련회',     color: '#B86A00', bg: '#FFF4E0' },
    pubhol:  { label: '공휴일',     color: '#D6301F', bg: '#FFF5F5' },
  };
  // 정규 수업이 쉬는 건 선생님이 '휴강'을 넣은 날뿐 (방학·수련회도 영상 보강 등으로 수업할 수 있어 자동 휴강 안 함)
  var OFF = { cancel: 1 };
  var DOW = '일월화수목금토';
  function pad(n) { return String(n).padStart(2, '0'); }
  function ds(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hm(min) { return min >= 60 ? Math.floor(min / 60) + 'h' + (min % 60 ? pad(min % 60) : '') : min + 'm'; }
  function inRange(e, d) { return d >= e.date && d <= (e.endDate || e.date); }
  // 반 · 학교 대상인지. school: '*' 또는 없음 = 학교 구분 없이 모두, '' = 학교 미지정 학생(학교 지정 일정은 안 보임)
  // grade: 학년(1~3). '*'면 모든 학년(관리자 미리보기). 학년이 없는 학생에게는 학년별 일정(시험일)이 안 보여요
  function forClass(e, cls, school, grade) {
    var c = e.classNames || ['*'];
    if (cls && c.indexOf('*') < 0 && c.indexOf(cls) < 0) return false;
    var gs = e.grades;
    if (gs && gs.length && grade !== '*' && (!grade || gs.map(String).indexOf(String(grade)) < 0)) return false;
    var sc = e.schools || [];
    if (!sc.length || school === undefined || school === null || school === '*') return true;
    return sc.indexOf(school) >= 0;
  }
  // 학교 시험 일정(kind 'schoolExam', 학년별 시험기간·수학 시험일)을 달력용 일정으로 펼치기
  function expand(events) {
    var out = [];
    (events || []).forEach(function (e) {
      if (e.kind !== 'schoolExam') { out.push(e); return; }
      var G = e.grades || {}, sch = e.school ? [e.school] : (e.schools || []);
      // 시험기간: 학교 전체 학생 공통
      if (e.start) out.push({ id: e.id + '_p', src: e.id, kind: 'exam', date: e.start, endDate: e.end && e.end !== e.start ? e.end : null, title: e.title || '시험기간', classNames: ['*'], schools: sch });
      // 시험일: 학년별
      Object.keys(G).sort().forEach(function (g) {
        var x = G[g] || {}, base = { classNames: ['*'], schools: sch, grades: [+g], src: e.id, gradeLabel: g + '학년' };
        if (!e.start && x.start) out.push(Object.assign({}, base, { id: e.id + '_' + g + 'p', kind: 'exam', date: x.start, endDate: x.end && x.end !== x.start ? x.end : null, title: e.title || '시험기간' }));
        (x.days || []).forEach(function (d, i) { if (d && d.date) out.push(Object.assign({}, base, { id: e.id + '_' + g + 'd' + i, kind: 'examday', date: d.date, endDate: null,
          subject: d.subject || '수학', title: (d.subject || '수학') + ' 시험', time: d.time || '', note: d.note || '' })); });
      });
    });
    return out;
  }
  // 학생 한 명에게 보일 일정만 (펼치기 + 반·학교·학년 거르기)
  function prepare(events, cls, school, grade) { return expand(events).filter(function (e) { return forClass(e, cls, school, grade); }); }
  // 반의 정규 시간표 고르기: 내 학교 전용 시간표가 있으면 그것, 없으면 공통 시간표
  function pickSchedules(all, cls, school) {
    var mine = (all || []).filter(function (s) { return s.className === cls; });
    var own = school ? mine.filter(function (s) { return s.school === school; }) : [];
    return own.length ? own : mine.filter(function (s) { return !s.school; });
  }
  function monthDays(ym) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1, first = new Date(y, m, 1), out = [];
    var start = new Date(first); start.setDate(1 - first.getDay());
    for (var i = 0; i < 42; i++) { var d = new Date(start); d.setDate(start.getDate() + i); out.push({ d: ds(d), cur: d.getMonth() === m, dow: d.getDay(), n: d.getDate() }); }
    if (!out.slice(35).some(function (x) { return x.cur; })) out = out.slice(0, 35);
    return out;
  }
  function shiftMonth(ym, k) { var d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + k, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }

  // 그날 수업 목록: 정규 수업(요일) − 휴강 + 직보·보강·시간 변경
  function dayLessons(d, dow, schedules, events, cls, school, grade) {
    var evs = events.filter(function (e) { return inRange(e, d) && forClass(e, cls, school, grade); });
    // 휴강 일정이 있으면 그날 정규 수업은 휴강 (방학·수련회·법정 공휴일은 수업하는 경우가 많아 따로 '휴강'을 넣어야 빠짐)
    var off = evs.some(function (e) { return OFF[e.kind]; });
    var reg = [];
    schedules.forEach(function (s) { (s.slots || []).forEach(function (t) { if (+t.dow === dow) reg.push({ cls: s.className, start: t.start, end: t.end, place: t.place || '' }); }); });
    // 그날만 정규 수업 시간 변경 (kind 'change', time '16:00~19:00')
    var chg = evs.filter(function (e) { return e.kind === 'change'; })[0];
    if (chg && !off) {
      var p = String(chg.time || '').split('~'), a = (p[0] || '').trim(), b = (p[1] || '').trim();
      if (a) reg = reg.length ? reg.slice(0, 1).map(function (r) { return { cls: r.cls, start: a, end: b, place: r.place, changed: true, from: r.start + (r.end ? '~' + r.end : '') }; })
        : [{ cls: cls, start: a, end: b, place: '', changed: true, from: '' }];
    }
    return { regular: reg, cancelled: off && reg.length > 0, changed: !!(chg && !off), events: evs };
  }

  // 수업 시간표 달력
  function classHtml(ym, opt) {
    var schedules = opt.schedules || [], events = expand(opt.events), cls = opt.className, today = opt.today, school = opt.school, grade = opt.grade;
    var cells = monthDays(ym).map(function (c) {
      var hol = HOLIDAYS[c.d], L = dayLessons(c.d, c.dow, schedules, events, cls, school, grade);
      var marks = '';
      L.events.filter(function (e) { return e.kind === 'examday'; }).forEach(function (e) { marks += '<span class="cm exd">📝' + esc((e.gradeLabel && (!grade || grade === '*') ? e.gradeLabel.charAt(0) + '·' : '') + (e.subject || e.title)) + '</span>'; });
      var exs = L.events.filter(function (e) { return e.kind === 'exam'; });
      if (exs.length) marks += '<span class="cm exam">' + (exs.some(function (e) { return e.date === c.d; }) ? esc(exs.filter(function (e) { return e.date === c.d; })[0].title || '시험기간') : '시험기간') + '</span>';
      if (L.regular.length) marks += L.regular.map(function (r) { return '<span class="cm ' + (L.cancelled ? 'off' : r.changed ? 'chg' : 'cls') + '">' + (L.cancelled ? '휴강' : (r.changed ? '⇄' : '') + esc(r.start)) + '</span>'; }).join('');
      else L.events.filter(function (e) { return e.kind === 'cancel'; }).forEach(function () { marks += '<span class="cm off">휴강</span>'; });
      L.events.filter(function (e) { return e.kind === 'makeup' || e.kind === 'bogang'; }).forEach(function (e) { marks += '<span class="cm ' + (e.kind === 'bogang' ? 'bg' : 'mk') + '">' + esc(e.title || KINDS[e.kind].label) + (e.time ? ' ' + esc(e.time) : '') + '</span>'; });
      L.events.filter(function (e) { return e.kind === 'event' || e.kind === 'holiday' || e.kind === 'trip'; }).forEach(function (e) { marks += '<span class="cm ' + (e.kind === 'holiday' ? 'hol' : e.kind === 'trip' ? 'trp' : 'ev') + '">' + esc(e.title || KINDS[e.kind].label) + '</span>'; });
      var red = c.dow === 0 || hol || L.events.some(function (e) { return e.kind === 'holiday'; });
      return '<div class="cc ' + (c.cur ? '' : 'out ') + (c.d === today ? 'today ' : '') + (red ? 'red ' : c.dow === 6 ? 'blue ' : '') + (L.events.some(function (e) { return e.kind === 'exam' || e.kind === 'examday'; }) ? 'examday' : '') + '" data-d="' + c.d + '">'
        + '<span class="dn">' + c.n + '</span>' + (hol ? '<span class="hn">' + esc(hol) + '</span>' : '') + '<div class="ms">' + marks + '</div></div>';
    }).join('');
    return '<div class="cal-g">' + DOW.split('').map(function (w, i) { return '<div class="ch ' + (i === 0 ? 'red' : i === 6 ? 'blue' : '') + '">' + w + '</div>'; }).join('') + cells + '</div>';
  }
  // 이번 달 일정 목록 (휴강·직보·시험·공휴일)
  function listHtml(ym, opt) {
    var events = expand(opt.events).filter(function (e) { return forClass(e, opt.className, opt.school, opt.grade) && (e.date.slice(0, 7) <= ym && (e.endDate || e.date).slice(0, 7) >= ym); });
    var hol = Object.keys(HOLIDAYS).filter(function (d) { return d.slice(0, 7) === ym; }).map(function (d) { return { date: d, kind: 'pubhol', title: HOLIDAYS[d], builtin: true }; });
    var all = events.concat(hol).sort(function (a, b) { return a.date.localeCompare(b.date); });
    if (!all.length) return '<div class="cal-none">이번 달은 휴강·직보·시험 일정이 없어요.</div>';
    var md = function (d) { var t = new Date(d + 'T00:00:00'); return (t.getMonth() + 1) + '/' + t.getDate() + '(' + DOW[t.getDay()] + ')'; };
    return '<ul class="cal-l">' + all.map(function (e) { var K = KINDS[e.kind] || KINDS.event;
      return '<li><span class="k" style="color:' + K.color + ';background:' + K.bg + '">' + K.label + '</span><span class="d">' + md(e.date) + (e.endDate && e.endDate !== e.date ? ' ~ ' + md(e.endDate) : '') + '</span>'
        + '<span class="t">' + (e.schools && e.schools.length ? '<em class="sch">' + esc(e.schools.join('·')) + (e.gradeLabel ? ' ' + e.gradeLabel : '') + '</em>' : '') + esc(e.title || K.label) + (e.time ? ' · ' + esc(e.time) : '') + (e.note ? '<small>' + esc(e.note) + '</small>' : '') + '</span>'
        + (opt.editable && !e.builtin ? '<span class="ops"><button type="button" data-ee="' + esc(e.src || e.id) + '">수정</button><button type="button" data-ed="' + esc(e.src || e.id) + '">삭제</button></span>' : '') + '</li>';
    }).join('') + '</ul>';
  }
  // 플래너 월간 공부 달력
  function plannerHtml(ym, opt) {
    var docs = opt.docs || {}, today = opt.today, max = 1;
    Object.keys(docs).forEach(function (d) { if (docs[d] && docs[d].studyMin > max) max = docs[d].studyMin; });
    var cells = monthDays(ym).map(function (c) {
      var p = docs[c.d], m = p ? p.studyMin || 0 : 0, lv = !m ? 0 : m >= max * .75 ? 4 : m >= max * .5 ? 3 : m >= max * .25 ? 2 : 1;
      var all = p && p.total && p.done >= p.total;
      return '<div class="cc pl lv' + lv + ' ' + (c.cur ? '' : 'out ') + (c.d === today ? 'today ' : '') + (c.dow === 0 || HOLIDAYS[c.d] ? 'red ' : c.dow === 6 ? 'blue' : '') + '" data-d="' + c.d + '">'
        + '<span class="dn">' + c.n + '</span>' + (p && p.sticker ? '<span class="stk">' + esc(p.sticker) + '</span>' : all ? '<span class="stk">💮</span>' : '')
        + (m ? '<b class="mn">' + hm(m) + '</b>' : '') + (p && p.total ? '<small class="td">' + p.done + '/' + p.total + '</small>' : '') + '</div>';
    }).join('');
    return '<div class="cal-g">' + DOW.split('').map(function (w, i) { return '<div class="ch ' + (i === 0 ? 'red' : i === 6 ? 'blue' : '') + '">' + w + '</div>'; }).join('') + cells + '</div>';
  }

  var CSS = '.cal-g{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;}'
    + '.cal-g .ch{text-align:center;font-size:11.5px;font-weight:800;color:#63636B;padding:4px 0;}'
    + '.cal-g .ch.red,.cc.red .dn{color:#D6301F;} .cal-g .ch.blue,.cc.blue .dn{color:#3B6FE0;}'
    + '.cc{position:relative;min-height:68px;background:#fff;border:1px solid rgba(17,17,20,.08);border-radius:10px;padding:4px 4px 5px;display:flex;flex-direction:column;gap:2px;overflow:hidden;cursor:default;}'
    + '.cc.out{opacity:.35;} .cc.today{border:2px solid #111114;} .cc.examday{background:#FFF7F4;}'
    + '.cc .dn{font-size:12.5px;font-weight:900;font-variant-numeric:tabular-nums;line-height:1.1;}'
    + '.cc .hn{font-size:9.5px;font-weight:800;color:#D6301F;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.cc .ms{display:flex;flex-direction:column;gap:2px;}'
    + '.cm{display:block;font-size:9.5px;font-weight:800;line-height:1.25;padding:1px 4px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.cm.cls{background:#111114;color:#fff;} .cm.off{background:#F1F0EC;color:#9A9AA2;text-decoration:line-through;} .cm.mk{background:#3B6FE0;color:#fff;} .cm.chg{background:#7B3FD0;color:#fff;} .cm.bg{background:#0E8A8A;color:#fff;} .cm.trp{background:#FFF4E0;color:#B86A00;}'
    + '.cm.exam{background:#FFE3DA;color:#B4261A;} .cm.exd{background:#D6301F;color:#fff;} .cm.ev{background:#EAF6EF;color:#1F7A4D;} .cm.hol{background:#FFF5F5;color:#D6301F;}'
    + '.cc.pl{align-items:center;justify-content:flex-start;gap:1px;} .cc.pl .dn{align-self:flex-start;}'
    + '.cc.pl.lv1{background:#FFF1EC;} .cc.pl.lv2{background:#FFD9CC;} .cc.pl.lv3{background:#FFB39C;} .cc.pl.lv4{background:#FF8466;}'
    + '.cc.pl .mn{font-size:12px;font-weight:900;margin-top:auto;font-variant-numeric:tabular-nums;} .cc.pl .td{font-size:9.5px;font-weight:700;color:#63636B;}'
    + '.cc.pl .stk{position:absolute;top:3px;right:4px;font-size:12px;}'
    + '.cal-l{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:5px;}'
    + '.cal-l li{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid rgba(17,17,20,.08);border-radius:10px;padding:8px 10px;font-size:13px;}'
    + '.cal-l .k{flex:0 0 auto;font-size:11px;font-weight:900;padding:2px 7px;border-radius:6px;} .cal-l .d{flex:0 0 auto;font-weight:800;font-variant-numeric:tabular-nums;font-size:12.5px;}'
    + '.cal-l .t{min-width:0;flex:1;font-weight:700;} .cal-l .t small{display:block;font-size:11.5px;color:#63636B;font-weight:600;}'
    + '.cal-l .sch{font-style:normal;font-size:10.5px;font-weight:900;background:#111114;color:#fff;border-radius:5px;padding:1px 6px;margin-right:5px;vertical-align:1px;}'
    + '.cal-l .ops{display:flex;gap:4px;} .cal-l .ops button{border:0;background:#F1F0EC;border-radius:6px;padding:4px 8px;font-size:11.5px;font-weight:800;cursor:pointer;}'
    + '.cal-l .ops button[data-ed]{color:#D6301F;}'
    + '.cal-none{font-size:13px;color:#63636B;text-align:center;padding:12px 0 2px;}'
    + '@media (max-width:420px){ .cc{min-height:58px;padding:3px 2px 4px;border-radius:8px;} .cm{font-size:8.5px;padding:1px 2px;} .cc .hn{font-size:8.5px;} }';
  function injectCss() { if (typeof document === 'undefined' || document.getElementById('calCss')) return; var s = document.createElement('style'); s.id = 'calCss'; s.textContent = CSS; document.head.appendChild(s); }

  global.CAL = { HOLIDAYS: HOLIDAYS, KINDS: KINDS, monthDays: monthDays, shiftMonth: shiftMonth, classHtml: classHtml, listHtml: listHtml, plannerHtml: plannerHtml, injectCss: injectCss, forClass: forClass, dayLessons: dayLessons, expand: expand, prepare: prepare, pickSchedules: pickSchedules, inRange: inRange, OFF: OFF };
})(typeof window !== 'undefined' ? window : globalThis);
