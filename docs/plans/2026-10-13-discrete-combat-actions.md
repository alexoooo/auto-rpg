# Discrete combat actions and configurable tactics

## Goal

Every attack a fighter makes goes through one protocol, whatever its effector: a hand or a foot,
bare or holding an item. A fighter has a list of named, configured **actions**. Its tactics
choose **whom** to attack (its focus) and **what** to do (an action, an effector and a region of
the target). The tactics start the action as an **instance** with an id. The skills carry the
instance out and report its lifecycle and outcome under that id. Footwork, guarding and evasion
stay continuous; only commitments are discrete.

The shape is the options framework (Sutton, Precup and Singh, 1999):

- an action's readiness is its initiation set;
- its executor's ending is its termination;
- withdrawing the request interrupts it.

A future meta-policy or planner receives the same candidates and ledger. Learning, search and
duration models are not this plan.

Scope:

- Humanoid fighters in the Arena, the Crypt and the Lab.
- The reptile only where `Orders` changes under it.
- Recovery and the sub-minds are outside it, except that a takeover ends instances cleanly.
- Old configurations and links are not kept working.

## Where the code stands

- **Attacks are per-step points.** `Intent.attack` (`src/core/mind/intent.ts`) is a world point,
  asked again every step; the skill latches onto it. Tactics infer an attack's lifecycle by
  watching counters change:
  - `cycles !== state.cycle` in `pathTactics`;
  - `aim.thrown !== thrown` in `recipeTactics`;
  - `report.kick?.foot` in `kickTactics`.
- **Identity is lost early.** `aimedOrders(..., highMark)` (`fighter.ts`) turns an ordered foe into
  a point before the tactics see it. The `given` branch of `pathTactics` then throws a forced
  straight blow with no `targetId`. `Orders.attack` is a bare point: the Arena's aim is where the
  pointer's ray crosses a level plane (`src/arena/orders-input.ts`).
- **Two attack paths.** Blows go through `BlowSkill` and the arbiter's blow slot. Kicks go through
  `KickSkill`, `KickAttack`, `kickTactics`' `during`/`now`/`after` and kick-specific branches of
  `skillSet` (`src/core/skills/arbiter.ts`):
  - a kick that has been asked for but not yet admitted already stops the walk and holds back the
    blow;
  - the kick's stance is laid over the composed command last.
- **Selection lives in the wrong layer.** `chooseSkill` (`src/core/skills/choose.ts`) picks an
  executor inside the skill layer. Its `accepts` is `true` for every option but the path strike.
  It takes a hand's range from its first option, and counts a landed blow on contact with any
  foe.
- **Aims are spread across the tactics**, and depend on tactics-only state:
  - the openings choose a front by `OpeningTuning` and a blocked surface, re-scored every 0.12 s;
  - linear openings score fronts as `straight` and throw `cross` on odd cycles;
  - `recipeTactics` holds its point while it stays within `APPROACH.reach`;
  - Seek and the no-opening fallback aim at segment centres, with prediction;
  - the tracking kick re-picks the nearest leg every step;
  - ground combat throws a latched, downward, unextended blow.
- **Approach has three owners:**
  - the tactics: `seekFoe`, the delta and braking of `pathTactics`, the kick's approach;
  - the recipe strike's own walk-in (`APPROACH`);
  - the straight punch, which walks itself to its stand-off.
- **Six private `nearestFoe` calls**, measured from the head or the centre, with `standing` or
  `standing-first`, decide the foe in `behaviours.ts`, `kick-tactics.ts`, `path-tactics.ts` and
  `recipe-tactics.ts`. Movement and attack can disagree.
- **Contact feedback is partial.** It is on only for a fighter that `readsContact`
  (`fighter.ts`), so a Seek fighter on the recipe strike has none. `EffectorFeedback.contact` is
  the step's strongest contact; the full list (`contacts`) is kept only with `points`.
- **Held items are on the hand.** A held item's shapes are compound shapes of the hand's own
  rigid body (`src/core/build/rigid.ts`), so a club's contacts already arrive on `hand.*`.
- **The Lab counts any contact** of the actor's bodies with a target as an impact
  (`src/lab/attack-mode.ts`).
- **What already exists to build on:**
  - the shared finite strike cycle (`advanceStrike`, `effectorStrike`);
  - contact classification (`contactResponse`, `src/core/control/effector-feedback.ts`);
  - the surface geometry of `src/core/mind/openings.ts`;
  - `StrikeWindow` (`strikes.ts`);
  - Move's ranked rule lists.

