(function(){
'use strict';
/* ============================================================
   UI layer: works with or without WebGL.
   Scroll timeline -> global value S (scene index + local progress)
   ============================================================ */
const WA_PHONE = '5577988671946';
const WA_TEXT = {
  orcamento: 'Olá! Gostaria de solicitar um orçamento, por favor.',
  especialista: 'Olá! Gostaria de falar com um especialista da Brasmak.',
  assistencia: 'Olá! Preciso de assistência técnica para o meu aparelho.',
  outro: 'Olá! Gostaria de saber se vocês consertam o meu aparelho.'
};
const waLink = (kind, item) => {
  let t = WA_TEXT[kind] || WA_TEXT.orcamento;
  if (kind === 'assistencia' && item) t = 'Olá! Preciso de assistência técnica para ' + item + '.';
  return 'https://api.whatsapp.com/send/?phone=' + WA_PHONE + '&text=' + encodeURIComponent(t);
};
document.querySelectorAll('[data-wa]').forEach(a => { a.href = waLink(a.dataset.wa, a.dataset.item); });

const $ = s => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const MQ_REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const IS_MOBILE = IS_TOUCH || innerWidth < 760;

document.documentElement.classList.add('js');

/* ---------- piecewise keyframe helper: keys [[x, v], ...] ---------- */
function keyed(keys, x) {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (x <= b[0]) { const t = (x - a[0]) / (b[0] - a[0]); const s = t * t * (3 - 2 * t); return a[1] + (b[1] - a[1]) * s; }
  }
  return keys[keys.length - 1][1];
}

/* ---------- Narrative temperature (drives HUD + appliance displays) ---------- */
const TEMP_KEYS = [[0, 26], [0.15, 26], [1, 20], [1.4, 12], [1.85, 4], [2.05, 4], [2.8, -18], [10, -18]];
const tempAt = S => keyed(TEMP_KEYS, S);
function tempContext(S) {
  if (S < 0.9) return 'Cozinha numa tarde comum';
  if (S < 1.75) return 'Geladeira resfriando';
  if (S < 2.15) return 'Geladeira no ponto: 3 a 5 °C';
  if (S < 2.75) return 'Freezer congelando';
  return 'Freezer funcionando';
}

/* ---------- Scroll timeline ---------- */
const scenes = [...document.querySelectorAll('.scene')];
const comercial = $('#comercial');
const TL = { target: 0, sections: scenes.length };

function manualProgress() {
  // Fallback if GSAP is unavailable: identical mapping to the ScrollTrigger setup below.
  const vh = innerHeight, y = scrollY;
  let S = 0;
  scenes.forEach((sec, i) => {
    const top = sec.offsetTop, h = sec.offsetHeight;
    const start = i === 0 ? top : top - vh, end = top + h - vh;
    const p = clamp((y - start) / Math.max(1, end - start));
    if (y >= start) S = i + p;
  });
  const ct = comercial.offsetTop - vh;
  if (y >= ct) S = scenes.length + clamp((y - ct) / vh);
  return S;
}

function initTimeline(onChange) {
  const G = window.gsap, ST = window.ScrollTrigger;
  if (G && ST) {
    G.registerPlugin(ST);
    const prog = new Array(scenes.length + 1).fill(0);
    const recompute = () => {
      let S = 0;
      for (let i = 0; i < prog.length; i++) if (prog[i] > 0 || i === 0) S = i + prog[i];
      TL.target = S; onChange(S);
    };
    scenes.forEach((sec, i) => {
      ST.create({
        trigger: sec, start: i === 0 ? 'top top' : 'top bottom', end: 'bottom bottom',
        onUpdate: self => { prog[i] = self.progress; recompute(); },
        onRefresh: self => { prog[i] = self.progress; recompute(); }
      });
    });
    ST.create({
      trigger: comercial, start: 'top bottom', end: '+=' + innerHeight,
      onUpdate: self => { prog[scenes.length] = self.progress; recompute(); },
      onRefresh: self => { prog[scenes.length] = self.progress; recompute(); }
    });
    addEventListener('load', () => ST.refresh());
  } else {
    const upd = () => { TL.target = manualProgress(); onChange(TL.target); };
    addEventListener('scroll', upd, { passive: true });
    addEventListener('resize', upd);
    upd();
  }
}

/* ---------- HUD, beats, chapters, progress ---------- */
const hud = { el: $('#hud-temp'), val: $('#hud-val'), ctx: $('#hud-ctx'), lastT: null, lastCtx: '' };
const chapterLinks = [...document.querySelectorAll('#chapters a')];
const progressBar = $('#progress');
const beatsBySection = scenes.map(sec => [...sec.querySelectorAll('.beat')]);

function updateUI(S) {
  // thermometer
  const T = Math.round(tempAt(S));
  if (T !== hud.lastT) {
    hud.lastT = T;
    hud.val.innerHTML = (T < 0 ? '−' + Math.abs(T) : T) + '<sup>°C</sup>';
    const pos = (T + 18) / 44;
    hud.el.style.setProperty('--t-pos', (pos * 100).toFixed(1) + '%');
    const warm = clamp((T - 6) / 20);
    hud.el.style.setProperty('--t-color', `rgb(${Math.round(lerp(169, 255, warm))},${Math.round(lerp(216, 157, warm))},${Math.round(lerp(255, 92, warm))})`);
  }
  const c = tempContext(S);
  if (c !== hud.ctx.textContent) hud.ctx.textContent = c;
  hud.el.classList.toggle('hud-hidden', S > 3.6);
  // beats inside the active scene section
  const i = Math.floor(S), p = S - i;
  beatsBySection.forEach((list, k) => list.forEach(b => {
    const on = k === i && p >= +b.dataset.in && p < +b.dataset.out;
    b.classList.toggle('on', on);
  }));
  // chapter rail
  let active = 0;
  chapterLinks.forEach((a, k) => { if (S >= +a.dataset.ch - 0.02) active = k; });
  chapterLinks.forEach((a, k) => a.classList.toggle('on', k === active));
  // overall progress bar
  const max = document.documentElement.scrollHeight - innerHeight;
  progressBar.style.setProperty('--p', clamp(scrollY / Math.max(1, max)).toFixed(4));
}

/* ---------- Cursor + magnetic buttons (desktop only) ---------- */
if (!IS_TOUCH && !MQ_REDUCED) {
  const cur = $('#cursor');
  let mx = -100, my = -100, cx = -100, cy = -100;
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; cur.classList.add('on'); }, { passive: true });
  document.addEventListener('pointerleave', () => cur.classList.remove('on'));
  (function loop() { cx += (mx - cx) * 0.22; cy += (my - cy) * 0.22; cur.style.transform = `translate(${cx}px,${cy}px)`; requestAnimationFrame(loop); })();
  document.querySelectorAll('a,button,summary').forEach(el => {
    el.addEventListener('pointerenter', () => cur.classList.add('hover'));
    el.addEventListener('pointerleave', () => cur.classList.remove('hover'));
  });
  document.querySelectorAll('.btn').forEach(b => {
    b.addEventListener('pointermove', e => {
      const r = b.getBoundingClientRect();
      b.style.setProperty('--tx', ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + 'px');
      b.style.setProperty('--ty', ((e.clientY - r.top - r.height / 2) * 0.28).toFixed(1) + 'px');
    });
    b.addEventListener('pointerleave', () => { b.style.setProperty('--tx', '0px'); b.style.setProperty('--ty', '0px'); });
  });
}

/* ---------- Copy buttons ---------- */
document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => {
  const t = b.dataset.copy;
  const done = () => { b.textContent = 'Copiado'; setTimeout(() => (b.textContent = 'Copiar'), 1600); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => selectText(b.previousElementSibling));
  else selectText(b.previousElementSibling);
}));
function selectText(el) { if (!el) return; const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

/* ---------- Footer snow (2D canvas, only while visible) ---------- */
(function footSnow() {
  const cv = $('#foot-snow'); if (!cv || MQ_REDUCED) return;
  const g = cv.getContext('2d'); let W = 0, H = 0, on = false, flakes = [];
  const resize = () => { const d = Math.min(devicePixelRatio, 2); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * d; cv.height = H * d; g.setTransform(d, 0, 0, d, 0, 0); };
  const N = IS_MOBILE ? 50 : 110;
  for (let i = 0; i < N; i++) flakes.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 2.2, s: 0.15 + Math.random() * 0.5, ph: Math.random() * 6.28 });
  new IntersectionObserver(es => { on = es[0].isIntersecting; if (on) { resize(); tick(); } }).observe(cv);
  addEventListener('resize', () => on && resize());
  let t0 = performance.now();
  function tick() {
    if (!on) return;
    const now = performance.now(), dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    g.clearRect(0, 0, W, H);
    for (const f of flakes) {
      f.y += f.s * dt * 0.08 * (H > 0 ? 600 / H : 1); f.ph += dt * 0.6;
      if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
      const x = (f.x + Math.sin(f.ph) * 0.01) * W, y = f.y * H;
      g.globalAlpha = 0.25 + f.r / 4; g.fillStyle = '#dff0ff';
      g.beginPath(); g.arc(x, y, f.r, 0, 6.283); g.fill();
    }
    requestAnimationFrame(tick);
  }
})();

/* ---------- Ambient sound (synthesised with WebAudio: no files, starts only on click) ---------- */
const Sound = (() => {
  let ctx = null, master, wind, windF, hum, water, waterF, on = false;
  const btn = $('#sound'), lbl = $('#sound-lbl');
  function noiseBuffer(c) { const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = b.getChannelData(0); let last = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } return b; }
  function whiteBuffer(c) { const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  function start() {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    // wind: brown noise through a moving bandpass
    const ns = ctx.createBufferSource(); ns.buffer = noiseBuffer(ctx); ns.loop = true;
    windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 500; windF.Q.value = 0.7;
    wind = ctx.createGain(); wind.gain.value = 0; ns.connect(windF).connect(wind).connect(master); ns.start();
    // appliance hum: low oscillators, lowpassed
    hum = ctx.createGain(); hum.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    [55, 110, 165].forEach((f, i) => { const o = ctx.createOscillator(); o.type = i ? 'sine' : 'triangle'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = [0.5, 0.25, 0.08][i]; o.connect(g).connect(lp); o.start(); });
    lp.connect(hum).connect(master);
    // water: white noise bandpassed high
    const ws = ctx.createBufferSource(); ws.buffer = whiteBuffer(ctx); ws.loop = true;
    waterF = ctx.createBiquadFilter(); waterF.type = 'bandpass'; waterF.frequency.value = 1800; waterF.Q.value = 0.9;
    water = ctx.createGain(); water.gain.value = 0; ws.connect(waterF).connect(water).connect(master); ws.start();
    return true;
  }
  function crackle(amount) {
    if (!on || !ctx || Math.random() > amount) return;
    const len = 0.012 + Math.random() * 0.03, b = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const s = ctx.createBufferSource(); s.buffer = b; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500 + Math.random() * 3000;
    const g = ctx.createGain(); g.gain.value = 0.05 + Math.random() * 0.08; s.connect(f).connect(g).connect(master); s.start();
  }
  function set(p) { // p: {wind, hum, water, ice}
    if (!on || !ctx) return;
    const t = ctx.currentTime;
    wind.gain.setTargetAtTime(0.02 + p.wind * 0.16, t, 0.4);
    windF.frequency.setTargetAtTime(380 + p.wind * 520 + Math.sin(t * 0.4) * 120, t, 0.6);
    hum.gain.setTargetAtTime(p.hum * 0.05, t, 0.5);
    water.gain.setTargetAtTime(p.water * 0.06, t, 0.3);
    waterF.frequency.setTargetAtTime(1400 + p.water * 900, t, 0.5);
    crackle(p.ice * 0.35);
  }
  btn.addEventListener('click', () => {
    if (!ctx && !start()) { lbl.textContent = 'Sem áudio'; return; }
    on = !on;
    if (on) ctx.resume();
    master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.4);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Desativar som ambiente' : 'Ativar som ambiente');
    lbl.textContent = on ? 'Som ligado' : 'Som';
  });
  return { set, get on() { return on; } };
})();

/* ---------- Loader with real step progress ---------- */
const Loader = (() => {
  const fill = $('#loader-fill'), step = $('#loader-step'), el = $('#loader');
  let total = 1, done = 0;
  return {
    plan(n) { total = n; done = 0; fill.style.width = '0%'; },
    tick(label) { done++; fill.style.width = Math.round(done / total * 100) + '%'; if (label) step.textContent = label; },
    say(label) { step.textContent = label; },
    finish() { fill.style.width = '100%'; el.classList.add('done'); el.setAttribute('aria-busy', 'false'); setTimeout(() => el.remove(), 1200); }
  };
})();
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

/* ============================================================
   WebGL core: renderer, studio environment, procedural textures,
   PBR material library, geometry helpers, particle systems
   (snow / cold mist), surface frost and the screen-ice post pass.
   ============================================================ */
const GLSL_NOISE = `
float hash3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i),hash3(i+vec3(1.0,0.0,0.0)),f.x),mix(hash3(i+vec3(0.0,1.0,0.0)),hash3(i+vec3(1.0,1.0,0.0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0.0,0.0,1.0)),hash3(i+vec3(1.0,0.0,1.0)),f.x),mix(hash3(i+vec3(0.0,1.0,1.0)),hash3(i+vec3(1.0,1.0,1.0)),f.x),f.y),f.z); }
float fbm3(vec3 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*noise3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
float ridge3(vec3 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*(1.0-abs(noise3(p)*2.0-1.0)); p=p*2.17+vec3(3.1,1.3,7.7); a*=0.5; } return s; }
float hash2(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float noise2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash2(i),hash2(i+vec2(1.0,0.0)),f.x),mix(hash2(i+vec2(0.0,1.0)),hash2(i+vec2(1.0,1.0)),f.x),f.y); }
float fbm2(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*noise2(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
float ridge2(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*(1.0-abs(noise2(p)*2.0-1.0)); p=p*2.11+vec2(3.1,1.3); a*=0.5; } return s; }
`;

const HQ = !IS_MOBILE && (navigator.hardwareConcurrency || 8) > 4 && !(navigator.deviceMemory && navigator.deviceMemory < 4);
const LOW = IS_MOBILE && ((navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory && navigator.deviceMemory <= 3));
const U = { time: { value: 0 } };             // shared uniforms
const SHARED = new Set();                      // materials/textures never disposed with a world

/* ---------- Renderer ---------- */
function createRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: !IS_MOBILE, powerPreference: 'high-performance', alpha: false, stencil: false });
  r.outputEncoding = THREE.sRGBEncoding;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  r.shadowMap.enabled = HQ;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.setClearColor(0x020409, 1);
  return r;
}

/* ---------- Studio environment for reflections (generated, no HDR download) ---------- */
function buildEnvironment(renderer) {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x0b1018, side: THREE.BackSide }));
  room.scale.set(18, 9, 18); room.position.y = 3.5; s.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshBasicMaterial({ color: 0x05070a }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.95; s.add(floor);
  const panel = (w, h, x, y, z, rx, ry, col, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m);
  };
  panel(7, 1.6, 0, 7.9, 0.5, Math.PI / 2, 0, 0xffffff, 3.4);       // overhead softbox
  panel(1.4, 6, -8.9, 3.5, 0.5, 0, Math.PI / 2, 0xd7ebff, 2.6);    // left strip (cool white)
  panel(1.0, 6, 8.9, 3.5, -2.5, 0, -Math.PI / 2, 0x4aa6ff, 2.4);   // right strip (signal blue)
  panel(10, 2.4, 0, 3.2, -8.9, 0, 0, 0xffffff, 0.8);                // back wash
  panel(5, 1.2, 2.5, 1.6, 8.9, 0, Math.PI, 0xffd6b0, 1.1);          // low warm kicker
  panel(2.2, 2.2, -4, 6, 6, Math.PI / 3, 0, 0xeaf4ff, 1.6);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.035);
  pm.dispose();
  s.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return rt.texture;
}

