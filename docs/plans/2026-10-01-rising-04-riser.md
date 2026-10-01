# Rising 04: the staged riser

## Goal

A sub-mind that gets a fallen body to its feet with its own muscles: `{ kind: "staged-rise" }`. It
lies slack until still, reads how it lies, rolls to its front if it is not on it, and plays stages
that are data: poses first, then bearings solved by the bearing solve (plan 03) on knees, hands and
feet. It is scored on the battery (plan 01) beside the body that lies (plan 02), and the lab offers
it. The game's default does not change here: `FIGHTER` still lies, and a fall still takes a body
out. Plan 05 changes both.

What is fixed here is the structure: the patches, the limbs, the two kinds of stage, the player,
its state, its tests. What is found on the battery is the stage table's numbers, and the table may
change shape (a stage added, split or reordered) without the player changing. The prototype
(design file) carries the first three stages for both humans; everything after them is untried,
and the roll most of all.

It lands in four chunks, each green:

| | Lands | Gate |
|---|---|---|
| A | point patches in `shareGroundWrench` | the trace digests and the fingerprint, to the bit |
| B | the player, the pose stages, how a body lies; `StagedRiseConfig` | a body fallen forward gets its pelvis off the ground and props itself |
| C | limb stems in the bearing solve; the bearing stages; the hand-back | a body fallen forward stands, both humans, on the stand |
| D | the roll; the battery's row and the bar; the lab's choice; the documents | the bar below |

## Files

| File | Change | Chunk |
|---|---|---|
| `src/core/control/contact-wrench.ts` | `BearingPoint`, `Patch`; `BearingSole.kind`; `shareGroundWrench` takes patches. | A |
| `src/core/control/support.ts` | `bearingSole` returns `kind: "sole"`; `footMotionToRef` becomes `motionAtToRef(segment, ...)`; `rolledRows`. | A, C |
| `src/core/control/ground.ts` | `Uprightness.lowest`; `farEndToRef`. | B |
| `src/core/mind/config.ts`, `sub-minds.ts` | `StagedRiseConfig`; its case. | B |
| `src/core/mind/rise/stages.ts` | New: `Stage`, `Recipe`, `RISE`, `stageFaults`. | B, C, D |
| `src/core/mind/rise/staged.ts` | New: `stagedRise`. | B, C, D |
| `src/core/mind/rise/limbs.ts` | New: `riseLimbs`, `LimbName`. | C |
| `src/core/control/bearing.ts` | `Limb.stem`; `LimbWork.patch` is a `Patch`. | C |
| `src/core/math/turn.ts` | `turnErrorToRef`, lifted from the stance. | C |
| `src/core/control/stance.ts` | Calls `turnErrorToRef`, `rolledRows`, `motionAtToRef`; passes `stem: []`. | C |
| `research/core-rise-trials.mjs`, `core-rise.mjs` | The row's `lie` and `stage`; the table by way of lying. | B, D |
| `research/core-rise-poses.mjs` | New: plays a recipe's pose stages on the stand, for finding them. | B |
| `src/lab/scenarios.ts`, `minds.ts`, `actor.ts`, `main.ts`, `hud/character-section.ts` | `LAB_DOWN_IDS`, `LAB_DOWN`, the address's `down`, the Character section's choice. | D |
| `tests/core-contact-wrench.test.mjs` | Two tests. | A |
| `tests/core-rise.test.mjs` | New: seven tests. | B, C, D |
| `tests/core-fork.test.mjs` | One test. | C |
| `tests/lab-scenarios.test.mjs`, `lab-actor.test.mjs` | `down` rides the address; the actor's sub-minds are its options'. | D |
| `docs/reference/rising.md`, `docs/architecture.md`, `docs/roadmap.md`, `README.md` | See Documents. | D |

## Chunk A: a point bears

`contact-wrench.ts`:

```ts
export interface BearingSole { readonly kind: "sole"; /* as it is */ }

/** A point on level ground (y up), bearing: it gives a force at itself and no moment. */
export interface BearingPoint {
  readonly kind: "point";
  readonly at: Vector3;
}

/** What a body bears on the ground through. */
export type Patch = BearingSole | BearingPoint;

export function shareGroundWrench(patches: readonly Patch[], centre: Vector3, force: Vector3, moment: Vector3,
  friction: number, lever: number, out: SoleWrench[], miss?: { force: Vector3; moment: Vector3 }): void
```

- A sole has six unknowns and a point three; `o`, a patch's first column, is the sum of the widths
  before it, where the code has `6 * s`. Each loop over patches switches on `kind` with a `never`
  default.
