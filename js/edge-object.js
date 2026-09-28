/* =========================================================================
   GTE Edge — the object that follows you down the page.

   The form is a lamella: a cusped superellipse sheet combed into parallel
   ribs, each rib then spun about its own axis by an amount that falls off
   from the middle of the array outward. That spread is what reads as the
   spiral. Geometry, the rib sweep and the hand-built HDR environment are
   ported from the Lamella study (edgie.html, "sparkle") — every highlight
   on the metal is a light placed in paintEnv(), not a tint.

   It is not parented to any one section. It reads every [data-edge-anchor]
   in the document, weights them by how close each sits to the middle of the
   viewport, and eases toward that blend, so scrolling carries it from
   section to section. The pointer turns it.
   ========================================================================= */
(function () {
  'use strict';

  var canvas = document.getElementById('edge-gl');
  if (!canvas || typeof THREE === 'undefined') return;

  var anchors = Array.prototype.slice.call(document.querySelectorAll('[data-edge-anchor]'));
  if (!anchors.length) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TAU = Math.PI * 2, V3 = THREE.Vector3;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ------------------------------------------------------------------ *
   * Parameters — the "sparkle" lamella, wound into a spiral             *
   * ------------------------------------------------------------------ */
  var coarse = window.innerWidth < 860;

  var SPINE  = { width: 2.9, aspect: 1.08, cusp: 0.6, bulge: 0.7, ribspread: 1 };
  var LENGTH = { base: 1, vary: 0, freq: 3, taper: 0 };
  var ARRAY  = {
    count: coarse ? 40 : 58,
    gap: 0.24, thick: 0.13, wscale: 1,
    round: 5, cap: 1,
    sides: coarse ? 12 : 16,
    segs:  coarse ? 38 : 52
  };
  // Near the top of the range the centre rib winds a near-full turn and comes
  // back to looking flat, while the ribs between it and the edge pass through
  // every orientation on the way out. That is what bands the form.
  var TWIST  = { spin: 1.0 };
  var SWAY   = { amp: 0.045, freq: 1.2, skew: 1.8, speed: reduced ? 0 : 0.294, axis: "y" };
  var CHROME = {
    rough: 0.045, envint: 1.45, amber: 1.5, hue: 0.1, rot: 0.78,
    violet: 0.4, key: 1.3, sky: 0.08, fill: 1.5, contra: 0.8
  };

  /* ------------------------------------------------------------------ *
   * Morph targets                                                       *
   *                                                                     *
   * The three glyphs beside RESEARCH / MEMORY / RECURSIVE LEARNING are  *
   * nothing but vertical bars on a nine-column grid — which is what the *
   * lamella already is, a row of straight ribs. So scrolling that       *
   * section moves every rib onto a bar; no mesh is rebuilt.             *
   *                                                                     *
   * Raw coordinates out of assets/svg/viz-*.svg ([x, y, y] per bar, y   *
   * down), sorted by column and then by height so rib order is stable   *
   * from one glyph to the next.                                         *
   * ------------------------------------------------------------------ */
  var ICON_W = 138.141, ICON_STROKE = 8.67327;
  var ICONS = [
    // viz-research
    [
      [4.34,130.36,107.71],[20.90,123.67,98.10],[37.04,30.28,72.71],[37.04,86.94,115.61],
      [53.15,99.49,10.57],[69.29,26.11,2.33],[69.29,103.39,79.61],[85.42,21.79,0.00],
      [85.42,105.72,83.92],[101.55,26.52,2.71],[101.55,103.00,79.20],[117.68,94.23,11.49],
      [133.80,72.71,33.01]
    ],
    // viz-memory
    [
      [4.34,77.85,55.03],[20.47,99.06,33.82],[36.60,58.92,7.78],[36.60,111.66,72.38],
      [52.73,38.39,14.61],[52.73,118.27,94.49],[68.85,36.60,0.00],[68.85,120.32,98.80],
      [84.99,38.37,14.61],[84.99,118.27,94.50],[101.12,59.07,7.78],[101.12,111.66,72.38],
      [117.25,99.05,33.83],[133.38,77.81,55.06]
    ],
    // viz-learning
    [
      [4.34,65.17,61.42],[4.34,135.49,131.73],[20.47,65.17,45.29],[20.47,135.49,115.60],
      [36.59,65.17,29.18],[36.59,135.49,99.49],[52.72,65.17,13.05],[52.72,135.49,83.36],
      [68.85,65.17,0.00],[68.85,135.49,72.66],[84.99,65.17,12.70],[84.99,135.49,83.01],
      [101.12,65.17,28.83],[101.12,135.49,99.15],[117.24,65.17,44.95],[117.24,135.49,115.27],
      [133.37,65.17,61.09],[133.37,135.49,131.40]
    ]
  ];

  // A bar is wider than a rib, so several ribs share one and stand side by
  // side across its stroke. Returns [x, yTop, yBottom, halfWidth] per rib,
  // in world units, centred on the glyph.
  function iconTargets(bars, R, S) {
    var B = bars.length, out = new Array(R);
    var cx = (bars[0][0] + bars[B - 1][0]) * 0.5;
    var lo = Infinity, hi = -Infinity;
    for (var b = 0; b < B; b++) {
      lo = Math.min(lo, bars[b][1], bars[b][2]);
      hi = Math.max(hi, bars[b][1], bars[b][2]);
    }
    var cy = (lo + hi) * 0.5;
    for (var i = 0; i < B; i++) {
      var r0 = Math.floor(i * R / B), r1 = Math.floor((i + 1) * R / B);
      var n = Math.max(1, r1 - r0), bar = bars[i];
      var top = Math.min(bar[1], bar[2]), bot = Math.max(bar[1], bar[2]);
      for (var r = r0; r < r1; r++) {
        var f = (r - r0 + 0.5) / n - 0.5;
        out[r] = [
          (bar[0] - cx + f * ICON_STROKE) * S,
          (cy - top) * S,
          (cy - bot) * S,
          ICON_STROKE * S * 0.5 / n
        ];
      }
    }
    for (var k = 0; k < R; k++) if (!out[k]) out[k] = out[k - 1] || [0, 0, 0, 0.01];
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Spine — a superellipse |x/a|^n + |y/b|^n = 1, inverted in closed    *
   * form so each rib's height is solved for. n < 1 gives the cusps.     *
   * ------------------------------------------------------------------ */
  function spineAt(t) {
    var a = SPINE.width, b = a * SPINE.aspect, n = Math.max(0.05, SPINE.cusp);
    var d = 2 * t - 1;
    var tt = 0.5 + 0.5 * (d < 0 ? -Math.pow(-d, SPINE.ribspread) : Math.pow(d, SPINE.ribspread));
    var xn = Math.abs(2 * tt - 1);
    var k = 1 - Math.pow(xn, n);
    var h = k <= 0 ? 0 : b * Math.pow(k, 1 / n);
    var x = (tt - 0.5) * 2 * a, xa = x / a;
    // Bow the sheet toward the viewer as a smooth function of x, not of the
    // height: the cusped profile drops 20% within the first few percent of
    // the width, and following it would tilt every rib but the centre one
    // steeply away from camera and kill the reflection.
    return { t: tt, half: h, pos: new V3(x, h, SPINE.bulge * (1 - xa * xa)) };
  }

  function ribLength(s) {
    var w = 0.5 * Math.sin(TAU * (s.t * LENGTH.freq + 0.17)) +
            0.5 * Math.sin(TAU * (s.t * LENGTH.freq * 1.7 + 0.61));
    var L = LENGTH.base * (1 + LENGTH.vary * w) * (2 * s.half);
    L *= (1 - LENGTH.taper * Math.pow(Math.abs(2 * s.t - 1), 3));
    return Math.max(0.05, L);
  }

  // v-sampling clustered toward both tips so the rounded caps stay smooth
  function vRemap(t) { return lerp(t, 0.5 - 0.5 * Math.cos(Math.PI * t), 0.55); }

  // Every rib hangs straight down from the outline; the silhouette alone
  // decides how long each one is, so the walk is a plain straight march.
  function integrate(seed, segs) {
    var L = ribLength(seed);
    var pos = seed.pos.clone();
    var dir = new V3(0, -1, 0);
    var pts = new Array(segs), arc = new Array(segs);
    pts[0] = pos.clone(); arc[0] = 0;
    var travelled = 0;
    for (var j = 1; j < segs; j++) {
      var ds = (vRemap(j / (segs - 1)) - vRemap((j - 1) / (segs - 1))) * L;
      pos.addScaledVector(dir, ds);
      travelled += ds;
      pts[j] = pos.clone(); arc[j] = travelled;
    }
    return { pts: pts, arc: arc, len: travelled, seed: seed };
  }

  /* ------------------------------------------------------------------ *
   * Rib spin. Each rib turns about its own X-parallel centreline. The   *
   * angle is highest at the middle of the array and falls off outward:  *
   * at full spin the centre winds to 355 deg while the outermost ribs   *
   * hold at 90. That 265 deg spread across the array is the spiral.     *
   * ------------------------------------------------------------------ */
  var SPIN_CENTRE = 355 * Math.PI / 180;
  var SPIN_EDGE   =  90 * Math.PI / 180;

  function applySpin(paths) {
    var spin = clamp(TWIST.spin, 0, 1);
    if (spin <= 0) return paths;
    for (var i = 0; i < paths.length; i++) {
      var pts = paths[i].pts, n = pts.length;
      var r = Math.abs(2 * paths[i].seed.t - 1);          // 0 centre, 1 ends
      var shape = Math.cos(r * Math.PI * 0.5);
      var ang = spin * (SPIN_EDGE + (SPIN_CENTRE - SPIN_EDGE) * shape);

      var cs = Math.cos(ang), sn = Math.sin(ang);
      var piv = pts[n >> 1], py = piv.y, pz = piv.z;
      for (var k = 0; k < n; k++) {
        var q = pts[k];
        var dy = q.y - py, dz = q.z - pz;
        q.y = py + dy * cs - dz * sn;
        q.z = pz + dy * sn + dz * cs;
      }
    }
    return paths;
  }

  /* ------------------------------------------------------------------ *
   * Mesh — sweep a rounded superellipse cross-section along every rib   *
   * ------------------------------------------------------------------ */
  function buildGeometry(paths) {
    var K = Math.max(6, Math.round(ARRAY.sides / 2) * 2);
    var prof = new Float32Array(K * 2);
    for (var k = 0; k < K; k++) {
      var a = TAU * k / K, ca = Math.cos(a), sa = Math.sin(a), e = 2 / ARRAY.round;
      prof[k * 2]     = Math.sign(ca) * Math.pow(Math.abs(ca), e);
      prof[k * 2 + 1] = Math.sign(sa) * Math.pow(Math.abs(sa), e);
    }

    var ribs = [];
    for (var i = 0; i + 1 < paths.length; i++) ribs.push([paths[i], paths[i + 1]]);
    if (!ribs.length) return null;

    var V = ribs[0][0].pts.length;
    var total = ribs.length * V * K;
    var pos = new Float32Array(total * 3);
    var par = new Float32Array(total * 2);
    var axs = new Float32Array(total * 3);   // this rib's direction
    var mid = new Float32Array(total * 3);   // and its midpoint
    var wid4 = new Float32Array(total * 4);  // its width axis, plus its length
    var ribHw = new Float32Array(ribs.length);
    var idxCount = ribs.length * (V - 1) * K * 6;
    var idx = new (total > 65535 ? Uint32Array : Uint16Array)(idxCount);

    var tmpDv = new V3(), tmpDu = new V3(), nrm = new V3(), wid = new V3(), pt = new V3();
    var vo = 0, io = 0;

    for (var r = 0; r < ribs.length; r++) {
      var A = ribs[r][0], B = ribs[r][1];
      var uParam = A.seed.t;
      var midIdx = Math.floor(V / 2);

      // the rib is straight, so one direction and one pivot describe it
      var ribAxis = new V3().subVectors(A.pts[V - 1], A.pts[0]);
      if (ribAxis.lengthSq() < 1e-12) ribAxis.set(0, -1, 0);
      ribAxis.normalize();
      var ribMid = A.pts[midIdx];

      // Measure the gap to the next rib SIDEWAYS only. Two ribs of different
      // length — a spike beside the waist — end far apart without being any
      // wider, and the raw distance would inflate them into a solid wedge.
      var dvMid = new V3().subVectors(A.pts[Math.min(midIdx + 1, V - 1)], A.pts[Math.max(midIdx - 1, 0)]);
      if (dvMid.lengthSq() < 1e-12) dvMid.set(0, -1, 0);
      dvMid.normalize();
      var duMid = new V3().subVectors(B.pts[midIdx], A.pts[midIdx]);
      duMid.addScaledVector(dvMid, -duMid.dot(dvMid));

      var ht = ARRAY.thick * 0.5;
      var hw = Math.max(duMid.length() * (1 - ARRAY.gap) * 0.5 * ARRAY.wscale, 1e-4);
      hw = Math.min(hw, A.len * 0.28);
      var capR = Math.max(1e-5, hw * ARRAY.cap);
      // One frame per rib for the morph: the rib is straight and spun
      // rigidly, so the cross-section basis it was swept on is constant
      // along it and the mid-rib value stands for the whole thing.
      var duN = duMid.clone();
      if (duN.lengthSq() < 1e-12) duN.set(0, 0, 1).addScaledVector(ribAxis, -ribAxis.z);
      duN.normalize();
      var nrmMid = new V3().crossVectors(ribAxis, duN);
      if (nrmMid.lengthSq() < 1e-12) nrmMid.set(0, 0, 1).addScaledVector(ribAxis, -ribAxis.z);
      nrmMid.normalize();
      var ribWid = new V3().crossVectors(nrmMid, ribAxis).normalize();
      ribHw[r] = hw;

      var base = vo;

      for (var j = 0; j < V; j++) {
        if (j === 0) tmpDv.subVectors(A.pts[1], A.pts[0]);
        else if (j === V - 1) tmpDv.subVectors(A.pts[V - 1], A.pts[V - 2]);
        else tmpDv.subVectors(A.pts[j + 1], A.pts[j - 1]);
        if (tmpDv.lengthSq() < 1e-12) tmpDv.set(0, -1, 0);
        tmpDv.normalize();

        tmpDu.subVectors(B.pts[j], A.pts[j]);
        tmpDu.addScaledVector(tmpDv, -tmpDu.dot(tmpDv));
        var pitch = tmpDu.length();
        if (pitch < 1e-9) {
          tmpDu.set(0, 0, 1).addScaledVector(tmpDv, -tmpDv.z);
          if (tmpDu.lengthSq() < 1e-12) tmpDu.set(1, 0, 0).addScaledVector(tmpDv, -tmpDv.x);
          tmpDu.normalize();
        } else tmpDu.multiplyScalar(1 / pitch);

        nrm.crossVectors(tmpDv, tmpDu);
        if (nrm.lengthSq() < 1e-12) {
          nrm.set(0, 0, 1).addScaledVector(tmpDv, -tmpDv.z);
          if (nrm.lengthSq() < 1e-12) nrm.set(1, 0, 0).addScaledVector(tmpDv, -tmpDv.x);
        }
        nrm.normalize();
        wid.crossVectors(nrm, tmpDv).normalize();

        // rounded tips
        var d0 = A.arc[j], d1 = A.len - A.arc[j], sc = 1;
        if (d0 < capR) sc = Math.sqrt(Math.max(0, 1 - Math.pow((capR - d0) / capR, 2)));
        if (d1 < capR) sc = Math.min(sc, Math.sqrt(Math.max(0, 1 - Math.pow((capR - d1) / capR, 2))));

        var c = A.pts[j], vParam = V > 1 ? j / (V - 1) : 0;
        var aw = hw * sc, an = ht * sc;
        for (var kk = 0; kk < K; kk++) {
          pt.copy(c)
            .addScaledVector(wid, prof[kk * 2] * aw)
            .addScaledVector(nrm, prof[kk * 2 + 1] * an);
          var o = vo + j * K + kk;
          pos[o * 3] = pt.x; pos[o * 3 + 1] = pt.y; pos[o * 3 + 2] = pt.z;
          par[o * 2] = uParam; par[o * 2 + 1] = vParam;
          axs[o * 3] = ribAxis.x; axs[o * 3 + 1] = ribAxis.y; axs[o * 3 + 2] = ribAxis.z;
          mid[o * 3] = ribMid.x;  mid[o * 3 + 1] = ribMid.y;  mid[o * 3 + 2] = ribMid.z;
          wid4[o * 4] = ribWid.x; wid4[o * 4 + 1] = ribWid.y;
          wid4[o * 4 + 2] = ribWid.z; wid4[o * 4 + 3] = A.len;
        }
      }

      for (var jj = 0; jj + 1 < V; jj++) {
        var rowA = base + jj * K, rowB = base + (jj + 1) * K;
        for (var m = 0; m < K; m++) {
          var m2 = (m + 1) % K;
          idx[io++] = rowA + m;  idx[io++] = rowB + m;  idx[io++] = rowB + m2;
          idx[io++] = rowA + m;  idx[io++] = rowB + m2; idx[io++] = rowA + m2;
        }
      }
      vo += V * K;
    }

    // centre by hand: geometry.center() would move the positions and leave the
    // rib midpoints behind, and the shader pivots on those
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var q = 0; q < total; q++) {
      for (var c2 = 0; c2 < 3; c2++) {
        var val = pos[q * 3 + c2];
        if (val < lo[c2]) lo[c2] = val;
        if (val > hi[c2]) hi[c2] = val;
      }
    }
    var off = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    for (var q2 = 0; q2 < total; q2++) {
      for (var c3 = 0; c3 < 3; c3++) {
        pos[q2 * 3 + c3] -= off[c3];
        mid[q2 * 3 + c3] -= off[c3];
      }
    }

    // Morph targets, one set per glyph. The glyph is scaled to span the
    // width the lamella spans, so the form does not jump size as it changes.
    var S = (hi[0] - lo[0]) / ICON_W;
    var tgt = [];
    for (var ic = 0; ic < ICONS.length; ic++) {
      var T = iconTargets(ICONS[ic], ribs.length, S);
      var buf = new Float32Array(total * 4);
      for (var rr = 0, vv = 0; rr < ribs.length; rr++) {
        var t4 = T[rr], ws = t4[3] / Math.max(ribHw[rr], 1e-5);
        for (var q3 = 0; q3 < V * K; q3++, vv++) {
          buf[vv * 4] = t4[0]; buf[vv * 4 + 1] = t4[1];
          buf[vv * 4 + 2] = t4[2]; buf[vv * 4 + 3] = ws;
        }
      }
      tgt.push(buf);
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aParam", new THREE.BufferAttribute(par, 2));
    geo.setAttribute("aAxis", new THREE.BufferAttribute(axs, 3));
    geo.setAttribute("aMid", new THREE.BufferAttribute(mid, 3));
    geo.setAttribute("aWid", new THREE.BufferAttribute(wid4, 4));
    for (var ta = 0; ta < tgt.length; ta++) {
      geo.setAttribute("aTgt" + ta, new THREE.BufferAttribute(tgt[ta], 4));
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  /* ------------------------------------------------------------------ *
   * Chrome — a procedural HDR equirectangular environment.              *
   * Chrome only reads as chrome when most of the sphere is near-black,  *
   * so the fill is confined to one side of the sky and the ribs keep    *
   * their hard light/dark banding instead of going milky.               *
   * ------------------------------------------------------------------ */
  var ENV_W = 512, ENV_H = 256;

  function dirFrom(azTurns, elRad) {
    var az = azTurns * TAU, ce = Math.cos(elRad);
    return [Math.sin(az) * ce, Math.sin(elRad), Math.cos(az) * ce];
  }

  function paintEnv(p) {
    var data = new Float32Array(ENV_W * ENV_H * 4);
    var rot = p.rot;
    // amber chroma: green is held well down so the highlight rolls off
    // toward red instead of yellowing out
    var ag = 0.055 + 0.58 * p.hue, ab = 0.002 + 0.13 * p.hue;
    // Sources are round lobes {d,s} or vertical strip softboxes
    // {az,el,saz,sel} — tight across azimuth, tall in elevation. The strips
    // draw the long highlight bands running the length of every rib.
    var L = [
      { az: (0.22 + rot) * TAU, el: 0.50, saz: 300, sel: 2.0, c: [1, 0.99, 0.96], i: 14 * p.key },
      { d: dirFrom(0.30 + rot, 0.46), s: 90, c: [1, 0.97, 0.92], i: 0.42 * p.key },
      { az: (0.94 + rot) * TAU, el: 0.02, saz: 100, sel: 1.5, c: [1, ag, ab], i: 7.0 * p.amber },
      { d: dirFrom(0.97 + rot, 0.06), s: 4, c: [1, ag * 0.60, ab * 0.60], i: 3.0 * p.amber },
      { d: dirFrom(0.06 + rot, -0.30), s: 9, c: [1, ag * 0.48, ab * 0.48], i: 1.7 * p.amber },
      { az: (0.64 + rot) * TAU, el: 0.72, saz: 130, sel: 4.5, c: [0.60, 0.29, 0.96], i: 2.4 * p.violet },
      { d: dirFrom(0.71 + rot, 0.18), s: 26, c: [0.40, 0.19, 0.70], i: 0.35 * p.violet },
      // broad fill on the amber axis — keeps the rounded rib shoulders from
      // falling straight off into black
      { d: dirFrom(0.97 + rot, 0), s: 5, c: [1, ag * 1.25, ab * 1.9], i: 3.2 * p.fill }
    ];
    var occ = dirFrom(0.72 + rot, 0.05);
    var brightAz = (0.20 + rot) * TAU;
    var i4 = 0;

    for (var y = 0; y < ENV_H; y++) {
      var el = (0.5 - (y + 0.5) / ENV_H) * Math.PI;
      var se = Math.sin(el), ce = Math.cos(el);
      for (var x = 0; x < ENV_W; x++) {
        var az = ((x + 0.5) / ENV_W) * TAU;
        var dx = Math.sin(az) * ce, dy = se, dz = Math.cos(az) * ce;

        var side = Math.pow(Math.max(0, 0.5 + 0.5 * Math.cos(az - brightAz)), 2.2);
        var sky = Math.pow(Math.max(0, se), 0.55) * p.sky * side;
        var r = 0.007 + sky * 0.90, g = 0.0063 + sky * 0.80, b = 0.0057 + sky * 0.66;

        var fk = 1 - 0.97 * Math.pow(Math.max(0, -se), 0.7);
        r *= fk; g *= fk; b *= fk;

        for (var n = 0; n < L.length; n++) {
          var Ln = L[n], w;
          if (Ln.saz !== undefined) {
            var caz = Math.cos(az - Ln.az), cel = Math.cos(el - Ln.el);
            if (caz <= 0 || cel <= 0) continue;
            w = Math.pow(caz, Ln.saz) * Math.pow(cel, Ln.sel) * Ln.i;
          } else {
            var d = dx * Ln.d[0] + dy * Ln.d[1] + dz * Ln.d[2];
            if (d <= 0) continue;
            w = Math.pow(d, Ln.s) * Ln.i;
          }
          if (w < 1e-4) continue;
          r += Ln.c[0] * w; g += Ln.c[1] * w; b += Ln.c[2] * w;
        }

        var od = dx * occ[0] + dy * occ[1] + dz * occ[2];
        if (od > 0) {
          var ok = 1 - p.contra * Math.pow(od, 1.2);
          r *= ok; g *= ok; b *= ok;
        }

        data[i4] = r; data[i4 + 1] = g; data[i4 + 2] = b; data[i4 + 3] = 1;
        i4 += 4;
      }
    }

    var tex = new THREE.DataTexture(data, ENV_W, ENV_H, THREE.RGBAFormat, THREE.FloatType);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  /* ------------------------------------------------------------------ *
   * Renderer                                                            *
   * ------------------------------------------------------------------ */
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas, alpha: true, antialias: true, powerPreference: 'high-performance'
    });
  } catch (err) { return; }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearAlpha(0);
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.CineonToneMapping;
  renderer.toneMappingExposure = 1.02;

  var scene = new THREE.Scene();
  var FOV = 30, DIST = 9;
  var camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.position.set(0, 0, DIST);

  var pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  var envSrc = paintEnv(CHROME);
  scene.environment = pmrem.fromEquirectangular(envSrc).texture;
  envSrc.dispose();
  pmrem.dispose();

  var uTime = { value: 0 };
  var uSway = { value: new THREE.Vector4(SWAY.amp, SWAY.freq, SWAY.skew, SWAY.speed) };
  var uSwayAxis = { value: new THREE.Vector3(0, 1, 0) };
  // x = how far a rib stretches, y = cycles of the wave across the array,
  // z = speed. The wave travels, so the ribs breathe in sequence.
  var uBreath = { value: new THREE.Vector3(reduced ? 0 : 0.105, 1.6, 0.595) };
  // xyz = how much of each glyph is showing, w = how far the change has run
  var uMorph = { value: new THREE.Vector4(1, 0, 0, 0) };

  var material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 1, roughness: CHROME.rough, envMapIntensity: CHROME.envint
  });
  // The sway is a travelling wave rolled through the ribs on the GPU, so it
  // animates without rebuilding any geometry. The glyph morph rides on the
  // same trip: every rib is straight, so laying one down as a bar of the
  // icon is a rigid move plus a stretch along its own axis.
  material.onBeforeCompile = function (shader) {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uSway = uSway;
    shader.uniforms.uSwayAxis = uSwayAxis;
    shader.uniforms.uBreath = uBreath;
    shader.uniforms.uMorph = uMorph;
    shader.vertexShader =
      'attribute vec2 aParam;\nattribute vec3 aAxis;\nattribute vec3 aMid;\n' +
      'attribute vec4 aWid;\nattribute vec4 aTgt0;\nattribute vec4 aTgt1;\nattribute vec4 aTgt2;\n' +
      'uniform float uTime;\nuniform vec4 uSway;\nuniform vec3 uSwayAxis;\nuniform vec3 uBreath;\n' +
      'uniform vec4 uMorph;\n' +
      'mat3 axisRot(vec3 a, float ang){ float s=sin(ang), c=cos(ang), t=1.0-c;\n' +
      ' return mat3(t*a.x*a.x+c, t*a.x*a.y+s*a.z, t*a.x*a.z-s*a.y,\n' +
      '             t*a.x*a.y-s*a.z, t*a.y*a.y+c, t*a.y*a.z+s*a.x,\n' +
      '             t*a.x*a.z+s*a.y, t*a.y*a.z-s*a.x, t*a.z*a.z+c); }\n' +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      'float swA = uSway.x * sin(6.2831853*(aParam.y*uSway.y + aParam.x*uSway.z) - uTime*uSway.w)\n' +
      '          * smoothstep(0.0, 0.22, aParam.y);\n' +
      'mat3 swR = axisRot(normalize(uSwayAxis), swA);\n' +
      // each rib stretches along its own axis, pivoting on its own midpoint
      'float brK = 1.0 + uBreath.x * sin(6.2831853*aParam.x*uBreath.y - uTime*uBreath.z);\n' +
      'vec3 brV = position + aAxis * (dot(position - aMid, aAxis) * (brK - 1.0));\n' +
      // where this rib lands in the glyph: same cross-section, re-hung as a
      // vertical bar, x across the page and the sheet's normal into the screen
      'vec4 mTg = (aTgt0*uMorph.x + aTgt1*uMorph.y + aTgt2*uMorph.z)\n' +
      '         / max(uMorph.x + uMorph.y + uMorph.z, 1e-4);\n' +
      'vec3 mW = aWid.xyz;\n' +
      'vec3 mN = cross(aAxis, mW);\n' +
      'vec3 mRel = position - aMid;\n' +
      'vec3 mOff = mRel - aAxis * dot(mRel, aAxis);\n' +
      'float mRt = mix(aParam.y, 0.5 - 0.5*cos(3.1415927*aParam.y), 0.55);\n' +
      'vec3 mPos = vec3(mTg.x + dot(mOff, mW) * mTg.w, mix(mTg.y, mTg.z, mRt), dot(mOff, mN));\n' +
      // normals follow the inverse of the same scaling, or the chrome lies
      'float mSw = max(abs(mTg.y - mTg.z), 1e-4) / max(aWid.w, 1e-4);\n' +
      'float mSg = mTg.z > mTg.y ? 1.0 : -1.0;\n' +
      'vec3 mNrm = normalize(vec3(dot(normal, mW) / max(mTg.w, 1e-4),\n' +
      '                           dot(normal, aAxis) * mSg / mSw,\n' +
      '                           dot(normal, mN)));\n' +
      'vec3 nSrc = swR * vec3(normal);\n' +
      'vec3 nMix = mix(nSrc, mNrm, uMorph.w);\n' +
      'vec3 objectNormal = length(nMix) > 1e-4 ? normalize(nMix) : nSrc;'
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      'vec3 transformed = mix(swR * brV, mPos, uMorph.w);'
    );
  };

  /* ---- build once ---- */
  var paths = [];
  for (var i = 0; i <= ARRAY.count; i++) paths.push(integrate(spineAt(i / ARRAY.count), ARRAY.segs));
  applySpin(paths);

  var geometry = buildGeometry(paths);
  if (!geometry) return;

  var mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  var group = new THREE.Group();
  group.add(mesh);
  scene.add(group);

  // Fit on the silhouette the camera actually sees, not the bounding sphere:
  // the sheet is thin in Z and the sphere would leave it undersized.
  geometry.computeBoundingBox();
  var bb = geometry.boundingBox;
  var FIT = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y) * 0.5;

  /* ------------------------------------------------------------------ *
   * Screen space -> world space                                         *
   * ------------------------------------------------------------------ */
  var viewH = 2 * DIST * Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  var tmp = new V3();

  function toWorld(px, py, out) {
    var vw = window.innerWidth, vh = window.innerHeight;
    out.x = (px / vw - 0.5) * viewH * (vw / vh);
    out.y = (0.5 - py / vh) * viewH;
    return out;
  }
  function unitsPerPx() { return viewH / window.innerHeight; }

  /* ------------------------------------------------------------------ *
   * State                                                               *
   * ------------------------------------------------------------------ */
  var target = new V3(), current = new V3(0, 0, 0);
  var targetScale = 1, currentScale = 1;
  var targetOpacity = 0, currentOpacity = 0;

  var scrollY = window.pageYOffset, scrollV = 0;
  var drift = 0;

  // Morph drive. Which glyph shows follows the three rows of that section:
  // each pulls its own icon by how near it sits to the reading line. How far
  // the change has run follows the section's own anchor, so the form is fully
  // itself everywhere else on the page.
  var morphRows = Array.prototype.slice.call(document.querySelectorAll('[data-edge-morph]'));
  var mixw = [1, 0, 0], mAmt = 0, edgeW = 0;

  function morphSample(dt) {
    var want = [0, 0, 0], sum = 0, lim = Math.min(3, morphRows.length);
    var vh = window.innerHeight, line = vh * 0.46;
    for (var i = 0; i < lim; i++) {
      var r = morphRows[i].getBoundingClientRect();
      if (!r.height) continue;
      var d = (r.top + r.height / 2 - line) / vh;
      want[i] = Math.exp(-(d * d) / 0.028);   // tight enough that each glyph gets a clean moment
      sum += want[i];
    }
    if (sum < 1e-4) { want[0] = 1; sum = 1; }   // nothing near: hold the first
    var k = reduced ? 1 : 1 - Math.pow(0.004, dt);
    for (var j = 0; j < 3; j++) mixw[j] += (want[j] / sum - mixw[j]) * k;

    var aim = clamp((edgeW - 0.12) / 0.5, 0, 1);
    mAmt += (aim - mAmt) * (reduced ? 1 : 1 - Math.pow(0.006, dt));
    uMorph.value.set(mixw[0], mixw[1], mixw[2], mAmt);
  }

  // Pointer. tx/ty are where the cursor is; x/y chase it, so the object
  // swings round and settles rather than snapping.
  var ptr = { x: 0, y: 0, tx: 0, ty: 0, active: 0 };

  addEventListener('pointermove', function (e) {
    ptr.tx = clamp((e.clientX / window.innerWidth - 0.5) * 2, -1, 1);
    ptr.ty = clamp((e.clientY / window.innerHeight - 0.5) * 2, -1, 1);
    ptr.active = 1;
  }, { passive: true });

  addEventListener('pointerleave', function () { ptr.active = 0; ptr.tx = 0; ptr.ty = 0; });

  function sample() {
    var vh = window.innerHeight, mid = vh * 0.5;
    var wSum = 0, x = 0, y = 0, s = 0, vis = 0;
    edgeW = 0;

    for (var i = 0; i < anchors.length; i++) {
      var el = anchors[i];
      if (!el.offsetParent && getComputedStyle(el).display === 'none') continue;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;

      var cy = r.top + r.height / 2;
      var dist = Math.abs(cy - mid) / vh;
      var w = Math.exp(-(dist * dist) / 0.26);
      if (w < 0.004) continue;
      if (w > edgeW && el.getAttribute('data-edge-anchor') === 'edge') edgeW = w;

      wSum += w;
      x += (r.left + r.width / 2) * w;
      y += cy * w;
      s += Math.min(r.width, r.height) * (parseFloat(el.getAttribute('data-edge-scale')) || 1) * w;
      vis = Math.max(vis, w);
    }

    if (wSum < 0.008) { targetOpacity = 0; return; }

    x /= wSum; y /= wSum; s /= wSum;
    toWorld(x, y, tmp);
    target.set(tmp.x, tmp.y, 0);

    // the anchor's short edge sets the on-screen size of the form
    targetScale = (s * unitsPerPx()) / (FIT * 2.25);
    targetOpacity = Math.min(1, vis * 1.35);
  }

  /* ------------------------------------------------------------------ *
   * Frame loop                                                          *
   * ------------------------------------------------------------------ */
  var lastT = performance.now();
  var cleared = false;

  function frame(now) {
    requestAnimationFrame(frame);

    var dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    var y = window.pageYOffset;
    scrollV += ((y - scrollY) - scrollV) * 0.18;
    scrollY = y;

    sample();
    morphSample(dt);

    // the lag is what makes it feel like the object trails the page
    var k = reduced ? 1 : 1 - Math.pow(0.0016, dt);
    current.lerp(target, k);
    currentScale += (targetScale - currentScale) * k;
    currentOpacity += (targetOpacity - currentOpacity) * (reduced ? 1 : 1 - Math.pow(0.02, dt));

    // pointer chase — slower than the position so the turn reads as weight
    var pk = reduced ? 1 : 1 - Math.pow(0.012, dt);
    ptr.x += (ptr.tx - ptr.x) * pk;
    ptr.y += (ptr.ty - ptr.y) * pk;

    canvas.style.opacity = currentOpacity.toFixed(3);

    if (currentOpacity <= 0.004) {
      if (!cleared) { renderer.clear(); cleared = true; }
      return;
    }
    cleared = false;

    group.position.copy(current);
    group.position.x += ptr.x * 0.30;
    group.position.y += -ptr.y * 0.18;
    group.scale.setScalar(Math.max(0.0001, currentScale));

    // A full turn, roughly every 24s. The standing tilt on X matters: without
    // it the sheet would present a pure edge twice a revolution and vanish —
    // tilted, the edge-on moment reads as the fan folding rather than a line.
    // While it is reading as a glyph the turn has to stop, or the sheet
    // would swing edge-on to the camera and the icon would disappear.
    drift += (0.182 + scrollV * 0.0028) * dt * (1 - mAmt);
    group.rotation.y = lerp(drift + ptr.x * 0.90, ptr.x * 0.24, mAmt);
    group.rotation.x = lerp(-0.30 + ptr.y * 0.42 + Math.sin(drift * 0.53) * 0.10,
                            -0.05 + ptr.y * 0.16, mAmt);
    group.rotation.z = lerp(Math.sin(drift * 0.37) * 0.09 - ptr.x * 0.12, 0, mAmt);

    uTime.value += dt;
    renderer.render(scene, camera);
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
  }
  addEventListener('resize', resize);
  resize();

  document.addEventListener('visibilitychange', function () { lastT = performance.now(); });

  canvas.classList.add('is-ready');
  requestAnimationFrame(frame);
})();
