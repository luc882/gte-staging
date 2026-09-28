/* =========================================================================
   GTE Edge — interaction layer
   ========================================================================= */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ------------------------------------------------------------------ *
   * Seeded RNG so every chart renders identically on every load        *
   * ------------------------------------------------------------------ */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;  s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ------------------------------------------------------------------ *
   * Scramble reveal                                                     *
   *                                                                     *
   * Headlines decode rather than fade in. The markup inside them is
   * preserved — only text nodes are rewritten — so the coloured spans
   * and line breaks in a headline survive. Every character gets its own
   * box, locked to the width of the character it will settle on, so the
   * shuffling never reflows the line; the original HTML is put back once
   * the word has resolved.
   * ------------------------------------------------------------------ */
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&$/\\<>[]{}*+=-';

  function scramble(el) {
    if (el.dataset.scrambled) return;
    el.dataset.scrambled = '1';
    if (reduced) return;

    var original = el.innerHTML;
    el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());

    // wrap every visible character, keeping whitespace and existing markup
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    var cells = [];
    nodes.forEach(function (node) {
      if (!node.nodeValue.trim()) return;
      var frag = document.createDocumentFragment();
      node.nodeValue.split('').forEach(function (ch) {
        if (ch === ' ' || ch === '\n' || ch === '\t') {
          frag.appendChild(document.createTextNode(ch));
          return;
        }
        var s = document.createElement('span');
        s.className = 'scr';
        s.textContent = ch;
        frag.appendChild(s);
        cells.push({ el: s, ch: ch });
      });
      node.parentNode.replaceChild(frag, node);
    });
    if (!cells.length) return;

    // one read pass, then one write pass — measuring per cell in a loop
    // that also writes would thrash layout
    var widths = cells.map(function (c) { return c.el.getBoundingClientRect().width; });
    cells.forEach(function (c, i) { c.el.style.width = widths[i].toFixed(2) + 'px'; });

    var total = cells.length;
    // Everything churns from the first frame — the headline arrives as a block
    // of noise and resolves through it. Staggering the *start* instead would
    // leave most of the line blank for most of the animation.
    var SPREAD = Math.min(470, 130 + total * 6);   // last character settles by here

    cells.forEach(function (c, i) {
      c.end = 190 + (i / total) * SPREAD + Math.random() * 110;
      // Each character keeps its own flicker rate and phase. On one shared
      // tick the whole line swaps in lockstep, which reads as a pulse; out of
      // step they read as individual characters churning.
      c.rate = 22 + Math.random() * 26;
      c.next = Math.random() * c.rate;
      c.el.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0];
    });

    var t0 = performance.now(), done = 0;

    (function step(now) {
      var t = now - t0;
      done = 0;

      for (var i = 0; i < total; i++) {
        var c = cells[i];
        if (c.settled) { done++; continue; }
        if (t >= c.end) {
          c.settled = true;
          c.el.textContent = c.ch;
          done++;
        } else if (t >= c.next) {
          c.next = t + c.rate;
          c.el.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
      }

      if (done < total) requestAnimationFrame(step);
      else {
        el.innerHTML = original;              // hand the clean markup back
        el.removeAttribute("aria-label");
        el.dispatchEvent(new CustomEvent("scramble:end"));
      }
    })(t0);
  }


  /* ------------------------------------------------------------------ *
   * Scroll reveal                                                       *
   * ------------------------------------------------------------------ */
  (function reveals() {
    var items = $$('.reveal');
    items.forEach(function (el) {
      var d = el.getAttribute('data-delay');
      if (d) el.style.setProperty('--d', d);
    });
    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      document.documentElement.classList.add("is-hero-ready");
      heroIntro(function () {});
      return;
    }

    var heroReady = false, queued = [];

    function show(el) {
      el.classList.add("is-in");
      if (el.hasAttribute("data-scramble")) scramble(el);
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        show(e.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
    // Everything in the hero is above the fold by definition, so it waits on
    // the intro video rather than on an intersection. The observer would never
    // fire for the stats bar in any case: it sits in the bottom 12% of the
    // screen, which the rootMargin deliberately excludes.
    items.forEach(function (el) {
      if (el.closest('.hero')) queued.push(el);
      else io.observe(el);
    });

    heroIntro(function release() {
      if (heroReady) return;
      heroReady = true;
      document.documentElement.classList.add("is-hero-ready");
      queued.forEach(show);
      queued.length = 0;
    });
  })();

  /* ------------------------------------------------------------------ *
   * Hero intro                                                          *
   *                                                                     *
   * The silhouette reveal plays once on load and then simply stops,
   * holding its last frame — which is the hero composition. The hero
   * copy is held back until it finishes so the reveal is not competing
   * with type appearing over it.
   *
   * Nobody gets stuck behind it: scrolling, a failed autoplay, a video
   * error or a hard cap all release the copy immediately, and the video
   * keeps playing underneath if it is still going.
   * ------------------------------------------------------------------ */
  function heroIntro(release) {
    var video = $('video.hero__plate');
    var still = $('.hero__plate--fallback');

    function fallback() {
      // the video sits on top, so it has to go or its black first frame
      // hides the still we are falling back to
      if (video) video.hidden = true;
      if (still) {
        // the still is 200KB that the normal path never needs, so it has no
        // src until this moment
        if (!still.src) still.src = still.getAttribute('data-src');
        still.classList.add('is-on');
      }
      release();
    }

    if (!video) { fallback(); return; }

    // reduced motion: park on the last frame instead of playing the reveal
    if (reduced) {
      video.addEventListener('loadedmetadata', function () {
        try { video.currentTime = Math.max(0, video.duration - 0.05); } catch (e) {}
      });
      release();
      return;
    }

    video.addEventListener('ended', release);
    video.addEventListener('error', fallback);
    addEventListener('scroll', release, { once: true, passive: true });
    setTimeout(release, 6500);           // never hold the page longer than this

    // play() tells us definitively whether playback began — it resolves once
    // it has, and rejects when autoplay is refused (a tab opened in the
    // background, a browser policy). A timeout guess here fired on perfectly
    // good playback that was merely slow to start.
    var p = video.play();
    if (p && p.then) {
      p.catch(fallback);
    } else {
      // no promise from play(): fall back to asking whether it moved
      setTimeout(function () { if (video.paused) fallback(); }, 1800);
    }
  }

  /* ------------------------------------------------------------------ *
   * Nav — condense on scroll, hide when scrolling down                  *
   * ------------------------------------------------------------------ */
  (function nav() {
    var el = $('#nav');
    if (!el) return;
    var last = 0;
    var tick = function () {
      var y = window.pageYOffset;
      el.classList.toggle('is-stuck', y > 24);
      el.classList.toggle('is-hidden', y > 420 && y > last + 4);
      last = y;
    };
    addEventListener('scroll', tick, { passive: true });
    tick();
  })();

  /* ------------------------------------------------------------------ *
   * Hero plate parallax                                                 *
   * ------------------------------------------------------------------ */
  (function parallax() {
    var hero = $('.hero');
    var plates = $$('.hero__plate');
    if (!hero || !plates.length || reduced) return;
    var raf = 0;
    var run = function () {
      raf = 0;
      var p = Math.min(1, Math.max(0, window.pageYOffset / hero.offsetHeight));
      var s = (1 + p * 0.09).toFixed(4), o = (1 - p * 0.55).toFixed(3);
      plates.forEach(function (el) {
        el.style.setProperty('--plate-scale', s);
        el.style.setProperty('--plate-fade', o);
      });
    };
    addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(run); }, { passive: true });
    run();
  })();

  /* ------------------------------------------------------------------ *
   * Lazy tile video                                                     *
   *                                                                     *
   * The source file is 10MB, which is not something to put on the wire  *
   * for a card most visitors never reach. The <source> carries no src   *
   * until the card is near the viewport, so nothing is fetched before   *
   * then, and it pauses again on the way out rather than decoding       *
   * behind the fold. The poster holds the tile in the meantime.         *
   * ------------------------------------------------------------------ */
  (function lazyVideo() {
    var vids = $$('video[data-lazy-video]');
    if (!vids.length || reduced || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target;
        if (!e.isIntersecting) { if (!v.paused) v.pause(); return; }
        var pending = v.querySelectorAll('source[data-src]');
        if (pending.length) {
          Array.prototype.forEach.call(pending, function (s) {
            s.src = s.getAttribute('data-src');
            s.removeAttribute('data-src');
          });
          v.load();
        }
        var p = v.play();
        if (p && p.catch) p.catch(function () { /* poster stands in */ });
      });
    }, { rootMargin: '200px 0px' });
    vids.forEach(function (v) {
      v.addEventListener('playing', function () { v.classList.add('is-playing'); });
      io.observe(v);
    });
  })();

  /* ------------------------------------------------------------------ *
   * EDGE rows — one lit at a time, glyphs drawn open by the scroll        *
   *                                                                     *
   * The design asks for a single highlighted row, always the one in the *
   * middle of the screen. The same measurement writes --lit on every    *
   * row, 1 on the reading line and 0 a third of a viewport away, which  *
   * is what opens the bars of the flat glyph beside it.                 *
   * ------------------------------------------------------------------ */
  (function edgeRows() {
    var rows = $$('[data-edge-row]');
    if (!rows.length) return;
    var raf = 0;
    var run = function () {
      raf = 0;
      var line = window.innerHeight * 0.46, best = 0, near = Infinity;
      rows.forEach(function (el, i) {
        var r = el.getBoundingClientRect();
        var d = Math.abs(r.top + r.height / 2 - line);
        if (d < near) { near = d; best = i; }
        var span = window.innerHeight * 0.34;
        el.style.setProperty('--lit', Math.max(0, 1 - d / span).toFixed(3));
      });
      rows.forEach(function (el, i) { el.classList.toggle('is-lit', i === best); });
    };
    addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(run); }, { passive: true });
    addEventListener('resize', run);
    run();
  })();

  /* ------------------------------------------------------------------ *
   * Market ticker                                                       *
   * ------------------------------------------------------------------ */
  (function tickers() {
    var DATA = [
      ['BTC', 5.14, 1], ['SOL', 3.21, 1], ['DOGE', 1.87, -1], ['AVAX', 4.52, 1],
      ['DOT', 2.34, -1], ['SILVER', 0.89, 1], ['MATIC', 6.12, -1], ['ETH', 2.78, 1],
      ['XRP', 1.45, -1], ['ADA', 3.67, 1], ['LINK', 0.93, -1], ['GOLD', 1.12, 1],
      ['SPX', 0.74, 1], ['AAPL', 2.15, -1]
    ];
    var UP = 'assets/svg/tri-up.svg', DOWN = 'assets/svg/tri-down.svg';

    function item(row) {
      var up = row[2] > 0;
      var d = document.createElement('div');
      d.className = 'tick ' + (up ? 'is-up' : 'is-down');
      d.innerHTML =
        '<span class="tick__sym">' + row[0] + '</span>' +
        '<span class="tick__val"><span class="tick__pct">' + row[1].toFixed(2) + '%</span>' +
        '<img class="tick__arrow" src="' + (up ? UP : DOWN) + '" alt="" aria-hidden="true"></span>';
      return d;
    }

    $$('[data-ticker]').forEach(function (bar) {
      var track = $('.tickerbar__track', bar);
      if (!track) return;
      // two identical passes so the -50% marquee loops seamlessly
      for (var pass = 0; pass < 2; pass++) {
        DATA.forEach(function (row) { track.appendChild(item(row)); });
      }
    });
  })();

  /* ------------------------------------------------------------------ *
   * Waitlist count-up                                                   *
   * ------------------------------------------------------------------ */
  (function counter() {
    var el = $('[data-count]');
    if (!el || reduced || !('IntersectionObserver' in window)) return;
    var target = parseInt(el.getAttribute('data-count'), 10);
    var fmt = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      var t0 = performance.now(), dur = 1500;
      (function step(t) {
        var k = Math.min(1, (t - t0) / dur);
        var e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(Math.round(target * e));
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    }, { threshold: 0.5 });
    io.observe(el);
  })();

  /* ------------------------------------------------------------------ *
   * Candlestick charts                                                  *
   * ------------------------------------------------------------------ */
  function series(n, seed, shape) {
    var r = rng(seed), out = [], price = 0.5;
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1);
      var drift = shape(t) - price;
      var open = price;
      var move = drift * 0.34 + (r() - 0.5) * 0.045;
      var close = Math.min(0.97, Math.max(0.03, open + move));
      var wick = 0.008 + r() * 0.028;
      out.push({
        o: open, c: close,
        h: Math.max(open, close) + wick * r(),
        l: Math.min(open, close) - wick * r(),
        v: 0.25 + r() * 0.75
      });
      price = close;
    }
    return out;
  }

  function drawCandles(cv, opts) {
    var ctx = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var pad = opts.pad;
    var data = opts.data;
    var n = data.length;
    var step = (w - pad.l - pad.r) / n;
    var bw = Math.max(2, Math.min(opts.maxBar || 12, step * 0.62));
    var top = pad.t, bot = h - pad.b;
    var Y = function (v) { return bot - v * (bot - top); };
    var progress = opts.progress == null ? 1 : opts.progress;

    // horizontal guide lines
    if (opts.guides) {
      ctx.strokeStyle = 'rgba(255,255,255,.04)';
      ctx.lineWidth = 1;
      for (var g = 1; g < 5; g++) {
        var gy = Math.round(top + (bot - top) * (g / 5)) + 0.5;
        ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(w - pad.r, gy); ctx.stroke();
      }
    }

    var shown = Math.ceil(n * progress);
    for (var i = 0; i < shown; i++) {
      var d = data[i];
      var x = pad.l + step * i + step / 2;
      var up = d.c >= d.o;
      var col = opts.colorFor ? opts.colorFor(i, up) : (up ? '#2ee88b' : '#e83838');
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, Y(d.h));
      ctx.lineTo(Math.round(x) + 0.5, Y(d.l));
      ctx.stroke();
      var yo = Y(d.o), yc = Y(d.c);
      var bh = Math.max(1.5, Math.abs(yc - yo));
      ctx.fillRect(Math.round(x - bw / 2), Math.round(Math.min(yo, yc)), Math.round(bw), Math.round(bh));
    }

    if (opts.after) opts.after(ctx, { w: w, h: h, Y: Y, pad: pad, step: step });
  }

  function dashed(ctx, y, x0, x1, color, dash) {
    ctx.save();
    ctx.setLineDash(dash || [5, 5]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, Math.round(y) + 0.5);
    ctx.lineTo(x1, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  var CHARTS = [];

  function setupChart(cv) {
    var conf = {
      data: series(44, 77112, function (t) {
        return 0.30 + 0.42 * Math.pow(Math.min(1, t * 1.25), 1.7) + 0.08 * Math.sin(t * 7.0);
      }),
      pad: { l: 8, r: 120, t: 34, b: 10 },
      maxBar: 13,
      guides: false,
      colorFor: function (i, up) {
        if (i >= 42) return up ? "#2ee88b" : "#e83838";
        return up ? "rgba(180,190,196,.30)" : "rgba(150,158,164,.24)";
      },
      after: function (ctx, m) {
        var right = m.w - 112;
        dashed(ctx, m.h * 0.25, 0, right, "rgba(232,56,56,.55)");
        dashed(ctx, m.h * 0.465, 0, right, "rgba(179,183,187,.45)");
        dashed(ctx, m.h * 0.79, 0, right, "rgba(46,232,139,.55)");
      }
    };

    var state = { cv: cv, conf: conf, progress: reduced ? 1 : 0 };
    CHARTS.push(state);

    var render = function () {
      conf.progress = state.progress;
      drawCandles(cv, conf);
    };
    state.render = render;
    render();

    if (!reduced && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return;
        io.disconnect();
        var t0 = performance.now(), dur = 1400;
        (function step(t) {
          var k = Math.min(1, (t - t0) / dur);
          state.progress = 1 - Math.pow(1 - k, 2.2);
          render();
          if (k < 1) requestAnimationFrame(step);
        })(t0);
      }, { threshold: 0.15 });
      io.observe(cv);
    }
  }

  $$('[data-candles]').forEach(setupChart);

  /* ------------------------------------------------------------------ *
   * AI features — the pinned, scroll-paged panel                        *
   *                                                                     *
   * The track is three viewports tall and the panel sticks for all of   *
   * it, so scroll position inside the track is the tab index. Clicking  *
   * a tab scrolls the page to that tab's slice rather than setting      *
   * state directly, which keeps scroll as the single source of truth.   *
   * ------------------------------------------------------------------ */
  var SCROLLSEC = (function () {
    var track = $('[data-scrollsec]');
    if (!track) return null;

    var tabs = $$('.tab', track);
    var layers = $$('.layer', track);
    var n = tabs.length;
    var active = -1;

    function setActive(i) {
      if (i === active) return;
      active = i;
      tabs.forEach(function (t, k) {
        t.classList.toggle('is-open', k === i);
        t.setAttribute('aria-selected', k === i ? 'true' : 'false');
      });
      layers.forEach(function (l, k) { l.classList.toggle('is-on', k === i); });
      if (CHART) CHART.setState(i);
    }

    function onScroll() {
      var r = track.getBoundingClientRect();
      var span = r.height - window.innerHeight;
      if (span <= 0) { setActive(0); return; }
      var p = (-r.top) / span;                     // 0 at the top of the track
      var i = Math.floor(p * n);
      setActive(Math.max(0, Math.min(n - 1, i)));
    }

    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () {
        var span = track.offsetHeight - window.innerHeight;
        var top = track.getBoundingClientRect().top + window.pageYOffset;
        var y = top + span * ((i + 0.5) / n);
        window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
      });
    });

    addEventListener('scroll', onScroll, { passive: true });
    return { sync: onScroll };
  })();

  /* ------------------------------------------------------------------ *
   * The chart behind it. One candle series, three overlays drawn from   *
   * the same data so the bands and the traders always sit on the price. *
   * ------------------------------------------------------------------ */
  var CHART = (function () {
    var cv = $('.scrollsec__canvas');
    if (!cv) return null;

    var ctx = cv.getContext('2d');
    var data = series(84, 20260918, function (t) {
      return 0.50 + 0.31 * Math.sin(t * Math.PI * 2.05 - 0.55) - 0.23 * Math.sin(t * Math.PI * 0.9);
    });

    // rolling mean and deviation -> the envelope in state 02
    var band = (function () {
      var W = 8, up = [], dn = [];
      for (var i = 0; i < data.length; i++) {
        var a = Math.max(0, i - W), b = Math.min(data.length - 1, i + W), s = 0, c = 0;
        for (var j = a; j <= b; j++) { s += data[j].c; c++; }
        var m = s / c, v = 0;
        for (var k = a; k <= b; k++) v += Math.pow(data[k].c - m, 2);
        var sd = Math.sqrt(v / c);
        up.push(m + sd * 1.7 + 0.055); dn.push(m - sd * 1.7 - 0.055);
      }
      return { up: up, dn: dn };
    })();

    // trade frequency ribbon along the bottom — driven by how much the price
    // is actually moving, so its peaks line up with the volatile stretches
    var freq = (function () {
      var r = rng(4242), raw = [], out = [];
      for (var i = 0; i < data.length; i++) {
        var t = i / (data.length - 1);
        raw.push(
          0.42 +
          Math.abs(data[i].c - data[i].o) * 9 +
          0.18 * Math.sin(t * Math.PI * 3.1 + 0.6) +
          0.10 * Math.sin(t * Math.PI * 7.3) +
          (r() - 0.5) * 0.12
        );
      }
      for (var q = 0; q < raw.length; q++) {      // smooth
        var a2 = Math.max(0, q - 2), b2 = Math.min(raw.length - 1, q + 2), s2 = 0, c2 = 0;
        for (var p = a2; p <= b2; p++) { s2 += raw[p]; c2++; }
        out.push(Math.max(0.05, Math.min(1, s2 / c2)));
      }
      return out;
    })();

    var state = 0, reveal = reduced ? 1 : 0, bandT = 0, freqT = 0;

    var PAD = { l: 8, r: 96, t: 120, b: 92 };

    // The price action occupies a band around the 4,800 line rather than the
    // whole pane, which is what leaves room for the news cards above it and
    // the frequency ribbon below.
    function geom() {
      var w = cv.clientWidth, h = cv.clientHeight;
      var step = (w - PAD.l - PAD.r) / data.length;
      return { w: w, h: h, step: step, top: h * 0.30, bot: h * 0.66 };
    }

    function trace(g, arr, shown) {
      for (var i = 0; i < shown; i++) {
        var x = PAD.l + g.step * i + g.step / 2;
        var y = g.bot - arr[i] * (g.bot - g.top);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
    }

    function line(g, arr, t, color, width) {
      if (t <= 0) return;
      ctx.beginPath();
      trace(g, arr, Math.max(2, Math.ceil(arr.length * t)));
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    function envelope(g, t) {
      if (t <= 0) return;
      var shown = Math.max(2, Math.ceil(band.up.length * t));
      ctx.beginPath();
      trace(g, band.up, shown);
      for (var j = shown - 1; j >= 0; j--) {
        var x = PAD.l + g.step * j + g.step / 2;
        ctx.lineTo(x, g.bot - band.dn[j] * (g.bot - g.top));
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(40,144,255,.10)";
      ctx.fill();
      line(g, band.up, t, "rgba(40,144,255,.85)", 1.5);
      line(g, band.dn, t, "rgba(40,144,255,.85)", 1.5);
    }

    function draw() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      var g = geom();

      // the envelope sits behind the candles
      envelope(g, bandT);

      // candles
      var bw = Math.max(2, Math.min(14, g.step * 0.62));
      var shown = Math.ceil(data.length * reveal);
      for (var i = 0; i < shown; i++) {
        var d = data[i];
        var x = PAD.l + g.step * i + g.step / 2;
        var up = d.c >= d.o;
        var col = up ? '#2ee88b' : '#e83838';
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
        var Y = function (v) { return g.bot - v * (g.bot - g.top); };
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, Y(d.h));
        ctx.lineTo(Math.round(x) + 0.5, Y(d.l));
        ctx.stroke();
        var yo = Y(d.o), yc = Y(d.c);
        ctx.fillRect(Math.round(x - bw / 2), Math.round(Math.min(yo, yc)),
                     Math.round(bw), Math.max(1.5, Math.abs(yc - yo)));
      }

      // trade frequency, on its own baseline under the price
      if (freqT > 0) {
        var save = { t: g.top, b: g.bot };
        g.top = h * 0.68; g.bot = h * 0.86;
        line(g, freq, freqT, "rgba(207,225,239,.9)", 1.5);
        g.top = save.t; g.bot = save.b;
      }

      // the 4,800 line
      dashed(ctx, h * 0.46, 0, w - 92, 'rgba(46,232,139,.45)', [6, 6]);
    }

    function setState(i) {
      state = i;
      if (reduced) { bandT = i === 1 ? 1 : 0; freqT = bandT; draw(); return; }
      animateTo(i === 1 ? 1 : 0);
    }

    var raf = 0;
    function animateTo(target) {
      cancelAnimationFrame(raf);
      var t0 = performance.now(), from = bandT, dur = 620;
      (function step(t) {
        var k = Math.min(1, (t - t0) / dur);
        var e = 1 - Math.pow(1 - k, 3);
        bandT = from + (target - from) * e;
        freqT = bandT;
        draw();
        if (k < 1) raf = requestAnimationFrame(step);
      })(t0);
    }

    // axis labels
    (function axis() {
      var host = $('.scrollsec__axis');
      if (!host) return;
      var out = [];
      for (var m = 21; m <= 32; m++) out.push('<span>07:' + m + '</span>');
      host.innerHTML = out.join('');
    })();

    draw();

    if (!reduced && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return;
        io.disconnect();
        var t0 = performance.now(), dur = 1500;
        (function step(t) {
          var k = Math.min(1, (t - t0) / dur);
          reveal = 1 - Math.pow(1 - k, 2.2);
          draw();
          if (k < 1) requestAnimationFrame(step);
        })(t0);
      }, { threshold: 0.05 });
      io.observe(cv);
    } else { reveal = 1; draw(); }

    return { draw: draw, setState: setState };
  })();

  if (SCROLLSEC) SCROLLSEC.sync();

  /* ------------------------------------------------------------------ *
   * News → chart connectors                                             *
   * ------------------------------------------------------------------ */
  function drawLinks() {
    var svg = $('.scrollsec__links');
    var main = $('.scrollsec__main');
    if (!svg || !main) return;
    var box = main.getBoundingClientRect();
    var lineY = box.height * 0.46;
    var parts = [];

    $$('.newscol').forEach(function (col, i) {
      var r = col.getBoundingClientRect();
      var x = Math.round(r.left - box.left + r.width * 0.62);
      var y0 = Math.round(r.bottom - box.top);
      if (y0 >= lineY - 12) return;
      var jog = [18, -26, 34, -14][i % 4];
      var x2 = x + jog;
      var mid = y0 + (lineY - y0) * 0.55;
      var rad = 8;
      var dir = jog > 0 ? 1 : -1;
      parts.push(
        '<path d="M' + x + ' ' + y0 +
        ' V' + (mid - rad) +
        ' Q' + x + ' ' + mid + ' ' + (x + rad * dir) + ' ' + mid +
        ' H' + (x2 - rad * dir) +
        ' Q' + x2 + ' ' + mid + ' ' + x2 + ' ' + (mid + rad) +
        ' V' + Math.round(lineY) + '"/>'
      );
      parts.push('<circle cx="' + x2 + '" cy="' + Math.round(lineY) + '" r="2.5" class="lk-dot"/>');
    });

    svg.innerHTML =
      '<g fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1">' + parts.join('') + '</g>' +
      '<style>.lk-dot{fill:rgba(46,232,139,.85);stroke:none}</style>';
  }

  /* ------------------------------------------------------------------ *
   * Keyboard                                                            *
   * ------------------------------------------------------------------ */
  (function keyboard() {
    var host = $('[data-keyboard]');
    if (!host) return;

    var ROWS = [
      [['esc', '', 'key--w15'], ['F1'], ['F2'], ['F3'], ['F4'], ['F5'], ['F6'], ['F7'], ['F8'], ['F9'], ['F10'], ['F11'], ['F12']],
      [['~', '`'], ['1', '!'], ['2', '@'], ['3', '#'], ['4', '$'], ['5', '%'], ['6', '^'], ['7', '&'], ['8', '*'], ['9', '('], ['0', ')'], ['—', '_'], ['+', '='], ['delete', '', 'key--w15']],
      [['tab', '', 'key--w15'], ['Q'], ['W'], ['E'], ['R'], ['T'], ['Y'], ['U'], ['I'], ['O'], ['P'], ['{', '['], ['}', ']'], ['|', '\\']],
      [['capslock', '•', 'key--w2'], ['A'], ['S'], ['D'], ['F'], ['G'], ['H'], ['J'], ['K'], ['L'], [':', ';'], ['"', '\''], ['return', '', 'key--w2']],
      [['shift', '', 'key--w25'], ['Z'], ['X'], ['C'], ['V'], ['B', '', '', true], ['N'], ['M'], ['<', ','], ['>', '.'], ['?', '/'], ['shift', '', 'key--w25']],
      [['fn'], ['control', '^'], ['option', '⌥'], ['command', '⌘', 'key--w15', true], ['', '', 'key--w7'], ['command', '⌘', 'key--w15'], ['option', '⌥']]
    ];

    var html = ROWS.map(function (row) {
      return '<div class="krow">' + row.map(function (k) {
        var cls = 'key' + (k[2] ? ' ' + k[2] : '') + (k[3] ? ' is-hot' : '');
        var sub = k[1] ? '<small>' + k[1] + '</small>' : '';
        return '<div class="' + cls + '">' + sub + '<span>' + (k[0] || '') + '</span></div>';
      }).join('') + '</div>';
    }).join('');

    host.innerHTML = html;

    if (reduced) return;
    var hot = $$('.key.is-hot', host);
    setInterval(function () {
      hot.forEach(function (k, i) {
        setTimeout(function () {
          k.classList.add('is-press');
          setTimeout(function () { k.classList.remove('is-press'); }, 150);
        }, i * 70);
      });
    }, 3200);
  })();

  /* ------------------------------------------------------------------ *
   * Feature rail — drag to scroll                                       *
   * ------------------------------------------------------------------ */
  (function dragScroll() {
    $$('[data-drag-scroll]').forEach(function (el) {
      var down = false, startX = 0, startL = 0, moved = 0;
      el.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch') return;
        down = true; moved = 0;
        startX = e.clientX; startL = el.scrollLeft;
        el.classList.add('is-dragging');
      });
      addEventListener('pointerup', function () {
        down = false; el.classList.remove('is-dragging');
      });
      el.addEventListener('pointermove', function (e) {
        if (!down) return;
        e.preventDefault();
        var dx = e.clientX - startX;
        moved = Math.max(moved, Math.abs(dx));
        el.scrollLeft = startL - dx;
      });
      el.addEventListener('click', function (e) {
        if (moved > 6) { e.preventDefault(); e.stopPropagation(); }
      }, true);
    });
  })();

  /* ------------------------------------------------------------------ *
   * FAQ accordion — animated height, one open at a time                 *
   *                                                                     *
   * Driven by the Web Animations API rather than a CSS transition: the
   * open and close of two different panels overlap, and only WAAPI gives
   * a cancel-safe hook to flip <details open> at exactly the right time.
   * ------------------------------------------------------------------ */
  (function accordion() {
    var all = $$(".acc");
    var running = new WeakMap();

    function animate(d, from, to, done) {
      var body = $(".acc__body", d);
      var prev = running.get(d);
      if (prev) prev.cancel();

      if (reduced || !body.animate) { if (done) done(); return; }

      var anim = body.animate(
        [{ height: from + "px" }, { height: to + "px" }],
        { duration: 320, easing: "cubic-bezier(.22,.61,.36,1)" }
      );
      running.set(d, anim);
      anim.onfinish = function () { running.delete(d); if (done) done(); };
      anim.oncancel = function () { running.delete(d); };
    }

    function openPanel(d) {
      if (d.open) return;
      var body = $(".acc__body", d);
      d.open = true;
      animate(d, 0, body.offsetHeight);
    }

    function closePanel(d) {
      if (!d.open) return;
      var body = $(".acc__body", d);
      animate(d, body.offsetHeight, 0, function () { d.open = false; });
    }

    all.forEach(function (d) {
      $("summary", d).addEventListener("click", function (e) {
        e.preventDefault();
        var wasOpen = d.open;
        all.forEach(function (o) { if (o !== d) closePanel(o); });
        if (wasOpen) closePanel(d); else openPanel(d);
      });
    });
  })();

  /* ------------------------------------------------------------------ *
   * Live waitlist count                                                 *
   *                                                                     *
   * Point `endpoint` at a public route that returns the signup total as
   * JSON and the headline tracks it, re-checking every `every` ms and
   * rolling the digits whenever the number moves. `field` is the key to
   * read out of the response — a dotted path is fine ("data.count").
   *
   * It is null on purpose: waitlist.gte.xyz exposes only per-user routes
   * (/api/signup, /api/me, /api/referral …) and nothing public that
   * returns a total, so there is nothing to point at yet. Until there is,
   * the headline shows `fallback`. The endpoint also has to send
   * Access-Control-Allow-Origin for whatever domain this site runs on,
   * or the browser will refuse the read. See the README.
   * ------------------------------------------------------------------ */
  var WAITLIST = {
    endpoint: null,          // e.g. "https://waitlist.gte.xyz/api/waitlist-count"
    field: 'count',
    every: 30000,
    fallback: 227024
  };

  var COUNT = (function () {
    var host = document.querySelector('[data-waitlist-count]');
    if (!host) return null;

    var shown = WAITLIST.fallback;   // what the headline currently reads
    var live = WAITLIST.fallback;    // what we last heard from the server
    var raf = 0;

    function fmt(n) {
      return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    // the scramble rebuilds the headline's markup, so re-query every time
    function paint() {
      var els = document.querySelectorAll('[data-waitlist-count]');
      for (var i = 0; i < els.length; i++) els[i].textContent = fmt(shown);
    }

    function rollTo(target) {
      if (target === shown) return;
      if (reduced) { shown = target; paint(); return; }
      cancelAnimationFrame(raf);
      var from = shown, t0 = performance.now(), dur = 900;
      (function step(t) {
        var k = Math.min(1, (t - t0) / dur);
        shown = from + (target - from) * (1 - Math.pow(1 - k, 3));
        paint();
        if (k < 1) raf = requestAnimationFrame(step);
        else { shown = target; paint(); }
      })(t0);
    }

    function dig(obj, path) {
      return path.split('.').reduce(function (o, k) {
        return (o == null) ? undefined : o[k];
      }, obj);
    }

    function poll() {
      if (!WAITLIST.endpoint) return;
      fetch(WAITLIST.endpoint, { headers: { accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (j) {
          var n = Number(dig(j, WAITLIST.field));
          if (!isFinite(n) || n <= 0) return;
          live = n;
          rollTo(n);
        })
        .catch(function () { /* keep whatever is on screen */ });
    }

    paint();
    if (WAITLIST.endpoint) {
      poll();
      setInterval(function () {
        if (!document.hidden) poll();
      }, WAITLIST.every);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) poll();
      });
    }

    // repaint once the headline finishes decoding, since that restores the
    // markup this module writes into
    var title = document.querySelector('.waitlist__title');
    if (title) title.addEventListener('scramble:end', paint);

    return { paint: paint, set: rollTo, value: function () { return live; } };
  })();

  /* ------------------------------------------------------------------ *
   * Waitlist forms                                                      *
   * ------------------------------------------------------------------ */
  (function forms() {
    var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    $$('[data-waitlist]').forEach(function (form) {
      var msg = form.parentNode.querySelector('.field__msg');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = $('input', form);
        var val = (input.value || '').trim();
        if (!msg) return;
        if (!EMAIL.test(val)) {
          msg.textContent = 'Enter a valid email address';
          msg.className = 'field__msg is-on is-err';
          input.focus();
          return;
        }
        msg.textContent = 'Code sent — check ' + val;
        msg.className = 'field__msg is-on';
        input.value = '';
      });
    });
  })();

  /* ------------------------------------------------------------------ *
   * Resize                                                              *
   * ------------------------------------------------------------------ */
  var rt = 0;
  function onResize() {
    clearTimeout(rt);
    rt = setTimeout(function () {
      CHARTS.forEach(function (c) { c.render(); });
      if (CHART) CHART.draw();
      if (SCROLLSEC) SCROLLSEC.sync();
      drawLinks();
    }, 120);
  }
  addEventListener('resize', onResize);
  addEventListener("load", function () {
    CHARTS.forEach(function (c) { c.render(); });
    if (CHART) CHART.draw();
    drawLinks();
  });
  drawLinks();
})();
