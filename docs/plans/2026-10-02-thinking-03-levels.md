# Thinking 03: a body's level, and one rule that sets it with a cap

## Goal

A body is at one level, `full`, `limp` or `held`, as data in its muscles' state: below `full`
its senses and mind are not run and its motors are released, and `held` it is fixed where it is.
One pure rule gives every body's level, with a cap on how many are at `full`. The crypt's `hold`,
`drop` and `rest` go: a body is never disposed and driven afresh to change what it costs.

It needs no other plan. The design is `2026-10-02-thinking-00-design.md`, rule 2, and the owner's
second answer: the game is designed inside what a step can carry, with only the near ones under
control.

## Files

| File | Change |
|---|---|
| `src/core/muscle/driver.ts` | `BodyLevel`; `MuscleDriver.level`, `.setLevel`; the hook does nothing below `full`; `driveMuscles(built, world, control, idle)`. |
| `src/core/mind/mind.ts` | `Mind.idle`; `embody` hands the driver the mind's. |
| `src/core/mind/sub-mind.ts` | `hosting` answers `idle`: who has the body may be nobody. |
| `src/core/body.ts` | `Body.level`, `.setLevel`; `Body.has` may read `"nobody"`. |
| `src/core/rules/levels.ts` | New: `LevelAsk`, `LevelRule`, `levelsOf`, `stirs`. |
| `src/dungeon/run.ts` | `LEVELS`; `levels()`; `hold`, `drop`, `rest`, `REST`, `standing`, `company` go; `DungeonRunOptions.levels`. |
| `src/dungeon/main.ts` | `&full=` in the address, for the eye gate. |
| `src/lab/mind-log.ts` | Logs `nobody` as it logs any other holder: no change unless it switches on a name. |
| `tests/core-levels.test.mjs` | New. |
| `tests/core-sub-mind.test.mjs`, `tests/crypt-core.test.mjs`, `tests/dungeon-hearing.test.mjs` | See Tests. |
| `research/body-cost.mjs`, `research/crypt-step.mjs` | Levels in place of dispose and fix; the most at `full`. |
| `docs/reference/play.md`, `docs/architecture.md`, `AGENTS.md`, `docs/roadmap.md` | See Documents. |

## The level (`src/core/muscle/driver.ts`)

```ts
/**
 * **How much of itself a body runs.** `full`: its joints are read, its mind steps and its motors
 * are driven. `limp`: none of the three, and its motors are released: the solver alone moves it.
 * `held`: limp, and every segment fixed where it is.
 */
export type BodyLevel = "full" | "limp" | "held";

/** What the engine is asked for a body at `level`: whether its segments are fixed. */
function fixedAt(level: BodyLevel): boolean {
  switch (level) {
    case "full": case "limp": return false;
    case "held": return true;
    default: return level satisfies never;
  }
}
```

On `MuscleDriver`:

```ts
  /** Its level (`BodyLevel`), `full` as made. */
  readonly level: BodyLevel;
  /**
   * Put the body at `level`. Leaving `full`, whatever has the body is told it is nobody's
   * (`idle`), the command and every motor are zeroed. The joints as last read stay as they were
   * read until it is at `full` again, where its first step reads them before its mind steps.
   */
  setLevel(level: BodyLevel): void;
```

- `state` gains `level: "full" as BodyLevel`: a save holds it, and the engine's own save holds
  which bodies are fixed, so a load puts both back (test 6).
- The step hook's first line is `if (state.level !== "full") return;`.
- `setLevel(next)`: nothing if `next === state.level`. Leaving `full`: `idle?.()`, then
  `activation`, `velocity` and `ceiling` filled with 0 and every motor `setMotor(index, 0, 0)`.
  Then, where `fixedAt(next) !== fixedAt(state.level)`, every segment `setFixed(fixedAt(next))`.
  Then `state.level = next`.
- `driveMuscles(built, world, control?, idle?)`: `idle` is called as the body leaves `full`,
  before its motors are zeroed.

`dispose` stays what it is: the end of the body's driving, at a bout's or a run's end.

## The mind is told (`src/core/mind/`)

`mind.ts`, on `Mind`:

```ts
  /**
   * Its body is nobody's from now (`BodyLevel` below `full`): it is not stepped until the body
   * is its own again, and then goes on from the body as it is. A mind with nothing under way
   * need not answer.
   */
  idle?(): void;
```

`embody` gives the driver `() => mind!.idle?.()`. The assist's `apply` is in the control the hook
no longer calls, so a body below `full` is given nothing and its meter counts no step.

