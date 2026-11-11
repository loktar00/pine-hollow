// r11_world.js -- everything that never moves: the snow surface, forest, rocks, buildings, lift hardware,
// fences and props. Built once from SH.LAYOUT / SH.terrain into a few merged, vertex-coloured meshes.
(function (SH) {
  'use strict';
  const T3 = THREE, R = SH.render, U = SH.util, CFG = SH.CONFIG, L = SH.LAYOUT, T = SH.terrain, PAL = CFG.palette;
  const lerp = U.lerp, sstep = U.sstep;
  R.TRACK = { x0: -96, z0: -100, size: 192, px: 2048 };   // world rect covered by the ski-track texture

  // ------------------------------------------------------------ snow surface
  R.buildTerrain = function (trackTexture) {
    const NX = T.NX, NZ = T.NZ, B = T.bounds, H = T.H, n = NX * NZ;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const cP = R.rgb(PAL.pisteSnow), cS = R.rgb(PAL.snow), cSh = R.rgb(PAL.snowShade), cR = R.rgb(PAL.rock), cRd = R.rgb(PAL.rockDark), cPk = R.rgb(PAL.packed), cA = R.rgb(PAL.asphalt);
    const K = R.TRACK, pk = L.parking, c = [0, 0, 0];
    const mix = (a, b, t) => { c[0] = a[0] + (b[0] - a[0]) * t; c[1] = a[1] + (b[1] - a[1]) * t; c[2] = a[2] + (b[2] - a[2]) * t; };
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const o = j * NX + i, x = B.x0 + i, z = B.z0 + j, y = H[o];
      const hl = H[o - (i > 0 ? 1 : 0)], hr = H[o + (i < NX - 1 ? 1 : 0)], hd = H[o - (j > 0 ? NX : 0)], hu = H[o + (j < NZ - 1 ? NX : 0)];
      let nx = hl - hr, ny = 2, nz = hd - hu; const il = 1 / Math.hypot(nx, ny, nz); nx *= il; ny *= il; nz *= il;
      pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z; nor[o * 3] = nx; nor[o * 3 + 1] = ny; nor[o * 3 + 2] = nz;
      uv[o * 2] = (x - K.x0) / K.size; uv[o * 2 + 1] = (z - K.z0) / K.size;
      const od = T.OPEN[o], nz2 = U.noise2(x * 0.19, z * 0.19), nb = U.fbm(x * 0.045, z * 0.045, 3);
      mix(cP, cS, sstep(-1, 5, od)); mix(c, cSh, sstep(4, 40, od) * (0.35 + 0.5 * nb));
      const k = 0.965 + 0.05 * nz2; c[0] *= k; c[1] *= k; c[2] *= k;
      if (od < 0 && z > 43 && z < 93 && x > -86) mix(c, cPk, 0.55 * sstep(43, 48, z) * (0.6 + 0.4 * nb));
      const pd = T.rectDist(x, z, pk); if (pd < 2) mix(c, cA, sstep(2, -1, pd) * (0.5 + 0.35 * nz2));
      if (od > 6 && ny < 0.86) { const rk = sstep(0.86, 0.66, ny) * sstep(6, 16, od); const a = [lerp(cR[0], cRd[0], nb), lerp(cR[1], cRd[1], nb), lerp(cR[2], cRd[2], nb)]; mix(c, a, rk); }
      col[o * 3] = c[0]; col[o * 3 + 1] = c[1]; col[o * 3 + 2] = c[2];
    }
    const idx = new Uint32Array((NX - 1) * (NZ - 1) * 6); let q = 0;
    for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
      const a = j * NX + i, b = a + 1, d = a + NX, e = d + 1;
      idx[q++] = a; idx[q++] = d; idx[q++] = b; idx[q++] = b; idx[q++] = d; idx[q++] = e;
    }
    const g = new T3.BufferGeometry();
    g.setAttribute('position', new T3.BufferAttribute(pos, 3)); g.setAttribute('normal', new T3.BufferAttribute(nor, 3));
    g.setAttribute('color', new T3.BufferAttribute(col, 3)); g.setAttribute('uv', new T3.BufferAttribute(uv, 2));
    g.setIndex(new T3.BufferAttribute(idx, 1));
    const m = new T3.Mesh(g, new T3.MeshStandardMaterial({ vertexColors: true, map: trackTexture, roughness: 0.96, metalness: 0 }));
    m.receiveShadow = true; m.castShadow = true; m.matrixAutoUpdate = false;
    return m;
  };

  // ------------------------------------------------------------ forest and rocks (instanced)
  R.buildForest = function () {
    const b = new R.Builder(), tip = 0xdfeee9;
    b.cyl(0, 0.6, 0, 0.17, 1.4, PAL.trunk, 5);
    b.cone(0, 2.0, 0, 1.55, 2.5, [PAL.pineDark, PAL.pine], 7); b.cone(0, 3.35, 0, 1.2, 2.3, [PAL.pine, PAL.pineLight], 7); b.cone(0, 4.65, 0, 0.8, 2.1, [PAL.pineLight, tip], 7);
    // snow shelves sitting on each tier
    b.cone(0, 2.62, 0, 0.98, 0.7, [0xcfe2df, 0xf4f8fb], 7); b.cone(0, 3.92, 0, 0.72, 0.62, [0xcfe2df, 0xf4f8fb], 7); b.cone(0, 5.25, 0, 0.42, 0.9, 0xf4f8fb, 7);
    const geo = b.geometry(), spots = [], B = T.bounds, g = {};
    for (let z = B.z0 + 6; z < B.z1 - 4; z += 3.5) for (let x = B.x0 + 6; x < B.x1 - 4; x += 3.5) {
      const h1 = U.hash2(x * 7 | 0, z * 13 | 0), h2 = U.hash2(z * 5 | 0, x * 11 | 0), h3 = U.hash2((x + z) * 3 | 0, (x - z) * 17 | 0);
      const px = x + (h1 - 0.5) * 3, pz = z + (h2 - 0.5) * 3, od = T.open(px, pz);
      if (od < 2.4 || T.rectDist(px, pz, T.liftRect) < 0.5 || T.rectDist(px, pz, L.parking) < 4) continue;
      const y = T.h(px, pz); if (y > 92) continue;
      T.grad(px, pz, g); if (Math.hypot(g.gx, g.gz) > 1.05) continue;
      const dens = U.fbm(px * 0.03 + 3, pz * 0.03, 3), far = od > 26;
      if (far && (dens < 0.42 || h3 < 0.25 + sstep(60, 92, y) * 0.6)) continue;
      if (od < 26 && od > 9 && dens < 0.3) continue;
      spots.push([px, y - 0.15, pz, 0.85 + h3 * 0.75 + (far ? 0.15 : 0), h1 * 6.28, 0.82 + h2 * 0.3]);
    }
    // a few hand-placed trees to dress the base area
    for (const s of [[-64, 68], [-66, 49], [-22, 48], [-20, 92], [4, 86], [-4, 91], [24, 72], [-70, 78], [-58, 84], [-44, 90], [-32, 94], [12, 93], [78, 60], [72, 72]]) spots.push([s[0], T.h(s[0], s[1]) - 0.1, s[1], 1.0 + U.hash2(s[0], s[1]) * 0.5, 0, 1]);
    const mesh = new T3.InstancedMesh(geo, new T3.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), spots.length);
    const m = new T3.Matrix4(), col = new T3.Color();
    spots.forEach((s, i) => { R.M(m, null, s[0], s[1], s[2], 0, s[4], 0, s[3], s[3] * (0.92 + 0.2 * U.hash2(i, 7)), s[3]); mesh.setMatrixAt(i, m); col.setRGB(s[5], 0.9 + (s[5] - 0.8) * 0.4, s[5] * 0.98); mesh.setColorAt(i, col); });
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;

    const rgeo = new T3.IcosahedronGeometry(1, 0), rk = [];
    for (let i = 0; i < 520; i++) {
      const x = B.x0 + 8 + U.hash2(i, 1) * (B.x1 - B.x0 - 16), z = B.z0 + 8 + U.hash2(i, 2) * (B.z1 - B.z0 - 16);
      if (T.open(x, z) < 5 || T.rectDist(x, z, T.liftRect) < 2 || T.rectDist(x, z, L.parking) < 4) continue;
      rk.push([x, T.h(x, z) + 0.1, z, 0.6 + U.hash2(i, 3) * 1.7, U.hash2(i, 4) * 6.28]);
    }
    const rocks = new T3.InstancedMesh(rgeo, new T3.MeshStandardMaterial({ color: PAL.rock, roughness: 1, flatShading: true }), rk.length);
    rk.forEach((s, i) => { R.M(m, null, s[0], s[1], s[2], 0.3, s[4], 0.2, s[3] * 1.3, s[3] * 0.75, s[3]); rocks.setMatrixAt(i, m); });
    rocks.castShadow = true; rocks.receiveShadow = true; rocks.frustumCulled = false;
    return [mesh, rocks];
  };

  // ------------------------------------------------------------ buildings and props
  R.buildProps = function (world) {
    const b = new R.Builder(), g = new R.Builder(), P = PAL, lift = world.lift, LC = CFG.lift;
    const gy = (x, z) => T.h(x, z);
    const WARM = 0xffd27a, WHITE = 0xf4f8fb, DARK = 0x23272e;
    const drift = (x, z, r) => b.ball(x, gy(x, z) + 0.02, z, r, WHITE, 0.32);
    const post = (x, z, h, color, r) => b.cyl(x, gy(x, z) + h / 2, z, r || 0.05, h, color, 6);
    const fence = (pts, color, postColor, h) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], c = pts[i + 1], len = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.max(1, Math.round(len / 2.2));
        for (let k = 0; k <= n; k++) { const x = lerp(a[0], c[0], k / n), z = lerp(a[1], c[1], k / n); post(x, z, h + 0.12, postColor, 0.055); }
        for (let k = 0; k < n; k++) {
          const x0 = lerp(a[0], c[0], k / n), z0 = lerp(a[1], c[1], k / n), x1 = lerp(a[0], c[0], (k + 1) / n), z1 = lerp(a[1], c[1], (k + 1) / n);
          b.beam(x0, gy(x0, z0) + h, z0, x1, gy(x1, z1) + h, z1, 0.05, color); b.beam(x0, gy(x0, z0) + h * 0.55, z0, x1, gy(x1, z1) + h * 0.55, z1, 0.04, color);
        }
      }
    };
    const net = (pts) => {   // orange safety netting
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], c = pts[i + 1], len = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.max(1, Math.round(len / 2.5));
        for (let k = 0; k <= n; k++) post(lerp(a[0], c[0], k / n), lerp(a[1], c[1], k / n), 1.35, 0x30343b, 0.045);
        for (let k = 0; k < n; k++) {
          const x0 = lerp(a[0], c[0], k / n), z0 = lerp(a[1], c[1], k / n), x1 = lerp(a[0], c[0], (k + 1) / n), z1 = lerp(a[1], c[1], (k + 1) / n);
          const y0 = gy(x0, z0), y1 = gy(x1, z1), l2 = Math.hypot(x1 - x0, z1 - z0, y1 - y0);
          b.box((x0 + x1) / 2, (y0 + y1) / 2 + 0.72, (z0 + z1) / 2, 0.03, 0.9, l2, P.net, Math.atan2(x1 - x0, z1 - z0), -Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0)));
        }
      }
    };
    const lamp = (x, z) => { const y = gy(x, z); b.cyl(x, y + 1.9, z, 0.07, 3.8, DARK, 6); b.box(x, y + 3.85, z, 0.5, 0.12, 0.5, DARK); g.ball(x, y + 3.62, z, 0.2, WARM); drift(x, z, 0.5); };
    const windowAt = (x, y, z, w, h, facing) => {   // facing: 'x' = on a wall facing +x, 'z' = facing +z
      if (facing === 'x') { g.box(x, y, z, 0.08, h, w, P.glass); b.box(x + 0.02, y, z, 0.1, h + 0.24, 0.1, P.timberDark); b.box(x + 0.02, y, z, 0.1, 0.1, w + 0.24, P.timberDark); b.box(x + 0.06, y - h / 2 - 0.1, z, 0.3, 0.1, w + 0.3, WHITE); }
      else { g.box(x, y, z, w, h, 0.08, P.glass); b.box(x, y, z + 0.02, 0.1, h + 0.24, 0.1, P.timberDark); b.box(x, y, z + 0.02, w + 0.24, 0.1, 0.1, P.timberDark); b.box(x, y - h / 2 - 0.1, z + 0.06, w + 0.3, 0.1, 0.3, WHITE); }
    };

    // ---- lodge
    {
      const lx = L.lodge.x, lz = L.lodge.z, w = L.lodge.w, d = L.lodge.d, ex = lx + w / 2, sz = lz + d / 2;
      b.box(lx, 0.7, lz, w, 1.4, d, P.stone); b.box(lx, 3.9, lz, w - 0.4, 5.0, d - 0.4, P.timber);
      for (let y = 1.9; y < 6.3; y += 0.62) b.box(lx, y, lz, w - 0.32, 0.07, d - 0.32, P.timberDark);
      for (const cx of [ex - 0.2, lx - w / 2 + 0.2]) for (const cz of [sz - 0.2, lz - d / 2 + 0.2]) b.box(cx, 3.6, cz, 0.5, 5.8, 0.5, P.timberDark);
      b.gable(lx, 6.4, lz, w, d, 3.6, WHITE); b.gable(lx, 6.28, lz, w + 0.3, d + 0.5, 3.6, P.roofRed);
      for (let i = 0; i < 7; i++) for (const s of [-1, 1]) b.box(lx + s * (w / 2 - 0.25), 6.4 + i * 0.5 + 0.25, lz, 0.4, 0.5, (d - 0.6) * (1 - (i + 0.6) / 7.4), i % 2 ? P.timber : P.timberDark);
      for (const dx of [-5.5, 0, 5.5]) { b.box(lx + dx, 7.7, lz + 4.4, 2.0, 1.5, 2.4, P.timber); b.gable(lx + dx, 8.45, lz + 4.4, 2.4, 2.0, 0.8, WHITE, 1.5708); windowAt(lx + dx, 7.75, lz + 5.6, 1.1, 0.8, 'z'); }
      b.box(lx, 10.05, lz, w + 0.5, 0.16, 0.5, WHITE);
      b.box(lx - 6, 9.6, lz - 2.6, 1.3, 3.6, 1.3, P.stone); b.box(lx - 6, 11.5, lz - 2.6, 1.6, 0.25, 1.6, WHITE);
      for (const z of [lz - 5, lz - 1.8, lz + 5]) { windowAt(ex - 0.16, 2.6, z, 1.5, 1.3, 'x'); windowAt(ex - 0.16, 5.0, z, 1.5, 1.1, 'x'); }
      windowAt(ex - 0.16, 5.0, lz + 1.9, 1.5, 1.1, 'x');
      b.box(ex - 0.12, 1.75, lz + 1.9, 0.14, 2.3, 1.5, P.timberDark); g.box(ex - 0.06, 2.3, lz + 1.9, 0.08, 0.6, 0.8, P.glass);
      b.box(ex + 0.5, 3.2, lz + 1.9, 1.2, 0.14, 2.4, P.roofRed, 0, 0, -0.25); b.box(ex + 0.55, 3.34, lz + 1.9, 1.2, 0.1, 2.4, WHITE, 0, 0, -0.25);
      for (const x of [lx - 7.5, lx - 3.8, lx, lx + 3.8, lx + 7.5]) { windowAt(x, 2.6, sz - 0.16, 1.6, 1.3, 'z'); windowAt(x, 5.0, sz - 0.16, 1.6, 1.1, 'z'); }
      b.box(lx, 4.0, sz + 0.75, w - 2, 0.14, 1.5, P.deck); for (let x = lx - w / 2 + 1; x <= lx + w / 2 - 1; x += 1.5) b.box(x, 4.55, sz + 1.45, 0.1, 1.0, 0.1, P.timberDark);
      b.box(lx, 5.05, sz + 1.45, w - 2, 0.1, 0.12, P.timberDark); for (const x of [lx - w / 2 + 1.1, lx, lx + w / 2 - 1.1]) b.box(x, 2.0, sz + 1.4, 0.22, 4.0, 0.22, P.timberDark);
      g.box(ex + 0.05, 6.2, lz + 1.9, 0.1, 0.55, 3.6, P.liftYellow); b.box(ex, 6.2, lz + 1.9, 0.12, 0.8, 4.0, P.timberDark);
      for (let i = 0; i < 9; i++) drift(lx - w / 2 + 1 + i * 2.4, sz + 2.4 + (i % 2) * 0.5, 1.2);
      for (let i = 0; i < 6; i++) drift(lx - w / 2 - 0.9, lz - d / 2 + 1 + i * 2.6, 1.3);
      // flags
      for (let i = 0; i < 4; i++) { const fx = lx - 8 + i * 5.4, fz = sz + 5.2, col = [0xe5383b, 0xffc233, 0x15aabf, 0x3fb950][i]; b.cyl(fx, 2.6, fz, 0.05, 5.2, 0xdfe5ea, 6); b.ball(fx, 5.25, fz, 0.09, 0xffc233); drift(fx, fz, 0.45); }
    }
    // ---- deck with tables, umbrellas, fire pit
    {
      const D = L.deck, cx = (D.x0 + D.x1) / 2, cz = (D.z0 + D.z1) / 2, w = D.x1 - D.x0, d = D.z1 - D.z0, h = D.h;
      b.box(cx, h / 2 - 0.02, cz, w, h, d, P.deck);
      for (let x = D.x0 + 0.9; x < D.x1; x += 0.9) b.box(x, h - 0.005, cz, 0.05, 0.03, d, P.timberDark);
      const rail = (x0, z0, x1, z1) => { const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.8); for (let k = 0; k <= n; k++) b.box(lerp(x0, x1, k / n), h + 0.52, lerp(z0, z1, k / n), 0.12, 1.05, 0.12, P.timberDark); b.beam(x0, h + 1.05, z0, x1, h + 1.05, z1, 0.13, P.timber); b.beam(x0, h + 0.55, z0, x1, h + 0.55, z1, 0.07, P.timber); };
      rail(D.x1, D.z0, D.x1, 56.2); rail(D.x1, 61.2, D.x1, D.z1); rail(D.x1, D.z1, D.x0, D.z1); rail(D.x0 + 0.2, D.z0, D.x1, D.z0);
      for (let i = 0; i < 3; i++) b.box(D.x1 + 0.45 + i * 0.5, h - 0.09 - i * 0.15, 58.7, 0.52, 0.16, 4.6, P.timber);
      const table = (x, z, col) => {
        b.box(x, h + 0.76, z, 3.6, 0.09, 0.85, P.timber); for (const s of [-1.3, 1.3]) b.box(x + s, h + 0.38, z, 0.12, 0.76, 0.7, P.timberDark);
        for (const s of [-1.5, 1.5]) { b.box(x, h + 0.45, z + s, 3.6, 0.08, 0.36, P.timber); for (const t of [-1.3, 1.3]) b.box(x + t, h + 0.22, z + s, 0.1, 0.45, 0.3, P.timberDark); }
        if (col) { b.cyl(x - 2.4, h + 1.7, z, 0.045, 3.4, 0xdfe5ea, 6); b.cone(x - 2.4, h + 3.3, z, 1.5, 0.75, col, 10); b.ball(x - 2.4, h + 3.72, z, 0.09, 0xffffff); }
        g.ball(x - 0.6, h + 0.9, z, 0.07, WARM);
      };
      table(-38, 54.7, 0xe5383b); table(-32, 59.7, 0);
      const f = L.firePit; b.cyl(f[0], h + 0.2, f[1], 0.72, 0.4, P.stone, 10); b.cyl(f[0], h + 0.36, f[1], 0.55, 0.12, 0x2a2420, 10);
      for (const s of [-1, 1]) { b.box(f[0] + s * 1.7, h + 0.25, f[1], 0.5, 0.5, 2.0, P.timberDark); b.box(f[0] + s * 1.7, h + 0.52, f[1], 0.52, 0.06, 2.02, P.timber); }
      for (let i = 0; i < 7; i++) drift(D.x0 + 1.5 + i * 2.6, D.z1 + 0.9, 1.0);
    }
    // ---- hot chocolate kiosk
    {
      const k = L.cocoa.kiosk, x = k[0], z = k[1];
      b.box(x - 1.4, 1.3, z, 0.2, 2.6, 3.2, P.timber); b.box(x - 0.2, 1.3, z - 1.6, 2.6, 2.6, 0.2, P.timber); b.box(x - 0.2, 1.3, z + 1.6, 2.6, 2.6, 0.2, P.timber);
      b.box(x + 1.15, 0.55, z, 0.5, 1.1, 3.4, P.timberDark); b.box(x + 1.2, 1.13, z, 0.8, 0.08, 3.5, 0xe9d8b4);
      b.box(x - 0.1, 2.75, z, 3.2, 0.2, 3.8, P.roofRed); b.box(x - 0.1, 2.9, z, 3.3, 0.16, 3.9, WHITE);
      for (let i = 0; i < 8; i++) b.box(x + 2.25, 2.45, z - 1.66 + i * 0.475, 1.7, 0.07, 0.475, i % 2 ? 0xffffff : 0xe5383b, 0, 0, -0.3);
      for (const s of [-1.75, 1.75]) b.cyl(x + 2.9, 1.1, z + s, 0.04, 2.2, 0xdfe5ea, 6);
      for (let i = 0; i < 9; i++) g.ball(x + 3.0, 2.12 - 0.05 * Math.sin(i / 8 * Math.PI) * 2, z - 1.7 + i * 0.425, 0.075, [0xffd27a, 0xff8f6b, 0x9be7ff][i % 3]);
      // the giant mug on the roof
      b.cyl(x - 0.2, 3.75, z, 0.75, 1.4, 0xfff4e0, 12); b.cyl(x - 0.2, 4.46, z, 0.66, 0.06, 0x6b3f22, 12); b.box(x - 0.2, 3.8, z + 0.95, 0.16, 0.8, 0.5, 0xfff4e0); b.box(x - 0.2, 3.75, z - 0.02, 1.52, 0.22, 1.52, 0xe5383b);
      b.ball(x - 0.45, 4.52, z + 0.1, 0.2, WHITE, 0.6); b.ball(x + 0.05, 4.52, z - 0.2, 0.17, WHITE, 0.6);
      b.cyl(x + 0.7, 1.45, z - 0.9, 0.2, 0.55, 0xc9ced6, 8); b.cyl(x + 0.7, 1.78, z - 0.9, 0.1, 0.12, DARK, 8);
      for (let i = 0; i < 4; i++) b.cyl(x + 1.25, 1.24, z + 0.3 + i * 0.28, 0.07, 0.14, 0xfff4e0, 6);
      b.box(x + 1.0, 1.9, z + 2.05, 0.1, 1.5, 1.1, DARK, 0.5); for (let i = 0; i < 4; i++) g.box(x + 1.07, 2.35 - i * 0.28, z + 2.08, 0.04, 0.09, 0.7 - (i % 2) * 0.2, 0xfff4e0, 0.5);
      b.box(x + 1.0, 0.6, z + 2.05, 0.08, 1.2, 0.08, DARK);
      for (const s of [[-7.1, 70.6], [-11.4, 69.8], [-4.4, 69.3]]) { b.cyl(s[0], 0.55, s[1], 0.06, 1.1, DARK, 6); b.cyl(s[0], 1.12, s[1], 0.48, 0.06, P.timber, 10); b.cyl(s[0], 0.04, s[1], 0.3, 0.06, DARK, 8); b.ball(s[0], 1.17, s[1], 0.3, WHITE, 0.14); }
      const rk = L.cocoa.rack; b.beam(rk.x0 - 0.8, 0.95, rk.z - 0.75, rk.x0 + rk.n * rk.dx, 0.95, rk.z - 0.75, 0.09, P.timber);
      for (let i = 0; i <= 4; i++) b.box(rk.x0 - 0.8 + i * (rk.n * rk.dx + 0.8) / 4, 0.5, rk.z - 0.75, 0.1, 1.0, 0.1, P.timberDark);
      const bn = L.cocoa.bin; b.cyl(bn[0], 0.5, bn[1] + 0.7, 0.3, 1.0, 0x2f7a5c, 8); b.cyl(bn[0], 1.03, bn[1] + 0.7, 0.33, 0.07, DARK, 8);
      drift(x - 1.9, z, 1.3); drift(x - 0.2, z - 2.1, 1.2); drift(x - 0.4, z + 2.2, 1.1);
    }
    // ---- lift: stations, towers, cable
    {
      const x = LC.x, station = (z, dir) => {
        const y = gy(x, z), cy = y + LC.stationH;
        // open bullwheel on a mast (no roof: the camera looks down on the loading line)
        for (let k = 0; k < 20; k++) { const a = k / 20 * 6.2832; b.box(x + Math.cos(a) * LC.wheelR, cy + 0.32, z + Math.sin(a) * LC.wheelR, 0.74, 0.2, 0.2, P.liftYellow, -a + 1.5708); }
        for (let k = 0; k < 4; k++) b.box(x, cy + 0.32, z, LC.wheelR * 2, 0.1, 0.14, P.steelLight, k * 0.785);
        b.cyl(x, y + (LC.stationH + 1.5) / 2, z, 0.38, LC.stationH + 1.5, P.steel, 8); b.cyl(x, y + 0.35, z, 0.75, 0.7, 0x8d8a86, 8);
        b.box(x, cy + 1.25, z + dir * 0.9, 1.7, 1.0, 3.0, P.liftTeal); b.box(x, cy + 1.25, z + dir * 0.9, 1.76, 0.26, 3.06, P.liftYellow); b.box(x, cy + 1.8, z + dir * 0.9, 1.8, 0.12, 3.1, WHITE);
        for (const sx of [-1, 1]) b.beam(x + sx * 2.6, y, z + dir * 5.2, x + sx * 0.3, cy + 0.9, z + dir * 1.6, 0.22, P.steel);
        drift(x - 2.6, z + dir * 5.4, 0.9); drift(x + 2.6, z + dir * 5.4, 0.9);
        // operator hut
        const hx = x - 6.8, hz = z + dir * 0.8;
        b.box(hx, y + 1.3, hz, 2.6, 2.6, 2.6, P.liftTeal); b.box(hx, y + 2.72, hz, 3.0, 0.2, 3.0, WHITE); windowAt(hx + 1.3, y + 1.6, hz, 1.4, 0.9, 'x'); windowAt(hx, y + 1.6, hz + 1.3, 1.4, 0.9, 'z');
        b.box(hx, y + 0.45, hz, 2.7, 0.3, 2.7, P.liftYellow); drift(hx - 1.2, hz, 1.2); drift(hx, hz - dir * 1.5, 1.1);
        // loading / unloading pad marks
        const pz = dir > 0 ? LC.loadZ : LC.unloadZ;
        b.box(lift.xUp, y + 0.03, pz, 3.2, 0.05, 0.3, 0xe5383b); b.box(lift.xUp, y + 0.02, pz + 1.6, 3.2, 0.03, 2.6, 0x7c8792);
      };
      station(LC.zBottom, 1); station(LC.zTop, -1);
      LC.towers.forEach((t, i) => {
        const z = t[0], y = gy(x, z), top = y + t[1];
        b.cyl(x, y + (t[1] + 0.9) / 2 - 0.2, z, 0.32, t[1] + 0.9, P.steel, 8); b.cyl(x, y + 0.3, z, 0.6, 0.6, 0x8d8a86, 8);
        b.box(x, top + 0.55, z, LC.gauge + 1.7, 0.3, 0.42, P.steel); b.box(x, top + 0.95, z, 0.5, 0.5, 0.5, P.liftYellow);
        for (const s of [-1, 1]) { b.box(x + s * LC.gauge / 2, top + 0.28, z, 0.2, 0.3, 2.4, P.steelLight); for (let k = -2; k <= 2; k++) b.cyl(x + s * LC.gauge / 2, top + 0.14, z + k * 0.5, 0.17, 0.12, DARK, 8, 0, 0, Math.PI / 2); }
        for (let k = 0; k < Math.floor(t[1] / 0.5); k++) b.box(x + 0.34, y + 0.6 + k * 0.5, z, 0.05, 0.05, 0.4, P.steelLight);
        b.box(x, y + 2.2, z + 0.34, 0.5, 0.5, 0.04, P.liftYellow); drift(x, z + 0.5, 1.0);
      });
      const n = lift.nodes;
      for (const lx of [lift.xUp, lift.xDn]) for (let i = 0; i < n.length - 1; i++) {
        const a = n[i], c = n[i + 1], flat = a[1] === c[1], segs = flat ? 1 : 6;
        for (let k = 0; k < segs; k++) { const z0 = lerp(a[0], c[0], k / segs), z1 = lerp(a[0], c[0], (k + 1) / segs); b.beam(lx, lift.cableY(z0 - 1e-4), z0, lx, lift.cableY(z1 + 1e-4), z1, 0.11, 0x1b1f24); }
      }
    }
    // ---- queue maze
    {
      const C = P.rope, Y = P.liftYellow;
      fence([[27.2, 63.7], [43.7, 63.7], [43.7, 58.3]], C, Y, 0.95); fence([[27.6, 61.1], [41.1, 61.1]], C, Y, 0.95); fence([[30.4, 58.5], [43.7, 58.5]], C, Y, 0.95);
      fence([[27.6, 61.1], [27.6, 55.9], [41.2, 55.9], [43.4, 50.6]], C, Y, 0.95); fence([[43.7, 58.3], [46.2, 52.2]], C, Y, 0.95);
      for (const s of [-1, 1]) b.cyl(26.6, 1.7, 62.4 + s * 1.5, 0.09, 3.4, P.liftTeal, 8);
      b.box(26.6, 3.2, 62.4, 0.16, 0.8, 3.4, P.liftTeal); g.box(26.5, 3.2, 62.4, 0.06, 0.4, 2.4, P.liftYellow);
      for (let i = 0; i < 5; i++) drift(28 + i * 3.6, 64.5, 0.8);
    }
    // ---- piste furniture: marker poles, nets, arches, kicker paint
    {
      const mark = (runKey, color) => { const r = SH.runs[runKey], o = {}; for (let s = 6; s < r.len - 8; s += 13) for (const side of [-1, 1]) { r.path.at(s, o); const x = o.x + o.tz * side * (r.hw + 0.6), z = o.z - o.tx * side * (r.hw + 0.6); if (T.open(x, z) > 1.5 || T.open(x, z) < -3.5) continue; post(x, z, 1.7, 0xf4f8fb, 0.04); b.cyl(x, gy(x, z) + 1.55, z, 0.09, 0.4, color, 6); b.cyl(x, gy(x, z) + 1.86, z, 0.17, 0.05, side > 0 ? 0xff7b25 : color, 8, 0, Math.PI / 2); } };
      mark('main', 0x2f6fde); mark('mogul', 0x1c1f24); mark('park', 0xff7b25);
      const k = L.kicker;
      net([[k.x - k.hw - 2.6, k.zLip - 13], [k.x - k.hw - 2.6, k.zLip + 2]]); net([[k.x + k.hw + 2.6, k.zLip - 13], [k.x + k.hw + 2.6, k.zLip + 2]]);
      for (const s of [-1, 1]) { const x = k.x + s * (k.hw + 0.5), z = k.zLip - 0.4; post(x, z, 2.6, 0xdfe5ea, 0.045); b.box(x + 0.5, gy(x, z) + 2.25, z, 1.0, 0.6, 0.04, 0xff7b25, 0.3); }
      for (let i = -3; i <= 3; i++) b.box(k.x + i * 0.9, gy(k.x + i * 0.9, k.zLip - 0.5) + 0.03, k.zLip - 0.5, 0.6, 0.05, 0.35, 0x2f6fde);
      net([[43.4, 30], [43.4, 46.5]]); net([[-34.2, 26], [-34.2, 38]]); net([[-12, 44.4], [-30, 44.4]]);
      // finish arch at the bottom of Blue Jay
      const ax0 = -5, ax1 = 23, az = 45.4;
      for (const x of [ax0, ax1]) { b.cyl(x, 2.3, az, 0.55, 4.6, 0xe5383b, 10); b.cyl(x, 0.5, az, 0.62, 1.0, 0xffffff, 10); drift(x, az + 0.5, 1.1); }
      b.box((ax0 + ax1) / 2, 4.9, az, ax1 - ax0 + 1.1, 1.1, 1.0, 0xe5383b); g.box((ax0 + ax1) / 2, 4.9, az + 0.52, 9, 0.5, 0.05, 0xffffff);
      for (let i = 0; i < 9; i++) b.box(ax0 + 2 + i * 3, 4.9, az + 0.51, 0.9, 1.12, 0.04, i % 2 ? 0xffc233 : 0xffffff);
      // ski-school gates on Bunny Meadow
      const S = CFG.styles.school;
      for (let i = 0; i < 4; i++) { const z = 5 + S.L * (0.25 + i * 0.5), side = i % 2 ? -1 : 1, x = -66 + side * (S.A - 2.4), col = [0xff7b25, 0x2f6fde, 0x3fb950, 0xd6409f][i]; if (z > 36) break;
        for (const s of [-1, 1]) b.cyl(x + s * 1.1, gy(x, z) + 0.75, z, 0.07, 1.5, col, 6); b.box(x, gy(x, z) + 1.5, z, 2.4, 0.2, 0.12, col); b.cone(x - side * 4.6, gy(x - side * 4.6, z + 3) + 0.3, z + 3, 0.22, 0.6, [0xff7b25, 0xffffff], 8); }
      // magic carpet
      const cp = L.carpet;
      for (let z = cp.zTop; z < cp.zBottom; z += 2) { const y0 = gy(cp.x, z), y1 = gy(cp.x, z + 2); for (const s of [-1, 1]) b.beam(cp.x + s * 0.72, y0 + 0.35, z, cp.x + s * 0.72, y1 + 0.35, z + 2, 0.09, P.liftTeal); if ((z - cp.zTop) % 4 === 0) for (const s of [-1, 1]) b.box(cp.x + s * 0.72, y0 + 0.17, z, 0.08, 0.36, 0.08, P.steel); b.beam(cp.x, y0 + 0.04, z, cp.x, y1 + 0.04, z + 2, 0.02, DARK); }
      for (const z of [cp.zTop - 0.6, cp.zBottom + 0.6]) { const y = gy(cp.x, z); for (const s of [-1, 1]) b.cyl(cp.x + s * 1.1, y + 1.2, z, 0.08, 2.4, 0xffc233, 6); b.box(cp.x, y + 2.4, z, 2.5, 0.35, 0.14, 0xffc233); }
      fence([[-73, 41.5], [-81.6, 41.5]], P.rope, P.liftYellow, 0.9);
    }
    // ---- summit: patrol hut, sled, trail sign, radio mast, start banner
    {
      const h = L.patrolHut, x = h[0], z = h[1], y = gy(x, z);
      b.box(x, y + 1.4, z, 4.4, 2.8, 3.6, 0xc92a2a); b.gable(x, y + 2.8, z, 4.4, 3.6, 1.3, WHITE); b.box(x, y + 0.2, z, 4.6, 0.4, 3.8, P.stone);
      for (let i = 0; i < 3; i++) b.box(x, y + 2.8 + i * 0.42 + 0.2, z + 0, 4.3, 0.42, 3.4 * (1 - (i + 0.5) / 3.3), 0xc92a2a);
      g.box(x - 0.6, y + 2.15, z + 1.82, 2.2, 0.28, 0.05, 0xffffff); g.box(x - 0.6, y + 1.75, z + 1.82, 1.4, 0.16, 0.05, 0xffc233); windowAt(x + 2.2, y + 1.6, z, 1.2, 0.9, 'x');
      b.box(x + 1.3, y + 1.0, z + 1.83, 0.9, 2.0, 0.06, P.timberDark);
      // rescue sled
      const sx = x + 4.6, sz = z + 1.6, sy = gy(sx, sz);
      for (const s of [-0.5, 0.5]) { b.cyl(sx + s, sy + 0.9, sz, 0.05, 1.8, 0xdfe5ea, 6); } b.box(sx, sy + 1.5, sz, 1.2, 0.5, 0.06, 0xffc233);
      drift(x - 2.6, z, 1.5); drift(x, z - 2.2, 1.6);
      // trail sign
      const tx = 27, tz = -88.5, ty = gy(tx, tz); b.cyl(tx, ty + 1.6, tz, 0.08, 3.2, P.timberDark, 6);
      [[0x2f6fde, 0.5], [0x1c1f24, -0.6], [0xff7b25, 0.15]].forEach((s, i) => { b.box(tx, ty + 2.9 - i * 0.5, tz + 0.05, 1.9, 0.4, 0.08, s[0], s[1]); g.box(tx + Math.cos(s[1]) * 0.6, ty + 2.9 - i * 0.5, tz + 0.1 - Math.sin(s[1]) * 0.6, 0.5, 0.12, 0.05, 0xffffff, s[1]); });
      // radio mast
      const mx = 56, mz = -95.5, my = gy(mx, mz);
      for (const s of [[-0.5, -0.5], [0.5, -0.5], [0, 0.6]]) b.beam(mx + s[0], my, mz + s[1], mx + s[0] * 0.15, my + 13, mz + s[1] * 0.15, 0.09, 0xdfe5ea);
      for (let k = 1; k < 7; k++) { const f = 1 - k / 7 * 0.85; b.box(mx, my + k * 1.85, mz, 1.1 * f, 0.07, 1.1 * f, k % 2 ? 0xe5383b : 0xdfe5ea); }
      b.cyl(mx, my + 13.6, mz, 0.04, 1.4, DARK, 5); b.cyl(mx + 0.3, my + 10.5, mz, 0.45, 0.2, 0xdfe5ea, 10, 0, 0, Math.PI / 2);
      // start banner over Blue Jay
      const bz = -77.5; for (const px of [11, 33]) { post(px, bz, 4.2, 0x2f6fde, 0.12); drift(px, bz, 0.7); }
      b.box(22, gy(22, bz) + 4.0, bz, 22, 0.85, 0.08, 0x2f6fde); for (let i = 0; i < 8; i++) g.box(13 + i * 2.6, gy(22, bz) + 4.0, bz + 0.06, 1.2, 0.3, 0.04, i % 2 ? 0xffffff : 0xffc233);
      net([[1.5, -86], [1.5, -96.5], [20, -97.5]]); net([[40, -78], [43.4, -70]]);
    }
    // ---- ticket hut, trail map, lamps, benches
    {
      const t = L.ticketHut, x = t[0], z = t[1];
      b.box(x, 1.35, z, 3.4, 2.7, 3.0, 0x2b6cb0); b.gable(x, 2.7, z, 3.4, 3.0, 1.2, WHITE); for (let i = 0; i < 3; i++) b.box(x, 2.7 + i * 0.4 + 0.2, z, 3.3, 0.4, 2.8 * (1 - (i + 0.5) / 3.3), 0x2b6cb0);
      windowAt(x, 1.6, z + 1.5, 1.6, 0.9, 'z'); b.box(x, 1.05, z + 1.7, 2.0, 0.08, 0.5, 0xe9d8b4); for (let i = 0; i < 6; i++) b.box(x - 1.5 + i * 0.6, 2.5, z + 2.0, 0.6, 0.06, 0.9, i % 2 ? 0xffffff : 0xffc233, 0, 0.35);
      drift(x - 2, z, 1.3); drift(x + 2, z - 0.6, 1.2);
      // trail map board
      const mx = 17, mz = 72.5; for (const s of [-1.6, 1.6]) b.cyl(mx + s, 1.5, mz, 0.09, 3.0, P.timberDark, 6);
      b.box(mx, 2.2, mz, 3.6, 2.2, 0.12, P.timberDark); g.box(mx, 2.2, mz + 0.07, 3.3, 1.9, 0.04, 0xeaf2f8); b.gable(mx, 3.3, mz, 3.8, 0.9, 0.4, WHITE);
      [[0x2f6fde, -0.9, 0.5], [0x1c1f24, -0.2, -0.4], [0xff7b25, 0.7, 0.3], [0x3fb950, -1.2, -0.2]].forEach((s) => g.box(mx + s[1], 2.2, mz + 0.1, 0.09, 1.5, 0.03, s[0], 0, 0, s[2]));
      for (const s of [[0, 55], [-19, 55.5], [22, 67], [-4, 77], [34, 71], [-23, 70], [50, 68], [-60, 70], [-72, 46], [8, 90]]) lamp(s[0], s[1]);
      for (const s of [[20, 70, 0], [-1, 74, 0.4], [-24.5, 73, 1.57], [36, 66, 0]]) { b.box(s[0], 0.48, s[1], 2.0, 0.09, 0.5, P.timber, s[2]); b.box(s[0], 0.85, s[1] - 0.22, 2.0, 0.5, 0.07, P.timber, s[2]); for (const q of [-0.8, 0.8]) b.box(s[0] + q * Math.cos(s[2]), 0.24, s[1] - q * Math.sin(s[2]), 0.1, 0.48, 0.45, DARK, s[2]); }
    }
    // ---- car park with snowy cars and a shuttle bus
    {
      const pk = L.parking, cols = [0xc92a2a, 0x2b6cb0, 0xe9ecef, 0x343a40, 0x2f9e44, 0xf08c00, 0x7048e8, 0x868e96];
      const car = (x, z, ry, col, snow) => {
        const y = gy(x, z); b.box(x, y + 0.62, z, 1.75, 0.7, 4.1, col, ry); b.box(x, y + 1.2, z, 1.6, 0.6, 2.2, col, ry); b.box(x, y + 1.22, z, 1.62, 0.42, 2.24, 0x9ec9e8, ry);
        b.box(x, y + 1.24, z, 1.64, 0.5, 1.6, col, ry); if (snow) b.box(x, y + 1.58, z, 1.5, 0.16, 2.0, WHITE, ry); else { b.box(x, y + 1.62, z, 0.9, 0.2, 1.7, DARK, ry); }
        for (const sx of [-0.8, 0.8]) for (const sz of [-1.3, 1.3]) { const c = Math.cos(ry), s = Math.sin(ry); b.cyl(x + sx * c + sz * s, y + 0.32, z - sx * s + sz * c, 0.33, 0.25, 0x15171a, 8, ry, 0, Math.PI / 2); }
      };
      let i = 0;
      for (const z of [pk.z0 + 4.5, pk.z0 + 15]) for (let x = pk.x0 + 3; x < pk.x1 - 14; x += 3.1) { if (U.hash2(i * 3, 5) < 0.78) car(x + (U.hash2(i, 9) - 0.5) * 0.3, z + (U.hash2(i, 4) - 0.5) * 0.6, U.hash2(i, 8) < 0.5 ? 0 : Math.PI, cols[i % cols.length], U.hash2(i, 2) < 0.6); i++; }
      const bx = pk.x1 - 7, bz = pk.z0 + 9, by = gy(bx, bz);
      b.box(bx, by + 1.7, bz, 2.6, 2.7, 10.5, 0xffc233); b.box(bx, by + 2.2, bz, 2.64, 0.9, 9.6, 0x9ec9e8); for (let k = 0; k < 6; k++) b.box(bx, by + 2.2, bz - 4.2 + k * 1.7, 2.68, 0.95, 0.14, 0xffc233);
      b.box(bx, by + 3.12, bz, 2.4, 0.16, 10, WHITE); b.box(bx, by + 1.0, bz, 2.66, 0.25, 10.55, 0x2b6cb0); for (const sz of [-3.4, 3.4]) for (const sx of [-1.25, 1.25]) b.cyl(bx + sx, by + 0.5, bz + sz, 0.5, 0.3, 0x15171a, 10, 0, 0, Math.PI / 2);
      for (let k = 0; k < 8; k++) drift(pk.x0 + 2 + k * 6, pk.z0 - 0.8, 1.5);
    }
    // ---- background gondola (scenery): towers, twin cables, two end stations
    {
      const G = L.gondola, pts = [];
      for (let i = 0; i < G.towers; i++) { const u = i / (G.towers - 1), x = lerp(G.a[0], G.b[0], u), z = lerp(G.a[1], G.b[1], u); pts.push([x, gy(x, z), z]); }
      const dx = G.b[0] - G.a[0], dz = G.b[1] - G.a[1], dl = Math.hypot(dx, dz), nx = dz / dl, nz = -dx / dl, yaw = Math.atan2(dx, dz);
      pts.forEach((q, i) => {
        const end = i === 0 || i === pts.length - 1;
        if (end) { b.box(q[0], q[1] + G.h / 2, q[2], 6, G.h + 2, 8, P.liftTeal, yaw); b.box(q[0], q[1] + G.h + 1.2, q[2], 6.6, 0.4, 8.6, WHITE, yaw); b.box(q[0], q[1] + G.h * 0.55, q[2], 6.1, 0.8, 8.1, P.liftYellow, yaw); g.box(q[0], q[1] + 3, q[2], 6.1, 1.6, 5, P.glass, yaw); }
        else { b.cyl(q[0], q[1] + G.h / 2, q[2], 0.45, G.h + 1, P.steel, 8); b.box(q[0], q[1] + G.h + 0.4, q[2], 5, 0.35, 0.5, P.steel, yaw); b.box(q[0], q[1] + G.h + 0.8, q[2], 0.6, 0.6, 0.6, P.liftYellow, yaw); }
        if (i) for (const s of [-1.5, 1.5]) b.beam(pts[i - 1][0] + nx * s, pts[i - 1][1] + G.h, pts[i - 1][2] + nz * s, q[0] + nx * s, q[1] + G.h, q[2] + nz * s, 0.12, 0x1b1f24);
      });
    }
    // ---- sled hill sign and hay-bale stop
    { const H = L.sledHill; for (let i = 0; i < 4; i++) b.box(H.x - 1.8 + i * 1.25, gy(H.x, H.z1 + 2.2) + 0.35, H.z1 + 2.4, 1.15, 0.7, 0.7, 0xe2c15a); post(H.x + 3.4, H.z0 - 1, 2.4, P.timberDark, 0.07); b.box(H.x + 3.4, gy(H.x + 3.4, H.z0 - 1) + 2.1, H.z0 - 0.95, 1.6, 0.6, 0.08, 0xe5383b); g.box(H.x + 3.4, gy(H.x + 3.4, H.z0 - 1) + 2.1, H.z0 - 0.9, 1.1, 0.14, 0.03, 0xffffff); }
    // ---- floodlight masts for night skiing (the light itself is a PointLight at each head)
    for (const f of L.floods) { const y = gy(f[0], f[1]); b.cyl(f[0], y + 5.6, f[1], 0.13, 11.2, P.steel, 6); b.box(f[0], y + 11.2, f[1], 1.9, 0.14, 0.3, P.steel, 0.6); for (const s of [-0.6, 0.6]) { b.box(f[0] + s * 0.83, y + 11.0, f[1] - s * 0.56, 0.7, 0.34, 0.5, DARK, 0.6); g.box(f[0] + s * 0.83, y + 10.82, f[1] - s * 0.56, 0.58, 0.06, 0.4, 0xfff3cf, 0.6); } drift(f[0], f[1], 0.8); }
    // ---- snow gun stands (the fan heads are drawn live)
    for (const s of L.snowGuns) {
      const x = s[0], z = s[1], y = gy(x, z);
      for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.5; b.beam(x + Math.cos(a) * 1.1, y, z + Math.sin(a) * 1.1, x, y + 1.9, z, 0.09, P.steel); }
      b.cyl(x, y + 2.45, z, 0.1, 1.3, P.steel, 6); b.box(x, y + 0.2, z + 0.9, 0.6, 0.4, 0.5, P.gunYellow); drift(x, z, 1.3);
    }
    const lit = b.mesh(new T3.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 }));
    const glow = g.mesh(R.glowMat = new T3.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false);
    return [lit, glow];
  };
})(globalThis.SH = globalThis.SH || {});
