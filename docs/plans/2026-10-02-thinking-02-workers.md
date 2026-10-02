# Thinking 02: thoughts in workers, and a world that waits

## Goal

A world given a runner posts each question when it is asked and takes its answer from the runner
at the step it is due; `World.advance` takes no step while an answer due is still out. The crypt
page thinks in workers, and its run is the same to the bit as one that thinks in its step.

It needs plan 01. The design is `2026-10-02-thinking-00-design.md`, rule 1, and the owner's first
answer: when an answer is late, the world waits.

## Files

| File | Change |
|---|---|
| `src/core/think/thoughts.ts` | `ThoughtRunner`; `Thoughts.ready`, `.resume`; `createThoughts(kinds, runner)`. |
| `src/core/world.ts` | `WorldOptions.runner`; `advance` waits; `THOUGHT_PATIENCE`. |
| `src/thoughts.ts` | New: `THOUGHTS`, every kind the game has, one list. |
| `src/think/worker.ts` | New: a worker's entry. Nothing imports it. |
| `src/think/pool.ts` | New: `workerRunner`, a `ThoughtRunner` over the browser's workers. |
| `src/dungeon/run.ts` | `DungeonRunOptions.runner`, handed to its world. |
| `src/dungeon/main.ts` | Makes the pool, gives it to the run, disposes it with the page. |
| `src/arena/duel.ts` | `Duel.load` calls `world.thoughts.resume()`. |
| `tests/harness/think-pool.mjs`, `think-worker.mjs` | New: Node's runner over `worker_threads`, its worker, and `stepReady`. |
| `tests/core-thoughts.test.mjs`, `tests/think-workers.test.mjs` | See Tests. |
| `tests/harness/core-stand.mjs`, `fork.mjs` | A loader calls `resume`. |
| `research/crypt-plan.mjs` | `--workers n`. |
| `vite.config.ts` | The comment on `worker.format`: the thought workers are module workers too. |
| `docs/architecture.md`, `AGENTS.md`, `docs/reference/step-cost.md`, `docs/roadmap.md` | See Documents. |

## The runner (`src/core/think/thoughts.ts`)

```ts
/**
 * **Where thoughts are thought off the step**: a host's (workers, a socket). The core names no
 * worker. A runner may lose a thought or answer it late: the world thinks what has not come.
 */
export interface ThoughtRunner {
  /** Begin thinking a `kind` on `question`: its answer is asked for by `serial`. */
  post(serial: number, kind: string, question: unknown): void;
  /** Whether the answer to `serial` has come, or never will: whether there is nothing to wait for. */
  has(serial: number): boolean;
  /** The answer to `serial`, once; null while it is out, and for one that is lost. A kind that threw throws here. */
  take(serial: number): { readonly answer: unknown } | null;
  /** Forget everything posted: an answer to it that comes after is not kept. */
  clear(): void;
}
```

`createThoughts(kinds, runner = null)`, and on `Thoughts`:

```ts
  /** Whether every answer due at step `now` is in hand: always, with no runner. */
  ready(now: number): boolean;
  /** Have every thought out thought again: whoever loads the state calls this, after the load. */
  resume(): void;
```

- **Asking** posts the copied question: `runner.post(serial, kind.name, question)`.
- **Taking** reads `runner.take(serial)`, and where it is null thinks the kept question with the
  world's own kind. So a step is the same with a runner, without one, and with one that never
  answers.
- `ready(now)`: every thought out with `due === now` has `runner.has(serial)`.
- `resume()`: `runner.clear()`, then every thought out posted again, in the order asked.

A runner keys what it posts by a count of its own, not by the serial, and `clear` forgets those
keys: after a load a serial may be asked again with another question, and the answer to the old
one must not be taken for the new.

## The world waits (`src/core/world.ts`)

