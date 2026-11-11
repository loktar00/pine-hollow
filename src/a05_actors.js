// a05_actors.js -- things that are not single people: the snowcat, the snow guns, the hot-chocolate stand,
// the ski-school group and the snowman project. Each has step(dt, world) and plain data the renderer reads.
(function (SH) {
  'use strict';
  const U = SH.util, CFG = SH.CONFIG, L = SH.LAYOUT, clamp = U.clamp;

  // ------------------------------------------------------------ snowcat: grooms a lane, up one side and down the other
  class Snowcat {
    constructor(terrain) {
      const c = L.catLane, cx = (c.xa + c.xb) / 2, r = (c.xb - c.xa) / 2, pts = [];
      pts.push([c.xa, c.z1], [c.xa, c.z0]);
      for (let i = 1; i < 10; i++) { const a = Math.PI + Math.PI * i / 10; pts.push([cx + r * Math.cos(a), c.z0 + r * Math.sin(a)]); }
      pts.push([c.xb, c.z0], [c.xb, c.z1]);
      for (let i = 1; i < 10; i++) { const a = Math.PI * i / 10; pts.push([cx + r * Math.cos(a), c.z1 + r * Math.sin(a)]); }
      this.path = new U.Path(pts, true); this.terrain = terrain;
      this.s = this.path.len * 0.18; this.speed = 0; this.pause = 0; this.avoidR = 4.6; this.tread = 0; this.laps = 0;
      this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.pitch = 0; this.px = 0; this.py = 0; this.pz = 0; this.pyaw = 0;
      this.place(); this.px = this.x; this.py = this.y; this.pz = this.z; this.pyaw = this.yaw;
    }
    place() {
      const o = this.path.at(this.s, this._o || (this._o = {})), T = this.terrain;
      this.x = o.x; this.z = o.z; this.yaw = Math.atan2(o.tx, o.tz); this.up = o.tz < -0.5;
      const yf = T.h(o.x + o.tx * 2.2, o.z + o.tz * 2.2), yb = T.h(o.x - o.tx * 2.2, o.z - o.tz * 2.2);
      this.y = (yf + yb) / 2; this.pitch = Math.atan2(yf - yb, 4.4);
    }
    step(dt, w) {
      this.px = this.x; this.py = this.y; this.pz = this.z; this.pyaw = this.yaw;
      const sp = CFG.speeds;
      if (this.pause > 0) { this.pause -= dt; this.speed = U.approach(this.speed, 0, 2 * dt); }
      else this.speed = U.approach(this.speed, this.up ? sp.snowcatUp : sp.snowcatDown, 0.9 * dt);
      const s0 = this.s; this.s = (this.s + this.speed * dt) % this.path.len; this.tread += this.speed * dt;
      if (this.s < s0) { this.pause = 6; this.laps++; }            // a breather at the bottom of each lap
      this.place();
    }
  }
  SH.Snowcat = Snowcat;

  // ------------------------------------------------------------ rescue sled: follows its patroller (never placed, only moved)
  class Sled {
    constructor(owner, terrain) {
      this.o = owner; this.T = terrain; this.yaw = owner.heading; this.hung = 0;
      this.x = owner.x - Math.sin(owner.heading) * 2.4; this.z = owner.z - Math.cos(owner.heading) * 2.4; this.y = terrain.ground(this.x, this.z);
      this.px = this.x; this.py = this.y; this.pz = this.z;
    }
    step(dt) {
      const o = this.o, T = this.T; this.px = this.x; this.py = this.y; this.pz = this.z;
      let tx, ty, tz; const riding = o.state === 'ride' && o.chair;
      if (riding) { const c = o.chair; tx = c.x - Math.sin(c.yaw) * 0.75; tz = c.z - Math.cos(c.yaw) * 0.75; ty = c.y - 0.2; }
      else { tx = o.x - Math.sin(o.heading) * 2.4; tz = o.z - Math.cos(o.heading) * 2.4; ty = T.ground(tx, tz) + 0.02; }
      this.hung = U.approach(this.hung, riding ? 1 : 0, dt * 1.5);
      // carried along with the patroller, plus a capped catch-up toward the spot behind them
      this.x += (o.x - o.px) + clamp((tx - this.x) * 6 * dt, -4 * dt, 4 * dt);
      this.z += (o.z - o.pz) + clamp((tz - this.z) * 6 * dt, -4 * dt, 4 * dt);
      this.y += (o.y - o.py) + clamp((ty - this.y) * 9 * dt, -4 * dt, 4 * dt);
      if (Math.hypot(o.x - this.x, o.z - this.z) > 0.4) this.yaw = U.turnToward(this.yaw, Math.atan2(o.x - this.x, o.z - this.z), 5 * dt);
    }
  }
  SH.Sled = Sled;

  // ------------------------------------------------------------ snow guns
  class SnowGuns {
    constructor() { this.guns = L.snowGuns.map((g, i) => ({ x: g[0], z: g[1], yaw0: g[2], yaw: g[2], on: true, i: i })); }
    step(dt, w) {
      for (const g of this.guns) {
        g.yaw = g.yaw0 + 0.42 * Math.sin(w.time * 0.23 + g.i * 1.7);
        g.on = ((w.time + g.i * 17) % 80) < 62;
        if (g.on && (w.tick + g.i * 31) % 150 === 0) w.emit('gun', g.x, w.terrain.h(g.x, g.z) + 3, g.z);
      }
    }
  }
  SH.SnowGuns = SnowGuns;

  // ------------------------------------------------------------ hot-chocolate stand
  class Stand {
    constructor() { this.busy = 0; this.serving = null; this.served = 0; }
    step(dt, w) {
      const q = w.queues.cocoa;
      if (this.busy > 0) {
        this.busy -= dt;
        if (this.busy <= 0 && this.serving) {
          const p = this.serving; this.serving = null; q.remove(p); p.hasCup = true; this.served++;
          w.emit('cup', p.x, p.y, p.z); SH.nextErrand(p, w);
        }
      } else if (q.list[0] && q.arrived(q.list[0])) { this.serving = q.list[0]; this.busy = 3.0; w.emit('coins', q.list[0].x, 1, q.list[0].z); }
    }
  }
  SH.Stand = Stand;

  // ------------------------------------------------------------ ski school: one instructor, a snake of kids
  class School {
    constructor() { this.members = []; this.leader = null; this.phase = 'lineup'; this.t = 0; this.anyDown = false; this.released = 0; this.laps = 0; }
    step(dt, w) {
      const m = this.members; this.anyDown = false;
      for (const k of m) if (k.state === 'fall') this.anyDown = true;
      if (this.phase === 'lineup') {
        let all = true; for (const k of m) if (k.state !== 'lineup' || k.speed > 0.05) all = false;
        this.t = all ? this.t + dt : 0;
        if (this.t > 3.5) { this.phase = 'descend'; this.released = 1; w.go(this.leader, 'ski', { run: 'school', noWipe: true }); }
      } else if (this.phase === 'descend') {
        if (this.released < m.length) {
          const a = m[this.released - 1];
          if (a.state !== 'ski' || a.s > 2.9) { w.go(m[this.released], 'ski', { run: 'school' }); this.released++; }
        } else {
          let done = true; for (const k of m) if (k.state === 'ski' || k.state === 'fall') done = false;
          if (done) this.phase = 'return';
        }
      } else {
        let all = true; for (const k of m) if (k.state !== 'lineup') all = false;
        if (all) { this.phase = 'lineup'; this.t = 0; this.laps++; }
      }
    }
  }
  SH.School = School;

  // ------------------------------------------------------------ kids build a snowman, ball by ball
  const BALL_R = [0.55, 0.4, 0.27], BALL_Y = [0.5, 1.24, 1.76];
  class SnowmanProject {
    constructor(kids) {
      this.shots = []; this.throwT = 2;        // snowballs in flight during the rest between builds
      this.kids = kids; this.site = -1; this.stage = 'rest'; this.t = 4; this.b = 0; this.built = 0;
      this.hits = 0;
      this.men = [null, null, null];          // finished snowmen: {x,z,scale,hat}
      this.build = null;                      // {site, x, z, balls:[{x,y,z,r,spin}], decor}
      this.R = BALL_R; this.Y = BALL_Y;
    }
    polar(site, r, a) { const s = L.snowman.sites[site]; return [s[0] + r * Math.cos(a), s[1] + r * Math.sin(a)]; }
    // rough seconds until the cheer, for the camera director (null = unknown)
    etaCheer() {
      if (this.stage === 'decorate') return Math.max(0, 4.2 - this.t);
      if (this.stage === 'place' && this.b === 2) return 5.6;
      return null;
    }
    step(dt, w) {
      const kids = this.kids, T = w.terrain; this.t += dt;
      for (let i = 0; i < 3; i++) { const m = this.men[i]; if (m && m.melting) { m.scale -= dt / 7; if (m.scale <= 0.02) this.men[i] = null; } }
      const roller = kids[this.b % 3], bd = this.build;
      for (let i = this.shots.length - 1; i >= 0; i--) {
        const s = this.shots[i]; s.vy -= 9.8 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        if (s.y < T.ground(s.x, s.z) + 0.1 || Math.hypot(s.x - s.to.x, s.z - s.to.z) < 0.35 && s.y < s.to.y + 1.3) { w.emit('shovel', s.x, s.y, s.z); s.to.hitT = 0.7; this.shots.splice(i, 1); this.hits++; }
      }
      for (const k of kids) { if (k.throwT > 0) k.throwT -= dt; if (k.hitT > 0) k.hitT -= dt; }
      if (this.stage === 'rest') {
        this.throwT -= dt;
        if (this.throwT < 0) {                     // snowball fight
          this.throwT = 1.1 + w.rng() * 1.6; const a = kids[Math.floor(w.rng() * 3)], b = kids[(kids.indexOf(a) + 1 + Math.floor(w.rng() * 2)) % 3];
          const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
          if (d > 2 && d < 14) { const tt = 0.45 + d * 0.06; a.throwT = 0.5; a.bt = { x: a.x, z: a.z, v: 1.4, face: Math.atan2(dx, dz) }; this.shots.push({ x: a.x, y: a.y + 1.2, z: a.z, vx: dx / tt, vz: dz / tt, vy: 4.9 * tt - 0.2 / tt, to: b }); }
        }
        for (const k of kids) {
          k.act = k.throwT > 0 ? 'throw' : k.hitT > 0 ? 'duck' : '';
          if (k.bt.arrived && w.rng() < dt * 0.5) { const h = L.snowman.home; k.bt = { x: h[0] + w.rng.range(-5, 5), z: h[1] + w.rng.range(-3.5, 3.5), v: 1.5 }; }
        }
        if (this.t > 8) {
          this.site = (this.site + 1) % 3; this.b = 0; this.stage = 'fetch'; this.t = 0;
          if (this.men[this.site]) this.men[this.site].melting = true;
          const s = L.snowman.sites[this.site];
          this.build = { site: this.site, x: s[0], z: s[1], balls: [], decor: 0 };
        }
      } else if (this.stage === 'fetch') {
        const a0 = this.b * 2.1 + this.site * 1.3, st = this.polar(this.site, 6.4, a0);
        if (!roller.bt.fetch) roller.bt = { x: st[0], z: st[1], v: 1.6, fetch: true };
        roller.act = '';
        kids.forEach((k, i) => { if (k !== roller && !k.bt.watch) { const q = this.polar(this.site, 2.7, a0 + 2.6 + i * 0.9); k.bt = { x: q[0], z: q[1], v: 1.3, watch: true, face: Math.atan2(bd.x - q[0], bd.z - q[1]) }; k.act = ''; } });
        if (roller.bt.arrived && !this.men[this.site]) {
          const fx = Math.sin(roller.heading), fz = Math.cos(roller.heading);
          const ball = { x: roller.x + fx * 0.45, z: roller.z + fz * 0.45, y: 0, r: 0.08, spin: 0 };
          ball.y = T.ground(ball.x, ball.z) + ball.r; bd.balls.push(ball);
          const stop = BALL_R[0] + BALL_R[this.b] + 0.35;
          this.wps = [this.polar(this.site, 5.2, a0 + 1.15), this.polar(this.site, this.b === 0 ? 0.9 : stop + 0.5, a0 + 2.1)];
          this.wi = 0; this.d0 = roller.dist; this.rollLen = 11; this.stage = 'roll'; this.t = 0;
          roller.bt = { x: this.wps[0][0], z: this.wps[0][1], v: 1.05, r: 0.7 };
        }
      } else if (this.stage === 'roll') {
        const ball = bd.balls[this.b]; roller.act = 'roll';
        const grow = clamp((roller.dist - this.d0) / this.rollLen, 0, 1);
        ball.r = Math.max(ball.r, U.lerp(0.08, BALL_R[this.b], Math.sqrt(grow)));
        const tx = roller.x + Math.sin(roller.heading) * (0.4 + ball.r), tz = roller.z + Math.cos(roller.heading) * (0.4 + ball.r);
        const mx = clamp((tx - ball.x) * 9 * dt, -2.4 * dt, 2.4 * dt), mz = clamp((tz - ball.z) * 9 * dt, -2.4 * dt, 2.4 * dt);
        ball.x += mx; ball.z += mz; ball.spin += Math.hypot(mx, mz) / Math.max(0.1, ball.r);
        ball.y = T.ground(ball.x, ball.z) + ball.r * 0.92;
        if (roller.bt.arrived) {
          if (this.wi < this.wps.length - 1) { this.wi++; roller.bt = { x: this.wps[this.wi][0], z: this.wps[this.wi][1], v: 1.05, r: 0.35 }; }
          else { this.stage = 'place'; this.t = 0; ball.r = BALL_R[this.b]; roller.bt.face = Math.atan2(bd.x - roller.x, bd.z - roller.z); }
        }
      } else if (this.stage === 'place') {
        const ball = bd.balls[this.b]; roller.act = 'lift';
        const ty = T.ground(bd.x, bd.z) + BALL_Y[this.b];
        // up first, then across, so the ball clears the one below
        ball.y = U.approach(ball.y, ty, 1.3 * dt);
        if (Math.abs(ball.y - ty) < 0.25) { ball.x = U.approach(ball.x, bd.x, 1.1 * dt); ball.z = U.approach(ball.z, bd.z, 1.1 * dt); }
        if (Math.abs(ball.y - ty) < 0.01 && Math.abs(ball.x - bd.x) < 0.01 && Math.abs(ball.z - bd.z) < 0.01) {
          w.emit('shovel', bd.x, 1, bd.z); roller.act = ''; this.b++; this.t = 0;
          for (const k of kids) k.bt = { x: k.x, z: k.z, v: 1.2 };
          this.stage = this.b < 3 ? 'fetch' : 'decorate';
        }
      } else if (this.stage === 'decorate') {
        kids.forEach((k, i) => { if (!k.bt.ring) { const q = this.polar(this.site, 1.35, i * 2.09 + 0.4); k.bt = { x: q[0], z: q[1], v: 1.3, ring: true, face: Math.atan2(bd.x - q[0], bd.z - q[1]) }; } k.act = k.bt.arrived ? 'pat' : ''; });
        bd.decor = clamp((this.t - 0.8) / 3, 0, 1);
        if (this.t > 4.2) { this.stage = 'cheer'; this.t = 0; this.men[this.site] = { x: bd.x, z: bd.z, scale: 1, melting: false, n: this.built }; this.build = null; this.built++; w.emit('cheer', bd.x, 1.5, bd.z); }
      } else if (this.stage === 'cheer') {
        for (const k of kids) k.act = 'cheer';
        if (this.t > 3.4) { this.stage = 'rest'; this.t = 0; for (const k of kids) { k.act = ''; k.bt = { x: k.x, z: k.z, v: 1.4, arrived: true }; } }
      }
    }
  }
  SH.SnowmanProject = SnowmanProject;
})(globalThis.SH = globalThis.SH || {});
