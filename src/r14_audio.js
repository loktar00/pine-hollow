// r14_audio.js -- sound. Every sample is played as-is, with
// no processing: no filters, no pitch shifting, no synthesis. One sample per sim event (edge-triggered),
// rate-limited per event type, with plain volume + stereo position from where the camera is looking.
(function (SH) {
  'use strict';
  const CFG = SH.CONFIG.audio, U = SH.util;
  const fin = (v, d) => (isFinite(v) ? v : d);

  class Audio {
    constructor(base) { this.base = base || 'audio/'; this.ctx = null; this.buf = {}; this.last = {}; this.beds = {}; this.ready = false; this.muted = false; this.voices = 0; this.played = 0; this.musicI = 0; this.failed = []; this.rnd = U.makeRng(0xa0d10); this.log = []; this.t0 = 0; }
    // simTime: the sim clock at the moment sound starts; every later sample is scheduled at t0 + sim time,
    // so under an offline (or stepped) AudioContext the mix is sample-exact against the frames.
    async start(simTime) {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ctx = this.ctx = new AC(); this.musicAt = 1e18;
      this.master = ctx.createGain(); this.master.gain.value = CFG.master; this.master.connect(ctx.destination);
      const names = new Set(CFG.music.files);
      for (const k in CFG.beds) names.add(CFG.beds[k].file);
      for (const k in CFG.events) for (const f of CFG.events[k].files) names.add(f);
      await Promise.all([...names].map(async (n) => {
        try { const r = await fetch(this.base + n); if (!r.ok) throw new Error(r.status); this.buf[n] = await ctx.decodeAudioData(await r.arrayBuffer()); }
        catch (e) { this.failed.push(n); }
      }));
      for (const k in CFG.beds) {
        const b = CFG.beds[k], buf = this.buf[b.file]; if (!buf) continue;
        const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = buf; src.loop = true; g.gain.value = b.at ? 0 : b.gain;
        src.connect(g); g.connect(this.master); src.start(0, this.rnd() * buf.duration);
        this.beds[k] = { g: g, cfg: b };
      }
      this.ready = true; this.sync(typeof simTime === 'function' ? simTime() : simTime || 0);
    }
    // line the audio clock up with the sim clock; music restarts its schedule from here
    sync(simTime) { this.t0 = this.ctx.currentTime - simTime; this.musicAt = simTime; }
    nextTrack() {
      const files = CFG.music.files, buf = this.buf[files[this.musicI % files.length]]; this.musicI++;
      if (!buf) return;
      const src = this.ctx.createBufferSource(), g = this.ctx.createGain(); src.buffer = buf; g.gain.value = CFG.music.gain;
      src.connect(g); g.connect(this.master); src.start(Math.max(this.ctx.currentTime, this.t0 + this.musicAt));
      this.log.push({ t: +this.musicAt.toFixed(4), file: files[(this.musicI - 1) % files.length], gain: CFG.music.gain });
      this.musicAt += buf.duration + 2.5;        // the next track is due on the sim clock, not on a timer
    }
    setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : CFG.master; }
    // view = {x,z,h}; yaw = camera yaw. Close-ups are loud and local, the wide shot is mostly air and music.
    update(events, view, yaw, aspect, time) {
      if (!this.ready) { if (events.length) for (let i = 0; i < events.length; i++) this.rnd(); return; }
      const ctx = this.ctx, zoom = U.clamp(34 / fin(view.h, 150), 0.16, 1.5), reach = fin(view.h, 150) * 0.75 + 6;
      if (time >= this.musicAt) this.nextTrack();
      for (const k in this.beds) {
        const b = this.beds[k]; if (!b.cfg.at) continue;
        const d = Math.hypot(b.cfg.at[0] - view.x, b.cfg.at[1] - view.z);
        b.g.gain.setTargetAtTime(fin(b.cfg.gain * zoom / (1 + Math.pow(d / b.cfg.radius, 2)), 0), ctx.currentTime, 0.25);
      }
      // an occasional gust rides over the wind bed
      if (time > (this.gustAt || 6)) { this.gustAt = time + 9 + this.rnd() * 9; events.push({ type: 'gust', x: view.x, y: 0, z: view.z, a: 0 }); }
      for (const e of events) {
        const c = CFG.events[e.type]; if (!c) continue;
        if (time - (this.last[e.type] || -99) < c.every || this.voices >= 14) continue;
        const dx = e.x - view.x, dz = e.z - view.z, d = Math.hypot(dx, dz);
        const gain = fin(c.gain * zoom / (1 + Math.pow(d / reach, 2) * 3), 0);
        if (gain < 0.035) continue;
        const file = c.files[Math.floor(this.rnd() * c.files.length)], buf = this.buf[file]; if (!buf) continue;
        this.last[e.type] = time;
        const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = buf; g.gain.value = Math.min(gain, 4);
        let out = g;
        if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = U.clamp(fin((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / (view.h * aspect * 0.5), 0), -1, 1) * 0.7; g.connect(p); out = p; }
        src.connect(g); out.connect(this.master);
        this.voices++; this.played++; src.onended = () => { this.voices--; }; src.start(Math.max(ctx.currentTime, this.t0 + time));
        if (this.log.length < 20000) this.log.push({ t: +time.toFixed(4), file: file, gain: +g.gain.value.toFixed(3) });
      }
    }
  }
  SH.Audio = Audio;
})(globalThis.SH = globalThis.SH || {});
