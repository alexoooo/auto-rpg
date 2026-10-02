# Blows 05: placement

## Goal

A hand goal takes named points of the hand's rigid body to places: its knuckles, a club's swell,
both ends of what it holds, with the wrist freed when two are asked. A recipe says how high it
lands as well as how far. A target no recipe's window holds is struck by a placed blow: the
point the hand strikes with, carried through the target by feedback. On the targets' battery the
high and middle strata turn from missed to struck.

A placed blow is accurate and not strong; plan 07's searches are the strong ones. It needs plan
01's battery to be read by.

## Files

| File | Change |
|---|---|
| `src/core/spec/body.ts` | `ItemSpec.aim?`. |
| `src/core/items/club.ts` | The `swell` point; `aim: "swell"`. |
| `src/core/build/rigid.ts` | `rigidPoints`. |
| `src/core/control/kinematics.ts` | `ReachTask`; `solveReach` over tasks. |
| `src/core/control/motor.ts` | `reach(hand, places, seconds)`; the wrist freed for two places. |
| `src/core/body.ts` | `Place`; `HandGoal.places`; `BodyView.root`. |
| `src/core/skills/strikes.ts` | `StrikeWindow.up`; `aimOf`. |
| `src/core/skills/strike.ts` | `PLACED`; the blow chosen by the window; `StrikeCommand.hands`; `StrikeReport.blow`. |
| `src/core/skills/skills.ts` | Writes `command.hands` from the strike's. |
| `research/core-strike-window.mjs`, `core-strike-repertoire.mjs` | The window's height; written to the asset. |
| `assets/core/strikes.json` | Each recipe's `window.up`. |
| `research/core-placed.mjs` | New: `PLACED`'s sweep on the targets. |
| `tests/core-reach.test.mjs`, `core-held.test.mjs`, `core-strike-skill.test.mjs`, `lab-targets.test.mjs`, `arena-fork.test.mjs` | See Tests. |
| `docs/reference/blows.md`, `human-and-strikes.md`, `docs/architecture.md`, `docs/roadmap.md` | See Documents. |

## Points of a rigid body (`rigid.ts`, `body.ts`, `club.ts`)

```ts
/**
 * Every named point `segment`'s rigid body carries, body frame, reference pose: the segment's
 * own, and those of each item it holds, placed by its holding (`heldPoint`). A name stated twice
 * is refused.
 */
export function rigidPoints(spec: BodySpec, segment: SegmentSpec): ReadonlyMap<string, Quantity<Vec3>>;
```

`ItemSpec` gains:

```ts
  /** The point of `points` a blow with the item is brought to its target by: where it strikes. */
  readonly aim?: string;
```

The club gains `swell`, the middle of its swell's axis, by a `derive` of `swellFrom` and
`swellTo` ("the middle of the swell's capsule's axis"), and `aim: "swell"`.

```ts
/** The point `hand` of `spec` strikes with: what it holds says (`ItemSpec.aim`), or the hand's knuckles. */
export function aimOf(spec: BodySpec, hand: Hand): string;
```

## The solve (`kinematics.ts`)

```ts
/** A point of the chain's last segment (its own frame, m) and where it goes (root's frame, m). */
export interface ReachTask {
  readonly point: Vec3;
  readonly target: Vec3;
}
```

`solveReach(chain, angles, free, tasks, passes)`: `tasks` in place of `point` and `target`.

- One task is today's solve, to the bit: three rows, the damped step, the posture's pull
  projected off them.
- Two tasks are two points of one rigid body, which can ask five things, not six: the first
  point's place (three rows) and the second's error taken across the line between the two points
  as they lie (two rows, along two directions square to it, `orthogonalTo` and a cross product).
  The system is five by five (`solveLinear`, `src/core/math/linalg.ts`).
- Where the rows outnumber the free freedoms there is no null space, and the posture's pull is
  left out.
- It returns the greatest distance left over the tasks.

## The motor (`motor.ts`, `body.ts`)

```ts
/** A point of a hand's rigid body (`rigidPoints`), by name, and where it goes: body frame, m. */
export interface Place {
  readonly point: string;
  readonly position: Vec3;
}

interface HandGoal {
  /** One place, or two points of the hand's one rigid body: where it is, and how its line lies. */
  readonly places: readonly Place[];
  readonly seconds: number;
}
```

- `MotorControl.reach(hand, places, seconds)`. An arm keeps `points`, its hand's `rigidPoints` in
  the hand's frame. A point the hand has not, no place, more than two, or two places whose
  distance apart differs from their points' by over a centimetre, is refused with the reason.
- One place moves the shoulder and the elbow, the wrist held by the posture, as today. Two free
  the wrist's three freedoms too.
- Each place's point travels its own minimum-jerk path from where it is.
- `sameGoal` compares the places whole.
- `BodyView` gains the frame a goal is set in:

  ```ts
    /** The root segment's place and turn, world, as the last step left it: the frame a hand goal is set in. */
    readonly root: { readonly position: Vector3; readonly rotation: Quaternion };
  ```

  Its readers are the strike skill, and the guard's in plan 06. A world point is turned into it
  with `applyRotationQuaternionToRef` and the turn's conjugate.

## How high a recipe lands (`strikes.ts`, the window's script)

```ts
export interface StrikeWindow {
  readonly along: readonly [number, number];
  readonly across: readonly [number, number];
  /** Above the recipe's place: the target's height over the striker's head's, m. */
  readonly up: readonly [number, number];
}
```