- A point's columns are its force's; its `D` is 1; its limits are three: it does not pull
  (`f.y >= 0`), and it does not slide, within the pyramid inscribed in the cone of `friction`
  along the world's x and z (`|f.x| <= mu f.y`, `|f.z| <= mu f.y`, `mu` as a sole's). It starts
  from the same light press (`START`). Its share's moment is zero.
- With soles alone every sum has the terms it has today in the order it has them, so the stance's
  shares are the same to the bit. The header says patches, and what a point's limits are.

`bearingSole` (`support.ts`) returns `kind: "sole"`; the soles written in
`tests/core-contact-wrench.test.mjs` gain it.

Tests, in `tests/core-contact-wrench.test.mjs`:

1. **`three points give every wrench whose pressure falls inside them, and no moment each`**:
   three points at the corners of a triangle; a weight with its centre of pressure at twenty
   places inside is given with a miss under 1e-6 of it, each share's moment exactly zero and its
   force inside its pyramid; at a place outside, the miss's moment is not zero and every share
   still holds its limits; a pull upward is not given at all.
2. **`a sole and two points share as their levers do`**: a sole behind and two points ahead, the
   wrench of a weight over the middle of the three: the sole's normal force and the points'
   together are the weight, split as the levers say, within 1e-6.

Mutations: a point given a moment's columns (test 1's zero); the pyramid's test dropped (test 1's
limits); `o` taken as `6 * s` with a point before a sole (test 2).

Gate: `npm test`; `node research/bout-trace.mjs` and
`node research/bout-trace.mjs crypt-skeleton crypt-skeleton 60`, the same digests; the
fingerprint, no line different.

## Chunk B: the player, and the stages that are poses

### `src/core/mind/config.ts`, `sub-minds.ts`

```ts
/** Rise by stages (`stagedRise`, `rise/staged.ts`): the recipe is the game's (`RISE`). */
export interface StagedRiseConfig { readonly kind: "staged-rise" }

export type SubMindConfig = LieConfig | StagedRiseConfig;
```

`subMind` gains `case "staged-rise": return stagedRise(own);`. The config has no field: it gains
one when a second recipe exists and something chooses between them.

### `src/core/control/ground.ts`

- `Uprightness.lowest(): number`: "The height of the body's lowest point, world, m: the ground's
  level under a body that touches it." `height()` is the centre of mass's less it.
- `farEndToRef(segment: BuiltSegment, out: Vector3): Vector3`: "The point a capsule segment bears
  on when its far end is down: the centre of the end farther from the joint that carries it, a
  radius below, world." It throws, naming the segment, for a shape that is not a capsule.

### `src/core/mind/rise/stages.ts`

```ts
/** How a body lies: on its front, its back, or a side (the side that is down). */
export type Lie = "front" | "back" | "left" | "right";

/** **A stage that is a pose**: every freedom driven toward `posture` for `seconds`. */
export interface PoseStage {
  readonly kind: "pose";
  readonly name: string;
  /** Goal angles by channel name, rad (`Pose`, `motor.ts`); a channel it does not name goes to 0. */
  readonly posture: Pose;
  readonly seconds: number;
}

/** **A stage that is a bearing** (chunk C). */
export interface BearStage { readonly kind: "bear"; /* below */ }

export type Stage = PoseStage | BearStage;

/** **A rise, as data**: the stages that turn a body onto its front from each other way it lies, and the stages that stand it up from its front. */
export interface Recipe {
  readonly roll: Readonly<Record<Exclude<Lie, "front">, readonly PoseStage[]>>;
  readonly rise: readonly Stage[];
}

/** The game's recipe (`docs/reference/rising.md#stages`: each stage's numbers, and the battery's table for each change to them). */
export const RISE: Recipe = deepFreeze({ ... });

/** What is wrong with `recipe` for `spec`, in words; none if it can be played. */
export function stageFaults(recipe: Recipe, spec: BodySpec): string[]
```

The first table's pose stages, from the prototype, both sides alike:

| Stage | Posture, rad | Seconds |
|---|---|---|
| `tuck` | hip flexion 2.0, knee flexion 2.4, ankle dorsiflexion -0.9, lumbar flexion 0.7, shoulder flexion 0.9, elbow flexion 1.6 | 1.5 |
| `prop` | as `tuck`, but shoulder flexion 1.3, elbow flexion 0.2 | 1.5 |

`stageFaults` in this chunk: a posture's channel the body lacks; an angle outside its freedom's
range; a stage of no time. `stagedRise` throws them when it is made.

### `src/core/mind/rise/staged.ts`

```ts
/**
 * **Rising by stages.** It wants the body from the step it is down until it stands or is taken
 * from it. It lies slack until it is still; reads how it lies; if not on its front, plays that
 * lie's roll and lies slack again; on its front, plays the rise. A stage that fails ends the
 * attempt: it lies slack and begins again, from the body as it is, as often as it takes.
 */
