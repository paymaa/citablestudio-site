// Citable Studio — page behaviour and the 3D particle stage.
// The page works without the 3D stage: every piece of content is plain HTML.

const CONFIG = {
  email: 'hello@citablestudio.com', // where snapshot requests are sent
};

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ------------------------------------------------------------------ */
/* Content data                                                        */
/* ------------------------------------------------------------------ */

const ENGINES = [
  {
    name: 'ChatGPT',
    text: 'ChatGPT answers with web results gathered by OpenAI\'s own search crawler and by search partners. If its search crawler is blocked, your pages cannot be shown as sources in its answers.',
    bots: ['OAI-SearchBot', 'ChatGPT-User', 'GPTBot'],
    check: 'Crawler access, whether your content is in the page without JavaScript, and passages short enough to quote.',
  },
  {
    name: 'Claude',
    text: 'Claude searches the web when a question needs fresh facts and fetches the pages it wants to read. It favours pages that state facts plainly and name their sources.',
    bots: ['Claude-SearchBot', 'Claude-User', 'ClaudeBot'],
    check: 'Crawler access, clear factual statements, named authors and dates, and an llms.txt summary.',
  },
  {
    name: 'Perplexity',
    text: 'Perplexity keeps its own index and shows numbered sources beside every answer, so a quotable page earns a visible, clickable citation.',
    bots: ['PerplexityBot', 'Perplexity-User'],
    check: 'Crawler access, direct answers near the top of each page, and fresh publication dates.',
  },
  {
    name: 'Gemini',
    text: 'Gemini grounds its answers in Google Search. A separate robots.txt token, Google-Extended, controls whether Google may use your content for Gemini.',
    bots: ['Googlebot', 'Google-Extended'],
    check: 'Google indexing health, the Google-Extended setting, and structured data that defines your business.',
  },
  {
    name: 'AI Overviews',
    text: 'Google\'s AI Overviews are built from the same index as Google Search. Pages that cannot be indexed, or that forbid snippets, cannot appear in them.',
    bots: ['Googlebot'],
    check: 'Indexing, snippet settings, page speed, and structured data that matches what is on the page.',
  },
];

const BANDS = [
  [45, 'Hard to cite'],
  [65, 'Becoming readable'],
  [80, 'Citable'],
  [101, 'Easy to cite'],
];

/* ------------------------------------------------------------------ */
/* 3D stage                                                            */
/* ------------------------------------------------------------------ */

const SHAPES = {
  //         spin  yaw   tilt  scale alpha mode tint
  globe:   { spin: 0.10, yaw: 0, tilt: 0.28, scale: 1.18, alpha: 0.62, mode: 0, tint: 0 },
  engines: { spin: 0.16, yaw: 0, tilt: 0.46, scale: 0.92, alpha: 0.7, mode: 1, tint: 0 },
  bars:    { spin: 0, yaw: -0.36, tilt: 0.16, scale: 0.9, alpha: 0.6, mode: 1, tint: 0 },
  helix:   { spin: 0.32, yaw: 0, tilt: 0.0, scale: 1.0, alpha: 0.5, mode: 0, tint: 0 },
  gauge:   { spin: 0, yaw: 0, tilt: 0, scale: 0.98, alpha: 0.55, mode: 2, tint: 0 },
  rings:   { spin: 0.05, yaw: 0, tilt: 1.12, scale: 1.25, alpha: 0.3, mode: 0, tint: 0 },
  word:    { spin: 0, yaw: 0, tilt: 0, scale: 1.0, alpha: 0.3, mode: 0, tint: 0.75 },
};

const stage = { ready: false, setShape() {}, setSel() {}, setFill() {}, selEngine() {} };

