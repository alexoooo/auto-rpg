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

**And a reading is only worth what its coverage space is worth, so every figure below
names the space before it names the result.** This is the second rule and it was paid for
seven times in one effort. An exact sweep over the wrong space does not read as an error --
it reads as a confident answer, because the arithmetic is right and only the population is
wrong. The seven were not sloppy; each was a correct computation over a set that did not
answer the question asked, and the worst of them was a 90-job sweep taken on the tree
*without* the change it existed to justify, which matched `HEAD` bit for bit and the shipped
code in no column. So: name the harness, the seed, the job set, the number of bouts, and
what was held fixed -- before the number. A count additionally names its grammar, because
"how many references are there" has three different right answers here depending on which
spellings you parse.

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

18. **Open: the option layer does not hold a shield like a shield.** `planOffHand` in
   `policies.ts` places a strapped shield across the line of the blow, below the bearing to it,
   with the forearm rolled to bring the plate round -- three placements, each with its own measured
   table, together worth 96 % of the board against 56 % and 160.8 damage taken a bout against a
   no-shield control's 284.5. `options.ts`'s `cover` has none of it and aims every hand like a
   blade. Measured in one harness at 24 bouts, an option-driven `sword+shield` guard took
   **294.7** damage a bout against `sword+buckler`'s 176.1 and `sword+sword`'s 202.8, which is
   the wrong order. Session 18 found this while fixing the cover effector and did not take it:
   it needs four constants mirrored into `ACTION_TUNING` and their tables re-taken through the
   option layer, which is a balance change of its own. Everything a learned controller does with
   a shield is priced against the wrong placement until it is done.

19. **Open: the behaviour record counts action names, and the tournament stopped needing it
to.** `tacticCounts` and `headUtilisation` read the whole `movement|action|effector|target|stance`
tuple, so the blind tournament sees all five heads, and a sixth row now reports the dwell.
`BehaviourRecord` -- the separate structure NEAT's `fitnessComponents` and `noveltyDescriptor`
read -- does not: `options`, `attackAttempts` and `transitions` are keyed by `OptionName` and
`contacts` by `HandName`, so a controller that varies its action name while using one arm, one
aim and one pose scores identically to one that has learned four heads. It is worth more than
when it was first written down: the teacher histogram is `primary` 70.5 %, `natural` 15.7 %,
`secondary` 13.8 % *after* the cover-effector fix, and `primary` 84.3 % with `secondary` at
**zero** before it -- a run in which NEAT's novelty descriptor could not have told an effector
head from a loadout. `BiteStrike.hand = "primary"` in `src/bodies/centipede.ts` is the last
surviving hand alias and is held there until `contacts` widens. Its comment named a session-17
stage as the owner; that plan is deleted, so the owner is this entry.

20. **Open, and owed to a person rather than a bench: the perception change moved the duelist
14.2 points and nobody has played it.** The table under "What that is worth in bouts" records
40.8 % at `f789ea4`, 28.3 % at v4.0 as shipped, and 55.0 % after the threat reconciliation --
about 2.5 standard deviations at 120 bouts for the first move. Every one of those numbers is a
bench win rate. Whether the fight *reads* better at 55.0 % than it did at 40.8 %, or merely
differently, is the judgement no harness can be pointed at, and it arrived as a side effect of
a feature-vector change rather than as a balance decision anybody took. Session 18 is the
sitting where it gets asked.

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
| **Lost:** the unscored warm-up and fresh-Havok-per-bout discipline, which is the encoding of the session-11 finding that a shared Havok module flips winners after disposal | Partly. `freshHavok()` is still called -- by `measure.mjs --selftest`, by `scripts/research-havok.mjs:172` for every research bout, and three times in `tests/integration.test.mjs`. What is lost is the *bracket*: an unscored warm-up followed by subject, control and control-repeat in one round, which is the part that made two controllers comparable. Nothing runs that. |
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

**Superseded, and this is the whole of what was wrong with it.** The four tables below are one
Havok bout each, and for `cut` that is 22 to 50 scoring contacts of which **zero to three** land
on a head -- the `vital` row is 0 heads in 50 contacts -- so the `cut` and `punch` verdicts are
counting single contacts, and one of them is counting none. Worse, the pair they
compare, `high` against `as-measured`, is **0.012 cursor units apart on this fixture**: the
measured entry aim is 1.62 m and `high` is 1.644, so those two rows are the same stroke run
twice and the difference between them is chaos in a physics bout, not a rule. Session 18
re-took all four with **40** seeded bouts a cell and a stroke pause as the nuisance knob, and
`high` against `low` -- which is what "a named region separates" means -- separated on a cut
even here: **0.128 against 0.044** head share, a 2.9x ratio whose bootstrapped 95 % interval
(2.00-4.55) excludes 1. What was really wrong is below the tables and in
"Session 18". The rows are left exactly as they were recorded.

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

**Closed in session 18, and not by lifting the envelope.** The measurement above named the right
mechanism -- the arc is wider than the gap between two regions -- and the wrong repair. Lifting
it was swept and moves every aim up together rather than pointing any of them: at a full span,
biasing the commit point from the centre of the arc to near the aim raises a `high` cut's head
share from 0.128 to 0.176 and `low`'s from 0.044 to 0.072 at the same time, so the ratio between
them *falls*. What separates regions is narrowing, and `NAMED_STROKE_SPAN` is what does it. See
"Session 18".

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
unknown loadout is refused by name instead of falling through to the sword row. (Stage C2c gave
that table a second column and renamed it `LOADOUT_TACTICS`; the name here is the one C1 used
and is kept so this record still reads as what happened.)

**The new figures, and they are not final.** Measured by expanding the real schedule:

| | before | now |
| --- | ---: | ---: |
| schedule tasks per split | 220 | **240** |
| groups (`3 x train + validation`) | 880 | **960** |
| minimum solver-step budget (`groups * 48`) | 42,240 | **46,080** |

The 42,240-step exhaustive run recorded earlier in this document was taken under the old
schedule and stays as the record of that run. **This is a small increase that session 20's
tuple expansion supersedes by roughly twentyfold**; it is the current figure, not a ceiling.

**Superseded by stage C2c, and the twentyfold was declined rather than paid.** The schedule is
775 tasks a split, 3,100 groups and 148,800 minimum solver steps -- **3.23x**, not the ~19x this
table priced, because the stance was measured out of the key. See "Session 17 Stage C2c" below;
the numbers here stay as the record of what C1 measured.

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
is not another row. `calibratedTacticPairs` -- `calibratedPlannedTactics` since stage C2c
widened the cell key -- (`src/learning/lookahead.ts`) filters the pair set to
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
`TacticExecution.stance` (named `OptionExecution` here until stage C2b wired it and found no
such type), where `applyTacticStance` consumes it; the two callers are
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
  this stage -- an anchor into `meta.ts` named a `checkpoint.featureVersion !== 3` check that no longer
  exists, and three anchors point into deleted files.

  **That anchor was re-pointed from line 154 to line 150 in the same hunk that said it was being left
  alone, which is the worst of both and is now decided.** Re-pointing a knowingly dead anchor
  makes it read as freshly verified by whoever moved it. `grep featureVersion src/learning/meta.ts`
  returns nothing, so the line the anchor names does not exist at any number, and the number was
  therefore noise. The anchor is **gone**. The sentence it sat in was superseded in place in the
  session-16 plan, which had stated in the present tense that `meta.ts` "hardcodes
  `if (checkpoint.featureVersion !== 3)`" -- true when the plan was written, false now. That plan
  file has since been deleted with the rest of the landed set, so the supersession is recorded
  here rather than there: the claim was retired, not re-pointed, because there is no line to
  point at.

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
  bare file names -- `` `train-ppo.mjs#L246` `` -- and `checkGlobalInternalLinks` only inspects
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

## Session 17 Stage C2b: the trainers produce and consume the wider contract -- 2026-08-25

The four research trainers write and read the whole 26-output vocabulary that stage C2a froze.
The teacher gained a real aiming rule, DAgger's rows and model gained three heads, PPO gained
three categorical heads, and both halves of the NEAT decoder seam moved together. 502 tests
before, **521** after the stage and **524** after the remediation pass below; `npx tsc --noEmit`
and `npm run build` clean; the `duelist-swinger` null control identical to the digit for the
fifth stage running.

**Look-ahead is stage C2c's and stayed there.** Two lines moved in it and neither changes a
number: `collectTacticalTrace` names `asMeasured(chooseEffector(view, action))` explicitly,
which is exactly the tuple `researchLabelMind` used to default to, and
`deployedResearchMind`'s decision-hook parameter narrowed to the three fields look-ahead
actually supplies rather than widening `lookaheadMind`'s. Both are recorded below.

### The null control did not move, for the fifth stage running

`npm run measure -- --only duelist-swinger --bouts 120`, seed 20260823: duelist 66/120 =
**55.0 %**, bout length **3.52 s (1.42-8.98)**, damage **176.17**, **10** severs, **1496** and
**1670** scoring contacts. Identical to C1 and C2a to the digit. The scripted policies never
enter the option layer, so any movement here would mean something leaked into a shared
primitive; the teacher, the five heads and the conditional masks are all above that line.

### The label histogram from a real teacher run, and the number that was a rule defect

One Havok bout per research stratum, the teacher driving through `researchLabelMind`, every
decision counted. 13 cells, **2400 solver steps each**, **268 decisions**.

**Every share below is one bout per cell at one budget with no seed replication, and the
budget is part of the reading.** The 9600-step run further down moves `natural` from 15.7 % to
39.2 % and flips `target` from 52/48 to 38/62; quoting a share without its budget is quoting a
different number. Nothing here is a mean over seeds, because there is one bout per cell.

| head | distribution (2400 solver steps, one bout per cell, unreplicated) |
| --- | --- |
| movement | `hold` 180 (67.2 %), `close` 70 (26.1 %), `disengage` 18 (6.7 %) |
| action | `cover` 139 (51.9 %), `cut` 63 (23.5 %), `bite` 42 (15.7 %), `shoot` 12 (4.5 %), `punch` 12 (4.5 %) |
| effector | `primary` 189 (70.5 %), `natural` 42 (15.7 %), `secondary` 37 (13.8 %) |
| target | `threat` 139 (51.9 %), `vital` 129 (48.1 %) |
| stance | `slip-right` 112 (41.8 %), `action-default` 99 (36.9 %), `slip-left` 48 (17.9 %), `compact` 9 (3.4 %) |

**The effector row read `primary` 226 (84.3 %) and `secondary` 0, and the paragraph beside it
blamed the schedule. That was wrong for half the sample, and the cause was a rule defect in
this repository's own code.** The superseded claim is kept because it is instructive: it said
the effector is "genuinely read back off the opportunity row the teacher chose", so a `secondary`
label needs a stratum that puts the striking weapon in the off hand, and there is none -- a
schedule fact, not this stage's to fix.

Two thirds of that is true and the conclusion is not. The effector *is* read off the
opportunity row for `cut`, `punch` and `shoot`. It is not read off anything for `cover`, which
is **139 of the 268 decisions**: `cover` has no opportunity behind it, and the teacher took
`tacticEffectors(view, action)[0]`. `tacticEffectors` returns hands in `HANDS` order regardless
of what they hold, and `accepts("cover")` answers true for every attached hand -- so the primary
won every cover on every humanoid body that has ever existed, and **a reversed-loadout stratum
could not have changed one of them**, because the hand order does not depend on what the strata
contain. Measured over the same 268 decisions: `secondary` was a legal effector for the action
the teacher itself named on **133 of them (49.6 %)** -- 121 `cover` and 12 `punch` -- and was
taken on none.

`coveringEffector` gives `cover` and `recover` a real preference: a hand holding a shield or
buckler covers before a hand holding a sword, axe or club, which covers before a bare hand, with
`HANDS` order as the tie-break so equal hands keep the old answer. The tiers are asked of
`hands.ts` (`isShield`, and a new `isHeldStriker` that replaces the copy `options.ts` was
keeping) rather than written out as weapon names.

**What moved, and what did not.** `secondary` goes 0 -> 37 (13.8 %) at 2400 steps and 0 -> 37
(8.9 %) at 9600. The other four heads are **identical to the digit** at both budgets, and that
is not a coincidence to be waved past: `handActionOption`'s `cover` branch interposes the named
hand *and* covers with the spare one, so on `sword+shield` a cover names a different
`actingHand` and produces an otherwise **byte-identical intent** -- diffed field by field,
`intent.actingHand` is the only difference in the whole record. So the label moved and the body
did not. That is the honest reading: the defect was in what the teacher *taught*, which is what
an effector head is trained on, and whether a cover on the shield hand should also *pose*
differently is a bout question and is session 23's.

The 12 `punch` decisions where `secondary` was legal are **not** a defect and did not move.
They are `empty+empty` bodies where both hands are identical and `attackOpportunity` publishes
the primary's row first, which is a decision taken from the row rather than a preference at all.

The remaining two heads vary as before. `target` is a near-even 52/48 split at this budget,
because `cover` is half the decisions and is the one action aimed at a moving point. `stance`
reaches four of six names, and its 42/18 slip-right/slip-left skew is the threat geometry rather
than a broken sign: `RESEARCH_STRATA`'s opponents lead with the primary hand, which sits on their
own right, so a defender facing them sees more blades on one side than the other.

**Fifteen distinct `(action, effector, target, stance)` tuples**, up from twelve before the
cover fix, and the top three account for 58 %:

| tuple | count | share |
| --- | ---: | ---: |
| `cover+primary+threat+slip-right` | 71 | 26.5 % |
| `cut+primary+vital+action-default` | 58 | 21.6 % |
| `cover+secondary+threat+slip-right` | 27 | 10.1 % |
| `cover+primary+threat+slip-left` | 24 | 9.0 % |
| `bite+natural+vital+slip-left` | 18 | 6.7 % |
| `bite+natural+vital+slip-right` | 14 | 5.2 % |
| `shoot+primary+vital+action-default` | 12 | 4.5 % |
| `bite+natural+vital+action-default` | 10 | 3.7 % |
| `punch+primary+vital+action-default` | 9 | 3.4 % |
| `cover+primary+threat+action-default` | 6 | 2.2 % |
| `cover+secondary+threat+slip-left` | 6 | 2.2 % |
| `cut+primary+vital+compact` | 5 | 1.9 % |
| `cover+secondary+threat+action-default` | 4 | 1.5 % |
| `punch+primary+vital+compact` | 3 | 1.1 % |
| `cover+primary+threat+compact` | 1 | 0.4 % |

**"Out of 72 legal" was wrong and is corrected here.** 72 is `3 effectors x 4 targets x 6
stances`, the nominal per-action multiplier -- right for "grew about seventy-twofold" and wrong
as a count of anything a body can do. Measured: `|deployableTactics|` is at most **16** on any of
the thirteen research loadouts (`sword+empty`), at most **21** on any body in the space
(`sword+sword+bite`), and the union over the thirteen research cells is **24**, over the whole
body space **33**. Multiplying by the six stances, which the tuple set does not enumerate, the
thirteen cells reach 24 x 6 = 144 stance-bearing tuples and this run visits 15 of them.

**The three cell figures were superseded by `sword+axe` joining the strata**: widest research
loadout 16 -> **17** (`sword+axe`, not `sword+empty`), union over the research cells 24 -> **27**,
stance-bearing 144 -> **162**. The two whole-body figures did not move and could not have, because
that space already enumerated every ordered weapon pair. See "Session 27" at the end of this file.

A second run at 9600 solver steps a cell (418 decisions) moves the shares -- the humanoid bouts
end on their own and only the centipede and `broot/empty+empty` keep going -- and produces the
**same fifteen tuples**, so the shape is the rule rather than the sample. Its own shares, again
unreplicated: `bite` 164 (39.2 %), `cover` 160 (38.3 %), `cut` 63 (15.1 %), `punch` 19 (4.5 %),
`shoot` 12 (2.9 %); `primary` 217 (51.9 %), `natural` 164 (39.2 %), `secondary` 37 (8.9 %);
`vital` 258 (61.7 %), `threat` 160 (38.3 %).

`upright` and `extended` are never emitted. `extended` is a decision recorded on
`tacticalStance`: stage B measured it as 0.10/+0.30/0.55 x outboard against `commit`'s
0.12/0.30/0.68 x outboard, so labelling it during a committing action teaches a near-no-op.
`upright` is simply not in the rule; the teacher has no situation that calls for zeroing the
posture.

### `thrust` is the one action the aim rule branches on, and the teacher cannot emit it

The brief for this stage asked for three `thrust` branches -- `low` at the edge of reach,
`vital` against a crouched opponent, `high` otherwise -- and they are written. **Nothing in
`tacticalTeacher` reaches them.** Its action rule is
`weapon === "bow" ? "shoot" : weapon === "empty" ? "punch" : "cut"`, in `actionableRow`, and
there is no arm for a point: a sword hand always answers `cut`. Making them reachable means
turning every sword `cut` into a `thrust`, which is a change to what the teacher *does* rather
than to where it aims, and would move the action histogram, the engagement floor and every
DAgger macro-F1 with it -- so it was not taken here.

The rule is kept, because a learned controller *can* emit `thrust` and `deployableTactics`
offers it three heights, and it is exported so
`the_thrust_aim_rule_is_low_at_full_extension_and_high_against_a_standing_body` drives it
directly: a branch nothing can watch fail is the worst defect this directory produces. Both
constants are bounded from **both** sides -- `THRUST_EDGE_FRACTION` 0.10 passes at a 0.144 margin
of a 1.45 reach and fails at 0.146; `CROUCHED_OPPONENT` 0.50 separates 0.49 from 0.51 -- and the
mutation table below carries all four.

### Where a centipede's bite actually lands: the shins, every time

Measured rather than assumed, on the same fixture as stage B's four aim tables: the `bite`
option driven directly against a bare-handed idle warrior, `HitReport.key` counted, blocks
excluded, four seed pairs.

| seeds | keys |
| --- | --- |
| 11,22 | `shinL` 43, `shinR` 15 |
| 33,44 | `shinL` 43, `shinR` 15 |
| 55,66 | `shinL` 43, `shinR` 15 |
| 77,88 | `shinL` 43, `shinR` 15 |

**232 body contacts, 172 left shin and 60 right, zero head and zero torso** -- a low share of
**1.000**. The seeds do not vary it, for the same reason stage B's tables did not: the driving
mind is deterministic and `idle` ignores its seed.

Three separate facts follow and it is worth keeping them apart. The **body** puts a bite on a
shin, always. The **table** offers one legal region -- `tacticTargets("bite")` is `["vital"]` --
so `vital` is the label whatever a bout says. And the **executor reads neither**:
`handActionOption`'s bite branch sets `intent.natural.thrust` and consumes `stance`, and never
looks at `target` at all. So the aim label on a bite is inert in all three directions, and the
honest reading of the measurement is not "the label should be `low`" but "a centipede's bite is
a leg attack, and if that is wrong it is the creature's geometry that is wrong". Session 23 is
where that becomes a balance question.

### The PPO entropy divisor, before and after

`ppoHeadUpdate` reported `entropy / (rows.length * 2)`, where the `2` was the policy-head count
spelled as a literal -- `headGradient` was called exactly twice per row. The only assertion on
that field anywhere in the tree was `report.entropy > 0`, which any positive divisor satisfies.

Measured on a real trainer run (`trainPpo`, seed 310013, 240 solver steps, both arms, two
option boundaries each):

| arm | before (`rows x 2`) | after (`rows x PPO_POLICY_HEADS.length`) |
| --- | ---: | ---: |
| random | 3.0543 | **1.2217** |
| dagger | 3.0462 | **1.2185** |

The `policyLoss` and `valueLoss` figures are byte-identical between the two runs, which is what
makes this a reporting fix rather than a training one. **The before column is above the
theoretical maximum**, which is the sharpest way to see that it was wrong.

**The bound quoted here was computed over the wrong sets and is corrected.** It read "the five
heads have at most 5, 7, 3, 4 and 6 legal outputs, so the largest mean per-head entropy any row
can carry is `(ln5 + ln7 + ln3 + ln4 + ln6) / 5` = 1.566" -- which is the width of the five
**tables**. Entropy accumulates over `sample.supported` (`ppo.ts`), which is the *mask*, and no
mask reaches the table width on three of the five heads. Measured over the whole body space, the
reachable maxima are movement **5** (unmasked), action **6** on `sword+empty+bite` -- a body
cannot have both `cut` and `shoot`, because a bow takes two hands -- effector **2**, because
`tacticEffectors` answers hands or the natural effector and never both, target **3**, and stance
**6** (unmasked). So the achievable bound is `(ln5 + ln6 + ln2 + ln3 + ln6) / 5` = **1.3969**.

The conclusion survives and the bound does not: 3.05 is more than twice 1.3969, so the before
column was still above anything a row could carry. The corrected number is the tighter statement
and the one to quote.

Pinned by `ppo_updates_policy_weights_value_head_and_reports_clipping_and_entropy` at
`(2 ln2 + ln3 + ln4 + ln6) / 5` = 1.13259 on a fixture whose five heads have 2, 2, 3, 4 and 6
legal outputs -- deliberately unequal, so a wrong divisor is a wrong number rather than a wrong
sign -- and by `the_reported_entropy_is_a_mean_over_rows_as_well_as_over_heads`, which doubles
the rows and requires the mean not to move.

### Two masks that are conditioned rather than joint, and why PPO cannot use the other one

NEAT-QD decodes a raw 26-vector and takes `selectDeployableTactic`: the largest
`action + effector + target` logit sum over `deployableTactics(view)`, masked in front of the
comparison. PPO does **not**, and the difference is about the algorithm rather than about
taste. PPO's policy is a product of five categorical conditionals -- the importance ratio, the
entropy term and the clipped surrogate are all per head -- so each head has to be sampled from a
distribution `ppoHeadUpdate` can *rebuild* from the stored support. A joint argmax over 72
tuples is a single categorical over a different support with a different log-probability, which
is an algorithm change wearing a decoding change's clothes.

`recurrentTactic` in `deployment.ts` is what PPO uses instead: the action mask is
`deployableActions`, the effector mask is `tacticEffectors(view, action)` **for the action just
sampled**, and the aim mask is `tacticTargets(action)`. Those are precisely the three loops
`deployableTactics` builds its set from, so the triple is a member by construction rather than
by a refusal after the fact, and the stored `supported` lists are the exact conditionals the
update renormalizes over -- which is correct because PPO's ratio is evaluated at the *old*
actions. One function, two pickers: `argmaxHeadPick` for deployment and league opponents,
`maskedCategorical` for the trajectory collector.

`every_conditionally_masked_pick_is_a_tuple_the_executor_accepts` sweeps 32 combinations of
per-head preference over four loadouts;
`three_independent_argmaxes_would_have_produced_an_illegal_tuple` is the counterfactual on the
body where it matters -- `punch+primary+low` is three separately legal names and an impossible
triple on `sword+empty`.

### PPO produces 25 of the 26 outputs, and persistence is a decision

There is no persistence head and there is not going to be one until somebody means it.
`RecurrentPolicyWeights` and `RecurrentStep` carry five categorical heads and a value head, and
the persistence a PPO controller answers is the shared constant `UNLEARNED_PERSISTENCE` = 0.4 --
the same number `deployment.ts`, `lookahead.ts`, `train-lookahead.mjs` and `train-ppo.mjs` each
spelled out. Making it learned means a **continuous** action: a Gaussian or Beta
parameterisation with its own log-probability in the ratio, its own entropy term and its own
clipping story. PPO emits a *label* rather than a raw 26-vector, so the width contract does not
bind it.

The artifact records it rather than leaving a reader to work it out: PPO provenance carries
`producedOutputs` 25, `contractOutputs` 26 and `unlearnedPersistence` 0.4.
`every_producer_of_a_research_label_writes_the_same_six_fields` asserts the 0.4 as a literal, so
a session that adds the sixth head has to come and delete that line.

### `TACTICAL_TEACHER_VERSION` had three writers and no reader

The number was written into `collect-dagger.mjs`'s config digest, into artifact provenance, and
onto every row by `research-rollout-worker.mjs`. `validateDaggerRow` checked it for being a
non-negative safe integer, in a loop about provenance arithmetic beside the seed and the two
step counters, and nothing compared it to anything. So a row labelled by the three-field teacher
and one labelled by the six-field teacher were the same row to every consumer the moment the
feature version matched -- which is exactly the state authoring a real aiming rule would have
made dangerous.

It is compared the way `featureVersion` is now, refused by a sentence naming both numbers, and
`TACTICAL_TEACHER_VERSION` is 2. The **143 rows** checked in under
`asset-src/learning/research/session16-final-workers8/state.json` were read rather than assumed:
all 143 are `featureVersion` 3 against a runtime 4 and `teacherVersion` 1 against a runtime 2,
and all 143 carry the three-key label `action,movement,persistence`. They were already refused
at the feature version and are now refused three ways. Nothing in `src/`, `scripts/` or `tests/`
reads any of the three checked-in run directories; only `docs/` mentions them.

### The silent classifier, and the artifact that deployed and answered `cover`

`classify` in `dagger.ts` scored each label from `weights[index * hidden.length + feature]` and
reduced with `score > best.score`. On a head whose matrix is shorter than its label list every
read is `undefined`, every score is `NaN`, `NaN > best.score` is false for all of them, and the
reduce falls through to its **seed** -- returning `labels[0]` with no error anywhere.

Demonstrated with a zero-row action head: the model serialises, passes `ResearchArtifact`'s
envelope, passes `deployment.ts`'s `exactNames` -- which reads `labels`, and the labels are
intact -- and passes the all-zero deployment probe, because `HAND_ACTION_NAMES[0]` is `cover`
and `cover` is a perfectly legal answer. It then answers `cover` for the whole of a tournament.
`LinearHead` carries no row count, so nothing above `classify` could cross-check it either, and
C2b adds three more matrices to the same blind spot.

`classify` now refuses by name, per head, naming the three counts:
`DAgger action head is 0 weights and 7 biases; 7 labels over 12 hidden units needs 84 and 7`.
Checked on every call rather than once at decode, because two length comparisons in front of a
`labels.length x hidden.length` forward pass is free and a check at the door is a check a second
door can be built beside.

### `finiteLayer` validated four of five heads against themselves

`recurrent-network.ts` called `finiteLayer(weights.movement, weights.movement.rows, ...)` -- a
check that cannot fail, for a head of any row count -- while the value head one line below
passed a literal `1` and was the only one that meant anything. The row counts come from the
runtime name tables now, through one `HEAD_ROWS` table that also drives the five-head loop.

**`tests/ppo.test.mjs`'s own `weights()` fixture was that artifact**, and had been since the file
was written: `action: layer(6, GRU_UNITS)` against a seven-name table, so the fixture was a
policy whose seventh action -- `recover`, the one name in every legal mask -- had no row at all,
and `dense` answered six logits where the decoder reads seven. Both the fixture and the check
moved; `a_head_whose_row_count_is_not_its_runtime_table_is_refused_by_name` sweeps all five
heads, short and absent, and also runs `initialPpoWeights` through the constructor so the
trainer's initializer and the runtime tables are paired by something other than a bout.

### The stratum key stayed coarse, and the reason is measured

`balancedDaggerRows` keys strata as `unitCell\0movement\0action`. The label space grew about
seventy-twofold in this stage and the key did not follow it, on the histogram rather than on
taste: across the 13-cell run above -- 268 decisions at **2400 solver steps**, unreplicated --
there are **47 strata** and the number of distinct `(effector, target, stance)` triples inside
one is **min 1, max 3, mean 1.38**. Keying on them would split each stratum into a handful of
near-duplicates and raise the *effective* cap per action from 64 to 64 times that, which weakens
the only thing the function does -- stop a common action drowning a rare one.

**"48 strata" was from a different run than the sentence names, and is corrected to 47.** 48 is
the 9600-step, 418-decision run; the 13-cell 2400-step run this paragraph is about has 47. The
`min 1, max 3, mean 1.38` figures hold for both, and both were re-measured after the cover fix
and did not move.

The argument for the wide key is real and is why this needed deciding: an effector head trained
on a set where every humanoid row names the primary hand learns the loadout rather than the
decision. **That premise had two causes and the record named only one.** The schedule half is
still true for `cut` -- no `RESEARCH_STRATA` loadout puts a striking weapon in the off hand, so
every `cut` names the primary and always will until the schedule changes. The other half was a
rule defect in `firstLegalEffector` covering 139 of the 268 decisions, and fixing it moved
`secondary` from 0 to 13.8 % without touching the schedule at all.

**The stratum-key argument survives the fix, and is stronger for it.** The claim was that a
wider key "would keep more copies of the same `primary`", which was resting on a histogram where
`primary` was 100 % of the humanoid rows; it is 189 of 226, or **84 %**, and the reason the wide key
is still wrong is the one that never depended on the share: at mean 1.38 distinct triples per
stratum a tuple key splits nothing into near-duplicates and multiplies the effective cap.
What the remaining `cut` skew argues for is a **schedule** with a reversed loadout in it, and
failing that a second balancing pass keyed on the tuple -- not a wider key on this one.
`the_stratum_cap_is_keyed_on_the_action_rather_than_on_the_whole_tuple` pins the coarse
behaviour in both directions.

### The quality-diversity descriptor did not move, and one of its two reasons did

`QualityDescriptor` is three outcome measures binned at `QD_BINS` = 5, which is 125 cells. This
section argued the widening away twice, and **the arithmetic half was wrong**.

It read: adding the chosen tuple multiplies 125 by the tuple space -- "7 actions x 3 effectors
x 4 targets is 84 nominal and **72 legal on a humanoid**" -- for 9,000 to 10,500 cells against a
full-budget run of `populationSize` 128 x `generations` 80 = **10,240 genome evaluations**, so
"fewer than one elite per cell before a single cell is ever revisited". 72 is not a count of
legal tuples; it is `3 x 4 x 6`, the nominal per-action multiplier that `dagger.ts` uses
correctly for "grew about seventy-twofold". Measured, `|deployableTactics|` peaks at **21** on
any body at all (`sword+sword+bite`), the union over the whole body space is **33**, and the
union over the thirteen research cells -- which is the space an archive built from
`researchMatrix` would index -- is **24**.

So the true arithmetic is `125 x 24` = **3,000 cells** against 10,240 evaluations: **3.4
evaluations per cell, not 0.9** -- `125 x 27` = **3,375** and **3.0** since `sword+axe` joined the
strata, which is the second time this arithmetic has moved without the decision moving. That is thin for MAP-Elites, whose whole mechanism is
competition inside a cell, but thin is a tuning objection rather than a refusal, and the
sentence the number was carrying is false. **The arithmetic no longer decides this.**

The second reason does, and it is now the only one. These are **outcome** measures and the
chosen tuple is an input to them. `opportunityConversion` asks what fraction of the openings a
controller took, not which hand it took them with. The thing somebody actually wants from a
tuple dimension -- an archive that keeps a controller which fights one-handed beside one that
uses both -- is a redefinition of the *descriptor*, not a fourth key on this one. A tuple
dimension also has to answer *which* of a bout's hundreds of tuples it means, and no answer to
that is an outcome either. The descriptor still does not move, and it now rests on one argument
instead of two.

`the_quality_archive_stays_a_125_cell_outcome_map_keyed_on_nothing_a_controller_chose` was
renamed with the correction and its arithmetic assertion deleted: it read
`128 * 80 < 125 * HAND_ACTION_NAMES.length * EFFECTOR_NAMES.length * TARGET_NAMES.length`, which
is 10,240 < 10,500 over the *nominal* 84 and was the misleading comparison spelled as a test.
What it asserts instead is the argument that survived -- that the cell key is a function of the
three outcome measures and of nothing else, checked by handing `qualityCell` a descriptor with
`action`, `effector` and `target` bolted onto it and requiring the same cell back.

### The decoder seam moved as one piece, and was watched failing when it did not

`selectDeployableTactic` had no production reader through the whole of C2a, deliberately: wiring
`deployment.ts`'s NEAT branch alone puts a joint tuple argmax on the deployment side of a seam
whose training side, `neatLabeler` in `scripts/research-rollout-worker.mjs`, still takes a bare
action argmax. Both moved in this stage, and the guard was checked first: reverting
`neatLabeler` to its hand-rolled action argmax while leaving the deployment branch on the joint
rule turns `the_training_decoder_and_the_deployment_decoder_answer_the_same_label` red with
`sword+empty` answering `punch` on one side and `thrust` on the other. That is mutation M17 in
the table below.

The fixture also gained a decisive **stance** block. C2a's remediation pass gave it
non-degenerate effector and target logits for exactly this reason; the stance block was still
zeros, which makes `action-default` the answer whatever the decoder does with it. It is
`[0.1, 0.2, 0.9, 0.3, 0.4, 0.5]` now, so every loadout's expected label carries `compact` and a
decoder that dropped the stance head fails (mutation M18).

### NEAT-QD's genome width tracked the widening with no edit, verified

`scripts/train-neat-qd.mjs` reads `META_OUTPUT_LAYOUT.width` for its output count and seeds its
`InnovationTracker` at `FEATURE_COLUMNS.length + 1 + outputs`, so the population moved from 13
outputs to 26 when the layout did. That is only worth anything if a genome of that width
*decodes*, so `a_genome_built_at_the_layout_width_decodes_to_a_legal_tuple` builds one the way
the trainer does and takes it through `readMetaOutput` to a legal tuple on a real loadout --
which is the chain a width mismatch breaks one bout into a run, inside a worker.