/* ---------- Procedural textures ---------- */
function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
  if (opts.srgb) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = opts.aniso || 4;
  return t;
}
const TEX = {};
function buildTextures(renderer) {
  const an = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // brushed stainless: long vertical streaks (used as roughness + subtle bump)
  TEX.brushed = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = 'rgb(176,176,176)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) {
      const v = 120 + Math.random() * 135 | 0, x = Math.random() * w, len = 60 + Math.random() * 420, y = Math.random() * h;
      g.fillStyle = `rgba(${v},${v},${v},${0.05 + Math.random() * 0.16})`;
      g.fillRect(x, y, 0.6 + Math.random() * 1.1, len); g.fillRect(x, y - h, 0.6 + Math.random() * 1.1, len);
    }
  }, { repeat: [1, 1], aniso: an });
  // perforated drum steel
  TEX.perf = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c9ccd0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b2e33';
    const step = 16;
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      g.beginPath(); g.arc(x + ((y / step) % 2 ? step / 2 : 0) + 4, y + 8, 2.8, 0, 6.283); g.fill();
    }
  }, { repeat: [10, 4], srgb: true, aniso: an });
  // microwave door mesh (alpha: white = opaque metal, black holes = see-through)
  TEX.mesh = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#000';
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) { g.beginPath(); g.arc(x + ((y / 8) % 2 ? 4 : 0) + 2, y + 4, 2.6, 0, 6.283); g.fill(); }
  }, { repeat: [14, 10], aniso: an });
  // soft contact shadow
  TEX.shadow = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  // blue halo (light bloom behind products)
  TEX.halo = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(120,200,255,0.9)'); gr.addColorStop(0.25, 'rgba(60,150,255,0.35)'); gr.addColorStop(0.6, 'rgba(30,90,200,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { srgb: true });
  // speckled stone (counter)
  TEX.stone = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#23272d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 30 + Math.random() * 70 | 0; g.fillStyle = `rgba(${v},${v + 4},${v + 10},${Math.random() * 0.5})`; g.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4); }
  }, { repeat: [3, 2], srgb: true, aniso: an });
  Object.values(TEX).forEach(t => SHARED.add(t));
}

/* ---------- Material library ---------- */
const M = {};
function glassMat(o = {}) {
  const base = { color: o.color ?? 0xffffff, roughness: o.roughness ?? 0.04, metalness: 0, envMapIntensity: o.env ?? 1.3, depthWrite: false };
  if (HQ) return new THREE.MeshPhysicalMaterial(Object.assign(base, {
    transmission: 1, thickness: o.thickness ?? 0.02, ior: o.ior ?? 1.5, transparent: !!o.transparent, opacity: 1,
    attenuationColor: new THREE.Color(o.tint ?? 0xffffff), attenuationDistance: o.atten ?? 1.5, specularIntensity: 1, clearcoat: o.clearcoat ?? 0
  }));
  return new THREE.MeshPhysicalMaterial(Object.assign(base, { transparent: true, opacity: o.opacity ?? 0.22, clearcoat: 1, clearcoatRoughness: 0.05 }));
}
function buildMaterials() {
  const P = p => new THREE.MeshPhysicalMaterial(p);
  M.steel = P({ color: 0xd9dee4, metalness: 1, roughness: 0.42, roughnessMap: TEX.brushed, bumpMap: TEX.brushed, bumpScale: 0.0006, envMapIntensity: 1.15, clearcoat: 0.25, clearcoatRoughness: 0.3 });
  M.steelSide = P({ color: 0x9aa3ad, metalness: 1, roughness: 0.5, roughnessMap: TEX.brushed, envMapIntensity: 0.9 });
  M.chrome = P({ color: 0xf4f6f8, metalness: 1, roughness: 0.09, envMapIntensity: 1.5 });
  M.satin = P({ color: 0xbfc6ce, metalness: 1, roughness: 0.28, envMapIntensity: 1.2 });
  M.liner = P({ color: 0xf1f5f9, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.18, envMapIntensity: 0.9 });
  M.linerGrey = P({ color: 0xc9d1d9, metalness: 0.65, roughness: 0.45, envMapIntensity: 1.0 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.82, envMapIntensity: 0.4 });
  M.blackGlass = P({ color: 0x050709, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4 });
  M.enamel = P({ color: 0xf2f5f8, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.0 });
  M.graphite = P({ color: 0x2c3239, metalness: 0.6, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.16, envMapIntensity: 1.1 });
  M.plastic = P({ color: 0xeef1f4, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.8 });
  M.darkPlastic = P({ color: 0x15191e, roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.4, envMapIntensity: 0.7 });
  M.softTouch = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.78, envMapIntensity: 0.5 });
  M.glass = glassMat({ roughness: 0.03, thickness: 0.006 });
  M.frostedGlass = glassMat({ roughness: 0.35, thickness: 0.01, opacity: 0.35 });
  M.tintGlass = glassMat({ color: 0xbfe2ff, tint: 0x9fd0ff, roughness: 0.05, thickness: 0.03, atten: 0.6, opacity: 0.3 });
  M.ice = glassMat({ color: 0xd6efff, tint: 0x7fc4ff, roughness: 0.12, thickness: 0.4, ior: 1.31, atten: 0.9, opacity: 0.45, env: 1.6 });
  M.waterClear = HQ ? glassMat({ color: 0xe9f6ff, tint: 0x8fd0ff, roughness: 0.0, ior: 1.33, thickness: 0.02, atten: 0.4 })
                    : new THREE.MeshPhysicalMaterial({ color: 0xbfe4ff, roughness: 0.02, transparent: true, opacity: 0.5, envMapIntensity: 1.6, depthWrite: false });
  M.waterTint = new THREE.MeshPhysicalMaterial({ color: 0x7fc3f3, roughness: 0.04, transparent: true, opacity: 0.42, envMapIntensity: 1.6, depthWrite: false, clearcoat: 1 });
  M.floor = P({ color: 0x06080c, roughness: 0.32, metalness: 0.2, envMapIntensity: 0.6 });
  M.shadow = new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false, opacity: 0.85, toneMapped: false });
  Object.values(M).forEach(m => SHARED.add(m));
}
function phys(p) { return new THREE.MeshPhysicalMaterial(p); }
function glow(color, k = 1) { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: true }); m.userData.base = new THREE.Color(color); return m; }

/* ---------- Geometry helpers ---------- */
// Rounded box (port of three/examples RoundedBoxGeometry, uv kept per face)
function rbox(w, h, d, r = 0.01, seg = 3) {
  const segs = seg * 2 + 1;
  r = Math.min(w / 2, h / 2, d / 2, r);
  const geo = new THREE.BoxGeometry(1, 1, 1, segs, segs, segs).toNonIndexed();
  const pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
  const box = new THREE.Vector3(w, h, d).divideScalar(2).subScalar(r);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), half = 0.5 / segs;
  for (let i = 0; i < pos.length; i += 3) {
    v.fromArray(pos, i); n.copy(v);
    n.x -= Math.sign(n.x) * half; n.y -= Math.sign(n.y) * half; n.z -= Math.sign(n.z) * half; n.normalize();
    pos[i] = box.x * Math.sign(v.x) + n.x * r; pos[i + 1] = box.y * Math.sign(v.y) + n.y * r; pos[i + 2] = box.z * Math.sign(v.z) + n.z * r;
    nor[i] = n.x; nor[i + 1] = n.y; nor[i + 2] = n.z;
  }
  geo.attributes.position.needsUpdate = true;
  return geo;
}
function roundedRectShape(w, h, r, cx = 0, cy = 0) {
  const s = new THREE.Shape(), x = cx - w / 2, y = cy - h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function mesh(geo, mat, x = 0, y = 0, z = 0, parent, opts = {}) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  m.castShadow = HQ && opts.cast !== false; m.receiveShadow = HQ && opts.receive !== false;
  if (parent) parent.add(m);
  return m;
}
function contactShadow(parent, w, d, x = 0, z = 0, o = 0.85) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.shadow);
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.002, z); m.renderOrder = 1; m.material = M.shadow;
  if (o !== 0.85) { m.material = M.shadow.clone(); m.material.opacity = o; }
  parent.add(m); return m;
}
function floorPlane(parent, mat) {
  const f = new THREE.Mesh(new THREE.CircleGeometry(14, 64), mat || M.floor);
  f.rotation.x = -Math.PI / 2; f.receiveShadow = HQ; parent.add(f); return f;
}
function lathe(points, seg = 48) { return new THREE.LatheGeometry(points.map(p => new THREE.Vector2(p[0], p[1])), seg); }

/* ---------- Canvas display (appliance LCDs) ---------- */
function makeDisplay(w, h, pxW = 256, pxH = 128) {
  const c = document.createElement('canvas'); c.width = pxW; c.height = pxH;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  let last = null;
  m.userData.draw = (key, fn) => { if (key === last) return; last = key; g.clearRect(0, 0, pxW, pxH); fn(g, pxW, pxH); tex.needsUpdate = true; };
  return m;
}
function fmtTemp(T) { const r = Math.round(T); return (r < 0 ? '−' + Math.abs(r) : String(r)); }
function drawTempLCD(g, w, h, T, label) {
  g.fillStyle = 'rgba(4,10,18,0.0)'; g.fillRect(0, 0, w, h);
  g.shadowColor = '#5fc4ff'; g.shadowBlur = 14; g.fillStyle = '#bfe7ff';
  g.font = `500 ${h * 0.56}px "IBM Plex Mono", monospace`; g.textBaseline = 'middle'; g.textAlign = 'right';
  g.fillText(fmtTemp(T), w * 0.66, h * 0.5);
  g.font = `500 ${h * 0.22}px "IBM Plex Mono", monospace`; g.textAlign = 'left';
  g.fillText('°C', w * 0.69, h * 0.36);
  g.shadowBlur = 6; g.fillStyle = 'rgba(191,231,255,.65)'; g.font = `500 ${h * 0.14}px "IBM Plex Mono", monospace`;
  g.fillText(label || '', w * 0.69, h * 0.66);
  // snowflake glyph
  g.strokeStyle = '#8fd3ff'; g.lineWidth = 2; g.save(); g.translate(w * 0.13, h * 0.5);
  for (let i = 0; i < 3; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(-h * 0.17, 0); g.lineTo(h * 0.17, 0); g.stroke(); }
  g.restore();
}

/* ---------- Snow: GPU particles, world-anchored wrap box around the camera ---------- */
function createSnow(count) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), seed = new Float32Array(count * 4), rnd = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    rnd.set([Math.random(), Math.random(), Math.random()], i * 3);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime: U.time, uDensity: { value: 0 }, uWater: { value: 0 }, uScale: { value: 800 }, uFocus: { value: 3 }, uOpacity: { value: 1 },
      uBox: { value: new THREE.Vector3(9, 6, 9) }, uCenter: { value: new THREE.Vector3() }, uDrift: { value: new THREE.Vector3() },
      uColor: { value: new THREE.Color(0.93, 0.97, 1.0) }, uWaterColor: { value: new THREE.Color(0.72, 0.88, 1.0) }
    },
    vertexShader: `
      attribute vec4 aSeed; attribute vec3 aRnd;
      uniform float uTime, uDensity, uWater, uScale, uFocus, uOpacity;
      uniform vec3 uBox, uCenter, uDrift;
      varying float vA, vBlur, vRot, vShape, vWater;
      void main(){
        float spd = mix(0.55, 1.35, aSeed.w);
        vec3 wp = aSeed.xyz*uBox + vec3(uDrift.x*(0.6+0.8*aRnd.x), -uDrift.y*spd, uDrift.z*(aRnd.z-0.5));
        wp.x += sin(uTime*(0.4+aRnd.y*0.6) + aRnd.z*40.0)*0.22*(1.0-uWater);
        wp.z += cos(uTime*(0.3+aRnd.x*0.5) + aRnd.y*30.0)*0.18*(1.0-uWater);
        vec3 rel = mod(wp - uCenter + uBox*0.5, uBox) - uBox*0.5;
        vec3 pos = uCenter + rel;
        vec4 mv = modelViewMatrix*vec4(pos, 1.0);
        float dist = max(-mv.z, 0.05);
        float vis = step(aRnd.x, uDensity);
        vec3 nr = abs(rel/uBox)*2.0;
        float edge = 1.0 - smoothstep(0.75, 1.0, max(nr.x, max(nr.y, nr.z)));
        float size = mix(0.010, 0.042, pow(aRnd.y, 2.5));
        size = mix(size, size*0.6, uWater);
        float blur = clamp(abs(dist - uFocus)/(uFocus*1.2 + 0.5), 0.0, 1.0);
        gl_PointSize = clamp(size*uScale/dist*(1.0 + blur*1.6), 0.0, 90.0);
        vA = vis*edge*uOpacity*(1.0 - blur*0.55)*smoothstep(0.12, 0.6, dist)*mix(0.5, 1.0, aRnd.z);
        vBlur = blur; vRot = uTime*(aSeed.w - 0.5)*2.4 + aRnd.z*6.283; vShape = aRnd.z; vWater = uWater;
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor, uWaterColor;
      varying float vA, vBlur, vRot, vShape, vWater;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float cs = cos(vRot), sn = sin(vRot);
        vec2 p = vec2(c.x*cs - c.y*sn, c.x*sn + c.y*cs);
        float r = length(p)*2.0;
        float soft = smoothstep(1.0, 0.0, r);
        float a = atan(p.y, p.x);
        float arms = pow(abs(cos(a*3.0)), 10.0);
        float star = smoothstep(1.0, 0.15, r)*(0.2 + 0.8*arms) + smoothstep(0.35, 0.0, r);
        float flake = vShape > 0.55 ? clamp(star, 0.0, 1.0) : pow(soft, 1.6);
        flake = mix(flake, pow(soft, 2.0)*0.7, vBlur);
        vec2 q = c*vec2(3.4, 1.0);
        float drop = smoothstep(0.5, 0.0, length(q));
        float shape = mix(flake, drop, vWater);
        float alpha = shape*vA;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(mix(uColor, uWaterColor, vWater), alpha);
      }`
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 5;
  return pts;
}

