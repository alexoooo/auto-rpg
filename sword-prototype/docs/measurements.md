# What has been measured, and what is still owed

Every number in this directory that is not a tuned constant. The tuned constants live in
`src/config.ts` beside the tables that set them, which is where they belong; what is
collected here is the cross-cutting evidence -- the policy corpus, the takeover readings,
the arm's parity across a refactor -- and the list of questions no harness can answer.

## The rule that governs all of it

**A reading is only comparable with another taken in the same harness, and every figure
below names its harness.**

There are two. The **page** is a browser at `http://localhost:5180/`. The **bench** is
`scripts/measure.mjs` and its relatives: `NullEngine`, real Havok, no rendering. They
reproduce each other on converged behaviour and they **disagree by about 9 % on the arm's
peak transient with identical code** -- 264.97 mm in the page against 242.88 mm in the
bench -- and why is not established. See "The arm's parity" below for what was eliminated.
Neither is wrong. Putting them in one column is.

## Taking a reading in the page

`window.__sword` is the whole surface, and these are the handles the readings below were
taken through. Nothing here needs a rebuild.

```js
// Drive a fighter from a script, which is how a repeatable sweep is taken.
let x = 0.6;
__sword.right.mind = { name: "sweep", decide: (view, dt) => {
  x = Math.max(-0.6, x - (dt / 0.25) * 1.2);
  return { ...__sword.controls.state, pointerX: x, pointerY: 0 };
} };
// To put it back, hand it a mind that asks for nothing; a real policy comes back
// on the next `R`, since the matchup is what `policyMind` is read from.
__sword.right.mind = { name: "idle", decide: () => ({ ...__sword.controls.state,
  forward: 0, strafe: 0, turn: 0, pointerX: 0, pointerY: 0,
  thrust: false, guard: false }) };

__sword.right.view          // exactly what any mind is being shown
__sword.takeover.take("left")  // mid-swing, which is not a moment you can click on
__sword.takeover.last       // { at, taken, released }, each with commandMm and tipMm
__sword.rigview.audit()     // body and mesh counts across a toggle cycle
__sword.config.bout.capSeconds = 5          // sixty seconds is a long time to watch
__sword.config.body.gaitDrivesLegs = false  // take the stride off the leg joints
__sword.config.takeover.rebaseSeconds = 0   // the control condition for the rebase
__sword.left.applyTuning()  // motor ceilings and damping are set on native objects
```

Two rules apply to anything read this way, both earned the hard way and both in
`AGENTS.md`: **force `computeWorldMatrix(true)` on every node the reading touches**, and
**force the bodies awake** with `setActivationControl(body, 1)` before trusting a
rest-state figure, because Havok deactivates the arm and a sleeping body reads a perfect
zero no matter how badly it shakes when awake.

## The three policies

`npm run measure`, about 90 s. N = 100 bouts per matchup, run at two independent seeds.
Sides swap every other bout, so a policy fights half its bouts in each corner and the arena
cancels -- the two corners are genuinely not identical, since the left fighter's bodies sit
fifteen places further up Havok's list and each holds its sword on its own side of a shared
centre line.

Bouts differ from one another **only in the policies' own timing** -- cadence jitter, the
wander in a stroke, start offsets -- seeded per policy per bout. Nothing about the physics,
the starting positions or the bodies varies at all, because a distribution whose samples are
of slightly different simulators is a distribution of the harness.

| claim | threshold | seed 20260823 | seed 777001 | verdict |
|---|---|---|---|---|
| `swinger` beats `idle` | > 90 % | **100 / 100** | **100 / 100** | met |
| `duelist` beats `swinger` | > 60 % | **81 / 100** | **83 / 100** | met |
| `duelist` median hit edge alignment above `swinger`'s | -- | **0.654** v 0.556 | **0.673** v 0.564 | met |
| `swinger` peak tip speed | >= 11 m/s | **40.04 m/s**, 36.44-42.22 | **39.80**, 36.68-42.75 | met |

Reproduced independently at a third seed the session that wrote the table never used --
**seed 424242, N = 40**: `swinger` over `idle` 100 %, `duelist` over `swinger` 75 %,
median edge alignment 0.643 against 0.566, stroke peak 40.10 m/s. Every claim holds, so the
thresholds are not fitted to the corpus that produced them.

No draws in either run of either decided matchup, and `duelist` versus `duelist` was
**decided 100 / 100 at both seeds** -- it terminates because of `patience`, since an
exchange a duelist has been refused for long enough is one it takes anyway. Two policies
that both wait for an opening never find one, because a guarding blade is by definition in
line.

Bout lengths, mean and range: `swinger`-`idle` 17.90 s (6.12-34.52), `duelist`-`swinger`
5.28 s (1.67-12.62), `duelist`-`duelist` 10.38 s (1.65-39.13), against a 60 s cap.

Corpus at seed 20260823, mean (range) per bout:

| | `swinger` v `idle` | `duelist` v `swinger` | `duelist` v `duelist` |
|---|---|---|---|
| `swinger` contacts | 142.4 (46-280) | 44.4 (8-122) | -- |
| `swinger` damage | 551.3 (235.6-1292.1) | 228.0 (2.6-551.3) | -- |
| `duelist` contacts | -- | 29.9 (0-109) | 23.2 (1-114) |
| `duelist` damage | -- | 206.7 (0-485.8) | 228.0 (11.0-518.9) |
| `idle` damage | 0.00 (0-0) | -- | -- |

`idle` scored **nothing at all in 100 bouts, on 17 381 contacts.** It is a control condition
and it behaves like one: it holds its blade out level because a centred cursor is a level
arm, so a fighter walking into it grinds against a stationary edge -- and every one of those
contacts is below `combat.minCutSpeed`, which the damage model gives a hard zero. Nothing
in the win column is being carried by the control.

### Why the stroke figure comes from a dedicated bench

The fourth claim is answered by `npm run measure -- --only swing`, not from inside a bout,
and the reason is a fact about the instrument rather than about the policy. Two exclusions
are mandatory for any tip-speed reading (both are in `AGENTS.md` as traps):

- the first 0.6 s, because both arms are built hanging straight down and the anchor
  keyframes onto the commanded pose on the very first control step -- a snap worth **77 m/s**
  in a fighter that never swings;
- a quarter second after any contact, because a blade that is *struck* spins past anything
  a motor could do, measured over **100 m/s**.

With both applied, `swinger` versus `idle` starves rather than answering: the blade is in
near-permanent contact with a body that never moves, a quiet window almost never opens, and
the in-bout figure collapses to 3.95 m/s at 0 of 100 bouts clearing the reference speed. So
the claim is settled by the real `swingerMind` driving a real arm through the real solver,
shown a written-out view of an opponent that does not exist in the arena: **28 swings,
40.04 m/s mean, 36.44-42.22, 28 of 28 above the reference speed.**

Where it can be read in a bout it is reported: against `duelist`, `swinger` clears the
reference speed in 92 of 100 bouts (mean peak 33.98 m/s) and `duelist` in 98 of 100
(36.16 m/s). The handful that do not are bouts decided in under two seconds, which never
contain a quiet window at all.

**A swing measured from rest is a floor, not an estimate.** Driving the swinger's commit
stroke from a settled chamber pose peaks at 22.2 m/s; the same stroke as the fourth leg of a
running cycle peaks at 40. The chamber hands the commit a blade that is already travelling.

### The wrist roll, where a sign error is invisible

The difference between a cut and a slap is which way the edge is turned, and getting it
wrong looks identical and simply does no damage. Both policies derive the roll analytically
in `rollForStroke`; measured through the solver on the swinger's own stroke, edge alignment
at the peak of the swing:

| roll | edge alignment | worth, after `combat.edgeExponent` |
|---|---|---|
| -0.925 rad, what the derivation gives | **0.955** | 91 % of a full cut |
| 0, no roll at all | 0.740 | 55 % |
| +0.925 rad, the sign flipped | 0.126 | 2 % |

`tests/minds.test.mjs` pins the **sign** against those readings rather than only bounding
the magnitude.

## The takeover

Commanded hand position in the torso's own frame, before and after the swap -- torso-local
so a fighter's own walking is not folded in, commanded rather than achieved so the blade's
legitimate travel is not either. Taken in the **bench**, one fighter sweeping 1.8 cursor
units every half second, taken at four points of the sweep, in millimetres:

| tip speed at the swap | take, seeded | take, bare | give back, seeded | give back, bare |
|---|---|---|---|---|
| 20.49 m/s | **0.000** | 257.2 | **0.000** | 270.5 |
| 13.42 | **0.000** | 365.7 | **0.000** | 379.4 |
| 9.79 | **0.000** | 462.9 | **0.000** | 476.9 |
| 6.74 | **0.000** | 506.4 | **0.000** | 520.5 |

Exactly zero, not nearly zero: the seed is the inverse of the map the arm is about to apply
and the round trip is exact. "Bare" is the same swap with the seed removed. Note that
**giving a body back is the worse of the two directions**, so a version that seeded only the
taking half would have fixed the half that was easier to notice.

The anchor-to-hand error is the wrong instrument for this and the blade tip is worse. The
error line already reads 242 mm at the peak of a full-envelope sweep, so mid-swing it cannot
tell a teleport from a swing; and a tip at 20 m/s covers 83 mm in a single substep no matter
who is holding it -- measured across the substep after a swap, 21 to 68 mm seeded against 27
to 76 mm bare, not even ordered.

**The rebase window, measured in the page**, over the 24 frames after a takeover with the
cursor parked in the far corner so the rebase has the whole envelope to cross:

    rebase 0.25 s (shipped)   first frame  73.0 mm   worst frame 179.5 mm
    rebase 0 s                first frame 228.0 mm   worst frame 228.0 mm

Which is the argument for the rebase, measured: the seed alone makes the takeover *frame*
exact and leaves a 228 mm lurch on the one after it.

**A takeover cannot land a free blow, so do not halve the window.** Worst case set up
deliberately -- fighters 1.40 m apart, cursor in the far corner, taken from the console with
`__sword.takeover.take("left")`:

    peak tip speed during the rebase window   2.04 m/s   (minCutSpeed is 3.0)
    opponent total health                     877 -> 877
    scoring blows credited to the taken body  0

One reading looks like a contradiction and is not: taking a body while its policy is
*mid-swing* shows the tip moving 179.5 mm in a frame, which is 10.8 m/s. That is the swing
the policy had already committed to, carrying through the handover exactly as it should --
the arm has momentum and taking the body does not confiscate it.

## The arm's parity across the `Hero` -> `Fighter` merge

The standard manoeuvre: settle at `pointerX = -0.6`, sweep to `+0.6` over 0.25 s, hold for
1 s. Bodies forced awake with `setActivationControl(body, 1)`, stepped by
`scene._advancePhysicsEngineStep(1000/60)` with no rendering. **Bench figures.**

| reading | before | after | |
|---|---|---|---|
| anchor-to-hand at rest | 0.00 mm | 0.00 mm | unchanged |
| anchor-to-hand, peak during the sweep | 221.74 mm | 242.88 mm | **+21.1 mm, +9.5 %** |
| peak tip speed during the sweep | 10.62 m/s | 10.62 m/s | identical |
| elbow drift over the hold | ~264 mm | 282.2 mm | same band |
| anchor error after the hold | 0.00 mm | 0.00 mm | unchanged |

Elbow drift alternates between two attractors at 263.4 and 282.2 mm depending on where in
the ring-down the window closes; before and after both sit in that band. It is a **windowed
path length** over the last second and reports nothing at all if sampled before its window
has filled -- which is how a "0.00 mm" baseline was first recorded and then corrected.

**What that +9.5 % is not.** Four hypotheses were tested and all four refuted:

- *Solver islanding.* Severing all eight non-arm limbs, which disposes their constraints and
  takes them out of whatever island the arm is in, leaves the figure at 242.88 mm exactly.
- *Solver visiting order.* The arm was rebuilt first so its bodies occupy exactly the engine
  indices `Hero` gave them ([15] torso through [21] elbowAnchor). The reading did not move,
  over six consecutive runs. And the two fighters, whose arms sit fifteen bodies apart in
  Havok's list, read **bit-identical** to each other -- 262.59 mm, 11.18 m/s, 0.34 mm at rest.
- *The `Mind` seam.* Stubbing `Fighter.prototype.observe` to a no-op in the page gives
  264.97 mm / 11.19 m/s / 0.475 mm, identical to leaving it live, and identical again when
  restored. In the bench, `bare` and `observe` orderings both read 242.88 / 10.62 / 0.000.
- *The render id and the rig overlay.* Frozen and advancing both give 264.97 in the page;
  264.97 with the overlay down against 264.68 with it up.

**What is left.** The page reads 264.97 mm where the bench reads 242.88 on identical code,
in both modes, so the disagreement predates the seam. The page has things the bench does not
-- costumes parented to the physics meshes, `Combat`'s collision callbacks, the aim
indicator, shadows, a post-processing pipeline -- and one of them is worth 9 % of a
transient. Which one is not established, and it could not be bisected because the two builds
to compare were never committed. **That is a process failure, not a physics one.**

What is safe to say: the converged behaviour is sound in both harnesses -- the bench reaches
0.000 mm at rest, the page's 0.475 mm floor appears in both builds, peak tip speed is
bit-identical, and therefore the damage model, which is built from tip speed, is untouched.
What moved is the transient lag at the fastest moment of a sweep, which is exactly the
quantity that makes the weapon feel heavy, so the last word belongs to somebody playing it.

## The body holds its pose

The training dummy did not, and the arithmetic is worth keeping because the symptom looked
like something else entirely. Its root joint locked all three linear axes between anchors
450 mm apart, and the solver did as it was told:

| part | built | settled |
|---|---|---|
| head | 1.700 | 1.243 |
| torso | 1.340 | 0.883 |
| pelvis | 0.980 | 0.532 |

One rigid translation, which is why the sag looked uniform rather than progressive. Every
angular motor at 40 000 N.m -- over a thousand times the shipped 34 -- moved the head by
**zero**, which is what took stiffness out of the running.

`Fighter` derives every pivot from an absolute height. **Both heads hold 1.6600 m for 30 s,
0.0 mm of drift**, measured in the page with the bodies forced awake.

## The overlay and the costume

- `__sword.rigview.audit()`: **45 bodies and 104 meshes, unchanged across 10 cycles**, and
  the body count holds over 50. The overlay creates no physics object, which is its central
  promise.
- `public/assets/warrior.glb`: 24 nodes, **15 712 triangles per fighter**, up from 15 424
  before the articulated-waist overlap and all-family tangent frames. Both fighters carry
  31 424 triangles in 48 costume meshes; `G` strips and restores all 48.
- Dimensional check (`npm run asset:verify`): floor 0.0 mm, crown 1.800 m against a
  `fighter.height` of 1.800. The digest is pinned in `scripts/run-blender.mjs`; it pins the
  *file*, not the build, because Blender's glTF exporter is not byte-reproducible.
- Fallback verified by renaming the asset away: the page boots clean, no uncaught error,
  heads still hold 1.660 after 10 s, triangles drop to 10 952 primitives.

Session 08's static asset/material audit, not a visible-browser GPU capture:

| character-surface build | triangles / fighter | character draw submissions | committed texture JPEGs | estimated RGBA8 mip footprint |
|---|---:|---:|---:|---:|
| session-07 baseline | 15 424 | 48 for two fighters | 2.87 MiB / 5 maps | 26.7 MiB |
| cloth/skin/leather/steel | **15 712** | **48 for two fighters** | **7.83 MiB / 15 maps** | **80.0 MiB** |
| + weapon/object families | **15 712** | **48 for two fighters** | **10.94 MiB / 24 maps** | **128.0 MiB** |
| + room wall/timber/banner | **15 712** | **48 for two fighters** | **16.97 MiB / 33 maps** | **176.0 MiB** |

The draw count is the mesh count -- no piece was split or merged -- and the memory column is
the conservative decoded RGBA8 mip-chain calculation, not a driver reading. Three Terlenka
maps are 1024x1026; the other thirty are 1024 square. The visible frame-cost bracket and
material-readiness table remain open human-browser checks.

Session 10's NullEngine/Havok audit sees **48 environment meshes, 27 instances and 15 world
bodies**: the invisible 60 m slab, fourteen visible posts, one cosmetic floor and 32 room
pieces across five instance groups. It names fifteen visual-to-collider pairs -- floor to
ground and each post to itself. Twenty consecutive audit calls across each of ten rebuilds
return the same report identity, leave mesh, material, texture, instance and body counts flat,
and ignore an unrelated scene mesh/material/map. Disposal returns all four scene counts and a
real `ShadowGenerator` render list to their pre-room baseline. Replacing the 27 instances with
clones reports zero and makes the sharing test fail; promoting one flat rack marking to a
solid or lowering one overhead beam below 3.6 m makes the admission test fail. Wrong,
body-free and geometrically distant collider names each fail independently, including a
centered rack falsely paired to `post0` through the ordinary build path. Racks and debris are
zero-height floor markings: no claim about an animated fighter becoming unreachable beyond
the slab is needed or made.

This is not a browser rendering measurement. Instanced-mesh count is not a measured draw-call
count, and a hidden tab cannot supply one. Runtime rays end at the actual pelvis/torso/head
centres of both fighters and live arrow root/trace endpoints through a bout-cached target
list. Segment/AABB geometry sweeps both camera presets, both zoom clamps, eight bearings and
translations across the support, including opponent/arrow points outside the former local
stencil; a forced crossing also proves per-instance overhead-beam culling. Cull -> shadow
refresh -> reveal retains the beam's caster membership. It is not a screenshot. Visible occlusion/material
judgement and the required control -> subject -> control frame-cost bracket on both machines
remain owed to the coordinated browser pass, so session 10 is not yet accepted.

Session 09 adds no warrior triangle or draw submission. Runtime construction tests pin the
existing visual/physics pairs at sword 5/3, axe 5/2, bow 7/2, shield 4/1, buckler 4/1 and
club 5/2 meshes/leaves; a pooled arrow remains four visual meshes and one striker shape.
The same test pins each kind's mass, centre of mass, compound-leaf offsets and dimensions,
membership/collision masks and striker identity. It is an authority-layout proof, not a
claim that an unrecorded before-build fight was byte-identical. The headless measurement
harness imports neither `arena.ts`, `materials.ts`, `surface.ts` nor the texture registry, so
its current green seed is a health check rather than evidence about the new PBR path. The
existing arrow test does make the narrower behavioural comparison with the projectile visual
root enabled and disabled, pinning both position and cached arrival velocity. A direct
before/after bout comparison remained open until the integrated cosmetic-parity pass below.
One hundred shots hold meshes, bodies, observers, materials and texture wrappers flat, and
ten complete fighter rebuilds return those resources to baseline. A deliberate mutation
from `root.dispose(false, false)` to texture-owning disposal makes the two-sword shared-map
test fail. The visible combat-distance material and contrast verdict remains owed to the
matched integrated playtest.

## The two arms, and what they cost

Peak and mean commanded-to-actual hand error on the driven arm, over a fixed cursor sweep,
in the **bench**. `.review/club-probe.mjs` takes it. The sweep is not the one that produced
the 242.88 mm figure elsewhere in this file, so the numbers are comparable with each other
and with nothing above.

| build | peak mm | mean mm | reversals/s |
|---|---|---|---|
| one arm, sword (before the second arm existed) | 45.27 | 4.21 | 40.2 |
| two arms, sword and an empty hand | **45.16** | 4.21 | 40.2 |
| two arms, sword and a shield | 45.27 | 4.21 | 39.4 |
| two-handed club | 46.63 | 4.95 | 87.3 |

**A second arm costs the first one 0.11 mm of peak error**, which is a fifth of a per cent,
and a shield in it costs nothing measurable at all. That is not luck: both arms hang off a
torso that is keyframed, so the extra mass never reaches the shoulder the measurement is
taken at, and the only coupling left is solver ordering.

Extracting `Arm` out of `Fighter` moved the reading by **nothing**: 45.27 mm before and
45.27 mm after, identical to the hundredth of a millimetre across 2 255 solver steps. That
was the acceptance for the refactor, and a change of that size in a chaotic constrained
chain is a change of no bits at all.

The club's two tuning sweeps -- why the trailing grip is unmotorised and why the leading one
is worth two arms -- are in `config.ts` beside `club.trailingGrip`, because they are what
set those two numbers.

## The test tiers

- `npm test` -- **278 tests**, 8.5 s on the 2026-08-24 session-09 gate, no browser. `tests/view.test.mjs`,
  `tests/handover.test.mjs` and `tests/death.test.mjs` run the real solver under
  `NullEngine` and cost about 1.4 s between them; they earn it because the defects they
  guard are invisible to a pure test.
- `npm run measure` -- the bouts, about 90 s, deliberately **not** in `npm test`, because a
  default test run that takes minutes is a test run nobody runs.

Every assertion in the pure tier has been watched failing against a purpose-built mutation
of the thing it is about: twelve mutations of `bout.ts`, twenty-seven across the policies,
six reintroductions of the `observe` defect, and four of death -- `die()` never called
(5 of 7 fail), the torso left `ANIMATED` (1), the early return removed from `update` (2),
and `deadJointStrength` ignored (1). Four assertions were rewritten because the
first version of each was satisfied by its own setup and survived the mutation. See the
`AGENTS.md` entry on green tests that assert nothing.

The bench's speed, measured rather than estimated: 300 bouts totalling about 3 390 s of
simulated time took **86 s of wall clock**, roughly 39x real time. An earlier probe that
stepped an arm alone read 250x; a bout steps two whole fighters, thirty dynamic bodies,
twenty-four constraints and a contact stream in the hundreds.

## What is still owed

None of this was skipped for want of effort. Most of it is a judgement about how the game
*feels*, which is not a thing a bench can be pointed at.

The list used to open by saying the tabs this was built in render a black canvas, because
Chrome does not paint WebGL in a hidden window and pauses `requestAnimationFrame` there
altogether. That is still true and it is no longer a wall: step the world by hand and call
`scene.render()` yourself and the canvas paints, which is how the shields and the axe were
finally looked at. The first playtest has now closed the two cheap questions that decided what
to build next: `swinger` is beatable, the knees look good, and neither timing nor gait needs a
repair before the body-control work. Items 11 and 12 are one arm defect measured from two
directions; item 14 still needs a person to price the axe's missing thrust.

The former whole-body implementation plan is closed and deleted. Its durable outcomes are
the dated posture, bare-hand, action-option, learning and integrated close-out sections below;
the numbered list here now carries only playtest history and judgements that remain useful.

1. **Done: a human can beat `swinger`.** Played on 2026-08-23 with the shipped cycle --
   chamber 0.34 s, commit 0.13 s, follow 0.10 s, recover 0.42 s -- and won. The policy is
   therefore winnable and its timing stays where it is. This verdict closes the criterion;
   it is not a claim that the matchup has been fully balanced.
2. **Does the sword draw as three boxes under `G`, with the pommel protruding past it?** If
   it looks like five, the overlay is drawing render meshes and is worthless. It is the
   sharpest check on the instrument the rest of this file leans on.
3. **Does body-relative aim still read under the Fixed camera**, once screen-right and
   body-right have parted company? Also whether a blade held high leaves the top of the
   frame at both zoom clamps. The verdict recorded in `docs/design.md` is provisional.
