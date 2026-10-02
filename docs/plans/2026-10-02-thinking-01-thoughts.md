# Thinking 01: the world's thoughts, and the crypt's planning on them

## Goal

The world keeps the thoughts that are out and takes each answer at the step it is due
(`src/core/think/thoughts.ts`), thinking it in that step. The crypt's sight, its walkers' routes
and the hero's exploring are three kinds of thought and their thinkers, and `DungeonRun.plan`
searches nothing.

A step costs what it cost: the thinking is still in it, at the step an answer is due. What lands
is the seam, the cadence in one place, and the latency, which changes how a run plays and is
measured here. Plan 02 moves the thinking off the step.

The design is `2026-10-02-thinking-00-design.md`, rule 1.

## Files

| File | Change |
|---|---|
| `src/core/think/thoughts.ts` | New: `ThoughtKind`, `Thinker`, `Thoughts`, `createThoughts`. |
| `src/core/world.ts` | `World.thoughts`; `WorldOptions.kinds`; the step's order; `state.thoughts`. |
| `src/dungeon/thoughts.ts` | New: `SIGHT`, `ROUTE`, `EXPLORE`, `CRYPT_THOUGHTS`. |
| `src/dungeon/run.ts` | `THINKING`; the three thinkers; `perceive` becomes the sight's taker; `follow` wants a route and searches none. |
| `tests/core-thoughts.test.mjs` | New. See Tests. |
| `tests/crypt-core.test.mjs`, `dungeon.test.mjs`, `dungeon-party.test.mjs` | See Tests. |
| `research/crypt-plan.mjs` | Times `Thoughts.step` with the plan; prints how each run stood. |
| `docs/architecture.md`, `docs/reference/play.md`, `step-cost.md`, `AGENTS.md` | See Documents. |

## The core (`src/core/think/thoughts.ts`)

```ts
/**
 * **A kind of thought**: a function from a question to its answer, both plain data as a state is
 * (`src/core/state.ts`), written in numbers: a vector arrives as its three. It reads nothing but
 * its question and writes nothing, so its answer is the same wherever it is thought. A kind that
 * searches is bounded by a count in its question, never by a clock.
 */
export interface ThoughtKind<In, Out> {
  readonly name: string;
  think(question: In): Out;
}

/** **What asks thoughts of one kind and takes their answers.** */
export interface Thinker<In, Out> {
  /** Its own name in its world: what a thought out for it is kept under. */
  readonly id: string;
  readonly kind: ThoughtKind<In, Out>;
  /** It may ask at the steps whose count is `phase` past a multiple of `every`. */
  readonly every: number;
  readonly phase?: number;
  /** An answer is taken this many steps after its question: 1 or more. */
  readonly latency: number;
  /** This step's question, or null to ask nothing. */
  ask(): In | null;
  /** The answer to `question`, at the step it is due. */
  take(answer: Out, question: In): void;
}

/** **A world's thoughts**: who asks, and what is out. */
export interface Thoughts {
  /**
   * Its memory (`src/core/state.ts`): the count of thoughts asked, and each one out, in the order
   * asked: its thinker's id, its kind's name, its question and the step it is due. An answer is
   * never state.
   */
  readonly state: object;
  /** `thinker` asks from the next step it may. It throws at a kind the world was not given, and at an id in use. */
  add<In, Out>(thinker: Thinker<In, Out>): Hook;
  /** The world's, once a step, at step `now`: each answer due is taken, in the order asked, and then each thinker that may ask is asked, in the order added. */
  step(now: number): void;
}

/** The thoughts of a world whose kinds are `kinds`. */
export function createThoughts(kinds: readonly ThoughtKind<never, unknown>[]): Thoughts
```

- **Asking.** At step `now`, a thinker with `(now - (phase ?? 0)) % every === 0` is asked. A
  question that is not null is copied (`saveState`) and kept as
  `{ id, kind: kind.name, question, due: now + latency, serial }`, `serial` the count asked.
- **Taking.** At step `now`, every thought out with `due === now` is taken in the order asked: its
  kind thinks the kept question, and its thinker's `take` is called with the answer and the kept
  question. A thought whose thinker has gone is dropped. Answers are taken before questions are
  asked, so a thinker that takes at this step may ask again at it.
- A thinker removed (`Hook.dispose`) asks no more and takes no more. A hook added while the
  thinkers are asked waits for the next step, as a step hook does.
