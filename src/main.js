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
