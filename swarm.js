/* Zaryon portfolio — the swarm: cursors that build the page in front of the visitor */
(function () {
  'use strict';
  var H = document.documentElement, Z = window.Z || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var bar = $('#sbar'), layer = $('#layer'), intro = $('#intro');

  /* ---------- ready / reduced-motion: page is already built ---------- */
  if (H.classList.contains('built')) {
    $('#replay2').addEventListener('click', function () {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { scrollTo(0, 0); return; }
      location.href = location.pathname;
    });
    return;
  }

  var MOBILE = matchMedia('(max-width:900px)').matches;
  var START_AGENTS = MOBILE ? 8 : 18, MAX_AGENTS = MOBILE ? 8 : 29, ARRIVE = MOBILE ? 0 : 2;
  var NAMES = ['Ava', 'Leo', 'Mia', 'Kai', 'Noa', 'Eli', 'Zoe', 'Ian', 'Lua', 'Theo', 'Ivy', 'Max', 'Nina', 'Rafa', 'Bea', 'Gus', 'Ana', 'Jules', 'Iris', 'Otto', 'Tess', 'Caio', 'Lena', 'Rui', 'Sol', 'Finn', 'Mel', 'Davi', 'Isa'];
  var COLORS = ['#ff4a3d', '#3ea2ff', '#ff3e9a', '#2fd27a', '#ffb02e', '#9b6bff', '#00c2d1', '#ff7a1a', '#e64fd8', '#5cc93a', '#4f7bff', '#ff5e7a', '#19b394', '#f2c200', '#c062ff'];

  var G = 1;                 // global speed 1x / 2x / 4x
  var agents = [], units = [], blocks = [], skels = [];
  var gen = 0, finalMode = false, doneCount = 0, t0 = performance.now(), queue = [];
  var touched = Z.touched || { filter: false, cmp: false, acc: false };

  /* ---------- helpers ---------- */
  function ease(p) { return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function easeOut(p) { return 1 - Math.pow(1 - p, 3); }
  function rect(el) { var r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; }
  function dead(ctx) { return !ctx || ctx.dead || ctx.gen !== gen; }
  function tween(dur, fn, ctx) {
    return new Promise(function (res) {
      var p = 0, lt = performance.now();
      function f(t) {
        var dt = Math.min(64, t - lt); lt = t;
        if (ctx && (ctx.instant || dead(ctx))) { if (!dead(ctx)) fn(1); res(); return; }
        p += dt * G * (ctx ? ctx.speed : 1) / Math.max(1, dur);
        if (p >= 1) { fn(1); res(); return; }
        fn(p); requestAnimationFrame(f);
      }
      requestAnimationFrame(f);
    });
  }
  function wait(ms, ctx) { return tween(ms, function () {}, ctx); }
  function div(cls, parent) { var d = document.createElement('div'); d.className = cls; (parent || layer).appendChild(d); return d; }

  /* ---------- agents ---------- */
  var CURSOR = '<svg width="18" height="22" viewBox="0 0 18 22"><path d="M1.5 1.5l14 9-6.4 1.5-3.2 6.8z" fill="CLR" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  function setPos(a, x, y) { a.x = x; a.y = y; a.el.style.transform = 'translate(' + (x - 1.5).toFixed(1) + 'px,' + (y - 1.5).toFixed(1) + 'px)'; }
  function spawn() {
    var i = agents.length, c = COLORS[i % COLORS.length];
    var el = div('agent');
    el.style.setProperty('--c', c);
    el.innerHTML = CURSOR.replace('CLR', c) + '<span class="cp">+</span><span class="nm">' + NAMES[i % NAMES.length] + '</span>';
    var a = { el: el, c: c, name: NAMES[i % NAMES.length], busy: false, mode: 'idle', tx: 0, ty: 0, tt: 0, idx: i };
    var vw = innerWidth, vh = innerHeight, side = i % 4, r = Math.random();
    var x = side === 0 ? -30 : side === 1 ? vw + 30 : r * vw;
    var y = scrollY + (side === 2 ? -30 : side === 3 ? vh + 30 : r * vh);
    setPos(a, x, y);
    agents.push(a); renderBar();
    return a;
  }
  function moveTo(a, x, y, ctx, slow) {
    var sx = a.x, sy = a.y, d = Math.hypot(x - sx, y - sy);
    var dur = (220 + Math.min(900, d * 0.42)) * (slow || 1);
    return tween(dur, function (p) { var e = ease(p); setPos(a, sx + (x - sx) * e, sy + (y - sy) * e); }, ctx);
  }
  function acquire(ctx, nx, ny) {
    return new Promise(function (res) { queue.push({ res: res, ctx: ctx, x: nx, y: ny }); dispatch(); });
  }
  function dispatch() {
    while (queue.length) {
      var q = queue[0];
      if (dead(q.ctx) || q.ctx.instant) { queue.shift(); q.res(null); continue; }
      var best = null, bd = 1e12;
      agents.forEach(function (a) {
        if (a.busy) return; var d = Math.hypot(a.x - q.x, a.y - q.y); if (d < bd) { bd = d; best = a; }
      });
      if (!best) return;
      queue.shift(); best.busy = true; best.mode = 'task'; q.res(best);
    }
  }
  function release(a) {
    if (!a) return;
    a.busy = false; a.mode = finalMode ? 'conga' : 'idle'; a.tt = 0;
    a.el.classList.remove('copy', 'grab');
    dispatch();
  }
  function flushQueue(ctx) {
    queue = queue.filter(function (q) { if (q.ctx === ctx) { q.res(null); return false; } return true; });
  }

  /* idle wander + conga line, one clock for all */
  var trail = [], ct = 0, lastT = performance.now();
  function clock(t) {
    var dt = Math.min(64, t - lastT); lastT = t; ct += dt / 1000 * Math.min(G, 2);
    var vw = innerWidth, vh = innerHeight, sy = scrollY;
    if (finalMode) {
      var lx = vw * (.5 + .36 * Math.sin(ct * .33) + .07 * Math.sin(ct * 1.07));
      var ly = vh * (.48 + .27 * Math.sin(ct * .51 + 1.1) + .06 * Math.cos(ct * .83));
      trail.push([lx, ly]); if (trail.length > 2400) trail.shift();
    }
    var k = 0;
    agents.forEach(function (a) {
      if (a.busy || a.mode === 'orbit') return;
      if (a.mode === 'conga' && trail.length) {
        var gap = MOBILE ? 9 : 7, i = Math.max(0, trail.length - 1 - k * gap); k++;
        var p = trail[i];
        setPos(a, a.x + (p[0] - a.x) * .1, a.y + (p[1] + sy - a.y) * .1);
        return;
      }
      if (!a.tt || t > a.tt || Math.abs(a.ty - sy) > vh * 1.2) {
        a.tx = vw * (.08 + Math.random() * .84); a.ty = sy + vh * (.12 + Math.random() * .7);
        a.tt = t + 1800 + Math.random() * 2600;
      }
      var ty = a.ty;
      if (ty < sy - 20 || ty > sy + vh) ty = sy + vh * .5;
      setPos(a, a.x + (a.tx - a.x) * .018, a.y + (ty - a.y) * .018);
    });
    requestAnimationFrame(clock);
  }
  requestAnimationFrame(clock);

  /* orbit around the logo during the opening */
  function orbit(ctx) {
    var on = true, st = performance.now();
    agents.forEach(function (a, i) { a.mode = 'orbit'; a.oa = i / agents.length * Math.PI * 2; a.or = 90 + (i % 5) * 26; });
    (function f(t) {
      if (!on) return;
      var cx = innerWidth / 2, cy = scrollY + innerHeight / 2, el = (t - st) / 1000;
      agents.forEach(function (a, i) {
        if (a.mode !== 'orbit') return;
        var ang = a.oa + el * (0.9 + (i % 3) * .25) * (i % 2 ? 1 : -1);
        var r = a.or * (MOBILE ? .7 : 1) * (1 + .08 * Math.sin(el * 2 + i));
        var tx = cx + Math.cos(ang) * r * 1.35, ty = cy + Math.sin(ang) * r;
        var f2 = Math.min(1, el / 1.6) * .1 + .02;
        setPos(a, a.x + (tx - a.x) * f2, a.y + (ty - a.y) * f2);
      });
      requestAnimationFrame(f);
    })(st);
    return function stop() { on = false; agents.forEach(function (a) { if (a.mode === 'orbit') a.mode = 'idle'; a.tt = 0; }); };
  }

  /* ---------- blocks: the pieces of the page ---------- */
  function initBlocks() {
    var sel = MOBILE ? '[data-unit],[data-unit-m]' : '[data-unit],[data-unit-d]';
    units = $$(sel).map(function (el) {
      return { el: el, name: el.dataset.name || '', blocks: [], state: 'idle', instant: false, speed: 1, gen: gen, dead: false, tests: false };
    });
    blocks = [];
    units.forEach(function (u) {
      $$('[data-b]', u.el).forEach(function (el) {
        if (el.__b && el.__b.gen === gen) return; // already owned (nested unit sets)
        var nd = el.dataset.nudge ? el.dataset.nudge.split(',').map(Number) : null;
        var b = { el: el, type: el.dataset.b, dup: el.hasAttribute('data-dup'), nudge: nd, unit: u, state: 'pend', skel: null, gen: gen };
        b.done = new Promise(function (r) { b._done = r; });
        el.__b = b; u.blocks.push(b); blocks.push(b);
        el.classList.add('pend');
      });
    });
    blocks.forEach(function (b) {
      if (!b.dup) return;
      var p = b.el.previousElementSibling;
      while (p && !(p.__b && p.__b.gen === gen)) p = p.previousElementSibling;
      b.src = p ? p.__b : null; if (!b.src) b.dup = false;
    });
    H.classList.remove('swarm');
    doneCount = 0; renderBar();
  }

  function finish(b) {           // final, exact state of a block
    if (b.state === 'done') return;
    if (b.skel) { b.skel.remove(); b.skel = null; }
    if (b.orig != null) { b.el.innerHTML = b.orig; b.orig = null; }
    if (b.texts) { b.texts.forEach(function (n) { n[0].nodeValue = n[1]; }); b.texts = null; }
    b.el.style.removeProperty('background'); b.el.style.removeProperty('-webkit-background-clip');
    b.el.style.minHeight = ''; b.el.style.minWidth = ''; b.el.style.transform = ''; b.el.style.clipPath = '';
    b.el.classList.remove('pend', 'typing');
    $$('img.bw', b.el).forEach(function (i) { i.classList.remove('bw'); });
    b.state = 'done'; doneCount++; b._done(); renderBar();
  }

  function sketch(b, a, ctx) {
    var r = rect(b.el);
    if (r.w < 2 || r.h < 2) return Promise.resolve();
    return moveTo(a, r.x, r.y, ctx).then(function () {
      if (dead(ctx) || ctx.instant) return;
      var sb = div('selbox'), sz = div('sz', sb);
      sb.style.left = r.x + 'px'; sb.style.top = r.y + 'px';
      var dur = 340 + Math.min(420, (r.w + r.h) * .22);
      return tween(dur, function (p) {
        var e = easeOut(p), w = r.w * e, h = r.h * e;
        sb.style.width = w + 'px'; sb.style.height = h + 'px';
        sz.textContent = Math.round(w) + ' × ' + Math.round(h);
        setPos(a, r.x + w, r.y + h);
      }, ctx).then(function () {
        sb.remove();
        if (dead(ctx) || b.state === 'done') return;
        var s = div('skel'); s.style.cssText = 'left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px';
        b.skel = s; skels.push(b); b.state = 'sketch';
      });
    });
  }

  function textNodes(el) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), out = [], n;
    while ((n = w.nextNode())) out.push([n, n.nodeValue]);
    return out;
  }

  function reveal(b, a, ctx) {
    var el = b.el, r = rect(el);
    if (b.skel) { b.skel.remove(); b.skel = null; }
    if (b.nudge) el.style.transform = 'translate(' + b.nudge[0] + 'px,' + b.nudge[1] + 'px)';
    var t = b.type;
    if (t === 't') {
      b.texts = textNodes(el);
      var total = b.texts.reduce(function (s, n) { return s + n[1].length; }, 0);
      el.style.minHeight = r.h + 'px'; el.style.minWidth = Math.min(r.w, el.parentNode.clientWidth || r.w) + 'px';
      b.texts.forEach(function (n) { n[0].nodeValue = ''; });
      el.classList.remove('pend'); el.classList.add('typing');
      var dur = Math.min(1500, 240 + total * 16), sx = a.x;
      return tween(dur, function (p) {
        var left = Math.floor(total * p);
        b.texts.forEach(function (n) { var take = Math.min(left, n[1].length); n[0].nodeValue = n[1].slice(0, take); left -= take; });
        setPos(a, sx + (r.x + Math.min(r.w, 420) - sx) * p, a.y);
      }, ctx);
    }
    if (t === 'h') {
      b.orig = el.innerHTML;
      var cs = getComputedStyle(el), clip = /text/.test(cs.webkitBackgroundClip || cs.backgroundClip), bg = cs.backgroundImage;
      textNodes(el).forEach(function (n) {
        var f = document.createDocumentFragment();
        n[1].split('').forEach(function (ch) {
          if (/\s/.test(ch)) { f.appendChild(document.createTextNode(ch)); return; }
          var s = document.createElement('span'); s.className = 'ltr'; s.textContent = ch;
          if (clip) s.style.cssText = 'background:' + bg + ';-webkit-background-clip:text;background-clip:text;color:transparent';
          f.appendChild(s);
        });
        n[0].parentNode.replaceChild(f, n[0]);
      });
      if (clip) { el.style.background = 'none'; }
      el.classList.remove('pend');
      var L = $$('.ltr', el), lit = 0, sx2 = a.x;
      return tween(Math.min(1700, 260 + L.length * 95), function (p) {
        var n = Math.floor(L.length * p);
        for (; lit < n; lit++) L[lit].classList.add('on');
        setPos(a, sx2 + (r.x + r.w * p - sx2) * Math.min(1, p * 3), a.y);
      }, ctx).then(function () { if (!dead(ctx)) { L.forEach(function (l) { l.classList.add('on'); }); } });
    }
    if (t === 'i' || t === 'c') {
      var imgs = $$('img', el); imgs.forEach(function (i) { i.classList.add('bw'); });
      if (t === 'c') el.style.opacity = '0';
      el.classList.remove('pend');
      var from = t === 'i' ? 'inset(0 0 100% 0)' : 'inset(0 0 0 0)';
      if (t === 'i') el.style.clipPath = from;
      var sy0 = a.y;
      return tween(t === 'i' ? 900 : 420, function (p) {
        var e = easeOut(p);
        if (t === 'i') { el.style.clipPath = 'inset(0 0 ' + ((1 - e) * 100).toFixed(1) + '% 0)'; setPos(a, a.x, sy0 + (r.y + r.h * .9 - sy0) * e); }
        else { el.style.opacity = e; }
      }, ctx).then(function () {
        el.style.clipPath = ''; el.style.opacity = '';
        if (dead(ctx)) return;
        setTimeout(function () { imgs.forEach(function (i) { i.classList.remove('bw'); }); }, ctx.instant ? 0 : 350 / G);
      });
    }
    /* x: box */
    el.style.opacity = '0';
    el.classList.remove('pend');
    return tween(360, function (p) { var e = easeOut(p); el.style.opacity = e; el.style.scale = (.97 + .03 * e).toFixed(3); }, ctx)
      .then(function () { el.style.opacity = ''; el.style.scale = ''; });
  }

  function nudgeBack(b, a, ctx) {
    var el = b.el, dx = b.nudge[0], dy = b.nudge[1];
    var r = rect(el); // includes the offset
    var gx = r.x - dx, gy = r.y - dy, ur = rect(b.unit.el);
    return moveTo(a, r.x + r.w / 2, r.y + Math.min(r.h / 2, 60), ctx).then(function () {
      if (dead(ctx) || ctx.instant) return;
      a.el.classList.add('grab');
      var gv = div('guide v'), gh = dy ? div('guide h') : null;
      gv.style.cssText = 'left:' + gx + 'px;top:' + ur.y + 'px;height:' + ur.h + 'px';
      if (gh) gh.style.cssText = 'top:' + gy + 'px;left:0;width:100%';
      var ax = a.x, ay = a.y;
      return tween(650, function (p) {
        var e = ease(p), ox = dx * (1 - e), oy = dy * (1 - e);
        el.style.transform = 'translate(' + ox + 'px,' + oy + 'px)';
        setPos(a, ax - dx * e, ay - dy * e);
      }, ctx).then(function () {
        el.style.transform = '';
        if (el.animate && !ctx.instant) el.animate([{ scale: '1.012' }, { scale: '1' }], { duration: 180 });
        return wait(260, ctx).then(function () { gv.remove(); if (gh) gh.remove(); a.el.classList.remove('grab'); });
      }, function () { gv.remove(); if (gh) gh.remove(); });
    });
  }

  function copyDrag(b, a, ctx) {
    var src = b.src.el, sr = rect(src), tr = rect(b.el);
    return moveTo(a, sr.x + sr.w / 2, sr.y + Math.min(sr.h / 2, 40), ctx).then(function () {
      if (dead(ctx) || ctx.instant) return;
      a.el.classList.add('copy');
      var wrap = document.createElement('div');
      wrap.className = 'ghost ' + (src.parentNode.className || '');
      wrap.style.cssText = 'left:' + sr.x + 'px;top:' + sr.y + 'px;width:' + sr.w + 'px;height:' + sr.h + 'px;display:block;margin:0;padding:0;border:0;background:none;transform:none';
      var c = src.cloneNode(true); c.removeAttribute('id'); $$('[id]', c).forEach(function (n) { n.removeAttribute('id'); });
      c.style.margin = '0'; c.style.width = '100%'; c.style.height = '100%'; c.classList.remove('pend');
      wrap.appendChild(c); layer.appendChild(wrap);
      var ax = a.x, ay = a.y;
      return tween(560 + Math.min(500, Math.hypot(tr.x - sr.x, tr.y - sr.y) * .3), function (p) {
        var e = ease(p), x = sr.x + (tr.x - sr.x) * e, y = sr.y + (tr.y - sr.y) * e;
        wrap.style.left = x + 'px'; wrap.style.top = y + 'px';
        wrap.style.width = sr.w + (tr.w - sr.w) * e + 'px'; wrap.style.height = sr.h + (tr.h - sr.h) * e + 'px';
        setPos(a, ax + (tr.x - sr.x) * e, ay + (tr.y - sr.y) * e);
      }, ctx).then(function () {
        wrap.remove(); a.el.classList.remove('copy');
        if (dead(ctx)) return;
        b.el.classList.remove('pend');
        if (b.el.animate && !ctx.instant) b.el.animate([{ opacity: .55, filter: 'brightness(1.6)' }, { opacity: 1, filter: 'none' }], { duration: 260 / G });
      }, function () { wrap.remove(); });
    });
  }

  /* ---------- building a unit ---------- */
  function setStatus(s) { $('#st').textContent = s; }

  function runUnit(u) {
    if (u.state !== 'idle') return;
    u.state = 'run'; u.gen = gen;
    if (u !== units[0] && ARRIVE) for (var i = 0; i < ARRIVE && agents.length < MAX_AGENTS; i++) spawn();
    setStatus('Building ' + u.name + '…');
    var bl = u.blocks.filter(function (b) { return b.state !== 'done'; });
    var sk = bl.filter(function (b) { return !b.dup; });
    /* phase 1: sketch boxes */
    var p1 = Promise.all(sk.map(function (b, i) {
      return wait(i * 70, u).then(function () {
        if (dead(u) || u.instant) return;
        var r = rect(b.el);
        return acquire(u, r.x, r.y).then(function (a) {
          if (!a) return;
          return sketch(b, a, u).then(function () { release(a); }, function () { release(a); });
        });
      });
    }));
    /* phase 2: apply content */
    var p2 = p1.then(function () {
      return Promise.all(bl.map(function (b, i) {
        return wait(i * 120, u).then(function () {
          if (dead(u)) return;
          if (u.instant) { finish(b); return; }
          var pre = b.dup ? b.src.done : Promise.resolve();
          return pre.then(function () {
            if (dead(u)) return;
            if (u.instant) { finish(b); return; }
            var r = rect(b.dup ? b.src.el : b.el);
            return acquire(u, r.x, r.y).then(function (a) {
              if (!a || u.instant) { release(a); if (!dead(u)) finish(b); return; }
              var job = b.dup ? copyDrag(b, a, u) :
                moveTo(a, rect(b.el).x + 6, rect(b.el).y + 8, u).then(function () { if (!dead(u) && !u.instant) return reveal(b, a, u); })
                  .then(function () { if (b.nudge && !dead(u) && !u.instant) return nudgeBack(b, a, u); });
              return job.then(function () { release(a); if (!dead(u)) finish(b); },
                function () { release(a); if (!dead(u)) finish(b); });
            });
          });
        });
      }));
    });
    return p2.then(function () {
      if (dead(u)) return;
      u.blocks.forEach(finish);
      return u.instant ? null : tests(u);
    }).then(function () {
      if (dead(u)) return;
      u.state = 'done'; u.tests = true;
      checkFinal();
    });
  }

  function setInstant(u) {
    if (u.instant || u.state === 'done') return;
    u.instant = true; flushQueue(u);
    u.blocks.forEach(function (b) { if (b.state !== 'done') finish(b); });
  }

  /* agents try the page after building it */
  function clickAt(a, el, ctx) {
    var r = rect(el);
    return moveTo(a, r.x + r.w / 2, r.y + r.h / 2, ctx).then(function () {
      if (dead(ctx) || ctx.instant) return;
      a.el.animate && a.el.animate([{ scale: '1' }, { scale: '.8' }, { scale: '1' }], { duration: 220 });
      return wait(140, ctx);
    });
  }
  function tests(u) {
    var id = u.el.id, inView = function () { var r = u.el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
    if (!inView()) return null;
    var job = null;
    if (id === 'work' && !touched.filter) job = function (a) {
      var t = $('.tab[data-f="sites"]'), all = $('.tab[data-f="all"]');
      return clickAt(a, t, u).then(function () { if (touched.filter || u.instant || dead(u)) return; Z.filter('sites'); return wait(1100, u); })
        .then(function () { if (touched.filter || u.instant || dead(u)) return; return clickAt(a, all, u).then(function () { if (!touched.filter && !dead(u)) Z.filter('all'); }); });
    };
    if (id === 'inside' && !touched.cmp) job = function (a) {
      var h = $('#handle');
      return clickAt(a, h, u).then(function () {
        if (touched.cmp || u.instant || dead(u)) return;
        a.el.classList.add('grab');
        var cr = rect(Z.cmpEl), y = a.y;
        var path = [50, 18, 82, 50], seg = 0;
        function step() {
          if (seg >= path.length - 1 || touched.cmp || u.instant || dead(u)) return Promise.resolve();
          var from = path[seg], to = path[seg + 1]; seg++;
          return tween(900, function (p) { var v = from + (to - from) * ease(p); if (!touched.cmp) Z.setCmp(v); setPos(a, cr.x + cr.w * v / 100, y); }, u).then(step);
        }
        return step().then(function () { a.el.classList.remove('grab'); });
      });
    };
    if (id === 'track' && !touched.acc) job = function (a) {
      var btns = $$('.acc-b');
      return clickAt(a, btns[1], u).then(function () { if (touched.acc || u.instant || dead(u)) return; Z.openAcc(1); return wait(1500, u); })
        .then(function () { if (touched.acc || u.instant || dead(u)) return; return clickAt(a, btns[0], u).then(function () { if (!touched.acc && !dead(u)) Z.openAcc(0); }); });
    };
    if (!job) return null;
    setStatus('Testing ' + u.name + '…');
    var r = rect(u.el);
    return acquire(u, r.x + r.w / 2, r.y + r.h / 2).then(function (a) {
      if (!a) return;
      return job(a).then(function () { release(a); }, function () { release(a); });
    });
  }

  function checkFinal() {
    if (finalMode) return;
    var c = units.filter(function (u) { return u.el.id === 'contact'; })[0];
    var all = units.every(function (u) { return u.state === 'done'; });
    var cv = c && c.state === 'done' && c.el.getBoundingClientRect().top < innerHeight * .9;
    if (all || cv) {
      finalMode = true; trail = [];
      agents.forEach(function (a) { if (!a.busy) a.mode = 'conga'; });
      var s = Math.round((performance.now() - t0) / 1000);
      setStatus('Built by ' + agents.length + ' agents in ' + s + ' s');
    } else {
      var run = units.filter(function (u) { return u.state === 'run'; })[0];
      setStatus(run ? 'Building ' + run.name + '…' : 'Scroll — the next section builds on arrival');
    }
  }

  /* ---------- scroll watcher ---------- */
  var started = false;
  function watch() {
    if (!started) return;
    var vh = innerHeight, atEnd = scrollY + vh >= document.documentElement.scrollHeight - 8;
    units.forEach(function (u, i) {
      var r = u.el.getBoundingClientRect();
      if (u.state === 'idle' && (i === 0 || units[0].state !== 'idle') && (r.top < vh * .62 || (atEnd && r.top < vh))) {
        runUnit(u);
        if (r.bottom < 0) setInstant(u);
      } else if (u.state === 'run') {
        if (r.bottom < 0 || r.top > vh) setInstant(u);
        else if (/^Hero/.test(u.name) && scrollY > vh * .15) u.speed = 5;
      }
    });
    if (finalMode === false) {
      var c = units.filter(function (u) { return u.el.id === 'contact'; })[0];
      if (c && c.state === 'done') checkFinal();
    }
  }
  addEventListener('scroll', watch, { passive: true });
  setInterval(watch, 250);

  /* keep skeletons glued to their blocks on resize; size the layer */
  function sizeLayer() {
    var f = $('.foot'); if (f) layer.style.height = (f.getBoundingClientRect().bottom + scrollY) + 'px';
  }
  addEventListener('resize', function () {
    sizeLayer();
    skels.forEach(function (b) { if (!b.skel) return; var r = rect(b.el); b.skel.style.cssText = 'left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px'; });
  });
  setInterval(sizeLayer, 800);

  /* ---------- bar ---------- */
  function renderBar() {
    $('#nAg').textContent = agents.length;
    $('#nLay').textContent = doneCount + '/' + blocks.length;
    $('#prog').style.width = (blocks.length ? doneCount / blocks.length * 100 : 0) + '%';
    var av = $('#av'), show = agents.slice(0, 4);
    av.innerHTML = show.map(function (a) { return '<i style="--c:' + a.c + '">' + a.name[0] + '</i>'; }).join('') +
      (agents.length > 4 ? '<i style="--c:#2a2424">+' + (agents.length - 4) + '</i>' : '');
  }
  $$('#spd button').forEach(function (b) {
    b.addEventListener('click', function () {
      G = +b.dataset.s; $$('#spd button').forEach(function (x) { x.classList.toggle('on', x === b); });
    });
  });

  /* Tour: scroll by itself, wait for each build, move on */
  var touring = false, tourBtn = $('#tour');
  function stopTour() { touring = false; tourBtn.classList.remove('on'); tourBtn.setAttribute('aria-pressed', 'false'); }
  ['wheel', 'touchstart', 'keydown'].forEach(function (ev) { addEventListener(ev, function (e) { if (touring && e.isTrusted) stopTour(); }, { passive: true }); });
  function smoothTo(y) {
    var sy = scrollY, d = y - sy, dur = 500 + Math.min(1100, Math.abs(d) * .5), st = performance.now();
    return new Promise(function (res) {
      (function f(t) {
        if (!touring) return res();
        var p = Math.min(1, (t - st) / dur); scrollTo(0, sy + d * ease(p));
        p < 1 ? requestAnimationFrame(f) : res();
      })(st);
    });
  }
  function until(fn) { return new Promise(function (res) { (function c() { if (!touring || fn()) return res(); setTimeout(c, 150); })(); }); }
  tourBtn.addEventListener('click', function () {
    if (touring) return stopTour();
    touring = true; tourBtn.classList.add('on'); tourBtn.setAttribute('aria-pressed', 'true');
    var list = units.slice(), i = 0;
    (function next() {
      if (!touring || i >= list.length) return stopTour();
      var u = list[i++], r = rect(u.el), vh = innerHeight;
      var y = r.h > vh * .9 ? r.y - 70 : r.y + r.h / 2 - vh / 2;
      smoothTo(Math.max(0, Math.min(y, document.documentElement.scrollHeight - vh)))
        .then(function () { watch(); return until(function () { return u.state === 'done'; }); })
        .then(function () { return new Promise(function (r2) { setTimeout(r2, 1000 / G); }); })
        .then(next);
    })();
  });

  /* ---------- start / replay ---------- */
  function imgsReady(root) {
    return Promise.all($$('img', root).map(function (i) {
      return i.complete ? 0 : new Promise(function (r) { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); });
    }));
  }
  function begin() {
    gen++; finalMode = false; trail = []; started = false; t0 = performance.now();
    initBlocks();
    bar.hidden = false; setStatus('Scanning the page…'); sizeLayer();
    while (agents.length < START_AGENTS) spawn();
    intro.hidden = false; intro.classList.remove('out');
    var stopOrbit = orbit();
    var myGen = gen;
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    var minWait = new Promise(function (r) { setTimeout(r, 2600); });
    var maxWait = new Promise(function (r) { setTimeout(r, 7000); });
    Promise.race([Promise.all([fonts, imgsReady($('.hero')), minWait]), maxWait]).then(function () {
      if (myGen !== gen) return;
      if (Z.fit) Z.fit();
      intro.classList.add('out'); setTimeout(function () { intro.hidden = true; }, 600);
      stopOrbit(); sizeLayer(); started = true; watch();
    });
  }
  function replay() {
    gen++; stopTour();
    units.forEach(function (u) { u.dead = true; });
    queue.forEach(function (q) { q.res(null); }); queue = [];
    blocks.forEach(function (b) {
      if (b.orig != null) b.el.innerHTML = b.orig;
      if (b.texts) b.texts.forEach(function (n) { n[0].nodeValue = n[1]; });
      b.el.style.cssText = b.el.style.cssText.replace(/(opacity|scale|transform|clip-path|min-height|min-width|background)[^;]*;?/g, '');
      b.el.classList.remove('typing'); b.el.__b = null;
      $$('img.bw', b.el).forEach(function (i) { i.classList.remove('bw'); });
    });
    $$('.skel,.selbox,.ghost,.guide', layer).forEach(function (n) { n.remove(); });
    agents.forEach(function (a) { a.el.remove(); }); agents = []; skels = [];
    touched.filter = touched.cmp = touched.acc = false;
    Z.filter('all'); Z.setCmp(50); Z.openAcc(0);
    var q = $('#q'); if (q) q.value = '';
    scrollTo(0, 0);
    H.classList.add('swarm');
    begin();
  }
  $('#replay').addEventListener('click', replay);
  $('#replay2').addEventListener('click', replay);

  begin();
})();
