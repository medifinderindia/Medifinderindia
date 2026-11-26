/* MediFinder India shared language layer. Google Translate handles page text; selected language is shared across roles. */
(function () {
  'use strict';
  const LANGS = [
    ['en','English'],['bn','বাংলা'],['hi','हिन्दी'],['sat','Santali'],['rjb','Rajbanshi'],
    ['or','ଓଡ଼ିଆ'],['te','తెలుగు'],['mr','मराठी'],['ta','தமிழ்'],['gu','ગુજરાતી'],
    ['kn','ಕನ್ನಡ'],['ml','മലയാളം'],['pa','ਪੰਜਾਬੀ'],['ur','اردو']
  ];
  const GOOGLE = { rjb:'bn' };
  const KEY = 'mf_app_language';
  const read = () => {
    try { return localStorage.getItem(KEY) || localStorage.getItem('medi_active_language_env') || localStorage.getItem('app_language') || 'en'; }
    catch (_) { return 'en'; }
  };
  const write = (lang) => {
    try {
      localStorage.setItem(KEY, lang);
      localStorage.setItem('medi_active_language_env', lang);
      localStorage.setItem('app_language', lang);
    } catch (_) {}
  };
  let widgetStarted = false;
  function setCookie(lang) {
    const target = GOOGLE[lang] || lang;
    const value = lang === 'en' ? '' : '/en/' + target;
    const expiry = lang === 'en' ? '; expires=Thu, 01 Jan 1970 00:00:00 GMT' : '';
    document.cookie = 'googtrans=' + value + '; path=/' + expiry;
    try { document.cookie = 'googtrans=' + value + '; path=/; domain=' + location.hostname + expiry; } catch (_) {}
  }
  function applyWidget(lang, attempt) {
    const select = document.querySelector('select.goog-te-combo');
    if (!select) {
      if ((attempt || 0) < 60) setTimeout(() => applyWidget(lang, (attempt || 0) + 1), 250);
      return;
    }
    const target = GOOGLE[lang] || lang;
    if (select.value !== target) {
      select.value = target;
      select.dispatchEvent(new Event('change'));
    }
  }
  function loadWidget(lang) {
    if (lang === 'en') return;
    if (!widgetStarted) {
      widgetStarted = true;
      window.googleTranslateElementInit = function () {
        if (!window.google || !google.translate) return;
        new google.translate.TranslateElement({
          pageLanguage: 'en',
          includedLanguages: 'bn,hi,sat,or,te,mr,ta,gu,kn,ml,pa,ur,ne',
          autoDisplay: false
        }, 'mf-google-translate');
        setTimeout(() => applyWidget(read()), 350);
      };
      const holder = document.createElement('div');
      holder.id = 'mf-google-translate';
      holder.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;overflow:hidden';
      document.body.appendChild(holder);
      const script = document.createElement('script');
      script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      script.async = true;
      document.head.appendChild(script);
    } else applyWidget(lang);
  }
  function setLanguage(lang) {
    if (!LANGS.some(item => item[0] === lang)) return;
    write(lang);
    setCookie(lang);
    if (lang === 'en') {
      const translated = document.documentElement.classList.contains('translated-ltr') || document.documentElement.classList.contains('translated-rtl');
      if (translated) { location.reload(); return; }
    } else loadWidget(lang);
    document.querySelectorAll('[data-mf-language-picker]').forEach(el => { el.value = lang; });
    window.dispatchEvent(new CustomEvent('mf:languagechange', { detail: { language: lang } }));
  }
  window.MFSetLanguage = setLanguage;
  window.MFGetLanguage = read;
  function makePicker() {
    if (document.getElementById('language-select') || document.querySelector('[data-mf-language-picker]')) return;
    const host = document.querySelector('.topbar-actions') || document.querySelector('.sidebar-foot') || document.body;
    if (!host) return;
    const select = document.createElement('select');
    select.setAttribute('data-mf-language-picker','');
    select.setAttribute('aria-label','App language');
    select.title = 'App language';
    select.style.cssText = 'max-width:116px;height:36px;padding:0 8px;border:1px solid var(--border,#dce2ea);border-radius:10px;background:var(--surface,#fff);color:var(--text,#263248);font-size:12px;margin:0 6px;';
    select.innerHTML = LANGS.map(([code,label]) => '<option value="' + code + '">' + label + '</option>').join('');
    select.value = read();
    select.addEventListener('change', () => setLanguage(select.value));
    host.insertBefore(select, host.firstChild);
  }
  function init() {
    const lang = read();
    write(lang);
    setCookie(lang);
    makePicker();
    if (lang !== 'en') loadWidget(lang);
    const observer = new MutationObserver(() => {
      if (!document.querySelector('[data-mf-language-picker]')) makePicker();
    });
    observer.observe(document.body, { childList:true, subtree:true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