export function stagedRise(own: OwnBody, recipe: Recipe = RISE): SubMind
```

Its state, plain data:

```ts
{
  /** What it is doing: nothing (the body is not its own), lying slack, rolling, or rising. */
  phase: "idle" as "idle" | "settle" | "roll" | "rise",
  lie: "front" as Lie,
  /** The stage under way, in the roll or the rise; the time in it, s; how long it has lain still, s. */
  stage: 0, time: 0, still: 0,
  /** How many attempts this fall has had, and the furthest stage any reached (the battery's column). */
  tries: 0, furthest: -1,
}
```

- `wants: () => state.phase !== "idle" || upright.down()`.
- `begin()`: `phase = "settle"`, `still = 0`, `tries = 0`, `furthest = -1`. `end()`: `phase = "idle"`.
- `step`, by `phase`, a switch with a `never` default:
  - `settle`: every activation and speed 0. The centre of mass's speed is read (the segments'
    `linearVelocityToRef`, weighed by mass, as `StanceControl.read` does); `still` counts the time
    it has been under `SLOW`, and at `STILL_SECONDS` the lie is read, `tries` goes up, and the
    phase is `roll` (not on its front) or `rise`, at stage 0.
  - `roll`, `rise`, a pose stage: each channel `i` with goal `g = posture[name] ?? 0`:
    `velocity[i] = clamp((g - angle(i)) / POSE_SECONDS, -POSE_SPEED, POSE_SPEED)`,
    `activation[i] = 1`. After its `seconds`, the next stage; after a roll's last, `settle`; after
    the rise's last, `idle`.
  - a bear stage: chunk C.
- **How it lies** (`lieOf`, exported for the test): the pelvis's forward (the reference pose's
  (0, 0, 1), turned by `turnOfToRef(pelvis)`) against up: over `LIE_UP`, `back`; under its
  opposite, `front`; else the side the pelvis's left is under.
- Constants, each citing `docs/reference/rising.md#stages`: `POSE_SECONDS = 0.2` and
  `POSE_SPEED = 3` (the prototype's drive), `SLOW = 0.1` m/s, `STILL_SECONDS = 0.5`,
  `LIE_UP = 0.5`.

The pose stage is driven as the prototype's was, since that is what the readings are of. Its other
candidate is the joint servo (`servo(driver, goal, seconds, dt)`); the chunk runs `tuck` and `prop`
both ways on the stand and records the two rows in `rising.md#stages`. The servo takes the root to
be held, which a body on the ground is not; if it reads no worse it replaces the speeds, since it
is the core's one way to a pose.

### `research/core-rise-poses.mjs`

    node research/core-rise-poses.mjs --model workshop-fighter --lie back --stages '<PoseStage[] JSON>'

The battery's body, felled (`--lie front|back|left|right`: the shove's way), slack until still,
then the stages played by `stagedRise`'s own pose drive; it prints, after each stage, the lie and
the heights of the centre of mass, the pelvis and the head. It is the instrument the roll's stages
are found with, in chunk D, and the two humans' `tuck` and `prop` are its first rows.

### `research/core-rise-trials.mjs`

The row gains `lie`, how the body lay a second after its fall (`lieOf`), and `stage`, the name of
the furthest stage reached (`state.furthest`), or null under a mind that has none. The table
gains a line for each way of lying, over all the shoves of a model.

### Tests (`tests/core-rise.test.mjs`, Node stand, Rapier, 120 Hz)

1. **`a recipe that cannot be played says why`**: `stageFaults(RISE, spec)` is empty for each of
   `BODY_MODELS`; a recipe with a posture channel `"tail flexion"` names it; with a knee asked
   3 rad, names it and the range.
2. **`how a body lies is read from its pelvis`**: the Warrior shoved forward, backward, and to
   each side, slack until still: `lieOf` is `front`, `back`, and the side it fell to.
3. **`fallen forward, a human draws its knees under and props itself`**: each human under
   `{ kind: "fighter", subs: [{ kind: "staged-rise" }] }` with a recipe of `tuck` and `prop` alone,
   shoved forward. At the end of `prop` the pelvis is over 0.30 m and the head over 0.15 m (the
   prototype: Warrior 0.41 and 0.45, Rogue 0.37 and 0.19; lying, 0.16 and 0.12); `body.has` is
   `"staged-rise"` from the fall to the last stage's end; the state's `furthest` is 1.
