# Rising 03: the bearing solve, split from the standing plan

## Goal

The stance's whole-body solve becomes a module of its own that knows no foot: a body bears on the
ground through limbs, each a chain of freedoms with a task at a point of its last segment. The
stance keeps what is a stance's (where the centre of mass goes, when to step, the heel's roll, the
knee's bend) and is the solve's first user.

No number changes. The arena's trace digest (`research/bout-trace.mjs`) and every line of the
fingerprint (`scripts/fingerprint.mjs`) are the gate, to the bit. A point patch, and a limb that
hangs from somewhere other than the root, are not added here: plan 04 adds each with its reader.

## Files

| File | Change |
|---|---|
| `src/core/control/bearing.ts` | New: `Limb`, `LimbTask`, `LimbWork`, `Bearing`, `makeBearing`, `carryRoot`, `bearLimbs`. |
| `src/core/control/stance-dynamics.ts` | Deleted: its functions move to `bearing.ts`, but `leverOf` and the leg's own asks, which move to `stance.ts`. |
| `src/core/control/stance.ts` | `aimLimb` (new); `carry` and `bear` call the solve. |
| `src/core/control/stance-state.ts` | `FootTask` goes (`LimbTask`); `Stance.limbs`, `Stance.bearing`; the scratch the solve took. |
| `tests/core-bearing.test.mjs` | New: one test. |
| `tests/core-fork.test.mjs` | The field lists, if a state path moved. |
| `docs/architecture.md` | The Motor control row and section. |

## `src/core/control/bearing.ts`

```ts
/**
 * A task's row: weights on the six a point's motion has (its segment's spin's three, world, then
 * its velocity's three), in the order they are summed.
 */
export type Row = readonly (readonly [row: number, weight: number])[];

/** **A limb's task for a step**, as the plan above the solve asks it: plain data, kept in its caller's state. */
export interface LimbTask {
  /** Whether the solve drives the limb this step. */
  on: boolean;
  /** Whether it bears on the ground. */
  bearing: boolean;
  /** The point's asked acceleration, and the segment's spin's, world. */
  readonly linear: Vector3;
  readonly angular: Vector3;
  /** The limb's freedoms' accelerations, as the solve leaves them. */
  readonly accel: Float64Array;
}

/** **What a step's task is solved with**: written by the plan before the solve reads it, and no memory. */
export interface LimbWork {
  /** The point of the segment the task is asked at, world. */
  readonly at: Vector3;
  /** The rows of the six that are asked; null, all six as they are. */
  rows: readonly Row[] | null;
  /** For each of the limb's freedoms, an acceleration asked ahead of the task, or NaN: the others take the task (`fixedSolve`). */
  readonly ahead: number[];
  /** Where it bears, while it bears. */
  patch: BearingSole | null;
}

/** **A limb**: the chain of freedoms from the root to `segment`, and the task of a point of it. */
export interface Limb {
  readonly segment: BuiltSegment;
  /** The chain's freedoms as muscle channels, root outward. */
  readonly memory: { channels: number[] };
  /** The length a spin's miss is weighed at against a point's, m (`boundFree`). */
  readonly reach: number;
  readonly task: LimbTask;
  readonly work: LimbWork;
}

/**
 * **What the solve is handed**: the limbs, the assist, and where it leaves what it finds, each the
 * caller's own record: the root's acceleration, what the assist is asked, the freedoms held at a
 * torque, and what of the ground's wrench the patches cannot give.
 */
export interface Bearing {
  readonly assist: Assist | null;
  readonly limbs: readonly Limb[];
  readonly root: Float64Array;
  readonly helped: { readonly force: Vector3; readonly moment: Vector3 };
  readonly held: { channels: number[]; z0: number[]; Z: number[][] };
  readonly shortfall: { readonly force: Vector3; readonly moment: Vector3 };
  readonly scratch: BearingScratch;
}

export function makeBearing(assist: Assist | null, limbs: readonly Limb[],
  out: Pick<Bearing, "root" | "helped" | "held" | "shortfall">): Bearing

/**
 * The root's acceleration that gives the centre of mass `aim.centre` and the root's spin `aim.spin`,
 * as nearly as the bearing limbs' patches can give the wrench for it, with the driven limbs moving
 * as their tasks have them and the rest of the body as `work` asks: into `b.root`, and returned.
 * `lever` weighs a missed moment against a missed force (`shareGroundWrench`).
 */
export function carryRoot(b: Bearing, muscles: MuscleDriver, work: ServoWork,
  aim: { readonly spin: Vector3; readonly centre: Vector3 }, lever: number): Float64Array

/**
 * The driven limbs' torques, given to their muscles as torque sources, once the servo has solved
 * the rest of the body around the root: each limb's inverse dynamics, less, where it bears, its
 * patch's share of the ground's wrench. `bounded` keeps a free limb within its muscles' strength
 * (`boundFree`).
 */
export function bearLimbs(b: Bearing, muscles: MuscleDriver, work: ServoWork, lever: number, bounded: boolean): void
```

