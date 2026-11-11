// r10_core.js -- three.js plumbing shared by the render modules: renderer setup, a static mesh builder
// (everything static is merged into a handful of vertex-coloured meshes), and instanced batches for
// everything that moves (people, chairs, snowcat are all drawn from two instanced meshes: boxes and balls).
// WebGL safety for Windows/D3D11: textures are only sampled in fragment shaders, all attributes are floats,
// no uniform-array indexing in vertex shaders, render size is capped at about 2 MP.
(function (SH) {
  'use strict';
  const T3 = THREE, R = SH.render = {};
  const _col = new T3.Color(), colCache = new Map();
  R.rgb = function (hex) {
    let c = colCache.get(hex);
    if (!c) { _col.setHex(hex); c = [_col.r, _col.g, _col.b]; colCache.set(hex, c); }
    return c;
  };

  // a darker / lighter version of a hex colour (cached), for trims and cuffs
  const shadeCache = new Map();
  R.shade = function (hex, f) {
    const k = hex * 16 + Math.round(f * 8); let v = shadeCache.get(k);
    if (v === undefined) { v = (Math.min(255, ((hex >> 16) & 255) * f) << 16) | (Math.min(255, ((hex >> 8) & 255) * f) << 8) | Math.min(255, (hex & 255) * f); shadeCache.set(k, v); }
    return v;
  };

  // ------------------------------------------------------------ static geometry builder
  const unit = {
    box: new T3.BoxGeometry(1, 1, 1).toNonIndexed(),
    cyl: {}, cone: {}, ball: new T3.IcosahedronGeometry(0.5, 1)
  };
  const cylGeo = (seg, open) => unit.cyl[seg + (open ? 'o' : '')] || (unit.cyl[seg + (open ? 'o' : '')] = new T3.CylinderGeometry(0.5, 0.5, 1, seg, 1, !!open).toNonIndexed());
  const coneGeo = (seg) => unit.cone[seg] || (unit.cone[seg] = new T3.CylinderGeometry(0, 0.5, 1, seg, 1, true).toNonIndexed());
  if (unit.ball.index) unit.ball = unit.ball.toNonIndexed();

  const _m = new T3.Matrix4(), _n = new T3.Matrix3(), _v = new T3.Vector3(), _q = new T3.Quaternion(), _e = new T3.Euler(), _s = new T3.Vector3(), _p = new T3.Vector3();
  class Builder {
    constructor() { this.pos = []; this.nor = []; this.col = []; }
    // geo: non-indexed unit geometry; color hex, or [hexBottom, hexTop] for a vertical gradient
    add(geo, m, color) {
      const P = geo.attributes.position, N = geo.attributes.normal, grad = Array.isArray(color);
      const c0 = R.rgb(grad ? color[0] : color), c1 = grad ? R.rgb(color[1]) : c0;
      _n.getNormalMatrix(m);
      for (let i = 0; i < P.count; i++) {
        const t = grad ? P.getY(i) + 0.5 : 0;
        _v.fromBufferAttribute(P, i).applyMatrix4(m); this.pos.push(_v.x, _v.y, _v.z);
        _v.fromBufferAttribute(N, i).applyMatrix3(_n).normalize(); this.nor.push(_v.x, _v.y, _v.z);
        this.col.push(c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t);
      }
      return this;
    }
    trs(x, y, z, sx, sy, sz, ry, rx, rz) { _e.set(rx || 0, ry || 0, rz || 0, 'YXZ'); return _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz)); }
    // all primitives are positioned by their CENTRE
    box(x, y, z, sx, sy, sz, color, ry, rx, rz) { return this.add(unit.box, this.trs(x, y, z, sx, sy, sz, ry, rx, rz), color); }
    cyl(x, y, z, r, h, color, seg, ry, rx, rz) { return this.add(cylGeo(seg || 8), this.trs(x, y, z, r * 2, h, r * 2, ry, rx, rz), color); }
    cone(x, y, z, r, h, color, seg, ry, rx, rz) { return this.add(coneGeo(seg || 7), this.trs(x, y, z, r * 2, h, r * 2, ry, rx, rz), color); }
    ball(x, y, z, r, color, sy) { return this.add(unit.ball, this.trs(x, y, z, r * 2, r * 2 * (sy || 1), r * 2), color); }
    // a thin beam between two points
    beam(ax, ay, az, bx, by, bz, t, color) {
      const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
      const ry = Math.atan2(dx, dz), rx = -Math.atan2(dy, Math.hypot(dx, dz));
      return this.box((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, t, t, len, color, ry, rx);
    }
    // gable roof: ridge runs along local x. (x,y,z) = centre of the eave rectangle
    gable(x, y, z, w, d, h, color, ry) {
      const slope = Math.atan2(h, d / 2), len = Math.hypot(h, d / 2) + 0.35;
      for (const s of [-1, 1]) {
        const lz = s * (d / 4), c = Math.cos(ry || 0), sn = Math.sin(ry || 0);
        this.box(x + lz * sn, y + h / 2 + 0.05, z + lz * c, w + 0.7, 0.22, len, color, ry, s * slope);
      }
      return this;
    }
    geometry() {
      const g = new T3.BufferGeometry();
      g.setAttribute('position', new T3.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new T3.Float32BufferAttribute(this.nor, 3));
      g.setAttribute('color', new T3.Float32BufferAttribute(this.col, 3));
      return g;
    }
    mesh(material, shadows) {
      const m = new T3.Mesh(this.geometry(), material);
      m.castShadow = shadows !== false; m.receiveShadow = shadows !== false; m.matrixAutoUpdate = false;
      return m;
    }
  }
  R.Builder = Builder; R.unit = unit;

  // ------------------------------------------------------------ instanced batch for moving parts
  class Batch {
    constructor(geo, material, cap, shadows) {
      const mesh = this.mesh = new T3.InstancedMesh(geo, material, cap);
      mesh.instanceMatrix.setUsage(T3.DynamicDrawUsage);
      mesh.instanceColor = new T3.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      mesh.instanceColor.setUsage(T3.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.castShadow = shadows !== false; mesh.receiveShadow = shadows !== false;
      this.cap = cap; this.n = 0; this.ma = mesh.instanceMatrix.array; this.ca = mesh.instanceColor.array;
    }
    begin() { this.n = 0; }
    add(m, hex) {
      if (this.n >= this.cap) return;
      const c = R.rgb(hex), o = this.n * 3;
      m.toArray(this.ma, this.n * 16); this.ca[o] = c[0]; this.ca[o + 1] = c[1]; this.ca[o + 2] = c[2];
      this.n++;
    }
    end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
  }
  R.Batch = Batch;

  // ------------------------------------------------------------ matrix helper for rigs
  // M(out, parent, x,y,z, rx,ry,rz, sx,sy,sz): out = parent * T * R(YXZ) * S
  const q2 = new T3.Quaternion(), e2 = new T3.Euler(), p2 = new T3.Vector3(), s2 = new T3.Vector3();
  R.M = function (out, parent, x, y, z, rx, ry, rz, sx, sy, sz) {
    e2.set(rx || 0, ry || 0, rz || 0, 'YXZ'); q2.setFromEuler(e2);
    out.compose(p2.set(x, y, z), q2, s2.set(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz));
    if (parent) out.premultiply(parent);
    return out;
  };

  // ------------------------------------------------------------ renderer / scene / lights
  R.setup = function (canvas) {
    const renderer = new T3.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T3.PCFSoftShadowMap;
    renderer.toneMapping = T3.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
    const scene = new T3.Scene();
    scene.fog = new T3.Fog(0xcfe4f7, 430, 980);
    const camera = new T3.OrthographicCamera(-1, 1, 1, -1, 1, 900);
    const sun = new T3.DirectionalLight(0xffffff, 3);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera; sc.left = -150; sc.right = 150; sc.top = 150; sc.bottom = -150; sc.near = 20; sc.far = 620;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.12;
    sun.target.position.set(-6, 14, 0);
    const hemi = new T3.HemisphereLight(0xbcd6ff, 0xdfe7ff, 1);
    scene.add(sun, sun.target, hemi);
    // floodlights: plain point lights, no shadows; intensity follows the day cycle's night value
    const floods = SH.LAYOUT.floods.map((f) => { const l = new T3.PointLight(0xfff0d0, 0, 62, 1.7); l.position.set(f[0], SH.terrain.h(f[0], f[1]) + 10.6, f[1]); scene.add(l); return l; });
    const catLamp = new T3.SpotLight(0xfff2c8, 0, 46, 0.55, 0.6, 1.4); scene.add(catLamp, catLamp.target);
    return { renderer: renderer, scene: scene, camera: camera, sun: sun, hemi: hemi, floods: floods, catLamp: catLamp };
  };
})(globalThis.SH = globalThis.SH || {});
