// a06_sim.js -- the World: owns every entity, steps them on a fixed timestep from one seeded RNG.
// No rendering, no DOM, no wall clock: world.step() is the only thing that advances time.
(function (SH) {
  'use strict';
  const U = SH.util, CFG = SH.CONFIG, L = SH.LAYOUT, runs = SH.runs, ST = SH.states;

  class World {
    constructor(seed) {
      this.seed = seed === undefined ? CFG.seed : seed;
      this.rng = U.makeRng(this.seed); this.lookRng = U.makeRng(this.seed ^ 0x9e3779b9);
      this.terrain = SH.terrain; this.dt = CFG.dt; this.time = 0; this.tick = 0;
      this.people = []; this.byId = []; this.events = []; this.slope = [];
      this.spots = { rack: [], sip: [], rail: [] }; this.regulars = []; this.slips = 0; this.sledRuns = 0;
      this.wind = { a: 0.9, s: 0.6 };          // direction (rad) and strength 0..1; flags, smoke and snow follow it
      this.queues = { lift: new SH.Queue(L.maze, 1.15), cocoa: new SH.Queue(L.cocoa.queue, 1.0), carpet: new SH.Queue(L.carpetQueue, 1.25) };
      this.lift = new SH.ChairLift(CFG.lift, this.terrain, this.rng, CFG.speeds.lift);
      this.carpet = new SH.Carpet(L.carpet, CFG.speeds.carpet);
      this.cat = new SH.Snowcat(this.terrain);
      this.guns = new SH.SnowGuns();
      this.stand = new SH.Stand();
      this.school = new SH.School();
      this.populate();
    }
    go(p, name, arg) { p.state = name; p.t = 0; p.free = !!ST[name].free; if (ST[name].enter) ST[name].enter(p, this, arg || {}); }
    emit(type, x, y, z, a) { if (this.events.length < 256) this.events.push({ type: type, x: x, y: y, z: z, a: a || 0 }); }
    claim(kind, p, n) { const s = this.spots[kind]; for (let i = 0; i < n; i++) if (s[i] === undefined || s[i] === null) { s[i] = p.id; return i; } return -1; }
    release(kind, p) { const s = this.spots[kind]; for (let i = 0; i < s.length; i++) if (s[i] === p.id) s[i] = null; }
    findCasualty(pat) {
      let best = null, bd = 1e9;
      for (const o of this.slope) {
        if (o.state !== 'fall' || !o.fall || !o.fall.big || o.fall.patrol || o.stage > 1) continue;
        const dz = o.z - pat.z, dx = Math.abs(o.x - pat.x);
        if (dz < 6 || dz > 95 || dx > 45) continue;
        if (dz + dx < bd) { bd = dz + dx; best = o; }
      }
      return best;
    }

    populate() {
      const rng = this.rng, C = CFG.counts, P = CFG.palette, lift = this.lift, tmp = {};
      // --- riders (the loop): spread around the hill, the queue and the chairs so the scene opens busy
      const onChairs = [];
      for (const c of lift.chairs) if (c.u > lift.uLoad + 4 && c.u < lift.uUnload - 4) onChairs.push(c);
      let chairI = 0, seatK = 0;
      for (let i = 0; i < C.riders; i++) {
        const patrol = i < C.patrol, rg = CFG.regulars.find((g) => g.index === i);
        let kid = !patrol && rng() < C.kidFrac;
        let kind = patrol ? 'ski' : rng() < C.boarderFrac ? 'board' : 'ski';
        let skill = patrol ? 0.95 : kid ? 0.12 + rng() * 0.3 : Math.min(1, 0.12 + rng() * 0.95);
        if (rg && rg.kind) { kid = false; kind = rg.kind; skill = rg.skill; }
        const p = SH.makePerson(this, patrol ? { role: 'patrol', kind: kind, skill: skill, jacket: P.patrolRed, pants: 0x1c1f24, helmet: true, hat: 0xd0021b, accent: 0x1c1f24, stripe: 0xf4f8fb }
                                             : Object.assign({ role: 'rider', kind: kind, skill: skill, kid: kid }, rg ? rg.look : null));
        if (rg) { p.reg = { key: rg.key, name: rg.name, laps: 0, falls: 0, best: 0, level: 1, chairs: 0, assists: 0, clean: 0, fell: false }; this.regulars.push(p); if (rg.run) p.fixedRun = rg.run; if (rg.wipe !== undefined) p.wipeP = rg.wipe; }
        const r = i < C.patrol ? 0.1 : rng();
        if (r < 0.44) {
          const run = SH.pickRun(p, rng), R = runs[run];
          let s = 6 + rng() * (R.len - 26);
          if (run === 'park' && s > R.sKick - 34 && s < R.sKick + 20) s = R.sKick + 20 + rng() * 10;
          R.path.at(s, tmp); const off = (rng() * 2 - 1) * (R.hw - 3);
          p.x = tmp.x + tmp.tz * off; p.z = tmp.z - tmp.tx * off; p.heading = Math.atan2(tmp.tx, tmp.tz);
          this.go(p, 'ski', { run: run, s: s, jumped: run === 'park' && s > R.sKick }); p.speed = p.style.v * 0.7;
        } else if (r < 0.62) {
          const q = this.queues.lift; q.list.push(p); p.qS = q.targetS(p); q.posAt(p.qS, tmp);
          p.x = tmp.x; p.z = tmp.z; p.heading = Math.atan2(tmp.tx, tmp.tz);
          this.go(p, 'queue', { q: q, rejoin: true });
        } else if (r < 0.93 && chairI < onChairs.length) {
          const c = onChairs[chairI]; c.seats[seatK] = p.id; lift.seatPos(c, seatK, tmp);
          p.x = tmp.x; p.z = tmp.z; p.y = tmp.y - 0.5; p.heading = c.yaw;
          this.go(p, 'ride', { chair: c, seat: seatK });
          seatK += 1 + (rng() < 0.3 ? 1 : 0); if (seatK > 3 || rng() < 0.3) { seatK = rng() < 0.5 ? 0 : 1; chairI++; }
        } else {
          p.x = -2 + rng() * 24; p.z = 48 + rng() * 9; p.heading = 1.2;
          SH.brain(p, this, 'idle');
        }
        if (!p.free) p.y = this.terrain.ground(p.x, p.z);
      }
      // --- ski school
      const sc = this.school, lu = L.schoolLineup;
      for (let i = 0; i <= C.schoolKids; i++) {
        const lead = i === 0;
        const p = SH.makePerson(this, lead ? { role: 'school', kind: 'ski', skill: 0.9, jacket: P.instructorBlue, pants: 0x1c1f24, hat: P.instructorBlue, accent: 0xf4f8fb, stripe: 0xf4f8fb, helmet: false, x: -66, z: 5.6 }
                                           : { role: 'school', kind: 'ski', skill: 0.2, kid: true, bib: true, helmet: true, x: lu.x + (i - 1) * lu.dx, z: lu.z });
        p.school = true; p.ahead = lead ? null : sc.members[i - 1]; p.needsHelp = false;
        sc.members.push(p); if (lead) sc.leader = p;
        if (i === 3) { p.reg = { key: 'pip', name: 'Pip', laps: 0, falls: 0, best: 0, level: 1, chairs: 0, assists: 0, clean: 0, fell: false }; this.regulars.push(p); }
        this.go(p, 'lineup');
      }
      { const by = (k) => this.regulars.find((p) => p.reg.key === k), gus = by('gus'), june = by('june'); gus.partner = june; june.partner = gus; june.vary = gus.vary; }
      // --- sled hill
      for (let i = 0; i < C.sledders; i++) { const H = L.sledHill, p = SH.makePerson(this, { role: 'sledder', kind: 'foot', kid: true, helmet: false, x: H.x + 2 - i * 0.8, z: H.z0 + i * 5 }); SH.brain(p, this, 'idle'); }
      // --- lodge deck
      for (let i = 0; i < C.deckGuests; i++) {
        const s = L.deckSeats[i % L.deckSeats.length];
        const p = SH.makePerson(this, { role: 'deck', kind: 'foot', x: s[0], z: s[1], heading: s[2], helmet: false });
        p.seatIdx = i % L.deckSeats.length; p.hasCup = i % 3 !== 2;
        SH.brain(p, this, 'idle'); p.t = rng() * 6;
      }
      // --- staff
      const staff = (role, home, color, heading) => {
        const hv = role !== 'vendor';
        const p = SH.makePerson(this, { role: role, kind: 'foot', x: home[0], z: home[1], heading: heading, jacket: hv ? P.hiVis : color, pants: 0x23272e, helmet: false, hat: hv ? 0xff7b25 : 0xf4f8fb, hivis: hv, accent: hv ? 0xff7b25 : 0xf4f8fb, stripe: -1 });
        p.home = home; p.sweepT = 12; SH.brain(p, this, 'idle'); return p;
      };
      this.attLo = staff('attLo', [50, 51.3], P.attendant, -1.9);
      this.attHi = staff('attHi', [44.9, -85.9], P.attendant, 0.9);
      this.attCarpet = staff('attCarpet', [-77.4, 40.6], P.attendant, -1.9);
      this.vendor = staff('vendor', L.cocoa.vendor, P.vendor, 1.57);
      // --- snowman builders
      const kids = [];
      for (let i = 0; i < C.builders; i++) {
        const h = L.snowman.home;
        const p = SH.makePerson(this, { role: 'builder', kind: 'foot', kid: true, x: h[0] + i * 1.6 - 1.6, z: h[1] + (i % 2), helmet: false });
        p.bt = { x: p.x, z: p.z, v: 1.3, arrived: true }; kids.push(p); this.go(p, 'builder');
      }
      this.snowman = new SH.SnowmanProject(kids);
      this.sled = new SH.Sled(this.people[0], this.terrain); this.people[0].sled = this.sled;
      for (const p of this.people) { p.px = p.x; p.py = p.y; p.pz = p.z; p.pHeading = p.heading; }
    }

    step() {
      const dt = this.dt, people = this.people, T = this.terrain;
      this.slope.length = 0;
      for (let i = 0; i < people.length; i++) {
        const p = people[i]; p.px = p.x; p.py = p.y; p.pz = p.z; p.pHeading = p.heading;
        const s = p.state;
        if (s === 'ski' || s === 'fall' || s === 'respond' || s === 'assist') this.slope.push(p);
      }
      this.slope.push(this.cat);
      this.lift.step(dt, this); this.carpet.step(dt, this); this.stand.step(dt, this);
      this.school.step(dt, this); this.snowman.step(dt, this); this.cat.step(dt, this); this.guns.step(dt, this);
      for (let i = 0; i < people.length; i++) {
        const p = people[i]; p.t += dt;
        ST[p.state].step(p, this, dt);
        if (!p.free) { const g = T.ground(p.x, p.z); p.y = Math.abs(g - p.y) < 0.4 ? g : U.approach(p.y, g, 6 * dt); }
      }
      this.sled.step(dt);
      this.time += dt; this.tick++;
      this.wind.a = 0.9 + 0.7 * Math.sin(this.time * 0.021) + 0.3 * Math.sin(this.time * 0.057 + 1); this.wind.s = 0.55 + 0.35 * Math.sin(this.time * 0.033 + 2);
    }
  }
  SH.World = World;
})(globalThis.SH = globalThis.SH || {});