4. **Done: the gait-driven knees look good.** Played on 2026-08-23 with `G` up. They do not
   chatter, so `body.gaitDrivesLegs` remains true and the straight-leg fallback remains a
   diagnostic rather than the shipped pose.
5. **Surface implementation done; the first visible verdict is in.** Both warriors now use the same
   digest-pinned cloth, skin-detail, leather and worked-steel maps, with distinct disposable
   crimson/blue cloth tints. Authored/fallback family parity and a conservative four-corner
   waist AABB are mutation-tested. The 2026-08-24 browser pass showed readable open faces,
   worked steel, leather and cloth, distinct crimson/blue sides and no visible waist break in
   Fixed and Overhead stills at the default zoom. Both zoom clamps and a walking/crouching
   comparison remain open; one well-lit still is not an art-direction sign-off.
6. **Frame cost**, bracketed control -> subject -> control, on both machines, and the recoil
   table `config.ts` asks for beside `body.jointStiffness`. Both need a visible browser.
7. **First visible corpse pass done; paired strength verdict owed.** `body.deadJointStrength` is 0.08 on an argument
   rather than a reading -- it puts the waist at 59.84 N.m against its living 748 and a knee
   at 16.32 against 204, both confirmed in the page. A melee torso death and a one-arrow
   torso death both collapsed into coherent, recognisably jointed corpses without exploding
   or continuing to fight. That is one default-strength observation, not the missing paired
   0.08-versus-0.3 judgement. It is live-tunable on a body already on the floor:
   `__sword.config.body.deadJointStrength = 0.3; __sword.left.applyTuning()`. Write the two
   readings beside the number.
8. **Blood reads, but the scale still wants a broader play pass.** Every figure in `CONFIG.blood` is a first guess set to be
   legible in a still frame. The failure to watch for is the opposite of the usual one: not
   too little, but a cut that fills the screen and hides the blow that caused it. The
   lifecycle is proven -- a burst is collected 1.0 s after it fires and a stump 3.85 s
   after, both measured by hand-stepping `__sword.blood.update(1/60)` and reading
   `__sword.blood.count`, with `scene.meshes` flat at 104 throughout. The 2026-08-24 melee
   still showed a dense central spray, but both fighters, team colours and the causing blow
   remained readable. More loadouts and a visible foreground tab are still needed before
   changing the first-guess constants; the automated browser rendered at 1--2 fps and is not
   performance or feel evidence.

9. **Character surfaces implemented; first visible comparison passed.** The warriors remain a
   deliberately welded low-poly silhouette, but they are no longer four flat colours:
   cloth, skin detail, leather and worked steel have separate CC0 PBR families, consistent
   authored texel density and total piece-to-family mapping. The earlier disappearing-map
   failure is closed by delayed attachment and colour fallback. A matched Fixed/Overhead
   browser sample showed the material families and side tints as distinct at combat distance.
   The two zoom clamps and motion comparison remain owed, so this closes basic readability
   rather than the whole art-direction verdict.
10. **Done.** This entry recorded that no policy knew what a shield was for, and that an
   `idle` fighter given one took *more* damage than one with two empty hands -- 90 against
   28. Closing it needed the two-handed `FighterView` the entry called for, and that is what
   session 03 built. `duelist` now takes **160.8** damage with a shield against **284.5**
   without, and dies 0 times in 24 against 7. See "Two hands, and what a shield is finally
   worth" above. `idle` is unchanged and stays the control: a fighter that does nothing gets
   nothing from a shield, which is correct.

11. **Done: the two hand envelopes and wrist commands are anatomical and mirrored.** Roll is
   bounded to forearm pronation/supination, wrist bend is an independent 0..90-degree command,
   and cursor/pose inversion takes a hand name. The primary-inverse-on-secondary, unbounded
   roll and missing-bend mutations all made their named tests fail. The exact close-out and
   its non-comparable shield readings are in "Anatomical wrist and mirrored-hand close-out"
   below.

12. **Done.** The
   secondary arm now has its own mirrored envelope and socket, so it is no longer driven
   through primary-hand geometry. Arrow first-contact ownership now lets shield and buckler
   bodies intercept a projectile before it can wound through the same solver step. In the
   seed-20260824, 40-side-swapped harness the shield recorded 170 plate contacts and 7 defender
   wins, the buckler 477 and 9, while empty hands recorded no plate contact and no win. Final
   defender vitality was 0.112, 0.306 and 0.040 respectively. Raw damage is not directly
   comparable because successful defence extends the bout and therefore admits more shots;
   contact, vitality and outcome together are the durable effectiveness evidence.

13. **An idle arm cannot hang all the way down**, and the reason is the envelope
   rather than the pose. `arm.restPointerY` sends an unused hand to the bottom of the
   cursor range, and the bottom of the cursor range is `elMin` = -1.05 rad -- sixty degrees
   below the horizontal, not ninety. Measured, idle, bench, three seconds settled:

   | elMin | off hand, below the shoulder | forward |
   |---|---|---|
   | -1.05 (shipped) | 0.39 m | 0.24 m |
   | -1.25 | 0.43 m | 0.16 m |
   | -1.45 | 0.45 m | 0.07 m |

   -1.45 is an arm by the side and it is **not** shipped, because `elMin` is a controller
   surface and not a cosmetic one: `rollForStroke` derives the wrist roll from the cursor
   stroke through `elevationOf`, so widening it moved `swinger`'s pinned stroke roll from
   -0.925 to -0.888 rad and failed the test that holds that number. Changing what every
   policy's wrist does, and what a low guard can reach, to improve how a resting arm looks
   is a trade somebody should make deliberately at a browser. The alternative is a rest path
   that does not go through the cursor at all, which is a second code path into `Arm.aim`.

14. **Half of what the axe costs cannot be measured here, and it is the interesting half.**
   An axe has no point, so a thrust with it is a shove. That is a rule, it is tested, and it
   is worth **exactly nothing** in every table above -- because no policy thrusts.
   `policies.ts` writes `thrust = false` on every hand of every intent it produces, and
   `duelist`'s docstring argues at length that a thrusting policy would be a second policy
   rather than a branch in that one.

   So the axe's measured record is a record of a fighter that was never going to use the
   button anyway. A person has it. Whether "you cannot thrust" reads as a real constraint or
   as an option nobody missed is a question for somebody holding the mouse, and until that
   happens the axe's price in this file is understated by an unknown amount. The cheapest way
   to close it is not a bench: it is a thrusting policy, which the master plan already wants
   for session 05's bow.

   **Partly answered, and not the way it expected.** `archer` exists and holds the
   button, so the *machinery* a thrusting policy needs is built and tested -- but
   it did not price the axe, because what it holds the button for is a bow, which
   has no point either. The rule `hasPoint` enforces is still worth exactly
   nothing to any policy in the program, and still needs a person.

15. **Highlight implemented; in-flight readability remains open.** The 0.9 s
   hold-and-release interaction survived its first playtest; do not retune it merely because
   it had been unplayed. Arrows now carry pooled high-contrast amber head/fletch accents and
   a short translucent tube trail without changing physics or scoring. The 2026-08-24 browser
   bow bout showed those accents and a clean one-arrow finish, but the automated visible tab
   ran at 1--2 fps and skipped over the roughly 50 ms flight. That is not evidence that a
   moving arrow can be traced. In-flight readability and whether the bow remains enjoyable
   while pinned at 1.8 m by a duelist are still open.

16. **Done: a bow-armed fighter can win through whole-body vitality.** Local health still
   owns injury and severing; the single displayed vitality value is derived from weighted
   regional injury, and zero head or torso health is independently fatal. The three-seed
   close-out corpus includes the refreshed archer rows. In the 2026-08-24 browser bout an
   archer killed an idle opponent with a torso thrust at 48.0 m/s: the victim reached zero
   vitality, the verdict fired once and both policies stopped. That closes the old state in
   which arrows could accumulate injury forever without ending a bout.

17. **Done: the aim indicator starts with real line buffers and a quiet console.** The old
   per-frame dashed-line option warning was already removed. The integrated browser pass then
   exposed two different one-time warnings: both aim lines were constructed from coincident
   points, so Babylon created an empty position buffer before the first update. Each line now
   starts with a 1 mm non-degenerate segment that the first real update overwrites. The named
   regression test asserts both buffers contain vertices; restoring coincident seed points
   made it fail and reproduced both warnings. The arrow trail has a separate vertex-buffer
   assertion, which proved it was not the source.

## The bow, and the four defects it found on the way in

Every figure in this section is the **headless bench** unless it says otherwise:
`.review/bow.mjs` for the bow, `npm run measure` for the standard corpus, both at
seed 20260823 on the 16C/32T desktop. None of it is the page.

Adding a ranged weapon turned out to be mostly an exercise in finding out what was
already wrong, because a bow asks questions no melee weapon had ever asked: *do the
collision layers work, can a body be moved without being pushed, how fast was it
going when it arrived, and can you run away.* Four of those had wrong answers.

### The collision layers had never worked for a weapon

`Weapon.finish` set its masks on the `PhysicsShapeContainer`. Havok filters on the
**leaf** shapes and ignores a container's own filter completely -- and reading it
back does not report the problem, it reports garbage (a shape set to 8 returned
383476). So every weapon in the program carried Havok's default filter, which
collides with everything.

`.review/weapon-mask.mjs`, one fighter with a sword and a shield, cursor swept
through both envelopes for 12 s, contacts against **its own body**:

| | before | after |
| --- | --- | --- |
| sword vs own upper arm | 1687 | 0 |
| sword vs own forearm | 1572 | 0 |
| sword vs own torso | 853 | 0 |
| sword vs own shield | 795 | 0 |
| shield vs own head | 985 | 873 |
| shield vs own torso | 808 | 808 |
| shield vs own forearm | 725 | 0 |
| shield vs own off-arm | 669 | 0 |
| shield vs own hand | 391 | 0 |

The shield's remaining contacts are its owner's **trunk**, which is the entire
reason the shield has a layer of its own -- so the fix is not "a shield touches
nothing", it is a shield touching the one thing it should. The plate stands 110 mm
off the fist and its own forearm sits inside that gap by construction, so those
725 and 669 were *permanent* contact between a 4 kg lever and the chain driving it:
exactly the failure `physics.ts` spends fifty lines explaining the layer table
prevents, running the whole time it was there.

It stayed invisible because the symptom is **friction rather than a hole**. What it
cost, standard corpus, 40 bouts a row:

| | before | after |
| --- | --- | --- |
| duelist beats swinger | 27/40 | **29/40** |
| duelist got its blade past 11 m/s | 30/40 | **36/40** |
| duelist-vs-duelist bout length | 11.74 s | 9.94 s |
| duelist-vs-duelist contacts | 81.67 | 61.35 |
| duelist-vs-duelist severs | 47 | **61** |
| edge alignment, median | 0.652 | **0.693** |

Fewer contacts, better-placed ones, more severs, shorter bouts. The single number
worth quoting is the third row: with the blade no longer grinding on the arm
swinging it, six more duelists in forty actually got their sword up to cutting
speed.

**Every arm number in `config.ts` was tuned against the broken behaviour**, and
none of them has been re-derived. Nothing looks wrong, but that is now an open
question rather than a settled one.

### A fighter retreated at a dead run

`steer` multiplied `input.forward` by `walkSpeed` whatever its sign. Nobody noticed
while the only policy that backed up did it in short bursts; it became
load-bearing the moment there was a policy whose whole plan is distance, because
**a fighter that retreats as fast as its pursuer advances cannot be caught**. The
first archer bench came back 0 kills and 0 deaths in twelve bouts at the cap.

`fighter.backSpeed` is 1.7 against a walk of 2.9. Cost to the melee policies,
standard corpus:

| | before | after |
| --- | --- | --- |
| duelist beats swinger | 29/40 | 30/40 |
| duelist-vs-duelist bout length | 9.94 s | 11.16 s |
| duelist-vs-duelist contacts | 61.35 | 75.61 |
| duelist got its blade past 11 m/s | 76/80 | **80/80** |

Longer and busier, because a duelist can no longer disengage for free. Nothing
destabilised.

### An arrow was being scored at nine times less than it arrived at

`Weapon.velocityAt` is `linear + w x r`, which is the right question for a blade:
the rotation is the arm's and is there before the contact. An arrow has no rotation
in flight, so any it has at the contact was put there **by** the contact, and over
a 0.36 m half-shaft that is tens of metres a second. Fired into a keyframed slab,
`.review/impact-speed.mjs`:

| loosed at | body's linear velocity | last control step | `linear + w x r` |
| --- | --- | --- | --- |
| 48 | 38.4 | 48.0 | **5.6** |
| 40 | 39.5 | 40.0 | 30.5 |
| 30 | 29.5 | 30.0 | 20.6 |
| 22 | 22.0 | 22.1 | 20.5 |

The last column is what the damage model was handed, and it did it *consistently*
-- a tight band around 27 m/s, which is the shape of a systematic error rather than
of noise. An arrow caches its free-flight velocity each control step and is scored
from that.

### A spent arrow went on being billed

A struck arrow rests against whatever it hit and files a contact every
`hitCooldown`; a moving limb drags it back over `minArrowSpeed` often enough to
score. Over 12 bouts that turned into **62 "hits" averaging 2.9 damage** where a
clean arrow is worth 55. `Combat` refuses to score a `spent` striker now, which is
one rule with two instances -- a dropped weapon is the other, and a sword lying on
the floor scoring cuts against whoever walks over it had been true since limbs
started coming off.

Fix by fix, archer vs duelist, 12 bouts x 30 s, damage the archer dealt per bout:

| | dealt | per landed arrow |
| --- | --- | --- |
| as first built | 26.6 | 2.9 |
| debris stops scoring | 26.6 | 10.4 |
| scored at arrival speed | **141.9** | **55.0** |

A factor of 5.3, entirely from correctness. Not one number was tuned.

## What a bow is worth, and the rule that stops it winning

`.review/bow.mjs`, 16 bouts x 30 s each, archer with a bow against each policy:

| opponent | dealt | taken | arrows landed | accuracy | archer killed | archer died |
| --- | --- | --- | --- | --- | --- | --- |
| duelist | 140.8 | 65.1 | 38 | 9.9 % | **0/16** | 0/16 |
| swinger | 366.2 | 349.7 | 94 | **98.9 %** | **0/16** | 16/16 |
| idle | 274.7 | 0.0 | 80 | 20.8 % | **0/16** | 0/16 |

Every landed arrow is worth 55.0 -- exactly `pierceScale`, every time, because an
arrow flies along its own shaft (measured shaft-versus-velocity alignment in flight:
median **1.000**) so it either arrives point-first or does not arrive.

**The archer cannot win, and it is not about the numbers.** `beaten()` ends a bout
on a severed head or torso, or on all twelve parts at zero; an arrow deliberately
never severs. Against `idle` -- a fighter that stands still and does nothing while
being shot for thirty seconds -- it dealt 274.7 damage a bout and killed nobody, in
sixteen bouts. Raising `pierceScale` does not touch it either:

| pierceScale | dealt per bout | killed |
| --- | --- | --- |
| 55 | 141.9 | 0/12 |
| 70 | 180.7 | 0/12 |
| 85 | 219.4 | 0/12 |
| 100 | 258.1 | 0/12 |

At 100 a single arrow is half a torso and two of them are the whole of it, and the
bout still does not end. **Damage and lethality are separate systems in this
prototype**, and until today every weapon participated in both. `beaten()`'s own
docstring already names the alternative -- letting a torso beaten to nothing end a
bout on its own -- and reserves the choice for the first person to play one to the
end. It is now a decision with a number attached rather than a note.

The swinger row is the one to look at twice. The archer hits **98.9 %** of what it
looses at a fighter that charges in a straight line, deals more damage than the
swinger does, and dies every single time.

### Two more things the bench cannot price, and one it should not have had to

**The arena starts fighters at sword range.** `fighter.separation` is 2.4 m, chosen
when every weapon was a sword, so an archer begins every bout already inside its own
minimum range and -- retreating slower than a duelist advances -- never gets out
again. Its median range at loose against a duelist is **1.81 m**, with a p10 of 1.76
and a p90 of 1.82: it is pinned at the duelist's preferred distance for the whole
fight. Given room, it does better, but not enough to matter while it cannot kill:

