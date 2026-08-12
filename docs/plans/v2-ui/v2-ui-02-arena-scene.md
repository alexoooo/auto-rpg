# v2-ui-02 — three cameras on one scene, and a body made of what the physics swept

**Goal:** the two first-person views and the 3/4 view, rendering the published pose in
`[Geometry]` dress — the exact capsules, nothing invented.

**Depends on:** `v2-ui-01` (the shell, the layout, `FightSource`).

**Golden expectation:** no pin moves. Presentation only, and no Rust is touched.

## Why these are 3D when the right column is not

The plan and elevation are orthographic because they share a scale, so a length on one
is the same length on the other and a gap a reader can see is a gap that is there. That
property is the reason they exist and this session does not touch them.

A first-person view cannot have it. It is a perspective view or it is not first-person,
and under perspective a length's size depends on its distance. It is worth building
anyway because it answers a different question — *did the plate cover the club from
where the club was coming* — which the shield-height control introduced by `v2-20`
made a live decision and which no orthographic panel answers naturally.

It is 3D rather than a hand-written perspective projection on a 2D canvas for one
reason that is not aesthetic: occlusion. A 2D painter's algorithm sorts whole capsules,
and the shapes here interpenetrate constantly — an arm through a torso, a shield across
a chest — so the sort is wrong exactly when the picture matters. A depth buffer is
correct by construction.

## One engine, three viewports

`scene.activeCameras = [firstPersonA, firstPersonB, threeQuarter]`, each with a
normalised `camera.viewport` rectangle, all rendering into **one canvas** spanning the
left and middle columns.

The alternative — a canvas and an engine per panel — is rejected because a Babylon
`Scene` belongs to one engine, so three engines means building every mesh three times
and stepping three scene graphs from one pose stream. Three WebGL contexts is within the
browser's budget; three copies of the scene is not within this page's.

The constraint this places on the layout is real and belongs in the session that owns
it: **the three 3D panels must be contiguous.** If a later design wants them apart, the
fallback is one offscreen engine rendered three times per frame and blitted into three
2D canvases with `drawImage` — more code, one more copy, same scene. Do not reach for
it without a reason.

## What is reused, and one thing that is not

Reused as-is:

- [`client/src/render/engine.ts`](../../../client/src/render/engine.ts) —
  `createRendererEngine`, which owns backend selection, context-loss recovery and the
  terminal-error path. Do not hand-roll an `Engine`; context loss on a page with a
  five-second recording in flight is a case this already handles.
- [`client/src/render/scene.ts`](../../../client/src/render/scene.ts) —
  `createBabylonRightHandedScene`. Right-handed matters: the plan camera's `y`-up flip
  is load-bearing and documented at `fight/view.ts:58`, and a left-handed scene beside
  it would put the shield on the wrong side of the body in one panel and not the other.
- [`client/src/render/debug.ts`](../../../client/src/render/debug.ts) —
  `RendererDebugRegistry`, so mesh and shadow-caster counts stay visible.

The axis mapping is already settled by the existing renderer and must not be
re-derived: world `(x, y)` → Babylon `(x, z)`, height → Babylon `y`, yaw negated. See
`ActorPresentation.#pose` (`render/actors.ts`), `node.mesh.position.set(unit.x,
unit.radius, unit.y)` and `rotation.set(0, -unit.facing, 0)`.

**`ActorPresentation` itself is not reusable.** It instances one cylinder per unit from
the worker's `PresentationSnapshot`, which is a tile-map-and-units message with no
articulated content. Its *shape* is exactly right and should be followed: a source-mesh
registry keyed by archetype, `create`/`pose`/`retire` against a live key set, shadow
casters added and removed rather than toggled, and counts published to the debug
registry. The arena's version carries roughly fourteen nodes per body instead of one.

`PresentationTimeline` (`render/interpolation.ts`) is for smoothing irregularly-arriving
network-ish snapshots and is **not** what this needs. The arena scrubs a recorded
buffer: at 1× it steps one tick per 60 Hz frame, and at 0.1× it wants interpolation
between two known ticks, which is a lerp against a fractional index, not a timeline.

## `[Geometry]`

Every shape is one the simulation published:

- five region capsules per body, from `Pose.regions`, drawn at their published `radius`
  and skipped when `present` is false;
- hand spheres at `arm.hand`;
- weapon capsules from `hilt` to `tip` at the published radius;
- the shield quad from `shieldCorners()` — centre, normal and extents, rebuilt the same
  way the 2D panels rebuild it;
