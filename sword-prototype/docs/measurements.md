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
// on the next `Space`, since the matchup is what `policyMind` is read from.
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
- `public/assets/warrior.glb`: 21 nodes, **13 344 triangles per fighter**, up from 5 476 of
  blockout primitives. Both fighters together draw 26 688 -- exactly twice the checker's
  count, which is what says both costumes arrived. 42 costume meshes; `G` strips all 42 and
  restores all 42.
- Dimensional check (`npm run asset:verify`): floor 0.0 mm, crown 1.800 m against a
  `fighter.height` of 1.800. The digest is pinned in `scripts/run-blender.mjs`; it pins the
  *file*, not the build, because Blender's glTF exporter is not byte-reproducible.
- Fallback verified by renaming the asset away: the page boots clean, no uncaught error,
  heads still hold 1.660 after 10 s, triangles drop to 10 952 primitives.

## The test tiers

- `npm test` -- **96 tests**, about 1.0 s, no browser. `tests/view.test.mjs` and
  `tests/handover.test.mjs` run the real solver under `NullEngine` and cost about 0.6 s
  between them; they earn it because the defects they guard are invisible to a pure test.
- `npm run measure` -- the bouts, about 90 s, deliberately **not** in `npm test`, because a
  default test run that takes minutes is a test run nobody runs.

Every assertion in the pure tier has been watched failing against a purpose-built mutation
of the thing it is about: twelve mutations of `bout.ts`, twenty-seven across the policies,
six reintroductions of the `observe` defect. Four assertions were rewritten because the
first version of each was satisfied by its own setup and survived the mutation. See the
`AGENTS.md` entry on green tests that assert nothing.

The bench's speed, measured rather than estimated: 300 bouts totalling about 3 390 s of
simulated time took **86 s of wall clock**, roughly 39x real time. An earlier probe that
stepped an arm alone read 250x; a bout steps two whole fighters, thirty dynamic bodies,
twenty-four constraints and a contact stream in the hundreds.

## What is still owed

None of this was skipped for want of effort. Every item is a judgement about how the game
feels or looks, and the tabs this was built in render a black canvas because Chrome does not
paint WebGL in a hidden window. **Two of them are cheap and change what should be built
next: the first and the fourth.**

1. **Is a human against `swinger` winnable, and not trivially so?** This is the only
   criterion that decides whether the policy work is finished. Its cycle is chamber 0.34 s,
   commit 0.13 s, follow 0.10 s, recover 0.42 s, and the recover is the opening. If it is
   unbeatable, move `SWINGER.commitSeconds`; if it is trivial, `SWINGER.recoverSeconds`.
   Write which, and what you saw, beside them.
2. **Does the sword draw as three boxes under `G`, with the pommel protruding past it?** If
   it looks like five, the overlay is drawing render meshes and is worthless. It is the
   sharpest check on the instrument the rest of this file leans on.
3. **Does body-relative aim still read under the Fixed camera**, once screen-right and
   body-right have parted company? Also whether a blade held high leaves the top of the
   frame at both zoom clamps. The verdict recorded in `docs/design.md` is provisional.
4. **The leg verdict.** Hittable, gait-driven legs shipped on a reasoned rather than a
   measured call. Walk with `G` up and watch a knee; if it chatters,
   `__sword.config.body.gaitDrivesLegs = false` takes the stride off the joints live.
5. **Do the two warriors read as armoured people at Fixed-camera range, and do crimson and
   blue read apart?** Plus the helm's open face, and whether the skirt and surcoat clip at a
   walk.
6. **Frame cost**, bracketed control -> subject -> control, on both machines, and the recoil
   table `config.ts` asks for beside `body.jointStiffness`. Both need a visible browser.

Two smaller ones, recorded where they were found rather than forgotten:

- **A pause mid-stride still slides.** `Controls.pause()` stops the control loop, so the
  keyframed torso keeps the linear velocity `steer` last gave it and the fighter drifts
  behind the curtain. True since the hero; `Space` from a decided bout is a second door onto
  it.
- **`idle` holds its blade out level**, because a centred cursor is a level arm rather than
  a lowered one. It costs nothing in any measurement -- `idle` scored zero on seventeen
  thousand contacts -- but it is not what a control condition called "idle" looks like it
  should be.