| start | dealt | arrows landed | accuracy |
| --- | --- | --- | --- |
| 2.4 m (the arena's) | 123.6 | 24 | 8.3 % |
| 6 m | 114.5 | 20 | 6.9 % |
| 10 m | 123.6 | 23 | 8.2 % |
| 16 m | **226.9** | 41 | **14.4 %** |

**A held-out sword is a shield against arrows**, and that is emergent rather than
designed: a duelist covers the line to its own chest, which is exactly where the
archer aims. Aiming higher does not help -- the sweep goes the wrong way, so the
chest stays the mark:

| archer aims (above the shoulder line) | dealt | accuracy |
| --- | --- | --- |
| **-0.12 (the chest)** | **141.9** | **10.1 %** |
| +0.06 | 73.3 | 4.2 % |
| +0.18 | 87.3 | 4.2 % |
| +0.28 | 91.6 | 6.9 % |

**And a person has not held the button.** Draw-and-loose is a hold on the left
mouse button, which is a control no policy can evaluate for feel. `archer` proves
the machinery works and prices the weapon; whether a 0.9 s draw is tense or tedious
is item 15 below.

### The quiver costs nothing, which is why it is a pool

`.review/park-cost.mjs`, 24 arrows, ms per frame against a re-taken baseline:

| parked as | delta |
| --- | --- |
| DYNAMIC on membership mask 0 | **+0.0726** |
| STATIC on membership mask 0 | **-0.0015** |

A body that collides with nothing still falls: parked the naive way, the 24 arrows
were 3.5 km below the arena and accelerating. Parked STATIC the cost is below the
noise of the bench that measured it, which is what lets `Combat` go on binding its
observers once in its constructor -- the master plan expected a `watch`/`unwatch`
pair per shot and a pool makes it unnecessary.

The acceptance check, `tests/arrow.test.mjs`: `scene.meshes` and the physics body
count are **identical** before and after a hundred shots, and every arrow is
collected. A hundred launches from one origin land in one place, spread **0**.

## The axe, and six tables that were lying

The session was meant to be one hole -- `weapon.ts` silently building a club for any kind
it did not recognise -- and that one had already been closed. Reading for it found five
more of the same shape, and adding a sixth kind to the union turned four of them into
compile errors in a single `tsc` run:

```
src/combat.ts(67,7):  Property 'axe' is missing in type ... Record<WeaponKind, string>
src/combat.ts(279,7): Argument of type 'WeaponKind' is not assignable to 'Striker'
src/weapon.ts(248,29): Argument of type '"axe"' is not assignable to parameter of type 'never'
```

The two that did **not** show up there are the two that mattered.

| where | what it did with a kind it had never heard of |
| --- | --- |
| `isStriking` | **false** -- so no policy would ever attack with it |
| `scoreHit` | fell past both branches and **scored it as a sword** |
| `handsFor` | one hand |
| `mountFor` | the blade's mount |
| `bout.ts:207` | `kind === "club"` where the prose above it says "takes two hands" |
| `combat.ts:265` | gated every contact on `minCutSpeed` before `scoreHit` saw it |

`isStriking` is the expensive one. Session 03 made it the question a policy asks to decide
**which hand it attacks with**, so a weapon with a mesh, a builder, a config block and a
picker entry would have been one every policy silently declines to swing: a fighter
standing in the ring holding it. `scoreHit` is the invisible one -- it compiles, it runs,
and it produces a plausible number, so a new weapon is not broken, it is *an arming sword
with a different mesh* and nothing on screen says so.

### The sixth, which had already cost the club its floor

`combat.ts` skips a divide and three dot products for a contact too slow to be worth
anything. That is a sound optimisation and it was written as `speed < C.minCutSpeed` --
the *blade's* number, hard-coded, in a file with no business holding an opinion about it.
So a club below 3.0 m/s never reached `scoreHit`, and `minCrushSpeed` -- a setting with a
paragraph of config comment explaining why it is lower than the blade's, and a unit test
proving that it works -- **did nothing whatsoever in an actual fight** for the whole of the
club's life. The test was right and the arena never ran the code it tested.

Fixed by asking the table (`biteFloor`). Measured, two clubs against a sword, 12 bouts:
104 blows becomes 110, and total damage 2500 becomes 2479. So the rule was wrong and the
effect is nothing -- which is worth writing down in exactly that order, because "the
setting does nothing" and "the setting is unreachable" look identical from the damage
number and only one of them is a bug.

## The axe

A one-handed war axe: 0.62 m of haft with a 0.17 m bit on the top of it, 1.4 kg. It keeps
the frame every kind keeps -- **+Y** along the haft, **+X** the edge, **+Z** the flat -- so
the head is built sticking out along +X only, its cutting face is the +X extreme, and the
lump on -X is the poll. `scoring.ts` asks it exactly the questions it asks a sword.

Four things make it an axe and **only two of them are rules**:

- it is **27 % shorter** -- `tipOffset` 0.68 m against the sword's 0.935;
- its **mass is out at the head** -- centre of mass 0.45 from the grip against the sword's
  0.195, and off the haft axis by 0.04 because the head is only on one side of it;
- it has **no point**, so a thrust with it is a shove;
- it has **one edge**, so a backhand arrives poll-first and is worth nothing.

The first two are `config.ts` meeting the arm's 850 N ceiling, which is where a weapon's
feel belongs. The last two are rows in `hands.ts`.

**The no-point half of that is a cost the bench cannot see, and saying so is part of the
measurement.** No policy thrusts -- `policies.ts` writes `thrust = false` on every hand of
every intent, and `duelist`'s docstring argues at length that a thrusting policy would be a
second policy rather than a branch. So `hasPoint` costs the AI nothing at all. It costs a
*person* the left mouse button, and only a playtest can price it.

### What each fix bought, in order

`duelist` carrying the axe against `swinger` with a sword, 12 bouts a row, `chopScale` held
at 54 throughout so that the three rows differ only by the fix named:

| | taken | dealt | died | killed | blows | damage | severs | poll-first |
|---|---|---|---|---|---|---|---|---|
| as first built | 398.2 | 43.3 | 12/12 | 0/12 | 31 | 356 | 0 | 75 % |
| ranges know the weapon | 611.6 | 126.6 | 12/12 | 0/12 | 56 | 1305 | 0 | 64 % |
| the roll stops folding | **391.6** | **148.8** | **4/12** | **7/12** | **101** | **1530** | **5** | **40 %** |

The sword in the same seat over the same 12: 308.5 taken, 201 dealt, 3 deaths, 9 kills, 132
blows at 15.2 each.

Note the middle row, which is the honest shape of the reach fix: damage *taken* went **up**,
from 398 to 612, while damage dealt tripled. A weapon a quarter of a metre short has to be
carried a quarter of a metre inside the other fighter's range, and that is not a cost the
fix introduced -- it is the cost the weapon always had, being paid for the first time.

### The ranges were the sword's length, written down as constants

`duelist.hold = 1.40`, with a comment reading "just inside the 1.45 m the point of the blade
reaches". `duelist.strike = 1.48`. `swinger.engage = 1.30`, with a measured **1.45** in its
own docstring. Six literals across two policies, every one of them an arm at
`arm.reachNeutral` with an arming sword on the end of it, and none of them saying so
anywhere a program could read.

Handed an axe, which reaches 1.13, `duelist` went on holding 1.40 and committing at 1.48 --
a quarter of a metre outside its own range -- and swung at the air: **31 blows in twelve
bouts against a sword's 398 in the same bouts against the same opponent.**

`HandView.reach` is back, and the arc is worth recording as a caution about the rule that
removed it. It was cut one session ago for having no readers, which was correct at the time
and is `AGENTS.md`'s own rule. What brought it back is not that the rule was wrong -- the
field it replaces (`SelfView.reach`, the live extension of the *primary* arm) really did go
three sessions unread and really has gone now. It is that a field with no reader and a field
with no reader **yet** look the same from inside one session.

`shiftedTo` moves a tuned range by `reach - TUNED_REACH`, an offset rather than a ratio,
because a body's depth does not scale with the thing being swung at it. For a hand holding a
sword the shift is **exactly zero** -- `TUNED_REACH` is written with the same association
`Arm.strikeReach` uses, checked bit for bit -- so every figure in this file taken before
today still names the same fighter.

### `rollForStroke` was folding the bit into the poll, every time

`rollForStroke` derived the wrist roll that lays the edge along the stroke, and then folded
the answer into +-pi/2. Its docstring said why, and the reason was sound: *the sword is
double-edged*, `roll` and `roll +- pi` are the same cut, and the short one is the one the
wrist can get to.

That fold is exactly false for a single-bitted weapon, where one of the two is the back of
the head -- and its tie-break is "whichever is closer to zero", which is no tie-break at all.
Measured on the four strokes the two policies actually fly:

| stroke | folded | unfolded | differ by pi? | wrist reaches it? |
|---|---|---|---|---|
| swinger, right hand | -0.925 | 2.216 | yes | yes |
| swinger, left hand | 0.919 | -2.222 | yes | yes |
| duelist, right hand | -0.922 | 2.219 | yes | yes |
| duelist, left hand | 0.922 | -2.219 | yes | yes |

**Both policies, both hands, exactly half a turn out** -- so an axe arrived poll-first on 64 %
of the contacts that landed on a body. Unfolded, 40 %, and what is left is the arc curving
away from the roll the stroke was planned at plus the wrist taking real time to travel 3.14
radians further than it used to.

The historical clamp is worth naming because it was a real limit that these four strokes
happened to miss: at the time of this axe sweep `arm.rollMin/rollMax` was +-2.6 and the
unfolded answer lived in (-pi, pi], so a stroke
wanting 2.8 would get 2.6 and arrive poll-first however this function answered. An axeman
steps round rather than turning a wrist that far, and this program has no way to express
that. The later anatomical-wrist pass superseded the +-2.6 limits; see the dated close-out
below rather than treating this historical sweep as the current controller contract.

### `chopScale`, and the two knobs that were refused

Swept with everything else settled, 12 bouts a row:

| chopScale | taken | dealt | died | killed | per blow |
|---|---|---|---|---|---|
| 46 | 412.5 | 136.4 | 5 | 6 | 13.3 |
| 54 | 391.6 | 148.8 | 4 | 7 | 15.1 |
| **64** | **354.0** | **155.6** | **3** | **8** | **17.2** |
| 76 | 327.4 | 165.2 | 2 | 9 | 21.0 |

64 is where two independent arguments meet: the physical one -- the same arm speed arriving
through a hand's width of edge rather than through 840 mm of it, worth something like 1.4
times, and 46 x 1.4 is 64.4 -- and the measured one, which is the row where the axe survives
as well as a sword while still landing fewer and heavier blows. 76 is where it starts to
out-damage a placed cut, which would make the sword pointless.

**The axe was drafted with two more knobs and the bench refused both.**

*Its own speed floor*, between the blade's 3.0 and the club's 2.2, on the club's own argument
that a heavy head arriving slowly still bites. 24 bouts:

| minChopSpeed | taken | dealt | died | killed | damage | blows | per blow |
|---|---|---|---|---|---|---|---|
| 3.0 (the blade's) | 340.6 | 171.2 | 8 | 15 | 3339 | 183 | 18.25 |
| 2.6 | 343.5 | 166.4 | 9 | 14 | 3354 | 193 | 17.38 |

Fifteen points of damage out of 3350, and ten more contacts too slight to be worth counting.
It only ever changed what got *called* a blow.

*Its own sever bar*, 0.2 against the blade's 0.4, on the argument that taking limbs off is
what an axe is famous for. At 0.2 and at 0.4 the bench returned **byte-identical numbers** --
354.0 taken, 155.6 dealt, 3 deaths, 8 kills, 7 severs, 1663 damage, all four figures the
same -- because a chop that empties a limb has already landed at a quality well above either.
The bar was never the binding constraint and `chopScale` was doing all of the work.

Both are gone. The axe's row in `scoring.ts` is the sword's row with one number changed, and
that is a finding rather than a simplification.

### What the axe is worth

24 bouts, `duelist` carrying the loadout against `swinger` with a sword. "Taken" and "dealt"
are means per bout; blows, per-blow and severs are totals over the 24.

| loadout | taken | dealt | died | killed | blows | per blow | severs |
|---|---|---|---|---|---|---|---|
| sword + empty | **292.7** | **241.6** | 7/24 | 17/24 | 333 | 14.09 | 15 |
| axe + empty | 340.6 | 171.2 | 8/24 | 15/24 | 183 | 18.25 | 13 |
| **axe + shield** | 333.5 | 176.9 | **4/24** | **20/24** | 161 | **23.65** | 16 |
| sword + axe | 403.1 | 270.1 | 5/24 | 19/24 | 509 | 11.06 | 16 |

**The axe lands 45 % fewer blows and each is 30 % heavier**, which is the whole of what the
weapon is. Against a sword it is behind on the totals -- 29 % less damage dealt for 16 % more
taken -- and that is the honest answer rather than a balance failure: in a model where a blow
is a blade meeting a body, a quarter of a metre of reach is worth more than a heavier head.

**The interesting row is the third.** An axe with a shield kills 20 of 24 against a sword's
17 and dies 4 times against its 7, at 23.65 damage a blow. The axe's weakness is having to
stand inside the other fighter's range; a shield is the answer to standing inside somebody's
range. Nobody designed that -- it falls out of a short weapon and a plate being in the same
loadout -- and it is the first thing in this prototype that reads like a *choice* between two
loadouts rather than a ranking of them.

### The drift in `npm run measure`, fully attributed

`swinger vs idle` is **identical to every digit**. `duelist vs swinger` keeps its win rate
(27/40) and its severs (32 and 16) and moves its bout length from 5.18 s to 5.38 and its
damage from 245.39 to 246.07. `duelist vs duelist` keeps 40/40 decided and 47 severs and
moves 242.33 to 243.59.

One cause, isolated by pinning `shiftedTo` to zero and confirming the table returns
**byte-for-byte** to its old numbers: once a fighter's weapon arm is cut off, `attackHand`
hands the policy the other hand, and the other hand reaches as far as a fist does. It closes
now instead of standing at sword range holding nothing. `idle` never severs anything, which
is why the first block does not move at all.

### In the page

Stepped by hand and rendered by hand, which is how a hidden tab is looked at (`AGENTS.md`).
The axe reads as an axe: a wooden haft with a steel head at the top, the bit out to one side
and flaring taller than the eye behind it, a small poll on the other. From the log of a live
bout:

```
axe:cut Torso    62.5 @17.2 m/s edge 98%
axe:cut Off arm  60.8 @21.6 m/s edge 97%
axe:weak Shield   0.0 @22.8 m/s edge  0%
shield:weak Haft  0.0 @ 1.2 m/s edge  0%
```

The third line is a shield stopping a 22.8 m/s chop dead, and the fourth is the new parry
label: a shield that caught the *haft* rather than the head.

## Two hands, and what a shield is finally worth

All from `.review/two-hands.mjs`: 24 bouts a row, 20 s cap, `duelist` carrying the loadout
against `swinger` with a sword. "Taken" is the sum of what is missing from every limb at the
end, meaned over the 24.

| loadout | damage taken | died | killed | damage dealt | blows blocked |
|---|---|---|---|---|---|
| sword + empty | 284.5 | 7 / 24 | 17 / 24 | 4626 | 531 |
| **sword + shield** | **160.8** | **0 / 24** | **24 / 24** | 5167 | 1313 |
| sword + buckler | 278.0 | 3 / 24 | 21 / 24 | 5173 | 1315 |
| sword + sword | 294.4 | 4 / 24 | 20 / 24 | **6551** | 984 |
| shield + sword | 298.6 | 6 / 24 | 17 / 24 | 6190 | 1492 |

**The shield halves the damage and the fighter stops dying.** That is item 10 of "what is
still owed" discharged: it recorded an `idle` fighter *taking more* damage for carrying a
shield, 90 against 28, because it held the thing wherever its cursor happened to sit. `idle`
is unchanged and always will be -- it is the control, and a fighter that does nothing gets
nothing from a shield -- but every policy that plans a hand now knows what a shield is for.

**Two swords use both hands.** The second one deals 2957 of the 6551, over 201 blows. Before
this session it dealt zero, because `blankIntent` parked it at `restPointerY` and no policy
ever wrote it again. It costs defence, which is the honest trade for the loadout.

**A shield belongs in the off hand**, and by a factor of two: 160.8 taken with the board in
the secondary against 298.6 with it in the primary. `swinger` chambers high on its own right
and cuts across to its left, so its blows arrive on our left, and that is the side the board
has to be on. The mechanism is a reading of one opponent rather than a law.

**`swinger` gains much less than `duelist`** -- 182.9 taken to 180.1, though it dies 14 times
in 24 instead of 18 and deals 29 % more. That is its documented character working: it never
reads the other fighter's blade, so its shield covers the chest it is walking at rather than
the point that is coming. A shield that tracked an incoming blade would be a different policy
wearing this one's name.

### Placement, and then the wrist

A strapped plate's normal is square to the forearm, so the most of it an enemy can ever see
is `sin` of the angle between the forearm and the line to him -- and `roll` slides that normal
all the way round the circle. The first is the ceiling and the second is how much of it is
collected, and **nothing in the program was setting the second**. Held poses, 30 threat
bearings, settled, `-outboard` sign:

| roll | of what placement made available | worst pose | hand off its anchor |
|---|---|---|---|
| 0 | 56 %, 63 % | 0.054 | 32 mm |
| 0.8 | 94 %, 96 % | 0.080 | 36 mm |
| **1.0** | **96 %, 96 %** | 0.161 | 34 mm |
| 2.0 | 62 %, 84 % | 0.095 | 103 mm |

(Two figures a row: the secondary hand and the primary.)

**A servo was written first and the measurement threw it out.** It read the plate's actual
facing out of the world, took the signed angle to where it should be, and stepped the command
toward it -- textbook, and it wound up. The command moved faster than the arm could follow, so
the error never closed: 237 of 420 sampled steps sat pinned at the +-2.6 wrist limit, the hand
was a median 137 mm off its own anchor, and the plate stopped being square to the forearm at
all. It collected 54 % where the constant collects 96 %. `HandView` carried a `face`, a `hand`
position and a `reach` for it, and all three went out with it.

**The wrist has authority one way and not the other.** Swept at elevation zero, hand-to-anchor
stray holding a shield: a roll of +1.0 on the *primary* arm swung across to azimuth -0.7
strays **504 mm**, and -1.0 on the secondary swung the other way does the mirror of it. The
usable sign is the one that matches the way the arm was swung. This is the arm defect the
previous session recorded, met head on.

### The two knobs, swept against damage rather than against geometry

`GUARD.lift` is the largest single number in the guard and the first version had **the wrong
sign on a good argument**: `shield.gripInset` puts the fist above the board's centre, so a
hand held level with the threat covers the belly and not the head -- therefore lift it. Held
high, the board covers the head and leaves everything under it open:

| lift | taken | head | torso | pelvis | legs |
|---|---|---|---|---|---|
| +0.16 | 241.0 | 16.4 | 70.5 | 38.4 | 23.2 |
| -0.05 | 212.7 | 22.0 | 45.7 | 26.8 | 25.7 |
| **-0.20** | **160.8** | 12.3 | 34.7 | 22.6 | 25.6 |
| -0.28 | 193.8 | 27.1 | 36.0 | 22.4 | 21.6 |

The no-shield control takes 284.5 with 58.9 of it on the head and **no leg damage at all**, so
a low guard trades some legs for most of a head. `GUARD.across` was derived from the geometry
at 0.785 rad and then swept: 213.9 at 0.45, 214.3 at 0.65, **160.8 at 0.80**, 195.4 at 0.95,
184.7 at 1.10. Derivation and measurement agreeing is worth recording precisely because they
so often do not.

### Aiming from the wrong shoulder

The two sockets are 420 mm apart and `BodyView.shoulder` is the primary's, so a policy that
aimed everything from it was aiming its *other* hand from the wrong side of the chest. It cost
almost everything that hand could do:

| the sword is in | damage to their head | to their torso | of total | bouts they died |
|---|---|---|---|---|
| the primary | 90.0 | 45.0 | 201.1 | 9 / 12 |
| the secondary, before | 19.7 | 216.3 | 483.4 | **0 / 12** |
| the secondary, after | 71.1 | 38.1 | 248.8 | 7 / 12 |

A left-handed fighter dealt **twice** the damage and killed nobody, because it landed on
torsos and limbs rather than on the head that ends a bout. The primary's column is
byte-identical before and after, which is what says only the other hand moved.

### The policy table did not move, except where it should have

Same seed, same day, `npm run measure`. `swinger vs idle` is identical to every digit; the
swinger's own numbers in `duelist vs swinger` are identical; the duelist's moved a little --
bout length 5.18 s to 5.22, damage 244.41 to 248.32, severs 32 to 35. That drift is one
change and it is an improvement: **a guard no longer covers a sword that has been cut off and
dropped.** A severed arm keeps its weapon, so `HandView.tip` goes on reporting where the blade
landed, and `threatHand` is what now skips it.

### The shield in the page, at last

The previous two sessions recorded that Chrome freezes `requestAnimationFrame` in a hidden
tab, so nothing could be looked at. **There is a way through it**: force `scene.render()` by
hand after stepping the world, and the canvas paints. Screenshots taken that way settle three
things nobody had seen. The heater is held across the chest with the elbow bent and the boss
facing out -- a person holding a shield, not a plate on a stick. The buckler is punched out on
a straight arm, small and round and facing where it points, which is what a buckler is. And
the fist sits 615 mm from the chest centre at `shield.reachCap`, level with the sternum at
1.19 m.

**The shield hand strays like the sword hand does.** With the bout over and nothing hitting
either arm, the median hand-to-anchor stray is 56 mm on the shield and 53 mm on the sword. In
a live exchange it is 167 mm against the sword's 85 -- worse, and the same order, and a 4 kg
board being struck a thousand times a run is enough to account for it. The shield's pose is
not what strays arms.

**And the pause from `over` works**, which session 01 could only pin in unit tests. Space from
a decided bout shows the pause panel and leaves the phase alone; Space again resumes with both
fighters still standing; `?` toggles the key list; `R` goes to the setup screen.

## Arrow trace lifecycle; visible verdict still owed

Headless lifecycle harness, `tests/arrow.test.mjs`: every one of the twelve pooled arrows
now owns one constructor-built tube with 45 history samples -- 0.18 s at the 240 Hz control
clock -- and no render observer. Park collapses that history and disables its visual root;
loose reuses and shows it; impact fades it over 0.12 s. The highlighted head, fletch and
trace all share the arena's one unlit orange material. A hundred launches must leave mesh,
physics-body and before-render-observer counts unchanged, and the same shot is compared with
its visual root enabled and disabled to pin position and cached arrival velocity.

The visible-browser verdict is not claimed here yet. The local dependency tree was partial
when this session landed (`@babylonjs/core/Engines/nullEngine.js` and
`@babylonjs/havok` were absent), so neither Fixed nor Overhead could be rendered honestly.
Once dependencies are restored, check both cameras at the 2.4 m start and beyond 10 m,
record the zoom used, and confirm the 62 % opaque tube reads as a short trace rather than a
beam. That is acceptance owed, not a skipped pass.

## The shield, and what a pose was hiding

A shield welded like a blade -- face normal out along the arm -- is a lollipop, and every
complaint about how one looked followed from that line. It was also hiding a real fault.

**A shield arm never tracked its anchor.** Bench, a fighter standing still with a sword in
one hand and a shield in the other, three seconds settled, hand-to-anchor stray:

| hand | before | after |
|---|---|---|
| sword | 0.0 mm | 0.0 mm |
| shield | **315 mm** | **0.0 mm** |

The cause is in `docs/design.md` and is worth the sentence here too: the plate stands 110 mm
off the fist along the hand's +X, a hand is built in the torso's frame, so the off hand's
shield was built *inside its owner's pelvis* on a layer that forbids the overlap. The
contact pinned the arm before it had lifted once and it never got out. Pinned at full
extension, hanging, is a pose -- so every symptom looked like art direction.
`tests/shield.test.mjs` holds the number.

**Building every weapon in the frame its own weld demands.** Peak tip speed in the first
fifth of a second, fighter standing perfectly still, bench:

| kind | before | after |
|---|---|---|
| sword | 48.33 m/s | 23.88 |
| club | 80.40 | 19.10 |
| shield | 26.77 | 3.50 |

That is the weld snapping shut on a violation that had been built into every weapon since
there were weapons. It matters beyond tidiness: **the policy table's "struck" column carried
it**, because a peak over a bout is a maximum and the flick was on frame one of every bout.
(`npm run measure` had to be repaired to take these at all: it built a `Combat` from
`fighter.sword` and read `intent.roll`, both of which moved when a fighter grew a second
hand, so it threw on the first bout and counted no strokes. It had not run since.)
Same seed, same day, `npm run measure`, before and after: `swinger vs idle` struck peak fell
from 69.91 to 43.74 m/s, `duelist vs duelist` from 83.42 to 49.05. The stroke against
nothing -- which starts after the arm has settled -- moved from 40.04 to 39.98 m/s, which is
to say not at all. Numbers in this file taken before this landed should be read with that in
mind.

**Does the shield stay out of its owner?** Deepest the plate gets into any trunk capsule,
measured geometrically from the shapes rather than asked of the solver:

| harness | with the own-trunk layer | without it |
|---|---|---|
| 175 held poses across the cursor envelope | 4.6 mm | 4.6 mm |
| two duelists, sword and shield each, 20 s | 0.0 mm | 0.0 mm |

**The collision layer has never been observed to do anything**, and that is the honest
reading of it: the mount is what keeps the shield out of the body, and the layer is a guard
rail that has not yet been leaned on. It is kept because "a shield cannot be inside its
owner" should be a property of the simulation and not of the poses somebody happened to
sample, and because a contact constraint cannot be violated where a command-side rule can be
walked round. `tests/shield.test.mjs` proves the pair is live by dropping a box on a box --
a shield lands on its own trunk, a blade falls through it, and the arm exemptions are
untouched.

A third thing was tried and removed: a floor under `reachGuard` for a shield hand, on the
argument that a guard pulls the plate into its owner's chest. **The measurement refuted it.**
At `reachGuard` the nearest point of the plate is 298 mm from the centre of the torso -- 108
mm outside it -- and lifting the reach to 0.42 m moved the plate *closer* to the head, 623 mm
to 307 mm, rather than further. It stopped nothing and cost a knob.

Two smaller ones, recorded where they were found rather than forgotten:

- **A pause mid-stride still slides.** `Controls.pause()` stops the control loop, so the
  keyframed torso keeps the linear velocity `steer` last gave it and the fighter drifts
  behind the curtain. True since the hero; `R` from a decided bout is a second door onto
  it.

## Two shields, and what a strapped one can and cannot do

`docs/design.md` has the argument. The numbers, all from the bench
(`.review/shield-facing.mjs`), one fighter standing still, 150 poses over the cursor
envelope, 0.5 s settle each:

| | faces the sky | off the radial (median) | worst | extent | held at | nearest to head |
|---|---|---|---|---|---|---|
| shield, before | 11.3 % | 78.8 deg | 156.2 deg | 0.926 m | 0.448 m | 111 mm |
| **shield, after** | **5.3 %** | **60.0** | **113.4** | **0.827** | **0.320** | **114 mm** |
| buckler | 20.0 % | 22.8 | 49.3 | 0.657 | 0.448 | 147 mm |

*Faces the sky* is the owner's complaint made countable: the plate's normal within 30
degrees of straight up. *Off the radial* is the angle between the normal and the line out
from the fighter's own centre through the plate -- zero is "facing away from the holder, on
the surface of a sphere", and a worst case of 156 degrees means the old shield sometimes
faced **back at its owner**. *Extent* is the furthest corner of the board from the body's
centre, which is "held at a full arm's length" as a number.

The buckler's 20 % is not the same defect and is not one: its face runs *along* the arm, so
pointing the arm up points the plate up, which is what a buckler does. Its 22.8 degrees off
the radial is the shoulder's own offset from the chest and is the floor for any hand-held
plate.

**`gripInset` was chosen from a sweep rather than an argument**, and the table is beside the
number in `config.ts`. It trades monotonically: sliding the fist back improves the facing
and pulls the board in, and costs poses the arm can no longer hold.

### The arm loses its anchor at the corners, and always did

Bench, same sweep, hand against its own anchor:

| kind | median | worst | poses over 20 mm |
|---|---|---|---|
| sword | 0.00 mm | 171 mm | 9.3 % |
| shield | 0.00 mm | 444 mm | 17.3 % |
| buckler | 0.00 mm | 272 mm | 4.7 % |

**The median is zero for all three**, so this is the envelope's corners and not a pin. Four
hypotheses were tested and three refuted:

- *The own-trunk collision layer.* Refuted -- identical with the pair lifted, to the
  hundredth of a millimetre. That layer still has never been observed to do anything.
- *The plate's mass.* Refuted -- a shield at a sword's 1.35 kg strays 445 mm, same as at 4 kg.
- *The board standing on the ground.* Refuted -- at the worst pose its lowest corner is
  1.09 m up.
- *Settling.* Refuted -- six times the settle time moves the worst reading by 7 mm.

What is left is the **wrist roll**. Holding roll at zero and sweeping everything else drops
the shield's worst from 444 mm to 151 mm and the sword's from 171 to 91. A large commanded
roll at an inboard aim asks for an arm twist the shoulder cone refuses, and the solver pays
for the orientation out of the position. **This is not a shield defect and it is not new** --
it is a property of the arm that nobody had measured, and it means the roll control does not
fully work at the edges of the envelope. Somebody should decide whether the shoulder cone is
too tight; it is a controller change with its own measurements.

### What is still not fixed, and it is the placement

Measured in the page, a fighter at guard, how much of the board an enemy straight ahead
actually sees -- the plate's 0.26 m^2 times how square its face is to him:

| cursor X | face-on | seen |
|---|---|---|
| -1.0 (across) | 0.26 | 0.068 m^2 |
| -0.2 (ahead) | 0.12 | 0.033 |
| +0.6 (out) | 0.58 | 0.154 |
| +0.75 | 0.73 | 0.190 |

A strapped plate's normal is square to the forearm, so it can only face the enemy to the
extent the **forearm does not**. The arm has to be held *across the line of the blow*, and
an arm pointed at the enemy presents an edge however it is rolled -- 0.033 m^2 of a 0.26 m^2
board. No mount and no seed can fix that; only whoever is placing the arm can, which is
`docs/measurements.md` item 10 and the next session. The screenshots are the same story: at
cursor 0.75 the board reads as a shield, and at -0.2 it is a diagonal sliver.

## The pause, and what a hidden tab could not answer

`Space` pausing and never resuming was three faults chained, and `docs/design.md` has the
account. What was checked, and in which harness:

**In the page** (a tab on the owner's dev server, driven from the console): `Space` toggles
pause and resume repeatedly -- four presses, alternating, with `Esc` agreeing; the pause
screen carries a heading, Resume, Restart and Leave and **no** matchup, lede or key list;
`Restart` rebuilds both bodies (a severed head is back on afterwards); `Leave` returns to
the setup screen; `Space` and `Esc` from the setup screen do nothing rather than pretending;
`?` opens and closes the controls sheet from the curtain *and* over a running fight; the key
list is 18 rows in `#help` and 0 rows on the curtain.

**Not checked in the page, and worth saying so:** pausing a bout in `over`. The tab would
not come to the foreground -- it belongs to the owner's window -- and Chrome pauses
`requestAnimationFrame` outright in a hidden one, so the render loop never ran, the bout
clock never advanced and the phase could not reach `over`. `engine.frameId` frozen at 5
across a 700 ms wait is how that was told apart from a slow browser. That path is pinned in
`tests/bout.test.mjs` instead, by five cases that all go red when `pauseAction` is mutated
back to the shipped logic -- which is the stronger check of the two for a rule, and no check
at all of the wiring. **Somebody with the window in front of them should let a bout finish
and press `Space`.**
- **`idle` holds its blade out level**, because a centred cursor is a level arm rather than
  a lowered one. It costs nothing in any measurement -- `idle` scored zero on seventeen
  thousand contacts -- but it is not what a control condition called "idle" looks like it
  should be.

## Anatomical wrist and mirrored-hand close-out -- 2026-08-24

The shipped wrist is no longer the old +-2.6 rad free roll. Roll is bounded to anatomical
pronation/supination, wrist bend is a separate normalized command mapping to 0..90 degrees,
and the secondary cursor envelope and inverse mirror the primary. Raising the roll maximum
back to 2.6, using the primary inverse for the secondary, and deleting bend from the anchor
frame each made its named regression test fail. The focused close-out was 51/51 mind tests,
18/18 handover tests and 6/6 view tests; the seed-20260823 corpus remained finite and decided
with swinger/idle 40--0 and duelist/swinger 24--16.

The headless shield sweep read 421.74 mm peak hand error for a primary sword, 498.32 mm for a
primary shield and 0.00 mm steady error for an idle secondary shield. This is not the live
exchange that produced the historical 167 mm shield versus 85 mm sword reading, so the two
sets are recorded as different manoeuvres rather than presented as a before/after improvement.
The remaining useful question is physical effectiveness -- especially against projectiles --
not whether both arms share one cursor mapping.

## Crouch and procedural posture -- 2026-08-24

Measured by `npm run measure -- --only posture --seed 20260823`, in the headless real-Havok
harness. Each crouch row is two simulated seconds; walking uses the shipped forward speed.
`min foot` is the lower endpoint of either shin, knee occupancy is within 0.05 rad of a hard
stop, and hand error excludes the documented first 0.6 s build-pose snap.

| motion | crouch | pelvis m | min foot mm | knee limit occupancy | peak hand error mm | physics ms |
|---|---:|---:|---:|---:|---:|---:|
| stand | 0 | 0.960 | 40.0 | 0.0% | 0.0 | 35.0 |
| stand | .25 | 0.875 | 40.0 | 0.0% | 0.1 | 33.1 |
| stand | .50 | 0.790 | 39.9 | 0.0% | 0.1 | 32.9 |
| stand | .75 | 0.705 | 39.9 | 0.0% | 0.2 | 31.3 |
| stand | 1 | 0.620 | 39.9 | 0.0% | 0.5 | 31.1 |
| walk | 0 | 0.905 | 0.3 | 0.0% | 12.3 | 33.9 |
| walk | .25 | 0.805 | 0.1 | 0.0% | 12.3 | 32.0 |
| walk | .50 | 0.727 | 2.2 | 0.0% | 12.3 | 31.5 |
| walk | .75 | 0.650 | 5.9 | 0.0% | 12.3 | 33.5 |
| walk | 1 | 0.573 | 12.0 | 0.0% | 12.2 | 32.2 |

The standing rows settle to the requested 85 mm step exactly: the pelvis drop is the leg
solve, not a second animation. Walking keeps the supporting foot at or above the floor and
lifts the other; no knee occupied a stop, and the added posture did not move the existing
12.3 mm walking hand transient. Physics time spans 31.1--35.0 ms with no monotonic crouch
cost.

The trunk sweep is now bracketed neutral -> requested corner -> neutral. Across all four
lean/twist corners, waist-anchor separation stayed below the printed 0.01 mm precision,
peak hand error was 10.69--11.00 mm, and the waist returned below 0.01 mm separation. The
55.3% limit occupancy is expected: the middle three seconds explicitly request the four
configured limits, while the one-second approach and recovery are neutral.

## Bare hands -- 2026-08-24

Measured by `npm run measure -- --only fists --bouts 40 --seed 20260823`, in the
headless real-Havok harness. Sides swap every other bout. `punches` counts only fist
contacts that dealt damage; `blocks` counts the cooldown-limited zero-damage reports
created when a weapon or fist physically found an empty hand or forearm.

| cell | role | punches | blocks | damage / bout | survived |
|---|---|---:|---:|---:|---:|
| unarmed vs idle | unarmed swinger | 423 | 80 | 103.0 | 40 / 40 |
| | unarmed idle | 0 | 120 | 0.0 | 40 / 40 |
| unarmed vs sword | unarmed swinger | 271 | 4,022 | 84.6 | 0 / 40 |
| | sword swinger | 26 | 3,941 | 263.7 | 40 / 40 |
| sword + empty vs sword | duelist, sword + fist | 0 | 275 | 171.2 | 15 / 40 |
| | swinger, sword + fist | 0 | 56 | 211.2 | 25 / 40 |

The scoring rule is therefore kept: below 3.5 m/s a fist is a zero-damage slap whose
physical contact still shoves, 9 m/s reaches the 18-damage ceiling, and a fist never
severs. An unarmed fighter is dangerous at contact --
103.0 damage against a passive body and 84.6 while being attacked -- but is plainly worse
than steel: it survived none of forty sword bouts while the sword survived all forty. The
large block counts are not invented defence rolls; they are repeated physical contacts at
the combat cooldown while a hand or forearm remains interposed.

The first probe registered zero fist contacts despite visible overlap. That was not a
balance finding: Havok emits no per-body collision stream until
`setCollisionCallbackEnabled(true)` is called. `Weapon` and `Arrow` already did that in
their constructors; a fist deliberately has neither constructor, so `FistStrike` enables
it on the existing hand body. No body, shape, mesh or constraint was added.

The adversarial lifecycle pass then pinned what those counts alone could not: `Combat`
adds and removes exactly one observer on the real hand across each rebuild, every body,
mesh and constraint returns to the same empty-scene baseline, and a contact delivered by
the dropped hand cannot change health or the log. Material-point velocity is also read on
opposite sides of a rotating hand; a centre-only probe had exercised the linear term while
leaving `angular x radius` untested.

These figures supersede the first session-06 run. That run happened before the adversarial
pass made a slow fist enter the physical shove path and before two bare swinger hands chose
against the opponent's chest. The latter preserves the durable rule that swinger ignores
blade position, speed and loss; only duelist chooses which fist covers from `threatHand`.

## Action options and evaluation corpus -- 2026-08-24

Session 11 separates eight named actions -- close, disengage, cover, cut, thrust, punch,
shoot and recover -- from the meta-controller that chooses among them. `scriptedMetaMind`
owns a real `CombatOption`, enters it once and calls its `decide` until `done`; it does not
delegate to the old policy. Old policies and options instead share pure aim, covering-line,
stroke timing/state, shot timing, roll and posture primitives. A 1,200-sample varied trace
at 240 Hz reached close, cover and cut and made both controllers advance and give ground;
its report covers all 20 intent fields and records changed-sample counts and maximum numeric
deltas per field. All 20 fields are command-identical: the option meta-controller reproduces
the old duelist's circling, seeded cadence, attack-hand choice and phase boundaries while
still entering and executing real options. (Twenty is what was measured on the day and is left
standing; `INTENT_FIELDS` holds **19**. The session-15 supersession under "Integrated headless
close-out" below owns that correction and governs both counts in this paragraph and the one
under "Their prospective maxima" further down.) Cut/punch share the old
duelist's 0.15 s chamber, 0.11 s commit and 0.26 s guarded recovery. Shoot shares the old
archer's 0.90 s draw, release edge and 0.30 s cooldown.

`npm run ai:evaluate` with held-out base 20260827 ran 120 scored bouts in 36.9 seconds of
wall clock: twelve parity cells plus eight real forced-option cells and the loadout/policy
controls, both arena sides, and
separate train/validation/test seed ranges. Both sides of a mirror pair use the same seed.
All 120 ended by exhaustion. The corpus includes every selectable
equipment kind and every existing policy, and the real option cells reached all eight
option names. An immediate non-writing rerun matched byte-for-byte
after JSON parsing. The full per-bout factual record was
`asset-src/learning/baseline-v1.json`, **deleted by session 17 along with the evaluator that
wrote it**; its conclusion, and the fact that the command comparing against it had been red
for two feature versions, are under "Session 17 Stage A" below.

Each bout accumulates range bins, real option occupancy and transitions, option entries as
attack attempts, contacts by exact striking hand and kind, defender blocks, crouch time,
trunk-twist sign changes, damage, final vitality, winner and time. Combat contacts arrive
through a callback before `Combat.log` is truncated. They are not reconstructed from that
24-entry screen history; the callback test observes 40 contacts while the log retains 24.
Specialist swinger, idle, duelist and archer controls carry `null` rather than invented option
labels, and their option occupancy and attempt maps remain exactly zero.

The evaluator runs same-seed, same-loadout mirrored pairs for specialist duelist versus
scripted-meta duelist and specialist archer versus scripted-meta archer across all three splits.
Every paired opponent is the actual adversarial swinger. Before fixing limits, bases
20260823 through 20260826 supplied 48 calibration brackets: an unscored warm-up followed by
specialist, meta and specialist-repeat for each split, loadout and side. Reusing one Havok wasm
module made equal specialist inputs flip winners after scene disposal, disproving the old
headless-harness claim that worlds were independent. Giving every bout a fresh wasm instance
made all 48 specialist brackets exact. Their prospective maxima -- damage 0, seconds 0 and each
of the 20 mean intent-field deltas 0 -- were fixed before evaluating held-out base 20260827.
All 12 held-out subject rows then matched winner, ending, damage, duration and every intent
field at every ordered sample exactly; the repeated controls were exact too. Evaluation JSON
v3 records equal sample counts and exact sequence-match verdicts for both comparisons. The
mean deltas remain a readable report, but are not the gate: a +x frame followed by a -x frame
can leave a false zero mean. A discrete winner or ending mismatch is an unconditional
refusal, not something a numeric tolerance can hide.

The JSON also persists the complete 20-field delta report from the 1,200-sample varied
synthetic trace and the old/meta archer button output. Every field changed on 0 of 1,200
frames with maximum delta 0. On 520 samples both archers held/released 385/135 frames with
three button edges, proving draw and release rather than merely comparing two all-up or
all-down traces. The JSON stores and enforces per-field changed-rate/max-delta limits plus
shot-duty and edge-count limits.

That result used feature schema v2's 50 columns. Session 14 superseded the live learner
boundary with schema v3: 66 named finite columns. It adds usable reach margin, facing error,
five current-movement indicators, seven current-action indicators (including bite),
persistence age and time since damage. The original measure/closing-rate, vitality, four-hand
kind/loss/reach/speed, threat, posture and clock facts remain. A fast primary shield plus a
slower secondary sword still selects both bearing and speed from the sword rather than
combining unrelated hands. Mirroring now also swaps circle-left with circle-right; bearing,
facing error and trunk twist negate while scalar facts remain. The evaluator owns a
persistent `FeatureWriter`, so temporal columns read actual prior samples and tactic edges.
Every v2 checkpoint refuses under v3 rather than being reinterpreted.

Session 16 superseded that boundary in turn with schema v4: **99 named finite columns**. It
keeps every v3 column except the misnamed `time_since_damage`, which becomes the pair
`time_since_damage_dealt` and `time_since_damage_received`, both derived from vitality deltas
rather than from combat events -- the single column was fed from the opponent's vitality
alone, so it was time since damage *dealt* wearing a name that reads as time since damage
taken. The 33 additions are a nine-way `threat_kind_*` one-hot over every `Striker`
(`arrow` and `bite` included, derived from `STRIKER_KINDS` rather than written out), the
selected threat's position and velocity in the observer's right/up/forward frame, its time to
closest approach and closest miss distance, the opponent's crouch/lean/twist, both bodies'
collision radius, crown and vital height, and both bodies' bite reach/ready/active. Scales
are stated in one table beside `FEATURE_COLUMNS`; the tip-speed scale stays at v3's 40 m/s,
which is deliberately below a loosed arrow's 48, so a shaft in flight saturates its velocity
columns rather than compressing a swung blade's range to make room for one.

Threat selection was **three divergent copies**, two of which drove motor execution: the
feature writer sorted attached hands by `tipSpeed`, and `options.ts` and `policies.ts`
carried a byte-identical lead-versus-off pick. The first could disagree with the other two,
so the learned perception could be watching one blade while the cover skill covered another,
and nothing said so. One exported `selectThreat` now answers for all three. Its order: an
opponent arrow that is actually closing on the observer's vitals and predicted to pass within
`collisionRadius + 0.45 m`, soonest first; then whatever can strike -- a held striking kind,
a bare fist, a set of jaws -- ranked by `arriving`, which is the point's speed weighted by
how near its extrapolated path takes it to those vitals; then an attached hand that cannot
strike, then a lost one, and finally the body itself. Ties break by publication order and
then by kind, which for two hands is the primary, exactly as both motor copies did. **This
is not the v3 ordering under a new name**, and what it costs in agreement with v3 is
measured under "Threat selection, reconciled" below rather than asserted here.

Mirroring gains two sign flips, `threat_local_right` and `threat_velocity_right`, and one
correction the v3 table hid: `mirrorFeatures` multiplied by `-1` and so answered `-0` for a
signed column that was exactly zero, which no v3 fixture ever produced because every signed
column happened to be non-zero in the one that exercised them. Every v3 checkpoint refuses
under v4, and a synthetic stale research header is refused by the envelope before any network
is built from its payload.

**`npm run ai:options` moves, and it was already red.** Measured 2026-08-24 by running it at
`f789ea4` in a throwaway worktree and again on the session's tree, both at the default 24
bouts and base seed 20260827. Both runs exit 1 on `evaluation differs from baseline-v1.json`,
and the pre-existing half of that needs no bouts to see: the checked-in baseline records
`featureVersion: 2` and `featureCount: 50` while the runtime had already been v3 since session
14, and the comparison is a whole-document `JSON.stringify` equality. So the artifact has been
stale for two feature versions and re-recording it is owed to whoever owns it, not to this
session. **Beyond the version stamp, the fights themselves moved**, which is what a threat
rule that now gates on closing motion is *for* and is not a regression: train/specialist-archer-bow
left went 4.65 s and 219.6 damage to 4.13 s and 164.9, and the duelist-sword meta cells changed
option 7 times against 9. **Those four figures are run-to-run, not fixture values**, and this
sentence is where somebody would assume otherwise: they are the same cell in the `f789ea4` run
and in the session's run, both live. Neither pair appears in `baseline-v1.json`, whose own
train archer-bow left row was 3.8667 s / 164.9115 -- the baseline predates both runs by two
feature versions, which is the whole subject of the paragraph above. The damages look like
fixture values only because arrow damage is quantized: 164.9 is three arrows and 219.6 is four,
and those two numbers recur across every run and both mirror sides. Stated explicitly because
the artifact that could have settled it is now deleted; the reader after this one cannot check.
What did *not* move is the invariant this session had to keep: all 12
paired rows still match winner, ending, damage, duration and every one of the 20 intent fields
at every ordered sample, in both runs -- the specialist and the scripted meta-controller
remain the same fighter. (Nineteen: the session-15 supersession under "Integrated headless
close-out" below governs every "20 fields" claim on this page, and the count is left standing
here because twenty is what the run reported on the day.)

The required adversarial pass was observed red before restoration:

- deleting `zoom` from an option intent failed `every_option_returns_a_complete_bounded_intent`;
- moving validation's lower seed onto train's upper seed stopped module load with
  `seed ranges train and validation overlap`;
- truncating the event accumulator at 24 failed the direct-event test at 24 versus 40.
- replacing the real meta-controller decision with a blank intent removed close, cover, cut
  and recover from the varied trace;
- collapsing the one-hot weapon columns made sword and axe indistinguishable;
- accepting an unknown option as recover failed the refusal assertion naming `teleport`.
- restoring the wrong both-arms-lost threat fallback changed four hand-pointer fields in a
  real duelist row and failed exact held-out parity;
- sharing a Havok module between bracket bouts made three of four calibration bases refuse
  because repeated specialist winner/ending results differed.
- adding equal and opposite intent deviations to consecutive frames preserved the reported
  mean and failed the ordered sequence gate.

The first of those bullets is **superseded and kept for what it teaches**. Deleting `zoom`
did fail that test, and the failure meant only that the fixture and the command agreed about
a field neither should have had: camera zoom rode on the command because `Intent` was an
alias for the human's `InputState`. Session 15 removed it from the command, the option
fixtures, `INTENT_FIELDS`, the promotion sweep and the two checked-in corpora, and
`every_option_returns_a_complete_bounded_intent` now checks the exact field set a fighter
actually consumes. A red test proves the fixture and the code agree; it does not prove they
are right. (That set was seven fields when this was written and is eight since session 17 gave
a natural striker its own channel. The count is not quoted here any more for the reason the
paragraph above is about: a number in prose goes stale silently, and the assertion is the
copy that cannot.)

## NEAT trainer determinism and checkpoint probe -- 2026-08-24

The real-Havok smoke used 8 genomes, 3 generations and 2 mirrored bouts. Two independent
eight-worker runs took 27.526 and 28.139 s and produced the same champion digest,
`3289d671c44ec434cbfb9b178b4490640a2162afefb1784917ea58f0a6b44db9`.
Resuming the completed run with a different worker count reproduced the digest in 0.628 s;
a population mismatch was refused before the first bout.

A separate one-generation bracket at 1, 4 and 8 workers produced the same report and champion
digest, `101d67ff...5c407ab1`, in 18.371, 12.779 and 10.639 s respectively. The 1.73x
end-to-end speedup includes eight serial validation/control/test bouts, so it describes this
probe rather than promising linear scaling. The earlier 18--38 hour forecast for a default
run was superseded by the measured 5 h 48 m, 6 h 25 m and 6 h 43 m runs below.

The forced-option lifecycle repair also superseded `asset-src/learning/baseline-v1.json`.
Its SHA-256 moved from `77b09b520380041a7f56671e8b97d70e53228f74c4b4d2d7d6055c80e4d2e877`
to `810beb2fe6533743e786e14bd1c3aa084dfe11f73451f1697941729f7d0f32f6`.
Exactly 24 leaves changed: `behavior.attackAttempts` for cut, thrust, punch and shoot, both
mirrors, in train, validation and test. Outcomes, duration, damage, vitality, intents,
controls and every ordered-parity field were unchanged. The replacement counts option entry
and re-entry rather than only a selected-name transition.

## Learned meta-policy experiment -- 2026-08-24

Three independently seeded default runs completed all 80 generations at population 128,
24 mirrored evaluation bouts and eight workers. The run IDs and seeds were fixed before
outcomes: `session13-20260823` / 20260823, `session13-777001` / 777001 and
`session13-991337` / 991337. Their best validation totals were respectively **4.70734** at
generation 9, **6.86409** at generation 4 and **6.24394** at generation 43. The selector,
which cannot read test fields, therefore chose 777001. The trainer nevertheless wrote a
two-bout test probe into every raw report before selection, so this was not a pristine test
quarantine; the observed choice follows validation ordering while the exposed test ordering
would have selected 991337. Every run remained one 128-member species. Novelty peaked at
0.337, 0.439 and 0.350 respectively before converging to zero. Those are results, not
thresholds changed after seeing them. Each run wrote atomic five-generation checkpoints and
a resumable final state; elapsed
wall times were 5 h 48 m, 6 h 25 m and 6 h 43 m.

The selected checkpoint was then evaluated once on the test range in 24 mirrored bouts for
each of sword, sword-and-shield, axe, bow and bare hands against the same seeded swinger.
This evaluation began at test cell 1, deliberately excluding the trainer's already exposed
cell 0. The evaluator required the raw training report and matched its protocol-v3 default
dimensions, seed, config digest and champion SHA-256 to the checkpoint before running; it
also refused any generated promotion-seed collision. Its mean win score was **0.000**, versus
**0.4167** for scripted meta and **0.1917** for the random-option control. It won no bout in
any loadout. Scripted specialist scores were sword
0.625, shield 0.9583, axe 0, bow 0.500 and bare hands 0, so sword, shield and bow missed the
maximum 15-point gap by wide margins.

The decision stream contained 6,550 disengage, 409 cover, 267 cut and 214 punch samples:
**88.04%**, 5.50%, 3.59% and 2.88%. No other option was selected. Several factual transition
rates were absent from scripted meta -- disengage-to-punch 0.417, disengage-to-cut 0.390,
punch-to-disengage 0.376 and cut-to-disengage 0.376 per 100 decisions -- but diversity still
failed because only one non-recover option cleared 8%. A shield example changed from
disengage to cut at 0.117 s with measure 0.591 and both vitalities 1; at 1.183 s it changed
back with measure 0.100, self vitality 0.962 and opponent vitality 0.774. These are recorded
features, not claims about what the network intended.

Finite intents, capability masking and the no-post-verdict-action gate passed. The stuck
option gate failed: long sword and axe bouts spent at least 95% of their duration in
disengage. In total the candidate failed seven gates -- both control comparisons, the sword,
shield and bow specialist bounds, option diversity and stuck-option safety. Thresholds were
not lowered, `learned-v1` was not registered, and no checkpoint was bundled. The compact
commands, digests, tables, transitions and exact failure strings were in
`asset-src/learning/unpromoted-v1.json`, **deleted by session 17**; every number later
sessions cite, and the commands that produced them, are transcribed under "Session 17
Stage A" below. Raw generation reports remain in ignored run dirs.

`--checkpoint <path> --bouts 24 --seed 777001` on `npm run measure` was the explicit
five-loadout route for an unregistered experiment. It named the subject
`experimental-checkpoint` and did not make it a production option; **session 17 deleted it
with the standalone checkpoint codec it loaded**, and the research artifact through the blind
tournament is the only route a learned controller now takes to a fight. The flag is refused by
name rather than ignored -- a bench that dropped it silently would still print a full policy
table, of the scripted policies instead of the checkpoint somebody meant to measure. That is
also why it is no longer written here as a runnable command line. Three visible bouts
remain open because there is no honest picker route for an unpromoted policy.
Their choices are fixed before viewing: melee seed 291337 on the left, bow seed 291338 on
the right and bare-hands seed 291339 on the left. No result has been captured for them.

Mutation evidence was taken before restoration: removing the terminal no-hands branch made
the last-hand-loss regression enter an impossible option; making the diagnostic call the
network again changed its run count; and corrupting a feature name made checkpoint loading
refuse the feature contract. The promotion-threshold test separately changes every hard
boundary across its passing/failing edge.

## Integrated headless close-out -- 2026-08-24

Harness: `npm run measure`, real NullEngine/Havok fights, 40 bouts per standard matchup at
each seed. Seeds 20260823, 777001 and 991337 were named by the plan before inspection. No
constant was tuned from these results.

| seed | swinger over idle | median seconds | duelist over swinger | median seconds | duelist mirror decided | median seconds |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20260823 | 40–0 | 9.44 | 15–25 | 4.32 | 40/40 | 7.14 |
| 777001 | 40–0 | 8.84 | 16–24 | 3.90 | 40/40 | 9.30 |
| 991337 | 40–0 | 8.46 | 21–19 | 4.31 | 40/40 | 9.57 |

All 360 standard bouts reached an injury verdict before the 60 s bench cap. Across the three
swinger/idle cells, final regions were torso 93, head 17, pelvis 9 and left thigh 1; sever
counts were 41, 40 and 41. Duelist/swinger final regions were dominated by head (55) and
torso (41), with 15 pelvis and 9 limb finishes; each side's sever count stayed in the 1–5
range per seed. The duelist result is seed-sensitive -- 37.5%, 40% and 52.5% -- and one seed
is not a balance verdict.

The bare-hand cells stayed legible across seeds. Unarmed versus idle produced 423, 423 and
399 damaging punches, 80 blocks each and 98.2–103.0 damage per bout, with both fighters
surviving all 40 capped bouts. Against a sword it produced 271, 335 and 268 punches and
84.6–106.4 damage per bout; the unarmed fighter survived 0, 2 and 2 bouts while the sword
fighter survived all 120. Sword-plus-empty duelist versus sword swinger followed the same
15–25, 16–24 and 21–19 result as the standard cell, with 267–297 fist blocks and no more
than two incidental punches per role.

Posture is seed-independent in this harness because the four-corner and crouch probes are
fixed commands: waist-anchor peak remained 0.00 mm, hand peak 10.69–11.00 mm and angular
limit occupancy 55.3%; full crouch lowered the standing pelvis 0.960→0.620 m and walking
pelvis 0.905→0.573 m with zero knee-limit occupancy. The seed-20260823 option evaluator
reached close, disengage, cover, cut, thrust, punch, shoot and recover. All 12 real
specialist/scripted-meta comparison rows across train, validation and test matched winner,
ending, duration, damage and all 20 ordered intent fields exactly. Archer rows also matched
exactly, including draw/release commands and arrow damage.

**Superseded in part by session 15 (2026-08-24): the field count is 19, not 20.** The three
sentences above say twenty because twenty is what was measured on the day, and they are left
standing rather than rewritten. `zoom` was the twentieth, and session 15 removed it from the
combat command as a camera value that was never a fighter's to read. The two checked-in
corpora were edited in place to match -- deletions only, no value reformatted, verified as
zero added lines and zero changed leaves. The removed column was worth nothing in either
direction: every one of the 160 `intentTrace.sums.zoom` entries equalled its record's own
sample count exactly, and all 24 parity deltas were 0. A perfectly regular, entirely
meaningless number that had been shipped, mirrored and parity-checked. Read every "20 fields"
claim on this page as "19 fields, and one that could not have disagreed".

`tests/integration.test.mjs` is the lifecycle and authority complement to that corpus. It
builds all four humanoid policies with all 27 setup-reachable two-hand loadouts (108
combinations), steps and finishes them, checks every
shipped policy's finite anatomical command envelope over a complete bout, and proves the
verdict revokes both minds on that edge. A fresh-Havok duelist/swinger pair produced an exact
fight-record and event-stream match with all costume meshes enabled versus disabled. Giving
one costume a physics aggregate made that test fail and flipped the winner, proving the
comparison can see cosmetic authority rather than merely comparing two inert flags.

The resource audit warms Babylon's one-time scene state, then runs 25 two-fighter rebuilds
across sword/empty, sword/shield, axe/shield, two swords and bow. After every disposal the
scene returned to `{ meshes: 1, materials: 8, textures: 0, bodies: 1, constraints: 0,
active physics observers: 0, render observers: 0, particles: 0, trails: 0 }`. Native Havok
constraint creation and release were counted at the plugin boundary rather than inferred
from Babylon's stale debug map. One prebuilt quiver then fired
100 arrows without moving any count and returned to the same baseline on disposal. Removing
that disposal made the proof fail at 49 meshes and 13 bodies.

The learning result remains explicitly unpromoted. There is no `learned-v1` picker matrix
to run and no bundled checkpoint to select; the generic checkpoint route was an
experimental command-line facility and session 17 deleted it. Promotion evaluation now additionally rejects a raw
default report unless its generation ledger contains exactly rows 0 through 79 in order.
Disabling the row-count check made its named test fail before restoration. The verdict probe
also failed 75 decisions versus 63 at the verdict when `stopFighting()` was removed, proving
its post-verdict tail observes the action source rather than only the harness loop.

### Visible browser sample

The 2026-08-24 attached browser pass covered the setup screen and default-zoom Fixed and
Overhead views. A duelist with sword plus empty hand fought a swinger: open faces, worked
steel, leather, cloth and the crimson/blue sides remained distinct at combat distance. No
waist seam opened. A dense blood burst left both fighters and the causing blow readable. The
loser reached zero vitality, collapsed as a coherent jointed corpse and received no further
attacks; the survivor stopped at the verdict. The Overhead view showed the same completed
bout without a framing failure.

A separate bow-versus-idle bout required bow in both hand selectors and ended with one
48.0 m/s torso arrow. The amber arrow accents were visible before release and the vitality,
verdict and corpse path were coherent. The tab rendered at only 1--2 fps, however, so it
skipped the approximately 50 ms free flight. This sample cannot settle arrow-trace
readability, interaction feel or frame cost. Browser security review stopped the attempted
`G`/`Tab` rig-control exercise; no alternate automation surface was used. The attached server
was stopped and port 5180 was confirmed free afterward.

The automated suite includes a mutation-proven check that the two aim lines and the pooled
arrow trail start with non-empty vertex buffers. Its count is deliberately not frozen here;
the contract is the named assertion, not a total that changes whenever another session lands.

Still open, by name: Fixed-camera body-relative human aim; both zoom clamps; walking and
crouching material comparison; the 0.08-versus-0.3 corpse-strength pair; broader blood-scale
play; bow draw under pressure; the axe's missing thrust; in-flight arrow-trace readability;
the full Fixed/Overhead loadout, side and hand-choice human matrix; the rig overlay; and
control → subject → control frame cost on two visible machines. Neither the headless
corpus nor the narrow visible sample answers those questions.

## Engagement promotion baseline -- 2026-08-24

Harness: `npm run ai:evaluate -- --split train --seed 20260824
--write-engagement-baseline`, fresh NullEngine/Havok bouts through `scripts/measure.mjs`.
The raw 40 rows, mirrors and aggregate inputs were frozen in
`asset-src/learning/engagement-baseline-v1.json`. **Session 17 deleted that file, the
`--write-engagement-baseline` flag that wrote it and the train split of `ai:evaluate`**; the
aggregate table below is what survives of it, and session 18 cites its 0.2282 as a live
premise. This is train evidence only; no held-out test row was opened.

The promotion thresholds were fixed before any of the four new research directions ran:
an opportunity window of 0.75 s, a progress drought of 2.0 s, opportunity-to-attack rate at
least 0.65, attack-to-damaging-contact rate at least 0.20, near-range stall share at most
0.15, first-attack p90 at most 6 s, and symmetric time-cap rate at most 0.10. They are
feasibility gates, not positive fitness. A draw or loss receives no terminal success and
elapsed survival contributes exactly zero; novelty can guide search but cannot change a
promotion verdict.

| controller | rows | win rate | opportunity attack | attack contact | first attack p90 | near-range stall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| specialist | 16 | 0.125 | 0.2282 | 0.5000 | 5.267 s | 0.1514 |
| scripted/forced meta | 20 | 0.200 | 0.2031 | 0.6346 | 0.683 s | 0.2435 |
| parity repeat | 4 | 0.000 | 0.5556 | 0.6667 | 1.183 s | 0.0000 |

The baseline is deliberately not a claim that these controls pass. The worst raw cell was
the specialist duelist with axe on the left: zero opportunity conversion and zero contact
conversion. The instrument catches precisely the existing failure that motivated this
round. Intent edges, including bow release, are measured for controllers without option
labels; arrow contacts are attributed back to the bow opportunity. Natural-attack reach is
included for Centipede, and contact identities collapse resting rattles without merging two
distinct projectiles.

The blind tournament remains unopened. There are no complete validation-selected NEAT-QD,
DAgger, PPO or look-ahead artifacts, no frozen `tournament-v1.json`, and therefore no honest
session-19 result or promoted artifact. `npm run ai:evaluate -- --split test` refuses without
that manifest and raw indexed rows; once complete it recomputes macro, worst-cell and the
verdict from raw mirrors rather than trusting stored aggregates.

### Four-direction research implementation smoke -- 2026-08-24

These are execution and accounting checks, not training results. The retained NEAT-QD smoke
spent exactly 30,720 Havok solver steps and the DAgger smoke spent 19,200. Indexed worker
schedules and completed resume reproduced artifact, state and report bytes; adversarial review
also caught and repaired equal-fitness crossover loss, decorative opponent sampling, narrow
single-cell validation and mixed feature-version DAgger input.

PPO advances at option boundaries, trains its movement, action and value heads and applies
16-boundary truncated backpropagation through all three GRU gates under one global norm clip.
An interrupted arm-boundary run reproduced uninterrupted artifact, resume and report bytes.
Frozen DAgger/PPO league artifacts are checksum-validated and decoded rather than represented
by labels that silently run a specialist.

The minimum exhaustive look-ahead run spent exactly 42,240 steps with zero unspent, produced
220 trace rows across 13 body/loadout cells and froze model digest `e2098c12`. Its first full
attempt exposed a hand-only recovery path in Centipede; after capability-neutral recovery and
hand-required cover were separated, every Centipede movement crossed with bite/recover ran a
complete Havok window and the same exhaustive command passed twice. The retained artifact is
engineering evidence only, not the plan's 1.8-billion-step candidate.

The full common budget remains unspent. The current short-run rates extrapolate to roughly
86 hours for one NEAT seed and 125 hours for one DAgger seed before the required NEAT ablations;
those estimates do not include contention or validation overhead and are not a substitute for
the ledger. Session 19 now has a strict four-algorithm deployment executor and atomic indexed
resume, but it correctly has nothing to execute until four full-budget validation-selected
artifacts and the frozen manifest exist.

## Threat selection, reconciled -- 2026-08-24

Session 16 replaced three copies of "which hand is the threat" with one exported
`selectThreat`, and two of the three drove motor execution rather than perception. That is a
change to what a scripted guard covers, on every control step of every bout, and it shipped
with no measurement of any kind. This is that measurement. It found the change larger than the
session claimed, and it found two defects in the new rule.

**Harnesses, because a reading without one is not a reading.** Step-level agreement is
`.review/threat-rules.mjs`: real bouts through `scripts/measure.mjs`'s `runBout`, six per
cell, with every rule evaluated on the *same* published view every control step -- the only
way to compare orderings without comparing two different fights. Win rates and damage are
`npm run measure` at its defaults (40 bouts, seed 20260823) and, for the one matchup that
moved, `npm run measure -- --only duelist-swinger --bouts 120`. Boundary reads are
`.review/boundary-count.mjs` and the assertion in `tests/policy-perception.test.mjs`.

**Four rules**, all read off the same steps:

| name | what it does |
|---|---|
| `f789ea4` | `threatHand`: striking hands first, then `tipSpeed`, ties to the primary -- with a bare hand's speed the literal `0` that version published |
| `f789ea4` on v4 facts | the same rule reading the real fist speed session 16 began publishing |
| v4.0 | as session 16 shipped it: `tipSpeed` gated on a straight-line radial approach, then a reach-margin tiebreak |
| v4.1 | as remediated: `arriving` -- speed weighted by the miss distance of the extrapolated path -- no reach margin, ties to the primary |

### How often the guard changes hands

Control steps on which the rule names a different hand, six bouts per cell:

| matchup | samples | `f789ea4` vs v4.0 | `f789ea4` vs v4.1 | v4.0 vs v4.1 |
|---|---|---|---|---|
| duelist `sword+empty` mirror | 17,156 | **25.7 %** | 11.0 % | 25.7 % |
| duelist `empty+empty` mirror | 166,396 | **54.3 %** | 27.8 % | 44.5 % |
| duelist `sword+buckler` vs archer | 102,268 | 0.3 % | 0.3 % | 0.0 % |

Two mechanisms are in those numbers and only one of them was intended.

**Intended: an empty hand publishes a real `tipSpeed`.** It was identically zero before, so a
fist could not be the threat however hard it was travelling; that is the defect session 16
exists to fix and the behaviour is kept. Its size is what the old rule does on the new facts:
`threatHand` reading a real fist speed already disagrees with `f789ea4` on **12.6 %** of the
sword-and-fist steps and **24.3 %** of the bare-handed ones, and every one of those is a fist
that is genuinely moving.

**Not intended: `closing` was the wrong quantity for a rotating blade.** v4.0 ranked a melee
tip by `reading.seconds > 0 ? tipSpeed : 0` -- speed gated on the *radial* component toward
the vitals -- and a swung blade is mostly *tangential* at the instant it is sampled, and
tangential-and-slightly-outward through the whole of a chamber and the whole of a recovery.
Measured: a hand travelling faster than 1.5 m/s reported as **not closing on 46.4 %, 48.6 %
and 50.5 %** of the samples it appeared in, across the three cells. On every one of those the
key was exactly zero, tied with a hand hanging at rest, and the answer fell through to a
reach-margin tiebreak that had no counterpart in either copy it replaced. The visible
consequence, in the sword-and-fist mirror: the guard was put on the opponent's **bare fist
while it held a sword** on 25.7 % of steps, 3,100 of them with the sword arm more than 90 %
extended and its tip at a mean 8.2 m/s. Under v4.1 that is 11.0 % and 1,172, at a mean 4.2
m/s -- which is a sword that really is doing nothing.

`arriving` is the replacement: `speed * gate / (gate + miss)`, where `miss` is the closest
approach of the extrapolated tip to the observer's vitals and `gate` is the same
`collisionRadius + arrowMissMargin` the arrow tier measures against. It is continuous through
the sign change the old key stepped on, it orders two tips that are both genuinely arriving by
speed exactly as `threatHand` did, and it demotes rather than excludes -- a blade that will
pass wide is still on the end of an arm that can bring it back, which a shaft is not.

### What that is worth in bouts

`npm run measure -- --only duelist-swinger --bouts 120`, one rule per run, everything else
identical:

| melee rule | duelist | swinger | draw | bout length s | duelist damage | swinger damage |
|---|---|---|---|---|---|---|
| `f789ea4` | 49/120 = **40.8 %** | 71/120 = 59.2 % | 0 | 4.10 | 164.66 | 206.59 |
| v4.0 (shipped) | 34/120 = **28.3 %** | 84/120 = 70.0 % | 2 | 3.73 | 166.16 | 209.71 |
| v4.1 (remediated) | 66/120 = **55.0 %** | 54/120 = 45.0 % | 0 | 3.52 | 176.17 | 179.97 |

**Session 16 cost the duelist 12.5 points against the swinger and nobody knew**, and the
remediation is worth 26.7 points against that and 14.2 against `f789ea4`. At 120 bouts one
standard deviation is about 4.6 points, so the first move is about 2.5 sd and the second about
5.8; neither is noise, and the duelist is the policy whose whole plan is to cover the thing
that is coming. Damage moved with it: the swinger's per-bout damage falls from 209.7 to 180.0
while the duelist's rises from 166.2 to 176.2, which is the same fact counted the other way.

The full default bench either side of the remediation, for the rows that moved:

| row | v4.0 (shipped) | v4.1 (remediated) |
|---|---|---|
| duelist vs swinger, 40 bouts | 32.5 % / 67.5 % | 52.5 % / 47.5 % |
| duelist mirror, bout length | 4.79 s | 5.80 s |
| duelist mirror, contacts / damage | 32.5 / 163.3 | 41.1 / 164.2 |
| bare-hand duelist mirror, attempts | 1870 + 1942 | 2465 + 2416 |
| bare-hand duelist mirror, blocks | 2702 | 2289 |
| `sword+empty` duelist vs `sword` swinger | 13W/27L | 21W/19L |
| shields against archer (shield / buckler / empty) | 7 / 8 / 0 of 40 | 6 / 8 / 0 of 40 |

The archer row is the control: the arrow tier's ordering did not change, and it did not move.
The bare-hand mirror is the intended half of the change wearing its own numbers -- a fighter
that can see a fist coming throws a third more punches and blocks 15 % less.

### `ToRef` at the Havok boundary is not free, and the session made it worse

The plan for session 16 assumed `PhysicsBody.getLinearVelocityToRef` allocated nothing and
published a fist's velocity every control step on that assumption. It is false:
`HavokPlugin.getLinearVelocityToRef` reads `HP_Body_GetLinearVelocity(id)[1]` and the
emscripten glue builds a fresh array per call, so the `ToRef` saves only the destination
`Vector3`. Measured with `.review/boundary-count.mjs`, median of twenty-five 2,000-call
batches with a collection before each: **216 B/call** for the linear reader, **184 B/call**
for the angular, and **0.1 B/call** for `getObjectCenterWorldToRef`, which never crosses at
all because it copies `transformNode.position`.

So the budget is boundary reads. Per `observe`, which is two `describe` calls:

| loadout pair | `f789ea4` | v4.0 (shipped) | v4.1 (remediated) |
|---|---|---|---|
| `sword+empty` vs `sword+empty` | 4 | 8 | **6** |
| `empty+empty` vs `empty+empty` | **0** | 8 | 4 |
| `sword+buckler` vs `sword+empty` | 6 | 8 | 7 |
| `club` (two-handed) vs `empty+empty` | 2 | 8 | 5 |
| `bow+empty` vs `sword+empty`, three shafts up | 4 | 11 | 9 |

v4.0 read every hand's linear *and* angular velocity whatever was in it -- including an empty
fist, which `f789ea4` never read at all, so a bare-handed fighter went from allocating nothing
per view to about 1.6 KB per control step at 240 Hz. v4.1 reads each body once and derives
every consumer from that: two reads for a held weapon, whose tip is out on the end of a
rotating body, and **one** for a bare fist, whose published point is the fist's own centre and
whose `w x r` term is therefore identically zero. A hand holding something never pays for its
fist as well. What remains over `f789ea4` is the fist velocity itself and one linear read per
shaft in the air, which is exactly what the session set out to publish.

True zero is not reachable through this API, so the assertion is a **count of plugin calls**
rather than a heap sample: `observe_reads_the_physics_boundary_a_counted_number_of_times` and
`a_full_quiver_in_the_air_costs_one_read_a_shaft_and_stays_there` pin the budget exactly,
including at the twelve-shaft high-water mark, and fail when a reader is added.

### Two smaller findings from the same pass

**The arrow tier was solving the wrong trajectory.** `approachToScratch` was gravity-free
while `arrowCrossing`, ten lines away, carried `ACTION_TUNING.gravity` and argued at length
that it had to. An archer aims *over* its target by `actionArrowLift`, so a straight line taken
off the shaft's current velocity sails above the vitals by very nearly that lift: measured
against a 1 microsecond sweep of the true parabola in `.review/approach-check.mjs`, the
predicted miss is out by 136 mm at 8 m, 306 at 12 and **689 at 18**, against a gate of about
610 mm. The gravity-free version therefore declined shafts that were going to hit, at exactly
the ranges a bow is used at. It takes the constant vertical acceleration as an argument now --
`-gravity` for a shaft, `0` for a blade, which is a claim about the thing rather than an
omission -- and corrects the time once using the mean velocity over the flight: that lands
within 0.02 mm and 1 microsecond of the swept minimum, and a second correction step moves it
by less than a micrometre.

**`Arrow.tipPosition()` and `Arrow.tipPositionToRef` were two copies of one formula and had
already parted company.** With no `rotationQuaternion` -- which is how a `TransformNode`
starts -- the first put the head half a shaft ahead of the centre and the second put it at the
centre: 360 mm apart on a 720 mm arrow. One `bladeDirectionToRef` now, with a test that asks
both.

## Session 17 Stage A: what the deleted learning stack measured -- 2026-08-24

Three checked-in fixtures, two trainers, a promotion gate and a parity evaluator were deleted
in one pass. Nothing here was re-measured for this section; it is the evidence those artifacts
carried, written down because a conclusion that lives only inside a file dies with the file --
and three later sessions cite these numbers as premises.

What went: `asset-src/learning/{baseline,engagement-baseline,unpromoted}-v1.json`,
`src/learning/checkpoint.ts`, `src/learning/promotion.ts`, `scripts/train-meta.mjs`,
`scripts/train-meta-worker.mjs`, `scripts/training-evaluator.mjs`,
`scripts/promotion-evaluator.mjs`, `scripts/evaluate-options.mjs`, the `ai:train` and
`ai:options` commands, `npm run measure -- --checkpoint`, and the train and validation splits
of `ai:evaluate`.

### `baseline-v1.json`: the specialists and the meta controller were byte-identical fighters

308 KB, evaluation JSON v3, base seed 20260827. Twelve paired rows -- duelist-sword and
archer-bow, three splits, both mirror sides -- in which the scripted specialist and
`scriptedMetaMind` matched **winner, ending, damage, duration and every ordered intent field
at every sample**, with an exact specialist-repeat control in every bracket proving the zero
limits were achievable rather than vacuous. The limits themselves were fixed in advance from
48 fresh-Havok calibration brackets on bases 20260823 through 20260826: damage 0, seconds 0,
and every mean intent-field delta 0. The synthetic half was 1,200 varied samples with every
field changed on 0 of them, against a `SYNTHETIC_FIELD_LIMITS` of `changedRate 0.005` and
`maxDelta 0.01` **per field** -- a tolerance the observed zero did not need, declared in
advance so a small drift would have been a pass rather than a re-negotiation. And 520 archer
samples with identical hold, release and edge counts on both controllers, against
`SHOT_PARITY_LIMITS` of `duty 0.01` and `edges 1`.

**`npm run ai:options` was red at its default seed and green at the handoff's, and the
difference is one `if`.** Its baseline recorded `featureVersion: 2` and `featureCount: 50`
against a runtime that had been v4 since session 16, and the comparison was whole-document
`JSON.stringify` equality -- so the artifact had been stale for two feature versions. But that
comparison ran **only when the evaluation's base seed equalled the baseline's**. Otherwise the
command printed `evaluation seed ... is not checked-in baseline seed ...; report completed
without replacing it` and exited 0. `baseline-v1.json`'s `baseSeed` is 20260827, and so is the
command's default.

So, precisely, two statements about two invocations:

- `npm run ai:options -- --seed 20260824` -- the handoff's line -- **passed**. 20260824 is not
  20260827, the whole-document comparison was skipped, and the stale version stamp was never
  reached. The twelve paired parity rows ran regardless of seed and matched.
- `npm run ai:options` at its default seed 20260827 **threw**, on
  `evaluation differs from baseline-v1.json`, and had done so since session 14.

An earlier revision of this section, and of the finding in the overview it came from, said the
handoff's line was wrong. **It was not**; the correction conflated the two invocations and
deleted a true line from the durable record to put a false one in its place. It is superseded
here rather than removed, because what it teaches is that a red command and a red *invocation*
are different claims, and the seed is part of the invocation. It also misquoted the line it was
correcting: the handoff said "all 12 frozen **legacy/meta** parity rows matched", and quotation
marks assert verbatim.

### `engagement-baseline-v1.json`: the shipped controllers already fail the engagement gates

124 KB of raw train rows at seed 20260824, taken before any of the four research directions
ran, against thresholds fixed before any of them ran either. Opportunity-to-attack rate was
**0.2282** for the scripted specialists over 16 rows and **0.2031** for the scripted and
forced-meta controllers over 20, against a predeclared gate of **0.65**. Session 18 cites the
0.2282 as a live premise. The full aggregate table is under "Engagement promotion baseline"
above and stays there; this note exists so that the number outlives the file it was frozen in.

**What the 16 rows are matters, because two of the eight cells are not fighters.** They were
`archer-bow`, `duelist-sword`, `duelist-axe`, `swinger-shield`, `duelist-buckler`,
`duelist-club`, `duelist-empty` and `idle-control`, both mirror sides each -- so the corpus
includes a club duelist and an **idle control**, a fighter that stands still and does nothing.
Recomputed from the raw rows before the file went: `idle-control` contributed **33 of the 149
viable opportunities and 0 of the 34 attacks**, and dropping it alone lifts the aggregate from
0.2282 to **0.2931**. Dropping `duelist-club` as well gives 0.2626. All three are far under the
0.65 gate, so the conclusion is unchanged -- but 0.2282 is an average over a corpus that
deliberately contains a non-participant, and a human control run against a different cell mix
is not comparable to it. Session 18 re-takes these rows anyway, for the separate reason in
overview finding 11.

### `unpromoted-v1.json`: the negative result, and the method that produced it

5 KB. Three independently seeded default NEAT runs -- `session13-20260823` / 20260823,
`session13-777001` / 777001, `session13-991337` / 991337 -- at population 128, 80 generations,
24 mirrored bouts and 8 workers, protocol 3, feature version **2**. Best validation totals
4.70734, 6.86409 and 6.24394; the selector, which cannot read test fields, chose 777001.

The fixture qualified its own selection rule and that qualification is transcribed verbatim,
because it is exactly the sentence that dies with a deleted file --
`selection.methodLimitation`: *"trainer reports exposed a two-bout test probe for every run
before selection; the observed choice follows validation ordering, but this was not a pristine
test quarantine"*. The negative result below is honest **because** of that line, not in spite
of it: a run that says where its own quarantine leaked is worth more than one that claims a
clean one.

The selected champion then scored **0.000** mean win over 24 mirrored held-out bouts in each
of five loadouts, against **0.4167** for scripted meta and **0.1917** for the random-option
control. It won no bout in any loadout. Scripted specialist scores were sword 0.625, shield
0.9583, axe 0, bow 0.500 and bare hands 0. Its decision stream was **88.04% disengage** --
6,550 disengage, 409 cover, 267 cut, 214 punch, and nothing else -- and it failed exactly
seven predeclared gates:

1. held-out win score did not beat scripted meta;
2. held-out win score did not beat random-option control;
3. sword trails its scripted specialist by more than 15 percentage points;
4. shield trails its scripted specialist by more than 15 percentage points;
5. bow trails its scripted specialist by more than 15 percentage points;
6. fewer than three non-recover options occupy at least 8% of decisions;
7. a stuck option was observed.

The gate it **passed** is worth as much as the seven it failed, because that gate has since
been deleted and nobody would otherwise know it never bit. `promotion.ts`'s
`MIN_STRONGER_MOTIFS` required two transition motifs more common than the scripted baseline;
the fixture recorded six -- `cover->disengage` 0.457, `cut->disengage` 0.376,
`disengage->cover` 0.202, `disengage->cut` 0.390, `disengage->punch` 0.417 and
`punch->disengage` 0.376 per 100 decisions, against **0 for scripted on every one of them**.
A controller that spent 88% of its decisions disengaging cleared a diversity gate by
oscillating in and out of that one option, and scripted scored zero only because it does not
produce this shape of transition at all. The gate agreed with the verdict the others had
already reached, which is not the same as working. `tournament.ts` has no motif gate and this
is the evidence against putting one back unexamined.

Its `commands` block recorded the reproduction method. **None of these four command lines
runs any more**, which is precisely why they are transcribed rather than summarised: a negative
result whose method has been deleted stops being a result and becomes an anecdote. Precisely:
`npm run ai:train` is gone from `package.json` with `train-meta.mjs`, so the first three do not
resolve at all; `npm run ai:evaluate` **still exists**, and so does `--output`, but
`--checkpoint`, `--training-report`, `--seed` and `--bouts` all belonged to
`promotion-evaluator.mjs` and went with it -- that command now answers only the held-out test
split from a frozen manifest, and its default split moved from `train` to `test`. This
paragraph said "none of these four commands
exists any more", which was wrong about the fourth; the list at the head of this section --
"the `ai:train` and `ai:options` commands ... and the train and validation splits of
`ai:evaluate`" -- was right, and the two now agree.

```
npm run ai:train -- --seed 20260823 --run-id session13-20260823 --workers 8
npm run ai:train -- --seed 777001  --run-id session13-777001  --workers 8
npm run ai:train -- --seed 991337  --run-id session13-991337  --workers 8
npm run ai:evaluate -- --checkpoint asset-src/learning/runs/session13-777001/champion.bin \
  --training-report asset-src/learning/runs/session13-777001/report.json \
  --seed 777001 --bouts 24 --output asset-src/learning/runs/session13-777001/promotion.json
```

The half of `the_compact_unpromoted_evidence_recomputes_the_recorded_failure` that was real
coverage -- that the validation ordering rule reproduces the recorded champion -- went with
`selectValidationChampion` in `promotion.ts`, whose surviving namesake in
`quality-diversity.ts` is a different function with a different signature and its own test in
`tests/neat-qd.test.mjs`.

### `train-meta.mjs` was dead on arrival, and that is the durable part

It wrote `optionNames: OPTION_NAMES` -- the eight-name compatibility vocabulary -- into every
checkpoint, while `checkpoint.ts`'s runtime contract required the twelve names
`[...MOVEMENT_NAMES, ...HAND_ACTION_NAMES]`. Its own codec therefore refused every checkpoint
it produced, by name, at `checkpoint option names do not exactly match the runtime option
names`. It also seeded genomes with `OPTION_NAMES.length + 1` = 9 outputs where
`networkMetaMind` required 13 and would have refused those too.

Two vocabularies for one concept is how that happened: an eight-name list kept "for reports
written before tactics had two heads" outlived every report that read it and stayed reachable
from the trainer. `OPTION_NAMES` is deleted; `MOVEMENT_NAMES`, `HAND_ACTION_NAMES` and
`TACTIC_NAMES` are the whole vocabulary, chosen by the question being asked.

### What went with `evaluate-options.mjs`, and what did not

Two of the six things only that module knew are now tested elsewhere. Four are **lost
coverage**, recorded here so the gap is known rather than invisible:

| what it knew | where it is now |
| --- | --- |
| Synthetic 520-sample archer shot parity, specialist against scripted meta, at limits of 0.01 duty and 1 edge | `specialists_and_options_share_the_full_stroke_and_shot_timeline` compares both controllers' held, released and edge counts exactly. It previously ran only the meta archer and never compared. |
| Every numeric leaf of an `Intent`, cross-checked against `INTENT_FIELDS` | `intentNumbers` moved from `promotion-evaluator.mjs` into `evaluation.ts`; `the_finiteness_sweep_covers_every_combat_number_and_nothing_else` is the cross-check that caught the `zoom` regression. |
| **Lost:** real-solver twelve-row paired parity at zero damage/seconds/action-rate limits, with a specialist-repeat control proving the limits are achievable | Nothing. Every surviving parity test is fixture-only. This needs minutes of real Havok and cannot live in `npm test`; whoever wants it back needs a slow command outside the suite. |
| **Lost:** the unscored warm-up and fresh-Havok-per-bout discipline, which is the encoding of the session-11 finding that a shared Havok module flips winners after disposal | Partly. `freshHavok()` is still called -- by `measure.mjs --selftest`, by `scripts/research-havok.mjs:8` for every research bout, and four times in `tests/integration.test.mjs`. What is lost is the *bracket*: an unscored warm-up followed by subject, control and control-repeat in one round, which is the part that made two controllers comparable. Nothing runs that. |
| **Lost:** the `--calibrate` discrete gate, the procedure that produced the parity limits | Nothing. The limits themselves are recorded above; the way to regenerate them is not. |
| **Lost:** the corpus cells `duelist-club` and `idle-control` | `RESEARCH_STRATA` does not cover either, so no command now fights a club duelist or an idle control. |

`PARITY_LIMITS`, `PARITY_CALIBRATION`, `SYNTHETIC_FIELD_LIMITS` and `SHOT_PARITY_LIMITS` went
with the evaluator, rather than being left in `evaluation.ts` as exported constants nothing
reads. All four of their values are in this section, which is where a result belongs.

That paragraph said "the evaluator that was their only consumer" and **the evaluator was not
their only consumer**: `tests/options.test.mjs` imported `PARITY_LIMITS` and
`PARITY_CALIBRATION` and asserted the checked-in baseline's `parityLimits` and
`parityCalibration` blocks against them. That test read the fixture this stage also deleted, so
it went too and the constants are genuinely unread now -- but "nothing else consumed them" and
"everything that consumed them died in the same pass" are different sentences, and only the
second one is true.

### `ai:evaluate` answers only the held-out test split

`scripts/evaluate-ai.mjs` produced its train and validation engagement summaries by importing
`evaluate-options.mjs` and re-reading its records, so deleting that module took those two
splits with it. The command refuses them by name rather than reporting nothing:
`--split train is no longer available: ai:evaluate answers only the held-out test split`, and
`--write-engagement-baseline` refuses with a pointer to this document. The held-out tournament
path -- manifest, frozen artifacts, indexed resume and the recomputed verdict -- is unchanged
and remains the only thing this command does.
## Session 17 Stage B: the exact effector, target and stance -- 2026-08-25

Stage B is the **motor** half of tactic v2 and is the stage that can move the balance, which
is why it was isolated and measured on its own before any contract churn. Two controls, one
of which is not the obvious one.

### The null control did not move, to the digit

`npm run measure -- --only duelist-swinger --bouts 120`, seed 20260823, taken before the first
edit and again with the stage complete:

| | duelist | swinger | bout s | duelist damage | duelist severs | scoring contacts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| before | 66/120 = 55.0 % | 54/120 = 45.0 % | 3.52 (1.42-8.98) | 176.17 | 10 | 1496 / 1670 |
| after | 66/120 = 55.0 % | 54/120 = 45.0 % | 3.52 (1.42-8.98) | 176.17 | 10 | 1496 / 1670 |

Every printed figure is identical, including the final-blow region histogram. **This is a null
control rather than a result**: `policies.ts` never imports `options.ts`, so the scripted
specialists do not go through the option layer at all and this bout cannot see a tactic-v2
change. It is run because they *share* `applyActionPosture`, `actionCoverAt`, `actionAimAt` and
`actionArcherAim` -- a change that leaked into one of those four would move every scripted
policy and every figure in this document, and this is the cheapest thing that would say so.

### The real control is the parity sweep, and it stayed at zero

`the_scripted_meta_controller_matches_the_policy_it_replaces` in `tests/options.test.mjs`:
1,200 samples of `scriptedMetaMind("duelist", 991)` against `duelistMind(991)` over a scripted
approach, compared field by field across every leaf of the command, plus 520 archer samples
compared against `archerMind(44)` on hold, release and edge counts. **Zero changed fields, max
delta 0, and the archer counts exact.** `scriptedMetaMind` is the one scripted consumer of the
option layer, so this is the only thing in the tree that can catch the execution layer moving
under a scripted controller.

### Which target the scripted callers name, and why the question has no bout

The plan asked for the scripted target to be *chosen by measurement*: naming `vital` drops
every scripted aim 14 cm from the shoulder line it was tuned at, naming `high` lands near the
old entry aim of 1.62 m, and both were to be tried and reported.

**There is no bout that can answer it, and that is the finding.** `npm run measure`'s matchups
are `swinger/idle`, `duelist/swinger` and `duelist/duelist`, all built from `policyMind`, which
never enters an option. The only scripted controller that does is `scriptedMetaMind`, whose
sole gate is the zero-delta parity sweep above -- so any named region moves it off parity by
construction, and the "measurement" would be a test failure rather than a win rate. The
execution layer therefore carries a fifth aim that is deliberately **not** in `TARGET_NAMES`:
`"as-measured"`, the line every scripted figure in this document was taken at -- the
opponent's shoulder for a point, twenty centimetres above it for the centre of a stroke's arc,
twelve below it for a shaft. **No learned output can *name* it** -- `TARGET_NAMES` is the table
an argmax indexes and this is not in it -- which is not the same as unreachable, and the code
said the stronger thing until the routes were traced. `threat` is a `TargetName` a controller
can emit and is not a height, so wherever a height is wanted the measured line stands in; the
two skills that may name `threat` consume it as a moving point first, and every other action is
refused `threat` at construction rather than being handed the shoulder line under a name it did
not choose. Moving the scripted policies onto a real region is a balance change that needs a
bout to justify it, and the session that builds one -- 18, at a keyboard, or 23, at the
tournament -- is where it belongs.

### What a named target is worth, per action, measured on the contacted limb

**This section said "the three land on the head, the torso and the pelvis -- and *that* is the
claim" and published one table, for `thrust`. The claim is not general and the four tables are
below.** All four are one Havok bout each, seeds `[11, 22]`, the option driven directly against
a bare-handed idle warrior, `HitReport.key` counted, blocks excluded, `head` / `torso` /
`pelvis+thighs+shins`. The three melee actions compose with `close`, exactly as the test does;
`shoot` composes with the option's own movement, because an archer walked into contact is not
a shot. Seeds do not vary the result -- the driving mind is deterministic and `idle` ignores
its seed -- so pooling over eight seed pairs returns exactly eight times each count, and the
per-bout figures are what is quoted.

The aim rule is `vital` at the published `vitalHeight`, and `high` and `low` three quarters of
the vitals-to-crown span above and below it. On a warrior (vitals 1.28 m, crown 1.765 m, span
0.485) that is 1.644 m, 1.28 m and 0.916 m, against a head capsule of 1.555-1.765, a torso of
1.02-1.54 and a pelvis of 0.83-1.09.

**`thrust` -- the rule holds, and this is the table that was already published.**

| target | head | torso | low group | body | head share | low share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `as-measured` | 13 | 114 | 17 | 144 | 0.090 | 0.118 |
| `vital` | 6 | 295 | 32 | 333 | 0.018 | 0.096 |
| `high` | 76 | 66 | 15 | 157 | 0.484 | 0.096 |
| `low` | 1 | 24 | 112 | 137 | 0.007 | 0.818 |

**`cut` -- the rule does not hold.** `high` takes a *lower* head share than the aim it replaces,
and all three named regions raise the low share by roughly the same amount.

| target | head | torso | low group | body | head share | low share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `as-measured` | 2 | 16 | 10 | 28 | 0.071 | 0.357 |
| `vital` | 0 | 15 | 35 | 50 | 0.000 | 0.700 |
| `high` | 1 | 7 | 14 | 22 | 0.045 | 0.636 |
| `low` | 3 | 12 | 24 | 39 | 0.077 | 0.615 |

**`punch` -- the rule does not hold either**, and it fails the same way: `high` takes 0.121
against the measured aim's 0.200. `punch` may not name `low`.

| target | head | torso | low group | body | head share | low share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `as-measured` | 7 | 25 | 3 | 35 | 0.200 | 0.086 |
| `vital` | 1 | 18 | 12 | 31 | 0.032 | 0.387 |
| `high` | 4 | 26 | 3 | 33 | 0.121 | 0.091 |

**`shoot` -- directionally right and far too thin to be a claim.** Two to four body contacts a
bout: `high` is the only aim that put anything in a head, and the other three put everything in
the torso, but nothing here separates `vital` from `low`.

| target | head | torso | low group | body | head share | low share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `as-measured` | 0 | 4 | 0 | 4 | 0.000 | 0.000 |
| `vital` | 0 | 4 | 0 | 4 | 0.000 | 0.000 |
| `high` | 2 | 0 | 0 | 2 | 1.000 | 0.000 |
| `low` | 0 | 4 | 0 | 4 | 0.000 | 0.000 |

**The reason is structural and is worth stating exactly.** `thrust` and `shoot` are *points*:
the aim is where the tip is sent, and `actionAimAt` sends it there. `cut` and `punch` are
*strokes* down one shared branch: the aim seeds only the **centre** of an arc, and `enter`
derives the arc from it as `+-0.62` in cursor X and `+-0.50` in cursor Y. Two things follow.
First, that arc is far wider than the gap between any two named heights, so where the blade
meets the body is decided by the sweep and not by its centre. Second, `aimHeight` adds the
`+0.20` stroke-entry lift **only** to `"as-measured"`, so on a warrior the measured entry aim
is 1.62 m while `high` is 1.644 -- 24 mm apart -- and `vital` and `low` are 340 and 704 mm
*below* it. So a named region on a cut does not point the stroke, it drops it, which is exactly
the shape of the table: every named region raises the low share to 0.61-0.70 against 0.357, and
none of them raises the head share above the 0.071 the measured aim already had.

**Open, and owed a bout: making a cut's `high` reach a head.** The available fix is to lift the
stroke envelope for a high-aimed cut, which is a balance change -- Stage B's whole discipline is
that the scripted line does not move -- so it is not taken here. **Flagged for session 23**,
which is the one that decides whether the six stances earn their place and is the next time
anything in this layer is allowed to move on a held-out result. A capability that works for two
of four actions is worth shipping; describing it as working generally is not, which is what this
section did.

`a_thrust_at_a_named_high_or_low_target_reaches_that_body_region` asserts on these shares and
not on `intent.pointerY`: a cursor elevation is written by the aim and read back by the test
that wrote it, so it goes green whether or not the blade ends up anywhere new. It is named for
`thrust` because `thrust` is what it covers; it was called
`a_requested_high_or_low_target_reaches_that_body_region_without_fallback` while covering one
action of four.

### Why `TARGET_SPAN_FRACTION` is 0.75, corrected

**The reason recorded here was contradicted by its own harness.** It said half the span "does
not move the contact distribution at all". Measured at 0.50 on the `thrust` harness above, a
named `low` takes a **0.71** low share against the measured aim's 0.118 -- a six-fold move --
and `high` takes 0.117 against 0.090. What actually fails at 0.50 is the contact-count floor:
`low` lands 31 body contacts where the test wants more than 40, and `high` reaches 0.117 where
the test wants 0.25.

And the test's verdict is **not monotonic in the constant**. Swept through
`a_thrust_at_a_named_high_or_low_target_reaches_that_body_region`, editing only
`TARGET_SPAN_FRACTION`:

| span | 0.50 | 0.55 | 0.60 | 0.65 | 0.70 | 0.75 | 0.80 | 0.85 | 0.90 | 0.95 | 1.00 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| verdict | fail | fail | pass | fail | pass | pass | pass | fail | pass | pass | pass |

The 0.65 failure is the head share (0.13) and the 0.85 one is `high` and `low` no longer
separating by the required factor. That is a cliff in a physics bout rather than a curve, so
this test bounds the constant from neither side usefully and cannot be what chose it.

**What does choose it is the anatomy, and that argument is sound and checked on both humanoid
bodies.** `high` must land on the head capsule and `low` inside the pelvis, which pins the
fraction from both ends. On a warrior (vitals 1.280, crown 1.765, span 0.485, head 1.555-1.765,
pelvis 0.830-1.090) the band is **0.567 to 0.928**: below 0.567 `high` slides into the torso,
which runs 1.020-1.540, and above 0.928 `low` drops out of the pelvis into the thighs. A broot
is a uniform 1.18x scale of the same skeleton, so its band is the same two numbers -- verified
rather than assumed. 0.75 is very nearly the midpoint of that band (0.747), and that is the
whole of why it is 0.75 rather than 0.70 or 0.80.

### Two masks that used to disagree now agree, and one loadout of seven closed

`supportedOptions` asked its own weapon predicates while the option's `requireHand` asked a
near-identical set of its own; both now ask `tacticEffectors`, which is the single legality
rule and is also what the executor refuses by. One row moved when they were joined: **`punch`
is no longer offered on a body holding a two-handed weapon.** A bow or a club welds the other
arm to the haft, `Fighter.update` sends it to a grip point and ignores its half of the command
entirely, so the punch was posed and thrown away.

**This section claimed that closed "one of the three divergent legality tables ... from the
runtime side", and it did not.** Measured cell by cell -- runtime `supportedOptions` against
`actionsFor` in `scripts/train-lookahead.mjs`, over every `RESEARCH_STRATA` body/loadout, on the
working tree and again on `da025f2`:

| cell | trained by `actionsFor` | offered at runtime | at `da025f2` | now |
| --- | --- | --- | --- | --- |
| `warrior/sword+empty` | cover, cut, thrust, recover | + `punch` | diverges | **still diverges** |
| `warrior/axe+empty` | cover, cut, recover | + `punch` | diverges | **still diverges** |
| `warrior/bow+empty` | cover, shoot, recover | -- | diverges | **closed** |
| `warrior/sword+shield` | cover, cut, thrust, recover | -- | agrees | agrees |
| `warrior/sword+buckler` | cover, cut, thrust, recover | -- | agrees | agrees |
| `warrior/empty+empty` | cover, punch, recover | -- | agrees | agrees |
| `centipede/natural:bite` | bite, recover | -- | agrees | agrees |

The six `broot` rows are identical to the six `warrior` rows. So the honest count is: the table
diverged on six of thirteen cells at `da025f2` and diverges on four now -- **the `bow+empty` row
closed on both units and the `sword+empty` and `axe+empty` rows did not**, because a sword or an
axe leaves a genuinely free empty hand that the runtime will offer a punch with and the schedule
still never trains. The plan itself says `actionsFor` omits `punch` for sword, axe *and* bow.
Closing the remaining two is Stage C's, per the plan; it is not done here.

**What that divergence does today, recorded rather than fixed.** `lookaheadMind` builds its
tactic pairs from `deployableActions` -- the runtime mask -- and calls `requireCalibration` for
every pair before planning. On `warrior/sword+empty` and `warrior/axe+empty` that includes
`close+punch`, which the training schedule never produced a cell for, so the first replan throws
`lookahead refuses warrior/sword+empty: tactic "close+punch" has no calibrated model`
(`tactical-model.ts`'s `requireCalibration`). **It is pre-existing**: probed on a throwaway
worktree at `da025f2` with a model built exactly as `trainLookahead` builds one, the same two
cells throw there, and `bow+empty` throws there as well and no longer does -- so Stage B strictly
reduced this, from three throwing cells per unit to two.

**Is it live?** Not through anything shipped. `lookaheadMind` is only reachable through
`deployedResearchMind`, and the only checked-in lookahead artifact --
`asset-src/learning/research/session18-minimum/champion.artifact` -- is feature version 3 against
a runtime at 4, so `decodeResearchArtifact` refuses it before a mind is ever built. It becomes
live the moment a v4 lookahead artifact is trained and evaluated through
`scripts/tournament-executor.mjs`, which builds its `bodyLoadout` from `${job.unit}/${job.loadout}`
straight out of the research matrix and therefore reaches both of those cells.

`research-rollout-worker.mjs` still carries the third table, and it is still not equivalent;
Stage C owns it.

### A control's draw sequence moved, and only on `bow+empty`

`randomMetaMind` filters the action table by `supportedOptions` *before* `rng.choose`, so
removing `punch` from a cell's supported set shortens the array the draw indexes and the same
seed produces a different action sequence. `random-meta` is one of the three
`RESEARCH_OPPONENTS` in every stratum, so this is a control changing behaviour and is worth
recording even though nothing pinned moved.

Measured over the first ten decisions, seeds 1, 7 and 991, on the working tree and on
`da025f2`: **only `bow+empty` moves.** `sword+empty`, `axe+empty`, `empty+empty` and
`sword+shield` are byte-identical, and so is the *movement* half of every draw on every loadout
-- the movement `rng.choose` runs first and over an unfiltered table. Seed 1 on `bow+empty`,
actions only:

| | first ten |
| --- | --- |
| `da025f2` | cover recover **shoot punch punch** recover cover recover shoot cover |
| now | cover recover **recover shoot shoot** recover cover recover shoot cover |

**No research bout in the tree draws from the changed sequence today**, which is why nothing
moved: `runResearchBout` hands the opponent `LOADOUTS["sword+empty"]` whatever the actor's cell,
so a `random-meta` control never holds a bow. Any future harness that gives one a bow, and any
recorded `bow+empty` random-control trace, is not comparable across this change.

### What did not move, and what was left for later

- **`arrowCrossing` and the arrow tier of `selectThreat` needed no change.** Both extrapolate
  the shaft's *published* position and velocity under gravity and neither reads
  `actionArrowLift`, so a defender answers the shot that was actually taken whatever it was
  aimed at. What is aim-dependent is the worked example in `approachToScratch`'s note -- 136 mm
  of predicted miss at 8 m, 306 at 12, 689 at 18 -- which was taken on a shot aimed over the
  shoulder-minus-12-cm line by exactly that lift. Nothing names a different region yet; the
  note on `actionArcherAim` says so in place.
- **Look-ahead cell counts are unchanged.** Stage B leaves the tactical model keyed on
  `(movement, action)`; `deployableTactics` exists and is tested, but nothing production takes
  an argmax over it until Stage C, so the ~19-21x enumeration cost the plan prices belongs to
  sessions 20 and 21 and is not measured here.

## Session 17 Stage C1: one output table, one legality table, one schedule -- 2026-08-25

Three preparatory jobs, deliberately landed before the output contract widens from 13 to 26, so
that when the width does move a reviewer can tell which change caused what. **The contract is
still 13 wide.** Two of the three are behaviour-preserving; the third is a bug fix with a
measured training-behaviour consequence, recorded below.

### The null control did not move, again

`npm run measure -- --only duelist-swinger --bouts 120`, seed 20260823, before the first edit
and with the stage complete: 66/120 = 55.0 %, bout 3.52 (1.42-8.98), damage 176.17, 10 severs,
1496 / 1670 scoring contacts, and the same final-blow region histogram -- every printed figure
identical. Nothing in this stage reaches `policies.ts` or `action-primitives.ts`, and this is
the cheapest thing that would say otherwise. 488 tests before, **491** after; `npm run check`
and `npm run build` clean.

### The five output-layout derivations, and the one that could not survive the widening

The `[5 movement][7 action][1 persistence]` layout was re-derived from `MOVEMENT_NAMES.length`
at `deployment.ts` twice -- once for the width, once for the two slice bounds -- and at
`train-neat-qd.mjs`, `research-rollout-worker.mjs` and the artifact fixture in
`tests/tournament-executor.test.mjs`. All five now read `META_OUTPUT_LAYOUT` in
`src/learning/meta.ts`, which names `movementAt`, `actionAt`, `persistenceAt` and `width`.

**The hazard was not the width, it was the `-1`.** `deployment.ts` sliced the action logits as
`values.slice(MOVEMENT_NAMES.length, -1)` and read persistence as `values.at(-1)` -- which is
"everything after the movements except the last number", not "the action logits". Those
coincide only while exactly one scalar trails the table. With effector, target and stance heads
in front of that scalar, the same line silently folds thirteen extra logits into the action
argmax: a wrong decision from a correct vector, which no width check can see.

Behaviour identity is proved rather than argued.
`the_training_decoder_and_the_deployment_decoder_answer_the_same_label`
(`tests/learning.test.mjs`) drives a genome whose thirteen outputs are exactly thirteen chosen
numbers through **both** surviving decode sites -- `deployedResearchMind`'s NEAT branch and
`research-rollout-worker.mjs`'s `neatLabeler` -- on the same published features, across all
seven research loadouts, and compares both whole tables against a third written out by hand.
Mutating `META_OUTPUT_LAYOUT.actionAt` to `MOVEMENT_NAMES.length - 1` fails it and the offset
pin beside it.

The persistence rescale was a third duplicate of the same contract and is now
`decodeMetaPersistence`. Its `0.35` is **not** spelled `(MAX_PERSISTENCE - MIN_PERSISTENCE) / 2`:
in doubles that expression is 0.35000000000000003, so the tidier spelling moves every decoded
persistence in its last bit and turns a collapse into a behaviour change. The literal is what
every rollout in the tree was taken under, and what it actually produces is `MIN_PERSISTENCE`
exactly at -1 and 0.7999999999999999 at +1 -- one ulp under `MAX_PERSISTENCE`. Both endpoints
are now pinned as the literals they are.

### The fourth legality table was not the deployed one, and this is where it disagreed

`research-rollout-worker.mjs`'s `neatLabeler` carried a hand-inlined mask that decoded every
NEAT and DAgger rollout **during training**, while `deployableActions` decided what could be
deployed -- and, one call later inside `researchLabelMind`, what was allowed to run at all.

The plan flagged two rewrites: `weapon === "sword"` for `thrust` against `hasPoint`, and the
exclusion list `!["empty","bow","shield","buckler"]` for `cut` against
`isStriking && !== "empty"`. Swept over all 49 ordered weapon pairs, **both rewrites answer
identically for every kind in `GRIPS` today**, which is how they survived two sessions looking
for them. They were still worth deleting -- a pointed spear is a `thrust` the name test refuses
-- but they are not the defect.

**Every actual disagreement is the two-handed holder rule**, which neither rewrite knows about,
and the rollout mask is the wider one in all twelve pairs:

| self loadout | rollout mask offered, `deployableActions` did not |
| --- | --- |
| `sword+bow`, `bow+sword` | `cut`, `thrust` |
| `sword+club`, `club+sword` | `thrust` |
| `axe+bow`, `bow+axe`, `bow+club` | `cut` |
| `club+bow` | `shoot` |
| `bow+empty`, `club+empty`, `empty+bow`, `empty+club` | `punch` |

Restricted to `RESEARCH_STRATA` -- the only loadouts this code ever sees, measured on real
published bodies through `runResearchBout` rather than on a fixture -- the disagreement is
**one loadout of the seven**, which is **two of the thirteen cells**, one on each humanoid unit:

| cell | rollout mask | `deployableActions` |
| --- | --- | --- |
| `warrior/bow+empty`, `broot/bow+empty` | cover, **punch**, shoot, recover | cover, shoot, recover |
| the other eleven cells | *identical* | *identical* |

This paragraph said "exactly one row of thirteen" while the table under it counted eleven cells
the other way, which is two units of measure in four lines: a *loadout* has one row in
`LOADOUT_ACTIONS` and two cells in `RESEARCH_STRATA`, because both humanoid units carry it.
Thirteen is the cell count (six loadouts x two humanoids, plus the centipede's bite), so
"one row of thirteen" was never a quantity. The same conflation is corrected at
`src/learning/meta.ts` and in the session overview.

**`club` never reaches this code, and it is half the sweep above rather than a corner of it.**
It is a `WeaponKind`, it is two-handed, it strikes and it has no point -- and no
`RESEARCH_STRATA` loadout carries one, so **six of the twelve ordered pairs are unreachable**:
`sword+club`, `club+sword`, `bow+club`, `club+bow`, `club+empty` and `empty+club`, which is four
of the five markdown rows. This document said "its three rows in the sweep above are synthetic",
undercounting both the pairs and the rows. The remaining six all involve a bow, and of those
only `bow+empty` is a `RESEARCH_STRATA` loadout -- which is the same fact the table above states
as one loadout of seven. A club loadout added later fails exactly as the bow does, for exactly
the same reason.

**What moved, therefore.** On `bow+empty` a genome whose `punch` logit beat its `cover`,
`shoot` and `recover` logits used to be labelled `punch` and then killed by the deployment mask
one call later -- `research policy produced unsupported action "punch" for unit "warrior"` --
aborting the rollout mid-run. Stage B introduced that: before `da025f2` the deployment mask
offered `punch` there too, so the two agreed on a lie. It now answers the best *legal* action
instead. Nothing pinned moves and no learned artifact is deployed, but any `bow+empty` NEAT or
DAgger rollout taken before this change is not comparable across it. Restoring the old inline
mask reproduces the divergence exactly: `punch` against `shoot` on `bow+empty`, every other
cell unchanged.

A **fifth** copy of the same rule turned up on the way, inlined in `collectTacticalTrace`
(`scripts/train-lookahead.mjs`) as
`supportedOptions(view).has(action) && (action !== "cover" || hasHand)`. That is
`deployableActions` spelled out, term for term, and it now asks for it.

**It was not one rule after stage C1, and the commit that said so had counted five of seven.**
`train-ppo.mjs` held the sixth and seventh:

- the league-opponent branch spelled out `supportedOptions` plus the `cover` delete, character
  for character `deployableActions`'s body;
- `collectPpoTrajectory` used **bare `supportedOptions`, without the cover delete** -- and that
  is the mask the trajectory collector PPO learns from, while `deployment.ts`'s PPO branch
  deploys under `deployableActions`. The same train/deploy split stage C1 exists to close,
  surviving inside the file that spends the budget.

Both now read `supportedActionIndices`. **Behaviourally identical today, and measured rather
than argued**: over 394 probed capability cells -- every ordered weapon pair from `WEAPON_KINDS`,
both loss flags on each hand, with and without a natural bite, plus the handless body -- the
copy with the delete and the copy without it each differed from `deployableActions` in **0**
cells, and the number of cells where the delete had anything to delete was **0** as well, since
`supportedOptions` adds `cover` only when a hand is attached. That is the same probe and the same
394 the `deployableActions` docstring records. A redundant guard held in one of two copies and
absent from the other is exactly how the first five drifted apart with nothing going red, which
is why "prove it is redundant" is not the same argument as "leave it alone".

### The look-ahead schedule was wrong where the runtime was right

`actionsFor` did not train `punch` on `sword+empty` or `axe+empty`. The runtime mask offers it
there, and the runtime is right: unlike a two-hander's trailing hand, which `Fighter.update`
welds to the haft and the fighter excludes from the strikers list, that off hand is genuinely
free. `lookaheadMind` plans over the runtime mask and calls `requireCalibration` on every pair
it plans, so those two cells threw
`lookahead refuses warrior/sword+empty: tactic "close+punch" has no calibrated model` on the
first replan -- **pre-existing, verified at `da025f2`** -- and were not live only because the
one checked-in look-ahead champion is feature v3 against a v4 runtime and is refused at decode.

Reproduced on this tree by reverting the two rows and fitting a model from the schedule:
`sword+empty` and `axe+empty` throw, `bow+empty`, `empty+empty` and `sword+shield` plan. With
the rows restored, all five plan.

The nested `startsWith` chain became `LOADOUT_ACTIONS`, one row per `ResearchLoadout`, and an
unknown loadout is refused by name instead of falling through to the sword row.

**The new figures, and they are not final.** Measured by expanding the real schedule:

| | before | now |
| --- | ---: | ---: |
| schedule tasks per split | 220 | **240** |
| groups (`3 x train + validation`) | 880 | **960** |
| minimum solver-step budget (`groups * 48`) | 42,240 | **46,080** |

The 42,240-step exhaustive run recorded earlier in this document was taken under the old
schedule and stays as the record of that run. **This is a small increase that session 20's
tuple expansion supersedes by roughly twentyfold**; it is the current figure, not a ceiling.

`the_training_schedule_offers_exactly_what_the_runtime_mask_offers` (`tests/lookahead.test.mjs`,
734 ms) is the pin on the rows: one short Havok bout per cell, the mask read off the **real
published body** on every sample, and the whole thirteen-row table compared at once. It asserts
one distinct mask per cell as well as its contents, so a capability that moved mid-probe would
fail it too. Dropping `punch` from the `sword+empty` row fails it on both humanoid units.

**It covers intact bodies, and this document called it "the durable pin" on a disagreement it
structurally cannot see.** Every one of its thirteen bouts runs 48 solver steps on a body that
starts and finishes with both arms, and a per-loadout row cannot describe anything else: the
row keys on the loadout a body *started* with, the runtime mask keys on what is still attached,
and the two come apart the moment a hand comes off. See the section below.

### A schedule row cannot describe a mask that depends on live body state

Severing the bow hand of a `bow+empty` removes the two-handed weld along with it, so the
surviving empty hand is free and the runtime mask becomes `cover, punch, recover` against that
loadout's row of `cover, shoot, recover`. `lookaheadMind` planned over the runtime mask and
called `requireCalibration` on every pair it could name, so it asked for a `close+punch` cell no
budget had ever been spent on and threw
`lookahead refuses warrior/bow+empty: tactic "close+punch" has no calibrated model` in the
middle of a bout. **Severance is routine, not an edge case**: the `duelist-swinger` null control
reports 10 severs in 120 bouts. Both masks below were read off real published bodies through
`runResearchBout`, not off a fixture:

| body | intact mask | after losing the primary hand | that loadout's schedule row |
| --- | --- | --- | --- |
| `warrior/bow+empty` | cover, shoot, recover | cover, **punch**, recover | cover, shoot, recover |
| `warrior/sword+empty` | cover, cut, thrust, punch, recover | cover, punch, recover | cover, cut, thrust, punch, recover |

The sword body survives only because its row already trains `punch`; the bow body does not, and
adding a row for it chases *states* rather than loadouts -- there are two hands, each of which
can be lost, times every loadout, and the mask also folds the two-handed holder rule. So the fix
is not another row. `calibratedTacticPairs` (`src/learning/lookahead.ts`) filters the pair set to
the cells the model has a calibration for and `lookaheadMind` refuses by name only when nothing
survives. That is not the silent repair the plan forbids: repairing an *illegal* action would
substitute a name the body cannot perform, whereas this narrows the search by the search's own
competence and every surviving pair is still one `deployableActions` offered.

Two more things the same filter closes:

- **Both arms gone was a throw.** `deployableActions` answers the empty set for a warrior with
  no attached hand and no jaws, `boundedLookahead` was handed an empty pair list, and it threw
  `lookahead has no supported tactic pairs` mid-bout. The mind returns `freshIntent()` there
  now, which is the answer `researchLabelMind` and `randomMetaMind` already gave on the same
  mask -- an incapable body is a fact about the body, not a request the model failed.
- **A model that can predict nothing this body does is still a refusal**, by name and naming the
  actions it could not predict:
  `lookahead refuses centipede/bite: no calibrated model for any tactic on [bite, recover]`.

`a_severed_hand_moves_the_mask_and_the_lookahead_plans_over_what_it_can_predict`
(`tests/lookahead.test.mjs`, 88 ms) is the pin, on fixtures taken from real published bodies with
one hand then both taken off. It compares the whole `{mask, scheduled, planned}` record for the
three cases against a hand-written one, and it asserts that the bow cell's `close+punch` really
has no calibrated model -- so a plan that avoided it did so by declining rather than by the
schedule quietly growing a row. Watched fail twice: with the filter removed it throws
`tactic "close+punch" has no calibrated model`, and with the inert branch removed it throws
`no calibrated model for any tactic on []`.

### What a stale-width output vector actually did, and what a non-finite one still does

`readMetaOutput`'s docstring said a genome bred against a stale output count "used to decode to
`undefined` logits and lose every `>` comparison in an argmax -- a controller that always answers
the first name in the table". Measured against both pre-`c149e8c` decode sites, on the
twelve-wide vector `[0,0,0,0,0,1,1,1,1,1,1,9]` -- whose maximum sits where `recover` belongs --
across `sword+empty`, `bow+empty` and a centipede:

| width | `deployment.ts` answered | `research-rollout-worker.mjs` answered | persistence |
| ---: | --- | --- | ---: |
| 13 (control) | `close` + `recover` | `close` + `recover` | 0.6249999999999999 |
| 12 | `close` + `cover` (`bite` on the centipede) | `close` + `recover` | 0.7999999999999999 |
| 9 | `close` + `cover` | `close` + `cover`, `recover` on the centipede | 0.7999999999999999 |

So the shape it prevented was **two decoders answering different actions from one genome**, not
a controller stuck on the first name. `deployment.ts` sliced the action half as
`slice(MOVEMENT_NAMES.length, -1)`, which at twelve wide is six numbers, so `recover`'s index was
off the end and unreachable there while the rollout worker still read it. Both spelled persistence
"the last number", which at twelve wide *is* `recover`'s logit -- the 9 clamped to +1, so every
decision came back at the top of the window for as long as the genome lived. `undefined` needs a
vector shorter than twelve, and even then the rollout worker falls to its seed `recover`, the
**last** name in the table; only the movement loop can answer "the first name", and only below
five outputs.

**The width refusal is shadowed at `deployment.ts` and earns its place at the rollout worker.** A
NEAT genome's output count is a property of the genome, so the all-zero probe in
`deployedResearchMind` catches any width before the labeler is built; `neatLabeler` has no probe
in front of it.

**Nothing was watching the trailing scalar at all.** The `learned meta-policy produced a
non-finite output` guard went with `networkMetaMind` in stage A. `maskedArgmax` refuses a
non-finite *logit*, so what survived was persistence: a network finite on the all-zero probe and
overflowing on real features decodes to `persistence: NaN`, `researchLabelMind`'s `nextDecision`
becomes `NaN`, and `view.clock >= nextDecision` is permanently false. Measured over four seconds
at 60 Hz on a `sword+empty` fixture holding `hold+cover`: **38 decisions with a 0.10 s window
against 14 with `NaN`**. That is not the freeze it looks like -- a completed skill still forces a
decision -- which is worse: the persistence window silently stops existing and the controller runs
a different algorithm from the one being trained. `readMetaOutput` refuses by name now,
`learned output "persistence" is NaN`.
`a_non_finite_learned_output_is_refused_by_name_before_it_deletes_the_persistence_window`
(`tests/learning.test.mjs`) pins the three refusals, drives a genome built to pass the zero probe
and fail on a body, and asserts both decision counts. Removing the finiteness check fails it.

### The tie-break neither decoder pinned

`>` and not `>=`, in the rollout worker's hand-rolled argmax and in `maskedArgmax` alike, so two
names at the same logit resolve to the earlier one in the frozen table. Flipping either
comparison left all 491 tests green.
`a_logit_tie_is_broken_by_table_order_in_both_decoders` ties `hold` against `circle-right` and
`cover` against `punch` and requires both decoders to answer `hold`+`cover`; each flip fails it.

### The schedule's own refusal was untested

`actionsFor` throws `lookahead schedule has no tactic row for loadout "..."` rather than falling
through to the sword row, which is the whole argument for replacing the `startsWith` chain with
`LOADOUT_ACTIONS`. Replacing that throw with `return LOADOUT_ACTIONS["sword+empty"]` -- the exact
silent default it was built to kill -- left the suite green. It is asserted now, on `club+empty`
and on `toString`, the second because the lookup is `Object.hasOwn` and an `in` would answer the
prototype.

### A worker that exits 0 having done nothing hangs its trainer

`research-rollout-worker.mjs` posts its result only `if (parentPort)`, and both trainers resolve
on the worker's `message` while rejecting only on `error` or a non-zero `exit` -- so finishing
without posting is the one outcome neither can see, and the run waits forever. A worker thread
always has a port, so the reachable path is a person running the file, which now refuses by name
and exits 1 instead of exiting 0 in silence.
`the_rollout_worker_refuses_a_command_line_rather_than_exiting_zero_having_done_nothing`
(`tests/neat-qd.test.mjs`, 480 ms) spawns the real process for the exit code and the sentence,
and checks that importing the module is still silent -- which is why the gate exists.

### The review pass, as landed -- 2026-08-25

491 tests before, **495** after; `npx tsc --noEmit` and `npm run build` clean. The null control
`npm run measure -- --only duelist-swinger --bouts 120` at seed 20260823 is identical to the
digit for the third stage running: 66/120 = 55.0 %, bout 3.52 (1.42-8.98), damage 176.17, 10
severs, 1496 / 1670 scoring contacts. The schedule still expands to 240 tasks per split, 960
groups and 46,080 minimum solver steps.

## Session 17 Stage C2a: the output contract is twenty-six wide -- 2026-08-25

The width moved. Nothing in the four research trainers moved with it -- that is stage C2b -- so
this stage is the contract, the rule that makes the wider tuple legal by construction, and the
artifact header that refuses an artifact trained against the old one.

### The null control did not move, for the fourth stage running

`npm run measure -- --only duelist-swinger --bouts 120`, seed 20260823, taken before the first
edit and again with the stage complete: **66/120 = 55.0 %**, bout **3.52 (1.42-8.98)**, damage
**176.17**, **10** severs, **1496 / 1670** scoring contacts, and the same final-blow region
histogram. Every printed figure identical, both endpoints, on a run that takes 16 s of wall
clock. `src/policies.ts` does not import `src/options.ts`, so this matchup never enters the
option layer at all; it is the cheapest thing in the tree that would say a shared primitive had
been disturbed. 495 tests before, **501** after the stage and **502** after the remediation pass
recorded further down; `npx tsc --noEmit` and `npm run build` clean at both points, and the null
control was taken a third time with the remediation complete and is identical again. Counted as
top-level `test(` declarations rather than as runtime cases, the stage added **six** and extended
two: 485 to 491, and 492 with the remediation's one.

### The layout, as a running sum rather than as six literals

`META_OUTPUT_LAYOUT` names `movementAt` 0, `actionAt` 5, `effectorAt` 12, `targetAt` 15,
`stanceAt` 19, `persistenceAt` 25, `width` 26 -- `[5 movement][7 action][3 effector][4 target][6
stance][1 persistence]`. The offsets are accumulated from the five frozen tables in
`src/options.ts` rather than written out, so a name added to `TARGET_NAMES` moves `stanceAt` and
`persistenceAt` with it; `one_output_table_names_every_offset_a_decoder_reads` holds the sum to
the six numbers it currently comes to, as literals, which is the pin rather than a seventh
re-derivation.

**Stage C1's `-1` fix is what made this a one-line widening.** The old
`values.slice(MOVEMENT_NAMES.length, -1)` would have folded thirteen extra logits into the action
argmax here, silently, with no width check able to see it. The whole surviving hazard was
`readMetaOutput`'s own action slice, whose upper bound moved from `persistenceAt` to `effectorAt`;
restoring it to `persistenceAt` is the mutation that fails the offsets test, with **thirteen**
extra logits appearing on the end of `actionLogits` -- the effector, target and stance blocks
together, because `slice(5, 25)` is twenty entries and seven of them are the action. (This
sentence said "three effector logits" and contradicted the paragraph above it, which had the
number right.)

`decodeMetaPersistence` did not move and its `0.35` is still not spelled
`(MAX_PERSISTENCE - MIN_PERSISTENCE) / 2`, which in doubles is 0.35000000000000003. Both
endpoints stay pinned as the literals they are.

### Twenty-six distinct names, because the refusal indexes into them

`META_OUTPUT_NAMES` is the concatenation of the same five tables plus `"persistence"`, and all 26
are distinct as plain strings -- checked, not assumed, because `readMetaOutput`'s finiteness
refusal names a column by indexing straight into this table. A duplicate would point a refusal at
the wrong head and a short table would point it at nothing.
`the_twenty_six_output_names_are_distinct_columns` asserts the length, the distinctness, the
whole table against twenty-six literals, and **one refusal per column, all twenty-six of them**.
Swapping the effector and target blocks inside `META_OUTPUT_NAMES` -- same length, still distinct
-- fails it.

**It probed six of the twenty-six until the remediation pass, and the name said twenty-six.** The
sampled indices were 0 `close`, 7 `thrust`, 13 `secondary`, 17 `low`, 20 `upright`, 25
`persistence` -- one per block, which catches a block that has moved wholesale and misses any
reordering *inside* one whose sampled end happens to stay put. Swapping `slip-left` and
`slip-right` at indices 23 and 24 left it green. The literals are written out rather than
concatenated from the five vocabularies for the reason the offsets are: a table derived from the
same source as the code agrees with whatever that source says, including that swap.

### The tuple is a sum of three logits over the legal tuples, and the tie-break is not the enumeration order

`selectDeployableTactic` scores every tuple in `deployableTactics(view)` by
`actionLogits[a] + effectorLogits[e] + targetLogits[t]` and takes the largest. The mask is in
front of the comparison; there is no repair behind it.

Measured on `sword+empty` with action `[0, 0.30, 0.20, 1.00, 0, 0, 0]`, effector
`[1.00, 0.10, 0]` and target `[0.20, 0.30, 1.00, 0]`, the three **independent** argmaxes name
`punch` + `primary` + `low`. Every one of those three names is legal on that body on its own and
no pair of them looks wrong; the triple is impossible, because only the empty secondary can punch
and a punch cannot be aimed low. The joint rule answers `cut` + `primary` + `low` at 2.30, the
runner-up being `thrust+primary+low` at 2.20 -- it keeps the two heads the network was most sure
of and drops the action. Raise the punch logit to 3.00 and it answers `punch` + `secondary` +
`high` at 3.40 instead, dropping the other two. No per-head repair makes both of those trades.
Dropping the effector and target terms from the sum answers `punch+secondary+vital` and fails the
test.

**The tie-break is walked, not inherited.** Lower action index, then effector, then target, which
is three ascending loops over the index spaces and a strict `>`. It is *not* a scan of
`deployableTactics`, whose enumeration order is a different order: `tacticTargets("cover")` is
`["threat", "vital"]`, table indices 3 then 0, so `deployableTactics(sword+empty)[0]` is
`cover/primary/threat` and a scan of that list would break an all-zero tie toward `threat`. An
all-zero vector is the ordinary case rather than a contrived one -- `initialSparseGenome` seeds
every bias at zero, so on the first generation of every NEAT run every legal tuple ties. The
answer is `cover/primary/vital`; relaxing `>` to `>=` answers `recover/secondary/threat`.

### The two capability invariants, and the one the stage brief had backwards

`recover` is legal with no hand at all and `cover` is not, which is the separation the last
exhaustive look-ahead run bought. Both halves are asserted whole rather than sampled:

- **A centipede**, which publishes no hand slots and a bite, has exactly three legal tuples --
  `bite/natural/vital`, `recover/natural/threat`, `recover/natural/vital` -- and an all-zero
  vector selects `bite/natural/vital`. Deleting the `recover` exception from `tacticEffectors`
  (`if (!attached.length) return [];`) removes the two recover rows and fails it.
- **An armless warrior is a different answer, and the stage brief asserted otherwise.**
  `tacticEffectors(armless, "recover")` is `["natural"]` and the executor still enters it, but
  `supportedOptions`' first line refuses a body with no attached hand *and* no natural attack
  outright, so `deployableActions` and `deployableTactics` are both empty and no legality below
  that gate puts a tuple back. That is not new and not a defect: `src/options.ts` records it on
  `tacticEffectors` and `tests/options.test.mjs` has pinned it since stage B. The mask being the
  stricter of the two is the safe direction. `selectDeployableTactic` therefore refuses it by
  name -- `tactic has no legal action/effector/target tuple for unit "warrior"` -- rather than
  falling through to `maskedArgmax`'s `has no supported tactic`, which names a head and not a
  body. Nothing production reaches that throw: every controller goes inert at the same boundary
  before it decides.

### The artifact header refuses the output vocabulary as well as the input one

`ResearchArtifactContract` gained `tacticVersion`, `effectorNames`, `targetNames` and
`stanceNames`. The version comparison is written out beside the `featureVersion` one rather than
left to the name tables, and that is load-bearing: `ResearchArtifact.fromBytes` spreads whatever
it decoded and **rejects no unknown key**, so an artifact written against the thirteen-output
header is not caught by having too few fields -- it arrives with `tacticVersion` `undefined`.

`a_synthetic_stale_action_header_is_refused_before_solver_work` builds exactly that: a valid
DAgger artifact with those four keys deleted from the wire object and a fresh checksum over what
is left, so the payload is executable and only the header is stale. It is refused with
`research artifact tactic version undefined does not match runtime 2`, and the test asserts it is
refused for *no other reason*. Deleting the explicit check refuses it as `research artifact
effector names do not match runtime effector names` -- true, and the wrong repair to send anybody
to. Deleting the `Array.isArray` guard in `sameNames` as well turns it into `TypeError: Cannot
read properties of undefined (reading 'length')`, which names neither the artifact nor the field;
that guard exists for the case where a table is genuinely absent rather than mismatched.

**Five inline copies of the header now spread one constant.**
`collect-dagger.mjs`, `train-lookahead.mjs`, `train-neat-qd.mjs` and `train-ppo.mjs` each wrote
the same four fields out by hand at *both* ends of the same `new ResearchArtifact(...)` call, and
`train-ppo.mjs` held a fifth for its league loader. All of them import
`RESEARCH_ARTIFACT_CONTRACT` from `learning/deployment.ts` now. This is the one place stage C2a
touched a trainer, and it was unavoidable: `trainPpo` writes an artifact inside the test suite,
so a producer keeping its own four-field literal is a red gate rather than a tidiness question.

**This said "plus a test fixture" and no test fixture was converted.** Corrected 2026-08-25.
`tests/ai-contract.test.mjs` keeps a deliberately synthetic header -- that file is about the
envelope, and importing the real vocabularies would turn it red every time a name entered one --
and `tests/tournament-executor.test.mjs`'s `staleContract` still spells all seven fields out on
purpose, so that only the input half of the header is stale. The one thing in that file that
spreads the constant did so before this stage.

The `config` objects in `collect-dagger.mjs` and `train-neat-qd.mjs` restated the same four
fields for their run digest and were left alone on the grounds that widening them moves every
default `runId`. **That was the wrong call and the remediation pass reversed it** -- see "The
resume landmine" below.

### The mirror: a mirrored fighter is left-handed, not left-handed *and* different

Two decisions, recorded rather than implemented, because nothing mirrors an output label today:
`mirrorFeatures` and `mirrorView` are both input-side, and no network is ever run on a mirrored
fixture.

- **A mirror does not swap effector or target.** The comment on `FEATURE_MIRROR_INDEX` has said
  for two sessions that primary and secondary "are not sides"; the *checkable* form of that is
  narrower and can fail.

  **The form stage C2a wrote down was still too wide, and it was false. Superseded 2026-08-25.**
  It said `HandView.outboard` is the only field in the entire publication naming which physical
  side a hand is on, and that no feature column carries a side at all. Measured: two columns do.
  Build two views differing only in the x of the opponent's threatening hand and
  `threat_bearing` reads +0.25 / -0.25 and `threat_local_right` +0.25 / -0.25 -- and
  `FEATURE_MIRROR_SIGN`, two declarations above the note asserting otherwise, already marks both
  -1 along with `facing_error` and the two trunk twists. `outboard` is not the only side-carrying
  *field* either: it is **derived** from the arm's geometry (`src/arm.ts`, published by
  `src/fighter.ts`), so `shoulder.x` and `tip.x` say it too, which is exactly why `mirrorBody`
  negates all four together. The fixture that flipped `outboard` alone therefore described a body
  that cannot exist, and a hand column spelled `Math.sign(hand.shoulder.x)` -- a column that
  literally reports which side each hand is on -- left the old test green.

  The narrow fact that is true, can fail, and is what the decision actually rests on: **no
  column distinguishes which physical side a given hand *slot* is on.** The eight columns per
  slot are a weapon one-hot, `lost`, `reach` and `tip_speed`, all unsigned. So the same fighter
  built left-handed -- `outboard`, `shoulder.x`, `tip.x` and `tipVelocity.x` negated together on
  both of its hands, with the torso left where it was -- writes a byte-identical 99-column
  vector; swapping `primary`/`secondary` under a mirror would invent a distinction the network
  cannot see; and `mirrorBody` keeping the slot keys while negating the geometry is what makes a
  mirrored sample a genuine left-handed copy of the same fighter rather than an invented second
  one. The side-carrying columns describe the **threat's** bearing rather than slot handedness,
  and the sign table already handles them.

  `no_hand_column_carries_which_physical_side_a_slot_is_on` is the replacement. It builds that
  left-handed pair and requires all 99 columns to match, asserts the hand-column *names* against
  the four side-free groups, asserts the +0.25 / -0.25 threat readings with every hand column
  held equal across the same pair, and asserts the swap table whole -- exactly two entries,
  `circle-left` and `circle-right`, so a hand swap added later shows up as a third row rather
  than as a comment going quietly false. Adding the `Math.sign(shoulder.x)` column fails it at
  the first of those, `-1` against `1`. `EFFECTOR_NAMES` inherit the narrow fact: they name a
  *slot*, and no column answers which side a slot is on. `TARGET_NAMES` are heights and a threat,
  and take no side either. **The conclusion held while the evidence for it did not.**
- **`slip-left` and `slip-right` are sides and would swap.** They are two halves of one posture
  (`trunkTwist` -0.65 and +0.65) and nothing else in the stance table takes a side --
  `action-default`, `upright` and `compact` are side-neutral, and `extended` already reads the
  acting hand's `outboard`, which a mirror has already negated. The pair is recorded on
  `FEATURE_MIRROR_INDEX` beside `circle-left`/`circle-right` so whoever adds an output mirror
  does not have to rediscover it. No machinery was added, because a mirror with no caller is the
  shape stage B's `TacticDecision` had.

### What has no production reader yet, and why that is the right answer here

`selectDeployableTactic` is read by tests alone. The obvious production reader is
`deployment.ts`'s NEAT branch -- and wiring *that* alone would put a joint tuple argmax on the
deployment side of a seam whose training side, `neatLabeler` in `research-rollout-worker.mjs`,
still takes a bare action argmax. That is the training/deployment mask divergence stage C1 spent
its whole budget closing, and
`the_training_decoder_and_the_deployment_decoder_answer_the_same_label` is the test that catches
it. Both halves move together in stage C2b, with the four trainers.

**That guard was not real, and this paragraph said the opposite.** Superseded 2026-08-25. The
three new logit blocks were written as **zeros** in that test, which makes the joint sum
degenerate to the action logit and the two decoders agree by construction. Measured: wiring
`selectDeployableTactic` into `deployment.ts`'s NEAT labeler *only* -- exactly the split the code
comment says is refused -- left all 501 tests passing. The blocks now carry the tuple test's own
numbers, effector `[1.00, 0.10, 0]` and target `[0.20, 0.30, 1.00, 0]`, on which the joint rule
answers `thrust` for `sword+empty` and `cut` for `axe+empty` where the bare action argmax answers
`punch` for both. That divergence is asserted outright in the test, so the fixture's ability to
see a one-sided move is checked rather than hoped for, and the same mutation now fails with
`+ action: 'thrust' / - action: 'punch'`. `selectDeployableTactic` still has no production
reader; the guard in front of giving it one is now one.

### The remediation pass -- 2026-08-25

Seven defects, each demonstrated by running the mutation rather than by reading the code, and
two of them meant a passing test was not testing what its name said.

**The effector term was not exercised by anything.** Multiplying it by zero in
`selectDeployableTactic` left all 501 tests green. The tuple test ran only on `sword+empty`,
where every action that can win has exactly one legal effector -- only the sword hand cuts or
thrusts, only the empty hand punches -- so the effector head decided nothing the fixture could
observe. The case added runs on `sword+axe`: two different one-handed weapons, `cut` legal in
either hand and `thrust` in only one, which is the loadout where "the effector head decided"
is separable from "the loadout decided". With action `[0, 1.00, 0, 0, 0, 0, 0]`, effector
`[0, 1.00, 0]` and target `[0, 0.50, 0, 0]` the answer is `cut+secondary+high` at 2.50; zeroing
the effector term ties the hands and answers `cut+primary+high`, zeroing the target term answers
`cut+secondary+vital`. Both counterfactuals are written out, because "the effector head decided
this" is only checkable against what the answer would be without it.

**The tactic-version check was not pinned to strict equality, and its message contradicted
itself.** Changing `!==` to `!=` in `artifact.ts` left all four contract suites green, and an
artifact carrying `"tacticVersion": "2"` -- the number as a JSON *string* -- was then accepted:
`"2" == 2`. The same string produced `research artifact tactic version 2 does not match runtime
2`, which is the exact failure the comment two lines above exists to prevent. `featureVersion`'s
neighbouring check had both weaknesses and is fixed the same way: `!==` kept, and the value
interpolated through `JSON.stringify`, which quotes a string, leaves a number alone and renders
an absent field as `undefined` -- so the two existing refusals are unchanged.
`a_version_header_of_the_right_value_and_the_wrong_type_is_refused_by_type` pins both fields, and
fails under both mutations: `Missing expected exception` for `!=`, and an assertion on the
contradictory sentence for the bare interpolation.

### The resume landmine, and the two runs that wrote to one directory

`scripts/train-neat-qd.mjs` and `scripts/collect-dagger.mjs` build a `config` object carrying
`featureVersion`, `featureNames`, `movementNames` and `actionNames` and **no output vocabulary**.
None of those four moved when the output contract went from thirteen to twenty-six, so the config
text is byte-identical across the widening and three things follow, all of them bad:

- `--resume` accepts a saved state, reloads a 13-output population, and dies inside a worker with
  `learned output vector is 13 wide; the contract is 26` -- loud, but named wrongly and a bout
  late;
- `configDigest` is the default `runId` (`neat-qd-${seed}-${configDigest}`), so a pre- and
  post-widening run with identical settings write to the **same** directory and overwrite each
  other's `state.json`, `champion.artifact` and `report.json`. That is data loss, not a stale
  message;
- the digest goes into artifact provenance, so two artifacts trained against different output
  vocabularies carry the same one.

Both config objects now carry `tacticVersion` and the three new name tables. Default `runId`s
move, which is the point. Nothing checked in is lost: all three runs under
`asset-src/learning/research/` were named explicitly rather than by digest
(`session15-workers8-smoke`, `session16-final-workers8`, `session18-minimum`) and all three are
already refused at feature version 3 against runtime 4, and no test or document pins a
`runId` or a digest -- every `configDigest` in the suites is a hand-written literal
(`"synthetic"`, `"contract-v3"`, `"immutable"`) in a synthetic provenance block, and the four
mentions in `docs/plans/` are about the digest's *format*, not its value.

`train-ppo.mjs` and `train-lookahead.mjs` were left alone and that is a different judgement, not
an oversight: their digests fold `{seed, solverSteps, league}` and
`{seed, requestedSolverSteps, fitSeeds, selectedSeed, columns}`, carry no vocabulary of either
kind, key no run directory, and gate no `--resume`. Widening them would be a change to what
provenance means rather than the repair of a landmine, and it belongs with C2b's trainer work.

### Two dead imports, neither of which any gate could see

`tsconfig.json` sets `noUnusedLocals`, and its `include` is `["src", "vite.config.ts"]` -- so
`scripts/` is never type-checked and an unused import there is invisible to `npm run check`,
`npm test` and `npm run build` alike. `scripts/train-lookahead.mjs` imported `FEATURE_COLUMNS`
after this stage removed its only two uses. A sweep of every named import in all fifteen
`scripts/*.mjs` found one more, and it was **not** this stage's:
`scripts/research-rollout-worker.mjs` has imported `FEATURE_COLUMNS` unused since before
`1696c26`. Both are gone. The other three trainers are clean, as are the ten remaining scripts.

The cheap way to bring `scripts/` under a gate is a second `tsconfig` with
`allowJs`/`checkJs` and `include: ["scripts"]`, run as another `tsc --noEmit`; the cost is that
`checkJs` on fifteen untyped Node scripts reports far more than unused imports on its first run,
so it is a session's work rather than a line of config, and it is recorded here rather than
built.

### The one output that is decoded and dropped now names its reader

`readMetaOutput` answers `stanceLogits` and nothing reads it -- six of twenty-six outputs. This
directory's rule is that an unread field may be kept only if the reader that is coming can be
**named**, because a field with no reader and a field with no reader *yet* look identical
(`HandView.reach` was deleted one session and restored the next for exactly that reason). It is
named on the field now: `selectDeployableTactic` in stage C2b, which grows a fourth field on
`DeployableTactic` -- an argmax over `STANCE_NAMES` -- and hands it to `handActionOption`'s
`OptionExecution.stance`, where `applyTacticStance` consumes it; the two callers are
`deployment.ts`'s NEAT branch and `neatLabeler`, and they move together for the reason
`selectDeployableTactic`'s own note gives. The stance head is deliberately **not** part of the
joint sum: legality is a property of the tuple, every stance is legal on every body, so nothing
masks it and there is nothing to trade it against.

### Four counts and two anchors that had gone stale

- `src/learning/artifact.ts` and `docs/design.md` said the header carries "four name tables". It
  carries five -- `movementNames`, `actionNames`, `effectorNames`, `targetNames`, `stanceNames`,
  one per block of the output contract. `deployment.ts` and `tournament-executor.test.mjs` both
  said five and were right. `sameNames`' own note said the *old* header carried "all four name
  tables"; it carried three (`featureNames`, `movementNames`, `actionNames`), so that number was
  the count of neither header.
- The offsets note said restoring `readMetaOutput`'s action slice to `persistenceAt` appends
  "three effector logits". `slice(5, 25)` is twenty entries, seven of them the action, so it is
  **thirteen** -- and the paragraph immediately above it already said thirteen.
- `docs/plans/combat-followups-00-overview.md` carried eighteen `path#Lnnn` anchors this stage
  invalidated by inserting imports into the trainers and lines into `artifact.ts` and
  `options.ts`. Every one was right at `1696c26`. A sweep of the whole `docs/plans/` tree against
  `1696c26` found **thirty-nine**, across six files -- the overview plus `-16`, `-17`, `-18`,
  `-19` and the handoff. Five of them repaired themselves when the dead `FEATURE_COLUMNS` import
  came out of `train-lookahead.mjs`, which put that file back at its `1696c26` length; the other
  thirty-four were re-pointed, each by locating the `1696c26` line's *text* in the current file
  rather than by trusting an arithmetic offset, and each verified afterwards by the same
  comparison. Two more anchors in that tree are stale for reasons that have nothing to do with
  this stage -- `meta.ts#L154` names a `checkpoint.featureVersion !== 3` check that no longer
  exists, and three anchors point into deleted files -- and they are left as they are, with the
  dated supersession notes the plan set already carries.

  **Why nothing catches this, measured rather than assumed.** The obvious answer -- that
  `../tools/check_docs.js` skips `docs/plans/` -- is wrong twice over: its walker starts at the
  repository root and skips only `.claude`, `.git`, `.tools`, `node_modules` and `target`, and
  its `docs/plans/` exclusion is relative to *that* root, so `sword-prototype/docs/plans/` is not
  excluded at all. Appending one Markdown link to a plan file, with href
  `../../scripts/train-ppo.mjs#L99999`, and running the checker reports
  `sword-prototype/docs/plans/combat-followups-19-run-legibility.md:217: line link ... is
  outside its target`; a second probe with href `#L1` and link text naming a symbol draws the
  stale-anchor complaint as well. The checker reaches these files and validates exactly this.

  It cannot see the plan set's anchors because they are written as **inline code spans** with
  bare file names -- `` `train-ppo.mjs#L166` `` -- and `checkGlobalInternalLinks` only inspects
  the `href` of a Markdown link or image. So the cheap fix is not a change to the checker: it is
  to write each anchor as a Markdown link whose href is a real relative path ending in the same
  `#Lnnn`, at which point the existing gate
  catches them for free and enforces its stale-symbol rule on top. The cost is the conversion
  itself -- about forty anchors across six files -- plus a decision about the anchors that point
  into files this plan set deliberately keeps naming after deleting them (`promotion.ts`,
  `evaluate-options.mjs`, `training-evaluator.mjs`, `checkpoint.ts`, each already superseded in
  place with a dated note): a link to a missing file is an error, so those have to stay code
  spans or be rewritten as prose. Recorded rather than built.

  Note also that `node tools/check_docs.js` is **already red on 29 problems**, every one of them
  a source anchor in the repository's own `docs/` tree pointing into `crates/`, and none in
  `sword-prototype/`. That is unrelated to this change and untouched by it, but it means the
  gate's exit code alone would not tell anybody a sword-prototype anchor had broken -- the path
  in the message is what separates them.
