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
still entering and executing real options. Cut/punch share the old
duelist's 0.15 s chamber, 0.11 s commit and 0.26 s guarded recovery. Shoot shares the old
archer's 0.90 s draw, release edge and 0.30 s cooldown.

`npm run ai:evaluate` with held-out base 20260827 ran 120 scored bouts in 36.9 seconds of
wall clock: twelve parity cells plus eight real forced-option cells and the loadout/policy
controls, both arena sides, and
separate train/validation/test seed ranges. Both sides of a mirror pair use the same seed.
All 120 ended by exhaustion. The corpus includes every selectable
equipment kind and every existing policy, and the real option cells reached all eight
option names. An immediate non-writing rerun matched byte-for-byte
after JSON parsing. The full per-bout factual record is
`asset-src/learning/baseline-v1.json`; it is evidence for later comparisons, not a golden
to overwrite when an outcome surprises. The default command compares; only the explicit
`--write-baseline` switch replaces it.

Each bout accumulates range bins, real option occupancy and transitions, option entries as
attack attempts, contacts by exact striking hand and kind, defender blocks, crouch time,
trunk-twist sign changes, damage, final vitality, winner and time. Combat contacts arrive
through a callback before `Combat.log` is truncated. They are not reconstructed from that
24-entry screen history; the callback test observes 40 contacts while the log retains 24.
Legacy swinger, idle, duelist and archer controls carry `null` rather than invented option
labels, and their option occupancy and attempt maps remain exactly zero.

The evaluator runs same-seed, same-loadout mirrored pairs for legacy duelist versus
scripted-meta duelist and legacy archer versus scripted-meta archer across all three splits.
Every paired opponent is the actual adversarial swinger. Before fixing limits, bases
20260823 through 20260826 supplied 48 calibration brackets: an unscored warm-up followed by
legacy, meta and legacy-repeat for each split, specialist and side. Reusing one Havok wasm
module made equal legacy inputs flip winners after scene disposal, disproving the old
headless-harness claim that worlds were independent. Giving every bout a fresh wasm instance
made all 48 legacy brackets exact. Their prospective maxima -- damage 0, seconds 0 and each
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
  because repeated legacy winner/ending results differed.
- adding equal and opposite intent deviations to consecutive frames preserved the reported
  mean and failed the ordered sequence gate.

The first of those bullets is **superseded and kept for what it teaches**. Deleting `zoom`
did fail that test, and the failure meant only that the fixture and the command agreed about
a field neither should have had: camera zoom rode on the command because `Intent` was an
alias for the human's `InputState`. Session 15 removed it from the command, the option
fixtures, `INTENT_FIELDS`, the promotion sweep and the two checked-in corpora, and
`every_option_returns_a_complete_bounded_intent` now checks the seven fields a fighter
actually consumes. A red test proves the fixture and the code agree; it does not prove they
are right.

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
commands, digests, tables, transitions and exact failure strings are in
`asset-src/learning/unpromoted-v1.json`; raw generation reports remain in ignored run dirs.

`npm run measure -- --checkpoint <path> --bouts 24 --seed 777001` is the explicit
five-loadout route for an unregistered experiment. It names the subject
`experimental-checkpoint`; it does not make it a production option. Three visible bouts
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
legacy/scripted-meta comparison rows across train, validation and test matched winner,
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
to run and no bundled checkpoint to select; the generic checkpoint route remains an
experimental command-line facility. Promotion evaluation now additionally rejects a raw
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
The raw 40 rows, mirrors and aggregate inputs are frozen in
`asset-src/learning/engagement-baseline-v1.json`. This is train evidence only; no held-out
test row was opened.

The promotion thresholds were fixed before any of the four new research directions ran:
an opportunity window of 0.75 s, a progress drought of 2.0 s, opportunity-to-attack rate at
least 0.65, attack-to-damaging-contact rate at least 0.20, near-range stall share at most
0.15, first-attack p90 at most 6 s, and symmetric time-cap rate at most 0.10. They are
feasibility gates, not positive fitness. A draw or loss receives no terminal success and
elapsed survival contributes exactly zero; novelty can guide search but cannot change a
promotion verdict.

| controller | rows | win rate | opportunity attack | attack contact | first attack p90 | near-range stall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| legacy | 16 | 0.125 | 0.2282 | 0.5000 | 5.267 s | 0.1514 |
| scripted/forced meta | 20 | 0.200 | 0.2031 | 0.6346 | 0.683 s | 0.2435 |
| parity repeat | 4 | 0.000 | 0.5556 | 0.6667 | 1.183 s | 0.0000 |

The baseline is deliberately not a claim that these controls pass. The worst raw cell was
legacy duelist with axe on the left: zero opportunity conversion and zero contact
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