### Two things the gate forced into stage C2c's files, and what they cost

**`deployedResearchMind`'s decision hook narrowed rather than widened.** Its parameter was
`Parameters<typeof researchLabelMind>[2]`, which is now a whole `DaggerLabel` -- and
`lookaheadMind` declares its own hook over `{ movement, action, persistence }` and calls it with
exactly that. Function parameters are contravariant, so a hook demanding six fields cannot be
handed to a producer that supplies three: widening the shared alias makes `tsc` reach into C2c's
file. The parameter names the intersection instead, as `DeployedDecisionLabel`, and the promise
stays true -- a caller of `deployedResearchMind` does not know which algorithm it decoded, so
three fields is genuinely all it may rely on until C2c lands. The three widened algorithms still
pass the whole record at run time, and every consumer of it is `.mjs`.

**Superseded 2026-08-25: the alias no longer exists.** C2c widened look-ahead to name four fields
itself, which made `DeployedDecisionLabel` an identity alias for `DaggerLabel` with no importer --
so the assignment its contravariance argument was about could not fail. The reasoning above is
still exactly why the narrowing was right *for one stage*, which is why it stays here; the
argument itself moved onto `deployedResearchMind`'s docstring, where it is about a live signature.

**`collectTacticalTrace` names its tuple.** It was `{ movement, action, persistence: 0.4 }` and
relied on `researchLabelMind` defaulting the other three to
`asMeasured(chooseEffector(view, action))`. That default is gone, so the line names exactly what
the default was -- same effector search, same `"as-measured"` aim, same `action-default` stance
-- and every look-ahead trace stays on the line its calibration was measured at. `lookaheadMind`
already spelled the same tuple at its own call site and did not move.

The alternative was to give look-ahead a named region, which would have moved every trace: on a
`cut` the measured aim carries a +0.20 stroke-entry lift that a named region does not, so
`vital` raises the low share from 0.357 to 0.700. That is C2c's decision to take with a bout,
not a side effect of a type check.

### There is no second copy of the tuple legality rule at the seam

`researchLabelMind` refuses an **action** outside `deployableActions`, because that mask is
stricter than the executor: it removes `cover` from a handless body and refuses everything on a
body with no capability at all, so there is something it says that nothing below repeats. It
deliberately does **not** re-check the tuple. `handActionOption` refuses an unknown effector,
target or stance at construction and an illegal `(action, effector, target)` at `enter`, through
`unsupportedTactic` -- the same `tacticEffectors` and `AIMED_TARGETS` that `deployableTactics` is
built from. A pre-check at the seam would be that rule spelled twice with the two copies free to
drift, which is what `deployableActions`' own note records happening seven times, and the
executor refuses more usefully: `option "punch" requires a punch target of vital, high, not
"low"` names the part that was wrong.

That matters most for **DAgger**, which is the one algorithm whose deployment is unmasked:
`predictDagger` argmaxes each head over its whole table, so a model that learned `punch` and
`low` from different rows can name a triple no body has, and the bout aborts by name.
`an_illegal_learned_tuple_is_refused_by_name_and_never_repaired` pins all three thirds of that.
It is the same shape as the existing unmasked *action* behaviour, which has been able to abort a
bout since DAgger landed; whoever decides a masked DAgger decode is worth having has to expose
per-head scores from `predictDagger` first, and that is a contract change rather than a fix.

### A teacher label that no body could execute, found by the exhaustive sweep

`the_teacher_only_ever_labels_a_tuple_the_body_can_execute` walks every ordered weapon pair (49)
x both loss flags on each hand (4) x with and without a published bite (2) x four measures x a
threatening and a quiet opponent, plus the centipede and an armless warrior: **3,152 cells**,
2,752 labelled and 400 inert. It found one, and a sampled fixture never would have.

On a body carrying a **sword in the primary and a bow in the secondary**, `attackOpportunity`
publishes a viable sword row -- it knows nothing about the weld -- while `tacticEffectors("cut")`
answers `[]`, because `Fighter.update` welds the trailing hand to the bow's stave and the
two-handed holder rule refuses every other hand. The teacher labelled `cut+primary`, and
`composeTactic` refused it by name one call later, killing the bout. No `RESEARCH_STRATA` row
carries that loadout, which is why it had never fired. `actionableRow` asks the legality rule
which opportunity is actually actionable now, and takes the first that is.

### The mutation table

Every test this stage added or touched, watched failing under a deliberate break. The harness is
`.review/c2b/mutate.mjs`, which patches one line, runs one suite, and restores;
`.review/c2b/mutate2.mjs` is the remediation pass's, in the same shape.

**The table has 25 rows, not 24, and both places that counted it said 24.** M1 to M23 plus M3b
and M4b is 25. The remediation pass of 2026-08-25 adds **nine** -- N1, N1b, N2, N2b, N3, N3b,
N4, N5 and N8 -- for a total of **34**, and every one of the 34 went red. (N6 and N7 in
`.review/c2b/mutate2.mjs` are M15 and M16 re-run against the widened tuple test rather than new
rows; both still go red, which is what says the widened sweep did not cost the old coverage.)

| # | mutation | test that went red | what it said |
| --- | --- | --- | --- |
| M1 | teacher legality filter dropped | `the_teacher_only_ever_labels_a_tuple_the_body_can_execute` | `sword+bow@0.2/0: cut+primary+vital is not in deployableTactics` |
| M2 | slip sign flipped | `the_teacher_slips_away_from_the_side_the_threat_is_on` | `a blade on the right is slipped away from, not into` |
| M3 | `THRUST_EDGE_FRACTION` 0.10 -> 0.20 | `the_thrust_aim_rule_is_low_at_full_extension_and_high_against_a_standing_body` | `just outside it` |
| M3b | `THRUST_EDGE_FRACTION` 0.10 -> 0.05 | same | `inside the last tenth of the reach` |
| M4 | `CROUCHED_OPPONENT` 0.50 -> 0.40 | same | strict-equality diff on the crouched branch |
| M4b | `CROUCHED_OPPONENT` 0.50 -> 0.60 | same | strict-equality diff on the settled branch |
| M5 | `cover` aimed at the vitals | three teacher tests | deep-equal diff on the whole label |
| M6 | effector constant `primary` | `the_teacher_names_the_hand_whose_opportunity_it_took` | deep-equal diff |
| M7 | crowded stance dropped | `the_teacher_goes_compact_when_crowded_and_neutral_otherwise` | strict-equality diff |
| M8 | teacher version unchecked | `a_row_from_the_previous_teacher_is_refused_by_a_sentence_naming_both_versions` | `Missing expected exception` |
| M9 | `classify` size check dropped | `a_head_whose_matrix_is_shorter_than_its_labels_is_refused_by_name` | `Missing expected exception: movement` |
| M10 | label-key string narrowed | `dagger_rows_contain_only_versioned_observation_features_and_labels` | regex mismatch on the privileged-column refusal |
| M11 | stratum key widened to the aim | `the_stratum_cap_is_keyed_on_the_action_rather_than_on_the_whole_tuple` | `four aims of one action are one stratum` |
| M12 | entropy divisor back to the literal 2 | `ppo_updates_policy_weights_value_head_and_reports_clipping_and_entropy` | `entropy 2.8314802400679726 against 1.1325920960271891` |
| M13 | entropy divisor loses `rows.length` | `the_reported_entropy_is_a_mean_over_rows_as_well_as_over_heads` | `1.1325920960271891 against 2.2651841920543783` |
| M14 | `finiteLayer` checks a head against itself | `a_head_whose_row_count_is_not_its_runtime_table_is_refused_by_name` | `Missing expected exception: movement` |
| M15 | effector mask unconditioned | three PPO tests including the Havok resume | `option "cut" requires the primary or secondary hand, not the natural effector` |
| M16 | aim mask unconditioned | the same three | `hand action "cut" cannot be aimed at "threat"` |
| M17 | only the deployment half of the seam moves | `the_training_decoder_and_the_deployment_decoder_answer_the_same_label` | deep-equal diff, `punch` against `thrust` |
| M18 | stance argmax pinned to index 0 | that test and the tuple test | deep-equal diff on `stance` |
| M19 | label field list loses the stance | `every_producer_of_a_research_label_writes_the_same_six_fields` | `teacher` |
| M20 | output width pinned at thirteen | `a_genome_built_at_the_layout_width_decodes_to_a_legal_tuple` | strict-equality diff |
| M21 | `QD_BINS` widened to six | the two archive tests | strict-equality diff on the cell count |
| M22 | the seam quietly redirects the named hand | five tests | `option "cut" requires a held striking weapon in the secondary hand` |
| M23 | `probeLabel` names a constant hand | `the_training_schedule_offers_exactly_what_the_runtime_mask_offers` | `option "recover" requires an attached primary hand` |

The remediation pass's eight, 2026-08-25. N1 and N1b are the ones that matter most: the
threat-side rule's facing rotation had **no fixture at all**. Every view fixture in the tree
publishes `self.facing: 0`, at which `dx cos f - dz sin f` is exactly `dx`, so replacing the
whole expression with `return dx;` was invisible. Measured both ways rather than argued: under
that mutation **exactly one of the 524 tests fails**, and it is the quarter-turn block this pass
added -- so before the pass the suite was green under it, because the facing-0 pair is
arithmetically identical to the mutation. And the mutation is not cosmetic: re-running the real
histogram under it moves `slip-right` 41.8 % -> **50.0 %** and `slip-left` 17.9 % -> **9.3 %**,
which reproduces the review's figures to the digit.

| # | mutation | test that went red | what it said |
| --- | --- | --- | --- |
| N1 | threat-side rule loses its facing rotation (`return dx;`) | `the_teacher_slips_away_from_the_side_the_threat_is_on` | `actual 'slip-left', expected 'slip-right'` |
| N1b | facing rotation with the wrong sign on `dz` | same | `facing +X, a blade at -z is on the right` |
| N2 | cover preference back to first-legal | `the_teacher_covers_with_the_hand_that_holds_the_better_guard` | `['primary','primary']` against `['secondary','primary']` |
| N2b | cover preference ranked backwards | same | `['primary','secondary']` against `['secondary','primary']` |
| N3 | `shoot` persistence 0.70 -> 0.42 | `every_teacher_persistence_is_the_number_beside_the_branch_that_chose_it` | `['shoot', 0.42]` against `['shoot', 0.7]` |
| N3b | natural bite persistence 0.40 -> 0.42 | same | `['bite', 0.42]` against `['bite', 0.4]` |
| N4 | trajectory collector argmaxes instead of sampling | `the_ppo_trajectory_stores_the_conditionals_it_sampled_under_rather_than_the_whole_table` | `0/movement: stored probability 1 against 0.20643046374478322 over the stored support` |
| N5 | trajectory stores each head's full index range | same | `0/action: stored probability 0.1983269143770432 against 0.14173541996469635 over the stored support` |
| N8 | `DEFENSIVE_ACTIONS` loses `recover` | `every_conditionally_masked_pick_is_a_tuple_the_executor_accepts` | `hand action "recover" cannot be aimed at "threat" -- only cover answer a point that moves` |

N8 is the one that shows why that last test had to change. It asserted membership in
`deployableTactics(view)`, which is built from the same `tacticEffectors` and `tacticTargets`
`recurrentTactic` masks with -- a mask compared against itself. `AIMED_TARGETS.recover` still
offers `threat` under N8, so the tuple is still "legal" and the old assertion passes; what
refuses is `handActionOption`, at construction, which the test never called. It calls it now, on
every legal tuple of eight bodies at all six stances -- **444 entries**, and the fixture set
gained a severed hand, a warrior that has lost both arms and a centipede, because the
`["natural"]` branch of `tacticEffectors` fires only where no hand is attached and four intact
humanoids never reached it.


**What each of these does not catch**, one per test, because a mutation table that only lists
what went red reads as a coverage claim:

- `the_teacher_only_ever_labels_a_tuple_the_body_can_execute` checks membership, not *which*
  member: a teacher that labelled `recover+primary+vital` for every body on earth would pass it.
  The per-branch tests are what say the label is the right one.
- `the_teacher_slips_away_from_the_side_the_threat_is_on` reads the label, not the body: it
  cannot see whether a `slip-left` posture actually removes anything from the incoming line,
  which is a bout measurement and is session 23's.
- `the_thrust_aim_rule_...` drives the rule directly, so it cannot see that `tacticalTeacher`
  never calls it with `thrust` -- which is the finding recorded above rather than a test.
- `the_teacher_names_the_hand_whose_opportunity_it_took` runs on a hand-rolled view; it cannot
  see that no `RESEARCH_STRATA` loadout ever puts the striking weapon in the secondary, which is
  what the histogram found.
- `a_row_from_the_previous_teacher_...` compares the numbers; it cannot tell whether
  `TACTICAL_TEACHER_VERSION` was bumped for a real change or for none.
- `a_head_whose_matrix_is_shorter_...` catches a short or absent matrix; a matrix of the right
  length full of the wrong numbers is still a silent wrong answer.
- `the_stratum_cap_is_keyed_on_the_action_...` pins the key, not whether the cap of 64 is right.
- `ppo_updates_..._entropy` pins the divisor on a synthetic head set; it does not check that the
  five heads are the *right* five, which `PPO_POLICY_HEADS` and the artifact provenance say.
- `a_head_whose_row_count_is_not_its_runtime_table_...` catches a wrong row count; it cannot see
  a head whose rows are right and whose *labels* are in the wrong order, which is `exactNames`'.
- `every_conditionally_masked_pick_...` proves legality by construction; it says nothing about
  whether the conditional factorization is the right *policy*, only that it is a legal one.
- `the_training_decoder_and_the_deployment_decoder_answer_the_same_label` catches a one-sided
  move; two decoders moved the same wrong way still agree, which is why the whole expected table
  is written out by hand rather than compared decoder-to-decoder alone.
- `every_producer_of_a_research_label_writes_the_same_six_fields` checks names and membership,
  not values: four producers all answering `recover+natural+vital+upright` would pass.
- `a_genome_built_at_the_layout_width_decodes_to_a_legal_tuple` builds a genome the way the
  trainer does rather than *being* the trainer, so a trainer that stopped reading
  `META_OUTPUT_LAYOUT.width` would need a run to catch.
- `the_quality_archive_stays_a_125_cell_outcome_map_...` pins the cell count; it cannot say
  whether three outcome measures are the right three.
- `an_illegal_learned_tuple_is_refused_by_name_...` pins the refusal; it cannot see a *legal*
  tuple that is tactically absurd, which is what a tournament is for.

The remediation pass's four, same rule:

- `the_teacher_covers_with_the_hand_that_holds_the_better_guard` reads the **label**, not the
  body. It cannot see that `handActionOption`'s cover branch produces a byte-identical intent
  either way on a `sword+shield` body -- only `intent.actingHand` differs -- so it would pass
  just as happily if the executor never used the hand the label names. That is a bout question
  and is session 23's; it is recorded above rather than tested here.
- `every_teacher_persistence_is_the_number_beside_the_branch_that_chose_it` pins four constants
  against four branches. It says nothing about whether any of the four is the **right** number:
  a persistence window is a feel judgement and no bout here prices one.
- `the_ppo_trajectory_stores_the_conditionals_it_sampled_under_rather_than_the_whole_table`
  rebuilds what the update will renormalize over and compares it. It cannot see a mask that is
  wrong in the *same* way on both sides -- if `recurrentTactic` conditioned on the wrong action,
  the stored support and the recomputed one would agree and both be wrong. The aim head is the
  one exception, because `tacticTargets` is checked against the frozen table rather than against
  the decoder.
- `every_conditionally_masked_pick_is_a_tuple_the_executor_accepts` now enters every option for
  real, so it catches a table and a branch coming apart. It still cannot see a tuple the
  executor *accepts* and then executes badly: `enter` is called and `decide` is not, so nothing
  here says the pose is any good.

### Two dead imports, still there, and still not this stage's

The sweep of every named import in all `scripts/*.mjs` and `tests/*.mjs`
(`.review/c2b/imports.mjs`) finds **two**, both present at `3674e06` and neither introduced here:
`tests/materials.test.mjs` imports `Color3` unused, and `tests/tournament-executor.test.mjs`
imports `SeededRng` unused. All fifteen scripts are clean, including the five this stage edited.
They are left alone because deleting an import in a file this stage otherwise did not touch is
the kind of unrelated diff that makes a review harder, and they are written down so the next
sweep does not report them as new.

### Twenty-five line anchors re-pointed, and the two spellings that pass missed

Editing five trainers and six `src/learning` modules invalidated 34 `path#Lnnn` endpoints across
25 anchors in four documents -- `docs/measurements.md`, the plan overview, `-16` and `-19`. Each
was re-pointed by locating the `3674e06` line's *text* in the current file and refusing any
target that was not unique (`.review/c2b/repair-anchors.mjs`, 0 refusals). The six unresolved
anchors are the ones the C2a pass already recorded: they name files that no longer exist.

**That pass keyed only on `path#Lnnn`, and the plan set uses three spellings.** The other two are
the colon form `` `options.ts:258` `` and a bare continuation `` `:105` `` that carries the
preceding file name. Swept with `.review/c2b/colon-drift.mjs`, which compares each anchor's
target line at `HEAD` against the same line now: **24 colon anchors were moved by this stage's
edits**, across the overview and `-17`. They are repaired here.

Sixteen were re-pointed at the construct their prose names, verified one at a time against the
current file rather than by trusting an arithmetic offset -- `LOADOUT_ACTIONS`,
`neatLabeler`, `selectValidationChampion` (twice), the bite skill, the handless `recover`
branch, `maskedArgmax`'s refusal, `recordIntentAttack`, the `actionArcherAim` call site,
`handActionOption`'s unknown-action refusal, the `option "<name>" requires` helper,
`a_synthetic_stale_feature_header_is_refused_before_network_execution`,
`the_learned_policy_stops_on_the_bout_verdict`, `_engagement`'s non-writable definition,
`UNLEARNED_PERSISTENCE`, `train-lookahead.mjs`'s empty-cell throw, and the
`applyActionPosture`/`boundIntent` slot.

**Six were struck instead**, because the construct the prose names does not exist at any line:
`options.ts`'s `.driving` reads, `meta.ts`'s `learned-meta` name, `learning.test.mjs`'s
checkpoint read, `deployment.ts`'s inline `persistence: 0.4`, `recurrent-network.ts`'s
three-head `RecurrentPolicyWeights`, and `ppo.ts`'s literal-2 entropy divisor. Each carries a
dated supersession in place. **A number pointing at nothing is worse than no number**, because
re-pointing a knowingly dead anchor makes it read as freshly verified -- which is what the C2a
note about `meta.ts`'s `featureVersion` check did, in the same hunk that said it was leaving it
alone. That one is decided above: struck, and the plan sentence that stated it in the present
tense superseded.

**Two more spellings exist and are not repaired here, written down so the next sweep does not
rediscover them.** A comma list -- `` `tests/learning.test.mjs:147,151` `` -- which no regex in
`.review/c2b/` matches, and the bare `` `:NNN` `` continuation, which needs the preceding file
name resolved to check. And **35 colon anchors this stage did not move are stale anyway**, for
reasons predating it: `options.ts:190` pointed at a comment at `HEAD` while its prose names
`actionArcherAim`, and `options.ts:461` pointed at `neutralPosture` while its prose says
`recordIntentAttack`. Those were repaired where this pass touched the line and left where it did
not. The durable fix is still the one this file already argues for: write each anchor as a
Markdown link with a real relative href, at which point `tools/check_docs.js` catches all three
spellings for free.

### The remediation pass -- 2026-08-25

An adversarial review of stage C2b found no defect in behaviour: `recurrentTactic`'s
legality-by-construction held over 2,533 tuples on 396 bodies, the PPO gradients passed a
finite-difference check at worst relative error 2.0e-7, all 30 malformed `DaggerModel`s were
refused by name, and the look-ahead trace was byte-identical. What it found was **one rule
defect, four defects in evidence and six in the record**, and every one of the eleven is
addressed above or below.

The rule defect is the `cover` effector, recorded with the histogram. The evidence defects were
an untested facing rotation, a PPO training/deployment seam with no guard at all, a
legality test that compared a mask against itself, and an unpinned `shoot` persistence -- the
nine N-rows in the mutation table. The record defects were "72 legal tuples" in four places, an
entropy bound computed over the wrong sets, "48 strata" from a different run than the sentence
names, 24 drifted colon anchors, a knowingly-dead anchor re-pointed as though verified, and a
mutation table called 24 rows while carrying 25.

**Two of the review's own claims did not survive measurement**, which is worth recording for the
same reason every other correction here is:

- It said the widest `deployableTactics` was measured over **396 bodies**. Enumerated here as
  7 weapon kinds squared x 2 loss flags x 2 loss flags x 2 bite flags = 392, plus the centipede,
  the count is **393** (`.review/c2b/tuplespace.mjs`). The three derived figures -- widest 21 on
  `sword+sword+bite`, union 33, union over the thirteen research cells 24 -- reproduce exactly,
  so either the enumeration differed by three bodies that add no tuple, or the count was
  approximate; the conclusion is unaffected either way. Recorded because a body count quoted
  without its enumeration is the kind of number this file has watched go stale.
- It said `TACTICAL_TEACHER_VERSION` "must move again" for the cover fix. It has not, and the
  reason is on the constant: `HEAD`'s teacher is version **1**, stage C2b is one uncommitted
  change, and every label any run outside this working tree has ever produced carries 1.
  Bumping to 3 would refuse rows no run ever wrote. The review's own second clause -- "keep it a
  single bump for the whole stage rather than two" -- is the one that decides it.

**What the cover fix cost the null control: nothing.** `npm run measure -- --only
duelist-swinger --bouts 120`, seed 20260823, re-run after every edit here: duelist 66/120 =
**55.0 %**, bout length **3.52 s (1.42-8.98)**, damage **176.17**, **10** severs, **1496** and
**1670** scoring contacts. Identical to C1, C2a and C2b to the digit, which is what it must be:
the scripted policies never enter the option layer, and `isHeldStriker` replaced
`isStriking(kind) && kind !== "empty"` in `accepts("cut")` with a predicate that agrees on every
member of `WeaponKind`.

## Session 17 Stage C2c: the look-ahead planner carries the tuple -- 2026-08-25

The look-ahead cell key went from `movement+action` to `movement+action+effector+target`, in the
beam, in the calibration filter and in the training schedule. **The stance stayed out, on
evidence**, and that is the whole of the difference between the ~19x the plan priced and the
3.23x it cost. 524 tests before, **528** after; `npx tsc --noEmit` and `npm run build` clean;
`git diff --numstat` and `git diff --ignore-cr-at-eol --numstat` md5-identical.

Everything below names its harness. There are four: the headless research bench
(`scripts/research-havok.mjs` over `scripts/measure.mjs`'s `NullEngine` plus Havok), the real
trainer (`scripts/train-lookahead.mjs`), an in-process beam bench, and an exhaustive capability
sweep. **The page took no reading in this stage and no figure here is a page figure.**

### The null control did not move, for the sixth stage running

`npm run measure -- --only duelist-swinger --bouts 120`, seed 20260823: duelist 66/120 =
**55.0 %**, bout length **3.52 s (1.42-8.98)**, damage **176.17**, **10** severs, **1496** and
**1670** scoring contacts. Identical to C1, C2a and C2b to the digit. It must be: the scripted
policies never enter the option layer, and the only shared file this stage moved is
`src/learning/meta.ts`, which gained two constants and no behaviour.

### The schedule, the beam and the budget, as they now stand

| quantity | HEAD (`movement+action`) | C2c (`+effector+target`) | with the stance as well |
| --- | ---: | ---: | ---: |
| schedule tasks per split | 240 | **775** | 4,650 |
| groups (`3 x train + validation`) | 960 | **3,100** | 18,600 |
| minimum solver steps (`groups * 48`) | 46,080 | **148,800** | 892,800 |
| `TacticalModel.cells` keys | 240 | **775** | 4,650 |
| beam cells, `sword+empty` | 25 | **80** | 480 |
| nodes per replan, `sword+empty` | 1,075 | **3,440** | 20,640 |
| factor | 1x | **3.23x** | 19.4x |

Per loadout: legal `(action, effector, target)` tuples, beam cells (`x 5` movements) and the
exact node budget at depth 8, width 6.
`the_widened_schedule_costs_exactly_what_sessions_20_and_21_will_budget_from` pins the whole
table, and `trainLookahead`'s own refusal at 148,796 steps pins the 3,100 groups.

| loadout | tuples | cells | nodes/replan |
| --- | ---: | ---: | ---: |
| `sword+empty` | 16 | 80 | 3,440 |
| `sword+shield` | 14 | 70 | 3,010 |
| `sword+buckler` | 14 | 70 | 3,010 |
| `axe+empty` | 13 | 65 | 2,795 |
| `bow+empty` | 7 | 35 | 1,505 |
| `empty+empty` | 12 | 60 | 2,580 |
| `natural:bite` | 3 | 15 | 645 |

### 1. The stance does not move what the tactical model predicts, and it moves the fight a lot

Harness: `.review/c2c/stance.mjs` (the research bench) and `.review/c2c/stance-folds.mjs` (the
analysis, over the rows that script caches). Nine
`(cell, movement, action, effector, target)` tuples, all six stances on each, three seeds on
each, **4,800 solver steps a bout** -- 162 bouts, **70.2 s** of wall clock.

**The harness has a control that must read exactly zero, and does.** `Centipede.update` reads
the movement axes and the two natural buttons and never touches `input.posture`, so a
centipede's six stances have to be indistinguishable. They are **byte-identical** -- the same
rows, the same 15 contacts, the same 138.46 damage, the same final vitality -- for both
`close+bite+natural+vital` and `hold+recover+natural+vital`. A probe that could not tell "no
effect" from "small effect" would have shown noise there. (`upright` comes back byte-identical
to `action-default` on a warrior's `hold+recover+primary+vital` as well, for a different reason:
`applyActionPosture("recover")` already leaves all three axes at zero, so zeroing them again
changes nothing.)

**Superseded on the statistic, not on the conclusion -- see "Session 19", section 8.** Every reach
figure in this sub-section is `|signedReachError|`, which session 19 established is a signed mean
of residuals about a fitted mean and therefore identically zero in-sample; the Brier figures are
99.6 % irreducible outcome variance. The tables below are kept because the fixture and the fold
structure are still the record of what was run.

**And superseded a second time on how the re-asking was read.** This said the conclusion
"strengthens: two of three columns say stance-keying is worse", which counts columns in three
different units -- the same fallacy session 19 convicts the old champion score of. Through
`calibrationSeverity`, stance-keying is marginally **better** on both fold sets, by 0.05 % and
0.04 % of the 3.0-per-cell scale. The decision is unchanged because the effect is under a tenth
of a percent either way, which is not a difference; session 19 section 8 has both tables.

**Leave-one-seed-out, warrior cells only** -- the centipede excluded, because its zeros would
dilute the very comparison they are a control for. Each row is the mean absolute calibration of
a delta fitted on one source and scored on held-out rows, against limits of **0.25 / 0.25 /
0.25**. Columns are `signedReachError` (absolute), `contactBrier`, `vitalityDeltaError`:

| delta fitted on | reach | Brier | vitality | n |
| --- | ---: | ---: | ---: | ---: |
| the same stance, two seeds | **0.0081** | **0.1387** | **0.0241** | 126 |
| the same stance, **one** seed -- the noise floor | 0.0092 | 0.1400 | 0.0245 | 252 |
| **another** stance, two seeds | 0.0121 | 0.1410 | 0.0244 | 630 |

Knowing the stance is worth 0.0040 of reach error, 0.0023 of Brier and 0.0003 of vitality error.
**Halving the fitting seeds costs 0.0011, 0.0013 and 0.0004** -- so on the vitality column the
whole stance effect is smaller than one seed of noise, and on the other two it is about three
seeds' worth. Every figure is under 1.6 % of the limit its column is refused at.

**At a fixed budget it buys nothing at all**, which is the comparison that decides it: six
stance-keyed cells on a sixth of the rows each, against one stance-free cell on all of them,
scored on the same held-out rows.

| | reach | Brier | vitality |
| --- | ---: | ---: | ---: |
| six stance-keyed cells (warrior, n=126) | 0.0081 | 0.1387 | 0.0241 |
| one stance-free cell (warrior, n=126) | 0.0099 | 0.1390 | **0.0230** |
| six stance-keyed cells (all nine, n=162) | 0.0064 | 0.1095 | 0.0188 |
| one stance-free cell (all nine, n=162) | 0.0077 | 0.1098 | **0.0180** |

Two columns are a wash and the third is *worse* with the stance in the key -- on the old
statistic, and read as a column count. Session 19 section 8 re-asks it through a single
dimensionless score and gets the opposite sign at a tenth of the size of a difference.

**Per action, because the answer could have differed and the brief asked.** Own stance against
another stance, two seeds each, same three columns:

| cell and tuple | own | another |
| --- | --- | --- |
| `sword+empty hold+cut+primary+vital` | 0.0095 / 0.1260 / 0.0450 | 0.0136 / 0.1280 / 0.0453 |
| `sword+empty close+thrust+primary+vital` | 0.0015 / 0.1927 / 0.0068 | 0.0026 / 0.1955 / 0.0068 |
| `sword+empty hold+cover+primary+threat` | 0.0087 / 0.1042 / 0.0214 | 0.0136 / 0.1064 / 0.0215 |
| `sword+empty hold+punch+secondary+vital` | 0.0124 / 0.1152 / 0.0263 | **0.0120** / 0.1154 / 0.0265 |
| `sword+empty hold+recover+primary+vital` | 0.0102 / 0.0438 / 0.0216 | 0.0170 / 0.0444 / 0.0221 |
| `bow+empty hold+shoot+primary+vital` | 0.0050 / 0.1623 / 0.0216 | 0.0106 / 0.1665 / 0.0218 |
| `bow+empty hold+cover+primary+threat` | 0.0098 / 0.2268 / 0.0260 | 0.0150 / 0.2309 / 0.0265 |
| `centipede close+bite+natural+vital` | 0.0000 / 0.0149 / 0.0006 | 0.0000 / 0.0149 / 0.0006 |
| `centipede hold+recover+natural+vital` | 0.0002 / 0.0000 / 0.0000 | 0.0002 / 0.0000 / 0.0000 |

No action shows the stance worth more than about 2 % of a limit, and on `punch` the stance-keyed
model is fractionally *worse* on reach error than the pooled one. The largest relative gap is
`shoot`, 0.0050 against 0.0106 -- and 0.0106 is 4 % of the limit.

**The stance moves the fight, and that is a statement about `TACTICAL_STATE_COLUMNS` rather than
about the stance.** Over the same runs, on `warrior/sword+empty`. **Every number in this table is
a sum over three bouts, not one bout**, and two of the three places that quoted it said "a bout
scored 182 damage" -- corrected 2026-08-25 in `src/learning/meta.ts` and in plan 17, and the
harness re-read: `.review/c2c/stance.mjs` accumulates `damage` and `rows` across its three seeds
before printing. A "rows survived" of 594 against a 4,800-step window that holds 199 rows is the
tell, and nobody read it.

| tuple and quantity, summed over three bouts | worst stance | best stance | spread |
| --- | --- | --- | ---: |
| `hold+cover+primary+threat`, damage dealt | 182.13 (`slip-right`) | 751.23 (`upright`) | **4.1x** |
| `hold+cover+primary+threat`, rows survived | 153 (`compact`) | 594 (`extended`) | **3.9x** |
| `hold+cut+primary+vital`, own final vitality | 0.328 (`slip-left`) | 0.817 (`extended`) | 2.5x |
| `close+thrust+primary+vital`, contacts | 606 (`slip-left`) | 795 (`slip-right`) | 1.3x |

`extended` survived the full 4,800-step window on the cover tuples where `action-default` was
dead by roughly 1,500 steps -- a per-bout reading of the same summed row, 594/3 against 189/3.

**Asked again at six seeds, the effect survives and the pair does not.** Harness
`.review/rem/stance6.mjs`: the same tuple, six stances, six seeds, 4,800 steps a bout, seeds
`310013` xor `0`, `0x9e3779b9`, `0x51f15e`, `0x7f4a7c15`, `0x2545f491`, `0x1b873593`. Its first
three seeds reproduce the table above to the digit -- 342.28 / 751.23 / 657.53 / 245.18 / 489.41
/ 182.13 -- which is what settles that the row is a sum.

| stance | per-seed damage | total | median |
| --- | --- | ---: | ---: |
| `action-default` | 41.9 / 99.2 / 201.2 / 233.5 / 217.3 / 313.3 | 1106.3 | 209.2 |
| `upright` | 194.3 / 252.2 / 304.7 / 403.3 / 65.9 / 176.6 | 1397.1 | 223.3 |
| `compact` | 129.1 / 402.0 / 126.4 / 204.9 / 106.9 / 154.3 | 1123.7 | 141.7 |
| `extended` | 56.7 / 96.1 / 92.4 / 96.7 / 126.1 / 182.1 | 650.0 | 96.4 |
| `slip-left` | 164.0 / 189.5 / 135.9 / 2.6 / 214.3 / 166.1 | 872.4 | 165.1 |
| `slip-right` | 65.9 / 98.7 / 17.5 / 28.9 / 0.0 / 89.9 | 300.9 | 47.4 |

