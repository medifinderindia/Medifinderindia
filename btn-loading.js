(function () {
  if (window.__btnLoading) return;
  window.__btnLoading = true;

  var CLICK_WINDOW = 400;   // ms after a tap in which a request is counted as "caused by the tap"
  var SHOW_AFTER = 120;     // ms; fast requests never flash a spinner
  var GRACE = 250;          // ms; chained requests keep the same spinner
  var MAX_MS = 20000;       // safety: spinner never stays longer than this
  var SKIP = 'nav, .bottom-nav, .nav-bar, [role="tablist"], [data-no-spin]';
  var TARGET = 'button, .btn, [role="button"], input[type="submit"]';

  var current = null;

  function turnOn(c) {
    if (c.on) return;
    c.on = true;
    c.maxT = setTimeout(function () { turnOff(c); }, MAX_MS);
    c.showT = setTimeout(function () {
      var b = c.btn;
      if (!b.isConnected || b.querySelector('.fa-spin')) return;   // button already has its own spinner
      b.style.setProperty('--btn-spin-c', getComputedStyle(b).color);
      if (getComputedStyle(b).position === 'static') b.classList.add('is-busy-rel');
      b.classList.add('is-busy');
      b.setAttribute('aria-busy', 'true');
      c.shown = true;
    }, SHOW_AFTER);
  }

  function turnOff(c) {
    if (!c.on) return;
    c.on = false;
    clearTimeout(c.showT); clearTimeout(c.maxT); clearTimeout(c.grace);
    var b = c.btn;
    b.classList.remove('is-busy', 'is-busy-rel');
    b.removeAttribute('aria-busy');
    b.style.removeProperty('--btn-spin-c');
    if (current === c) current = null;
  }

  function track(c, p) {
    c.pending++;
    clearTimeout(c.grace);
    turnOn(c);
    var done = function () {
      c.pending--;
      if (c.pending <= 0) c.grace = setTimeout(function () { if (c.pending <= 0) turnOff(c); }, GRACE);
    };
    p.then(done, done);
  }

  var origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function () {
      var p = origFetch.apply(this, arguments);
      var c = current;
      if (c && (c.on || Date.now() - c.t0 <= CLICK_WINDOW)) track(c, p);
      return p;
    };
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var b = t && t.closest ? t.closest(TARGET) : null;
    if (!b || b.disabled || b.closest(SKIP) || b.classList.contains('is-busy')) return;
    var c = { btn: b, t0: Date.now(), pending: 0, on: false };
    current = c;
    setTimeout(function () { if (current === c && !c.on) current = null; }, CLICK_WINDOW);
  }, true);

  // manual helper for non-fetch async work
  window.btnBusy = function (btn, promise) {
    var c = { btn: btn, t0: Date.now(), pending: 0, on: false };
    track(c, Promise.resolve(promise));
    return promise;
  };
})();
