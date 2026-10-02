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

  // ───────── 문항 구성 (5지선다 · 단답형 · 서논술형) ─────────
  // exam.layout = [{type:'mc'|'short'|'essay', count}] 순서대로 1번부터 이어짐. 없으면(예전 시험) 모두 객관식.
  const QTYPES = { mc: '5지선다', short: '단답형', essay: '서논술형' };
  function examTypes(exam) {
    const t = [null], qn = exam.questionCount || 0;
    (Array.isArray(exam.layout) ? exam.layout : []).forEach(seg => {
      for (let i = 0; i < (seg.count || 0); i++) t.push(QTYPES[seg.type] ? seg.type : 'mc');
    });
    while (t.length <= qn) t.push('mc');
    return t.slice(0, qn + 1);
  }
  /** [{type, from, to}] — 같은 유형이 이어지면 한 구간으로 */
  function examSegments(exam) {
    const t = examTypes(exam), out = [];
    for (let n = 1; n < t.length; n++) {
      const last = out[out.length - 1];
      if (last && last.type === t[n]) last.to = n; else out.push({ type: t[n], from: n, to: n });
    }
    return out;
  }
  function layoutText(exam) {
    if (!Array.isArray(exam.layout) || !exam.layout.length) return `${exam.choiceCount || 5}지선다`;
    return examSegments(exam).map(s => `${s.from === s.to ? s.from : s.from + '~' + s.to}번 ${QTYPES[s.type]}`).join(' · ');
  }
  // 단답형 비교: 공백 무시, 숫자는 값으로(12 = 12.0), 전각·특수 대시 정리
  function shortNorm(v) {
    return String(v == null ? '' : v).normalize('NFKC').replace(/\s+/g, '').replace(/[−–—]/g, '-').toLowerCase();
  }
  function shortEq(a, b) {
    const x = shortNorm(a), y = shortNorm(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const num = /^[-+]?(\d+\.?\d*|\.\d+)$/;
    return num.test(x) && num.test(y) && Number(x) === Number(y);
  }

  // ───────── 답안 정규화 ─────────
  // answers: {"1":[3], "19":"12", ...}  객관식은 배열, 단답형은 문자열, 서논술형은 [] (답안지에 작성)
  function normalizeAnswers(raw, questionCount, choiceCount, types) {
    const out = {};
    for (let n = 1; n <= questionCount; n++) {
      const v = raw && raw[String(n)];
      const ty = types ? types[n] : 'mc';
      if (ty === 'short') { out[n] = typeof v === 'string' ? v.slice(0, 40) : (Array.isArray(v) || v == null ? '' : String(v).slice(0, 40)); continue; }
      if (ty === 'essay') { out[n] = []; continue; }
      const arr = Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
      out[n] = [...new Set(arr.map(Number))]
        .filter(m => Number.isInteger(m) && m >= 1 && m <= choiceCount)
        .sort((a, b) => a - b);
    }
    return out;
  }

  // ───────── 채점 ─────────
  // 객관식: 정확히 1개 마킹 + 정답 목록(복수 정답 인정)에 있으면 정답. 미응답·중복 마킹은 오답.
  // 단답형: 인정 답안 중 하나와 같으면 정답.  서논술형: 선생님이 입력한 점수(부분 점수), 만점이면 정답.
  // allCorrect 문항은 전원 정답.
  function gradeOne(q, marked, essayScore) {
    if (q.allCorrect) return { ok: true, earned: q.points };
    if (q.type === 'essay') {
      const v = Math.max(0, Math.min(q.points, Number(essayScore) || 0));
      return { ok: v >= q.points, earned: v, partial: v > 0 && v < q.points, scored: essayScore != null && essayScore !== '' };
    }
    if (q.type === 'short') {
      const ok = q.answers.some(a => shortEq(a, marked));
      return { ok, earned: ok ? q.points : 0 };
    }
    const ok = marked.length === 1 && q.answers.includes(marked[0]);
    return { ok, earned: ok ? q.points : 0 };
  }

  /**
   * exam: {questionCount, choiceCount, layout}
   * key:  {answers: {"1":[3], "19":["12"], ...}, points: {"1":3,...}, allCorrect: [번호...]}
   * subs: [{code, name, answers}]  (최종 제출분만)
   * essay: {학생코드: {"22": 4.5, ...}}  서논술형 점수 (선택)
   * 반환: { questions, results[], stats }
   */
  function gradeExam(exam, key, subs, essay) {
    const qn = exam.questionCount, types = examTypes(exam);
    const questions = [];
    for (let n = 1; n <= qn; n++) {
      const type = types[n];
      const raw = (key.answers && key.answers[n]) || [];
      const allCorrect = (key.allCorrect || []).includes(n);
      if (type !== 'essay' && !allCorrect && !raw.length) throw new Error(`${n}번 정답이 비어 있습니다.`);
      const meta = (exam.meta && exam.meta[n]) || {};
      questions.push({ n, type, answers: type === 'short' ? raw.map(String) : type === 'essay' ? [] : raw.map(Number),
                       points: Number(key.points[n]) || 0, allCorrect, tag: meta.tag || null, level: meta.level || null, note: meta.note || null });
    }
    const maxScore = round(questions.reduce((s, q) => s + q.points, 0), 2);   // 0.1+0.2 같은 소수 오차 제거

    const results = subs.map(sub => {
      const marks = normalizeAnswers(sub.answers, qn, exam.choiceCount, types);
      const es = (essay && essay[sub.code]) || {};
      let total = 0, correct = 0;
      const qs = questions.map(q => {
        const marked = marks[q.n];
        const g = gradeOne(q, marked, es[q.n]);
        total += g.earned; correct += g.ok ? 1 : 0;
        const x = { n: q.n, type: q.type, marked, correct: q.answers, ok: g.ok, blank: q.type === 'essay' ? false : !marked.length,
                    points: q.points, earned: round(g.earned, 2), allCorrect: q.allCorrect, tag: q.tag, level: q.level, note: q.note };
        if (q.type === 'essay') { x.partial = !!g.partial; x.scored = !!g.scored; }
        return x;
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
      if (q.type === 'mc') for (let c = 1; c <= exam.choiceCount; c++) dist[c] = 0;
      let ok = 0, blank = 0, earned = 0;
      const shortAns = {};
      results.forEach(r => {
        const x = r.questions[q.n - 1];
        if (x.ok) ok++;
        if (x.blank) blank++;
        earned += x.earned;
        if (q.type === 'mc') x.marked.forEach(m => { dist[m]++; });
        else if (q.type === 'short' && x.marked) { const k = String(x.marked).trim(); shortAns[k] = (shortAns[k] || 0) + 1; }
      });
      const st = { n: q.n, type: q.type, rate: N ? round(ok / N * 100, 1) : 0, blank, dist };
      if (q.type === 'short') st.answers = Object.entries(shortAns).sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([v, c]) => ({ v, c, ok: q.allCorrect || q.answers.some(a => shortEq(a, v)) }));
      if (q.type === 'essay') { st.avg = N ? round(earned / N, 2) : 0; st.rate = N && q.points ? round(earned / N / q.points * 100, 1) : 0; }
      return st;
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

  // ───────── 등급 · 시험 분석 (성적표용) ─────────
  // 2022 개정 내신 5등급(누적 10·34·66·90·100%), 수능 9등급(4·11·23·40·60·77·89·96·100%)
  const GRADE_BANDS = { '5': [10, 34, 66, 90, 100], '9': [4, 11, 23, 40, 60, 77, 89, 96, 100] };
  function gradeOf(rank, n, system) {
    const bands = GRADE_BANDS[system]; if (!bands || !n) return null;
    const p = rank / n * 100;                      // 석차(동점 같은 등수) 기준 누적 비율
    for (let g = 0; g < bands.length; g++) if (p <= bands[g] + 1e-9) return g + 1;
    return bands.length;
  }
  /**
   * 채점 결과(gradeExam 반환값)로 성적표에 넣을 분석을 만든다.
   * 반환: { system, std, cutoffs[{grade, score, upTo}], hist[{from,to,count}], topWrong[], typeStats{tag:{max, avg, top30, sorted[]}}, byCode{code:{grade, types[]}} }
   */
  function examAnalytics(exam, graded) {
    const { results, stats, questions } = graded;
    const system = exam.gradeSystem === undefined ? '5' : exam.gradeSystem;   // 기본: 내신 5등급
    const N = results.length;
    const byCode = {};
    // 선생님이 직접 정한 등급 컷 점수(exam.gradeCuts = [1등급 컷, 2등급 컷, …], 마지막 등급은 나머지)
    const levels = GRADE_BANDS[system] ? GRADE_BANDS[system].length : 0;
    const cuts = Array.isArray(exam.gradeCuts) ? exam.gradeCuts.slice(0, Math.max(0, levels - 1)).map(Number) : null;
    const manual = !!(levels && exam.gradeMode === 'score' && cuts && cuts.length === levels - 1 && cuts.every(x => !isNaN(x)));
    const gradeByScore = sc => { for (let g = 0; g < cuts.length; g++) if (sc >= cuts[g] - 1e-9) return g + 1; return levels; };
    results.forEach(r => { byCode[r.code] = { grade: manual ? gradeByScore(r.score) : gradeOf(r.rank, N, system) }; });
    // 등급 컷: 등급마다 가장 낮은 점수와 그 등급까지의 누적 인원
    const cutoffs = [];
    if (manual) {
      let acc = 0;
      for (let g = 1; g <= levels; g++) {
        const count = results.filter(r => byCode[r.code].grade === g).length;
        acc += count;
        cutoffs.push({ grade: g, score: g < levels ? cuts[g - 1] : null, upTo: acc, count, manual: true });
      }
    } else if (GRADE_BANDS[system]) {
      const bands = GRADE_BANDS[system];
      for (let g = 1; g <= bands.length; g++) {
        const inG = results.filter(r => byCode[r.code].grade === g);
        if (!inG.length) continue;
        cutoffs.push({ grade: g, score: Math.min(...inG.map(r => r.score)), upTo: Math.max(...inG.map(r => r.rank + results.filter(x => x.score === r.score).length - 1)) });
      }
    }
    // 점수 구간별 인원 (만점을 5칸으로)
    const max = stats.maxScore || 100, bins = 5, w = max / bins, hist = [];
    for (let i = 0; i < bins; i++) hist.push({ from: round(i * w, 1), to: round((i + 1) * w, 1), count: 0 });
    results.forEach(r => { hist[Math.min(bins - 1, Math.floor(r.score / w))].count++; });
    // 오답률 TOP5
    const topWrong = stats.questionStats.map(q => ({ n: q.n, rate: q.rate, points: questions[q.n - 1].points, tag: questions[q.n - 1].tag || null }))
      .filter(q => !questions[q.n - 1].allCorrect).sort((a, b) => a.rate - b.rate || a.n - b.n).slice(0, 5);
    // 유형(단원 태그)별: 배점 합, 평균, 상위 30% 평균, 석차
    const tags = [...new Set(questions.map(q => q.tag).filter(Boolean))];
    const typeStats = {};
    tags.forEach(tag => {
      const qs = questions.filter(q => q.tag === tag);
      const tmax = qs.reduce((a, q) => a + q.points, 0);
      const earned = results.map(r => ({ code: r.code, v: r.questions.filter(x => x.tag === tag).reduce((a, x) => a + x.earned, 0) }))
        .sort((a, b) => b.v - a.v);
      const vals = earned.map(e => e.v);
      const top = vals.slice(0, Math.max(1, Math.ceil(N * 0.3)));
      typeStats[tag] = { max: round(tmax, 1), avg: round(vals.reduce((a, b) => a + b, 0) / (N || 1), 1),
        top30: round(top.reduce((a, b) => a + b, 0) / top.length, 1), count: qs.length };
      earned.forEach(e => {
        const t = { tag, mine: round(e.v, 1), max: typeStats[tag].max, avg: typeStats[tag].avg, top30: typeStats[tag].top30,
          rank: vals.filter(v => v > e.v).length + 1 };
        (byCode[e.code].types = byCode[e.code].types || []).push(t);
      });
    });
    return { system, gradeMode: manual ? 'score' : 'rank', std: stats.std, cutoffs, hist, topWrong, typeStats, byCode };
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
  /** 출강 학원 (메인 자료실 배너와 같은 키) */
  const ACADEMIES = [['daechi-sangsang', '대치 상상학원'], ['daechi-snt', '대치 SNT학원'], ['megastudy-russel', '메가스터디 러셀']];
  const ADMIN_PAGES = [['students.html', '학생 관리'], ['admin.html', '시험·OMR'], ['clinic.html', '오답 클리닉'], ['assign.html', '과제'], ['daily.html', '데일리 리포트'], ['ops.html', '운영'], ['study.html', '플래너·순공']];
  const STAFF_PAGES = [['daily.html', '데일리 리포트'], ['ops.html', '운영'], ['study.html', '플래너·순공']];
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

  // ───────── 선생님·조교 공통 로그인 ─────────
  // 반환: {uid, name, role:'admin'|'ta'} 또는 null(권한 없음)
  async function detectStaff(user) {
    try {
      const s = await db.collection('omrStaff').doc(user.uid).get();
      if (s.exists) return { uid: user.uid, name: s.data().name || '조교', role: 'ta' };
    } catch (e) { /* 무시 */ }
    try { await db.collection('omrStaff').limit(1).get(); return { uid: user.uid, name: '엄형국 선생님', role: 'admin' }; }
    catch (e) { /* 새 규칙이 아직 게시되지 않았을 수 있음 */ }
    // 예전 OMR 규칙에서도 선생님만 읽을 수 있는 학생 명단으로 한 번 더 확인
    try { await db.collection('omrStudents').limit(1).get(); return { uid: user.uid, name: '엄형국 선생님', role: 'admin', rulesMissing: true }; }
    catch (e) { return null; }
  }
  function staffNav(current, role) {
    const pages = role === 'admin' ? ADMIN_PAGES : STAFF_PAGES;
    return pages.map(([href, label]) =>
      `<a class="btn sm ${href === current ? 'primary' : 'ghost'}" href="${href}">${label}</a>`).join('');
  }
  /** loginEmail/loginPw/loginBtn/loginMsg/logoutBtn/adminEmail 요소를 연결. onChange(me|null, user) */
  function mountStaffLogin(onChange) {
    const auth = firebase.auth(), $ = id => document.getElementById(id);
    $('loginBtn').onclick = async () => {
      $('loginMsg').textContent = '로그인 중…';
      try { await auth.signInWithEmailAndPassword(staffEmail($('loginEmail').value), $('loginPw').value); }
      catch (e) { $('loginMsg').textContent = '로그인 실패: 아이디(이메일) 또는 비밀번호를 확인하세요.'; }
    };
    $('loginPw').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginBtn').click(); });
    $('logoutBtn').onclick = () => auth.signOut();
    auth.onAuthStateChanged(async user => {
      $('logoutBtn').classList.toggle('hidden', !user);
      $('adminEmail').textContent = user ? staffIdFromEmail(user.email) : '';
      onChange(user ? await detectStaff(user) : null, user);
    });
  }

  // ───────── 학생 코드 (포털과 같은 저장 키) ─────────
  const STUDENT_KEY = 'omrStudentCode';
  function savedCode() { try { return localStorage.getItem(STUDENT_KEY); } catch (e) { return null; } }
  function saveCode(c) { try { localStorage.setItem(STUDENT_KEY, c); } catch (e) {} }
  async function studentByCode(code) {
    code = String(code || '').trim().toUpperCase();
    if (code.length !== 6) return null;
    const s = await db.collection('omrCodes').doc(code).get();
    if (!s.exists) return null;
    const d = s.data();
    return { code, name: d.name, className: d.className, studentId: d.studentId, academy: d.academy || null, grade: d.grade || null };
  }
  /** 학생 페이지 공통: 저장된 코드로 학생을 불러오고, 없으면 포털로 보냄 */
  async function requireStudent() {
    const c = savedCode();
    const me = c ? await studentByCode(c).catch(() => null) : null;
    if (!me) { location.href = 'index.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search); return null; }
    return me;
  }
  // 이미지 줄이기 (긴 변 maxPx, JPEG) — 업로드 용량 절약
  function shrinkImage(file, maxPx = 1800, q = 0.85) {
    return new Promise(resolve => {
      if (!file.type.startsWith('image/') || file.type === 'image/gif') return resolve(file);
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const r = Math.min(1, maxPx / Math.max(img.width, img.height));
        if (r === 1 && file.size < 1.5e6) { URL.revokeObjectURL(url); return resolve(file); }
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => { URL.revokeObjectURL(url); resolve(b ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', q);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  function hhmm(v) {
    const d = toDate(v); if (!d) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // ───────── 순공 랭킹 ─────────
  // 날짜(YYYY-MM-DD) → [하루 키, 주 키(월요일), 달 키]
  function rankKeys(date) {
    const d = new Date(date + 'T00:00:00'), w = (d.getDay() + 6) % 7;
    const mon = new Date(d); mon.setDate(d.getDate() - w);
    return ['d' + date, 'w' + todayStr(mon), 'm' + date.slice(0, 7)];
  }
  // 김민준 → 김*준, 이서 → 이*, 남궁민수 → 남**수
  function maskName(n) {
    n = String(n || '').trim();
    if (n.length <= 1) return n || '학생';
    if (n.length === 2) return n[0] + '*';
    return n[0] + '*'.repeat(n.length - 2) + n[n.length - 1];
  }
  // 플래너 하루치에서 할 일 합치기 (학생 할 일 + 선생님 할 일)
  function plannerTodos(p) {
    p = p || {};
    const tdone = new Set(p.tdone || []);
    const mine = (p.todos || []).map(t => ({ ...t, teacher: false }));
    const tt = (p.ttodos || []).map(t => ({ ...t, teacher: true, done: tdone.has(t.id), star: false, from: 'teacher' }));
    const all = [...tt, ...mine];
    return { all, done: all.filter(t => t.done).length, total: all.length };
  }

  // ───────── 학생 대시보드 데이터 (메인 화면 배너용) ─────────
  // base: 학생 페이지까지의 경로 접두사 (메인에서는 'omr/')
  // 반환: { week:[{d,cls,t,m,href}], latest:{token,...report}|null, trend:[{date,score,max,avg,token}] }
  // ───────── 응시 대상 ─────────
  // 대상을 고른 시험: exam.classNames(반 목록) + exam.targetCodes(개별 학생 코드). 예전 시험은 exam.className 하나.
  function examForStudent(exam, me) {
    if (Array.isArray(exam.classNames)) return exam.classNames.includes(me.className) || (exam.targetCodes || []).includes(me.code);
    return exam.className === me.className;
  }
  /** 학생이 볼 수 있는 시험 목록 (QuerySnapshot 비슷한 {docs}) */
  async function examsForStudent(me) {
    const col = db.collection('omrExams');
    const snaps = await Promise.all([
      col.where('className', '==', me.className).get(),
      col.where('classNames', 'array-contains', me.className).get().catch(() => null),
      col.where('targetCodes', 'array-contains', me.code).get().catch(() => null),
    ]);
    const seen = new Set(), docs = [];
    snaps.forEach(sn => sn && sn.docs.forEach(d => {
      if (seen.has(d.id)) return; seen.add(d.id);
      if (examForStudent(d.data(), me)) docs.push(d);
    }));
    return { docs, size: docs.length, empty: !docs.length };
  }
  function audienceText(exam) {
    if (!Array.isArray(exam.classNames)) return exam.className || '';
    const c = exam.classNames, t = (exam.targetCodes || []).length;
    return [c.length ? c.join(', ') : '', t ? `개별 ${t}명` : ''].filter(Boolean).join(' + ') || '대상 없음';
  }

  // ───────── 과제 (사진·PDF 제출 / OMR 제출) ─────────
  // OMR 과제(kind:'omr', examId)는 그 시험 OMR을 최종 제출하면 자동으로 완료
  const HW_DONE = ['submitted', 'approved'];
  async function studentAssignments(me, base = '') {
    const qs = await db.collection('omrAssignments').where('className', '==', me.className).get();
    const list = qs.docs.map(d => ({ id: d.id, ...d.data() }));
    const subs = await Promise.all(list.map(a => (a.kind === 'omr' && a.examId
      ? db.collection('omrSubmissions').doc(`${a.examId}_${me.code}`).get()
      : db.collection('omrAssignSubs').doc(`${a.id}_${me.code}`).get()).then(x => x.exists ? x.data() : null).catch(() => null)));
    return list.map((a, i) => {
      const s = subs[i];
      let status = s ? s.status : 'none';
      if (a.kind === 'omr') status = !s ? 'none' : s.status === 'submitted' ? 'submitted' : 'in_progress';
      return { a, s, status, done: HW_DONE.includes(status), omr: a.kind === 'omr',
        href: a.kind === 'omr' && a.examId ? base + 'index.html?exam=' + encodeURIComponent(a.examId) : base + 'hw.html?id=' + encodeURIComponent(a.id) };
    }).sort((x, y) => (x.done - y.done) || ((toDate(x.a.dueAt) || new Date(8.64e15)) - (toDate(y.a.dueAt) || new Date(8.64e15))));
  }
  const HW_LABEL = { none: ['미제출', 'red'], in_progress: ['진행 중', 'closed'], submitted: ['제출 완료', 'draft'], revise: ['보완 필요', 'red'], approved: ['확인 완료 ✓', 'published'] };

  // 클리닉 시간이 이 반 대상인지 ('전체' / 한 반 / 여러 반 classNames)
  function slotForClass(s, cls) {
    return s.className === '전체' || s.className === cls || (Array.isArray(s.classNames) && s.classNames.includes(cls));
  }
  function slotClassLabel(s) {
    if (s.className === '전체') return '전체 반';
    return Array.isArray(s.classNames) && s.classNames.length > 1 ? s.classNames.join(' · ') : s.className;
  }

  // 영상 강의가 이 학생에게 보이는지 (반 '전체' 또는 같은 반 + 학원 지정 시 같은 학원)
  function lectureForStudent(l, me) {
    if (l.status !== 'open') return false;
    if (!(l.className === '전체' || l.className === me.className)) return false;
    return !l.academy || l.academy === me.academy;
  }
  const EXT_LINKS = [{ key: 'daechi-sangsang', label: '대치 상상학원 온라인강의실', url: 'https://dss3388.atedu.co.kr/user/main' }];

  async function studentDashboard(me, base = '', opts = {}) {
    const now = new Date(), in7 = new Date(now.getTime() + 7 * 864e5), today = todayStr();
    const safe = p => p.catch(e => { console.warn(e); return null; });
    const dLabel = d => { const days = Math.ceil((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
      return days < 0 ? '지남' : days === 0 ? '오늘' : 'D-' + days; };
    const [hwAll, slots, lecs, links, exams] = await Promise.all([
      safe(studentAssignments(me, base)),
      safe(db.collection('clinicSlots').get()),
      safe(db.collection('lectures').get()),
      safe(db.collection('dailyReportLinks').doc(me.code).get()),
      safe(examsForStudent(me)),
    ]);
    // 최근 시험 OMR 성적표 (결과 공개된 것)
    const rl = await db.collection('omrReportLinks').doc(me.code).get().then(x => x.exists ? (x.data().items || []) : []).catch(() => []);
    const lastExam = rl.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null;
    const rows = [];
    // 과제: 진행 중인 것 + 최근 끝낸 것 (나의 학습 「과제」 배너용), 이번 주 할 일에는 7일 안 기한의 미완료만
    const hw = (hwAll || []).filter(x => x.a.status === 'open' || x.status === 'revise' || (!x.done && toDate(x.a.dueAt) && toDate(x.a.dueAt) > new Date(now.getTime() - 14 * 864e5))).slice(0, 12);
    const hwExamIds = new Set((hwAll || []).filter(x => x.omr).map(x => x.a.examId));
    hw.forEach(x => {
      const due = toDate(x.a.dueAt);
      if (x.done || x.a.status !== 'open' || (due && due > in7)) return;
      rows.push({ sort: due ? due.getTime() : in7.getTime(), d: due ? dLabel(due) : '과제', cls: !due || due - now < 2 * 864e5 ? 'red' : '',
        t: x.a.title, m: x.status === 'revise' ? '보완 필요' : x.omr ? 'OMR 과제' : '과제', href: x.href });
    });
    if (slots) {
      const up = slots.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.date >= today && s.date <= todayStr(in7) && slotForClass(s, me.className));
      const got = await Promise.all(up.map(s => db.collection('clinicBookings').doc(`${s.id}_${me.code}`).get().then(x => x.exists).catch(() => false)));
      up.forEach((s, i) => { if (!got[i]) return;
        const t = new Date(`${s.date}T${s.start}:00`);
        rows.push({ sort: t.getTime(), d: `${t.getMonth() + 1}/${t.getDate()}`, cls: 'ink', t: `클리닉 ${s.start}–${s.end}`, m: s.place || '클리닉', href: base + 'book.html' }); });
    }
    const items = links && links.exists ? (links.data().items || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')) : [];
    let latest = null;
    if (items.length) {
      const r = await db.collection('dailyReports').doc(items[0].token).get().then(x => x.exists ? x.data() : null).catch(() => null);
      if (r) {
        latest = { token: items[0].token, ...r };
        if (r.extra && r.extra.needed && items[0].date >= todayStr(new Date(now.getTime() - 7 * 864e5)))
          rows.push({ sort: now.getTime() - 1, d: '추가학습', cls: 'red', t: r.extra.reason || '추가학습이 필요해요', m: r.extra.when || '', href: base + 'daily-report.html?t=' + encodeURIComponent(items[0].token) });
      }
    }
    if (exams) {
      const open = exams.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.status === 'open');
      const subs = await Promise.all(open.map(e => db.collection('omrSubmissions').doc(`${e.id}_${me.code}`).get().then(x => x.exists ? x.data() : null).catch(() => null)));
      open.forEach((e, i) => { if ((subs[i] && subs[i].status === 'submitted') || hwExamIds.has(e.id)) return;
        const due = toDate(e.dueAt);
        rows.push({ sort: due ? due.getTime() : now.getTime(), d: due ? dLabel(due) : 'OMR', cls: 'red', t: e.title, m: '시험 OMR', href: base + 'index.html?exam=' + encodeURIComponent(e.id) }); });
    }
    if (lecs) {
      const mine = lecs.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => l.kind !== 'link' && lectureForStudent(l, me))
        .sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0)).slice(0, 6);
      const vs = await Promise.all(mine.map(l => db.collection('lectureViews').doc(`${l.id}_${me.code}`).get().then(x => x.exists ? x.data() : null).catch(() => null)));
      mine.forEach((l, i) => { if (vs[i] && vs[i].completed) return;
        if (rows.filter(r => r.m.includes('시청') || r.m === '안 봤어요').length >= 3) return;
        rows.push({ sort: in7.getTime() + 1, d: '영상', cls: '', t: l.title, m: vs[i] ? Math.round(vs[i].percent) + '% 시청' : '안 봤어요', href: base + 'watch.html?id=' + encodeURIComponent(l.id) }); });
    }
    rows.sort((a, b) => a.sort - b.sort);
    const trend = items.filter(x => x.score != null && !x.absent).slice(0, 5).reverse();
    // 스터디 플래너: 오늘부터 이번 주 일요일까지 학생이 직접 적은 할 일
    let plan = null;
    if (opts.withPlanner) {
      const DOW = '일월화수목금토';
      const days = []; const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const left = (7 - d0.getDay()) % 7;                       // 일요일까지 남은 날
      for (let i = 0; i <= left; i++) { const d = new Date(d0); d.setDate(d.getDate() + i); days.push(todayStr(d)); }
      const docs = await Promise.all(days.map(d => db.collection('planners').doc(`${me.code}_${d}`).get().then(x => x.exists ? x.data() : null).catch(() => null)));
      const todayDoc = docs[0] || null;
      const tsum = plannerTodos(todayDoc);
      plan = { today: { done: tsum.done, total: tsum.total, studyMin: (todayDoc && todayDoc.studyMin) || 0 }, rows: [] };
      docs.forEach((doc, i) => {
        if (!doc) return;
        const dd = new Date(days[i] + 'T00:00:00');
        plannerTodos(doc).all.filter(t => !t.done).forEach(t => plan.rows.push({
          sort: dd.getTime() + (t.star ? 0 : 1), d: i === 0 ? '오늘' : DOW[dd.getDay()], cls: 'plan', subj: t.subj, t: t.text, m: t.amount || '', href: base + 'planner.html' }));
      });
    }
    return { week: rows, latest, trend, plan, hw, exam: lastExam };
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
    GRADE_BANDS, gradeOf, examAnalytics,
    normalizePhone, fmtPhone, round, toast, copyText, normalizeAnswers, gradeOne, gradeExam,
    QTYPES, examTypes, examSegments, layoutText, shortEq,
    reportUrl, downloadCsv, analyzeWeakness, pickClinicItems, gradeClinic, retestSummary,
    adminNav, mountAdminLogin, commitOps, shuffle, UNTAGGED,
    ACADEMIES, lectureForStudent, EXT_LINKS, slotForClass, slotClassLabel, studentAssignments, HW_LABEL, examForStudent, examsForStudent, audienceText, rankKeys, maskName, plannerTodos, studentDashboard, detectStaff, staffNav, mountStaffLogin, savedCode, saveCode, studentByCode, requireStudent, shrinkImage, hhmm, STUDENT_KEY,
    DAILY_MESSAGE_TEMPLATE, renderDailyMessage, dailyReportUrl, staffEmail, staffIdFromEmail, STAFF_DOMAIN, todayStr, fmtKDate,
  };
})(typeof window !== 'undefined' ? window : globalThis);
