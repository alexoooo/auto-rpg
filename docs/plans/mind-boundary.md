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

A mind reads as a computation: a model at construction, then each step senses in through `think`
and commands out through `act`, with its memory in `state`. One execution path, the mirror at a
command delay of at least one step; one mind side (`answer`, `think`) wherever a mind runs, and one
short sequence per place stating its phase order. No new observation representation, no new copy
and no per-step allocation at the boundary.

Every slice keeps the fingerprint, command timing, sensing delay, replay and supported forks
exact, read as Evidence says, but for the one change slice 5 names. Tuning, algorithms and the
command layers' inside are out of scope; so are orders, which stay a reader the Option Mind calls
when it thinks (`MindWiring.orders`).
[Project organization](project-organization.md) owns where files live;
[Option Mind's speed](2026-11-04-option-mind-speed.md) owns search cost.

## The contract

```ts
/**
 * Everything a mind remembers from one step to the next, kept in one object (`{}` if it remembers
 * nothing). It must hold only plain data that `saveState` can copy: numbers, strings, arrays,
 * plain objects, typed arrays, vectors. No functions, engine objects or subscriptions.
 * Loading a save overwrites this object's contents in place, so always read it through the
 * object itself, never through a copy taken earlier.
 */
export type MindState = object;

/**
 * A mind. Each step the world calls `act` first, then `think`.
 * `think` only changes the mind's memory; `act` is the only place it sends commands.
 */
export interface Mind {
  /** What it remembers (see `MindState`). Saved and loaded with the bout. */
  readonly state: MindState;
  /**
   * The fast part: carry out what it has chosen, on the body as it is right now (balance, servos,
   * motors), by writing commands into `control`. They are sent as soon as `act` returns.
   * It gets no senses. Use `control` only during this call.
   */
  act(control: BodyControl): void;
  /**
   * The slow part: choose what to do next, from what it can see of the fight (`senses`, which
   * arrive 0.15 s late, like a person's reaction time), and write the choice into its memory.
   * The next `act` carries it out. In a worker, `think` runs while the world steps the physics,
   * so a long decision does not hold the world up.
   */
  think(senses: Senses): void;
  /** Something else has taken over the body: stop what it was doing, but keep what it has learnt. */
  interrupt(): void;
}

/** What a mind is given when it is made. */
export interface OwnBody {
  /** The body's design: its parts, joints and muscles. */
  readonly spec: BodySpec;
  /** How long one step is, in seconds. */
  readonly dt: number;
  /** How many steps it takes for a command to reach the body. At least 1. */
  readonly delay: number;
  /** The body as it is now: where each part is and how it moves. Updated before each call. */
  readonly built: ReadBody;
  /** The muscles as they are now: how strong each one is and what it can do. */
  readonly muscles: MuscleReading;
  /** How much assist it may ask for, and how much it has used. */
  readonly assist: AssistReading;
  /** Who and what the body is touching, where the fight labels them. */
  readonly contactIdentity?: ContactIdentity;
  /** What it senses at the moment it is made, so it can take a look before its first step. */
  readonly first: Senses;
}
```

- **Four required members.** `step(senses, dt)` becomes `think(senses)`, with `dt` fixed at
  construction, and the optional `move(dt)` becomes the required `act(control)`; `idle` becomes the
  required `interrupt`; `has`, `name`, `dispose` and the command layers' `body` move to the
  construction result. Sub-minds (`SubMind extends Mind`) take the same contract, and the command
  layers' own phases take the same two words, so each word means one thing.
- **Senses go in through `think`, commands come out through `act`.** `act` gets no senses and
  `think` gets no control: a decision reaches the body only through the mind's memory. In the
  Option Mind that memory is the command layers' queue (`pending`): `think` adds the decision and
  `act` carries out the one that is due. `guard` goes.
- **`MindState` names a contract the type cannot check.** `saveState` refuses a function, a getter
  or a class instance by its path. Completeness is read from exact continuation: a fork from a
  save goes on as the original did. A mind narrows `state` to its own declared type; `Mind` stays
  one type for every caller that holds minds of many kinds.
- **The readings and the control are the mirror's objects**, the same each step. The mirror
  refreshes the readings before the mind is called; they are valid during `act` and `think`. A
  mind that needs a value later keeps it, as the command layers keep the senses their last
  decision read (`BodyView.senses`). `ReadBody`'s consumers do not change.
- **`OwnBody` loses its callbacks**: `senses()` arrives in `think` (and `first` at construction),
  `requestHandPoses`, `assist.ask` and the muscles' command become the `BodyControl` given to
  `act`, `afterPhysics` becomes the command layers' `observe` (Execution), and `experiment`
  becomes an option of the command layers that research builds.

### Output

`BodyControl` is the mind's view of its mirror's command (`MirrorCommand`), the plain data the
bout saves:

| `BodyControl` | Writes | Saved in `MirrorCommand` as |
| --- | --- | --- |
| `muscles.activation`, `muscles.velocity` | by channel | the same `Float64Array`s |
| `assist.force`, `assist.moment` | the assist's ask | the same `Vector3`s |
| `hands.request(hand, pose)` | one hand's pose | `hands`, a `number[]` of hand and pose indices in request order |

The runtime owns the storage and `act` writes it. `BodyControl` holds no copy and no state of its
own (`request` is a function over `hands`), so a load, which fills the command in place, restores
what was asked and not yet answered. What `act` writes goes out with this step's answer; its
contents persist between steps, as now.

A hand request is checked as it is made, sets the hand's `requested` pose at once, and keeps its
order for the sheet. A second request for one hand before the answer is refused, a throw. That is
the rule now, moved to where the request is made: the mirror passes separate calls, the body side
merges a step's calls into one list (`commandWay`), and `HandPoses.request` throws on that list
`delay` steps later. One case differs: a duplicate the body drops today because it leaves `full`
before applying it throws where it is made; no caller makes two calls before an answer. The
calls' boundaries reach the saved command and the answer's numbers, but nothing acts on them, so
the command keeps requests, not calls: at most one pair a posable hand, in an array that keeps its
capacity. The answer clears it.

`MuscleReading` is `MuscleDriver` without the command, the level and the memory; motor control
takes the reading and `control.muscles`. `BodyControl` carries no equipment: `equipmentPort` has
no caller.

### Execution

The world's step runs `sense → prepare → dispatch → beforeStep → physics`. A mind runs at each
step its body is at `full`. The command delay is at least one step, so the order is always the
same. The world's side writes the body's numbers and carries the answer out; the mind's side is
two functions, the same in process and in a worker:

```ts
/**
 * The mind's side of a step, up to sending its commands: update the mind's copy of the body,
 * let the mind act on it, then send what it wrote.
 */
function answer(mind: Mind, mirror: Mirror): void {
  mirror.refresh({ dynamics: true });
  mind.act(mirror.control);
  mirror.answer();
}

/** The mind's side of a step, after its commands are sent: read the senses and let the mind think. */
function think(mind: Mind, mirror: Mirror): void {
  mirror.sense();
  mind.think(mirror.senses);
}
```

- **In process** (`embody`): `prepare` runs `writer.write()`, `answer`, `answered()` (the report
  read, `createMind`'s `said`) and `think`; `beforeStep` carries the answer into the body side
  (`writer.carry`).
- **In a worker** (`embodyApart`), on two threads:
  - main thread: `prepare` waits for the last answer (`seat.answer()`), runs `writer.write()` and
    asks the seat to step; `beforeStep` waits for this step's answer and runs `writer.carry`.
  - seat: on an ask, it finishes the last decision, then runs `answer` and publishes; it runs
    `think` while the main thread steps physics, or before the next ask at the latest.
  - The writer fills two inbound arrays in turn. The main thread fills one only after the answer
    to the numbers in the other, and the seat finishes a decision before it answers the next
    step, so no decision's numbers are written over while it reads them. Both waits stay in the
    two sequences, as `minds.ts` and `apart.ts` hold them now.
- **Both share one body side**: the command pipeline (the muscles' rings, the assist, the hand
  requests in flight, the sheets), the mirror's writer and the body's memory (`toes`, `strength`,
  `handPoses`), made by one function that `embody` and `embodyApart` call.
- **The command layers own the observers of the physics.** `Body.afterPhysics` adds a listener to
  a list the command layers keep and returns its removal, as `OwnBody.afterPhysics` does now; the
  sub-minds (`commandedMind` passes them the list), the skills (`skillSet`) and the recovery
  skills' held bodies (`heldBody`) subscribe there. `observe()` runs the layers' own feedback,
  then the list in the order added, on the layers' clock. `hosting` calls it first in its `act`,
  whoever has the body, nobody included. `commandedMind` is the layers' one maker, so every
  observer runs this way.
- **The observers' steps are the listeners' steps now**: `act` runs at each step at `full`,
  after the refresh. The first is the body's first step at `full`, on the interval just
  completed. None runs while the body is below `full`; after an interrupt, the next runs at the
  body's first step back at `full`, before its first decision.

| Delay | Owner | Kept in |
| --- | --- | --- |
| Sensing | `SensesHub` | its frames, by body |
| Command | the command pipeline | the muscles' and the assist's rings, `heldSteps(delay)` slots |
| A decision's | the mind | its `state` (the command layers' `pending`) |

## Memory and forks

A bout forks through one state graph (`saveState`, `loadState`), as every module's memory does: a
mind exposes `state` and has no save or load of its own. The graph holds the mind's `state`, its
command (`MirrorCommand`, which `BodyControl` views), what its senses last showed it (`Mirror.seen`),
the body side and the muscles. A load refreshes the mirror (`world.onLoad`, the runtime's). A mind
gets no load notification: what it keeps outside `state` is fixed at construction or rebuilt from
`state` where it is used; no mind subscribes to a load now. Worker-hosted minds still refuse to fork.

Cutting keeps its behaviour: the boundary joint is released, the cut channels weaken to zero,
indices stay fixed, and the mirror carries attachment and strength. Controllers that read
connectivity are separate work.

## Performance

The boundary is the mirror the game already runs, so no slice adds a copy. These per-step
allocations sit at the boundary now, and their slice removes them:

| Allocation | Where | Slice |
| --- | --- | --- |
| `splice(0)` of the hand requests, each step, empty or not | `commandWay`, every mind | 4 |
| a request array for each hand request, and its checked copy (`checkHandPoses`) | the command layers, `mirror.requestHandPoses`, `commandWay.request` | 4 |
| a frozen detached observation and a checked action, each step | `policyMind`, the bare entrant | 5 |

A slice that touches the step reads `node research/step-garbage.mjs --sites` before and after to
confirm its sites are gone and none is added, and `node research/step-time.mjs` paired, on the
harness its doc comment names. The simulation is held to exact equality; step time varies run to
run, so a slice lands when its paired readings show no regression beyond their spread.
`step-garbage` plays the default minds in process; slice 5 gives it a bare-entrant recipe to read
its sites. Making the mirror's write and refresh cheaper is a speed change of its own: the same
operations in the same order ([step cost](../reference/step-cost.md)).

## Evidence

Each slice reads every row before and after:

| Kept | Read by |
| --- | --- |
| The simulation, every mind | `node scripts/fingerprint.mjs --experimental --json`, then `--compare` |
| Command timing and delivery, a body leaving `full`, a save and load with commands in flight | [`tests/mind-contract.test.mjs`](../../tests/mind-contract.test.mjs) |
| Minds in workers as in process | [`research/minds-apart.mjs`](../../research/minds-apart.mjs) `--cases sword,hands --threads 1,2 --seconds 20` |
| Supported forks | `minds-apart.mjs --fork <s>`, which slice 1 adds: each in-process playing loaded from its save at `s` and played on, its hashes each second the same as the playing not loaded |
| The bare entrant | a fingerprint case with a fixed network, its weights from a seed, so its pulls are not zero; slice 5 adds it before it changes the entrant, and only that case moves |
| Allocation and step time | Performance |

## Slices

Each lands on main by itself with `npm run check`, `npm test` and every row of Evidence
unchanged.

1. **One path.** `createWorld` refuses a command delay under one step: one check for every world,
   as no world, with minds or without, asks for less but `sit-back.mjs`. Delete `embody`'s
   live-body branch, `World.mirrored` and the `mirrored` options of `createWorld`, `buildBout`,
   `buildTeamBout` and `coreStand`, and the no-delay branches of `answerOn` and of the command
   layers and `hosting` (`late`). One function makes the body side for `embody` and
   `embodyApart`; `answerOn` and `decideOn` become `answer` and `think`. `driveMuscles` keeps its
   live mode for research scripts that drive muscles without a mind. In `research/`:
   `step-time.mjs` loses `--mirrored`, `mind-split-hook.mjs` times `answer` and `think` in place
   of the deleted call, `sit-back.mjs --delay` takes one step or more, and `minds-apart.mjs`
   gains `--fork`, read before the slice changes anything.
2. **Required members and an explicit construction result.** `Mind` and `SubMind` take the
   contract's four members. A maker returns `{ mind, name, has(), dispose() }` and its own typed
   extras (the Option Mind's report, the command layers for the Lab); `hostBody` stops reading
   `mind.body`. `Experiment` moves to the command layers' options, carried in the mind's recipe to
   workers. The command layers' and sub-minds' own phases (`HostMind`'s `act` and `move`,
   `SubMind`'s `step` and `move`) take the names `think` and `act`.
3. **Senses as an argument.** Senses arrive in `think` and `OwnBody.first`; `OwnBody.senses`,
   `afterPhysics` and `motorPart` are deleted, and the command layers own the observers as
   Execution says. `heldBody` (the recovery skills' held bodies) passes its host's senses through
   `think`. The fight's `held` reader (`physicalBody`'s observation) gets a type of its own.
4. **Output in one place.** The `BodyControl` given to `act` replaces `requestHandPoses`,
   `Assist.ask` and the muscles' command for minds, and `heldBody` makes a control over its held
   arrays. The command's `hands` becomes request pairs, and the answer's numbers with it; a request
   is checked as a hand and a pose, with no array. The writers move to it: motor control
   (`solve.ts`, `bearing.ts`, `supported-motor.ts`), the gait assist, the recovery skills
   (`staged.ts`, `steady.ts`), the reptile's righting, the replayed sheets and
   `evaluation/technique.ts`. The Option Mind's writes found so far (motor control, the hand
   requests, the replayed sheets) run in the fast phase now; a write found in the decision phase
   moves to `act`, and the fingerprint cases it moves are named in the commit.
5. **The bare entrant as a Mind.** `act` writes the pulls its learner holds; `think` reads its
   inputs and decides new pulls. A decision then goes out with the next answer, one step sooner
   than now, which is the Option Mind's lag too (its queue at a delay of one). This is the plan's
   one change in behaviour: the bare entrant's fingerprint case moves by that step, and its commit
   says so. `policyMind`, `Policy` and the action checks are deleted where no other importer
   remains, with `policyMind`'s unused equipment parameter. `observeBody` stays for inspection
   (`PhysicalBody.observe`, the Lab).

The architecture's Mind section changes with slices 2–4.

## Done when

- `Mind` has the four required members and `OwnBody` holds fixed facts, readings and the first
  senses only; nothing calls a member with `?.`.
- `answer` and `think` are the mind's side wherever it runs, and each place's sequence states
  its phase order and waits; `mind.ts` holds no `if (mirrored)` branch, no `!` on a half-built
  object and no throw that enforces the contract.
- Every row of Evidence reads as it did before slice 1.
- The boundary's allocation sites in the table are gone, and paired step-time readings show no
  regression beyond their spread.