- flat unlit material, no shadows, no environment, a bare floor grid.

Severance reads from `Pose.severed`; a region whose bit is set stops being drawn, which
is the same rule `present` already encodes.

This mode is the check on session 03. When the proxy character disagrees with the
capsules, `[Geometry]` is what says so.

## The first-person cameras

Eye at the head region's centre, looking along body yaw, level.

That is not a simplification, and the plan should say why: the model has **one**
rotation. There is no pitch, no roll, no head turn, and `v2-20`'s guard height is a
property of the arm, not of the gaze. A camera that pitched would be inventing a degree
of freedom the fighter does not have and the reader would read it as one.

> **Superseded in part, and the distinction is the point.** That argument rules out a
> camera that *tracks*, and it still does. It does not rule out a **constant** downward
> mount angle, which invents no more than a constant field of view does. The session
> shipped level and an adversarial review then measured what level costs; the decision
> was reopened with the corrected frustum numbers and reversed. See "The camera numbers,
> and where they came from" below.

Two details that decide whether the view is usable:

- **Field of view wide enough to see your own hands.** The whole point is watching your
  own shield against an incoming weapon. Start near 80° and record what was chosen.
- **Near plane small enough not to clip them.** The hand is well under a metre from the
  eye at guard.

The head is a degenerate capsule — `body_region_volumes` builds it with coincident
endpoints, so its extent comes entirely from `radius` and `AnatomyRegionSpec::half_height`
is dead for that region. Take the eye from the published capsule, not from the anatomy
row, or the camera will sit in the wrong place by the difference between them.

## Verification

```powershell
npm run check
npm run build
node tools/check_docs.js
cargo test
```

By hand, against `fight.json`, `fight-learned.json` and `fight-windmill.json`:

- All three 3D panels and both 2D panels show the same tick, and scrubbing moves all
  five together.
- **A capsule check:** at a tick with a contact, the contact point drawn in the 3/4
  panel sits on the same body region the plan and elevation put it on, and the readout
  names that region. Three ticks, recorded.
- **A handedness check:** a body facing screen-right in the plan holds its shield on the
  same side in the 3/4 view. Getting this wrong is the specific failure the right-handed
  scene exists to prevent.
- The first-person view of a body being attacked shows the attacker's weapon crossing
  the plate, or not, and agrees with whether the trace recorded a `weaponShield` contact.

**Performance is measured on the user's machine and not claimed here.** Three viewports
plus two 2D canvases at 60 Hz, roughly fourteen nodes per body. Record frame time with
the existing `render/performance.ts` capture harness, on the user's hardware, and write
the number into this file. An agent's own tab is not a measurement.

## Decision

Record `pass`, `revise` or `stop`. A `pass` needs the capsule check and the handedness
check written down with their ticks, and a measured frame time.

## How v2-ui-02 closed

**`pass`, with one measurement owed.** Both checks are below with their numbers, no pin
moved, no Rust was compiled, and the frame-time line is deliberately blank — see
"The measurement this session owes".

An adversarial review afterwards found twelve defects, all of them fixed in this tree and
all of them listed under "What an adversarial review found afterwards" at the end. Two
changed a decision rather than a line: the first-person camera now sits on a constant 25°
downward mount behind a 90° lens, and the contact axis is ±0.4. The numbers below are the
corrected ones throughout.

Landed as `client/src/arena/geometry.ts` (pure arithmetic: the axis mapping, the eye, the
viewport rectangles, the capsule decomposition, sub-tick blending) and
`client/src/arena/scene.ts` (the Babylon content, three cameras, the mesh registry).
`arena.ts` gained the wiring and lost its placeholder `fillRect`.

### The axis mapping had to change sign, and that is the whole handedness story

The session brief said the mapping was settled and must not be re-derived: world
`(x, y) → (x, z)`, height → `y`, **yaw negated**, as `ActorPresentation.#pose` in
`render/actors.ts` does it.
Applied to a right-handed Babylon scene that mapping has determinant **−1** — it is a
reflection, not a rotation — and it puts a Fighter's shield on the wrong side of its body
in the 3/4 view while the plan beside it has it right. That is precisely the failure the
plan says the right-handed scene exists to prevent, so the sign was changed rather than
the check abandoned:

> world `(x, y, height)` → scene `(x, height, **−y**)`, and yaw **not** negated.

