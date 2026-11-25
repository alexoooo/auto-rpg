# The Option Mind is a Mind: one contract, one class, predictions behind interfaces

**Begun 2026-11-25, by the owner's order** ("ok, yes i want to refactor the code along these
lines. please write a plan."), after a discussion of why
[the measured Mind plan](2026-11-25-measured-mind.md) keeps needing audit tools: the code has no
place where a prediction, or the Mind itself, is stated.

This is a refactor. Every chunk leaves every fingerprint line as it was. No existing config
changes shape or meaning; 3c adds one kind of predictions and one preset to pick.

A fresh agent given this plan and the code, and not the session that wrote it, tried to refute
it on 2026-11-25. What it found wrong is corrected below; what it could not settle by reading is
listed under "Not settled by reading".

## The goal, in the owner's words

> the only thing that you're good at is writing code, so unless we explicitly model everything in
> code, you're gonna keep failing. and i need the code to be clean enough for me to easily
> understand what it does (so far, the only code I've reviewed is the Mind interface, which
> required a lot of iteration to get to a clean state).

> to me, an Option Mind is a type of Mind, so it sounds like the code is broken in its current
> state. re the organiztion, yes that sounds cleaner, but i want to go further and have a
> conceptially coheret Option Mind implementation

Of the shell that calls a registered decider: "that is a basic violation -- the general code is
hard-coding specific implementation logic". Of the folder: "src/minds/option/ has a large number
of source files, it's difficult to review". Standing: "I always want everything to be just a
skill. I don't want any ad-hoc hard-coded hacks."

## What is wrong today

Each line was read in the code on 2026-11-25 at `878c17a24`.

1. **Nothing named Option Mind is a `Mind`.** `OptionMind` (`src/minds/option/build.ts:28`) is
   the receipt the build hands the fight (`MindMade`). The `Mind` (`src/minds/mind.ts:15`) is made
   by `hosting` (`src/minds/sub-mind.ts:24`), a shell for a host and ranked sub-minds, used here
   with no sub-minds.
2. **Two plug-in points are stacked under it.** The shell calls the command layers' `think` and
   `act` (`src/minds/motor-layers.ts`), which call a driver registered by `Body.drive`
   (`SplitDriver`, `src/control/body.ts:88`), which `driveBy` (`src/minds/decider.ts:99`) builds
   from a `Decider`, the skills and a pace. `driveBy` reads as general and has one caller in `src`
   (`build.ts:73`).
3. **The loop lives in the part called predictions.** The read, choose, run loop is the object
   literal `profileModel` returns (`src/minds/option/profile-model.ts:48`), built by
   `PredictionsPart.make` (`predictions-part.ts`). That part also builds the situation reader, the
   Options and the chooser.
4. **A run-time string stands in for a type.** `PROFILE_MODEL = "profiles/1"`
   (`profile-contract.ts:10`) is set on every chooser, Option kind and predictions part and checked
   three times: as the Mind is built (`isProfileOption`, `kinds.ts:33`), as it learns
   (`profile-learning.ts:12`) and as its config is checked (`config.ts:112`). Every registered
   part carries the same string.
5. **The contracts import each other in a cycle, mixed with implementations.** `option.ts` holds
   the `Option` interface and the function that moves an imagined body (`placedWith`). `value.ts`
   holds `Terms` and the damage arithmetic. `option.ts` imports `percepts.ts` and `value.ts`, and
   both import `option.ts`. `Percepts` and `Predictions` are not written anywhere: they are derived
   from two object literals (`percepts.ts:660`, `:707`).
6. **Predictions are spread over the reader, the imagined state and the search.** Six named
   readings (`PREDICTIONS`, `percepts.ts:707`) are a closed literal whose tables ride on what the
   reader sees (`Seen.strikes`, `Seen.measured`, `Seen.others`); one of the six can be swapped
   (`OthersModel`, `percepts.ts:359`). The foe keeping his velocity is `carried` inside
   `placedWith` (`option.ts`). The foe's reply is `replyOf` (`chooser.ts:697`). The fitted value
   is read by `fittedLeaf` (`chooser.ts:409`).
7. **By-hand numbers are branches inside the measured code.** `strike.ts:215` prices
   `measured ?? priorOf(at)`, and `:218` and `:327` branch the same way. The foe's pressure prices
   a limb with no fresh profile by `prior` at `RATE` (`percepts.ts:309`), and a blow coming from
   an unmodelled limb at `LANDS` (`:593`). `PRIOR_PREDICTIONS` is the measured model given empty
   tables, so "by hand" has no code of its own to point at.
8. **36 files and a `data/` folder of 3, 5,781 lines, one flat folder.** `chooser.ts` (930) holds
   three choosers, two searches, the reply search and the editor fields; `percepts.ts` (842) the
   percepts, the foe's pressure, reach memory and the prediction registry; `kinds.ts` (389) every
   kind's registration.
9. **`Situation.perceive` and `Situation.predict`, and the part roles `profile-percept` and
   `profile-prediction` behind them, have no caller and no registered part** in `src`, `research`,
   `scripts` or `tests`.

## The target

The Option Mind is five ideas. Each is one interface in `src/minds/option/contract/`, and the
Mind is one class that uses them.

| Idea | Interface | Says |
| --- | --- | --- |
| What I know | `Situation` | the body's knowledge at one moment, real or imagined |
| What I can do | `Option` | whether it can be played here, what it is predicted to bring (`model`), what it asks of the skills each step |
| What I cannot see from my own Options | `ExchangePredictor`, `ValuePredictor` | what the foe and the body do to each other; what a state is worth where a line stops |
| How I pick | `Chooser` | picks Options, reading the future only through the two rows above |
| How I act | `Skills` (`src/skills/framework/skills.ts`, as it is) | turns what the chosen Options ask into a body command |

