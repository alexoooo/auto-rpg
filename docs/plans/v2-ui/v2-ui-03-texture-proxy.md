# v2-ui-03 — `[Texture]`, and an honest account of what it invents

**Goal:** a fighter that reads as a fighter — lit, shadowed, standing in a real room —
built from primitives at published dimensions, with every invented degree of freedom
named.

**Depends on:** `v2-ui-02` (the scene, the cameras, `[Geometry]` as the control).

**Golden expectation:** no pin moves. Presentation only — which is also `v2-18`'s
stated expectation, and for the same reason.

## What the simulation actually gives a renderer

Five capsules, two hand positions, two weapon segments, one shield quad, and **one
rotation**. No spine, no pitch, no roll, no head turn, no independent legs, no stride
phase. The legs are a *single* capsule.

So a character is mostly invented, and the honest question is not whether to invent but
where the line is drawn and who can see it. The line: **published quantities place
things; invented quantities only fill between them.** A hand is where the pose says. An
elbow is a guess. A knee is a guess about a guess.

`[Geometry]` stays one click away as the control. That is what makes this safe to build
— any suspicion that the proxy is lying is answerable in a keystroke.

## Build it to `v2-18`'s node contract

[`v2-18`](../v2-18-combatant-integration.md) already specifies the semantic names the
authored rigs will carry:

```text
root pelvis torso head
arm_left hand_left arm_right hand_right
socket_weapon_left socket_weapon_right socket_shield
region_head region_torso region_left_arm region_right_arm region_legs
idle walk stagger fall
```

The proxy uses these names for its transform nodes and sockets. Then landing `v2-18` is
swapping what hangs under each node, not rewriting the presentation layer — and the
socket contract gets exercised, and its mistakes found, a whole session before there is
an asset pipeline to blame them on.

`v2-18`'s rules apply here verbatim and are the reason this session is safe:
authoritative hands, weapon and shield are driven from pose rows; no animation creates a
hit; reactions begin only from events; **cosmetics never feed back into simulation.**

## What is published, and what is invented