**The spread survives: 4.6x on totals and 4.7x on medians.** So does `slip-right` being worst --
lowest total, lowest median, and the worst stance on three of the six seeds individually.

**The rest of the ranking is noise, and the specific pair the table quotes is inside it.** The
best stance per seed is `upright` three times, `action-default` twice and `compact` once; on
totals `upright` leads `compact` by 1397 to 1124 and on medians `action-default` overtakes
`compact` -- three different orderings out of the same 36 bouts depending on the summary. An
independent six-seed set taken during review, on other seeds, put `compact` ahead of `upright`.

**And the within-stance seed spread is larger than the between-stance spread**, which nothing in
this record said. Across these six seeds one stance's own damage ranges 41.9 to 313.3
(`action-default`, 7.5x), 2.6 to 214.3 (`slip-left`, 81x) and 0.0 to 98.7 (`slip-right`, from
nothing at all) -- against a 4.6x spread between stances on totals. **A reader deciding whether
to chase the stance needs that noise floor**: at three bouts a cell this measurement can separate
"`slip-right` is bad" from the rest and cannot rank the other five.

A planner that could see any of it would want it. The five columns the tactical model publishes
-- reach margin, facing error, threat alignment, contact probability and vitality potential --
cannot. **Whoever gives the model a column that can see a posture gets to ask this question
again**, and this section is the measurement to re-run, at more than three bouts a cell.

`UNLEARNED_STANCE` in `src/learning/meta.ts` carries the short form of this, and
`the_widened_schedule_costs_exactly_what_sessions_20_and_21_will_budget_from` pins both the 775
and the constant's literal value -- so putting the stance back multiplies every figure in that
test by six.

### 1b. What the effector and the aim are worth, asked exactly the same way

Not in the brief, and worth having: the two fields C2c *did* put in the key deserve the test that
kept the third one out. Harness `.review/c2c/variant.mjs` -- six families that share a cell, a
movement and an action and differ only in the effector or the aim; 4,800 steps, three seeds, 63
held-out evaluations a side.

| | reach | Brier | vitality |
| --- | ---: | ---: | ---: |
| keyed on the effector and the aim | **0.0094** | **0.1394** | 0.0213 |
| one seed of the same variant -- the noise floor | 0.0105 | 0.1406 | 0.0218 |
| pooled into one aim-free, effector-free cell | 0.0119 | 0.1466 | **0.0202** |

Keying is worth 0.0025 / 0.0072 / -0.0011. That is **24x the stance's Brier gain** and 1.4x its
reach gain -- and it is the Brier that matters, because at every training budget measured below,
**every** cell that fell out of calibration fell out on the Brier and none on the other two. Per
family, keyed against pooled:

| family | keyed | pooled |
| --- | --- | --- |
| `sword+empty hold+cut` (3 aims) | 0.0060 / 0.1380 / 0.0337 | 0.0153 / 0.1369 / 0.0318 |
| `sword+empty close+thrust` (3 aims) | 0.0017 / 0.2134 / 0.0049 | 0.0017 / **0.2194** / 0.0040 |
| `sword+empty hold+cover` (2 hands x 2 aims) | 0.0083 / 0.1003 / 0.0250 | 0.0083 / 0.1011 / 0.0249 |
| `sword+empty hold+recover` (2 hands x 2 aims) | 0.0171 / 0.0927 / 0.0191 | 0.0182 / 0.0913 / 0.0179 |
| `empty+empty hold+punch` (2 hands x 2 aims) | 0.0119 / **0.1665** / 0.0228 | 0.0168 / **0.2013** / 0.0203 |
| `bow+empty hold+shoot` (3 aims) | 0.0082 / 0.1451 / 0.0215 | 0.0083 / 0.1450 / 0.0212 |

`punch` is the family that carries it -- 0.035 of Brier, 14 % of the limit -- and it is the one
where the two hands genuinely differ, because on `empty+empty` the primary and secondary fists
have different reach and opposite outboard sides. `shoot` and `cover` are almost flat, so the
gain is not uniform and a future session narrowing the key should narrow it per action rather
than wholesale.

### 2. Wall clock per replan, and whether one still fits in a bout

Harness `.review/c2c/replan.mjs`: the beam run in process against a `TacticalState` taken from a
**real published Havok body**, 9 rounds of 200 replans, median of the per-round means with the
across-round range in brackets. The "today's cell count" row is the new code expanding exactly as
many cells as HEAD expanded.

**The C2c rows have their harness output in `.review/c2c/replan-c2c.txt`. The four HEAD rows do
not**, and that is the one measurement in this stage with no recorded output beside it -- they
were taken from a HEAD checkout in a separate process and only the drafted table survived. Read
them as an anecdote rather than as evidence, for the reason the next paragraph measures.

| cell | variant | cells | nodes/replan | ms/replan | nodes/ms |
| --- | --- | ---: | ---: | ---: | ---: |
| `warrior/sword+empty` | HEAD `4dfc12f`, 2-field key | 25 | 1,075 | 1.3031 (1.2984-1.3728) | 825 |
| `warrior/sword+empty` | C2c, today's cell count | 25 | 1,075 | 1.3244 (1.3122-1.3477) | 812 |
| `warrior/sword+empty` | **C2c, widened** | 80 | 3,440 | **4.2759 (4.2706-4.3140)** | 805 |
| `warrior/sword+empty` | with the stance | 480 | 20,640 | 26.3525 (26.0250-26.5505) | 783 |
| `warrior/sword+shield` | HEAD | 20 | 860 | 1.0600 (1.0571-1.1093) | 811 |
| `warrior/sword+shield` | **C2c, widened** | 70 | 3,010 | **3.8484 (3.7999-3.8970)** | 782 |
| `warrior/sword+shield` | with the stance | 420 | 18,060 | 22.9788 (22.8454-23.1956) | 786 |
| `warrior/bow+empty` | HEAD | 15 | 645 | 0.7856 (0.7799-0.7924) | 821 |
| `warrior/bow+empty` | **C2c, widened** | 35 | 1,505 | **1.8568 (1.8534-1.8694)** | 811 |
| `warrior/bow+empty` | with the stance | 210 | 9,030 | 11.6562 (11.4415-11.9775) | 775 |
| `centipede/natural:bite` | HEAD | 10 | 430 | 0.5199 (0.5180-0.5371) | 827 |
| `centipede/natural:bite` | **C2c, widened** | 15 | 645 | **0.7911 (0.7870-0.8143)** | 815 |
| `centipede/natural:bite` | with the stance | 90 | 3,870 | 4.9155 (4.8725-5.0597) | 787 |

**The longer key costs nothing measurable, and "nothing measurable" is the honest half of that
sentence rather than a hedge.** 1.3244 ms against HEAD's 1.3031 at the same cell count is +1.6 %
and the round-ranges overlap -- but **+1.6 % is below this host's run-to-run noise floor**, so
the comparison cannot say more than "not visibly worse". Measured 2026-08-25 with
`.review/rem/drift.mjs`, five separate invocations of one identical 25-cell variant: medians
1.3813, 1.3817, 1.3993, 1.4056 and 1.4693 ms, a **6.4 % spread** with nothing changed between
runs. A cross-process comparison of two builds is at that noise floor by construction, which is
why the ratio that matters -- 4.2759 against 1.3244, both from one bracketed run in one process
-- is the figure session 20 should use and the HEAD column is not.

**Throughput is roughly 750-825 expanded nodes per millisecond, and the earlier "flat 780-825"
was tighter than its own table.** Two of the thirteen rows above fall outside it -- 775 for
`bow+empty` with the stance and 827 for the centipede at HEAD -- and two independent re-runs
landed lower still: 766-789 during review and **732-778** in the drift sweep above, on a host
whose absolute times had drifted up about 5 % that day. So keep `43 x cells / 800` as the rule of
thumb for session 20's ceilings and drop the tightness: it is good to within about ten per cent,
on this host, in this bench, and the constant moves with machine load.

**How often a replan happens**, harness `.review/c2c/replan-rate.mjs`: a full 45-second research
bout with `lookaheadMind` driving `warrior/sword+empty` -- 10,803 solver steps, **151 replans**,
which is **3.36 a simulated second** and one every **71.5 solver steps**. `bow+empty` returns the
same 151. The rate is a property of when skills finish and when capability moves, not of what the
model predicts, which is why a synthetic model answers it as well as a trained one would.

**So: affordable at 3.23x, and not at 19x.**

- *In the headless bench.* That bout costs **2.99 s** of wall clock for 45 s simulated -- 15.1x
  real time with the planner in it. 151 replans at 4.2759 ms is **646 ms, 21.6 % of the bout**.
  At HEAD's 1.3031 ms it was 197 ms, 6.6 % -- the table's own figure, where this said 1.32 ms,
  199 ms and 6.7 % from a rounded reading of it. With the stance it would be **3,979 ms**, more than the
  entire bout costs today: the planner would cost more than the physics.
- *At a keyboard.* Control runs on the physics clock, so a replan lands inside one rendered
  frame. 3.36 replans a second at 4.2759 ms is **14.4 ms of planning per second per planning
  fighter**, and a single replan is a quarter of a 16.7 ms frame -- two fighters replanning on the
  same substep is 8.6 ms and still fits. With the stance a single replan is **26.35 ms, which
  exceeds a whole frame on its own**, 3.36 times a second per fighter. That is a dropped frame per
  replan, and it is the sharper half of the answer.

**Both figures are bench figures.** The two harnesses in this directory disagree by about 9 % on
transients, nothing here was measured in a browser, and a person watching a bout driven by a
deployed look-ahead is owed that reading.

### 3. How many cells survive calibration at a fixed budget

**Superseded by "Session 19", sections 3 to 5**, which found that two of these three limits could
not fire at all and the third refused cells whose *outcome* was uncertain rather than cells whose
*model* was bad. This sub-section's diagnosis of *why* survival goes down as the budget goes up is
correct and was confirmed by execution; its limits, its statistics and the survival percentages
below are all superseded. The paragraph beginning "Every single refusal at every budget is
`contactBrier`" is the finding, correctly observed and wrongly read as evidence that the other two
were set loosely -- they were set on quantities that could not move.

Harness `.review/c2c/calibration.mjs`: the real `trainLookahead` end to end, then
`calibrationRefusal` -- the same function `calibratedPlannedTactics` filters with -- against the
real `LOOKAHEAD_CALIBRATION_LIMITS` of 0.25 / 0.25 / 0.25. Seed 310013 throughout.

| solver steps | steps/job | train rows/key | survived | refused | worst Brier | wall clock |
| ---: | ---: | ---: | --- | ---: | ---: | ---: |
| 148,800 (the minimum) | 48 | 1.00 | **775/775 = 100.0 %** | 0 | 0.0000 | 91.0 s |
| 297,600 | 96 | 3.00 | 772/775 = 99.6 % | 3 | 0.3333 | 117.6 s |
| 595,200 | 192 | 6.00 | 764/775 = 98.6 % | 11 | 0.3333 | 164.6 s |
| 1,190,400 | 384 | 14.99 | **659/775 = 85.0 %** | 116 | 0.4089 | 275.0 s |
| 1,488,000 | 480 | -- | the run dies; see below | | | |

At 85 % the loss is not uniform: `warrior/axe+empty` keeps 49 of 65 and `warrior/sword+empty` 74
of 80, while the centipede keeps all 15.

**Every single refusal at every budget is `contactBrier`.** Across all four runs the worst
`signedReachError` seen was 0.0618 and the worst `vitalityDeltaError` 0.1037, against limits of
0.25 -- neither has ever refused a cell. If session 20 wants to tighten a limit, the Brier is the
only one doing any work and the other two are set about four times looser than anything observed.

**Survival goes *down* as the budget goes *up*, and the 100 % is a defect in the evidence rather
than a good result.** Two things produce it and both were true before this stage:

- **A one-row cell fits itself exactly, in all three columns.** `signedReachError` and
  `vitalityDeltaError` are residuals about a mean taken over the same single row; `contactBrier`
  is zero because a trace row always publishes `before.contactProbability = 0`, so
  `delta.contactProbability` *is* the realised contact and the clamp reproduces it exactly.
  `.review/c2c/valprobe.mjs` shows all three at 0 for one train row, and all three non-zero the
  moment a second, differing row is used as validation.
- **At 48 steps a job the train and validation bouts are bit-identical.** The split seeds really
  do differ -- `actorSeed` 64139 against 158984 -- but 48 solver steps is 0.2 s, and 0.2 s is not
  long enough for two fighters starting from the same pose to diverge. `calibrateTacticalModel`
  therefore replaces the in-sample zeros with the same zeros. `.review/c2c/valprobe2.mjs` prints
  the two rows side by side; they match to the last digit.

**The shipped artifact shows the same, confirmed rather than assumed.**
`asset-src/learning/research/session18-minimum/report.json` reports
`contactBrier: 0, signedReachError: 0, vitalityDeltaError: 0` for **all 220** of its keys. So
`LOOKAHEAD_CALIBRATION_LIMITS` has never refused anything in a shipped run, and "100 % of cells
survive calibration" has never meant what it reads as. That artifact never reaches a runtime
anyway -- `decodeResearchArtifact` throws `research artifact feature version 3 does not match
runtime 4` -- and it carries the pre-C1 220-cell table. Both checked rather than assumed.

**What actually degrades with fewer rows**, which is the quality question survival cannot answer.
Harness `.review/c2c/stance-folds.mjs`, warrior tuples, a delta fitted on the first `n` rows of
the pooled fit set and scored on held-out rows -- 126 folds at every row count of 250 and below.
(The 1,000 and 2,000-row points are excluded: only the longest bouts reach them, so they are 66
and 18 folds and a different sample.)

| rows per cell | reach | Brier | vitality |
| ---: | ---: | ---: | ---: |
| 250 | 0.0111 | 0.1395 | 0.0261 |
| 120 | 0.0129 | 0.1407 | 0.0266 |
| 60 | 0.0207 | 0.1605 | 0.0283 |
| 30 | 0.0266 | 0.1833 | 0.0261 |
| 15 | 0.0703 | 0.1715 | 0.0280 |
| 8 | 0.1872 | 0.2427 | 0.0257 |
| 4 | **0.3236** | **0.5326** | 0.0181 |

**The cliff is between 8 and 15 rows.** At 8 the Brier is 0.2427 against a 0.25 limit, inside by a
hair; at 4 both it and the reach error are past it. Above about 60 rows the curve is flat. So the
budget worth asking for is the one that puts **at least 60 rows in each of the 775 cells**, and a
row is one 0.10-second window: 60 rows is 1,440 solver steps a cell a split, which over 3,100
groups is **4,464,000 solver steps** -- 30x the minimum, and at the rate the 1,190,400-step run
ran (275 s) about **17 minutes** in one process.

**The trainer cannot currently spend that much on any one job.** At 480 steps a job the run dies
with `lookahead schedule chose unsupported warrior/axe+empty tactic hold+punch+secondary+high`:
the fighter loses its empty hand inside the window and the forced tuple leaves the runtime mask.

**This said "the widening did not cause this -- HEAD's action-level guard throws at the same
budget on the same job", and measurement says otherwise.** Corrected 2026-08-25, swept rather
than reasoned. Harnesses `.review/rem/sweep480.mjs` (every task in the schedule) and
`.review/head480b.mjs` (the HEAD-equivalent replay: action-level guard, `as-measured` aim, every
movement):

| at 480 steps a job | seed 310013 | the other two fit seeds |
| --- | --- | --- |
| C2c schedule, all **775** tasks | **1 dies** -- `warrior/axe+empty hold+punch+secondary+high` | 0 of 775, both |
| HEAD-equivalent, action guard, as-measured aim | 0 of 5 movements | 0 of 5, both |

**The dying cell is `+high`, and `+high` is an aim the widening added.** HEAD's look-ahead trace
was collected through `asMeasured(chooseEffector(view, action))` -- the opponent's own shoulder
line -- because a model keyed on `(movement, action)` had no aim head to honour; C2c enumerates
`tacticTargets("punch")`, which is `vital` and `high`. The corresponding HEAD cell at the measured
shoulder line survives 480 steps on all three fit seeds. So the widening did introduce one trainer
failure mode, on one cell of 775, at a budget nothing has yet run at.

**The half that is true is that the guard is not more *sensitive*.** On `axe+empty` the only empty
hand is the secondary, so `punch` leaves `deployableActions` and every `punch|...` leaves
`deployableTactics` in the same instant -- verified exhaustively in `.review/c2c/severance.mjs`.
The tuple-level guard fires at exactly the moment the action-level one would have; what differs is
that C2c has a cell there to fire *on*.

**So a long budget has to be spent as many short jobs rather than as few long ones**, which
survives unchanged and is the practical half. The trainer already supports it:
`collectTacticalBudget` loops `collectTacticalTrace` until the budget is consumed, so what is
needed is a per-job cap and not a new mechanism.

### What the widening costs a damaged body, exactly

Harness `.review/c2c/severance.mjs`: one published body per loadout, then every combination of
lost hands stated on it. Exhaustive rather than sampled, because a bout only reaches some of
these states and the question is what happens when it does. 28 states, in
intact / minus-secondary / minus-primary / minus-both order.

| loadout | HEAD actions kept | C2c tuples kept | C2c cells searchable |
| --- | --- | --- | --- |
| `sword+empty` | 5/5, 4/4, 3/3, 0/0 | 16/16, 10/10, 6/6, 0/0 | 80, 50, 30, 0 |
| `sword+shield` | 4/4, 4/4, 2/2, 0/0 | 14/14, 10/10, 4/4, 0/0 | 70, 50, 20, 0 |
| `sword+buckler` | 4/4, 4/4, 2/2, 0/0 | 14/14, 10/10, 4/4, 0/0 | 70, 50, 20, 0 |
| `axe+empty` | 4/4, 3/3, 3/3, 0/0 | 13/13, 7/7, 6/6, 0/0 | 65, 35, 30, 0 |
| `bow+empty` | 3/3, 3/3, **2/3**, 0/0 | 7/7, 7/7, **0/6**, 0/0 | 35, 35, **0**, 0 |
| `empty+empty` | 3/3, 3/3, 3/3, 0/0 | 12/12, 6/6, 6/6, 0/0 | 60, 30, 30, 0 |
| `natural:bite` | 2/2 in all four | 3/3 in all four | 15 in all four |

**Twenty-six of the twenty-eight states lose nothing**: every tuple a damaged body can still
perform is one the schedule trained. The exception is a `bow+empty` that loses its **bow** hand,
and it is the one place the widening is strictly less capable than HEAD. A bow welds the other
hand to the stave, so every cell trained for that loadout names the primary; cut the bow hand off
and the free hand is the *secondary*, which no budget was ever spent on, and
`calibratedPlannedTactics` filters all six of the mask's tuples out. `lookaheadMind` then refuses
by name.

**HEAD kept 2 of 3 actions there by planning them on a hand the model had never seen.** Its key
carried no effector, so `close+recover` matched a cell fitted entirely on the bow hand, and
`chooseEffector` then quietly executed it on the other arm. That is the silent redirection tactic
v2 exists to remove, and C2c converts it into a refusal at a cost of one body state in
twenty-eight. Severance is routine -- the null control reports 10 in 120 bouts -- so **session 20
must expect `lookahead refuses warrior/bow+empty: no calibrated model for any tactic on [cover,
punch, recover]` to appear in a tournament** and decide whether that entry forfeits, goes inert,
or earns a second schedule row for the damaged state.
`a_severed_hand_moves_the_mask_and_the_lookahead_plans_over_what_it_can_predict` asserts all
three of the outcomes as one record.

**The tally above is the cost half, and it was the only half written down.** HEAD's silent
redirection was much wider than the bow, and on almost all of it C2c both refuses the redirection
*and* keeps the capability. Harness `.review/rem/severboth.mjs`, minus-primary state, per humanoid
loadout:

| loadout | HEAD: trained on -> executed on | C2c on the same state |
| --- | --- | --- |
| `sword+empty` | `cover`, `recover`: primary -> secondary | keeps `cover`, `punch`, `recover` |
| `sword+shield` | `cover`, `recover`: primary -> secondary | keeps `cover`, `recover` |
| `sword+buckler` | `cover`, `recover`: primary -> secondary | keeps `cover`, `recover` |
| `axe+empty` | `cover`, `recover`: primary -> secondary | keeps `cover`, `punch`, `recover` |
| `bow+empty` | `cover`, `recover`: primary -> secondary | **nothing left to search** |
| `empty+empty` | `cover`, `punch`, `recover`: primary -> secondary | keeps `cover`, `punch`, `recover` |

**Six of six humanoid loadouts, not one.** Every one of them, having lost the primary, was running
a model fitted on the primary hand against the secondary arm -- and `HandView.outboard` mirrors the
stroke geometry and the wrist roll for the other side, so this is not a small difference of degree.
C2c refuses the redirection on all six and **keeps a searchable capability on five**, because the
schedule spends real budget on the secondary tuples of every loadout except the bow's, whose stave
welds the trailing hand out of the strikers list. So the ledger is: one state of twenty-eight loses
its search, and five of six loadouts stop executing a guard with an arm the model has never seen.

(Review put this at five of six redirecting and four kept. Measured here it is **six and five** --
`empty+empty` redirects `punch` as well as the two guards, and is the sixth.)

### 4. The exact node budget is still enforced, and now pinned on both sides of the saturation

`boundedLookahead` still throws when `expandedNodes !== exactLookaheadNodeBudget(...)`, and the
budget is still computed rather than approximated. What was untested is that the formula is *not*
simply `43P`: the beam saturates on the first level only for `P >= width`, and below that the
budget is smaller. `lookahead_respects_the_exact_depth_width_and_node_budget` now pins

`[1, 2, 3, 5, 6, 7, 16, 80] -> [8, 74, 120, 210, 258, 301, 688, 3440]`

which is the only spelling that separates the real formula from `43P` -- a test checking only
counts at or above six passes for both. Two mutations were watched: dropping the first level's
expansion (`3440 -> 3120`) and removing the saturation cap (`3440 -> 323623638092040`). Both take
nine tests red rather than one, because every beam test runs through the assertion.

### The two constants nothing has learned, and where they now live

`UNLEARNED_PERSISTENCE` moved from `src/learning/deployment.ts` to `src/learning/meta.ts` and
`UNLEARNED_STANCE` joined it. The move was forced rather than chosen: `deployment.ts` imports
`lookaheadMind`, so importing back would have been a cycle -- and that cycle is why the literal
`0.4` came to be spelled in both files in the first place. `meta.ts` sits below both and already
owns `MIN_PERSISTENCE` and `MAX_PERSISTENCE`, which is the window this number has to sit inside.
`scripts/train-ppo.mjs` was re-pointed with it.

`DeployedDecisionLabel` went from three fields to `DaggerLabel`'s six, which is the promise its
own note made: it was narrowed for exactly one stage because look-ahead supplied three fields and
function parameters are contravariant. Look-ahead decides four of the six now and names the other
two by constant. **The alias itself was deleted in the remediation pass below** -- at six fields
it was `DaggerLabel` spelled twice with no importer, so nothing could fail the check it existed
to make. `src/learning/ppo.ts`'s note about where `UNLEARNED_PERSISTENCE` lives went stale in the
same move and was corrected there.

`TACTICAL_MODEL_VERSION` went 1 to 2. The cell key grammar is part of the model contract, and a
model fitted under `movement+action` decodes cleanly against `movement+action+effector+target`
and then matches nothing -- which would surface as `no calibrated model for any tactic`, reading
exactly like an under-spent budget rather than like the wrong artifact.

### The mutation table

Harness `.review/c2c/mutate.mjs`: patch one line, run `tests/lookahead.test.mjs` and
`tests/tournament-executor.test.mjs`, restore, report. It reads and writes bytes, so no file's
line endings move. **Eighteen mutations, all eighteen red.**

| # | mutation | tests red | what it said |
| --- | --- | ---: | --- |
| M1 | the cell key drops the effector | 9 | `'close+cover+vital'` |
| M2 | the cell key swaps the effector and the aim | 8 | `'close+cover+vital+secondary'` |
| M3 | the cross product loops tuples outermost | 1 | deep-equal diff on the second element's `action` |
| M4 | the schedule keeps only the first aim per action | 6 | missing `recover-natural-vital` from the centipede's tuples |
| M5 | a missing loadout row falls through to the sword's | 1 | `Missing expected exception` |
| M6 | the row lookup uses `in` rather than `Object.hasOwn` | 1 | `Missing expected exception`, the `toString` case |
| M7 | the axe punches with the axe hand | 1 | whole-mask deep-equal diff, both humanoid units |
| M8 | the node budget forgets the first level | 9 | `nodesPerReplan: 3120` |
| M9 | the beam never saturates | 9 | `nodesPerReplan: 323623638092040` |
| M10 | the seam prefers the primary hand over the one it planned | 1 | `actingHand: 'primary'` |
| M11 | the seam keeps the measured aim | 1 | `pointerY: 0` against the aimed pose |
| M12b | the capability signature is the action set again | 1 | the second `'close+cut+primary+vital'` never arrives |
| M13 | `UNLEARNED_STANCE` becomes a real pose | 1 -> **2** | `'compact'` |
| M14 | `TACTICAL_MODEL_VERSION` stays at 1 | 1 | strict-equality diff |
| M15 | the calibration filter filters nothing | 2 | `tactic "close+cover+secondary+threat" has no fitted model` |
| M16 | a body that can do nothing refuses instead of going inert | 1 | `planned: 'inert'` |
| M17 | the trace keys a row on the action alone | 2 | strict-equality diff on the row's `tactic` |
| M18 | the schedule's shield hand may cut | 2 | whole-mask deep-equal diff |
| M19 | the artifact fixture pins the model version by hand | 1 -> **2** | `Got unwanted exception` |

The two arrows are the remediation pass of 2026-08-25 re-running this whole battery unchanged:
every one of the nineteen is still red, and two are caught by one more test each --
`the_trace_and_the_runtime_hold_one_stance_and_one_persistence_by_name` on M13 and
`a_lookahead_model_from_another_key_grammar_is_refused_by_model_version` on M19. M12 still reports
GREEN and is still not a miss, for the reason below. Output in `.review/rem/mutations-after.txt`.

**M12 is not in the table, and that is worth recording.** The first attempt at the
capability-signature mutation added an unused variable and left the signature intact, so the
harness reported GREEN -- correctly, because nothing had been mutated. **A mutation battery
reports "the test did not notice" and "there was nothing to notice" the same way**, and the only
defence is reading the patch. M12b is the real one.

**What each test does not catch**, because a mutation table with no misses is a table nobody
looked at hard enough:

| test | a mutation it does **not** catch |
| --- | --- |
| `the_tactical_model_uses_only_published_versioned_features` | any change to the *cell* key grammar; it reads `model.tactics`, the loadout-free map |
| `one_key_grammar_is_spelled_once...` | a third file spelling the grammar out by hand -- it scans two files by name, not the tree |
| `lookahead_expands_every_legal_tuple_in_fixed_order` | an illegal tuple in its input; the function no longer filters and this asserts that it does not |
| `the_training_schedule_covers_every_body_loadout...` | a wrong effector on a humanoid row; only the centipede's tuples are named here |
| `the_widened_schedule_costs...` | a change to `LOOKAHEAD_DEPTH` or `LOOKAHEAD_WIDTH` that leaves `43P` intact for every loadout |
| `the_training_schedule_offers_exactly_what_the_runtime_mask_offers` | anything about a body with a hand missing -- 48 steps on intact bodies, by construction |
| `a_severed_hand_moves_the_mask...` | a wrong tie-break among equally scored tuples; the fixture makes `punch` strictly best |
| `the_plan_executes_the_effector_and_the_aim_it_searched` | the trace collector naming a different stance from the runtime's; both read one constant and so does this test |
| `a_lost_effector_is_a_capability_change...` | a capability change that *adds* tuples rather than removing them |
| `every_scheduled_centipede_tactic_runs_a_complete_havok_trace_window` | a wrong `bodyLoadout` on a humanoid cell |
| `lookahead_respects_the_exact_depth_width_and_node_budget` | a wrong *score*, which decides which cell wins rather than how many are expanded |
| `the_trace_and_the_runtime_hold_one_stance_and_one_persistence_by_name` | a *third* file holding its own stance -- it reads two files by name, and `research-policy.ts` is where a labeler's stance actually reaches the executor |
| `an_attack_opportunity_names_its_effector...` | a wrong `viable` rule; it fixes the geometry so both fists are in range and never asks what puts them there |
| `a_bout_credits_a_window_to_the_hand_the_decision_named` | an attribution that is wrong for *both* trackers in the same way -- it compares two rules, so a defect in `EngagementTracker` itself cancels |
| `a_lookahead_model_from_another_key_grammar_is_refused_by_model_version` | `TACTICAL_MODEL_VERSION` moving; both sides of every comparison are relative to it, which is why `the_tactical_model_uses_only_published_versioned_features` pins the literal 2 |

**One gap was named as a real gap, and it was overstated in one direction and closed in the
other.** Corrected and closed 2026-08-25.

The gap: `scripts/train-lookahead.mjs` and `src/learning/lookahead.ts` naming *different* stances
or persistences. A trace collected at one stance and executed at another is a model calibrated for
a body that never fights. This section said **nothing** would catch it. Measured over the whole
suite, one mutation at a time (`.review/rem/e3.mjs`):

| mutation | before 2026-08-25 | now |
| --- | --- | --- |
| the trainer collects at `stance: "compact"` | 530 pass, nothing noticed | 1 red |
| the trainer collects at `persistence: 0.8` | 530 pass, nothing noticed | 1 red |
| the runtime executes at `stance: "compact"` | 1 red, `the_plan_executes_the_effector_and_the_aim_it_searched` | 2 red |

So the *trainer* half was invisible and the *runtime* half was already caught -- half a gap, stated
as a whole one.

"The obvious test is not available" was also too strong. The behavioural one is genuinely
unavailable: `researchLabelMind` re-decides on a persistence timer and `lookaheadMind` on skill
boundaries, so the two seams produce different bouts by design even when they agree about the
tuple. But the same **source-text pin** the key grammar already gets two tests earlier in the same
file closes it in three lines, and now does:
`the_trace_and_the_runtime_hold_one_stance_and_one_persistence_by_name` reads both files and
asserts that every `stance:` and every `persistence:` in either names the constant. The constants'
literal values stay pinned in `the_widened_schedule_costs...`, because a pin that compares two
files through one symbol cannot see the symbol move.

### What did not move

- The five `TACTICAL_STATE_COLUMNS`, the beam's scoring function, `LOOKAHEAD_DEPTH` 8,
  `LOOKAHEAD_WIDTH` 6, and `LOOKAHEAD_CALIBRATION_LIMITS` at 0.25 / 0.25 / 0.25. (The limits
  moved in session 19, twice: first to `reachError` 0.30 / `contactRateError` 0.25 /
  `vitalityDeltaError` 0.10 with two of the three columns replaced by statistics that can report
  an error, then to a **four**-number record -- `reachError` 0.20 for the four movements a
  constant delta can describe, `approachReachError` 0.35 for `close`, which it cannot -- because
  no single scalar on the reach column is a threshold on error. Session 19 section 3.)
- `deployableTactics`, `tacticEffectors` and `tacticTargets`. The widening *consumes* the legality
  rule rather than restating it, which is why the schedule table grew an effector column and not
  an aim column: an aim is a property of the action alone (`AIMED_TARGETS` reads no body), while an
  effector genuinely depends on the loadout, because a two-hander welds one hand to its haft and an
  empty hand cannot hold a point.
- The four research trainers other than look-ahead. `scripts/train-ppo.mjs` changed one import line
  and nothing else.
- The dead `Color3` import in `tests/materials.test.mjs`, which stage C2b recorded and left alone.
  The other one it recorded, `SeededRng` in `tests/tournament-executor.test.mjs`, went with this
  stage's edit to that file. `.review/c2c/imports.mjs` re-swept all eight touched files: clean.

### The remediation pass -- 2026-08-25

An adversarial review of stage C2c reproduced the schedule arithmetic, the eight node-budget
pairs, the 28-state severance table, the calibration degeneracy and the whole mutation table
exactly. What it found was **one defect in behaviour**, one framing that measurement falsifies,
one finding missing from the one place session 20 will look, a table of sums labelled as bouts,
three evidence gaps, ten record defects and three cleanups. This pass found two more of its own,
both stale source comments in files no stage had touched. The behaviour one is the only one that
had corrupted data, and it is first.

#### The research harness attributed every attack to the wrong hand

`scripts/research-havok.mjs` is the decision hook every `deployedResearchMind` caller supplies. It
read `label.action` and nothing else, and attributed the attack with
`opportunitiesForAction(view, label.action)[0]` -- a filter on the **weapon**, never on the hand,
whose one caller took the first row.