4. **`a riser that is taken from begins again`**: a written sub-mind of higher rank wants the body
   for 0.5 s in the middle of `prop`; after it lets go the riser's phase is `settle` and `tries`
   is 1 again.

Mutations: `settle` skips the wait (test 3's Rogue, which is still sliding); the pose drive's
activation 0 (test 3); `lieOf` reads the head (test 2's side); `end` leaves the phase (test 4);
`stageFaults` skips ranges (test 1).

## Chunk C: the stages that bear

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
- `LimbWork.patch` is a `Patch`.
- `makeBearing` refuses two limbs that are ever on together and share a channel; since which are
  on is a stage's, the check is `stageFaults`': a stage that bears on a knee and on that leg's foot
  is a fault.

### The limbs (`src/core/mind/rise/limbs.ts`)

```ts
export type LimbName = "foot.left" | "foot.right" | "knee.left" | "knee.right" | "hand.left" | "hand.right";

/** The six limbs a rise bears on, in `LimbName`'s order, made of `own`'s body, and each limb's part of a step (`aim`). */
export function riseLimbs(own: OwnBody, memory: RiseLimbMemory): RiseLimbs
```

| Limb | Segment | Chain | Stem | Point | Patch |
|---|---|---|---|---|---|
| foot | `foot.<side>` | hip, knee, ankle | | the front edge's middle while the heel is up, the sole's middle once it is down | the sole, drawn in as the stance draws it (`bearingSole`) |
| knee | `thigh.<side>` | hip | | `farEndToRef(thigh)` | a point there |
| hand | `hand.<side>` | shoulder, elbow, wrist | lumbar, thoracic | `farEndToRef(hand)` | a point there |

- **A foot** is read as the stance reads it (`footStatesOf`, `readSupport`), in feet of the
  riser's own. It bears on its front edge while its heel is off the ground and on its sole once
  down: `rolled` is set when `foot.heel > foot.flat + HEEL_UP` and cleared when
  `foot.heel <= foot.flat`, the stance's own test for coming down. On its edge its rows are the
  rolled foot's (`rolledRows(foot)`, lifted from `aimLimb` into `support.ts`, which the stance now
  calls) and its ankle is asked toward its stop less `STANCE_ANKLE_SPARE` ahead of the task, as
  the stance asks it.
- **A knee and a hand** ask their point's three rows (`[[3, 1]], [[4, 1]], [[5, 1]]`): the segment
  turns about its point as the body moves. A knee's three hip freedoms take the three rows. A
  hand's chain has seven freedoms: its wrist's three and its shoulder's rotation are asked toward
  the stage's posture ahead of the task (`work.ahead`, critically damped at the stage's time), and
  the shoulder's flexion and abduction and the elbow take the rows.
- A bearing limb's task is its point held still, its motion damped at the stage's rate, as
  `holdStance` does (`motionAtToRef`).
- What a hand holds is not read: a hand with a club in it bears as an empty one.
- `HEEL_UP`: the height a heel is taken to be off the ground from, m; a tolerance on a reading,
  cited to `rising.md#stages`.

### The stage

```ts
/** **A stage that is a bearing**: the body borne on `on`, its centre of mass carried over them. */
export interface BearStage {
  readonly kind: "bear";
  readonly name: string;
  /** The limbs that bear, each with its share of the place the centre of mass is held over; the shares sum to 1. */
  readonly on: readonly { readonly limb: LimbName; readonly share: number }[];
  /** The centre of mass's height over the ground, as a part of its standing height (`Uprightness.standing`). */
  readonly height: number;
  /** The pelvis's pitch forward from upright, about the level axis across the way it faces, rad. */
  readonly pitch: number;
  /** What every freedom outside the bearing limbs' chains is servoed to (the stems among them). */
  readonly posture: Pose;
  /** The time constant of its aims, s; and the longest it may take, s. */
  readonly seconds: number;
  readonly limit: number;
}
```

A step of a bear stage, in `motorControl`'s order:

1. Read: the centre of mass and its velocity; the ground's level (`upright.lowest()`); the feet
   (`readSupport`); each limb's point.
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

The riser's state gains the solve's records (`tasks`, six `LimbTask`s; `aim`, with `root`;
`helped`; `held`; `shortfall`) and the feet's memory (`channels`, `rolled`). `ServoWork` is the
servo's scratch, written by `servoAsk` before it is read, whichever mind asks.