/* ---------- Cold mist / air flow: soft sprites emitted from a box ---------- */
function createFlow(count, maxSize) {
  const g = new THREE.BufferGeometry();
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seed[i] = Math.random();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime: U.time, uAmount: { value: 0 }, uSpeed: { value: 0.25 }, uSize: { value: 0.5 }, uScale: { value: 800 }, uTurb: { value: 0.12 }, uMax: { value: maxSize },
      uOrigin: { value: new THREE.Vector3() }, uSpread: { value: new THREE.Vector3(0.3, 0.05, 0.05) }, uDir: { value: new THREE.Vector3(0, -0.1, 0.5) },
      uGravity: { value: new THREE.Vector3(0, -0.5, 0) }, uColor: { value: new THREE.Color(0.85, 0.93, 1.0) }, uOpacity: { value: 0.16 }
    },
    vertexShader: `
      attribute vec4 aSeed;
      uniform float uTime, uAmount, uSpeed, uSize, uScale, uTurb, uMax;
      uniform vec3 uOrigin, uSpread, uDir, uGravity;
      varying float vA; varying vec2 vSeed; varying float vLife;
      void main(){
        float life = fract(uTime*uSpeed*(0.65 + aSeed.w*0.7) + aSeed.x*7.31);
        vec3 r = aSeed.xyz*2.0 - 1.0;
        vec3 pos = uOrigin + uSpread*r + uDir*life*(0.7 + 0.6*aSeed.y) + uGravity*life*life;
        pos.x += sin(life*5.0 + aSeed.z*20.0)*uTurb*life + r.x*life*uTurb*1.4;
        pos.z += cos(life*4.0 + aSeed.y*20.0)*uTurb*life + r.z*life*uTurb*1.4;
        vec4 mv = modelViewMatrix*vec4(pos, 1.0);
        float dist = max(-mv.z, 0.05);
        float vis = step(fract(aSeed.w*13.17), uAmount);
        float sz = uSize*(0.45 + life*1.1)*(0.6 + 0.8*aSeed.z);
        gl_PointSize = clamp(sz*uScale/dist, 0.0, uMax);
        vA = vis*sin(3.14159*life)*smoothstep(0.08, 0.45, dist);
        vSeed = aSeed.xy*10.0; vLife = life;
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: GLSL_NOISE + `
      uniform vec3 uColor; uniform float uOpacity;
      varying float vA; varying vec2 vSeed; varying float vLife;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float r = length(c)*2.0;
        float n = noise2(gl_PointCoord*2.5 + vSeed + vLife*1.5);
        float a = smoothstep(1.0, 0.0, r)*(0.4 + 0.8*n)*vA*uOpacity;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
      }`
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 6;
  return pts;
}
function flowSet(f, o) {
  const u = f.material.uniforms;
  for (const k in o) {
    const v = o[k];
    if (Array.isArray(v)) u[k].value.set(v[0], v[1], v[2]); else if (v instanceof THREE.Color) u[k].value.copy(v); else u[k].value = v;
  }
}

/* ---------- Surface frost: overlay that grows from the edges of any mesh ---------- */
function frostMaterial(geo, scale = 16) {
  geo.computeBoundingBox();
  const size = new THREE.Vector3(), c = new THREE.Vector3();
  geo.boundingBox.getSize(size); geo.boundingBox.getCenter(c);
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { uFrost: { value: 0 }, uHalf: { value: size.multiplyScalar(0.5) }, uCenter: { value: c }, uScale: { value: scale }, uLight: { value: new THREE.Vector3(0.3, 1, 0.6).normalize() }, uTime: U.time },
    vertexShader: `
      varying vec3 vP; varying vec3 vWN; varying vec3 vWP;
      void main(){ vP = position; vWN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vWP = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: GLSL_NOISE + `
      uniform float uFrost, uScale, uTime; uniform vec3 uHalf, uCenter, uLight;
      varying vec3 vP; varying vec3 vWN; varying vec3 vWP;
      void main(){
        vec3 m = uHalf - abs(vP - uCenter);
        float mn = min(m.x, min(m.y, m.z)), mx = max(m.x, max(m.y, m.z));
        float dEdge = m.x + m.y + m.z - mn - mx;
        float edge = 1.0 - smoothstep(0.0, 0.2, dEdge);
        float r = ridge3(vP*uScale);
        float f = edge*0.78 + fbm3(vP*5.0)*0.42 + r*0.16;
        float th = 1.18 - uFrost*1.28;
        float a = smoothstep(th, th + 0.12, f);
        if (a < 0.01) discard;
        float crystal = pow(r, 3.0);
        vec3 col = mix(vec3(0.60, 0.79, 0.95), vec3(0.97, 0.99, 1.0), crystal);
        float lit = 0.5 + 0.5*max(dot(normalize(vWN), uLight), 0.0);
        vec3 V = normalize(cameraPosition - vWP);
        float glint = pow(noise3(vP*180.0 + V*6.0), 22.0)*4.0;
        gl_FragColor = vec4(col*lit + glint, a*(0.55 + 0.42*crystal));
      }`
  });
}
function addFrost(target, list, scale) {
  const fm = new THREE.Mesh(target.geometry, frostMaterial(target.geometry, scale));
  fm.renderOrder = 3; target.add(fm); list.push(fm.material); return fm;
}

/* ---------- Screen post: vignette, fade, grain and the ice-on-screen effect ---------- */
function createPost(renderer) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    uniforms: {
      tScene: { value: null }, uHasScene: { value: 0 }, uIce: { value: 0 }, uMelt: { value: 0 }, uFade: { value: 0 }, uFadeColor: { value: new THREE.Color(0, 0, 0) },
      uTime: U.time, uAspect: { value: 1 }, uVig: { value: 0.75 }, uGrain: { value: 0.035 }
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: GLSL_NOISE + `
      uniform sampler2D tScene; uniform float uHasScene, uIce, uMelt, uFade, uTime, uAspect, uVig, uGrain; uniform vec3 uFadeColor;
      varying vec2 vUv;
      void main(){
        vec2 uv = vUv;
        vec2 q = vec2(uv.x*uAspect, uv.y);
        vec4 o = uHasScene > 0.5 ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(0.0);
        if (uIce > 0.001) {
          vec2 cc = abs(uv*2.0 - 1.0);
          float corner = clamp(length(cc)/1.4142, 0.0, 1.0);
          float edge = max(cc.x, cc.y);
          float f = corner*0.62 + edge*0.28 + fbm2(q*3.2)*0.42 + ridge2(q*7.0)*0.12;
          if (uMelt > 0.5) f += (fbm2(vec2(q.x*9.0, q.y*1.3 + uTime*0.04)) - 0.5)*0.32;
          float th = 1.32 - uIce*1.6;
          float mask = smoothstep(th, th + 0.1, f);
          float e = 0.003;
          float h = ridge2(q*11.0);
          vec2 grad = vec2(ridge2((q + vec2(e, 0.0))*11.0) - h, ridge2((q + vec2(0.0, e))*11.0) - h)/e;
          vec2 off = grad*0.0004*mask + (vec2(noise2(q*6.0 + uTime*0.2), noise2(q*6.0 - uTime*0.2)) - 0.5)*0.008*uIce;
          vec3 s = vec3(0.0);
          if (uHasScene > 0.5) {
            float b = 0.007*mask;
            s = texture2D(tScene, uv + off).rgb*0.36
              + (texture2D(tScene, uv + off + vec2(b, 0.0)).rgb + texture2D(tScene, uv + off - vec2(b, 0.0)).rgb
              +  texture2D(tScene, uv + off + vec2(0.0, b)).rgb + texture2D(tScene, uv + off - vec2(0.0, b)).rgb)*0.16;
          }
          float crystal = pow(h, 2.2);
          vec3 frost = mix(vec3(0.52, 0.73, 0.92), vec3(0.95, 0.985, 1.0), crystal);
          vec3 nrm = normalize(vec3(-grad*0.02, 1.0));
          float spec = pow(clamp(dot(nrm, normalize(vec3(0.35, 0.55, 0.75))), 0.0, 1.0), 28.0);
          float opa = mask*mix(0.4 + crystal*0.45, 0.97, smoothstep(0.84, 1.0, uIce));
          o.rgb = s*(1.0 - opa) + frost*opa + spec*mask*0.35;
          o.a = uHasScene > 0.5 ? 1.0 : opa;
          vec3 mist = vec3(0.22, 0.48, 0.85)*0.2*uIce*(1.0 - mask);
          o.rgb += mist; o.a = max(o.a, 0.18*uIce*(1.0 - mask)*step(uHasScene, 0.5));
        }
        float v = smoothstep(0.42, 1.25, length((uv - 0.5)*vec2(uAspect, 1.0)*1.25))*uVig;
        o.rgb *= (1.0 - v); o.a = v + o.a*(1.0 - v);
        o.rgb = o.rgb*(1.0 - uFade) + uFadeColor*uFade; o.a = uFade + o.a*(1.0 - uFade);
        float gr = (hash2(uv*1000.0 + fract(uTime*7.0)) - 0.5)*uGrain;
        o.rgb += gr*o.a;
        gl_FragColor = o;
      }`
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let fbTex = null, fbW = 0, fbH = 0;
  return {
    mat, scene, cam,
    ensureTex(w, h) {
      if (fbTex && fbW === w && fbH === h) return fbTex;
      if (fbTex) fbTex.dispose();
      fbTex = new THREE.FramebufferTexture(w, h, THREE.RGBAFormat); fbW = w; fbH = h;
      fbTex.minFilter = fbTex.magFilter = THREE.LinearFilter;
      return fbTex;
    }
  };
}

/* ============================================================
   Worlds: one procedural appliance set per chapter.
   Each world is built lazily, updated from S (pure function of scroll
   + idle time) and disposed when far away.
   Camera keys: [t, px, py, pz, lx, ly, lz]
   ============================================================ */
function camKeys(keys, u, C) {
  u = clamp(u);
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1];
  let k = clamp((u - a[0]) / (b[0] - a[0]));
  k = k * k * k * (k * (k * 6 - 15) + 10);
  C.pos.set(lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k));
  C.look.set(lerp(a[4], b[4], k), lerp(a[5], b[5], k), lerp(a[6], b[6], k));
}
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const ease = { outCubic: t => 1 - Math.pow(1 - t, 3), inOut: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2 };
function setGlow(m, k) { m.color.copy(m.userData.base).multiplyScalar(k); }
function halo(parent, size, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: TEX.halo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 }));
  m.position.set(x, y, z); m.renderOrder = -1; parent.add(m); return m;
}