- `latency < 1`, `every < 1` or a `phase` outside `0 .. every - 1` throws at `add`.
- The module imports `saveState` and `Hook`, and nothing outside the core.

## The world (`src/core/world.ts`)

```ts
interface WorldOptions {
  ...
  /** The kinds of thought its thinkers may ask (`src/core/think/thoughts.ts`); none unless given. */
  readonly kinds?: readonly ThoughtKind<never, unknown>[];
}
```

```ts
  /** The thoughts out, and who asks them (`src/core/think/thoughts.ts`). */
  readonly thoughts: Thoughts;
```

`state` is `{ steps: 0, owed: 0, thoughts: thoughts.state }`. In `step`:

```ts
        runAll(sensing);
        thoughts.step(state.steps);
        runAll(before);
```

The interface's comment says a step is the sensing hooks, the thoughts, the step hooks, the solver
and the after-step hooks: an answer is taken after the senses have read the world and before any
mind steps, and a thinker asks on what the last step left.

`Duel.state` holds `world.state` already, so a bout saves what is out; the arena gives its world
no kinds, and what is out is empty.

## The crypt's kinds (`src/dungeon/thoughts.ts`)

Each calls what `src/dungeon/map.ts` has and nothing else.

```ts
/** Who sees what. */
export const SIGHT: ThoughtKind<SightQuestion, SightAnswer>;

export interface SightQuestion {
  readonly map: DungeonMap;
  /** Each party member in the fight: where it stands, and the place it pursues (where it last saw the enemy its order locks), or null. */
  readonly members: readonly { readonly id: string; readonly at: Point; readonly radius: number; readonly pursues: Point | null }[];
  /** Each enemy in the fight, built: where it stands, and whether it watches (it is not held). */
  readonly enemies: readonly { readonly id: string; readonly at: Point; readonly watches: boolean }[];
  /** How far the party reveals, and how far an enemy sees, m. */
  readonly reveals: number;
  readonly sees: number;
}

export interface SightAnswer {
  /** The cells the party sees from where its members stood, ascending. */
  readonly visible: readonly number[];
  /** For each enemy: the place in `members` of the nearest it sees, or -1. */
  readonly seen: readonly number[];
  /** For each member, for each enemy: the metres between them where the line is clear, or -1. */
  readonly lines: readonly (readonly number[])[];
  /** For each member: whether a path goes to what it pursues; false with nothing pursued. */
  readonly reachable: readonly boolean[];
}
```

- `visible` is `reveal(map, at, new Set(), reveals)` of each member, joined and sorted.
- `seen[e]` is as `perceive` finds it today: the nearest member with `canSee(map, enemy, member,
  sees)`, and -1 for an enemy that does not watch.
- `lines[m][e]` is `distance` where `clearSegment(map, a, b, 0, true, true)`, else -1.
- `reachable[m]` is `findPath(map, at, pursues, radius).length > 0`.

```ts
/** A walker's path. */
export const ROUTE: ThoughtKind<RouteQuestion, Point[]>;
export interface RouteQuestion { readonly map: DungeonMap; readonly from: Point; readonly to: Point; readonly radius: number }

/** Where the hero explores next, and the way there. */
export const EXPLORE: ThoughtKind<ExploreQuestion, ExploreAnswer>;
export interface ExploreQuestion { readonly map: DungeonMap; readonly from: Point; readonly explored: readonly number[]; readonly radius: number }
export interface ExploreAnswer { readonly goal: Point | null; readonly route: Point[] }

/** The crypt's kinds, for its world. */
export const CRYPT_THOUGHTS = Object.freeze([SIGHT, ROUTE, EXPLORE]);
```

`ROUTE` is `findPath`. `EXPLORE` is `explorationGoal` over `new Set(explored)`, then `findPath` to
the goal it gives; `explored` is the run's set as an ascending array.

The map is 51 cells a side (`LEVEL.blocks * LEVEL.block`), so a question's copy of it is 2601
bytes of floor and the rooms, doors and obstacles: `research/crypt-plan.mjs` prints what the
copies take, and it is recorded.

## The run (`src/dungeon/run.ts`)

`createWorld(scene, options.engine, { kinds: CRYPT_THOUGHTS })`.

