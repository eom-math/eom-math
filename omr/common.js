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
      questions.push({ n, answers: ans.map(Number), points: Number(key.points[n]) || 0, allCorrect });
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
                 points: q.points, earned, allCorrect: q.allCorrect };
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
    reportUrl, downloadCsv,
  };
})(typeof window !== 'undefined' ? window : globalThis);
