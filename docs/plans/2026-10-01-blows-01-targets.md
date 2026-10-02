# Blows 01: targets that are bodies

## Goal

The lab's targets are bodies struck under the rule. The Routine strikes at ten of them, drawn by
seed, high, middle and low; a battery runs the same targets for every body and thing held and
prints the table every later plan is measured against. Nothing in a fight changes.

Today's skill reads a target's place across the ground and not its height, so the baseline is
expected to hit the control and the targets near it and miss the rest. That table is what this
plan is for.

## Files

| File | Change |
|---|---|
| `src/rng.ts` | `mulberry32`, moved from `src/dungeon/rng.ts`. |
| `src/dungeon/crypt-dungeon.ts`, `decals.ts`, `dressing.ts`, `level.ts`, `tests/fixtures/classic-dungeon.mjs`, `research/rollouts.mjs`, `tests/rng.test.mjs` | Import it from `src/rng.ts`. |
| `src/core/engine/engine.ts`, `rapier.ts` | `SegmentBody.gapTo`. |
| `src/lab/targets.ts` | New: `TARGET_BOX`, `drawTargets`, `dummySpec`, `hangDummy`, `readTarget`. |
| `src/lab/routine.ts` | The tactics attack targets in turn; `startRoutine` takes them; `TargetReading`s in place of `StrikeReading`s. |
| `src/lab/routine-scenario.ts` | Draws the dummy that is up; the table is of targets. |
| `src/lab/scenarios.ts` | `targets` and `seed` in `KEYS`, `LabAddress`, `labAddress`, `labHref`. |
| `research/core-targets.mjs` | New: the battery. |
| `scripts/fingerprint.mjs` | `labRoutine` runs four targets of seed 1 and tells what it read. |
| `tests/lab-targets.test.mjs` | New. |
| `tests/core-engine.test.mjs`, `lab-routine.test.mjs`, `rng.test.mjs` | See Tests. |
| `docs/reference/blows.md` | New record. |
| `docs/reference/lab.md`, `docs/architecture.md`, `README.md` | See Documents. |

## The gap to a body (`engine.ts`, `rapier.ts`)

```ts
  /**
   * How far `point` (world, m) is from the nearest of the body's shapes' surfaces, m: 0 inside
   * one. Where the body is now.
   */
  gapTo(point: Vec3): number;
```

Rapier: for each collider of the body, `collider.projectPoint(point, true)`; the least distance
from `point` to the projection, 0 where `isInside`. Arithmetic by `hypot` of
`src/core/math/real.ts`.

Its readers are the lab's targets and the battery: how near a miss passed, for a fist, a club or
anything else a hand's body is made of, with no geometry of the lab's own.

## Targets (`src/lab/targets.ts`)

```ts
/**
 * **Where the lab's targets are drawn**, in the attacker's statures: across and along the
 * heading about a place, and up from the ground by stratum. A target's stratum is its turn's:
 * high, middle, low, in that order. Set: `docs/reference/lab.md#targets`.
 */
export const TARGET_BOX = {
  across: [-0.2, 0.2], along: [-0.1, 0.1],
  up: { high: [0.75, 1], middle: [0.5, 0.75], low: [0.15, 0.5] },
} as const;

export type Stratum = "control" | keyof typeof TARGET_BOX.up;

/** A target: where it hangs (world, m), and which stratum it was drawn in. */
export interface Target {
  readonly at: Vec3;
  readonly stratum: Stratum;
}

/**
 * `count` targets about `place` (world, on the ground) for a body of `stature` facing `heading`:
 * the first is the control, at `place` and `head` high, where today's recipes land; each one
 * after is drawn in the box from `seed`'s stream (`mulberry32`), three draws a target.
 */
export function drawTargets(seed: number, count: number, frame: { place: Vec3; heading: number; stature: number; head: number }): Target[];
```

```ts
/**
 * **A target's body**: one ball, the attacker's head's mass and its head capsule's radius, named
 * `head`, with the attacker's hit points in it and never coming off. Every number is the
 * attacker's own, by a rule that names it.
 */