/* ---------------- Water shader (washer drum, tanquinho) ---------------- */
function waterMaterial(o = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: U.time, uLevel: { value: -0.12 }, uTilt: { value: 0 }, uFill: { value: 0 }, uClip: { value: o.clip ? 1 : 0 }, uSwirl: { value: 0 }, uPhase: { value: 0 }, uColor: { value: new THREE.Color(o.color || 0x2a7fc0) } },
    vertexShader: `
      uniform float uTime, uSwirl, uClip;
      varying vec3 vL; varying vec3 vW; varying vec3 vN;
      void main(){
        vec3 p = position;
        if (uClip < 0.5) { float r = length(p.xz); p.y += sin(r*70.0 - uTime*6.0)*0.0022*uSwirl + sin(p.x*45.0 + uTime*3.0)*0.0012; }
        vL = p; vec4 w = modelMatrix*vec4(p, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal);
        gl_Position = projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: GLSL_NOISE + `
      uniform float uTime, uLevel, uTilt, uFill, uClip, uSwirl, uPhase; uniform vec3 uColor;
      varying vec3 vL; varying vec3 vW; varying vec3 vN;
      void main(){
        if (uClip > 0.5) { vec2 n = vec2(sin(uTilt), cos(uTilt)); if (dot(vL.xy, n) > uLevel + 0.006*sin(vL.z*40.0 + uTime*6.0)) discard; }
        vec3 V = normalize(cameraPosition - vW); vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
        float fr = pow(1.0 - abs(dot(V, N)), 3.0);
        float r = length(vL.xz);
        float ang = atan(vL.z, vL.x) + uPhase;
        float caustic = pow(abs(sin(vW.x*70.0 + uTime*3.0)*sin(vW.z*60.0 - uTime*2.2 + vW.y*30.0)), 5.0);
        float foam = smoothstep(0.58, 0.85, noise2(vec2(ang*4.0, r*28.0 + uTime*0.6)))*uSwirl*(1.0 - uClip);
        vec3 col = uColor*0.55 + fr*vec3(0.75, 0.9, 1.0)*0.8 + caustic*0.16 + foam*0.65;
        float a = (0.5 + fr*0.4 + foam*0.35)*uFill;
        gl_FragColor = vec4(col, a);
      }`
  });
}

/* =====================================================================
   1. FRIDGE  (S 0 → 2): hero reveal + doors opening
   ===================================================================== */
function buildFridge() {
  const W = 0.84, H = 1.78, D = 0.62, DT = 0.065, t = 0.03, y0 = 0.07, zF = D / 2;
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const frosts = [];
  floorPlane(g);
  contactShadow(g, 1.6, 1.5, 0, 0.1);
  const haloM = halo(g, 5.2, 0, 1.0, -1.3);

  // cabinet shell
  const side = rbox(t, H - y0, D, 0.006, 2);
  const sL = mesh(side, M.steelSide, -W / 2 + t / 2, y0 + (H - y0) / 2, 0, body);
  const sR = mesh(side, M.steelSide, W / 2 - t / 2, y0 + (H - y0) / 2, 0, body);
  const top = mesh(rbox(W, t, D, 0.006, 2), M.steelSide, 0, H - t / 2, 0, body);
  mesh(new THREE.BoxGeometry(W - 2 * t, H - y0, t), M.steelSide, 0, y0 + (H - y0) / 2, -D / 2 + t / 2, body);
  const mull = mesh(new THREE.BoxGeometry(W - 2 * t, 0.04, D - t), M.liner, 0, 0.715, t / 2, body);
  mesh(new THREE.BoxGeometry(W - 0.03, y0, 0.05), M.rubber, 0, y0 / 2, zF - 0.06, body);
  for (let i = 0; i < 9; i++) mesh(new THREE.BoxGeometry(0.06, 0.006, 0.004), M.satin, -0.32 + i * 0.08, 0.04, zF - 0.034, body, { cast: false });

  // inner liner (5 planes) + frost growing from their edges
  const cy0 = 0.735, cy1 = H - t, ch = cy1 - cy0, cyc = (cy0 + cy1) / 2, cx = W / 2 - t, czb = -D / 2 + t, cd = zF - czb, czc = (czb + zF) / 2;
  const lin = (w, h, x, y, z, rx, ry) => { const m = mesh(new THREE.PlaneGeometry(w, h), M.liner, x, y, z, body, { cast: false }); m.rotation.set(rx, ry, 0); return m; };
  const liners = [
    lin(2 * cx, ch, 0, cyc, czb + 0.001, 0, 0),
    lin(cd, ch, -cx + 0.001, cyc, czc, 0, Math.PI / 2),
    lin(cd, ch, cx - 0.001, cyc, czc, 0, -Math.PI / 2),
    lin(2 * cx, cd, 0, cy1 - 0.001, czc, Math.PI / 2, 0),
    lin(2 * cx, cd, 0, cy0 + 0.001, czc, -Math.PI / 2, 0)
  ];
  [...liners, sL, sR, top, mull].forEach(m => addFrost(m, frosts, 18));

  // shelves (glass + satin trim)
  [0.98, 1.22, 1.46].forEach(y => {
    mesh(new THREE.BoxGeometry(2 * cx - 0.01, 0.007, 0.47), M.glass, 0, y, -0.035, body, { cast: false });
    mesh(new THREE.BoxGeometry(2 * cx - 0.01, 0.02, 0.012), M.satin, 0, y, 0.2, body);
  });
  // crisper drawers with produce
  const R = rng(7);
  [-1, 1].forEach(s => {
    const x = s * 0.19;
    mesh(new THREE.BoxGeometry(0.36, 0.17, 0.008), M.frostedGlass, x, 0.83, 0.19, body, { cast: false });
    mesh(new THREE.BoxGeometry(0.36, 0.006, 0.44), M.frostedGlass, x, 0.925, -0.03, body, { cast: false });
    const cols = s < 0 ? [0xc8361f, 0xd8442a, 0xb02a1a, 0xc23a22] : [0x7fb13a, 0x93c447, 0x6a9b2f, 0x88b83e];
    for (let i = 0; i < 4; i++) {
      const r = 0.034 + R() * 0.01;
      mesh(new THREE.SphereGeometry(r, 24, 16), phys({ color: cols[i], roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2 }), x - 0.11 + (i % 3) * 0.1, 0.745 + r, -0.12 + (i > 2 ? 0.1 : (i % 2) * 0.12), body);
    }
  });
  // bottles, cartons, containers, cans
  const bottleGeo = lathe([[0, 0], [0.032, 0], [0.034, 0.004], [0.034, 0.13], [0.03, 0.15], [0.013, 0.18], [0.012, 0.2], [0, 0.2]], 32);
  const bMats = [glassMat({ color: 0xa8e0b2, tint: 0x3e8f4e, thickness: 0.03, atten: 0.12, opacity: 0.55 }), glassMat({ color: 0xffd9a2, tint: 0xb06a1c, thickness: 0.03, atten: 0.12, opacity: 0.55 })];
  for (let i = 0; i < 4; i++) mesh(bottleGeo, bMats[i % 2], -0.29 + i * 0.075, 0.984, -0.14 + (i % 2) * 0.05, body);
  const cartonGeo = rbox(0.07, 0.18, 0.07, 0.004, 1), cartonMat = phys({ color: 0xf5f5f1, roughness: 0.55 }), capMat = phys({ color: 0x1d6fd1, roughness: 0.35, clearcoat: 1 });
  for (let i = 0; i < 2; i++) { const c = mesh(cartonGeo, cartonMat, 0.12 + i * 0.09, 1.224 + 0.09, -0.11, body); mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 16), capMat, 0.015, 0.095, 0.01, c); }
  mesh(rbox(0.18, 0.08, 0.14, 0.012, 2), glassMat({ roughness: 0.18, opacity: 0.3 }), -0.2, 1.466 + 0.04, -0.07, body);
  const canGeo = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 32), canMats = [phys({ color: 0xb8202a, metalness: 0.8, roughness: 0.3, clearcoat: 1 }), M.satin];
  for (let i = 0; i < 3; i++) mesh(canGeo, canMats[i % 2], 0.08 + i * 0.075, 1.466 + 0.064, 0.02 - (i % 2) * 0.06, body);
  mesh(rbox(0.16, 0.06, 0.12, 0.01, 2), phys({ color: 0xffffff, roughness: 0.2, transmission: HQ ? 0.6 : 0, transparent: !HQ, opacity: HQ ? 1 : 0.6 }), -0.2, 1.224 + 0.034, -0.05, body);

  // interior light sources (emissive)
  const ledMat = glow(0xeaf5ff, 0), diffMat = glow(0xd6ebff, 0);
  mesh(new THREE.BoxGeometry(0.5, 0.008, 0.02), ledMat, 0, cy1 - 0.008, 0.2, body, { cast: false });
  mesh(new THREE.PlaneGeometry(0.52, 0.05), diffMat, 0, 1.69, czb + 0.003, body, { cast: false });

  // doors (French door, hinged at outer edges)
  const doorW = W / 2 - 0.003, doorH = H - 0.74, doorY = 0.74 + doorH / 2;
  const doorGeo = rbox(doorW, doorH, DT, 0.012, 3);
  let lcd = null;
  const mkDoor = s => {
    const pivot = new THREE.Group(); pivot.position.set(s * W / 2, 0, zF); body.add(pivot);
    const dir = -s, cx_ = dir * doorW / 2;
    mesh(doorGeo, M.steel, cx_, doorY, DT / 2, pivot);
    const gw = doorW - 0.02, gh = doorH - 0.02, gt = 0.014;
    [[gw, gt, 0, gh / 2 - gt / 2], [gw, gt, 0, -gh / 2 + gt / 2], [gt, gh, gw / 2 - gt / 2, 0], [gt, gh, -gw / 2 + gt / 2, 0]]
      .forEach(a => mesh(new THREE.BoxGeometry(a[0], a[1], 0.012), M.rubber, cx_ + a[2], doorY + a[3], -0.006, pivot, { cast: false }));
    mesh(new THREE.BoxGeometry(doorW - 0.05, doorH - 0.05, 0.01), M.liner, cx_, doorY, -0.005, pivot, { cast: false });
    [0.86, 1.12, 1.42].forEach((y, k) => {
      mesh(new THREE.BoxGeometry(doorW - 0.08, 0.075, 0.006), M.frostedGlass, cx_, y + 0.035, -0.088, pivot, { cast: false });
      mesh(new THREE.BoxGeometry(doorW - 0.08, 0.006, 0.085), M.plastic, cx_, y, -0.045, pivot, { cast: false });
      if (k === 0) for (let i = 0; i < 3; i++) mesh(bottleGeo, bMats[(i + (s > 0 ? 1 : 0)) % 2], cx_ - 0.1 + i * 0.1, y + 0.003, -0.045, pivot);
    });
    const hx = cx_ + dir * (doorW / 2 - 0.05), hy = 1.18, hl = 0.62;
    mesh(new THREE.CylinderGeometry(0.011, 0.011, hl, 24), M.chrome, hx, hy, DT + 0.04, pivot);
    [hy - hl / 2 + 0.05, hy + hl / 2 - 0.05].forEach(y => { const m = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 16), M.chrome, hx, y, DT + 0.02, pivot); m.rotation.x = Math.PI / 2; });
    if (s < 0) {
      mesh(rbox(0.13, 0.06, 0.004, 0.006, 2), M.blackGlass, hx - dir * 0.11, 1.56, DT + 0.002, pivot, { cast: false });
      lcd = makeDisplay(0.12, 0.05); lcd.position.set(hx - dir * 0.11, 1.56, DT + 0.0045); pivot.add(lcd);
    }
    return pivot;
  };
  const doorL = mkDoor(-1), doorR = mkDoor(1);

  // freezer drawer, hinge caps, brand plate, feet
  const drawerH = 0.65;
  mesh(rbox(W - 0.006, drawerH, DT, 0.012, 3), M.steel, 0, 0.075 + drawerH / 2, zF + DT / 2, body);
  const dh = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.62, 24), M.chrome, 0, 0.67, zF + DT + 0.04, body); dh.rotation.z = Math.PI / 2;
  [-0.26, 0.26].forEach(x => { const m = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 16), M.chrome, x, 0.67, zF + DT + 0.02, body); m.rotation.x = Math.PI / 2; });
  [-1, 1].forEach(s => mesh(rbox(0.06, 0.014, 0.085, 0.004, 1), M.satin, s * (W / 2 - 0.035), H + 0.007, zF + 0.02, body));
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.03), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, map: canvasTex(512, 64, (c, w, h) => {
    c.font = '400 40px Michroma, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(40,46,54,0.75)'; if (c.letterSpacing !== undefined) c.letterSpacing = '14px'; c.fillText('BRASMAK', w / 2, h / 2 + 2);
  }, { srgb: true }) }));
  plate.position.set(0, 0.55, zF + DT + 0.0012); body.add(plate);

  const KEYS = [
    [0.00, 0.0, 1.05, 7.2, 0, 1.0, 0],
    [0.25, 1.9, 1.25, 4.6, 0, 0.98, 0],
    [0.50, 2.25, 1.0, 3.5, 0, 0.95, 0.1],
    [0.62, -1.25, 1.35, 3.4, 0, 1.05, 0.1],
    [0.78, 0.0, 1.22, 2.95, 0, 1.15, 0],
    [0.90, 0.1, 1.25, 1.55, 0, 1.2, -0.1],
    [1.00, 0.0, 1.2, 0.42, 0, 1.18, -0.32]
  ];
  return {
    group: g,
    update(S, time, dt, C, L, FX) {
      const u = clamp(S / 2);
      camKeys(KEYS, u, C);
      C.pos.z += (1 - C.intro) * 2.4; C.pos.y += (1 - C.intro) * 0.25;
      C.shift[0] *= 1 - smooth(1.5, 1.85, S);
      C.focus = C.pos.distanceTo(C.look);
      body.rotation.y = keyed([[0, -0.46], [0.6, -0.2], [1.1, 0.14], [1.3, 0], [2, 0]], S) + (MQ_REDUCED ? 0 : Math.sin(time * 0.25) * 0.012 * (1 - smooth(1, 1.3, S)));
      const open = ease.outCubic(smooth(1.25, 1.56, S)) * 1.95;
      doorL.rotation.y = -open; doorR.rotation.y = open;
      let li = smooth(1.29, 1.46, S); if (S > 1.31 && S < 1.325) li *= 0.25;   // tiny start-up flicker
      setGlow(ledMat, li * 3.2); setGlow(diffMat, li * 2.2);
      L.inA.color.set(0xeaf4ff); L.inA.intensity = li * 2.4; L.inA.distance = 1.6; L.inA.position.set(-0.12, 1.62, 0.05);
      L.inB.color.set(0xdcefff); L.inB.intensity = li * 1.6; L.inB.distance = 1.4; L.inB.position.set(0.12, 1.05, 0.1);
      const warm = keyed([[0, 1], [0.9, 0.55], [1.5, 0.08], [2, 0]], S);
      const it = C.intro;
      L.key.color.setRGB(lerp(0.86, 1, warm), lerp(0.93, 0.86, warm), lerp(1, 0.72, warm)); L.key.intensity = (2.2 + warm * 0.6) * it;
      L.key.position.set(2.4, 4.4, 3.2); L.key.target.position.set(0, 0.9, 0);
      L.warm.color.set(0xff8a3d); L.warm.intensity = warm * 2.6 * it; L.warm.position.set(-2.2, 1.2, 1.8); L.warm.distance = 7;
      L.rimA.color.set(0x5fb2ff); L.rimA.intensity = (0.9 + (1 - warm) * 0.9) * it; L.rimA.position.set(-3, 2.5, -3);
      L.rimB.color.set(0xffffff); L.rimB.intensity = 0.55 * it; L.rimB.position.set(3, 3, -2);
      L.accent.color.set(0x3aa8ff); L.accent.intensity = smooth(0, 0.35, it) * 2.2; L.accent.position.set(0, 1.0, -1.2); L.accent.distance = 5;
      L.hemi.intensity = 0.18 + (1 - warm) * 0.12;
      haloM.material.opacity = smooth(0, 0.4, it) * (0.75 - 0.35 * smooth(1, 2, S));
      haloM.lookAt(C.pos);
      C.bg.setRGB(lerp(0.010, 0.040, warm), lerp(0.016, 0.026, warm), lerp(0.030, 0.020, warm));
      C.fog = 0.07;
      C.exposure = 1.0 + li * 0.08;
      const fr = smooth(1.55, 1.95, S); frosts.forEach(m => (m.uniforms.uFrost.value = fr));
      const mist = smooth(1.38, 1.62, S);
      flowSet(FX.flowA, { uAmount: mist, uOrigin: [0, 0.86, 0.34], uSpread: [0.36, 0.1, 0.04], uDir: [0, -0.12, 0.6], uGravity: [0, -0.62, 0.15], uSize: 0.55, uSpeed: 0.22, uTurb: 0.16, uOpacity: 0.13 });
      flowSet(FX.flowB, { uAmount: mist * 0.7, uOrigin: [0, 1.35, 0.25], uSpread: [0.34, 0.35, 0.05], uDir: [0, -0.25, 0.35], uGravity: [0, -0.35, 0.1], uSize: 0.4, uSpeed: 0.18, uTurb: 0.1, uOpacity: 0.08 });
      C.hum = 0.4 + li * 0.6;
      if (lcd) lcd.userData.draw(Math.round(C.temp), (c, w, h) => drawTempLCD(c, w, h, C.temp, 'BRASMAK'));
    }
  };
}

/* =====================================================================
   2. FREEZER (S 2 → 3.5): chest freezer in an ice cavern
   ===================================================================== */
function buildFreezer() {
  const W = 1.12, H = 0.86, D = 0.66, wt = 0.06;
  const g = new THREE.Group(), frosts = [];
  const floor = floorPlane(g, phys({ color: 0x0c1a29, roughness: 0.16, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9 }));
  addFrost(floor, frosts, 2.2);
  contactShadow(g, 1.9, 1.3, 0, 0);
  const haloM = halo(g, 6, 0, 1.1, -2.2);
  const body = new THREE.Group(); g.add(body);
  const walls = [
    mesh(rbox(W, H - 0.05, wt, 0.012, 2), M.enamel, 0, 0.05 + (H - 0.05) / 2, D / 2 - wt / 2, body),
    mesh(rbox(W, H - 0.05, wt, 0.012, 2), M.enamel, 0, 0.05 + (H - 0.05) / 2, -D / 2 + wt / 2, body),
    mesh(rbox(wt, H - 0.05, D - 2 * wt + 0.002, 0.012, 2), M.enamel, -W / 2 + wt / 2, 0.05 + (H - 0.05) / 2, 0, body),
    mesh(rbox(wt, H - 0.05, D - 2 * wt + 0.002, 0.012, 2), M.enamel, W / 2 - wt / 2, 0.05 + (H - 0.05) / 2, 0, body)
  ];
  mesh(new THREE.BoxGeometry(W - 0.02, 0.05, D - 0.02), M.rubber, 0, 0.025, 0, body);
  mesh(new THREE.BoxGeometry(W - 2 * wt, 0.06, D - 2 * wt), M.enamel, 0, 0.08, 0, body);
  const ix = W / 2 - wt, iz = D / 2 - wt, iy0 = 0.11, ih = H - iy0, iyc = iy0 + ih / 2;
  const lin = (w, h, x, y, z, rx, ry) => { const m = mesh(new THREE.PlaneGeometry(w, h), M.linerGrey, x, y, z, body, { cast: false }); m.rotation.set(rx, ry, 0); return m; };
  const liners = [
    lin(2 * ix, ih, 0, iyc, -iz + 0.001, 0, 0), lin(2 * ix, ih, 0, iyc, iz - 0.001, 0, Math.PI),
    lin(2 * iz, ih, -ix + 0.001, iyc, 0, 0, Math.PI / 2), lin(2 * iz, ih, ix - 0.001, iyc, 0, 0, -Math.PI / 2),
    lin(2 * ix, 2 * iz, 0, iy0 + 0.001, 0, -Math.PI / 2, 0)
  ];
  [...walls, ...liners].forEach(m => addFrost(m, frosts, 16));
  // wire basket + frozen goods + ice
  const wire = M.chrome, bx = 0.24, bz = -0.06, by = 0.62, bw = 0.46, bd = 0.42, bh = 0.2;
  for (let i = 0; i <= 8; i++) { mesh(new THREE.BoxGeometry(0.004, 0.004, bd), wire, bx - bw / 2 + i * bw / 8, by - bh / 2, bz, body, { cast: false }); }
  [[bw, 0.005, 0, bh / 2, bd / 2], [bw, 0.005, 0, bh / 2, -bd / 2], [bw, 0.004, 0, -bh / 2, bd / 2], [bw, 0.004, 0, -bh / 2, -bd / 2]].forEach(a => mesh(new THREE.BoxGeometry(a[0], a[1], 0.005), wire, bx + a[2], by + a[3], bz + a[4], body, { cast: false }));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => mesh(new THREE.BoxGeometry(0.005, bh, 0.005), wire, bx + sx * bw / 2, by, bz + sz * bd / 2, body, { cast: false }));
  for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(0.005, bh, 0.003), wire, bx - bw / 2 + (i + 1) * bw / 6, by, bz + bd / 2, body, { cast: false });
  const R = rng(21), cube = rbox(0.045, 0.045, 0.045, 0.009, 2);
  for (let i = 0; i < 12; i++) { const m = mesh(cube, M.ice, bx - 0.16 + (i % 4) * 0.1 + R() * 0.02, by - bh / 2 + 0.03 + Math.floor(i / 8) * 0.05, bz - 0.12 + (Math.floor(i / 4) % 2) * 0.12 + R() * 0.03, body); m.rotation.set(R(), R(), R()); }
  const pk = [phys({ color: 0xdfe8f0, roughness: 0.7 }), phys({ color: 0x9fb8cf, roughness: 0.6 }), phys({ color: 0xc94a3a, roughness: 0.5, clearcoat: 0.6 })];
  const goods = [];
  for (let i = 0; i < 6; i++) { const b = mesh(rbox(0.16 + R() * 0.08, 0.06 + R() * 0.05, 0.12 + R() * 0.06, 0.012, 2), pk[i % 3], -0.3 + (i % 3) * 0.17, 0.15 + Math.floor(i / 3) * 0.1, -0.12 + (i % 2) * 0.22, body); b.rotation.y = R() * 0.4 - 0.2; goods.push(b); }
  goods.forEach(b => addFrost(b, frosts, 30));
  // control panel
  mesh(rbox(0.17, 0.075, 0.006, 0.008, 2), M.blackGlass, 0.36, H - 0.14, D / 2 + 0.003, body, { cast: false });
  const lcd = makeDisplay(0.15, 0.065); lcd.position.set(0.36, H - 0.14, D / 2 + 0.0068); body.add(lcd);
  const ledMat = glow(0x5fc4ff, 2); mesh(new THREE.SphereGeometry(0.004, 12, 8), ledMat, 0.26, H - 0.14, D / 2 + 0.006, body, { cast: false });
  // lid (hinged at back)
  const lid = new THREE.Group(); lid.position.set(0, H, -D / 2); body.add(lid);
  const lidTop = mesh(rbox(W + 0.012, 0.075, D + 0.012, 0.016, 3), M.enamel, 0, 0.0375, D / 2, lid);
  const lidIn = mesh(new THREE.BoxGeometry(W - 0.15, 0.024, D - 0.15), M.plastic, 0, -0.008, D / 2, lid, { cast: false });
  [[W - 0.05, 0.014, 0, (D - 0.05) / 2], [W - 0.05, 0.014, 0, -(D - 0.05) / 2]].forEach(a => mesh(new THREE.BoxGeometry(a[0], 0.012, a[1]), M.rubber, a[2], -0.004, D / 2 + a[3], lid, { cast: false }));
  [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(0.014, 0.012, D - 0.05), M.rubber, s * (W - 0.05) / 2, -0.004, D / 2, lid, { cast: false }));
  mesh(rbox(0.32, 0.026, 0.03, 0.01, 2), M.darkPlastic, 0, 0.03, D + 0.012, lid);
  addFrost(lidIn, frosts, 20);
  // ice cavern: hexagonal crystals
  const crystalGeo = lathe([[0, 0], [0.5, 0.06], [0.5, 0.72], [0, 1]], 6);
  const iceFlat = M.ice.clone(); iceFlat.flatShading = true;
  const Rc = rng(5);
  for (let i = 0; i < (IS_MOBILE ? 14 : 24); i++) {
    const a = Math.PI * (0.35 + Rc() * 1.3) + (Rc() < 0.25 ? Math.PI * 0.9 : 0);
    const r = 2.3 + Rc() * 4.2, h = 0.6 + Rc() * 2.6, w = 0.12 + Rc() * 0.38;
    const m = mesh(crystalGeo, iceFlat, Math.cos(a) * r, -0.05, -Math.abs(Math.sin(a)) * r - 0.6, g, { cast: false });
    m.scale.set(w, h, w); m.rotation.set((Rc() - 0.5) * 0.5, Rc() * 6, (Rc() - 0.5) * 0.6);
  }
  const KEYS = [
    [0.00, 2.8, 2.0, 3.6, 0, 0.45, 0],
    [0.20, 1.6, 1.5, 2.6, 0, 0.5, 0],
    [0.40, 0.0, 2.05, 2.0, 0, 0.55, -0.05],
    [0.55, 0.62, 1.12, 1.0, 0.25, 0.82, 0.22],
    [0.67, -0.25, 1.35, 1.5, 0, 0.6, 0],
    [1.00, 0.0, 1.95, 2.45, 0, 0.5, 0]
  ];
  return {
    group: g,
    update(S, time, dt, C, L, FX) {
      const u = clamp((S - 2) / 1.5);
      camKeys(KEYS, u, C);
      C.focus = C.pos.distanceTo(C.look);
      const open = ease.outCubic(smooth(2.12, 2.42, S));
      lid.rotation.x = -open * 1.62;
      const fr = smooth(2.25, 2.95, S); frosts.forEach(m => (m.uniforms.uFrost.value = fr));
      L.key.color.set(0xe6f3ff); L.key.intensity = 2.6; L.key.position.set(1.8, 4.2, 2.6); L.key.target.position.set(0, 0.5, 0);
      L.rimA.color.set(0x3f9dff); L.rimA.intensity = 2.0; L.rimA.position.set(-3, 2, -3);
      L.rimB.color.set(0xbfe6ff); L.rimB.intensity = 1.0; L.rimB.position.set(3, 2.5, -2);
      L.inA.color.set(0x9fdcff); L.inA.intensity = open * 2.4; L.inA.distance = 1.4; L.inA.position.set(0, 0.62, 0);
      L.accent.color.set(0x2f8dff); L.accent.intensity = 2.2; L.accent.distance = 7; L.accent.position.set(0, 1.4, -2.6);
      L.hemi.intensity = 0.45; L.hemi.color.set(0x9fcfff);
      haloM.material.opacity = 0.55; haloM.lookAt(C.pos);
      C.bg.setRGB(0.016, 0.05, 0.095); C.fog = 0.085;
      flowSet(FX.flowA, { uAmount: open, uOrigin: [0, H + 0.02, D / 2 - 0.04], uSpread: [0.52, 0.03, 0.03], uDir: [0, -0.05, 0.55], uGravity: [0, -0.95, 0.1], uSize: 0.45, uSpeed: 0.24, uTurb: 0.14, uOpacity: 0.16 });
      flowSet(FX.flowB, { uAmount: open * 0.8, uOrigin: [0, 0.7, 0], uSpread: [0.46, 0.08, 0.24], uDir: [0, 0.55, 0.08], uGravity: [0, -0.3, 0.05], uSize: 0.35, uSpeed: 0.2, uTurb: 0.12, uOpacity: 0.1 });
      C.hum = 0.8;
      lcd.userData.draw(Math.round(C.temp), (c, w, h) => drawTempLCD(c, w, h, C.temp, 'FREEZER'));
    }
  };
}

/* =====================================================================
   3. WASHER (S 3.5 → 5): front loader, door, drum, water
   ===================================================================== */
function buildWasher() {
  const W = 0.6, H = 0.85, D = 0.6, cyD = 0.42;
  const g = new THREE.Group(); floorPlane(g); contactShadow(g, 1.1, 1.1, 0, 0);
  const haloM = halo(g, 4, 0, 0.6, -1.3);
  const body = new THREE.Group(); g.add(body);
  mesh(rbox(W, 0.03, D, 0.012, 2), M.graphite, 0, H - 0.015, 0, body);
  [-1, 1].forEach(s => mesh(rbox(0.03, H - 0.03, D, 0.012, 2), M.graphite, s * (W / 2 - 0.015), (H - 0.03) / 2, 0, body));
  mesh(new THREE.BoxGeometry(W - 0.06, H - 0.03, 0.02), M.graphite, 0, (H - 0.03) / 2, -D / 2 + 0.01, body);
  mesh(new THREE.BoxGeometry(W - 0.02, 0.04, D - 0.04), M.rubber, 0, 0.02, 0, body);
  // front panel with porthole (extruded shape with a hole)
  const shape = roundedRectShape(W, H - 0.03, 0.02, 0, (H - 0.03) / 2);
  const hole = new THREE.Path(); hole.absarc(0, cyD, 0.175, 0, Math.PI * 2, true); shape.holes.push(hole);
  const front = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 48 }), M.graphite, 0, 0, D / 2 - 0.026, body);
  mesh(new THREE.TorusGeometry(0.176, 0.016, 16, 64), M.rubber, 0, cyD, D / 2 - 0.02, body, { cast: false });
  // control strip
  mesh(rbox(W - 0.05, 0.09, 0.008, 0.01, 2), M.blackGlass, 0, 0.765, D / 2 + 0.003, body, { cast: false });
  const knob = mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.03, 40), M.satin, -0.19, 0.765, D / 2 + 0.02, body); knob.rotation.x = Math.PI / 2;
  const lcd = makeDisplay(0.14, 0.05); lcd.position.set(0.12, 0.765, D / 2 + 0.0075); body.add(lcd);
  // drum (rotating)
  const drumZ = D / 2 - 0.03 - 0.21;
  const drum = new THREE.Group(); drum.position.set(0, cyD, drumZ); body.add(drum);
  const drumMat = phys({ color: 0xffffff, map: TEX.perf, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide, envMapIntensity: 1.2 });
  const cyl = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.42, 64, 1, true), drumMat, 0, 0, 0, drum, { cast: false }); cyl.rotation.x = Math.PI / 2;
  const back = mesh(new THREE.CircleGeometry(0.19, 64), phys({ color: 0xc4c9cf, metalness: 0.9, roughness: 0.3 }), 0, 0, -0.209, drum, { cast: false });
  for (let i = 0; i < 6; i++) { const r = mesh(new THREE.BoxGeometry(0.004, 0.17, 0.004), M.satin, 0, 0, -0.205, drum, { cast: false }); r.rotation.z = i * Math.PI / 6; }
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3, l = mesh(rbox(0.035, 0.03, 0.38, 0.01, 2), M.satin, Math.cos(a) * 0.172, Math.sin(a) * 0.172, 0, drum, { cast: false }); l.rotation.z = a; }
  // clothes: two soft noisy blobs tumbling
  const clothGeo = new THREE.SphereGeometry(0.07, 32, 20), pa = clothGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), n = 1 + 0.25 * Math.sin(x * 60) * Math.cos(y * 50) * Math.sin(z * 40); pa.setXYZ(i, x * n * 1.3, y * n * 0.75, z * n); }
  clothGeo.computeVertexNormals();
  const cloth = [mesh(clothGeo, new THREE.MeshStandardMaterial({ color: 0x1f3c66, roughness: 0.95 }), 0, 0, 0, body), mesh(clothGeo, new THREE.MeshStandardMaterial({ color: 0xe6e9ee, roughness: 0.95 }), 0, 0, 0, body)];
  // water (clipped cylinder + tilted surface)
  const water = new THREE.Group(); water.position.set(0, cyD, drumZ); body.add(water);
  const wGeo = new THREE.CylinderGeometry(0.184, 0.184, 0.4, 64, 1, true); wGeo.rotateX(Math.PI / 2);
  const wMat = waterMaterial({ clip: true, color: 0x2a86cf }); mesh(wGeo, wMat, 0, 0, 0, water, { cast: false, receive: false }).renderOrder = 2;
  const sGeo = new THREE.PlaneGeometry(1, 0.4, 24, 16); sGeo.rotateX(-Math.PI / 2);
  const sMat = waterMaterial({ clip: false, color: 0x2a86cf }); const surf = mesh(sGeo, sMat, 0, 0, 0, water, { cast: false, receive: false }); surf.renderOrder = 2;
  // droplets inside drum
  const dropN = 120, dg = new THREE.BufferGeometry(), ds = new Float32Array(dropN * 4);
  for (let i = 0; i < dropN * 4; i++) ds[i] = Math.random();
  dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dropN * 3), 3)); dg.setAttribute('aSeed', new THREE.BufferAttribute(ds, 4));
  const dMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uRot: { value: 0 }, uAmt: { value: 0 }, uScale: { value: 800 } },
    vertexShader: `attribute vec4 aSeed; uniform float uRot, uAmt, uScale; varying float vA;
      void main(){ float a = aSeed.x*6.283 + uRot*(0.6 + aSeed.y*0.4); float r = 0.11 + aSeed.z*0.07;
        vec3 p = vec3(cos(a)*r, sin(a)*r - (1.0 - aSeed.y)*0.02, (aSeed.w - 0.5)*0.34);
        vec4 mv = modelViewMatrix*vec4(p, 1.0); gl_PointSize = clamp(0.006*uScale/max(-mv.z, 0.05), 0.0, 24.0);
        vA = uAmt*step(aSeed.w, uAmt)*(0.4 + 0.6*aSeed.z); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(c*vec2(1.0, 0.6)))*vA; if (a < 0.01) discard; gl_FragColor = vec4(0.82, 0.93, 1.0, a); }`
  });
  const drops = new THREE.Points(dg, dMat); drops.frustumCulled = false; drops.position.set(0, cyD, drumZ); drops.renderOrder = 4; body.add(drops);
  // door (hinged at left of porthole)
  const door = new THREE.Group(); door.position.set(-0.215, cyD, D / 2 + 0.01); body.add(door);
  const ring = mesh(new THREE.TorusGeometry(0.205, 0.024, 24, 80), M.chrome, 0.215, 0, 0.03, door);
  mesh(new THREE.RingGeometry(0.168, 0.205, 80), M.graphite, 0.215, 0, 0.052, door, { cast: false });
  const domeGeo = new THREE.SphereGeometry(0.27, 64, 24, 0, Math.PI * 2, 0, 0.75); domeGeo.rotateX(-Math.PI / 2); domeGeo.scale(1, 1, 0.45);
  const dome = mesh(domeGeo, glassMat({ color: 0xe8f4ff, tint: 0xa8d3ff, roughness: 0.02, thickness: 0.012, atten: 0.8, opacity: 0.18 }), 0.215, 0, 0.03 + 0.27 * Math.cos(0.75) * 0.45, door, { cast: false });
  dome.renderOrder = 3;
  mesh(rbox(0.03, 0.08, 0.025, 0.01, 2), M.graphite, 0.42, 0, 0.04, door);
  const lightMat = glow(0x6ac4ff, 0);
  mesh(new THREE.TorusGeometry(0.19, 0.003, 8, 80), lightMat, 0, cyD, D / 2 - 0.006, body, { cast: false });

  const KEYS = [
    [0.00, -1.4, 1.3, 2.4, 0, 0.45, 0],
    [0.33, -0.9, 1.0, 1.9, 0, 0.45, 0],
    [0.47, 0.35, 0.75, 1.35, 0, 0.43, 0.05],
    [0.60, 0.12, 0.5, 0.98, 0, 0.42, 0],
    [0.75, 0.0, 0.45, 0.78, 0, 0.42, 0],
    [0.90, 0.6, 0.62, 1.3, 0, 0.45, 0],
    [1.00, 1.4, 1.0, 2.5, 0, 0.45, 0]
  ];
  let spin = 0, clothPhase = 0;
  return {
    group: g,
    update(S, time, dt, C, L, FX) {
      const u = clamp((S - 3.5) / 1.5), p = clamp(S - 4);
      camKeys(KEYS, u, C); C.focus = C.pos.distanceTo(C.look);
      const open = ease.outCubic(smooth(0.18, 0.36, p)) * (1 - ease.inOut(smooth(0.48, 0.62, p)));
      door.rotation.y = -open * 1.75;
      const fill = smooth(0.55, 0.7, p), speed = smooth(0.6, 0.8, p) * 9 + 0.3;
      spin += dt * (MQ_REDUCED ? speed * 0.3 : speed);
      const rot = p * 14 + spin;
      drum.rotation.z = rot;
      const slosh = smooth(0.62, 0.85, p) * 0.5 + Math.sin(time * 2.1) * 0.08 * fill;
      const level = -0.19 + 0.075 * fill;
      [wMat, sMat].forEach(m => { m.uniforms.uFill.value = fill; m.uniforms.uLevel.value = level; m.uniforms.uTilt.value = slosh; m.uniforms.uSwirl.value = 0.4 + fill; });
      surf.position.set(Math.sin(slosh) * level, Math.cos(slosh) * level, 0); surf.rotation.z = -slosh;
      surf.scale.x = Math.max(0.001, 2 * Math.sqrt(Math.max(0, 0.184 * 0.184 - level * level))); surf.visible = fill > 0.01;
      dMat.uniforms.uRot.value = rot; dMat.uniforms.uAmt.value = fill * smooth(0.65, 0.8, p); dMat.uniforms.uScale.value = C.pointScale;
      clothPhase += dt * (0.5 + speed * 0.25);
      cloth.forEach((c, i) => {
        const a = -Math.PI / 2 + Math.sin(clothPhase * (1.1 + i * 0.3) + i * 2) * (0.6 + 0.6 * smooth(0.6, 0.8, p)) + (i ? 0.5 : -0.4);
        c.position.set(Math.cos(a) * 0.1, cyD + Math.sin(a) * 0.1, drumZ + (i ? 0.06 : -0.07)); c.rotation.set(rot * 0.3 + i, rot * 0.2, i);
      });
      knob.rotation.y = p * 4;
      setGlow(lightMat, 1.5 + fill * 2.5);
      L.key.color.set(0xf1f7ff); L.key.intensity = 2.2; L.key.position.set(1.6, 3.6, 2.6); L.key.target.position.set(0, 0.4, 0);
      L.rimA.color.set(0x48a8ff); L.rimA.intensity = 1.6; L.rimA.position.set(-2.5, 2, -2.5);
      L.rimB.color.set(0xffffff); L.rimB.intensity = 0.7; L.rimB.position.set(2.5, 2, -2);
      L.inA.color.set(0x7cc8ff); L.inA.intensity = 0.6 + fill * 1.6 + open * 0.8; L.inA.distance = 0.9; L.inA.position.set(0, cyD + 0.1, drumZ + 0.05);
      L.accent.color.set(0x2e86ff); L.accent.intensity = 1.6; L.accent.distance = 5; L.accent.position.set(0, 0.8, -1.2);
      L.hemi.intensity = 0.3;
      haloM.material.opacity = 0.5; haloM.lookAt(C.pos);
      C.bg.setRGB(0.012, 0.03, 0.05); C.fog = 0.08;
      C.hum = 0.3 + smooth(0.6, 0.8, p) * 0.7; C.water = fill * (0.5 + smooth(0.6, 0.8, p) * 0.5);
      const mins = Math.max(0, Math.round(58 - p * 40));
      lcd.userData.draw(mins, (c, w, h) => { c.shadowColor = '#5fc4ff'; c.shadowBlur = 12; c.fillStyle = '#bfe7ff'; c.font = `500 ${h * 0.5}px "IBM Plex Mono", monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('0:' + String(mins).padStart(2, '0'), w / 2, h / 2); });
    }
  };
}