## The design

### Vocabulary

| Term | Meaning |
| --- | --- |
| Focus | The sensed body this fighter attacks, or none. Decided once a step, before anything else. |
| Proximity | Any foe near this body. Move's gait rule and the guard's threat read proximity, never the focus. |
| Action | A named entry of the fighter's `actions`: its kind, its settings, the effectors it may use, the regions it aims at and its aim rule. Immutable. |
| Executor | The skill that carries out actions of one kind. Actions with the same kind and executor settings share one. |
| Region | A mark of the target's spec (`high`, `middle`, `legs`), `any`, or one named segment. |
| Candidate | Action × effector × region for the focus, with its readiness and an optional labelled estimate. Plain data. |
| Readiness | `ready`, `position` (the window the target must be brought into) or `blocked` (with a reason). Geometric and pure. |
| Instance | One started request, with an id. It owns its action, effector and target until it ends. |
| Ledger | One record for each ended instance: how it ended and what its effector touched. |
| Footwork | Continuous behaviours on the legs channel. They read the pending candidate's window and are not actions. |

### Targets

```ts
type TargetRef =
  /** What a policy attacks: a sensed body and a region of it; the executor aims. */
  | { readonly kind: "body"; readonly body: string; readonly region: Region }
  /** What a script, a research harness or a test attacks: a world point the producer aims, with the
      body it belongs to where there is one (for attribution and intended contact), and a contact direction. */
  | { readonly kind: "point"; readonly at: Vec3; readonly body?: string; readonly direction?: Vec3 };

type Region = { readonly kind: "mark"; readonly mark: "high" | "middle" | "legs" | "any" }
            | { readonly kind: "segment"; readonly segment: string };
```

- **Point targets are permanent.** Scripts, research harnesses and tests command an exact point
  (`src/lab/blow.ts`, `research/punch-calibration.mjs`, `research/front-kicks.mjs`, ...). Until
  step 3 deletes them, the old tactics also use point targets, carrying exactly what they carry
  today.
- **A policy never emits a point.** The behaviours tactics produce only body targets.
- **A region is a set of segments.** The executor's aim rule may move between the segments of a
  mark while it tracks, as the kick moves between the legs.
- **A body without the mark offers all its segments.**

### Actions and executors

`FighterConfig.blow` and `.kick`, the behaviours' own `strike.blow` and `kick.kick`, and
`choose-blow` are replaced by one list:

```ts
interface FighterConfig { /* ... */ readonly actions: readonly ActionConfig[] }

/** Every kind shares these; its own settings follow (`family`, `armExtension`, its tuning, ...). */
interface ActionBase {
  /** Unique in the list: what requests, the ledger, rules and displays name it by. */
  readonly name: string;
  /** Effector names of the body (`BodySpec.effectors`), validated against the spec. */
  readonly effectors: readonly string[];
  readonly regions: readonly Region["mark"][];
  readonly aim: AimRule;
}

type AimRule =
  | { readonly kind: "centre"; readonly lead: number }
  | { readonly kind: "surface"; readonly tuning: OpeningTuning }
  | { readonly kind: "leg-height"; readonly height: number };
```

Today's kinds become action kinds: `recipe-strike`, `path-strike` (with `family` and
`armExtension`), `driven-strike`, `whole-body-strike`, `straight-punch` and `front-kick`.

- **A path family is a setting of an action.** A hook and a straight are two actions. The six
  families are validated by the path strike's `faults`; no other kind has one.