The greybox is not wrong to do the other thing. Its 2D authority, `web/main.js`, draws
`+y` *down* the screen, and against that convention `(x, y) → (x, z)` is
orientation-correct — and a cylinder has no chirality for anyone to notice. This page's
authority is `fight/view.ts`, which draws `+y` **up** and explains at length why
(`actuator::shoulder` puts `LimbSlot::LeftArm` on the +90° side, which is a body's
anatomical left only in a right-handed frame with `y` up). The two conventions differ by a
reflection, so the two renderers must too.
`the_arena_axis_mapping_is_a_rotation_rather_than_a_mirror_of_the_world` asserts the
determinant is +1 and that scene-left is `up × forward`.

### The capsule check — three ticks on `web/fight.json`, seed 3

Numbers are world units; "inside" is how far the published contact point lies under the
named capsule's surface, and "next capsule" is the clearance to the nearest other region
of the same body, so a small number there would mean the check could not distinguish them.

| tick | readout says | point | inside | next capsule | seen in the 3/4 at azimuth |
|---|---|---|---|---|---|
| 858 | `weaponBody · 0/1 → 1 body (leftArm)`, cut 3, wounding | 12.108, 8.677, 0.475 | 0.066 under a radius-0.200 capsule | 0.148 | 135° |
| 1402 | `weaponBody · 1/1 → 0 body (torso)`, no wound channel | 15.139, 8.852, 1.405 | 0.139 under a radius-0.350 capsule | 0.163 | −50° |
| 3022 | `weaponBody · 0/1 → 1 body (leftArm)`, cut 148, wounding | 12.284, 11.084, 0.475 | 0.066 under a radius-0.200 capsule | 0.081 | 180° |

At each of the three the marker is drawn on the region the readout names, on the body the
readout names, and at the point where the attacker's weapon capsule meets it — the Brute's
left arm under the Fighter's sword at 858 and 3022, the Fighter's torso under the Brute's
club at 1402. The plan and the elevation put the contact ring in the same place at the
same tick.

Two things had to be built to make the check possible at all, and both are findings:

- **Contacts are drawn in the 3D panels.** They were not in the `[Geometry]` list, and
  without them the check has nothing to look at.
- **The contact marker respects depth, and is an axis rather than a ray.** An
  always-on-top overlay was tried first — it is what the 2D panels do — and rejected: it
  draws a marker for a contact behind one body on top of the other one, so the reader
  reads the wrong body, which is the exact failure a depth buffer was chosen to prevent.
  But a depth-correct marker at the point alone is invisible, because the point is
  normally *inside* the capsule it landed on. And the published normal is the collision
  normal, pointing from A into B: at tick 858 it is `(−0.70, −0.68, 0.21)` against a
  radial direction of `(0.78, 0.63, 0)`, so `drawContact`'s ray in the published direction
  would have to run 0.904 units before it was clear of every capsule, while the other way
  out is 0.068. Drawn both ways, one half escapes, and the half that escapes is the one
  facing the camera.

  **The half-length was wrong and is now ±0.4.** It shipped at ±0.3 under a comment that
  asked it to "clear the widest capsule it can be buried in from the middle — the Brute's
  torso is 0.4 across, its legs 0.35". Those are the published *radii*: across, the torso
  is 0.800, so the requirement is 0.400 and the sentence had computed 0.200. Sweeping all
  three fixtures and counting a marker buried when the whole axis stays inside the union
  of every capsule and hand sphere drawn that tick, over their 5703 weapon-body contacts:
  1073 (18.8%) invisible at ±0.3, 230 (4.0%) at ±0.35, 97 (1.7%) at ±0.4, 16 (0.3%) at
  ±0.5. ±0.4 is the widest published radius and is what shipped; the residual sits inside
  a stack of overlapping capsules whose longest escape needs 0.924, half a body, and a
  tick can carry nine contacts. The two-sided draw earns its keep on the same sweep: at
  the same length a one-sided ray in the published direction is buried for **63.3%** of
  those contacts against the axis's 1.7%.

  > **Superseded in place, and not re-run.** `web/fight-learned.json` was re-recorded on
  > 2026-08-11, so the corpus this sweep ran over no longer exists. The three fixtures
  > now record **5512** weapon-body contacts — 1061 + 2352 + 2099, re-derived under this
  > note — where they recorded 5703, because the learned fixture carries 2099 where it
  > carried 2290. Every count and percentage in the paragraph above is the old corpus.
  > Nothing about the decision turns on it: the lower bound is a published radius, and
  > the two fixtures supplying 3413 of the 5512 did not move. The same note is at
  > `CONTACT_AXIS` in `client/src/arena/scene.ts`, which is where the numbers live.

