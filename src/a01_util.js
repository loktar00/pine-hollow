// a01_util.js -- seeded RNG, small maths, polyline paths. Pure, deterministic.
(function (SH) {
  'use strict';
  const U = SH.util = {};

  // mulberry32: small, fast, deterministic
  U.makeRng = function (seed) {
    let a = seed >>> 0;
    const r = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + (hi - lo) * r();
    r.int = (n) => Math.floor(r() * n);
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    return r;
  };

  U.clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.sstep = (a, b, x) => { x = U.clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  U.ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));
  U.wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  U.turnToward = (a, b, maxStep) => { const d = U.wrapPi(b - a); return a + U.clamp(d, -maxStep, maxStep); };
  U.approach = (v, target, maxStep) => (v < target ? Math.min(target, v + maxStep) : Math.max(target, v - maxStep));

  // hash-based value noise (no state)
  function h2(ix, iz) {
    let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  U.hash2 = h2;
  U.noise2 = function (x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    let fx = x - ix, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
    const a = h2(ix, iz), b = h2(ix + 1, iz), c = h2(ix, iz + 1), d = h2(ix + 1, iz + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
  U.fbm = function (x, z, oct) {
    let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < (oct || 4); i++) { s += a * U.noise2(x * f, z * f); a *= 0.5; f *= 2.03; }
    return s;
  };

  // Polyline path with arc-length lookup. pts = [[x,z],...]
  U.Path = function (pts, closed) {
    this.pts = pts.map(p => [p[0], p[1]]);
    if (closed) this.pts.push([pts[0][0], pts[0][1]]);
    this.closed = !!closed;
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const dx = this.pts[i][0] - this.pts[i - 1][0], dz = this.pts[i][1] - this.pts[i - 1][1];
      this.cum.push(this.cum[i - 1] + Math.hypot(dx, dz));
    }
    this.len = this.cum[this.cum.length - 1];
  };
  // writes {x,z,tx,tz} (position and unit tangent) at arc length s
  U.Path.prototype.at = function (s, out) {
    out = out || {};
    if (this.closed) { s = ((s % this.len) + this.len) % this.len; } else { s = U.clamp(s, 0, this.len); }
    const cum = this.cum; let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const a = this.pts[lo], b = this.pts[hi], seg = cum[hi] - cum[lo] || 1, t = (s - cum[lo]) / seg;
    out.x = a[0] + (b[0] - a[0]) * t; out.z = a[1] + (b[1] - a[1]) * t;
    out.tx = (b[0] - a[0]) / seg; out.tz = (b[1] - a[1]) / seg;
    return out;
  };
  // nearest arc length to (x,z), searching around a hint (cheap local projection)
  U.Path.prototype.project = function (x, z, hint, window) {
    const cum = this.cum, pts = this.pts;
    let best = hint || 0, bd = 1e18;
    const lo = hint === undefined ? 0 : hint - (window || 12), hi = hint === undefined ? this.len : hint + (window || 12);
    for (let i = 0; i < pts.length - 1; i++) {
      if (cum[i + 1] < lo || cum[i] > hi) continue;
      const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = U.clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const px = ax + dx * t, pz = az + dz * t, d = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d < bd) { bd = d; best = cum[i] + Math.sqrt(l2) * t; }
    }
    this._d = Math.sqrt(bd);
    return best;
  };

  // Catmull-Rom resample of control points into a dense polyline
  U.smoothPts = function (ctrl, step) {
    const out = [];
    const P = (i) => ctrl[U.clamp(i, 0, ctrl.length - 1)];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / (step || 2)));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    out.push(ctrl[ctrl.length - 1].slice());
    return out;
  };
})(globalThis.SH = globalThis.SH || {});
