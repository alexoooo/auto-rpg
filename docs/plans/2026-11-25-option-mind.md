# The Option Mind is a Mind: one contract, two classes, predictions behind interfaces

**Begun 2026-11-25, by the owner's order** ("ok, yes i want to refactor the code along these
lines. please write a plan."), after a discussion of why
[the measured Mind plan](2026-11-25-measured-mind.md) keeps needing audit tools: the code has no
place where a prediction, or the Mind itself, is stated.

This is a refactor. Every chunk leaves every fingerprint line as it was. No existing config
changes shape or meaning; 3d adds one kind of predictions and one preset to pick.

Two fresh agents, each given this plan and the code and not the session that wrote it, tried to
refute it on 2026-11-25: the first the whole plan, the second the sections rewritten in answer.
What they found wrong is corrected below; what reading could not settle is listed under "Not
settled by reading". The two classes of chunk 2 and the move of `choice.ts` were written after
both, in answer to the owner, and have had no such reader yet: the reader of chunks 1 and 2
is their first.

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
of source files, it's difficult to review". Of the first draft of this plan: "for the OptionMind
making use of CommandLayers, is there a cleaner separation that we can do by using an abstract
class (or something else)?" and "i noticed src/minds/choice.ts -- does that belong in
minds/option/?". Standing: "I always want everything to be just a skill. I don't want any ad-hoc
hard-coded hacks."

## What was wrong at the start