No interface is declared before something reads it ([the code recipe](../recipes/code.md): "no
seam, hardening or declaration for a consumer that does not exist"). A predictor of which Option
the body would take (the measured Mind plan's action prior) is declared by the step of that plan
that builds it, in `contract/predictors.ts`.

### The class

`src/minds/option/option-mind.ts`, written out so `think` and `act` read top to bottom. Tests
import `src/` with Node's type stripping, which has no parameter properties
([the test rules](../../tests/README.md)), so fields are declared and assigned.

```ts
/**
 * An Option Mind. Each decision it reads its situation, chooses among its Options by what they
 * are predicted to bring, and asks its skills to carry out what the chosen Options ask.
 */
export class OptionMind implements Mind {
  // The parts it is made of. None is replaced after the Mind is built.
  private readonly layers: CommandLayers;
  private readonly skills: Skills;
  private readonly reader: SituationReader;
  private readonly options: readonly Option[];
  private readonly chooser: Chooser;
  private readonly pace: Pace;
  private readonly sight: Sight;
  private readonly facing: (now: Situation) => number | null;

  /**
   * Its memory. Everything it remembers from one step to the next is in here, and is saved and
   * forked with its body. Anything it keeps outside is a cache: dropping it changes no result.
   */
  readonly state: OptionMindState;

  /** What it reports doing, for screens and Commanders. The rules never read it. */
  readonly engagement: Engagement;

  /** What it expects of each foe it has priced, as its last fresh decision left it. */
  get prospects(): readonly Prospect[] { return this.state.said.prospects; }

  constructor(parts: OptionMindParts) {
    // One assignment a field, and `state` gathered from the parts' own memories.
  }

  think(senses: Senses): void {
    const { layers, skills, state } = this;
    layers.look(senses);
    if (state.idle) { layers.resume(); state.idle = false; }
    const view = layers.view;
    if (view.resumed) skills.resume(view);
    const since = this.pace.since(view, layers.body.dt, lastEnded(skills.report.ledger));
    if (since !== null) state.asked = this.decide(since);
    layers.decided(state.asked);
  }

  act(control: BodyControl): void {
    const { layers, skills, state } = this;
    layers.observe(control);
    if (state.idle) return;
    const due = layers.take(control) as Intent | null;
    layers.apply(due === null ? null : skills.command(layers.view, due, layers.body.dt), control);
  }

  interrupt(): void {
    if (this.state.idle) return;
    this.skills.release(this.layers.view, "idle");
    this.layers.release("idle");
    this.state.idle = true;
  }

  /** One decision: what I know, what I do, and what that asks of the skills. */
  private decide(dt: number): Intent {
    const read = this.reader.read(this.sight);
    let priced: readonly Situation[] = NONE;
    const chosen = this.chooser.decide(read, () => priced = this.reader.others());
    this.reader.keep(chosen.at);
    const intent = intentOfSet(chosen.set.map((option) => ({ claims: option.claims, ...option.step(chosen.at, dt) })),
      () => ({ move: null, face: this.facing(chosen.at) }));
    this.publish(read, priced, chosen);
    return intent;
  }
}
```

`publish` holds what `profileModel` does today around choosing, in today's order: the foe's
phase as `read` saw it; where the decision was fresh, the prospects at `read` and at each
situation the chooser priced (`priced`, which the chooser fills only when it prices the other
foes); and, after the Options' steps, the two details (`unmetDetail`, `profileDetail`).
`lastEnded` is the last ended action's sequence, as `driveBy` reads it. `SituationReader` is
what `situationReader` returns today with no name (`state`, `read`, `others`, `keep`); chunk 2b
writes it as an interface in `contract/situation.ts`, where the class is its first reader.

**On `interrupt`.** Today the layers clear their queue, then the driver's release runs (the
skills'), then the motor resets. The class releases the skills, then the layers. The skills'
release (`src/skills/framework/arbiter.ts:202`) reads the view and its own memory, neither of
which the layers' queue or `released` flag reaches, and the motor resets after it either way.
The fingerprint and the test "takeover clears a paced ward and staged toe support restores into
a fresh player" (`tests/skills/boundaries.test.mjs`) judge it.

### Three kinds of memory

A class and a closure can both hide memory, so the class shows which is which by where a field
sits, and one check holds it.

| Kind | Where | Rule |
| --- | --- | --- |
| parts | the `private readonly` fields | made once, never replaced |
| memory | `state`, one plain object | saved, loaded, forked (`src/core/state.ts`); `saveState` refuses a function or a getter in it |
| caches | a Mind's fields named as caches in their comment; module maps keyed by a value that never changes (a body's spec, a data table) | dropping one changes no result |

The check is chunk 5's: the fingerprint's fights played as a relay through fresh bouts.

### The folder

```
src/minds/option/
  option-mind.ts     the class above
  index.ts           what the folder publishes
  contract/          interfaces only, no cycle, no code
  assembly/          the config, its checks, the controller and the build
  situation/         what the body reads each step, and the imagined states
  options/           each kind of Option
  choosers/          the choosers, the searches, the objectives
  predictions/       the predictor implementations, their data, the by-hand kind
```

## What must not move

- **The `Mind` interface** (`src/minds/mind.ts`), `MindConstruction`, `BodyHost` and `MindMade`:
  not a field.
- **Every config.** A case's key holds every subject's config in full (`keyOf`,
  `src/evaluation/run.ts:54`), so a key added to a preset can orphan its saved rows. No key moves
  between parts and no existing preset or default gains one.
- **Every fingerprint line**, in every chunk. The fingerprint names a state difference without
  failing (`scripts/fingerprint.mjs`), and chunk 2 does reshape the Mind's saved state; a pose
  line that moves is a defect in the chunk.
- **What a body allocates a step** (`tests/harness/step-allocation.mjs`): read before chunk 2 and
  after chunks 2 and 3 on `option-lean` and `option-tail`, the empty-handed man (477 and 541 KiB
  a body a step on 2026-11-25). A chunk that raises either by more than the harness's own spread
  between two runs is reworked before it lands.
- **Scripted bodies.** `stockBody`, `commandedBody` and their sub-minds (`src/minds/seat/host.ts`,
  `src/app/stock-body.ts`) drive by `drive` as they do now, a function or a split driver; about
  forty research and test call sites use them.

## The checks every chunk runs

```powershell
node scripts/fingerprint.mjs --workers 12 --json .tmp/option-mind/before.json   # once, before chunk 1
npm run check
npm test
node scripts/fingerprint.mjs --workers 12 --compare .tmp/option-mind/before.json
npm run build                                                                    # browser code moves in every chunk
```

A chunk that changes what a config resolves to, or moves a file the pages import (2b, 3c, 4), is
also opened headless at the Arena with the mind editor open, on `npm run preview` at a port that
is not 5180, the server killed by PID after.

**Research scripts are not type-checked.** A chunk that moves a file or a state path greps
`research`, `scripts` and `tests` for it, repoints each hit, and loads each repointed script once
(`node --check`); a script that reads a path of the Mind's state is run once on one bout, since
a wrong path there reads `undefined` and says nothing.

**The reader of each chunk.** No chunk waits on the owner. Before a chunk is committed, a fresh
agent is given the diff, this plan's section for the chunk and the code, not the session that
wrote it, and is told to refute two claims: "this chunk moved no behaviour" and "this chunk left
no second path beside the new one". What it finds, and what was done about each finding, goes in
the commit message. The owner can read `contract/` after chunk 1 and `option-mind.ts` after
chunk 2 whenever they choose; a change they ask for then is an edit to an interface with its
implementations already behind it.

## Chunk 1: the contract

**Purpose.** Everything the Mind is made of can be read in one folder of interfaces, in one
direction, with no implementation in the way.

**Files made**, each holding types only (`interface`, `type`, `import type`):

| File | Holds | Moved from |
| --- | --- | --- |
| `contract/terms.ts` | `Ground`, `Leaves`, `Outcome`, `Terms`, `Ask` | `value.ts`, `option.ts` |
| `contract/situation.ts` | `Situation`, `Percepts`, `Predictions`, `Cues`, `Pressure`, `ReachMemory`, `Bearing`, `ModelledStrike` | `option.ts`, `percepts.ts` |
| `contract/option.ts` | `Option`, `Step`, `Asked`, `Site`, `Sites` | `option.ts` |
| `contract/objective.ts` | `Objective`, `Tally`, `Path`, `Obedience`, `ObedienceLevel` | `objective.ts`, `value.ts` |
| `contract/chooser.ts` | `Chooser` (over `OfferTerms`, which stays in `src/minds/engagement.ts`) | `chooser.ts` |
| `contract/parts.ts` | `OptionPart`, `OptionBody`, `ChooserPart`, `ObjectivePart`, `PredictionsPart`, the four config registries and their `declare module` | `parts.ts` |

Imports run one way: `terms` <- `situation` <- `option` <- `objective`, `chooser`, `parts`.

**The rule for a type the contract names and does not hold.** A contract file imports types
from below the Option Mind (`src/core`, `src/control`, `src/skills`, `src/minds/*.ts`) and from
`contract/`. A type it needs from the rest of the folder is moved into `contract/`, written out
as an interface where today it is a `ReturnType`, when the file that holds it imports the
contract (a cycle for the reader); else it is imported as a type and listed here. Read on
2026-11-25: `NamedSkills` (`skills.ts`), `Walker` (`walk.ts`), `OptionRecord` (`record.ts`) and
`RiseMemory` (`rise-memory.ts`) are named by the contract and their files import it, so they
move; `PressureTable` (`pressure.ts`, which imports nothing of the Option Mind) is imported
until 3a narrows `Pressure`; `OptionEvaluation` (`model.ts`) is imported until 2b deletes it.

**Steps.**

1. **`Percepts` and `Predictions` are written out**, a field a line with its sentence, taken from
   the comment above `PERCEPTS` and `PREDICTIONS`. The literals say they meet them, and one line
   each says they hold nothing more, since `satisfies` on a frozen object checks one way only:

   ```ts
   const PERCEPTS = Object.freeze({ ... }) satisfies { readonly [K in keyof Percepts]: Percept<Percepts[K]> };
   const EVERY_PERCEPT: keyof typeof PERCEPTS extends keyof Percepts ? true : never = true;
   ```

   `ReachMemory` is written out the same way, where today it is `ReturnType<typeof reachMemory>`.
2. **`Situation.perceive`, `Situation.predict`, `ProfilePerceptPart`, `ProfilePredictionPart`,
   the `parts` argument of `perceiver`, the memo of part readings and their exports from
   `index.ts` are deleted** (wrong, 9). Nothing selectable goes: no part of either role is
   registered. The comments that name a `uses` field (`option.ts:19`, `parts.ts:75`) are
   corrected: no such field exists.
3. **The functions leave the contract's old files without changing.** `placed`, `placing`,
   `placedWith`, `along`, `exitOutcomes`, `standing`, `still`, `asking`, `READY`, `blocked` stay in
   `option.ts`; `upOrDown`, `AS_IS`, `UNMOVED`, `STILL`, `CLINCH`, `clinched`, `blowLife`,
   `limbReach`, `record`, `RETHINK`, `OBEDIENCE`, `STEADY`, `FIRST` stay in `value.ts`. Chunk 4
   moves them. Each old file re-exports nothing: every importer is repointed to `contract/`.
4. **`optionApplies`** (the one function in `parts.ts`) moves to `config.ts`, which reads it.
5. **Every importer is repointed**, inside the folder and outside (`src/app/registration/*`,
   `src/app/catalog.ts`, `src/app/option-controller.ts`, `src/entrants/*`, `src/evaluation/*`,
   `research/*`, `tests/*`): `grep -rn "minds/option/" src research scripts tests` before and
   after, and `npm run check` finds what a grep misses in `src`.

**Consequences.** `index.ts` publishes the contract's types from their new files.
`scripts/source-boundary.mjs` needs no change: the rank is the folder's, by its longest prefix.

**Done when** the checks pass, the fingerprint compares clean, and
`grep -rnE "^(export )?(function|const|class|let) " src/minds/option/contract` prints nothing.

## Chunk 2: the Option Mind is a `Mind`

Three commits, each green.

### 2a: the command layers say their steps

**Purpose.** A Mind that owns its layers can call them a step at a time. The driver's path is
rewritten through the same three steps, so they have a caller from this commit.

In `src/minds/motor-layers.ts`, `think` and `act` become:

```ts
  /** Queue what was decided this step. A null keeps the command the body already has. */
  const decided = (decision: unknown): void => {
    state.pending.push(decision);
    state.resumed = false;
    moved();
  };
  /** Read the body for this step and hand back the decision that is now due. Null where none is due yet, or the one due keeps the command. */
  const take = (control: BodyControl): unknown => {
    current = control;
    feel(clock.time);
    state.felt = true;
    if (state.pending.length < own.delay) return null;
    const due = state.pending.shift() ?? null;
    if (due !== null) state.born ??= clock.time;
    return due;
  };
  /** Obey `command` where there is one, then have the motor write the muscles for this step. */
  const apply = (command: BodyCommand | null, control: BodyControl): void => {
    if (command) obey(command, control);
    motor.control(muscles, control, clock.dt);
    moved();
  };
  const think = (): void => decided(driver ? driver.decide(view, clock.dt) : null);
  const act = (control: BodyControl): void => {
    const due = take(control);
    apply(due === null ? null : driver?.carry(view, due, clock.dt) ?? null, control);
  };
```

`decided`, `take` and `apply` are returned beside `look` and `observe`. Nothing else changes.

**Done when** the checks pass and the fingerprint compares clean.

### 2b: the class

**Purpose.** `OptionMind` is the `Mind` its body runs. The loop leaves the predictions part.

**Steps.**

1. **`src/minds/option/pace.ts`** holds what `driveBy` does about when to decide, as a class with
   its memory in `state`:

   ```ts
   /**
    * When an Option Mind decides again: every `every`th control step on its phase, and at once on
    * the step its body is back from another holder, its orders change, or an action of its skills
    * has ended.
    */
   export class Pace {
     /** The step it last decided on, the orders it decided on then, the last action ended then, and whether it has decided at all. */
     readonly state = { decided: 0, orders: null as Orders | null, ended: 0, begun: false };
     private readonly every: number;
     private readonly offset: number;
     private readonly orders: (senses: Senses) => Orders | null;

     constructor(every: number, phase: number, orders: (senses: Senses) => Orders | null) {
       if (!Number.isInteger(every) || every < 1 || !(phase >= 0 && phase < 1)) throw new Error(`a mind decides every whole number of steps on a phase in [0, 1), not every ${every} on ${phase}`);
       this.every = every;
       this.offset = Math.floor(phase * every);
       this.orders = orders;
     }

     /** The seconds since its last decision where one is due this step, else null. The first is `dt`. A mind that decides every step asks for no orders here, as now. */
     since(view: BodyView, dt: number, ended: number): number | null {
       if (this.every === 1) return dt;
       const state = this.state, step = Math.round(view.time / dt), every = this.every, orders = this.orders(view.senses);
       if (state.begun && !view.resumed && ((step - this.offset) % every + every) % every !== 0 && ended === state.ended && sameOrders(orders, state.orders)) return null;
       const since = state.begun ? (step - state.decided) * dt : dt;
       state.decided = step; state.orders = orders === null ? null : structuredClone(orders); state.ended = ended; state.begun = true;
       return since;
     }
   }
   ```

   `everyOf` moves here from `decider.ts`. The intent held between decisions is the Mind's
   (`OptionMindState.asked`), where `driveBy` kept it in the pace's state.
2. **`option-mind.ts`** is the class above. `OptionMindState` is
   `{ layers, skills, situation, record, chooser, options, aims, pace, asked, idle, said }`:
   the layers' memory, the skills', the reader's, the Options' record of their tries, the
   chooser's, each Option's, the aims', the pace's, the intent it last decided, whether it is
   idle, and what it last published (`{ prospects, details, foe }`).
3. **`build.ts`** makes everything inside the one `host.take`, in today's order (layers, first
   look, ground skills, aims, skills, Options, reader, chooser), and returns `MindMade`:

   ```ts
   export function buildOptionMind(host: BodyHost, config: ResolvedConfig): MindMade {
     // ...the parts under its skills, as today...
     const { mind, skills } = host.take((own) => {
       const scope = constructionScope(); let complete = false;
       try {
         const layers = scope.own(commandLayers(own, layerOptions, clock));
         layers.firstLook();
         const body = layers.body;
         // ...ground skills, aims and skills on `body`, as today...
         // ...the predictors its predictions part makes; its Options, its reader and its chooser, as `profileModel` builds them today...
         const mind = new OptionMind({ layers, skills, reader, options, chooser, pace: new Pace(every, host.phase, host.orders), record, aims: aimsState(aims), sight: sightOf(body, skills), facing: walk.facing });
         complete = true;
         return { mind, skills, name: layers.name, has: () => mind.state.idle ? "nobody" : layers.name, body,
           dispose() { skills.release(layers.view, "replaced"); scope.dispose(); } };
       } finally { if (!complete) scope.dispose(); }
     });
     return { state: mind.state, skills, report: skillsReport(skills, mind) };
   }
   ```

   The scope is `commandedMind`'s own pattern (`sub-mind.ts:63`): a part that throws while the
   Mind is built disposes the layers already made. `dispose` releases the skills as `replaced`,
   which is what disposing the layers does today through the driver (`drive(null)`,
   `motor-layers.ts:262`). The interface `OptionMind extends MindMade` is deleted; `mind.ts`
   reads `MindMade`.