The first table's bearing stages. The shares and the pitch are geometry (which limbs, and a trunk
level, half up, upright); the heights are first guesses read off the prototype's table, and each
is found on the stand:

| Stage | Bears on | Height | Pitch | Posture | Seconds, limit |
|---|---|---|---|---|---|
| `fours` | knees 0.25 each, hands 0.25 each | 0.36 | 1.45 | ankle dorsiflexion 0.3 (the toes under), knee flexion 1.6, wrist and neck 0 | 0.4, 4 |
| `bear` | feet 0.35 each, hands 0.15 each | 0.40 | 1.2 | | 0.4, 4 |
| `crouch` | feet 0.5 each | 0.55 | 0.6 | shoulder flexion 0.6, elbow flexion 0.4 | 0.4, 4 |
| `stand` | feet 0.5 each | 1 less `STANCE_LOWER` over the standing height | 0 | the reference pose | 0.4, 4 |

### Tests

5. **`a body on its knees and hands holds itself there`**: each human, fallen forward, through
   `tuck`, `prop` and `fours` alone. Two seconds after `fours` is done the centre of mass has not
   moved 2 cm, the shortfall's force is under a twentieth of the weight, each bearing point is
   within 2 cm of the ground, and the trunk joints' torques are not zero. The control: the same
   with the hands' stems empty, where the trunk sags (the upper trunk's centre drops 5 cm).
6. **`fallen forward, a human stands up`**: each human, unarmed, shoved forward, under the whole
   rise. Within `WATCH_SECONDS` `body.view.down` is false for `UP_SECONDS` running, `body.has` is
   back to `"command"`, and 3 s later it stands in guard: not down, its centre of mass over its
   soles.
7. **`a stage that cannot be reached is given up, and the rise begins again`**: a recipe whose
   `fours` asks a height of 0.9. At its `limit` the phase is `settle`, `tries` goes up, every
   activation is 0 that step, and the body is not flung (no segment over 3 m/s).
8. `tests/core-fork.test.mjs`, **`a_body_forks_mid_rise`**: test 6's Warrior, forked every tenth
   step from the fall to the hand-back; the paths under `mind > subs` are sorted as needed.

Mutations: `limbTorques` leaves the stem's torques as the servo's (test 5: the trunk sags as its
control's does); a knee's rows all six (test 5: the thigh cannot turn about its knee as the body
moves); `rolled` never cleared (test 6: it stands on its toes and `stand` fails); the
`limit` ignored (test 7); the aim's place taken as the first limb's point (test 5's drift);
`state.stage` kept in a closure (test 8); `turnErrorToRef` with the product reversed
(`core-stance`'s heading test).

Gate: the digests and the fingerprint the same (the stance's calls moved, no number did), and
test 6.

## Chunk D: the roll, the bar, the lab

### The roll

`RISE.roll`: pose stages for `back`, `left` and `right`, found with `research/core-rise-poses.mjs`
before any is written into the table. The first candidates, each to be tried on both humans:

- from a side: the upper leg's hip flexed and brought across, the upper arm reached across, the
  trunk turned toward the ground (lumbar and thoracic rotation), then both legs straightened;
- from the back: one knee drawn up and dropped across the other leg with the trunk turned after
  it, the far arm reached across; then as from that side.

A roll that ends not on the front is not a failure: the riser lies slack, reads again, and plays
the roll of the lie it finds.

### The row and the bar

`node research/core-rise.mjs --mind '{"kind":"fighter","subs":[{"kind":"staged-rise"}]}'`, beside
`#lying`'s table. The bar, set and not swept, written in `rising.md#staged` with the table:

- each human, club and empty: risen within the watch in at least three falls of four of the
  sixteen shoves;
- no way of lying under half, either human;
- the bout falls: at least half risen;
- the skeleton: reported, not held to the bar;
- nothing flung: `peak` no worse than `#driven`'s (the game before plan 02).

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
  battery's club row shows what that costs.

## Documents

- `docs/reference/rising.md`: `## Stages` (the table as it lands, each number's reading, the two
  pose drives' rows, every revision's battery table); `## Staged` (the battery's table, the bar,
  the harness line; each side's balance, 0 %).
- `docs/architecture.md`: the Minds section's sub-minds gain the riser; the Motor control section
  says a limb may hang from a stem and a patch may be a point; the lab's Character section.
- `docs/roadmap.md`: "Rising after a fall" reads as built, for the lab, with what plan 05 waits
  on; the searched and the learned riser are the open items.
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