`research/core-strike-window.mjs` sweeps the target's height as it sweeps the other two, by the
same rule (lands at nearly its full reading), and `core-strike-repertoire.mjs --write` writes it.
`mirroredWindow` carries `up` as it carries `along`.

## The placed blow (`strike.ts`)

```ts
/**
 * **A placed blow**: the point a hand strikes with (`aimOf`), carried by a hand goal from where
 * it is to `through` m beyond the target along that line, in `seconds`. The body stands for it
 * with the target `stretch` of the arm's straight length from the shoulder, the arm's length
 * being the spec's: the shoulder to the point, in the reference pose's segments laid straight.
 * It is what a hand throws at a target no recipe's window holds. Set on the targets' battery:
 * `docs/reference/blows.md#placed`.
 */
export const PLACED = { stretch: 0.8, seconds: 0.4, through: 0.15 } as const;
```

The numbers above are where the sweep starts, not its answer: `research/core-placed.mjs` runs the
targets' battery over `stretch` 0.7, 0.8, 0.9, `seconds` 0.25, 0.4, 0.6 and `through` 0.1, 0.15,
0.25 by an override passed to the skills (`SkillOptions.placed`), and the table with the values
taken goes to the record.

The skill:

- Once an attack is taken up, it chooses the blow, and keeps it to the strike's end:

  ```ts
  type Blow = { readonly kind: "recipe"; readonly chosen: Chosen } | { readonly kind: "placed"; readonly aim: string };
  ```

  A recipe, where the hand has one and the target's height over the head lies in its window's
  `up`; else placed. Every switch on it has a `never` default.
- Both stand the body the same way (`APPROACH`, the feet set, `STAND` s still, then the window
  asked): a recipe by its distance and window; a placed blow by the distance ahead of the head
  that puts the target `stretch` of the arm from the shoulder at the target's height, within
  `APPROACH.reach` of it. A target too high or too low for any standing place is stood for as
  near as the arm's length allows, and thrown at: the reading says how near it came.
- A placed blow has no chamber. Its `swing` is the hand goal: one place, the aim point, at the
  target carried `through` beyond, turned into the root's frame each step from the world target.
  It is thrown when `seconds` have passed, and counted in `thrown`.
- `StrikeCommand` gains `hands: Readonly<Record<Hand, HandGoal | null>>`; `createSkills` writes
  it to `command.hands`. `StrikeReport` gains `blow: Blow["kind"] | null`.
- Resumed, a placed blow is over, as a recipe's is, and the hand's goal is null.

## Tests

1. `core-reach`: the tests there pass with one task, their angles equal to what they are today
   (pinned by value before the change). **`two points of what a hand holds are put where they are
   asked`**: the club's `swellFrom` and `swellTo` to two places their own distance apart, both
   ways round a line across the body and one along it: each within 5 mm, the wrist's angles moved
   from the posture's. **`a hand goal on a held point is followed alike at 120 Hz and 1920 Hz`**.
   Two places a decimetre farther apart than their points are refused.
2. `core-held`, **`a rigid body's points are its segment's and its items', placed`**: a hand
   alone has `knuckles` and `little`; with the club, `swellFrom`, `swellTo` and `swell` too, each
   where `heldPoint` puts it; an item with a point named `knuckles` is refused.
3. `core-strike-skill`, **`a_target_in_a_recipes_window_is_thrown_at_with_it_and_one_out_of_its_height_is_placed`**:
   the report's `blow`, the phases in order, `thrown` counted once each. Every recipe's
   `window.up` in the asset holds 0. **`a_placed_blow_is_over_when_the_body_is_resumed`**.
4. `lab-targets`, **`a_middle_target_is_struck_by_a_placed_blow`**: the Warrior, bare-handed, a
   target at 0.6 of its stature: `blow` not null, where plan 01's test read a miss; the same with
   the club, the swell's the surface (`sides`' `item`). A target at 0.2 of its stature reads a
   miss still, `nearest` over 0: the control.
   **`a_placed_blow_lands_whichever_way_the_body_faces`**: the body turned a quarter.
5. `arena-fork`: a fork across a placed blow.

## Mutations, each must go red

- The wrist left held for two places: test 1.
- The second task's rows dropped: test 1 (the line lies wherever it lay).
- The skill never reads `up`: tests 3 and 4.
- The world target used as a body-frame place: test 4's quarter turn.
- The goal set at the target, not through it: test 4's closing speed, asserted over the speed a
  path that ends at the target arrives with.
- `aimOf` returns the knuckles for a hand with a club: test 4's `item`.
- `command.hands` not written: tests 3 and 4.

## Documents

- `docs/reference/blows.md`: `## Placed` (the sweep, the values taken, the harness); the targets'
  battery after, beside the baseline.
- `docs/reference/human-and-strikes.md`: the window's height, with its table.
- `docs/architecture.md`: Motor control (a hand goal's places, the wrist); Skills (the two blows,
  how one is chosen).
- `docs/roadmap.md`, Strikes: a target off a recipe's height is placed; what is left is the
  searched blows by band, and the low targets.

## Verification

```powershell
node scripts/fingerprint.mjs > before.txt
npm test
npm run check
npm run build
node scripts/fingerprint.mjs > after.txt
node research/core-strike-window.mjs
node research/core-placed.mjs
node research/core-targets.mjs
```

The lab routine's lines change. An arena or crypt line changes only where a fighter attacks a
head that is out of its recipe's height, which is a foe that is down: the commit says which.

**Eye gate.** The Routine, each body, bare-handed and with the club: the high and middle targets
are struck, and the owner says whether a placed blow looks like a blow.
