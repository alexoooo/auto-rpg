# Rising 04: the staged riser

## Goal

A sub-mind that gets a fallen body to its feet with its own muscles: `{ kind: "staged-rise" }`. It
lies slack until still, reads how it lies, rolls to its front if it is not on it, and plays stages
that are data: poses first, then bearings solved by the bearing solve (`bearing.ts`) on knees, hands and
feet. It is scored on the battery (`research/core-rise.mjs`) beside the body that lies (`rising.md#lying`), and the lab offers
it. The game's default does not change here: `FIGHTER` still lies, and a fall still takes a body
out. Plan 05 changes both.

What is fixed here is the structure: the patches, the two kinds of limb, the two kinds of stage,
the player, its state, its tests. What a body bears on and what it does are the recipe's, data:
its limbs and its stages. What is found on the battery is the recipe's numbers, and the recipe may
change shape (a limb or a stage added, split or reordered) without the player changing; another
body's rise, or a rise with a hand kept off the ground for what it holds, is another recipe. The
prototype (design file) carries the first three stages for both humans; everything after them is
untried, and the roll most of all.

A point bears already (`BearingPoint`, `Patch`, `shareGroundWrench`, `contact-wrench.ts`), with no
reader yet: `BearingPoint` is exported when chunk C's limbs read it. The player, the pose stages
and how a body lies are in too (What stands). The rest lands in two chunks, each green:

| | Lands | Gate |
|---|---|---|
| C | limb stems in the bearing solve; the bearing stages; the hand-back | a body fallen forward stands, both humans, on the stand |
| D | the roll; the battery's row and the bar; the lab's choice; the documents | the bar below |

## Files

| File | Change | Chunk |
|---|---|---|
| `src/core/control/contact-wrench.ts` | `BearingPoint` is exported. | C |
| `src/core/control/support.ts` | `footMotionToRef` becomes `motionAtToRef(segment, ...)`; `rolledRows`. | C |
| `src/core/control/ground.ts` | `Uprightness.lowest`; `farEndToRef`. | C |
| `src/core/mind/rise/stages.ts` | `BearStage`, `LimbSpec`, `Recipe.limbs`, their faults, the bearing stages; the roll. | C, D |
| `src/core/mind/rise/staged.ts` | The bear stage's step; done and failed. | C |
| `src/core/mind/rise/limbs.ts` | New: `riseLimbs`: a recipe's limbs, made of a body. | C |
| `src/core/control/bearing.ts` | `Limb.stem`. | C |
| `src/core/math/turn.ts` | `turnErrorToRef`, lifted from the stance. | C |
| `src/core/control/stance.ts` | Calls `turnErrorToRef`, `rolledRows`, `motionAtToRef`; passes `stem: []`. | C |
| `src/lab/scenarios.ts`, `minds.ts`, `actor.ts`, `main.ts`, `hud/character-section.ts` | `LAB_DOWN_IDS`, `LAB_DOWN`, the address's `down`, the Character section's choice. | D |
| `tests/core-rise.test.mjs` | Three tests more, and test 1's limb faults. | C |
| `tests/core-fork.test.mjs` | One test. | C |
| `tests/lab-scenarios.test.mjs`, `lab-actor.test.mjs` | `down` rides the address; the actor's sub-minds are its options'. | D |
| `docs/reference/rising.md`, `docs/architecture.md`, `docs/roadmap.md`, `README.md` | See Documents. | D |

## What stands

The player and the pose stages are in, and `docs/reference/rising.md#stages` is their record.
What chunks C and D build on, where it is not what a reader would guess:

