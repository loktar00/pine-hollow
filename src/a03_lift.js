// a03_lift.js -- the lift system: a generic single-file Queue, the quad ChairLift and the beginner Carpet.
(function (SH) {
  'use strict';
  const U = SH.util, clamp = U.clamp;

  // ------------------------------------------------------------ Queue
  // People stand along a polyline, front of the line at the END of the path.
  class Queue {
    constructor(pts, spacing) { this.path = new U.Path(pts); this.spacing = spacing; this.list = []; }
    join(p) { if (this.list.indexOf(p) < 0) this.list.push(p); p.qS = Math.min(p.qS || 0, 0); p.qS = this.path.project(p.x, p.z); }
    joinFront(p) { this.list.unshift(p); p.qS = this.path.project(p.x, p.z); }
    targetS(p) { return this.path.len - this.list.indexOf(p) * this.spacing; }
    arrived(p) { return this.targetS(p) - p.qS < 0.35; }
    take(n) { return this.list.splice(0, n); }
    remove(p) { const i = this.list.indexOf(p); if (i >= 0) this.list.splice(i, 1); }
    posAt(s, out) {
      if (s >= 0) return this.path.at(s, out);
      this.path.at(0, out); out.x += out.tx * s; out.z += out.tz * s; return out;   // tail spills back past the entry
    }
  }
  SH.Queue = Queue;

  // ------------------------------------------------------------ ChairLift
  const SEAT_OFF = [-0.81, -0.27, 0.27, 0.81];
  const FILL = { 1: [1], 2: [1, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };

  class ChairLift {
    constructor(cfg, terrain, rng, speed) {
      this.cfg = cfg; this.v = speed; this.rng = rng;
      this.xUp = cfg.x - cfg.gauge / 2; this.xDn = cfg.x + cfg.gauge / 2;
      this.S = cfg.zBottom - cfg.zTop; this.arc = Math.PI * cfg.wheelR;
      this.len = 2 * this.S + 2 * this.arc;
      this.uLoad = cfg.zBottom - cfg.loadZ; this.uUnload = cfg.zBottom - cfg.unloadZ;
      // cable height profile: nodes sorted from the bottom station (large z) to the top (small z)
      const gB = terrain.h(cfg.x, cfg.loadZ) + cfg.stationH, gT = terrain.h(cfg.x, cfg.unloadZ) + cfg.stationH;
      this.nodes = [[cfg.zBottom + 4, gB], [cfg.loadZ - 3.5, gB]];
      for (const t of cfg.towers) this.nodes.push([t[0], terrain.h(cfg.x, t[0]) + t[1]]);
      this.nodes.push([cfg.unloadZ + 3.5, gT], [cfg.zTop - 4, gT]);
      this.chairs = [];
      for (let i = 0; i < cfg.chairs; i++) {
        const c = { i: i, u: (i + 0.37) * this.len / cfg.chairs, x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, yaw: 0, seats: [null, null, null, null], sway: 0 };
        this.posAt(c.u, c); c.px = c.x; c.py = c.y; c.pz = c.z;
        this.chairs.push(c);
      }
      this.call = null;            // { chair, members } while a group steps out to the load line
      this.planned = [];           // upcoming group sizes (so the camera director can look ahead)
      while (this.planned.length < 8) this.planned.push(rng.pick(cfg.groupSizes));
      this.loads = 0; this.unloads = 0;
    }
    cableY(z) {
      const n = this.nodes;
      if (z >= n[0][0]) return n[0][1];
      for (let i = 1; i < n.length; i++) {
        if (z >= n[i][0]) {
          const t = (n[i - 1][0] - z) / (n[i - 1][0] - n[i][0]);
          const flat = n[i - 1][1] === n[i][1];
          return n[i - 1][1] + (n[i][1] - n[i - 1][1]) * t - (flat ? 0 : 0.45 * 4 * t * (1 - t));   // a little sag between towers
        }
      }
      return n[n.length - 1][1];
    }
    // seat reference point (centre of the seat) and heading at loop distance u
    posAt(u, out) {
      const c = this.cfg, R = c.wheelR, S = this.S, arc = this.arc;
      u = ((u % this.len) + this.len) % this.len;
      if (u < S) { out.x = this.xUp; out.z = c.zBottom - u; out.yaw = Math.PI; }
      else if (u < S + arc) { const a = (u - S) / R; out.x = c.x - R * Math.cos(a); out.z = c.zTop - R * Math.sin(a); out.yaw = Math.atan2(Math.sin(a), -Math.cos(a)); }
      else if (u < 2 * S + arc) { out.x = this.xDn; out.z = c.zTop + (u - S - arc); out.yaw = 0; }
      else { const a = (u - 2 * S - arc) / R; out.x = c.x + R * Math.cos(a); out.z = c.zBottom + R * Math.sin(a); out.yaw = Math.atan2(-Math.sin(a), Math.cos(a)); }
      out.y = this.cableY(out.z) - c.hang;
      return out;
    }
    seatPos(chair, k, out) {
      const off = SEAT_OFF[k];
      out.x = chair.x + off * Math.cos(chair.yaw); out.z = chair.z - off * Math.sin(chair.yaw); out.y = chair.y;
      return out;
    }
    distToLoad(chair) { return ((this.uLoad - chair.u) % this.len + this.len) % this.len; }
    nextChair() {
      let best = null, bd = 1e9;
      for (const c of this.chairs) { const d = this.distToLoad(c); if (d < bd) { bd = d; best = c; } }
      return best;
    }
    // Who will share a chair soon? Returns [{members:[person...], eta}] for the next few chairs.
    forecast(queue) {
      const out = [], spacing = this.len / this.chairs.length, c = this.nextChair();
      let d = this.distToLoad(c);
      if (this.call || d < this.v * 2.3) d += spacing;         // that chair is already spoken for
      let idx = 0;
      for (let k = 0; k < this.planned.length && idx < queue.list.length; k++) {
        const n = Math.min(this.planned[k], queue.list.length - idx);
        out.push({ members: queue.list.slice(idx, idx + n), eta: (d + k * spacing) / this.v });
        idx += n;
      }
      return out;
    }
    step(dt, w) {
      const cfg = this.cfg, tmp = this._tmp || (this._tmp = {});
      for (const c of this.chairs) {
        c.px = c.x; c.py = c.y; c.pz = c.z;
        const u0 = c.u; c.u = (c.u + this.v * dt) % this.len;
        this.posAt(c.u, c);
        // unload at the top
        if (u0 < this.uUnload && c.u >= this.uUnload) {
          let any = false;
          for (let k = 0; k < 4; k++) if (c.seats[k] !== null) { w.go(w.byId[c.seats[k]], 'offload', { k: k }); c.seats[k] = null; any = true; }
          if (any) { this.unloads++; w.emit('clunk', c.x, c.y, c.z); }
        }
        // towers: a creak as a loaded chair rolls through the sheaves
        if (c.seats[1] !== null) for (const t of cfg.towers) if ((c.pz - t[0]) * (c.z - t[0]) < 0) w.emit('creak', c.x, c.y + 3, c.z);
      }
      const q = w.queues.lift, nc = this.nextChair(), d = this.distToLoad(nc);
      if (!this.call && d < this.v * 3.7 && d > this.v * 2.3) {
        let ready = 0;
        while (ready < q.list.length && ready < 4 && q.arrived(q.list[ready])) ready++;
        let n = Math.min(ready, this.planned[0]);
        for (let i = 0; i < Math.max(n, 1) && i < q.list.length; i++) {
          const a = q.list[i], b = a.partner; if (!b) continue;
          const bi = q.list.indexOf(b);
          if (bi >= 0 && bi < 7 && ready >= 1) { q.list.splice(q.list.indexOf(a), 1); q.list.splice(q.list.indexOf(b), 1); q.list.unshift(a, b); n = 2; }
          break;
        }
        if (n > 0) {
          this.planned.shift(); this.planned.push(this.rng.pick(cfg.groupSizes));
          const members = q.take(n), seats = FILL[n];
          for (let i = 0; i < n; i++) {
            this.seatPos({ x: this.xUp, y: 0, z: cfg.loadZ, yaw: Math.PI }, seats[i], tmp);
            w.go(members[i], 'toLoad', { x: tmp.x, z: tmp.z, seat: seats[i], buddies: n === 2 ? members[1 - i].id : -1 });
          }
          this.call = { chair: nc, members: members, seats: seats };
          w.emit('call', this.xUp, 0, cfg.loadZ);
        }
      }
      if (this.call && this.call.chair.u >= this.uLoad && this.call.chair.u < this.uLoad + 2) {
        const c = this.call.chair; let any = false;
        for (let i = 0; i < this.call.members.length; i++) {
          const p = this.call.members[i], k = this.call.seats[i];
          this.seatPos(c, k, tmp);
          if (Math.hypot(p.x - tmp.x, p.z - tmp.z) < 1.3) { c.seats[k] = p.id; w.go(p, 'ride', { chair: c, seat: k }); any = true; }
          else { q.joinFront(p); w.go(p, 'queue', { q: q, rejoin: true }); }    // missed it: back to the front of the line
        }
        if (any) { this.loads++; w.emit('clunk', c.x, c.y, c.z); }
        this.call = null;
      }
    }
  }
  SH.ChairLift = ChairLift;

  // ------------------------------------------------------------ Carpet (conveyor for the beginner meadow)
  class Carpet {
    constructor(cfg, speed) { this.x = cfg.x; this.zBottom = cfg.zBottom; this.zTop = cfg.zTop; this.v = speed; this.lastBoard = null; this.offset = 0; }
    step(dt, w) {
      this.offset += this.v * dt;                       // belt scroll, for the renderer
      const q = w.queues.carpet, p = q.list[0];
      if (p && q.arrived(p)) {
        const lb = this.lastBoard;
        if (!lb || lb.state !== 'carpet' || this.zBottom - lb.z > 2.3) { q.take(1); this.lastBoard = p; w.go(p, 'carpet'); }
      }
    }
  }
  SH.Carpet = Carpet;
})(globalThis.SH = globalThis.SH || {});