- **Executor settings and action settings.** Each kind says which of its settings are the
  executor's and which the action's:
  - the path strike's paths and execution are its executor's;
  - family, arm extension and aim are each action's.

  Actions with equal executor settings share one executor, which keeps their common state
  (the path strike's one striking hand, cooldown and overlap). An action's own settings travel
  with each request.
- **Each kind registers as a `Part`** (`src/core/mind/parts.ts`, `catalog.ts`):
  - `fits` is capability: the effectors exist, and the executor supports what the hand holds;
  - `faults` validates settings, and the list's faults include duplicate names;
  - the kind's module makes its executor.
- **Nothing outside an action's own module branches on its kind.** Selectors, behaviours,
  screens and the arbiter see candidates, statuses, claims and the ledger. A research executor is
  compared with another by putting both in the list.
- **Aim rules are the one owner of target geometry.** They are shared functions over the surface
  functions of `openings.ts` and `targets.ts`. An executor calls its action's rule when its
  technique says:
  - every step while it tracks (the straight punch, the kick);
  - once at the start (the path strike latches);
  - held while the point stays within its window (the recipe strike).

  A `surface` rule scores fronts by its tuning and penalises a region this body's ledger
  records as blocked. Its score is the candidate's estimate.
- **No technique taxonomy** is added until a reader needs one.

```ts
interface Executor extends Skill {
  /** Pure: whether `effector` of action `action` could start on `target` now, and if not what would let it. */
  readiness(view: BodyView, action: string, effector: string, target: TargetRef): Readiness;
  /** Called every step in registration order, with the requests addressed to it (possibly none): one claim over its instances. */
  command(view: BodyView, requests: readonly ActionRequest[], around: Around, dt: number): Claim | null;
  readonly live: readonly ActionStatus[];
  /** The stance height its trunk-holding instance asks, as its last command left it. */
  readonly lower: number | null;
  readonly state: object;
}
```

`Around` gains the tactics' walk and stance height (`Intent.move`, `Intent.lower`), which the
recipe strike and the path strike read today.

### The instance protocol

```ts
interface Intent { move; face; guard; lower?; destination?; readonly actions: readonly ActionRequest[] }

interface ActionRequest {
  /** From the body's one counter (`Sight.instance()`, held in the skill set's state): never reused. */
  readonly id: number;
  readonly action: string;
  readonly effector: string;
  readonly target: TargetRef;
}

interface ActionStatus {
  readonly id: number;
  readonly action: string;
  readonly effector: string;
  readonly target: TargetRef;
  /** prepare: withdrawal stops it. commit: withdrawal does not cut it short. release: winding down, holding only `holds`. */
  readonly phase: "prepare" | "commit" | "release";
  /** The executor's own stage, for display (`chamber`, `transfer`, ...). */
  readonly stage: string;
  readonly holds: readonly Resource[];
}
```

The rules, which the skill set enforces:

1. **Start.** A request with a new id starts an instance.
   - It is `refused` at once only if it is invalid, the body or its holdings cannot carry it, or
     its resources are held by another instance. Nothing silently falls back to another action,
     effector or target.
   - Conditions that pass with time do not refuse. These are the executor's startup, cooldown,
     quiet support and settling. The instance waits in `prepare` (stage `admitting`) and may hold
     resources while it waits, as today's kick stops the walk before it begins. Its executor's
     time limits bound the wait.
2. **Continue.** A request listed again continues its instance.
   - Its action, effector, the target's kind and body, and a body target's region may not
     change; a request that changes them throws.
   - A point target's `at` and `direction` may move, since its producer aims.
   - Something new is a new id.
3. **Withdraw.** An id no longer listed is a withdrawal.
   - When the instance stops is the executor's. A stage is `commit` only if withdrawal does not
     cut it short, so a selector reads the truth from `phase`.
   - Withdrawals are handled before starts in the same step.
   - Listing nothing is how a higher-ranked behaviour holds the attack back.
4. **End.** An instance ends as one of:
   - `completed`
   - `cancelled`
   - `refused`
   - `interrupted`: a sub-mind takes the body, or the body is idled by its level (`Mind.idle`).
     This is recorded at that moment, whatever the executor's `releases`.
   - `lost`: a body target is out or no longer sensed before `commit`
   - `stalled`: an executor's own time limit

   The ending says how the instance ended, not whether it hit. An ended id listed again is
   ignored, since a producer reads the report one step late.
5. **Release.** While one instance is in `release`, another may start if their resources are
   disjoint. The shared executor's own rules still apply. This is how combinations overlap.

### Resources and composition

- **Resources** are the body's effector names plus `trunk` and `legs`.
- **Every executor is commanded every step, in registration order**, as every skill is now.
- **The arbiter composes in three passes:**
  1. **Base claims.** Hands, posture, pushes, closed hands and legs asks, in request order; a
     conflict refuses the later start.
  2. **Stance.** The walk or the legs ask of the claim that holds `legs`, then the support skill
     and the walk's arm swing over what is free. The support reads the trunk-holding instance's
     `lower` as the last command left it, as it reads the blow's now.
  3. **Overlays.** A claim's stance and effector overlay laid over the composed command last.
     This is where today's kick goes: its admission conditions become its `admitting` stage, and
     its stance overlay becomes its claim's overlay.
- **The guard covers any hand no claim holds.** `Claim.whole` claims every resource.
- **`Holders` becomes a record by resource.** Each pass keeps today's order, so step 1 moves no
  fingerprint.

### Readiness and the window

```ts
type Readiness =
  | { readonly kind: "ready" }
  | { readonly kind: "position"; readonly window: Window }
  | { readonly kind: "blocked"; readonly reason: string };

/** Where the aim point must lie in the body's ground frame (from the stance centre, facing), and how slow the body must be. */
interface Window {
  readonly at: Vec3;
  readonly along: readonly [number, number];
  readonly across: readonly [number, number];
  readonly facing: number;
  readonly speed: number;
}
```

- **Readiness is geometric and pure.** Holding still for a time (`COMBAT.settle`,
  `KICK_SELECTION.hold`) is the executor's `admitting`, not readiness.
- **Height.** A target outside the executor's height band (`StrikeWindow.up`) is `blocked` until
  footwork can change the stance's height.
- **Each executor states its window from its own geometry:**
  - the recipe strike from its recipe windows;
  - the placed blow from its `WITHIN`;
  - the straight punch from its stand-off;
  - the kick from `KICK_SELECTION`, offset to the kicking foot.
- **The executor owns everything inside its window**, including the local step it takes there
  (`APPROACH`). Outside the window it reports `position` and, from step 3, does not walk the body.
  One footwork controller then brings any action's target into its window.

### The ledger and contact attribution

The skill set keeps a ledger in its state: the last `LEDGER_LENGTH` ended instances, each with a
sequence number, so a reader takes what is newer than it last read.

```ts
interface Ended {
  readonly sequence: number;
  readonly id: number; readonly action: string; readonly effector: string; readonly target: TargetRef;
  readonly began: number; readonly ended: number;
  readonly ending: { readonly kind: "completed" | "cancelled" | "refused" | "interrupted" | "lost" | "stalled"; readonly reason?: string };
  /** The first contact of its effector from commit to its end, by `contactResponse` against its target's body; null for none. */
  readonly contact: "target" | "block" | "incidental" | "world" | null;
  /** Whether its effector touched the target's body at all while the instance held it. */
  readonly touched: boolean;
}
```

- **Attribution is common code** in the skill set. It reads each instance's effector's whole
  contact list, so a sole's ground contact cannot mask the target. It is never an executor's
  private count. A torso bump is not the effector, so it credits nothing.
- **Feedback for every fighter.** Every fighter's body therefore reads feedback with contact
  identity, and the full contact list for its action effectors. This is a step cost, read
  before step 1 lands (`docs/reference/step-cost.md`).
- **A point target without a body** records its contact class against no body: `incidental` or
  `world`.
- **Damage stays with the rules.** Wounds stay in the rules' blow record (`watchBlows`). Joining a
  wound to an instance waits until a reader needs it.
- **Readers:**
  - the `scored` selector and the follow-up rule;
  - the `surface` aim rule's blocked penalty;
  - range learning;
  - the Lab's counts;
  - the Arena's status.

### Decisions in the behaviours tactics

`behaviours` becomes the one configurable tactics. `seek` and `openings` become presets of it,
and `script` and `stand` remain. Its config has three parts, run in this order every step.

**1. `target`: the focus rules.** A ranked list, like Move's rules; each rule decides the focus
(a body, or none) or passes to the next:

- `ordered`: the orders' foe. If that body is not sensed or is out, the focus is none and the
  report says the target is lost. It never falls through to another body.
- `current`: keep the present focus while it is sensed and in the fight.
- `nearest`: measured from the stance centre, by `standing` or `standing-first`.

The default is `[ordered, current, nearest]`.

**2. `choose`: one action selector over the candidates for the focus.**

- **The pending candidate.** It keeps one until that candidate starts, is refused, becomes
  `blocked`, runs out of `patience`, or the focus changes.
- **Cost.** It rebuilds the whole candidate table at most every `rethink` seconds. Today's
  openings rethink every 0.12 s. It reads only the pending candidate's readiness every step.
- **Kinds:**
  - `first-ready`: the list order, the first `ready`, else the first `position`;
  - `rotate`: the next after the last started;
  - `rules`: ranked conditions. The conditions are one registry, which Move's rules then share;
  - `scored`: by the ledger, `(touched + 1) / (thrown + 2)` for each action;
  - `estimate`: by the candidates' labelled estimates. The `surface` aim rule's score carries the
    openings' scoring, and the recipe strike's measured nets carry Seek's `pays`.
- **Overlap.** It may start during another instance's `release` when its setting allows.

**3. `list`: ranked behaviours by channel, as now.** Every behaviour reads the shared focus and
the pending candidate; none calls `nearestFoe`. The channels are:

- `legs`
- `actions`: the requests to list
- each hand's cover

The behaviours:

- `attack` (actions): continues live instances and starts the pending candidate when it is
  `ready`.
- `approach` (legs): brings the pending window's point into the window, clear of solids, with
  a spacing that range learning may adapt from the ledger.
- `follow-orders`: while the orders say move, it takes the legs and lists no actions. This is
  today's precedence, and it is the hand-off from the Crypt's route finding to local
  positioning.
- Footwork behaviours: `flee`, `close-in`, `keep-distance`, `edge`, `evade`, `clear-of-walls`,
  `break-clinch`, `clear-of-fallen`.
- `cover`, with `pose`, `cover` and `predictive`.
- `ground`: today's ground combat, at the focus, through the protocol. Its own positioning stays
  inside it until readiness can express support stages.

`Tactics.engagement` reports the phase, the focus, the pending candidate and the candidate table.
The Arena's status and the Lab read them.

### Orders (step 3)

- **`Orders.attack` (a point) and `aimedOrders` are deleted.** `Orders.foe` names a body, and
  `Orders.region` may name one of its segments.
- **The Arena's attack.** A ray test against the sensed bodies' collision segments finds the body
  and segment under the pointer, never `scene.pick` on cosmetic meshes. With no body under the
  pointer, there is no attack.
- **The reptile's intent stops extending `Orders`** and resolves its ordered foe in its own
  tactics (`src/core/reptile/tactics.ts`).
- **The Crypt already orders by `foe`.** Its fighters now attack the ordered body with their
  configured actions, not a forced straight blow at the head's centre.

### Where today's tactics go

| Today | Becomes |
| --- | --- |
| `seekFoe`'s nearest foe, `close` | The focus rules; `first-ready`; `approach`. |
| `seekFoe` `edge`, patience, clinch | `edge` (reads the focus's `rangeOf`) yielding after patience; `break-clinch`. |
| `seekFoe` with a fallen foe (`CLEAR_OF_DOWN`) | `clear-of-fallen`; `nearest` by `standing-first`. |
| `recipeTactics`' held aim | The recipe strike holding its aim rule's point within its window. |
| `aim: head/body/pays` | An action's `regions`; `pays` through `estimate`. |
| `hands: alternate` | An action's two effectors under `rotate`. |
| Openings' `strikes`; linear's straight/cross alternation | Which path-strike actions are in the list; `rotate` over a straight and a cross. |
| `openingSelector`, the blocked surface | The `surface` aim rule and `estimate`; the ledger's blocks. |
| `defence: predictive`, evade | `cover` with `predictive`; `evade`. |
| `combinations: follow-up` | A `rules` condition: the other effector's instance touched the target within its window. |
| `combinations: overlap`, `PathStrikeConfig.overlap` | Starting during `release`, under the shared executor's rules. |
| `spacing`, `spacingStep` | `approach`'s spacing, adapted from the ledger's clean misses. |
| Boundary exit, pressure escape, three blocks | `clear-of-walls`, `break-clinch`, the blocked penalty. |
| `groundCombat` | `ground`, on the focus and the protocol. |
| `kickTactics` admission, approach, deadline, cooldown | The kick's readiness and `admitting`, `approach`, `stalled`, a `rules` condition. |
| `chooseSkill` | Selector kinds; its counts become the ledger. |
| The Lab's `choose()` | The fighter's focus rules; a click is an order. |

### State and determinism

- **New memory is plain data in `state` objects** (`src/core/state.ts`): the body's id counter,
  live instances, the ledger, the pending candidate and selector history. Seeded selection, when
  it comes, uses `randomStream`.
- **Candidate order is stable:** the action list, then each action's effectors, then its regions,
  then the spec's segment order.
- **Allocation.** The step stays under `tests/core-step-cost.test.mjs`'s allocation ceiling.

### Rules this design holds to as it grows

- One protocol for every attack and effector. A new action kind is one module and one registration.
- Selectors see candidates and the ledger; behaviours see the focus, the pending candidate and
  statuses; neither sees an executor's kind or internals.
- Resources are the only arbitration. A conflict refuses; it never merges or substitutes.
- A target's geometry has one owner: the aim rules.
- Focus is whom this body attacks; proximity is who threatens it.
- Names, not places in a list, identify actions.
- No compatibility aliases. What a step replaces, it deletes.

## Steps

Each step lands as commits that each pass the gate (`npm run check`, `npm test`, plus `npm run
build` when browser code changes). Every step updates the editor, the inspector, every caller and
the documents it makes wrong.

### 1. Actions and the instance protocol, with no bout changed

What it does:

- `FighterConfig.actions` (named) replaces `blow`, `kick` and `choose-blow`, with the behaviours'
  own blow and kick slots. Every preset is migrated:
  - Scrapper's list holds its path-strike families and the ground's downward blow;
  - Classic's holds its recipe strike.
- Executors, the three-pass composition, `ActionRequest` with the body's id counter, statuses,
  the ledger, and attribution with feedback for every fighter are built.
- Every producer of an Intent emits requests:
  - the old tactics: Seek, Openings, `kickTactics`, ground combat and the behaviours;
  - the Lab's scripts and blow;
  - the research scripts.

  The old tactics use point targets carrying today's point, `targetId` and direction, and name
  their actions.
- Withdrawal stays as each executor has it. `Orders` is unchanged.
- The Lab shows the ledger's counts beside its physical impact count.

Checks:

- No bout changes: `scripts/fingerprint.mjs`, before and after, on Arena bouts and a Crypt run. If
  feedback for every fighter, or any other piece, moves a fingerprint, that is reported and
  resolved before going on.
- Tests on the core stand:
  - every ending, each asserted as a whole ledger record;
  - a changed request throws, and an ended id listed again is ignored;
  - a conflicting start is refused, and a kick waits in `admitting` and holds the walk;
  - a hand touching a body other than the target's is `incidental`, a torso bump credits
    nothing, and a club's contact is attributed;
  - a takeover ends the live instance `interrupted` at once;
  - a fork in the middle of an instance (`tests/arena-fork.test.mjs`) plays on the same.

### 2. Decisions in the behaviours tactics

What it does:

- Body targets with regions and aim rules, the focus rules, readiness and windows, `approach` and
  the other footwork behaviours, the selectors and the `attack` behaviour are built.
- The Behaviours preset moves onto them; the other presets are unchanged.
- The front kick is the second action under the same selection.

Checks:

- An ordered body stays the focus while another is nearer; its loss ends the instance as `lost`,
  and no other body is taken.
- Punch and kick each report their own window; footwork brings each target into it on the stand.
- The pending candidate holds through `prepare`.
- A move order withdraws an instance; it stops in `prepare` and runs on in `commit`.
- Selection and the candidate table replay the same after a fork.

### 3. Presets on the shared decisions, and orders by identity

What it does:

- Classic, Puncher, Scrapper and Behaviours become behaviours configurations.
- Executors are bounded to their windows; `ground` takes the focus.
- The Orders changes above, the Arena's ray test and the reptile's intent.
- Deleted: `seek`, `openings`, `recipeTactics`, `seekFoe`, `pathTactics`, `kickTactics`,
  `chooseSkill`, `aimedOrders`, `highMark`, `Orders.attack`, and `Abilities`' fields no longer
  read.

The presets' measured standings (`docs/reference/controller-presets.md`, the roadmap's
"Fighters") are of the old tactics. They are rewritten as the commit that holds them, not
re-measured unless the owner asks.

Checks:

- Every preset passes `treeFaults` and fits its bodies.
- The smoke bout wounds both sides and plays the same twice.
- The Crypt is run on several seeds.
- The reptile's tests pass.

### 4. Lab and editor

What it does:

- The Lab's Attack shows the focus, the candidate table with readiness and estimates, the live
  instance's phase and stage, and the ledger's counts. It drops its own target choice; a click is
  an order.
- The editor offers the actions list, the focus rules and the selector from the registrations.
- `docs/architecture.md` (Minds and the skill set), the roadmap's Tactics item and `README.md`'s
  Arena controls are updated, and this plan is deleted.

Checks:

- A brief look in a browser.
- A clicked target stays the focus.
- A target removed after a torso bump does not raise the ledger's target count.

## Decided here, for the owner to confirm

- The Arena's attack needs a body under the cursor; swinging at empty air goes away.
- The focus is sticky (`current` before `nearest`), where today the nearest foe is re-chosen every
  step.
- Executors stop walking the body outside their windows, which changes how Puncher closes in.
- Every fighter reads contact feedback, at a step cost read in step 1.
- Ground combat keeps its own positioning in this plan; expressing support stages in readiness is
  later work.
- The presets' standings become history once step 3 lands.
