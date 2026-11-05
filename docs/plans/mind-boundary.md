# The mind boundary

## The problem

[`mind.ts`](../../src/core/mind/mind.ts) is where a mind meets its body, and it does not read as
one idea:

- **`Mind` is one method and six optional members.** `has`, `move`, `idle`, `state`, `dispose`
  and `body` are optional, so callers probe: `mind.idle?.()`, `mind.has ?? mind.name`,
  `made.state ?? null`, and `hostBody` reads `mind.body` to decide whether a fight's body is a
  `HostedBody`. A mind without `state` forks wrongly and nothing says so.
- **`OwnBody` mixes five kinds of thing**: facts fixed at construction (`spec`, `delay`), live
  readers (`built`, `senses()`), outputs (`muscles.activation`, `assist.ask`,
  `requestHandPoses`), a subscription (`afterPhysics`) and a study's settings (`experiment`). It is
  assembled by a spread inside a ternary, one branch per execution path.
- **`embody` builds out of order.** The muscles' callback and `motorPart` reach `mind!` before the
  mind exists, the assist is injected later behind `help!`, and `mirrorDriven` sets `writer` after
  the callback that reads it.
- **The order of a step lives in five places**: the `driveMuscles` callback (live body), the
  `world.prepare` hook (mirror), `answerOn`, `decideOn` and `motorPart.move`, which `apart.ts`
  imports to rebuild the worker's sequence. `mirrorDriven` repeats `embody`'s wiring for workers.
- **A rule is a throw**: `motorPart.guard` throws when a motor part reads senses.

Two facts make most of it removable:

- **Minds run on mirrors at a delay.** `createWorld` sets `mirrored` whenever the command delay is
  positive, and the game's delay is one step (`COMMAND_DELAY`). Every world the game, the tests
  and `scripts/` build has that delay or more; only `research/sit-back.mjs --delay 0` reaches the
  live-body branch of `embody` and the no-delay branches of `answerOn` and the command layers.
- **The mirror is already the data boundary.** The world writes the body and the senses as
  numbers ([`mirror.ts`](../../src/core/mind/mirror.ts)), the mind reads `ReadBody`, `MuscleDriver`
  and `Senses` views rebuilt over them, and its command goes back as numbers, in process or in a
  worker. The game pays that cost now.

## Goal

A mind reads as a computation: a model at construction, senses in and control out each step,
memory in `state`. One execution path, the mirror at a command delay of at least one step; one
short function per place a mind runs, stating the phase order. No new observation representation, no new copy and no per-step
allocation at the boundary.