export function dummySpec(attacker: BodySpec): BodySpec;

/**
 * Hang a dummy at `at` in `world`: held fixed where it is until `free()`, then held up by a
 * force equal to its weight through each step and nothing else, so it gives way to a blow as a
 * head on no neck does. `fighter` is what a blow watch takes (`Fighter`), on a side of its own.
 */
export function hangDummy(world: World, spec: BodySpec, at: Vec3, rules: Rulebook): {
  readonly fighter: Fighter;
  free(): void;
  dispose(): void;
};
```

- The spec's family is `dummy`; its quantities are `derive`d from the attacker's
  (`"the attacker's head's mass"`, `"the attacker's head capsule's radius"`), its inertia a solid
  ball's 2/5 m r² by a named rule, so `specProvenanceFaults` holds it.
- `free()` calls `setFixed(false)` and adds a `beforeStep` hook that gives
  `applyForce(-gravity * mass, centre)`. Fixed before the blow, it stays put if a knee bumps it on
  the approach; freed for the blow, it does not stop a fist as a wall does (the design's probe).

```ts
/** What one target read. */
export interface TargetReading {
  readonly target: Target;
  readonly hand: Hand;
  /** The strike thrown at it, by name. */
  readonly strike: string;
  /** Seconds from the attack being asked to the end of the watch. */
  readonly seconds: number;
  /** The nearest any shape of the hand's body came to the dummy's surface over the watch, m: 0 for a touch. */
  readonly nearest: number;
  /** The first blow on the dummy after its strike began, or null. */
  readonly blow: LandedBlow | null;
  /** Blows on the dummy before its strike began: the body bumped it on its way. */
  readonly bumped: number;
  /** Whether the body was down at any time from the strike's beginning to the watch's end. */
  readonly fell: boolean;
}

/** Seconds a target is watched after its strike's pushes end. */
export const TARGET_WATCH = 0.5;

/**
 * Read one target on `actor`'s body: hang its dummy, watch the blows between the two under
 * `rules` with a fresh pool for the attacker, and close the reading `TARGET_WATCH` after the
 * strike's pushes end. `step(sight)` is called from the actor's watch each control step, and
 * returns the reading once, when it closes.
 */
