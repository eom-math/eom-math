// 엄형국 수학 — 방문자용 예시 데이터 (실제 학생 기록이 아님)
// report.html?demo=1 · daily-report.html?demo=1 · review.html?demo=1 · hw.html?demo=1 에서 사용
(function (global) {
  const OMR = global.OMR;
  // 매번 같은 결과가 나오도록 고정 시드 난수
  let seed = 20261002;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pad = n => String(n).padStart(2, '0');
  const dayStr = off => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const NAME = '예시 학생', CLASS = '고1 예시반';

  // ───── 시험 OMR 성적표 예시: 실제 채점 로직(gradeExam·examAnalytics)으로 계산 ─────
  const META = [
    ['미분계수와 도함수', '하', '곱의 미분법, 미분계수 = 접선의 기울기'], ['함수의 극한', '하', '∞−∞ 꼴, 분자 유리화'], ['함수의 연속', '하', '사잇값의 정리'],
    ['함수의 극한', '중', '함수의 극한의 대소 관계'], ['함수의 극한', '중', '미정계수 결정'], ['미분계수와 도함수', '하', '미분계수의 정의를 이용한 극한값'],
    ['미분계수와 도함수', '중', '다항식의 나눗셈과 미분'], ['접선의 방정식', '중', '곡선 밖의 점에서 그은 접선'], ['함수의 연속', '중', '구간별로 정의된 함수의 곱의 연속'],
    ['접선의 방정식', '중', '두 곡선의 공통인 접선'], ['함수의 극한', '중', '∞×0 꼴 극한, 유리화'], ['접선의 방정식', '상', '접선·수직인 직선과 넓이의 극한'],
    ['함수의 극한', '중', '그래프를 이용한 극한, 치환'], ['접선의 방정식', '상', '접선과 곡선의 교점, 수직 조건'], ['미분계수와 도함수', '상', '연속과 미분가능성(<보기> 판단)'],
    ['함수의 연속', '상', '곱함수의 연속, 불연속인 점의 개수'], ['함수의 연속', '최상', '좌극한·우극한으로 정의된 함수의 연속'], ['함수의 연속', '상', '연속·감소 조건으로 함수 결정'],
    ['함수의 극한', '상', '극한 조건으로 이차함수 결정'], ['함수의 극한', '상', '극한 조건으로 다항함수 추론'],
    ['미분계수와 도함수', '상', '극한 존재 조건, 부등식과 판별식'], ['미분계수와 도함수', '최상', '미분가능성, 경우 나누기'],
  ];
  const LV = { '하': .92, '중': .75, '상': .55, '최상': .35 };
  function examReport() {
    seed = 20261002;
    const qn = 22;
    const exam = { title: '10월 주간평가', subject: '미적분I', className: CLASS, questionCount: qn, choiceCount: 5,
      layout: [{ type: 'mc', count: 20 }, { type: 'essay', count: 2 }], gradeSystem: '5', examDate: dayStr(-1), meta: {} };
    const answers = {}, points = {};
    for (let n = 1; n <= qn; n++) {
      exam.meta[n] = { tag: META[n - 1][0], level: META[n - 1][1], note: META[n - 1][2] };
      if (n <= 20) answers[n] = [1 + Math.floor(rnd() * 5)];
      points[n] = n <= 10 ? 3 : n <= 20 ? 4 : n === 21 ? 12 : 18;
    }
    const key = { answers, points, allCorrect: [] };
    const subs = [], essay = {};
    for (let i = 0; i < 24; i++) {
      const ability = i === 0 ? 0.13 : (rnd() - 0.5) * 0.5;      // 0번 = 예시 학생 (상위권)
      const code = 'S' + i, a = {};
      for (let n = 1; n <= 20; n++) {
        const p = Math.min(.98, Math.max(.05, LV[META[n - 1][1]] + ability));
        a[n] = rnd() < p ? answers[n] : [1 + ((answers[n][0] + Math.floor(rnd() * 4)) % 5)];
      }
      essay[code] = { 21: Math.round(Math.min(1, Math.max(0, .55 + ability + (rnd() - .5) * .4)) * 12 * 2) / 2,
                      22: Math.round(Math.min(1, Math.max(0, .35 + ability + (rnd() - .5) * .4)) * 18 * 2) / 2 };
      subs.push({ code, name: i === 0 ? NAME : '학생' + i, answers: a });
    }
    const graded = OMR.gradeExam(exam, key, subs, essay);
    const an = OMR.examAnalytics(exam, graded);
    const r = graded.results.find(x => x.code === 'S0'), st = graded.stats;
    const hist = [[-35, 71, 9, 24], [-28, 76, 7, 24], [-21, 74, 8, 23], [-14, 81, 6, 24], [-7, 79, 6, 24]]
      .map(([off, score, rank, n], i) => ({ title: `${9 + Math.floor(i / 2)}월 주간평가 ${i % 2 + 1}회`, date: dayStr(off - 1), score, max: 100, rank, n, grade: rank <= 2 ? 1 : rank <= 8 ? 2 : 3, avg: 64 + i, className: CLASS }));
    hist.push({ title: exam.title, date: exam.examDate, score: r.score, max: st.maxScore, rank: r.rank, n: st.n, grade: an.byCode.S0.grade, avg: st.avg, className: CLASS });
    return {
      demo: true, examTitle: exam.title, subject: exam.subject, className: CLASS, examDate: exam.examDate,
      code: 'S0', name: NAME, score: r.score, maxScore: st.maxScore, correctCount: r.correctCount, questionCount: qn,
      rank: r.rank, n: st.n, percentile: r.percentile, avg: st.avg, high: st.high, low: st.low,
      wrong: r.questions.filter(q => !q.ok).map(q => q.n), questions: r.questions, passScore: 70,
      gradeSystem: an.system, grade: an.byCode.S0.grade, std: an.std, cutoffs: an.cutoffs, hist: an.hist,
      topWrong: an.topWrong, types: an.byCode.S0.types || [], retest: null, history: hist,
    };
  }

  // ───── 데일리 리포트 예시 (시험 OMR 결과가 자동으로 들어간 형태) ─────
  function dailyReport() {
    const ex = examReport();
    const trend = [[-28, 72, 66], [-21, 78, 68], [-14, 76, 70], [-7, 85, 71]].map(([off, score, avg]) => ({ date: dayStr(off - 1), title: '', score, max: 100, avg }));
    trend.push({ date: ex.examDate, title: '13회차', score: ex.score, max: ex.maxScore, avg: ex.avg });
    const weak = [...new Set(ex.questions.filter(q => !q.ok && q.tag).map(q => q.note || q.tag))].slice(0, 3);
    return {
      demo: true, name: NAME, className: CLASS, date: ex.examDate, title: '13회차',
      progress: '미적분I 함수의 연속 — 사잇값의 정리, 구간별로 정의된 함수', nextHomework: '쎈 B단계 212~240번 · 오답노트 3문항',
      testName: ex.examTitle + ' (OMR)', unit: '함수의 연속', maxScore: ex.maxScore, attendance: 'present',
      score: ex.score, homework: 90, weak, comment: '오늘 시험에서 기본 개념 문항은 거의 완벽했어요. 노란색 유형과 서술형의 경우 나누기만 조금 더 연습하면 1등급도 충분합니다. 이번 주 클리닉에서 22번 유형을 같이 다시 풀어 봐요!',
      extra: { needed: true, when: '토요일 14:00 클리닉', reason: '서술형 미분가능성 경우 나누기' },
      avg: ex.avg, high: ex.high, n: ex.n, hwAvg: 82, files: [], trend, author: '엄형국 선생님',
      exam: { title: ex.examTitle, score: ex.score, max: ex.maxScore, rank: ex.rank, n: ex.n, grade: ex.grade, token: 'demo', href: 'report.html?demo=1' },
    };
  }

  // ───── 복습 테스트 추이 예시 (review.html) ─────
  function reviewData() {
    const U = [
      ['함수의 극한', [62, 70, 78, 84], [['∞−∞ 꼴'], ['미정계수 결정'], [], []]],
      ['함수의 연속', [58, 64, 61, 72], [['사잇값의 정리', '구간별 함수'], ['구간별 함수'], ['구간별 함수', '불연속점 개수'], ['불연속점 개수']]],
      ['미분계수와 도함수', [80, 86, 90], [['곱의 미분법'], [], []]],
      ['접선의 방정식', [55, 63], [['곡선 밖의 점에서 그은 접선'], ['공통접선']]],
    ];
    const tests = [];
    let off = -60;
    const order = [[0, 0], [1, 0], [0, 1], [2, 0], [1, 1], [0, 2], [2, 1], [1, 2], [3, 0], [0, 3], [2, 2], [3, 1], [1, 3]];
    order.forEach(([u, k], i) => {
      off += 4 + (i % 3);
      const [unit, scores, weaks] = U[u];
      tests.push({ date: dayStr(off), title: `${i + 1}회차`, token: 'demo', score: scores[k], max: 100, avg: 66 + (i % 4) * 2,
        unit, weak: (weaks[k] || []).filter(w => w.trim() && w !== 'ㅤ'), testName: unit + ' 복습 테스트' });
    });
    return { me: { name: NAME, className: CLASS }, tests };
  }

  // ───── 과제 예시 (hw.html) ─────
  function homework() {
    const due = new Date(); due.setDate(due.getDate() + 1); due.setHours(22, 0, 0, 0);
    const at = new Date(); at.setHours(at.getHours() - 3);
    return {
      a: { title: '쎈 B단계 212~240번', description: '풀이 과정이 보이게 사진을 찍어 올리세요.\n틀린 문제는 빨간 펜으로 다시 풀어 오답노트에 적어 오세요.', dueAt: due, status: 'open', className: CLASS },
      me: { name: NAME, className: CLASS },
      sub: { status: 'approved', submittedAt: at, memo: '230번은 풀이가 잘 안 떠올라서 해설을 봤어요.',
        files: [{ name: '쎈_212-220.jpg', size: 1.6e6, type: 'image/jpeg' }, { name: '쎈_221-230.jpg', size: 1.4e6, type: 'image/jpeg' }, { name: '쎈_231-240.jpg', size: 1.5e6, type: 'image/jpeg' }] },
    };
  }

  // 예시 화면 위 안내 띠
  function banner(what) {
    const css = `<style>.demo-bar{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#111114;color:#fff;
      padding:10px 14px;margin:0 -16px 16px;font-size:13px;line-height:1.45}.demo-bar b{color:#ff7a6c;font-weight:900;letter-spacing:.06em}
      .demo-bar span{flex:1;min-width:180px;color:rgba(255,255,255,.85)}.demo-bar a{color:#111114;background:#fff;font-weight:800;padding:7px 11px;border-radius:8px;text-decoration:none;white-space:nowrap}
      .demo-bar a.k{background:#D6301F;color:#fff}@media print{.demo-bar{display:none}}</style>`;
    return css + `<div class="demo-bar"><b>예시</b><span>${what} — 실제 학생은 학생 코드로 입장하면 자기 기록이 이렇게 보여요.</span>
      <a href="../">← 메인</a><a class="k" href="https://open.kakao.com/o/gvaZ3mHi" target="_blank" rel="noopener">상담 문의</a></div>`;
  }

  global.DEMO = { examReport, dailyReport, reviewData, homework, banner, isDemo: () => new URLSearchParams(location.search).has('demo') };
})(typeof window !== 'undefined' ? window : globalThis);
