/* Webminds Radar - tracker maquettes */
(function () {
  'use strict';
  var me = document.currentScript;
  if (!me || window.__wmRadar) return;
  window.__wmRadar = 1;
  var SITE = me.getAttribute('data-site');
  var ORIGIN = new URL(me.src).origin;
  var API = ORIGIN + '/api/collect';
  var REPLAY = me.getAttribute('data-replay') !== 'off';
  if (!SITE) return;

  var qs = new URLSearchParams(location.search);
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) {} }
  if (qs.get('wm_ignore') === '1') ls('wm_ignore', '1');
  if (qs.get('wm_ignore') === '0') ls('wm_ignore', null);
  if (ls('wm_ignore') === '1' || qs.get('wm_hm') === '1' || navigator.webdriver) return;

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    return (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 32);
  }
  var vid = ls('wm_vid'); if (!vid) { vid = uid(); ls('wm_vid', vid); }
  var r = qs.get('r') || ss('wm_r') || ''; if (r) ss('wm_r', r);
  var now = Date.now();
  var sid = ss('wm_sid'), last = +ss('wm_last') || 0;
  if (!sid || now - last > 30 * 60 * 1000) { sid = uid(); ss('wm_sid', sid); }
  ss('wm_last', String(now));
  var pid = uid();
  var path = location.pathname || '/';

  var q = [], rr = [], seq = 0, sending = false;
  function docH() { var d = document.documentElement, b = document.body || {}; return Math.max(d.scrollHeight, b.scrollHeight || 0, d.offsetHeight); }
  function push(t, d) { q.push({ t: t, ts: Date.now(), path: path, d: d || {} }); }

  push('pv', { title: document.title.slice(0, 120), ref: document.referrer.slice(0, 300), vw: innerWidth, vh: innerHeight });

  function payload(withRR, limit) {
    var body = { site: SITE, sid: sid, vid: vid, r: r, pid: pid, seq: seq++, ev: q.splice(0, 400) };
    if (withRR && rr.length) {
      var out = [], size = 0;
      while (rr.length) {
        var s = JSON.stringify(rr[0]).length;
        if (out.length && size + s > limit) break;
        if (s > 3500000) { rr.shift(); continue; }
        out.push(rr.shift()); size += s;
      }
      body.rr = out;
    }
    return JSON.stringify(body);
  }
  function flush() {
    if (sending || (!q.length && !rr.length)) return;
    sending = true;
    var data = payload(true, 3000000);
    fetch(API, { method: 'POST', body: data, headers: { 'Content-Type': 'text/plain' }, keepalive: data.length < 60000, credentials: 'omit' })
      .catch(function () {}).then(function () { sending = false; if (rr.length > 50 || q.length) setTimeout(flush, 300); });
  }
  function beacon() {
    tick(true);
    if (!q.length && !rr.length) return;
    var data = payload(true, 50000);
    if (!(navigator.sendBeacon && data.length < 63000 && navigator.sendBeacon(API, data))) {
      try { fetch(API, { method: 'POST', body: data, headers: { 'Content-Type': 'text/plain' }, keepalive: true }); } catch (e) {}
    }
  }

  // Temps actif
  var lastAct = Date.now(), active = 0, lastTick = Date.now();
  ['mousemove', 'scroll', 'keydown', 'touchstart', 'click', 'wheel'].forEach(function (e) {
    addEventListener(e, function () { lastAct = Date.now(); }, { passive: true, capture: true });
  });
  function tick(final) {
    var t = Date.now();
    if (!document.hidden && t - lastAct < 30000) active += t - lastTick;
    lastTick = t;
    if (active > 0 && (final || active >= 5000)) { push('hb', { a: Math.round(active) }); active = 0; }
    ss('wm_last', String(t));
  }

  // Scroll
  var maxSc = 0, sentSc = 0;
  function onScroll() {
    var h = docH(), v = h <= innerHeight ? 100 : Math.round(Math.min(100, (scrollY + innerHeight) / h * 100));
    if (v > maxSc) maxSc = v;
    if (maxSc - sentSc >= 10 || (maxSc === 100 && sentSc < 100)) { sentSc = maxSc; push('sc', { v: maxSc, dh: h, vw: innerWidth }); }
  }
  addEventListener('scroll', onScroll, { passive: true });
  setTimeout(onScroll, 1200);

  // Clics
  function sel(el) {
    var parts = [];
    for (var i = 0; el && el.nodeType === 1 && i < 4; i++, el = el.parentElement) {
      var p = el.tagName.toLowerCase();
      if (el.id) { parts.unshift(p + '#' + el.id); break; }
      var c = (el.getAttribute('class') || '').trim().split(/\s+/).filter(function (x) { return x && x.length < 30; }).slice(0, 2);
      if (c.length) p += '.' + c.join('.');
      parts.unshift(p);
    }
    return parts.join(' > ').slice(0, 200);
  }
  var recent = [];
  addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('a,button,[role=button],input,select,label,summary,[onclick]') || e.target : e.target;
    var t = Date.now(), x = e.pageX, y = e.pageY;
    recent = recent.filter(function (c) { return t - c.t < 800 && Math.abs(c.x - x) < 40 && Math.abs(c.y - y) < 40; });
    recent.push({ t: t, x: x, y: y });
    var txt = ((el && (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('alt'))) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    var a = el && el.closest && el.closest('a');
    var w = document.documentElement.scrollWidth || innerWidth;
    push('click', { x: +(x / w).toFixed(4), y: Math.round(y), dh: docH(), vw: innerWidth, sel: sel(el), txt: txt,
      href: a ? (a.getAttribute('href') || '').slice(0, 200) : '', rage: recent.length >= 3 });
    if (a || recent.length >= 3) flush();
  }, true);

  setInterval(function () { tick(false); flush(); }, 5000);
  addEventListener('pagehide', beacon);
  document.addEventListener('visibilitychange', function () { if (document.hidden) beacon(); else { lastTick = Date.now(); lastAct = Date.now(); } });
  setTimeout(flush, 800);

  // Enregistrement de session
  if (REPLAY) {
    var s = document.createElement('script');
    s.src = ORIGIN + '/rr.js';
    s.async = true;
    s.onload = function () {
      try {
        var rec = window.rrwebRecord && (window.rrwebRecord.record || window.rrwebRecord);
        rec({
          emit: function (e) { rr.push(e); },
          maskAllInputs: true,
          inlineImages: false,
          collectFonts: false,
          recordCanvas: false,
          slimDOMOptions: { script: true, comment: true, headFavicon: true, headWhitespace: true, headMetaSocial: true, headMetaRobots: true, headMetaHttpEquiv: true, headMetaVerification: true },
          sampling: { mousemove: 60, scroll: 150, media: 800, input: 'last' }
        });
      } catch (e) {}
    };
    (document.head || document.documentElement).appendChild(s);
  }
})();
