// 옛 주소(eom-math.github.io/eom-math/...) → 새 주소(eom-math.web.app/...)로 경로·쿼리 그대로 이동
(function () {
  var NEW = 'https://eom-math.web.app';
  var p = location.pathname.replace(/^\/eom-math(\/|$)/, '/');
  location.replace(NEW + p + location.search + location.hash);
})();
