// a00_config.js -- every tunable number, count, speed and palette lives here.
// Nothing in this file touches the DOM or three.js, so the sim can run in node.
(function (SH) {
  'use strict';

  SH.CONFIG = {
    seed: 20261110,
    dt: 1 / 60,                 // fixed simulation timestep (s)
    resortName: 'Pine Hollow',

    counts: {
      riders: 104,               // people on the ride-up / ski-down loop
      boarderFrac: 0.32,
      kidFrac: 0.14,            // small riders; they need a hand off the chair
      patrol: 2,
      schoolKids: 5,
      deckGuests: 9,
      builders: 3,
      sledders: 3
    },

    // The regulars: named characters with a small arc each. index = which rider slot they take (0 is the sled patroller).
    regulars: [
      { index: 0, key: 'bea',  name: 'Bea' },
      { index: 2, key: 'tom',  name: 'Old Tom', kind: 'ski',   skill: 0.98, wipe: 0,    look: { jacket: 0xff7b25, pants: 0xff7b25, hat: 0xf4f8fb, helmet: false, accent: 0x7c4dff, stripe: 0x15aabf } },
      { index: 3, key: 'rosa', name: 'Rosa',    kind: 'board', skill: 0.72, wipe: 0,    run: 'park', look: { jacket: 0xd6409f, pants: 0x23272e, hat: 0xffc233, helmet: true, accent: 0x15aabf, stripe: -1 } },
      { index: 4, key: 'nils', name: 'Nils',    kind: 'ski',   skill: 0.2,  wipe: 0.8,  run: 'main', look: { jacket: 0x9be15d, pants: 0x2b3a67, hat: 0xe63946, helmet: false, accent: 0xffc233, stripe: -1 } },
      { index: 5, key: 'gus',  name: 'Gus',     kind: 'ski',   skill: 0.55, wipe: 0.05, look: { jacket: 0x2f6fde, pants: 0x4a4e69, hat: 0x1d3557, helmet: true, accent: 0xf8f9fa, stripe: -1 } },
      { index: 6, key: 'june', name: 'June',    kind: 'ski',   skill: 0.55, wipe: 0.05, look: { jacket: 0xe5383b, pants: 0x4a4e69, hat: 0xf1faee, helmet: false, accent: 0xffc233, stripe: -1 } }
    ],

    // Skiing styles. A = turn half-width (m), L = distance per full S (m), v = cruise speed (m/s)
    styles: {
      expert:  { A: 6.0, L: 30, v: 9.8, turn: 2.6, wipe: 0.05 },
      inter:   { A: 5.6, L: 21, v: 7.0,  turn: 2.2, wipe: 0.14 },
      novice:  { A: 4.2, L: 13, v: 4.4,  turn: 1.7, wipe: 0.34 },
      kid:     { A: 3.6, L: 11, v: 3.9,  turn: 1.8, wipe: 0.30 },
      boarder: { A: 5.8, L: 24, v: 7.6,  turn: 2.3, wipe: 0.16 },
      mogul:   { A: 1.5, L: 6.4, v: 5.2, turn: 3.4 },
      school:  { A: 7.5, L: 17, v: 2.1,  turn: 1.6, wipe: 0.22 },
      patrol:  { A: 4.0, L: 24, v: 9.5,  turn: 2.6, wipe: 0 }
    },

    speeds: {
      walk: 1.45, skate: 2.3, carry: 1.3, kidWalk: 1.2,
      lift: 2.5, carpet: 1.15, snowcatUp: 2.1, snowcatDown: 2.9,
      gravity: 9.8, jumpPop: 3.6
    },

    lift: {
      x: 50, gauge: 4.4, zBottom: 58, zTop: -88, wheelR: 2.2,
      chairs: 34, seats: 4, hang: 3.0,
      loadZ: 49, unloadZ: -83,
      // [z, cable height above ground]; stations are flat at stationH
      towers: [[36, 8.0], [20, 9.0], [2, 9.2], [-16, 9.2], [-36, 9.2], [-56, 9.0], [-73, 7.6]],
      stationH: 3.6,
      groupSizes: [2, 3, 2, 4, 2, 3, 2, 3, 2, 2]   // weights for who shares a chair
    },

    director: {
      wide: { x: 4, z: 2, h: 134 },   // ground point looked at and view height in metres
      yaw: 0.56, pitch: 0.60,           // camera orbit (rad): yaw from +z toward +x, pitch above horizon
      wideDwell: [3.5, 6.0],
      travelIn: [2.2, 5.5],
      travelOut: 3.0,
      preRoll: 1.1,                     // arrive this long before the moment
      minHold: 4.0, maxHold: 15.0,
      closeH: 21
    },

    // Named colours (sRGB hex). Renderer converts; sim never reads these.
    palette: {
      snow: 0xf3f6fb, snowShade: 0xdfe8f6, pisteSnow: 0xffffff, packed: 0xe9edf2,
      rock: 0x6f7888, rockDark: 0x4f5766, pine: 0x1f5d4b, pineLight: 0x2f7a5c, pineDark: 0x174438,
      trunk: 0x5b3d2b, timber: 0x9a6340, timberDark: 0x6e4530, stone: 0x8d8a86, roofRed: 0xb23a36,
      steel: 0x3b4a52, steelLight: 0x72848e, liftTeal: 0x1f8f8a, liftYellow: 0xf5c23a,
      rope: 0xd94f3a, net: 0xf07a2a, deck: 0xb07b4f, glass: 0xffd98a, asphalt: 0x59606b,
      catRed: 0xd8362b, catDark: 0x2b2f36, gunYellow: 0xf2b21d, skin: [0xf2c7a5, 0xe2a57c, 0xc98a5f, 0x9a6845, 0x7a4f32],
      jackets: [0xe5383b, 0xff7b25, 0xffc233, 0x3fb950, 0x15aabf, 0x2f6fde, 0x7c4dff, 0xd6409f,
                0xf06595, 0x20c997, 0x9be15d, 0xf8f9fa, 0x343a40, 0x74c0fc, 0xb5179e, 0xfb8500],
      pants: [0x23272e, 0x2b3a67, 0x4a4e69, 0x5c5f66, 0x1b4332, 0x7f1d1d, 0x0b7285, 0xe9ecef, 0x6d597a],
      hats: [0xe63946, 0xffb703, 0x219ebc, 0x8338ec, 0x2a9d8f, 0xf1faee, 0x1d3557, 0xff006e, 0x06d6a0],
      skis: [0xe63946, 0x1d3557, 0xffb703, 0x2a9d8f, 0xf1faee, 0x8338ec, 0x111111, 0xff7b25],
      gloves: [0x23272e, 0x1d3557, 0x7f1d1d, 0x343a40, 0xf1faee, 0xffb703], boots: [0x23272e, 0x3a3f47, 0x4a2c2a, 0x1d3557, 0xdfe5ea],
      hair: [0x2b1d14, 0x5b3a1e, 0xa8672a, 0xe0b458, 0x1a1a1a, 0xb9482e], hiVis: 0xd4f000,
      patrolRed: 0xd0021b, instructorBlue: 0x1c7ed6, attendant: 0x0b7285, vendor: 0x7f4f24,
      seats: [0xe5383b, 0xffc233, 0x15aabf, 0x3fb950]
    },

    // Time-of-day keyframes the light slowly drifts through (loop). Colours are sRGB hex.
    dayCycle: {
      period: 420,            // seconds for a whole day at ?dayspeed=1
      start: 0.30,            // time of day the page opens at (0..1); ?tod= overrides (number, or dawn/morning/noon/golden/dusk/night)
      names: { dawn: 0.055, morning: 0.2, noon: 0.38, golden: 0.635, dusk: 0.70, night: 0.86 },
      // sun: colour/intensity/azimuth/elevation (it doubles as the moon at night). night: 0..1 drives floodlights and headlamps.
      // tint/sat/con/bloom/blur feed the post-processing grade.
      keys: [
        { t: 0.000, sun: 0x9db4ff, sunI: 0.0, sky: 0x4c5f9c, ground: 0x3a4670, hemiI: 0.50, az: -1.25, el: 0.10, fog: 0x2a3560, night: 1.0, tint: 0xd6dcff, sat: 0.92, con: 1.06, bloom: 1.25 },
        { t: 0.055, sun: 0xff9d7a, sunI: 2.3, sky: 0x9aa6e8, ground: 0xe7b8c8, hemiI: 0.95, az: -1.22, el: 0.20, fog: 0xe9c3cf, night: 0.25, tint: 0xffe6ea, sat: 1.12, con: 1.04, bloom: 0.9 },
        { t: 0.160, sun: 0xfff1d6, sunI: 3.1, sky: 0xbcd6ff, ground: 0xdfe7ff, hemiI: 1.50, az: -0.98, el: 0.58, fog: 0xcfe4f7, night: 0.0, tint: 0xfffaf2, sat: 1.08, con: 1.03, bloom: 0.55 },
        { t: 0.380, sun: 0xffffff, sunI: 3.3, sky: 0xc4dcff, ground: 0xe6ecff, hemiI: 1.55, az: -0.45, el: 0.82, fog: 0xd6e9f8, night: 0.0, tint: 0xffffff, sat: 1.08, con: 1.03, bloom: 0.5 },
        { t: 0.540, sun: 0xfff0d2, sunI: 3.2, sky: 0xc2d2ff, ground: 0xe9e2f6, hemiI: 1.45, az: 0.20, el: 0.60, fog: 0xdde4f4, night: 0.0, tint: 0xfff8ee, sat: 1.08, con: 1.03, bloom: 0.55 },
        { t: 0.635, sun: 0xffb469, sunI: 3.0, sky: 0xb7b4f0, ground: 0xf0c8c0, hemiI: 1.10, az: 0.78, el: 0.24, fog: 0xf1cdb8, night: 0.1, tint: 0xffeeda, sat: 1.16, con: 1.05, bloom: 0.85 },
        { t: 0.700, sun: 0xff7e62, sunI: 0.9, sky: 0x8a86d8, ground: 0xc08cae, hemiI: 0.80, az: 0.98, el: 0.10, fog: 0x9a80b4, night: 0.7, tint: 0xf2dcf0, sat: 1.06, con: 1.05, bloom: 1.1 },
        { t: 0.735, sun: 0x9db4ff, sunI: 0.0, sky: 0x55609e, ground: 0x4a4a7c, hemiI: 0.55, az: 0.98, el: 0.10, fog: 0x3a3f70, night: 1.0, tint: 0xdce0ff, sat: 0.95, con: 1.06, bloom: 1.25 },
        { t: 0.750, sun: 0x9db4ff, sunI: 0.0, sky: 0x4c5f9c, ground: 0x3a4670, hemiI: 0.50, az: -0.60, el: 0.72, fog: 0x2a3560, night: 1.0, tint: 0xd6dcff, sat: 0.92, con: 1.06, bloom: 1.3 },
        { t: 0.790, sun: 0x9db4ff, sunI: 0.62, sky: 0x4c5f9c, ground: 0x3a4670, hemiI: 0.50, az: -0.60, el: 0.72, fog: 0x2a3560, night: 1.0, tint: 0xd6dcff, sat: 0.92, con: 1.06, bloom: 1.3 },
        { t: 0.950, sun: 0x9db4ff, sunI: 0.62, sky: 0x4c5f9c, ground: 0x3a4670, hemiI: 0.50, az: -0.40, el: 0.66, fog: 0x2a3560, night: 1.0, tint: 0xd6dcff, sat: 0.92, con: 1.06, bloom: 1.3 },
        { t: 0.985, sun: 0x9db4ff, sunI: 0.0, sky: 0x4c5f9c, ground: 0x3a4670, hemiI: 0.50, az: -0.40, el: 0.66, fog: 0x2a3560, night: 1.0, tint: 0xd6dcff, sat: 0.92, con: 1.06, bloom: 1.25 },
        { t: 1.000, sun: 0x9db4ff, sunI: 0.0, sky: 0x4c5f9c, ground: 0x3a4670, hemiI: 0.50, az: -1.25, el: 0.10, fog: 0x2a3560, night: 1.0, tint: 0xd6dcff, sat: 0.92, con: 1.06, bloom: 1.25 }
      ]
    },
    post: { blur: 4.2, focusBand: [0.22, 0.6], bloomThreshold: 0.93, bloomGain: 0.75, vignette: 0.22 },

    // Audio: every file is played as supplied (no filters, no pitch changes); gain is plain volume.
    audio: {
      master: 0.9,
      music: { files: ['music_enchanted_forest.mp3', 'music_undefined.mp3'], gain: 0.34 },
      beds: {
        wind:  { file: 'amb_cold_day.ogg', gain: 5.0 },
        wind2: { file: 'amb_winter_wind.ogg', gain: 2.2 },
        lift:  { file: 'lift_windmill_loop.ogg', gain: 3.2, at: [48, 54], radius: 30 },
        liftTop: { file: 'lift_windmill_loop.ogg', gain: 3.2, at: [48, -84], radius: 30 },
        fire:  { file: 'fire_loop.wav', gain: 1.6, at: [-30, 60], radius: 16 }
      },
      // event -> files (one picked per event), base gain, min seconds between plays
      events: {
        swish:   { files: ['swish_1.wav', 'swish_2.wav', 'swish_3.wav', 'swish_4.wav'], gain: 0.5, every: 0.16 },
        carve:   { files: ['cloth_1.wav', 'cloth_2.wav'], gain: 1.6, every: 0.3 },
        fall:    { files: ['thump_1.wav'], gain: 0.5, every: 0.4 },
        getup:   { files: ['jacket_1.wav', 'jacket_2.wav'], gain: 1.3, every: 0.5 },
        takeoff: { files: ['whoosh_1.wav', 'whoosh_2.wav'], gain: 0.5, every: 0.3 },
        land:    { files: ['thump_2.wav'], gain: 0.5, every: 0.3 },
        clunk:   { files: ['clunk_1.wav', 'clunk_2.wav'], gain: 0.42, every: 0.8 },
        creak:   { files: ['creak_1.wav', 'creak_2.wav'], gain: 1.4, every: 1.5 },
        step:    { files: ['step_1.wav', 'step_2.wav', 'step_3.wav', 'step_4.wav'], gain: 0.55, every: 0.21 },
        cup:     { files: ['cup_1.wav', 'cup_2.wav', 'cup_3.wav'], gain: 0.4, every: 0.5 },
        coins:   { files: ['coins_1.wav', 'coins_2.wav'], gain: 0.35, every: 0.8 },
        shovel:  { files: ['shovel_1.wav', 'shovel_2.wav'], gain: 0.6, every: 0.5 },
        cheer:   { files: ['cheer_1.ogg', 'cheer_2.ogg'], gain: 0.8, every: 2.5 },
        gun:     { files: ['spray_1.wav', 'spray_2.wav'], gain: 0.22, every: 2.2 },
        gust:    { files: ['gust_1.ogg', 'gust_2.ogg'], gain: 2.6, every: 6 }
      },
      credits: ''
    }
  };
})(typeof globalThis !== 'undefined' ? (globalThis.SH = globalThis.SH || {}) : (window.SH = window.SH || {}));