```ts
/**
 * When the run thinks, steps (`docs/reference/play.md#run-timing`): how often each thinker may
 * ask (`every`) and how late its answer is (`latency`). Who sees whom is asked every `sight.fresh`
 * steps, and at once after a person's order.
 */
const THINKING = Object.freeze({
  sight: { every: 6, latency: 6, fresh: 24 },
  route: { every: 6, latency: 12 },
  explore: { every: 12, latency: 12 },
});
/** An enemy goes on to where it last saw the party for this long after losing sight of it, s (`docs/reference/play.md#run-timing`). */
const ALERTED_SECONDS = 7;
/** A walker whose last search found no route asks again no sooner than this, s (`docs/reference/play.md#run-timing`). */
const REPLAN_SECONDS = 0.5;
```

`RUN_TIMING` goes. `nextPerception` becomes `looked` (the step who sees whom was last asked) and
`look` (a person's order wants it asked at once).

### An actor's route

`DungeonActor` gains:

```ts
  /** Where it wants a route to, or null: `follow` sets it, and its route's thinker asks for it. */
  want: Point | null;
  /** Whether a search for it is out. */
  asked: boolean;
  /** Whether its last search found no way. */
  blocked: boolean;
```

One thinker a built actor, added in `build` and removed with the run, `id: "route " + actor.id`,
`kind: ROUTE`, `phase` the actor's place in `actors` modulo `every`:

- `ask`: null unless `actor.want`, `!actor.asked`, the actor is alive and not held; then
  `asked = true` and `{ map, from: actor.feet(), to: actor.want, radius: actor.radius }`.
- `take(route, question)`: `asked = false`; `blocked = route.length === 0`;
  `nextPlan = clock + REPLAN_SECONDS`. Where the route is not empty, or the actor has none,
  `actor.route = route` and `actor.goal = question.to`: a search that finds no way keeps the route
  the walker had. `want` is null again where it is still within `ARRIVAL.goalMoved` of
  `question.to`.

`follow(actor, goal)` keeps its shape and calls no `findPath`:

- stalled for `STALL.seconds` with a route: `actor.want = goal`;
- no `actor.goal`, or `goal` farther than `ARRIVAL.goalMoved` from it, or no route and
  `clock >= nextPlan`: `actor.want = goal`;
- then it walks the route it has, as today, and stands with none.

Where `memberMovement` says a path is blocked or a destination unreachable, it reads
`actor.blocked` and no longer `!actor.route.length`: a route that has not come yet is not a way
that is blocked.

### Who sees whom

One thinker, `id: "sight"`, `kind: SIGHT`:

- `ask`: null unless the run is playing, a party member is alive, and `look` is set or
  `world.steps - looked >= THINKING.sight.fresh`; then `look = false`, `looked = world.steps`, and
  the question from where everybody stands. A member's `pursues` is its `lastSeen` where its
  order is a lock and its locked enemy is in the fight.
- `take(answer, question)`: what `perceive` and `choose` do today, with every `canSee` and
  `findPath` read from the answer by the actors' ids in the question: `visible` becomes the set
  and joins `explored`; each enemy's target, `lastSeen` and `alertedUntil` from `seen`; each
  member's `choose` with `lines[m][e]` against `PARTY_SIGHT.locked`, `.pick` and `.keep`, and
  `reachable[m]` where it called `findPath`. An actor named in the question that is no longer in
  the fight is passed over; an enemy built since is not in the answer and keeps no target until
  the next.

`plan` sets `look` where it set `nextPerception = 0`, and calls no `perceive`.

### Exploring

One thinker, `id: "explore"`, `kind: EXPLORE`: `ask` is null unless the hero is alive, explores
(`memberMovement`'s last branch sets `hero.exploring` where it called `explorationGoal`), and none
is out; `take` gives the hero `goal` and `route`, and clears `exploring`. With no goal the hero
stands, as today.

## Tests

`tests/core-thoughts.test.mjs`, on a bare world (`createWorld(scene, await freshEngine(), { kinds })`)
with kinds of the test's own:

1. **`an_answer_is_taken_latency_steps_after_its_question`**: a thinker with `every: 4`,
   `phase: 1`, `latency: 3` of a kind that doubles: over 14 steps, the whole record of
   `[step asked, step taken, answer]`.
2. **`a_question_is_what_was_asked_whatever_the_asker_writes_after`**: `ask` returns an object it
   then writes into; the kind sees it as asked, and so does `take`.
3. **`answers_due_at_one_step_are_taken_in_the_order_asked`**: two thinkers whose latencies make
   their answers due together, the later-asked with the shorter latency.
4. **`an_answer_is_taken_after_the_senses_and_before_the_step_hooks`**: a sensing hook, a thinker
   and a step hook each push their name: the step's order.
5. **`a_thinker_removed_asks_and_takes_no_more`**, with a thought of its own out.
6. **`the_thoughts_out_save_and_load`**: `saveState(world.state)` with thoughts out; the record of
   takes over the next 20 steps; `loadState`; the same record again.
7. **`a_kind_the_world_was_not_given_is_refused`**, and an id in use, a latency of 0.

The crypt:

8. `crypt-core`, **`a_walker_s_route_comes_latency_steps_after_it_wants_one`**: an order to a
   floor point two rooms off; the hero's `route` is empty until the step the answer is due and is
   `findPath`'s from where it stood when asked.
9. `crypt-core`, **`the_run_searches_nothing_in_its_plan`**: `src/dungeon/run.ts` imports from
   `./map.ts` none of `findPath`, `reveal`, `canSee`, `explorationGoal` (read from its source, as
   `tests/core-boundary.test.mjs` reads imports).
10. `crypt-core`, **`an_explorer_reaches_the_exit_on_several_seeds`**: seeds 1 to 4, the hero
    exploring alone with enemies given no spawns (`layout` with `spawns: []`): `status` is `"won"`
    within 240 s on each.
11. `tests/dungeon.test.mjs`, **`each_crypt_kind_answers_as_the_map_does`**: `SIGHT`, `ROUTE` and
    `EXPLORE` on three generated maps against `reveal`, `canSee`, `findPath` and `explorationGoal`
    called directly; whole answers.
12. The crypt's tests that read a route, a target or the fog in the step it is wanted step
    `every + latency` further; their expectations stand.

## Mutations, each must go red

- An answer thought when asked, on the question uncopied: test 2.
- Taken a step early, or late: test 1.
- Taken in order of thinker and not of asking: test 3.
- `thoughts.step` after the step hooks: test 4.
- What is out left off `state`: test 6.
- `follow` calling `findPath`: test 9.
- `SIGHT` reading the doors as they stand when it thinks and not as asked (a door opened between):
  test 2's kind in the crypt's clothes, in test 11: a question, its map's door opened after
  `saveState`, the answer as the door was.

## Documents

- `docs/architecture.md`, One world step: the thoughts' place in the step, a kind, a thinker,
  what is out being state. The Crypt's section: the three kinds and `THINKING`.
- `AGENTS.md`, the core's rules: "**A thought is a pure function of its question**, asked at one
  step and taken at a named later one (`Thinker`, `src/core/think/thoughts.ts`). Nothing that
  takes longer than a step is called in one: it is a kind, and its budget is a count."
- `docs/reference/play.md#run-timing`: `THINKING`, `ALERTED_SECONDS`, `REPLAN_SECONDS`, and the
  table below.
