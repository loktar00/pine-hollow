// Behaviour tests for the simulation (no browser). Run: node test/sim.test.js
//   1. continuity  - nobody ever teleports: per fixed step every person moves less than a hard speed cap
//   2. the loop    - chairs load and unload, riders keep coming down, 20+ people are always mid-action
//   3. director    - the camera director keeps cycling through varied stories and arrives before timed moments
//   4. determinism - same seed, same world
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = path.join(__dirname, '..', 'src');
for (const f of fs.readdirSync(src).filter(f => /^a\d\d_.*\.js$/.test(f)).sort()) vm.runInThisContext(fs.readFileSync(path.join(src, f), 'utf8'), { filename: f });
const SH = globalThis.SH;

let failed = 0;
const check = (name, ok, info) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!ok) failed++; };

const MINUTES = +(process.argv[2] || 12), STEPS = Math.round(MINUTES * 60 * 60);
const w = new SH.World(), d = new SH.Director(w);
const MAX_STEP = 26 * w.dt;            // 26 m/s is faster than anything in the scene; a teleport is far larger
let camWho = '', worst = 0, worstWho = '', nan = 0, minBusy = 1e9, minSlope = 1e9, camWorst = 0;
const runsDone = new Map(), last = new Map(), states = new Set();
const busy = new Set(['ski', 'fall', 'air', 'travel', 'ride', 'toLoad', 'offload', 'carpet', 'respond', 'assist', 'builder']);
let pv = Object.assign({}, d.view);
for (let i = 0; i < STEPS; i++) {
  w.step(); d.step(w.dt); w.events.length = 0;
  let nBusy = 0, nSlope = 0;
  for (const p of w.people) {
    const dist = Math.hypot(p.x - p.px, p.y - p.py, p.z - p.pz);
    if (!(dist === dist) || !isFinite(p.heading)) nan++;
    if (dist > worst) { worst = dist; worstWho = `#${p.id} ${p.role} ${last.get(p.id)}->${p.state} t=${w.time.toFixed(2)}`; }
    if (last.get(p.id) === 'ski' && p.state !== 'ski' && p.state !== 'fall' && p.state !== 'air' && p.state !== 'respond') runsDone.set(p.id, (runsDone.get(p.id) || 0) + 1);
    last.set(p.id, p.state); states.add(p.state);
    if (busy.has(p.state) && (p.speed > 0.2 || p.free || p.state === 'fall')) nBusy++;
    if (p.state === 'ski' || p.state === 'fall' || p.state === 'air') nSlope++;
  }
  { const s = w.sled, ds = Math.hypot(s.x - s.px, s.y - s.py, s.z - s.pz); if (ds > worst) { worst = ds; worstWho = 'sled t=' + w.time.toFixed(2); } }
  if (i > 600) { minBusy = Math.min(minBusy, nBusy); minSlope = Math.min(minSlope, nSlope); }
  // the camera itself must glide too: no cuts (relative to how much ground is in view)
  const v = d.view, cm = Math.hypot(v.x - pv.x, v.y - pv.y, v.z - pv.z) / v.h;
  if (!d.cut && cm > camWorst) { camWorst = cm; camWho = `${d.mode} ${d.shot && d.shot.type} t=${w.time.toFixed(2)} dt=${d.t.toFixed(2)} T=${d.T}`; }
  pv = Object.assign({}, v);
}
check('continuity: no teleports', worst <= MAX_STEP && nan === 0, `worst step ${worst.toFixed(3)} m (cap ${MAX_STEP.toFixed(3)}) ${worstWho}, NaN ${nan}`);
check('camera: no cuts', camWorst < 0.02, `worst per-step move ${(camWorst * 100).toFixed(2)}% of view height (${camWho})`);
const riders = w.people.filter(p => p.role === 'rider' || p.role === 'patrol');
const lapped = riders.filter(p => runsDone.get(p.id) > 0).length;
check('loop: lift loads and unloads', w.lift.loads > MINUTES * 4 && w.lift.unloads > MINUTES * 4, `loads ${w.lift.loads}, unloads ${w.lift.unloads}`);
check('loop: riders keep finishing runs', lapped >= riders.length * 0.9, `${lapped}/${riders.length} riders finished a run`);
check('loop: 20+ people always mid-action', minBusy >= 20, `min busy ${minBusy}, min on the slope ${minSlope}`);
check('life: school, cocoa, snowman, patrol all happen', w.school.laps > 0 && w.stand.served > 0 && w.snowman.built > 0 && states.has('assist') && states.has('air'),
  `school laps ${w.school.laps}, cocoa served ${w.stand.served}, snowmen ${w.snowman.built}, snowcat laps ${w.cat.laps}, states ${[...states].join(',')}`);
const types = new Set(d.log.map(e => e.type)), timed = d.log.filter(e => e.timed && e.arrivedLead !== null), caught = timed.filter(e => e.caught).length;
const missed = d.log.filter(e => e.timed && e.arrivedLead === null).length;
check('director: cycles', d.cycles >= MINUTES * 2.5, `${d.cycles} shots in ${MINUTES} min`);
check('director: variety', types.size >= 7, [...types].join(','));
check('director: arrives before the moment', timed.length > 0 && caught / (timed.length + missed) >= 0.85, `${caught} caught of ${timed.length + missed} timed (${missed} never happened)`);
const reg = (k) => w.regulars.find(p => p.reg.key === k).reg;
check('regulars: six arcs move', w.regulars.length === 7 && reg('tom').laps > 0 && reg('gus').chairs > 0 && reg('rosa').best > 0 && reg('nils').falls > 0 && reg('pip').laps > 0,
  w.regulars.map(p => p.reg.name + ': ' + SH.regularLine(p)).join(' | '));
check('director: reaction cuts and replays', d.reactions > 0 && d.replays > 0, `${d.reactions} reaction cuts, ${d.replays} replays; sled runs ${w.sledRuns}, queue slips ${w.slips}, snowball hits ${w.snowman.hits}`);
const byType = {}; for (const e of d.log) byType[e.type] = (byType[e.type] || 0) + 1;
console.log('     shots by type', JSON.stringify(byType));

const sum = (seed) => { const a = new SH.World(seed); for (let i = 0; i < 3600; i++) { a.step(); a.events.length = 0; } return a.people.reduce((s, p) => s + p.x * 3 + p.z * 7 + p.y, 0); };
const s1 = sum(7), s2 = sum(7), s3 = sum(8);
check('determinism: same seed, same world', s1 === s2 && s1 !== s3, `${s1.toFixed(6)} vs ${s2.toFixed(6)}; other seed ${s3.toFixed(6)}`);
process.exit(failed ? 1 : 0);
