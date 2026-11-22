// Citable Studio: page behaviour and the particle stage.
// Every word of content is plain HTML; the stage is decoration that carries data
// where it can (the engine graph, the six areas, the score). No libraries.

const CONFIG = { email: 'hello@citablestudio.com' }; // where snapshot requests go

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motion.matches;

const BANDS = [[45, 'Hard to cite'], [65, 'Becoming readable'], [80, 'Citable'], [101, 'Easy to cite']];
const ENGINE_NAMES = ['ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'AI Overviews'];
const AREAS = [['Citability', 25], ['Brand', 20], ['Content', 20], ['Technical', 15], ['Schema', 10], ['Platform', 10]];

// What the page asks of the stage. Replaced by the real thing once WebGL is up.
const stage = { setShape() {}, selectEngine() {}, selectArea() {}, selectStep() {}, setFill() {}, poke() {} };

/* ------------------------------------------------------------------ */
/* The stage                                                           */
/* ------------------------------------------------------------------ */

const VERT = `
attribute vec3 aPos; attribute float aSeed; attribute float aData;
uniform mat3 uRot; uniform vec3 uOffset; uniform float uObj, uTime, uSize, uPx, uMode, uSel, uFill, uPush, uWobble, uF, uAspect, uScroll, uDpr;
uniform vec3 uPointer;
varying float vHi; varying float vDepth; varying float vSeed; varying float vStar;
void main() {
  vec3 p = aPos;
  vStar = 0.0;
  if (aData > 8.5) {
    vStar = 0.35 + 0.65 * abs(sin(uTime * (0.3 + aSeed) + aSeed * 30.0));
    float y = fract(p.y * 0.5 + 0.5 + uScroll * (0.02 + aSeed * 0.05)) * 2.0 - 1.0;
    vHi = 0.0; vSeed = aSeed; vDepth = 7.0;
    gl_PointSize = (0.9 + aSeed * 1.5) * uDpr;
    gl_Position = vec4(p.x, y, 0.0, 1.0);
    return;
  }
  float t = uTime * 0.6 + aSeed * 40.0;
  p += uWobble * 0.028 * vec3(sin(t + p.y * 2.0), cos(t * 1.1 + p.z * 2.0), sin(t * 0.9 + p.x * 2.0));
  vec3 d = p - uPointer;
  p += normalize(d + vec3(0.0001)) * uPush * smoothstep(1.2, 0.0, length(d)) * 0.5;
  float hi = 0.0;
  if (uMode > 0.5 && uMode < 1.5) { if (uSel > -0.5 && aData > 0.5) hi = abs(aData - uSel) < 0.4 ? 1.0 : -1.0; }
  else if (uMode > 1.5) { hi = aData <= uFill ? 1.0 : (aData > 1.5 ? 0.0 : -1.0); }
  vHi = hi; vSeed = aSeed;
  vec3 w = uRot * (p * uObj) + uOffset;
  float depth = 9.0 - w.z;
  vDepth = depth;
  gl_PointSize = max(1.0, uSize * uObj * (0.55 + aSeed * 0.9) * (1.0 + 0.45 * max(hi, 0.0)) * uPx / depth);
  gl_Position = vec4(w.x * uF / uAspect, w.y * uF, 0.0, depth);
}`;
const FRAG = `
precision mediump float;
uniform float uAlpha, uTint, uStars;
varying float vHi; varying float vDepth; varying float vSeed; varying float vStar;
void main() {
  if (vStar > 0.0) { float q = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vec3(0.949, 0.925, 0.875) * q * vStar * uStars, 1.0); return; }
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, r);
  vec3 base = vec3(0.949, 0.925, 0.875), signal = vec3(0.847, 1.0, 0.243);
  vec3 col = mix(base, signal, uTint);
  float al = uAlpha;
  if (vHi > 0.5) { col = signal; al *= 1.25; } else if (vHi < -0.5) { al *= 0.3; }
  gl_FragColor = vec4(col * a * al * mix(0.35, 1.0, smoothstep(13.5, 6.5, vDepth)), 1.0);
}`;

//            spin   yaw    tilt  alpha mode tint  half-size (w, h) used to fit the slot
const SHAPES = {
  globe:   { spin: 0.07, yaw: 0, tilt: 0.34, alpha: 0.62, size: 0.026, mode: 0, tint: 0, half: [2.2, 2.2] },
  engines: { spin: 0.14, yaw: 0, tilt: 0.5, alpha: 0.75, size: 0.032, mode: 1, tint: 0, half: [3.1, 2.3] },
  bars:    { spin: 0, yaw: -0.3, tilt: 0.16, alpha: 0.7, size: 0.028, mode: 1, tint: 0, half: [3.3, 2.25] },
  gauge:   { spin: 0, yaw: 0, tilt: 0, alpha: 0.5, size: 0.03, mode: 2, tint: 0, half: [2.4, 2.4] },
  path:    { spin: 0.16, yaw: 0, tilt: 0.42, alpha: 0.6, size: 0.024, mode: 1, tint: 0, half: [1.9, 2.9] },
  drift:   { spin: 0.02, yaw: 0, tilt: 0.4, alpha: 0.07, size: 0.03, mode: 0, tint: 0, half: [5, 3] },
  word:    { spin: 0, yaw: 0, tilt: 0, alpha: 0.5, size: 0.024, mode: 0, tint: 0.85, half: [2.35, 0.8] },
};
const ENGINE_R = 2.5;
const engineAngle = (k) => (k / 5) * Math.PI * 2 + 0.3;
const barX = (k) => (k - 2.5) * 1.08;
const barH = (k) => (AREAS[k][1] / 25) * 3.4;
const GATES = [1.7, 0, -1.7];
const STARS = 900;

function makeShapes(N) {
  const rndFrom = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const sphere = (rnd, r) => { const u = rnd() * 2 - 1, a = rnd() * 6.2832, s = Math.sqrt(1 - u * u); return [r * s * Math.cos(a), r * u, r * s * Math.sin(a)]; };
  const fill = (seed, fn) => {
    const rnd = rndFrom(seed), pos = new Float32Array(N * 3), data = new Float32Array(N);
    const stars = rndFrom(909), body = N - STARS;
    for (let i = body; i < N; i++) { pos[i * 3] = stars() * 2 - 1; pos[i * 3 + 1] = stars() * 2 - 1; pos[i * 3 + 2] = 0; data[i] = 9; }
    for (let i = 0; i < body; i++) { const p = fn(i / body, rnd, i); pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; data[i] = p[3] || 0; }
    return { pos, data };
  };
  const build = {
    globe: () => fill(11, (f, rnd, i) => {
      if (f > 0.86) return sphere(rnd, 2.45 + rnd() * 0.8);
      const n = Math.floor((N - STARS) * 0.86), y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996, R = 2.1 + (rnd() - 0.5) * 0.04;
      return [Math.cos(a) * r * R, y * R, Math.sin(a) * r * R];
    }),
    engines: () => fill(22, (f, rnd) => {
      if (f < 0.2) return sphere(rnd, 0.7 * Math.cbrt(0.55 + rnd() * 0.45));
      if (f < 0.72) { const k = Math.floor(((f - 0.2) / 0.52) * 5), a = engineAngle(k), s = sphere(rnd, 0.4 * Math.cbrt(0.4 + rnd() * 0.6)); return [Math.cos(a) * ENGINE_R + s[0], s[1], Math.sin(a) * ENGINE_R + s[2], k + 1]; }
      const k = Math.floor(((f - 0.72) / 0.28) * 5), a = engineAngle(k), t = 0.3 + rnd() * 0.55, j = 0.05;
      return [Math.cos(a) * ENGINE_R * t + (rnd() - 0.5) * j, (rnd() - 0.5) * j + Math.sin(t * 3.1416) * 0.16, Math.sin(a) * ENGINE_R * t + (rnd() - 0.5) * j, k + 1];
    }),
    bars: () => { // six columns, their heights in proportion to the weights
      const total = 100, edges = []; let acc = 0;
      AREAS.forEach(([, w]) => { acc += (w / total) * 0.9; edges.push(acc); });
      return fill(33, (f, rnd) => {
        if (f >= 0.9) return [(rnd() - 0.5) * 6.6, -1.72, (rnd() - 0.5) * 0.5];
        const k = edges.findIndex((e) => f < e), h = barH(k), w = 0.5, side = rnd();
        let x = (rnd() - 0.5) * w, z = (rnd() - 0.5) * w, y = rnd() * h;
        if (side < 0.3) x = (rnd() < 0.5 ? -1 : 1) * w / 2; else if (side < 0.6) z = (rnd() < 0.5 ? -1 : 1) * w / 2; else if (side < 0.78) y = h;
        return [barX(k) + x, y - 1.7, z, k + 1];
      });
    },
    gauge: () => fill(44, (f, rnd) => {
      const start = Math.PI * 1.25, sweep = Math.PI * 1.5;
      if (f < 0.985) { const t = rnd(), a = start - t * sweep, r = 2.0 + (rnd() - 0.5) * 0.28; return [Math.cos(a) * r, Math.sin(a) * r, (rnd() - 0.5) * 0.14, t]; }
      const mark = [0.45, 0.65, 0.8][Math.floor(rnd() * 3)], a = start - mark * sweep, r = 2.24 + rnd() * 0.26;
      return [Math.cos(a) * r, Math.sin(a) * r, 0, 2];
    }),
    path: () => fill(55, (f, rnd) => {
      if (f < 0.62) { const k = Math.floor((f / 0.62) * 3), a = rnd() * 6.2832, r = 0.95 + (rnd() - 0.5) * 0.03; return [Math.cos(a) * r, GATES[k] + (rnd() - 0.5) * 0.02, Math.sin(a) * r, k + 1]; }
      if (f < 0.8) { const y = 2.8 - rnd() * 4.5, j = 0.025, k = y > GATES[0] ? 1 : y > GATES[1] ? 2 : 3; return [(rnd() - 0.5) * j, y, (rnd() - 0.5) * j, k]; }
      const a = rnd() * 6.2832, r = 1.5 + (rnd() - 0.5) * 0.02; // the monthly loop round the last gate
      return [Math.cos(a) * r, GATES[2] + (rnd() - 0.5) * 0.02, Math.sin(a) * r, 3];
    }),
    drift: () => fill(66, (f, rnd) => [(rnd() - 0.5) * 11, (rnd() - 0.5) * 6.5, (rnd() - 0.5) * 1.5]),
    word: () => {
      const cw = 900, ch = 320, c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'italic 400 270px "Instrument Serif", Georgia, "Times New Roman", serif';
      x.fillText('cited', cw / 2, ch / 2 - 8);
      const d = x.getImageData(0, 0, cw, ch).data, pts = [];
      for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) if (d[(py * cw + px) * 4 + 3] > 120) pts.push(px, py);
      if (pts.length < 40) return build.globe();
      const count = pts.length / 2;
      return fill(77, (f, rnd) => { const k = Math.floor(rnd() * count); return [((pts[k * 2] + rnd() - cw / 2) / cw) * 6.6, (-(pts[k * 2 + 1] + rnd() - ch / 2) / cw) * 6.6, 0]; });
    },
  };
  const cache = {};
  return { get: (name) => cache[name] || (cache[name] = build[name]()), drop: (name) => { delete cache[name]; } };
}

