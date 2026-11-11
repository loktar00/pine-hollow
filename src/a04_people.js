// a04_people.js -- people as data plus a table of states. One object per person for the whole session;
// position only ever changes by velocity * dt (or by the chair / belt that is carrying them).
// To add a behaviour: add a state to SH.states and route to it from a brain. To add player control:
// write a state whose step() reads input instead of steering toward a target.
(function (SH) {
  'use strict';
  const U = SH.util, CFG = SH.CONFIG, L = SH.LAYOUT, runs = SH.runs, clamp = U.clamp;
  const ST = SH.states = {};
  const tmp = {}, TAU = Math.PI * 2;

  // ------------------------------------------------------------ factory
  SH.makePerson = function (w, o) {
    const r = w.lookRng, P = CFG.palette;
    const p = {
      id: w.people.length, role: o.role || 'rider', kind: o.kind || 'ski', kid: !!o.kid, skill: o.skill === undefined ? 0.5 : o.skill,
      x: o.x || 0, y: 0, z: o.z || 0, px: 0, py: 0, pz: 0, heading: o.heading || 0, pHeading: 0, speed: 0, dist: r() * 10,
      state: 'idle', t: 0, free: false, roll: 0, act: '', errand: [],
      scale: o.kid ? 0.66 + r() * 0.08 : 0.94 + r() * 0.12,
      skisOn: o.kind !== 'foot', hasCup: false, vary: 0.9 + r() * 0.22, jx: r() * 2.4 - 1.2, jz: r() * 2.4 - 1.2,
      s: 0, sPrev: 0, sRate: 0, phase: 0, cph: 1, side: 0, wipeS: Infinity, run: '', needsHelp: !!o.kid && o.role === 'rider',
      cocoaCd: Math.floor(r() * 3), buddy: -1, seed: r(),
      look: {
        jacket: o.jacket !== undefined ? o.jacket : r.pick(P.jackets), pants: o.pants !== undefined ? o.pants : r.pick(P.pants),
        hat: o.hat !== undefined ? o.hat : r.pick(P.hats), skin: r.pick(P.skin), gear: r.pick(P.skis),
        helmet: o.helmet !== undefined ? o.helmet : r() < 0.62, goggles: o.kind !== 'foot' && r() < 0.8, pack: r() < 0.22,
        scarf: r() < 0.3 ? r.pick(P.hats) : -1, stripe: o.stripe !== undefined ? o.stripe : r() < 0.5 ? r.pick(P.jackets) : -1, bib: !!o.bib,
        accent: o.accent !== undefined ? o.accent : r.pick(P.jackets), gloves: r.pick(P.gloves), boots: r.pick(P.boots), hair: r.pick(P.hair), hairOut: r() < 0.45,
        gogglesUp: r() < 0.28, hivis: !!o.hivis, bibNo: 1 + Math.floor(r() * 9)
      }
    };
    p.y = w.terrain.ground(p.x, p.z); p.px = p.x; p.py = p.y; p.pz = p.z; p.pHeading = p.heading;
    w.people.push(p); w.byId[p.id] = p;
    return p;
  };

  // ------------------------------------------------------------ movement primitives (velocity only)
  function adv(p, dt) { const d = p.speed * dt; p.x += Math.sin(p.heading) * d; p.z += Math.cos(p.heading) * d; p.dist += d; }
  function moveTo(p, tx, tz, vmax, dt, acc, rate) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d > 0.03) {
      const want = Math.atan2(dx, dz);
      p.heading = U.turnToward(p.heading, want, (rate || 7) * dt);
      const facing = Math.max(0, Math.cos(U.wrapPi(want - p.heading)));
      p.speed = U.approach(p.speed, Math.min(vmax, 0.25 + d * 2.5) * (0.15 + 0.85 * facing), (acc || 5) * dt);
    } else p.speed = U.approach(p.speed, 0, 8 * dt);
    adv(p, dt);
    return d;
  }
  function halt(p, dt) { p.speed = U.approach(p.speed, 0, 6 * dt); adv(p, dt); }
  function face(p, yaw, dt) { p.heading = U.turnToward(p.heading, yaw, 4 * dt); }
  function next(p, w) {
    const e = p.errand.shift();
    if (e) w.go(p, e[0], e[1]); else SH.brain(p, w, 'idle');
  }
  SH.nextErrand = next;
  function footstep(p, w, d0) { if (Math.floor(p.dist / 0.72) !== Math.floor(d0 / 0.72)) w.emit('step', p.x, p.y, p.z); }

  function styleFor(p) {
    const S = CFG.styles;
    if (p.school) return S.school;
    if (p.role === 'patrol') return S.patrol;
    if (p.kid) return S.kid;
    if (p.kind === 'board') return S.boarder;
    return p.skill > 0.72 ? S.expert : p.skill > 0.38 ? S.inter : S.novice;
  }
  SH.pickRun = function (p, rng) {
    const r = rng();
    if (p.fixedRun) return p.fixedRun;
    if (p.role === 'patrol') return r < 0.4 ? 'main' : r < 0.75 ? 'mogul' : 'park';
    if (p.kid || (p.kind === 'ski' && p.skill <= 0.38)) return 'main';
    if (p.kind === 'board') return r < 0.62 ? 'park' : r < 0.9 ? 'main' : 'mogul';
    if (p.skill > 0.72) return r < 0.42 ? 'mogul' : r < 0.75 ? 'main' : 'park';
    return r < 0.62 ? 'main' : r < 0.82 ? 'park' : 'mogul';
  };

  // ------------------------------------------------------------ on the slope
  ST.ski = {
    enter(p, w, a) {
      p.run = a.run; const R = runs[p.run];
      p.s = a.s !== undefined ? a.s : R.path.project(p.x, p.z); p.sPrev = p.s;
      p.style = styleFor(p); p.plough = p.style === CFG.styles.novice || p.style === CFG.styles.kid || p.style === CFG.styles.school;
      p.phase = p.school ? 0 : w.rng() * TAU; p.cph = Math.cos(p.phase); p.side = 0; p.jumped = !!a.jumped; p.act = '';
      p.wipeS = Infinity;
      let wp = p.wipeP !== undefined ? p.wipeP : p.style.wipe;
      if (p.reg && p.reg.key === 'pip') wp = Math.max(0.06, 0.62 - 0.14 * p.reg.clean);        // Pip gets steadier every clean run
      if (!a.noWipe && wp && w.rng() < wp) {
        let lo = p.s + 9, hi = R.len - 16;
        if (p.run === 'park') { if (p.s < R.sKick) hi = R.sKick - 26; else lo = Math.max(lo, R.sKick + 24); }
        if (hi > lo) { p.wipeS = lo + w.rng() * (hi - lo); p.wipeBig = !p.school && w.rng() < 0.42; }
      }
    },
    step(p, w, dt) {
      const R = runs[p.run], path = R.path, st = p.style;
      p.s = path.project(p.x, p.z, p.s, 14);
      p.sRate += ((p.s - p.sPrev) / dt - p.sRate) * Math.min(1, dt * 2.5); p.sPrev = p.s;
      let A = st.A, Lt = st.L, vT = st.v * p.vary, turn = st.turn;
      p.inMoguls = false; p.tuck = false;
      if (p.run === 'mogul' && p.s > R.s0 && p.s < R.s1) { const m = CFG.styles.mogul; A = m.A; Lt = m.L; vT = Math.min(vT, m.v); turn = m.turn; p.inMoguls = true; }
      if (p.run === 'park') {
        const dk = R.sKick - p.s;
        if (dk > 0 && dk < 32) { A *= clamp((dk - 9) / 23, 0, 1); vT = Math.max(vT, 9.4); p.tuck = dk < 15; }
        if (dk <= 0.2 && dk > -3 && !p.jumped) { p.jumped = true; return w.go(p, 'air'); }
      }
      const rem = R.len - p.s;
      if (rem < 15) vT = Math.min(vT, 2.2 + rem * 0.36);
      if (p.school) {
        p.phase = p.s * TAU / Lt;
        if (p.ahead) { const a = p.ahead, gap = (a.state === 'ski' || a.state === 'fall') && a.run === p.run ? a.s - p.s : 6; vT *= clamp((gap - 1.3) / 1.5, 0, 1.4); }
        else if (w.school.anyDown) vT = 0;
      }
      if (p.role === 'patrol' && w.tick % 30 === p.id % 30) { const v = w.findCasualty(p); if (v) return w.go(p, 'respond', { victim: v }); }

      const a = path.at(p.s + 5 + p.speed * 0.35, tmp), nx = a.tz, nz = -a.tx;
      let side = 0;
      for (let i = 0; i < w.slope.length; i++) {
        const o = w.slope[i]; if (o === p || (p.school && o.school)) continue;
        const dx = o.x - p.x, dz = o.z - p.z; if (dx * dx + dz * dz > 100) continue;
        const fwd = dx * Math.sin(p.heading) + dz * Math.cos(p.heading); if (fwd < -0.6) continue;
        const lat = dx * nx + dz * nz, r = o.avoidR || 2.6;
        if (Math.abs(lat) < r) { side -= (lat >= 0 ? 1 : -1) * (r - Math.abs(lat)) * 1.4; if (fwd < 3.2 && Math.abs(lat) < 0.9) vT *= 0.55; }
      }
      p.side += (clamp(side, -5, 5) - p.side) * Math.min(1, dt * 3);
      const off = clamp(A * Math.sin(p.phase) + p.side, -(R.hw - 1.5), R.hw - 1.5);
      const want = Math.atan2(a.x + nx * off - p.x, a.z + nz * off - p.z), h0 = p.heading;
      p.heading = U.turnToward(p.heading, want, turn * dt);
      const rate = U.wrapPi(p.heading - h0) / dt;
      p.roll += (clamp(rate * p.speed / 9.8, -0.6, 0.6) - p.roll) * Math.min(1, dt * 8);
      p.speed = U.approach(p.speed, vT, (p.speed < vT ? 2.8 : 4.6) * dt);
      adv(p, dt);
      if (!p.school) p.phase += p.speed * dt * TAU / Lt;
      const c = Math.cos(p.phase);
      if (c * p.cph < 0 && p.speed > 1.5) w.emit(p.kind === 'board' ? 'carve' : 'swish', p.x, p.y, p.z, p.speed);
      p.cph = c;
      if (p.s >= p.wipeS) return w.go(p, 'fall', { big: p.wipeBig });
      if (rem < 1.3) return SH.brain(p, w, 'runEnd');
    }
  };

  // tumble -> lie -> get up. stage: 0 tumbling, 1 lying, 2 getting up (stageT runs 0..1 inside each)
  ST.fall = {
    enter(p, w, a) {
      p.fall = { big: !!a.big, lie: a.big ? 3.0 + w.rng() * 1.5 : 1.1 + w.rng() * 1.4, patrol: null, helpedAt: -1, upAt: -1, dir: w.rng() < 0.5 ? -1 : 1 };
      p.stage = 0; p.stageT = 0; p.wipeS = Infinity; p.avoidR = 3.4;
      if (p.reg) { p.reg.falls++; p.reg.fell = true; }
      w.emit('fall', p.x, p.y, p.z, p.speed);
    },
    step(p, w, dt) {
      const f = p.fall, T0 = 0.95;
      p.roll *= 1 - Math.min(1, dt * 6);
      if (p.t < T0) { p.stage = 0; p.stageT = p.t / T0; p.speed = U.approach(p.speed, 0.6, 7 * dt); adv(p, dt); return; }
      p.speed = U.approach(p.speed, 0, 5 * dt); adv(p, dt);
      if (f.upAt < 0) {
        p.stage = 1; p.stageT = Math.min(1, (p.t - T0) / f.lie);
        let ready = p.t > T0 + f.lie;
        if (f.patrol) ready = f.helpedAt >= 0 ? w.time > f.helpedAt + 2.4 : p.t > 16;   // wait for the patroller, within reason
        if (ready) { f.upAt = p.t; w.emit('getup', p.x, p.y, p.z); }
        return;
      }
      p.stage = 2; p.stageT = Math.min(1, (p.t - f.upAt) / 1.5);
      if (p.t > f.upAt + 1.5) { p.avoidR = 0; p.fall = null; w.go(p, 'ski', { run: p.run, noWipe: true, jumped: p.jumped }); }
    }
  };

  ST.air = {
    free: true,
    enter(p, w) {
      const g = CFG.speeds.gravity;
      p.vh = Math.max(p.speed, 8.2); p.vy = CFG.speeds.jumpPop + p.skill * 1.3; p.act = '';
      // look ahead to learn the hang time so the trick finishes on landing
      let x = p.x, z = p.z, y = p.y, vy = p.vy, n = 0; const h = 1 / 60;
      do { x += Math.sin(p.heading) * p.vh * h; z += Math.cos(p.heading) * p.vh * h; vy -= g * h; y += vy * h; n++; } while (n < 400 && (y > w.terrain.h(x, z) || vy > 0));
      p.airDur = n * h; p.airT = 0;
      const tricky = p.kind === 'board' ? p.skill > 0.35 : p.skill > 0.6;
      p.spin = tricky ? (w.rng() < 0.5 ? TAU : -TAU) * (p.skill > 0.8 && w.rng() < 0.4 ? 2 : 1) : 0;
      p.grab = tricky && w.rng() < 0.7;
      p.landFail = w.rng() < (1 - p.skill) * 0.32;
      if (p.reg && p.reg.key === 'rosa') { p.spin = TAU * p.reg.level * (w.rng() < 0.5 ? 1 : -1); p.grab = true; p.landFail = w.rng() < 0.11 * p.reg.level; p.vy += 0.5 * p.reg.level; }
      if (p.sureFooted) p.landFail = false;   // Rosa adds a rotation each time she lands one
      w.emit('takeoff', p.x, p.y, p.z, p.speed);
    },
    step(p, w, dt) {
      p.x += Math.sin(p.heading) * p.vh * dt; p.z += Math.cos(p.heading) * p.vh * dt; p.dist += p.vh * dt;
      p.vy -= CFG.speeds.gravity * dt; p.y += p.vy * dt; p.airT += dt;
      p.roll *= 1 - Math.min(1, dt * 5);
      const g = w.terrain.h(p.x, p.z);
      if (p.y <= g && p.vy < 0) {
        p.y = g; p.speed = p.vh * 0.92; p.spin = 0; p.grab = false;
        w.emit('land', p.x, p.y, p.z, p.speed);
        if (p.reg && p.reg.key === 'rosa') { if (p.landFail) p.reg.level = 1; else { p.reg.best = Math.max(p.reg.best, p.reg.level); p.reg.level = Math.min(3, p.reg.level + 1); } }
        if (p.landFail) w.go(p, 'fall', { big: w.rng() < 0.5 });
        else w.go(p, 'ski', { run: p.run, noWipe: true, jumped: true });
      }
    }
  };

  // ski patrol: ski to a casualty, kneel beside them, see them up
  ST.respond = {
    enter(p, w, a) { p.victim = a.victim; a.victim.fall.patrol = p; p.act = ''; },
    step(p, w, dt) {
      const v = p.victim;
      if (!v || v.state !== 'fall') { p.victim = null; return w.go(p, 'ski', { run: p.run, noWipe: true, jumped: true }); }
      const tx = v.x + 0.6, tz = v.z - 1.9, d = Math.hypot(tx - p.x, tz - p.z), h0 = p.heading;
      p.heading = U.turnToward(p.heading, Math.atan2(tx - p.x, tz - p.z), 2.6 * dt);
      p.roll += (clamp(U.wrapPi(p.heading - h0) / dt * p.speed / 9.8, -0.6, 0.6) - p.roll) * Math.min(1, dt * 8);
      p.speed = U.approach(p.speed, Math.min(10.5, 0.6 + d * 0.95), 5 * dt); adv(p, dt);
      p.s = runs[p.run].path.project(p.x, p.z, p.s, 30);
      if (d < 1.3) w.go(p, 'assist');
    }
  };
  ST.assist = {
    enter(p, w) { p.act = 'kneel'; if (p.reg) p.reg.assists++; if (p.victim && p.victim.fall) p.victim.fall.helpedAt = w.time; w.emit('getup', p.x, p.y, p.z); },
    step(p, w, dt) {
      halt(p, dt); p.roll *= 0.9;
      const v = p.victim;
      if (v && v.state === 'fall') { face(p, Math.atan2(v.x - p.x, v.z - p.z), dt); p.holdT = p.t; return; }
      if (p.t > (p.holdT || 0) + 1.2) { p.victim = null; p.act = ''; w.go(p, 'ski', { run: p.run, noWipe: true, jumped: true }); }
    }
  };

  // ------------------------------------------------------------ on foot / on the flat
  // follow waypoints, then run the next errand step. gait: 'skate' | 'walk'
  ST.travel = {
    enter(p, w, a) { p.tr = { pts: a.pts, i: 0, v: a.v || (a.gait === 'skate' ? CFG.speeds.skate : p.kid ? CFG.speeds.kidWalk : CFG.speeds.walk) * p.vary, r: a.r || 0.35 }; p.act = a.act || ''; p.gait = a.gait || 'walk'; },
    step(p, w, dt) {
      const tr = p.tr, pt = tr.pts[tr.i], last = tr.i === tr.pts.length - 1, d0 = p.dist;
      const d = moveTo(p, pt[0], pt[1], tr.v, dt, 4, p.gait === 'skate' ? 3.2 : 6);
      p.roll *= 1 - Math.min(1, dt * 5);
      if (p.gait === 'walk') footstep(p, w, d0);
      if (d < (last ? tr.r : 1.4)) { if (last) next(p, w); else tr.i++; }
    }
  };
  // stand and do something for a while. a: {act, dur, face, fx, every:[event, seconds]}
  ST.timer = {
    enter(p, w, a) { p.tm = a; p.act = a.act || ''; p.tmNext = a.every ? a.every[1] * 0.5 : 1e9; },
    step(p, w, dt) {
      const a = p.tm; halt(p, dt);
      if (a.face !== undefined) face(p, a.face, dt);
      if (p.t > p.tmNext) { p.tmNext += a.every[1]; w.emit(a.every[0], p.x, p.y, p.z); }
      if (p.t >= a.dur) { if (a.fx) FX[a.fx](p, w); p.act = ''; next(p, w); }
    }
  };
  const FX = SH.timerFx = {
    carryOn(p, w) { p.skisOn = false; p.carry = true; w.emit('getup', p.x, p.y, p.z); },                 // unclip, skis up on the shoulder
    rackPut(p, w) { p.carry = false; p.gearX = p.x; p.gearZ = p.z - 0.75; w.emit('clunk', p.x, p.y, p.z); },   // lean them on the rack
    rackTake(p, w) { p.carry = true; p.gearX = undefined; w.release('rack', p); },
    skisOn(p, w) { p.skisOn = true; p.carry = false; w.emit('clunk', p.x, p.y, p.z); },
    cupOff(p, w) { p.hasCup = false; w.release('sip', p); w.emit('cup', p.x, p.y, p.z); },
    freeRail(p, w) { w.release('rail', p); }
  };

  ST.queue = {
    enter(p, w, a) { p.q = a.q; if (!a.rejoin) a.q.join(p); p.act = ''; p.gait = p.skisOn ? 'skate' : 'walk'; },
    step(p, w, dt) {
      const q = p.q, tgt = q.targetS(p), d0 = p.dist;
      // now and then somebody's skis slide out from under them in the lift line
      if (p.slipT > 0) { p.slipT -= dt; p.act = p.slipT > 0 ? 'slip' : ''; halt(p, dt); return; }
      if (q === w.queues.lift && p.skisOn && p.speed > 0.6 && w.rng() < dt * 0.0011) { p.slipT = 2.2; p.act = 'slip'; w.slips++; w.emit('fall', p.x, p.y, p.z, 1); }
      const qi = q.list.indexOf(p), lim = qi > 0 ? Math.min(tgt, q.list[qi - 1].qS - q.spacing) : tgt;   // never walk through the person ahead
      p.qS = Math.max(p.qS, Math.min(lim, p.qS + 1.9 * dt));
      q.posAt(p.qS, tmp);
      const d = moveTo(p, tmp.x, tmp.z, 2.2, dt, 4, 5);
      if (d < 0.2 && tgt - p.qS < 0.1) { face(p, Math.atan2(tmp.tx, tmp.tz), dt); }
      if (!p.skisOn) footstep(p, w, d0);
    }
  };
  ST.toLoad = {
    enter(p, w, a) { p.ld = a; p.buddy = a.buddies; p.act = ''; },
    step(p, w, dt) { const d = moveTo(p, p.ld.x, p.ld.z, 3.0, dt, 6, 6); if (d < 0.25) face(p, Math.PI, dt * 2); }
  };
  ST.ride = {
    free: true,
    enter(p, w, a) { p.chair = a.chair; p.seat = a.seat; p.speed = 0; p.act = ''; if (p.partner && p.buddy === p.partner.id) p.reg.chairs++; },
    step(p, w, dt) {
      const c = p.chair; w.lift.seatPos(c, p.seat, tmp);
      p.x += (c.x - c.px) + clamp((tmp.x - p.x) * 8 * dt, -2 * dt, 2 * dt);
      p.z += (c.z - c.pz) + clamp((tmp.z - p.z) * 8 * dt, -2 * dt, 2 * dt);
      p.y += (c.y - c.py) + clamp((tmp.y - 0.5 - p.y) * 8 * dt, -1.6 * dt, 1.6 * dt);
      p.heading = U.turnToward(p.heading, c.yaw, 3 * dt);
      p.roll = 0;
    }
  };
  ST.offload = {
    enter(p, w) { p.chair = null; p.speed = w.lift.v; p.act = p.needsHelp ? 'wobble' : ''; p.gait = 'skate'; p.og = [L.gather[0] + p.jx * 2.2, L.gather[1] + p.jz * 1.2]; },
    step(p, w, dt) {
      const v = p.needsHelp ? 1.8 : 3.0;
      if (p.t < 0.7) { p.speed = U.approach(p.speed, v, 3 * dt); face(p, Math.PI, dt); adv(p, dt); return; }
      if (moveTo(p, p.og[0], p.og[1], v, dt, 3, 2.4) < 2.4) { p.act = ''; SH.brain(p, w, 'top'); }
    }
  };
  ST.carpet = {
    enter(p, w) { p.act = ''; },
    step(p, w, dt) {
      const c = w.carpet;
      p.speed = U.approach(p.speed, 0, 4 * dt);
      p.x += clamp((c.x - p.x) * 4 * dt, -dt, dt); p.z -= c.v * dt;
      face(p, Math.PI, dt);
      if (p.z <= c.zTop) { p.speed = c.v; next(p, w); }
    }
  };
  // wait at the bottom for a partner who is still on the way down
  ST.waitFor = {
    enter(p) { p.act = ''; },
    step(p, w, dt) { halt(p, dt); face(p, Math.PI, dt); const s = p.partner ? p.partner.state : ''; if (p.t > 0.6 && !(s === 'ski' || s === 'fall' || s === 'air' || s === 'offload' || s === 'ride' || s === 'toLoad') || p.t > 130) next(p, w); }
  };
  ST.lineup = { enter(p) { p.act = ''; }, step(p, w, dt) { halt(p, dt); face(p, p === w.school.leader ? 2.4 : 0.3, dt); } };

  // stand at a post; what the person does there depends on their role
  ST.post = {
    enter(p) { p.act = ''; },
    step(p, w, dt) {
      const d = moveTo(p, p.home[0], p.home[1], 1.3, dt, 4, 6);
      if (d > 0.3) return;
      const R = POSTS[p.role]; if (R) R(p, w, dt);
    }
  };
  const POSTS = {
    attLo(p, w, dt) {
      // brush the snow off each empty seat as it comes round, wave the next group forward
      const dl = w.lift.distToLoad(w.lift.nextChair()), brushing = dl > 0.9 && dl < 4.2;
      face(p, brushing ? -1.35 : -1.9, dt); p.act = brushing ? 'brush' : w.lift.call ? 'wave' : '';
      p.sweepT -= dt;
      if (p.sweepT < 0 && !w.lift.call) {
        p.sweepT = 26 + w.rng() * 22;
        p.errand = [['travel', { pts: [[50, 47.4]] }], ['timer', { act: 'shovel', dur: 5.5, face: -1.2, every: ['shovel', 1.25] }]];
        next(p, w);
      }
    },
    attHi(p, w, dt) {
      face(p, 0.9, dt); p.act = '';
      const lf = w.lift;
      for (const c of lf.chairs) {
        const d = lf.uUnload - c.u; if (d < 0 || d > lf.v * 5.2) continue;
        for (let k = 0; k < 4; k++) if (c.seats[k] !== null && w.byId[c.seats[k]].needsHelp) {
          p.errand = [['travel', { pts: [[46.0, -83.9]], v: 1.9 }], ['timer', { act: 'assist', dur: 5.4, face: 1.3 }]];
          return next(p, w);
        }
      }
    },
    attCarpet(p, w, dt) { face(p, -1.9, dt); const b = w.carpet.lastBoard; p.act = b && b.state === 'carpet' && b.z > w.carpet.zBottom - 5 ? 'wave' : ''; },
    vendor(p, w, dt) { face(p, 1.57, dt); p.act = w.stand.busy > 0 ? 'serve' : ''; }
  };
  // sled hill: slide down sitting on the sled, trudge back up towing it
  ST.sledder = {
    enter(p) { p.sl = p.sl || { down: false, wait: 1 + p.id % 3 * 2.2 }; },
    step(p, w, dt) {
      const H = L.sledHill, sl = p.sl, d0 = p.dist;
      if (sl.wait > 0) { sl.wait -= dt; halt(p, dt); face(p, 0, dt); p.act = sl.down ? 'sled' : 'pull'; if (sl.wait <= 0) sl.down = true; return; }
      if (sl.down) {
        p.act = 'sled'; p.heading = U.turnToward(p.heading, Math.atan2(H.x - p.x, H.z1 - p.z), 2 * dt);
        const rem = H.z1 - p.z; p.speed = U.approach(p.speed, rem > 5 ? 5.2 : 0.4 + rem * 0.5, (rem > 5 ? 2.0 : 5) * dt); adv(p, dt);
        if (rem < 0.6) { sl.down = false; w.sledRuns++; w.emit('swish', p.x, p.y, p.z, 2); }
      } else {
        p.act = 'pull';
        const d = moveTo(p, H.x + 2.0 + p.jx * 0.3, H.z0, 1.15, dt, 3, 4); footstep(p, w, d0);
        if (d < 0.5) sl.wait = 1.2 + w.rng() * 2.5;
      }
    }
  };
  // snowman builders are puppeteered by the SnowmanProject (a05): it hands them a target and an act
  ST.builder = {
    enter(p) { p.bt = p.bt || { x: p.x, z: p.z, v: 1.2 }; },
    step(p, w, dt) {
      const b = p.bt, d0 = p.dist, d = moveTo(p, b.x, b.z, b.v, dt, 4, 5);
      b.arrived = d < (b.r || 0.4);
      if (b.arrived && b.face !== undefined) face(p, b.face, dt);
      footstep(p, w, d0);
    }
  };

  // ------------------------------------------------------------ brains: what next?
  function toLift(p, w) {
    const a = L.mazeApproach, m = L.maze[0];
    if (p.partner) p.errand.push(['travel', { pts: [[13 + p.jx, 54 + p.jz]], gait: 'skate', r: 1.2 }], ['waitFor', {}]);   // meet up before the lift line
    p.errand.push(['travel', { pts: [[a[0] + p.jx, a[1] + p.jz], [m[0] - 0.6, m[1] + p.jz * 0.2]], gait: 'skate', r: 0.8 }], ['queue', { q: w.queues.lift }]);
  }
  const BR = SH.brains = {
    rider(p, w, ev) {
      if (ev === 'top') {
        p.cocoaCd--; if (p.reg) p.reg.laps++;
        const pr = p.partner, together = pr && p.reg.key === 'june' && pr.run && (pr.state === 'ski' || pr.state === 'offload');
        return w.go(p, 'ski', { run: together ? pr.run : SH.pickRun(p, w.rng) });
      }
      p.errand.length = 0;
      const c = L.cocoa;
      if (ev === 'runEnd' && p.cocoaCd <= 0 && w.rng() < 0.3 && w.queues.cocoa.list.length < 4) {
        const slot = w.claim('rack', p, c.rack.n), sip = slot >= 0 ? w.claim('sip', p, c.sip.length) : -1;
        if (sip >= 0) {
          p.cocoaCd = 2 + Math.floor(w.rng() * 3);
          const rx = c.rack.x0 + slot * c.rack.dx, rz = c.rack.z, sp = c.sip[sip], q = c.queue[0];
          p.errand.push(
            ['travel', { pts: [[rx + p.jx, rz + 3.6]], gait: 'skate', r: 0.5 }], ['timer', { act: 'unclip', dur: 1.5, fx: 'carryOn' }],
            ['travel', { pts: [[rx, rz + 0.1]], r: 0.25 }], ['timer', { act: 'rack', dur: 1.1, face: Math.PI, fx: 'rackPut' }],
            ['travel', { pts: [[q[0] + 0.6, q[1] + p.jz * 0.3]] }], ['queue', { q: w.queues.cocoa }],
            ['travel', { pts: [sp] }], ['timer', { act: 'sip', dur: 8 + w.rng() * 7, face: 2.2 + p.jx, every: ['cup', 4.5] }],
            ['travel', { pts: [c.bin] }], ['timer', { act: 'bin', dur: 0.9, fx: 'cupOff' }],
            ['travel', { pts: [[rx, rz + 0.1]], r: 0.25 }], ['timer', { act: 'rack', dur: 1.1, face: Math.PI, fx: 'rackTake' }],
            ['travel', { pts: [[rx + p.jx, rz + 3.8]], r: 0.4 }], ['timer', { act: 'unclip', dur: 1.5, fx: 'skisOn' }]);
        } else if (slot >= 0) w.release('rack', p);
      }
      toLift(p, w); next(p, w);
    },
    school(p, w, ev) {
      const Q = L.carpetQueue, lu = L.schoolLineup, i = w.school.members.indexOf(p);
      if (ev === 'runEnd' && p.reg) { if (!p.reg.fell) p.reg.clean++; p.reg.fell = false; p.reg.laps++; }
      const spot = i === 0 ? [-66, 5.6] : [lu.x + (i - 1) * lu.dx, lu.z];
      p.errand = [['travel', { pts: [[Q[0][0] + 1.5, Q[0][1] - 1 + p.jz * 0.3]], gait: 'skate', r: 1.0 }], ['queue', { q: w.queues.carpet }],
                  ['travel', { pts: [[-76.5, 4.4], spot], gait: 'skate', r: 0.5 }], ['lineup', {}]];
      if (ev === 'idle') p.errand = [['lineup', {}]];
      next(p, w);
    },
    deck(p, w) {
      const seat = L.deckSeats[p.seatIdx], rail = w.claim('rail', p, L.deckRail.length);
      p.errand = [['timer', { act: 'sit', dur: 9 + w.rng() * 16, face: seat[2], every: ['cup', 6 + w.rng() * 5] }]];
      if (rail >= 0) p.errand.push(['travel', { pts: [L.deckRail[rail]] }], ['timer', { act: 'lean', dur: 6 + w.rng() * 7, face: rail < 4 ? 1.57 : 0, fx: 'freeRail' }], ['travel', { pts: [[seat[0], seat[1]]], r: 0.2 }]);
      next(p, w);
    },
    attLo(p, w) { w.go(p, 'post'); }, attHi(p, w) { w.go(p, 'post'); }, attCarpet(p, w) { w.go(p, 'post'); }, vendor(p, w) { w.go(p, 'post'); },
    builder(p, w) { w.go(p, 'builder'); }, sledder(p, w) { w.go(p, 'sledder'); }
  };
  BR.patrol = BR.rider;
  SH.brain = function (p, w, ev) { BR[p.role](p, w, ev); };
})(globalThis.SH = globalThis.SH || {});

// one line of story for a regular's name tag
globalThis.SH.regularLine = function (p) {
  const g = p.reg;
  switch (g.key) {
    case 'bea': return 'ski patrol, ' + g.assists + (g.assists === 1 ? ' rescue' : ' rescues') + ' today';
    case 'tom': return 'lap ' + (g.laps + 1) + ', same suit since 1987';
    case 'rosa': return g.best ? 'landed a ' + g.best * 360 + ', going for ' + g.level * 360 : 'going for a ' + g.level * 360;
    case 'nils': return g.falls ? 'tumble no. ' + g.falls + ', still smiling' : 'first day on skis';
    case 'gus': case 'june': return g.chairs + (g.chairs === 1 ? ' chair' : ' chairs') + ' with ' + p.partner.reg.name;
    case 'pip': return 'ski school, ' + g.clean + (g.clean === 1 ? ' clean run' : ' clean runs');
  }
  return '';
};
