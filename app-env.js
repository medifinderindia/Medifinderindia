/* Tells the shared web code whether it runs inside the Android APK or in a normal browser.
   The APK wrapper appends "MediFinderApp/<version>" to the WebView user agent and exposes
   a window.MFAndroid bridge, so this is a token we control, not a guess about the device.
   Result: window.MF_IS_APP (boolean) and class "mf-app" on <html>.
   CSS:  .mf-app-only (visible only in the app)   .mf-web-only (hidden in the app) */
(function () {
  var ua = '';
  try { ua = navigator.userAgent || ''; } catch (e) {}
  var isApp = /MediFinderApp/i.test(ua) || !!window.MFAndroid;
  window.MF_IS_APP = isApp;
  if (isApp) document.documentElement.classList.add('mf-app');
})();