function startStage() {
  const canvas = $('#stage');
  const fail = () => { document.documentElement.classList.add('no3d'); canvas.style.display = 'none'; };
  const small = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
  const N = small ? 7000 : 15000;
  let gl = null, prog = null, loc = {}, posBuf = null, dataBuf = null, drawCount = N, dprCap = small ? 1.5 : 2;
  const shapes = makeShapes(N);
  const positions = new Float32Array(shapes.get('globe').pos);
  let target = shapes.get('globe').pos;
  const seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) seeds[i] = Math.random();

  function init() {
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance' });
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    loc = {};
    ['uRot', 'uOffset', 'uObj', 'uTime', 'uSize', 'uPx', 'uMode', 'uSel', 'uFill', 'uPush', 'uWobble', 'uF', 'uAspect', 'uPointer', 'uAlpha', 'uTint', 'uScroll', 'uDpr', 'uStars'].forEach((n) => { loc[n] = gl.getUniformLocation(prog, n); });
    const attr = (name, data, size, usage) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage); const l = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); return b; };
    posBuf = attr('aPos', positions, 3, gl.DYNAMIC_DRAW);
    attr('aSeed', seeds, 1, gl.STATIC_DRAW);
    dataBuf = attr('aData', shapes.get(shape).data, 1, gl.DYNAMIC_DRAW);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0.043, 0.039, 0.031, 1);
    return true;
  }

  // state
  const F = 1 / Math.tan((40 * Math.PI) / 360), CAM = 9;
  let shape = 'globe', cfg = SHAPES.globe, slot = null, morphFrom = -10, morphUntil = 0;
  let W = 1, H = 1, viewH = (2 * CAM) / F, pxPerUnit = 1;
  let yaw = 0, yawVel = 0, pitch = 0, pitchVel = 0, px = 0, py = 0, pxT = 0, pyT = 0, pushT = 0, push = 0;
  let ox = 0, oy = 0, obj = 1, alpha = 0, tint = 0, size = 0.03, stars = 0, fill = 0.34, fillT = 0.34;
  let selEngine = 0, selArea = -1, selStep = -1, needs = true;
  const rot = new Float32Array(9);
  const now = () => performance.now() / 1000;

  function layout() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (w === W && Math.abs(h - H) < 150 && canvas.width) return; // a phone's address bar sliding away
    const dpr = Math.min(devicePixelRatio || 1, dprCap);
    W = w; H = h; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    pxPerUnit = H / viewH; needs = true;
  }

  function sel() { return shape === 'engines' ? selEngine + 1 : shape === 'bars' ? (selArea < 0 ? -1 : selArea + 1) : shape === 'path' ? (selStep < 0 ? -1 : selStep + 1) : -1; }

  stage.setShape = (name, panel) => {
    slot = panel ? $('[data-slot]', panel) : null;
    if (!SHAPES[name] || name === shape) { needs = true; return; }
    shape = name; cfg = SHAPES[name];
    const s = shapes.get(name);
    target = s.pos;
    gl.bindBuffer(gl.ARRAY_BUFFER, dataBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, s.data);
    morphFrom = now(); morphUntil = morphFrom + 5;
    if (reduced) { positions.set(target); morphUntil = 0; }
    needs = true;
  };
  stage.selectEngine = (k) => { selEngine = k; needs = true; };
  stage.selectArea = (k) => { selArea = k; needs = true; };
  stage.selectStep = (k) => { selStep = k; needs = true; };
  stage.setFill = (f) => { fillT = f; needs = true; };
  stage.poke = () => { needs = true; };

  // labels over the engine graph and the bars
  const box = $('#labels');
  const mk = (text, cls, onClick) => { const b = document.createElement('button'); b.type = 'button'; b.tabIndex = -1; b.className = 'label3d ' + cls; b.textContent = text; b.dataset.x = b.dataset.y = '0'; if (onClick) b.addEventListener('click', onClick); box.appendChild(b); return b; };
  const engineLabels = ENGINE_NAMES.map((n, k) => mk(n, '', () => selectEngine(k)));
  const hubLabel = mk('Your site', 'hub');
  const barLabels = AREAS.map(([, w], k) => mk(`${w}%`, 'fig', () => selectArea(k, true)));
  const gateLabels = ['Snapshot', 'Audit and fixes', 'Monthly'].map((n, k) => mk(`${k + 1}  ${n}`, 'fig'));
  const place = (el, x, y, z, on) => {
    // a point of the figure -> where it is on the screen
    const wx = (rot[0] * x + rot[3] * y + rot[6] * z) * obj + ox, wy = (rot[1] * x + rot[4] * y + rot[7] * z) * obj + oy, wz = (rot[2] * x + rot[5] * y + rot[8] * z) * obj;
    const d = CAM - wz, sx = (wx * F / (W / H) / d * 0.5 + 0.5) * W, sy = (-wy * F / d * 0.5 + 0.5) * H;
    el.classList.toggle('on', on);
    if (Math.abs(sx - el.dataset.x) > 0.5 || Math.abs(sy - el.dataset.y) > 0.5) { el.dataset.x = sx; el.dataset.y = sy; el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`; }
  };

  // pointer: a gentle push from the mouse, and drag-to-turn inside a slot
  let dragging = false, lastX = 0, lastY = 0;
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pxT = (e.clientX / W) * 2 - 1; pyT = (e.clientY / H) * 2 - 1; pushT = 1; needs = true;
    if (dragging) { yaw += (e.clientX - lastX) * 0.006; yawVel = (e.clientX - lastX) * 0.006; pitch = clamp(pitch + (e.clientY - lastY) * 0.004, -0.8, 0.8); lastX = e.clientX; lastY = e.clientY; }
  }, { passive: true });
  $$('[data-slot]').forEach((el) => {
    if (el.classList.contains('gauge-slot') || el.classList.contains('word-slot')) return;
    el.style.cursor = 'grab';
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId); dragging = true; lastX = e.clientX; lastY = e.clientY; el.style.cursor = 'grabbing';
    });
    const end = () => { dragging = false; el.style.cursor = 'grab'; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  });
  document.addEventListener('pointerleave', () => { pushT = 0; });
  addEventListener('scroll', () => { needs = true; }, { passive: true });

  // frame loop, with a governor for slow graphics
  let raf = 0, last = now(), frames = 0, slowSum = 0, level = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    const t = now(), dt = Math.min(0.05, t - last); last = t;
    const morphing = morphUntil > 0 && t < morphUntil;
    if (reduced && !needs && !morphing) return;
    needs = false;
    const ease = (rate) => (reduced ? 1 : 1 - Math.pow(1 - rate, dt * 60));

    if (morphing) {
      for (let i = 0; i < N; i++) {
        const k = ease(0.03 + seeds[i] * 0.07), j = i * 3;
        positions[j] += (target[j] - positions[j]) * k; positions[j + 1] += (target[j + 1] - positions[j + 1]) * k; positions[j + 2] += (target[j + 2] - positions[j + 2]) * k;
      }
    } else if (morphUntil > 0) { positions.set(target); morphUntil = 0; }
    if (morphing || morphUntil === 0) { gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions); if (!morphing) morphUntil = -1; }

    // where the figure sits: the section's own slot, or the whole screen
    let gx = 0, gy = 0, gs = 1;
    if (slot) {
      const r = slot.getBoundingClientRect();
      gx = ((r.left + r.width / 2) / W - 0.5) * viewH * (W / H); gy = (0.5 - (r.top + r.height / 2) / H) * viewH;
      gs = Math.min(r.width / (2 * cfg.half[0]), r.height / (2 * cfg.half[1])) / pxPerUnit * 0.94;
    } else { gs = Math.max(1, (viewH * (W / H)) / 10); }
    gs = clamp(gs, 0.15, 2.4);
    const e = ease(0.07);
    ox += (gx - ox) * e; oy += (gy - oy) * ease(0.3); obj += (gs - obj) * e;

    if (cfg.spin && !reduced && !dragging) yaw += cfg.spin * dt;
    else if (!cfg.spin && !dragging) { const goal = cfg.yaw + 6.2832 * Math.round((yaw - cfg.yaw) / 6.2832); yaw += (goal - yaw) * ease(0.06); }
    if (!dragging && !reduced) { yaw += yawVel; yawVel *= Math.pow(0.93, dt * 60); pitch *= Math.pow(0.95, dt * 60); }
    px += (pxT - px) * ease(0.06); py += (pyT - py) * ease(0.06);
    const ry = yaw + (reduced ? 0 : px * 0.12), rx = cfg.tilt + pitch + (reduced ? 0 : py * 0.07);
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    // R = Rx * Ry, column-major
    rot[0] = cy; rot[1] = sx * sy; rot[2] = -cx * sy; rot[3] = 0; rot[4] = cx; rot[5] = sx; rot[6] = sy; rot[7] = -sx * cy; rot[8] = cx * cy;

    const dip = t - morphFrom < 0.5 && !reduced ? 0.35 : 1;
    alpha += (cfg.alpha * dip - alpha) * ease(0.08); tint += (cfg.tint - tint) * ease(0.05);
    fill += (fillT - fill) * ease(0.08); push += ((reduced ? 0 : pushT) - push) * ease(0.08);

    // the pointer, in the figure's own space
    const wx = pxT * viewH * (W / H) * 0.5 - ox, wy = -pyT * viewH * 0.5 - oy;
    const lx = (rot[0] * wx + rot[1] * wy) / obj, ly = (rot[3] * wx + rot[4] * wy) / obj, lz = (rot[6] * wx + rot[7] * wy) / obj;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix3fv(loc.uRot, false, rot); gl.uniform3f(loc.uOffset, ox, oy, 0); gl.uniform1f(loc.uObj, obj);
    gl.uniform1f(loc.uTime, reduced ? 0 : t); size += (cfg.size - size) * ease(0.1); gl.uniform1f(loc.uSize, size); gl.uniform1f(loc.uPx, (canvas.height * F) / 2);
    gl.uniform1f(loc.uMode, cfg.mode); gl.uniform1f(loc.uSel, sel()); gl.uniform1f(loc.uFill, fill); gl.uniform1f(loc.uPush, push);
    gl.uniform1f(loc.uWobble, reduced ? 0 : 1); gl.uniform1f(loc.uF, F); gl.uniform1f(loc.uAspect, W / H);
    stars += ((cfg.stars === undefined ? 1 : cfg.stars) - stars) * ease(0.05);
    gl.uniform1f(loc.uScroll, reduced ? 0 : scrollY / Math.max(1, H)); gl.uniform1f(loc.uDpr, canvas.height / H); gl.uniform1f(loc.uStars, stars * 0.55);
    gl.uniform3f(loc.uPointer, lx, ly, lz); gl.uniform1f(loc.uAlpha, alpha); gl.uniform1f(loc.uTint, tint);
    gl.drawArrays(gl.POINTS, 0, drawCount);

    const showE = shape === 'engines' && !!slot, showB = shape === 'bars' && !!slot;
    engineLabels.forEach((el, k) => { const a = engineAngle(k); place(el, Math.cos(a) * ENGINE_R, 0.72, Math.sin(a) * ENGINE_R, showE); el.classList.toggle('sel', k === selEngine); });
    place(hubLabel, 0, -1.5, 0, showE);
    barLabels.forEach((el, k) => { place(el, barX(k), barH(k) - 1.7 + 0.36, 0, showB); el.classList.toggle('sel', k === selArea); });

    const showP = shape === 'path' && !!slot;
    gateLabels.forEach((el, k) => { place(el, 0, GATES[k] + 0.62, 0, showP); el.classList.toggle('sel', k === selStep); });
    // slow graphics: lower the resolution, then the point count, then stop
    if (frames < 120 && !document.hidden) {
      frames++; if (frames > 30) slowSum += dt;
      if (frames === 120 && slowSum / 90 > 0.022) {
        level++; frames = 0; slowSum = 0;
        if (level === 1) { dprCap = 1; W = 0; layout(); } else if (level === 2) { drawCount = Math.floor(N / 2); } else { cancelAnimationFrame(raf); fail(); }
      }
    }
    if (!reduced) needs = true;
  }

  if (!init()) { fail(); return; }
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); });
  canvas.addEventListener('webglcontextrestored', () => { if (init()) { W = 0; layout(); frame(); } else fail(); });
  new ResizeObserver(layout).observe(canvas);
  addEventListener('resize', layout);
  document.addEventListener('visibilitychange', () => { cancelAnimationFrame(raf); if (!document.hidden) { last = now(); needs = true; frame(); } });
  motion.addEventListener('change', () => { reduced = motion.matches; needs = true; });
  if (document.fonts && document.fonts.load) document.fonts.load('italic 400 270px "Instrument Serif"').then(() => { shapes.drop('word'); if (shape === 'word') { target = shapes.get('word').pos; morphUntil = now() + 4; } }).catch(() => {});
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 600));
  idle(() => Object.keys(SHAPES).forEach((n) => shapes.get(n)));
  layout();
  frame();
}

/* ------------------------------------------------------------------ */
/* Page behaviour                                                      */
/* ------------------------------------------------------------------ */

function selectEngine(k, focus) {
  $$('.engine-tabs [role="tab"]').forEach((b, i) => { b.setAttribute('aria-selected', String(i === k)); b.tabIndex = i === k ? 0 : -1; if (i === k && focus) b.focus(); });
  $$('.engine-card').forEach((p, i) => { p.hidden = i !== k; if (i === k) { p.classList.remove('swap'); void p.offsetWidth; p.classList.add('swap'); } });
  stage.selectEngine(k);
}

function initEngines() {
  const tabs = $$('.engine-tabs [role="tab"]');
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => selectEngine(i));
    b.addEventListener('keydown', (e) => {
      const to = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
      if (to !== undefined) { e.preventDefault(); selectEngine(to, true); }
    });
  });
}

let pinnedArea = -1;
function selectArea(k, pin) {
  if (pin) pinnedArea = pinnedArea === k ? -1 : k;
  const shown = k < 0 ? pinnedArea : k;
  $$('#areas button').forEach((b, i) => { b.classList.toggle('on', i === shown); b.setAttribute('aria-pressed', String(i === pinnedArea)); });
  stage.selectArea(shown);
}

function initAreas() {
  $$('#areas button').forEach((b, k) => {
    b.addEventListener('pointerenter', () => selectArea(k)); b.addEventListener('pointerleave', () => selectArea(-1));
    b.addEventListener('focus', () => selectArea(k)); b.addEventListener('blur', () => selectArea(-1));
    b.addEventListener('click', () => selectArea(k, true));
  });
  $$('#steps li').forEach((li, k) => {
    li.addEventListener('pointerenter', () => { li.classList.add('on'); stage.selectStep(k); });
    li.addEventListener('pointerleave', () => { li.classList.remove('on'); stage.selectStep(-1); });
  });
}

function initDemo() {
  const BASE = 34, num = $('#demo-num'), band = $('#demo-band'), said = $('#demo-said');
  let shown = BASE, raf = 0;
  const bandOf = (v) => BANDS.find(([limit]) => v < limit)[1];
  const paint = (v) => { num.textContent = String(Math.round(v)); band.textContent = bandOf(v); };
  const update = () => {
    const goal = BASE + $$('#toggles input:checked').reduce((a, i) => a + Number(i.dataset.gain), 0);
    stage.setFill(goal / 100);
    said.textContent = `Example score ${goal} out of 100: ${bandOf(goal)}.`;
    cancelAnimationFrame(raf);
    if (reduced) { shown = goal; paint(shown); return; }
    const step = () => { shown += (goal - shown) * 0.16; if (Math.abs(goal - shown) < 0.4) { shown = goal; paint(shown); return; } paint(shown); raf = requestAnimationFrame(step); };
    step();
  };
  $$('#toggles input').forEach((i) => i.addEventListener('change', update));
  paint(BASE); stage.setFill(BASE / 100);
}

function readSite(value) {
  let url = String(value || '').trim();
  if (!url || url.includes('@') || /\s/.test(url)) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try { const u = new URL(url); return /\.[a-z]{2,}$/i.test(u.hostname) ? u : null; } catch (err) { return null; }
}

function initForms() {
  const form = $('#form'), note = $('#form-note'), site = $('#f-site'), email = $('#f-email'), pack = $('#f-pack');
  const idle = note.textContent;
  $$('#foot-mail, #alt-mail').forEach((a) => { a.href = `mailto:${CONFIG.email}`; a.textContent = CONFIG.email; });
  $$('[data-pack]').forEach((b) => b.addEventListener('click', () => { pack.value = b.dataset.pack; }));
  [site, email].forEach((f) => f.addEventListener('input', () => { f.removeAttribute('aria-invalid'); note.className = 'form-note'; note.textContent = idle; }));
  $('#quick').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const u = readSite($('#q-site').value);
    if (u) site.value = u.hostname + (u.pathname === '/' ? '' : u.pathname);
    $('#contact').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    setTimeout(() => (u ? email : site).focus({ preventScroll: true }), reduced ? 0 : 700);
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const u = readSite(site.value), okMail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim());
    site.toggleAttribute('aria-invalid', !u); if (!u) site.setAttribute('aria-invalid', 'true');
    email.toggleAttribute('aria-invalid', !okMail); if (!okMail) email.setAttribute('aria-invalid', 'true');
    if (!u || !okMail) {
      note.className = 'form-note err';
      note.textContent = !u ? 'Please enter your website address, for example yourbusiness.com.' : 'Please enter an email address I can reply to.';
      (!u ? site : email).focus();
      return;
    }
    const body = [`Website: ${u.href}`, `Reply to: ${email.value.trim()}`, `Interested in: ${pack.value}`, '', $('#f-note').value.trim()].join('\n');
    note.className = 'form-note ok';
    note.textContent = `Your email app should open with the request ready to send. If nothing opened, write to ${CONFIG.email}.`;
    location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent(`Snapshot request: ${u.hostname}`)}&body=${encodeURIComponent(body)}`;
  });
}