4. **The predictions part makes predictors and nothing else.** `PredictionsPart.make(config)`
   returns what `profileModel` is called with today, under its own name in
   `contract/predictors.ts`:

   ```ts
   /** What a Mind predicts by, made by its predictions part. */
   export interface Predictors {
     /** Every striker's measured strikes, which model a foe's. */
     readonly strikes: readonly Profile[];
     /** What each act of the body's own brings. */
     readonly outcomes: OutcomeModel;
     /** What the foe is expected to take from the body. */
     readonly others: OthersModel;
     /** The speed a walk is priced as starting at. */
     readonly walkStart: WalkStart;
   }
   ```

   `profile-model.ts` is deleted: its build moves into `build.ts`, its decision into the class,
   and `profileDetail`, `prospect`, `unmetDetail` into `option-mind.ts` beside `publish`.
   `model.ts` (`OptionEvaluation`, `OptionEvaluationInput`) is deleted.
5. **`"profiles/1"` goes** (wrong, 4): `PROFILE_MODEL`; the `model` field of the three part
   contracts that carry it (`OptionPart`, `ChooserPart`, `PredictionsPart`) and of every
   registered part; the three checks (`isProfileOption` in `kinds.ts`, `profile-learning.ts:12`,
   `config.ts:112` to `:114`); and their exports from `index.ts`. `ProfileOptionPart` folds into
   `OptionPart`: its extra members (`recovery`, read at `rise.ts:344`, and those the cast at
   `kinds.ts:245` reaches) become `OptionPart`'s, and the generic that carried the context and
   the Option type is dropped. `ProfileOptionContext` is what an Option kind is made from and
   moves to `contract/parts.ts` as `OptionContext`; `profile-contract.ts` is deleted. First
   `grep -rn "PROFILE_MODEL\|profiles/1" src research tests scripts` and confirm no part carries
   another string (none did on 2026-11-25). A Mind built wholly otherwise is another kind of
   mind (`controller`), as the bare entrant is.