The module's own functions, each today's of `stance-dynamics.ts` with `Stance` and `FootState`
taken out of its arguments:

| Today | In `bearing.ts` | What changes |
|---|---|---|
| `legJacobian(foot, point, driver)` | `limbJacobian(limb, point, driver)` | reads `limb.memory.channels` |
| `solveLeg(s, foot, task, muscles, p0)` | `solveLimb(limb, muscles, p0)` | the point is `work.at`; the knee's and the ankle's asks are `work.ahead`; the rolled foot's rows are `work.rows`; the damping stays `LEG_DAMPING` |
| `Leg` | `Solved` (`limb`, `y0`, `Y`), not exported | |
| `rootRows`, `groundWrench` | the same | |
| `heldFreedoms(s, legs, ...)` | `heldFreedoms(b, solved, ...)` | writes `b.held` |
| `rootAim(s, R, P, w0)` | `rootAim(b, aim, R, P, w0)` | reads `aim`, writes `b.root` |
| `limitToSoles(s, legs, P, w0, p0)` | `limitToPatches(b, solved, P, w0, p0, lever)` | each patch is `work.patch`; writes `b.shortfall`, `b.helped` |
| `boundSwing(s, foot, task, ...)` | `boundFree(b, limb, ...)` | the point is `work.at`, the weight `limb.reach` |
| `legTorques(s, muscles, accel, bearing)` | `limbTorques(b, muscles, accel, bearing)` | the point a share is carried from is `work.at` |
| the bodies of `stanceControl`'s `carry` and `bear` | `carryRoot`, `bearLimbs` | |

Arithmetic that must stay as it is, to the bit:

- With `work.rows` null, `solveLimb` hands `fixedSolve` the Jacobian, the task and `B` themselves,
  as `solveLeg` does a flat foot's. With rows, each is the sum of its `[row, weight]` pairs in the
  order written; a row kept whole is `[[r, 1]]`, and a product by 1 is the number itself.
- `work.at` holds the point `pointOf` computed; `limbTorques` and `boundFree` read it where they
  read `foot.edge`, `foot.middle` or `soleMiddleToRef` today. Nothing moves a node between `carry`
  and `bear`, so the swinging foot's point read once is the point read twice.
- `work.patch` is built once a step, before `carryRoot`, and read again by `bearLimbs`: the sole it
  is built from is as last read in both.
- `carryRoot` writes each driven limb's `task.accel[k]` for every freedom of its chain, where
  `carry` writes six: a leg's chain is six. `LimbTask.accel` is as long as the chain.
- The order of the sums in `rootRows`, `heldFreedoms`, the servo's freedoms added to `w0`, and
  `limbTorques` is the order of `b.limbs`, which is the feet's.

## `src/core/control/stance.ts`

```ts
/**
 * A driven leg's part of the solve, for this step (`LimbWork`): the point its task is asked at;
 * where it bears, its patch; and the leg's own asks ahead of the task. A knee past straight is
 * asked back toward the bend; a rolled foot's turn about its front edge is left free and its ankle
 * held short of its stop, or, in a walk's pre-swing, its knee bent.
 */
function aimLimb(s: Stance, foot: FootState, limb: Limb, muscles: MuscleDriver): void
```

It is `pointOf` and the part of `solveLeg` from `const fixed = ...` to the end of the rolled
branch, writing `work.at`, `work.ahead`, `work.rows` and, for a bearing foot,
`work.patch = bearingSole(foot, 1 - soleMargin)`. The rolled rows, with `w` the level normal to the
front edge, are

```ts
[[[0, w.x], [1, w.y], [2, w.z]], [[1, 1]], [[3, 1]], [[4, 1]], [[5, 1]]]
```