Every slice keeps the fingerprint, command timing, sensing delay, replay and supported forks
exact. Tuning, algorithms and the command layers' inside are out of scope; so are orders, which
stay a reader the Option Mind calls when it decides (`MindWiring.orders`).
[Project organization](project-organization.md) owns where files live;
[Option Mind's speed](2026-11-04-option-mind-speed.md) owns search cost.

## The contract

```ts
/**
 * **A mind's memory**: everything that changes its future, under one root, `{}` for none. Only the
 * forms `saveState` takes (`src/core/state.ts`); nothing outside the bout's state graph (no engine
 * handle, subscription or function); read through the root, since a load fills it in place.
 */
export type MindState = object;

/** A mind: its memory, a decision on what it senses, and a motor part that carries decisions out. */
export interface Mind {
  readonly state: MindState;
  /** Decide on the fight as its sensing delay shows it, after this step's answer. May write `OwnBody.control`, which goes out with the next answer. */
  decide(senses: Senses): void;
  /** Carry out what is due on the body as it is now, into `OwnBody.control`, before the answer. Empty where `decide` does all. */
  move(): void;
  /** Its body is not its own from now: drop what is under way, keep what it has learnt. */
  interrupt(): void;
}

/** What a mind is made with: fixed facts, its body's readings and its command. */
export interface OwnBody {
  readonly spec: BodySpec;
  /** The world's step, s: every `decide` and `move` is one step of it. */
  readonly dt: number;
  /** The command delay, steps (`World.delay`). */
  readonly delay: number;
  readonly built: ReadBody;
  readonly muscles: MuscleReading;
  readonly assist: AssistReading;
  readonly contactIdentity?: ContactIdentity;
  /** What it senses as made, for a look before its first step (`firstLook`). */
  readonly first: Senses;
  readonly control: BodyControl;
}
```

- **Four required members.** `step(senses, dt)` becomes `decide(senses)` with `dt` fixed at
  construction; `idle` becomes the required `interrupt`; `has`, `name`, `dispose` and the command
  layers' `body` move to the construction result. Sub-minds (`SubMind extends Mind`) take the same
  contract.
- **`MindState` names a contract the type cannot check.** `saveState` refuses a function, a getter
  or a class instance by its path. Completeness is read from exact continuation: a fork from a
  save goes on as the original did. A mind narrows `state` to its own declared type; `Mind` stays
  one type for every caller that holds minds of many kinds.
- **The readings and `control` are the mirror's objects**, the same each step. The mirror
  refreshes the readings before the mind is called; they are valid during `decide` and `move`. A
  mind that needs a value later keeps it, as the command layers keep the senses their last
  decision read (`BodyView.senses`). `ReadBody`'s consumers do not change.
- **`move` takes no senses**: fresh senses reach a mind only through `decide`, and `guard` goes.
- **`OwnBody` loses its callbacks**: `senses()` arrives in `decide` (and `first` at
  construction), `requestHandPoses` and `assist.ask` become `control`, `afterPhysics` becomes the
  command layers' `observe` (Execution), and `experiment` becomes an option of the command layers
  that research builds.

### Output

`BodyControl` is `MirrorCommand` with fixed storage:

| Field | Holds |
| --- | --- |
| `muscles.activation`, `muscles.velocity` | `Float64Array` by channel, the mirror's command arrays |
| `assist.force`, `assist.moment` | the assist's ask, `Vector3` |
| `hands.request(hand, pose)` | a request into slots made once, one per posable hand |

The runtime owns the storage and the mind writes it. Its contents persist between steps: what
`decide` writes goes out with the next step's answer, as now. The proposed hand request
is checked as it is made, sets the hand's `requested` pose at once, keeps its order for the sheet,
and refuses a second request for one hand within a step, a throw. This restricts the current
contract, which rejects duplicate hands within one call but accepts separate calls in order. The
answer clears the requests. `MuscleReading` is `MuscleDriver` without the command, the level and
the memory; motor control takes the reading and `control.muscles`. `BodyControl` carries no
equipment: `equipmentPort` has no caller.

### Execution

The world's step runs `sense → prepare → dispatch → beforeStep → physics`. A mind runs in
`prepare`, on its mirror, while its body is at `full`. The command delay is at least one step,
so the order is always the same:

```ts
/** A mind's step up to its answer: the body read, its motor part, its command published. */
function answer(mind: Mind, mirror: Mirror, writer: MirrorWriter, answered: () => void): void {
  writer.write();
  mirror.refresh({ dynamics: true });
  mind.move();
  mirror.answer();
  answered();
}

/** A mind's decision after its answer, on what it senses. */
function decide(mind: Mind, mirror: Mirror): void {
  mirror.sense();
  mind.decide(mirror.senses);
}
```

- **In process**: `answer`, then `decide`.
- **In a worker**: the seat runs the same sequence, its writer on the main thread; it publishes
  the answer and decides while the main thread steps physics, which waits for the answer in
  `beforeStep`.
- **`answered`** is where the report is read (`createMind`'s `said`) or the seat signals: after
  the answer, before the decision, as now.
- **Both share one body side**: the command pipeline (the muscles' rings, the assist, the hand
  requests in flight, the sheets), the mirror's writer and the body's memory (`toes`, `strength`,
  `handPoses`), made by one function that `embody` and `embodyApart` call. `beforeStep` carries
  the answer into it.
- **The command layers' observers** (their feedback, and the skills' observers in `arbiter.ts`)
  run from `observe(step, time)`, which the installed composite (`hosting`) calls first in its
  `move`, whoever has the body. That is every step the mirror's `afterPhysics` listeners run now,
  in the same order.

| Delay | Owner | Kept in |
| --- | --- | --- |
| Sensing | `SensesHub` | its frames, by body |
| Command | the command pipeline | the muscles' and the assist's rings, `heldSteps(delay)` slots |
| A decision's | the mind | its `state` (the command layers' `pending`) |