`sub-mind.ts`: who has the body is the sub-mind's place, `HOST` (-1), or `NOBODY` (-2).

```ts
    get has() { return state.has === NOBODY ? "nobody" : state.has === HOST ? host.name : subs[state.has]!.name; },
    step(senses, dt) {
      host.look(senses);
      const want = subs.findIndex((sub) => sub.wants(senses));
      if (want !== state.has) {
        if (state.has >= 0) subs[state.has]!.end();
        else if (state.has === HOST) host.release();
        if (want >= 0) subs[want]!.begin();
        else host.resume();
        state.has = want;
      }
      ...
    },
    idle() {
      if (state.has >= 0) subs[state.has]!.end();
      else if (state.has === HOST) host.release();
      state.has = NOBODY;
    },
```

So leaving `full` is the hand-over a host makes to a sub-mind, to nobody; and the first step back
is the one a sub-mind's end makes: the host is resumed (`BodyView.resumed`, which its driver
reads), or the sub-mind that wants the body begins. `hosting`'s comment says so. Nothing in
`commandMind` changes.

`body.ts`: `Body.level` and `Body.setLevel` are the muscles'; `Body.has`'s comment names
`"nobody"`.

## The rule (`src/core/rules/levels.ts`)

```ts
/** What a fight says of one body, for its level. */
export interface LevelAsk {
  /** The level it is at. */
  readonly level: BodyLevel;
  readonly side: string;
  /** Where it is on the ground, m. */
  readonly at: { readonly x: number; readonly z: number };
  /** Out of the fight, for good. */
  readonly out: boolean;
  /** A person's: at `full` while it is in the fight, whatever the cap. */
  readonly pinned: boolean;
  /** It has nothing to do where it is: it may be held. */
  readonly waiting: boolean;
}

/** A fight's distances and its cap. */
export interface LevelRule {
  /** The most bodies at `full`. */
  readonly most: number;
  /** A body not at `full` asks to be let go with a foe nearer than this, m. */
  readonly wake: number;
  /** A waiting body at `full` asks to stay with a foe nearer than this, m: more than `wake`. */
  readonly rest: number;
  /** The same two for a body going somewhere, m: let go nearer than `company`, kept nearer than `clear`. */
  readonly company: number;
  readonly clear: number;
  /** How much nearer its foe a body not at `full` must be than a waiting one at `full` to take its place, m. */
  readonly swap: number;
}

/** Each body's level, in `bodies`' order. */
export function levelsOf(bodies: readonly LevelAsk[], rule: LevelRule): BodyLevel[]

/**
 * Whether a body at `at` on `side`, not at `full`, asks to be let go: a foe in the fight is
 * nearer than `rule.wake`, or a body going somewhere nearer than `rule.company`.
 */
export function stirs(at: LevelAsk["at"], side: string, bodies: readonly LevelAsk[], rule: LevelRule): boolean
```

A **foe** of a body is one of another side that is not out. A body **going somewhere** is one
that is not out, at `full`, and not waiting. Distances are on the ground, by `Math.sqrt`.

`levelsOf`, in this order:

1. A body that is out is `limp`. A pinned body in the fight is `full`.
2. Each of the rest **asks** for `full` or does not. At `full`, it asks unless it waits with no
   foe nearer than `rest` and nobody going somewhere (itself apart) nearer than `clear`. Not at
   `full`, it asks where `stirs`.
3. **A body at `full` that does not wait keeps its place**, whatever the count: the cap is kept
   by not waking more, never by holding a body in the middle of what it does.
4. **The places left** are `most` less the pinned in the fight and less step 3's. The others that
   ask are ranked by the distance to their nearest foe, one at `full` counted `swap` nearer, the
   earlier in `bodies` first among equals; they take the places left in that order.
5. A body that does not ask, or asks and has no place, is `held`.

Under the cap this is the crypt's rule as it stands (`REST`, `WAKE_METRES`). `swap` is the same
kind of gap as `rest` over `wake`: it keeps two bodies as near as each other from changing
places by turns.

## The crypt (`src/dungeon/run.ts`)

```ts
/**
 * The levels' rule (`levelsOf`; `docs/reference/play.md#levels`): `most` bodies at full; an enemy
 * is let go with a party member within `wake`, before it could see one, or a body going
 * somewhere within `company`, before that body could reach it; it is held, waiting, with the
 * party beyond `rest` and nobody going anywhere within `clear`.
 */
