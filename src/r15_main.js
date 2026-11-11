// r15_main.js -- boot: build the world and the scene, then run fixed-step sim + interpolated render.
//
// URL parameters
//   ?seed=N        another deterministic day          ?only=wipeout   director waits for one kind of story
//   ?tod=night     start time of day: 0..1 or dawn / morning / noon / golden / dusk / night
//   ?dayspeed=4    day cycle speed multiplier (1 = a 7 minute day; 0 freezes the light)
//   ?t=90          simulate this many seconds before the first frame
//   ?record        clean frame for capture: scene, name tags and credits only; sound starts without a click
//   ?manual        no animation loop: the capture calls __sh.frame(seconds) for every frame (see RECORDING.md)
//   ?nopost        skip post-processing
(function (SH) {
  'use strict';
  const T3 = THREE, R = SH.render, U = SH.util, CFG = SH.CONFIG, DT = CFG.dt;
  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const num = (k, d) => (qs.has(k) && isFinite(+qs.get(k)) ? +qs.get(k) : d);

  function boot() {
    const canvas = $('c'), DC = CFG.dayCycle, RECORD = qs.has('record'), MANUAL = qs.has('manual');
    if (RECORD) document.body.classList.add('rec');
    const world = new SH.World(qs.has('seed') ? +qs.get('seed') : undefined);
    const director = new SH.Director(world);
    if (qs.has('only')) director.only = qs.get('only');
    const hook = qs.get('record') === 'hook' ? new SH.Hook(world, director) : null;      // the scripted 30 s film
    const tod0 = qs.has('tod') ? (DC.names[qs.get('tod')] !== undefined ? DC.names[qs.get('tod')] : num('tod', DC.start)) : DC.start, daySpeed = num('dayspeed', 1);
    const todAt = hook ? () => hook.tod() : (time) => (((tod0 + time * daySpeed / DC.period) % 1) + 1) % 1;
    const S = R.setup(canvas), renderer = S.renderer, scene = S.scene, camera = S.camera;
    const fx = new R.Fx(scene, world);
    scene.add(R.buildTerrain(fx.tracks.tex));
    for (const m of R.buildForest()) scene.add(m);
    for (const m of R.buildProps(world)) scene.add(m);
    const actors = new R.Actors(scene, world);
    const audio = new SH.Audio('audio/');
    let post = null;
    if (!qs.has('nopost')) { try { post = new R.Post(renderer); } catch (e) { post = null; } }
    $('credits').textContent = CFG.audio.credits;
    $('title').textContent = CFG.resortName;

    // ---- WebGL context loss: say so instead of going black
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); $('lost').style.display = 'flex'; }, false);
    canvas.addEventListener('webglcontextrestored', () => location.reload(), false);

    // ---- size: cap the internal render at about 2 megapixels
    let W = 1, H = 1, aspect = 1;
    function resize() {
      W = window.innerWidth; H = window.innerHeight; aspect = W / H;
      const pr = Math.min(window.devicePixelRatio || 1, Math.sqrt(2.1e6 / (W * H)));
      renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
      if (post) post.resize(renderer.domElement.width, renderer.domElement.height);
    }
    window.addEventListener('resize', resize); resize();

    // ---- light, lamps and grade follow the time of day
    const cA = new T3.Color(), cB = new T3.Color(), bg = new T3.Color();
    const mixHex = (a, b, t, out) => out.copy(cA.setHex(a)).lerp(cB.setHex(b), t);
    const grade = { bloom: 0.5, sat: 1, con: 1, blur: CFG.post.blur, tint: new T3.Color(1, 1, 1), night: 0 };
    const ch = (hex, s) => ((hex >> s) & 255) / 255;
    function daylight(time) {
      const t = todAt(time), K = DC.keys;
      let i = 0; while (i < K.length - 2 && K[i + 1].t < t) i++;
      const a = K[i], b = K[i + 1], k = U.sstep(a.t, b.t, t), L = (p) => a[p] + (b[p] - a[p]) * k;
      mixHex(a.sun, b.sun, k, S.sun.color); S.sun.intensity = L('sunI');
      mixHex(a.sky, b.sky, k, S.hemi.color); mixHex(a.ground, b.ground, k, S.hemi.groundColor); S.hemi.intensity = L('hemiI');
      mixHex(a.fog, b.fog, k, scene.fog.color); scene.background = bg.copy(scene.fog.color);
      const az = L('az'), el = L('el'), tp = S.sun.target.position;
      S.sun.position.set(tp.x + Math.sin(az) * Math.cos(el) * 320, tp.y + Math.sin(el) * 320, tp.z + Math.cos(az) * Math.cos(el) * 320);
      S.sun.shadow.normalBias = 0.12 / Math.max(0.2, Math.sin(el));     // long low-sun shadows need more bias
      const night = L('night'); grade.night = night; grade.bloom = L('bloom') * CFG.post.bloomGain; grade.sat = L('sat'); grade.con = L('con');
      grade.tint.setRGB(ch(a.tint, 16) + (ch(b.tint, 16) - ch(a.tint, 16)) * k, ch(a.tint, 8) + (ch(b.tint, 8) - ch(a.tint, 8)) * k, ch(a.tint, 0) + (ch(b.tint, 0) - ch(a.tint, 0)) * k);
      for (const l of S.floods) l.intensity = 230 * night;
      if (R.glowMat) R.glowMat.color.setScalar(0.6 + 0.4 * night);
      const cat = world.cat, sn = Math.sin(cat.yaw), cs = Math.cos(cat.yaw);
      S.catLamp.intensity = 420 * night; S.catLamp.position.set(cat.x + sn * 1.6, cat.y + 2.1, cat.z + cs * 1.6); S.catLamp.target.position.set(cat.x + sn * 14, cat.y - 1.5, cat.z + cs * 14);
      actors.night = night; fx.night = night;
      return t;
    }

    // ---- camera from the director's view
    const D = CFG.director, dir = new T3.Vector3(Math.sin(D.yaw) * Math.cos(D.pitch), Math.sin(D.pitch), Math.cos(D.yaw) * Math.cos(D.pitch));
    const focus = new T3.Vector3(), pv = new T3.Vector3();
    function applyCamera(v) {
      const h = v.h * Math.max(1, 1.62 / aspect);            // keep the whole hill in frame on narrow windows
      camera.top = h / 2; camera.bottom = -h / 2; camera.right = h * aspect / 2; camera.left = -h * aspect / 2;
      focus.set(v.x, v.y, v.z); camera.position.copy(focus).addScaledVector(dir, 420); camera.lookAt(focus); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      return renderer.domElement.height / h;                  // device pixels per metre
    }

    // ---- name tags for the regulars (close-ups only)
    const tagEls = (world.regulars || []).map(() => { const el = document.createElement('div'); el.className = 'tag'; $('tags').appendChild(el); return el; });
    function tags(v) {
      const regs = world.regulars || [], show = v.h < 30, ov = director.replay ? director.replay.byId : null;
      for (let i = 0; i < regs.length; i++) {
        const src = regs[i], p = ov && ov.get(src.id) ? ov.get(src.id) : src, el = tagEls[i];
        let on = show;
        if (on) { pv.set(p.x, p.y + 2.75 * p.scale, p.z).project(camera); on = Math.abs(pv.x) < 0.92 && pv.y > -0.9 && pv.y < 0.86; }
        if (on) { const txt = src.reg.name + '|' + SH.regularLine(src); if (el._t !== txt) { el._t = txt; el.innerHTML = '<b>' + src.reg.name + '</b><span>' + SH.regularLine(src) + '</span>'; }
          el.style.transform = 'translate(' + ((pv.x * 0.5 + 0.5) * W).toFixed(1) + 'px,' + ((-pv.y * 0.5 + 0.5) * H).toFixed(1) + 'px) translate(-50%,-100%)'; }
        if (el._on !== on) { el._on = on; el.style.opacity = on ? 1 : 0; }
      }
    }

    // ---- input: sound on first gesture; wheel / drag take the camera, the director takes it back after a pause
    let manualAt = -1e9;
    const hold = () => { if (director.enabled) { director.enabled = false; director.caption = ''; } manualAt = performance.now(); };
    const startAudio = () => { audio.start(() => world.time); $('sound').classList.add('on'); $('sound').textContent = audio.muted ? 'Sound off' : 'Sound on'; };
    window.addEventListener('pointerdown', startAudio); window.addEventListener('keydown', startAudio);
    $('sound').addEventListener('click', (e) => { if (audio.ready) { audio.setMuted(!audio.muted); e.target.textContent = audio.muted ? 'Sound off' : 'Sound on'; } });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); hold(); director.view.h = U.clamp(director.view.h * Math.exp(e.deltaY * 0.0012), 8, 190); }, { passive: false });
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('pointerup', () => { drag = null; });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const v = director.view, mpp = v.h / H, dx = (e.clientX - drag.x) * mpp, dy = (e.clientY - drag.y) * mpp / Math.sin(D.pitch);
      if (Math.abs(dx) + Math.abs(dy) < 0.01) return;
      hold(); drag.x = e.clientX; drag.y = e.clientY;
      v.x = U.clamp(v.x - dx * Math.cos(D.yaw) - dy * Math.sin(D.yaw), -100, 90); v.z = U.clamp(v.z + dx * Math.sin(D.yaw) - dy * Math.cos(D.yaw), -110, 100);
      v.y = SH.terrain.h(v.x, v.z);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') $('fps').classList.toggle('hide');
      if (e.key === 'm' || e.key === 'M') { audio.setMuted(!audio.muted); $('sound').textContent = audio.muted ? 'Sound off' : 'Sound on'; }
      if (e.key === 'd' || e.key === 'D') { if (director.enabled) hold(); else manualAt = -1e9; }
    });

    // ---- stepping and drawing
    const stats = { fps: 0, ms: 0, frames: 0, steps: 0 };
    function step() {
      world.step(); director.step(DT); if (hook) hook.step(DT);
      for (const e of world.events) fx.onEvent(e);
      audio.update(world.events, director.view, D.yaw, aspect, world.time);
      world.events.length = 0; stats.steps++;
    }
    let caption = '', badge = false;
    function draw(alpha, real) {
      const time = world.time + alpha * DT;
      stats.tod = daylight(time);
      const ppm = applyCamera(director.view);
      actors.react = director.react; actors.wind = world.wind;
      actors.draw(alpha, time, real, director.replay);
      fx.update(real, time, ppm, director.view);
      if (post) post.render(scene, camera, grade); else renderer.render(scene, camera);
      tags(director.view);
      if (director.caption !== caption) { caption = director.caption; const el = $('caption'); if (caption) { el.textContent = caption; el.classList.add('show'); } else el.classList.remove('show'); }
      if (!!director.replay !== badge) { badge = !!director.replay; $('replay').classList.toggle('show', badge); }
      stats.frames++;
    }
    for (let i = Math.round(num('t', 0) / DT); i > 0; i--) { world.step(); director.step(DT); world.events.length = 0; }   // ?t= fast-forward

    let last = performance.now(), acc = 0, fN = 0, fT = last, msAcc = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      const t0 = performance.now(), real = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now; acc += real;
      let n = 0;
      while (acc >= DT && n < 5) { step(); acc -= DT; n++; }
      if (n === 5) acc = 0;
      if (!director.enabled && !window.__sh.hold && now - manualAt > 7000) { director.enabled = true; director.mode = 'out'; director.t = 0; director.from = Object.assign({}, director.view); director.shot = null; director.replay = null; }
      draw(acc / DT, real);
      msAcc += performance.now() - t0; fN++;
      if (now - fT >= 1000) { stats.fps = Math.round(fN * 1000 / (now - fT)); stats.ms = msAcc / fN; $('fps').textContent = stats.fps + ' fps'; fN = 0; fT = now; msAcc = 0; }
    }
    // Frame-by-frame capture: __sh.frame(1/60) advances the sim by exactly that much and draws once.
    let macc = 0;
    function manualFrame(seconds) { macc += seconds === undefined ? DT : seconds; let n = 0; while (macc >= DT - 1e-9) { step(); macc -= DT; n++; } draw(0, n * DT); return world.time; }
    window.__sh = { world: world, director: director, audio: audio, stats: stats, renderer: renderer, fx: fx, frame: manualFrame, step: step, todAt: todAt, grade: grade, post: post, hook: hook, hold: !!hook };
    const go = () => { if (MANUAL) draw(0, 0); else { last = performance.now(); requestAnimationFrame(frame); } };
    // a recording waits for the sounds to load so frame 0 has audio; in ?manual wait for __sh.audio.ready before the first __sh.frame()
    if (RECORD) { draw(0, 0); const p = audio.start(() => world.time); if (MANUAL) go(); else Promise.race([p, new Promise((r) => setTimeout(r, 6000))]).then(go, go); } else go();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(globalThis.SH = globalThis.SH || {});
