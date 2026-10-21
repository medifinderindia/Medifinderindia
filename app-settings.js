/* Profile > "App settings" card. Only visible in the APK (see app-env.js). It lists the
   permissions the app uses with their real state, and lets the user allow them or open the
   phone's app settings. All state comes from the Android bridge (window.MFAndroid); when the
   bridge is missing it falls back to the standard web Permissions API. */
(function () {
  'use strict';
  var box = null;
  var ROWS = [
    { key: 'notifications', icon: 'fa-bell', title: 'Notifications', hint: 'Order updates and delivery alerts' },
    { key: 'location', icon: 'fa-location-dot', title: 'Location (GPS)', hint: 'Delivery address, nearby shops, tracking' },
    { key: 'camera', icon: 'fa-camera', title: 'Camera', hint: 'Prescription and document photos' },
    { key: 'microphone', icon: 'fa-microphone', title: 'Microphone', hint: 'Voice search' }
  ];
  var WEBNAME = { notifications: 'notifications', location: 'geolocation', camera: 'camera', microphone: 'microphone' };

  function bridge() { return window.MFAndroid && typeof window.MFAndroid.status === 'function' ? window.MFAndroid : null; }

  function readStatus() {
    var b = bridge();
    if (b) { try { return Promise.resolve(JSON.parse(b.status())); } catch (e) {} }
    var out = {};
    return Promise.all(ROWS.map(function (r) {
      if (!(navigator.permissions && navigator.permissions.query)) { out[r.key] = 'unknown'; return null; }
      return navigator.permissions.query({ name: WEBNAME[r.key] }).then(function (p) {
        out[r.key] = p.state === 'granted' ? 'granted' : 'denied';
      }).catch(function () { out[r.key] = 'unknown'; });
    })).then(function () { return out; });
  }

  function chip(state) {
    var on = state === 'granted';
    var label = on ? 'Allowed' : (state === 'unknown' ? 'Check' : 'Off');
    var bg = on ? '#e7f6ee' : '#fdecee', fg = on ? '#1e7e4f' : '#b4233a';
    return '<span style="flex:none;font-size:.72rem;font-weight:800;padding:4px 10px;border-radius:999px;background:' + bg + ';color:' + fg + '">' + label + '</span>';
  }

  function render() {
    if (!box) return;
    readStatus().then(function (st) {
      box.innerHTML = '<div style="font-size:.78rem;font-weight:800;color:#6b7280;letter-spacing:.04em;text-transform:uppercase;margin:6px 4px 8px">App settings</div>' +
        ROWS.map(function (r) {
          return '<div class="menu-card-item premium-menu-item" role="button" tabindex="0" data-mf-perm="' + r.key + '">' +
            '<div class="menu-icon"><i class="fa-solid ' + r.icon + '"></i></div>' +
            '<div class="menu-text"><h3>' + r.title + '</h3><p>' + r.hint + '</p></div>' + chip(st[r.key]) + '</div>';
        }).join('') +
        '<div class="menu-card-item premium-menu-item" role="button" tabindex="0" data-mf-perm="__settings">' +
        '<div class="menu-icon"><i class="fa-solid fa-gear"></i></div>' +
        '<div class="menu-text"><h3>Phone app settings</h3><p>Open Android settings for MediFinder India</p></div>' +
        '<i class="fa-solid fa-chevron-right" style="color:#ccc"></i></div>';
    });
  }

  // Fallback when the native bridge is missing: trigger the normal web prompt once.
  function webRequest(key) {
    if (key === 'location' && navigator.geolocation) { navigator.geolocation.getCurrentPosition(render, render); return; }
    if ((key === 'camera' || key === 'microphone') && navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia(key === 'camera' ? { video: true } : { audio: true })
        .then(function (s) { s.getTracks().forEach(function (t) { t.stop(); }); render(); }, render);
      return;
    }
    if (key === 'notifications' && 'Notification' in window) { Notification.requestPermission().then(render); }
  }

  function act(key) {
    var b = bridge();
    if (key === '__settings') { if (b && b.openSettings) b.openSettings(); return; }
    if (b && b.request) { b.request(key); return; }   // native replies through MFApp.refresh()
    webRequest(key);
  }

  function init() {
    box = document.getElementById('mf-app-settings');
    if (!box || !window.MF_IS_APP) return;
    box.addEventListener('click', function (e) {
      var row = e.target.closest && e.target.closest('[data-mf-perm]');
      if (row) act(row.getAttribute('data-mf-perm'));
    });
    box.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var row = e.target.closest && e.target.closest('[data-mf-perm]');
      if (row) { e.preventDefault(); act(row.getAttribute('data-mf-perm')); }
    });
    // coming back from the phone's settings screen, or from a permission dialog
    document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });
    window.MFApp = { refresh: render };
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
