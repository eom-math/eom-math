/* 엄형국 수학 · 모바일 OMR 공통 모듈 (Firebase compat SDK 10.x 필요) */
(function (global) {
  'use strict';

  const firebaseConfig = {
    apiKey: "AIzaSyAj29XZzqdgGbvIMPm_JaEJwakvflXbrYM",
    authDomain: "eom-math.firebaseapp.com",
    projectId: "eom-math",
    storageBucket: "eom-math.firebasestorage.app",
    messagingSenderId: "849635933461",
    appId: "1:849635933461:web:d24910ea586db9467a3d1c"
  };
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  const FV = firebase.firestore.FieldValue;

  // ───────── 알림 문구 (알리고에 등록할 템플릿과 글자 단위로 같게 유지) ─────────
  const MESSAGE_TEMPLATE =
    '[엄형국 수학] #{학생이름} 학생의 #{시험명} 성적표가 발송되었습니다.\n\n' +
    '점수와 문항별 정오답은 아래 링크에서 확인하실 수 있습니다.\n#{링크}';

  function renderMessage(vars) {
    return MESSAGE_TEMPLATE.replace(/#\{([^}]+)\}/g, (_, k) => vars[k] ?? '');
  }

  // ───────── 유틸 ─────────
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O, 1/I 제외
  function randomString(len, alphabet) {
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    return Array.from(buf, n => alphabet[n % alphabet.length]).join('');
  }
  const genCode = () => randomString(6, CODE_ALPHABET);
  const genToken = () => randomString(22, 'abcdefghijkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ');

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toDate(v) {
    if (!v) return null;
    if (v.toDate) return v.toDate();
    return v instanceof Date ? v : new Date(v);
  }
  function fmtDateTime(v) {
    const d = toDate(v);
    if (!d) return '';
    const p = n => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function normalizePhone(raw) {
    if (!raw) return null;
    let d = String(raw).replace(/\D/g, '');
    if (d.startsWith('82')) d = '0' + d.slice(2);
    return /^01[016789]\d{7,8}$/.test(d) ? d : null;
  }
  function fmtPhone(p) {
    const d = normalizePhone(p);
    return d ? d.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3') : (p || '');
  }
  const round = (x, n = 1) => Math.round(x * 10 ** n) / 10 ** n;

  function toast(msg, ms = 2200) {
    let el = document.getElementById('omrToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'omrToast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms);
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    toast('복사했습니다');
  }

  // ───────── 답안 정규화 ─────────
  // answers: {"1":[3], "2":[], ...}
  function normalizeAnswers(raw, questionCount, choiceCount) {
    const out = {};
    for (let n = 1; n <= questionCount; n++) {
      const v = raw && raw[String(n)];
      const arr = Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
      out[n] = [...new Set(arr.map(Number))]
        .filter(m => Number.isInteger(m) && m >= 1 && m <= choiceCount)
        .sort((a, b) => a - b);
    }
    return out;
  }

  // ───────── 채점 ─────────
  // 규칙: 정확히 1개 마킹 + 그 번호가 정답 목록(복수 정답 인정)에 있으면 정답.
  //       미응답·중복 마킹은 오답. allCorrect 문항은 전원 정답.
  function gradeOne(q, marked) {
    if (q.allCorrect) return { ok: true, earned: q.points };
    const ok = marked.length === 1 && q.answers.includes(marked[0]);
    return { ok, earned: ok ? q.points : 0 };
  }

  /**
   * exam: {questionCount, choiceCount}
   * key:  {answers: {"1":[3],...}, points: {"1":3,...}, allCorrect: [번호...]}
   * subs: [{code, name, answers}]  (최종 제출분만)
   * 반환: { questions, results[], stats }
   */
  function gradeExam(exam, key, subs) {
    const qn = exam.questionCount;
    const questions = [];
    for (let n = 1; n <= qn; n++) {
      const ans = (key.answers && key.answers[n]) || [];
      const allCorrect = (key.allCorrect || []).includes(n);
      if (!allCorrect && !ans.length) throw new Error(`${n}번 정답이 비어 있습니다.`);
      const meta = (exam.meta && exam.meta[n]) || {};
      questions.push({ n, answers: ans.map(Number), points: Number(key.points[n]) || 0, allCorrect,
                       tag: meta.tag || null, level: meta.level || null });
    }
    const maxScore = questions.reduce((s, q) => s + q.points, 0);

    const results = subs.map(sub => {
      const marks = normalizeAnswers(sub.answers, qn, exam.choiceCount);
      let total = 0, correct = 0;
      const qs = questions.map(q => {
        const marked = marks[q.n];
        const { ok, earned } = gradeOne(q, marked);
        total += earned; correct += ok ? 1 : 0;
        return { n: q.n, marked, correct: q.answers, ok, blank: !marked.length,
                 points: q.points, earned, allCorrect: q.allCorrect, tag: q.tag, level: q.level };
      });
      return { code: sub.code, name: sub.name, score: round(total, 2), correctCount: correct, questions: qs };
    });

    // 석차(동점 같은 등수)·백분위((아래 인원 + 동점 절반)/전체)
    const scores = results.map(r => r.score);
    const N = results.length;
    results.forEach(r => {
      const higher = scores.filter(x => x > r.score).length;
      const lower = scores.filter(x => x < r.score).length;
      const ties = scores.filter(x => x === r.score).length;
      r.rank = higher + 1;
      r.percentile = N ? round((lower + ties / 2) / N * 100, 1) : 0;
    });
    results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));

    const mean = N ? scores.reduce((a, b) => a + b, 0) / N : 0;
    const std = N ? Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / N) : 0;
    const questionStats = questions.map(q => {
      const dist = {};
      for (let c = 1; c <= exam.choiceCount; c++) dist[c] = 0;
      let ok = 0, blank = 0;
      results.forEach(r => {
        const x = r.questions[q.n - 1];
        if (x.ok) ok++;
        if (x.blank) blank++;
        x.marked.forEach(m => { dist[m]++; });
      });
      return { n: q.n, rate: N ? round(ok / N * 100, 1) : 0, blank, dist };
    });
    results.forEach(r => r.questions.forEach(x => { x.rate = questionStats[x.n - 1].rate; }));

    return {
      questions,
      results,
      stats: {
        n: N, maxScore,
        avg: N ? round(mean, 2) : null,
        high: N ? Math.max(...scores) : null,
        low: N ? Math.min(...scores) : null,
        std: N ? round(std, 2) : null,
        questionStats,
      },
    };
  }

  // ───────── 오답 분석 (단원 태그별) ─────────
  const UNTAGGED = '미분류';
  /**
   * exams: [{id, questionCount, meta:{"1":{tag,level}}}]
   * subs:  채점된 제출 [{examId, code, name, wrong:[번호...]}]
   * 반환: { tags:[{tag, attempts, wrong, rate}], students:[{code,name,attempts,wrong,tags:{tag:{attempts,wrong,rate}},weak:[tag...]}] }
   */
  function analyzeWeakness(exams, subs) {
    const exMap = Object.fromEntries(exams.map(e => [e.id, e]));
    const tagAgg = {}, stuAgg = {};
    subs.forEach(s => {
      const e = exMap[s.examId];
      if (!e) return;
      const wrong = new Set(s.wrong || []);
      const st = stuAgg[s.code] = stuAgg[s.code] || { code: s.code, name: s.name, attempts: 0, wrong: 0, tags: {} };
      for (let n = 1; n <= e.questionCount; n++) {
        const tag = (e.meta && e.meta[n] && e.meta[n].tag) || UNTAGGED;
        const w = wrong.has(n) ? 1 : 0;
        const t = tagAgg[tag] = tagAgg[tag] || { tag, attempts: 0, wrong: 0 };
        t.attempts++; t.wrong += w;
        const u = st.tags[tag] = st.tags[tag] || { attempts: 0, wrong: 0 };
        u.attempts++; u.wrong += w;
        st.attempts++; st.wrong += w;
      }
    });
    const rate = x => x.attempts ? round(x.wrong / x.attempts * 100, 1) : 0;
    const tags = Object.values(tagAgg).map(t => ({ ...t, rate: rate(t) }))
      .sort((a, b) => b.rate - a.rate || b.wrong - a.wrong);
    const students = Object.values(stuAgg).map(s => {
      Object.values(s.tags).forEach(t => { t.rate = rate(t); });
      const weak = Object.entries(s.tags).filter(([tag, t]) => t.wrong > 0 && tag !== UNTAGGED)
        .sort((a, b) => b[1].rate - a[1].rate || b[1].wrong - a[1].wrong).slice(0, 3).map(([tag]) => tag);
      return { ...s, rate: rate(s), weak };
    }).sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name, 'ko'));
    return { tags, students };
  }

  // ───────── 맞춤 클리닉 문항 선택 ─────────
  function shuffle(arr) {
    const a = arr.slice(), r = new Uint32Array(a.length);
    crypto.getRandomValues(r);
    for (let i = a.length - 1; i > 0; i--) { const j = r[i] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  /**
   * wrongs: [{tag, level}]  (학생의 오답 문항들)
   * bank:   [{id, tag, level, ...}]
   * 같은 단원 문항을 오답 1개당 perWrong개, 같은 난이도 우선, 이미 푼 문항(exclude) 제외.
   * 반환: { items:[bank item], unmatched:[tag...] }
   */
  function pickClinicItems(wrongs, bank, { perWrong = 1, maxItems = 20, exclude = new Set() } = {}) {
    const byTag = {};
    wrongs.forEach(w => { if (w.tag) (byTag[w.tag] = byTag[w.tag] || []).push(w); });
    const order = Object.keys(byTag).sort((a, b) => byTag[b].length - byTag[a].length);
    const used = new Set(exclude), items = [], unmatched = [];
    // 단원별로 돌아가며 하나씩 뽑아 한 단원이 학습지를 독차지하지 않게 함
    const queues = order.map(tag => ({ tag, need: byTag[tag].length * perWrong, levels: byTag[tag].map(w => w.level) }));
    order.forEach(tag => { if (!bank.some(b => b.tag === tag)) unmatched.push(tag); });
    let progress = true;
    while (items.length < maxItems && progress) {
      progress = false;
      for (const q of queues) {
        if (items.length >= maxItems || q.need <= 0) continue;
        const cands = shuffle(bank.filter(b => b.tag === q.tag && !used.has(b.id)));
        if (!cands.length) { q.need = 0; continue; }
        const lv = q.levels[0];
        const pick = cands.find(b => lv && b.level === lv) || cands[0];
        used.add(pick.id); items.push(pick); q.need--; q.levels.push(q.levels.shift());
        progress = true;
      }
    }
    return { items, unmatched };
  }

  // 학습지 채점 (한 문항 하나만 마킹, 정답 목록에 있으면 정답)
  function gradeClinic(key, answers, count) {
    const res = [];
    let correct = 0;
    for (let n = 1; n <= count; n++) {
      const marked = (answers && answers[n]) || [];
      const ans = (key[n] || []).map(Number);
      const ok = marked.length === 1 && ans.includes(Number(marked[0]));
      if (ok) correct++;
      res.push({ n, marked, correct: ans, ok });
    }
    return { correct, total: count, percent: count ? round(correct / count * 100, 1) : 0, questions: res };
  }

  // 재시험: 가장 높은 재시험 점수를 최종 반영, 기준 이상이면 통과
  function retestSummary(r) {
    const scores = (r.attempts || []).map(a => Number(a.score)).filter(x => !isNaN(x));
    const best = scores.length ? Math.max(...scores) : null;
    const status = best == null ? 'pending' : (best >= r.passScore ? 'passed' : 'failed');
    return { best, status, finalScore: best == null ? r.originalScore : Math.max(best, r.originalScore) };
  }

  // ───────── 관리자 공통: 로그인·상단 메뉴 ─────────
  const ADMIN_PAGES = [['admin.html', '시험·OMR'], ['clinic.html', '오답 클리닉'], ['assign.html', '과제'], ['daily.html', '데일리 리포트']];
  function adminNav(current) {
    return ADMIN_PAGES.map(([href, label]) =>
      `<a class="btn sm ${href === current ? 'primary' : 'ghost'}" href="${href}">${label}</a>`).join('');
  }
  /** #vLogin 안의 loginEmail/loginPw/loginBtn/loginMsg, logoutBtn, adminEmail 요소를 연결 */
  function mountAdminLogin(onChange) {
    const auth = firebase.auth(), $ = id => document.getElementById(id);
    $('loginBtn').onclick = async () => {
      $('loginMsg').textContent = '로그인 중…';
      try { await auth.signInWithEmailAndPassword($('loginEmail').value.trim(), $('loginPw').value); }
      catch (e) { $('loginMsg').textContent = '로그인 실패: 이메일 또는 비밀번호를 확인하세요.'; }
    };
    $('loginPw').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginBtn').click(); });
    $('logoutBtn').onclick = () => auth.signOut();
    auth.onAuthStateChanged(user => {
      $('logoutBtn').classList.toggle('hidden', !user);
      $('adminEmail').textContent = user ? user.email : '';
      onChange(user);
    });
  }

  // 여러 문서 쓰기를 400개씩 나눠 커밋
  async function commitOps(ops) {
    for (let i = 0; i < ops.length; i += 400) {
      const bt = db.batch();
      ops.slice(i, i + 400).forEach(([op, ref, data, opt]) => opt ? bt[op](ref, data, opt) : (data ? bt[op](ref, data) : bt[op](ref)));
      await bt.commit();
    }
  }

  // ───────── 데일리 리포트 ─────────
  const DAILY_MESSAGE_TEMPLATE =
    '[엄형국 수학] #{학생이름} 학생의 #{날짜} 수업 리포트입니다.\n\n' +
    '오늘 테스트 결과, 과제 이행률, 보완할 유형과 선생님 코멘트를 아래 링크에서 확인하실 수 있습니다.\n#{링크}';
  function renderDailyMessage(vars) {
    return DAILY_MESSAGE_TEMPLATE.replace(/#\{([^}]+)\}/g, (_, k) => vars[k] ?? '');
  }
  function dailyReportUrl(token) {
    return new URL('daily-report.html?t=' + encodeURIComponent(token), location.href).href;
  }
  // 조교 아이디 → 로그인용 이메일 (아이디만 입력해도 로그인되게)
  const STAFF_DOMAIN = 'ta.eom-math.app';
  function staffEmail(id) {
    id = String(id || '').trim();
    return id.includes('@') ? id : id.toLowerCase() + '@' + STAFF_DOMAIN;
  }
  function staffIdFromEmail(email) {
    return String(email || '').endsWith('@' + STAFF_DOMAIN) ? email.split('@')[0] : email;
  }
  function todayStr(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function fmtKDate(s) {
    if (!s) return '';
    const d = new Date(s + 'T00:00:00');
    if (isNaN(d)) return s;
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`;
  }

  function reportUrl(token) {
    return new URL('report.html?t=' + encodeURIComponent(token), location.href).href;
  }

  // CSV (엑셀에서 한글 깨지지 않게 BOM 포함)
  function downloadCsv(filename, rows) {
    const csv = rows.map(r => r.map(v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  global.OMR = {
    db, FV, MESSAGE_TEMPLATE, renderMessage, genCode, genToken, esc, toDate, fmtDateTime,
    normalizePhone, fmtPhone, round, toast, copyText, normalizeAnswers, gradeOne, gradeExam,
    reportUrl, downloadCsv, analyzeWeakness, pickClinicItems, gradeClinic, retestSummary,
    adminNav, mountAdminLogin, commitOps, shuffle, UNTAGGED,
    DAILY_MESSAGE_TEMPLATE, renderDailyMessage, dailyReportUrl, staffEmail, staffIdFromEmail, STAFF_DOMAIN, todayStr, fmtKDate,
  };
})(typeof window !== 'undefined' ? window : globalThis);