/* =====================================================================
   4. WATER DISPENSER (S 5 → 6): tap, stream, glass, condensation
   ===================================================================== */
function buildDispenser() {
  const g = new THREE.Group(); floorPlane(g); contactShadow(g, 0.8, 0.8, 0, 0);
  const haloM = halo(g, 4.5, 0, 0.9, -1.2);
  const body = new THREE.Group(); g.add(body);
  const BW = 0.32, BH = 0.92;
  mesh(rbox(BW, BH, BW, 0.025, 3), M.enamel, 0, BH / 2, 0, body);
  mesh(rbox(BW - 0.03, 0.42, 0.012, 0.012, 2), M.steel, 0, 0.55, BW / 2 + 0.002, body);
  const recess = mesh(rbox(0.22, 0.2, 0.05, 0.012, 2), M.darkPlastic, 0, 0.53, BW / 2 - 0.012, body, { cast: false });
  const ledMat = glow(0x9fdcff, 2.4); mesh(new THREE.BoxGeometry(0.16, 0.004, 0.006), ledMat, 0, 0.625, BW / 2 + 0.012, body, { cast: false });
  mesh(rbox(0.22, 0.018, 0.11, 0.006, 2), M.satin, 0, 0.44, BW / 2 + 0.03, body);
  for (let i = 0; i < 9; i++) mesh(new THREE.BoxGeometry(0.003, 0.004, 0.1), M.darkPlastic, -0.096 + i * 0.024, 0.45, BW / 2 + 0.03, body, { cast: false });
  const taps = [], tapX = [-0.055, 0.055];
  tapX.forEach((x, i) => {
    const tg = new THREE.Group(); tg.position.set(x, 0.6, BW / 2 + 0.035); body.add(tg);
    mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.05, 24), M.chrome, 0, 0, 0, tg);
    mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.02, 16), M.chrome, 0, -0.033, 0, tg);
    const lever = new THREE.Group(); lever.position.set(0, 0.02, 0.012); tg.add(lever);
    mesh(rbox(0.024, 0.05, 0.014, 0.006, 2), phys({ color: i ? 0xf3f5f7 : 0x1f7fe0, roughness: 0.3, clearcoat: 1 }), 0, 0.02, 0.012, lever);
    taps.push(lever);
  });
  // 20 L bottle (inverted) + water inside
  const bottle = new THREE.Group(); bottle.position.y = BH; body.add(bottle);
  const prof = [[0.0, -0.02], [0.03, -0.02], [0.03, 0.04], [0.06, 0.07], [0.125, 0.11], [0.135, 0.15], [0.135, 0.4], [0.128, 0.44], [0.1, 0.47], [0.0, 0.48]];
  mesh(lathe(prof, 64), glassMat({ color: 0xd8eeff, tint: 0x6fb6ff, roughness: 0.04, thickness: 0.01, atten: 1.2, opacity: 0.22 }), 0, 0, 0, bottle, { cast: false }).renderOrder = 3;
  for (let i = 0; i < 4; i++) mesh(new THREE.TorusGeometry(0.1355, 0.0025, 8, 64), glassMat({ roughness: 0.1, opacity: 0.25 }), 0, 0.2 + i * 0.06, 0, bottle, { cast: false }).rotation.x = Math.PI / 2;
  const wprof = [[0.0, -0.015], [0.026, -0.015], [0.026, 0.04], [0.056, 0.07], [0.12, 0.11], [0.13, 0.15], [0.13, 0.36], [0.0, 0.36]];
  mesh(lathe(wprof, 48), M.waterTint, 0, 0, 0, bottle, { cast: false }).renderOrder = 2;
  mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.03, 32), M.plastic, 0, -0.005, 0, bottle);
  // cup
  const cupG = new THREE.Group(); body.add(cupG);
  const cupMat = HQ ? glassMat({ roughness: 0.03, thickness: 0.004, ior: 1.5 }) : glassMat({ roughness: 0.03, opacity: 0.25 });
  const cup = mesh(lathe([[0, 0], [0.026, 0], [0.034, 0.09], [0.0318, 0.09], [0.0242, 0.006], [0, 0.006]], 48), cupMat, 0, 0, 0, cupG, { cast: false }); cup.renderOrder = 3;
  const cupWaterGeo = new THREE.CylinderGeometry(0.031, 0.0242, 1, 40); cupWaterGeo.translate(0, 0.5, 0);
  const cupWater = mesh(cupWaterGeo, M.waterTint, 0, 0.006, 0, cupG, { cast: false }); cupWater.renderOrder = 2;
  // condensation droplets (InstancedMesh)
  const NDROP = IS_MOBILE ? 120 : 280;
  const dropMat = HQ ? glassMat({ roughness: 0.0, thickness: 0.002, ior: 1.33, env: 1.8 }) : new THREE.MeshPhysicalMaterial({ color: 0xe9f6ff, roughness: 0.02, transparent: true, opacity: 0.55, envMapIntensity: 2 });
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), dropMat, NDROP); drops.renderOrder = 4; cupG.add(drops);
  const Rd = rng(11), dropData = [], dummy = new THREE.Object3D();
  for (let i = 0; i < NDROP; i++) { const h = 0.012 + Rd() * 0.074, a = Rd() * Math.PI * 2; dropData.push({ h, a, s: 0.0012 + Math.pow(Rd(), 2.2) * 0.0032, slide: Rd() < 0.06 ? 0.004 + Rd() * 0.01 : 0, ph: Rd() }); }
  function placeDrops(k, time) {
    for (let i = 0; i < NDROP; i++) {
      const d = dropData[i], vis = clamp((k * NDROP * 1.15 - i) / 8);
      let h = d.h; if (d.slide) h = d.h - ((time * d.slide + d.ph) % 1) * d.h * 0.8 * vis;
      const r = 0.026 + 0.008 * h / 0.09 + 0.0006;
      dummy.position.set(Math.cos(d.a) * r, h, Math.sin(d.a) * r);
      dummy.lookAt(Math.cos(d.a) * 2, h, Math.sin(d.a) * 2);
      const s = d.s * vis * (d.slide ? 1.3 : 1);
      dummy.scale.set(s, s * 1.25, s * 0.45); dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
    }
    drops.instanceMatrix.needsUpdate = true;
  }
  placeDrops(0, 0);
  // stream (wobbling water column)
  const stGeo = new THREE.CylinderGeometry(0.0042, 0.0046, 1, 20, 40, true); stGeo.translate(0, -0.5, 0);
  const stMat = HQ ? glassMat({ color: 0xf2faff, tint: 0x9fd2ff, roughness: 0.0, ior: 1.33, thickness: 0.008 }) : new THREE.MeshPhysicalMaterial({ color: 0xcfeaff, roughness: 0.0, transparent: true, opacity: 0.7, envMapIntensity: 2, depthWrite: false });
  const wob = { value: 0 };
  stMat.onBeforeCompile = sh => { sh.uniforms.uWob = wob; sh.vertexShader = 'uniform float uWob;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.xz *= 1.0 + 0.22*sin(position.y*160.0 - uWob*40.0); transformed.x += 0.0008*sin(position.y*70.0 + uWob*25.0);'); };
  stMat.customProgramCacheKey = () => 'stream-wobble';
  const stream = mesh(stGeo, stMat, tapX[0], 0.565, BW / 2 + 0.035, body, { cast: false }); stream.renderOrder = 3;
  const cupBaseY = 0.45, cupX = tapX[0], cupZ = BW / 2 + 0.035;

  const KEYS = [
    [0.00, 1.4, 1.35, 2.3, 0, 0.75, 0],
    [0.25, 0.55, 0.82, 1.15, 0, 0.55, 0.05],
    [0.45, 0.2, 0.57, 0.62, -0.05, 0.5, 0.15],
    [0.70, -0.06, 0.53, 0.44, -0.055, 0.49, 0.18],
    [0.86, 0.07, 0.5, 0.32, -0.055, 0.49, 0.18],
    [1.00, -0.9, 1.1, 2.0, 0, 0.7, 0]
  ];
  return {
    group: g,
    update(S, time, dt, C, L, FX) {
      const p = clamp(S - 5);
      camKeys(KEYS, p, C); C.focus = C.pos.distanceTo(C.look);
      const appear = ease.outCubic(smooth(0.1, 0.3, p));
      cupG.position.set(cupX + (1 - appear) * 0.35, cupBaseY, cupZ); cupG.scale.setScalar(Math.max(0.001, appear)); cupG.rotation.y = (1 - appear) * 1.2;
      const press = smooth(0.34, 0.39, p) * (1 - smooth(0.72, 0.76, p));
      taps[0].rotation.x = press * 0.45;
      const fill = smooth(0.4, 0.75, p), level = 0.006 + fill * 0.072;
      cupWater.scale.set(1, Math.max(0.0005, fill * 0.072), 1); cupWater.visible = fill > 0.002;
      const top = 0.565, surfaceY = cupBaseY + level, full = top - surfaceY;
      const head = clamp((p - 0.38) / 0.035), tail = clamp((p - 0.72) / 0.035);
      const yTop = top - tail * full, yBot = top - head * full;
      stream.visible = head > 0 && tail < 1 && appear > 0.98;
      stream.position.y = yTop; stream.scale.y = Math.max(0.001, yTop - yBot);
      wob.value = time;
      const cond = smooth(0.58, 0.95, p);
      placeDrops(cond, time);
      cupMat.roughness = 0.03 + cond * 0.16;
      flowSet(FX.flowB, { uAmount: stream.visible ? 1 : 0, uOrigin: [cupX, surfaceY + 0.004, cupZ], uSpread: [0.006, 0.002, 0.006], uDir: [0, 0.035, 0], uGravity: [0, -0.05, 0], uSize: 0.006, uSpeed: 1.6, uTurb: 0.02, uOpacity: 0.85, uColor: new THREE.Color(0.9, 0.97, 1.0) });
      flowSet(FX.flowA, { uAmount: cond * 0.5, uOrigin: [cupX, cupBaseY + 0.06, cupZ], uSpread: [0.03, 0.03, 0.03], uDir: [0, -0.05, 0], uGravity: [0, -0.06, 0], uSize: 0.06, uSpeed: 0.12, uTurb: 0.03, uOpacity: 0.06 });
      L.key.color.set(0xffffff); L.key.intensity = 2.2; L.key.position.set(1.2, 3.2, 2.4); L.key.target.position.set(0, 0.5, 0);
      L.rimA.color.set(0x4fb0ff); L.rimA.intensity = 2.0; L.rimA.position.set(-2, 2, -2.5);
      L.rimB.color.set(0xffffff); L.rimB.intensity = 1.2; L.rimB.position.set(2.2, 1.5, -1.5);
      L.inA.color.set(0xbfe6ff); L.inA.intensity = 1.2; L.inA.distance = 0.6; L.inA.position.set(0, 0.6, BW / 2 + 0.12);
      L.accent.color.set(0x3e9bff); L.accent.intensity = 2.0; L.accent.distance = 4; L.accent.position.set(0, 1.2, -1);
      L.hemi.intensity = 0.35;
      haloM.material.opacity = 0.6; haloM.lookAt(C.pos);
      C.bg.setRGB(0.016, 0.04, 0.07); C.fog = 0.06; C.water = stream.visible ? 0.7 : 0; C.hum = 0.2;
    }
  };
}

