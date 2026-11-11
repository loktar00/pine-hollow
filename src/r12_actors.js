// r12_actors.js -- draws everything that moves, straight from sim state, into two instanced batches.
// People are small articulated rigs (boxes + a ball head). A pose is a short list of joint angles chosen
// from the person's state; poses are eased per frame so every state change blends instead of snapping.
(function (SH) {
  'use strict';
  const T3 = THREE, R = SH.render, U = SH.util, CFG = SH.CONFIG, L = SH.LAYOUT, T = SH.terrain, PAL = CFG.palette, M = R.M;
  const TAU = Math.PI * 2, sin = Math.sin, cos = Math.cos, clamp = U.clamp;
  const TH = 0.42, SHN = 0.42, PS = 1.3;     // PS: people are drawn a little larger than life so they read in the wide view
  // pose channels
  const LIFT = 0, PIVOT = 1, LEAN = 2, HIPL = 3, HIPR = 4, KNL = 5, KNR = 6, SPLAY = 7, ALP = 8, ALR = 9, ARP = 10, ARR = 11, ELL = 12, ELR = 13,
        HYAW = 14, HPIT = 15, WEDGE = 16, TROLL = 17, TWIST = 18, SKIL = 19, SKIR = 20, ALIGN = 21, ROLL = 22, PITCH = 23, NP = 24;
  const DARK = 0x23272e, WHITE = 0xf4f8fb, STEEL = 0x3b4a52;

  class Actors {
    constructor(scene, world) {
      this.w = world;
      const mat = new T3.MeshStandardMaterial({ roughness: 0.78, metalness: 0.0 });
      this.boxes = new R.Batch(new T3.BoxGeometry(1, 1, 1), mat, 9000);
      this.balls = new R.Batch(new T3.IcosahedronGeometry(0.5, 1), mat, 1200);
      this.glows = new R.Batch(new T3.BoxGeometry(1, 1, 1), new T3.MeshBasicMaterial({ toneMapped: false }), 640, false);
      scene.add(this.boxes.mesh, this.balls.mesh, this.glows.mesh);
      this.pose = world.people.map(() => new Float32Array(NP)); this.tg = new Float32Array(NP);
      this.m = []; for (let i = 0; i < 16; i++) this.m.push(new T3.Matrix4());
      this.g = {}; this.night = 0; this.react = null; this.wind = { a: 0.9, s: 0.6 };
      // background gondola line: tower tops the cabins travel between
      const G = L.gondola, gp = this.gond = []; let gl = 0;
      for (let i = 0; i < G.towers; i++) { const u = i / (G.towers - 1), gx = U.lerp(G.a[0], G.b[0], u), gz = U.lerp(G.a[1], G.b[1], u), q = { x: gx, z: gz, y: T.h(gx, gz) + G.h, s: 0 }; if (i) { gl += Math.hypot(gx - gp[i - 1].x, q.y - gp[i - 1].y, gz - gp[i - 1].z); q.s = gl; } gp.push(q); }
      this.gondLen = gl;
      // magic-carpet belt segments never move: precompute their matrices
      this.belt = []; const cp = L.carpet;
      for (let z = cp.zTop; z < cp.zBottom; z += 2) { const y0 = T.h(cp.x, z), y1 = T.h(cp.x, z + 2); this.belt.push(M(new T3.Matrix4(), null, cp.x, (y0 + y1) / 2 + 0.05, z + 1, -Math.atan2(y1 - y0, 2), 0, 0, 1.05, 0.08, Math.hypot(2, y1 - y0) + 0.02)); }
    }
    box(parent, x, y, z, sx, sy, sz, color, rx, ry, rz) { this.boxes.add(M(this.m[15], parent, x, y, z, rx, ry, rz, sx, sy, sz), color); }
    ball(parent, x, y, z, r, color, sy) { this.balls.add(M(this.m[15], parent, x, y, z, 0, 0, 0, r * 2, r * 2 * (sy || 1), r * 2), color); }
    glow(parent, x, y, z, sx, sy, sz, color) { this.glows.add(M(this.m[15], parent, x, y, z, 0, 0, 0, sx, sy, sz), color); }

    // ---------------------------------------------------------- pose targets from sim state
    // Everything here is a pure function of the person's sim state, the distance they have travelled
    // (p.dist, p.phase) and time; person() eases toward it so every change of state blends.
    target(p, time) {
      const t = this.tg; t.fill(0);
      const st = p.state, act = p.act, sd = p.seed * 50, board = p.kind === 'board';
      const moving = clamp(p.speed / 1.0, 0, 1);
      t[ALP] = 0.08; t[ARP] = 0.08; t[ALR] = 0.1; t[ARR] = 0.1; t[ELL] = 0.25; t[ELR] = 0.25;
      if (st === 'ski' || st === 'respond') {
        const sp = clamp(p.speed / 3, 0, 1), ph = p.phase, sn = sin(ph), ext = cos(ph) * cos(ph);   // ext = 1 at the edge change
        t[ALIGN] = sp; t[ROLL] = -p.roll * 1.2;
        if (board) {
          // edge switch: stand tall and unwind through the change, sink and twist into the new edge
          const c = (p.tuck ? 0.8 : 0.62 - 0.34 * ext) * (0.5 + 0.5 * sp);
          t[TWIST] = -1.22 + 0.42 * sn * sp; t[HIPL] = c; t[HIPR] = c; t[KNL] = c * 2; t[KNR] = c * 2; t[SPLAY] = 0.3; t[LEAN] = 0.12 + c * 0.35;
          t[TROLL] = -0.25 * sn * sp; t[ALR] = 1.05 + 0.45 * sn; t[ARR] = 1.05 - 0.45 * sn; t[ALP] = 0.25 - 0.3 * sn; t[ARP] = 0.25 + 0.3 * sn; t[HYAW] = 1.05 - 0.3 * sn;
        } else if (p.plough) {
          // beginner: wide wedge, stiff legs, wobble and windmilling arms
          const wob = sin(time * 5.3 + sd), wob2 = sin(time * 7.1 + sd * 1.7);
          t[WEDGE] = 0.4; t[SPLAY] = 0.26; t[HIPL] = 0.4 + 0.1 * wob; t[HIPR] = 0.4 - 0.1 * wob; t[KNL] = 0.75; t[KNR] = 0.75; t[LEAN] = 0.26 + 0.1 * wob2;
          t[ROLL] += 0.1 * wob * sp; t[TROLL] = 0.12 * wob2;
          t[ALP] = 0.6 + 0.35 * wob2; t[ARP] = 0.6 - 0.35 * wob; t[ALR] = 0.85 + 0.4 * wob; t[ARR] = 0.85 - 0.4 * wob2; t[ELL] = 0.3; t[ELR] = 0.3; t[HPIT] = 0.15;
        } else {
          // parallel turns: rise and unweight at the edge change, sink through the arc, plant the inside pole
          let c = p.tuck ? 0.98 : 0.74 - 0.4 * ext;
          if (p.inMoguls) c = 0.6 + 0.36 * sin(ph * 2);
          c *= 0.45 + 0.55 * sp;
          const lean = clamp(p.roll, -0.6, 0.6), plant = ext * ext * ext, side = cos(ph) > 0 ? 1 : -1;
          t[HIPL] = c + 0.22 * lean; t[HIPR] = c - 0.22 * lean; t[KNL] = t[HIPL] * 1.95; t[KNR] = t[HIPR] * 1.95;
          t[LEAN] = 0.22 + c * 0.5; t[SPLAY] = 0.07; t[TROLL] = lean * 0.55; t[HYAW] = -lean * 0.5;
          const base = p.tuck ? 1.25 : 0.78;
          t[ALP] = base + (side < 0 ? 0.55 * plant : -0.15 * plant); t[ARP] = base + (side > 0 ? 0.55 * plant : -0.15 * plant);
          t[ALR] = p.tuck ? 0.05 : 0.42; t[ARR] = p.tuck ? 0.05 : 0.42; t[ELL] = 0.8 - (side < 0 ? 0.5 * plant : 0); t[ELR] = 0.8 - (side > 0 ? 0.5 * plant : 0);
        }
        if (p.sled) { t[ALP] = -0.45; t[ARP] = -0.45; t[ALR] = 0.2; t[ARR] = 0.2; t[ELL] = 0.2; t[ELR] = 0.2; }     // hands back on the tow bars
      } else if (st === 'air') {
        const k = clamp(p.airT / Math.max(0.3, p.airDur), 0, 1), tuck = sin(Math.PI * k);
        t[PITCH] = -0.22 + 0.3 * k; t[TWIST] = (board ? -1.22 : 0) + p.spin * U.ease(k); t[ALIGN] = 0.4;
        t[HIPL] = 0.5 + 0.75 * tuck; t[HIPR] = t[HIPL]; t[KNL] = t[HIPL] * 1.9; t[KNR] = t[KNL]; t[SPLAY] = board ? 0.3 : 0.12; t[LEAN] = 0.2 + 0.45 * tuck;
        t[ALR] = 1.3; t[ARR] = p.grab ? 0.1 : 1.3; t[ARP] = p.grab ? -0.25 + 0.2 * tuck : 0.3; t[ALP] = 0.3; t[ELR] = p.grab ? 0.1 : 0.3;
      } else if (st === 'fall') {
        const s = p.stage, k = p.stageT, dir = p.fall ? p.fall.dir : 1;
        t[ALIGN] = 1; t[SPLAY] = 0.35;
        if (s === 0) { t[PITCH] = k * (TAU + Math.PI / 2); t[PIVOT] = 1; t[LIFT] = 0.62 + 0.34 * sin(Math.PI * k); t[ALR] = 1.5; t[ARR] = 1.2; t[ALP] = 1.2 * sin(k * 11); t[HIPL] = 0.9 * sin(k * 9); t[HIPR] = -0.7 * sin(k * 9); t[KNL] = 0.8; t[KNR] = 0.5; t[ROLL] = dir * 0.5 * sin(k * 6); }
        else if (s === 1) {
          const up = U.sstep(0.55, 0.9, k);                          // lie flat, then sit up
          t[PITCH] = TAU + Math.PI / 2 - up * 1.05; t[PIVOT] = 1 - up * 0.45; t[LIFT] = 0.24 + up * 0.12;
          t[ALR] = 1.35 - up * 1.0; t[ARR] = 1.35 - up * 1.0; t[ALP] = up * 0.4; t[ARP] = up * 0.4; t[HIPL] = up * 1.15; t[HIPR] = up * 1.05; t[KNL] = up * 0.5; t[KNR] = up * 0.9;
          t[HYAW] = up * 0.8 * sin(time * 2.2 + sd); t[HPIT] = (1 - up) * -0.2;
        } else {
          const e = U.ease(k), dust = sin(time * 15);                // dust off, then stand
          t[PITCH] = TAU + (Math.PI / 2 - 1.05) * (1 - e); t[PIVOT] = 0.55 * (1 - e); t[LIFT] = 0.36 * (1 - e);
          t[HIPL] = 1.15 - 0.8 * e; t[HIPR] = t[HIPL]; t[KNL] = 0.5 + 0.25 * e; t[KNR] = t[KNL]; t[LEAN] = 0.5 * sin(Math.PI * e);
          t[ALP] = 0.75 + 0.45 * dust; t[ARP] = 0.75 - 0.45 * dust; t[ELL] = 1.5; t[ELR] = 1.5; t[ALR] = -0.25; t[ARR] = -0.25; t[HPIT] = 0.3;
        }
      } else if (st === 'ride') {
        const sw = 0.2 * sin(time * 1.3 + sd), ch = p.chair;
        t[HIPL] = 1.42 + sw; t[HIPR] = 1.42 - sw * 0.8; t[KNL] = 1.25 + sw * 1.4; t[KNR] = 1.25 - sw * 1.4; t[SPLAY] = board ? 0.2 : 0.07; t[LEAN] = -0.06;
        t[ARP] = 0.95; t[ELR] = 0.8; t[ALP] = 0.95; t[ELL] = 0.8;                                  // forearms on the safety bar
        let nb = 0; if (ch) { if (p.seat < 3 && ch.seats[p.seat + 1] !== null) nb = 1; else if (p.seat > 0 && ch.seats[p.seat - 1] !== null) nb = -1; }
        const chat = sin(time * 0.55 + sd);
        if (nb && chat > -0.2) {                                                                    // turn and talk
          t[HYAW] = nb * (0.75 + 0.15 * sin(time * 1.7 + sd)); t[HPIT] = 0.1 * sin(time * 3.3 + sd); t[TROLL] = 0; t[TWIST] = nb * 0.18;
          if (chat > 0.45) { if (nb > 0) { t[ALP] = 1.35; t[ALR] = 0.35 + 0.3 * sin(time * 6.5 + sd); t[ELL] = 1.2; } else { t[ARP] = 1.35; t[ARR] = 0.35 + 0.3 * sin(time * 6.5 + sd); t[ELR] = 1.2; } }
        } else t[HYAW] = 0.6 * sin(time * 0.33 + sd);
      } else {
        // ---- on the flat
        const slow = 1 - moving;
        if (p.skisOn && !board && p.plough) {
          // duck-walk: tips out, waddle from ski to ski
          const ph = p.dist * (TAU / 1.1), a = moving;
          t[WEDGE] = -0.38 * (0.4 + 0.6 * a); t[SPLAY] = 0.16; t[HIPL] = 0.25 + 0.35 * a * Math.max(0, sin(ph)); t[HIPR] = 0.25 + 0.35 * a * Math.max(0, -sin(ph)); t[KNL] = t[HIPL] * 1.7; t[KNR] = t[HIPR] * 1.7;
          t[ROLL] = 0.13 * a * sin(ph); t[TROLL] = -0.1 * a * sin(ph); t[ALR] = 0.55 + 0.2 * a * sin(ph); t[ARR] = 0.55 - 0.2 * a * sin(ph); t[ALP] = 0.4; t[ARP] = 0.4; t[LEAN] = 0.15;
        } else if (p.skisOn && !board) {
          // skating: push from one ski, glide on the other, double-pole with the arms
          const ph = p.dist * (TAU / 2.5), a = 0.36 * moving, s = sin(ph);
          t[HIPL] = a * s + 0.14; t[HIPR] = -a * s + 0.14; t[KNL] = 0.3 + 0.25 * moving * Math.max(0, -s); t[KNR] = 0.3 + 0.25 * moving * Math.max(0, s);
          t[SKIL] = 0.26 * moving * Math.max(0, s); t[SKIR] = 0.26 * moving * Math.max(0, -s); t[ROLL] = 0.07 * moving * s;
          const pole = sin(ph * 2 + 0.8); t[ALP] = 0.5 + 0.6 * moving * pole; t[ARP] = 0.5 + 0.6 * moving * pole; t[ELL] = 0.55 - 0.3 * moving * pole; t[ELR] = t[ELL]; t[LEAN] = 0.08 + moving * (0.16 + 0.1 * pole); t[SPLAY] = 0.08;
        } else if (p.skisOn && board) {
          // one foot out, scooting the board along
          const ph = p.dist * (TAU / 1.6), a = 0.4 * moving;
          t[TWIST] = -0.5; t[HIPL] = 0.2; t[KNL] = 0.4; t[HIPR] = a * sin(ph); t[KNR] = 0.3 + a * Math.max(0, cos(ph)); t[SPLAY] = 0.14; t[ALR] = 0.5 + 0.15 * sin(ph); t[ARR] = 0.5 - 0.15 * sin(ph); t[LEAN] = 0.1;
        } else {
          const ph = p.dist * (TAU / (p.kid ? 1.0 : 1.45)), a = 0.58 * moving, s = sin(ph);
          t[HIPL] = a * s; t[HIPR] = -a * s; t[KNL] = a * 1.3 * Math.max(0, -cos(ph)); t[KNR] = a * 1.3 * Math.max(0, cos(ph));
          t[ALP] = -a * 0.85 * s + 0.05; t[ARP] = a * 0.85 * s + 0.05; t[ELL] = 0.3 + 0.2 * moving; t[ELR] = t[ELL]; t[LEAN] = 0.06 * moving; t[TROLL] = 0.05 * moving * s; t[LIFT] = 0.025 * moving * Math.abs(cos(ph));
        }
        // ---- idle fidgets while standing: a new one every few seconds, different per person
        if (slow > 0.6 && !act && (st === 'queue' || st === 'toLoad' || st === 'lineup' || st === 'carpet' || st === 'post' || st === 'timer' || st === 'builder')) {
          const slot = Math.floor((time + sd) / 4.5), mode = Math.floor(U.hash2(p.id * 7 + 3, slot) * 7), u = ((time + sd) / 4.5) % 1, env = sin(Math.PI * u), f = env * slow;
          const turn = p.id % 2 ? 1 : -1;
          if (mode === 0) { t[HYAW] = 1.0 * sin(u * TAU) * f; t[HPIT] = -0.1 * f; }                                                           // look around
          else if (mode === 1 || mode === 5) { t[HYAW] = turn * 1.05 * f; t[TWIST] += turn * 0.25 * f; const gs = sin(time * 6 + sd);                // chat with the neighbour
            if (turn > 0) { t[ALP] = 0.08 + 1.1 * f; t[ALR] = 0.1 + (0.3 + 0.25 * gs) * f; t[ELL] = 0.25 + 1.0 * f; } else { t[ARP] = 0.08 + 1.1 * f; t[ARR] = 0.1 + (0.3 + 0.25 * gs) * f; t[ELR] = 0.25 + 1.0 * f; } t[HPIT] = 0.08 * sin(time * 4 + sd) * f; }
          else if (mode === 2) { t[ROLL] = 0.07 * sin(u * TAU) * f; t[HIPL] += 0.12 * f; t[KNL] += 0.25 * f; }                                    // shift weight
          else if (mode === 3) { t[ARP] = 0.08 + 2.2 * f; t[ELR] = 0.25 + 1.9 * f; t[ARR] = 0.1 + 0.25 * f; t[HPIT] = 0.15 * f; }                     // adjust goggles / hat
          else if (mode === 4) { const stp = sin(time * 7 + sd); t[HIPL] += 0.3 * f * Math.max(0, stp); t[KNL] += 0.5 * f * Math.max(0, stp); t[HIPR] += 0.3 * f * Math.max(0, -stp); t[KNR] += 0.5 * f * Math.max(0, -stp); t[ALR] = 0.25; t[ARR] = 0.25; }   // stamp the cold out
          else { t[LEAN] += 0.2 * f; t[ALP] = 0.08 + 0.75 * f; t[ARP] = 0.08 + 0.75 * f; t[HYAW] = 0.3 * sin(time * 0.6 + sd); }                 // lean on the poles
        }
        if (st === 'offload') { const up = clamp(p.t / 0.8, 0, 1); t[HIPL] = 1.3 - 0.9 * up; t[HIPR] = t[HIPL]; t[KNL] = 1.3 - 0.5 * up; t[KNR] = t[KNL]; t[LEAN] = 0.35; t[ALP] = -0.5 + 1.1 * up; t[ARP] = t[ALP]; t[ELL] = 0.5; t[ELR] = 0.5; }
        if (p.carry) { t[ARP] = 1.55; t[ELR] = 2.0; t[ARR] = 0.15; t[ALP] *= 0.5; t[ALR] = 0.2; t[TROLL] = -0.06; }
        if (p.hasCup && !act) { t[ARP] = 0.9; t[ELR] = 1.0; t[ARR] = 0.0; }
        switch (act) {
          case 'wave': t[ARP] = 2.75; t[ARR] = 0.25 + 0.35 * sin(time * 8); t[ELR] = 0.2; t[HYAW] = -0.3; t[LIFT] = 0.03 * Math.abs(sin(time * 8)); break;
          case 'brush': { const k = sin(time * 11); t[LEAN] = 0.5; t[TWIST] = 0.2 * k; t[ARP] = 1.15 + 0.3 * k; t[ALP] = 0.95 + 0.3 * k; t[ELR] = 0.3; t[ELL] = 0.6; t[HIPL] = 0.35; t[KNL] = 0.6; t[HPIT] = 0.2; break; }
          case 'wobble': t[ALR] = 1.2 + 0.35 * sin(time * 9); t[ARR] = 1.2 - 0.35 * sin(time * 9); t[ROLL] = 0.13 * sin(time * 7); t[WEDGE] = 0.32; t[SPLAY] = 0.22; break;
          case 'assist': t[ARP] = 1.25; t[ARR] = 0.3; t[ALP] = 1.0; t[LEAN] = 0.3; t[ELR] = 0.2; t[HIPL] = 0.3; t[KNL] = 0.5; break;
          case 'kneel': t[HIPL] = 1.3; t[HIPR] = 0.5; t[KNL] = 2.0; t[KNR] = 1.9; t[LEAN] = 0.45; t[ARP] = 1.0 + 0.15 * sin(time * 3); t[ALP] = 0.8; t[HPIT] = 0.25; break;
          case 'shovel': { const k = sin(time * 5); t[LEAN] = 0.45 + 0.22 * k; t[ARP] = 0.9 + 0.35 * k; t[ALP] = 0.6 + 0.35 * k; t[HIPL] = 0.3; t[KNL] = 0.5; t[TWIST] = 0.25 * k; break; }
          case 'serve': t[ARP] = 1.25 + 0.2 * sin(time * 4); t[ELR] = 0.3; t[LEAN] = 0.15; t[HPIT] = 0.1; break;
          case 'sit': case 'sip': case 'lean': {
            const mood = sin(time * 0.47 + sd), laugh = mood > 0.72;
            if (act === 'sit') { t[HIPL] = 1.5; t[HIPR] = 1.5; t[KNL] = 1.5; t[KNR] = 1.5 + 0.15 * sin(time * 2 + sd); t[LEAN] = 0.08; t[HYAW] = 0.8 * sin(time * 0.37 + sd); }
            if (act === 'lean') { t[LEAN] = 0.3; t[ALP] = 1.0; t[ELL] = 0.5; t[ARP] = 1.0; t[ELR] = 0.5; t[HIPL] = 0.15; if (sin(time * 0.5 + sd) > 0.6) { t[ARP] = 2.7; t[ARR] = 0.3 + 0.35 * sin(time * 8); t[ELR] = 0.2; } }
            if (act === 'sip') { t[HYAW] = 0.6 * sin(time * 0.4 + sd); t[ROLL] = 0.04 * sin(time * 0.9 + sd); }
            if (p.hasCup) { const sipping = sin(time * 0.8 + sd) > 0.55 && !laugh; t[ARP] = sipping ? 1.4 : 0.85; t[ELR] = sipping ? 2.1 : 1.1; t[ARR] = -0.1; t[HPIT] = sipping ? -0.22 : 0; }
            if (laugh) { const b = sin(time * 13 + sd); t[HPIT] = -0.38 + 0.06 * b; t[LEAN] += -0.14 + 0.05 * b; t[ALP] = 0.5; t[ALR] = 0.45 + 0.1 * b; t[ELL] = 1.3; t[LIFT] = 0.012 * b; }
            break;
          }
          case 'slip': t[HIPL] = 1.45; t[HIPR] = 1.3; t[KNL] = 0.3; t[KNR] = 0.55; t[LEAN] = -0.5; t[ALP] = -0.9; t[ARP] = -0.9; t[ALR] = 0.4; t[ARR] = 0.4; t[HPIT] = 0.25; t[HYAW] = 0.5 * sin(time * 3 + sd); break;
          case 'throw': { const u = 1 - clamp((p.throwT || 0) / 0.5, 0, 1); t[ARP] = 2.9 - 2.4 * u; t[ARR] = 0.3; t[ELR] = 0.9 - 0.8 * u; t[TWIST] = 0.45 - 0.9 * u; t[LEAN] = 0.05 + 0.25 * u; t[HIPL] = 0.3 * u; break; }
          case 'duck': t[HIPL] = 0.95; t[HIPR] = 0.95; t[KNL] = 1.8; t[KNR] = 1.8; t[LEAN] = 0.5; t[ALP] = 2.5; t[ARP] = 2.5; t[ELL] = 1.9; t[ELR] = 1.9; t[HPIT] = 0.4; break;
          case 'sled': { const fast = clamp(p.speed / 4, 0, 1); t[HIPL] = 1.45; t[HIPR] = 1.45; t[KNL] = 0.95; t[KNR] = 0.95; t[LEAN] = -0.2 * fast; t[ALP] = 0.9 + 1.8 * fast; t[ARP] = 0.9 + 1.8 * fast; t[ALR] = 0.5 * fast; t[ARR] = 0.5 * fast; t[HPIT] = -0.2 * fast; break; }
          case 'pull': t[ARP] = -0.55; t[ELR] = 0.1; t[LEAN] += 0.16; break;
          case 'unclip': t[HIPL] = 0.9; t[HIPR] = 0.7; t[KNL] = 1.5; t[KNR] = 1.3; t[LEAN] = 0.8; t[ARP] = 0.45 + 0.2 * sin(time * 8); t[ALP] = 0.5; t[HPIT] = 0.3; break;
          case 'rack': t[ARP] = 1.7; t[ALP] = 1.5; t[ELR] = 0.6; t[ELL] = 0.6; t[LEAN] = 0.12; break;
          case 'bin': t[ARP] = 1.1; t[LEAN] = 0.2; break;
          case 'roll': t[LEAN] = 0.8; t[ALP] = 1.05; t[ARP] = 1.05; t[ELL] = 0.2; t[ELR] = 0.2; t[KNL] += 0.45; t[KNR] += 0.45; t[HIPL] += 0.35; t[HIPR] += 0.35; t[HPIT] = -0.3; break;
          case 'lift': { const k = sin(time * 6); t[ALP] = 2.3 + 0.1 * k; t[ARP] = 2.3 - 0.1 * k; t[ALR] = 0.25; t[ARR] = 0.25; t[HPIT] = -0.45; t[HIPL] = 0.2; t[KNL] = 0.4; t[LIFT] = 0.04; break; }
          case 'pat': { const k = sin(time * 9 + sd); t[ALP] = 1.3 + 0.35 * k; t[ARP] = 1.3 - 0.35 * k; t[LEAN] = 0.22; t[HIPL] = 0.3; t[HIPR] = 0.3; t[KNL] = 0.6; t[KNR] = 0.6; break; }
          case 'cheer': { const j = Math.abs(sin(time * 6.5 + sd)); t[LIFT] = 0.32 * j; t[ALP] = 2.9; t[ARP] = 2.9; t[ALR] = 0.4 + 0.2 * j; t[ARR] = 0.4 + 0.2 * j; t[HIPL] = 0.3 * (1 - j); t[HIPR] = t[HIPL]; t[KNL] = 0.6 * (1 - j); t[KNR] = t[KNL]; t[HPIT] = -0.3; break; }
        }
      }
      // onlookers: turn toward whatever just happened and point
      const rc = this.react;
      if (rc && rc.ids.has(p.id)) {
        const yaw = clamp(U.wrapPi(Math.atan2(rc.x - p.x, rc.z - p.z) - p.heading), -1.5, 1.5), wag = 0.12 * sin(time * 9 + sd);
        t[HYAW] = yaw; t[HPIT] = 0.32; t[TWIST] += yaw * 0.2; t[LEAN] += 0.12;
        if (yaw > 0) { t[ARP] = 1.25 + wag; t[ARR] = 0.55; t[ELR] = 0.1; } else { t[ALP] = 1.25 + wag; t[ALR] = 0.55; t[ELL] = 0.1; }
      }
      return t;
    }

    // one ski / one board, drawn in the frame m (long axis = local z)
    ski(m, lk) {
      this.box(m, 0, 0.012, 0.14, 0.1, 0.028, 1.52, lk.gear); this.box(m, 0, 0.05, 0.96, 0.1, 0.028, 0.22, lk.gear, -0.5); this.box(m, 0, 0.028, 0.55, 0.102, 0.008, 0.24, lk.accent);
      this.box(m, 0, 0.05, 0.2, 0.11, 0.06, 0.12, 0x3f454d); this.box(m, 0, 0.055, -0.14, 0.11, 0.07, 0.1, 0x3f454d); this.box(m, 0, 0.028, -0.5, 0.102, 0.008, 0.16, WHITE);
    }
    board(m, lk) {
      this.box(m, 0, 0, 0, 0.29, 0.032, 1.3, lk.gear); this.box(m, 0, 0.036, 0.72, 0.27, 0.03, 0.22, lk.gear, -0.4); this.box(m, 0, 0.036, -0.72, 0.27, 0.03, 0.22, lk.gear, 0.4);
      this.box(m, 0, 0.018, 0, 0.292, 0.006, 0.3, lk.accent);
      for (const s of [-0.28, 0.28]) { this.box(m, 0, 0.05, s, 0.3, 0.05, 0.14, 0x2b2f36); this.box(m, -0.13, 0.11, s, 0.03, 0.14, 0.13, 0x2b2f36); this.box(m, 0.02, 0.12, s, 0.26, 0.03, 0.05, lk.accent); }
    }

    // ---------------------------------------------------------- one person
    person(p, a, time, k) {
      const m = this.m, g = this.g, lk = p.look, S = p.scale * PS, st = p.state;
      const x = p.px + (p.x - p.px) * a, z = p.pz + (p.z - p.pz) * a, hd = p.pHeading + U.wrapPi(p.heading - p.pHeading) * a;
      let y = p.py + (p.y - p.py) * a; if (st === 'ride') y -= 0.45 * (S - 1);
      const tg = this.target(p, time), c = this.pose[p.id];
      for (let i = 0; i < NP; i++) c[i] += (tg[i] - c[i]) * k;
      c[PITCH] = tg[PITCH];
      if (st === 'air') c[TWIST] = tg[TWIST];
      let sp = 0, sr = 0;
      if (c[ALIGN] > 0.02) { T.grad(x, z, g); const sn = sin(hd), cs = cos(hd); sp = -Math.atan(g.gx * sn + g.gz * cs) * c[ALIGN]; sr = Math.atan(g.gx * cs - g.gz * sn) * c[ALIGN]; }
      const board = p.kind === 'board', hs = p.kid ? 1.3 : 1.12;
      M(m[0], null, x, y + c[LIFT] * S, z, sp + c[PITCH], hd, sr + c[ROLL]);
      M(m[1], m[0], 0, -0.8 * c[PIVOT] * S, 0, 0, c[TWIST], 0, S, S, S);
      const hl = c[HIPL], hr = c[HIPR], kl = c[KNL], kr = c[KNR];
      const hipY = Math.max(TH * cos(hl) + SHN * cos(hl - kl), TH * cos(hr) + SHN * cos(hr - kr), 0.2) + 0.03;
      M(m[2], m[1], 0, hipY, 0, 0, 0, 0);
      const gearOn = p.skisOn && p.kind !== 'foot';
      // skis come off in a tumble, lie in the snow, and are stepped back into on the way up
      let loose = 0;
      if (st === 'fall' && !board && p.kind === 'ski') loose = p.stage === 0 ? p.stageT : p.stage === 1 ? 1 : 1 - U.sstep(0.4, 0.85, p.stageT);
      // ---- hips and legs
      this.box(m[2], 0, 0.05, 0, 0.38, 0.2, 0.25, lk.pants); this.box(m[2], 0, 0.14, 0, 0.385, 0.045, 0.255, R.shade(lk.pants, 0.6));
      for (let s = -1; s <= 1; s += 2) {
        const hip = s < 0 ? hl : hr, kn = s < 0 ? kl : kr;
        M(m[3], m[2], s * 0.105, 0, 0, -hip, 0, s * c[SPLAY]); this.box(m[3], 0, -TH / 2, 0, 0.17, TH + 0.04, 0.19, lk.pants);
        M(m[4], m[3], 0, -TH, 0, kn, 0, 0); this.box(m[4], 0, -SHN / 2 + 0.07, 0, 0.15, SHN - 0.14, 0.165, lk.pants); this.box(m[4], 0, -0.045, 0.02, 0.16, 0.1, 0.18, R.shade(lk.pants, 0.82));
        this.box(m[4], 0, -SHN + 0.12, 0.03, 0.18, 0.22, 0.3, lk.boots); this.box(m[4], 0, -SHN + 0.012, 0.035, 0.185, 0.03, 0.33, 0x15171a); this.box(m[4], 0, -SHN + 0.15, 0.17, 0.12, 0.035, 0.03, 0xc9ced6);
        if (gearOn && !board && loose < 0.02) { M(m[5], m[4], 0, -SHN, 0, hip - kn, -s * c[WEDGE] + s * (s < 0 ? c[SKIL] : c[SKIR]), -s * c[SPLAY]); this.ski(m[5], lk); }
      }
      if (loose >= 0.02) {
        M(m[11], null, x, y, z, 0, hd, 0, S, S, S);
        const fly = p.stage === 0 ? sin(Math.PI * Math.min(1, loose)) : 0;
        for (let s = -1; s <= 1; s += 2) { M(m[5], m[11], s * (0.1 + 1.05 * loose) + 0.35 * loose, 0.02 + 1.5 * fly, (s > 0 ? 1.3 : -0.7) * loose, p.stage === 0 ? loose * TAU * 1.5 * s : 0, loose * (s * 1.1 + p.seed * 3), p.stage === 0 ? loose * 4 : 0); this.ski(m[5], lk); }
      }
      if (gearOn && board) { M(m[5], m[1], 0, Math.max(0, hipY - (TH * cos(hl) + SHN * cos(hl - kl)) - 0.03) + 0.015, 0, 0, -c[TWIST], 0); this.board(m[5], lk); }
      if (p.role === 'sledder') {      // a little wooden sled: ridden, or towed behind on the walk back up
        if (p.act === 'sled') M(m[5], m[1], 0, 0, 0.1, 0, 0, 0); else M(m[5], null, x - sin(hd) * 1.25 * S, y, z - cos(hd) * 1.25 * S, sp, hd, 0, S, S, S);
        this.box(m[5], 0, 0.2, 0, 0.5, 0.05, 1.05, 0xb5651d); for (const q of [-0.2, 0.2]) { this.box(m[5], q, 0.09, 0, 0.05, 0.18, 0.9, 0xe5383b); this.box(m[5], q, 0.03, 0.02, 0.06, 0.05, 1.15, 0xe5383b); } this.box(m[5], 0, 0.2, 0.5, 0.5, 0.05, 0.08, 0xe5383b);
      }
      // ---- torso: jacket, yoke, collar, zip, pockets
      M(m[6], m[2], 0, 0.1, 0, c[LEAN], 0, c[TROLL]);
      const trim = R.shade(lk.jacket, 0.72);
      this.box(m[6], 0, 0.27, 0, 0.42, 0.5, 0.26, lk.jacket); this.box(m[6], 0, 0.5, 0, 0.45, 0.13, 0.275, lk.accent); this.box(m[6], 0, 0.035, 0, 0.432, 0.07, 0.272, trim);
      this.box(m[6], 0, 0.3, 0.132, 0.03, 0.5, 0.012, trim); this.box(m[6], -0.12, 0.16, 0.132, 0.1, 0.02, 0.012, trim); this.box(m[6], 0.12, 0.16, 0.132, 0.1, 0.02, 0.012, trim);
      this.box(m[6], 0, 0.615, 0, 0.13, 0.1, 0.13, lk.skin);
      if (lk.stripe >= 0) this.box(m[6], 0, 0.36, 0, 0.43, 0.09, 0.27, lk.stripe);
      if (lk.hivis) { this.box(m[6], 0, 0.2, 0, 0.432, 0.05, 0.272, 0xdfe5ea); this.box(m[6], 0, 0.38, 0, 0.432, 0.05, 0.272, 0xdfe5ea); }
      if (lk.bib) { this.box(m[6], 0, 0.3, 0, 0.44, 0.32, 0.285, 0xc8f31d); this.box(m[6], 0, 0.32, 0.146, 0.2, 0.16, 0.006, WHITE); this.box(m[6], 0, 0.32, -0.146, 0.2, 0.16, 0.006, WHITE); }
      if (lk.pack) { this.box(m[6], 0, 0.3, -0.21, 0.3, 0.38, 0.17, lk.hat); this.box(m[6], 0, 0.36, -0.3, 0.2, 0.14, 0.03, R.shade(lk.hat, 0.7)); for (const s of [-0.13, 0.13]) this.box(m[6], s, 0.36, 0.135, 0.05, 0.36, 0.01, R.shade(lk.hat, 0.7)); }
      if (lk.scarf >= 0) { this.box(m[6], 0, 0.585, 0, 0.3, 0.1, 0.3, lk.scarf); this.box(m[6], 0.1, 0.44, 0.14, 0.1, 0.24, 0.04, lk.scarf); }
      else this.box(m[6], 0, 0.575, 0, 0.27, 0.07, 0.25, lk.accent);
      // ---- arms: upper, lower, cuff, glove; poles in the gloves
      for (let s = -1; s <= 1; s += 2) {
        const ap = s < 0 ? c[ALP] : c[ARP], ar = s < 0 ? c[ALR] : c[ARR], el = s < 0 ? c[ELL] : c[ELR];
        M(m[7], m[6], s * 0.265, 0.5, 0, -ap, 0, s * ar); this.box(m[7], 0, -0.13, 0, 0.13, 0.3, 0.14, lk.jacket); this.box(m[7], 0, -0.01, 0, 0.145, 0.1, 0.155, lk.accent);
        M(m[8], m[7], 0, -0.27, 0, -el, 0, 0); this.box(m[8], 0, -0.11, 0, 0.12, 0.24, 0.13, lk.jacket); this.box(m[8], 0, -0.21, 0, 0.132, 0.055, 0.142, lk.accent); this.box(m[8], 0, -0.29, 0, 0.13, 0.12, 0.14, lk.gloves);
        const poles = p.kind === 'ski' && !p.kid && (gearOn || p.carry) && st !== 'fall' && !p.sled;
        if (poles && !(p.carry && s > 0)) {
          M(m[9], m[8], p.carry ? 0.05 : 0, -0.3, 0, ap + el + c[LEAN] + (p.carry ? 0.15 : 0.45), 0, -s * ar);
          for (let q = 0; q < (p.carry ? 2 : 1); q++) { this.box(m[9], q * 0.05, -0.46, q * 0.03, 0.026, 1.08, 0.026, 0xc9ced6); this.box(m[9], q * 0.05, 0.06, q * 0.03, 0.04, 0.14, 0.04, DARK); this.box(m[9], q * 0.05, -0.92, q * 0.03, 0.1, 0.015, 0.1, lk.accent); }
        }
        if (s > 0 && p.hasCup) { this.box(m[8], 0, -0.32, 0.1, 0.09, 0.12, 0.09, 0xfff4e0); this.box(m[8], 0, -0.375, 0.1, 0.07, 0.01, 0.07, 0x6b3f22); }
        if (s > 0 && (p.act === 'shovel' || p.act === 'brush')) { M(m[9], m[8], 0, -0.28, 0, ap + el - 0.5, 0, 0); this.box(m[9], 0, -0.3, 0.1, 0.04, 1.3, 0.04, 0x8a5a3c); if (p.act === 'shovel') this.box(m[9], 0, -0.98, 0.12, 0.3, 0.34, 0.03, 0xc9ced6); else { this.box(m[9], 0, -0.96, 0.12, 0.42, 0.07, 0.07, 0x8a5a3c); this.box(m[9], 0, -1.05, 0.12, 0.4, 0.14, 0.05, 0xffc233); } }
      }
      // ---- carried gear: skis over the shoulder, board under the arm
      if (p.carry && p.kind === 'ski') { M(m[5], m[6], 0.2, 0.62, -0.02, -1.25, 0.06, 0); for (const s of [-0.055, 0.055]) { M(m[9], m[5], s, 0, 0, 0, 0, 0); this.ski(m[9], lk); } }
      if (p.carry && board) { M(m[5], m[6], 0.34, 0.2, 0.02, 1.5, 0, 1.4); this.board(m[5], lk); }
      // ---- head: face, hat or helmet, goggles, hair
      M(m[10], m[6], 0, 0.76, 0.015, c[HPIT], c[HYAW], 0, hs, hs, hs);
      this.ball(m[10], 0, 0, 0, 0.15, lk.skin); this.box(m[10], 0, -0.03, 0.148, 0.035, 0.04, 0.03, R.shade(lk.skin, 0.86));
      if (lk.helmet) { this.ball(m[10], 0, 0.036, -0.03, 0.172, lk.hat); for (const s of [-0.15, 0.15]) this.box(m[10], s, -0.04, -0.01, 0.045, 0.12, 0.11, lk.hat); this.box(m[10], 0, 0.185, -0.03, 0.05, 0.03, 0.2, R.shade(lk.hat, 0.7)); }
      else { this.ball(m[10], 0, 0.055, -0.02, 0.168, lk.hat, 0.86); this.box(m[10], 0, 0.04, 0.0, 0.335, 0.075, 0.345, lk.accent); this.ball(m[10], 0, 0.215, -0.03, 0.06, WHITE); }
      if (lk.hairOut && !lk.helmet) this.box(m[10], 0, -0.06, -0.12, 0.26, 0.14, 0.09, lk.hair);
      const lens = lk.stripe >= 0 ? lk.stripe : 0xff9f1c, down = lk.goggles && !lk.gogglesUp;
      if (lk.goggles) {
        this.box(m[10], 0, down ? 0.035 : 0.1, -0.02, 0.36, 0.045, 0.33, DARK);
        if (down) { this.box(m[10], 0, 0.03, 0.118, 0.24, 0.085, 0.08, DARK); this.box(m[10], 0, 0.03, 0.156, 0.21, 0.058, 0.02, lens); }
        else { this.box(m[10], 0, 0.115, 0.108, 0.24, 0.08, 0.07, DARK, -0.35); this.box(m[10], 0, 0.125, 0.142, 0.2, 0.055, 0.02, lens, -0.35); }
      }
      if (this.night > 0.5 && gearOn && lk.helmet) this.glow(m[10], 0, 0.13, 0.15, 0.07, 0.06, 0.05, 0xfff6d8);      // headlamp
      if (!down) { this.box(m[10], -0.058, 0.012, 0.142, 0.034, 0.042, 0.02, DARK); this.box(m[10], 0.058, 0.012, 0.142, 0.034, 0.042, 0.02, DARK); this.box(m[10], 0, -0.075, 0.138, 0.06, 0.016, 0.02, R.shade(lk.skin, 0.62)); }
    }

    // the rescue sled and its tow bars
    sled(a) {
      const m = this.m, s = this.w.sled, o = s.o, x = s.px + (s.x - s.px) * a, y = s.py + (s.y - s.py) * a, z = s.pz + (s.z - s.pz) * a, g = this.g;
      T.grad(x, z, g); const sn = sin(s.yaw), cs = cos(s.yaw), slope = -Math.atan(g.gx * sn + g.gz * cs) * (1 - s.hung);
      M(m[0], null, x, y + 0.12, z, slope - 1.35 * s.hung, s.yaw, 0);
      this.box(m[0], 0, 0, 0, 0.72, 0.2, 2.1, 0xff7b25); this.box(m[0], 0, 0.1, 1.12, 0.66, 0.2, 0.3, 0xff7b25, -0.6); this.box(m[0], 0, 0.11, -0.05, 0.56, 0.06, 1.6, 0x2b3a67);
      this.box(m[0], 0, 0.17, -0.2, 0.58, 0.1, 1.0, 0xd0021b); this.box(m[0], 0, 0.2, 0.55, 0.4, 0.12, 0.3, WHITE); for (const q of [-0.3, 0.3]) this.box(m[0], q, -0.11, 0, 0.05, 0.04, 2.0, 0x3f454d);
      if (s.hung < 0.5) {
        const ox = o.px + (o.x - o.px) * a, oz = o.pz + (o.z - o.pz) * a, oy = o.py + (o.y - o.py) * a + 0.95;
        for (const q of [-0.28, 0.28]) {
          const ax = x + sn * 1.1 + cs * q, az = z + cs * 1.1 - sn * q, ay = y + 0.25, bx = ox + cos(o.heading) * q, bz = oz - sin(o.heading) * q;
          const dx = bx - ax, dy = oy - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
          this.box(null, (ax + bx) / 2, (ay + oy) / 2, (az + bz) / 2, 0.04, 0.04, len, 0xdfe5ea, -Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0);
        }
      }
    }

    // ---------------------------------------------------------- lift chairs
    chairs(a, time) {
      const m = this.m, lf = this.w.lift;
      for (const c of lf.chairs) {
        const x = c.px + (c.x - c.px) * a, y = c.py + (c.y - c.py) * a, z = c.pz + (c.z - c.pz) * a;
        M(m[0], null, x, y + CFG.lift.hang, z, 0.035 * sin(time * 1.1 + c.i * 1.7), c.yaw, 0.012 * sin(time * 0.8 + c.i));
        M(m[1], m[0], 0, -CFG.lift.hang, 0, 0, 0, 0);
        const seat = PAL.seats[c.i % PAL.seats.length];
        this.box(m[0], 0, -0.05, 0, 0.34, 0.2, 0.55, DARK); this.box(m[0], 0, -1.2, -0.13, 0.085, 2.3, 0.085, STEEL, 0.11); this.box(m[1], 0, 0.66, -0.26, 2.3, 0.07, 0.07, STEEL);
        this.box(m[1], 0, -0.06, 0.02, 2.3, 0.1, 0.52, seat); this.box(m[1], 0, 0.3, -0.27, 2.3, 0.56, 0.07, seat); this.box(m[1], 0, -0.13, 0, 2.36, 0.05, 0.1, STEEL);
        for (const s of [-1.17, 1.17]) this.box(m[1], s, 0.2, -0.02, 0.055, 0.5, 0.56, STEEL);
        // safety bar: down while out on the line, up at the stations
        const down = U.sstep(lf.uLoad + 4, lf.uLoad + 12, c.u) * U.sstep(lf.uUnload - 4, lf.uUnload - 11, c.u);
        M(m[2], m[1], 0, 0.66, -0.26, -1.25 + down * 1.78, 0, 0);
        for (const s of [-1.05, 1.05]) this.box(m[2], s, 0, 0.34, 0.045, 0.045, 0.68, STEEL);
        this.box(m[2], 0, 0, 0.68, 2.14, 0.055, 0.055, STEEL); this.box(m[2], 0, -0.28, 0.78, 0.045, 0.6, 0.045, STEEL); this.box(m[2], 0, -0.58, 0.86, 1.9, 0.045, 0.1, STEEL);
      }
    }

    // ---------------------------------------------------------- snowcat
    snowcat(a, time) {
      const m = this.m, c = this.w.cat, x = c.px + (c.x - c.px) * a, y = c.py + (c.y - c.py) * a, z = c.pz + (c.z - c.pz) * a, yaw = c.pyaw + U.wrapPi(c.yaw - c.pyaw) * a;
      M(m[0], null, x, y, z, -c.pitch, yaw, 0);
      const RED = PAL.catRed, D = PAL.catDark;
      for (const s of [-1.28, 1.28]) {
        this.box(m[0], s, 0.36, 0, 0.74, 0.62, 4.5, D); this.box(m[0], s, 0.36, 0, 0.5, 0.72, 4.1, 0x15171a);
        for (let k = 0; k < 9; k++) { const zz = -2.25 + ((k * 0.5 + c.tread) % 4.5 + 4.5) % 4.5; this.box(m[0], s, 0.69, zz, 0.78, 0.05, 0.13, 0x3f454d); }
        for (let k = 0; k < 4; k++) this.box(m[0], s * 1.02, 0.3, -1.5 + k * 1.0, 0.72, 0.42, 0.42, 0x4a525c);
      }
      this.box(m[0], 0, 0.98, -0.3, 2.3, 0.56, 4.0, RED); this.box(m[0], 0, 1.3, -1.55, 2.1, 0.2, 1.5, D);
      this.box(m[0], 0, 1.86, 0.62, 2.0, 1.2, 1.9, RED); this.box(m[0], 0, 1.98, 0.64, 2.04, 0.72, 1.5, 0x9ec9e8); this.box(m[0], 0, 1.98, 1.56, 1.66, 0.72, 0.06, 0x9ec9e8);
      this.box(m[0], 0, 2.52, 0.62, 2.1, 0.13, 2.0, WHITE); this.box(m[0], 0.8, 2.0, -0.6, 0.12, 1.5, 0.12, D);
      this.ball(m[0], 0.38, 1.95, 0.75, 0.15, 0xe2a57c); this.ball(m[0], 0.38, 2.02, 0.72, 0.17, 0xffc233, 0.8);
      const blink = sin(time * 9) > 0;
      this.glow(m[0], 0, 2.68, 0.2, 0.2, 0.18, 0.2, blink ? 0xffb020 : 0x7a4a08);
      for (const s of [-0.75, 0.75]) this.glow(m[0], s, 1.42, 1.72, 0.26, 0.16, 0.05, 0xfff2c4);
      M(m[1], m[0], 0, 0.62, 2.85, 0.1 + 0.05 * sin(time * 0.7), 0, 0);
      this.box(m[1], 0, 0, 0, 3.9, 0.95, 0.14, PAL.gunYellow); this.box(m[1], 0, -0.4, 0.12, 3.9, 0.16, 0.3, PAL.gunYellow);
      for (const s of [-1.9, 1.9]) this.box(m[1], s, 0, 0.2, 0.12, 0.95, 0.5, PAL.gunYellow);
      for (const s of [-0.8, 0.8]) this.box(m[1], s, 0.1, -0.45, 0.14, 0.14, 0.95, D);
      this.box(m[0], 0, 0.36, -2.95, 4.1, 0.46, 0.95, D); this.box(m[0], 0, 0.6, -2.95, 4.1, 0.08, 1.0, RED); this.box(m[0], 0, 0.1, -3.62, 4.2, 0.05, 0.55, PAL.gunYellow, 0.12);
      for (const s of [-0.9, 0.9]) this.box(m[0], s, 0.75, -2.35, 0.12, 0.12, 0.8, D);
    }

    // ---------------------------------------------------------- snowmen (finished and in progress)
    snowman(time) {
      const m = this.m, sm = this.w.snowman, yaw = 0.7;
      const decor = (x, gy0, z, sc, d, n) => {
        if (d <= 0.01) return;
        M(m[0], null, x, gy0, z, 0, yaw, 0, sc, sc, sc);
        const hy = sm.Y[2], hc = [0x23272e, 0x1d3557, 0x7f1d1d][n % 3], scf = [0xe5383b, 0x15aabf, 0xffc233][n % 3];
        this.box(m[0], 0, hy, 0.27 + 0.13 * d, 0.07 * d, 0.07 * d, 0.3 * d, 0xff7b25);
        for (const s of [-0.09, 0.09]) this.box(m[0], s, hy + 0.08, 0.235, 0.045 * d, 0.045 * d, 0.03, DARK);
        this.box(m[0], 0, hy + 0.24, 0, 0.5 * d, 0.045, 0.5 * d, hc); this.box(m[0], 0, hy + 0.24 + 0.17 * d, 0, 0.3 * d, 0.32 * d, 0.3 * d, hc);
        this.box(m[0], 0, sm.Y[1] + 0.36, 0, 0.5 * d, 0.1, 0.5 * d, scf); this.box(m[0], 0.16, sm.Y[1] + 0.2, 0.3, 0.1 * d, 0.3 * d, 0.04, scf);
        for (const s of [-1, 1]) this.box(m[0], s * (0.38 + 0.3 * d), sm.Y[1] + 0.12 + 0.12 * d, 0, 0.75 * d, 0.035, 0.035, 0x5b3d2b, 0, 0, s * 0.45);
        for (let i = 0; i < 2; i++) this.box(m[0], 0, sm.Y[1] - 0.12 + i * 0.22, 0.385, 0.05 * d, 0.05 * d, 0.03, DARK);
      };
      for (const man of sm.men) if (man) {
        const gy0 = T.ground(man.x, man.z), sc = man.scale, squash = 0.4 + 0.6 * sc;
        for (let i = 0; i < 3; i++) this.ball(null, man.x, gy0 + sm.Y[i] * sc * squash, man.z, sm.R[i] * (0.5 + 0.5 * sc), WHITE, squash);
        if (!man.melting) decor(man.x, gy0, man.z, 1, 1, man.n);
      }
      const bd = sm.build;
      if (bd) { for (const b of bd.balls) this.ball(null, b.x, b.y, b.z, b.r, WHITE); decor(bd.x, T.ground(bd.x, bd.z), bd.z, 1, bd.decor, sm.built); }
    }

    // ---------------------------------------------------------- scenery that moves: flags, birds, gondola cabins, snowballs
    scenery(time) {
      const m = this.m, w = this.w, wd = this.wind, ws = wd.s;
      // flags fly downwind and ripple harder as it blows
      const cols = [0xe5383b, 0xffc233, 0x15aabf, 0x3fb950], lz = L.lodge.z + L.lodge.d / 2 + 5.2;
      for (let i = 0; i < 4; i++) {
        M(m[0], null, L.lodge.x - 8 + i * 5.4, 4.75, lz, 0, wd.a + 0.2 * sin(time * 2.3 + i), 0);
        for (let k = 0; k < 4; k++) { const ph = time * (5 + 4 * ws) - k * 1.3 + i * 2; this.box(m[0], 0.07 * (k + 1) * ws * sin(ph), -0.07 * k * (1 - ws), 0.16 + 0.3 * k, 0.035, 0.72, 0.32, cols[i], 0, 0.3 * ws * cos(ph), 0); }
      }
      // a small flock wheeling over the runs by day
      if (this.night < 0.6) for (let i = 0; i < 9; i++) {
        const ang = time * (0.33 + 0.025 * i) + i * 0.7, r = 13 + i * 2.3, x = 6 + 30 * sin(time * 0.05) + cos(ang) * r, z = -14 + 42 * sin(time * 0.031 + 1) + sin(ang) * r;
        const y = T.h(x, z) + 19 + 4 * sin(time * 0.4 + i), flap = sin(time * 10 + i * 2.1);
        M(m[0], null, x, y, z, 0, Math.atan2(-sin(ang), cos(ang)), 0.3);
        this.box(m[0], 0, 0, 0, 0.14, 0.12, 0.5, 0x2b2f36); this.box(m[0], 0, 0.02, 0.28, 0.08, 0.07, 0.12, 0xffb703);
        for (const s of [-1, 1]) this.box(m[0], s * 0.36, 0.12 * flap, 0, 0.7, 0.03, 0.26, 0x3f454d, 0, 0, s * flap * 0.55);
      }
      // gondola cabins gliding up and down the far ridge
      const gp = this.gond, gl = this.gondLen, G = L.gondola, dx = G.b[0] - G.a[0], dz = G.b[1] - G.a[1], dl = Math.hypot(dx, dz), nx = dz / dl, nz = -dx / dl, yaw = Math.atan2(dx, dz);
      for (let i = 0; i < 8; i++) {
        let u = (time * 2.4 + i * gl / 4) % (2 * gl); const up = u < gl; if (!up) u = 2 * gl - u;
        let k = 1; while (k < gp.length - 1 && gp[k].s < u) k++;
        const a = gp[k - 1], b = gp[k], f = (u - a.s) / (b.s - a.s), side = up ? 1.5 : -1.5;
        M(m[0], null, a.x + (b.x - a.x) * f + nx * side, a.y + (b.y - a.y) * f - 2.6, a.z + (b.z - a.z) * f + nz * side, 0, yaw, 0);
        const col = PAL.seats[i % 4];
        this.box(m[0], 0, 0, 0, 1.7, 1.9, 2.0, col); this.box(m[0], 0, 0.25, 0, 1.74, 0.75, 1.7, 0x9ec9e8); this.box(m[0], 0, 1.0, 0, 1.8, 0.14, 2.1, WHITE); this.box(m[0], 0, 1.75, 0, 0.1, 1.5, 0.1, STEEL);
        if (this.night > 0.5) this.glow(m[0], 0, 0.25, 0, 1.76, 0.6, 1.5, 0xffe6a8);
      }
      for (const b of w.snowman.shots) this.ball(null, b.x, b.y, b.z, 0.1, WHITE);
      if (this.night > 0.4) for (const s of [-0.75, 0.75]) { const c = w.cat; M(m[0], null, c.x, c.y, c.z, -c.pitch, c.yaw, 0); this.glow(m[0], s, 1.42, 1.76, 0.34, 0.22, 0.06, 0xfffbe0); }
    }

    // ---------------------------------------------------------- everything, once per frame
    draw(a, time, dt, replay) {
      const w = this.w, m = this.m, k = 1 - Math.exp(-dt * 13);
      this.boxes.begin(); this.balls.begin(); this.glows.begin();
      for (const p of w.people) {
        const rq = replay && replay.byId.get(p.id);            // during a replay, recorded people stand in for the live ones
        if (rq) this.person(rq, replay.alpha, time, k); else this.person(p, a, time, k);
        if (!p.skisOn && p.kind !== 'foot' && p.gearX !== undefined) {     // gear standing against the rack
          M(m[0], null, p.gearX, T.ground(p.gearX, p.gearZ) + 0.74, p.gearZ, -1.42, 0, 0, PS, PS, PS);
          if (p.kind === 'board') this.board(m[0], p.look); else for (const s of [-0.07, 0.07]) { M(m[1], m[0], s, 0, 0, 0, 0, 0); this.ski(m[1], p.look); }
        }
      }
      this.chairs(a, time); this.snowcat(a, time); this.snowman(time); this.sled(a);
      // snow gun heads
      for (const g of w.guns.guns) {
        M(m[0], null, g.x, T.h(g.x, g.z) + 3.25, g.z, -0.38, g.yaw, 0);
        this.box(m[0], 0, 0, 0.15, 0.8, 0.8, 1.3, PAL.gunYellow); this.box(m[0], 0, 0, 0.84, 1.0, 1.0, 0.12, DARK); this.box(m[0], 0, 0, -0.62, 0.5, 0.5, 0.3, DARK); this.box(m[0], 0, 0, 0.9, 0.66, 0.66, 0.05, 0x9ec9e8);
      }
      // magic carpet: belt and its travelling cleats
      const cp = L.carpet, len = cp.zBottom - cp.zTop;
      for (const bm of this.belt) this.boxes.add(bm, 0x2b2f36);
      for (let i = 0; i < 20; i++) { const z = cp.zBottom - ((i * 1.6 + w.carpet.offset) % len); this.box(null, cp.x, T.h(cp.x, z) + 0.1, z, 1.0, 0.03, 0.1, 0x4a525c); }
      this.scenery(time);
      // little lights
      if (sin(time * 3) > 0.2) this.glow(null, 56, T.h(56, -95.5) + 14.35, -95.5, 0.3, 0.3, 0.3, 0xff3b30);
      const f = L.firePit, fy = L.deck.h + 0.45;
      for (let i = 0; i < 4; i++) { const fl = 0.5 + 0.5 * sin(time * (7 + i * 2.3) + i * 2); this.glow(null, f[0] + (i - 1.5) * 0.16, fy + 0.12 + fl * 0.18, f[1] + sin(i * 2.4) * 0.14, 0.2, 0.3 + fl * 0.4, 0.2, i % 2 ? 0xffb347 : 0xff7a1a); }
      this.boxes.end(); this.balls.end(); this.glows.end();
    }
  }
  R.Actors = Actors;
})(globalThis.SH = globalThis.SH || {});