**Measured on `warrior/empty+empty` over a real 2,400-step bout** (`.review/rem/repro2.mjs`): of
2,399 samples, 98 had a punch in range, **both fists were in range in all 98**, and the first row
was `hand:primary:empty` in **98 of 98**. So a `punch|secondary` decision opened its window on the
*primary* fist. The contact then arrived keyed `opportunityKeyForContact("secondary", "empty")` =
`hand:secondary:empty`, whose `attackedAt` was still null, and `EngagementTracker.contact` returned
early: **the damaging contact was silently dropped, and a contact from a fist that had not attacked
was credited instead.** At 0.10 s persistence on that bout the harness reported
`damagingContactsInWindow: 2` where the named hand landed **1**.

Those counts feed NEAT-QD's feasibility gate (`fitnessComponents`), DAgger's engagement floor and
the frozen tournament row. This is training data, not a report.

**It was written down, twice, and read as a design difference.** Finding 12 of the overview and
the same paragraph in plan 18 both said "`research-havok.mjs` credits only `[0]`, the first
matching row, where `options.ts` credits every match, which systematically depresses dual-wield
opportunity conversion" -- an accurate description of the mechanism, filed under *how the two
attack paths differ* rather than under *one of them is wrong*. Nobody asked which row `[0]` is.
Both places are corrected.

**The mechanism predates C2c and this diff is what made it reachable.** `DaggerLabel` has carried
`effector` since stage C2b, but HEAD's `lookaheadMind` executed `chooseEffector(view, action)`,
which answers `primary` for `punch` on `empty+empty` -- the same hand `[0]` names -- so no producer
could exhibit it there. C2c's beam names the hand and `scripts/train-lookahead.mjs` schedules
`"empty+empty": { punch: ["primary", "secondary"] }`, which makes `punch+secondary+*` a calibrated
cell the beam can win with.

The fix reads the field the label already carries. `AttackOpportunity` grew an `effector` -- the
same fact the key has always spelled, which one caller was parsing back out of the string and a
second ignored -- and `opportunitiesForAction` became `opportunityForAction(view, action, effector)`,
answering **one row or null** rather than a list, because with the effector named there is at most
one and a caller taking `[0]` of a list is the shape this defect had. `tactical-teacher.ts`'s
`rowEffector`, which split the key on `":"`, reads the field now.

Two tests, neither of which existed: `an_attack_opportunity_names_its_effector_and_a_decision_is_attributed_to_that_hand`
(a two-fisted body, both fists in range, each hand answering itself, and the three ways to have no
opportunity), and `a_bout_credits_a_window_to_the_hand_the_decision_named` -- a **real 2,400-step
Havok bout** on `empty+empty` whose engagement record is asserted whole against one built beside it
from a rule written the other way round. It also asserts the fixture can exhibit the defect: both
fists viable together in every viable sample, and both fists landing damaging contacts.

| mutation | red | what it said |
| --- | --- | --- |
| the picker stops filtering on the effector | 2 | `effector: 'primary'` against `'secondary'` |
| every hand row claims the primary | 1 | whole-row deep-equal diff |
| a natural row is keyed by its own name | 1 | `'bite'` against `'natural'` |
| the harness names the primary rather than the label's hand | 1 | `damagingContactsInWindow: 2` against `1` |

#### Everything else this pass changed

- **`lookaheadMind` passes `[]` where the other three algorithms pass a real `FeatureWriter`
  vector**, and neither the signature nor its docstring said so. Not currently reachable -- the one
  row-writing hook is on the DAgger path -- but the widening made the *label* uniform across all
  four algorithms while the features silently are not. Stated in the signature's own note rather
  than repaired, because giving that seam a `FeatureWriter` is untested plumbing for a reader that
  does not exist yet.
- **`DeployedDecisionLabel` is gone.** Once look-ahead widened it was `DaggerLabel` spelled twice
  with zero importers, so the assignment it guarded could not fail and its contravariance argument
  was vacuous -- a name with no reader. The argument moved onto `deployedResearchMind`, where it is
  about a signature somebody reads. The `.mjs` readers of `label.effector` it names were counted
  rather than remembered: **nine occurrences on eight lines in four files**
  (`grep -ro "label\.effector" --include=*.mjs`). That count had been written down wrong twice.
- **`tacticalStateFromPublishedView` is gone too**, and the trainer imports `tacticalStateFromView`
  from `src/learning/lookahead.ts`. They were verbatim copies of one rule -- agreeing on **1,449**
  real published states, `.review/stateeq.mjs` -- kept apart only because the trainer did not
  import from that module, and stage C2c removed that obstacle by importing `plannedTacticKey` from
  exactly there.
- **Two stale source comments, neither file in the C2c diff.** `src/learning/ppo.ts` said
  `UNLEARNED_PERSISTENCE` lives in `deployment.ts` and that `lookahead.ts` and
  `train-lookahead.mjs` "still spell `0.4` out"; all three claims were false the moment C2c landed.
  `src/learning/research-policy.ts` said `TacticAim` is widened for look-ahead's sake and that
  `collectTacticalTrace` names `"as-measured"` explicitly; C2c took `"as-measured"` off that path
  entirely. The type is still right -- `probeLabel`, `randomMetaMind` and `scriptedMetaMind` are
  its readers -- and the reason written beside it was not.
- **`boundedLookahead`'s tie-break has a stated ceiling now.** `order` is a base-`cells` numeral one
  digit per level, exact only while `cells^depth <= Number.MAX_SAFE_INTEGER`, which at depth 8 is
  **cells <= 98**: 98^8 is 8.51e15 and 99^8 is 9.23e15 against a limit of 9.01e15. Shipped counts
  top out at 80, so this is not a defect -- but the record hands session 20 a **480**-cell
  stance-keyed column as a live option, and there the tie-break silently stops being total.
- **`every_producer_of_a_research_label_writes_the_same_six_fields` said four producers and there
  are five.** Look-ahead became one the moment it named an effector and an aim, and it now runs
  through `deployedResearchMind` in that test beside the other three. Its payload is a model whose
  every cell carries one identical-before-and-after row, which calibrates to 0/0/0 and so deploys
  without a Havok trace. Watched red under a look-ahead label that drops the stance:
  `- 'stance'` in the sorted key list. **What it does not catch:** a *wrong* field value from any
  producer -- it checks membership in the frozen tables, so a look-ahead that named the wrong legal
  effector passes here and is caught by `the_plan_executes_the_effector_and_the_aim_it_searched`.
- **The `TACTICAL_MODEL_VERSION` refusal had no test.** It is the third version gate and the only
  one in the *payload* rather than the envelope, and this diff replaced the one literal that would
  have gone red on a bump. `a_lookahead_model_from_another_key_grammar_is_refused_by_model_version`
  exercises it in both directions; a gate written `<` rather than `!==` passes a model from a
  *newer* grammar and is now caught.

#### What the review got wrong

Checked rather than assumed, because a review is evidence about the code and not about itself.
Three of its claims did not survive re-measurement.

- **The severance breadth.** Review put HEAD's silent redirection at "five of six humanoid loadouts,
  and on four of those five C2c keeps the capability". Measured (`.review/rem/severboth.mjs`) it is
  **six and five**: `empty+empty` redirects `punch` as well as the two guards. The table above
  carries the enumeration.
- **The six-seed stance figures.** Review reported totals 665 / 1108 / 1197 / 569 / 688 / 253 with
  `compact` ahead of `upright`, and `action-default` ranging 3.2 to 238.7. Re-run here on a stated
  seed list the totals are 1106 / 1397 / 1124 / 650 / 872 / 301 with `upright` ahead, and
  `action-default` ranges 41.9 to 313.3. **Both conclusions survive and neither seed set is
  reproducible from the other**, which is the finding: the ranking below "`slip-right` is worst" is
  noise, and quoting either set as *the* numbers would repeat the mistake this section is about.
- **The wall-clock noise floor.** Review measured +2.9 % run-to-run drift on an identical variant.
  Re-measured here across five separate invocations it is **6.4 %**. The direction of the conclusion
  is unchanged and stronger.

The 480-steps-a-job sweep, the "98 of 98" attribution figure, the E3 mutation results, the eight
node-budget pairs and the whole nineteen-row mutation table reproduced exactly.

#### What the pass cost the null control: nothing

`npm run measure -- --only duelist-swinger --bouts 120 --seed 20260823`, re-run after every edit:
duelist **66/120 = 55.0 %**, bout length **3.52 s (1.42-8.98)**, damage **176.17**, **10** severs,
**1496** and **1670** scoring contacts. Identical to C1, C2a, C2b and C2c to the digit, for the
seventh stage running -- which it must be: the scripted policies never enter the option layer, and
the only behaviour this pass changed is which opportunity key a *research* harness writes.

The gate: `npx tsc --noEmit` clean, `npm test` **532 passed** (528 at C2c plus four -- the
opportunity picker, the real-bout engagement record, the stance/persistence source pin and the
model-version refusal), `npm run build` clean, and `git diff --numstat` byte-identical to
`git diff --ignore-cr-at-eol --numstat` across the whole directory, so no file's line endings
moved. `scripts/` is not type-checked and was swept by hand: `node --check` on every script, and
a grep for the two renamed exports across `scripts/` and `tests/`.

## Session 18: the execution layer honours a named region and a named hand -- 2026-08-25

Two defects, the same shape: the tactic v2 vocabulary offers a choice and the motor layer
collapses it. Session 17 made every tuple *legal*; this session makes two of them *matter*. Both
changes are balance-capable and both are measured before and after.

**Every figure below names its harness**, which this session means one of four:
`.review/aimdist.mjs` (per-action landing distribution, on the Stage B fixture),
`.review/arcfinal.mjs` (the same with per-seed standard errors and the "is it still a cut"
readings), `.review/coverblock.mjs` (a held guard against a real attacker) and
`.review/balance.mjs` (option-driven controllers against `swinger`). All four run over `runBout`
in `scripts/measure.mjs`, which is the headless bench and not the page.

### The noise floor, first, because two of the four tables are inside it

Session 17 learned that within-condition seed spread can exceed between-condition spread by 75x,
and this session found the same thing twice. Both floors were measured rather than assumed.

- **Landing distributions.** The Stage B fixture has *no* usable seed: both minds are
  deterministic and `idle` ignores `runBout`'s seeds, so eight seed pairs return eight copies of
  one bout. The nuisance knob added here is a seeded pause between strokes -- it changes when
  each stroke starts relative to where the body is standing, and changes no aim. Over 40 such
  bouts the **within-condition** head share of a `cut` aimed `high` ranges **0.036 to 0.372**
  bout to bout, against a between-condition move of 0.038. Pooled, the seed-level standard error
  is **+-0.013 to +-0.019** (`.review/arcfinal.mjs` reports it per cell). A single bout is worth
  nothing here, and Stage B took one.
- **Bout outcomes.** The same code at a second seed base moves a 40-bout win rate by a median of
  **5.0 percentage points** over the fifteen cells and a maximum of **22.5**, and damage dealt
  by a median of **8.8 %**, from 2.8 % to **45.5 %** (`.review/balance.mjs`, seed base 7000
  against 41000). Anything smaller than that in the balance table below is not a result.

  **This bullet read "a median of 7.5 percentage points" and "5 to 11 %" until the remediation
  pass re-derived both from the noise table, and neither was the statistic it named.** 7.5 pp is
  one cell's move (`scripted-meta` / `sword+empty`), not the median of anything: over all fifteen
  the median is 5.0 and over the nine cells that move at all it is 10.0. And "5 to 11 %" holds
  for five of the fifteen cells: **ten are outside it**, in both directions, the largest being
  `random-meta` / `axe+empty`, which moves dealt damage 112.66 to 163.89 --
  **45.5 %**. The maximum, 22.5 pp, was exact. The correction only widens the floor, so every
  "not separable" verdict below survives it, but a floor quoted narrow is a floor that will one
  day be cleared by noise.

### Defect 1: a named region did not point a stroke, and the recorded reason was half wrong

`enter` derived a stroke's arc as a flat `+-0.50` in cursor Y about whatever the aim resolved to,
which at the range a cut is delivered is about `+-0.85 m` -- more than twice the 364 mm between
two named regions on a warrior, and most of the height of a body. A stroke aimed at one region
raked the next as readily as its own.

**What Stage B got wrong about it, because it decides how this was fixed.** Stage B compared each
named region against `as-measured`, on one bout. On this fixture the measured entry aim is 1.62 m
and `high` is 1.644 -- **0.012 cursor units apart**, which is the same stroke run twice -- and one
`cut` bout is 22 to 50 scoring contacts of which zero to three land on a head. The reported `cut`
0.071 -> 0.045 and `punch` 0.200 -> 0.121 are single contacts moving in a chaotic bout, not a
rule. Asked the question a rule is about -- `high` against `low` -- a cut separated *before* the
change too, 0.128 against 0.044. The defect was real; the measurement of it was not.

**The repair, and the option that was swept and rejected.** The brief's strongest suggestion was
to bias the commit point -- the moment of likely contact -- toward the aim, leaving the sweep
intact. Measured, contact is not concentrated at any point of the stroke: over one bout, 31
scoring contacts split **chamber 10, commit 8, recover 13**, with the arc position at contact
spread evenly from 0.08 to 0.95 of the sweep (`.review/strokewhere.mjs`). There is no "moment of
likely contact" to bias toward, and the sweep says so -- at a full-width arc, moving the commit
point from the centre to near the aim raises a `high` cut's head share from 0.128 to 0.176 and
`low`'s from 0.044 to 0.072 *together*, so the ratio between them falls from 2.9 to 2.4. It lifts
the whole distribution rather than pointing it. What separates regions is narrowing.

`NAMED_STROKE_SPAN` is the constant, and it is a fraction of a region spacing rather than a
number of cursor units: **a stroke aimed at a named region sweeps half the distance to its
neighbours, above and below, and no further** -- so two strokes aimed at adjacent regions never
sweep through each other's aim point, which is what "separable" means. Both ends are resolved by
aiming at the neighbouring heights and reading the cursor back, because cursor elevation is not
linear in height; the extent therefore comes out asymmetric about the aim and adapts to the body
and the range. `"as-measured"` is not a named region and keeps its `+-0.50`.

Swept over 40 seeded bouts a cell (`.review/arcfinal.mjs`), `cut`, head share with its seed-level
standard error:

| lift / drop | `high` | `vital` | `low` | high:low | `high` leg share | dmg/bout | speed m/s | edge |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.50 / 0.50 (before) | 0.128 +-0.014 | 0.051 +-0.010 | 0.044 +-0.008 | 2.9 | 0.308 | 279.9 | 10.1 | 0.35 |
| half a spacing (**taken**) | 0.166 +-0.013 | 0.041 +-0.008 | 0.019 +-0.005 | 8.7 | 0.239 | 288.2 | 7.8 | 0.29 |
| a whole spacing | 0.123 +-0.016 | 0.050 +-0.010 | 0.016 +-0.003 | 7.7 | 0.274 | 299.0 | 8.5 | 0.32 |
| 0.25 / 0.25, flat | 0.163 +-0.018 | 0.055 +-0.011 | 0.020 +-0.005 | 8.2 | 0.270 | 299.7 | 8.8 | 0.35 |

The tuned flat constant and the derived rule are indistinguishable; the derived one is taken
because it needs no number, and works on a broot and at any range.

**What it costs, plainly: a cut is worse per second.** The blade travels less vertical distance
in the same 0.11 s commit, so it arrives at **7.8 m/s rather than 10.1** and lands more, slower
contacts. Damage *per bout* goes up (288.2 against 279.9) because the bout takes longer; damage
per second falls about a fifth, 47.4 to 37.9 for `high`, 47.2 to 36.2 for `vital`, 37.3 to 29.1
for `low`. Edge alignment falls from 0.35 to 0.29. That is the trade, and it is only paid by a
controller that names a region.

### 1a. Per-action, per-target landing distribution, before and after

`.review/aimdist.mjs`, 40 seeded stroke-pause bouts a cell against a bare-handed `idle` warrior,
`HitReport.key` on the contacted limb, blocks excluded, `head` / `torso` / `pelvis + thighs +
shins`. Head share then leg share.

**Bold means two different things in the two tables below and the difference is deliberate.** In
the `cut` table it means *separable from the seed spread*, per the Welch *t* beside it. In the
`punch` table it means only *differs*, and the paragraph under it says outright that none of it
is a result. Reading the second as though it were the first is exactly the mistake the `cut`
table used to invite.

**`cut`** -- the action the change is for. Six sub-figures move, **and two of the six are inside
the seed spread this section's own noise floor establishes**, so each carries the Welch *t* of
its per-seed shares over the 40 bouts (`.review/rem2/cutstats.mjs` over
`.review/rem2/cutseeds-{before,after}.json`). All six were bold until the remediation pass. The
`punch` block below said which of its numbers were not results and this one did not, which is
the asymmetry that repaired.

| target | before | after | head *t* | leg *t* |
| --- | --- | --- | ---: | ---: |
| `as-measured` | 0.130 / 0.348 | 0.130 / 0.348 | -- | -- |
| `vital` | 0.051 / 0.469 | 0.041 / **0.323** | -1.40 | -4.22 |
| `high` | 0.128 / 0.308 | **0.166** / **0.239** | +2.48 | -2.93 |
| `low` | 0.044 / 0.504 | **0.019** / 0.513 | -2.67 | +0.23 |

**The headline is the ratio, and it is the claim that survives the two failures.** `high` against
`low` on head share goes from a point estimate of **2.93x** to **8.90x**, and the bootstrapped
95 % intervals over the seeds do not overlap: **2.00-4.55 before against 5.21-19.34 after**
(20 000 resamples, seed `0x5eed18`, so the interval is reproducible rather than redrawn each
run). No single cell carries that on its own -- `high` head alone is 2.5 sigma -- which is why the
ratio and not a cell is what this section claims. A `high` cut's leg share falls from 31 % to
24 %. The `as-measured` row is identical to the contact -- 146 / 587 / 392 both ways -- which is
the scoping working.

**`punch`** -- moves, and **not by more than the noise**.

| target | before | after |
| --- | --- | --- |
| `as-measured` | 0.080 / 0.153 | 0.080 / 0.153 |
| `vital` | 0.015 / 0.248 | **0.010 / 0.191** |
| `high` | 0.080 / 0.164 | **0.076 / 0.151** |

`high` against `vital` goes from 5.3x to 7.6x on the strength of the denominator moving by five
head contacts in two thousand. **A second run of the same A/B, at 16 seeds and with a different
pause convention -- a blank movement partial between strokes rather than
`movementIntent("hold")`, so the fighter drifted off the line over a long bout -- reported the
opposite direction for `punch`** (`high` 0.059 -> 0.032, ratio 9.8 -> 4.6) while agreeing with
this one on the sign of `cut`. Two internally valid A/B pairs disagreeing on the sign is the
honest answer: **`cut`'s change is a result and `punch`'s is not.** Both are recorded rather than
the flattering one.

**That second run's `cut` figures used to be quoted in four places as "sixteen-seed figures from
`.review/aimdist.mjs`", and the harness of that name cannot produce them.** The pause convention
they were taken under is commented out in `driver`, with the reason. Run as it stands at 16 seeds
the same A/B gives `high` 0.101 / 0.334 -> 0.177 / 0.266 and `low` 0.043 / 0.511 ->
0.026 / 0.513; the quoted pairs were `high` 0.072 / 0.452 -> 0.133 / 0.226 and `low`
0.009 / 0.657 -> 0.017 / 0.606, and **not one of those eight numbers reproduces**. They also
disagreed with this section's own 40-seed headline by roughly a factor of two, which is what a
figure carried forward past the harness that produced it looks like. Every site now quotes the
40-seed table above, which reproduces on both trees to the digit. **A number keeps the harness it
was taken in, or it stops being a number**, which is this directory's oldest rule applied to
itself.

**`thrust`** and **`shoot`** -- byte-identical before and after, which they must be: both send a
point where the aim says and neither takes the stroke branch.

| action / target | before and after |
| --- | --- |
| `thrust` `as-measured` | 0.107 / 0.192 |
| `thrust` `vital` | 0.018 / 0.253 |
| `thrust` `high` | 0.349 / 0.152 |
| `thrust` `low` | 0.011 / 0.647 |
| `shoot` `high` | 1.000 / 0.000 (80 contacts over 40 bouts) |
| `shoot` `as-measured`, `vital`, `low` | 0.000 / 0.000 (160 contacts each) |

`shoot` lands two body contacts a bout aimed `high` and four otherwise. It separates perfectly,
on a sample too thin to be a claim; it has no test, for that reason.

**The Stage B cell, re-run for comparability.** The single-bout figures under "Session 17
Stage B" reproduce *exactly* on the working tree before the change, which is what makes this
harness trustworthy. After it, on that same one bout: `cut` `high` takes a 0.321 head share (9
of 28) against `low`'s 0.028, where it was 0.045 against 0.077 -- the right order at last, and
still one bout, and still not evidence on its own.

### Defect 2: naming the cover hand did nothing -- the diagnosis

**Nothing overrides it. Both defensive skills cover with both hands, identically, by
construction.** `handActionOption`'s `cover` branch writes `actionCoverAt(threat)` and
`guard = true` into the *acting* hand, and the shared spare-hand block below it writes
`actionCoverAt(threat)` and `guard = true` into the *other* one. Neither write knows which hand
the decision named, so `cover` on the primary and `cover` on the secondary differ in exactly one
field of the whole command -- the bookkeeping field `intent.actingHand`. `reset()`,
`freshIntent`, `enter`'s own `aimAt`, `boundIntent` and `applyTacticStance` are all innocent; the
two writes are the whole of it. `recover` aimed at `threat` collapses the same way, and for the
same reason.

**One correction to the brief's reading of its own reproduction.** It records that "the primary
hand carries the cover pointer in both cases". Both hands carry one. The secondary reads exactly
`0` in that fixture because the shield shoulder sits at x = -0.2 and the threat tip at x = -0.2,
so the bearing to it is dead ahead and `atan2(0, 0.5)` is zero -- a fixture artefact, not a
dropped write. Move that shoulder to x = -0.6 and both hands carry a real bearing, still
identically in both decisions (`.review/coverdiag.mjs`). It matters because it changes what the
repair has to be: nothing is failing to write the off hand, so nothing is repaired by writing it
harder.

**Proved at bout level as well.** 24 bouts of `cover` held against `swinger`,
`.review/coverblock.mjs`:

| loadout | `primary` | `secondary` |
| --- | --- | --- |
| `sword+shield` | 294.7 taken, 98.8 blocks, 18 died, 5 killed | *the same figures, to the digit* |
| `sword+buckler` | 176.1 taken, 121.2 blocks, 20 died, 3 killed | *the same figures* |
| `sword+sword` | 202.8 taken, 51.0 blocks, 10 died, 14 killed | *the same figures* |

### 2a. The repair, and whether a shield-led cover blocks better

The named hand keeps the covering line; the supporting hand steps outboard off it by
`ACTION_TUNING.guardSpread`, which is `policies.ts`'s `GUARD.spread` and its measured 24-bout
table, mirrored into the option layer's frozen block -- two blades on one line rest against each
other, and a guard occupying the space of the guard beside it is a guard doing nothing. A **bare
supporting fist is excluded**: a fist is small and is already the nearest thing to the line,
which is what `planOffHand` does with one, and it is the only case the scripted parity sweep
covers.

**It blocks better, decisively.** 60 bouts a cell against `swinger`, `.review/coverblock.mjs`:

| loadout | led by | damage taken | blocks/bout | block mix | died | killed | bout s |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: |
| `sword+shield` | sword (`primary`) | 207.9 | 63.9 | shield 32.1, sword 31.7 | 49/60 | 11/60 | 8.8 |
| `sword+shield` | **shield (`secondary`)** | 229.3 | **88.8** | **shield 59.8**, sword 29.0 | **26/60** | **31/60** | 11.7 |
| `sword+buckler` | sword (`primary`) | 178.3 | 41.7 | sword 24.9, buckler 16.8 | 56/60 | 4/60 | 5.9 |
| `sword+buckler` | **buckler (`secondary`)** | 190.4 | **79.7** | sword 40.3, **buckler 39.5** | **42/60** | **18/60** | 11.4 |

Leading with the shield nearly doubles what the shield itself stops (59.8 blocks a bout against
32.1) and halves the deaths (26 in 60 against 49). **That death difference is a two-sample
z of 4.34 pooled, 4.72 unpooled** -- `p < 1e-5` either way, so not a noise reading. This read
"about six binomial standard deviations" until the remediation pass, and six is what you get by
dividing the 0.383 difference by *one cell's* standard error (26/60's, 0.0640) instead of by the
standard error of the difference between two (0.0884 pooled, 0.0812 unpooled). A single cell's SE
is always the smaller of the two quantities, so that arithmetic overstates every two-sample
comparison it is used on. The conclusion is unchanged and the number is not. Damage *taken per
bout* goes up because the bouts last 40 % longer; per
second it falls, 23.6 to 19.6.

**A trap the harness caught, recorded because it nearly became a finding.** A first pass reported
`shield+sword` behaving differently between the two effectors. It was a loadout name the harness
had no row for, so `runBout` built the default `sword+empty` body, and the difference was the
test driver's own severed-hand fallback firing 9 times against 4. The harness refuses a loadout
it does not have by name now, and counts its own fallbacks in the table.

### 2b. The bigger thing the diagnosis found, and did not fix

**The option layer has no per-weapon guard placement at all.** `policies.ts` has one, in
`planOffHand`, and every part of it carries its own measured table: a strapped shield is held
0.80 rad *across* the line of the blow (`GUARD.across`), 0.20 rad *below* the bearing to it
(`GUARD.lift`), and the **forearm rolled** `-outboard * 1.0` rad to bring the plate round
(`GUARD.roll`), with a 0.18 rad wrist bend on top (`WRIST.shield`) -- which collects 96 % of the
board against 56 % without the roll, and takes 160.8 damage a bout against a no-shield control's
284.5. The roll and the bend are two axes and two constants; this sentence called the roll "the
wrist turned 1.0 rad", which named the wrong axis and hid the fact that a shield spends both.
A buckler is punched out
along the arm with no roll. `options.ts`'s `cover` does none of it: every hand is aimed like a
blade, and `applyActionPosture` gives it a flat `-outboard * 0.35` roll whatever it is holding.
Measured in the same harness at 24 bouts, an option-driven `sword+shield` guard took **294.7**
damage a bout -- more than `sword+buckler`'s 176.1 and `sword+sword`'s 202.8, and worse than the
specialist's own *no-shield* control.

It is not fixed here. It needs `GUARD.across`, `GUARD.lift`, `GUARD.roll` and `WRIST.shield`
mirrored into `ACTION_TUNING` and their tables re-taken through the option layer, which is a
larger balance change than this session's brief and is owed its own before-and-after. It is
written down so it is not rediscovered as "the shield is worse in the option layer" a third
time.

### 3. The balance cost, on the controllers that can see it

`npm run measure`'s matchups never enter an option, so they cannot see either change. These can:
the two shipped meta controllers, plus a third that draws a whole legal tuple rather than only an
action, because a named region is the half of the vocabulary the shipped two never reach. 40
bouts a cell against `swinger` on `sword+empty`, `.review/balance.mjs`, the two trees swapped by
`.review/ab.mjs`.

| controller | loadout | win rate before -> after | damage dealt | damage taken | severs |
| --- | --- | --- | --- | --- | --- |
| `scripted-meta` | `sword+empty` | 55.0 -> 55.0 % | 185.99 -> 185.99 | 172.99 -> 172.99 | 1 -> 1 |
| `scripted-meta` | `sword+shield` | 82.5 -> 87.5 % | 222.04 -> 197.47 | 163.56 -> 156.15 | 3 -> 4 |
| `scripted-meta` | `sword+buckler` | 95.0 -> 87.5 % | 242.02 -> 214.61 | 119.04 -> 124.26 | 2 -> 2 |
| `scripted-meta` | `axe+empty` | 2.5 -> 2.5 % | 43.82 -> 43.82 | 222.69 -> 222.69 | 1 -> 1 |
| `scripted-meta` | `empty+empty` | 0.0 -> 0.0 % | 51.92 -> 51.92 | 242.12 -> 242.12 | 0 -> 0 |
| `random-meta` | `sword+empty` | 47.5 -> 47.5 % | 230.55 -> 230.55 | 212.18 -> 212.18 | 0 -> 0 |
| `random-meta` | `sword+shield` | 80.0 -> 87.5 % | 227.08 -> 244.32 | 166.12 -> 159.79 | 1 -> 5 |
| `random-meta` | `sword+buckler` | 60.0 -> 77.5 % | 221.55 -> 232.55 | 195.28 -> 178.40 | 1 -> 2 |
| `random-meta` | `axe+empty` | 7.5 -> 7.5 % | 112.66 -> 112.66 | 266.74 -> 266.74 | 0 -> 0 |
| `random-meta` | `empty+empty` | 0.0 -> 0.0 % | 50.48 -> 50.48 | 219.03 -> 219.03 | 0 -> 0 |
| `random-tactic` | `sword+empty` | 52.5 -> 52.5 % | 272.72 -> 258.81 | 197.24 -> 224.36 | 2 -> 3 |
| `random-tactic` | `sword+shield` | 77.5 -> 70.0 % | 290.07 -> 282.62 | 202.88 -> 187.18 | 6 -> 5 |
| `random-tactic` | `sword+buckler` | 55.0 -> 50.0 % | 271.39 -> 251.08 | 215.90 -> 214.66 | 6 -> 1 |
| `random-tactic` | `axe+empty` | 2.5 -> 12.5 % | 147.53 -> 170.77 | 267.72 -> 244.95 | 0 -> 6 |
| `random-tactic` | `empty+empty` | 0.0 -> 0.0 % | 56.86 -> 53.09 | 244.78 -> 223.58 | 0 -> 0 |

Mean bout length is **3.52 to 7.33 s** across the thirty cells, and two of the fifteen move by
more than 0.6 s: `scripted-meta` / `sword+buckler` by **0.81 s** (5.29 -> 4.48) and
`random-tactic` / `sword+shield` by **0.65 s** (7.33 -> 6.68). The line read "4.4 to 7.3 s in
every cell and moves by at most 0.6 s" until the remediation pass re-derived it from the two
files it names; both halves were wrong, and the floor of the range was the null control's own
3.52 s sitting in the first row of the table above it. The full ranges are in
`.review/balance-before.txt` and `.review/balance-after.txt`.

Two things to read off it.

**Six of the fifteen cells are identical to the digit, and that is structural rather than
lucky.** They are exactly the cells with an empty supporting hand driven by a controller that
names no region: `asMeasured` keeps the old arc, and a bare fist is excluded from the guard
spread. The rows that move are the ones holding a shield or a buckler, plus the tuple-naming
control.

**Not one of the nine deltas is separable from noise.** The largest win-rate move is 17.5
percentage points (`random-meta` / `sword+buckler`); the same code at a second seed base moves
cells by up to 22.5 and by a median of 5.0 over all fifteen. The largest damage move is 15.8 %
(`random-tactic` / `axe+empty`, dealt) and the largest on damage taken is 13.7 %; the noise
control's own drift on dealt damage runs 2.8 % to **45.5 %** with a median of 8.8 %. So the
honest statement is: **the change is confined by
construction, and where it applies it costs nothing a 40-bout cell can measure, in either
direction.** That is not a claim that it costs nothing. A compute session with thousands of
bouts is the thing that could say so, and sessions 21 and 22 are it.

### 4. The null control did not move, for the eighth stage running

`npm run measure -- --only duelist-swinger --bouts 120`, seed 20260823: duelist **66/120 =
55.0 %**, bout length **3.52 s (1.42-8.98)**, damage **176.17**, **10** severs, **1496** and
**1670** scoring contacts, and the same final-blow region histogram. Every printed figure
identical to the pinned values.

This holds *by construction* -- `policies.ts` never imports `options.ts` -- and was run anyway,
because the two layers share `applyActionPosture`, `actionCoverAt`, `actionAimAt` and
`actionArcherAim`, and this session added exports to that shared module. A leak into one of those
four would move every scripted figure in this document, and this is the cheapest thing that would
say so. It did not leak: `actionCursorForAzimuth` and `actionAzimuthOf` are new exports with no
scripted caller, `guardSpread` is a new frozen field nothing else reads, and `azimuthRange`
factors out a literal pair that was already inside `azimuth`.

### The mutation table

Every test added or touched, watched failing under a deliberate mutation of the line it is about,
with the message it failed on. `.review/mutcheck.mjs` runs the battery and reports a missing
pattern *as* a missing pattern rather than as a pass, because "not noticed" and "nothing to
notice" otherwise read the same.

