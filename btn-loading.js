/* btn-loading.js v2 — Saving… → ✓ Saved / ⚠ Failed — Retry on every button that triggers a request */
(function () {
  if (window.__btnLoading) return;
  window.__btnLoading = true;

  var CLICK_WINDOW = 500;   // a request fired within this time of a tap belongs to that tap
  var SHOW_AFTER   = 120;   // fast requests never flash a spinner
  var GRACE        = 250;   // chained requests keep the same spinner
  var MAX_MS       = 20000; // safety: never spin longer than this
  var OK_MS = 1100, ERR_MS = 2200;
  var SKIP   = 'nav, .bottom-nav, .nav-bar, [role="tablist"], .tabs, .sidebar, .icon-btn, .hamburger, [data-no-spin], [data-nav], [data-tab], [data-nav-child], [data-close-modal]';
  var TARGET = 'button, .btn, [role="button"], input[type="submit"]';
  var current = null;

  // Navigation/favourite controls must never be rewritten as Save/Please wait.
  function skipButton(b) {
    if (!b) return true;
    if (b.closest(SKIP)) return true;
    var meta = [b.id, b.className, b.getAttribute('aria-label'), b.getAttribute('title'), b.getAttribute('data-page'), b.getAttribute('data-nav')].join(' ').toLowerCase();
    var label = (b.textContent || '').toLowerCase();
    return /wishlist|notification|notifications|noti-close|pd-wishlist-heart/.test(meta + ' ' + label);
  }

  function esc(s){ return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  function busyText(b) {
    if (b.dataset.busyText) return b.dataset.busyText;
    var t = (b.textContent || '').toLowerCase();
    if (/delete|remove/.test(t)) return 'Deleting…';
    if (/send|push|broadcast/.test(t)) return 'Sending…';
    if (/approve|verify|accept/.test(t)) return 'Verifying…';
    if (/reject|suspend|block/.test(t)) return 'Updating…';
    if (/save|update|create|add|apply/.test(t)) return 'Saving…';
    return 'Please wait…';
  }
  function okText(b) {
    if (b.dataset.okText) return b.dataset.okText;
    var t = (b.textContent || '').toLowerCase();
    if (/delete|remove/.test(t)) return 'Deleted';
    if (/send|push|broadcast/.test(t)) return 'Sent';
    if (/approve|verify|accept/.test(t)) return 'Done';
    return 'Saved';
  }

  var ICON_OK  = '<svg class="bl-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path class="bl-tick" d="M7.5 12.5l3 3 6-6.5"/></svg>';
  var ICON_ERR = '<svg class="bl-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 16.6v.1"/></svg>';

  function lockSize(b, c) {
    if (c.sized) return;
    c.sized = true;
    c.prevMin = b.style.minWidth;
    b.style.minWidth = b.getBoundingClientRect().width + 'px';   // no layout jump between states
  }
  function restore(c) {
    clearTimeout(c.stateT);
    var b = c.btn;
    if (!b || !b.isConnected) return;
    if (c.html != null) { b.innerHTML = c.html; c.html = null; }
    b.classList.remove('bl-busy', 'bl-ok', 'bl-err', 'bl-rel');
    b.removeAttribute('aria-busy');
    b.style.removeProperty('--bl-c');
    if (c.sized) { b.style.minWidth = c.prevMin || ''; c.sized = false; }
    delete b.__bl;
  }
  function setState(c, cls, html) {
    var b = c.btn;
    if (!b || !b.isConnected) return;
    if (c.html == null) c.html = b.innerHTML;
    lockSize(b, c);
    b.classList.remove('bl-busy', 'bl-ok', 'bl-err');
    b.classList.add(cls);
    b.innerHTML = html;
    b.__bl = c;
  }

  function turnOn(c) {
    if (c.on) return;
    c.on = true;
    c.maxT = setTimeout(function () { c.failed = true; finish(c); }, MAX_MS);
    c.showT = setTimeout(function () {
      var b = c.btn;
      if (!b.isConnected || b.querySelector('.fa-spin, .spinner')) return;
      c.shown = true;
      b.setAttribute('aria-busy', 'true');
      setState(c, 'bl-busy', '<span class="bl-spin" aria-hidden="true"></span><span class="bl-lbl">' + esc(busyText(b)) + '</span>');
    }, SHOW_AFTER);
  }

  function finish(c) {
    if (!c.on) return;
    c.on = false;
    clearTimeout(c.showT); clearTimeout(c.maxT); clearTimeout(c.grace);
    if (current === c) current = null;
    var b = c.btn;
    if (!c.shown || !b.isConnected) { restore(c); return; }
    b.removeAttribute('aria-busy');
    if (c.failed) {
      setState(c, 'bl-err', ICON_ERR + '<span class="bl-lbl">Failed — Retry</span>');
      c.stateT = setTimeout(function () { restore(c); }, ERR_MS);
    } else {
      setState(c, 'bl-ok', ICON_OK + '<span class="bl-lbl">' + esc(okText(b)) + '</span>');
      c.stateT = setTimeout(function () { restore(c); }, OK_MS);
    }
  }

  function track(c, p) {
    c.pending++;
    clearTimeout(c.grace);
    turnOn(c);
    var done = function (bad) {
      if (bad) c.failed = true;
      c.pending--;
      if (c.pending <= 0) c.grace = setTimeout(function () { if (c.pending <= 0) finish(c); }, GRACE);
    };
    p.then(function (res) { done(res && res.ok === false && res.status >= 400 && res.status !== 404 && res.status !== 406); }, function () { done(true); });
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
    if (!b || skipButton(b)) return;
    if (b.__bl && b.classList.contains('bl-err')) restore(b.__bl);        // tapping "Retry" resets it, the click then runs normally
    if (b.disabled || b.classList.contains('bl-busy')) return;
    var c = { btn: b, t0: Date.now(), pending: 0, on: false };
    current = c;
    setTimeout(function () { if (current === c && !c.on) current = null; }, CLICK_WINDOW);
  }, true);

  // manual helper for non-fetch async work:  btnBusy(btn, promise)
  window.btnBusy = function (btn, promise) {
    var c = { btn: btn, t0: Date.now(), pending: 0, on: false };
    track(c, Promise.resolve(promise));
    return promise;
  };
})();
