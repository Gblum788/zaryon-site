/* Zaryon portfolio — page interactions (no build step, no libraries) */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var Z = window.Z = { touched: { filter: false, cmp: false, acc: false } };

  /* --- PORTFOLIO fills the width between the margins --- */
  function fit() {
    var h = $('.h-title'); if (!h) return;
    var R = document.documentElement.style;
    R.setProperty('--fit', '100px');
    var rg = document.createRange(); rg.selectNodeContents(h);
    var w = rg.getBoundingClientRect().width, avail = h.clientWidth;
    if (w > 0) R.setProperty('--fit', (100 * avail / w * 0.995).toFixed(2) + 'px');
  }
  Z.fit = fit;
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  addEventListener('resize', fit);

  /* --- hover off while the page scrolls under a still cursor --- */
  var st;
  addEventListener('scroll', function () {
    document.documentElement.classList.add('scrolling');
    clearTimeout(st); st = setTimeout(function () { document.documentElement.classList.remove('scrolling'); }, 160);
  }, { passive: true });

  /* --- nav: dot on the section in view --- */
  var navs = $$('[data-nav]');
  function navOn() {
    var y = innerHeight * 0.4, cur = null;
    navs.forEach(function (a) { var s = document.getElementById(a.dataset.nav); if (s && s.getBoundingClientRect().top < y) cur = a; });
    navs.forEach(function (a) { a.classList.toggle('on', a === cur); });
  }
  addEventListener('scroll', navOn, { passive: true }); navOn();

  /* --- projects: tabs dim, search removes --- */
  var tabs = $$('.tab'), cards = $$('.card'), q = $('#q'), empty = $('#empty');
  var curF = 'all';
  function apply() {
    var term = (q.value || '').trim().toLowerCase(), shown = 0;
    cards.forEach(function (c) {
      var txt = c.textContent.toLowerCase() + ' ' + c.dataset.cat;
      var match = !term || txt.indexOf(term) > -1;
      c.classList.toggle('gone', !match);
      c.classList.toggle('off', match && curF !== 'all' && c.dataset.cat !== curF);
      if (match) shown++;
    });
    empty.classList.toggle('show', shown === 0);
  }
  Z.filter = function (f) {
    curF = f;
    tabs.forEach(function (t) { var on = t.dataset.f === f; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
    apply();
  };
  tabs.forEach(function (t) { t.addEventListener('click', function (e) { if (e.isTrusted) Z.touched.filter = true; Z.filter(t.dataset.f); }); });
  q.addEventListener('input', function () { Z.touched.filter = true; apply(); });
  $('#clear').addEventListener('click', function () { q.value = ''; apply(); q.focus(); });

  /* --- tools marquee --- */
  var tools = [['Py', 'Python', '#3d7cc9'], ['JS', 'JavaScript', '#c9a72b'], ['C', 'Claude', '#d9774a'], ['R', 'Retell AI', '#6e56cf'],
    ['O', 'Ollama', '#777'], ['G', 'Gemma', '#2f8cd8'], ['N', 'Netlify', '#25a199'], ['CF', 'Cloudflare', '#f38020'],
    ['M', 'Google Maps', '#34a853'], ['H', 'Higgsfield', '#e8261c'], ['FF', 'ffmpeg', '#3c8d2f'], ['TTS', 'Edge TTS', '#1b8cf2']];
  var track = $('#mtrack'), marq = $('#marq');
  function chip(t, dupe) { return '<div class="tool' + (dupe ? ' dupe' : '') + '"' + (dupe ? ' aria-hidden="true"' : '') + '><i style="--c:' + t[2] + '">' + t[0] + '</i>' + t[1] + '</div>'; }
  track.innerHTML = tools.map(function (t) { return chip(t); }).join('') + tools.map(function (t) { return chip(t, 1); }).join('');
  var mx = 0, paused = false, gridMode = false, nudge = 0, last = 0;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function loop(t) {
    var dt = last ? Math.min(50, t - last) : 16; last = t;
    if (!gridMode) {
      var half = track.scrollWidth / 2;
      if (!paused && !reduce) mx -= dt * 0.03;
      if (nudge) { var s = nudge * Math.min(1, dt / 120); mx += s; nudge -= s; if (Math.abs(nudge) < .5) nudge = 0; }
      if (half > 0) { while (mx <= -half) mx += half; while (mx > 0) mx -= half; }
      track.style.transform = 'translateX(' + mx.toFixed(1) + 'px)';
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  $('#mprev').addEventListener('click', function () { nudge += 220; });
  $('#mnext').addEventListener('click', function () { nudge -= 220; });
  $('#mpause').addEventListener('click', function () {
    paused = !paused;
    this.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    this.innerHTML = paused ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 1l9 5-9 5z"/></svg>' : '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1" width="3" height="10"/><rect x="7" y="1" width="3" height="10"/></svg>';
  });
  $('#mall').addEventListener('click', function () {
    gridMode = !gridMode; marq.classList.toggle('grid-mode', gridMode);
    this.textContent = gridMode ? 'Show less −' : 'See all (12) +';
  });

  /* --- draft / live comparer --- */
  var cmp = $('#cmp'), handle = $('#handle'), cp = 50;
  Z.setCmp = function (p) {
    cp = Math.max(0, Math.min(100, p));
    cmp.style.setProperty('--p', cp + '%'); handle.setAttribute('aria-valuenow', Math.round(cp));
  };
  Z.cmpEl = cmp;
  function fromX(x) { var r = cmp.getBoundingClientRect(); Z.setCmp((x - r.left) / r.width * 100); }
  var dragging = false;
  cmp.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch' && e.target !== handle) return; /* let phones scroll unless they grab the handle */
    dragging = true; Z.touched.cmp = true; cmp.setPointerCapture(e.pointerId); fromX(e.clientX); e.preventDefault();
  });
  cmp.addEventListener('pointermove', function (e) { if (dragging) fromX(e.clientX); });
  cmp.addEventListener('pointerup', function () { dragging = false; });
  cmp.addEventListener('pointercancel', function () { dragging = false; });
  handle.addEventListener('keydown', function (e) {
    var k = e.key, step = e.shiftKey ? 10 : 4;
    if (k === 'ArrowLeft' || k === 'ArrowDown') Z.setCmp(cp - step);
    else if (k === 'ArrowRight' || k === 'ArrowUp') Z.setCmp(cp + step);
    else if (k === 'Home') Z.setCmp(0);
    else if (k === 'End') Z.setCmp(100);
    else return;
    Z.touched.cmp = true; e.preventDefault();
  });

  /* --- accordion: one open at a time --- */
  var items = $$('.acc-i');
  Z.openAcc = function (i) {
    items.forEach(function (it, j) {
      var on = j === i; it.classList.toggle('open', on);
      var b = $('.acc-b', it); b.setAttribute('aria-expanded', on); $('.pm', it).textContent = on ? '−' : '+';
    });
  };
  Z.accItems = items;
  items.forEach(function (it, i) {
    $('.acc-b', it).addEventListener('click', function (e) {
      if (e.isTrusted) Z.touched.acc = true;
      Z.openAcc(it.classList.contains('open') ? -1 : i);
    });
  });

  /* --- contact form builds an email --- */
  var form = $('#cform'), open = $('#openForm');
  open.addEventListener('click', function () {
    var show = !form.classList.contains('show');
    form.classList.toggle('show', show); open.setAttribute('aria-expanded', show);
    if (show) setTimeout(function () { form.n.focus(); }, 50);
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var body = 'Hi Zaryon,\n\nWhat slips through: ' + form.m.value + '\n\n' + form.n.value + '\n' + form.e.value;
    location.href = 'mailto:team@zaryon.ai?subject=' + encodeURIComponent('Project — ' + form.n.value) + '&body=' + encodeURIComponent(body);
  });
})();