async function startStage() {
  const canvas = $('#stage');
  let THREE;
  try {
    THREE = await import('./vendor/three.module.min.js');
  } catch (err) {
    document.documentElement.classList.add('no3d');
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    document.documentElement.classList.add('no3d');
    canvas.style.display = 'none';
    return;
  }
  renderer.setClearColor(0x000000, 0);

  const N = innerWidth < 700 ? 7000 : 15000;
  const FOV = 40;
  const CAM_Z = 9;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
  camera.position.set(0, 0, CAM_Z);
  const group = new THREE.Group();
  scene.add(group);

  // deterministic random numbers, so the shapes look the same on every visit
  let seedState = 20261121;
  const rnd = () => {
    seedState |= 0; seedState = (seedState + 0x6d2b79f5) | 0;
    let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const onSphere = (r) => {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    return [r * s * Math.cos(a), r * u, r * s * Math.sin(a)];
  };

  const ENGINE_R = 2.5;
  const engineAngle = (k) => (k / 5) * Math.PI * 2 + 0.3;
  const WEIGHTS = [25, 20, 20, 15, 10, 10];

  const build = {
    globe() {
      const pos = new Float32Array(N * 3), data = new Float32Array(N);
      const golden = Math.PI * (3 - Math.sqrt(5));
      const shell = Math.floor(N * 0.84);
      for (let i = 0; i < N; i++) {
        let x, y, z;
        if (i < shell) {
          const yy = 1 - (i / (shell - 1)) * 2, r = Math.sqrt(1 - yy * yy), a = i * golden;
          const R = 2.1 + (rnd() - 0.5) * 0.05;
          x = Math.cos(a) * r * R; y = yy * R; z = Math.sin(a) * r * R;
        } else {
          [x, y, z] = onSphere(2.5 + rnd() * 0.9);
        }
        pos.set([x, y, z], i * 3);
      }
      return { pos, data };
    },
    engines() {
      const pos = new Float32Array(N * 3), data = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const f = i / N;
        let p, g = 0;
        if (f < 0.2) {
          p = onSphere(0.72 * Math.cbrt(0.55 + rnd() * 0.45));
        } else if (f < 0.75) {
          const k = Math.floor(((f - 0.2) / 0.55) * 5);
          const a = engineAngle(k);
          const s = onSphere(0.4 * Math.cbrt(0.4 + rnd() * 0.6));
          p = [Math.cos(a) * ENGINE_R + s[0], s[1], Math.sin(a) * ENGINE_R + s[2]];
          g = k + 1;
        } else {
          const k = Math.floor(((f - 0.75) / 0.25) * 5);
          const a = engineAngle(k);
          const t = 0.3 + rnd() * 0.55;
          const j = 0.05;
          p = [Math.cos(a) * ENGINE_R * t + (rnd() - 0.5) * j, (rnd() - 0.5) * j + Math.sin(t * Math.PI) * 0.16, Math.sin(a) * ENGINE_R * t + (rnd() - 0.5) * j];
          g = k + 1;
        }
        pos.set(p, i * 3); data[i] = g;
      }
      return { pos, data };
    },
    bars() {
      const pos = new Float32Array(N * 3), data = new Float32Array(N);
      const total = WEIGHTS.reduce((a, b) => a + b, 0);
      const edges = []; let acc = 0;
      WEIGHTS.forEach((w) => { acc += w / total; edges.push(acc); });
      for (let i = 0; i < N; i++) {
        const f = (i + 0.5) / N;
        const k = edges.findIndex((e) => f <= e);
        const h = (WEIGHTS[k] / 25) * 3.3;
        const w = 0.56;
        // most points sit on the faces of the column, so its outline reads clearly
        let x = (rnd() - 0.5) * w, z = (rnd() - 0.5) * w, y = rnd() * h;
        const face = rnd();
        if (face < 0.3) x = (rnd() < 0.5 ? -1 : 1) * w / 2;
        else if (face < 0.6) z = (rnd() < 0.5 ? -1 : 1) * w / 2;
        else if (face < 0.75) y = h;
        pos.set([(k - 2.5) * 0.94 + x, y - 1.65, z], i * 3);
        data[i] = k + 1;
      }
      return { pos, data };
    },
    helix() {
      const pos = new Float32Array(N * 3), data = new Float32Array(N);
      const nodes = [0.12, 0.5, 0.88];
      for (let i = 0; i < N; i++) {
        const f = i / N;
        let p;
        if (f < 0.7) {
          const t = rnd(), strand = rnd() < 0.5 ? 0 : Math.PI;
          const a = t * Math.PI * 5 + strand, r = 0.95, j = 0.07;
          p = [Math.cos(a) * r + (rnd() - 0.5) * j, (t - 0.5) * 4.8 + (rnd() - 0.5) * j, Math.sin(a) * r + (rnd() - 0.5) * j];
        } else {
          const k = Math.floor(((f - 0.7) / 0.3) * 3);
          const s = onSphere(0.36 * Math.cbrt(0.3 + rnd() * 0.7));
          p = [s[0], (nodes[k] - 0.5) * 4.8 + s[1], s[2]];
        }
        pos.set(p, i * 3);
      }
      return { pos, data };
    },
    gauge() {
      const pos = new Float32Array(N * 3), data = new Float32Array(N);
      const start = Math.PI * 1.25, sweep = Math.PI * 1.5;
      for (let i = 0; i < N; i++) {
        const f = i / N;
        let p;
        if (f < 0.86) {
          const t = rnd();
          const a = start - t * sweep;
          const r = 2.0 + (rnd() - 0.5) * 0.3;
          p = [Math.cos(a) * r, Math.sin(a) * r, (rnd() - 0.5) * 0.16];
          data[i] = t;
        } else {
          const a = rnd() * Math.PI * 2, r = 1.42 + (rnd() - 0.5) * 0.02;
          p = [Math.cos(a) * r, Math.sin(a) * r, 0];
          data[i] = 2;
        }
        pos.set(p, i * 3);
      }
      return { pos, data };
    },
    rings() {
      const pos = new Float32Array(N * 3), data = new Float32Array(N);
      const radii = [1.7, 2.6, 3.5, 4.4];
      for (let i = 0; i < N; i++) {
        const k = Math.floor(rnd() * radii.length);
        const a = rnd() * Math.PI * 2, r = radii[k] + (rnd() - 0.5) * (0.12 + k * 0.08);
        pos.set([Math.cos(a) * r, (rnd() - 0.5) * 0.08, Math.sin(a) * r], i * 3);
      }
      return { pos, data };
    },
    word() {
      const cw = 900, ch = 320;
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'italic 400 270px "Instrument Serif", Georgia, "Times New Roman", serif';
      x.fillText('cited', cw / 2, ch / 2 - 8);
      const d = x.getImageData(0, 0, cw, ch).data;
      const pts = [];
      for (let py = 0; py < ch; py += 2) for (let px = 0; px < cw; px += 2) if (d[(py * cw + px) * 4 + 3] > 120) pts.push(px, py);
      if (pts.length < 20) return build.globe();
      const pos = new Float32Array(N * 3), data = new Float32Array(N);
      const W = 6.6, count = pts.length / 2;
      for (let i = 0; i < N; i++) {
        const k = Math.floor(rnd() * count);
        const px = pts[k * 2] + rnd() * 2, py = pts[k * 2 + 1] + rnd() * 2;
        pos.set([((px - cw / 2) / cw) * W, (-(py - ch / 2) / cw) * W, (rnd() - 0.5) * 0.2], i * 3);
      }
      return { pos, data };
    },
  };

  const cache = {};
  const shapeOf = (name) => cache[name] || (cache[name] = build[name]());

  // geometry
  const first = shapeOf('globe');
  const positions = new Float32Array(first.pos);
  let target = first.pos;
  const seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) seeds[i] = Math.random();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute('aData', new THREE.BufferAttribute(new Float32Array(first.data), 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

  const uniforms = {
    uTime: { value: 0 }, uSize: { value: 0.042 }, uScale: { value: 1 },
    uMode: { value: 0 }, uSel: { value: -1 }, uFill: { value: 0.34 },
    uPush: { value: 0 }, uPointer: { value: new THREE.Vector3(99, 99, 99) },
    uTint: { value: 0 }, uAlpha: { value: 0 }, uWobble: { value: reduceMotion ? 0 : 1 },
    uBase: { value: new THREE.Color('#f2ecdf') }, uSignal: { value: new THREE.Color('#d8ff3e') },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aData;
      uniform float uTime, uSize, uScale, uMode, uSel, uFill, uPush, uWobble;
      uniform vec3 uPointer;
      varying float vHi;
      varying float vDepth;
      varying float vSeed;
      void main() {
        vec3 p = position;
        float t = uTime * 0.6 + aSeed * 40.0;
        p += uWobble * 0.03 * vec3(sin(t + p.y * 2.0), cos(t * 1.1 + p.z * 2.0), sin(t * 0.9 + p.x * 2.0));
        vec3 d = p - uPointer;
        float dist = length(d);
        p += normalize(d + vec3(0.0001)) * uPush * smoothstep(1.25, 0.0, dist) * 0.55;
        float hi = 0.0;
        if (uMode > 0.5 && uMode < 1.5) {
          if (uSel > -0.5 && aData > 0.5) hi = abs(aData - uSel) < 0.4 ? 1.0 : -1.0;
        } else if (uMode > 1.5) {
          hi = aData <= uFill ? 1.0 : -1.0;
        }
        vHi = hi;
        vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDepth = -mv.z;
        float size = uSize * (0.55 + aSeed * 0.95) * (1.0 + 0.5 * max(hi, 0.0));
        gl_PointSize = max(1.0, size * uScale / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform vec3 uBase, uSignal;
      uniform float uAlpha, uTint;
      varying float vHi;
      varying float vDepth;
      varying float vSeed;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.08, r);
        vec3 col = mix(uBase, uSignal, max(uTint, step(0.88, vSeed) * 0.9));
        float al = uAlpha;
        if (vHi > 0.5) { col = uSignal; al *= 1.3; }
        else if (vHi < -0.5) { col = uBase; al *= 0.26; }
        float fog = smoothstep(13.5, 6.5, vDepth);
        gl_FragColor = vec4(col, a * al * mix(0.3, 1.0, fog));
      }`,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  group.add(points);

  // state
  let shape = 'globe', side = 'center';
  let cfg = SHAPES.globe;
  let morphUntil = 0;
  let yaw = 0, yawVel = 0, pitchOff = 0, pitchVel = 0;
  let px = 0, py = 0, pxT = 0, pyT = 0, pushT = 0;
  let viewW = 10, viewH = 6, small = false;
  let selEngine = 0, selArea = -1, fillT = 0.34;
  const goal = { x: 0, y: 0, scale: 1, alpha: 0.6, tint: 0 };
  const now = () => performance.now() / 1000;

  function layout() {
    const w = innerWidth, h = innerHeight;
    if (!w || !h) return; // a page opened in a hidden window has no size yet; the resize event calls this again
    const dpr = Math.min(devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    viewH = 2 * CAM_Z * Math.tan((FOV * Math.PI) / 360);
    viewW = viewH * camera.aspect;
    small = w < 980;
    uniforms.uScale.value = (h * dpr) / (2 * Math.tan((FOV * Math.PI) / 360));
    place();
  }

  function place() {
    const fit = small ? clamp(viewW / 6.2, 0.42, 1) : clamp(viewW / 11.6, 0.62, 1.1);
    goal.scale = cfg.scale * fit;
    goal.alpha = cfg.alpha * (small ? (shape === 'word' ? 1 : shape === 'globe' ? 0.6 : 0.5) : 1);
    uniforms.uSize.value = 0.042 * (small ? clamp(fit, 0.55, 1) : 1); // smaller points when the whole figure is smaller
    goal.tint = cfg.tint;
    goal.x = 0; goal.y = 0;
    if (!small) {
      if (side === 'right') goal.x = viewW * 0.25;
      else if (side === 'left') goal.x = -viewW * 0.25;
    }
    if (side === 'top') { goal.y = viewH * (small ? 0.3 : 0.29); goal.scale *= small ? 0.8 : 0.62; }
    if (shape === 'gauge' && !small) goal.y = -0.1;
  }

  stage.setShape = (name, where) => {
    if (!build[name] || (name === shape && where === side)) return;
    const changed = name !== shape;
    shape = name; side = where || 'center'; cfg = SHAPES[name];
    if (changed) {
      const s = shapeOf(name);
      target = s.pos;
      geo.attributes.aData.array.set(s.data);
      geo.attributes.aData.needsUpdate = true;
      morphUntil = now() + 5;
      if (reduceMotion) { positions.set(target); geo.attributes.position.needsUpdate = true; morphUntil = 0; }
    }
    uniforms.uMode.value = cfg.mode;
    syncSel();
    place();
    labels.forEach((l) => l.classList.toggle('on', shape === 'engines' && !small));
  };
  function syncSel() {
    uniforms.uSel.value = shape === 'engines' ? selEngine + 1 : shape === 'bars' ? (selArea < 0 ? -1 : selArea + 1) : -1;
  }
  stage.selEngine = (k) => { selEngine = k; syncSel(); labels.forEach((l, i) => l.classList.toggle('sel', i === k)); };
  stage.setSel = (k) => { selArea = k; syncSel(); };
  stage.setFill = (f) => { fillT = f; };

  // labels that follow the five engine clusters
  const labelBox = $('#labels');
  const labels = ENGINES.map((e, k) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'label3d'; b.textContent = e.name; b.tabIndex = -1;
    b.addEventListener('click', () => selectEngine(k));
    labelBox.appendChild(b);
    return b;
  });
  labels[0].classList.add('sel');
  const tmp = new THREE.Vector3();
  const wordAnchor = $('#contact .eyebrow');

  // pointer: parallax, push, drag to turn
  let dragging = false, lastX = 0, lastY = 0;
  const passive = 'a,button,input,textarea,select,label,summary,details,.card,.engine-card,.areas,.steps,h1,h2,h3,p,.form';
  addEventListener('pointermove', (e) => {
    pxT = (e.clientX / innerWidth) * 2 - 1; pyT = (e.clientY / innerHeight) * 2 - 1;
    pushT = e.pointerType === 'touch' ? 0 : 1;
    if (dragging) {
      yawVel = (e.clientX - lastX) * 0.006; pitchVel = (e.clientY - lastY) * 0.004;
      lastX = e.clientX; lastY = e.clientY;
    }
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target.closest && e.target.closest(passive))) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    document.body.style.cursor = 'grabbing';
  });
  const endDrag = () => { dragging = false; document.body.style.cursor = ''; };
  addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);
  document.addEventListener('pointerleave', () => { pushT = 0; });
  addEventListener('blur', () => { pushT = 0; endDrag(); });

  // frame loop
  let last = now(), running = true;
  const ray = new THREE.Vector3();
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const t = now();
    const dt = Math.min(0.05, t - last); last = t;
    const ease = (rate) => 1 - Math.pow(1 - rate, dt * 60);

    // morph towards the target shape
    if (t < morphUntil) {
      for (let i = 0; i < N; i++) {
        const k = ease(0.03 + seeds[i] * 0.07), j = i * 3;
        positions[j] += (target[j] - positions[j]) * k;
        positions[j + 1] += (target[j + 1] - positions[j + 1]) * k;
        positions[j + 2] += (target[j + 2] - positions[j + 2]) * k;
      }
      geo.attributes.position.needsUpdate = true;
    } else if (morphUntil !== 0) {
      positions.set(target); geo.attributes.position.needsUpdate = true; morphUntil = 0;
    }

    // rotation
    if (cfg.spin && !reduceMotion) yaw += cfg.spin * dt;
    else {
      const goalYaw = cfg.yaw + Math.PI * 2 * Math.round((yaw - cfg.yaw) / (Math.PI * 2));
      if (!dragging) yaw += (goalYaw - yaw) * ease(0.05);
    }
    yaw += yawVel; pitchOff += pitchVel;
    if (!dragging) { yawVel *= 0.93; pitchVel *= 0.9; pitchOff *= 0.95; }
    else { yawVel *= 0.6; pitchVel *= 0.6; }
    pitchOff = clamp(pitchOff, -0.9, 0.9);
    px += (pxT - px) * ease(0.06); py += (pyT - py) * ease(0.06);
    group.rotation.y = yaw + px * 0.14;
    group.rotation.x = cfg.tilt + pitchOff + py * 0.08;

    // placement; the word sits just above the last section's small heading and scrolls with it
    const e = ease(0.06);
    let ey = e;
    if (shape === 'word' && wordAnchor) {
      const pxPerUnit = innerHeight / viewH;
      const halfH = 0.75 * group.scale.x * pxPerUnit;
      const cy = wordAnchor.getBoundingClientRect().top - 22 - halfH;
      goal.y = (0.5 - cy / innerHeight) * viewH;
      ey = ease(0.3);
    }
    group.position.x += (goal.x - group.position.x) * e;
    group.position.y += (goal.y - group.position.y) * ey;
    const s = group.scale.x + (goal.scale - group.scale.x) * e;
    group.scale.setScalar(s);
    uniforms.uAlpha.value += (goal.alpha - uniforms.uAlpha.value) * ease(0.05);
    uniforms.uTint.value += (goal.tint - uniforms.uTint.value) * ease(0.04);
    uniforms.uFill.value += (fillT - uniforms.uFill.value) * ease(0.07);
    uniforms.uPush.value += ((reduceMotion ? 0 : pushT) - uniforms.uPush.value) * ease(0.08);
    uniforms.uTime.value = t;

    // pointer in the particle system's own space
    group.updateMatrixWorld();
    ray.set(pxT, -pyT, 0.5).unproject(camera).sub(camera.position).normalize();
    const dist = -camera.position.z / ray.z;
    tmp.copy(camera.position).addScaledVector(ray, dist);
    uniforms.uPointer.value.copy(group.worldToLocal(tmp));

    // engine labels
    if (shape === 'engines' && !small) {
      for (let k = 0; k < 5; k++) {
        const a = engineAngle(k);
        tmp.set(Math.cos(a) * ENGINE_R, 0.66, Math.sin(a) * ENGINE_R);
        group.localToWorld(tmp).project(camera);
        const x = (tmp.x * 0.5 + 0.5) * innerWidth, y = (-tmp.y * 0.5 + 0.5) * innerHeight;
        labels[k].style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      }
    }

    renderer.render(scene, camera);
  }

  addEventListener('resize', layout);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; last = now(); frame(); }
  });
  // the word is drawn with the display font, so rebuild it once that font has loaded
  if (document.fonts && document.fonts.load) {
    document.fonts.load('italic 400 270px "Instrument Serif"').then(() => {
      delete cache.word;
      if (shape === 'word') { target = shapeOf('word').pos; morphUntil = now() + 4; }
    }).catch(() => {});
  }

  layout();
  stage.ready = true;
  frame();
}

/* ------------------------------------------------------------------ */
/* Page behaviour                                                      */
/* ------------------------------------------------------------------ */

function selectEngine(k) {
  const e = ENGINES[k];
  $$('.engine-tabs button').forEach((b, i) => b.setAttribute('aria-selected', String(i === k)));
  $('#engine-name').textContent = e.name;
  $('#engine-text').textContent = e.text;
  $('#engine-bots').innerHTML = e.bots.map((b) => `<code>${b}</code>`).join('');
  $('#engine-check').textContent = e.check;
  const card = $('#engine-card');
  card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap');
  stage.selEngine(k);
}

function initEngines() {
  $$('.engine-tabs button').forEach((b) => b.addEventListener('click', () => selectEngine(Number(b.dataset.engine))));
  selectEngine(0);
}

function initAreas() {
  $$('#areas li').forEach((li) => {
    const k = Number(li.dataset.area);
    const on = () => { $$('#areas li').forEach((o) => o.classList.toggle('on', o === li)); stage.setSel(k); };
    const off = () => { li.classList.remove('on'); stage.setSel(-1); };
    li.addEventListener('pointerenter', on); li.addEventListener('focus', on);
    li.addEventListener('pointerleave', off); li.addEventListener('blur', off);
    li.addEventListener('click', on);
  });
}

function initDemo() {
  const BASE = 34;
  const num = $('#demo-num'), band = $('#demo-band');
  let shown = BASE, raf = 0;
  const paint = (v) => {
    num.textContent = String(Math.round(v));
    band.textContent = BANDS.find(([limit]) => v < limit)[1];
  };
  const update = () => {
    const goal = BASE + $$('#toggles input:checked').reduce((a, i) => a + Number(i.dataset.gain), 0);
    stage.setFill(goal / 100);
    cancelAnimationFrame(raf);
    if (reduceMotion) { shown = goal; paint(shown); return; }
    const step = () => {
      shown += (goal - shown) * 0.14;
      if (Math.abs(goal - shown) < 0.4) { shown = goal; paint(shown); return; }
      paint(shown); raf = requestAnimationFrame(step);
    };
    step();
  };
  $$('#toggles input').forEach((i) => i.addEventListener('change', update));
  paint(BASE); stage.setFill(BASE / 100);
}

function initForm() {
  const form = $('#form'), note = $('#form-note');
  const site = $('#f-site'), email = $('#f-email'), pack = $('#f-pack');
  $('#foot-mail').href = `mailto:${CONFIG.email}`;
  $('#foot-mail').textContent = CONFIG.email;
  $$('[data-pack]').forEach((b) => b.addEventListener('click', () => { pack.value = b.dataset.pack; }));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    let url = site.value.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    let okUrl = false;
    try { okUrl = /\.[a-z]{2,}$/i.test(new URL(url).hostname); } catch (err) { okUrl = false; }
    const okMail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim());
    site.classList.toggle('bad', !okUrl); email.classList.toggle('bad', !okMail);
    if (!okUrl || !okMail) {
      note.className = 'form-note err';
      note.textContent = !okUrl ? 'Please enter your website address, for example yourbusiness.com.' : 'Please enter an email address we can reply to.';
      (!okUrl ? site : email).focus();
      return;
    }
    const body = [`Website: ${url}`, `Reply to: ${email.value.trim()}`, `Interested in: ${pack.value}`, '', $('#f-note').value.trim()].join('\n');
    const link = `mailto:${CONFIG.email}?subject=${encodeURIComponent(`Snapshot request: ${new URL(url).hostname}`)}&body=${encodeURIComponent(body)}`;
    note.className = 'form-note ok';
    note.textContent = `Your email app should open now. If it does not, write to ${CONFIG.email}.`;
    location.href = link;
  });
}

function initScroll() {
  const panels = $$('.panel');
  const nav = $('#nav');
  const links = $$('.nav-links a');
  let current = null, queued = false;
  const check = () => {
    queued = false;
    nav.classList.toggle('stuck', scrollY > 30);
    const mid = innerHeight / 2;
    let best = null, bestD = Infinity;
    for (const p of panels) {
      const r = p.getBoundingClientRect();
      const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best && best !== current) {
      current = best;
      stage.setShape(best.dataset.shape, best.dataset.side);
      links.forEach((a) => a.classList.toggle('cur', a.getAttribute('href') === `#${best.id}`));
    }
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(check); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', () => { current = null; queue(); });
  check();
  return () => { current = null; check(); };
}

function initReveal() {
  if (reduceMotion || !('IntersectionObserver' in window)) return;
  const sel = '.eyebrow, h1, h2, .lede, .col-text > p, .actions, .engine-tabs, .engine-card, .areas li, .steps li, .demo, .card, .faq details, .form';
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('.panel').forEach((p) => {
    $$(sel, p).forEach((el, i) => {
      el.classList.add('reveal'); el.style.setProperty('--d', `${Math.min(i, 8) * 70}ms`);
      io.observe(el);
    });
  });
}

initEngines();
initAreas();
initDemo();
initForm();
initReveal();
const recheck = initScroll();
startStage().then(() => {
  // hand the current state to the stage once it exists
  recheck();
  const sel = $('.engine-tabs button[aria-selected="true"]');
  stage.selEngine(sel ? Number(sel.dataset.engine) : 0);
  const goal = 34 + $$('#toggles input:checked').reduce((a, i) => a + Number(i.dataset.gain), 0);
  stage.setFill(goal / 100);
});