`leverOf` moves here unchanged. `stanceControl`:

```ts
carry(muscles, work) {
  const { aim } = s.state;
  if (!aim.on) return null;
  s.feet.forEach((foot, f) => { if (s.limbs[f]!.task.on) aimLimb(s, foot, s.limbs[f]!, muscles); });
  return carryRoot(s.bearing, muscles, work, aim, leverOf(s, muscles.dynamics.root.centre[1]));
},
bear(muscles, work) {
  if (!s.state.aim.on) return;
  bearLimbs(s.bearing, muscles, work, leverOf(s, muscles.dynamics.root.centre[1]), s.tuning.boundedSwing);
},
```

## `src/core/control/stance-state.ts`

- `FootTask` goes; `StanceState.tasks` is `readonly LimbTask[]`, the same five fields.
- `Stance` gains `limbs: readonly Limb[]` (a foot's, in the feet's order: its segment, its
  `memory`, its `reach`, its task from `state.tasks`, and a `LimbWork` of its own) and
  `bearing: Bearing`, made of the state's own records:
  `makeBearing(assist, limbs, { root: state.aim.root, helped: state.helped, held: state.held, shortfall: state.reading.shortfall })`.
  The state's shape does not change.
- `StanceScratch` loses `shares`, `missed` and `idScratch`, which the solve keeps (`BearingScratch`,
  its shares one a limb).

## Tests

`tests/core-bearing.test.mjs` (Node stand, Rapier, 120 Hz): **`a body bears on its soles through
the solve alone`**. The Warrior on the ground under a mind written in the test through `embody`,
which knows no stance: two limbs made from `footStatesOf`, each bearing on its sole (the point its
middle, the patch `bearingSole`), its task its sole's motion damped; the aim the centre of mass
held where it began and the pelvis's spin damped, both critically damped at 0.1 s; `servoAsk`,
`carryRoot`, `servoSolve`, `bearLimbs`, as `motorControl` orders them. Three seconds on, the centre
of mass is within 1 cm of where it began and the shortfall is under a hundredth of the weight; a
pull of a tenth of the weight for a second moves it less than 3 cm and it comes back.

Every stance test (`core-stance`, `core-stance-envelope`, `core-contact-wrench`, `core-skills`,
`core-strike-skill`, `core-fork`, `arena-fork`) passes as it is.

## Mutations, each must go red

- `solveLimb` ignores `work.ahead`: `core-stance`'s "asked higher than the legs reach with their
  knees bent, each human stands at that reach".
- `solveLimb` ignores `work.rows`: `core-stance`'s "a height beyond the ankles' range is not
  reached: each human sinks to their reach less the spare and stands".
- `limbTorques` does not take the patch's share from the limb's torques: the new test, and
  `core-stance`'s "stands without drifting".
- `limitToPatches` writes no shortfall: `the_stance_asks_the_assist_for_what_the_soles_miss_and_no_more`
  (`core-assist`).
- `aimLimb` builds no patch for a bearing foot: the stand tests; and the new test's control, the
  same body with both limbs' `bearing` false, goes down within a second.
- `bearLimbs` ignores `bounded`: no test names the bounded swing, so the trace digest is its
  guard; run `node research/bout-trace.mjs` under the mutation and see the digest change. If it
  does not, the bout does not reach a swing past strength, and the plan adds the test that does
  (the routine battery's shoved walk, `research/core-routine-battery.mjs`, one seed) before the
  move.

## Documents

`docs/architecture.md`: the Motor control layer names `bearing.ts` (limbs bearing on patches, the
root's acceleration, the limbs' torques) beside `stance.ts` (the standing plan); the section on the
stance says which module owns which.

## Verification

```powershell
node scripts/fingerprint.mjs > before.txt
node research/bout-trace.mjs                                    # note the digest
node research/bout-trace.mjs crypt-skeleton crypt-skeleton 60   # and this one
npm test
npm run check
npm run build
node scripts/fingerprint.mjs > after.txt                        # no line differs
node research/bout-trace.mjs                                    # the same digests
node research/bout-trace.mjs crypt-skeleton crypt-skeleton 60
node research/body-cost.mjs                                     # a standing body's step, before and after
```

The digests and the fingerprint unchanged is the gate: the solve moved and no number did. Land it
in two commits if that is easier to hold to the bit: the functions moved with their arguments
changed, then the stance's own asks lifted into `aimLimb`.
