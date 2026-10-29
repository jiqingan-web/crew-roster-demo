/* intro.js v6 — nav + reduced-motion-aware reveal */
(function () {
  var toggle = document.getElementById('navToggle');
  var inner = document.querySelector('.topbar-inner');
  var nav = document.getElementById('siteNav');
  if (toggle && inner) {
    toggle.addEventListener('click', function () {
      var open = inner.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? '关闭导航' : '打开导航');
    });
    if (nav) {
      nav.addEventListener('click', function (e) {
        if (e.target && e.target.tagName === 'A') {
          inner.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nodes = document.querySelectorAll('.sec-head, .cap, .diff-card, .metric, .loop-step, .ev-card, .ai-card, .jump-card');
  if (reduce || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(nodes, function (el) { el.classList.add('is-in'); });
    return;
  }
  Array.prototype.forEach.call(nodes, function (el) { el.classList.add('reveal'); });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  Array.prototype.forEach.call(nodes, function (el) { io.observe(el); });
})();