```ts
interface WorldOptions {
  ...
  /** Where its thoughts are thought (`ThoughtRunner`); in its own step unless given. */
  readonly runner?: ThoughtRunner;
}

/**
 * How many calls of `advance` in a row may take no step for a thought that has not come, before
 * the step thinks it itself: a numeric setting of the host, half a second of frames at 60 a second.
 */
const THOUGHT_PATIENCE = 30;
```

```ts
    advance(seconds, most = Infinity) {
      state.owed += seconds;
      let taken = 0;
      while (state.owed >= dt - 1e-9 && taken < most) {
        // An answer due at this step is still out: the world waits for it, a call at a time.
        if (!thoughts.ready(state.steps) && waited < THOUGHT_PATIENCE) { waited += 1; break; }
        waited = 0;
        world.step(); state.owed -= dt; taken += 1;
      }
      if (state.owed >= dt) state.owed %= dt;
      return taken;
    },
```

`waited` is the world's own count beside its hooks, not state: it is of the host's time, and no
step reads it. The time a waiting call could not take is dropped by the line that drops it when a
page falls behind. `step` is unchanged: it never waits.

`World.advance`'s comment says so, and that a page that waits runs slow and plays the same.

## The game's kinds (`src/thoughts.ts`)

```ts
/** Every kind of thought the game has: what a worker can think (`src/think/worker.ts`). A fight gives its world the ones it asks. */
export const THOUGHTS = Object.freeze([...CRYPT_THOUGHTS]);
```

## The worker and the pool (`src/think/`)

`worker.ts`, the whole of it:

```ts
const kinds = new Map(THOUGHTS.map((kind) => [kind.name, kind]));
self.onmessage = ({ data }: MessageEvent<{ key: number; kind: string; question: never }>) => {
  try { self.postMessage({ key: data.key, answer: kinds.get(data.kind)!.think(data.question) }); }
  catch (error) { self.postMessage({ key: data.key, error: String(error) }); }
};
```

`pool.ts`:

```ts
/** A runner over `count` workers, each with every kind the game has; `dispose` ends them. */
export function workerRunner(count = workersFor(navigator.hardwareConcurrency)): ThoughtRunner & { dispose(): void }
/** The workers a machine of `cores` gives its thoughts: two cores left for the page and the browser, four at most, one at least. */
export function workersFor(cores: number): number
```

- A worker is `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })`, which
  Vite bundles as a chunk of its own.
- `post` gives the thought to the worker with the fewest out, the first among equals; `take`
  rethrows a kind's error with its kind's name.
- A worker's `onerror` marks every thought it had as lost, and the pool gives it no more: `has`
  is true for them and `take` null, so the world does not wait for them and thinks them itself.

The crypt page (`src/dungeon/main.ts`) makes one pool for the page, hands it to each run it makes
(`DungeonRunOptions.runner`), and disposes it with the page. `?workers=0` in the address makes
none, and the run thinks in its step: the control for the eye gate and for a machine with one
core.

## Node (`tests/harness/think-pool.mjs`)

```js
/** A runner over `count` worker threads, each with every kind the game has (`think-worker.mjs`). */
export function threadRunner(count = 2)
/** Wait for every answer due at the world's next step, then take it: a step with a runner, in Node. */
export async function stepReady(world)
```

`stepReady` is `while (!world.thoughts.ready(world.steps)) await new Promise(setImmediate);
world.step();`: a thread's message is delivered only when the loop turns. `think-worker.mjs` is the
thread's entry (`parentPort`), imports `src/thoughts.ts`, and is imported by nothing.

## Tests

`tests/core-thoughts.test.mjs`, with runners of the test's own (plain objects):

1. **`a_runner_s_answer_is_taken_at_the_step_it_is_due`**: a runner that answers at once with a
   marked answer: the mark is what `take` gets, at `asked + latency` and no sooner.
2. **`a_thought_that_has_not_come_is_thought_in_the_step`**: a runner that never answers: the
   record of takes equals the record with no runner.
