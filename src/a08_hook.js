// a08_hook.js -- ?record=hook : a scripted, deterministic 30 second film for sharing.
// It stages a few people before the first step (never afterwards), then runs a fixed shot list. Shots end on
// sim events (a landing, a fall) or on a timer, so every beat is guaranteed and lands on the same frame each run.
// Pure logic like the Director: it writes director.view / cut / react / replay and supplies the time of day.
(function (SH) {
  'use strict';
  const U = SH.util, CFG = SH.CONFIG, runs = SH.runs, L = SH.LAYOUT;

  class Hook {
    constructor(world, director) {
      const w = this.w = world, d = this.d = director; d.enabled = false; d.caption = '';
      const reg = (k) => w.regulars.find((p) => p.reg.key === k);
      this.rosa = reg('rosa'); this.nils = reg('nils'); this.tom = reg('tom'); this.june = reg('june'); this.gus = reg('gus');
      this.stage();
      const D = CFG.dayCycle.names, T = this;
      // The shot list. tod: [from, to] time of day swept over `dur` seconds (the day races by across the film).
      this.shots = [
        { name: 'Rosa launches off the kicker (golden hour)', who: () => [T.rosa], h: [10.5, 9.2], tod: [0.632, 0.64], dur: 2.6, until: (t) => t > T.landAt + 0.55, min: 1.8, max: 3.6 },
        { name: 'Nils wipes out at dawn', who: () => [T.nils], h: [11.5, 10], tod: [0.05, 0.085], dur: 2.8, until: () => T.nils.state === 'fall' && T.nils.t > 1.15, min: 1.8, max: 4.2 },
        { name: 'Reaction from the chair', react: true, h: [8.6, 8.2], tod: [0.085, 0.11], dur: 1.8, min: 1.8, max: 1.8 },
        { name: 'Old Tom carving, name tag', who: () => [T.tom], h: [12.5, 10.5], tod: [0.11, 0.2], dur: 3.0, min: 3.0, max: 3.0 },
        { name: 'Pull out to the whole resort as the day races by', pull: true, tod: [0.2, 0.56], dur: 4.6, until: () => T.june.state === 'ski' && T.june.run === 'park' && runs.park.sKick - T.june.s < 16, min: 3.0, max: 9 },
        { name: 'June hits the kicker', who: () => [T.june], h: [14, 12.5], tod: [0.56, 0.61], dur: 3.2, tape: true, until: () => T.june.jumped && T.june.state !== 'air' && T.tapeL >= 0 && T.tape.length - T.tapeL > 27, min: 2.2, max: 6 },
        { name: 'REPLAY in slow motion', replay: true, h: [8.4, 8.0], tod: [0.61, 0.66], dur: 3.1, min: 99, max: 99 },
        { name: 'Lodge deck and fire at dusk', at: [-33.5, 59.5], h: [21, 17.5], tod: [0.672, 0.73], dur: 2.5, min: 2.5, max: 2.5 },
        { name: 'Floodlit night skiing, pull out to the wide shot and hold', night: true, tod: [0.775, 0.84], dur: 5.5, min: 99, max: 99 }
      ];
      this.i = -1; this.t = 0; this.log = []; this.tape = []; this.tapeM = -1; this.tapeL = -1; this.landAt = 1e9; this.done = false;
      this.todNow = this.shots[0].tod[0]; this.next();
    }
    // ---- staging: put the cast where the film needs them, before time starts
    free(p) {
      const w = this.w;
      for (const k in w.queues) w.queues[k].remove(p);
      for (const c of w.lift.chairs) for (let s = 0; s < 4; s++) if (c.seats[s] === p.id) c.seats[s] = null;
      p.errand.length = 0; p.chair = null;
    }
    onRun(p, run, s, speed, opts) {
      const w = this.w, o = runs[run].path.at(s, {}); this.free(p);
      p.x = o.x; p.z = o.z; p.heading = Math.atan2(o.tx, o.tz); p.y = w.terrain.ground(p.x, p.z);
      w.go(p, 'ski', Object.assign({ run: run, s: s, noWipe: true }, opts)); p.speed = speed; p.sRate = speed;
      p.px = p.x; p.py = p.y; p.pz = p.z; p.pHeading = p.heading;
    }
    stage() {
      const w = this.w, lf = w.lift, R = runs.park, o = {};
      this.rosa.reg.level = 2; this.rosa.sureFooted = true; this.onRun(this.rosa, 'park', R.sKick - 6, 9.6);
      this.onRun(this.nils, 'main', 12, 3.6); this.nils.wipeS = 12 + 18.5; this.nils.wipeBig = false;
      this.onRun(this.tom, 'main', 3, 5);
      // Gus and June ride up together and take Kicker Lane; June lands a 360 for the replay
      for (const p of [this.gus, this.june]) { p.fixedRun = 'park'; p.wipeP = 0; p.sureFooted = true; this.free(p); }
      this.june.skill = 0.82; this.june.cocoaCd = 9; this.gus.cocoaCd = 9;
      let best = null, bd = 1e9; const want = lf.uUnload - lf.v * 2.35;
      for (const c of lf.chairs) { const dd = Math.abs(c.u - want); if (c.u < lf.uUnload - 1 && dd < bd) { bd = dd; best = c; } }
      for (let k = 0; k < 4; k++) if (best.seats[k] !== null) { const q = w.byId[best.seats[k]]; best.seats[k] = null; this.onRun(q, 'main', 60 + k * 9, 5); }   // bump whoever had that chair onto the hill
      [this.gus, this.june].forEach((p, i) => { const k = 1 + i; best.seats[k] = p.id; lf.seatPos(best, k, o); p.x = o.x; p.z = o.z; p.y = o.y - 0.5; p.heading = best.yaw; p.buddy = (i ? this.gus : this.june).id; w.go(p, 'ride', { chair: best, seat: k }); p.px = p.x; p.py = p.y; p.pz = p.z; p.pHeading = p.heading; });
    }
    tod() { return this.todNow; }
    focusOf(list) { let x = 0, y = 0, z = 0; for (const p of list) { x += p.x; y += p.y; z += p.z; } return [x / list.length, y / list.length + 0.9, z / list.length]; }
    next() {
      const d = this.d, w = this.w; this.i++; this.t = 0; const s = this.shots[this.i];
      this.log.push({ t: +w.time.toFixed(2), shot: s.name }); d.cut = true; d.replay = null; this.first = true;
      if (s.react) {
        const f = this.focusOf([this.nils]); this.wit = d.witnesses(f) || [this.nils];
        d.react = { ids: new Set(this.wit.map((p) => p.id)), x: f[0], y: f[1], z: f[2], until: w.time + 3 };
      }
      if (s.replay) this.rp = { i: Math.max(0, this.tapeM - 12), end: Math.min(this.tape.length - 2, this.tapeL + 10) };
      if (s.pull || s.night) this.from = Object.assign({}, d.view);
      if (s.night) this.from = { x: 6, y: w.terrain.h(6, -18) + 1, z: -18, h: 44 };
    }
    step(dt) {
      const d = this.d, w = this.w, v = d.view, s = this.shots[this.i], W = d.wide; this.t += dt; d.cut = this.first && this.i > 0;
      if (this.rosa.state === 'ski' && this.rosa.jumped && this.landAt > 1e8) this.landAt = this.t;
      const u = Math.min(1, this.t / s.dur); this.todNow = s.tod[0] + (s.tod[1] - s.tod[0]) * u;
      const snap = (f, h) => { if (this.first) { v.x = f[0]; v.y = f[1]; v.z = f[2]; v.h = h; } else { v.x += (f[0] - v.x) * 0.3; v.y += (f[1] - v.y) * 0.3; v.z += (f[2] - v.z) * 0.3; v.h += (h - v.h) * 0.3; } };
      if (s.tape && this.tape.length < 600) {
        const f = this.focusOf([this.june]), fr = []; for (const p of w.people) if (Math.abs(p.x - f[0]) < 26 && Math.abs(p.z - f[2]) < 26) fr.push(Object.assign({}, p));
        this.tape.push(fr);
        if (this.tapeM < 0 && this.june.state === 'air') this.tapeM = this.tape.length;
        if (this.tapeM >= 0 && this.tapeL < 0 && this.june.state !== 'air') this.tapeL = this.tape.length;
      }
      let over = false;
      if (s.who) snap(this.focusOf(s.who()), U.lerp(s.h[0], s.h[1], u));
      else if (s.react) snap(this.focusOf(this.wit), U.lerp(s.h[0], s.h[1], u));
      else if (s.at) snap([s.at[0], w.terrain.ground(s.at[0], s.at[1]) + 1.4, s.at[1]], U.lerp(s.h[0], s.h[1], u));
      else if (s.replay) {
        const rp = this.rp; rp.i += 0.8;
        if (rp.i >= rp.end) over = true;
        else { const byId = new Map(); for (const q of this.tape[Math.floor(rp.i) + 1]) byId.set(q.id, q); d.replay = { byId: byId, alpha: rp.i % 1 }; const q = byId.get(this.june.id), a = rp.i % 1; if (q) snap([q.px + (q.x - q.px) * a, q.py + (q.y - q.py) * a + 0.9, q.pz + (q.z - q.pz) * a], U.lerp(s.h[0], s.h[1], u)); }
      } else {
        // pull out to the wide view: zoom leads, pan follows
        const T = s.night ? 4.8 : 2.8, k = Math.min(1, this.t / T), e = U.ease(Math.pow(k, 1.5)), ez = U.ease(1 - Math.pow(1 - k, 1.6)), a = this.from;
        if (this.first && s.night) { v.x = a.x; v.y = a.y; v.z = a.z; v.h = a.h; }
        v.x = a.x + (W.x - a.x) * e; v.y = a.y + (W.y - a.y) * e; v.z = a.z + (W.z - a.z) * e; v.h = Math.exp(Math.log(a.h) + (Math.log(W.h) - Math.log(a.h)) * ez);
      }
      this.first = false;
      if (this.i < this.shots.length - 1 && (over || this.t >= s.max || (this.t >= s.min && (!s.until || s.until(this.t))))) this.next();
      else if (this.i === this.shots.length - 1 && w.time >= 30 - 1e-6) this.done = true;      // the film is exactly 30 s
    }
  }
  SH.Hook = Hook;
})(globalThis.SH = globalThis.SH || {});