/* =====================================================================
   5. MICROWAVE (S 6 → 7)
   ===================================================================== */
function buildMicrowave() {
  const g = new THREE.Group(); floorPlane(g);
  const haloM = halo(g, 4, 0, 1.1, -1.2);
  const stone = phys({ color: 0xffffff, map: TEX.stone, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.9 });
  mesh(new THREE.BoxGeometry(1.8, 0.04, 0.7), stone, 0, 0.88, 0, g);
  mesh(new THREE.BoxGeometry(1.78, 0.86, 0.64), M.softTouch, 0, 0.43, -0.02, g);
  const W = 0.5, H = 0.29, D = 0.38, base = 0.9;
  const mw = new THREE.Group(); mw.position.y = base; g.add(mw);
  contactShadow(mw, 0.7, 0.55, 0, 0);
  mesh(rbox(W, 0.012, D, 0.006, 2), M.steelSide, 0, H - 0.006, 0, mw);
  mesh(rbox(W, 0.012, D, 0.006, 2), M.steelSide, 0, 0.006, 0, mw);
  [-1, 1].forEach(s => mesh(rbox(0.012, H, D, 0.006, 2), M.steelSide, s * (W / 2 - 0.006), H / 2, 0, mw));
  mesh(new THREE.BoxGeometry(W, H, 0.012), M.steelSide, 0, H / 2, -D / 2 + 0.006, mw);
  const cav = phys({ color: 0xe9e4da, roughness: 0.4, clearcoat: 0.4, envMapIntensity: 0.7 });
  const x0 = -0.235, x1 = 0.125, cw = x1 - x0, cxm = (x0 + x1) / 2;
  mesh(new THREE.BoxGeometry(cw, 0.004, D - 0.03), cav, cxm, 0.014, 0, mw, { cast: false });
  mesh(new THREE.BoxGeometry(cw, 0.004, D - 0.03), cav, cxm, H - 0.014, 0, mw, { cast: false });
  mesh(new THREE.BoxGeometry(cw, H - 0.03, 0.004), cav, cxm, H / 2, -D / 2 + 0.014, mw, { cast: false });
  mesh(new THREE.BoxGeometry(0.004, H - 0.03, D - 0.03), cav, x0, H / 2, 0, mw, { cast: false });
  mesh(new THREE.BoxGeometry(0.004, H - 0.03, D - 0.03), cav, x1, H / 2, 0, mw, { cast: false });
  mesh(new THREE.BoxGeometry(W - cw - 0.015, H - 0.004, 0.004), M.steelSide, (x1 + W / 2) / 2 + 0.004, H / 2, D / 2 - 0.003, mw, { cast: false });
  // control panel
  mesh(rbox(0.1, 0.26, 0.008, 0.008, 2), M.blackGlass, 0.188, H / 2, D / 2 + 0.003, mw, { cast: false });
  const lcd = makeDisplay(0.08, 0.035); lcd.position.set(0.188, H - 0.05, D / 2 + 0.0075); mw.add(lcd);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) mesh(new THREE.CircleGeometry(0.008, 20), glow(0x7fc8ff, 0.8), 0.162 + c * 0.026, 0.17 - r * 0.03, D / 2 + 0.0075, mw, { cast: false });
  // turntable + bowl
  const plate = new THREE.Group(); plate.position.set(cxm, 0.022, 0.0); mw.add(plate);
  mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.006, 64), glassMat({ color: 0xf2fbff, roughness: 0.05, opacity: 0.35, thickness: 0.006 }), 0, 0.003, 0, plate, { cast: false });
  const bowl = mesh(lathe([[0, 0], [0.035, 0], [0.06, 0.04], [0.064, 0.055], [0.058, 0.055], [0.055, 0.042], [0.031, 0.008], [0, 0.008]], 48), phys({ color: 0xf7f4ee, roughness: 0.18, clearcoat: 1 }), 0.02, 0.006, 0, plate);
  mesh(new THREE.CircleGeometry(0.054, 40), phys({ color: 0xd2782a, roughness: 0.25, clearcoat: 1 }), 0, 0.046, 0, bowl).rotation.x = -Math.PI / 2;
  const lampMat = glow(0xffd9a0, 0); mesh(new THREE.BoxGeometry(0.05, 0.004, 0.05), lampMat, x1 - 0.06, H - 0.017, 0.05, mw, { cast: false });
  // door with window
  const dw = cw + 0.02, dh = H - 0.008;
  const door = new THREE.Group(); door.position.set(-W / 2, 0, D / 2); mw.add(door);
  const fr = roundedRectShape(dw, dh, 0.012, dw / 2, H / 2);
  const win = roundedRectShape(dw - 0.09, dh - 0.07, 0.01, dw / 2 - 0.015, H / 2);
  fr.holes.push(new THREE.Path(win.getPoints(16).reverse()));
  mesh(new THREE.ExtrudeGeometry(fr, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 12 }), M.graphite, 0, 0, 0, door);
  const meshMat = new THREE.MeshStandardMaterial({ color: 0x0a0c0f, metalness: 0.6, roughness: 0.4, alphaMap: TEX.mesh, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  mesh(new THREE.PlaneGeometry(dw - 0.09, dh - 0.07), meshMat, dw / 2 - 0.015, H / 2, 0.006, door, { cast: false }).renderOrder = 2;
  mesh(new THREE.PlaneGeometry(dw - 0.085, dh - 0.065), glassMat({ color: 0x9fb0c0, roughness: 0.02, opacity: 0.28, thickness: 0.004 }), dw / 2 - 0.015, H / 2, 0.02, door, { cast: false }).renderOrder = 3;
  mesh(rbox(0.016, 0.2, 0.02, 0.006, 2), M.satin, dw - 0.024, H / 2, 0.035, door);

  const KEYS = [
    [0.00, 1.2, 1.35, 1.7, 0, 1.02, 0],
    [0.30, 0.5, 1.12, 0.95, -0.05, 1.04, 0],
    [0.45, -0.04, 1.08, 0.62, -0.06, 1.0, 0],
    [0.75, -0.45, 1.05, 0.75, -0.05, 1.03, 0.05],
    [1.00, 0.9, 1.3, 1.6, 0, 1.0, 0]
  ];
  return {
    group: g,
    update(S, time, dt, C, L) {
      const p = clamp(S - 6);
      camKeys(KEYS, p, C); C.focus = C.pos.distanceTo(C.look);
      const open = ease.outCubic(smooth(0.15, 0.35, p)) * (1 - ease.inOut(smooth(0.5, 0.62, p)));
      door.rotation.y = -open * 1.65;
      const on = Math.max(open > 0.05 ? 1 : 0, smooth(0.6, 0.64, p));
      plate.rotation.y = p * 6 + (on && p > 0.6 ? time * 0.8 : 0);
      setGlow(lampMat, on * 3);
      L.inA.color.set(0xffd18a); L.inA.intensity = on * 2.2; L.inA.distance = 0.7; L.inA.position.set(cxm, base + H - 0.05, 0.03);
      L.key.color.set(0xf4f8ff); L.key.intensity = 2.0; L.key.position.set(1.2, 3.4, 2.2); L.key.target.position.set(0, 1, 0);
      L.rimA.color.set(0x4aa4ff); L.rimA.intensity = 1.6; L.rimA.position.set(-2, 2.5, -2);
      L.rimB.color.set(0xffffff); L.rimB.intensity = 0.6; L.rimB.position.set(2, 2, -2);
      L.accent.color.set(0x2e86ff); L.accent.intensity = 1.4; L.accent.distance = 4; L.accent.position.set(0, 1.4, -1);
      L.hemi.intensity = 0.3;
      haloM.material.opacity = 0.45; haloM.lookAt(C.pos);
      C.bg.setRGB(0.014, 0.026, 0.045); C.fog = 0.07; C.hum = on * 0.7;
      const secs = p < 0.62 ? 30 : Math.max(0, Math.round(30 - (p - 0.62) / 0.38 * 30));
      lcd.userData.draw(secs, (c, w, h) => { c.shadowColor = '#5fc4ff'; c.shadowBlur = 12; c.fillStyle = '#bfe7ff'; c.font = `500 ${h * 0.55}px "IBM Plex Mono", monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('0:' + String(secs).padStart(2, '0'), w / 2, h / 2); });
    }
  };
}

/* =====================================================================
   6. TANQUINHO (S 7 → 8): top loader, lid, agitator, swirling water
   ===================================================================== */
function buildTank() {
  const g = new THREE.Group(); floorPlane(g); contactShadow(g, 0.9, 0.9, 0, 0);
  const haloM = halo(g, 4, 0, 0.8, -1.2);
  const W = 0.5, H = 0.9, body = new THREE.Group(); g.add(body);
  const top = roundedRectShape(W, W, 0.06); const hole = new THREE.Path(); hole.absarc(0, -0.03, 0.205, 0, Math.PI * 2, true); top.holes.push(hole);
  const tg = new THREE.ExtrudeGeometry(top, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 64 }); tg.rotateX(-Math.PI / 2);
  mesh(tg, M.plastic, 0, H - 0.03, 0, body);
  [[W, 0.04, 0, W / 2 - 0.02], [W, 0.04, 0, -W / 2 + 0.02]].forEach(a => mesh(rbox(a[0], H - 0.04, a[1], 0.03, 3), M.plastic, a[2], (H - 0.04) / 2, a[3], body));
  [-1, 1].forEach(s => mesh(rbox(0.04, H - 0.04, W - 0.04, 0.03, 3), M.plastic, s * (W / 2 - 0.02), (H - 0.04) / 2, 0, body));
  const tubCenterZ = 0.03;
  mesh(lathe([[0.0, 0.0], [0.19, 0.0], [0.205, 0.03], [0.205, 0.5], [0.2, 0.5], [0.2, 0.03], [0.185, 0.008], [0, 0.008]], 64), phys({ color: 0xf6f8fa, roughness: 0.3, clearcoat: 0.6, side: THREE.DoubleSide }), 0, H - 0.53, tubCenterZ, body, { cast: false });
  // console with timer knobs
  mesh(rbox(W, 0.13, 0.08, 0.03, 3), M.plastic, 0, H + 0.04, -W / 2 + 0.04, body);
  mesh(rbox(W - 0.06, 0.08, 0.004, 0.01, 2), phys({ color: 0x1b6fd1, roughness: 0.3, clearcoat: 1 }), 0, H + 0.045, -W / 2 + 0.081, body, { cast: false });
  const knobs = [-0.12, 0.12].map(x => { const k = mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.03, 32), M.plastic, x, H + 0.045, -W / 2 + 0.095, body); k.rotation.x = Math.PI / 2; mesh(new THREE.BoxGeometry(0.006, 0.04, 0.008), M.darkPlastic, 0, 0.016, 0, k).rotation.x = Math.PI / 2; return k; });
  // agitator
  const ag = new THREE.Group(); ag.position.set(0, H - 0.52, tubCenterZ); body.add(ag);
  mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.03, 48), M.plastic, 0, 0.02, 0, ag);
  mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.36, 32), M.plastic, 0, 0.2, 0, ag);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, f = mesh(rbox(0.01, 0.22, 0.09, 0.004, 1), M.plastic, Math.cos(a) * 0.05, 0.13, Math.sin(a) * 0.05, ag); f.rotation.y = Math.PI / 2 - a; }
  // water surface
  const wMat = waterMaterial({ clip: false, color: 0x2f8fd6 });
  const sg = new THREE.CircleGeometry(0.199, 72, 0, Math.PI * 2); sg.rotateX(-Math.PI / 2);
  const surf = mesh(sg, wMat, 0, H - 0.2, tubCenterZ, body, { cast: false, receive: false }); surf.renderOrder = 3;
  // lid (smoked acrylic, hinged at the console)
  const lid = new THREE.Group(); lid.position.set(0, H + 0.008, -W / 2 + 0.085); body.add(lid);
  const lidMat = glassMat({ color: 0xcfe3f2, tint: 0x6d8ea8, roughness: 0.06, thickness: 0.01, atten: 0.4, opacity: 0.35 });
  mesh(rbox(W - 0.02, 0.012, W - 0.1, 0.02, 2), lidMat, 0, 0.006, (W - 0.1) / 2, lid, { cast: false }).renderOrder = 4;
  const KEYS = [
    [0.00, 1.1, 1.8, 1.5, 0, 0.75, 0],
    [0.30, 0.6, 1.45, 0.82, 0, 0.8, 0],
    [0.50, 0.12, 1.36, 0.36, 0, 0.75, 0.0],
    [0.80, -0.3, 1.25, 0.46, 0, 0.78, 0],
    [1.00, -1.1, 1.6, 1.6, 0, 0.75, 0]
  ];
  let phase = 0;
  return {
    group: g,
    update(S, time, dt, C, L) {
      const p = clamp(S - 7);
      camKeys(KEYS, p, C); C.focus = C.pos.distanceTo(C.look);
      lid.rotation.x = -ease.outCubic(smooth(0.1, 0.3, p)) * 1.45;
      const amt = smooth(0.3, 0.45, p);
      phase += dt * 5 * amt * (MQ_REDUCED ? 0.3 : 1);
      const ang = Math.sin(phase + p * 10) * 1.3 * amt;
      ag.rotation.y = ang;
      wMat.uniforms.uFill.value = 0.95; wMat.uniforms.uSwirl.value = 0.2 + amt * 1.0; wMat.uniforms.uPhase.value = ang * 0.6 + phase * 0.15;
      knobs[0].rotation.y = -p * 3;
      L.key.color.set(0xffffff); L.key.intensity = 2.3; L.key.position.set(1.0, 3.6, 1.8); L.key.target.position.set(0, 0.8, 0);
      L.rimA.color.set(0x4aa8ff); L.rimA.intensity = 1.5; L.rimA.position.set(-2, 2.5, -2);
      L.rimB.color.set(0xffffff); L.rimB.intensity = 0.6; L.rimB.position.set(2, 2, -2);
      L.inA.color.set(0x8fd0ff); L.inA.intensity = 0.8; L.inA.distance = 0.8; L.inA.position.set(0, H + 0.3, tubCenterZ);
      L.accent.color.set(0x2e86ff); L.accent.intensity = 1.4; L.accent.distance = 4; L.accent.position.set(0, 1.3, -1.1);
      L.hemi.intensity = 0.3;
      haloM.material.opacity = 0.45; haloM.lookAt(C.pos);
      C.bg.setRGB(0.012, 0.03, 0.05); C.fog = 0.07; C.water = amt * 0.6; C.hum = amt * 0.6;
    }
  };
}

/* =====================================================================
   7. CAR A/C (S 8 → 9): dashboard, vents, airflow, warm → cold
   ===================================================================== */
function buildCar() {
  const g = new THREE.Group();
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }));
  sky.position.set(0, 1.8, -3.5); g.add(sky);
  const dash = mesh(rbox(1.7, 0.2, 0.55, 0.08, 4), M.softTouch, 0, 0.92, -0.05, g);
  mesh(rbox(1.72, 0.05, 0.3, 0.025, 3), M.softTouch, 0, 1.03, -0.2, g);
  mesh(rbox(1.66, 0.012, 0.04, 0.006, 2), M.satin, 0, 0.86, 0.22, g);
  const stack = mesh(rbox(0.38, 0.42, 0.14, 0.03, 3), M.darkPlastic, 0, 0.68, 0.2, g); stack.rotation.x = 0.18;
  const screen = makeDisplay(0.24, 0.1, 384, 160); screen.position.set(0, 0.74, 0.282); screen.rotation.x = 0.18; g.add(screen);
  mesh(rbox(0.26, 0.115, 0.006, 0.01, 2), M.blackGlass, 0, 0.74, 0.278, g, { cast: false }).rotation.x = 0.18;
  const vents = [], ringMats = [];
  [-0.11, 0.11].forEach(x => {
    const vg = new THREE.Group(); vg.position.set(x, 0.9, 0.27); g.add(vg);
    const frame = mesh(rbox(0.16, 0.07, 0.04, 0.02, 3), M.satin, 0, 0, 0, vg);
    mesh(new THREE.BoxGeometry(0.14, 0.055, 0.03), M.rubber, 0, 0, 0.008, vg, { cast: false });
    const rm = glow(0x5fc4ff, 0); ringMats.push(rm);
    mesh(new THREE.BoxGeometry(0.14, 0.003, 0.004), rm, 0, -0.03, 0.02, vg, { cast: false });
    const slats = [];
    for (let i = 0; i < 4; i++) { const s = mesh(new THREE.BoxGeometry(0.135, 0.004, 0.026), M.satin, 0, -0.018 + i * 0.012, 0.016, vg, { cast: false }); slats.push(s); }
    vents.push({ vg, slats, frame });
  });
  const wheel = new THREE.Group(); wheel.position.set(-0.45, 0.88, 0.42); wheel.rotation.x = -1.15; g.add(wheel);
  mesh(new THREE.TorusGeometry(0.18, 0.018, 20, 64), M.softTouch, 0, 0, 0, wheel);
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 32), M.darkPlastic, 0, 0, 0, wheel).rotation.x = Math.PI / 2;
  [0, 2.1, -2.1].forEach(a => { const s = mesh(new THREE.BoxGeometry(0.15, 0.024, 0.015), M.darkPlastic, Math.cos(a - Math.PI / 2) * 0.09, Math.sin(a - Math.PI / 2) * 0.09, 0, wheel); s.rotation.z = a - Math.PI / 2; });
  const wind = mesh(new THREE.PlaneGeometry(1.9, 0.8), glassMat({ color: 0xdde8f2, roughness: 0.02, opacity: 0.08, thickness: 0.006 }), 0, 1.35, -0.4, g, { cast: false }); wind.rotation.x = -0.95; wind.renderOrder = 3;
  [-1, 1].forEach(s => { const pl = mesh(rbox(0.07, 1.0, 0.06, 0.02, 2), M.softTouch, s * 0.95, 1.35, -0.38, g); pl.rotation.x = -0.95; pl.rotation.z = s * 0.12; });
  mesh(rbox(1.9, 0.06, 0.4, 0.02, 2), M.softTouch, 0, 1.72, 0.1, g);
  const frosts = []; vents.forEach(v => addFrost(v.frame, frosts, 40));
  const KEYS = [
    [0.00, 0.6, 1.22, 1.8, 0, 0.88, 0.1],
    [0.30, 0.25, 1.02, 1.1, 0, 0.86, 0.2],
    [0.55, 0.05, 0.92, 0.72, 0, 0.88, 0.26],
    [0.80, -0.22, 1.0, 0.92, 0, 0.88, 0.15],
    [1.00, 0.0, 1.3, 2.0, 0, 0.95, 0]
  ];
  const warmC = new THREE.Color(0xffb36b), coolC = new THREE.Color(0x9fd4ff), tmp = new THREE.Color();
  return {
    group: g,
    update(S, time, dt, C, L, FX) {
      const p = clamp(S - 8);
      camKeys(KEYS, p, C); C.focus = C.pos.distanceTo(C.look); C.shift[0] *= 0.6;
      const cool = smooth(0.25, 0.85, p), air = smooth(0.18, 0.38, p);
      vents.forEach((v, i) => v.slats.forEach((s, k) => (s.rotation.x = -0.35 * air + Math.sin(time * 0.5 + k) * 0.02)));
      ringMats.forEach(m => setGlow(m, air * 3));
      tmp.copy(warmC).lerp(coolC, cool); sky.material.color.copy(tmp).multiplyScalar(lerp(1.25, 0.45, cool));
      L.key.color.copy(warmC).lerp(new THREE.Color(0xe6f3ff), cool); L.key.intensity = lerp(3.2, 1.4, cool); L.key.position.set(0.6, 3.5, -2.8); L.key.target.position.set(0, 0.9, 0.3);
      L.warm.color.set(0xff8a3d); L.warm.intensity = (1 - cool) * 2.4; L.warm.position.set(0, 1.6, -1.2); L.warm.distance = 5;
      L.rimA.color.set(0x4aa8ff); L.rimA.intensity = cool * 1.8; L.rimA.position.set(-2, 1.5, 2);
      L.rimB.color.set(0xffffff); L.rimB.intensity = 0.5; L.rimB.position.set(2, 2, 2);
      L.accent.color.set(0x41b4ff); L.accent.intensity = air * 1.6; L.accent.distance = 1.5; L.accent.position.set(0, 0.9, 0.5);
      L.hemi.intensity = 0.25 + cool * 0.15;
      C.bg.setRGB(lerp(0.09, 0.012, cool), lerp(0.05, 0.03, cool), lerp(0.025, 0.06, cool)); C.fog = 0.05;
      frosts.forEach(m => (m.uniforms.uFrost.value = smooth(0.7, 1, p) * 0.8));
      [FX.flowA, FX.flowB].forEach((f, i) => flowSet(f, { uAmount: air, uOrigin: [i ? 0.11 : -0.11, 0.9, 0.31], uSpread: [0.06, 0.02, 0.01], uDir: [i ? 0.15 : -0.15, 0.06, 1.6], uGravity: [0, -0.1, 0], uSize: 0.035, uSpeed: 0.7, uTurb: 0.05, uOpacity: 0.55, uColor: new THREE.Color(0.75, 0.9, 1.0) }));
      const temp = Math.round(lerp(38, 21, cool));
      screen.userData.draw(temp + ':' + Math.round(air * 4), (c, w, h) => {
        c.fillStyle = '#05090f'; c.fillRect(0, 0, w, h);
        c.shadowColor = '#5fc4ff'; c.shadowBlur = 14; c.fillStyle = cool > 0.5 ? '#bfe7ff' : '#ffd2a8';
        c.font = `500 ${h * 0.5}px "IBM Plex Mono", monospace`; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(temp + '°', w * 0.08, h * 0.52);
        c.font = `500 ${h * 0.16}px "IBM Plex Mono", monospace`; c.fillStyle = '#9fd4ff'; c.fillText('A/C', w * 0.62, h * 0.3);
        for (let i = 0; i < 4; i++) { c.globalAlpha = i < Math.round(air * 4) ? 1 : 0.2; c.fillRect(w * 0.62 + i * w * 0.07, h * 0.72 - i * h * 0.06, w * 0.045, h * 0.1 + i * h * 0.06); }
        c.globalAlpha = 1;
      });
      C.hum = air * 0.5; C.wind = air * 0.6;
    }
  };
}

/* =====================================================================
   8. CALM (S ≥ 9): gentle snow behind the commercial content
   ===================================================================== */
function buildCalm() {
  const g = new THREE.Group();
  return {
    group: g,
    update(S, time, dt, C, L) {
      C.pos.set(Math.sin(time * 0.05) * 0.3, 1.2, 4); C.look.set(0, 1.1, 0); C.focus = 4;
      C.bg.setRGB(0.012, 0.03, 0.06); C.fog = 0.05; L.hemi.intensity = 0.3;
    }
  };
}

/* ============================================================
   Orchestration: boot sequence (real loader steps), world manager,
   camera director, global effects, performance governor.
   ============================================================ */
const WORLDS = [
  { id: 'fridge', from: 0, to: 2, build: () => buildFridge() },
  { id: 'freezer', from: 2, to: 3.5, build: () => buildFreezer() },
  { id: 'washer', from: 3.5, to: 5, build: () => buildWasher() },
  { id: 'water', from: 5, to: 6, build: () => buildDispenser() },
  { id: 'micro', from: 6, to: 7, build: () => buildMicrowave() },
  { id: 'tank', from: 7, to: 8, build: () => buildTank() },
  { id: 'car', from: 8, to: 9, build: () => buildCar() },
  { id: 'calm', from: 9, to: 1e9, build: () => buildCalm() }
];
const worldAt = S => { for (let i = 0; i < WORLDS.length; i++) if (S < WORLDS[i].to) return i; return WORLDS.length - 1; };

// global effect curves over S
const SNOW_KEYS = [[0, 0.02], [1, 0.06], [1.5, 0.14], [2, 0.3], [2.7, 1.0], [3.5, 0.9], [3.85, 0.22], [4.2, 0.14], [5, 0.1], [5.5, 0.05], [5.9, 0], [8.95, 0], [9.4, 0.22]];
const WATER_KEYS = [[3.55, 0], [3.9, 1], [5.85, 1], [6.0, 0]];
const WIND_KEYS = [[0, 0.2], [2, 0.35], [2.6, 1.6], [3.5, 1.2], [4, 0.25], [9, 0.25], [9.5, 0.4]];
const FADES = [{ b: 2, w: 0.075, c: [0.86, 0.94, 1.0] }, { b: 5, w: 0.07 }, { b: 6, w: 0.07 }, { b: 7, w: 0.07 }, { b: 8, w: 0.07 }, { b: 9, w: 0.08 }];

let fellBack = false;
function bootFallback(reason) {
  if (fellBack) return; fellBack = true;
  document.documentElement.classList.add('no3d');
  if (reason) console.info('[Brasmak] modo sem 3D:', reason);
  initTimeline(updateUI);
  Loader.finish();
}

async function boot() {
  Loader.plan(6);
  const hasLibs = !!(window.THREE && window.gsap && window.ScrollTrigger);
  // 1. fonts
  Loader.say('Carregando tipografia');
  await Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 2500))]);
  Loader.tick('Iniciando WebGL'); await nextFrame();
  if (!window.THREE) return bootFallback('Three.js indisponível');
  // 2. renderer
  let renderer;
  try { renderer = createRenderer($('#gl')); if (!renderer.getContext()) throw new Error('sem contexto'); }
  catch (e) { return bootFallback('WebGL indisponível'); }
  Loader.tick('Gerando reflexos de estúdio'); await nextFrame();
  // 3. environment
  const envTex = buildEnvironment(renderer);
  Loader.tick('Criando aço escovado e vidro'); await nextFrame();
  // 4. textures + materials
  buildTextures(renderer); buildMaterials();
  Loader.tick('Montando a geladeira'); await nextFrame();
  // 5. scene + first world
  const engine = createEngine(renderer, envTex);
  engine.ensure(0);
  Loader.tick('Compilando shaders'); await nextFrame();
  // 6. compile
  engine.compileAll();
  Loader.tick('Pronto'); await nextFrame();
  initTimeline(S => { updateUI(S); engine.setTarget(S); });
  if (!hasLibs) console.info('[Brasmak] GSAP indisponível, usando rolagem nativa');
  engine.start();
  Loader.finish();
}

function createEngine(renderer, envTex) {
  const scene = new THREE.Scene();
  scene.environment = envTex;
  scene.background = new THREE.Color(0x020409);
  scene.fog = new THREE.FogExp2(0x020409, 0.07);
  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.02, 60);
  const post = createPost(renderer);

  // fixed light rig (constant light count = no shader recompiles between worlds)
  const L = {
    hemi: new THREE.HemisphereLight(0x8fb8ff, 0x05070a, 0.25),
    key: new THREE.SpotLight(0xffffff, 2, 16, 0.55, 0.65, 1.2),
    rimA: new THREE.DirectionalLight(0x6fb6ff, 1),
    rimB: new THREE.DirectionalLight(0xffffff, 0.6),
    warm: new THREE.PointLight(0xff8a3d, 0, 7, 2),
    inA: new THREE.PointLight(0xe8f4ff, 0, 1.6, 2),
    inB: new THREE.PointLight(0xe8f4ff, 0, 1.6, 2),
    accent: new THREE.PointLight(0x3aa8ff, 0, 6, 2)
  };
  Object.values(L).forEach(l => scene.add(l));
  scene.add(L.key.target);
  if (HQ) {
    L.key.castShadow = true; L.key.shadow.mapSize.set(1024, 1024); L.key.shadow.bias = -0.0004; L.key.shadow.normalBias = 0.02;
    L.key.shadow.camera.near = 0.5; L.key.shadow.camera.far = 12; L.key.shadow.radius = 4;
  }

  // particles
  const snowCount = LOW ? 1200 : IS_MOBILE ? 2200 : 6000;
  const snow = createSnow(snowCount); scene.add(snow);
  const FX = { flowA: createFlow(IS_MOBILE ? 260 : 520, IS_MOBILE ? 160 : 320), flowB: createFlow(IS_MOBILE ? 200 : 400, IS_MOBILE ? 140 : 280) };
  scene.add(FX.flowA, FX.flowB);
  const flowDefaults = { uAmount: 0, uColor: new THREE.Color(0.85, 0.93, 1.0) };

  const built = new Array(WORLDS.length).fill(null);
  function ensure(i) {
    if (i < 0 || i >= WORLDS.length || built[i]) return built[i];
    const w = WORLDS[i].build();
    w.group.visible = false; scene.add(w.group); built[i] = w;
    return w;
  }
  function dispose(i) {
    const w = built[i]; if (!w) return;
    scene.remove(w.group);
    const mats = new Set(), geos = new Set();
    w.group.traverse(o => { if (o.geometry) geos.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m)); });
    geos.forEach(g => g.dispose());
    mats.forEach(m => { if (SHARED.has(m)) return; ['map', 'alphaMap'].forEach(k => { if (m[k] && !SHARED.has(m[k])) m[k].dispose(); }); m.dispose(); });
    built[i] = null;
  }
  function compileAll() {
    built.forEach(w => { if (w) w.group.visible = true; });
    renderer.compile(scene, camera);
    built.forEach(w => { if (w) w.group.visible = false; });
  }

  // state
  const C = { pos: new THREE.Vector3(), look: new THREE.Vector3(), shift: [0, 0], bg: new THREE.Color(), fog: 0.07, exposure: 1, focus: 3, hum: 0, water: 0, wind: 0, temp: 26, intro: MQ_REDUCED ? 1 : 0, pointScale: 800 };
  const camPos = new THREE.Vector3(0, 1.1, 9), camLook = new THREE.Vector3(0, 1, 0);
  let S = 0, target = 0, active = -1, time = 0, last = performance.now(), running = false;
  let driftX = 0, driftY = 0, driftZ = 0, mx = 0, my = 0, pmx = 0, pmy = 0;
  let pr = Math.min(devicePixelRatio || 1, IS_MOBILE ? 1.5 : 2), prMax = pr, frameAcc = 0, frames = 0, skip = 0;
  let lastIce = 0;
  const bg = new THREE.Color(), tmpV = new THREE.Vector3(), fwd = new THREE.Vector3();

  if (!MQ_REDUCED && !IS_TOUCH) addEventListener('pointermove', e => { mx = e.clientX / innerWidth * 2 - 1; my = e.clientY / innerHeight * 2 - 1; }, { passive: true });

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    post.mat.uniforms.uAspect.value = w / h;
  }
  addEventListener('resize', resize); resize();

  function lightsReset() {
    Object.values(L).forEach(l => { l.intensity = 0; });
    L.hemi.color.set(0x8fb8ff); L.hemi.groundColor.set(0x05070a);
  }
  function fadeAt(s) {
    let f = 0, col = null;
    for (const d of FADES) { const v = 1 - smooth(0, d.w, Math.abs(s - d.b)); if (v > f) { f = v; col = d.c; } }
    return { f, col };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    // throttle: low-end phones and the calm commercial area render at ~30 fps
    if ((LOW || S > 9.6) && (skip = (skip + 1) % 2) === 1) return;
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    time += dt; U.time.value = time;

    // scroll smoothing (large jumps snap so we never fly through every world)
    const diff = target - S;
    if (Math.abs(diff) > 1.2) S = target; else S += diff * (1 - Math.exp(-dt * (MQ_REDUCED ? 30 : 5.5)));
    if (Math.abs(target - S) < 1e-4) S = target;

    // worlds: build lazily (current + next), dispose far ones
    const wi = worldAt(S);
    ensure(wi);
    if (S > WORLDS[wi].to - 0.45 && wi + 1 < WORLDS.length && !built[wi + 1]) { ensure(wi + 1); built[wi + 1].group.visible = true; renderer.compile(scene, camera); built[wi + 1].group.visible = false; }
    if (S < WORLDS[wi].from + 0.3 && wi > 0) ensure(wi - 1);
    built.forEach((w, i) => { if (w && Math.abs(i - wi) > (IS_MOBILE ? 1 : 2)) dispose(i); });
    let snap = false;
    if (wi !== active) { if (active >= 0 && built[active]) built[active].group.visible = false; built[wi].group.visible = true; snap = active >= 0; active = wi; }

    // per-frame defaults, then the active world directs
    lightsReset();
    flowSet(FX.flowA, flowDefaults); flowSet(FX.flowB, flowDefaults);
    C.shift[0] = IS_MOBILE ? 0 : (innerWidth / innerHeight > 1.25 ? 0.17 : 0.08);
    C.shift[1] = IS_MOBILE ? 0.13 : 0;
    C.fog = 0.07; C.exposure = 1; C.hum = 0; C.water = 0; C.wind = 0; C.temp = tempAt(S);
    C.pointScale = innerHeight * pr / (2 * Math.tan(camera.fov * Math.PI / 360));
    built[wi].update(S, time, dt, C, L, FX);

    // camera: portrait framing pushes back, pointer parallax, damping
    const aspect = innerWidth / innerHeight;
    const k = aspect < 1 ? 1 + (1 - aspect) * 0.95 : 1;
    tmpV.copy(C.pos).sub(C.look).multiplyScalar(k); C.pos.copy(C.look).add(tmpV);
    pmx += (mx - pmx) * 0.05; pmy += (my - pmy) * 0.05;
    const pd = C.pos.distanceTo(C.look) * 0.035;
    C.pos.x += pmx * pd; C.pos.y -= pmy * pd * 0.6;
    if (snap) { camPos.copy(C.pos); camLook.copy(C.look); }
    else { const a = 1 - Math.exp(-dt * (MQ_REDUCED ? 20 : 4.2)); camPos.lerp(C.pos, a); camLook.lerp(C.look, a); }
    camera.position.copy(camPos); camera.lookAt(camLook);
    const w = innerWidth, h = innerHeight;
    camera.setViewOffset(w, h, -C.shift[0] * w, C.shift[1] * h, w, h);

    // atmosphere
    bg.copy(C.bg); scene.background.copy(bg); scene.fog.color.copy(bg); scene.fog.density = C.fog;
    renderer.toneMappingExposure = C.exposure;
    L.hemi.intensity = Math.max(L.hemi.intensity, 0.08);

    // snow
    const su = snow.material.uniforms;
    const density = keyed(SNOW_KEYS, S) * (MQ_REDUCED ? 0.4 : 1);
    const water = keyed(WATER_KEYS, S), wind = keyed(WIND_KEYS, S) + C.wind;
    driftX += wind * dt * 0.55; driftY += lerp(0.32, 1.8, water) * dt; driftZ += wind * dt * 0.2;
    if (driftY > 5000) { driftX = driftY = driftZ = 0; }
    su.uDensity.value = density; su.uWater.value = water; su.uDrift.value.set(driftX, driftY, driftZ);
    camera.getWorldDirection(fwd); su.uCenter.value.copy(camPos).addScaledVector(fwd, 3);
    su.uFocus.value = camPos.distanceTo(camLook); su.uScale.value = C.pointScale;
    FX.flowA.material.uniforms.uScale.value = C.pointScale; FX.flowB.material.uniforms.uScale.value = C.pointScale;
    snow.visible = density > 0.005;

    // screen ice (S 3 → 4) and fades
    const q = clamp(S - 3);
    let ice = q < 0.5 ? smooth(0.04, 0.5, q) : 1 - smooth(0.5, 0.96, q);
    if (S < 3 || S > 4) ice = 0;
    const fd = fadeAt(S);
    const pu = post.mat.uniforms;
    let fade = fd.f;
    if (MQ_REDUCED && ice > 0) { fade = Math.max(fade, ice); pu.uFadeColor.value.setRGB(0.8, 0.9, 1.0); ice = 0; }
    else if (fd.col) pu.uFadeColor.value.setRGB(fd.col[0], fd.col[1], fd.col[2]);
    else pu.uFadeColor.value.copy(bg).multiplyScalar(0.6);
    pu.uIce.value = ice; pu.uMelt.value = q > 0.5 ? 1 : 0; pu.uFade.value = fade;
    pu.uVig.value = 0.7;

    // sound
    Sound.set({ wind: density * Math.min(1, wind / 1.2), hum: C.hum, water: Math.max(C.water, water * 0.15), ice: Math.abs(ice - lastIce) > 0.001 ? 1 : 0 });
    lastIce = ice;

    // render
    renderer.render(scene, camera);
    if (ice > 0.001) {
      const tex = post.ensureTex(Math.floor(w * pr), Math.floor(h * pr));
      renderer.copyFramebufferToTexture(tmpV.set(0, 0, 0), tex);
      pu.tScene.value = tex; pu.uHasScene.value = 1;
    } else pu.uHasScene.value = 0;
    renderer.autoClear = false; renderer.render(post.scene, post.cam); renderer.autoClear = true;

    // performance governor (adaptive resolution)
    frameAcc += dt; frames++;
    if (frameAcc > 2) {
      const avg = frameAcc / frames * 1000;
      if (avg > 24 && pr > 0.75) { pr = Math.max(0.75, pr - 0.25); resize(); }
      else if (avg < 14 && pr < prMax) { pr = Math.min(prMax, pr + 0.125); resize(); }
      frameAcc = 0; frames = 0;
    }
  }

  return {
    ensure, compileAll,
    setTarget(v) { target = v; },
    start() {
      if (running) return; running = true;
      S = target; last = performance.now();
      if (!MQ_REDUCED && window.gsap) gsap.to(C, { intro: 1, duration: 3.6, ease: 'power2.inOut', delay: 0.15 });
      else C.intro = 1;
      requestAnimationFrame(frame);
    }
  };
}

/* ---------- smooth in-page jumps for the hero CTA ---------- */
document.querySelectorAll('[data-jump]').forEach(a => a.addEventListener('click', e => {
  const el = document.querySelector(a.getAttribute('href')); if (!el) return;
  e.preventDefault();
  const y = el.offsetTop + innerHeight * 0.35;
  scrollTo({ top: y, behavior: MQ_REDUCED ? 'auto' : 'smooth' });
}));

boot().catch(err => { console.error(err); bootFallback('erro na inicialização'); });

})();