- `docs/reference/step-cost.md#the-crypts-plan-in-the-step`: the table read again, the plan and
  the thoughts timed together and the questions' copies apart.

**The latency's table** (`play.md#run-timing`), by `research/crypt-plan.mjs --seeds 1,2,3,4,5,6,7,8`,
which prints for each run how it stood, its seconds, the blows landed and the cells explored:
before this plan; at `THINKING` as written; with every latency halved; with every latency doubled.
The constants land at the row whose runs stand as the runs before did; if none does, the plan
stops there and the table goes to the owner.

## Verification

```powershell
node scripts/fingerprint.mjs > before.txt
node research/crypt-plan.mjs --seeds 1,2,3,4,5,6,7,8 > plan-before.txt
npm test
npm run check
npm run build
node scripts/fingerprint.mjs > after.txt
node research/crypt-plan.mjs --seeds 1,2,3,4,5,6,7,8 > plan-after.txt
node research/bout-trace.mjs
```

The fingerprint's crypt lines change, since a route and a sight come later; the commit carries
them before and after. The arena's, the lab's and the levels' lines, and the trace's digest, do
not.

**Eye gate.** A crypt run on the page: the party walks to a click, follows the hero, the fog
opens as they go, an enemy comes when it sees them, the hero explores by itself; nothing waits
visibly for its route.
