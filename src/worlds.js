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
