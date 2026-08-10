/* AI4HM — 3D node-network sphere (evenly distributed).
   Nodes are placed on a Fibonacci sphere for an even, geodesic-style mesh,
   linked to their nearest neighbours, with continuous slow rotation + smooth
   mouse-parallax tilt. Pure canvas, no deps. The AI4HM wordmark sits static
   and larger in front (DOM), so the globe reads as a smaller mark behind it. */
(function () {
  var canvas = document.querySelector('canvas.node-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* seeded RNG for stable, subtle size variation (mulberry32) */
  function makeRng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = makeRng(20260612);

  /* --- evenly distributed nodes (Fibonacci sphere) --- */
  var N = 50;
  var GOLDEN = Math.PI * (3 - Math.sqrt(5));   // ~2.39996
  var nodes = [];
  for (var i = 0; i < N; i++) {
    var y = 1 - (i / (N - 1)) * 2;             // 1 .. -1, even bands
    var r = Math.sqrt(Math.max(0, 1 - y * y));
    var th = i * GOLDEN;
    var x = Math.cos(th) * r;
    var z = Math.sin(th) * r;
    /* mostly uniform, a few gently larger hubs */
    var size = 3.6 + rand() * 1.1 + (i % 6 === 0 ? 2.6 : 0);
    nodes.push({ x: x, y: y, z: z, size: size });
  }

  /* --- edges: link each node to its 3 nearest neighbours (even triangulated net) --- */
  var edges = [], seen = {};
  function addEdge(a, b) {
    var key = a < b ? a + '_' + b : b + '_' + a;
    if (seen[key]) return; seen[key] = 1; edges.push([a, b]);
  }
  for (var a = 0; a < N; a++) {
    var d = [];
    for (var b = 0; b < N; b++) {
      if (b === a) continue;
      var dx = nodes[a].x - nodes[b].x, dy = nodes[a].y - nodes[b].y, dz = nodes[a].z - nodes[b].z;
      d.push([dx * dx + dy * dy + dz * dz, b]);
    }
    d.sort(function (p, q) { return p[0] - q[0]; });
    for (var m = 0; m < 3; m++) addEdge(a, d[m][1]);
  }

  /* --- sizing --- */
  /* RFAC = node-cloud silhouette radius as a fraction of the canvas size.
     Used both to draw the sphere AND to size the globe so its bottom node
     lands on the middle of the primary CTA pill (responsive, any width). */
  var RFAC = 0.37;
  /* node-cloud diameter as a fraction of the banner height. Below 1 the sphere
     sits inset from the top and bottom edges instead of spanning them, so it
     reads as a backdrop to the wordmark rather than as the banner itself. */
  var SPAN = 0.84;
  /* ...but never wider than this fraction of the banner. Narrow screens stack
     the banner content, making it tall; without the cap the sphere would grow
     with that height and swamp the text it sits behind. */
  var WSPAN = 0.62;
  var w, h, cx, cy, R, dpr;
  var globeEl = canvas.closest ? canvas.closest('.globe3d') : canvas.parentElement;

  function sizeGlobe() {
    if (!globeEl) return;
    var hero = document.querySelector('.hero');
    var word = document.querySelector('.mark-word');
    if (!hero || !word) return;
    var hr = hero.getBoundingClientRect(), wr = word.getBoundingClientRect();
    /* node-cloud diameter (2*RFAC*size) is SPAN x the hero height, capped to
       WSPAN x its width */
    var cloud = Math.min(hr.height * SPAN, hr.width * WSPAN);
    var size = Math.round(cloud / (2 * RFAC));
    globeEl.style.width = size + 'px';
    globeEl.style.height = size + 'px';
    globeEl.style.top = '50%';                                  // vertical centre of the hero
    globeEl.style.left = Math.round(wr.left + wr.width / 2 - hr.left) + 'px'; // centred on the wordmark
  }

  function resize() {
    sizeGlobe();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    w = rect.width; h = rect.height;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = w / 2; cy = h / 2;
    R = Math.min(w, h) * RFAC;
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('load', resize);
  requestAnimationFrame(resize);
  setTimeout(resize, 400);

  /* --- mouse parallax (smoothed) --- */
  var tmx = 0, tmy = 0, mx = 0, my = 0;
  if (!reduce) {
    window.addEventListener('mousemove', function (e) {
      tmx = (e.clientX / window.innerWidth - 0.5) * 2;
      tmy = (e.clientY / window.innerHeight - 0.5) * 2;
    });
    window.addEventListener('mouseleave', function () { tmx = 0; tmy = 0; });
  }

  var glow = document.querySelector('.globe3d .core');
  var auto = 0;
  var FOCAL = 4.2;

  function draw() {
    if (!w || !h) { resize(); if (!w || !h) return; }
    mx += (tmx - mx) * 0.06;
    my += (tmy - my) * 0.06;
    if (!reduce) auto += 0.0019;

    var ay = auto + mx * 0.55;          // yaw: auto-spin + mouse
    var ax = -my * 0.30;                // pitch from mouse (poles stay at top/bottom at rest)
    var cY = Math.cos(ay), sY = Math.sin(ay), cX = Math.cos(ax), sX = Math.sin(ax);

    ctx.clearRect(0, 0, w, h);

    var P = new Array(N);
    for (var i = 0; i < N; i++) {
      var n = nodes[i];
      var x1 = n.x * cY - n.z * sY;
      var z1 = n.x * sY + n.z * cY;
      var y1 = n.y;
      var y2 = y1 * cX - z1 * sX;
      var z2 = y1 * sX + z1 * cX;
      var persp = FOCAL / (FOCAL + z2);
      P[i] = { sx: cx + x1 * persp * R, sy: cy + y2 * persp * R, z: z2, persp: persp, size: n.size };
    }

    /* edges first */
    for (var e = 0; e < edges.length; e++) {
      var A = P[edges[e][0]], B = P[edges[e][1]];
      var depth = ((A.z + B.z) * 0.5 + 1) * 0.5;       // 0 far .. 1 near
      ctx.strokeStyle = 'rgba(214,228,250,' + (0.08 + depth * 0.36).toFixed(3) + ')';
      ctx.lineWidth = 1.4 + depth * 1.6;
      ctx.beginPath(); ctx.moveTo(A.sx, A.sy); ctx.lineTo(B.sx, B.sy); ctx.stroke();
    }

    /* nodes back-to-front */
    var order = P.map(function (_, i) { return i; }).sort(function (p, q) { return P[p].z - P[q].z; });
    for (var o = 0; o < order.length; o++) {
      var p = P[order[o]];
      var depth2 = (p.z + 1) * 0.5;
      var alpha = 0.34 + depth2 * 0.66;
      var rad = Math.max(0.5, p.size * p.persp);
      if (depth2 > 0.6 && rad > 2.4) {                 // soft halo on bright front hubs
        ctx.beginPath(); ctx.arc(p.sx, p.sy, rad * 2.4, 0, 6.2832);
        ctx.fillStyle = 'rgba(150,180,235,' + (0.05 * depth2).toFixed(3) + ')';
        ctx.fill();
      }
      ctx.beginPath(); ctx.arc(p.sx, p.sy, rad, 0, 6.2832);
      ctx.fillStyle = 'rgba(255,255,255,' + alpha.toFixed(3) + ')';
      ctx.fill();
    }

    /* gentle counter-parallax on the core glow for depth */
    if (glow) glow.style.transform = 'translate(-50%,-50%) translate(' + (-mx * 12).toFixed(1) + 'px,' + (-my * 12).toFixed(1) + 'px)';
  }

  var raf = 0;
  function loop() { draw(); raf = requestAnimationFrame(loop); }

  if (reduce) {
    draw();                                            // single static frame
  } else {
    raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { cancelAnimationFrame(raf); }
      else { raf = requestAnimationFrame(loop); }
    });
  }
})();
