// r13_fx.js -- atmosphere: snow spray / smoke / steam particles, drifting snowfall, and the ski-track texture
// (a 2D canvas the skiers draw into and the snowcat wipes back to corduroy). All cosmetic: reads sim, never writes it.
(function (SH) {
  'use strict';
  const T3 = THREE, R = SH.render, U = SH.util, CFG = SH.CONFIG, L = SH.LAYOUT, T = SH.terrain;
  const frand = U.makeRng(0x5eed1e);   // cosmetic randomness is seeded too, so a capture replays exactly

  // ------------------------------------------------------------ particles (round, soft, drawn as points)
  const VS = 'attribute float aSize; attribute vec4 aColor; uniform float uScale; varying vec4 vColor;' +
    'void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.5, aSize * uScale); }';
  const FS = 'precision mediump float; varying vec4 vColor;' +
    'void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = vColor.a * (1.0 - smoothstep(0.35, 1.0, d)); if (a < 0.01) discard; gl_FragColor = vec4(vColor.rgb, a); }';

  class Particles {
    constructor(scene, cap) {
      this.cap = cap; this.n = 0;
      this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3); this.c = new Float32Array(cap * 4); this.s = new Float32Array(cap);
      this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.grow = new Float32Array(cap); this.grav = new Float32Array(cap); this.a0 = new Float32Array(cap);
      const g = this.geo = new T3.BufferGeometry();
      g.setAttribute('position', new T3.BufferAttribute(this.p, 3).setUsage(T3.DynamicDrawUsage));
      g.setAttribute('aColor', new T3.BufferAttribute(this.c, 4).setUsage(T3.DynamicDrawUsage));
      g.setAttribute('aSize', new T3.BufferAttribute(this.s, 1).setUsage(T3.DynamicDrawUsage));
      this.mat = new T3.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { uScale: { value: 10 } }, transparent: true, depthWrite: false });
      this.points = new T3.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
      scene.add(this.points);
    }
    emit(x, y, z, vx, vy, vz, life, size, grow, r, g, b, a, grav) {
      if (this.n >= this.cap) return;
      const i = this.n++, i3 = i * 3, i4 = i * 4;
      this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z; this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
      this.c[i4] = r; this.c[i4 + 1] = g; this.c[i4 + 2] = b; this.c[i4 + 3] = a; this.a0[i] = a;
      this.s[i] = size; this.life[i] = life; this.max[i] = life; this.grow[i] = grow; this.grav[i] = grav;
    }
    puff(x, y, z, n, spread, up, size, alpha) {
      for (let i = 0; i < n; i++) this.emit(x + (frand() - 0.5) * 0.6, y + 0.1, z + (frand() - 0.5) * 0.6, (frand() - 0.5) * spread, frand() * up, (frand() - 0.5) * spread, 0.5 + frand() * 0.6, size * (0.6 + frand() * 0.8), size * 1.6, 1, 1, 1, alpha, 3.5);
    }
    update(dt, pxPerM) {
      const p = this.p, v = this.v, c = this.c;
      let i = 0;
      while (i < this.n) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) {       // swap-remove
          const j = --this.n;
          if (j !== i) { p[i * 3] = p[j * 3]; p[i * 3 + 1] = p[j * 3 + 1]; p[i * 3 + 2] = p[j * 3 + 2]; v[i * 3] = v[j * 3]; v[i * 3 + 1] = v[j * 3 + 1]; v[i * 3 + 2] = v[j * 3 + 2];
            c[i * 4] = c[j * 4]; c[i * 4 + 1] = c[j * 4 + 1]; c[i * 4 + 2] = c[j * 4 + 2]; this.a0[i] = this.a0[j]; this.s[i] = this.s[j]; this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.grow[i] = this.grow[j]; this.grav[i] = this.grav[j]; }
          continue;
        }
        const i3 = i * 3, k = this.life[i] / this.max[i];
        v[i3 + 1] -= this.grav[i] * dt; const drag = 1 - Math.min(1, dt * 1.6); v[i3] *= drag; v[i3 + 2] *= drag;
        p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
        this.s[i] += this.grow[i] * dt; c[i * 4 + 3] = this.a0[i] * Math.min(1, k * 2.2) * Math.min(1, (1 - k) * 8);
        i++;
      }
      this.geo.setDrawRange(0, this.n);
      this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aColor.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true;
      this.mat.uniforms.uScale.value = pxPerM;
    }
  }

  // ------------------------------------------------------------ snowfall: positions wrap in the vertex shader, no per-frame JS
  const SVS = 'attribute float aSeed; uniform float uScale; uniform float uTime; uniform vec3 uCenter; varying float vA;' +
    'void main(){ vec3 p = position; p.y = mod(p.y - uTime * (1.3 + aSeed * 1.4), 80.0); p.x += sin(uTime * 0.7 + aSeed * 40.0) * 1.2 + uTime * 0.6; p.z += cos(uTime * 0.5 + aSeed * 23.0) * 0.9;' +
    ' p.xz = uCenter.xz + mod(p.xz - uCenter.xz + 140.0, 280.0) - 140.0; p.y += uCenter.y - 30.0; vA = 0.55 + 0.45 * aSeed;' +
    ' gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); gl_PointSize = max(1.6, (0.1 + 0.1 * aSeed) * uScale); }';
  const SFS = 'precision mediump float; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = vA * (1.0 - smoothstep(0.5, 1.0, d)); if (a < 0.01) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, a); }';
  function snowfall(scene, n) {
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = frand() * 280; pos[i * 3 + 1] = frand() * 80; pos[i * 3 + 2] = frand() * 280; seed[i] = frand(); }
    const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new T3.BufferAttribute(seed, 1));
    const mat = new T3.ShaderMaterial({ vertexShader: SVS, fragmentShader: SFS, uniforms: { uScale: { value: 10 }, uTime: { value: 0 }, uCenter: { value: new T3.Vector3() } }, transparent: true, depthWrite: false });
    const pts = new T3.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 6; scene.add(pts);
    return mat;
  }

  // ------------------------------------------------------------ ski tracks
  class Tracks {
    constructor() {
      const K = R.TRACK, px = K.px, mk = (w) => { const c = document.createElement('canvas'); c.width = c.height = w; return c; };
      this.k = px / K.size; this.out = mk(px); this.base = mk(px); this.layer = mk(px);
      this.octx = this.out.getContext('2d'); this.lctx = this.layer.getContext('2d');
      const b = this.base.getContext('2d'), k = this.k, X = (x) => (x - K.x0) * k, Z = (z) => (z - K.z0) * k;
      this.X = X; this.Z = Z;
      b.fillStyle = '#fff'; b.fillRect(0, 0, px, px);
      // corduroy only where the snow is groomed: draw the groomed mask, then keep the stripes inside it
      const mask = mk(px), mc = mask.getContext('2d');
      mc.strokeStyle = '#000'; mc.fillStyle = '#000'; mc.lineCap = 'round'; mc.lineJoin = 'round';
      for (const key in SH.runs) { const r = SH.runs[key]; mc.lineWidth = (r.hw - 0.5) * 2 * k; mc.beginPath(); r.path.pts.forEach((p, i) => i ? mc.lineTo(X(p[0]), Z(p[1])) : mc.moveTo(X(p[0]), Z(p[1]))); mc.stroke(); }
      const rect = (r) => mc.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
      rect(L.beginner); rect(L.summit); rect({ x0: L.catLane.xa - 2.2, x1: L.catLane.xb + 2.2, z0: L.catLane.z0 - 3, z1: L.catLane.z1 + 4 });
      const lines = mk(px), lc = lines.getContext('2d'); lc.fillStyle = 'rgba(150,175,220,0.15)';
      for (let x = 0; x < px; x += 4) lc.fillRect(x, 0, 2, px);
      mc.globalCompositeOperation = 'source-in'; mc.drawImage(lines, 0, 0);      // one composite: stripes kept only on groomed snow
      // powder grain everywhere: tiny cool flecks so close-ups are never flat white
      for (let i = 0; i < 52000; i++) { const g = U.hash2(i, 11); b.fillStyle = g < 0.5 ? 'rgba(170,190,225,0.13)' : 'rgba(255,255,255,0.5)'; b.fillRect(U.hash2(i, 12) * px, U.hash2(i, 13) * px, 1 + g * 2.2, 1 + U.hash2(i, 14) * 1.6); }
      b.drawImage(mask, 0, 0);
      // trodden base area: soft scuffs
      b.fillStyle = 'rgba(160,175,200,0.06)';
      for (let i = 0; i < 2600; i++) { const x = -84 + U.hash2(i, 1) * 162, z = 44 + U.hash2(i, 2) * 46; b.beginPath(); b.ellipse(X(x), Z(z), 3 + U.hash2(i, 3) * 9, 2 + U.hash2(i, 4) * 5, U.hash2(i, 5) * 3, 0, 6.3); b.fill(); }
      this.tex = new T3.CanvasTexture(this.out); this.tex.flipY = false; this.tex.colorSpace = T3.SRGBColorSpace; this.tex.anisotropy = 4; this.tex.generateMipmaps = true;
      this.last = new Map(); this.dirty = true; this.acc = 0; this.fade = 0;
      this.flush();
    }
    flush() { this.octx.drawImage(this.base, 0, 0); this.octx.drawImage(this.layer, 0, 0); this.tex.needsUpdate = true; this.dirty = false; }
    update(world, dt) {
      const c = this.lctx, X = this.X, Z = this.Z, k = this.k;
      c.lineCap = 'round';
      for (const p of world.people) {
        const st = p.state, onSnow = (st === 'ski' || st === 'respond' || st === 'fall' || ((st === 'travel' || st === 'offload' || st === 'queue') && p.skisOn));
        let l = this.last.get(p.id);
        if (!l) { l = { x: p.x, z: p.z }; this.last.set(p.id, l); }
        const d = Math.hypot(p.x - l.x, p.z - l.z);
        if (d < 0.45) continue;
        if (onSnow && d < 4) {
          if (p.kind === 'board' || st === 'fall') { c.strokeStyle = 'rgba(150,172,212,0.30)'; c.lineWidth = (st === 'fall' ? 0.9 : 0.3) * k; c.beginPath(); c.moveTo(X(l.x), Z(l.z)); c.lineTo(X(p.x), Z(p.z)); c.stroke(); }
          else {
            const nx = -(p.z - l.z) / d * 0.14, nz = (p.x - l.x) / d * 0.14, wd = p.plough ? 0.3 : 0.14;
            c.strokeStyle = 'rgba(150,172,212,0.34)'; c.lineWidth = Math.max(1.1, 0.09 * k);
            for (const s of [-1, 1]) { c.beginPath(); c.moveTo(X(l.x + nx * s * (wd / 0.14)), Z(l.z + nz * s * (wd / 0.14))); c.lineTo(X(p.x + nx * s * (wd / 0.14)), Z(p.z + nz * s * (wd / 0.14))); c.stroke(); }
          }
          this.dirty = true;
        } else if (!p.skisOn && d < 2 && !p.free && (p.x > -23 || p.z > 68)) {
          c.fillStyle = 'rgba(150,170,205,0.22)'; c.beginPath(); c.arc(X(p.x), Z(p.z), 0.11 * k, 0, 6.3); c.fill(); this.dirty = true;
        }
        l.x = p.x; l.z = p.z;
      }
      // the snowcat wipes the lane behind it back to fresh corduroy
      const cat = world.cat;
      if (cat.speed > 0.2) {
        c.save(); c.globalCompositeOperation = 'destination-out'; c.translate(X(cat.x - Math.sin(cat.yaw) * 3.4), Z(cat.z - Math.cos(cat.yaw) * 3.4)); c.rotate(-cat.yaw);
        c.fillStyle = '#000'; c.fillRect(-2.05 * k, -0.6 * k, 4.1 * k, 1.2 * k); c.restore(); this.dirty = true;
      }
      // old tracks soften slowly so the hill never saturates
      this.fade += dt;
      if (this.fade > 3) { this.fade = 0; c.save(); c.globalCompositeOperation = 'destination-out'; c.fillStyle = 'rgba(0,0,0,0.035)'; c.fillRect(0, 0, this.layer.width, this.layer.height); c.restore(); this.dirty = true; }
      this.acc += dt;
      if (this.dirty && this.acc > 0.2) { this.acc = 0; this.flush(); }
    }
  }

  // ------------------------------------------------------------ event- and state-driven emitters
  class Fx {
    constructor(scene, world) {
      this.w = world; this.parts = new Particles(scene, 3600); this.snow = snowfall(scene, 2200); this.tracks = new Tracks(); this.t = 0;
    }
    onEvent(e) {
      const P = this.parts;
      switch (e.type) {
        case 'swish': case 'carve': P.puff(e.x, e.y, e.z, 5 + Math.min(6, e.a | 0), 2.4 + e.a * 0.25, 1.6, 0.34, 0.75); break;
        case 'fall': P.puff(e.x, e.y, e.z, 26, 4.5, 3.2, 0.5, 0.85); break;
        case 'land': P.puff(e.x, e.y, e.z, 22, 5, 2.4, 0.46, 0.85); break;
        case 'takeoff': P.puff(e.x, e.y, e.z, 9, 2.5, 2.2, 0.36, 0.75); break;
        case 'getup': P.puff(e.x, e.y + 0.5, e.z, 7, 1.5, 1.4, 0.26, 0.6); break;
        case 'shovel': P.puff(e.x, e.y + 0.2, e.z, 6, 1.6, 2.2, 0.24, 0.7); break;
      }
    }
    update(dt, time, pxPerM, view) {
      const P = this.parts, w = this.w, rnd = frand;
      const wx = Math.sin(w.wind.a) * w.wind.s * 2.2, wz = Math.cos(w.wind.a) * w.wind.s * 2.2;
      this.t += dt;
      // snow guns: a long drifting plume
      for (const g of w.guns.guns) if (g.on) {
        const y = T.h(g.x, g.z) + 3.5, dx = Math.sin(g.yaw), dz = Math.cos(g.yaw);
        for (let i = 0; i < 2; i++) { const sp = 9 + rnd() * 5; P.emit(g.x + dx, y + 0.3, g.z + dz, dx * sp + (rnd() - 0.5) * 2.4, 3.2 + rnd() * 2.6, dz * sp + (rnd() - 0.5) * 2.4, 2.0 + rnd() * 1.2, 0.45, 1.3, 1, 1, 1, 0.2, 2.6); }
      }
      // fast skiers trail a little spray; fallen ones slide in a cloud
      for (const p of w.people) {
        if (p.state === 'ski' && p.speed > 5 && Math.abs(p.roll) > 0.22 && rnd() < 0.5) P.emit(p.x, p.y + 0.1, p.z, -Math.sin(p.heading) * 1.5 + (rnd() - 0.5) * 2, 0.8 + rnd(), -Math.cos(p.heading) * 1.5 + (rnd() - 0.5) * 2, 0.45, 0.28, 1.0, 1, 1, 1, 0.6, 3);
        else if (p.state === 'fall' && p.stage === 0 && rnd() < 0.8) P.emit(p.x, p.y + 0.2, p.z, (rnd() - 0.5) * 3, 1 + rnd() * 1.5, (rnd() - 0.5) * 3, 0.6, 0.4, 1.2, 1, 1, 1, 0.7, 3);
        else if (p.state === 'fall' && p.stage === 2 && rnd() < 0.35) P.emit(p.x + (rnd() - 0.5) * 0.5, p.y + 0.9, p.z + (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 1.6, 0.6 + rnd(), (rnd() - 0.5) * 1.6, 0.5, 0.16, 0.5, 1, 1, 1, 0.7, 3);
        else if (p.hasCup && rnd() < 0.05) P.emit(p.x + Math.sin(p.heading) * 0.3, p.y + 1.25 * p.scale, p.z + Math.cos(p.heading) * 0.3, 0.1, 0.5, 0, 1.2, 0.09, 0.14, 1, 1, 1, 0.5, -0.1);
      }
      const cat = w.cat;
      if (cat.speed > 0.3) for (let i = 0; i < 2; i++) P.emit(cat.x - Math.sin(cat.yaw) * 3.6 + (rnd() - 0.5) * 3.6 * Math.cos(cat.yaw), cat.y + 0.3, cat.z - Math.cos(cat.yaw) * 3.6 - (rnd() - 0.5) * 3.6 * Math.sin(cat.yaw), (rnd() - 0.5), 0.6 + rnd(), (rnd() - 0.5), 0.8, 0.4, 0.9, 1, 1, 1, 0.5, 1.2);
      if (rnd() < dt * 9) { const l = L.lodge; P.emit(l.x - 6, 11.7, l.z - 2.6, wx * (0.6 + rnd() * 0.3), 1.4 + rnd() * 0.6, wz * (0.6 + rnd() * 0.3), 5 + rnd() * 2, 0.7, 0.55, 0.93, 0.93, 0.96, 0.4, -0.05); }
      if (rnd() < dt * 5) { const k = L.cocoa.kiosk; P.emit(k[0] - 0.2 + (rnd() - 0.5) * 0.6, 4.6, k[1] + (rnd() - 0.5) * 0.6, wx * 0.4, 0.8, wz * 0.4, 2.4, 0.3, 0.3, 1, 1, 1, 0.42, -0.05); }
      if (rnd() < dt * 7) { const f = L.firePit; P.emit(f[0] + (rnd() - 0.5) * 0.3, 1.3, f[1], wx * 0.5, 1.1, wz * 0.5, 1.8, 0.22, 0.35, 0.86, 0.84, 0.84, 0.3, -0.05); }
      P.update(dt, pxPerM);
      const su = this.snow.uniforms; su.uScale.value = pxPerM; su.uTime.value = time; su.uCenter.value.set(view.x, view.y, view.z);
      this.tracks.update(w, dt);
    }
  }
  R.Fx = Fx;
})(globalThis.SH = globalThis.SH || {});