3. **`advance_waits_for_a_thought_and_then_goes_on_without_it`**: the same runner:
   `world.advance(world.dt)` takes 0 steps `THOUGHT_PATIENCE` times in a row with a thought due,
   then 1; `world.state.owed` is under a step after each.
4. **`a_load_has_what_is_out_thought_again`**: a runner that records: after `loadState` and
   `resume()`, one `clear`, then each thought out posted again in the order asked; an answer the
   runner is given for a key from before the `clear` reaches no taker.

`tests/think-workers.test.mjs`, over `threadRunner`:

5. **`a_crypt_run_plays_the_same_with_workers_and_without`**: seeds 1, 2 and 3, the hero exploring
   with two companions, 20 s: `traceOf` every built body's segments after every step
   (`tests/harness/trace.mjs`) with `stepReady` and a runner, and with `world.step` and none:
   the two digests equal on each seed.
6. **`each_kind_answers_the_same_through_a_thread`**: for each of `THOUGHTS`, three questions from
   generated maps: `kind.think(question)` deep-equals the thread's answer.
7. **`a_kind_that_throws_throws_in_the_step_its_answer_is_due`**, with the kind's name.
8. **`a_runner_whose_worker_died_leaves_the_run_as_it_was`**: the thread ended in the middle of a
   run: the run goes on by `world.step`, and its digest equals the one with no runner.

`tests/arena-fork.test.mjs` stands: a bout's world has nothing out, and `Duel.load` calls
`resume`.

## Mutations, each must go red

- `ready` always true: test 3.
- No thinking in the step where the runner has nothing: tests 2 and 8.
- `resume` without `clear`, or `clear` that keeps its keys: test 4.
- Answers taken as they come, and not at their due step: tests 1 and 5.
- A worker that thinks with a kind missing from `THOUGHTS`: test 6 (the thread's answer is an
  error).
- `waited` not reset after a step: test 3's second round.

## Documents

- `docs/architecture.md`, One world step: the runner, `advance` waiting, `THOUGHT_PATIENCE`; The
  screens: the crypt page's pool and `?workers=0`. State: a loader calls `Thoughts.resume`.
- `AGENTS.md`: the page's address list gains `&workers=0`; Babylon and Rapier's section gains
  "**A worker's entry is imported by nothing** (`src/think/worker.ts`,
  `tests/harness/think-worker.mjs`): a module that imports one takes its message handler too."
  Node and tests: "**A step with a runner is `stepReady`** (`tests/harness/think-pool.mjs`): a
  thread's answer comes only when the loop turns."
- `docs/reference/step-cost.md#the-crypts-plan-in-the-step`: the table read again with
  `--workers 4`, beside the row without: the plan and the thoughts in the step, the steps over
  8.33 ms, and how many steps waited and for how long.
- `docs/roadmap.md`: the AI's item says where a rollout or a planner goes (a kind and a thinker).

**The bar**, on seeds 1 to 4 with `--workers 4`: the plan and the thoughts together are under
1 ms in every step of every run, and no step waits. Where a step misses it, what it spent is read
(a question's copy, a taker's work, a wait), fixed if it is this plan's, and written down if not.

## Verification

```powershell
node scripts/fingerprint.mjs > before.txt
npm test
npm run check
npm run build
node scripts/fingerprint.mjs > after.txt
node research/crypt-plan.mjs --seeds 1,2,3,4
node research/crypt-plan.mjs --seeds 1,2,3,4 --workers 4
```

Every line of the fingerprint is as it was: a runner changes no game. `dist/assets` holds a worker
chunk.

In a browser (`npm run preview` on another port): the crypt at `?play=dungeon`, the tab visible
(`document.visibilityState`), `engine.frameId` moving; the console clean; the same with
`&workers=0`.

**Eye gate.** A crypt run on the page with the hero exploring by itself and three companions,
with the workers and with `&workers=0`: with them, the hitch each time the hero picks a new place
to go is gone.
