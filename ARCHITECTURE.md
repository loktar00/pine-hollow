# Pine Hollow - architecture

A living ski hill: about 125 people on one continuous loop (ski down, skate across the base, queue,
ride the quad up, step off, ski again) plus a ski school, snowman builders, a lodge deck, a hot-chocolate
stand, ski patrol, a snowcat and snow guns. Nothing here is gameplay yet; everything is laid out so
gameplay can be added without restructuring.

## Layers

    src/a0x  SIMULATION   pure JS, no DOM, no three.js, no wall clock. Runs in node (see test/).
    src/r1x  PRESENTATION three.js render, camera, particles, audio, boot. Reads sim state, never writes it.

`build.py` concatenates `src/a*.js` then `src/r*.js` and inlines three.js r158 into `dist/index.html`.
Audio stays as plain files in `audio/` while developing; `tools/scramble_audio.py` embeds them into the built page.

| file | what it owns |
|---|---|
| `a00_config.js` | every tunable: counts, speeds, skiing styles, lift geometry, director timings, palettes, day cycle, audio map |
| `a01_util.js` | seeded RNG (mulberry32), noise, `Path` (arc-length polyline) |
| `a02_terrain.js` | `SH.LAYOUT` (where everything is), run centre lines, the slope function, baked heightfield `terrain.h(x,z)` |
| `a03_lift.js` | `Queue`, `ChairLift` (chairs, boarding calls, unload, look-ahead `forecast`), `Carpet` |
| `a04_people.js` | person factory, `SH.states` (the state table), `SH.brains` (what next, per role) |
| `a05_actors.js` | `Snowcat`, `SnowGuns`, `Stand`, `School`, `SnowmanProject` |
| `a06_sim.js` | `World`: owns everything, `step()` advances one fixed tick, `emit()` posts events |
| `a07_director.js` | `SH.STORIES` + `Director`: picks shots, times its arrival, outputs a view `{x,y,z,h}` |
| `r10_core.js` | renderer setup, static mesh `Builder`, instanced `Batch`, matrix helper |
| `r11_world.js` | terrain mesh, forest, every building and prop (static, merged) |
| `r12_actors.js` | pose table + rigs for people, chairs, snowcat, snowmen (all instanced boxes and balls) |
| `r13_fx.js` | particles, snowfall, the ski-track / corduroy texture |
| `r14_audio.js` | sample playback from sim events, scheduled on the sim clock |
| `r14_post.js` | tilt-shift, bloom, edge smoothing and the time-of-day colour grade |
| `r15_main.js` | boot, fixed-step loop, camera from the director view, input, HUD |

## Simulation rules

- Fixed timestep `CONFIG.dt` (1/60 s). `world.step()` is the only thing that moves time. The page runs
  0..5 steps per frame and interpolates poses between the last two ticks.
- One seeded RNG (`world.rng`) drives every decision, so a seed replays exactly (the test checks this).
  A second RNG picks clothes so cosmetics never disturb behaviour.
- Continuity: a person is one object for the whole session. A state may only change position by
  `velocity * dt` (helpers `adv`, `moveTo`) or by adding the displacement of whatever carries them
  (chair, carpet). State changes happen where the previous state left them. Height is the ground under
  them unless the state is marked `free` (airborne, on a chair), where it is integrated too.
  `test/sim.test.js` fails if anyone moves faster than 26 m/s in any tick.
- People are data + a state name. `SH.states[name] = { enter(p, world, arg), step(p, world, dt), free? }`.
  A state ends by calling `world.go(p, next, arg)`, by running the next step of `p.errand`
  (a list of `[state, arg]`), or by asking its brain (`SH.brains[role]`) what to do.
- The sim announces intent, not just results: a wipe-out position is planned when a run starts, the lift
  plans the next group sizes. That is what lets the camera arrive before the moment.

## Camera director

`SH.STORIES` is a list of detectors. Each returns candidate shots: `{eta, focus(), moment(), done(), h, caption}`.
`eta` is seconds until the key moment (or `null` for "any time"). The director picks a weighted random
candidate whose eta fits its travel window, eases there so it is framed about a second early, tracks the
subject, holds until `done()`, pulls back, dwells, picks again. It logs each shot (`director.log`) with
whether it caught the moment; the test requires 85 percent.
Add a story by pushing one object to `SH.STORIES`.

## Day, regulars, grammar

- `CONFIG.dayCycle` keys drive sun/moon, sky, fog, floodlights (`night`) and the grade; time of day is a pure function of sim time.
- `CONFIG.regulars` names a few riders; their counters (`p.reg`) are updated by the sim and shown by `SH.regularLine`. The director weights any shot about a regular about 3x.
- The director can cut (flagged by `director.cut`), run a reaction cutaway to witnesses (`director.react`), follow a whole run, and replay a big jump from a short tape of per-step copies (`director.replay`), which the renderer draws in place of the live people.
- `RECORDING.md` covers URL parameters, the frame hook and how audio is scheduled.

## Rendering choice

Real 3D (three.js, WebGL2) with an orthographic isometric camera, low-poly models and one soft shadow map,
rather than pre-drawn 2D sprites. Reasons: the director zooms more than 10x and sprites drawn for the wide
view turn to mush up close; real geometry stays crisp at every zoom; sun shadows, depth haze and the
time-of-day drift come for free; and people are posed procedurally (about 35 instanced boxes each), so new
behaviours need no new art. Everything static is merged into a few meshes and everything moving is two
instanced meshes, so a frame is about 12 draw calls.

Windows / D3D11 safety: textures are sampled only in fragment shaders, all vertex attributes are floats,
no uniform arrays are indexed in vertex shaders, no skinned meshes, render size capped near 2 MP, and a
visible message on context loss.

## Opening the door to a game

- Player control: add a state (say `player`) whose `step` steers from input instead of a target, and
  `world.go(person, 'player')`. Everything else (lift, queue, falls, camera stories) already works on it.
- Placement / building: props come from `SH.LAYOUT`; the lift is built from `CONFIG.lift`, runs from
  `LAYOUT.runs`. Make those mutable and rebuild the affected mesh.
- Economy: `Stand.served`, `lift.loads`, queue lengths and wait times are already counted in the sim;
  hang prices and satisfaction off those.
- Save / replay: seed + tick count reproduces the world today; add an input log for a player.

## Checks

    node test/sim.test.js                  # behaviour tests (continuity, loop, director, determinism)

