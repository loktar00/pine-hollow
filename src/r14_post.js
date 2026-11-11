// r14_post.js -- post-processing: tilt-shift blur (miniature look), bloom on lights and bright snow,
// and a colour grade that follows the time of day. Three small fullscreen passes.
// Safe for Windows/D3D11: 8-bit targets only (no float targets), textures sampled in fragment shaders only,
// constant loop bounds, a plain two-triangle quad with float attributes.
(function (SH) {
  'use strict';
  const T3 = THREE, R = SH.render, CFG = SH.CONFIG;
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  // bright pass + 4-tap downsample
  const FS_BRIGHT = 'precision highp float; uniform sampler2D tMap; uniform vec2 uPx; uniform float uThr; varying vec2 vUv;' +
    'void main(){ vec3 c = vec3(0.0); c += texture2D(tMap, vUv + uPx * vec2(-1.0, -1.0)).rgb; c += texture2D(tMap, vUv + uPx * vec2(1.0, -1.0)).rgb; c += texture2D(tMap, vUv + uPx * vec2(-1.0, 1.0)).rgb; c += texture2D(tMap, vUv + uPx * vec2(1.0, 1.0)).rgb; c *= 0.25;' +
    ' float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(uThr, uThr + 0.18, l), 1.0); }';
  const FS_BLUR = 'precision highp float; uniform sampler2D tMap; uniform vec2 uDir; varying vec2 vUv;' +
    'void main(){ vec3 c = texture2D(tMap, vUv).rgb * 0.2270; c += (texture2D(tMap, vUv + uDir * 1.385).rgb + texture2D(tMap, vUv - uDir * 1.385).rgb) * 0.3162; c += (texture2D(tMap, vUv + uDir * 3.231).rgb + texture2D(tMap, vUv - uDir * 3.231).rgb) * 0.0703; gl_FragColor = vec4(c, 1.0); }';
  const FS_FINAL = 'precision highp float; uniform sampler2D tScene; uniform sampler2D tBloom; uniform vec2 uPx; uniform float uBlur; uniform vec2 uBand; uniform float uBloom; uniform float uSat; uniform float uCon; uniform vec3 uTint; uniform float uVig; varying vec2 vUv;' +
    'float lum(vec2 uv){ return dot(texture2D(tScene, uv).rgb, vec3(0.299, 0.587, 0.114)); }' +
    'vec3 aa(vec2 uv){ vec3 m = texture2D(tScene, uv).rgb; float lM = dot(m, vec3(0.299, 0.587, 0.114)); float lN = lum(uv - vec2(0.0, uPx.y)); float lS = lum(uv + vec2(0.0, uPx.y)); float lE = lum(uv + vec2(uPx.x, 0.0)); float lW = lum(uv - vec2(uPx.x, 0.0));' +
    ' float hi = max(lM, max(max(lN, lS), max(lE, lW))); float lo = min(lM, min(min(lN, lS), min(lE, lW))); if (hi - lo < max(0.035, hi * 0.1)) return m;' +
    ' vec2 g = vec2(lE - lW, lS - lN); vec2 dir = normalize(vec2(-g.y, g.x) + 1e-5) * uPx; vec3 e = 0.25 * (texture2D(tScene, uv + dir * 0.6).rgb + texture2D(tScene, uv - dir * 0.6).rgb + texture2D(tScene, uv + dir * 1.6).rgb + texture2D(tScene, uv - dir * 1.6).rgb); return mix(m, e, 0.72); }' +
    'void main(){' +
    ' float d = abs(vUv.y - 0.5) * 2.0; float r = uBlur * smoothstep(uBand.x, uBand.y + 0.4, d);' +     // sharp band across the middle, soft top and bottom
    ' vec3 c = aa(vUv);' +
    ' if (r > 0.35) { for (int i = 0; i < 12; i++) { float fi = float(i); float a = fi * 2.39996; float rr = sqrt((fi + 0.5) / 12.0) * r; c += texture2D(tScene, vUv + vec2(cos(a), sin(a)) * rr * uPx).rgb; } c /= 13.0; }' +
    ' c += texture2D(tBloom, vUv).rgb * uBloom;' +
    ' c = (c - 0.5) * uCon + 0.5; float l = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(l), c, uSat) * uTint;' +
    ' vec2 q = vUv - 0.5; c *= 1.0 - uVig * smoothstep(0.35, 0.95, length(q * vec2(1.0, 0.8)) * 1.6);' +
    ' gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }';

  class Post {
    constructor(renderer) {
      this.r = renderer; this.ok = true;
      const opt = { minFilter: T3.LinearFilter, magFilter: T3.LinearFilter, depthBuffer: false, stencilBuffer: false };
      // No multisampling on this target (a multisampled sRGB target fails to resolve on some drivers); edges are smoothed in the final pass instead.
      this.scene = new T3.WebGLRenderTarget(4, 4, { minFilter: T3.LinearFilter, magFilter: T3.LinearFilter, depthBuffer: true, stencilBuffer: false });
      // have three tone-map and encode into this target exactly as it does for the screen
      this.scene.texture.colorSpace = T3.SRGBColorSpace; this.scene.isXRRenderTarget = true;
      this.a = new T3.WebGLRenderTarget(4, 4, opt); this.b = new T3.WebGLRenderTarget(4, 4, opt);
      const mk = (fs, u) => new T3.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
      this.mBright = mk(FS_BRIGHT, { tMap: { value: null }, uPx: { value: new T3.Vector2() }, uThr: { value: CFG.post.bloomThreshold } });
      this.mBlur = mk(FS_BLUR, { tMap: { value: null }, uDir: { value: new T3.Vector2() } });
      this.mFinal = mk(FS_FINAL, { tScene: { value: null }, tBloom: { value: null }, uPx: { value: new T3.Vector2() }, uBlur: { value: 0 }, uBand: { value: new T3.Vector2(CFG.post.focusBand[0], CFG.post.focusBand[1]) },
        uBloom: { value: 0.6 }, uSat: { value: 1 }, uCon: { value: 1 }, uTint: { value: new T3.Color(1, 1, 1) }, uVig: { value: CFG.post.vignette } });
      this.quad = new T3.Mesh(new T3.PlaneGeometry(2, 2), this.mFinal); this.quad.frustumCulled = false;
      this.qs = new T3.Scene(); this.qs.add(this.quad); this.cam = new T3.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.w = 4; this.h = 4;
    }
    resize(w, h) { this.w = w; this.h = h; this.scene.setSize(w, h); const bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2); this.a.setSize(bw, bh); this.b.setSize(bw, bh); }
    pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.qs, this.cam); }
    // g: { bloom, sat, con, tint (THREE.Color, display-referred), blur (px at 1080p) }
    render(scene, camera, g) {
      const r = this.r;
      r.setRenderTarget(this.scene); r.render(scene, camera);
      this.mBright.uniforms.tMap.value = this.scene.texture; this.mBright.uniforms.uPx.value.set(1 / this.w, 1 / this.h); this.pass(this.mBright, this.a);
      for (let i = 0; i < 2; i++) {
        this.mBlur.uniforms.tMap.value = this.a.texture; this.mBlur.uniforms.uDir.value.set((1 + i) / this.a.width, 0); this.pass(this.mBlur, this.b);
        this.mBlur.uniforms.tMap.value = this.b.texture; this.mBlur.uniforms.uDir.value.set(0, (1 + i) / this.a.height); this.pass(this.mBlur, this.a);
      }
      const u = this.mFinal.uniforms;
      u.tScene.value = this.scene.texture; u.tBloom.value = this.a.texture; u.uPx.value.set(1 / this.w, 1 / this.h);
      u.uBlur.value = g.blur * this.h / 1080; u.uBloom.value = g.bloom; u.uSat.value = g.sat; u.uCon.value = g.con; u.uTint.value.copy(g.tint);
      this.pass(this.mFinal, null);
    }
  }
  R.Post = Post;
})(globalThis.SH = globalThis.SH || {});