## Memory and forks

A bout forks through one state graph (`saveState`, `loadState`), as every module's memory does: a
mind exposes `state` and has no save or load of its own. The graph holds the mind's `state`,
`control` (the mirror's command), what its senses last showed it (`Mirror.seen`), the body side
and the muscles. A load refreshes the mirror (`world.onLoad`); a mind with derived caches rebuilds
them there. Worker-hosted minds still refuse to fork.

Cutting keeps its behaviour: the boundary joint is released, the cut channels weaken to zero,
indices stay fixed, and the mirror carries attachment and strength. Controllers that read
connectivity are separate work.

## Performance

The boundary is the mirror the game already runs, so no slice adds a copy. These per-step
allocations sit at the boundary now, and their slice removes them:

| Allocation | Where | Slice |
| --- | --- | --- |
| `splice(0)` of the hand requests, each step, empty or not | `commandWay`, every mind | 4 |
| a request array for each hand request | the command layers, `mirror.requestHandPoses` | 4 |
| a frozen detached observation and a checked action, each step | `policyMind`, the bare entrant | 5 |

A slice that touches the step reads `node research/step-garbage.mjs --sites` before and after to
confirm its sites are gone and none is added, and `node research/step-time.mjs` paired, on the
harness its doc comment names. `step-garbage` plays the default minds in process; slice 5 gives
it a bare-entrant recipe to read its sites. Making the mirror's write and refresh cheaper is a
speed change of its own: the same operations in the same order
([step cost](../reference/step-cost.md)).

## Slices

Each lands on main by itself with `npm run check`, `npm test` and the fingerprint unchanged.

1. **One path.** `createWorld` refuses a command delay under one step. Delete `embody`'s
   live-body branch, `World.mirrored` and the `mirrored` options of `createWorld`, `buildBout`,
   `buildTeamBout` and `coreStand`, and the no-delay branches of `answerOn` and of the command
   layers and `hosting` (`late`). One function makes the body side for `embody` and
   `embodyApart`; `answerOn` and `decideOn` become `answer` and `decide`. `driveMuscles` keeps its
   live mode for research scripts that drive muscles without a mind. In `research/`:
   `step-time.mjs` loses `--mirrored`, `mind-split-hook.mjs` times `answer` and `decide` in place
   of the deleted call, and `sit-back.mjs --delay` takes one step or more.
2. **Required members and an explicit construction result.** `Mind` and `SubMind` take the
   contract's four members. A maker returns `{ mind, name, has(), dispose() }` and its own typed
   extras (the Option Mind's report, the command layers for the Lab); `hostBody` stops reading
   `mind.body`. `Experiment` moves to the command layers' options, carried in the mind's recipe to
   workers.
3. **Senses as an argument.** Senses arrive in `decide` and `OwnBody.first`; `OwnBody.senses`,
   `afterPhysics` and `motorPart` are deleted, and the command layers' `observe` runs as
   Execution says. `heldBody` (the recovery skills' held bodies) passes its host's senses through
   `decide`. The fight's `held` reader (`physicalBody`'s observation) gets a type of its own.
4. **Output in one place.** `OwnBody.control` replaces `requestHandPoses`, `Assist.ask` and the
   muscles' command for minds, and `heldBody` makes a control over its held arrays. The writers
   move to it: motor control (`solve.ts`, `bearing.ts`, `supported-motor.ts`), the gait assist,
   the recovery skills (`staged.ts`, `steady.ts`), the reptile's righting, the replayed sheets and
   `evaluation/technique.ts`.
5. **The bare entrant as a Mind.** It reads `OwnBody` and writes `control`; `policyMind`,
   `Policy` and the action checks are deleted where no other importer remains, with `policyMind`'s
   unused equipment parameter. `observeBody` stays for inspection (`PhysicalBody.observe`, the
   Lab).

The architecture's Mind section changes with slices 2–4.

## Done when

- `Mind` has the four required members and `OwnBody` holds fixed facts, readings, the first
  senses and `control` only; nothing calls a member with `?.`.
- One function per place a mind runs states its phase order; `mind.ts` holds no `if (mirrored)`
  branch, no `!` on a half-built object and no throw that enforces the contract.
- The fingerprint, command timing, sensing delay, replay and supported forks are unchanged.
- The boundary's allocation sites in the table are gone and step time is unchanged in paired
  readings.

## Review

The problem is clear and the direction is sensible. The central problem is the entanglement of
input, output, memory, lifecycle and scheduling; optional members and the mixed `OwnBody` are
symptoms. Making the existing mirror the single execution boundary removes a scheduling path
without adding an observation representation. Separating readings from commands, requiring
explicit memory and moving reporting and disposal to the construction result support that goal.
Keep the four-member `Mind`, orders outside this work and the five-slice breakdown. Resolve these
points before implementing the affected slices:

- **Hand requests and fixed storage.** The [validator](../../src/core/build/hand-poses.ts)
  rejects duplicate hands within one request array; the [mirror](../../src/core/mind/mirror.ts)
  retains separate calls in order. One slot per hand with refusal of subsequent requests changes
  accepted behavior. Preserve the call semantics or justify the restriction as a separate behavior
  change; it cannot satisfy the promise that every slice preserves behavior exactly.
- **Worker sequencing and ownership.** Show the main-thread and seat sequences separately: the
  writer and mirror live on different threads, so the proposed `answer` function cannot run whole
  in the seat. State the synchronization invariant explicitly: the main thread cannot overwrite
  inbound numbers while the previous decision can still read them. The
  [preparing hook](../../src/core/mind/minds.ts) waits before writing for this reason. Share the
  body-side construction and motor, answer and decision operations where their ownership permits
  it; keep the cross-thread wait visible in the sequence.
- **Restoration and command state.** Specify how a mind with derived caches learns of a load:
  the proposed contract gives it neither the world nor a load notification. Choose ordinary-call
  reconstruction or an explicit restoration hook on the construction result. Distinguish the
  `BodyControl` interface from its saved plain storage: `hands.request` is a function and cannot
  enter the state graph. Name the saved hand-request count and order, and the command arrays'
  aliases, so loading preserves pending output.
- **Observer ownership and timing.** Specify how skill observers register, unsubscribe and keep
  their order under the command layers' `observe`. Define the first observation and the first
  step after interruption. Moving the call into `hosting.move` preserves the listener set's
  behavior only if these details remain explicit, whoever has the body.
- **Evidence for preservation.** Map each claim to existing evidence. The
  [command-contract test](../../tests/mind-contract.test.mjs) covers delivery, suspension and
  restoration with commands in flight; selected cases from the
  [worker-equivalence diagnostic](../../research/minds-apart.mjs) cover scheduling across threads.
  Name the continuation recipe for supported forks. Give the bare entrant a nonzero recipe that
  exercises its network and preserves its output-before-decision timing; zero outputs provide
  weak evidence. The default fingerprint alone does not establish all of these claims.
- **Performance acceptance.** Require no measurable step-time regression under the named paired
  protocol. Exact equality applies to simulation results; elapsed time varies between runs.
- **Minimum delay's scope.** Removing zero-delay mind execution is justified by the supported
  callers. Enforce the minimum at embodiment unless a concrete requirement also justifies
  restricting worlds that run muscles without minds.