- **A posture is written from each freedom's own zero** (`Posture`, `stages.ts`; `DofSpec.bind`),
  not from the reference pose as a `Pose` is (`motor.ts`): the reference poses differ (the
  skeleton's elbows are bound at a right angle), and one recipe fits all three of `BODY_MODELS`
  only so. A channel a posture does not name goes to that zero, which is not the reference pose.
  `stageFaults` holds every channel of every stage to its range, named or not.
- **The recipe is `{ roll, rise }`**, `Stage` is `PoseStage` alone, and `RISE.rise` is three pose
  stages: `fold` (1 s), `tuck` (2 s), `prop` (1.5 s). Without `fold` the Warrior does not prop.
- **The player** (`stagedRise`): `idle`, `settle`, `roll`, `rise`. A stage's time is counted to
  the nearest step. After the rise's last stage it is `idle`, and if the body is still down the
  next step is `settle`: another attempt, `tries` up. `furthest` is raised by the rise's stages
  only. It has no switch on a stage's kind yet (a union of one does not narrow).
- **The pose drive is the speeds**: the servo read worse on the ground (`rising.md#stages`).
- **A body propped is not on its front**: its pelvis is pitched up, so `lieOf` reads a side.
  The lie is read only after the body has lain slack, which lays it down again.
- **The Rogue's arms do not raise its chest** (0.23 m at `prop`'s end; the Warrior's 0.46, the
  skeleton's 0.42): two thirds of the Warrior's shoulder and elbow strength for its weight.
  Twelve other recipes left it between 0.12 and 0.23 m.
- **A shoved fighter turns as it falls**: 69 of the battery's 95 shoved falls end on the back,
  16 on the front, 10 on a side. A test that needs a body on its front topples it stiff
  (`toppled`, `research/core-rise-trials.mjs`), and `core-rise-poses.mjs --lie` does the same. A
  body toppled stiff to a side is on its front or back by the time the riser has it.
- **Tests 1 to 5** of `tests/core-rise.test.mjs` stand: a recipe's faults; how a body lies; the
  wait, and a roll's hand-back to it; fallen forward, a body props itself (bars by model, on the
  pelvis's and the upper trunk's centres); a riser taken from begins again.
- **The battery's row** has `lie` and `stage`, and its second table is by the way of lying
  (`rising.md#battery`).

## Chunk C: the stages that bear

### `src/core/control/ground.ts`

- `Uprightness.lowest(): number`: "The height of the body's lowest point, world, m: the ground's
  level under a body that touches it." `height()` is the centre of mass's less it.
- `farEndToRef(segment: BuiltSegment, out: Vector3): Vector3`: "The point a capsule segment bears
  on when its far end is down: the centre of the end farther from the joint that carries it, a
  radius below, world." It throws, naming the segment, for a shape that is not a capsule.

### The solve gains a stem (`bearing.ts`)

A hand hangs from the upper trunk, and the solve's root is the lower trunk: between them are the
lumbar and thoracic joints, which both arms share and neither can own.

- `Limb.stem: readonly number[]`: "The channels between the root and the limb's own chain. The
  servo drives them, to the posture; the limb's task counts their motion as known, and they carry
  its patch's share of the ground's wrench." A leg's is `[]`.
- `solveLimb`: the task's known term loses the stem's part, `J_stem a_stem`, with `a_stem` the
  servo's asked accelerations (`work.accel`, as `servoAsk` leaves them). With no stem no term is
  added.
- `limbTorques`: for a bearing limb, each stem channel's torque is the servo's (`work.torque`)
  less the share carried along that freedom, as a chain's freedom's is, and its command is given
  again from it. Two hands' shares both come off the trunk's.
- `makeBearing` refuses two limbs that are ever on together and share a channel; since which are
  on is a stage's, the check is `stageFaults`': a stage that bears on a knee and on that leg's foot
  is a fault.

### The limbs (`stages.ts`, `src/core/mind/rise/limbs.ts`)

A limb is data in the recipe, of one of two kinds; the player knows the kinds and no limb.

```ts
/** **A foot, bearing on its sole**: one of the feet the stance stands on (`footStatesOf`). */
export interface SoleLimb {
  readonly kind: "sole";
  /** What the stages call it. */
  readonly name: string;
  /** The foot's segment. */
  readonly segment: string;
}

/** **A capsule segment, bearing on its far end** (`farEndToRef`): a point. */
export interface EndLimb {
  readonly kind: "end";
  readonly name: string;
  readonly segment: string;
  /** The joint its own chain begins at; the joints before it, from the root, are its stem. */
  readonly from: string;
  /** The three channels of its chain that take its point's rows; the chain's others are asked toward the stage's posture ahead of the task. */
  readonly takes: readonly [string, string, string];
}
```

