/* =========================================================================
   GTE Edge — the waitlist render, undulating.

   The artwork is a field of vertical ribs cresting into a wave, so the
   motion is a displacement of the image itself rather than a transform of
   the whole picture: sampling coordinates are pushed sideways by a wave
   that runs down the image, and up and down by a slower one that runs
   across it. The ribs bend; the frame never moves.

   It renders only while the section is on screen, and leaves the still
   <img> underneath as the fallback for no-WebGL or reduced motion.
   ========================================================================= */
(function () {
  'use strict';

  var host = document.querySelector('[data-wave]');
  if (!host || typeof THREE === 'undefined') return;

  var img = host.querySelector('img');
  var canvas = host.querySelector('canvas');
  if (!img || !canvas) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  function start() {
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas, antialias: false, alpha: false,
        powerPreference: 'low-power'
      });
    } catch (err) { return; }

    // Straight passthrough: no tone mapping and no colour conversion, so the
    // pixels come out exactly as the still does.
    if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    var SIZE = 2048;   // texture edge; more than the art is ever displayed at

    function ratio() {
      var w = host.clientWidth || 1;
      return Math.min(window.devicePixelRatio || 1, SIZE / w, 2);
    }
    renderer.setPixelRatio(ratio());

    // Copy into an offscreen canvas rather than handing the <img> straight to
    // the GPU: uploading the element produced GL_INVALID_VALUE and a blank
    // texture, and it also stops depending on the <img> staying live.
    var src = document.createElement("canvas");
    src.width = SIZE; src.height = SIZE;
    src.getContext("2d").drawImage(img, 0, 0, SIZE, SIZE);

    var tex = new THREE.CanvasTexture(src);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;

    var uniforms = {
      uTex:  { value: tex },
      uTime: { value: 0 },
      // x = sideways push, y = vertical push. Both in UV, both tiny — the
      // ribs are high-contrast, so a few pixels is already legible motion.
      uAmp:  { value: new THREE.Vector2(0.0038, 0.0024) }
    };

    var material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader:
        'varying vec2 vUv;\n' +
        'void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader:
        'precision highp float;\n' +
        'uniform sampler2D uTex;\n' +
        'uniform float uTime;\n' +
        'uniform vec2 uAmp;\n' +
        'varying vec2 vUv;\n' +
        'void main(){\n' +
        '  vec2 uv = vUv;\n' +
        // two lengths per axis, deliberately not harmonics of each other, so
        // the pattern takes a long time to repeat and never reads as a loop
        '  float sway = sin(uv.y * 5.1 + uTime * 0.78)\n' +
        '             + 0.45 * sin(uv.y * 11.3 - uTime * 0.47);\n' +
        '  float roll = sin(uv.x * 3.4 - uTime * 0.56)\n' +
        '             + 0.40 * sin(uv.x * 7.9 + uTime * 0.35);\n' +
        // ease the displacement off at the edges or the clamp smears there
        '  vec2 edge = smoothstep(0.0, 0.10, uv) * smoothstep(0.0, 0.10, 1.0 - uv);\n' +
        '  uv.x += sway * uAmp.x * edge.x;\n' +
        '  uv.y += roll * uAmp.y * edge.y;\n' +
        '  gl_FragColor = texture2D(uTex, uv);\n' +
        '}'
    });

    var scene = new THREE.Scene();
    var camera = new THREE.Camera();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

    function resize() {
      var w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(ratio());
      renderer.setSize(w, h, false);
    }
    resize();
    addEventListener('resize', resize);

    var visible = true, last = performance.now(), shown = false;

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) {
        visible = e[0].isIntersecting;
        if (visible) last = performance.now();
      }, { rootMargin: '200px' }).observe(host);
    }

    (function frame(now) {
      requestAnimationFrame(frame);
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;

      uniforms.uTime.value += dt;
      renderer.render(scene, camera);
      if (!shown) { shown = true; host.classList.add('is-live'); }
    })(last);
  }

  // decode first: uploading a half-decoded <img> is what produced
  // GL_INVALID_VALUE on texSubImage2D
  function ready() {
    if (img.decode) img.decode().then(start, start);
    else start();
  }
  if (img.complete && img.naturalWidth) ready();
  else img.addEventListener("load", ready, { once: true });
})();
