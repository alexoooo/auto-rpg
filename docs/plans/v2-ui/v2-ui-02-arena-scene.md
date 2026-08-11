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
`ActorPresentation.#pose` (`render/actors.ts:120`), `node.mesh.position.set(unit.x,
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
