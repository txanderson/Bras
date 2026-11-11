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
