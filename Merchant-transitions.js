// ==========================================
// 🎬 MEDI FINDER — SMOOTH NAVIGATION (Phase 4)
// Fades the page out briefly before moving to the next page, and fixes
// href="#" links that were jumping the page to top / adding junk history
// entries (the "button press feels like a refresh / back button behaves
// oddly" complaint). Safe no-op for anything that isn't a plain internal
// page link — external links, tel:, mailto:, wa.me, and JS-only actions
// are left completely untouched.
// ==========================================
(function () {
    function extractNavUrl(el) {
        if (!el) return null;
        const href = el.getAttribute && el.getAttribute('href');
        if (el.tagName === 'A' && href && href !== '#' && !href.startsWith('javascript:') &&
            !href.startsWith('tel:') && !href.startsWith('mailto:') && !/^https?:\/\//i.test(href)) {
            return href;
        }
        const onclickAttr = (el.getAttribute && el.getAttribute('onclick')) || '';
        const m = onclickAttr.match(/(?:window\.)?location\.href\s*=\s*['"]([^'"]+)['"]/);
        return m ? m[1] : null;
    }

    // Fade out + navigate for internal page links (nav bars, sidebar items, cards)
    document.addEventListener('click', function (e) {
        const hashLink = e.target.closest('a[href="#"]');
        if (hashLink) {
            // Don't block whatever the inline onclick does (e.g. logout) —
            // just stop the jump-to-top / history-entry side effect.
            e.preventDefault();
            return;
        }

        const el = e.target.closest('.nav-item, .bottom-nav-item, .sidebar-item, a[href]');
        if (!el) return;
        const url = extractNavUrl(el);
        if (!url) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        document.body.classList.add('mf-leaving');
        setTimeout(function () { window.location.href = url; }, 150);
    }, true); // capture phase — runs before any inline onclick on the target

    // If the page was restored from the bfcache (e.g. via Back button),
    // make sure it isn't stuck mid-fade-out from before.
    window.addEventListener('pageshow', function (evt) {
        document.body.classList.remove('mf-leaving');
    });
})();