Each line was read in the code on 2026-11-25 at `878c17a24`, and cites the code as it was then.
Put right so far: 5, 6 and 10 (chunk 1); 1, 3 and 4 (2b); 2 (2b and 2c); 7 in part (3a: the
exchange is one interface; a pressure and a line's end follow in 3b and 3c).

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
6. **Half of `Option` is declared outside the folder, as a generic with one use.**
   `Option extends Choice<Situation>` (`option.ts:66`): its entry, its status, what it claims and
   its targets are in `src/minds/choice.ts`, which is generic over a situation, terms and a
   choice and is used once (`Chooser = Selection<Situation, OfferTerms, Option>`,
   `chooser.ts:49`). Seven Option Mind files import it; outside them `engagement.ts` reads one
   type (`Priced`), and `src/minds/index.ts` re-exports four names nobody imports.
7. **Predictions are spread over the reader, the imagined state and the search.** Six named
   readings (`PREDICTIONS`, `percepts.ts:707`) are a closed literal whose tables ride on what the
   reader sees (`Seen.strikes`, `Seen.measured`, `Seen.others`); one of the six can be swapped
   (`OthersModel`, `percepts.ts:359`). The foe keeping his velocity is `carried` inside
   `placedWith` (`option.ts`). The foe's reply is `replyOf` (`chooser.ts:697`). The fitted value
   is read by `fittedLeaf` (`chooser.ts:409`).
8. **By-hand numbers are branches inside the measured code.** `strike.ts:215` prices
   `measured ?? priorOf(at)`, and `:218` and `:327` branch the same way; `rise.ts:169` prices a
   way up `measured(from) ?? { ...prior }`. The foe's pressure prices a limb with no fresh
   profile by `prior` at `RATE` (`percepts.ts:309`), and a blow coming from an unmodelled limb at
   `LANDS` (`:593`). `PRIOR_PREDICTIONS` is the measured model given empty tables, so "by hand"
   has no code of its own to point at.
9. **36 files and a `data/` folder of 3, 5,781 lines, one flat folder.** `chooser.ts` (930) holds
   three choosers, two searches, the reply search and the editor fields; `percepts.ts` (842) the
   percepts, the foe's pressure, reach memory and the prediction registry; `kinds.ts` (389) every
   kind's registration.
10. **`Situation.perceive` and `Situation.predict`, and the part roles `profile-percept` and
    `profile-prediction` behind them, have no caller and no registered part** in `src`,
    `research`, `scripts` or `tests`.

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

### Two classes: a Mind that commands a body, and the Option Mind

Running a body through the command layers is a protocol with an order: read the senses, queue
what was decided, wait out the reaction time, turn the decision now due into a command, let the
motor write the muscles. That protocol is not about Options, and a scripted body follows it too.
So it is written once, in an abstract class in `src/minds/commanding-mind.ts`, and the Option
Mind says only what is its own. Tests import `src/` with Node's type stripping, which has no
parameter properties ([the test rules](../../tests/README.md)), so fields are declared and
assigned; an abstract class with an abstract field and a generic does load and run that way
(tried on Node 24.15, 2026-11-25).

```ts
/** What every commanding Mind remembers: its command layers' memory, and whether its body is away from it. */
export interface Commanding { readonly layers: object; idle: boolean }

/**
 * A Mind that runs its body through the command layers. Each step it reads the body's senses
 * into the layers and queues what it decides; when a decision comes due, after the body's
 * reaction time, it turns the decision into a body command and has the motor carry it out.
 * A subclass says what it decides, how a decision becomes a command, and what it lets go of
 * when its body is taken from it.
 */
export abstract class CommandingMind<D> implements Mind {
  protected readonly layers: CommandLayers;
  abstract readonly state: Commanding;

  /** A subclass's fields are not yet set while this runs, so it calls none of the three methods below. */
  constructor(layers: CommandLayers) { this.layers = layers; }

  think(senses: Senses): void {
    const { layers, state } = this;
    layers.look(senses);
    if (state.idle) { layers.resume(); state.idle = false; }
    layers.decided(this.decide(layers.view, layers.body.dt));
  }

  act(control: BodyControl): void {
    const { layers } = this;
    layers.observe(control);
    if (this.state.idle) return;
    const due = layers.take(control) as D | null;
    layers.apply(due === null ? null : this.carry(layers.view, due, layers.body.dt), control);
  }

  interrupt(): void {
    if (this.state.idle) return;
    this.released(this.layers.view, "idle");
    this.layers.release("idle");
    this.state.idle = true;
  }

  /** What it wants as of this step. Null keeps the command its body already has. */
  protected abstract decide(view: BodyView, dt: number): D | null;
  /** The body command that carries out a decision now due. */
  protected abstract carry(view: BodyView, decision: D, dt: number): BodyCommand | null;
  /** Its body is being taken from it: let go of what it holds. */
  protected abstract released(view: BodyView, reason: "idle" | "takeover"): void;
}
```

`src/minds/option/option-mind.ts` then holds Option ideas only:

```ts
/**
 * An Option Mind. Each decision it reads its situation, chooses among its Options by what they
 * are predicted to bring, and asks its skills to carry out what the chosen Options ask.
 */
export class OptionMind extends CommandingMind<Intent> {
  // The parts it is made of. None is replaced after the Mind is built.
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
    super(parts.layers);
    // One assignment a field, and `state` gathered from the parts' own memories.
  }

  /** Asked every step it has its body. It chooses anew only when its pace says a decision is due. */
  protected decide(view: BodyView, dt: number): Intent | null {
    if (view.resumed) this.skills.resume(view);
    const since = this.pace.since(view, dt, lastEnded(this.skills.report.ledger));
    if (since !== null) this.state.asked = this.choose(since);
    return this.state.asked;
  }

  protected carry(view: BodyView, intent: Intent, dt: number): BodyCommand {
    return this.skills.command(view, intent, dt);
  }

  protected released(view: BodyView, reason: "idle" | "takeover"): void {
    this.skills.release(view, reason);
  }

  /** One decision: what I know, what I do, and what that asks of the skills. */
  private choose(dt: number): Intent {
    const said = this.state.said;
    const read = this.reader.read(this.sight);
    said.foe = read.phase;
    let priced: readonly Situation[] = NONE;
    const chosen = this.chooser.decide(read, () => priced = this.reader.others());
    if (chosen.fresh) said.prospects = this.prospectsAt(read, priced);
    this.reader.keep(chosen.at);
    const intent = intentOfSet(chosen.set.map((option) => ({ claims: option.claims, ...option.step(chosen.at, dt) })),
      () => ({ move: null, face: this.facing(chosen.at) }));
    said.details = this.detailsAt(chosen.at);
    return intent;
  }
}
```

`choose` is the decision the predictions part's object held before 2b, line for line: the foe's
phase, the choice, the prospects where it was fresh (at `read` and at each situation the chooser
priced, which it fills only when it prices the other foes), the focus kept, the Options' steps,
the two details. `prospectsAt` and `detailsAt` hold `prospect`, `unmetDetail` and
`pricedDetail`. `lastEnded` is the last ended action's sequence. `SituationReader` is what
`situationReader` returns (`state`, `read`, `others`, `keep`), an interface in
`contract/situation.ts`.

**Why this is not the shell it replaces.** The base knows nothing of skills, a pace or Options;
its three hooks are methods the compiler checks, where today a driver object is registered on
the body after the Mind is made; and the Option Mind is the `Mind` its body runs. At run time
the path is nearly today's (think asks for a decision, act carries the one due), which is why
it can move no fight.

**On `interrupt`.** Today the layers clear their queue, then the driver's release runs (the
skills'), then the motor resets. The base lets its subclass go first, then releases the layers.
The skills' release (`src/skills/framework/arbiter.ts:202`) reads the view and its own memory,
neither of which the layers' queue or `released` flag reaches, and the motor resets after it
either way; both reviewers tried to break this and could not.

### Three kinds of memory

A class and a closure can both hide memory, so the class shows which is which by where a field
sits, and one check holds it.

| Kind | Where | Rule |
| --- | --- | --- |
| parts | the `readonly` fields | made once, never replaced |
| memory | `state`, one plain object | saved, loaded, forked (`src/core/state.ts`); `saveState` refuses a function or a getter in it |
| caches | a Mind's fields named as caches in their comment; module maps keyed by a value that never changes (a body's spec, a data table) | dropping one changes no result |

The check is chunk 5's: the fingerprint's fights played as a relay through fresh bouts.

### Memory spread over the parts

The chooser, each Option, the reader, the pace and the skills each remember things, and the
project already has the way to hold that (`src/core/state.ts`): a part's memory is one plain
object, its `state`, which the part makes and owns; a parent's `state` points at its parts'
`state` objects, so all of a bout's memory hangs on one root as a tree. A save copies the tree; a
load writes the saved values back into the same objects, so each part still holds its own and
needs no load method. The Option Mind's constructor is the one place its tree is put together:

```ts
/** Everything an Option Mind remembers. A part's memory is that part's own object, held here by reference. */
export interface OptionMindState extends Commanding {
  /** Its skills' memory. */
  readonly skills: object;
  /** Its reader's: the foe it keeps to, and what it has learned of reach and of rising. */
  readonly situation: object;
  /** The tries its Options have made and how each ended. */
  readonly record: object;
  /** Its chooser's: what is running, and what the last decision weighed. */
  readonly chooser: object;
  /** Each Option's own, in the Options' order. */
  readonly options: readonly object[];
  /** Its aims'. */
  readonly aims: object;
  /** Its pace's: when it last decided, and on what. */
  readonly pace: object;
  /** The intent it last decided, which stands until it decides again. */
  asked: Intent | null;
  /** What it last reported of itself. */
  readonly said: { prospects: readonly Prospect[]; details: EngagementDetail[]; foe: string };
}

    this.state = {
      layers: parts.layers.state, idle: false,
      skills: parts.skills.state, situation: parts.reader.state, record: parts.record.state,
      chooser: parts.chooser.state, options: parts.options.map((option) => option.state),
      aims: parts.aims, pace: parts.pace.state,
      asked: null, said: { prospects: [], details: [], foe: "clear" },
    };
```

Three rules keep it clean, and the contract says the first:

1. **A part that remembers declares `readonly state: object`** in its interface (`Option`,
   `Chooser`, `SituationReader` and `Skills` do today); a part that does not has none. A part's
   state is opaque to its parent: what a chooser remembers is read in the chooser.
2. **A parent points at a part's state and never copies it**, and nothing but the constructor
   above adds to the Mind's tree.
3. **A part reaches its memory through its `state` each time** and keeps no second reference to
   an object inside it: a load may put a new object in a slot (where the saved one is of another
   kind, or the slot held a frozen constant), and a kept reference would then read the old one.