| part | source |
|---|---|
| body position, yaw | published |
| head | published capsule (degenerate — extent is `radius`) |
| torso | published capsule |
| hands | published |
| weapon hilt and tip | published |
| shield centre, normal, extents | published (thickness on the pose's own `ShieldFace` row, not the header -- corrected on implementation) |
| **elbow** | invented — two-bone IK between the published shoulder and hand |
| **legs** | invented — one published capsule split into two, gait from body velocity |
| **wrist orientation** | invented — derived from the weapon segment, which is published |

The arm capsule runs shoulder to hand and its own length is the extension, so the IK has
a real target and a real root and only the bend plane is chosen. Pick the plane away
from the torso and record the choice; a plane chosen toward the torso puts the elbow
inside the chest at guard.

The legs are the weakest claim on the page. One capsule, no stride, no per-foot contact.
A walk cycle driven from body speed will desynchronise from any notion of a footfall
because there is no notion of a footfall. Two consequences to accept openly: feet may
slide, and no visual on the legs may ever be read as evidence about footwork. If a
reader needs to judge footwork, `[Geometry]` shows the one capsule that is actually
there.

## Materials and environment

- PBR materials, one per faction, following the existing hero/monster palette so the
  five panels agree on which body is which.
- A directional light and the existing `ShadowGenerator`. Shadows are what make the 3/4
  view read as a place rather than a diagram, and they are the single largest visual
  return in this session.
- The authored room via `render/room-assets.ts` and `render/room-environment.ts`, behind
  the same asset contract and the same validator the greybox page uses. If the GLB is
  absent the mode must still render — a missing asset degrades to the procedural floor,
  it does not throw.

Toggling `[Texture]`/`[Geometry]` swaps materials and enables or disables the
environment and shadow casting on one scene. It does not rebuild the scene, and it does
not touch the cameras — all three 3D panels change together because the mode is a
property of the scene.

## Verification

```powershell
npm run check
npm run build
node tools/validate_assets.js web/assets3d/room_slice.glb
node tools/check_docs.js
cargo test
```

By hand, and this is the whole point of the session:

- **The agreement check.** At five ticks spread across a fight, toggle
  `[Texture]`/`[Geometry]` and confirm the proxy's hands, weapon tip and shield plate sit
  on the published ones. Any drift is a bug in the proxy, never a reason to move a
  published value.
- **The severance check.** A trace with a severed region — if none exists, say so, since
  no fight has ever severed anything — must drop the same limb in both modes.
- **The silhouette check**, from `v2-18`: the fighter reads at 100–250 vertical pixels
  without outlines. That is roughly the first-person panel's size.
- **The missing-asset check.** Rename the room GLB and confirm `[Texture]` still renders.

**Performance measured on the user's machine**, with shadows on, all three panels
live, and compared against the `[Geometry]` number from `v2-ui-02`. Write both into
this file. Shadow casting on ~28 nodes is the plausible regression and the reason the
comparison is worth having.

## Decision

Record `pass`, `revise` or `stop`. A `pass` needs the agreement check written down with
its five ticks, and both frame times.

Deferred even on a pass: authored rigs and skinning (`v2-18`), animation clips beyond
the velocity-driven gait, per-material wear or damage state, and audio.

## How v2-ui-03 closed

**`revise`.** Not because anything below is wrong, and not because the criterion was
skipped -- because the criterion is **blocked**, and a blocked criterion is not a `pass`
even when everything an agent can reach is green.

The criterion above says a `pass` needs the agreement check with its five ticks **and
both frame times**. The agreement check is written down, with its five ticks, its worst
gap and a modelling term it flushed out on the way. The frame times are not, and no agent
on this machine can supply them: a Claude-in-Chrome tab is always
`visibilityState: "hidden"`, and v2-ui-02 measured that a hidden tab here receives *no*
animation frames at all -- seven consecutive `requestAnimationFrame` callbacks that never
resolved in forty-five seconds. There is no version of this session that produces the
number, and inventing one would be worse than not having it.

So: **everything the session could verify is verified and half the decision criterion is
owed to a human.** The distinction that matters, and the reason this is not a `stop`:

- **Verified, over a `NullEngine` and in Chrome on the WebGPU path.** The agreement check
  at five ticks and ten poses, worst gap 9.54e-7 against a 1e-4 tolerance. The severance
  check in both modes, on the same pose, both bits separately. The missing-asset check,
  with the file really taken away, through the real loader's real failure path and again
  through the stage a reader presses. The silhouette *arithmetic* at 100 vertical pixels.
  The mode round trip: one scene, one set of cameras, nothing rebuilt, nothing left in
  the shadow render list that should not be, over eight presses. That the room loads,
  lays out by the greybox's own rules, and is fetched exactly once however many times the
  button is pressed.
- **Owed to a human, and listed in full under "What is still owed to a human" below.**
  The two frame times and the paired delta, with the procedure written out step by step.
  The silhouette *judgement*. Whether the dress is any good -- the published anatomy
  reads as a blob and whether that is acceptable until v2-18 is an owner's call.

`revise` is the honest verdict for a session whose deliverable is finished, whose gate is
half unreachable from where the agent stands, and which is asking for one measurement and
two judgements rather than for more code. Nothing here is blocking v2-ui-04; the frame
times decide whether the shadow map needs a knob turned, and the procedure for taking
them is below.

Deferred as the plan says even on a pass: authored rigs and skinning (`v2-18`), animation
clips beyond the velocity-driven gait, per-material wear or damage state, and audio.

## How v2-ui-03 was built

Landed as `client/src/arena/environment.ts` (the key light, the fill, the shadow
generator, the procedural floor and the authored room), additions to
`client/src/arena/geometry.ts` (the v2-18 node names and every invented quantity, each
beside its argument) and to `client/src/arena/scene.ts` (the rig, the proxy, the PBR
materials, the mode). `arena.ts` lost the sentence that disabled `[Texture]` and gained
one call into the stage.

**No pin moved.** `cargo run --release -p lab -- hash` prints `0xfe31370e141ef531`,
which is what it printed before this session started. No Rust was touched.

### The verification had to change shape, and it is stronger for it

The plan asks for four by-hand checks in a browser. **Three of the four are now
assertions**, because an automated tab on this machine cannot do them: it is always
`visibilityState: "hidden"`, and v2-ui-02 measured that a hidden tab here receives *no*
animation frames at all -- seven consecutive `requestAnimationFrame` callbacks never
resolved in forty-five seconds. Turning them into assertions is better than eyeballing
them anyway: "the hands sit on the published ones" is a number, and a number that is
checked on every run cannot quietly stop being true.

### The agreement check -- five ticks, and the numbers

`the_textured_proxy_agrees_with_the_published_pose_at_five_ticks_of_a_fight`, over a
`NullEngine`, on `web/fight.json` seed 3.

| tick | why this one |
|---|---|
| 858 | v2-ui-02's capsule check: the Brute's left arm under the Fighter's sword |
| 966 | v2-ui-02's first-person check: the Brute's club crossing the gold plate |
| 1402 | v2-ui-02's capsule check on the Fighter's torso under the club |
| 2113 | v2-ui-02's handedness check, Fighter A at yaw 357 degrees |
| 3022 | v2-ui-02's third capsule check, late in the fight |

Both bodies at each tick, so ten poses. What is asserted, against the published rows:
`hand_left` and `hand_right` (three levels down the rig, so the parent transforms are
checked too), the weapon capsule's hilt and tip sphere, and the shield plate's four
front-face corners against `shieldCorners` -- the same four points the plan and the
elevation draw.

**Tolerance 1e-4 world units. Measured worst gap 9.54e-7**, a micrometre, and it
reproduces to the printed digit across runs. Any drift is a bug in the proxy and never a
reason to move a published value.

> **The tolerance was called a float32 budget and it was not one — the dominant term was
> a modelling disagreement, and it is now gone rather than budgeted for.** The gap read
> 2.19e-6 and the whole of it was the shield plate. `shield_face`
> (`crates/sim/src/combat/geometry.rs:119`, mirrored in `client/src/fight/trace.ts`)
> builds the swept face from `left = (-n.y, n.x, 0)` scaled by `half_width`, so the
> collider's half-width carries the *length of the published normal* — and the published
> normal is not a unit vector. Over the three recordings' 10542 plates, `|n_z|` is zero on
> every one and `||n| − 65536|` reaches 1.2534, a relative 1.9126e-5; on a 0.25 half-width
> that is 4.8e-6 world units, which reconstructed in double precision with no Babylon in
> the loop is the *whole* of the worst gap (4.644e-6 at `fight-learned.json` tick 1332,
> `n = (−23051, −61347, 0)`), against 1.907e-6 for every other swept quantity. A recording
> with a less-normalised normal would have driven that through the tolerance for a reason
> that is neither arithmetic nor the proxy. `#shieldPlate` now builds the box from the
> published normal as published — the half-width and the half-thickness both carry its
> length, the half-height does not, because the simulation's own `up` is
> `Vec3::Z * half_height` — and the same double-precision reconstruction over all 10542
> plates tops out at 5.6e-17. What is left in the 9.54e-7 is float32: Babylon's `Matrix` is
> a `Float32Array` and the rig divides a parent's world transform back out of every child,
> which is a few units of last place on coordinates near 15.

The five ticks are checked in as a compact table of raw integers rather than read from
`web/fight.json` at test time, because recordings are a development fixture that
`.gitignore` excludes -- a test that skipped itself on a fresh clone would be a check
that is missing exactly where nobody would notice.

**Two limits on what that table proves, and both are worth saying.** `fightPose`
*constructs* the redundancies it exploits (the head as a point on the body's axis, the
torso and legs vertical, the legs on the floor, each arm capsule's upper end as that
limb's published hand, the hilt as the right hand, the plate's centre as the left), so
the agreement check cannot discover that a future recording violates one -- it checks
the proxy against the rows, not the rows against the simulation. And the throwaway
script that asserted those redundancies against the file, over exactly these ten poses,
is not checked in and nothing re-runs it; it *was* re-run against the re-recorded
`web/fight.json` of 2026-08-11 and the table came back byte-identical, which is the only
form of provenance a gitignored fixture can carry.

Also on the plate: **every published plate in the fixture is square**, `halfWidth` and
`halfHeight` both 16384, so the five ticks cannot tell the box's two in-plane extents
apart. One synthetic oblong pose is drawn after them for that alone, and it is labelled
synthetic in the test.

### The severance check -- and no fixture severs anything

**Stated plainly, because it is a finding rather than a gap: none of the three
recordings severs a region or publishes an absent one.** Over 21083 published poses,
`severed` is zero and every region is `present`. So `a_severed_arm_drops_the_same_limb_in_both_modes`
is the only place either mode's severance rule is exercised at all, and it exercises the
same pose in both: with the left arm severed, both modes drop the arm, its hand and its
plate and keep the right arm's weapon; with the right arm severed, both drop the weapon
and keep the plate. The two bits have to be checked separately because the fixture puts
the plate on limb 0 and the sword on limb 1, so a single bit lets one half short-circuit.

### The missing-asset check -- scripted, and the asset really is taken away

Two tests, because one of them was not the shipped path.
`a_missing_room_asset_degrades_the_textured_mode_to_a_procedural_floor` serves the real
`web/assets3d/` bytes through a fetcher that answers 404 for one file, so
`loadRoomAsset` runs its real validation and its real failure path over a genuinely
absent file. With the GLB gone and again with the sidecar gone, `[Texture]` renders on
the procedural plane, the label names the stage the loader refused at, and nothing
throws. The same test then loads the real pair and gets the authored room: 26 x 18 floor
tiles and 84 perimeter walls -- the arena's published 24 x 16 plus one tile of margin on
every side, so masonry never stands where a body may -- with the walls as the only
shadow casters and the procedural plane disabled underneath. Loading twice builds one
room, which is the memoisation that stops a second press orphaning the first container.

`the_textured_mode_reaches_its_floor_through_the_stage_a_reader_presses` goes the way a
reader does instead: `setMode` on the content, the environment built on that press, the
load driven through `loadEnvironment`, the sentence read off `describe()` -- the string
`arena.ts` hangs on the label -- and `scene.render()` at the end, so "it does not throw"
is checked by drawing rather than by reading the source. It also checks that
`[Geometry]` fetches nothing at all, which is the mode guard the architecture record
promises.

### The silhouette check -- part assertion, part owed

v2-18 asks that the fighter and its equipment read at 100--250 vertical pixels without
outlines. **That is a judgement about a picture and an agent cannot make it.** What
`the_textured_proxy_is_not_sub_pixel_at_the_size_v2_18_asks_it_to_read_at` does check is
the arithmetic underneath, measured **off the meshes the proxy drew** rather than off
literals -- an earlier version of it computed the widths from raw integers written down
in the test, so no change to `client/src/arena/**` could have moved it.

At the bottom of the range -- 100 vertical pixels of a 1.8-unit body, 55.6 pixels a
world unit -- the drawn sword is **4.4 pixels** across, the drawn hand **11.1** and the
drawn plate **27.8**, and each is asserted to be its published dimension, so these are
claims about the simulation rather than about the proxy's taste. Only the bottom of the
range is checked: 250 pixels is strictly easier and a row that cannot fail is not a row.

And the body spans **120** of the 3/4 panel's 720 vertical pixels at **Span 15**, which
is the span the page actually opens on -- `adopt` overrides the default from the
recording's first frame, where the two spawn about eleven units apart. That is inside
v2-18's 100--250 window at the bottom end. The extent is each mesh's own bounding box
through the camera's transform and excludes the weapon: a rule of `centre.y +/-
scaling.y/2` over-reports a horizontal capsule by its whole length, which for a body
holding a sword out sideways is most of the answer.

**Owed to a human:** whether those shapes actually separate by eye at that size, which
is what "reads without outlines" means and what no `NullEngine` can answer.

### What an automated tab could and could not confirm

A Claude-in-Chrome tab is always `visibilityState: "hidden"` and gets no animation
frames, so it can say nothing about frame time. It can still be scrubbed -- the input
handler renders synchronously -- and it still rasterises, so the following were checked
in Chrome on the WebGPU path against `web/fight.json` and are facts rather than
inferences:

- **The dress builds and the room really loads.** The label goes
  `webgpu, geometry, 24 sources, 37 instances, 0 shadow casters` ->
  `webgpu, texture, procedural floor (not attempted), 36 sources, 55 instances, 55
  shadow casters` -> `webgpu, texture, authored room, 43 sources, 619 instances, 139
  shadow casters`. The two-stage label is the point: the procedural floor is on the
  screen before the fetch resolves.
- **The caster arithmetic is what the design said.** 55 casters for two bodies is 27.5 a
  body against the "roughly 28 nodes a body" the frame-time procedure is written
  against, and 139 - 55 = 84 is exactly the perimeter ring, `2*(26+18)-4`.
- **The round trip leaves nothing behind.** Back in `[Geometry]`:
  `39 sources, 41 instances, 0 shadow casters`. The source count grows from 24 to 39
  because both modes' materials are kept, which is what makes the second press free.
  **That "0 shadow casters" is not evidence of anything and was recorded as though it
  were**: `ArenaEnvironment.counts` short-circuited to zero whenever the environment was
  disabled, so the label and the assertion built on it were both reading the reporter
  rather than the render list. The short circuit is gone -- the counts now report what is
  retained, and `describe()` says "room parked" beside them so nobody reads five hundred
  parked instances as five hundred drawn ones -- and the claim is checked by walking the
  shadow generator's own render list in
  `pressing_texture_and_geometry_swaps_the_dress_on_one_scene_and_one_set_of_cameras`.
  The browser labels above predate that fix and are left as they were recorded.

  **The fix moved the test and left the reporter unpinned, which an adversarial review
  then caught.** Walking the `Scene` was the right thing to do and it made the assertion
  true rather than *load-bearing*: with no room loaded the render list is empty in
  `[Geometry]` for the trivial reason that the proxy's meshes were disposed, so
  reintroducing the short circuit -- a one-line edit -- left five named tests green. The
  round trip now loads the authored room first, so both numbers are non-zero on both
  sides, and `counts().shadowCasters` is compared against the walked list rather than
  trusted. The figures, printed by the test: **0 casters at the start, 139 in `[Texture]`
  with the room, 84 back in `[Geometry]`** -- the parked perimeter ring. Reintroducing the
  short circuit now fails with `0 !== 84`.
- **No console error**, on a page holding a 1024-square shadow map, PBR materials and
  the authored kit under WebGPU.
- **`?stage=off` still explains itself.** Pressing `[Texture]` there leaves the label's
  "off (`?stage=off`); the 2D panels are unaffected" sentence alone and the 2D panels
  keep scrubbing.
- **Looking at it**: the 3/4 panel shows two lit bodies on the authored stone floor
  inside its wall ring, casting shadows, with the elbow bend visible on both arms and
  the Brute's club crossing the Fighter's gold plate at tick 966 with the `weaponShield`
  contact marker on it -- which is v2-ui-02's first-person check, seen from the outside.

**What that picture does not settle, and this is the honest part:** the bodies read as
*blobs*. The published torso is 0.35 (Fighter) and 0.40 (Brute) in radius against a
0.20/0.25 head and a 0.30/0.35 leg capsule, so a faithfully drawn head sits inside the
shoulders' silhouette and the two invented legs sit under the middle of a wider torso.
Lit and shadowed it reads as a body in a room, and it does not read as a fighter with a
neck. **That is the published anatomy rather than a defect in the proxy** -- `[Geometry]`
draws the same silhouette -- and the fix, if it is wanted, is authored rigs in `v2-18`
rather than a proxy that quietly narrows a published capsule. Whether it is good enough
to proceed on is an owner's call and is on the owed list.

### Every invented degree of freedom, and where its argument lives

| invented | where | the argument |
|---|---|---|
| the elbow's bend plane | `elbowOf`, `geometry.ts` | the solve has a published root and a published target and only the plane is chosen; chosen away from the torso. **The claim is comparative and not absolute**: the published shoulder is already inside the published torso (`shoulderHalfWidth` 0.250 against a radius of 0.350 on the Fighter, 0.300 against 0.400 on the Brute), so no plane puts an elbow clear of the chest. Measured over the ten poses, the outward plane keeps the elbow 0.361/0.274 from the body axis against the inward plane's 0.201/0.126 (Fighter/Brute). **Those four are the ten poses and not a corpus-wide floor**: over all 42166 arm rows the outward elbow reaches 0.024 of the axis, and on 5 rows -- `fight-learned.json`, Fighter, limb 1, ticks 195 to 199 -- it is *nearer* the axis than the inward one. The metric fails there rather than the choice: the two solves are mirror images about the shoulder-to-hand midpoint, so an unsigned distance flips exactly when that midpoint crosses the body axis, and on all five the outward elbow is on the correct side while the inward one is 5 to 8 cm through the chest. Signed along the outward direction the outward plane wins on **every** one of the 42166 |
| **whether there is an elbow at all** | `elbowOf`, `geometry.ts` | and this is the one the plan understated. The published shoulder-to-hand distance is at or past `anatomy.armLength` on **43% of `fight.json`'s 14404 arm rows, 68% of the windmill's and 67% of the learned's** -- the actuator's `physical_reach` is horizontal only, so a low hand stretches the limb -- and on all of those the elbow collapses onto the midpoint and the two drawn capsules are collinear, which is the published capsule exactly. The transition is continuous, so the arm straightens rather than popping |
| the legs, split from one capsule | `legsOf`, `geometry.ts` | each leg is half the published radius, half a published radius off the centre line, so the pair's outside edge is where the capsule's was; everything else about them is invented |
| the gait | `gaitOf`, `geometry.ts` | constant cadence against the tick, amplitude from published speed, **never integrated** -- the arena scrubs, and a picture whose content depends on playback history cannot check a geometry claim. The cadence is 40 ticks a cycle, which is 180 steps a minute and so a *running* cadence rather than a walking one; the cost is stated where it is paid: the feet slide, and no visual on the legs may be read as evidence about footwork |
| the wrist roll | `weaponSocketFrame`, `geometry.ts` | the blade direction is published and a segment fixes only two of three axes; the roll puts the blade's flat in the one plane the pose offers, the blade's and the forearm's. Invisible this session -- the proxy's weapon is the published capsule and a capsule is round -- and load-bearing the moment v2-18 hangs an authored blade on the socket |
| `arm_*` and `hand_*` orientation | `#poseRig`, `scene.ts` | their *positions* are published to the raw unit; they point along the invented elbow, because that is what an upper-arm and a forearm bone are. Asserted directly, because every mesh is placed absolutely and no position check would notice if they pointed anywhere at all |
| the rig root's height | `#poseRig`, `scene.ts` | `pose.body[2]` is dropped for a literal zero, so the root is on the ground the body stands on rather than at whatever height the origin carries -- which is where v2-18's rigs are authored from and where the room kit's own pieces sit. Costs nothing today: the published height is zero on all 21083 poses |
| the metallic and roughness pairs | `proxyPaint`, `scene.ts` | held well below `metallic: 1`, which has no diffuse response and nothing to reflect in a scene with no IBL cubemap. **Not measured and not measurable** -- a material is set by looking at the picture, and the picture is on the owed list |
| the key light's position and intensity | `ArenaEnvironment`, `environment.ts` | the *direction* is the greybox room's own, so the authored stonework is lit at the angle it was reviewed under. The position and the 2.2 intensity are not measured: a directional light's position is only its shadow frustum's origin, and the greybox's intensity of 1.15 has eight torches adding to it where this scene has none |

`stagger` and `fall` exist as named, empty clip slots and **are never selected**. v2-18's
rule is that reactions begin only from events, and no event reaches the proxy; a
threshold on published `shock` would be a reaction this page invented, and `shock` peaks
at 0.021 world units with a 99th percentile of 0.000 over the three recordings' 21083
poses, so any threshold worth drawing would fire on nothing or on noise. `idle` and
`walk` are the two the velocity-driven gait can reach, and the split at the chosen
threshold is 63/37 on `fight.json`, 4/96 on `fight-windmill.json` and 4/96 on
`fight-learned.json`.

### The recordings were re-recorded under this session, and it reaches v2-ui-02's numbers

`web/fight.json` and `web/fight-learned.json` were regenerated on 2026-08-11 while this
session was in flight. `fight.json` came back **identical** -- the composed seed-3 fight
is deterministic, and the five-tick table was re-derived from the new file byte for byte.
`fight-learned.json` did not: it now carries 6679 published poses against 7202, 2195
contacts against 2966, and 54 weapon-shield contacts against 375.

Every number this session states was measured against the current files. **Three of
v2-ui-02's were not.** The two other fixtures re-measure unchanged -- 1491 and 2631
contacts, 430 and 188 of them weapon-shield -- so the argument those tables support was
never in doubt on either.

The first pass on this claimed all three were "superseded in place with a note", and an
adversarial review found the note in exactly **one of the six places the numbers are
written down**, attached to `FIRST_PERSON_FOV_DEGREES` rather than to the two it was
mostly about. Settled properly, and two of the three were re-derived rather than
superseded:

| what | where | what happened |
|---|---|---|
| the field-of-view table's `learned` column | `FIRST_PERSON_FOV_DEGREES` in `geometry.ts`, and [v2-ui-02](v2-ui-02-arena-scene.md#the-camera-numbers-and-where-they-came-from) | **re-derived** over the 54 contacts. The other two columns re-measure cell for cell, which is what says it is the same measurement. The shipped `25 down / 90` cell reads 94% rather than 98% and the decision stands more strongly than before -- on learned the mount now costs the attacker nothing at all. |
| `#instance`'s "309 of 2966" | `scene.ts`, and v2-ui-02's defect 1 | **re-derived**: 153 of 2195. The replay returns 136 and 350 on the unchanged fixtures, so it is the same rule and not a new one. |
| `CONTACT_AXIS`'s "5703 weapon-body contacts" | `scene.ts` (twice, at `CONTACT_AXIS` and `#drawContacts`), `render-contract.test.mjs`, and v2-ui-02 | **superseded, not re-run.** The corpus is 5512 -- 1061 + 2352 + 2099, re-derived -- and the buried-marker sweep's own percentages are the old corpus. A sweep is a measurement and re-running one is the work of a session that wants the answer; nothing about the choice turns on it, since the bound is a published radius and 3413 of the 5512 come from fixtures that did not move. |

The re-derived contact counts, in full, so the next session does not have to take any of
this on trust: **1491 / 2631 / 2195** contacts, of which **1061 / 2352 / 2099** are
`weaponBody` and **430 / 188 / 54** are `weaponShield`; **21083** published poses, **42166**
arm rows and **10542** published shield plates.

### One bug the frames caught, worth recording

`bodyAxes` returned the body's **right** while calling it `left`. The legs are symmetric
so they looked identical either way, but the elbow's bend plane is chosen against that
vector, so both elbows bent *across the chest* -- the exact failure the plane was chosen
to avoid, arrived at through the vector rather than the choice. It surfaced as a
determinant: `yawFrame` was built from it and came out at **-1**, and a reflection handed
to `Quaternion.FromRotationMatrixToRef` is not the quaternion of anything, so the body
faced world `+x` at every yaw. `the_body_frames_the_proxy_is_built_on_are_rotations_rather_than_mirrors`
now checks every frame the proxy builds for orthonormality and determinant `+1`, which is
the same argument `the_arena_axis_mapping_is_a_rotation_rather_than_a_mirror_of_the_world`
makes one level up.

### The measurement this session owes

**Frame time, `[Texture]` with shadows against `[Geometry]` (p50 / p95 / p99):
_not yet measured_. Paired delta: _not yet measured_.**

**An agent cannot take this number and must not invent one.** The procedure below is
v2-ui-02's, which already obeys all three of AGENTS.md's probe rules, with the mode
press added -- and the mode is exactly the right thing to measure this way, because
`?stage=paired` alternates the *viewports* while the mode is a property of the scene, so
the two configurations are one page load apart rather than one frame apart. The
comparison is therefore two paired runs, each internally controlled, plus the baseline
repeated at the end.

Shadow casting is the plausible regression and the reason the comparison is worth
having: `[Texture]` puts roughly **28 nodes a body** in the caster list, plus **84 room
walls**, into a 1024-square shadow map. `[Geometry]` casts nothing at all, because it has
no light.

**What to run, in a normal focused Chrome window, with `npm run view` serving.** The
probe is the snippet in
[`v2-ui-02`](v2-ui-02-arena-scene.md#the-measurement-this-session-owes); only the URL and
the button press change.

1. `http://localhost:5173/#/arena?stage=paired`. Wait for the fight. Leave **Span** and
   **Azimuth** at whatever the page opened on -- it picks them from the recording's
   first frame, which is Span 15 on this fixture, and the two runs have to be at the
   same framing rather than at a memorable one. Scrub to **tick 800**, leave
   `[Geometry]` pressed, press **Play**, window focused and frontmost. Run the probe.
   Record `all`, and `pairedDelta` -- the cost of the three viewports in `[Geometry]`.
2. Same page, press **[Texture]**, wait for the label under the 3/4 panel to say
   `authored room` rather than `procedural floor`, scrub back to **tick 800**, press
   **Play**. Run the probe. Record `all` and `pairedDelta` -- the cost of the three
   viewports in `[Texture]`, with the room, the lights and the shadow map.
   **The difference between the two `pairedDelta`s is what the dress costs.**
3. If both populations sit on the vsync interval, remove headroom before believing it:
   enlarge the window, or raise the density cap in `createArenaStage`, until the shipped
   configuration leaves 16.67 ms and the control does not.
4. Optionally `?stage=paired&backend=webgl2`, to price the WebGPU path against the
   fallback under a shadow map.
5. **Repeat step 1 exactly**, last, as the control. A run whose baseline drifted between
   its ends measured the machine rather than the page.

Write the four numbers into the blank line above, with the GPU and the browser build
beside them.

### What an adversarial review found afterwards

Nine defects, all fixed in this tree. Recorded rather than deleted, because seven of the
nine are the class this repository says is worst: a test or a comment that was **already
green while asserting something the code does not do**.

1. **The `load` memoisation was untested and the test named for it proved the wrong
   thing.** The check awaited load #1 before starting #2, so the equality it asserted was
   satisfied by `#load`'s own `if (this.#room !== null) return this.floor` early return
   and replacing `#loaded ??=` with a plain `#loaded =` left both named tests green.
   `the_authored_room_is_fetched_once_however_many_times_texture_is_pressed` now covers
   the two cases that need the memo, and both fail on that mutation with the costs the
   comment claims: a press while the megabyte is in flight goes from 2 fetches to 4 and
   from one `AssetContainer` to two (13 source meshes in the `Scene` become 26), and three
   presses after a 404 go from 2 fetches to 6.
2. **"Every proxy caster left the render list" could not fail, and its comment claimed
   the opposite.** It said deleting the `removeShadowCaster` call in `#retire` used to
   leave it green, implying it no longer did. It still did. Measured on Babylon 9.18.1 for
   a `Mesh` and an `InstancedMesh` alike: `dispose()` already splices the mesh out of
   every shadow generator's render list, so `removeShadowCaster` has no reachable effect
   in this file and `StageNode.caster`'s second justification was false. The flag keeps
   its first -- `removeShadowCaster` is a linear scan and forty-odd `[Geometry]` meshes
   should not each walk 139 casters to learn they were never one -- and both comments now
   say so. The assertion was folded into 3, where it is the statement that the list is
   *exactly* the parked room and holds none of the proxy's meshes.
3. **The `counts()` short circuit could be reintroduced and nothing went red**; see the
   round-trip bullet above. Now `0 !== 84`.
4. **`counts()`'s comment contradicted `describe()`'s forty lines below it, and the
   measurement.** "Zero in `[Geometry]`, which has no light for a shadow to come from" is
   true only until `[Texture]` is first pressed; after a press the parked room's 84 wall
   casters are still there, which is the whole reason `describe()` says "room parked".
   That sentence was the reading the short circuit's removal existed to prevent, left
   behind by the fix.
5. **Three stale figures, and the supersession note in one of six places.** Settled in the
   table above.
6. **The agreement tolerance's stated cause was wrong**; see the agreement check above.
   The dominant term was a modelling disagreement about the published normal's length, not
   float32, and it is now removed rather than budgeted for. Worst gap 2.19e-6 -> 9.54e-7.
7. **"The elbow bends away from the torso" is refuted by the recordings.** The per-pose
   assertion compared *unsigned* distance from the body axis and the test sampled ten
   poses of `fight.json`; over all 42166 arm rows the unsigned form has 5 violations, all
   `fight-learned.json`, Fighter/limb 1, ticks 195 to 199. The metric fails there, not the
   choice -- the two solves are mirrors about the shoulder-to-hand midpoint, so an
   unsigned distance flips exactly when that midpoint crosses the axis, and on all five
   the outward elbow is on the correct side while the inward one is 5 to 8 cm through the
   chest. The assertion is now signed along the outward direction, which holds on every
   one of the 42166 rows, and the five violations are recorded at `elbowOf`.
8. **`arena.ts`'s mode block claimed a property the code did not have.** It said a press
   with no stage yet "chooses a mode for the panels they will have next time"; `startStage`
   never read the buttons, so a press landing between `setMode("geometry")` and
   `stage = built` -- a dynamic chunk import plus an adapter request -- left `[Texture]`
   reading `aria-pressed="true"` over a `[Geometry]` scene, with the button that would fix
   it already saying pressed. The route now holds the pressed mode and `startStage`
   applies it the moment it has a stage.
9. Three smaller ones. `browser-runtime.md`'s `scenePoint` anchor pointed at ` */` rather
   than the function. The `## Decision` above was never answered. And the checked-in
   `FIGHT_BODIES` fixture wrote `equipmentMask: 6` for both bodies where the recording
   publishes 2 for the Brute -- cosmetic, since nothing on the page reads it, and the one
   field in that table that was not the recording's.

The review also re-derived what it did not find fault with, and all of it held: the
agreement check is genuinely checking agreement, the five ticks hide nothing, the row
table is byte-exact, every fixture-wide figure re-derives, nothing cosmetic feeds back,
the toggle rebuilds and leaks nothing over eight round trips, degradation is broader than
claimed, all 20 `v2-18` node names are present and correct, and severance gating is
load-bearing in both modes.

### What is still owed to a human

- **The frame times.** Above, blank, with the procedure. This is the one thing standing
  between the session and a `pass`, and it is blocked rather than skipped -- see the
  `## Decision` above.
- **The silhouette judgement** -- whether the proxy reads at 100--250 vertical pixels
  without outlines. The arithmetic is asserted; the picture is not.
- **Whether the dress is any good.** Nothing here says the fighter looks right, only
  that it stands where the simulation put it. `[Geometry]` is one keystroke away and is
  what settles any suspicion that it does not. The specific question an owner has to
  answer is the one above: a faithfully drawn published anatomy reads as a blob, and
  whether that is acceptable until `v2-18` is not an agent's call.
- **The authored room in the arena, seen.** The load, the hashes, the instance counts
  and the placement are asserted over a `NullEngine`; that the room reads as a room
  around two fighters at this scale is not.