function initNav() {
  const btn = $('#menu-btn'), links = $('#nav-links');
  const close = () => { links.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => { const open = links.classList.toggle('open'); btn.setAttribute('aria-expanded', String(open)); });
  links.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

function initScroll() {
  const panels = $$('.panel'), nav = $('#nav'), links = $$('.nav-links a'), bar = $('#progress');
  let current = null, queued = false;
  const check = () => {
    queued = false;
    nav.classList.toggle('stuck', scrollY > 30);
    bar.style.transform = `scaleX(${clamp(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight), 0, 1)})`;
    const line = innerHeight * 0.45;
    let best = panels[0];
    for (const p of panels) { const r = p.getBoundingClientRect(); if (r.top <= line) best = p; }
    queued = false;
    if (best !== current) {
      current = best;
      stage.setShape(best.dataset.shape, best);
      links.forEach((a) => { const on = a.getAttribute('href') === `#${best.id}`; a.classList.toggle('cur', on); if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    }
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(check); } }; // check runs on every scroll frame, for the progress line
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  check();
  return () => { current = null; check(); };
}

function initReveal() {
  if (reduced || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.1, rootMargin: '0px 0px -5% 0px' });
  $$('.panel:not(.hero)').forEach((p) => $$('.eyebrow, h2, .col-text > p, .engine-tabs, .engine-card, .areas li, .toggles, .steps li, .card, .doc, .getdont > div, .statement, .faq details, .form', p).forEach((el, i) => {
    if (el.getBoundingClientRect().top < innerHeight) return; // already on screen: leave it be
    el.classList.add('reveal'); el.style.setProperty('--d', `${Math.min(i, 6) * 50}ms`); io.observe(el);
  }));
}

initEngines(); initAreas(); initDemo(); initForms(); initNav(); initReveal();
const recheck = initScroll();
const begin = () => {
  if (navigator.connection && navigator.connection.saveData) { document.documentElement.classList.add('no3d'); return; }
  try { startStage(); } catch (err) { document.documentElement.classList.add('no3d'); }
  recheck();
  const on = $('.engine-tabs [aria-selected="true"]');
  stage.selectEngine(on ? Number(on.dataset.engine) : 0);
  stage.setFill((34 + $$('#toggles input:checked').reduce((a, i) => a + Number(i.dataset.gain), 0)) / 100);
};
(window.requestIdleCallback || ((fn) => setTimeout(fn, 1)))(begin, { timeout: 1200 });