| mutation | suite | result |
| --- | --- | --- |
| `NAMED_STROKE_SPAN` 0.5 -> 1.0 | `options` | RED -- `a_named_region_narrows_a_stroke...`: "vital swept 0.5934456207499992" |
| `NAMED_STROKE_SPAN` 0.5 -> 1.0 | `integration` | **GREEN** -- named below |
| the narrowing reaches `"as-measured"` too | `options` | RED -- `a_named_region_narrows...` ("the measured line swept 0.30098") **and** `the_scripted_meta_controller_matches_the_policy_it_replaces` |
| the arc goes back to a flat `+-0.50` | `options` | RED -- "vital chambered at 0.3136113810205442, not -0.023595835159134153" |
| the arc goes back to a flat `+-0.50` | `integration` | RED -- `a_cut_at_a_named_high_or_low_target...`: "low reached the head 0.05 of the time" |
| the supporting hand is not stepped off the line | `options` | RED -- `a_named_cover_hand_leads...`: "naming the cover hand moved [actingHand]" |
| every supporting hand is stepped off, bare fist included | `options` | RED -- `a_named_cover_hand_leads...` **plus all three scripted parity tests** |
| the supporting hand steps inboard instead of outboard | `options` | RED -- "the supporting shield stayed on the leader's line" |
| the azimuth inverse divides by one half-range | `options` | RED -- `the_option_layer_azimuth_mapping_inverts...` **and** `..._share_one_azimuth_mapping`: "primary -1 -> -1.15 -> -0.8846153846153845" |
| `guardSpread` 0.30 -> 0 | `options` | RED -- "naming the cover hand moved [actingHand]" |
| the option layer's azimuth range disagrees with `CONFIG.arm` | `options` | RED -- `the_option_layer_and_the_scripted_layer_share_one_azimuth_mapping`: "primary 0.05: option 0.0625 against scripted 0.065" |
| the spread reaches every action (`DEFENSIVE_ACTIONS.includes(name)` -> `true`) | `options` | RED -- `only_the_two_defensive_skills_spread_the_supporting_hand`: `+ cut: 'spread', + punch: 'spread'` |
| the spread reaches only `cover` (`-> name === "cover"`) | `options` | RED -- the same test: `+ recover: 'on the line', + recoverMeasured: 'on the line'` |
| `NAMED_STROKE_SPAN` 0.5 -> 0.55 | `options` | RED -- `a_named_region_narrows_a_stroke...`: "vital chambered at -0.007080068860021077, not -0.023595835159134153" |
| the lateral `+-0.62` -> `+-0.30` | `integration` + `options` | RED -- `a_cut_at_a_named_high_or_low_target...` ("0.09523809523809523 head high against 0.04990403071017274 low") **and** `the_scripted_meta_controller_matches_the_policy_it_replaces` (250 steps, `primary.pointerX` max 0.32) |
| `ACTION_TUNING.azimuthMax` 1.30 -> 1.45 | all | RED -- **four** tests, and 48 of 408 command cells move. It used to move **zero** cells and turn only the `CONFIG` parity assertion red, because nothing read the constant. |

**One mutation each test does not catch**, named rather than left to be found:

- `a_cut_at_a_named_high_or_low_target_reaches_that_body_region` does **not** notice
  `NAMED_STROKE_SPAN` doubling to a whole region spacing. That is not a hole in its assertions;
  the constant is genuinely near-flat over that range in a bout -- a whole spacing lands `high` at
  0.123 head and 0.274 legs, inside every band the test draws. The `options` suite catches it
  exactly, on the arc's own two ends. A six-seed bout test cannot separate 0.123 from 0.166 and
  should not pretend to.
- `a_named_region_narrows_a_stroke_and_the_measured_line_keeps_its_arc` does not notice the
  **lateral** `+-0.62`, which it never reads. It said "and no test here would say so", and the
  remediation pass ran the mutation rather than reasoning about it: `0.62 -> 0.30` turns **two**
  tests red, `a_cut_at_a_named_high_or_low_target_reaches_that_body_region`
  ("0.09523809523809523 head high against 0.04990403071017274 low") and
  `the_scripted_meta_controller_matches_the_policy_it_replaces` (250 of 480 steps disagree on
  `primary.pointerX`, max 0.32). The gap in *this* test is real; the claim about the suite was an
  under-claim in a table presented as re-derived fact. **A mutation table entry is a measurement
  like any other and has to be run, including the "nothing catches this" rows** -- those are the
  ones nobody re-checks.
- `a_named_region_narrows_a_stroke_and_the_measured_line_keeps_its_arc` does not notice
  `TARGET_SPAN_FRACTION`. Its arc ends are half the distance between two published region heights,
  and the region spacing scales with that fraction, so both sides move together and every equality
  stays exact. `a_named_target_is_a_body_region_derived_from_published_facts` pins the fraction to
  0.75 and all three heights to exact numbers, which is where that constant is held. It *does*
  notice `NAMED_STROKE_SPAN` now: 0.5 -> 0.55 fails with "vital chambered at
  -0.007080068860021077, not -0.023595835159134153". Until the remediation pass it did not,
  because the expected ends were recomputed from the constant itself.
- `a_named_cover_hand_leads_and_the_supporting_hand_steps_off_the_line` does not notice
  `guardSpread` moving from 0.30 to any other non-zero value: it asserts the pointer is
  `guardSpread` off the line, so it follows the constant, and only zero collapses it. That number
  is bounded by `policies.ts`'s 24-bout table and by nothing here.
- `the_option_layer_azimuth_mapping_inverts_on_both_sides_of_centre` does not notice the two
  ranges being swapped *consistently* between `actionAzimuthOf` and `actionCursorForAzimuth` -- a
  round trip cannot see a mapping that is wrong in both directions. The asymmetry assertion beside
  it, and `the_option_layer_and_the_scripted_layer_share_one_azimuth_mapping` beside that, are
  what catch it.
- `the_option_layer_and_the_scripted_layer_share_one_azimuth_mapping` does not notice **both**
  copies moving together, which is the case it exists to permit: it says the two agree, not what
  they agree on. The number itself is `CONFIG.arm.azMin` / `azMax` and is bounded by the arm's own
  reach tables. It compares all four bounds now rather than `azMax` alone, and all four are read
  by `azimuthRange`, `actionAimAt` and `elevation` rather than written out beside them -- so the
  mutation it *used* to fail on was one that changed no behaviour anywhere, which is a test
  reading the reporter rather than the thing reported.
- `only_the_two_defensive_skills_spread_the_supporting_hand` does not notice `guardSpread`'s
  magnitude, for the same reason the cover-lead test does not: both expectations are built from
  the constant. It notices which *actions* reach the block, which is the thing nothing held.

**A mutation that changed the code and was invisible, which is why the code moved.** The
supporting-hand spread was written first inside the block that covers the spare hand, above
`applyActionPosture`. From there, mutating its `hasHeldWeapon` guard away -- so a bare fist was
stepped off the line too -- left the whole suite **green**, because the later empty-fist block
rewrites that pointer unconditionally and a spread on a fist could never be seen. A rule nothing
can observe is a rule no test can hold, so the spread moved below that block; the same mutation
now turns four tests red, three of them the scripted parity sweeps.

**And the remediation pass took the mechanism out rather than the placement.** That
"rewrites that pointer unconditionally" was `actionCoverAt` called a second time to recompute
the pointer the cover block twenty-six lines above had already written -- a no-op that moved no
leaf of a 408-cell command surface, and the exact shape that concealed the mis-placed spread. It
is gone. The two blocks are now mutually exclusive by weapon (`hasHeldWeapon` is the complement
of `weapon === "empty"`), so the exclusion is a condition rather than an ordering and neither
block depends on standing where it stands.
`only_the_two_defensive_skills_spread_the_supporting_hand` holds all four rows of it directly:
widening the condition to every action turns it red with
`+ cut: 'spread', + punch: 'spread'` against `- cut: 'on the line', - punch: 'on the line'`, and
narrowing it to `cover` alone turns it red with `+ recover: 'on the line'`. Both mutations left
all 537 tests green before it existed, and the first of them costs a `sword+shield` fighter
cutting `high` at `swinger` 157.8 damage a bout against 81.9.

### The gate