export const LEVELS: LevelRule = Object.freeze({ most: 8, wake: WAKE_METRES, rest: SIGHT_METRES + 4, company: 4, clear: 5, swap: 2 });
/** How near its home an enemy with nothing to do counts as waiting there, m. */
const HOME_METRES = 0.5;
```

- `DungeonRunOptions.levels?: LevelRule`, the run's `LEVELS` unless given.
- `asks()`: every built actor's `LevelAsk`: `out` is `!alive`, `pinned` is `side === "party"`,
  `waiting` is what `resting` reads today (an enemy in the fight with no target, unalerted, within
  `HOME_METRES` of its home).
- `levels()`: `levelsOf(asks, rule)`, and each body whose level differs is set
  (`body.setLevel`); one that goes out has its assist withdrawn first, as `drop` does.
- `plan()` begins `if (this.status === "playing") this.wake(); this.levels();` in place of its
  loop over `drop`, and its later `wake()` and `rest()` go. So a body built over the cap is held
  before its first step, and the dead go limp in whatever step the run ends.
- `wake()` builds an enemy where `stirs(enemy.home, "enemy", asks, rule)`.
- `build` calls `drive` once; `hold`, `drop`, `rest`, `REST`, `standing` and `company` go.
- `DungeonActor.limp` and `.held` are getters on the body's level; `feet()` reads the root where
  the level is not `full`; `fighter`'s comment loses "driven afresh".
- **A held enemy is not in the fight yet**: `choose` picks none, `targetAt` returns none, and a
  lock on one is dropped as a lock on one out of the fight is. A blow that meets one all the same
  is a blow (`watchBlows` is as it was).

`src/dungeon/main.ts`: `&full=<n>` in the address gives the run `{ ...LEVELS, most: n }`.

## Tests

`tests/core-levels.test.mjs`, on the stand (`coreStand`, a skeleton with the club under the
command layers and a driver that counts its calls and orders a stand):

1. **`a_limp_body_is_let_go_and_its_mind_is_not_stepped`**: after `setLevel("limp")` and 240
   steps: the driver was asked 0 times, every ceiling is 0, `body.has` is `"nobody"`, the assist's
   meter has not moved, and the body is down (the root under half its standing height).
2. **`a_held_body_stays_where_it_is_and_stands_when_let_go`**: held after 1 s; an impulse of
   400 N s at the root; 240 steps: every segment's position and rotation equal what they were, as
   one record. Let go: at its first step the driver sees `view.resumed`, `body.has` is
   `"command"`; 3 s on it is not down and its root is within 0.3 m of where it was held. The same
   with it held for one step and for 600.
3. **`every_change_of_level_leaves_the_engine_and_the_motors_as_the_level_says`**: all six ordered
   pairs of levels: after the change a shove moves the root or does not, by `fixedAt`; the
   ceilings are 0 below `full`.
4. **`a_level_set_twice_is_set_once`**: a mind that counts `idle`: once for `full` to `limp` to
   `held` to `held`.
5. **`a_body_idled_under_a_sub_mind_ends_it_and_the_one_that_wants_it_begins`**
   (`tests/core-sub-mind.test.mjs`, its recording host and sub-mind): idled while the sub-mind
   has the body: one `end`, no `release`; back at `full` with the sub-mind still wanting: one
   `begin`, no `resume`; with it not wanting: one `resume`. Idled while the host has it: one
   `release`, then one `resume`.
6. **`a_level_is_saved_and_loaded`** (`tests/harness/fork.mjs`): two bodies, one held; saved;
   the held one let go and both shoved for 1 s; loaded: the one is `held` and a shove does not
   move it; let go at the same step in the original and in the load, the two traces
   (`tests/harness/trace.mjs`) are equal over 3 s.
7. **`a_mind_that_does_not_answer_idle_is_put_at_any_level`**: `embody` with a mind of `step`
   alone.

The rule, in the same file, each a table of `LevelAsk`s and the levels expected, whole:

8. **`a_body_out_is_limp_and_a_person_s_is_full`**, with the cap at 0.
9. **`a_waiting_body_is_held_and_let_go_on_both_sides_of_each_distance`**: a foe just inside and
   just outside `wake` and `rest`, a body going somewhere just inside and outside `company` and
   `clear`, from `full` and from `held`: eight rows; and two waiting bodies side by side with
   nobody near are both held.
10. **`the_cap_is_kept_by_not_waking`**: `most` 3, one pinned: of four held bodies with a foe
    inside `wake`, the two nearest are `full`; with two bodies at `full` and not waiting, none
    of the four; with three, the cap is over and none of the three is held.
11. **`a_place_goes_to_the_nearer_only_by_more_than_the_swap`**: a waiting body at `full` 10 m
    from its foe and a held one at 8.5 m and at 7.5 m, `swap` 2.
12. **`equals_keep_their_order`**: two held bodies as far as each other, one place.

`tests/crypt-core.test.mjs`: the three tests of an enemy at rest stand with `LEVELS` for `REST`
(`tests/dungeon-hearing.test.mjs` reads `WAKE_METRES` as before), and:

13. **`an_enemy_held_and_let_go_is_the_body_and_the_mind_it_was`**: `enemy.fighter.body` and
    `.minded` are the same objects before and after, and it fights (a blow lands within 30 s).
14. **`no_more_than_the_cap_are_at_full_and_a_freed_place_is_taken`**: a hall with the hero, one
    companion and four enemies inside `wake`, `levels: { ...LEVELS, most: 4 }`: at every step of
    20 s no more than four are at `full`; the two enemies nearest the party are the two; one of
    them put out of the fight as the existing fight test ends one, the next step it is `limp` and
    the nearer held one is `full`.
15. **`the_cap_holds_on_generated_levels`**: seeds 1 to 4, the hero exploring with three
    companions, 60 s, `most: 6`: never more than six at `full`; and with the run's own `LEVELS`
    at `most: Infinity` more than six are at `full` at some step of some seed, or the test says
    its fixture cannot show the cap.
16. **`a_held_enemy_is_neither_picked_nor_locked`**: with the cap full and a held enemy the
    nearest to a party member: its target is another or none, and `targetAt` on its mesh is null.

## Mutations, each must go red

- The hook runs below `full`: test 1.
- `setLevel` without `setFixed`, or fixed at `limp`: tests 2 and 3.
- No `idle` on leaving `full`, or `idle` on every call: tests 4 and 5.
- `hosting.step` releasing the host from `NOBODY`: test 5.
- `level` out of the driver's state: test 6.
- `rest` read where `wake` is, or `clear` where `company` is: test 9.
- A body at `full` and not waiting held to keep the cap: test 10's last row.
- The pinned not counted against `most`: tests 10 and 14.
- `swap` of 0: test 11's first row.
- `levels()` before `wake()`'s builds are counted: test 14 (a body over the cap steps at `full`).

## Documents

- `docs/reference/play.md`: `## Sight` loses `REST` and keeps `WAKE_METRES`; a new `## Levels`
  has the rule in words, `LEVELS` with where each number is from (`wake`, `rest`, `company`,
  `clear`: the distances the crypt had, set and not measured; `swap`: set; `most`: the owner's
  choice of a game inside what a step carries, 8 by
  `step-cost.md#bodies-in-a-step`), and that a held enemy is not in the fight. `## Bodies in the
  step`: the harness names `Body.setLevel`, and the table is read again by
  `node research/body-cost.mjs`: "let go, driven" is now the same body and mind resumed.
