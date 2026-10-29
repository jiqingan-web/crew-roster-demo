/* intro.js v8 — nav + reveal + metric count-up; respects reduced-motion */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  function finishMetric(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (isNaN(target)) return;
    var suffix = el.getAttribute('data-suffix') || '';
    if (suffix.indexOf('/') === 0) {
      el.innerHTML = target + '<span class="slash">/</span>' + suffix.slice(1);
    } else {
      el.textContent = String(target) + suffix;
    }
  }

  function animateMetric(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (isNaN(target)) return;
    var suffix = el.getAttribute('data-suffix') || '';
    if (reduce || target === 0) {
      finishMetric(el);
      return;
    }
    var start = null;
    var dur = 900;
    function frame(ts) {
      if (start == null) start = ts;
      var t = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      var val = Math.round(target * eased);
      if (suffix.indexOf('/') === 0) {
        var right = Math.round(parseInt(suffix.slice(1), 10) * eased);
        el.innerHTML = val + '<span class="slash">/</span>' + right;
      } else {
        el.textContent = String(val) + suffix;
      }
      if (t < 1) requestAnimationFrame(frame);
      else finishMetric(el);
    }
    requestAnimationFrame(frame);
  }

  var metrics = document.querySelectorAll('.metric');
  Array.prototype.forEach.call(metrics, function (m, i) {
    m.style.setProperty('--mi', String(i));
  });

  var nodes = document.querySelectorAll('.sec-head, .cap, .diff-card, .metric, .loop-step, .ev-card, .ai-card, .jump-card, .ops-list article, .case, .pano-grid article');
  if (reduce || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(nodes, function (el) { el.classList.add('is-in'); });
    Array.prototype.forEach.call(document.querySelectorAll('.metric-num[data-count]'), finishMetric);
    return;
  }

  Array.prototype.forEach.call(nodes, function (el) { el.classList.add('reveal'); });

  var counted = false;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      if (entry.target.classList.contains('metric') && !counted) {
        // count when first metric strip enters
      }
      var num = entry.target.querySelector && entry.target.querySelector('.metric-num[data-count]');
      if (num && !num.getAttribute('data-done')) {
        num.setAttribute('data-done', '1');
        animateMetric(num);
      }
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.1 });

  Array.prototype.forEach.call(nodes, function (el) { io.observe(el); });
})();
