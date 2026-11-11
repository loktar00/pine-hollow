// a07_director.js -- the camera director. Pure logic: it reads the world, never changes it, and produces
// a "view" {x, y, z, h}: the point looked at and the view height in metres. The renderer turns that into a camera.
//
// A STORY is a small detector: find(world) returns candidate shots. A timed shot carries an eta (seconds until
// the key moment, predicted from the sim's own plans) and a moment() test, so the director can leave the wide
// view early enough to be framed up before it happens, hold while it plays out, then pull back and pick again.
(function (SH) {
  'use strict';
  const U = SH.util, CFG = SH.CONFIG, L = SH.LAYOUT, runs = SH.runs;

  const mid = (list) => {
    const f = () => { let x = 0, y = 0, z = 0; for (const p of list) { x += p.x; y += p.y; z += p.z; } return [x / list.length, y / list.length + 0.9, z / list.length]; };
    f.who = list;                  // lets the director see who a shot is about (it favours the regulars)
    return f;
  };
  const at = (x, z, w, dy) => { const y = w.terrain.ground(x, z) + (dy || 1); return () => [x, y, z]; };

  SH.STORIES = [
    { type: 'wipeout', weight: 3.2, find(w, out) {
      for (const p of w.people) if (p.state === 'ski' && p.wipeS < 1e9 && !p.school) out.push({
        eta: (p.wipeS - p.s) / Math.max(1.5, p.sRate), focus: mid([p]), h: 12.5, caption: 'Wipe-out on ' + runs[p.run].name,
        moment: () => p.state === 'fall', done: () => p.state !== 'fall', tail: 1.6 });
    } },
    { type: 'jump', weight: 3.0, find(w, out) {
      const R = runs.park;
      for (const p of w.people) if (p.state === 'ski' && p.run === 'park' && !p.jumped && p.s < R.sKick) out.push({
        eta: (R.sKick - p.s) / Math.max(4, p.sRate), focus: mid([p]), h: 17, caption: (p.kind === 'board' ? 'Snowboarder' : 'Skier') + ' hits the kicker',
        moment: () => p.state === 'air', done: () => p.state !== 'air', tail: 2.2 });
    } },
    { type: 'chairPair', weight: 2.4, find(w, out) {
      for (const g of w.lift.forecast(w.queues.lift)) if (g.members.length === 2) {
        const a = g.members[0], b = g.members[1];
        out.push({ eta: g.eta, focus: mid([a, b]), h: 11.5, caption: 'Two friends share a chair', moment: () => a.state === 'ride' && b.state === 'ride', done: (since) => since > 8 || a.state !== 'ride' });
        break;
      }
    } },
    { type: 'unloadHelp', weight: 2.6, find(w, out) {
      const lf = w.lift;
      for (const c of lf.chairs) for (let k = 0; k < 4; k++) if (c.seats[k] !== null && c.u < lf.uUnload) {
        const p = w.byId[c.seats[k]]; if (!p.needsHelp) continue;
        out.push({ eta: (lf.uUnload - c.u) / lf.v, focus: mid([p]), h: 12.5, caption: 'A helping hand at the top', moment: () => p.state === 'offload', done: (since) => since > 4.5 });
      }
    } },
    { type: 'moguls', weight: 2.0, find(w, out) {
      const R = runs.mogul;
      for (const p of w.people) if (p.state === 'ski' && p.run === 'mogul' && p.s < R.s0 && p.wipeS > 1e9) out.push({
        eta: (R.s0 - p.s) / Math.max(3, p.sRate), focus: mid([p]), h: 16, caption: 'Through the bumps on ' + R.name,
        moment: () => p.inMoguls, done: (since) => !p.inMoguls || since > 9 });
    } },
    { type: 'patrol', weight: 3.0, find(w, out) {
      for (const p of w.people) if (p.state === 'respond' && p.victim) {
        const v = p.victim, d = Math.hypot(v.x - p.x, v.z - p.z);
        out.push({ eta: d / Math.max(4, p.speed), focus: mid([v]), h: 12.5, caption: 'Ski patrol checks in', moment: () => p.state === 'assist', done: () => v.state !== 'fall', tail: 1.5 });
      }
    } },
    { type: 'firstRun', weight: 2.6, find(w, out) {
      const sc = w.school, m = sc.members;
      if (sc.phase === 'lineup' && sc.t > 0.2) out.push({ eta: 3.5 - sc.t + 2.2, focus: mid([m[2], m[3]]), h: 17, caption: 'Ski school: first turns on ' + runs.school.name,
        moment: () => m[1].state === 'ski', done: (since) => since > 9 });
      for (const p of m) if (p.state === 'ski' && p.wipeS < 1e9) out.push({ eta: (p.wipeS - p.s) / Math.max(0.8, p.sRate), focus: mid([p]), h: 11, caption: 'First run, first tumble',
        moment: () => p.state === 'fall', done: () => p.state !== 'fall', tail: 2 });
    } },
    { type: 'snowman', weight: 2.2, find(w, out) {
      const sm = w.snowman, eta = sm.etaCheer(), k = sm.kids;
      if (eta !== null) out.push({ eta: eta, focus: mid(k), h: 10.5, caption: 'The snowman is finished', moment: () => sm.stage === 'cheer', done: (since) => since > 3.6 });
      else if (sm.stage === 'roll') out.push({ eta: null, focus: mid([k[sm.b % 3]]), h: 11, caption: 'Rolling a snowman', done: (since) => since > 7 || sm.stage !== 'roll' });
    } },
    { type: 'snowcat', weight: 1.6, find(w, out) {
      const c = w.cat;
      if (c.pause <= 0) out.push({ eta: null, focus: () => [c.x, c.y + 1.5, c.z], h: 21, caption: 'Snowcat laying fresh corduroy', done: (since) => since > 8 });
    } },
    { type: 'cocoa', weight: 1.8, find(w, out) {
      const q = w.queues.cocoa.list, c = L.cocoa;
      if (q.length) out.push({ eta: null, focus: at(c.kiosk[0] + 3, c.kiosk[1] + 1, w), h: 12, caption: 'Hot chocolate stop', done: (since) => since > 7.5 });
    } },
    { type: 'deck', weight: 1.0, find(w, out) { out.push({ eta: null, focus: at(-33, 59, w, 1.4), h: 17, caption: 'Sun deck at the lodge', done: (since) => since > 7 }); } },
    { type: 'loading', weight: 1.0, find(w, out) { if (w.queues.lift.list.length > 3) out.push({ eta: null, focus: at(45.5, 51, w), h: 15, caption: 'Loading the Pine Hollow quad', done: (since) => since > 8 }); } }
  ];
  // follow-cam: stay with one skier for a whole run, top to bottom
  SH.STORIES.push({ type: 'followRun', weight: 1.5, find(w, out) {
    for (const p of w.people) if (p.state === 'ski' && !p.school && p.s < 16 && p.speed > 3 && p.wipeS > 1e9 && (p.reg || p.skill > 0.8) && p.run !== 'park') out.push({
      eta: null, focus: mid([p]), h: 15, maxHold: 48, caption: (p.reg ? p.reg.name : 'Top to bottom') + ' on ' + runs[p.run].name,
      done: () => p.state !== 'ski' && p.state !== 'fall' && p.state !== 'air' });
  } });
  // a regular doing nothing special still gets a visit now and then
  SH.STORIES.push({ type: 'regular', weight: 0.5, find(w, out) {
    for (const p of w.regulars) if (p.state === 'queue' || p.state === 'ride' && p.chair && p.chair.u < w.lift.uUnload - 40) out.push({ eta: null, focus: mid([p]), h: 10, caption: 'Catching up with ' + p.reg.name, done: (since) => since > 6.5 || (p.state !== 'queue' && p.state !== 'ride' && p.state !== 'toLoad') });
  } });

  class Director {
    constructor(world, seed) {
      const D = CFG.director;
      this.w = world; this.rng = U.makeRng((seed === undefined ? world.seed : seed) ^ 0x51ed270b);
      this.wide = { x: D.wide.x, y: world.terrain.h(D.wide.x, D.wide.z), z: D.wide.z, h: D.wide.h };
      this.view = Object.assign({}, this.wide);
      this.mode = 'wide'; this.t = 0; this.dwell = 2.5; this.shot = null; this.from = null;
      this.recent = []; this.caption = ''; this.cycles = 0; this.enabled = true;
      this.log = [];                 // {type, timed, eta, arrivedLead, caught}
      this.cut = false;              // true on the one step where the camera cuts instead of gliding
      this.react = null;             // {ids, x, y, z, until}: onlookers the renderer turns toward a moment
      this.replay = null;            // {byId, alpha}: recorded people the renderer draws instead of the live ones
      this.tape = []; this.tapeM = -1; this.tapeL = -1; this.reactions = 0; this.replays = 0; this.cutaway = null;
      this._c = [];
    }
    candidates() {
      const out = this._c; out.length = 0;
      for (const s of SH.STORIES) { const n = out.length; s.find(this.w, out); for (let i = n; i < out.length; i++) { out[i].type = s.type; out[i].weight = s.weight; } }
      return out;
    }
    // who was close enough to see it? people on the nearest loaded chair, else the front of the lift line
    witnesses(f) {
      const w = this.w, lf = w.lift; let best = null, bd = 48;
      for (const c of lf.chairs) {
        if (c.u > lf.uUnload) continue;
        const d = Math.hypot(c.x - f[0], c.z - f[2]); if (d >= bd || d < 6) continue;
        const r = []; for (let k = 0; k < 4; k++) if (c.seats[k] !== null) r.push(w.byId[c.seats[k]]);
        if (r.length) { best = r; bd = d; }
      }
      if (!best) { const q = w.queues.lift.list.slice(0, 4); if (q.length > 1 && Math.hypot(q[0].x - f[0], q[0].z - f[2]) < 45) best = q; }
      return best;
    }
    pick() {
      const D = CFG.director, lo = D.travelIn[0] + D.preRoll, hi = D.travelIn[1] + D.preRoll + 2.2;
      const ok = [], rng = this.rng;
      let total = 0;
      for (const c of this.candidates()) {
        if (c.eta !== null && (c.eta < lo || c.eta > hi)) continue;
        let seen = 0; for (const r of this.recent) if (r === c.type) seen++;
        if (this.only ? c.type !== this.only : (this.recent.length && this.recent[this.recent.length - 1] === c.type)) continue;
        c.w = c.weight * (c.eta !== null ? 1.6 : 1) / (1 + 2.5 * seen) * (c.focus.who && c.focus.who.some((p) => p.reg) ? 3.2 : 1);
        total += c.w; ok.push(c);
      }
      if (!ok.length) return null;
      let r = rng() * total;
      for (const c of ok) { r -= c.w; if (r <= 0) return c; }
      return ok[ok.length - 1];
    }
    step(dt) {
      const D = CFG.director, v = this.view, w = this.w; this.t += dt;
      this.cut = false; if (this.react && w.time > this.react.until) this.react = null;
      if (!this.enabled) return;
      if (this.mode === 'wide') {
        // a slow breathing drift so the wide shot is never frozen
        const k = Math.min(1, dt * 1.5);
        v.x += (this.wide.x + 2.5 * Math.sin(w.time * 0.11) - v.x) * k; v.z += (this.wide.z + 1.5 * Math.sin(w.time * 0.07 + 1) - v.z) * k;
        v.y += (this.wide.y - v.y) * k; v.h += (this.wide.h - v.h) * k;
        if (this.t > this.dwell && w.tick % 12 === 0) {
          const c = this.pick();
          if (c) {
            this.shot = c; this.mode = 'in'; this.t = 0; this.from = Object.assign({}, v);
            this.T = c.eta !== null ? U.clamp(c.eta - D.preRoll, D.travelIn[0], D.travelIn[1]) : 3.0;
            this.caption = c.caption; this.since = -1; this.holdT = 0;
            this.recent.push(c.type); if (this.recent.length > 4) this.recent.shift();
            this.tape.length = 0; this.tapeM = -1; this.tapeL = -1; this.reacted = false; this.cutaway = null; this.tailT = 0;
            this.entry = { type: c.type, timed: c.eta !== null, eta: c.eta, arrivedLead: null, caught: c.eta === null };
            this.log.push(this.entry); if (this.log.length > 200) this.log.shift();
          }
        }
        return;
      }
      const c = this.shot; if (!c) { this.mode = 'wide'; this.t = 0; return; }
      const f = c.focus();
      // tape: while a jump shot is live, keep per-step copies of everyone nearby so it can be replayed in slow motion
      if (c.type === 'jump' && this.mode !== 'replay' && this.mode !== 'out' && this.tape.length < 900) {
        const fr = []; for (const p of w.people) if (Math.abs(p.x - f[0]) < 26 && Math.abs(p.z - f[2]) < 26) fr.push(Object.assign({}, p));
        this.tape.push(fr);
        if (this.tapeM >= 0 && this.tapeL < 0 && c.focus.who[0].state !== 'air') this.tapeL = this.tape.length;
      }
      if (c.moment && this.since < 0 && c.moment()) {
        this.since = 0; this.tapeM = this.tape.length;
        // caught = the camera was already framed up (or all but) when it happened
        this.entry.caught = this.mode === 'hold' || this.t > this.T * 0.86;
        this.entry.arrivedLead = this.mode === 'hold' ? this.holdT : this.t - this.T;
      } else if (this.since >= 0) this.since += dt;
      if (this.mode === 'in') {
        // pan leads, zoom follows: the subject is centred before it fills the frame
        const u = Math.min(1, this.t / this.T), e = U.ease(1 - Math.pow(1 - u, 1.7)), ez = U.ease(Math.pow(u, 1.5)), a = this.from;
        v.x = a.x + (f[0] - a.x) * e; v.y = a.y + (f[1] - a.y) * e; v.z = a.z + (f[2] - a.z) * e;
        v.h = Math.exp(Math.log(a.h) + (Math.log(c.h) - Math.log(a.h)) * ez);
        if (this.t >= this.T) { this.mode = 'hold'; this.t = 0; }
      } else if (this.mode === 'hold') {
        this.holdT += dt;
        const k = Math.min(1, dt * 6), ca = this.cutaway;
        const since = c.moment ? this.since : this.holdT;
        let done = since >= 0 && c.done(since);
        if (ca) {
          // reaction shot: cut to the people who saw it, then cut back
          ca.t += dt; const g = ca.focus();
          v.x += (g[0] - v.x) * k; v.y += (g[1] - v.y) * k; v.z += (g[2] - v.z) * k;
          if (ca.t > ca.dur) { this.cutaway = null; this.cut = true; v.x = f[0]; v.y = f[1]; v.z = f[2]; v.h = this.pushH; }
        } else {
          const h = c.h * (1 - 0.17 * Math.min(1, this.holdT / 8)); this.pushH = h;          // slow push-in while we hold
          v.x += (f[0] - v.x) * k; v.y += (f[1] - v.y) * k; v.z += (f[2] - v.z) * k; v.h += (h - v.h) * k;
          const big = c.type === 'wipeout' || c.type === 'patrol' ? this.since > 1.0 : c.type === 'jump' ? this.since > 0 && done : false;
          if (big && !this.reacted) {
            this.reacted = true; const wit = this.witnesses(f);
            if (wit) {
              this.cutaway = { t: 0, dur: 2.6, focus: mid(wit) }; this.react = { ids: new Set(wit.map((p) => p.id)), x: f[0], y: f[1], z: f[2], until: w.time + 3.6 };
              const g = this.cutaway.focus(); this.cut = true; v.x = g[0]; v.y = g[1]; v.z = g[2]; v.h = 8.5; this.reactions++;
            }
          }
        }
        if (done && c.tail) { this.tailT += dt; done = this.tailT > c.tail; }
        const missed = c.moment && this.since < 0 && this.holdT > 7;
        if (!this.cutaway && ((done && this.holdT > D.minHold) || this.holdT > (c.maxHold || D.maxHold) || missed)) {
          if (c.type === 'jump' && this.tapeM >= 0 && this.tapeL - this.tapeM > 60) {
            // big air: play it again, slowly and closer
            this.mode = 'replay'; this.rp = { i: Math.max(0, this.tapeM - 40), end: Math.min(this.tape.length - 2, this.tapeL + 26), id: c.focus.who[0].id, h: 8.2 };
            this.caption = 'Replay'; this.replays++; this.rp.first = true;
          } else { this.mode = 'out'; this.t = 0; this.from = Object.assign({}, v); this.caption = ''; }
        }
      } else if (this.mode === 'replay') {
        const rp = this.rp; rp.i += 0.34;
        if (rp.i >= rp.end) { this.replay = null; this.cut = true; this.tape.length = 0; this.mode = 'out'; this.t = 0; v.x = f[0]; v.y = f[1]; v.z = f[2]; this.from = Object.assign({}, v); this.caption = ''; }
        else {
          const byId = new Map(); for (const q of this.tape[Math.floor(rp.i) + 1]) byId.set(q.id, q);
          this.replay = { byId: byId, alpha: rp.i % 1 };
          const q = byId.get(rp.id);
          if (q) { const a = rp.i % 1, x = q.px + (q.x - q.px) * a, y = q.py + (q.y - q.py) * a + 0.9, z = q.pz + (q.z - q.pz) * a; if (rp.first) { rp.first = false; this.cut = true; v.x = x; v.y = y; v.z = z; v.h = rp.h; } else { v.x += (x - v.x) * 0.25; v.y += (y - v.y) * 0.25; v.z += (z - v.z) * 0.25; } }
        }
      } else {  // out
        // zoom leads, pan follows: pull back first, then drift home
        const u = Math.min(1, this.t / D.travelOut), e = U.ease(Math.pow(u, 1.7)), ez = U.ease(1 - Math.pow(1 - u, 1.6)), a = this.from, b = this.wide;
        v.x = a.x + (b.x - a.x) * e; v.y = a.y + (b.y - a.y) * e; v.z = a.z + (b.z - a.z) * e;
        v.h = Math.exp(Math.log(a.h) + (Math.log(b.h) - Math.log(a.h)) * ez);
        if (this.t >= D.travelOut) {
          this.mode = 'wide'; this.t = 0; this.shot = null; this.cycles++;
          this.dwell = D.wideDwell[0] + this.rng() * (D.wideDwell[1] - D.wideDwell[0]);
        }
      }
    }
  }
  SH.Director = Director;
})(globalThis.SH = globalThis.SH || {});