6. **`driveBy`, `Driven` and the `Pace` interface are deleted from `src/minds/decider.ts`.**
   `Sight`, `sightOf` and `Script` stay; `Decider` stays only if `Script` is not its one use,
   else its fields fold into `Script`. Its callers:
   - `scripts/fingerprint.mjs:184`, `tests/harness/garbage.mjs:30`, `research/rest-probe.mjs:118`
     stand a stock body. `src/app/standing-skills.ts` gains the driver they share:

     ```ts
     /** A driver that has `skills` carry out an order to stand, decided anew each step. */
     export const standingDriver = (skills: Skills): SplitDriver<Intent> => ({
       state: { skills: skills.state },
       decide(view) { if (view.resumed) skills.resume(view); return standIntent(0); },
       carry: (view, intent, dt) => skills.command(view, intent, dt),
     });
     ```

     and each calls `body.drive(standingDriver(skills), skills.release)`.
   - `tests/minds/contract.test.mjs:145` ("a commanded Mind restores its driver's memory from its
     own state") tests the seat: it calls `body.drive({ state: memory, decide, carry }, ...)`
     itself. The Option Mind's own memory across a fresh load is the next test's (`:188`) and
     chunk 5's relay.
   - `tests/layer-contracts.test.mjs` ("pacing detects changed orders from a provider reusing its
     object") tests the pace: it makes `new Pace(10, 0, () => orders)` and asks `since` twice with
     the one orders object changed between, and expects a decision both times.
7. **Research scripts read the Mind's state by path**, and each is repointed and run once.
   The Mind's own, under `minded.state.mind`: `.decider.model.record` becomes `.record`
   (`research/skills/recovery/edge-profile-trial.mjs:36`), `.decider.options` becomes `.options`
   (`research/skills/recovery/implementations/staged/rise-trace.mjs:41`), `.skills` keeps its
   name (`rise-trace.mjs:61`, `research/skills/locomotion/travel-environment.mjs:78`). The
   body's, under `body.state.mind`: `.host.motor` becomes `.layers.motor`
   (`research/step-time.mjs:57`, `research/skills/locomotion/locomotion-run.mjs:181`,
   `locomotion-wrench.mjs:298`). Then
   `grep -rnE "mind\??\.(host|decider)\b" research scripts tests` prints nothing that reads an
   Option Mind.

**Consequences.** The Mind's saved state has another shape, so the fingerprint names a state
difference on every fight and fails on none. No bout's save is kept in a file (only forks in
memory), and a save made on another build starts its Mind fresh, as
`tests/minds/contract.test.mjs:211` requires of a mind "whose memory is built otherwise". The
comment on `BodyHost.phase` (`src/minds/mind.ts:46`) names `driveBy` and is corrected. A world
that runs its minds apart (`mindApart`, `src/minds/seat/create-mind.ts`) makes the Mind through
the same `Controller.create`, and is opened once in the browser's Arena for this commit.

**Done when** the checks pass, the fingerprint's pose lines compare clean, allocation is read,
and `grep -rn "driveBy\|OptionEvaluation\|profiles/1" src research scripts tests` prints nothing.

### 2c: the driver's seat leaves the command layers

**Purpose.** General code calls a registered driver only where a body is scripted. The Option
Mind's layers have no `drive` that would be ignored without a word.

**Steps.**

1. In `motor-layers.ts`: `driver`, `released`, `drive`, `state.driver`, `think`, `act`,
   `interrupt` and `carried` leave; `release` loses its call of `released`; `dispose` clears its
   listeners. The layers gain `forget()`, which drops the decisions queued and not yet carried
   out and nothing else: a driver replaced does that today without releasing the motor
   (`motor-layers.ts:222`). `LayersMind` is deleted: `CommandLayers` is the layers' one type and
   is no `Mind`.
2. In `src/control/body.ts`: `Body` loses `drive`. `BodyDriver` and `SplitDriver` move to
   `src/minds/sub-mind.ts` unless `grep -rn "SplitDriver\|BodyDriver" src/control` finds a
   reader there.
3. In `src/minds/sub-mind.ts`: `commandedMind` owns the seat, with today's behaviour moved, not
   rewritten. `drive(next, onRelease)` wraps a function driver with `carried` as now; a driver
   replaced calls the old one's `released(view, "replaced")` and `layers.forget()`; the driver's
   state is `state.driver`, beside `has`, `host` and `subs`. The host's think is
   `layers.decided(driver ? driver.decide(view, dt) : null)`, its act is `take` then `apply` of
   the driver's `carry`, giving up the host calls `released?.(view, reason)` then
   `layers.release(reason)`, and its `dispose` calls `drive(null)` before the layers'.
   `CommandedMind` is `MindConstruction & { readonly body: Body; readonly drive: Drive }`.
4. In `src/minds/seat/`: `takeBody` assigns `view`, `envelope`, `afterPhysics` and `commanded`
   where the construction has a `body`; `commandedBody` adds `drive` from its construction.
   `hosted-body.ts` holds two types: `CommandedBody`, a `PhysicalBody` with the layers' `view`,
   `envelope`, `afterPhysics` and `commanded`, which a body under any Mind that owns command
   layers is; and `HostedBody`, a `CommandedBody` with `drive`. The Lab's actor
   (`src/game/lab/actor.ts:114`) reads the first and is typed so; it calls no `drive`.
5. Tests that reach `construction.body.drive` (`tests/layer-contracts.test.mjs:178`,
   `tests/minds/contract.test.mjs:145`, `tests/minds/stance-ownership.test.mjs:27`) call
   `construction.drive`.

**Consequences.** `drive` on a scripted body is where it was for every `stockBody` and
`commandedBody` caller. A body under an Option Mind has no `drive`; nothing in `src`, `research`
or `tests` called it (`grep -rn "\.drive(" src`, read on 2026-11-25).

**Done when** the checks pass and the fingerprint compares clean.

## Chunk 3: predictions behind interfaces

### 3a: the exchange

**Purpose.** What the body predicts of the fight between it and its foe, beyond what its own
Options model, is asked of one interface that a config can swap whole. Today that is six
readings in a closed literal, one of them swappable, and two more inside the imagined state and
the search.

`contract/predictors.ts` gains:

```ts
/** What the body and its foe are expected to do to each other, as far as the body can tell without knowing the foe's Options. */
export interface ExchangePredictor {
  /** The share of the body's life the blow already coming is expected to take, where `pressure` does not count it already. */
  danger(seen: Seen): number;
  /** What the foe's fighting is expected to take from the body as the two stand now. */
  pressure(seen: Seen): Pressure;
  /** What the body's own strikes are expected to take from the foe. */
  pressing(seen: Seen): Pressure;
  /** What a second spent down in each posture is expected to cost the body. */
  downRate(seen: Seen): (posture: Position) => number;
  /** How fast the foe turns to face, rad/s. */
  turns(seen: Seen): number;
  /** The share of the foe's life a blow of a limb of the body's takes at a segment of his. */
  blows(seen: Seen): (limb: string, segment: string) => number;
  /** The foe `seconds` s from now. The same object where that does not move him. */
  later(foe: BodySense, seconds: number): BodySense;
  /** The move the foe is expected to answer a line of the body's with: a velocity and the seconds he keeps it. Null where he is expected to stand. */
  reply(root: Situation, line: Terms): FoeMove | null;
}
```

Its first six members are `Predictions`' six fields, each read from what the reader sees.
`FoeMove` names what `replyOf` returns today (`{ x, z, seconds }`). A
predictor reads `Seen` and not the `Situation`: a percept read through the situation counts as
watched by the chooser (`Cues`), and a prediction must not add to what the chooser watches.

**Steps.**

1. **`Seen` moves to `contract/situation.ts` as what a predictor reads**: the sight, the spec,
   the rates, the delay, the rules, the orders, the focus and the blow coming. The reader's own
   (`SeenAt`, `situation.ts`) extends it with the ward, the threat reader and its two memories.
   `Seen.strikes`, `Seen.measured` and `Seen.others` go: the code that reads them (`modelOf`,
   `foeModel`, `ownModel`, `lifeOf`, `PREDICTIONS`; `percepts.ts:202` to `:258`, `:592`, `:708`)
   is all inside the predictor, which is built with those tables.
2. **The profile predictor is `PREDICTIONS` made an object.** `profileExchange(given)` returns an
   `ExchangePredictor` built with the measured strikes, the body's own modelled strikes, the
   pressure tables or none, and the body's constants. `Predictors.others` becomes
   `Predictors.exchange`, a function from what a Mind gives (its spec, rates, delay, rules and
   its Options' modelled strikes, known once its Options are made) to its predictor. `perceiver`
   reads each of a situation's six predictions from the predictor on what it sees, lazily, as it
   reads the literal today. `OthersModel`, `RATE_OTHERS` and `measuredOthers` become the two
   ways `profileExchange` is given its tables; `danger` is 0 where the measured table reads, as
   `holdsBlow` selects today.
3. **`later` replaces `carried`** (`option.ts:181`), as it is, the identity kept: `placedWith`
   branches on whether the foe is the same object. `placing` takes the predictor's `later`
   where it takes `carry` seconds today, and the search asks it for `Math.min(seconds, carry)`:
   the chooser's `carry` stays the seconds of the foe's motion a search reads.
4. **`reply` replaces `replyOf`** (`chooser.ts:697`), as it is. `repliedSearch` keeps what is
   the search's: which replies it prices each line against (`replies`, `DIRECTIONS`), how
   (`against`), and the imagined root in which the foe makes the predicted move
   (`chooser.ts:679`).
5. **`Pressure` becomes what is asked of it.** Today it is a record of the implementation's
   fields, read by free functions that the search and the imagined state call
   (`chooser.ts:564`, `option.ts:159`), so no other predictor could answer with its own. The
   contract's `Pressure` is:

   ```ts
   /** What one body's strikes are expected to take from another as the two stand. */
   export interface Pressure {
     /** The seconds before a blow not yet begun reaches the struck body once it is within reach. */
     readonly latency: number;
     /** The most it takes in a second, for a report. */
     readonly peak: number;
     /** How it was priced, as a sentence for a report. */
     readonly priced: string;
     /** The share of the struck body's life it takes over a span from `now`. */
     dealt(now: Situation, span: Span): number;
     /** How far from the striker its blows begin to land, m. */
     edge(now: Pick<Situation, "range" | "apart">): number;
     /** The same pressure with one of the two bodies standing otherwise. */
     stanced(body: keyof Stances, own: StanceNumbers): Pressure;
     /** The same pressure keeping scratch for one search's repeated questions. */
     cached(): Pressure;
   }
   ```

   `ProfilePressure` is a class in the implementation's file whose fields are today's (`model`,
   `phase`, `struck`, `stance`, `rateAt`, `measured`) and whose methods are today's functions
   (`dealtAt`, `edgeOf`, `stancedPressure`, `cachedPressure`), bodies unchanged. Methods sit on
   the prototype, so a pressure allocates no closures. Where today a pressure is copied with a
   spread (`percepts.ts:381`), the class copies by a constructor. `inReach` and `threatened`
   read a situation's pressure and stay functions over the interface. `contract/situation.ts`
   then imports nothing from the rest of the folder.

**Consequences.** No config changes. `tests/minds/option/lying.test.mjs` imports `RATE_OTHERS`
and is repointed; `src/evaluation/back-step/` calls `inReach` and `measuredReach` and is repointed.
The `edgeOf` of `src/control/support.ts` and of `src/evaluation/rise/cases.ts` are other
functions of the same name and are left alone.

**Done when** the checks pass, the fingerprint compares clean, allocation is read, and
`grep -rnE "\.(model|struck|rateAt|measured)\b" src/minds/option --include=*.ts` shows a
pressure's fields read only in the file that holds `ProfilePressure`.

### 3b: what a line's end is worth

**Purpose.** The search does not know what the fitted value is made of.

```ts
/** What a state is worth where a line of the search stops. */
export interface ValuePredictor {
  /** A reader for one search begun at `root`. Null where it has no reading of this body against this foe. */
  from(root: Situation): ValueReader | null;
}

/**
 * The life expected to be dealt and taken over the `seconds` after `at`, read with the Options on
 * offer there as their models price one try and the body's `grace` there. Null where it has no
 * reading of this state.
 */
export type ValueReader = (at: Situation, grace: number, offered: readonly Offered[], seconds: number) => Followed | null;
```

**Steps.**

1. **`fitted-value.ts` exports `fittedValue(value, body): ValuePredictor`.** `from` answers null
   where `fittedOn` does today, once a search; the reader answers null where `readingAt` does.
   `Offered` and `Followed` (today `Fitted`) move to `contract/predictors.ts`. `readingAt`,
   `featuresOf`, `offeredOf`, `FEATURES` and `bodyOf` stay exported: `research/minds/fitted-value.mjs`
   and `move-prior.mjs` fit by them.
2. **`fittedLeaf` (`chooser.ts:409`) keeps only the search's half**: once a search it asks
   `from(root)` and, with no reader, ends every line as the tail does, gathering nothing, as
   now. With one, at each leaf it gathers the offers, asks the reader, and prices the path with
   what it answers, weighed as now; where the reader answers null the line ends by the search's
   own Options run again (`search.leaf`), as now.
3. **The tree chooser's part makes the predictor it selected**: `leaf: "fitted"` reads
   `dataOf("fitted-value")` and calls `fittedValue`, as its `reads` already declares. The asset is
   1.4 MB, so it stays read only by a config that names it.

**Done when** the checks pass, the fingerprint compares clean, and `chooser.ts` imports from
`fitted-value.ts` only `fittedValue`, `bodyOf` and `offeredOf`.

### 3c: by hand has one home, and a kind without it

**Purpose.** A number set by hand that stands in for a measurement has one file and one
interface, the measured code reaches it only through that interface, and a kind of predictions
built without it can be picked. This is the place the measured Mind plan's registry of numbers
set by hand (its step 1) reads. `GuessedStrike` names what `priorOf` reads of a strike today
(`strike.ts`); `Placing` is `percepts.ts:299`'s, exported.

Said plainly, since it differs from what the discussion first proposed: the fallbacks are not
removed from the game's Mind here, and no existing config gains a key. A body facing a foe with
no measured strikes would predict no harm at all and walk in, and how to predict a foe never met
is the measured Mind plan's question. And a key added to the game's configs would orphan every
saved row of theirs (what must not move). So the `measured` kind stays what it is
today (the comment at `predictions-part.ts:34`: "each model its own where fresh, else its
prior"), now built as the measured code given
the guesses; and a kind given none is added beside it.

```ts
/**
 * Numbers set by hand that stand in where nothing is measured. A Mind has them only where its
 * predictions part gives them.
 */
export interface Guesses {
  /** What a strike of the body's is expected to bring from `at`, by hand, its chance of ending down with it. */
  strike(at: Situation, strike: GuessedStrike): Expected;
  /** A limb with no profile of its own, as a reading of what it deals a body it can reach. */
  limb(seen: Seen, striker: BodySpec, struck: BodySpec, limb: string, placing: Placing): ProfileReading;
  /** A blow already coming from a limb with no profile of its own, as a reading of what it deals. */
  blow(seen: Seen, blow: NonNullable<Seen["blow"]>, range: number): ProfileReading;
}
```

**Steps.**

1. **`by-hand.ts`** (made in the flat folder; chunk 4 moves it) implements `Guesses` with the
   code at each site, whole, so no hand-set number is left at a caller:

   | Member | Today's code |
   | --- | --- |
   | `strike` | `priorOf(at)` (`strike.ts:215`, `:327`) and the clinch read where nothing is measured (`:218`, `clinched`) |
   | `limb` | the `prior(...)` call in `pressureBy` with its `RATE` and its landing rate (`percepts.ts:309`), which prices a foe's limb, the body's own unmeasured strike (`pressingOf`) and the down rate alike |
   | `blow` | the `priorOf(...)` call in `lifeOf` with its `LANDS` (`percepts.ts:593`) |

   `prior`, `LANDS`, `RATE`, and `PRIOR` with `record` (`value.ts:206`, `:214`, read only by the
   two by-hand sites) move into `by-hand.ts` as its own, not as members. Then each row of the
   measured Mind plan's table "What is guessed now, and what replaces it" is read: a row that
   stands in for a measurement and is not above is added as a member with its call site; a row
   that plan sorts as a preference or as the Mind's own stays where it is.
2. **`Predictors` gains `readonly guesses: Guesses | null`**, and `OptionContext` and
   `profileExchange` are built with it. The measured code reaches a guess only as
   `guesses?.strike(...) ?? null`: with none, a strike with no reading at a state models null
   there and is not offered, its `rate` says nothing of that foe, its `priced` says "not
   measured here", and a limb with no profile adds nothing to a pressure.
3. **The two kinds of today are built from it and resolve as before**: `measured` gives the
   guesses with its tables; `prior` gives the guesses with empty tables. Neither config changes.
4. **A kind with no guesses is added**: `measured-only`, "Measured only", the `measured` part's
   config and tables with `guesses: null`, registered beside the other two
   (`src/app/registration/option-predictions.ts`). The `measured` part's label becomes
   "Measured, by hand where nothing is".
5. **A preset is added to pick**: `option-measured`, "Option Mind, measured only", the default
   config with `predictions: { kind: "measured-only" }`. It is read once against the game's,
   empty-handed man (`npm run match -- option option-measured`), and the digest goes in the
   commit message and first in the report. It stays pickable whatever it reads; which the
   game's default should be is the measured Mind plan's bar ("the inventory is clean for every
   body on its default config").

**Consequences.** The mind editor offers a third kind of predictions. `option-drill` is
unchanged: it is the `prior` kind. The fingerprint plays every mind, so it gains the new
preset's lines and moves none.

**Done when** the checks pass, the fingerprint compares clean on every existing case,
`grep -rnE "\b(LANDS|RATE|PRIOR|priorOf|prior)\b" src/minds/option --include=*.ts` finds them
only in `by-hand.ts`, and the Arena opens headless with `option-measured` picked.

## Chunk 4: one idea a file, six folders

**Purpose.** A reader finds a thing by what it is.

Files move with `git mv` so history follows. Two commits: the splits, then the moves.

**The splits**, each along a seam the file already has:

| File | Becomes |
| --- | --- |
| `chooser.ts` | `choosers/chooser.ts` (`chooser`, `chooserOf`, `watching`, `searching`, `FOE_HOLDING`), `choosers/space.ts` (`space`, `Searched`, `Pair`, `Reach`), `choosers/search.ts` (`search`, `again`), `choosers/tree-search.ts` (`treeSearch`, `warmStart`), `choosers/replies.ts` (`repliedSearch`, `AGAINST`, `DIRECTIONS`), `choosers/leaves.ts` (`LEAVES`, `fittedLeaf`), `choosers/parts.ts` (`OptionChooserPart`, the three parts, their configs and editor fields) |
| `percepts.ts` | `situation/percepts.ts` (`PERCEPTS`, `perceiver`, `Cues`' implementation), `situation/reach-memory.ts` (`reachMemory`, `graceAt`, `inReach`, `threatened`), `predictions/exchange/pressure.ts` (`ProfilePressure`, `pressureBy`, `pooled`, `startOf`), `predictions/exchange/profile.ts` (`profileExchange`, the strike models, `measuredReach`) |
| `kinds.ts` | `options/strike-kinds.ts` (`strikeKind` and the seven strikes), `options/kinds.ts` (the rest and `optionsOf`) |
| `option.ts` | `situation/imagined.ts` (`placed`, `placing`, `placedWith`), `options/readiness.ts` (`standing`, `still`, `asking`, `READY`, `blocked`), `options/outcomes.ts` (`along`, `exitOutcomes`) |
| `value.ts` | `options/outcomes.ts` (`upOrDown`, `AS_IS`, `UNMOVED`, `STILL`, `CLINCH`, `clinched`), `predictions/damage.ts` (`blowLife`, `limbReach`), `choosers/obedience.ts` (`OBEDIENCE`, `STEADY`, `FIRST`), `RETHINK` to `choosers/chooser.ts` |
| `objective.ts` | `choosers/objectives.ts` (the two objective parts) |

**The moves**: `mind.ts` to `assembly/controller.ts` (its `optionMind` renamed
`optionController`, so the name is the class's alone), `build.ts`, `config.ts`, `description.ts`,
`skills.ts`, `pace.ts`, `gait-learning.ts`, `profile-learning.ts` to `assembly/`; `situation.ts`
to `situation/reader.ts`, `record.ts`, `rise-memory.ts` to `situation/`; `strike.ts`, `walk.ts`,
`places.ts`, `rest.ts`, `cover.ts`, `cover-hand.ts`, `back-step.ts`, `orders.ts`, `rise.ts`,
`limbs.ts`, `selection.ts` to `options/`; `predictions-part.ts` to `predictions/part.ts`,
`pressure.ts` to `predictions/exchange/pressure-table.ts`, `fitted-value.ts`, `boosted-trees.ts`
to `predictions/value/`, `by-hand.ts` and `data/` to `predictions/`.

**Consequences.**

- **Importers outside the folder** (about fifty, by `grep -rn "minds/option/" src research
  scripts tests`): each is repointed, as the checks say of research scripts.
- **The two research hooks** resolve `chooser.ts` by the end of its URL and rewrite it by a
  regular expression, and throw where their anchor is missing:
  `research/minds/fitted-value-hook.mjs` on `const at = space(root, searched), leafAt = ...`
  (`chooser.ts:566`) and `research/minds/move-prior-hook.mjs` on `started.keep(edges);`. Both
  anchors are in `treeSearch`: the hooks are repointed to `choosers/tree-search.ts`, and each is
  run once on one bout.
- **`scripts/source-boundary.mjs`**: `PUBLISHED` keeps `src/minds/option/index.ts`, and the
  folder's rank covers its subfolders. `tests/core-boundary.test.mjs` names no Option Mind path.
- **Documents**: every document naming a moved file is corrected in the same commit
  (`node --test tests/documents.test.mjs` holds the links), the measured Mind plan and
  [the testbed's rest](2026-11-18-testbed-rest.md) among them.

**Done when** the checks pass, the fingerprint compares clean, `src/minds/option/` holds two
files and six folders, and no file of `contract/` imports from outside `contract/` within the
folder (`grep -rn "from \"\.\./" src/minds/option/contract` shows only paths that leave
`src/minds/option/`).

## Chunk 5: the relay, and the documents

**Purpose.** "Anything a Mind keeps outside `state` is a cache" is held by a tool that refuses.

1. **`node scripts/fingerprint.mjs --relay <steps>`**: each arena fight is also played as a relay.
   Every `<steps>` steps the bout is saved (`duel.save()`), a fresh bout of the same recipe is
   built (`buildBout`) and loads it (`duel.load`), and play goes on in the fresh one, whose Minds
   are new. At the fight's end the relay's whole save must digest as the straight play's does
   (the fingerprint's own digest of a saved state, `stateDigest`), and the command fails naming the case. A
   pose trace follows one bout's bodies (`traceOf`), so the relay compares saves and not traces.
   It is a mode of the fingerprint and no test ([the test rules](../../tests/README.md): a new
   test reproduces an observed regression).
2. **What it holds, and what it does not.** A fresh bout drops everything a Mind keeps in its
   own fields and closures. It does not drop a module's maps (`PRIORS`, `POOLS`, `REACHES` and
   their like, eleven on 2026-11-25), which outlive a bout. Those are listed once, by
   `grep -rnE "^const [A-Z_]+.*new (Weak)?Map" src/minds/option`, and each is read: one keyed
   by a value that never changes (a spec, a data table, a frozen config) stays, its comment
   saying it is a cache; one keyed otherwise moves into the Mind.
3. It is run at 120 steps on every arena case. A case that differs has memory outside `state`:
   it is moved into `state` and the case named in the commit.
4. **[The architecture](../architecture.md)** is corrected: its "Option Mind" section says the
   five ideas and the six folders, and its "Adding an entrant" step 4 stands as it is.
   **[The code recipe](../recipes/code.md)** gains the three kinds of memory and the relay
   beside its checks; `AGENTS.md`'s "Checks by change" names `--relay` for a change to what a
   Mind remembers.
5. This plan is deleted, with what worked in those two documents.

**Done when** the relay compares clean on every arena case and the documents' test passes.

## Not settled by reading

Each is settled by the chunk that meets it, with the tool named.

- **Whether the "Profiles" detail reads anything an Option's step writes** (2b). The class
  keeps today's order, details after steps, so nothing rests on it.
- **Whether a relay equals a straight play today on every arena case** (5).
  `tests/minds/contract.test.mjs:211` shows it for two men under Option Minds over 180 steps;
  other bodies and Commanders were not read. A case that differs before chunk 2 is a finding
  about today's code, reported as one and fixed where the memory lies.
- **What a fresh bout every 120 steps costs** on every arena case (5). If the whole fingerprint
  under `--relay` takes over ten minutes, `--only` picks one fight a body and the plan's bar is
  those.
- **Whether 3a's class moves what a body allocates a step.** The harness says; a rise is
  reworked before the chunk lands (what must not move).

## What this plan does not do

- **A calling convention with no garbage.** Output parameters and pooled records were weighed
  and left: the interfaces are settled by meaning first, and allocation is held where it is.
  [The step cost](../reference/step-cost.md) drops a rewrite that saves allocation and runs
  slower, so that work wants a timing in hand.
- **A prediction of a foe never met**, the measured strike profiles read across bodies, and
  which predictions the game defaults to. Those are the measured Mind plan's.
- **The action prior.** Its interface is declared with its first reader, by the measured Mind
  plan.

## Beside the measured Mind plan

That plan's rules 3 and 6 ("every reading says where it came from", "every term of a price says
where it came from") are held there by an inventory script and a registry. After 3c a by-hand
number has one file and one interface, and a Mind's config says whether it is built with them,
so most of that tooling reads `by-hand.ts` and a config. Its mechanisms keep their order; each
lands as a kind behind `Option.model` or an interface of `contract/predictors.ts`, by its own
procedure. Its steps that name files in `src/minds/option/` are repointed by chunk 4.