- The run's tables by `node research/crypt-step.mjs --seeds 1,2,3,4 --seconds 180 --companions 3`,
  with the most at `full` in a column, beside the ones there.
- `docs/architecture.md`: the body's level in the muscles' part; `Mind.idle` with the sub-minds;
  the rule under the rules; the crypt's part loses `hold`, `drop`, `rest`.
- `AGENTS.md`, the core: "**How much of itself a body runs is its level** (`BodyLevel`,
  `src/core/muscle/driver.ts`): data on the body, set by one rule (`levelsOf`,
  `src/core/rules/levels.ts`) from what its fight says of every body, with the fight's cap. A
  body is not disposed and driven afresh to save a step; a mind is told (`Mind.idle`) and goes on
  from the body as it is." The page's address list gains `&full=`.
- `docs/roadmap.md`: the crypt's step item says the cap and the levels are in; the dead stay an
  open choice, with what each answer costs.

## Verification

```powershell
node scripts/fingerprint.mjs > before.txt
npm test
npm run check
npm run build
node scripts/fingerprint.mjs > after.txt
node research/bout-trace.mjs
node research/body-cost.mjs
node research/crypt-step.mjs --seeds 1,2,3,4 --seconds 180 --companions 3
```

Every line of the fingerprint is as it was: the arena's bodies are always at `full`, and in the
crypt's two fights nobody is held and a body out was already let go. A crypt line that moves is
read before it is accepted: which body changed level, and at which step.

**Eye gate.** The crypt on the page with three companions and `&full=6`, in a room with more
enemies than two: who waits and where they stand, that a waiting one takes its turn when one in
the fight goes out, and what it looks like to walk up to one that waits. Then the same at the
default.