export function readTarget(actor: Actor, target: Target, hand: Hand, rules: Rulebook): {
  step(sight: Sight): TargetReading | null;
  dispose(): void;
};
```

- The dummy is freed when `report.strike.phase` first reads `chamber` or `swing` for `hand`.
- `nearest` is the least of `gapTo(dummy's centre) - radius` over the watch, floored at 0, on
  the `hand`'s segment body, which is the hand and what it holds.
- One dummy is in the world at a time. The watch and the dummy are disposed as the reading
  closes.

## The Routine (`routine.ts`)

- `routineTactics(track, envelope, targets, hands)`: at the post it attacks `targets[k].at` with
  the hands in turn (`ROUTINE_HANDS`' order repeated, a hand with no blow skipped), and goes on
  to the next when the instrument closes target `k`'s reading. `RoutineTactics.post` becomes
  `target`, the one up; its `leg` and `loops` stay.
- `startRoutine(actor, { targets = 10, seed = 1 })` draws them once the tactics have seen the
  head's height, about the place `POST_BEYOND` beyond the walk out, and makes a `readTarget` for
  each as its turn comes. `Routine.strikes` becomes `readings: readonly TargetReading[]`; the
  fist's speed and the hands' closure stay.
- Each loop strikes the same targets again.

The page: `&targets=` (0 to 30, default 10) and `&seed=` (default 1) in the lab's address. The
dummy that is up is drawn as a ball at its body's node (a cosmetic following a body: it decides
nothing). The table's rows are targets: stratum, the strike, hit points done or the miss in
centimetres, fell.

## The battery (`research/core-targets.mjs`)

```
node research/core-targets.mjs [--models workshop-fighter,workshop-rogue,crypt-skeleton] [--held empty,club]
  [--targets 10] [--seeds 1,2,3] [--hz 120] [--workers 14] [--list]
```

One worker a run (worker threads, one sequential loop in each; this module is the worker and
imports no other). A run is one body, one thing in each hand, one seed, and one loop of
`startRoutine`, the walk out included: the page's own path. It prints,
per model, thing held and stratum: targets, hits, the mean and least damage of the hits (HP), the
mean `nearest` of the misses (cm), falls, bumps. `--list` prints each reading.

Its first table, on this plan's code, goes to `docs/reference/blows.md#baseline` with its harness
(Node core stand, Rapier, 120 Hz, no assist).

## Tests

`tests/lab-targets.test.mjs` (Node core stand, Rapier, 120 Hz):

1. **`targets_are_the_seeds_and_lie_in_their_strata`**: for the Warrior's frame, seed 1 and 10
   targets: the list whole, pinned by value; the first is the control at `place` and `head`;
   each one after lies in the box and in its turn's band; seed 2's list differs; the same seed's
   is the same.
2. **`a_dummy_hangs_still_and_gives_way_to_a_blow`**: hung and freed, 10 s on, its centre is
   within 1 mm; a ball of 1 kg sent into it at 6 m/s lands one blow whose energy is
   `impactEnergy` of the two masses and the closing speed, and the dummy moves off with it. Held
   fixed and struck the same way, it does not move: the control.
3. **`a_target_where_the_recipe_lands_is_struck_and_one_out_of_its_height_is_missed_by_that_much`**:
   the Warrior with the club, the control target: `blow` is not null, its damage over 0, `nearest`
   0, `fell` false, the reading's record whole. The same with the target 0.5 m lower: `blow` null,
   `nearest` over 0.2 m.
4. **`a_reading_is_one_targets_own`**: two targets in turn, the first struck, the second out of
   reach: the second's `blow` is null.

`tests/core-engine.test.mjs`, **`a body's gap to a point is to its nearest shape, and none
inside`**: a ball of 0.1 m, a point 0.3 m from its centre reads 0.2; a point inside reads 0; a
body of two balls reads the nearer; moved, the body reads from where it is.

`tests/lab-routine.test.mjs`: the routine with four targets of seed 1 reads four, in order, with
the hands in turn, and walks back; its left's strike is still the mirrored one.

`tests/rng.test.mjs`: the generator at its new path.

## Mutations, each must go red

- `drawTargets` draws from `Math.random`, or ignores `seed`: test 1.
- A stratum's band read as the next one's: test 1.
- `hangDummy` never frees (fixed through the blow): test 2's moving off.
- The dummy's force is half its weight: test 2's stillness.
- `gapTo` with `solid` false: the engine test's inside reading.
- `nearest` read at the knuckles, not the body's shapes: test 3 with the club, whose swell
  passes nearer than the fist.
- One watch kept across targets: test 4.

## Documents

- `docs/reference/blows.md`: new. `## Targets` (what a dummy is, how it is held, the design's
  probe table with its harness); `## Baseline` (the battery's table).
- `docs/reference/lab.md#targets`: `TARGET_BOX`'s numbers and why (the reach of an arm either
  side, a step along, the three bands), `TARGET_WATCH`.
- `docs/architecture.md`, the screens' lab: the Routine strikes at target bodies read by the
  rule; `SegmentBody.gapTo` in the engine seam.
- `README.md`: the lab's Routine line, and `&targets=`, `&seed=`.

## Verification

```powershell
node scripts/fingerprint.mjs > before.txt
npm test
npm run check
npm run build
node scripts/fingerprint.mjs > after.txt
node research/core-targets.mjs
```

The fingerprint's lab routine lines change, and no other: the commit carries them before and
after.

**Eye gate.** The owner opens `?play=lab&scenario=routine` with each body, empty-handed and with
the club, and watches it strike at ten targets; then with `&seed=2`.
