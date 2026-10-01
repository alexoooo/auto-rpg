# Rising 05: a fall no longer takes a body out

## Goal

Every body rises (`FIGHTER` names the staged riser), and the fights' rules stop treating a fall as
the end: a body is out when its pool ends, and, if the owner so chooses, when it is counted out.
What a fighter does about a foe that is down is the owner's other choice.

It needs plan 04's bar met, and the owner's two choices (design file, The owner's choices). The
plan is written for each answer; the branch not chosen is cut from this file when the answer is
given. The standing bout tables are void once this lands and are measured again in it.

## Files

| File | Change | When |
|---|---|---|
| `src/core/mind/config.ts` | `FIGHTER.subs` is `[{ kind: "staged-rise" }]`. | always |
| `src/arena/duel.ts` | `Duelist.fighting` in place of `standing`; `DuelEnding`; the class comment. | always |
| `src/dungeon/run.ts` | `alive`; `drop`'s comment; the class comment. | always |
| `src/dungeon/main.ts` | A party member that is down says so. | always |
| `src/lab/scenarios.ts` | `down` is `"rise"` unless given. | always |
| `src/core/rules/rulebook.ts`, `src/core/sources.ts` | `Rulebook.count`, `owner-count`. | Counted |
| `src/core/rules/count.ts` | New: `countedOut`, `CountState`. | Counted |
| `src/arena/main.ts` | The verdict's words. | always |
| `src/core/mind/senses.ts` | `BodySense.down`, `Sensed.down`. | Spared |
| `src/core/mind/fighter.ts` | `seekFoe` holds off a foe that is down. | Spared |
| `research/core-rise-trials.mjs`, `core-rise.mjs` | `boutFall` with the other side left to itself. | always |
| `tests/arena-core.test.mjs`, `arena-fork.test.mjs`, `crypt-core.test.mjs`, `core-rules.test.mjs`, `core-senses.test.mjs`, `core-mind.test.mjs` | See Tests. | |
| `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/reference/rising.md`, `play.md`, `bouts.md` | See Documents. | always |

## Always

### `FIGHTER`

```ts
export const FIGHTER: FighterMindConfig = deepFreeze({ kind: "fighter", subs: [{ kind: "staged-rise" }] });
```

`LAB_DOWN_IDS` becomes `["rise", "lie"]`: its first is what an address without the key reads as,
so a lab body is the game's body unless the page says otherwise.

### The arena (`duel.ts`)

- `Duelist.standing` becomes

  ```ts
    /** Whether it is still in the fight: its pool not ended, and not counted out. */
    readonly fighting: boolean;
  ```

  `get fighting() { return pool.ending() === null; }` under *Not counted*; under *Counted* see
  below. `decide` and the senses' `out` read it.
- The class comment's "A side is out" says what takes a side out now, and that a body that is
  down rises of itself (`FIGHTER`).
- `judge`'s `assist.withdraw()` at the verdict stays.

### The crypt (`run.ts`)

- `get alive() { return this.fighter === null || this.fighter.pool.ending() === null; }`, with the
  count under *Counted*. `drop` is then only for a body out of the fight; a body that is down keeps
  its mind, which is rising.
- `feet()` and the planner read `body.view`, which is fresh whoever has the body (`HostMind.look`):
  no change. An actor's plan is not carried out while a sub-mind has its body, and is taken up
  from the body as it is when it is handed back (`view.resumed`).
- `hold(false)` makes a mind afresh; if the body was held while down, that mind's riser takes it
  at its first step.
- `src/dungeon/main.ts`: a party member's button reads "· down" while
  `member.fighter?.body.view.down`, between its order's label and "· fallen".

### The battery under attack

`boutFall({ recipe, mind, foe })`: `foe` is `"stands"` (plan 01's, the other side ordered to
stand) or `"fights"` (left to itself). The row gains `struck`: the blows the fallen side took
while down, and `pool`: its bar at the watch's end. `research/core-rise.mjs --foe fights` prints
the nine matchups' table. This is the measurement *Struck* is judged on, and the eye gate's
numbers; it is run under each answer.

A strike at a body on the ground aims at a head 0.1 m up, which nothing has tested. The table has
a column for the attacker: whether it was still on its feet at the watch's end. If attackers fell
themselves swinging low, that is a fault of the strike near the ground: it is found and fixed in a
change of its own before the rules land, with this table before and after.

## Choice 2: counted, or not

### *Counted*

`src/core/rules/rulebook.ts`:

```ts
  /** How long a body may stay down before it is out of its fight, s. */
  readonly count: Quantity<number>;
```

`count: sourced(10, "s", "owner-count", "ten seconds down, running")`, and `SOURCES["owner-count"]`:
the owner's decision, with the day it was given and the question as it was put.

`src/core/rules/count.ts`:

```ts
/** **A count over a body that is down**: the fight's step at which it went down, or null while it is up. Plain data, a body's own. */
export interface CountState { since: number | null }

/** Take this step's reading of `down` into `state`, and say whether the body is counted out: down for `seconds` running, at `dt` a step. */
export function countedOut(state: CountState, down: boolean, step: number, seconds: number, dt: number): boolean
```

A body that gets its centre of mass over the bar (`BodyView.down` false) has beaten the count,
and a later fall starts a new one.

- `duel.ts`: `DuelState.count: Record<Side, CountState>` and `counted: Record<Side, boolean>`,
  plain data; `judge` takes each side's reading before it decides; `fighting` is
  `pool.ending() === null && !state.counted[side]`. `DuelEnding` is
  `Exclude<Ending, "time"> | "counted" | "time"`; `ending(side)` returns `"counted"` where it
  returns `"fallen"`. `src/arena/main.ts`: `counted: "by the count"` in place of `fallen`.
- `run.ts`: each actor carries a `CountState`; the run's step takes the reading; `alive` is the
  pool's and `!counted`. A body counted out is dropped as one whose pool has ended.

### *Not counted*

- `DuelEnding` is `Exclude<Ending, "time"> | "time"`; `Duel.ending` returns the loser's pool's
  ending, which is never null for a side that is out; `fallen` goes from `src/arena/main.ts`'s
  words.
- A bout with a body that cannot rise runs to `CAP_SECONDS` and is judged on the bars. The
  battery's `--foe stands` table says how often: it is written in `play.md#the-bout`.

## Choice 1: struck, or spared

### *Struck*

Nothing is ruled. The plan lands what the battery under attack found, and `rising.md#under-attack`
carries the table: how many falls end the bout anyway, by blows on a body that is down.

### *Spared*

Spared is how a fighter left to itself conducts itself. An order to attack is carried out as it is
given, whoever it is aimed at: a person's orders are the person's.

- `senses.ts`: `Sensed.down(): boolean`, asked once a step as `out` is; `BodySense.down`: "Whether
  it is down (`BodyView.down`)". It rides the frame after `out`, so it is as old as the rest of
  what is sensed. The arena's and the crypt's `senses.add` pass `down: () => body.view.down`;
  `clockSenses` and `NOTHING_SENSED` are unchanged (they carry nobody).
- `fighter.ts`, `seekFoe`: a foe that is down is not attacked and not walked at:
  `if (senses.out || foe.out || foe.down) return { move: null, face: toward, attack: null };`.
  Its comment says so. A strike already thrown is not called back.
- `run.ts`: the planner's `attack` is null while its target's body is down.

## Tests

1. `arena-core`, **`a_side_that_falls_is_still_in_the_fight_and_rises`**: a bout in which the left
   is shoved over at 1 s (an impulse on its upper trunk, the right ordered to stand): no verdict
   at the fall; `duelists.left.body.has` is `"staged-rise"`, then `"command"`; the left's orders
   are carried out again after (it walks where it is ordered).
2. `arena-core`, the verdicts: `a_bout_in_the_arena_runs_to_its_verdict` is of a bout decided by a
   pool. *Counted*: **`a_side_down_for_the_count_is_out`**: the left under
   `{ kind: "fighter", subs: [{ kind: "lie" }] }` (`DuelRecipe.minds`), shoved over; the verdict
   comes `rules.count` seconds after the fall, to the step, `ending: "counted"`, the right the
   winner; with the riser, none. *Not counted*: the same bout under `lie` runs to its cap and is
   decided on the bars, `ending: "time"`.
3. `core-rules` (*Counted*), **`a count runs while a body is down, and starts again`**: `countedOut`
   on written readings: down for the count less a step is not out; a step more is; up for one step
   in the middle starts it again.
4. `arena-fork`: the fork across a fall and a rise; under *Counted* the field list gains
   `count` and `counted`.
5. `crypt-core`, **`a_crypt_body_that_falls_rises_and_fights_on`**: an enemy shoved over is
   `alive`, not `limp`, and is on its feet and at its target again; a body whose pool ends is
   dropped as before.
6. *Spared*: `core-senses`, **`down_is_sensed_as_old_as_the_rest`**: `BodySense.down` turns true
   `delay` steps after the body's own `view.down`. `core-mind`,
   **`a_fighter_holds_off_a_foe_that_is_down`**: `seekFoe` on written senses: a foe within reach
   and down gets `attack: null`, `move: null`; the same foe up is attacked. `arena-core`: in a bout
   where the left is shoved over within reach of the right, no blow lands on the left while it is
   down; the control is the same bout with `seekFoe`'s test taken out, by a mind written in the
   test.
7. `tests/research-rise.test.mjs`: `boutFall` with `foe: "fights"`, the row whole.

## Mutations, each must go red

- `fighting` still reads `view.down`: test 1.
- `FIGHTER` left at `lie`: tests 1 and 5.
- `alive` still reads `view.down`: test 5.
- *Counted*: the count never starts again (`since ??=` without the reset): test 3; the count kept
  outside the state: test 4; `fighting` ignores `counted`: test 2.
- *Not counted*: `ending` returns `"time"` for an ended pool: test 2's first bout.
- *Spared*: `down` read live, not from the frame: test 6's first; `seekFoe` ignores `down`: test
  6's second and third.

## Documents

- `README.md`: "rising after a fall (a fallen body is out)" leaves **Not yet**; How to play says a
  body that is knocked down gets up, and what the fight does meanwhile (the choices' answers).
- `AGENTS.md`: nothing, unless *Counted*: the rulebook's count is named where the rulebook's
  balance is.
- `docs/architecture.md`: "A body that is down is out of the fight" becomes what takes a body out;
  the arena's and the crypt's sections.
- `docs/roadmap.md`: "Rising after a fall" goes; the note that a strike at a fallen body cannot be
  tried in a bout goes, with what the battery under attack found in its place.
- `docs/reference/rising.md`: `## Under attack` (the table, the harness, each side's balance);
  `## Rules` (the two choices as answered, with the day).
- `docs/reference/play.md#the-bout`, `#bodies-in-the-step`: the bout's rules; what a rising body
  costs a step.
- `docs/reference/bouts.md`: every standing table measured again (`research/bout-baseline.mjs`),
  the old ones replaced, not kept beside; the trace digests it lists, read again.

The design file and this plan are deleted in the commit that lands it.

## Verification

```powershell
node scripts/fingerprint.mjs > before.txt
npm test
npm run check
npm run build
node scripts/fingerprint.mjs > after.txt
node research/bout-trace.mjs
node research/core-rise.mjs
node research/core-rise.mjs --foe fights
node research/bout-baseline.mjs
```

The fingerprint's arena and crypt lines change wherever a body falls; the commit carries them
before and after, and the new trace digest. The lab's routine and run, where nobody falls, do not
change.

**Eye gate.** An arena bout with a fall in it, watched to its verdict; a crypt fight in which a
party member and an enemy each go down.
