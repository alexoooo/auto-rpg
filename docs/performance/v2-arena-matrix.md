# v2 arena foreground matrix

**Purpose:** Hold everything the v2-ui arena series owes a person at a visible browser — the frame times, the visual judgements and the two by-hand checks — with the procedure that takes them and the reason no agent can.
**Status:** current
**Canonical source:** this document, the `?stage` modes in `client/src/arena/arena.ts`, and the [performance evidence index](README.md#performance-evidence)
**Update when:** A foreground number is taken, a visual judgement is recorded, the probe modes or their procedure change, or the arena picker gains a dimension control.

Every number below is blank, and every blank is deliberate. The rule this document
exists to hold is the repository's own: **quote the range and name the pass, never a
single figure.** A measured figure names its method; a blank is honest, and an estimate
in place of a blank is not. Nothing here was skipped. All of it is blocked on a browser
that an agent on this machine cannot reach, and the difference between those two words is
what the first section is for.

## Why these are blocked rather than skipped

**An automated tab on this machine receives no animation frames at all.** A
Claude-in-Chrome tab is always `visibilityState: "hidden"`, and a hidden tab here got not
a throttled loop but no loop: a probe waiting on seven consecutive
`requestAnimationFrame` callbacks never resolved in forty-five seconds, and playback sat
on its starting tick throughout. This is sharper than the throttle AGENTS.md warns about,
and it is not a pessimistic reading to be sharpened by a longer sample — there is no
sample. There is no version of an agent session that produces these numbers, and
inventing one would be worse than not having them.

**The corollary is worth knowing, because it bounds the damage.** Only the things that
need the loop are unreachable. `#/arena` scrubs synchronously out of its input handler,
so every panel, label, contact marker and control on the route *was* checked from an
automated tab: the plan and elevation panels, the chart, the three viewport labels, the
contact colours at a named tick reached from two directions, the mode round trip. The
frame time is the one thing that was not.

The alternation the paired mode depends on is therefore checked in Node instead, by
`the_paired_frame_probe_advances_one_tick_a_frame_instead_of_reading_the_clock` in
`client/test/studio-shell.test.mjs`, against the shell harness's fake
`requestAnimationFrame`. The browser confirmed only that the mode builds, labels itself
and leaves the controls working.

This is why v2-ui-03 closed `revise` rather than `pass`: its own criterion named the
agreement check *and* both frame times, half of that criterion is unreachable from where
an agent stands, and a blocked criterion is not a pass even when everything an agent can
reach is green.

## Measurement procedure

Two query modes exist for this measurement, and each answers a different one of
AGENTS.md's probe rules.

- **`#/arena?stage=off` removes the work rather than hiding it.** It builds no engine and
  no scene while leaving the plan, the elevation, the chart and the whole transport
  untouched — confirmed by the canvas still answering `getContext("2d")`, which a canvas
  that had ever held a GPU context cannot do. The label under the 3/4 panel names the
  mode. This is the whole-page floor.
- **`#/arena?stage=paired` compares paired frames rather than paired runs.** It draws the
  three viewports on every other animation frame while everything else draws on all of
  them, so the two configurations interleave inside one run, over one scene, a single
  tick apart. This is the mode to take the number in; the plain route is what the number
  describes. The label reads `paired-frame probe, viewports on alternate frames`, so a
  number taken here cannot be mistaken for the shipped frame time.

**In paired mode playback advances one tick per animation frame and ignores the Speed
control.** That is not a convenience. At 1x on a 120 Hz display the wall-clock carry
advances the tick on every *other* frame — which is the alternation's own period,
phase-locked to it — so every drawn frame would land in one population and the difference
would come back as the whole page or as none of it.

**Neither mode can be driven from the console.** The arena is an ES module graph and
nothing of it is reachable from `window`, which is exactly what makes the legacy page's
reassignable top-level functions a workable profiling method there and not here. The mode
has to be a page change, and it is.

### The probe

The same snippet each time; only the URL and the button press change. Run it in a normal
focused Chrome window with `npm run view` serving.

```js
(async () => {
  if (document.visibilityState !== "visible") throw new Error("focus the tab; a hidden tab is not a measurement");
  const d = []; let last = 0;
  await new Promise((done) => {
    const tick = (now) => { if (last) d.push(now - last); last = now;
      if (d.length < 900) requestAnimationFrame(tick); else done(); };
    requestAnimationFrame(tick);
  });
  // Split by parity, which is what makes it paired: on `?stage=paired` one of the two
  // populations drew the viewports and the other did not, and which is which does not
  // need saying because the slower one is the one that did.
  const q = (v, p) => +[...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)].toFixed(2);
  const side = (v) => ({ n: v.length, p50: q(v, 0.5), p95: q(v, 0.95), p99: q(v, 0.99),
                         over16_67: v.filter((x) => x > 16.67).length });
  const even = d.filter((_, i) => i % 2 === 0); const odd = d.filter((_, i) => i % 2 === 1);
  console.log({ all: side(d), even: side(even), odd: side(odd),
                pairedDelta: +(q(odd, 0.5) - q(even, 0.5)).toFixed(2) });
})();
```

### The five steps

1. Open `http://localhost:5173/#/arena`. Wait for the fight. Set **Span 6**,
   **Azimuth 0**, **Speed 1x**, scrub to **tick 800**, press **Play**, and leave the
   window focused and frontmost. Run the probe. This is the **baseline**: read `all` and
   ignore the parity split.
2. Open `http://localhost:5173/#/arena?stage=paired` — same span, azimuth and starting
   tick, playing; Speed is ignored here. Run the probe. `|pairedDelta|` **is the cost of
   the three viewports**, on one scene, in one run.
3. If both populations sit on the vsync interval the panels cost less than the headroom.
   Take that as the answer only after removing headroom: enlarge the window, or raise the
   density cap in `createArenaStage`, until the shipped configuration leaves 16.67 ms and
   the control does not. See the failure modes below before believing a zero.
4. Optionally repeat step 1 with `?stage=off` for the whole-page floor, and with
   `?backend=webgl2` to price the WebGPU path against the fallback.
5. **Repeat step 1 exactly**, last, and check it reproduces the first triple. A run whose
   baseline drifted between its ends measured the machine rather than the page.

### The mode comparison

`[Texture]` against `[Geometry]` is the same procedure with the mode press added, and it
has to be shaped differently in one respect: `?stage=paired` alternates the *viewports*
while the mode is a property of the scene, so the two configurations are one page load
apart rather than one frame apart. The comparison is therefore **two paired runs, each
internally controlled, plus the baseline repeated at the end.**

1. `http://localhost:5173/#/arena?stage=paired`. Wait for the fight. Leave **Span** and
   **Azimuth** at whatever the page opened on — it picks them from the recording's first
   frame, which is Span 15 on this fixture, and the two runs have to be at the same
   framing rather than at a memorable one. Scrub to **tick 800**, leave `[Geometry]`
   pressed, press **Play**, window focused and frontmost. Run the probe. Record `all` and
   `pairedDelta` — the cost of the three viewports in `[Geometry]`.
2. Same page, press **[Texture]**, wait for the label under the 3/4 panel to say
   `authored room` rather than `procedural floor`, scrub back to **tick 800**, press
   **Play**. Run the probe. Record `all` and `pairedDelta` — the same three viewports with
   the room, the lights and the shadow map.
   **The difference between the two `pairedDelta`s is what the dress costs.**
3. The headroom check of step 3 above applies unchanged.
4. Optionally `?stage=paired&backend=webgl2`, to price the WebGPU path against the
   fallback under a shadow map.
5. **Repeat step 1 exactly**, last, as the control.

### Two documented failure modes

- **Both populations on the vsync interval.** The panels cost less than the headroom, and
  the number is a floor rather than a cost. Remove headroom — a larger window, or a
  higher density cap in `createArenaStage` — before believing a zero.
- **Both populations equally inflated.** The driver is pipelining a frame's GPU work into
  the next interval and the alternation is too fast to separate them. This is a
  recognisable failure rather than a wrong answer, and it should be reported as one. The
  honest fallback is a `?stage=off` run against the baseline, back to back, both repeated.

## Foreground performance record

Every cell is pending. Nothing here may be filled from an automated tab, and a filled
cell must name the pass it came from.

| Field | Required record |
|---|---|
| GPU | pending foreground capture |
| Browser build | pending foreground capture |
| `[Geometry]` frame time, p50 / p95 / p99 | pending foreground capture |
| `[Geometry]` `pairedDelta` — the three viewports | pending foreground capture |
| `[Texture]` frame time, p50 / p95 / p99 | pending foreground capture |
| `[Texture]` `pairedDelta` — the same three viewports with the room, the lights and the shadow map | pending foreground capture |
| Difference between the two `pairedDelta`s — what the dress costs | pending foreground capture |
| Step 1 repeated last, as the trailing control | pending foreground capture |

**Why the comparison is worth having.** Shadow casting is the plausible regression.
As v2-ui-03 recorded it: `[Texture]` puts roughly **28 nodes a body** in the caster list,
plus **84 room walls**, into a 1024-square shadow map, and `[Geometry]` casts nothing at
all, because it has no light. Whether that is a knob to turn or a cost nobody can see is
the question these eight cells answer.

`render/performance.ts` does not fit and was examined: `copyMetadata` hard-validates the
fixed greybox fixture — an exact 1920 x 1080 surface, `fixtureSeed 1592594996`,
`population 64`, `roomWidth 48`, `roomHeight 32` — and refuses anything else. Capturing
the arena through that harness would need a third performance schema beside
`PERFORMANCE_SCHEMA_VERSION` and `ROOM_PERFORMANCE_SCHEMA_VERSION`, with the pinned
artifacts in `docs/performance/` that implies. That is a session of its own.

## Owed visual judgements

Three, and none of them is an agent's call.

- **The authored silhouette judgement.** The combatant asset now has a deterministic
  Blender game-camera preview and four-angle turntable, and fail-closed metrics defend
  shoulder/head proportions, projected equipment area, connected posed parts and the
  40-pixel Fighter/Brute distinction. Those are stronger evidence than the old
  procedural proxy arithmetic, but the picture in motion at 100–250 vertical pixels is
  still an owner judgement.
- **Whether the authored dress is good in motion.** The Fighter and Brute rigs now load,
  clone and follow the publication with recognizable static silhouettes. What remains is
  the foreground `[Texture]` view: idle, walking, weapons, shield and fog transitions.
  A hidden-tab loader result cannot settle that judgement.
- **The authored room in the arena, seen.** The load, the hashes, the instance counts and
  the placement are asserted over a `NullEngine`. That the room reads as a room around
  two fighters at this scale is not.

## Owed by-hand checks

Two. One is blocked on code as well as on a person; the other is now blocked on nothing
but the browser.

### The arena interaction

**Change one shield dimension in the picker**, press **[Fight]** twice, and confirm the
two fights differ and that each is reproducible.

**This one is blocked on code as well as on a person.** `web/index.html`'s
`<template id="route-arena">` offers, per fighter, an anatomy, a left hand, a right hand
and a policy, plus one seed input and the Fight button — and **no dimension control at
all**. `readMatchup` in `client/src/arena/picker.ts` reads exactly those fields and the
seed. So one `<input>` per dimension and a line in `readMatchup` are owed before the check
can be made at all.

**What is already proven, so that nobody redoes it.** Everything below the missing control
exists: the arena configuration carries five 16.16 words a hand — mass, balance and three
dimension words — `encodeArenaConfig` writes them, the recording header reports what was
sent, and `the_arena_configuration_round_trips_through_its_own_bytes` covers the encoding.
The half of the check that is automatable was done: pressing [Fight] twice on one
configuration produces the same fight, proven against a third, independent source by
`a_live_fight_matches_the_traced_fight`.

### The learned fighter, watched from the body it is beating

**Run `learned` against the composed script in the arena, and watch it from the
first-person view of the body it is beating.** v2-ui-08 recorded this as **owed to a
human, not to a session** — a digest that agrees native and wasm says the same numbers
came out of the network on both targets, and a mean return over 400 held-out seeds says
it scores above the scripted windmill; neither says the fighter reads as one.

**One of its two blockers has cleared.** It was blocked on v2-ui-07 wiring the live path
and on a visible browser tab. v2-ui-07 landed: `#/arena` runs the fight the picker
describes rather than loading a recording, and `learned` is offered as a live policy
beside the other four, with a note that it fetches `/checkpoints/v2-probe.ckpt` first.
`POLICIES` in `client/src/arena/picker.ts` carries `live: true` on all five, and
`learned_runs_live_and_is_noted_once_because_it_is_the_one_policy_that_fetches` in
`client/test/studio-shell.test.mjs` asserts that no policy is left without a live driver
and that a live `learned` fight is not refused. **What is left is the browser**, for the
reason the first section gives.

**What a person is looking for.** Set Fighter A's policy to `learned`, leave Fighter B on
`composed`, press **[Fight]**, and watch the *losing* body's panel — `first-person B` if A
is the one winning — rather than the 3/4 view. The question is whether the trained network
reads as a fighter from inside the fight: whether what comes at the losing body looks like
an opponent closing, guarding and striking, or like a policy exploiting something about
the simulation that a score cannot see. That is a judgement about a picture in motion, so
it needs the frames a hidden tab does not get.