`Recipe` gains them, and `Stage` the bearing kind; the player's `roll` and `rise` cases switch on
the stage's kind with a `never` default:

```ts
export type Stage = PoseStage | BearStage;
export type LimbSpec = SoleLimb | EndLimb;

export interface Recipe {
  /** The limbs a bearing stage may name, in the order the riser's memory keeps them. */
  readonly limbs: readonly LimbSpec[];
  readonly roll: Readonly<Record<Exclude<Lie, "front">, readonly PoseStage[]>>;
  readonly rise: readonly Stage[];
}
```

```ts
/** `recipe`'s limbs made of `own`'s body, in the recipe's order, and each limb's part of a step (`aim`). `memory` is the riser's, a limb's by its place. */
export function riseLimbs(own: OwnBody, recipe: Recipe, memory: RiseLimbMemory): RiseLimbs
```

A limb's chain and stem are read off the body: `chainTo(built, segment)`
(`src/core/control/kinematics.ts`) from `from` on is its chain, what comes before is its stem. A
sole's chain is all of it. `riseLimbs` switches on `kind` with a `never` default.

`RISE.limbs`, the humans' and the skeleton's (they share their segments' and joints' names):

| Name | Kind | Segment | From | Takes | So its chain, and stem |
|---|---|---|---|---|---|
| `foot.<side>` | sole | `foot.<side>` | | | hip, knee, ankle |
| `knee.<side>` | end | `thigh.<side>` | `hip.<side>` | the hip's three | hip |
| `hand.<side>` | end | `hand.<side>` | `shoulder.<side>` | shoulder flexion, shoulder abduction, elbow flexion | shoulder, elbow, wrist; lumbar, thoracic |

- **A sole** is read as the stance reads it (`footStatesOf`, `readSupport`), in feet of the
  riser's own, found by segment. It bears on its front edge while its heel is off the ground and on
  its sole once down: `rolled` is set when `foot.heel > foot.flat + HEEL_UP` and cleared when
  `foot.heel <= foot.flat`, the stance's own test for coming down. On its edge its rows are the
  rolled foot's (`rolledRows(foot)`, lifted from `aimLimb` into `support.ts`, which the stance now
  calls) and its ankle is asked toward its stop less `STANCE_ANKLE_SPARE` ahead of the task, as
  the stance asks it. Its patch is the sole, drawn in as the stance draws it (`bearingSole`).