What refuses a breach: `saveState` throws, naming the path, at a function, a getter or a class
instance in the tree; and the relay of chunk 5 fails where a part kept memory in a closure, or
the constructor left a part's state off the tree, since a fresh Mind then plays otherwise.
Scratch a part fills and reads within one decision (the reader's `last`, `situation.ts:105`)
is not memory and stays a local.

### The folder

```
src/minds/option/
  option-mind.ts     the class above
  index.ts           what the folder publishes
  contract/          interfaces only, no cycle, no code
  assembly/          the config, its checks, the controller and the build
  situation/         what the body reads each step, and the imagined states
  options/           each kind of Option
  choosers/          the choosers, the selection among claims, the searches, the objectives
  predictions/       the predictor implementations, their data, the numbers set by hand
```

## Decisions the owner may want to reverse

Each is one commit's worth and is reversed by editing that chunk before it runs.

1. **An abstract class under the Option Mind** (the owner's question). The other way is the
   Option Mind holding the layers and calling their steps itself: `think` and `act` are then in
   `option-mind.ts`, and the same six calls are written again in the scripted body's seat.
2. **`choice.ts` loses its generics** as it moves in (the owner's question). The other way moves
   it as it is; `Option` then still inherits half its members from a generic `Choice<S>`.
3. **The `measured` kind keeps its by-hand fallbacks, and a kind without them is added beside
   it**, where the discussion first proposed removing them (3d says why).
4. **`Pressure` becomes an interface with methods** (3b). The other way writes its record out in
   the contract as it is; any other predictor must then answer in profile readings.

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
  between two runs is reworked before it lands. The spread is read with the chunk: several runs
  on a copy of the tree from before it and several on the tree, back to back (2c found one
  reading in ten or so far out, and the rest within about 9 KiB).
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

A chunk that changes what a config resolves to, or moves a file the pages import (2b, 3d, 4), is
also opened headless at the Arena with the mind editor open, on `npm run preview` at a port that
is not 5180, the server killed by PID after.

**Research scripts are not type-checked.** A chunk that moves a file or a state path greps
`research`, `scripts` and `tests` for it, repoints each hit, and loads each repointed script once
(`node --check`); a script that reads a path of the Mind's state is run once on one bout, since
a wrong path there reads `undefined` and says nothing.

**A grep is an aid and not a bar.** Where a chunk's end can be held by the type checker it is;
where it cannot, the chunk's reader is told what to look for.

**The reader of each chunk.** No chunk waits on the owner. Before a chunk is committed, a fresh
agent is given the diff, this plan's section for the chunk and the code, not the session that
wrote it, and is told to refute two claims: "this chunk moved no behaviour" and "this chunk left
no second path beside the new one". What it finds, and what was done about each finding, goes in
the commit message. The owner can read `contract/` after chunk 1 and the two classes after
chunk 2 whenever they choose; a change they ask for then is an edit to an interface with its
implementations already behind it.

## Chunk 1: the contract (landed)

`src/minds/option/contract/` holds the Mind's interfaces and nothing else, importing one way
(`terms` <- `situation` <- `option` <- `objective`, `chooser`, `parts`):

| File | Holds |
| --- | --- |
| `contract/terms.ts` | `Ground`, `Leaves`, `Outcome`, `Terms`, `Ask` |
| `contract/situation.ts` | `Situation`, `Percepts`, `Predictions`, `Cues`, `Pressure`, `ReachMemory`, `Bearing`, `ModelledStrike` |
| `contract/option.ts` | `Option` whole, `Status`, `Step`, `Asked`, `Site`, `Sites` |
| `contract/objective.ts` | `Objective`, `Tally`, `Path`, `Obedience`, `ObedienceLevel` |
| `contract/chooser.ts` | `Chooser`, `Chosen` |
| `contract/parts.ts` | `OptionPart`, `OptionBody`, `NamedSkills`, `ChooserPart`, `ObjectivePart`, `PredictionsPart`, the four config registries and their `declare module` |

`src/minds/choice.ts` is `src/minds/option/select-set.ts`, over `Situation`, `Offer` and
`Option`; `Offer` is written out in `src/minds/engagement.ts`. The functions the old files held
stay in them (`option.ts`, `value.ts`, `percepts.ts`, `objective.ts`, `chooser.ts`) until
chunk 4 moves them.

**The rule for a type the contract names and does not hold**, which later chunks keep: a
contract file imports types from below the Option Mind (`src/core`, `src/control`,
`src/skills`, `src/minds/*.ts`) and from `contract/`. A type it needs from the rest of the
folder is moved into `contract/`, written out as an interface where it is a `ReturnType`, when
the file that holds it imports the contract; else it is imported as a type.

**Left for the chunk that first names them in the contract:** `Walker` and `OptionRecord`
moved in 2b with `OptionContext`, which names them (`contract/context.ts`); `RiseMemory` (`rise-memory.ts`) moves only if a contract file comes to name it (none does:
3a's `Seen` stays outside). `PressureTable` (`pressure.ts`) is imported until 3b narrows
`Pressure`.

## Chunk 2: the Option Mind is a `Mind`

Three commits, each green, all landed.

### 2a: the command layers say their steps (landed)

**Purpose.** A Mind that owns its layers can call them a step at a time. The driver's path is
rewritten through the same three steps, so they have a caller from this commit.

In `src/minds/motor-layers.ts`, `think` and `act` are:

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

`CommandLayers` declares the three and returns them beside `look` and `observe` (2b, whose
`CommandingMind` is their first caller from outside).

### 2b: the two classes (landed)

**Purpose.** `OptionMind` is the `Mind` its body runs. The loop left the predictions part.

What is there now:

- **`src/minds/commanding-mind.ts`**: the abstract `CommandingMind<D>` above, with the Option
  Mind its first subclass.
- **`src/minds/option/pace.ts`**: `Pace`, when an Option Mind decides again, its memory in
  `state`; and `everyOf`. The intent held between decisions is the Mind's
  (`OptionMindState.asked`).
- **`src/minds/option/option-mind.ts`**: the class, `OptionMindState` and `OptionMindParts`. It
  makes its own sight from its layers' body and its skills. `pricedDetail`, `prospect` and
  `unmetDetail` are here.
- **`src/minds/option/build.ts`**: `buildOptionMind(host, config): MindMade` makes everything
  inside the one `host.take`, in the order it was made before (layers, first look, ground skills,
  aims, skills, predictors, Options, reader, chooser).
- **`contract/predictors.ts`**: `Predictors`, which `PredictionsPart.make(config)` returns and
  nothing else. `OthersModel` is imported there as a type from `percepts.ts` until 3a gives the
  exchange its interface.
- **`contract/context.ts`**: `OptionContext` (what an Option kind is made from), with `Walker`,
  `Walk`, `WalkStart`, `OptionRecord` and `Tried`, which it names. They are in a file of their
  own and not in `contract/parts.ts`, which would otherwise import half the folder.
- **`contract/situation.ts`** gained `SituationReader`.
- **`"profiles/1"` is gone**: `PROFILE_MODEL`, the `model` field of every part, the three checks,
  `profile-model.ts`, `model.ts` and `profile-contract.ts`. `ProfileOptionPart` folded into
  `OptionPart` (with `recovery`). `ChooserPart` and `ObjectivePart` lost their generics too,
  and `OptionChooserPart` with them: each was there only to be cast away.
  `optionMindFaults(config)` takes no parts, having no protocol to look up.
- **`src/minds/decider.ts`** holds `Script` (an interface, `Decider` folded into it), `Sight`
  and `sightOf`. `driveBy`, `Driven` and the old `Pace` are gone. The three callers that
  stand a stock body call `body.drive(standingDriver(skills), skills.release)`
  (`src/app/standing-skills.ts`).
- **The saved state has another shape**: an Option Mind's is `{ layers, idle, skills, situation,
  record, chooser, options, aims, pace, asked, said }`, the one object at the body's
  `state.mind` and at `minded.state.mind`. The research scripts that read it by path are
  repointed (`.layers.motor`, `.record`, `.options`).

**Read on landing** (2026-11-25): the fingerprint names a state difference on each of the 70
cases that keep a state digest and moves no pose on any of the 299. Allocation, KiB a body a
step: `option-lean` 474.29 and 476.51 (480.56 and 478.93 before), `option-tail` 543.72 and
539.65 (539.94 and 542.38 before). The Arena was opened headless on a preview server with both
mind editors open and its minds apart on the browser's workers (the page is cross-origin
isolated): the bout stepped, the Choices panels filled and the page raised no error.
`research/skills/recovery/implementations/staged/rise-trace.mjs` fails as it did before this
chunk (`action.stage` is undefined at its `traceFall`), which is not this plan's to fix.

### 2c: the scripted Mind is the second subclass (landed)

**Purpose.** A registered driver exists only on a scripted body's Mind. The command layers are a
tool with steps and no seat, and no `drive` reaches a body under an Option Mind.

What is there now:

- **`src/minds/scripted-mind.ts`** (was `sub-mind.ts`): `ScriptedMind extends
  CommandingMind<unknown>` in place of `hosting`. Its `drive` is the layers' old one. Its state
  is `{ layers, idle, driver, has, subs }`; while anyone but its driver has the body, `idle` is
  true and `has` says who. Sub-minds are its own: it overrides `think`, `act` and `interrupt`
  to decide who has the body before the base's turn. `SplitDriver`, the driver type and `Drive`
  live here. `commandedMind` returns the construction with `body` and `drive`.
- **`src/minds/commanding-mind.ts`**: `think`, `act` and `interrupt` are each one line over a
  protected step (`thinks`, `acts`, `gives`), which the scripted Mind calls.
- **`src/minds/motor-layers.ts`**: `CommandLayers<D>` is the layers' one type and is no `Mind`.
  It carries what its Mind decides, so the base class casts nothing. The driver, `drive`,
  `think`, `act`, `interrupt` and `LayersMind` are gone; `forget` drops the queue alone;
  `release` takes no reason, which only the driver's callback read.
- **`src/control/body.ts`**: `Body` has no `drive`.
- **`src/minds/seat/`**: `CommandedBody` is a body under any commanding Mind (`view`,
  `envelope`, `afterPhysics`, `commanded`); `HostedBody` is a `CommandedBody` with `drive`,
  which `commandedBody` adds from its construction (`seated` and `commandedOver` in place of
  `takeBody`, no cast). The Lab's and the evaluations' readers take a `CommandedBody`.
- A scripted body's saved state reads `state.mind.layers` where it read `.host`
  (`research/skills/locomotion/stance/stance-trials.mjs`).

On a release a scripted driver's callback now runs before the layers drop their queue, as the
Option Mind's does since 2b. The one callback handed to `drive` anywhere is `skills.release`,
which reads the view and its own memory.

**Read on landing** (2026-11-25): the fingerprint moves no pose on any of the 299 cases and
names the same 70 state differences as 2b. Allocation is not moved by chunk 2: `option-tail`
read 542.9 and 544.2 KiB a body a step beside 544.9, 543.5, 536.2 and 543.7 on a copy of the
tree from before 2b, run back to back; `option-lean` 480.4 and 478.6. One reading in ten or so
lands far out (563.0 once), so the spread of this harness is nearer 9 KiB than 2.

## Chunk 3: predictions behind interfaces

Four commits.

### 3a: the exchange (landed)

**Purpose.** What the body predicts of the fight between it and its foe, beyond what its own
Options model, is asked of one interface that a config can swap whole.

What is there now:

- **`contract/predictors.ts`**: `ExchangePredictor` with eight members. Six are a situation's
  predictions, each read of what the reader sees (`danger`, `pressure`, `pressing`,
  `downRate`, `turns`, `blows`). Two are asked by a search of a state already read: `later`
  (the foe some seconds on) and `reply` (the move the foe answers a line with, a `FoeMove`).
  `Predictors` holds `outcomes`, `walkStart` and `exchange(given)`, which makes the predictor
  from the body's own modelled strikes once its Options are made.
- **`contract/situation.ts`**: `Seen` is what a predictor reads: the sight, the spec, the two
  rates, the delay, the rules, the focus and the blow coming. It carries no table.
- **`percepts.ts`**: the class `ProfileExchange` is the old `PREDICTIONS` literal made an object,
  built with `ProfileTables` (the body's own strikes, every striker's measured strikes, and the
  pressure tables or null). `OthersModel`, `RATE_OTHERS` and `measuredOthers` are gone: null
  tables read the strikes' rate alone, and `danger` is 0 where a measured table reads.
  `carried` and `replyOf` moved here as its `later` and `reply`, and the strike models that
  read the tables are its private methods. `perceiver(exchange)` reads each prediction from the
  predictor, lazily, once a situation, through a binding that ties each member's answer to its
  prediction's type. `ReaderSeen` extends `Seen`
  with what the percepts alone read (orders, ward, the two memories).
- **The search**: `ChooserPart.make` is given `exchange`, the two searching parts put it in
  `Searched`, `placing(exchange, carry)` asks `later` for `Math.min(seconds, carry)`, and
  `repliedSearch` asks `reply`. `placed` hands the foe on unmoved and asks nothing.
  `chooserOf` takes what the part is made with as one object.

Not as first written: `Seen` keeps the body's constants, as step 1 said, so the predictor is
given its tables and the body's own strikes alone and not the constants a second time. The
profile predictor is a class and not a function returning a literal: its helpers read the tables
as a field, where a function's would each have taken them as a fourth argument.

**Read on landing** (2026-11-25): the fingerprint moves no pose on any of the 299 cases.
Allocation is not moved: `option-lean` 476.4, 479.5 and 474.1 KiB a body a step,
`option-tail` 539.3, 544.0 and 541.0.

### 3b: a pressure is asked, not taken apart

**Purpose.** Today a `Pressure` is a record of one implementation's fields, read by free
functions that the search, the imagined state and three Options call (`chooser.ts:564`,
`option.ts:159`, `places.ts:60`, `:83`, `rest.ts`), so no other predictor could answer with its
own. The contract's `Pressure` becomes what is asked of one:

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

**Steps.**

1. **`ProfilePressure` is a class** in the implementation's file, its fields today's (`model`,
   `phase`, `struck`, `stance`, `rateAt`, `measured`), its methods today's `dealtAt`, `edgeOf`,
   `stancedPressure` and `cachedPressure`. Methods sit on the prototype, so a pressure allocates
   no closure it does not allocate today.
2. **Every place a pressure is made or copied makes a `ProfilePressure` by its constructor.** A
   spread of a class instance copies its fields and drops its methods, and there are seven such
   places in `percepts.ts`: the literals `NO_PRESSURE` (`:292`) and `pressureBy`'s (`:312`), and
   the spreads at `:348`, `:381`, `:395`, `:442` (the whole of `cachedPressure`) and `:479` (the
   whole of `stancedPressure`). The last two are not moved unchanged: each builds its copy by
   the constructor with the one field changed.
3. **Inside the implementation's file a pressure is typed `ProfilePressure`, never `Pressure`.**
   The type checker then refuses a spread assigned where a pressure is wanted (a spread of a
   class has no methods in its type), which it would not of a value typed as the interface.
4. `inReach` and `threatened` read a situation's pressure and stay functions over the
   interface. `contract/situation.ts` then imports nothing from the rest of the folder.

**Done when** the checks pass, the fingerprint compares clean, allocation is read, and the
contract's `Pressure` has no field but the three (the type checker refuses a reader of another
outside the implementation).

### 3c: what a line's end is worth

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
   `Offered` (`fitted-value.ts:47`) and `Followed` (today `Fitted`, `:122`) move to
   `contract/predictors.ts`. `readingAt`, `featuresOf`, `offeredOf`, `FEATURES` and `bodyOf` stay
   exported: `research/minds/fitted-value.mjs` and `move-prior.mjs` fit by them.
2. **`fittedLeaf` (`chooser.ts:409`) keeps only the search's half.** Once a search it reads the
   body's grace at the root first, as now (`graceAt(root)`, `:410`, which writes the reach
   memory), then asks `from(root)` and, with no reader, ends every line as the tail does,
   gathering nothing, as now. With one, at each leaf it gathers the offers, asks the reader, and
   prices the path with what it answers, weighed as now; where the reader answers null the line
   ends by the search's own Options run again (`search.leaf`), as now.
3. **The tree chooser's part makes the predictor it selected**: `leaf: "fitted"` reads
   `dataOf("fitted-value")` and calls `fittedValue`, as its `reads` already declares. The asset is
   1.4 MB, so it stays read only by a config that names it. The check that the data is a fitted
   value, thrown today at each search (`:411`), is thrown where the part makes the predictor.

**Done when** the checks pass, the fingerprint compares clean, and `chooser.ts` imports from
`fitted-value.ts` only `fittedValue`, `bodyOf` and `offeredOf`.

### 3d: by hand has one home, and a kind without the fallbacks

**Purpose.** Every number set by hand that prices something is in one file. Those that stand in
where a measurement is missing are behind one interface, the measured code reaches them only
through it, and a kind of predictions built without them can be picked. This is the place the
measured Mind plan's registry of numbers set by hand (its step 1) reads.

Said plainly, since it differs from what the discussion first proposed: the fallbacks are not
removed from the game's Mind here, and no existing config gains a key. A body facing a foe with
no measured strikes would predict no harm at all and walk in, and how to predict a foe never met
is the measured Mind plan's question. And a key added to the game's configs could orphan their
saved rows (what must not move). So the `measured` kind stays what it is today (the comment at
`predictions-part.ts:34`: "each model its own where fresh, else its prior"), now built as the
measured code given the guesses; and a kind given none is added beside it.

The measured Mind plan's table "What is guessed now, and what replaces it" has two sorts of
hand-set number, and they are treated apart:

- **A fallback** stands beside a measurement and is read where the measurement is missing: a
  strike's prior, a limb's, a coming blow's, a way up's. These are `Guesses`.
- **A number with no measurement to fall from** is read always: the clinch (`CLINCH`,
  `clinched`), the cover (`STOPS`), a blow's speed (`BLOW_SPEED`), where a fall leaves the body
  (`FALLEN`), the brace (`BRACED`). These move to the same file as plain exports under their own
  heading, read where they are read today by every kind. Each waits for its mechanism in the
  measured Mind plan; none is hidden behind an interface that has one answer.

```ts
/**
 * Numbers set by hand that stand in where a measurement is missing. A Mind has them only where
 * its predictions part gives them.
 */
export interface Guesses {
  /** What a strike of the body's is expected to bring from `at`, its chance of ending down with it. */
  strike(at: Situation, strike: GuessedStrike): Expected;
  /** A limb with no profile of its own, as a reading of what it deals a body it can reach. */
  limb(seen: Seen, striker: BodySpec, struck: BodySpec, limb: string, placing: Placing): ProfileReading;
  /** A blow already coming from a limb with no profile of its own, as a reading of what it deals. */
  blow(seen: Seen, blow: NonNullable<Seen["blow"]>, range: number): ProfileReading;
  /** How long a way up, a regain or a brace takes and how often it succeeds, where no drill measured it. */
  way(kind: "way" | "regain" | "settle"): Prior;
}
```

`GuessedStrike` names what the strike's prior reads of it today (`strike.ts:215` to `:234`: its
action, what it throws, its target and the blow's progress); `Placing` is `percepts.ts:299`'s,
exported; `Prior` is `record.ts`'s.

**Steps.**

1. **`by-hand.ts`** (made in the flat folder; chunk 4 moves it) implements `Guesses` with the
   code at each site, whole, so no hand-set number is left at a caller:

   | Member | Today's code |
   | --- | --- |
   | `strike` | `priorOf(at)` (`strike.ts:215`, `:327`) and the clinch read where nothing is measured (`:218`) |
   | `limb` | the `prior(...)` call in `pressureBy` with its `RATE` and its landing rate (`percepts.ts:306` to `:309`), which prices a foe's limb, the body's own unmeasured strike (`pressingOf`) and the down rate alike |
   | `blow` | the `priorOf(...)` call in `lifeOf` with its `LANDS` (`percepts.ts:593`) |
   | `way` | `WAY_PRIOR`, `REGAIN_PRIOR`, `SETTLE_PRIOR` (`rise.ts:30` to `:36`), read at `rise.ts:169` |

   `prior`, `LANDS`, `RATE`, and `PRIOR` with `record` (`value.ts:206`, `:214`) move in as its
   own. `record` stays exported: `tests/skills/profiles.test.mjs:14` reads it and is repointed.
   The always-read numbers named above move in beside them.
2. **`Predictors` gains `readonly guesses: Guesses | null`**, and `OptionContext` and
   `ProfileExchange` are built with it. The measured code reaches a guess only as
   `guesses?.strike(...) ?? null`. With none: a strike with no reading at a state models null
   there and is not offered, its `rate` says nothing of that foe and its `priced` says "not
   measured here"; a limb with no profile adds nothing to a pressure; a blow coming from one is
   no danger; and a way up with no drill from a posture is not offered from it, so a body down
   with no measured way up stays down. Both reviewers looked for a caller that assumes a strike
   model or a pressure and found an empty pressure and a null strike model already handled
   (`NO_PRESSURE`, `strike.ts:314`); the way up was not read (not settled, below).
3. **The two kinds of today are built from it and resolve as before**: `measured` gives the
   guesses with its tables; `prior` gives the guesses with empty tables. Neither config changes.
4. **A kind with no guesses is added**: `measured-only`, "Measured, no fallback", the `measured`
   part's config and tables with `guesses: null`, registered beside the other two
   (`src/app/registration/option-predictions.ts`). The `measured` part's label becomes
   "Measured, by hand where nothing is".
5. **A preset is added**: `option-measured`, "Option Mind, measured only", which is
   `option-lean` (the empty-handed man's default, `src/app/catalog.ts:37`) with
   `predictions.kind: "measured-only"`. It is read once against it
   (`npm run match -- option-lean option-measured`), and the digest goes in the commit message
   and first in the report. It stays pickable whatever it reads; which the game's default should
   be is the measured Mind plan's bar ("the inventory is clean for every body on its default
   config").

**Consequences.**

- **Where it is picked.** The kind is in the mind editor's predictions menu on any Mind. The
  preset joins the Crypt's and the Lab's menus and the evaluations' entrants by enumeration; the
  Arena's menu lists the game's own minds and one a link names (`arena/main.ts:348`), so there
  it is reached by link or by the editor, as `option-truer` is.
- The fingerprint and `tests/core-step-cost.test.mjs:34` play every mind, so each gains the new
  preset's case and moves no other.
- `option-drill` is unchanged: it is the `prior` kind.

**Done when** the checks pass, the fingerprint compares clean on every existing case,
`option-measured` plays its match to the end, the Arena opens headless with it picked, and the
chunk's reader, told to find a number set by hand outside `by-hand.ts` that prices something,
finds none that the measured Mind plan does not sort as a preference or as the Mind's own.

## Chunk 4: one idea a file, six folders

**Purpose.** A reader finds a thing by what it is.

Files move with `git mv` so history follows. Two commits: the splits, then the moves.

**The splits**, each along a seam the file already has:

| File | Becomes |
| --- | --- |
| `chooser.ts` | `choosers/chooser.ts` (`chooser`, `chooserOf`, `watching`, `searching`, `FOE_HOLDING`), `choosers/space.ts` (`space`, `Searched`, `Pair`, `Reach`), `choosers/search.ts` (`search`, `again`), `choosers/tree-search.ts` (`treeSearch`, `warmStart`), `choosers/replies.ts` (`repliedSearch`, `AGAINST`, `DIRECTIONS`), `choosers/leaves.ts` (`LEAVES`, `fittedLeaf`), `choosers/parts.ts` (`OptionChooserPart`, the three parts, their configs and editor fields) |
| `select-set.ts` | `choosers/select-set.ts` (`selectSet` and its argument types), `options/readiness.ts` (`onOffer`, `NOTHING`, `WHOLE`) |
| `percepts.ts` | `situation/percepts.ts` (`PERCEPTS`, `perceiver`, `Cues`' implementation), `situation/reach-memory.ts` (`reachMemory`, `graceAt`, `inReach`, `threatened`), `predictions/exchange/pressure.ts` (`ProfilePressure`, `pressureBy`, `pooled`, `startOf`), `predictions/exchange/profile.ts` (`ProfileExchange`, `measuredReach`) |
| `kinds.ts` | `options/strike-kinds.ts` (`strikeKind` and the seven strikes), `options/kinds.ts` (the rest and `optionsOf`) |
| `option.ts` | `situation/imagined.ts` (`placed`, `placing`, `placedWith`), `options/readiness.ts` (`standing`, `still`, `asking`, `READY`, `blocked`), `options/outcomes.ts` (`along`, `exitOutcomes`) |
| `value.ts` | `options/outcomes.ts` (`upOrDown`, `AS_IS`, `UNMOVED`, `STILL`), `predictions/damage.ts` (`blowLife`, `limbReach`), `choosers/obedience.ts` (`OBEDIENCE`, `STEADY`, `FIRST`), `RETHINK` to `choosers/chooser.ts` |
| `objective.ts` | `choosers/objectives.ts` (the two objective parts) |

**The moves**: `mind.ts` to `assembly/controller.ts` (its `optionMind` renamed
`optionController`, so the name is the class's alone), `build.ts`, `config.ts`, `description.ts`,
`skills.ts`, `pace.ts`, `gait-learning.ts`, `profile-learning.ts` to `assembly/`; `situation.ts`
to `situation/reader.ts`, `record.ts`, `rise-memory.ts` to `situation/`; `strike.ts`, `walk.ts`,
`places.ts`, `rest.ts`, `cover.ts`, `cover-hand.ts`, `back-step.ts`, `orders.ts`, `rise.ts`,
`limbs.ts`, `selection.ts` to `options/`; `predictions-part.ts` to `predictions/part.ts`, `pressure.ts` to
`predictions/exchange/pressure-table.ts`, `fitted-value.ts`, `boosted-trees.ts` to
`predictions/value/`, `by-hand.ts` and `data/` to `predictions/`.

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
files and six folders, and no file of `contract/` imports from the rest of the folder (read off
its import lines: each path leaves `src/minds/option/` or stays in `contract/`).

## Chunk 5: the relay, and the documents

**Purpose.** "Anything a Mind keeps outside `state` is a cache" is held by a tool that refuses.

1. **`node scripts/fingerprint.mjs --relay <steps>`**: each arena fight is also played as a relay.
   Every `<steps>` steps the bout is saved (`duel.save()`), a fresh bout of the same recipe is
   built (`buildBout`) and loads it (`duel.load`), and play goes on in the fresh one, whose Minds
   are new. At the fight's end the relay's whole save must be deeply equal to the straight
   play's (`isDeepStrictEqual`, `node:util`), and the command fails naming the case. It does not
   compare digests: the fingerprint's digest of a state (`stateDigest`) also encodes which slots
   share one object, and a load puts a copy where a frozen constant was (`src/core/state.ts`), so
   two equal saves can digest apart. Nor traces: a pose trace follows one bout's bodies. It is a
   mode of the fingerprint and no test ([the test rules](../../tests/README.md): a new test
   reproduces an observed regression).
2. **What it holds, and what it does not.**
   - A fresh bout drops everything a Mind keeps in its own fields and closures. It does not drop
     a module's maps (`PRIORS`, `POOLS`, `REACHES` and their like, eleven on 2026-11-25), which
     outlive a bout. Those are listed once, by
     `grep -rnE "^const [A-Z_]+.*new (Weak)?Map" src/minds/option`, and each is read: one keyed
     by a value that never changes (a spec, a data table, a frozen config) stays, its comment
     saying it is a cache; one keyed otherwise moves into the Mind.
   - It plays the fingerprint's arena fights. The crypt fight, the Lab's run, the stand and the
     table's trials are not built by `buildBout` and are outside it, and with them a Mind's
     path through an interrupt.
3. It is run at 120 steps on every arena case. A case that differs has memory outside `state`
   or a load that does not restore what was saved; the difference is found by comparing the two
   saves, fixed where it lies, and the case named in the commit.
4. **[The architecture](../architecture.md)** is corrected: its "Option Mind" section says the
   five ideas, the two classes and the six folders, and its "Adding an entrant" step 4 stands as
   it is. **[The code recipe](../recipes/code.md)** gains the three kinds of memory and the
   relay beside its checks; `AGENTS.md`'s "Checks by change" names `--relay` for a change to
   what a Mind remembers.
5. This plan is deleted, with what worked in those two documents.

**Done when** the relay compares clean on every arena case and the documents' test passes.

## Not settled by reading

Each is settled by the chunk that meets it, with the tool named.

- **Whether a rise can be left unoffered from a posture** (3d). `rise.ts:169` takes a way as
  given. If a way up cannot model null without reshaping the rise, `way` leaves `Guesses`, its
  three priors join the always-read numbers in `by-hand.ts`, and the commit says so.
- **Whether a relay equals a straight play today on every arena case** (5).
  `tests/minds/contract.test.mjs:211` shows it for two men under Option Minds with a drill
  Commander, one load, 180 steps; other bodies and more loads were not read. A case that differs
  before chunk 2 is a finding about today's code, reported as one and fixed where the memory
  lies.
- **What a fresh bout every 120 steps costs** on every arena case (5). If the whole fingerprint
  under `--relay` takes over ten minutes, `--only` picks one fight a body and the plan's bar is
  those.
- **Whether 3b's class moves what a body allocates a step.** The harness says; a rise is
  reworked before the chunk lands (what must not move).

## What this plan does not do

- **A calling convention with no garbage.** Output parameters and pooled records were weighed
  and left: the interfaces are settled by meaning first, and allocation is held where it is.
  [The step cost](../reference/step-cost.md) drops a rewrite that saves allocation and runs
  slower, so that work wants a timing in hand.
- **A prediction of a foe never met**, the measured strike profiles read across bodies, a
  measurement for any always-read number, and which predictions the game defaults to. Those are
  the measured Mind plan's.
- **The action prior.** Its interface is declared with its first reader, by the measured Mind
  plan.

## Beside the measured Mind plan

That plan's rules 3 and 6 ("every reading says where it came from", "every term of a price says
where it came from") are held there by an inventory script and a registry. After 3d a number set
by hand has one file, a fallback has one interface, and a Mind's config says whether it is built
with the fallbacks, so most of that tooling reads `by-hand.ts` and a config. Its mechanisms keep
their order; each lands as a kind behind `Option.model` or an interface of
`contract/predictors.ts`, by its own procedure. Its steps that name files in
`src/minds/option/` are repointed by chunk 4.