`npx tsc --noEmit` clean, `npm test` **538 passed** (532 before, plus five: the stroke arc, the
cover lead, the azimuth inverse, the two azimuth copies agreeing, and the bout-level cut
distribution; plus one from the remediation pass below, which holds the spread's action set),
`npm run build` clean, and
`git diff --numstat` md5-identical to `git diff --ignore-cr-at-eol --numstat` across the
directory, so no file's line endings moved. `scripts/` is not type-checked and was swept by hand:
`node --check` on every script, and a grep for the three new exports across `scripts/` and
`tests/`.

### The remediation pass -- 2026-08-25

An adversarial review rebuilt `0dd615a` from `git archive` and re-ran every harness above
independently. **Both defects, the Stage B supersession, the cover result and the balance
non-separability all reproduced**, several to the digit. What it found was a *pattern* of dead
writes, two rules the change argues for that nothing held, four statistical overstatements, four
sites quoting figures their named harness cannot produce, and seven broken line anchors. This
pass took all of it, and disagreed with the review twice.

#### Five dead writes, of which four were dead

Each candidate was neutralised one line at a time and the executor's whole command surface
diffed -- `.review/rem2/cmddump.mjs`, **408 cells** over twelve loadouts x six actions x two
effectors x five targets x two stances, stepped seven frames each. The review's own sweep was 230
cells over six loadouts.

| write | verdict |
| --- | --- |
| `enter`'s `startX/startY` from the `start` parameter | dead: overwritten by the guard seed on the entry step, before its only read |
| the caller threading `previousIntent?.[chosenHand]` into that parameter | dead: `undefined` moves nothing |
| `h.roll`/`h.wristBend` on the stroke entry step | dead: `applyActionPosture` and the block below it rewrite both |
| the empty-fist block's second `actionCoverAt` | dead: recomputes the pointer written 26 lines above |
| `intent[hand].guard = false` on the shoot path | dead: `reset()` cleared it and nothing sets it |
| the spare hand's rest **pointer** on the shoot path | **live -- the review was wrong** |
| the spare hand's `thrust`/`guard` on the shoot path | dead, and the review did not find these two |

**The rest pointer is the one that matters, and the reason it read as dead is the reason this
directory writes down harnesses.** `freshIntent` seeds `restPointerX/Y` on the **secondary** hand
only; a primary starts at (0, 0). So the write is observable only when the *spare* hand is the
primary, which happens only when the bow is in the secondary -- a loadout no sweep in the review
carried. Adding the mirrored half of the loadout set turned it from `DEAD (0/230)` to
`live (8/408)`. A neutralising sweep answers "nothing in this fixture noticed", and that is not
the same sentence as "nothing would". The two extra dead writes beside it were found by the same
widening.

The four dead ones are gone; the `start` parameter and `scripted-meta`'s whole `previousIntent`
field went with them. The rest-pose block is kept **whole** and says in place which of its six
writes are live and which restate `reset()`, because a rest pose stated in parts is exactly what
let the pointer pair look optional.

#### Two rules the change argued for, and now one test holds

`only_the_two_defensive_skills_spread_the_supporting_hand` asserts all four rows of the guard
spread's action set at once. Before it, widening `DEFENSIVE_ACTIONS.includes(name)` to `true`
left all 537 tests green while costing a `sword+shield` fighter cutting `high` at `swinger`
**157.8 damage a bout against 81.9** over 24 bouts (`.review/rem2/spreadcost.mjs`) -- four to
nineteen times this session's own balance noise floor -- and narrowing it to `cover` alone left
all 537 green while dropping `recover`, which the defect-2 diagnosis explicitly claims. The two
mutations move **92** and **72** of the 408 command cells respectively, so neither was a subtle
one; nothing was looking. Both are in the table above with the message each fails on.

#### What the record got wrong about its own numbers

Every one of these was re-derived from the files the prose names, not re-argued:

- **Four sites quoted `cut` figures their named harness cannot produce.** Fixed above, at
  `tests/integration.test.mjs`, `src/options.ts`'s `aimHeight`,
  `src/learning/tactical-teacher.ts` and the Stage B supersession note. All four carry the
  40-seed table now.
- **Two of six bolded `cut` sub-figures were inside the noise floor** -- `vital` head (t = -1.40)
  and `low` leg (t = +0.23). The table carries a *t* per cell and the headline is the
  bootstrapped ratio, which is the claim that holds.
- **"About six binomial standard deviations" was 4.34.** Six came from one cell's SE.
- **"Mean bout length 4.4 to 7.3 s, moves by at most 0.6 s"** was 3.52 to 7.33, and two cells
  move by more.
- **The noise floor was quoted narrower than it is** -- median 7.5 pp for 5.0, and 5-11 % damage
  drift for 2.8-45.5 %. Every "not separable" verdict survives the correction.
- **A mutation-table row claiming nothing would notice the lateral `0.62`** turns two tests red.
  A "nothing catches this" row is a measurement like any other and nobody re-checks it.
- **`GUARD.roll` was described as a wrist.** It is a forearm roll, and a shield spends both axes.
- **This pass found one the review did not, and it is the same shape as the rest.**
  `a_cut_at_a_named_high_or_low_target_reaches_that_body_region` carried a docstring saying "the
  ratio alone survives the defect: `high` was already eight times `low` before the change", which
  is why the head-share floor and the leg-share ceiling were added beside it. Run on the old arc
  (`.review/rem2/cut6.mjs`, `distribution` reproduced exactly and executed on both trees), the
  ratio was **2.10**, and it is one of only **two** of the six assertions that fail there. The
  head floor (0.1050 against a 0.09 threshold), the leg ceiling (0.3039 against 0.34) and the leg
  ratio (1.734 against a 1.7 band) all *pass* on the arc the test exists to refuse. Its account of
  itself was exactly inverted, and the comment beside the leg band claimed the pre-change figure
  was 1.45 -- a number from no harness, which is how the band came to be written 2 % below the
  thing it was meant to exclude. Both are corrected in place, the thresholds are unchanged, and
  the test now says which of its assertions are evidence and which are regression guards.
- **Seven line anchors** broken by the change were re-pointed against the current file; nine in
  plan 16 that were already dead at `0dd615a` were struck rather than re-pointed, per the plan
  set's own rule.

#### `ACTION_TUNING.azimuthMax` was read by nothing

`azimuthRange` hard-coded `[-1.15, 1.30]`, `actionAimAt` hard-coded the pair a third time, and
`elevation` did the same with the elevation bounds -- so the frozen block's aiming envelope
appeared only in its own comment and in one parity assertion. Mutating it turned that assertion
red while moving **zero** command cells: a test reading the reporter. `ACTION_TUNING` now carries
all four bounds and is the single source for every one of them; the same mutation moves 48 of 408
cells and turns four tests red.

#### `NAMED_STROKE_SPAN` on a small body, documented rather than fixed

A named stroke's arc is a fraction of the target's own vitals-to-crown span, so it shrinks with
the target. On a centipede (crown 0.38, vital 0.209) the arc is **0.041 to 0.057 cursor units**
against the measured line's 0.77 to 1.00, and at 0.6 m a `vital` or `low` cut has a span of
**exactly 0.000** -- both ends clamp below the elevation envelope
(`.review/rem2/smallbody.mjs`). Measured over four bouts a cell against `crawler`
(`.review/rem2/centipede.mjs`) this is **not** a damage regression: `high` goes 545.5 -> 769.5,
`vital` 491.2 -> 519.5, `low` 400.8 -> 505.5, with more and slower contacts (mean contact speed
8.76 -> 6.93 for `high`, 15.22 -> 7.85 for `low`). A small body is close to the floor, so what
the narrowing removes was mostly swinging at the ground. The floor is written into
`NAMED_STROKE_SPAN`'s own comment, with where a repair would go if one is ever needed.

#### Owed: the teacher's constant `vital` label for `cut` has lost its reason

**This is the largest single piece of work this session leaves behind, and it is deliberately not
taken here.** `tactical-teacher.ts` labels every `cut` with a constant `vital` because Stage B
measured that naming an aim did nothing for a cut. Stage B is superseded as noise, and a named
cut now separates `high` from `low` by 8.7x on head share (0.166 against 0.019, bootstrapped
intervals 5.21-19.34 against a before of 2.00-4.55, non-overlapping). **So the evidence for the
constant is gone and nothing has replaced it.** The constant stays only because moving it changes
the label histogram every trainer in this directory consumes, which is a labelled-behaviour
change owed its own before-and-after -- not a side effect of a motor fix. Whoever takes it
branches `cut` three ways as `thrust` already is, re-runs the Stage C2b histogram either side,
and reports what the label distribution does to a trained artifact. Until then the paragraph in
`tactical-teacher.ts` is a deferral and says so; it is not a justification of the value.

#### The gate, re-run

`npx tsc --noEmit` clean, `npm test` **538 passed**, `npm run build` clean, `git diff --numstat`
md5-identical to `git diff --ignore-cr-at-eol --numstat`, and the null control unmoved: duelist
**66/120 = 55.0 %**, **3.52 s (1.42-8.98)**, **176.17** damage, **10** severs, **1496**/**1670**
contacts. Every code edit in this pass was checked against the 408-cell command surface and moved
**0 cells**, which is what "behaviour-neutral" has to mean before it is claimed.

## Session 19: the calibration gate, which refused nothing and then refused the wrong thing -- 2026-08-25

`LOOKAHEAD_CALIBRATION_LIMITS` was three copies of `0.25` measuring a signed distance in metres,
a squared probability and a fraction of a health bar. **Two of the three could not fire and the
third refused the wrong cells.** Everything below was executed, on 18,494 real Havok rows from
session 17's stance trace and on four fresh 775-key schedule sweeps; harnesses are named per
figure and live in `.review/calgate/`.

### 1. What was wrong, confirmed by execution

**`signedReachError` was a signed mean of residuals about a fitted mean, so it is identically
zero in-sample.** The fitted delta *is* that mean, so the residuals sum to zero by construction.
Worst magnitude across the 54 fitted groups: **5.489e-17**, against **the worst group's** mean
absolute residual of **0.1617 m** and RMS of **0.2119 m** on the same rows with the same delta.

**Corrected 2026-08-25: those two figures are worst-group, not means, and this sentence called
them means.** The probe that produced them prints them as `worstMae` and `worstRms`
(`.review/rev19/worsts.mjs`); the means over the 54 groups are **0.0757 m** and **0.1123 m**.
The comparison is worst against worst, which is the right one to make, and the conclusion is
untouched either way -- 5e-17 is not a distance beside any of the four numbers. Worth knowing
where 0.1617 comes from: it is the centipede's `close+bite+natural+vital`, the worst-fitting
group on the fixture and the one section 3 is about.

**The out-of-sample path did not rescue it.** `calibrateTacticalModel` genuinely rescores against
held-out rows and genuinely covers all 775 keys -- but at the shipped minimum budget the held-out
rows are **bit-identical to the train rows for 775 of 775 keys**. **The reason is not that the
seeds are close** -- see section 7, where that claim is corrected -- it is that 48 solver steps
is 0.2 s and the opening of a bout is seed-insensitive: two fighters start from the same pose at
the same separation and nothing the seed touches has moved them apart yet. Where the split is
real the signed mean measures **bias, not error**: 0.0010 against a per-row mean absolute
residual of 0.1072 at 595,200 steps, and 0.0029 against 0.1606 at 1,190,400 -- factors of 107
and 55.

**`contactBrier` could not refuse an in-sample cell either, for a different and more durable
reason.** Every trace row publishes `before.contactProbability === 0` **by construction** --
`collectTacticalTrace` builds every `before` with `tacticalStateFromView(view, 0)` and that
parameter is the column's only writer -- so `delta.contactProbability` *is* the group's contact
rate `p` and the in-sample Brier is exactly `p(1-p)`. This said "0 of 18,494 otherwise", which is
a true count stating a structural fact as an empirical one: a weaker claim than the code
supports, and one that would go on reading true after a change that made it false in general.
The clamp is **not** inert, which section 12 corrects. That is at most 0.25, and `calibrationRefusal`
compared with a strict `>`, so the limit was the score's own ceiling. The deeper fact: **this
model has no covariates, so a cell's contact prediction is a constant, a constant predictor's
only possible error is a calibration gap, and a calibration gap is invisible in-sample by
construction.** Out of sample the raw Brier correlated with the cell's own base-rate variance
`q(1-q)` at **0.9959** over 126 held-out folds (mean 0.1390 against a floor of 0.1353, so the
model contributed **2.7 %**), and all seven folds that breached 0.25 had a held-out contact rate
in [0.3, 0.7] while **none outside that band ever did**. It refused cells whose *outcome* was
uncertain, which is precisely the cell a look-ahead most needs to search.

**`vitalityDeltaError` was the only live gate**, because it wrapped its residual in `Math.abs`
and so could not cancel -- and 0.25 was four times above anything ever observed and 35x the mean
per-step vitality movement. A no-op, not a bound. The reach residual was written
`before + delta - after` and the vitality residual `delta - (after - before)`: algebraically
identical, spelled differently, and **only one got the `Math.abs`**. Both are spelled the same
way now, and `calibrationFor`'s docstring says why.

### 2. What the columns are now

| was | is | unit |
| --- | --- | --- |
| `signedReachError`, a signed mean | `reachError`, a mean absolute residual | metres |
| `contactBrier`, a raw Brier score | `contactRateError`, the root of the Brier excess over `q(1-q)` | a probability |
| -- | `contactRate`, `q` itself -- reported, never gated | a probability |
| `vitalityDeltaError`, unchanged | `vitalityDeltaError` | fraction of a health bar |

For a constant predictor the root of `Brier - q(1-q)` is exactly the absolute difference between
`p` and `q`, so the contact column is now the calibration gap between the rate that was fitted
and the rate that was observed -- the only thing about a constant contact prediction that *can*
be wrong. It is identically zero in-sample, which is why section 7 exists. `contactRate` is
carried because the raw Brier was reliably telling you one true thing and dropping the column
without it would lose it: a `contactRateError` of 0 on a cell that never contacts and one on a
cell that contacts half the time are the same number about different cells.

The inline second copy of all three statistics inside `fitTacticalModel` is gone; it calls
`fitGroups`, which calls `calibrationFor`, which is now the only place a calibration record is
computed.

### 3. The reach column is two numbers, because no single one is a threshold on error

**Superseded 2026-08-25 on the argument and on the value. The section as first written said 0.30
"sits above the `close` mode and at twice the other four, so it refuses outliers within each
movement class instead of removing one." That is false, and it is the same fallacy this section
convicts 0.15--0.20 of.** What is kept below is the measurement; what is replaced is the
conclusion drawn from it.

**The review that found the original bug recommended 0.15, "just above the converged p99 of
0.1357". That p99 is real, and it is a warrior p99 from a nine-tuple fixture.** Reproduced
exactly with `.review/calgate/p13-dist.mjs` -- 126 stance-free folds, warrior tuples only:
`reachError` mean 0.0709, p90 0.1184, p99 **0.1357**, max 0.1362. Adding the two centipede tuples
moves the p99 to **0.1619**, and the centipede's `close+bite+natural+vital` sits at mean 0.1617 /
max 0.1619 on **all eighteen** of its folds (`.review/calgate/p14-pertuple.mjs`).

**The causal story here was wrong, and it is the one that makes "spend more steps" sound like the
fix.** This attributed the 0.1357-against-0.2915 gap to the fixture having "exactly one `close`
on a warrior". The tuple mix moves the p99 only 0.1357 -> 0.1619, and **no tuple on that fixture
reaches 0.17**. The remaining 0.16 -> 0.29 is **the bout window**: the fixture runs 4,800-step
bouts and the 8x schedule sweep runs 384-step ones. Section 13 has the curve.

On the real 775-key schedule `close` is a fifth of every cell. Measured on the schedule sweep at
the 8x budget, where 772 of 775 splits are real (`.review/calgate/p16-bimodal.mjs`, recomputed from
the sweep dump's raw ingredients at `.review/rem20/an1.mjs`):

| movement | mean `reachError` | max | keys over 0.15 |
| --- | ---: | ---: | ---: |
| `close` | **0.2915** | 0.3594 | **155 / 155** |
| `circle-right` | 0.1434 | 0.2259 | 3 / 155 |
| `circle-left` | 0.1398 | 0.1862 | 6 / 155 |
| `hold` | 0.1382 | 0.1807 | 4 / 155 |
| `disengage` | 0.0902 | 0.1197 | 0 / 155 |

**`close` is the one movement a constant delta cannot represent**, and it is not noise: a fighter
closing decelerates as it arrives and **stops when it contacts**, so the residual about the mean
closure is large by construction. The discriminator is that the movement *terminates*, not that
the reach changes -- `disengage` also moves the reach margin every step and is the best-fitting
movement of the five, because a retreat runs at a constant back-speed and does not stop.

**"The histogram is empty between the two modes" is true at one budget only.** At 4x, 620 keys
sit under 0.12 and 155 over 0.21 with a gap of 0.1014. At 8x the gap is **0.0031** and **12 keys
sit in (0.15, 0.20)**. At 2x the modes **overlap**: 57 non-`close` keys sit above the lowest
`close` key. The bimodality is a property of the window as much as of the movement.

**What a single scalar actually refuses**, at 8x, which is the measurement that settles it:

| scalar `reachError` | refused | composition | of `close` | of everything else |
| ---: | ---: | --- | ---: | ---: |
| 0.15 | 168 | close 155, circle-left 6, hold 4, circle-right 3 | 100 % | 2.1 % |
| 0.20 | 156 | close 155, circle-right 1 | 100 % | 0.2 % |
| 0.25 | 142 | close 142 | 92 % | 0 % |
| 0.30 | 66 | close 66 | 43 % | 0 % |
| 0.35 | 2 | close 2 | 1 % | 0 % |

Non-`close` `reachError` maxes at **0.2259**, so **every scalar from 0.23 to 0.40 refuses zero
non-`close` keys**, and the only thing that varies across 0.25 -> 0.30 -> 0.35 is how much of
`close` survives. 0.30 is the same `close`-only threshold it condemned 0.15--0.20 for being, at a
different quantile: it sits at that mode's own median (p50 0.2934) and keeps 57 % of it. Whole
gate, contact and vitality held at their shipped values:

| `reachError` | survival at 4x | bodies with no plannable `close` | survival at 8x | bodies with no plannable `close` |
| ---: | ---: | ---: | ---: | ---: |
| 0.15 | 79.6 % | **13 / 13** | 78.1 % | **13 / 13** |
| 0.20 | 79.6 % | **13 / 13** | 79.6 % | **13 / 13** |
| 0.25 | 84.0 % | 6 / 13 | 81.4 % | 7 / 13 |
| 0.30 | 93.5 % | 2 / 13 | 91.1 % | 1 / 13 |
| 0.35 | 99.4 % | 0 / 13 | 99.0 % | 0 / 13 |

At 0.15 every body loses the ability to plan an approach. That is not a stricter look-ahead, it
is a fighter that circles out of range forever -- and it would have shipped silently, because no
body loses *all* its cells, so `lookaheadMind` never refuses by name and nothing throws.

**The decision.** A single scalar on this column has exactly two settings -- remove approach
planning, or admit a mode the column cannot judge -- and no value fixes that, because the cause
is structural rather than a population of outliers. Three ways out were weighed:

- **gate `close` on a different quantity.** Declined. There is nothing in a constant-delta
  record to gate it on that is not this residual, and inventing a statistic to make a threshold
  work is how the raw Brier got here in the first place.
- **leave `close` ungated on reach.** Declined. A cell whose approach model has gone wrong *in
  kind* -- a fitted delta that moves the wrong way -- would then be admitted, and neither of the
  other two columns can see that.
- **one limit per class.** Shipped. `reachError` is **0.20** for the four movements a constant
  delta can describe, which refuses exactly one key of 620 (a `circle-right` at 0.2259) and
  empties no class; 0.15 would refuse 13 and 0.12 would take `circle-left`, `circle-right` and
  `hold` away entirely. `approachReachError` is **0.35** for `close`, which refuses 2 of 155 and
  costs no body its approach, against 0.30 refusing 66 and costing `centipede/natural:bite` all
  three of its.

**And the honest thing about `approachReachError`: it is not an outlier filter on model quality,
it is a ceiling on how wrong an approach prediction may be before planning on it is worse than
not planning.** A constant delta cannot describe an approach; the record cannot tell a hard
movement from a bad fit; 0.35 is a bound on gross failure rather than a standard. What the split
buys over a scalar is that the column can no longer be tightened "a little" and silently take
approach planning away from all thirteen bodies at once --
`each_deployed_limit_is_bounded_by_what_it_does_to_the_measured_record` asserts exactly that,
by running the deployed non-approach value as a scalar and counting the bodies it strands.

**Say the thing that makes all of this smaller than it sounds: no shipped budget reaches any of
it.** At 148,800 solver steps every column of all 775 keys is exactly **zero**; at 297,600 the
reach column tops out at **0.1139**. Any reach limit from 0.12 upwards refuses nothing at either.
0.15 would have refused nothing at a shipped budget, and the thirteen-bodies catastrophe belongs
to 595,200 and 1,190,400 -- budgets nobody currently runs.

**Whether a constant per-cell delta can represent an approach at all is still the open question
this hands session 20.** What has changed is that the answer no longer hides inside a single
number: `approachReachError` is the number that says "we cannot judge this movement, and here is
how far we will let it go".

### 4. The four limits, and the distribution each is read off

Held-out distribution over the 775-key schedule at 1,190,400 solver steps, seed 310013
(`.review/calgate/p15-limits.mjs`, recomputed at `.review/rem20/an1.mjs`). The middle two rows
are the same rows and the same delta scored differently, and are here for comparison rather than
as candidates:

| column | mean | p90 | p99 | max | limit | refuses at 8x |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `reachError`, the four ordinary movements | 0.1279 | 0.1444 | 0.1588 | 0.2259 | **0.20** | 1 / 620 |
| `approachReachError`, `close` | 0.2915 | 0.3268 | 0.3561 | 0.3594 | **0.35** | 2 / 155 |
| all 775 pooled, as RMS | 0.1807 | 0.3376 | 0.3831 | 0.4181 | -- | -- |
| all 775 pooled, as the old signed mean | **0.0029** | 0.0088 | 0.0337 | 0.0951 | -- | -- |
| `contactRateError` | 0.0368 | 0.1333 | 0.2000 | 0.4667 | **0.25** | 5 / 775 |
| the same rows, as the old raw Brier | 0.2104 | 0.2533 | 0.2889 | 0.4400 | -- | -- |
| `vitalityDeltaError` | 0.0237 | 0.0492 | 0.0832 | 0.1012 | **0.10** | 1 / 775 |

The fourth row is the point of the whole session in one line: **0.0029 where the pooled mean
absolute residual over the same 775 keys is 0.1606**, on the same rows, with the same delta.

**This table said "converged" and the distribution is not converged.** 384 solver steps per job
is a 1.6-second bout, which is the *peak* of the reach-error curve rather than its limit -- see
section 13. Reading a limit off a peak is the conservative direction for a bound and the wrong
direction for a quantile, and both sentences belong beside the numbers.

All four limits are live and all four refuse only a tail.

**How they are bounded, which is the part that was wrong.** The first version of
`each_deployed_limit_is_bounded_on_both_sides_by_the_sweep_that_chose_it` asserted an interval
around each *value* -- `0.20 < reachError < 0.35`, `0.20 < contactRateError < 0.45`,
`0.08 < vitalityDeltaError < 0.11` -- and **every one of the three bands admitted the exact
failure its own comment named**, all three leaving 542 green:

| value inside its passing band | what it does to the real 8x record |
| --- | --- |
| `reachError` 0.21 | refuses 156 / 775 and costs **all thirteen** bodies their approach |
| `vitalityDeltaError` 0.105 | refuses **0 / 775** -- the no-op the comment condemns |
| `contactRateError` 0.44 | refuses 1 / 775 |

That is `AGENTS.md`'s `FOV / 2 > 46` shape in a test written to avoid it. The record is now
checked in at `tests/fixtures/calibration-record.mjs` -- 775 keys, three columns each, at full
double precision because twenty of them sit within 3e-16 of 0.2 -- and
`each_deployed_limit_is_bounded_by_what_it_does_to_the_measured_record` computes every assertion
from it through `calibrationRefusal` itself rather than through a second copy of the three
comparisons. Each column at its deployed value against one notch either side:

| column | limit | refuses | one notch looser | one notch tighter |
| --- | ---: | ---: | --- | --- |
| `reachError` | 0.20 | 1, a `circle-right` | 0.23 refuses nothing | 0.15 refuses 13 across three classes; 0.12 empties three classes |
| `approachReachError` | 0.35 | 2 `close` | 0.36 refuses nothing | 0.30 refuses 66; 0.25 refuses 142 |
| `contactRateError` | 0.25 | 5 | 0.47 refuses nothing | 0.15 refuses 27 |
| `vitalityDeltaError` | 0.10 | 1 | 0.105 refuses nothing | 0.05 refuses 74 |

Whole gate at the deployed limits: **766 / 775**, no body without an approach, no cell with
nothing plannable at all.

### 5. Survival at all four budgets, under what is shipped

`.review/calgate/p11-sweep2.mjs` replicates `trainLookahead` exactly -- same three fit seeds, same
`budgetFor` consumption order, same validation seed, same best-of-three selection -- and dumps the
raw ingredients per candidate, so limits, champion and survival are resolved together offline
rather than each chosen from a sweep that already assumed the others.

| budget | steps/job | rows/key | held-out samples bit-identical | gate as it shipped | scalar `reachError` 0.30 | **gate as shipped now** | refused: reach / contact / vitality |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 148,800 (the minimum) | 48 | 1.00 | **775 / 775** | 100.0 % | 100.0 % | **100.0 %** | 0 / 0 / 0 |
| 297,600 | 96 | 3.00 | 651 / 775 | 99.6 % | 99.6 % | **99.6 %** | 0 / 3 / 0 |
| 595,200 | 192 | 6.00 | 164 / 775 | 98.7 % | 93.5 % | **99.4 %** | 0 / 2 / 3 |
| 1,190,400 | 384 | 14.99 | 3 / 775 | 84.8 % | 91.1 % | **98.8 %** | 3 / 5 / 1 |

**Fixing the metric costs nothing at either shipped budget and *buys* fourteen points at 8x**, on
quantities that mean something: the old gate threw away 118 cells at the largest budget and every
one of those refusals was the Brier refusing an uncertain outcome. The two-number reach column
adds the rest -- the scalar 0.30 column above is what section 3 replaces, and the difference
between it and the last column is `close` keys the reach residual was never able to judge.
**Bodies with no plannable approach: 2/13 and 1/13 under the scalar at 4x and 8x, 0/13 under the
split at every budget.**

**The recorded sweep is not exactly reproducible, and the disagreement is provenance rather than
this change.** The shipped-gate column above comes out 100.0 / 99.6 / **98.7** / **84.8** against
the recorded 100.0 / 99.6 / 98.6 / 85.0 -- one key of 775 and two of 775. My own runs *are*
bit-reproducible: two runs of `.review/calgate/p11-sweep2.mjs` at 595,200, one alone and one four-way parallel,
agree to **0.000e+0** on every one of 775 keys in all three candidates. My 148,800 and 297,600
dumps reproduce the recorded ones to **0.00e+0** as well; 595,200 and 1,190,400 do not (worst
disagreement 3.01e-2 and 8.51e-2 on the reach column, `.review/calgate/p18-repro.mjs`), and at 8x
the recorded run's champion appears to have been a different seed. `.review/calgate/sweep.txt`
records the live `src/options.ts` throwing `SWEEP is not defined` during the window those numbers
were taken in, and the snapshot of `src/options.ts` kept beside them in `.review/wt/` differs
from `HEAD` in **20 non-comment lines**, all inside `handActionOption` and the cover/guard writes
the trace collector drives. That is a sufficient account and it is not a confirmed one. Nothing
in sections 3 or 4 turns on it.

### 6. The champion score was 94 % Brier, and fixing it changed no champion

`calibrationScore` in `scripts/train-lookahead.mjs` summed `|signedReachError| + contactBrier +
vitalityDeltaError` over every cell -- three quantities in three units, which was never a score.
Measured decomposition of the winning candidate at each budget:

| budget | absolute signed reach | `contactBrier` | vitality | Brier share |
| ---: | ---: | ---: | ---: | ---: |
| 297,600 | 1.145 | 42.778 | 1.373 | **94.4 %** |
| 595,200 | 0.744 | 158.556 | 8.561 | **94.5 %** |
| 1,190,400 | 2.262 | 163.052 | 18.387 | **88.8 %** |

Since the Brier was 99.6 % base-rate variance, the champion seed was being chosen by which
validation bouts happened to contact least ambiguously. It is `calibrationSeverity` now -- each
column as a fraction of the tolerance the deployed gate gives it, so zero is a perfect fit and
1.0 per column is the refusal threshold.

**And the champion does not move.** Same seed under both scores at all four budgets:
`-1640774844` at the minimum, where all three candidates score exactly zero and the seed
tie-break decides, and `310013` at the other three. Recorded because a fix that changes no
outcome is worth knowing about -- the old score was choosing correctly by accident on this seed
set, and nothing here shows it would keep doing so.

**The inputs did move, and this under-sold it.** Three scores over the same three candidates
(`.review/rem20/an6.mjs`); the champion is the same seed in every row, and nothing else is:

| budget | pre-19, absolute signed reach + Brier + vitality | a raw sum of the three new columns | `calibrationSeverity` |
| ---: | --- | --- | --- |
| 297,600 | margin **1.844 %** | margin 8.402 % | margin 7.938 % |
| 595,200 | margin **0.003 %** | margin 1.668 % | margin 1.225 % |
| 1,190,400 | also-rans `-1640774844 < 5589923` | also-rans **`5589923 < -1640774844`** | also-rans `5589923 < -1640774844` |

At 595,200 the old score picked its winner by three thousandths of a percent; under severity the
margin is 1.225 %. At 1,190,400 the ranking of the two also-rans **swaps** between the pre-19
score and either of the new ones. A raw sum of the three *new* columns -- the revert section 11
found nothing was stopping -- changes no ranking at any budget on this seed set, only margins;
that is a narrower claim than "the champion never moves" and it is the one the numbers support.

### 7. The minimum budget is shipped with a warning, because its split is not a split

**Right measurement, wrong mechanism, corrected 2026-08-25.** This said the two splits "differ
only by +100000" on the seed. That is true of `researchMatrix` **at a fixed base seed** --
`evaluationSeed` mixes only `(base, cell)` and then offsets by the split's range -- and it is not
what runs. `trainLookahead` collects train rows under base `seed` and validation rows under base
`seed ^ 0x7f4a7c15`, and `collectTacticalTrace` rebuilds the matrix from the base it is handed,
so the two bouts start from actor seeds that differ by **12,613 to 180,739** across the 78 jobs
(39 distinct differences at seed 310013; `.review/rem20/an3.mjs`). The rows come back identical
anyway because **the opening of a bout is seed-insensitive**: two fighters start from the same
pose at the same separation and 48 solver steps is 0.2 s. The distinction matters because
"adjacent seeds" would be fixed by widening the offset and this would not. Measured per
(cell, tactic) key out of 775, seed 310013:

| steps/job | budget | keys whose held-out rows are bit-identical to their train rows |
| ---: | ---: | ---: |
| 48 | 148,800 -- the shipped minimum | **775 / 775** |
| 96 | 297,600 | 651 / 775 |
| 192 | 595,200 | 164 / 775 |
| 384 | 1,190,400 | 3 / 775 |

A **warning** and not a floor, because the model fitted at the minimum budget is fine -- it is
the evidence about the model that is not evidence. `MIN_SPLIT_STEPS_PER_JOB` is 192,
`splitWarningFor` returns the sentence rather than printing it so a test can assert it, and the
report carries `solverStepsPerJob`, `calibrationKeys`, `identicalCalibrationKeys` and
`splitWarning`. The count is **measured rather than inferred from the budget**, so it cannot go
stale when the schedule changes.

**192 is not where the split becomes a split, and the warning said it was.** 164 of 775 keys are
still bit-identical there -- **21 % of the calibration record in-sample under a held-out name** --
against 3 of 775 at 384, and a run at exactly 192 got no warning at all. Two repairs rather than
a moved floor, because the floor is where the *proxy* stops being useful and the count is what is
true:

- the sentence now reads "under the 192 at which **most** of the validation split becomes real",
  which is what the bracket in it actually shows;
- `lookaheadNotices` emits the measured count beside it whenever it is non-zero, so the run at
  192 says "164 of 775 keys got a validation sample bit-identical to their own training sample".
  A number nothing prints is a number nobody reads, and this one was in the report and in nothing
  else.

End to end at the shipped minimum, `node scripts/train-lookahead.mjs --seed 310013 --solver-steps
148800`: both sentences on stderr, and a report reading `solverStepsPerJob: 48`,
`calibrationKeys: 775`, `identicalCalibrationKeys: 775`, `selectedSeed: -1640774844`,
`modelDigest: 8b2a97a8` -- with all four calibration columns exactly zero on all 775 keys, which
is the degeneracy stated instead of hidden.

**A caveat on "on stderr" that is pre-existing and worth writing down.** Babylon's null engine
logs its banner through `console.log` once per bout, so `node scripts/train-lookahead.mjs >
report.json` writes about **158 KB** of `BJS - ...` before the first `{`. The notices are on
stderr because that is where a warning belongs, not because piping stdout into a file currently
produces a readable one. `writeLookaheadOutput`'s docstring carries it.

### 8. The session-17 stance decision, re-taken on the repaired metric

The decision not to key the planner's cells on the stance was taken partly on a reach column of
0.0081 against 0.0099 -- `|signedReachError|`, the statistic this session established is
identically zero in-sample. It deserved re-stating, and it **strengthens**.

`.review/calgate/p12-stance.mjs`, session 17's own 18,494 Havok rows, three-fold, every number
produced by calling `fitTacticalModel` and `calibrateTacticalModel` rather than re-implementing
them -- which is the correction over `.review/calgate/p10-stance-recheck.mjs`, a probe holding its own copy of
the rule it was asking about:

| column | stance-keyed | stance-free | keyed minus free |
| --- | ---: | ---: | ---: |
| `reachError` (warrior, 126 folds) | 0.0721 | **0.0709** | +0.0012 |
| `contactRateError` | **0.0431** | 0.0477 | -0.0046 |
| `vitalityDeltaError` | 0.0241 | **0.0230** | +0.0011 |
| `reachError` (all nine, 162 folds) | 0.0769 | **0.0759** | +0.0009 |
| `contactRateError` | **0.0335** | 0.0371 | -0.0036 |
| `vitalityDeltaError` | 0.0188 | **0.0180** | +0.0008 |

**Corrected 2026-08-25: "two of three columns say worse" is a vote across three quantities in
three units, which is the exact fallacy this session convicts the old champion score of.** Read
through `calibrationSeverity` -- the score this change introduced precisely because a sum of
three units was never a score -- on the same folds, with the deployed limits, and with each fold
keyed on its own tactic so the reach scale is the movement's own
(`.review/rem20/stance.mjs`):

| fold set | stance-keyed | stance-free | keyed minus free | as a share of the 3.0-per-cell scale |
| --- | ---: | ---: | ---: | ---: |
| warrior, 126 folds | **0.73597** | 0.73751 | -0.00155 | -0.052 % |
| all nine, 162 folds | **0.63847** | 0.63967 | -0.00120 | -0.040 % |

So stance-keying is marginally **better**, not worse, on both fold sets. **The decision is
unchanged and the reason is the size rather than the sign: the effect is under a tenth of a
percent either way, which is not a difference.** A 6x enumeration cost buys a fit that is not
measurably better on the columns being fitted, and that was always the whole argument.
`UNLEARNED_STANCE`'s docstring carries both tables.

### 9. What the coverage space is

Three spaces, and they disagree, which is the finding in sections 3 and 13.

- **The schedule sweep** is the surface the gate judges: 13 body/loadout cells times every legal
  `(action, effector, target)` times 5 movements = **775 keys**, four budgets, three fit seeds
  each. (**15 cells and 945 keys since `sword+axe` joined the strata.** The sweep itself was not
  re-taken -- it is a dump of particular bouts and re-running it is 1,451,520 solver steps -- so
  every figure in this session is "of the 775 measured" and none of them has seen a
  `cut+secondary+*` key.) It covers every movement, every action a body can perform, and both units. It does
  **not** cover a severed body -- every bout starts intact, see section 14 -- and it does not
  vary the stance, which is held at `UNLEARNED_STANCE` throughout. **It is one bout length per
  budget**, and the longest of the four is 1.6 s.
- **The stance fixture** is nine forced tuples times six stances times three seeds on 4,800-step
  bouts, 18,494 rows. It has more rows per fold and therefore finer resolution on
  `contactRateError`; only one of its nine tuples is a `close` on a warrior, and **its bouts are
  12.5x longer than the longest schedule sweep**. Section 3's first version blamed the tuple mix
  for the whole 0.1357-against-0.2915 gap and the tuple mix accounts for 0.1357 -> 0.1619 of it.
- **The convergence probe** (section 13) is five keys across six bout lengths from 0.8 s to 20 s,
  which is the axis neither of the other two varies. It is narrow on keys and is the only one of
  the three that can see the axis the limits are most sensitive to.

Reading a global limit off the second was one mistake section 3 corrects; reading a *quantile*
off the first without knowing where 1.6 s sits on the curve was the other. Neither covers what
happens to a *deployed* look-ahead in a bout: no fighter in this session was driven by a
calibrated beam, and every number here is about the calibration record rather than about winning.

### 10. The mutation table

Every test added or touched, watched failing under a deliberate mutation of the line it is about.
Two batteries: `.review/calgate/mutcheck19.mjs` for the first pass, and
`.review/rem20/mut.mjs` for the remediation. Both report a missing pattern *as* a missing
pattern, and the second one **throws when it cannot parse a pass/fail count**, because the first
version of it printed `pass NaN fail NaN` for every case and called all eleven of them "not
noticed" -- a harness that reports "not noticed" and "nothing to notice" identically is the
defect this table exists to avoid, in the tool used to avoid it.

**Three guards did not guard, and all three survived the first pass.** Each is stated with what
it cost, because a mutation that leaves the suite green is only interesting if its blast radius
is known:

| mutation that left 542 green | what it did to the real 8x record |
| --- | --- |
| the reach and vitality limit keys swapped in `calibrationRefusal` | survival 706/775 -> **140/775**; `centipede/natural:bite` loses **every** cell, which makes `lookaheadMind` throw "no calibrated model for any tactic" mid-bout |
| `fitGroups(cellRows)` -> `fitGroups(rows)` in `fitTacticalModel` | every cell fitted from the pooled rows; invisible because every fixture had exactly one loadout |
| the `Math.max(0, ...)` clamp removed | 497 of 2,325 records become `NaN` and are **admitted** -- see section 12 |
| `reachError` 0.21, inside its own passing band | refuses 156/775 and costs **all thirteen** bodies their approach |
| `vitalityDeltaError` 0.105, inside its own passing band | refuses **0/775** -- the no-op the band's own comment condemns |
| `contactRateError` 0.44, inside its own passing band | refuses 1/775 |

The 23-case remediation battery and what each turned red (`.review/rem20/mut-after.txt`):

| mutation | tests that went red |
| --- | --- |
| the reach and vitality limit keys swapped | `each_calibration_limit_refuses_...` **and 2 more** |
| the reach column stops being keyed on the movement | `each_deployed_limit_is_bounded_...` **and 4 more** |
| the approach and ordinary reach limits swapped | 7 tests |
| every cell fitted from the pooled rows | `each_calibration_limit_refuses_...` |
| the gate stops reading the contact column | `the_contact_column_refuses_a_breach_...` **and 2 more** |
| the `max(0, ...)` clamp removed, and separately replaced by `Math.abs` | `the_contact_column_clamps_the_negative_excess_...` |
| `reachError` 0.23 / 0.15 | `each_deployed_limit_is_bounded_...` |
| `approachReachError` 0.30 / 0.36 | `each_deployed_limit_is_bounded_...` |
| `vitalityDeltaError` 0.105, `contactRateError` 0.44 | `each_deployed_limit_is_bounded_...` |
| the two reach limits collapse to one number | `each_deployed_limit_is_bounded_...` **and 1 more** |
| `calibrationSeverity` stops scaling reach by the movement | `the_champion_score_scales_every_column_...` **and 1 more** |
| `calibrationScore` reverts to a raw sum of the three columns | `the_champion_is_chosen_by_severity_...` |
| the champion tie-break stops being the seed | `the_champion_is_chosen_by_severity_...` |
| `identicalCalibrationKeys` deleted from the report | `the_lookahead_report_carries_the_whole_record_...` **and 1 more** |
| `splitWarning` deleted from the report | `the_lookahead_report_carries_the_whole_record_...` **and 1 more** |
| the stderr write disabled / moved to stdout / the measured notice dropped | `a_lookahead_run_puts_its_notices_on_stderr_...` |
| `splitWarningFor` fed a constant 384, or the consumed budget | `the_lookahead_report_carries_the_whole_record_...` |
| the warning claims 192 is where the split becomes a split | `the_minimum_budget_is_shipped_with_a_warning_...` |

The first pass's eighteen mutations still hold against the repaired tests, except that the three
band assertions they targeted no longer exist; what replaced them is in section 4.

**What these tests still do not catch**, stated because a mutation table that lists only its
successes is a coverage claim nobody checked:

- **`runLookaheadCli`'s own three lines.** Argument parsing, the two `writeAtomic` calls and the
  `writeLookaheadOutput` call are unasserted, because reaching them costs 148,800 solver steps.
  Everything they call is asserted; the call itself is not. Deleting the
  `writeLookaheadOutput(...)` line would leave the suite green.
- **`trainLookahead` calling `selectCalibratedCandidate`.** Replacing it with `candidates[0]`
  would leave the suite green for the same reason.
- **`calibrationRefusal`'s `>` becoming `>=`.** No fixture sits exactly on a limit. Section 14
  says how easily one could be moved onto it and why the boundary matters less than it did.
- **the record going stale.** `tests/fixtures/calibration-record.mjs` is a copy of a sweep, so a
  change to `calibrationFor` moves what a run would produce and does not move the fixture. The
  fixture bounds the *limits*; it cannot notice the statistic underneath them changing.
- **the `localeCompare` ordering inside `fitGroups`.** Key order in the fitted record is asserted
  nowhere, and it feeds `model.digest`.
- **`each_calibration_limit_refuses_...` does not catch a moved deployed limit**, because it
  builds its own; and `each_deployed_limit_is_bounded_...` does not catch a broken statistic,
  because it reads the checked-in record. Each covers what the other cannot.

### 11. Five pieces of wiring nothing tested

All five left the whole suite green, and together they are a full revert of section 6's champion
score with no failing test and no changed artifact:

| revert | why nothing noticed |
| --- | --- |
| `calibrationScore` back to a raw sum of the three new columns | the score was a closure inside `trainLookahead`, reachable only by spending a budget |
| `identicalCalibrationKeys` deleted from the report | nothing read the report |
| `splitWarning` deleted from the report | `the_minimum_budget_is_shipped_with_a_warning_...` asserts the pure function and never that anything ships it, while its **name** claims the shipping |
| the stderr write disabled | nothing read the stream |
| `splitWarningFor` handed a constant steps-per-job | nothing built a report at two budgets |

The repair is four exports rather than four closures: `modelCalibrationScore` and
`selectCalibratedCandidate` for the champion, `lookaheadReport` for the record, and
`lookaheadNotices` / `writeLookaheadOutput` for what a run says. Each is asserted whole against a
freshly stated one, which is the shape that grows with the thing instead of listing the field
names somebody remembered.

### 12. The `max(0, ...)` clamp fires, on the cells the model gets exactly right

`calibrationFor` said "the excess is non-negative for any constant prediction", and the mutation
table certified the clamp untestable: "it cannot be reached while predictions are constant, which
they are for every model this trainer produces". **Both are wrong.** The excess is non-negative in
exact arithmetic; in IEEE doubles it is a row-summed Brier minus a separately computed `q(1-q)`,
and where `p === q` those land a few ulps either side of each other.

Measured on the 1,190,400-step sweep (`.review/rev19/clampreal.mjs`): **497 of 2,325 records have
`brier - q(1-q) < 0`**, most negative **-8.327e-17**, and **all 497 have `p === q` exactly** --
they are the cells the model gets exactly right. Remove the clamp and `Math.sqrt(-8.3e-17)` is
`NaN`, `NaN > 0.25` is `false`, and the gate **admits** every one of them without reading the
column: a fail-open guard under a comment asserting it cannot fire.

**The three smaller budgets produce no negative excess at all** -- 0 of 2,325 at each -- because
their row counts make `p` and `q` fractions whose arithmetic is exact. That is why five sessions
of a suite that never spends 1,190,400 solver steps could not have met this by accident, and it
is what makes the fixture worth stating exactly: `p = 1/3, q = 7/21` is the smallest case, and
`the_contact_column_clamps_the_negative_excess_a_perfect_fit_produces` is built on it.

### 13. The reach column does not converge, and every limit is read off its peak

Section 4 called its distribution "converged". It is not. Same keys, same fit-and-calibrate path,
bout length as the only thing that moves (`.review/rem20/converge.mjs`, held-out `reachError`):

| key | 0.8 s | 1.6 s | 3.2 s | 6.4 s | 10 s | 20 s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `warrior/sword+empty close+thrust+primary+vital` | 0.2906 | **0.3133** | 0.2576 | 0.1849 | 0.1549 | **0.1187** |
| `centipede/natural:bite close+bite+natural+vital` | 0.2367 | **0.3433** | 0.3059 | 0.2737 | 0.2302 | **0.1614** |
| `warrior/sword+empty circle-left+cut+primary+vital` | 0.1013 | **0.1329** | 0.1190 | 0.0999 | 0.1011 | 0.0942 |
| `warrior/sword+empty hold+cut+primary+vital` | 0.0707 | **0.1351** | 0.1006 | 0.1093 | 0.0994 | 0.0897 |
| `warrior/sword+empty disengage+cover+primary+threat` | 0.0447 | **0.0807** | 0.0686 | 0.0692 | 0.0682 | 0.0683 |

**Every one of the five peaks at 1.6 s**, which is exactly the 8x budget the limits were read off.
The two `close` keys then fall by **2.6x** and **2.1x** by 20 s and the three non-approach keys by
**1.2x to 1.5x**. (Three of the four ordinary movements, not four: `circle-right` was not probed,
which is what this probe's coverage space is.) Two consequences:

- **the two "modes" are partly an artifact of the window.** At 20 s the gap between `close` and
  the rest is 1.3--1.8x, not the near-disjoint pair the 1.6 s snapshot shows.
- **a limit that refuses only gross outliers at 1.6 s refuses nothing normal at any other
  window**, which is the direction a bound wants to be conservative in and the wrong direction
  for a quantile. Section 4 now says so beside the table.

This also relocates section 3's causal story. The stance fixture's bouts are 4,800 steps and the
8x schedule sweep's are 384, so 0.1619 -> 0.2915 is the window, not the tuple mix -- and "spend
more steps" would *lower* the reach column rather than raise it.

### 14. Two smaller corrections

**The 0.25 boundary is an ordinary interior point now.** The old mutation table said "every
fixture sits well away from its limit". Understated: over an enumerated fixture set of train
1..24 rows by held-out 1..24 rows -- 104,976 cases -- `contactRateError` lands **exactly** on
0.25 in **976** of them through the shipped row-summed Brier (1,032 through the closed form; the
two disagree in the last bits, which is the same fact section 12 is about). `p = 0/1, q = 1/4` is
one line away. It lands on 0.25 in **0 of 9,300** real records across the four budgets. So `>`
against `>=` is untested and is no longer *load-bearing*: under the Brier the limit sat on the
statistic's algebraic ceiling, and under `contactRateError` it is an interior point like any
other. Stated rather than fixed.

**"One body of thirteen loses `close` at 8x" was an intact-body figure.** `lookaheadMind` fixes
`bodyLoadout` at construction, so severance changes the legal tuple set and never the calibration
record consulted -- a bare-fisted warrior that loses its off hand is planning over the
`warrior/empty+empty` record with half its tuples gone. Broken out by effector at the old scalar
0.30 (`.review/rem20/an3.mjs`):

| cell | primary `close` kept | secondary `close` kept |
| --- | ---: | ---: |
| `warrior/empty+empty` | **0 / 6** | 2 / 6 |
| `warrior/sword+shield` | 3 / 10 | 2 / 4 |
| `warrior/bow+empty` | 1 / 7 | none to keep |
| `warrior/axe+empty` | 1 / 7 | 3 / 6 |

A `warrior/empty+empty` that loses its off hand keeps **no** approach at all under the scalar and
joins the centipede. At the shipped `approachReachError` of 0.35 those four cells read 6/6 and
6/6, 9/10 and 4/4, 7/7, and 7/7 and 6/6 -- so a severed body stops being a cliff, which is a
second reason the split is worth its code. The schedule sweep still starts every bout intact, so
none of this is *covered*; it is inferred from which keys the gate admits, which is exactly what
`lookaheadMind` will consult when a hand comes off.

### 15. The gate

`npx tsc --noEmit` clean. `npm test` **550 passed**, 0 failed -- 538 before the session, 542 after
the first pass, eight more added by the remediation.
`npm run build` clean. `git diff --numstat` md5-identical to
`git diff --ignore-cr-at-eol --numstat`. The null control unmoved for the ninth stage running:
`npm run measure -- --only duelist-swinger --bouts 120`, seed 20260823 -- duelist **66/120 =
55.0 %**, bout length **3.52 s (1.42-8.98)**, damage **176.17**, **10** severs, **1496** and
**1670** scoring contacts, and the same final-blow region histogram.

`model.digest` moves, which was predicted and then checked rather than assumed: the calibration
record is inside the digested body and three of its four fields are new or redefined. Nothing
pins a digest value -- `tests/lookahead.test.mjs` asserts only `/^[0-9a-f]{8}$/` -- and the one
committed look-ahead artifact, `asset-src/learning/research/session18-minimum`, is refused a
layer up at `featureVersion` 3 against runtime 4 and carries no `tacticVersion` at all. Both
verified by reading the artifact's bytes.

## Session 27: a loadout where an attacking action names two hands -- 2026-08-25

The tactic contract is 26 outputs, one head of which chooses the effector. A tournament is
supposed to be able to tell "the policy's effector head learned something" from "the body only
ever offered one hand". It could not, and this is the measurement that says why and the one that
says what changed.

### 1. The legal-effector table, before and after

Harness `.review/sa27/cells.mjs`, descended from `.review/rem26/cells.mjs` -- which no longer
runs, because it still reads the `freeChoiceCounts.action` map the `FREE_CHOICE_HEADS` theorem
deleted.

**Coverage space, stated exactly.** One bout per (unit, loadout) x every `RESEARCH_OPPONENTS`,
mirror 0 only, split `train`, base seed 310013, 1200 solver steps (5 s) each -- 39 bouts and 1771
decisions before, 45 bouts and 2058 after. The actor is a `researchLabelMind` walking
`deployableTactics` round-robin at `MIN_PERSISTENCE`, so it names every legal tuple the body
offers. `tacticEffectors` is read for **every** action at **every physics sample**, not only at
decisions, so a hand severed mid-bout is inside the space. **What it cannot see:** mirror 1, any
seed but 310013, any bout longer than five seconds, and any stance -- `deployableTactics` does not
enumerate stances. It also cannot see a loadout that is not in the strata, which is the whole
point: the table below is a fact about the matrix and not about the body space.

| loadout | actions with two or more legal effectors | actions with exactly one |
| --- | --- | --- |
| `sword+empty` | cover, recover | cut, thrust, punch |
| `sword+shield`, `sword+buckler` | cover, recover | cut, thrust |
| **`sword+axe`** | **cover, cut, recover** | **thrust** |
| `axe+empty` | cover, recover | cut, punch |
| `bow+empty` | **none** | cover, shoot, recover |
| `empty+empty` | cover, punch, recover | none |
| `natural:bite` | **none** | bite, recover |

`broot` is identical to `warrior` row for row, before and after.

| question | before (13 cells) | after (15 cells) |
| --- | ---: | ---: |
| cells where an **attacking** action has two or more legal effectors | 2 | **4** |
| ... of which are weapon-bearing | 0 | **2** |
| cells whose only free-effector actions are `cover`/`recover` | 8 | **8** |
| cells where the effector head never has a choice | 3 | 3 |
| pooled decisions | 1771 | 2058 |
| pooled free-effector decisions | 889 (50.2 %) | 1130 (54.9 %) |
| decision mass in the effector-blind cells | 23.4 % | **20.1 %** |
| free-effector decisions from the two `empty+empty` cells | 28.5 % | **24.4 %** |

**The count of cover-or-recover-only cells did not fall, and "8 of 15" rather than "8 of 13" is
the whole of the difference on that line.** The widening *added* two answerable cells; it repaired
none of the eight. That is as much as one loadout can buy, and saying so is the difference between
a record and an advertisement.

**`thrust` reaches one hand on `sword+axe`, not two, and the decision note that asked for this
change said two.** `isHeldStriker` accepts an axe, so `cut` names both hands; `hasPoint` refuses
it, so `thrust` names only the sword one; `punch` needs an empty hand and both are full. That is
better than the note assumed rather than worse -- an action that names the hand beside an action
that cannot is what separates "the effector head decided" from "the loadout decided", and it is
why `sword+axe` and not `sword+sword`, where no action distinguishes the hands at all.

### 2. What the strata change cost, re-derived from the live tables

`.review/sa27/schedule.mjs` reads `lookaheadTacticCellSchedule`, `actionsFor` and `tacticsFor`
rather than multiplying a cell count; `.review/sa27/tuplespace.mjs` enumerates 393 synthetic
bodies and derives its cell list from `RESEARCH_STRATA`.

| quantity | before | after | measured by |
| --- | ---: | ---: | --- |
| distinct (unit, loadout) cells | 13 | **15** | `.review/sa27/schedule.mjs` |
| distinct loadouts | 7 | **8** | `.review/sa27/schedule.mjs` |
| `RESEARCH_STRATA` rows | 39 | **45** | `.review/sa27/schedule.mjs` |
| `researchMatrix` jobs per split | 78 | **90** | `.review/sa27/schedule.mjs` |
| `lookaheadTacticCellSchedule` tasks per split | 775 | **945** | `.review/sa27/schedule.mjs` |
| its groups (`3 x train + validation`) | 3,100 | **3,780** | `.review/sa27/schedule.mjs` |
| its minimum solver-step budget | 148,800 | **181,440** | `.review/sa27/schedule.mjs` |
| pre-C2c `(movement, action)` tasks per split | 240 | **280** | `.review/sa27/schedule.mjs` |
| widest tuple set over the research cells | 16 (`sword+empty`) | **17 (`sword+axe`)** | `.review/sa27/tuplespace.mjs` |
| union of `deployableTactics` over the research cells | 24 | **27** | `.review/sa27/tuplespace.mjs`, and `.review/sa27/cells.mjs` on real bouts |
| widest over the whole body space | 21 | 21 | `.review/sa27/tuplespace.mjs` |
| union over the whole body space | 33 | 33 | `.review/sa27/tuplespace.mjs` |
| `curriculumDigest()` | `f9d5c046` | **`a011a028`** | `curriculumDigest()` |
| QD arithmetic, 125 x union | 3,000 cells, 3.4 per evaluation | **3,375, 3.0** | arithmetic on the union |
| `sword+axe` nodes per replan | -- | **3,655** | `exactLookaheadNodeBudget(85)` |

**The schedule cost is 22 %, not the ~15 % the cell count predicts**, because the two columns do
not scale together: `sword+axe` has four actions -- ordinary -- and 17 tuples, which is the widest
row in the table. A cell-count multiplier applied to either figure gets the other wrong. The three
whole-body-space figures did not move and could not have: that enumeration already contained every
ordered weapon pair, `sword+axe` included.

**What was superseded and deliberately not renumbered.** The 775-key calibration record in
`tests/fixtures/calibration-record.mjs` and every figure session 19 reads off it are measurements
of particular bouts on a schedule that no longer exists. They stay as they are; re-taking them
costs 1,451,520 solver steps at the 8x budget, which is a compute decision. None of them has seen
a `cut+secondary+*` key, and `sword+axe` contributes **170** new (cell, tactic) keys of which 15
spell a tactic no cell of the old schedule could.

### 3. Where the loadout lands in the curriculum, decided rather than inherited

Two of the five stage filters could have taken it and one does.

- **`moving-unguarded`: out.** Its filter names one loadout and that is what the stage is -- the
  second rung, teaching approach against `random-meta` on the body with the least tactical
  surface. `sword+axe` is literally unguarded, so the stage's *name* admits it, and it has
  strictly more surface than `sword+empty`. The effector head is not what this stage is about.
- **`guarding-specialist`: in.** That filter is a negation -- everything but `bow+empty` -- and
  the exclusion is *ranged*, not *unnamed*. `sword+axe` covers with either hand and fights in
  measure, so it belongs by the same property the bow is refused by, and it is the first rung on
  which the effector head has a choice while attacking.

Stage sizes after: stationary 1, moving-unguarded 2, guarding-specialist 13, mixed 42, complete 45.

### 4. The null control did not move

`npm run measure -- --only duelist-swinger --bouts 120`, seed 20260823: duelist **66/120 =
55.0 %**, bout length **3.52 s (1.42-8.98)**, damage **176.17**, **10** severs, **1496** and
**1670** scoring contacts. Identical to the pin.

**What that proves is less than it looks, and the closure is the reason.** Measured at
`.review/sa27/closure.mjs`, the transitive import closure of `scripts/measure.mjs` is **26 local
modules** -- 25 sources plus `asset-src/textures.json` -- and **none of them is under
`src/learning/`**. So the null control cannot move for a strata change and is a regression check
on the physics and scoring rather than evidence about this one. (The figure was written down as 29
elsewhere; that count included four extensionless specifiers the walker failed to resolve and so
treated as leaves. `existsSync` with a `.ts` fallback is the fix, and the conclusion is unchanged.)

## The file references and the line anchors, under a check — 2026-08-25

`tests/docs.test.mjs` gates every backticked file reference and line anchor outside `docs/plans/`,
and pins the plan set from both sides instead of repairing it. `docs/deleted-paths.md` is the
generated register that lets an accurate reference to a deleted file pass without anybody
hand-maintaining a list of excuses.

**Coverage space.** Every `.ts`, `.tsx`, `.mjs`, `.cjs`, `.js`, `.jsx` and `.md` file under
`sword-prototype/`, excluding `node_modules`, `dist`, `.deps-stage`, `public`, `asset-src`, `.git`
and the gitignored `.review` — plus one more exclusion, `tests/docs.test.mjs` itself, because a
checker has to quote every spelling it parses including the deliberately broken ones, and sweeping
the grammar documentation would make it fail its own grammar.

### Three sweeps of the same tree, reconciled rather than picked between

Every row names its extension set and its grammar, because the first four numbers taken in this
effort were each exact over a space nobody had written down.

| sweep | files scanned | anchor grammar | resolver | references | that the rule could not verify |
| --- | --- | --- | --- | ---: | --- |
| register entry 10, at `ab52947` | `.ts` `.mjs` `.js` `.md` | `path#Lnnn` and `path:nnn` only | whole tree, `.review` and `dist` included | 1,520 | 114 |
| the pre-work sweep, at `503bd0a` | the same four | the same two | the same | 1,830 | 145; 112 explained by the git deletion log, 33 residue |
| this gate, at `503bd0a` | seven: `.ts` `.tsx` `.mjs` `.cjs` `.js` `.jsx` `.md` | four spellings, and spans quoted inside spans | tree without `.review` or `dist`, then the repository root, then `node_modules`, then the register | 1,887 | 50: **19 durable**, 31 in `docs/plans/` |
| this gate, at the commit that lands it | the same seven | the same four | the same, and three more extensions judged | 2,043 | 33 in `docs/plans/`, 0 durable |

**The +57 is grammar, not drift, and it splits exactly**: 41 bare `:nnn` continuations carrying the
preceding file name, 5 more continuations with no file name to carry, 3 spans quoted inside a wider
span, and 8 comma lists and multi-range anchors. The bare continuation is live in source, not just
quoted in prose — `src/learning/tournament.ts` writes `research-policy.ts:98`, then `:95` and
`:54-56` on the two lines after it, and `lookahead.ts:294` then `:291`.

**A fourth count, 143, is the same measurement with brace expansions dropped.** An adversarial
re-measure produced 143 stale and 15 durable residue against 145 and 17. The whole difference is
`asset-src/learning/{baseline,engagement-baseline,unpromoted}-v1.json` and
`.review/rem2/cutseeds-{before,after}.json`, which name two and three files in one span. This gate
excludes them by rule — a brace expansion is not a path — rather than by counting them either way.

### The anchor counts, and the space each one is exact over

**206 / 197 / 9 seeded this whole effort and is exact over a space that was never stated.** It is
the two-spelling grammar — `path#Lnnn` and `path:nnn`, comma lists dropped because a trailing
`,151` defeats the regex — over the seven extensions, at `503bd0a`. Restricting it to `.md` files
gives **204 / 197 / 7**, not 206: the missing two are the live continuations in
`src/learning/tournament.ts`, and they are exactly the pair that makes the durable half 9 rather
than 7. So the narrow thing was the grammar, not the extension set.

| grammar | extensions | tree | anchors | in `docs/plans/` | durable |
| --- | --- | --- | ---: | ---: | ---: |
| two spellings | `.md` only | at `503bd0a` | 204 | 197 | 7 |
| two spellings | seven | at `503bd0a` | **206** | 197 | 9 |
| four spellings, orphans excluded | seven | at `503bd0a` | 258 | 242 | 16 |
| four spellings, orphans included | seven | at `503bd0a` | 263 | 247 | 16 |
| four spellings, orphans excluded | seven | **at the commit that lands this** | 290 | 242 | 48 |
| four spellings, orphans included | seven | **at the commit that lands this** | 295 | 247 | 48 |

An orphan is a bare `:nnn` with no file name within five lines to continue; it carries a line
number and no file, so whether it is an anchor is a definition rather than a measurement. Both
definitions are given because two independent sweeps of this tree chose differently and agreed
everywhere else.

**This change is itself the largest single mover of the durable half**, which is the reason to take
the number at the state that commits rather than at `503bd0a`: the section you are reading writes
anchors of its own, and the durable count goes 16 to 48 because of it. A sentence stating
"the durable surface has nine anchors" would have shipped false in the commit that made it false.

### The first sweep's resolver searched two directories that do not survive a clone

`.review/` is gitignored and `dist/` is build output, and the first sweep resolved bare file names
against both. **At `503bd0a`, 146 durable references named a target under `.review/`** and therefore
resolved only on the machine that wrote them.

**145 and 146 are two populations and this file used one number for both, which is the same defect
one level down.** 146 is every durable span whose target begins `.review/`; 145 is how many of them
reach the scratch rule, because `.review/rem2/cutseeds-{before,after}.json` is a brace expansion and
the shape rule takes it first. The live figure is 166: 146, plus the sixteen short forms
completed below, plus the mentions this section adds writing it all down. They are not defects: AGENTS.md asks for a number's provenance and the
provenance of most numbers in this file is a throwaway probe. They are excluded by a stated rule,
and the rule's premise — that `.review/` is gitignored — is asserted against `.gitignore` rather
than assumed, so un-ignoring it turns the exclusion red instead of leaving it silently unearned.

Sixteen references were the same provenance written as a bare basename with no directory — eight of
schedule.mjs and four of tuplespace.mjs in the session-27 table, plus cells.mjs, p11-sweep2.mjs,
p10-stance-recheck.mjs and p4-sweep.mjs, all written here without backticks for the reason given two
sections down. Each now carries its directory (`.review/sa27/schedule.mjs`,
`.review/calgate/p4-sweep.mjs`), which is strictly better prose: a reader who saw the bare name
could not tell that no such file was ever checked in.

### Why the repository's own anchor rule was rejected for this tree

`tools/check_docs.js` requires an anchor to land on a declaration, an attribute or the first line of
a comment block. Run over the 206 anchors the two-spelling grammar finds at `503bd0a` it splits
**94 accepted, 101 mid-statement, 11 into files that no longer exist, 0 out of range**. Re-run under
the four-spelling grammar this gate uses, over anchors that resolve to a source file — the only ones
the rule can be asked about — it is **135 mid-statement of 233 at `503bd0a`, and 149 of 254
at the commit that lands this**. The ratio is the finding and it holds over every one of those
spaces; the 101/206 spelling is kept because it is what the decision was taken on. Almost all of
them are correct,
because this prototype's house style points at the line that *does the thing*. `measure.mjs:348` is
`for (const side of sides) side.combat.advance(FRAME);`. Adopting the rule would mean re-pointing a
hundred correct anchors at the nearest `export` above them: worse prose, and no more durable.

**A symbol-proximity heuristic was tried and rejected as an assertion too, after it was falsified.**
It asked whether an identifier-like code span in the surrounding prose appears within four lines of
the anchor's target, and reported roughly 45 rotted anchors. `src/learning/tournament.ts:253` names
`lookaheadMind` and anchors `lookahead.ts:294`; the heuristic called it stale because
`lookaheadMind` is declared at `lookahead.ts:255`. Both anchors are right — line 294 is the
`onDecision` call and `:291` is the `option.enter(view)` before it. The prose names the caller and
the anchor points at the call. `tools/check_docs.js` documents the same asymmetry from the other
side: it accepts an anchor landing on a call of the symbol it names, "which is why the gate is a rot
detector and not a symbol resolver". So 45 is an upper bound of unknown tightness, it is not a
defect count, and nothing in the gate is pinned to it.

What is gated is the exact rule: the file resolves, and every line the span names is inside it.

### The durable anchors needed nothing, and that is a finding

Under the exact rule, **zero** durable anchors fail — at `503bd0a`, where there were 16 of them
under the four-spelling grammar, and at the commit that lands this, where there are 48. One is
excluded rather than checked: this file's own quotation of the deliberately out-of-range probe href
two sections above, which the base-dependent rule takes and which is pinned as one of exactly two
such spans. The rest are range-checked and pass, including
`node_modules/@babylonjs/core/Physics/v2/Plugins/havokPlugin.js:1210` against a 2,753-line file.
Nothing to notice is different from not noticed, and the difference is that there is now a test.

Four of the sixteen at `503bd0a` were candidates for re-pointing and each was decided rather than
swept:

- **`bout.ts:207` and `combat.ts:265` are left exactly as they are.** They are rows in a dated
  findings table recording what six lookups did with a weapon kind they had never heard of, and
  those anchors were true when the measurement was taken. Line 207 is now a parameter of
  `withEquipment` and line 265 is `Combat.stop`, so both have rotted — and re-pointing them would
  make a dated record read as freshly verified, which this file already calls worse than leaving it.
  A dated row is a record, not a pointer.
- **`options.ts:190` and `options.ts:461` are left exactly as they are** because they are correct:
  the passage above quotes them *as examples of stale anchors*, and a quotation that has been
  silently corrected is no longer evidence of anything.

### The two anchors that looked stale, and were the checker guessing wrong

The bare `:nnn` continuation is the one spelling with no file name of its own, so the checker has
to decide which file it continues, and the rule it uses is the nearest preceding file name within
five lines. **That rule is a guess, and this tree contains two places where it guesses wrong.**
Both were first reported as anchors pointing past the end of their file, and both survived a
review pass before being read properly:

| written at | span | carrier the rule guessed | its length | the carrier the prose means |
| --- | --- | --- | ---: | --- |
| the session-17 plan, the bullet whose subject is `src/learning/promotion.ts` | :118 | `quality-diversity.ts` | 108 | `src/learning/promotion.ts`, the bolded subject of the bullet five lines up |
| the session-17 plan, under the `evaluate-options.mjs` heading | :118-130,324 | `evaluation.ts` | 172 | `evaluate-options.mjs`, named in the section heading fourteen lines up |

The first sits in a bullet whose subject is `src/learning/promotion.ts` and whose sentence
attributes both offsets to **it** -- the bullet's subject -- while the file name in between belongs
to a different clause. The second sits in a numbered list under the heading "What
`evaluate-options.mjs` knows that nothing else does", where every bare anchor in the list is an
offset into that deleted script. Both true carriers are deleted files, so both anchors are
`anchorIntoDeletedFile` and neither is stale.

**So no anchor in this tree names a line past the end of its file**, and the found-not-fixed
register was right to say so. An independent sweep of the other three spellings -- expanding every
range and comma list, resolving by unique path suffix, checking each line against its file's
length -- also found zero. The two disagreed only on the spelling that sweep did not implement.

Widening the window does not fix it: a section heading is in no window at all, and the first case
has two intervening file names inside five lines. So the checker reports a range failure on a
continuation as `continuationCarrierUnverified` rather than as a stale anchor, and puts the carrier
it guessed into the record so the next reader can check it in one step. `lineOutOfRange` is pinned
at **0** on both surfaces and means only what it says.

**One more off-by-one was found taking this measurement.** The rule counted a file's lines by
splitting on the newline pattern and taking the number of pieces, which is one too many for a
newline-terminated file -- so it was lenient by exactly one and would have passed an anchor one
line past the end. Corrected to the
last line's number; `quality-diversity.ts` is 108 and `evaluation.ts` is 172, both agreeing with
`wc -l`.

### Every test, watched failing

**Show the test failing, or you have not written one.** Section 10's rule applied to this change:
every one of the fifteen tests was watched going red under a deliberate mutation, and three controls
were run to show that a documented blind spot is real rather than argued.

**The mutation column is written without backticks on purpose.** These are literal edits, and a code
span here would be a live reference this gate judges — three of them are deliberately broken
pointers, and one is an anchor deliberately past the end of its file.

| # | mutation, verbatim | goes red |
| --- | --- | --- |
| M1 | ANCHOR loses its comma-list branch: :((?:\d+(?:-\d+)?)(?:,\d+(?:-\d+)?)*) becomes :(\d+(?:-\d+)?) | the scanner self-test; the plan pin |
| M2 | CONTINUATION_LINES = 5 becomes CONTINUATION_LINES = 0 | the continuation test; durable references; the plan pin |
| M3 | .gitignore: .review/ becomes .reviewX/ | the scratch premise |
| M4 | docs/deleted-paths.md gains a registry line naming src/never-existed.ts, which git never deleted | the register |
| M5 | docs/deleted-paths.md gains a registry line naming scripts/fetch-textures.mjs, the path that was deleted and re-added | the register; the re-added trap |
| M6 | src/mind.ts: hands.ts becomes kinds.ts in the import comment | durable references |
| M7 | src/learning/tournament.ts: lookahead.ts:294 becomes lookahead.ts:2940 | durable anchors |
| M8 | docs/design.md gains a span (../src/weapon.ts) | the base-dependent pin |
| M9 | combat-followups-23: asset-src/learning/tournament-v1.json becomes tournament-vONE.json | the plan-promise justification |
| M10 | combat-followups-00-overview.md gains a span config.ts:99999 | the plan pin |
| M11 | PROMISED_BY_A_PLAN is emptied | durable references |
| M12 | asset-src/learning/tournament-v1.json is created, so the excuse is stale | the plan-promise justification; the plan pin |
| M13 | src/learning/tournament.ts: the bare continuation :291 becomes :2910 | the continuation test; durable anchors |
| M14 | src/learning/tournament.ts: research-policy.ts:98 becomes research-policy.ts:104, exactly one past a 103-line file | durable anchors |
| M15 | NAMED_OUTSIDE_THE_PROTOTYPE drops DESIGN.md | the outside-the-prototype pin |
| M16 | RESOLVED_IN_NODE_MODULES drops HavokPhysics.wasm | the dependency-tree pin |
| M17 | NOT_A_PATH_TARGETS drops tests/\*.mjs | the not-a-path pin |
| M18 | docs/design.md gains a span src/nope-\*.ts, the smuggling route the pin exists to bound | the not-a-path pin |
| M19 | SCRATCH_SHARE_OF_DURABLE.max becomes 0.10, below the measured 11.7 % | the scratch bound |
| M20 | docs/design.md gains a span .review/../src/weapon.ts, a scratch target that is not a plain path | the base-dependent pin **and** the scratch bound — the .. segment is taken first |
| M21 | FILE_EXT drops glb | the extension whitelist |
| M22 | the line count reverts to counting split pieces rather than the last line | **nothing** — see below |
| M22+M14 | both together: the off-by-one reverted *and* an anchor placed exactly one past the end | **nothing** — which is what proves the fix is load-bearing |

Three controls, each showing a limit this gate states rather than one it hides:

| # | control, verbatim | result |
| --- | --- | --- |
| C0 | the src/main.ts comment is rewrapped from four lines to five, shifting three plan anchors by one | **all green** — a line-shifting edit is invisible here |
| C1 | src/main.ts points at sword.ts again | **all green** — the register cannot tell "deleted" from "go and read it" |
| C2 | src/options.ts:530 points at DESIGN.md, or at any other wrong-but-existing file | **all green** — a wrong existing file resolves |

**M22 is the one mutation nothing noticed, and the distinction matters.** Reverting the line count
to counting split pieces changes no verdict on its own, because no live anchor in this tree sits
exactly one past the end of its file -- there was nothing to mutate, not a test that failed to
notice. The composed mutation is what settles it: M14 places an anchor on that boundary and goes
red, and M14 with the off-by-one reverted goes **green**. So the correction earns its place, and it
is a live reference away from mattering rather than a tidy-up.

An adversarial review reproduced this independently with its own tokenizer, anchor parser and
resolver, in a `git clone --local` sandbox, and ran 23 mutations of its own construction against the
ten tests that existed then. It could not make any of them pass while broken. It reproduced M6 and
C2 directly. The five tests added after that review — the two pins on resolution branches, the
not-a-path pin, the scratch bound and the extension whitelist — are M15 through M21 here and were
watched failing the same way.

**The two spans in the second column are written as plain text rather than as code spans.**
They are a record of what a continuation looked like in a file that no longer exists, and a
live code span here would be handed to the same nearest-preceding-file-name rule the row is
about -- which now guesses `src/learning/promotion.ts`, a deleted file, and turns the gate red.
A dated record of a pointer is not a pointer.

**Both rows are quoted by construct rather than by line, because the plan file they were written
in has been deleted.** An anchor into it would resolve as `anchorIntoDeletedFile` and turn this
document's own gate red -- which is the argument this section makes, arriving on the section that
makes it.

**The one cheap catch that was measured and rejected, kept here because its counterexample went
with the plan set.** "A bare continuation never legitimately carries a `.md` file, so a `.md`
carrier is wrong by construction" would have caught both rows above. It is false: the session-16
plan wrote *"Update the perception and learning sections of `docs/design.md` -- `#L84` documents
the 66-column v3 `FighterView` feature table"*, which is a correct `.md` carrier, and this
document holds three more of the same shape. The heuristic would have been wrong four times to
catch one. The coverage space it was measured over -- 17 of the tree's 48 continuations at the
time, all in one plan file, hand-checked one at a time, nine of them guessing a file the prose
does not mean and seven of those nine silent -- **is not re-takeable now** and is recorded here
rather than re-derived. The count is dated for that reason: deleting the landed plan set removed
32 continuations from the population, so any later total is over a different space.

### What this gate cannot see, which cost three anchors during this change

It sees an anchor that runs off the end of a file and an anchor naming a file that is not there. It
**cannot** see an anchor that still lands inside its file and now points at the wrong line -- which
is what every line-shifting edit above an anchor produces. Re-pointing `sword.ts` in `src/main.ts`
took a four-line comment to five, and that moved three plan anchors by one:
`combat-followups-00-overview.md:1386` and `combat-followups-17-tactic-output-v2.md:345` and `:349`
all pointed one line short. **The suite stayed green**, because a shift of one changes neither the
range verdict nor the resolution verdict and therefore does not move the pinned plan record.

The edit was rewrapped to four lines and the three anchors are back on their original targets;
every source and prose edit in this change is line-neutral, checked file by file against `HEAD`.
The limit is written into the test's header rather than papered over: **an edit that changes a
file's line count is invisible to this gate.** `tools/check_docs.js` catches it for a Markdown link
because it compares the link's text against its target; nothing catches it for a code span. This is
AGENTS.md's "inserting one import breaks every anchor below it" arriving in a directory where the
thing that was supposed to catch it does not.

### Five wrong pointers, and the two kinds of wrong a register cannot tell apart

Three were live and named a file that is not where the argument lives:

- `src/weapon.ts:26` and `src/mind.ts:10` both named a file called kinds.ts. **No file of that name
  has ever existed in this repository** — `git log --all --no-renames --diff-filter=D` has no row
  for it anywhere. The kinds are in `src/hands.ts`, and `src/weapon.ts` re-exports them from there
  ten lines below the comment that said otherwise; `src/mind.ts` made the same claim about the same
  file under two names three lines apart. (Written here without backticks on purpose: this gate
  refuses a code span naming a file that never existed, which is the one thing it costs — a durable
  document cannot say "it used to be called X" in the repository's usual voice.)
- `src/options.ts:530` sent a reader to `DESIGN.md` for `TARGET_SPAN_FRACTION`'s argument. That
  constant does not appear in the repository-root `DESIGN.md` at all; its argument is the section
  above, in this file.

Two more were fixed that **no register of this shape can catch**, and that limit is written into
`docs/deleted-paths.md` rather than left implicit. `src/main.ts:670` said "for the reason `sword.ts`
gives at length" and `docs/design.md:594` said "because `sword.ts` adds three shapes for five
meshes". `src/sword.ts` really was deleted — in `c80a59d`, the commit that added `src/weapon.ts` —
so the register passes both forever, while a reader can follow neither. The register answers "was
this path deleted", not "did the writer mean go and read it". The same hole sits one step further
out and swallowed the `DESIGN.md` pointer above: a reference that names the *wrong existing* file
resolves, and only reading it finds that.

### What is pinned, and why the plan set is not gated

`docs/plans/` holds 197 of the 206 anchors, and AGENTS.md says the whole plan set is deleted in the
commit that finishes the topic. Repairing them is work about to be thrown away and redone every
session, so the plan surface is counted and the counts are pinned from both sides — a session that
rots more is told, and a session that repairs some is told to re-pin. The field names say what the
rule measured; none of them says "stale", because this rule can see absence and range and nothing
else.

Three smaller records are pinned whole rather than counted, because each is a hole in the gate and a
hole that can silently grow is the defect this effort keeps removing: the two base-dependent `../`
spans, the one durable reference excused by a live plan, and the one path that was deleted and added
back. That last one is `scripts/fetch-textures.mjs`, and it is why resolution consults the working
tree before the register and why the register is the deletion log *minus* what exists. A register
that assumed "in the deletion log" meant "absent now" would answer "deleted, fine" for a live file.

`--no-renames` is not optional on the log that generates it: with rename detection on git reports 49
paths instead of 56 and drops 7 old names this tree still references, because a rename is recorded
as one modification rather than as a deletion plus an addition.

### The gate

`npm run check` clean, `npm run build` clean, `npm test` **575 passed, 0 failed** — 565 before, plus
this file's ten. `node tools/check_docs.js` from the repository root stays at its 29 known
pre-existing problems, all of them root `docs/` anchors into `crates/`; this change adds none, which
matters because that checker does walk `sword-prototype/docs/**`, `docs/plans/` included.

**The null control is a regression check that passed and is not evidence this change is safe.**
`npm run measure -- --only duelist-swinger --bouts 120`, seed 20260823: duelist 66/120 = 55.0 %,
3.52 s (1.42–8.98), 176.17 damage, 10 severs, 1496/1670 scoring contacts, identical to the pin. For
a change that edits comments and prose it is structurally incapable of moving, and the discipline
this file applies to tests applies to its controls.

## The sixth PPO head, and the discount that made a flat gamma wrong — 2026-08-26

PPO produced 25 of the output contract's 26 columns. The 26th, persistence, was the constant
`UNLEARNED_PERSISTENCE = 0.4`. It is a learned categorical over eight dwell times now, and the change
that made that honest is not the head — it is `generalizedAdvantages`, which discounted per boundary
and now discounts per second.

**Harness for every number in this section: the headless research bench.** `runResearchBout` in
`scripts/research-havok.mjs`, which is `scripts/measure.mjs`'s bout loop under a research matrix job.
Nothing here was taken from the page, and AGENTS.md's rule about not putting two harnesses in one
column applies.

### The first version of this section was measured on the wrong tree

**Read this before any number below.** The sweep scripts that produced the first draft
(`.review/persist/dwell.mjs` and `.review/persist/reward.mjs`, both deleted) drove every head of one
decision from a single `seededRandom(SEED ^ jobIndex)`. `recurrentTactic` draws once per head, so
**the sixth head changed the number of draws per decision**, shifted the stream, and made every bout
diverge from the one the pre-change tree would have run. Because the sweeps *force* the persistence
rather than reading it, nothing in them could notice.

The published table matched `HEAD` — the tree before the change — column for column, and matched the
tree that ships in no column at all. Found by an adversarial review that ran the unmodified script in
two sandboxes:

| | published | HEAD | shipped tree |
| --- | ---: | ---: | ---: |
| 0.10 boundaries/bout | 43.80 | **43.80** | 43.13 |
| 0.10 clipped progress | 101.169 | **101.169** | 94.746 |
| 0.10 unclipped | 161.440 | **161.440** | 147.177 |
| 0.80 clipped progress | 30.026 | **30.026** | 36.432 |

`.review/persist/sweep.mjs` replaces both, gives each head its own stream so the *existence* of a
head cannot move another head's draws, and is what every number below was taken with. **What that
does not remove, and what belongs in the coverage space:** forcing a different dwell changes how
many decisions a bout takes, so the bins consume different numbers of draws and their trajectories
differ. That is the thing being measured.

The dwell table's conclusions survived the correction. The reward table's did not, and one of them
was wrong in sign; both are restated below rather than silently replaced.

### The coverage space, stated once

- every one of the **90** jobs of `researchMatrix("train", 310013)` — 15 cells × 3 opponents × 2
  mirrors — with `indexedLeagueOpponent`'s pick substituted for the matrix's own opponent, which is
  what `collectPpoTrajectory` does;
- **1200 solver steps** a job, which is 5.0 s of bout at `CONFIG.world.physicsHz` = 240 and comes out
  at 4.61–4.79 s of clock actually advanced;
- an **untrained**, randomly-initialised recurrent policy (`initialPpoWeights(310013, "random")`)
  deciding all six heads by seeded categorical sampling, one stream per head;
- the persistence **forced** to each grid value in turn, so this measures what a request buys rather
  than what a trained head would ask for.

**What it does not cover, and all three matter.** One seed and one initialisation, so nothing here
separates the policy from the bodies. The *train* split only. And an **untrained** policy, which is
load-bearing for the sign of one finding below and is named again where it is.

### A requested dwell is a ceiling, and mostly not reached

`researchLabelMind` re-decides when the persistence timer expires **or** the skill finishes, so a
long request is only spent when the skill outlasts it.

| requested | boundaries | /bout | sim s | mean dwell | p10 | median | p90 | max | timer-ended |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.10 | 3825 | 42.50 | 4.65 | 0.1093 | 0.1000 | 0.1167 | 0.1167 | 0.1167 | 97.6 % |
| 0.20 | 2114 | 23.49 | 4.79 | 0.2038 | 0.1833 | 0.2167 | 0.2167 | 0.2167 | 82.9 % |
| 0.30 | 1576 | 17.51 | 4.73 | 0.2699 | 0.1833 | 0.3000 | 0.3167 | 0.3167 | 57.6 % |
| 0.40 | 1385 | 15.39 | 4.73 | 0.3072 | 0.1833 | 0.3000 | 0.4167 | 0.4167 | 35.7 % |
| 0.50 | 1228 | 13.64 | 4.64 | 0.3400 | 0.1833 | 0.3000 | 0.5167 | 0.5167 | 34.4 % |
| 0.60 | 1192 | 13.24 | 4.67 | 0.3526 | 0.1833 | 0.3000 | 0.5333 | 0.6167 | 5.9 % |
| 0.70 | 1187 | 13.19 | 4.70 | 0.3560 | 0.1833 | 0.3000 | 0.5333 | 0.7167 | 5.3 % |
| 0.80 | 1155 | 12.83 | 4.61 | 0.3594 | 0.1833 | 0.3000 | 0.5333 | 0.8167 | 4.8 % |

"timer-ended" is the share of boundaries whose real dwell reached the request. The dwell quantum is
1/60 s, which is why a 0.40 request tops out at 0.4167: the timer is read on the decision step after
it expires.

**The head's effective range is 3.3x, not 8x.** Mean dwell spans 0.109 to 0.359 while the request
spans 0.10 to 0.80. The four lowest bins separate cleanly (+0.095, +0.066, +0.037, +0.033 per step);
the top three are within 0.007 s of each other, under half a decision step. They are still not the
same bin — only a 0.80 request can hold a decision for 0.8167 s, and the `max` column is where that
shows. **So the resolution a learned head actually has is in the lower half**, which is the half a
policy would use to decide *faster* than the constant it replaced. This is a property of the current
skill durations against these opponents, not of the grid, and is worth re-taking when the option
layer's timings move.

### The two reward terms, and the terminal column that decides a sign

| requested | clipped progress | /bout | unclipped | clipped rows | vitality | wins | losses |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.10 | 94.825 | 1.0536 | 152.910 | 21.65 % | -15.660 | 14 | 20 |
| 0.20 | 51.828 | 0.5759 | 143.057 | 41.53 % | -14.173 | 3 | 15 |
| 0.30 | 38.660 | 0.4296 | 139.288 | 46.26 % | -3.778 | 11 | 13 |
| 0.40 | 30.608 | 0.3401 | 136.415 | 47.51 % | -0.868 | 9 | 10 |
| 0.50 | 31.545 | 0.3505 | 132.904 | 49.19 % | -7.831 | 9 | 16 |
| 0.60 | 31.315 | 0.3479 | 129.238 | 49.24 % | -4.735 | 8 | 14 |
| 0.70 | 30.074 | 0.3342 | 128.382 | 47.85 % | -6.497 | 8 | 12 |
| 0.80 | 30.263 | 0.3363 | 127.563 | 48.23 % | -3.978 | 10 | 13 |

Sums are over all 90 bouts; `/bout` divides by 90.

**The progress term tracks boundary count, and that is checkable rather than assertable.** Clipped
progress per bout divided by boundaries per bout is 0.0248, 0.0245, 0.0245, 0.0221, 0.0257, 0.0263,
0.0253 and 0.0262 — flat to within 9 % across a grid whose boundary count varies 3.3x. So the term
really is "about 0.025 a boundary, however many there are", the requested bin controls that count
steeply in the lower half and barely in the upper, and **the raw sums are therefore not monotone in
the bin.** The first draft of this section quoted them as though they were and read a monotone
mechanism off them; the mechanism was right and the reading was not.

The *unclipped* sum moves 152.9 to 127.6 while the clipped one moves 94.8 to 30.3, so the clip is
what does it.

**The terminals are net-negative in every bin**, which the first draft never printed and which
decides the sign of the next section: wins against losses run 14/20, 3/15, 11/13, 9/10, 9/16, 8/14,
8/12 and 10/13, and 18–34 of the 90 bouts reach a terminal at all. An untrained policy losing to the
league is not a surprise; it is load-bearing anyway, because a claim has to match its own evidence.

### The flat-gamma bias: a 34.7 % spread in what a terminal is worth

| requested | `0.99^(n-1)` | flat return/bout | per-second return/bout | delta | flat terminal/bout |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0.10 | 0.6590 | 0.6849 | 0.6366 | -0.0482 | -0.1968 |
| 0.20 | 0.7977 | -0.0092 | -0.0567 | -0.0475 | -0.4443 |
| 0.30 | 0.8471 | 0.3117 | 0.3102 | -0.0015 | -0.0757 |
| 0.40 | 0.8654 | 0.3028 | 0.2992 | -0.0036 | -0.0361 |
| 0.50 | 0.8807 | -0.0146 | -0.0177 | -0.0032 | -0.2846 |
| 0.60 | 0.8842 | 0.0573 | 0.0540 | -0.0034 | -0.2432 |
| 0.70 | 0.8847 | 0.1122 | 0.1065 | -0.0057 | -0.1558 |
| 0.80 | 0.8879 | 0.1839 | 0.1783 | -0.0056 | -0.1132 |

Bout length is flat across the sweep — 4.61 to 4.79 s, a 4 % spread — and boundary count is not: 42.5
against 12.8. Under a gamma applied once per boundary, a terminal reached at the end of a bout is
weighted `0.99^(n-1)`, so it counts for 0.6590 at the 0.10 bin and 0.8879 at the 0.80 bin: a
**34.7 %** spread in what the same outcome is worth, decided by dwell.

**That is a magnitude, and the sign follows the terminal's.** The first draft called it "a 35 %
return advantage to maximal persistence", which is only true where terminals are net positive. Here
they are net negative in all eight bins, so a flat gamma *penalises* long dwell on this coverage
space. A trained policy may flip it. What does not flip is that the weight on a terminal moves by a
third with a quantity that is not about the fight.

**Like for like, per bout, it is the smaller of the two biases.** Only 18–34 of 90 bouts reach a
terminal, so the spread is worth at most `4 × 0.2289 × (34 / 90) = 0.35` a bout and about 0.23 at the
median bin — against **0.72** a bout for the progress term (1.0536 − 0.3363). Roughly 3x apart. The
first draft compared 0.91 — a weight gap times the *maximum possible* |terminal| — against 0.79, an
unconditional per-bout mean, which is not a comparison.

**And the two are independent.** The first draft said fixing the discount "unmasks" the progress
bias. That is a claim about interaction and nothing measured supports it: the progress term is a
property of the reward function and is present, at the same size, under either discount.

### What the change is worth, measured, and why it lands anyway

The `delta` column above is the quantity the change actually changes: mean discounted return per
bout under this recursion minus the flat one, over the same 90 bouts. It runs −0.048, −0.048, −0.002,
−0.004, −0.003, −0.003, −0.006, −0.006. Non-monotone, largest magnitude **0.048**.

So the change is **taken on principle, not on effect size**: a discount applied once per boundary is
not a discount at all once boundary length is a learned quantity, and at 4.7 s of bout there is
barely any discounting to get wrong either way. Anyone reading this section for a performance
argument will not find one.

### The grid: eight, from two constraints and one preference

`PERSISTENCE_SECONDS` is `[0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80]`.

Two constraints. It must reach `MIN_PERSISTENCE` and `MAX_PERSISTENCE`, because those are the clamp
`researchLabelMind` applies and a bin outside them would name a dwell the runtime replaces — an
importance ratio evaluated at an action nobody took. And it must contain `UNLEARNED_PERSISTENCE`
exactly, so a learned dwell is comparable with the constant.

**Uniformity is a preference and the first draft called it a constraint.** The entropy bonus is flat
over *bins* under any grid, so an uneven grid is not unfair in the term; it spends exploration
unevenly per second of dwell, and only measuring behaviour in dwell-seconds makes that a defect. Its
measured cost is real: three of the eight bins buy under 0.007 s of mean dwell between them. A grid
denser at the bottom would fit the measured behaviour better, and was declined because that
saturation is a property of the current skills against the current opponents and baking one sweep's
coverage space into the output contract is the trap this file keeps records about.

Given uniform, eight follows: a step reaching 0.10 and 0.80 and landing on 0.40 divides both 0.70
and 0.30, so it is at most `gcd(0.70, 0.30) = 0.10` and **eight is the coarsest such grid**. The
finer ones are `1 + 7k` points for a step of `0.10 / k` — 15, 22, 29, 36, 43 and so on, an infinite
family. The first draft wrote "the finer ones are 15, 36 and 71", which are `k = 2, 5, 10`, presented
as though it were the set.

**A binned head is not the continuous head `PPO_POLICY_HEADS` declined.** A grid reuses the
categorical log-probability, the importance ratio, the clipped surrogate and the `log k` entropy
bound unchanged. A Gaussian or Beta changes all four, and its differential entropy can be negative
and is bounded by nothing — which would have made the pinned mean-per-head entropy in
`tests/ppo.test.mjs` a number about something else without moving it.

**Nothing checked in re-decodes.** `asset-src/learning/` holds `neat-qd`, `dagger` and `lookahead`
champions and no PPO artifact, and `deployedResearchMind`'s shape guard refuses a five-head PPO
payload outright. So no digest moves and no frozen champion changes behaviour; the comparability the
grid buys is for future runs.

**One float claim in the sketch is wrong and the caution behind it is right.** `0.1 + 3 * 0.1` is
**not** `0.4000000000000001`; it is exactly `0.4`. What a generated grid gets wrong is `i = 2` and
`i = 6` — `0.30000000000000004` and `0.7000000000000001` — and `(i + 1) / 10` reproduces all eight
exactly. The literals stay, and
`the_persistence_grid_pins_the_window_the_unlearned_constant_and_a_uniform_step` asserts against both
spellings so the table cannot be tidied into either without being told which values move.

### The discount rate, the trace decay, and why only one is converted

```
PPO_GAMMA_PER_SECOND = 0.99 ** (1 / UNLEARNED_PERSISTENCE) = 0.9751871871081982   per second
PPO_TRACE_LAMBDA     = 0.95                                                        per decision
```

**Gamma is physical and lambda is not.** Gamma states that reward arriving later in *seconds* is
worth less, so it belongs in the exponent. Lambda interpolates between TD(0) and Monte Carlo over
n-step returns, and n counts **decisions**; a boundary is one decision however long it took. Put
lambda in the exponent as well — the `(gamma * lambda) ** dt` spelling — and the credit-assignment
window becomes a function of the dwell the sixth head is learning: over ten boundaries the trace
decays by 0.9405 at the 0.10 bin and by `0.9405^8 = 0.605` at the 0.80 bin. That is the same coupling
the change exists to remove, one term over. At `lambda = 1` the two spellings are one expression,
which is why the composition test could not tell them apart and why
`the_trace_decays_per_decision_and_the_discount_per_second` exists at `lambda = 0.5`.

**The exactness is checked, not derived, and the reason first written down was wrong.** It said the
round trip is exact because `1 / 0.4 === 2.5`. It is exact for all eight grid values, including 0.3,
0.6 and 0.7 where `1 / p` has no exact double, and for essentially every exponent at or below one:
sampling `p` at 4,000 points in `(0, 1]` gives **3,999** exact round trips for gamma, and sampling
4,000 points in `(1, 41]` gives **376**. Raising by `p <= 1` contracts the first power's relative
error; above one it amplifies it. The exceptions above one are the powers of two — 2 and 8 round trip
and 3, 5 and 9 do not.

The old product spelling had a seam this one does not: `(gamma * lambda) ** p` is exact at 0.10,
0.40, 0.50, 0.70 and 0.80 and **not** at 0.20, 0.30 or 0.60. Multiplying by a plain 0.95 has no such
case. Both facts are asserted.

**"The discounting does not move at all" was false and is now stated correctly.** A boundary
*requested* at 0.4 s does not *last* 0.4 s — measured mean dwell at that bin is 0.307 s and only
35.7 % reach the request. So the effective horizon lengthens from `100 × 0.307 = 30.7` s to
`1 / (1 - gamma) = 40.3` s, and a bout-end terminal at that bin is weighted 0.8879 under the new rate
against 0.8653 under the old flat one — **2.6 % apart**. The rates are exact at the reference; the
trajectories are not. Inferring the second from the first is the defect, and it sat three paragraphs
from a passage that stated the difference correctly.

### The two counts an artifact records, which were one number by coincidence

`producedOutputs` was `PPO_POLICY_HEADS.reduce((sum, name) => sum + HEAD_ROWS[name], 0)` = 25, against
`contractOutputs: META_OUTPUT_LAYOUT.width` = 26. `HEAD_ROWS` is a count of **logits**, and for five
categorical-over-a-name-table heads that equals the count of **contract slots**, because a categorical
over n names occupies n columns of the contract.

The persistence head ends the coincidence: eight logits, one contract slot. Left alone the same sum
records **33 of 26** — a number larger than the contract it is compared against, and no less
derived-from-the-frozen-tables in appearance. `scripts/train-ppo.mjs` keeps `HEAD_LOGITS` and
`HEAD_CONTRACT_SLOTS` as two named tables, `PPO_POLICY_HEADS`' docstring says where its own "every
size, offset and divisor is derived from this array" stops being true, and
`an_artifact_counts_contract_slots_rather_than_logits` asserts 26 and 33 separately off a real
artifact rather than off the two exports.

### The mutation table

Every test added or touched, watched failing under a deliberate mutation of the line it is about.
Each mutation was applied with binary I/O, the affected suites run, and the original bytes restored
(`.review/persist/mutate.mjs`); `git diff --numstat` and `git diff --ignore-cr-at-eol --numstat` agree
afterwards, so no line ending was rewritten on the way past. Suites run: `ppo`, `learning`,
`lookahead`, `tournament-executor`, `neat-qd` — 111 tests.

**The mutation column is written without backticks on purpose**, following the convention `81030fb`
set: these are literal edits, and a code span here is a live reference the docs gate judges.

| # | mutation, verbatim | goes red |
| --- | --- | --- |
| M1 | ppo.ts: gamma ** step.durationSeconds becomes gamma in the delta | the discount pin; the trace pin |
| M2 | ppo.ts: gamma ** step.durationSeconds * lambda becomes gamma * lambda in the trace | the discount pin; the trace pin |
| M3 | ppo.ts: PPO_GAMMA_PER_SECOND = 0.99 ** (1 / UNLEARNED_PERSISTENCE) becomes 0.99 | the_per_second_rate_reproduces_the_flat_discount_at_the_unlearned_persistence |
| M4 | ppo.ts: PPO_TRACE_LAMBDA = 0.95 becomes 0.95 ** (1 / UNLEARNED_PERSISTENCE) | the same |
| M5 | meta.ts: the grid's 0.40 becomes 0.45, so it no longer contains the constant | the grid pin; the rate pin |
| M6 | meta.ts: the literal grid becomes Array.from({ length: 8 }, (\_, index) => 0.10 + index \* 0.10) | the grid pin; the rate pin; the league champion |
| M7 | train-ppo.mjs: HEAD_CONTRACT_SLOTS' persistence: 1 becomes persistence: PERSISTENCE_SECONDS.length | an_artifact_counts_contract_slots_rather_than_logits |
| M8 | train-ppo.mjs: the mid-bout duration becomes the requested 0.4 instead of the elapsed clock | every_boundary_a_ppo_trajectory_records_carries_the_time_it_actually_lasted |
| M9 | ppo.ts: the entropy divisor's PPO_POLICY_HEADS.length becomes 5 | ppo_updates_policy_weights_value_head_and_reports_clipping_and_entropy |
| M10 | deployment.ts: PERSISTENCE_SECONDS[persistence.index] becomes PERSISTENCE_SECONDS[0] | three tests, including the conditional-mask sweep |
| M11 | deployment.ts: the persistence head is picked from step.stanceLogits | three tests, including the stored-conditionals test |
| M12 | ppo.ts: the duration guard becomes if (false), so a missing duration is silently NaN | ppo_clipping_and_advantages_match_the_pinned_hand_calculation |
| M13 | deployment.ts: the PPO labeler's persistence becomes the literal 0.4 again | every_producer_of_a_research_label_writes_the_same_six_fields |
| M14 | recurrent-network.ts: persistenceLogits is computed from this.weights.stance | two tests, including the stored-conditionals test |
| M15 | train-ppo.mjs: the GAE call site passes 0.99, 0.95 instead of the two constants | the boundary-duration test |
| M16 | train-ppo.mjs: the final boundary's duration becomes 0 | the boundary-duration test |
| U5 | train-ppo.mjs: collectPpoTrajectory's label persistence becomes the literal 0.4 | the boundary-duration test |
| U6 | ppo.ts: the trace becomes (gamma \* lambda) ** step.durationSeconds | the_trace_decays_per_decision_and_the_discount_per_second |
| U7 | train-ppo.mjs: ppoUpdateRows' valueTarget becomes row.oldValue | the boundary-duration test |
| U8 | ppo.ts: PPO_POLICY_HEADS is reversed | the_policy_heads_are_in_output_contract_order_and_the_flat_layout_follows_it |

**Seven mutations were green when first run, and every one was a hole rather than a finding about
the mutation.** Three were caught by this session's own battery (C1–C3) and four by an adversarial
review (U5–U8). All seven are red above. This is the table's most useful column and it is the one
that had to be produced twice:

| # | what stayed green | what it meant |
| --- | --- | --- |
| C1 | the artifact's gammaPerSecond and traceLambda both set to 0 | no number in a PPO artifact's provenance was asserted anywhere |
| C2 | the frozen-league champion's persistence set to the literal 0.4 | the third decode site fought at somebody else's dwell |
| C3 | producedOutputs and producedLogits both set to 99 | the same hole as C1, on the two counts this change is about |
| U5 | collectPpoTrajectory's label persistence set to 0.4 | **the training data need not have run at the sampled dwell** — the head samples a bin, stores its index and its probability, and is trained on a bout that ran at a constant |
| U6 | the trace raised to the duration as well | the pinned recursion used lambda = 1 and dt = 1, where the two spellings coincide, so it could not see the choice it was pinning |
| U7 | the value target set to the prediction it already makes | the value head learning nothing was invisible |
| U8 | PPO_POLICY_HEADS reversed | the flat weight layout the resume and the payload depend on had no pin, while "in output-contract order" was in the docstring |

**Two controls stayed green and both are "there was nothing to mutate" rather than "nothing
noticed".** The distinction is the point of running them:

| # | control, verbatim | result |
| --- | --- | --- |
| C4 | train-ppo.mjs: the final boundary's Math.max(0, ...) clamp is removed | **green** — the clamp guards a case the bout loop cannot produce; `lastClock` is never before the last decision |
| C5 | ppo.ts: 0.99 \*\* (1 / UNLEARNED_PERSISTENCE) becomes 0.99 \*\* (1 / 0.4) | **green** — the same double, so nothing changed to be caught |

**Two tests were rewritten because a mutation found them self-satisfying**, which is AGENTS.md's
first named shape both times:

- the boundary-duration test compared the sum of durations against the last boundary's own
  `startClock + durationSeconds`. Forcing the final duration to zero shrinks both sides equally, so
  M16 was green. It compares against `result.lastClock` — the bout's own reading — now.
- the same test asserted "the durations are not all equal, so the sixth head decided something".
  Durations vary under a *constant* dwell too, because the skill ends a boundary as often as the
  timer does — only 35.7 % of boundaries at the 0.40 bin reach their request. The setup satisfied the
  assertion. What replaced it is a bound tying each boundary's realised dwell to the bin **its own
  recorded index names**, with a non-zero count of boundaries that reached it so the bound is not
  vacuous.

### What is still not tested, named rather than left to be found

- **Nothing here shows the head learning anything.** Every test is about the mechanism — the decode,
  the grid, the log-probability, the discount arithmetic. The only honest check of a dwell
  distribution moving is a real training run.
- **The record cannot see a collapsed dwell head.** `headUtilisation` reads the five-name joint tuple
  key and the persistence is not in it. Register entry 14. **Closed 2026-08-26** by the dwell
  marginal below — the sentence stands as what this session left owed, which is the point of writing
  it down.
- **The progress-clip bias is unfixed**, at 0.72 a bout. Register entry 18.
- **`valueEpsilon` was never re-derived** against a horizon that moved, and already clips 53.4 % of
  updates. Register entry 19.
- **One seed, one initialisation, one split, one untrained policy** for the whole sweep.

### The gate

`npm run check` clean. `npm test` **588 passed, 0 failed** — 580 before, plus **eight** new tests.
Counted rather than added up: the five suites the battery runs were 103 at `HEAD` and are 111 now.
An earlier version of this line read "585, plus six: five new and one rewritten in place", which was
wrong twice — a rewritten test adds nothing to a count, and the arithmetic did not match the number
the runner printed. `npm run build` clean. `node tools/check_docs.js` from the repository root stays at its 29 known
pre-existing problems, **none of them matching "sword-prototype"**.

Null control, `node scripts/measure.mjs --only duelist-swinger --bouts 120`, seed 20260823: duelist
66/120 = 55.0 %, 3.52 s (1.42–8.98), 176.17 damage, 10 severs, 1496/1670 scoring contacts —
identical to the pin. **It is a regression check that passed and it is not evidence this change is
safe**, for the reason register entry 16 gives: `scripts/measure.mjs` imports nothing from
`src/learning/` — checked, not quoted — and `duelist-swinger` runs `policyMind`, which never enters a
`CombatOption`.

### Anchors re-pointed, and the method that got it wrong the first time

`tests/docs.test.mjs` cannot see an anchor that still lands inside its file and now points at the
wrong line, so every anchor into a file whose length moved has to be re-pointed by hand. **The first
pass did that by arithmetic — add the file's net line delta — and it was wrong in three ways**: it
missed `src/learning/ppo.ts` and `tests/ppo.test.mjs` entirely, the two largest movers, leaving six
anchors rotted and green; it carried a pre-existing off-by-eight forward as though verified
(`ppo.ts:319` named a divisor that was at 327, and +102 produced 421 for a line at 429); and a net
delta is the wrong number anyway, because the insertions are not all above the anchor.

The method that works, and what `.review/persist/anchors.mjs` does: print what each anchor lands on
now, find the construct the prose names, and refuse any target that is not unique.

| anchor | was | now | names |
| --- | ---: | ---: | --- |
| `src/learning/ppo.ts` | `#L96-L100` | `#L256-L260` | `equalBudgetPpoArms` |
| `src/learning/ppo.ts` | `#L98-L99` | `#L258-L259` | both arms get the full budget |
| `src/learning/ppo.ts` | `:319` | `:497` | the entropy divisor — was already eight lines off |
| `tests/ppo.test.mjs` | `#L64-L66` | `#L115-L117` | the equal-budget pin |
| `scripts/train-ppo.mjs` | `#L98-L127` | `#L125-L162` | `collectPpoTrajectory`'s boundary loop |
| `scripts/train-ppo.mjs` | `#L174` | `#L238` | `macro: reward, worstCell: reward` |
| `scripts/train-ppo.mjs` | `#L180` | `#L244` | `--stop-after-jobs` |
| `scripts/train-ppo.mjs` | `#L182` | `#L246` | a bare file-name example |
| `scripts/train-ppo.mjs` | `#L190` | `#L254` | the `configDigest` fold |
| `scripts/train-ppo.mjs` | `#L217` | `#L284` | `--resume-from` |
| `src/learning/recurrent-network.ts` | `:74` | `:85` | `maskedArgmax`'s refusal |
| `src/learning/recurrent-network.ts` | `:31-38` | `:40-47` | `RecurrentPolicyWeights` |
| `tests/tournament-executor.test.mjs` | `:106-135` | `:110-139` | the empty-maps test |
| `docs/design.md` | `:325` | `:339` | the five safety flags — was already four lines off |
| `docs/design.md` | `:584` | `:594` | the sword's three boxes |

`meta.ts:28` was kept on `UNLEARNED_PERSISTENCE` by rewriting that docstring line-for-line rather
than letting it grow, and `docs/design.md` was kept line-neutral through the second pass for the same
reason.

## The dwell marginal: telling a collapsed head from a head that is not there — 2026-08-26

PPO learned its persistence one commit earlier and the behaviour record could not see it. Three
defects in one, and the third is the largest:

1. `headUtilisation` reads the five-name joint tuple key, and the dwell is not one of its fields. So
   **no row the tournament printed was about the persistence at all**, for any algorithm -- a
   candidate whose dwell head settled on one bin printed byte-for-byte what one sweeping the whole
   grid printed.
2. `lookaheadMind` hardcodes `UNLEARNED_PERSISTENCE` and its re-decision condition carries no clock
   term, so even a correct dwell marginal would print a one-bin spike from it meaning "no head"
   rather than "collapsed".
3. Register entry 14 said the fix was a *marginal* carried beside the joint map. It is, and it is two
   maps rather than one, which is the part the entry did not have.

### The shape, and the two alternatives that were refused

`src/learning/persistence.ts` owns the grid, the eight names a record gives it, the binning, the
record's grammar and its failure reader. `PersistenceCounts` is `{ bins, freeBins }`: `bins` is every
decision keyed by the dwell it asked for, `freeBins` the subset where the controller could have named
a different dwell. `headUtilisation` grows a sixth row over the pair, through the same seven lines the
other five use, so `UtilisationHead` is `keyof TacticTuple | "persistence"`.

**Not a sixth field on `TacticTuple`.** Register entry 17's first bullet measures the joint key at 555
occupied cells of 2,520 at 2.39 counts each, a third of them singletons; eight dwell bins multiply
that into a table of ones. The dwell reaches the record as a marginal, exactly the way
`freeChoiceCounts.effector` does and for the same stated reason -- a fact about a decision that no
projection of the key can recover.

**Not one map.** A marginal alone cannot answer the entry's actual point. `{bins: {"0.40": n}}` is
what a look-ahead candidate writes and what a collapsed PPO head writes, and they mean opposite
things. `freeBins` empty means the controller declared one dwell; `freeBins` equal to `bins` with
`chosen: 1` means a head that had all eight and used one.

**The declaration is a declaration and says so.** `persistenceOptions` is stated by the mind at the
site that produces its dwell, and `research-havok.mjs` reads it off the controller rather than off a
table of algorithm names. `ppo` declares `weights.persistence.rows` -- the decoded artifact's own head
width, the one branch where the number is evidence; `dagger` and `neat-qd` declare
`PERSISTENCE_SECONDS.length`, because both answer a *continuous* dwell and the honest width is how
many the record can distinguish them naming; `lookahead` declares 1. Silence means 1, which
under-claims rather than claiming a head nobody declared, and every probe in the suite that hardcodes
a dwell is a controller with exactly one. Three inferences were available and all three are the defect
being fixed: counting the bins a bout used cannot separate collapse from a constant, reading the
algorithm name is what `evaluate-ai.mjs` already did, and asking the seam which function built the
mind is inference from a call site rather than from a dwell.

### Keying the bins: what a round trip actually survives

`PERSISTENCE_SECONDS` is eight literals because a generated grid is not the same eight doubles.
Measured directly:

| spelling | over the literal grid | over `0.10 + i * 0.10` |
| --- | --- | --- |
| `indexOf(seconds)` | 0..7 | `0, 1, -1, 3, 4, 5, -1, 7` |
| `String(seconds)` | `0.1 .. 0.8` | `0.1, 0.2, 0.30000000000000004, ..., 0.7000000000000001, 0.8` |
| `seconds.toFixed(2)` | `0.10 .. 0.80` | `0.10 .. 0.80` |
| `Number(key) === literal` | true, all eight | -- |

So `indexOf` loses two of eight bins and `String` is worse than it looks: **not one** of its eight
names is a bin key, because a record spells every dwell to two places and `String(0.1)` is `"0.1"`.
`persistenceBin` chooses by distance, which answers all eight for either grid and also answers for a
dwell on no bin at all -- which is what `dagger` and `neat-qd` produce on every decision. Because
`researchLabelMind` clamps a label into `[MIN_PERSISTENCE, MAX_PERSISTENCE]` and those are the grid's
own endpoints, nearest-by-distance over the raw label and over the clamped dwell are always the same
bin, so the record names the dwell the runtime used. A dwell exactly between two bins takes the lower:
0.45 is bin 3, every time.

### Why the grid moved to a leaf module

`tournament.ts` validates the record and cannot import `meta.ts`. Measured rather than assumed
(`.review/dwell/cycle.mjs`, which adds the edge, loads `options.ts` first the way every test does, and
puts the file back):

    with the edge   exit 1   ReferenceError: Cannot access 'MOVEMENT_NAMES' before initialization
                             at src/learning/meta.ts:150, which is META_OUTPUT_NAMES
    without it      exit 0   loaded 5

`options.ts` imports `learning/engagement.ts`, which imports `tournament.ts`; `meta.ts` builds
`META_OUTPUT_NAMES` out of `options.ts`'s tables at module scope. So the edge closes the cycle through
a partially-initialised binding. `learning/persistence.ts` is a leaf with no imports at all, and
`meta.ts` re-exports `PERSISTENCE_SECONDS` from it so that no existing caller moved. This is the same
resolution `TACTIC_KEY_DELIMITER` already carries in `options.ts`, and its note is the precedent.

### What a bout actually writes

`warrior/sword+empty`, `researchMatrix("train", 310013)`, 2400 solver steps, every decision a `cut`
with the sword hand, the probe cycling or holding its dwell (`.review/dwell/count.mjs`):

| probe | decisions | bout seconds | `bins` |
| --- | ---: | ---: | --- |
| cycles all eight | 27 | 9.75 | `0.10:4 0.20:4 0.30:4 0.40:3 0.50:3 0.60:3 0.70:3 0.80:3` |
| holds 0.40 | 20 | 8.22 | `0.40:20` |

Both bouts end on a verdict rather than on the step limit, so 3600 steps produce the identical two
rows. **1200 steps do not**: a probe sweeping the grid holds a decision for 0.45 s on average against
`MIN_PERSISTENCE`'s 0.10 and took **14** decisions in five seconds, fewer than twice the eight bins it
has to be seen using. The dwell is the one quantity here whose own value sets the sample size, which
is why its test runs at 2400 where the tests beside it run at 1200, and why its floor is 16 --
under the smallest real sample and over twice the grid width.

The pair the record exists for, taken off two real bouts rather than off a literal: `holds 0.40`
declaring eight options and the same bout declaring one produce **identical** `bins`, and differ only
in `freeBins` -- `{"0.40": 20}` against `{}`.

### The mutation battery

Nineteen mutations, one at a time, against the two suites that carry the record
(`.review/dwell/mutate.mjs`). **Every one was caught**, and each is listed with the test that caught
it rather than with a count:

| id | mutation | caught by |
| --- | --- | --- |
| M1 | `persistenceBinKey` keys by `String` | the round-trip test, and the real-bout test |
| M2 | `persistenceBin` binds by `indexOf` | the round-trip test |
| M3 | `PERSISTENCE_BIN_KEYS` built with `String` | eleven tests, including both validators |
| M4 | `headUtilisation` reads `bins` for the free distribution | the collapsed-versus-absent test |
| M5 | the producer counts `freeBins` unconditionally | the real-bout test |
| M6 | `persistenceOptionsOf` always answers 1 | the refusal test and the real-bout test |
| M7 | `lookaheadMind` declares 8 dwell options | the per-algorithm declaration test |
| M8 | the PPO branch declares 1 | the per-algorithm declaration test |
| M9 | the decision-total check is disabled | the refusal test |
| M10 | the bin-name check is disabled | the refusal test |
| M11 | the free-subset check is disabled | the refusal test |
| M12 | the whole-count check is disabled | the refusal test |
| M13 | `mergePersistenceCounts` keeps the first row | the aggregation test |
| M14 | the row builder writes an empty record | the executor row test |
| M15 | the producer bins a constant | the real-bout test |
| M16 | `mergeBehaviourRecord` drops the half | the aggregation test |
| M17 | `validateTacticRecord` skips the dwell | the refusal test |
| M18 | `headUtilisation` omits the row entirely | four tests |
| M19 | the producer counts the decision rather than the dwell | the real-bout test |

Two shapes were designed against on purpose, both named in `AGENTS.md`. **"The marginal has some
spread" is self-satisfying here**, because the sweeping probe cycles the grid by construction; what is
asserted instead is the exact histogram of the dwells the labeler asked for, keyed through a
hand-written mirror of `PERSISTENCE_BIN_KEYS` rather than through the function under test -- so a
producer and a checker that agree on a wrong spelling still fail, which is what M1 and M3 demonstrate.
**And a clamped head has to be red, not green**: `holds 0.40` declaring eight options is a collapsed
head, and it reads differently from both a swept head and a controller with none. M4 and M6 are the
two mutations that make those readings collapse into each other.

### The gate

`npm run check` clean. `npm test` **593 passed, 0 failed** -- 588 before, plus **five** new tests:
`a_dwell_bin_key_survives_a_round_trip_through_json_on_every_bin`,
`a_collapsed_dwell_head_and_a_head_that_does_not_exist_are_different_records`,
`a_dwell_record_that_could_not_have_come_from_a_bout_is_refused_by_the_part_that_is_wrong`,
`a_real_bout_records_the_dwell_every_decision_asked_for` and
`every_deployed_algorithm_declares_whether_it_has_a_dwell_head`. No test was deleted and none was
renamed; six existing tests grew assertions over the new half of the record. `npm run build` clean.
`node tools/check_docs.js` from the repository root stays at its 29 known pre-existing problems,
**none of them matching "sword-prototype"**.

Null control, `node scripts/measure.mjs --only duelist-swinger --bouts 120`, seed 20260823: duelist
66/120 = 55.0 %, 3.52 s (1.42-8.98), 176.17 damage, 10 severs, 1496/1670 scoring contacts --
identical to the pin, and for the reason register entry 16 gives, that is a regression check which
passed rather than evidence the change is safe.

### The line-anchor pass, and the rot it found rather than caused

Two files were kept **line-neutral above every anchor** instead of being re-pointed:
`src/learning/research-policy.ts` (`:54-56`, `:95`, `:98` verified byte-identical to `HEAD`),
`src/learning/lookahead.ts` (`:255`, `:294`), `src/options.ts` (four docstring lines rewritten
four-for-four) and `scripts/research-havok.mjs`, whose new import took the blank line between the
import block and `process.env` so that all seven of its anchored lines stayed put. `src/learning/meta.ts`
lost 79 lines *below* `:28`, which is its only anchored line.

Four anchors were re-pointed by locating the construct the prose names:

| anchor | was | now | names |
| --- | --- | ---: | --- |
| `src/learning/tournament.ts` | `:232` | `:253` | the sentence anchoring `lookahead.ts:294` |
| `src/learning/tournament.ts` | `:274-277` | `:718-721` | the `safety` conjunction fold |
| `scripts/tournament-executor.mjs` | `:35` | `:36` | `mindFactoryForTournament`'s control branch |
| `scripts/tournament-executor.mjs` | `:49-50` | `:64-65` | the `safety` object literal |
| `tests/tournament-executor.test.mjs` | `:110-139` | `:160-197` | the stale-*feature*-header test |

**Six anchors were already wrong before this change and are left alone**, because repairing an
anchor means deciding what somebody else's prose meant and three of these are historical findings
about code that no longer exists. Written down rather than swept:

- `tournament.ts:11` (`combat-followups-17`) says `MAX_SPECIALIST_GAP` "is redeclared at" it. The
  declaration was line 25 at `HEAD` and is 31 now; line 11 is inside the header comment.
- `tournament.ts#L197-L221` (overview, `-18`) names `assessTournamentCandidate`, which was at 339 and
  is at 375.
- `tournament.ts#L241-L245` (overview, `-18`) names the `+Infinity` a never-attacked cell maps to,
  which is `percentile`, at 607 and now 686.
- `research-havok.mjs#L46` (overview, `-18`) names the row that credits "the hand the label named",
  which is the `opportunityForAction` call, at 126 and now 149.
- `research-havok.mjs#L65-L66` (overview, `-18`) names `runResearchBout`'s `{ view, dt, clock }`
  re-projection, which was at 145-146 and is at 173-174.
- `scripts/research-havok.mjs:29,33` (`-17`) names `actionCounts`, which the tuple key replaced. There
  is no line to point it at; the finding is closed and the sentence is history.

The fifth row of the table above is a **correction of the previous session's own re-point**, and it is
the instructive one. That session moved this anchor `:106-135 -> :110-139` and labelled it "the
empty-maps test" in this file -- but the prose that carries it says "the model to copy ... does
exactly the requested thing for the *feature* header", which is a different test forty lines further
down. Following the anchor rather than the sentence moved it correctly and pointed it at the wrong
thing, which is the failure mode the method in that session's own note exists to prevent.

## What a long run cannot yet tell anybody, and what PPO cannot spend -- 2026-08-26

Coverage space, stated first: the four research runners as they stand at `86b74c8`, read
directly and then exercised. The one live measurement is a single `train-ppo.mjs` invocation
at `--solver-steps 400000`, seed 310013, the shipped league, on the 16C/32T desktop -- one
unbracketed run, because the result does not need a tight interval to be decisive. Everything
else here is a property of the source, checked by reading every call site rather than by
sampling.

### PPO cannot spend a step budget, and this is the hard one

**Asked for 400,000 solver steps an arm -- 800,000 across the two -- a PPO invocation consumed
5,508.** Seven tenths of one per cent. It is not a slow run; it is a run that finishes.

The mechanism is three facts multiplying. `runResearchBout` clamps the bout to
`min(job.boutCapSeconds, solverStepLimit / physicsHz)` and every stratum sets
`boutCapSeconds: 45` against a `physicsHz` of 240, so **10,800 steps is the ceiling on one
bout** however large the budget. It then reports `min(solverStepLimit, round(seconds * 240))`,
and a bout ends when somebody dies rather than at the cap, so a real bout costs far less than
its ceiling -- about 1,400 steps here. And `trainPpo` runs exactly four bouts: two arms from
`equalBudgetPpoArms`, each collecting one training trajectory and one validation trajectory.

Four bouts is the whole run. The theoretical wall is 43,200 steps; the observed cost is an
eighth of that. **No assertion notices**, because PPO has no exact-budget check -- the two
runners that do have one are the two that cannot trip it.

**Two gradient updates, also at any budget.** `ppoHeadUpdate` has one call site, inside
`for (const arm of arms)`, and `arms` has two elements. There is no `--iterations`,
`--epochs` or `--updates` flag. So a larger budget cannot buy more descent either; it would
buy a larger single batch if the bout cap allowed a larger batch, and it does not.

**What this costs the plan set.** Sessions 20, 21 and 22 derive a step ceiling from measured
throughput, run a 24-hour rung against it, and then scale to 72-hour seeds. For PPO none of
that is expressible: a 24-hour PPO rung completes in about twenty seconds, a plateau is not
observable across two updates, and there is no curve for a report to carry. PPO needs an
outer loop -- iterations of collect-then-update -- before any of that arithmetic means
anything, and no session in the set owns building one.

### A step budget is not a learning budget for three of the four

Only look-ahead turns more steps into more fitted rows. NEAT-QD's `generations` and DAgger's
`iterations` are real knobs -- 80 and 5 by default -- but `--solver-steps` does not move
either: the rollout worker re-runs the same job list `while (remaining > 0)`, so a larger
budget lengthens the bouts inside a fixed number of updates. **The unit that buys learning is
an update, and steps are a derived column.** Session 20 currently derives the wrong one.

### A look-ahead budget that leaves cells unfitted is a choice to search less, and nothing says so

The filter that stopped a severed hand throwing mid-bout -- `calibratedPlannedTactics`, which
keeps only the cells the model holds a calibration for and refuses by name only when *nothing*
survives -- makes a partial loss and a full fit look identical from outside. Under the shipped
gate that is 5 cells of 775 gone at 6 rows a key and 9 at 15, and the plan runs either way, one
search narrower, with no line in the report naming which cells went. The survival table above is
the only place it is visible and it is taken offline.

So a budget below the 60-rows-a-cell figure is not a *cheaper* look-ahead, it is a **narrower**
one, and whoever picks it owes the run record the count. The trainer already reports
`identicalCalibrationKeys` for the adjacent failure -- a split that is not a split -- and this is
the second quantity of that shape.

### No runner emits progress, and two already keep most of a ledger

All four are silent for the whole run. Each has exactly one terminal write -- `train-ppo.mjs`,
`train-neat-qd.mjs` and `collect-dagger.mjs` one `process.stdout.write` apiece, and
look-ahead's two both inside `writeLookaheadOutput` -- and every one of them fires after the
run returns. An earlier reading of this recorded "three of four emit nothing, three write
sites in look-ahead", which made look-ahead sound legible; it is not, and the true statement
is the stronger one.

**But the ledger is half-built already, and the opposite claim was also wrong.**
`train-neat-qd.mjs` pushes a row per generation carrying `species`, `archiveCoverage`,
`validationScore`, `validationWorstCellScore`, `validationCells` and `solverSteps`, and
flushes the array into `state.json` every five generations; `collect-dagger.mjs` pushes a
validation row every iteration and flushes each time. What they lack is the gate table, wall
clock, digests, and an append-only file. Session 19 generalises a working cadence rather than
inventing one, exactly as its own plan says.

**PPO alone has no mid-run persistence at all.** Its three `writeAtomic` calls are after
`trainPpo` returns, and `--stop-after-jobs` *returns* the resume bytes rather than writing
them, so a killed PPO run loses everything. `train-lookahead.mjs` has no state file and cannot
resume at all.

### Two assertions make a plateau rule illegal today

`train-neat-qd.mjs` and `collect-dagger.mjs` both throw unless
`consumedSolverSteps === solverSteps` exactly. A plateau rule stops a run early by
construction, so it cannot land in either direction without removing or conditioning those
throws -- and no session mentions them. Both files also still report
`fullBudgetCompleted: solverSteps === 1_800_000_000`: the frozen accept criterion the plan
set's opening rules exist to abolish, alive in the report schema. `src/learning/research.ts`
still declares `RESEARCH_SOLVER_STEP_BUDGET = 1_800_000_000` with no consumer.