- **An end** asks its point's three rows (`[[3, 1]], [[4, 1]], [[5, 1]]`): the segment turns
  about its point as the body moves. Its `takes` take the rows; the rest of its chain (a hand's
  wrist and its shoulder's rotation) is asked toward the stage's posture ahead of the task
  (`work.ahead`, critically damped at the stage's time). Its patch is a point at its far end.
- A bearing limb's task is its point held still, its motion damped at the stage's rate, as
  `holdStance` does (`motionAtToRef`).
- What a hand holds is not read: a hand with a club in it bears as an empty one. A recipe for a
  hand that must not bear (a bow in it) leaves that hand's limb out of its stages.
- `HEEL_UP`: the height a heel is taken to be off the ground from, m; a tolerance on a reading,
  cited to `rising.md#stages`.

`stageFaults` gains the limbs': a name used twice; a segment or a joint the body lacks; a sole
whose segment is not one of the stance's feet; an end whose segment is not a capsule, whose
`from` is not on the way from the root to it, or whose `takes` are not three channels of its
chain; a stage that bears on a limb the recipe does not have, or on two that share a channel; and
shares that do not sum to 1.

### The stage

```ts
/** **A stage that is a bearing**: the body borne on `on`, its centre of mass carried over them. */
export interface BearStage {
  readonly kind: "bear";
  readonly name: string;
  /** The limbs that bear, by the recipe's names, each with its share of the place the centre of mass is held over; the shares sum to 1. */
  readonly on: readonly { readonly limb: string; readonly share: number }[];
  /** The centre of mass's height over the ground, as a part of its standing height (`Uprightness.standing`). */
  readonly height: number;
  /** The pelvis's pitch forward from upright, about the level axis across the way it faces, rad. */
  readonly pitch: number;
  /**
   * What every freedom outside the bearing limbs' chains is servoed to (the stems among them):
   * a posture, from each freedom's zero, or the body's reference pose, which no posture can
   * name since the bodies' differ.
   */
  readonly posture: Posture | "reference";
  /** The time constant of its aims, s; and the longest it may take, s. */
  readonly seconds: number;
  readonly limit: number;
}
```

A step of a bear stage, in `motorControl`'s order:

1. Read: the centre of mass and its velocity (`view.stance`); the ground's level
   (`upright.lowest()`); the feet (`readSupport`); each limb's point.
2. The limbs: those of `on` are on and bearing, their work aimed (`riseLimbs.aim`); the rest off.
3. The aim. `centre`: toward the place (the bearing points' middle, weighed by their shares; the
   stage's `height` times `standing` over the ground), critically damped at `seconds`, from the
   centre of mass as it is. `spin`: toward the pelvis's reference turn, pitched by `pitch`, then
   turned about up to the way the pelvis faces now (`StanceReading.facing`'s arithmetic), by
   `turnErrorToRef` over `seconds`, less the pelvis's spin, as `aimRoot` does.
4. `servoAsk` (a bearing limb's chain is left be; the rest go to `posture`), `carryRoot`,
   `servoSolve` with the root's acceleration, `bearLimbs`, bounded. The lever is the greater of a
   sole's half-length and the root's height over the ground. The assist is the body's
   (`own.assist`), within its ceiling, as the stance uses it.

A stage is **done** when the centre of mass is within `NEAR` of its aim and slower than `SLOW`;
it has **failed** at its `limit`, which ends the attempt (`settle`). The last stage done, the
phase is `idle`; the body is not down, so `wants` is false and the host has it back
(`HostMind.resume`).

`turnErrorToRef(now, target, out)` (`src/core/math/turn.ts`): "The turn from `now` to `target`, as
its axis times its angle, world, into `out`." It is the four lines `pelvisTurn` and `swingFoot`
each end their error with; both call it, and the digest holds.

The riser's state gains the solve's records (`tasks`, a `LimbTask` for each of the recipe's
limbs, in its order; `aim`, with `root`; `helped`; `held`; `shortfall`) and the feet's memory
(`channels`, `rolled`). `ServoWork` is the
servo's scratch, written by `servoAsk` before it is read, whichever mind asks.

The first table's bearing stages, after `fold`, `tuck` and `prop`. The shares and the pitch are
geometry (which limbs, and a trunk level, half up, upright); the heights are first guesses read
off the prototype's table, and each is found on the stand. The postures are from each freedom's
zero: the prototype's, which were from the Warrior's reference pose, with its binds added:

| Stage | Bears on | Height | Pitch | Posture | Seconds, limit |
|---|---|---|---|---|---|
| `fours` | knees 0.25 each, hands 0.25 each | 0.36 | 1.45 | ankle dorsiflexion 0.3 (the toes under), knee flexion 1.7 | 0.4, 4 |
| `bear` | feet 0.35 each, hands 0.15 each | 0.40 | 1.2 | none named | 0.4, 4 |
| `crouch` | feet 0.5 each | 0.55 | 0.6 | shoulder flexion 0.6, shoulder abduction 0.7, elbow flexion 1.2 | 0.4, 4 |
| `stand` | feet 0.5 each | 1 less `STANCE_LOWER` over the standing height | 0 | the reference pose | 0.4, 4 |

### Tests

6. **`a body on its knees and hands holds itself there`**: each human, toppled forward
   (`toppled`), through `fold`, `tuck`, `prop` and `fours` alone. Two seconds after `fours` is done the centre of mass has not
   moved 2 cm, the shortfall's force is under a twentieth of the weight, each bearing point is
   within 2 cm of the ground, the upper trunk's centre has not dropped 2 cm, and the trunk joints'
   torques are not zero. Its control is its first mutation: the stems left out, the trunk sags.
7. **`fallen forward, a human stands up`**: each human, unarmed, toppled forward, under the whole
   rise. Within `WATCH_SECONDS` `body.view.down` is false for `UP_SECONDS` running, the riser
   no longer has the body, and 3 s later it stands: not down, its centre of mass over its soles.
   (Under `createMind` with the fighter's commands, `body.has` is back to `"command"` and it
   stands in guard: one model, shoved as the battery shoves, on a shove that ends on its front.)
8. **`a stage that cannot be reached is given up, and the rise begins again`**: a recipe whose
   `fours` asks a height of 0.9. At its `limit` the phase is `settle`, `tries` goes up, every
   activation is 0 that step, and the body is not flung (no segment over 3 m/s).
9. `tests/core-fork.test.mjs`, **`a_body_forks_mid_rise`**: test 7's Warrior, forked every tenth
   step from the fall to the hand-back; the paths under `mind > subs` are sorted as needed.

Test 1 gains the limbs' faults, a recipe for each: a limb named twice; an end on `foot.left` (a
box); a hand whose `from` is `hip.left`; a `takes` naming a wrist channel twice; a stage on
`"tail"`; a stage on `knee.left` and `foot.left`; shares summing to 0.9. And its control: `RISE`
has none, for each of `BODY_MODELS`.

Mutations: `riseLimbs` takes a hand's stem as empty whatever `from` says (test 6: the trunk
sags); `stageFaults` skips the limbs (test 1); `limbTorques` leaves the stem's torques as the
servo's (test 6: the trunk sags); a knee's rows all six (test 6: the thigh cannot turn about its knee as the body
moves); `rolled` never cleared (test 7: it stands on its toes and `stand` fails); the
`limit` ignored (test 8); the aim's place taken as the first limb's point (test 6's drift);
`state.stage` kept in a closure (test 9); `turnErrorToRef` with the product reversed
(`core-stance`'s heading test).

Gate: the digests and the fingerprint the same (the stance's calls moved, no number did), and
test 7.

## Chunk D: the roll, the bar, the lab

### The roll

`RISE.roll`: pose stages for `back`, `left` and `right`, found with `research/core-rise-poses.mjs`
before any is written into the table. The back's carries the bar: 69 of the battery's 95 shoved
falls end on it. The instrument topples its body stiff, so `--lie left` and `right` give a body
that has rolled on to its front or back already: a side's roll is found from the back's, which
passes through a side, or on the battery's own shoves that end on one (`shoved`). The first
candidates, each to be tried on both humans:

- from a side: the upper leg's hip flexed and brought across, the upper arm reached across, the
  trunk turned toward the ground (lumbar and thoracic rotation), then both legs straightened;
- from the back: one knee drawn up and dropped across the other leg with the trunk turned after
  it, the far arm reached across; then as from that side.

A roll that ends not on the front is not a failure: the riser lies slack, reads again, and plays
the roll of the lie it finds.

### The row and the bar

`node research/core-rise.mjs --mind '{"kind":"fighter","subs":[{"kind":"staged-rise"}]}'`, beside
`#lying`'s table. The bar, set and not swept, written in `rising.md#staged` with the table:

- each human, each loadout (`LOADOUTS`: club and empty today): risen within the watch in at least
  three falls of four of the sixteen shoves;
- no way of lying under half, either human;
- the bout falls: at least half risen;
- the skeleton: reported, not held to the bar;
- nothing flung: `peak` no worse than `#driven`'s (a fighter that hands its body to nobody).

Under the bar, chunks A to C stand, the lab offers the riser as it is, the table says where it
stops (`stage`), and plan 05 does not land. What is tried next is the table's: the stage most
attempts stop at.

### The lab

- `scenarios.ts`: `LAB_DOWN_IDS = ["lie", "rise"] as const`, `LabDownId`; `LabAddress.down`, the
  key `down` in `KEYS`, read and written as `mind` is; `"lie"` unless given.
- `minds.ts`: `LAB_DOWN: Readonly<Record<LabDownId, { readonly name: string; readonly subs: readonly SubMindConfig[] }>>`:
  `lie: { name: "Lies", subs: [{ kind: "lie" }] }`, `rise: { name: "Rises", subs: [{ kind: "staged-rise" }] }`.
- `actor.ts`: `ActorOptions.subs`, in place of `FIGHTER.subs`; `main.ts` passes
  `subMindsOf(LAB_DOWN[to.down].subs)`.
- `hud/character-section.ts`: a choice "Down" after "Type".
- The Thinking section already says who has the body (`watchHas`).

Tests: `lab-scenarios`' whole address record gains `down`, there and back through a link, and an
unknown `down` reads as `"lie"`; `lab-actor`: an actor made with `LAB_DOWN.rise.subs` has
`body.has` `"staged-rise"` after a shove, and with `LAB_DOWN.lie.subs`, `"lie"`.

**Eye gate.** The lab's Stance, `down=rise`, shoved from the front, the back and a side, each
human: the owner watches it get up.

## What may not work, and what then

- **The Rogue's arms.** Under the pose drive they do not raise its chest, and `fours` begins
  with it 0.23 m up. A bearing hand is driven by the solve at what its muscles give, the trunk's
  joints with it, which may do what the pose drive did not; its strength is its source's and is
  not raised. If `fours` cannot be reached on its hands, its route brings its weight back over
  its knees first (sitting back on its heels, the hips over the feet), where its legs carry it:
  another order of stages, and if the Warrior's is better as it is, a recipe of its own, chosen
  by `StagedRiseConfig`'s field. Read already: `prop` with the hips opened to 1.3 rad ends the
  Warrior's and the skeleton's chests at 0.50 and 0.49 m, and drops the Rogue's pelvis to 0.31.
- **The roll.** Untried. If no pose sequence turns a body over, the roll becomes bearing stages
  (a side-lying body bears on a hand and a knee), or the bar is missed on the back and the table
  says so.
- **Knees as points.** On its knees a body's shanks and feet lie on the ground too and take some
  of its weight; the solve gives it all to the knees. If `fours` sags or rocks, the shank becomes
  a limb (its far end a second point).
- **The trunk as a stem.** Its torques come from the servo and are corrected after; a trunk
  joint at its strength is not known to `carryRoot`. If test 5 holds but the transitions do not,
  the stem's freedoms join the solve as held freedoms (`heldFreedoms`).
- **`crouch` to `stand`.** A squat on the fronts of the feet, then the heels down: the knees'
  strength at full bend is the question (the Warrior's knee extensors peak at 259 N m, the
  Rogue's at 135; what a deep squat asks of them is not measured). If it fails, the route goes
  through a half-kneel: one foot planted from `fours`, which needs a limb moved to a place, a
  third kind of task the stage would then name.
- **A club in the hand.** The hand's point is the hand's; a club under it is not known. The
  battery's club row shows what that costs. If it costs the bar, the armed hand's limb is an end
  on the forearm (its far end, the wrist), which is a row of the recipe, and which recipe a body
  plays is then `StagedRiseConfig`'s field, chosen where the mind's config is written.
- **The skeleton.** It plays the humans' recipe, its names being theirs, and its numbers may not
  suit it; its recipe is then its own, chosen the same way.

## Documents

- `docs/reference/rising.md`: `## Stages` gains the bearing stages and the roll (the table as it
  lands, each number's reading, every revision's battery table); `## Staged` (the battery's
  table, the bar, the harness line; each side's balance, 0 %).
- `docs/architecture.md`: the Minds section's sub-minds gain the riser; the Motor control section
  says a limb may hang from a stem and a patch may be a point; the lab's Character section.
- `docs/roadmap.md`: "Rising after a fall" reads as built, for the lab; the fights take it up once
  the bar is met (plan 05); the searched and the learned riser are the open items.
- `README.md`: the lab's "Down" choice.

## Verification

```powershell
node scripts/fingerprint.mjs > before.txt
node research/bout-trace.mjs
node research/bout-trace.mjs crypt-skeleton crypt-skeleton 60
npm test
npm run check
npm run build
node scripts/fingerprint.mjs > after.txt      # no line differs: nothing in a fight rises yet
node research/bout-trace.mjs                  # the same digests
node research/bout-trace.mjs crypt-skeleton crypt-skeleton 60
node research/core-rise.mjs --mind '{"kind":"fighter","subs":[{"kind":"staged-rise"}]}'
node research/body-cost.mjs                   # a rising body's step, beside a standing one's
```
