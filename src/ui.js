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
