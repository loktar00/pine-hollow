// a02_terrain.js -- the resort layout (data) and the slope definition (heightfield).
// Units are metres. +z runs downhill toward the viewer, +x to the lift side, +y up.
(function (SH) {
  'use strict';
  const U = SH.util, clamp = U.clamp, sstep = U.sstep, lerp = U.lerp;

  // ---------------------------------------------------------------- layout (edit me)
  const L = SH.LAYOUT = {
    bounds: { x0: -215, x1: 200, z0: -200, z1: 195 },
    top: 46,
    runs: {
      main:   { name: 'Blue Jay',      hw: 13,  ctrl: [[22, -80], [13, -62], [4, -40], [-4, -15], [0, 12], [6, 34], [10, 47]] },
      mogul:  { name: 'Thunder Bumps', hw: 8,   ctrl: [[12, -82], [-8, -71], [-22, -57], [-26, -35], [-24, -12], [-16, 12], [-4, 34], [2, 47]] },
      park:   { name: 'Kicker Lane',   hw: 6.5, ctrl: [[30, -80], [31, -60], [30, -40], [30, -14], [29, 6], [24, 28], [18, 47]] },
      school: { name: 'Bunny Meadow',  hw: 10,  ctrl: [[-66, 5], [-66, 20], [-66, 37]] }
    },
    mogul: { x0: -37, x1: -14, z0: -58, z1: -12 },
    kicker: { x: 30, zLip: -14, len: 9, h: 1.7, hw: 3.4 },
    beginner: { x0: -84, x1: -52, z0: 2, z1: 40 },
    catLane: { xa: -42, xb: -37.2, z0: -64, z1: 35 },
    summit: { x0: 2, x1: 58, z0: -97, z1: -78 },
    base: { x0: -86, x1: 80, z0: 40, z1: 94 },
    deck: { x0: -42, x1: -24, z0: 50, z1: 66, h: 0.5 },
    lodge: { x: -52, z: 58, w: 20, d: 15 },
    carpet: { x: -80, zBottom: 38, zTop: 6 },
    carpetQueue: [[-71, 40.2], [-80, 40.2], [-80, 39.0]],
    schoolLineup: { x: -72, z: 3.4, dx: 1.7 },
    maze: [[27, 62.4], [42.5, 62.4], [42.5, 59.8], [29, 59.8], [29, 57.2], [42.5, 57.2], [44.9, 51.4]],
    mazeApproach: [20, 60],
    gather: [33, -83],
    cocoa: {
      kiosk: [-14, 64], vendor: [-13.5, 64], queue: [[-4.5, 64.4], [-11.3, 64]],
      rack: { x0: -7, z: 59.4, dx: 1.05, n: 8 },
      sip: [[-8.5, 69], [-5.6, 70.2], [-10.6, 71], [-7.2, 72.4], [-3.4, 68.2], [-12.2, 68.6]],
      bin: [-2.6, 66.2]
    },
    snowman: { sites: [[-22, 79.5], [-16, 84.5], [-10.5, 80]], home: [-16, 81.5] },
    deckSeats: [[-39, 53.2, 0], [-37, 53.2, 0], [-39, 56.2, 3.14], [-37, 56.2, 3.14], [-33, 58.2, 0], [-31, 58.2, 0],
                [-33, 61.2, 3.14], [-31, 61.2, 3.14], [-38.6, 62.6, 1.57], [-35.4, 62.6, -1.57]],
    deckRail: [[-25, 52.5], [-25, 55.5], [-25, 59], [-25, 62.5], [-28, 65.2], [-32, 65.2], [-36, 65.2]],
    firePit: [-36.9, 62.6],
    snowGuns: [[17.5, -34, 2.6], [-11.5, -22, 2.2], [19, 8, 2.5], [-33, 18, 0.9], [37.5, -52, 3.6]],  // x, z, facing yaw
    floods: [[9, -66], [-9, -43], [15, -21], [-13, -1], [15, 21], [37, -47], [38.5, -31], [-31, -38], [-31, 2], [6, 57], [-21, 63], [41, 62]],   // floodlight masts (night skiing)
    sledHill: { x: -54.2, z0: 9, z1: 33 },
    gondola: { a: [104, 92], b: [138, -112], h: 17, towers: 6 },   // background lift, scenery only
    patrolHut: [8, -91],
    ticketHut: [10, 74],
    parking: { x0: 30, x1: 78, z0: 78, z1: 100 }
  };

  // dense centre lines
  const runs = SH.runs = {};
  for (const k in L.runs) {
    const r = L.runs[k];
    const path = new U.Path(U.smoothPts(r.ctrl, 2));
    runs[k] = { key: k, name: r.name, hw: r.hw, path: path, len: path.len };
  }
  // where special features sit along their runs (arc length)
  runs.park.sKick = runs.park.path.project(L.kicker.x, L.kicker.zLip);
  runs.mogul.s0 = runs.mogul.path.project(-22, L.mogul.z0 + 2);
  runs.mogul.s1 = runs.mogul.path.project(-22, L.mogul.z1 - 2);

  // ---------------------------------------------------------------- open-ground mask
  function rectDist(x, z, r) {   // signed distance to an axis rect (negative inside)
    const dx = Math.max(r.x0 - x, x - r.x1), dz = Math.max(r.z0 - z, z - r.z1);
    if (dx <= 0 && dz <= 0) return Math.max(dx, dz);
    return Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  }
  const catRect = { x0: L.catLane.xa - 2.8, x1: L.catLane.xb + 2.8, z0: L.catLane.z0 - 5, z1: L.catLane.z1 + 6 };
  const liftRect = { x0: 44, x1: 56, z0: -92, z1: 60 };
  function runDist(x, z) {
    let d = 1e9;
    for (const k in runs) {
      const r = runs[k], pts = r.path.pts;
      for (let i = 0; i < pts.length; i++) {
        const q = Math.hypot(x - pts[i][0], z - pts[i][1]) - r.hw;
        if (q < d) d = q;
      }
    }
    return d;
  }
  // distance to the nearest groomed / walkable open ground (negative inside)
  function openDist(x, z) {
    let d = runDist(x, z);
    d = Math.min(d, rectDist(x, z, L.base), rectDist(x, z, L.beginner), rectDist(x, z, catRect), rectDist(x, z, L.summit));
    return d;
  }

  // ---------------------------------------------------------------- analytic slope
  function analytic(x, z, od) {
    const t = clamp((40 - z) / 120, 0, 1);
    let y = L.top * (0.3 * t + 0.7 * t * t * (3 - 2 * t));
    y += 0.02 * (x - 20) * sstep(-72, -84, z);                       // summit tips gently toward the runs

    const bw = sstep(-46, -52, x);                                    // beginner bench on the left
    if (bw > 0) {
      const yb = 5.5 * sstep(40, 2, z);
      y = lerp(y, lerp(yb, y, sstep(2, -14, z)), bw);
    }
    // off-piste banks and far hills
    const off = sstep(1, 14, od);
    y += off * (0.8 + 3.4 * U.fbm(x * 0.05 + 7.1, z * 0.05 + 3.3, 3));
    y += sstep(18, 90, od) * 12 * U.fbm(x * 0.021 + 1.7, z * 0.021 + 9.2, 3);
    // mountains behind the summit, valley walls at the sides
    const m = sstep(-100, -175, z);
    y += sstep(-97, -112, z) * 5 + m * (14 + 95 * Math.pow(U.fbm(x * 0.017 + 11, z * 0.017, 4), 1.35));
    const side = sstep(100, 168, Math.abs(x));
    y += side * (x < 0 ? 0.3 : 1) * (8 + 46 * U.fbm(x * 0.02, z * 0.02 + 5, 4));
    // front apron rolls away gently
    y += sstep(94, 125, z) * (-1.5 + 3 * U.fbm(x * 0.03, z * 0.03, 2)) - sstep(120, 195, z) * 9;

    // mogul field
    const mg = L.mogul;
    const mm = sstep(mg.x0, mg.x0 + 4, x) * sstep(mg.x1, mg.x1 - 4, x) * sstep(mg.z0, mg.z0 + 5, z) * sstep(mg.z1, mg.z1 - 5, z);
    if (mm > 0) {
      const a = 2 * Math.PI * (x / 3.7 + z / 7.8), b = 2 * Math.PI * (x / 3.7 - z / 7.8);
      y += mm * 0.36 * Math.sin(a) * Math.sin(b);
    }
    // kicker: a ramp to the lip, then a table that rolls into the landing
    const k = L.kicker, kdx = Math.abs(x - k.x);
    if (kdx < k.hw + 1.6 && z > k.zLip - k.len - 0.5 && z < k.zLip + 12.5) {
      const wx = sstep(k.hw + 1.6, k.hw, kdx);
      if (z <= k.zLip) y += wx * k.h * Math.pow(sstep(k.zLip - k.len, k.zLip, z), 1.25);
      else y += wx * k.h * 0.92 * sstep(k.zLip + 12, k.zLip + 1.0, z);
    }
    return y;
  }

  // ---------------------------------------------------------------- baked grid
  const B = L.bounds, NX = (B.x1 - B.x0) + 1, NZ = (B.z1 - B.z0) + 1;
  const H = new Float32Array(NX * NZ), OPEN = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = B.x0 + i, z = B.z0 + j, od = openDist(x, z);
    OPEN[j * NX + i] = od; H[j * NX + i] = analytic(x, z, od);
  }
  function sample(A, x, z) {
    let fx = clamp(x - B.x0, 0, NX - 1.001), fz = clamp(z - B.z0, 0, NZ - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz); fx -= i; fz -= j;
    const o = j * NX + i;
    return A[o] * (1 - fx) * (1 - fz) + A[o + 1] * fx * (1 - fz) + A[o + NX] * (1 - fx) * fz + A[o + NX + 1] * fx * fz;
  }

  const T = SH.terrain = {
    NX: NX, NZ: NZ, H: H, OPEN: OPEN, bounds: B,
    h: (x, z) => sample(H, x, z),                 // snow surface
    open: (x, z) => sample(OPEN, x, z),           // signed distance to open ground
    rectDist: rectDist, runDist: runDist, liftRect: liftRect,
    // walkable surface: snow plus built platforms (the lodge deck, with a ramp skirt)
    ground: function (x, z) {
      let y = sample(H, x, z);
      const d = rectDist(x, z, L.deck);
      if (d < 2.4) y += L.deck.h * clamp(1 - Math.max(d, 0) / 2.4, 0, 1);
      return y;
    },
    // downhill slope vector (dy/dx, dy/dz) by central difference
    grad: function (x, z, out) {
      out = out || {};
      out.gx = (sample(H, x + 0.6, z) - sample(H, x - 0.6, z)) / 1.2;
      out.gz = (sample(H, x, z + 0.6) - sample(H, x, z - 0.6)) / 1.2;
      return out;
    }
  };
})(globalThis.SH = globalThis.SH || {});