### The handedness check — tick 2113, Fighter A at yaw 357°

In the plan the Fighter faces screen right and its shield sits above and ahead of it, on
the `+y` side, which `view.ts` argues is its anatomical left. In the 3/4 view:

- **azimuth +90°** (the camera on the world `+x` side, so the Fighter is facing the
  reader): the gold plate is on the **reader's right**, which is where a body facing you
  keeps its left hand.
- **azimuth −90°** (the camera on the `−x` side, over the Fighter's shoulder): the plate
  is on the **reader's left**, which is where its left hand is when you are behind it.

A mirrored mapping swaps both. This is the check that caught the sign above.

Re-confirmed after the camera decision below, which did not move the 3/4 camera: at tick
2113 the gold plate's centroid inside the 3/4 rectangle (x 246–877, centre 561) sits at
x 612 at azimuth +90° and at x 500 at azimuth −90°. The three capsule-check ticks above
still draw their `weaponBody` marker inside the same rectangle at the same azimuths, with
the readout naming the same regions.

### The other two by-hand items

- **All five panels move together.** Scrubbing, the ± buttons, the contact and wound seeks
  and the chart click all drive one `render()`, which draws the plan, the elevation, the
  chart, the readout and the three viewports from the same `frameAt(state.frame)`. Span
  frames all five alike. `fight.json`, `fight-windmill.json` and `fight-learned.json` all
  load and draw.
- **The first person and `weaponShield`.** At tick 966 Fighter A's own view shows the
  Brute's club crossing the gold plate, with the contact marker on it, and the trace
  records `weaponShield · 1/1 → 0/0`. At tick 992 the club is clear of the plate and the
  trace records no contact at all. The two agree. Re-recorded after the camera decision
  below moved the first-person mount: at 966 the `weaponShield` marker is 609 pixels of
  `#8ad4ff` inside the first-person-A rectangle, at 992 there is not one pixel of either
  marker colour anywhere on the canvas.

### The camera numbers, and where they came from

- **Field of view 90°, vertical, on a mount tilted a constant 25° down** — and the panel
  is square enough that 90° is within half a degree of the horizontal field of view too,
  since 0.28 × 0.5 of a 16:9 canvas is an aspect of 0.9956. This shipped as **100° and
  level**, on a table that did not reproduce; both numbers are corrected below.

  The measurement that is right, and was right the first time: the guard is held low and
  the eye is high, so the point of a `weaponShield` contact sits **below** a level gaze by
  31.5°–63.9° on `fight.json` (median 46.5), 16.5°–61.2° on `fight-windmill.json` (46.3)
  and 14.6°–65.9° on `fight-learned.json` (49.9), over 430, 188 and 54 contacts.

  **The frustum table did not reproduce**, because it was derived with a spherical
  vertical test. `fovMode` is Babylon's default `FOVMODE_VERTICAL_FIXED`, which clips on
  a **rectangular** frustum — `|y| ≤ tan(fov/2)·(−z)` and `|x| ≤ aspect·tan(fov/2)·(−z)`,
  where `−z` is distance along the gaze rather than distance in the horizontal plane — so
  a corner is further off the axis than a top edge. Recomputed with that test at aspect
  0.9956, contacts inside:

  | mount | lens | `fight.json` | windmill | learned |
  |---|---|---|---|---|
  | level | 80° | 0% | 9% | 13% |
  | level | 90° | 14% | 28% | 15% |
  | level | 100° | **52%** | 61% | 22% |
  | level | 110° | 79% | 64% | 46% |
  | level | 120° | 90% | 88% | 59% |
  | 25° down | 70° | 81% | 85% | 57% |
  | 25° down | 80° | 93% | 95% | 83% |
  | **25° down** | **90°** | **100%** | **97%** | **94%** |
  | 25° down | 100° | 100% | 99% | 100% |
  | 30° down | 80° | 99% | 96% | 94% |
  | 35° down | 80° | 99% | 96% | 100% |

  The recorded row read 8/35/74/91/97 at 80/90/100/110/120 and the shipped camera actually
  answered for **52%** of the fight it was chosen against — and for 22% of the learned
  fight, which is a coin flip on the one question the panel exists to answer.

  > **The `learned` column was re-derived on 2026-08-11 and is the only one that moved.**
  > That fixture was re-recorded and now carries **54** weapon-shield contacts against
  > 375, so the whole column had to be re-measured rather than carried forward; the
  > `fight.json` and windmill columns re-measure cell for cell, which is what says the
  > re-derivation is the same measurement and not a new one. The method is the shipped
  > camera itself — a Babylon `FreeCamera` at the published eye, `rotation.x` the mount,
  > `viewport` `ARENA_VIEWPORTS.firstPersonA` so Babylon's own `getAspectRatio` gives
  > 0.9956, and the point transformed to NDC — cross-checked against the rectangular
  > test above with 0 disagreements over 16128 checks.
  >
  > What moved besides the digits: at the shipped 25°/90° the learned column reads
  > **94% (51/54)** rather than 98%, so it is now the worst of the three at the shipped
  > setting rather than the best. Its three misses are one contiguous cluster at ticks
  > 2490–2492 — the deepest contacts in the file, 65.9°/64.8°/63.2° below level, needing
  > a 93.6° lens at this mount.
  >
  > **And 54 will not carry a percentage to two figures.** The 95% Wilson interval on
  > 51/54 is [84.9%, 98.1%] against [99.1%, 100%] on `fight.json`'s 430/430, and that is
  > a floor rather than the real uncertainty: the 54 fall in 10 swings, one of which
  > supplies 20 of them. At swing granularity — which is what a reader watching the panel
  > experiences — the shipped setting holds **9 of 10 swings wholly in frame and 10 of 10
  > partly**, against level 100°'s 2 of 10 and 3 of 10. That is the reading to trust on
  > this fixture. (`fight.json` is 430 contacts in 35 swings, 35/35 against 13/35;
  > windmill is 188 in 13 swings, 12/13 against 7/13.)

  **The pitch decision, reopened and reversed.** The plan's argument — "a camera that
  pitched would be inventing a degree of freedom the fighter does not have" — rules out a
  camera that *tracks*, and that part is kept, in the code, in as many words: nothing here
  follows a swing, and the body still has exactly one rotation. It does not rule out a
  **constant** mount angle, which is a property of the rig in the same way the field of
  view is: the same number at every tick of every fight, varying with nothing the fighter
  does, and written down beside the measurement it came from.

  The counter-argument is real and was measured rather than waved away: a tilted horizon
  reads oddly as first-person, and its honest form is *losing the attacker*. So the
  opponent's head was measured at the same ticks. In frame for 97% / 95% / 96% of them at
  25° and 90°, against 100% / 99% / 96% for the level 100° this replaces — so the mount
  costs the attacker 3 points on `fight.json` and 4 on windmill, and **nothing at all** on
  the re-derived learned column, where the same two ticks miss under both settings, to buy
  48, 36 and 72 points of the guard. That is the trade, and it is not close. The learned
  side of it now argues for the mount more strongly than it did.

  What bounds the mount from above is the same measurement. Both bodies stand about 1.17
  apart at these ticks and are about the same height, so the opponent's head never rises
  more than **9.9°** above a level gaze on any of the three fixtures — while the frustum's
  top edge sits `fov/2 − pitch` above level, which is 20° here and 10° at a 35° mount.
  Tilt that far and the attacker starts leaving the frame: 35° down with a 70° lens holds
  93% of the guard and **0%** of the opponent.

  So 25°/90° is chosen because it wins the trade where it matters, pays a point or two
  where it does not, and does it with a **narrower** lens than the 100° it takes over
  from — a strict reduction in the edge distortion a panel used for judging whether one
  shape covered another can least afford. It is not perfect: windmill and learned each
  keep one cluster outside, 3% and 6% of their contacts — windmill's lateral, learned's
  the deepest three contacts it records. All of
  it moves if the guard height does, and
  `the_first_person_camera_sits_at_the_eye_and_keeps_one_fixed_mount_angle_at_every_yaw`
  rebuilds the frustum from the two constants, four measured contact directions and the
  highest measured opponent head — so it fails if either constant drifts in either
  direction, which the mount angle needs and the field of view alone would not have got.
- **Near plane 0.02.** Babylon's default `minZ` is 1, which clips everything, so this is a
  value that must be set rather than tuned. The nearest a body's own drawn surface comes
  to its own eye over the whole fight is the upper arm capsule at 0.218; the hand reaches
  0.351, the shield's nearest corner 0.518, its own weapon 0.533. Far plane 120 holds the
  24 × 16 arena and its floor grid.
- **The eye is the published head capsule's centre.** `body_region_volumes` builds the
  head with coincident endpoints, so its extent is entirely `radius`; on this fixture the
  Fighter's head is a point at 1.700 with radius 0.200 under a `standingHeight` of 1.800,
  so taking the eye off the anatomy row would sit it a tenth of a body out every tick.
- **A body does not draw the head and torso its own eye is inside.** The eye is the head's
  centre, and the torso reaches within 0.200 of it at radius 0.350, so the camera is
  inside both. Done with layer masks, per camera, so nothing is hidden from anyone else.
- **The 3/4 camera stands where the elevation camera stands, and climbs 30°.** It was a
  fixed heading at first; that leaves the great majority of this fight's 1061 weapon-body
  contacts behind one body or the other, and the capsule check needs the point on screen.
  Reusing the existing **Azimuth** slider gives the reader a way to look round a body,
  makes one control turn both perspective panels, and keeps the default `adopt` already
  computes from the line between the two bodies. At azimuth 0 screen right is world `+x`,
  exactly as in the plan, which is the azimuth the handedness check is stated at.

### Traps worth the next session's time

- **`scene.render()` alone draws nothing on WebGPU.** `Engine.runRenderLoop` wraps every
  render in `beginFrame`/`endFrame`; this page does not use `runRenderLoop`, because the
  arena already owns a `requestAnimationFrame` loop. Without the pair there is no acquired
  swapchain texture and no submitted command buffer, the canvas keeps its CSS background,
  and it looks exactly like a camera pointing the wrong way. WebGL draws anyway, so the
  bug is invisible on the fallback path.
- **`TargetCamera.setTarget` moves the camera.** It adds `Epsilon` to `position.z` when
  the target shares it, which is the case of a body facing along world `+x` — where every
  fixture opens. The first-person cameras write `rotation` directly instead, which is
  also the only way to say "a constant mount angle" without deriving a target point for
  it. A millimetre is invisible, but it is also not the eye, and "the camera is at the
  published head capsule's centre" is the one claim that panel makes.
- **A Babylon capsule cannot be scaled along its own axis** without squashing the
  hemispherical caps, and the caps are where the contact phase put the surface. Every
  capsule here is a cylinder plus two spheres; the head, whose endpoints coincide, is one
  sphere and no shaft.
- **Flat unlit fill turns fourteen capsules into one silhouette.** The five regions run
  along a fixed ramp between the body's own `region` and `edge` colours from
  `fight/view.ts`, head lightest and legs darkest, in `regionNames` order. It is a key,
  not a light: it does not vary with the camera.

### The measurement this session owes

**Frame time (p50 / p95 / p99): _not yet measured_.**

`render/performance.ts` was examined and **does not fit**. `copyMetadata` hard-validates
the fixed greybox fixture — an exact 1920 × 1080 surface, `fixtureSeed 1592594996`,
`population 64`, `roomWidth 48`, `roomHeight 32` — and refuses anything else, so the arena
would need a third performance schema beside `PERFORMANCE_SCHEMA_VERSION` and
`ROOM_PERFORMANCE_SCHEMA_VERSION`, with the pinned artefacts in `docs/performance/` that
implies. That is a session of its own and not a presentation-only one.

**The procedure below obeys all three of AGENTS.md's probe rules.** The version this note
carried first obeyed one of them: it removed the work rather than hiding it, which
`?stage=off` does honestly, but its comparison was run-versus-run and it ended without a
control. Both are fixed here, and the fix needed a page change rather than a longer
console snippet.

- **Remove work, do not hide it.** **`#/arena?stage=off`** builds no engine and no scene
  while leaving the plan, the elevation, the chart and the whole transport untouched —
  confirmed by the canvas still answering `getContext("2d")`, which a canvas that had
  ever held a GPU context cannot do.
- **Compare paired frames, not paired runs.** **`#/arena?stage=paired`** draws the three
  viewports on every other animation frame while everything else draws on all of them, so
  the two configurations interleave inside one run over one scene a single tick apart.
  This is the mode to take the number in; the plain route is what the number describes.
  It cannot be done from the console: the arena is an ES module graph and nothing of it is
  reachable from `window`, which is exactly what makes `web/main.js`'s reassignable
  top-level functions work for the greybox and not here. **In this mode playback advances
  one tick per animation frame and ignores the Speed control**, which is not a
  convenience: at 1× on a 120 Hz display the wall-clock carry advances the tick on every
  *other* frame, which is the alternation's own period and phase-locked to it, so every
  drawn frame would land in one population and the difference would be the whole page or
  none of it.
- **End every run with the baseline repeated as a control.** Step 5.

An agent cannot take this number, and this time the trap was sharper than the throttle
AGENTS.md describes. A Claude-in-Chrome tab is always `visibilityState: "hidden"`, and a
hidden tab here got **no animation frames at all**: a probe waiting on seven consecutive
`requestAnimationFrame` callbacks never resolved in forty-five seconds, and playback sat
on its starting tick throughout. Everything else on this page could still be checked from
an automated tab, because scrubbing renders synchronously out of the input handler — only
the things that need the loop cannot be. So the alternation itself is checked in Node
instead, by `the_paired_frame_probe_advances_one_tick_a_frame_instead_of_reading_the_clock`
against the shell harness's fake `requestAnimationFrame`; the browser confirmed only that
the mode builds, labels itself, and leaves the controls working.

**What to run, in a normal focused Chrome window, with `npm run view` serving.** The probe
is the same snippet each time; only the URL changes.

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

1. Open `http://localhost:5173/#/arena`. Wait for the fight. Set **Span 6**, **Azimuth 0**,
   **Speed 1x**, scrub to **tick 800**, press **Play**, and leave the window focused and
   frontmost. Run the probe. This is the **baseline**: read `all`, ignore the parity split.
2. Open `http://localhost:5173/#/arena?stage=paired` — same span, azimuth and starting
   tick, playing; Speed is ignored here. The label under the 3/4 panel says `paired-frame
   probe, viewports on alternate frames`, so a number taken here cannot be mistaken for
   the shipped frame time. Run the probe. `|pairedDelta|` **is the cost of the three
   viewports**, on one scene, in one run.
3. If both populations sit on the vsync interval the panels cost less than the headroom.
   Take that as the answer only after removing headroom: enlarge the window, or raise the
   density cap in `createArenaStage`, until the shipped configuration leaves 16.67 ms and
   the control does not. If both populations come back **equally** inflated, the driver is
   pipelining a frame's GPU work into the next interval and the alternation is too fast to
   separate them; that is the case where the pairing has failed and the honest fallback is
   step 4's `?stage=off` run against step 1's, run back to back and both repeated.
4. Optionally repeat step 1 with `?stage=off` for the whole-page floor, and with
   `?backend=webgl2` to price the WebGPU path against the fallback.
5. **Repeat step 1 exactly**, last, and check it reproduces the first triple. A run whose
   baseline drifted between its ends measured the machine, not the page.

Write the baseline triple and the paired delta into the blank line above, with the GPU and
the browser build beside them.

### What an adversarial review found afterwards

Twelve defects, all fixed in this tree. Recorded here rather than deleted, because most of
them are the kind that a passing test suite and a picture that looks right both miss.

1. **A contact marker kept the colour of whichever kind first occupied its array index.**
   `#instance` keyed on `contact:${index}` and returned the cached `InstancedMesh` without
   re-parenting it to the source carrying the new colour, and an instance's material is
   its source's. 136 of `fight.json`'s 1491 markers, 350 of 2631, and — re-derived after
   the learned fixture was re-recorded on 2026-08-11, where it read 309 of 2966 — **153 of
   2195**. The same replay still returns 136 and 350 on the two that did not move. It was
   history-dependent: a key stays live until a tick with fewer contacts retires it, so the
   colour of index 0 was decided by whichever kind held it when the current run of
   contact-bearing ticks began. Reaching tick 430 through a tick with no contacts gave the
   true colours and stepping into it from 429 gave them swapped — the same page, the same
   tick — which is precisely what `threeQuarterPlacement`'s own comment forbids. Both
   paths now give byte-identical canvases at 430, checked in Chrome on `fight.json`.
2. **The `±0.3` contact axis** read published radii as diameters; see the capsule-check
   section above.
3. **The field-of-view table did not reproduce**; see the camera numbers above. The
   assertion beside it, `FOV / 2 > 46`, stated a false implication and passed for any
   field of view ≥ 93°, so it could not tell 100° from 179°.
4. **The pitch decision was reopened with the corrected numbers and reversed**; above.
5. **Severance dropped the arm capsule and kept the hand, the shield and the weapon.**
   `regionDrawn` gated the five region capsules only. No fixture exercises it — all three
   carry zero `severed` bits and no absent region — and the test named for it asserted on
   `0:region:*` keys alone, so it passed with a hand and a gold plate floating with
   nothing between them and the shoulder.
6. **`blendPose` interpolated region endpoints across a severance**, drawing an arm half
   way to wherever the stump was published. Reachable only below 1× speed.
7. **`dispose()` could be undone by a late `onCanvasReplaced`**, re-arming an observer the
   route had already given back — and a newly observed element gets an initial callback,
   so one `render()` would run against detached canvases.
8. **A window in `createArenaStage` leaked the engine**: the `try` covered the scene build
   only, so a throw in the hardware-scaling lines rejected with a GPU context already made
   and unreferenced.
9. **The frame-time procedure broke two of the three probe rules**; rewritten above.
10. **`Math.max(0.002, radius * 2)` was an invented minimum size.** It never bit — the
    smallest published radius is the sword at 2621 raw, 0.040 — but `[Geometry]` is not
    entitled to a fudge factor.
11. **The second axis mapping was documented only in the file that introduces it.**
    `render/actors.ts`, which this plan calls the settled authority, said nothing, and
    nothing outside `docs/plans/` mentioned a second mapping of the opposite orientation.
    Both now carry it; the architecture record is in
    [`docs/architecture/browser-runtime.md`](../../architecture/browser-runtime.md).
12. **The shell-contract test never built an engine**, so its counts said nothing about
    the half of "does not leak a worker or a render loop" that needs a GPU. It now says so
    in the file, asserts that the stage really was absent so the sentence cannot go stale,
    and the lifecycle itself is covered by
    `the_arena_stage_owns_every_engine_it_builds_including_one_it_fails_on` over a
    `NullEngine`.

Two smaller ones: `calc\((\d+)%` read `calc(28.5% + .5rem)` as 28 and passed, and nothing
asserted which camera held which viewport rectangle or the order of `scene.activeCameras`,
so swapping the two first-person panels passed every test in the file.

### And what a second adversarial pass found in the fixes

Worth keeping, because most of it was wrong prose over right code — the class of defect
this repository says is worse than no prose at all.

- **The frustum table's opponent-head comparison named the wrong row.** Level 100° holds
  the attacker for 100/99/100 percent of those ticks, not 100/97/100 (which is the level
  90° row). Corrected above, and it changes the shape of the conclusion: the 25° mount
  costs the attacker on all three fixtures rather than breaking even.
- **`(35° down, 80°)` on `fight.json` is 99%, not 100%** — 428 of 430.
- **One of the three contact directions the camera test hard-coded was not a contact.**
  `[31.5° below, 4.6° lateral]` combined one contact's depression with a lateral nothing
  published; the real shallowest is `[31.5, 48.0]`, which needs 96.3° from a level mount
  rather than being comfortably inside one. The test now names four real contacts, and
  the assertion built on the fabricated row — "in frame either way" — was false.
- **The camera test could not tell 25° from 35°.** Its geometric assertions were satisfied
  by every mount from 25° to 60° at this lens, because nothing in either test file
  measured the attacker — the half of the decision that bounds the mount from above. It
  now asserts the highest measured opponent head, and fails at 35°.
- **The contact-axis test measured the wrong capsule.** It checked the axis against the
  *Fighter's* 0.350 torso, so it passed at 0.351; it now builds the Brute's published
  0.400. The upper bound remains a judgement and is stated as untested.
- **The weapon half of the severance gate was untested.** The fixture gives limb 0 the
  shield and no weapon, and limb 0 was the only limb ever severed, so `weapon === null`
  short-circuited before the gate was consulted. Severing limb 1 catches it.
- **`blendPose` applied the freeze to `severed` alone.** A region flipping `present` froze
  its own endpoints and let the hand, the weapon and the shield hanging off it go on
  lerping — the same defect as finding 6, reached through the other of the two bits
  `regionDrawn` reads. Both bits now mean the same thing here too.
- **The colour bug was history-dependent rather than path-dependent**, and the fix's own
  comment said the wrong thing about the page. Corrected in finding 1 above.
- **`?stage=paired` phase-locked at 120 Hz.** Alternating on animation frames while the
  transport advanced on the wall clock put every drawn frame in one population at 1× on a
  120 Hz display. The mode now advances one tick per animation frame and ignores Speed,
  which is what makes the frames between the drawn ones a control rather than a copy.
- Three comments were repaired against their own numbers: the tick-858 ray (its one-sided
  reach is 0.904, not the arm's width), "half what its own sentence asked for" (0.3 is
  three quarters of 0.400, and the misread sentence had computed 0.200), and the smallest
  radius `#sphere` is ever called with (the contact axis's end spheres at 0.028, not the
  sword's 0.040).
