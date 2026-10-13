# Discrete combat actions and configurable tactics

## Goal

Every attack a fighter makes goes through one protocol, whatever its effector: a hand or a foot,
bare or holding an item. A fighter has a list of named, configured **actions**. Its tactics
choose **whom** to attack (its focus) and **what** to do (an action, an effector and a region of
the target). The tactics start the action as an **instance** with an id. The skill set admits it
by the resources it needs, its executor carries it out, and its lifecycle and what it touched are
reported under that id. Footwork and guard tracking stay continuous; only commitments are
discrete. A deliberate defensive commitment, such as a parry, is an action under the same rules.

Instances on disjoint resources run at once: a right-hand attack with the left hand guarding,
and, where nothing else they need is shared, two attacks or an attack and a parry.

Behaviour may change at every step. The goal is coherent, effective combat: fighters approach,
prepare, strike, recover their guard and respond to orders without deadlocks or conflicting
commands. Existing trajectories and bout results are not acceptance criteria. Improvements are
judged through the focused checks below and a brief look at the resulting combat; a claim of
measured improvement needs a separate comparison requested by the owner.

The shape is the options framework (Sutton, Precup and Singh, 1999):

- an action's readiness is its initiation set;
- its executor's ending is its termination;
- withdrawing the request interrupts it.

A choice above actions (a target, a positioning, an attack policy and an ending condition, such
as "hold distance until an opening") is a behaviours configuration with an ending condition.
Instances belong to the skill set, not the tactics, so switching configurations continues or
withdraws them by id. Nothing of that layer is built here, and learning, search and duration
models are not this plan.

Scope:

- Humanoid fighters in the Arena, the Crypt and the Lab.
- The reptile only where `Orders` changes under it.
- Recovery and the sub-minds are outside it, except that a takeover ends instances cleanly.
- Old configurations and links are not kept working.
- No parry executor is built; the protocol and the resources must carry one.

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
  - a kick begins only while no blow is under way, so a blow and a kick never overlap;
  - the kick's stance is laid over the composed command last, reading that command's height and
    heading.
- **The trunk is held by most blows.** A blow whose claim drives the posture holds the trunk
  (`holders.trunk = "blow"`), so different hands alone do not make two blows compatible.
- **The arbiter runs skills before it arbitrates.** `blow.command` advances the blow, and the
  arbiter then decides what of its claim to use.
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
  the step's strongest contact; the full list (`contacts`) is kept only with `points`. A contact
  names the body, segment and guard it struck (`ContactTarget`), and the segment of this body
  that struck.
- **Held items are on the hand.** A held item's shapes are compound shapes of the hand's own
  rigid body (`src/core/build/rigid.ts`), so a club's contacts arrive on `hand.*`, and the
  feedback cannot tell the club from the hand.
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
| Focus | The sensed body this fighter attacks, or none. Decided once per tactics step, before action selection and behaviours. |
| Proximity | Any foe near this body. Move's gait rule and the guard's threat read proximity, never the focus. |
| Action | A named entry of the fighter's `actions`: the executor it uses, its own settings, the effectors it may use, the regions it aims at and its aim rule. Immutable. |
| Executor | A named entry of the fighter's `executors`: the skill that carries out the actions that name it, and the state they share. |
| Resource | A named set of body controls: an effector, `trunk` or `legs`. Instances conflict when these sets overlap. |
| Region | A mark of the target's spec (`high`, `middle`, `legs`), `any`, or one named segment. |
| Candidate | Action × effector × region for the focus, with its readiness and an optional estimate. Plain data. |
| Readiness | Whether a request can be admitted: `ready`, `position` (with a window), `waiting` or `blocked` (with a reason). Pure. |
| Instance | One admitted request, with an id. It holds its resources from admission, gives them up as it goes, and owns its action, effector and target until it ends. |
| Observation | One contact an instance's effector began, attributed: when, in which phase, what it struck. |
| Ledger | One record for each ended instance: how it ended, whether it reached `commit`, exact contact totals and a bounded observation history. |
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
  step 3 deletes them, the old tactics also use point targets, carrying the target data they carry
  today.
- **A policy never emits a point.** The behaviours tactics produce only body targets.
- **A region is a set of segments.** The executor's aim rule may move between the segments of a
  mark while it tracks, as the kick moves between the legs.
- **A region the body lacks is `blocked`** ("no such region"). It never silently means anywhere:
  `any` is a region of its own, and a fallback is written as a later region in the action's list
  (`[legs, any]`).

### Actions and executors

`FighterConfig.blow` and `.kick`, the behaviours' own `strike.blow` and `kick.kick`, and
`choose-blow` are replaced by two lists:

```ts
interface FighterConfig { /* ... */ readonly executors: readonly ExecutorConfig[]; readonly actions: readonly ActionConfig[] }

/** Every kind shares these; its executor settings follow (the path strike's paths and execution, ...). */
interface ExecutorBase {
  /** Unique in the list: what actions name it by. */
  readonly name: string;
  readonly kind: string;
}

/** Every action shares these; its own settings follow, of its executor's kind (`family`, `armExtension`, ...). */
interface ActionBase {
  /** Unique in the list: what requests, the ledger, rules and displays name it by. */
  readonly name: string;
  /** The executor that carries it out, by name. */
  readonly executor: string;
  /** Effector names of the body (`BodySpec.effectors`), validated against the spec. */
  readonly effectors: readonly string[];
  /** In order of preference; a later one is the fallback when the target lacks an earlier one. */
  readonly regions: readonly Region[];
  readonly aim: AimRule;
}

type AimRule =
  | { readonly kind: "centre"; readonly lead: number }
  | { readonly kind: "surface"; readonly tuning: OpeningTuning }
  | { readonly kind: "leg-height"; readonly height: number };
```

Today's kinds become executor kinds: `recipe-strike`, `path-strike`, `driven-strike`,
`whole-body-strike`, `straight-punch` and `front-kick`.

- **Sharing is named.** Actions that name one executor share its state: the path strike's one
  striking hand, its cooldown and its overlap. Actions on different executors share nothing but
  the body's resources. Sharing is determined by the named executor, never inferred from equal
  settings. Its timing and concurrency settings can still change when a shared action is ready.
- **A path family is a setting of an action.** A hook and a straight are two actions on one
  path-strike executor. The six families are validated by the path strike's `faults`; no other
  kind has one.
- **Each kind registers as a `Part`** (`src/core/mind/parts.ts`, `catalog.ts`):
  - `fits` is capability: the effectors exist, and the executor supports what the hand holds;
  - `faults` validates an executor's settings, and an action's settings against its executor's
    kind; the lists' faults include duplicate names and an action naming no executor;
  - the kind's module makes its executor.
- **Nothing outside an action's own module branches on its kind.** Selectors, behaviours,
  screens and the arbiter see candidates, statuses, needs and the ledger. A research executor is
  compared with another by putting both in the list.
- **Aim rules are the one owner of target geometry.** They are shared functions over the surface
  functions of `openings.ts` and `targets.ts`. An executor calls its action's rule when its
  technique says:
  - every step while it tracks (the straight punch, the kick);
  - once at the start (the path strike latches);
  - held while the point stays within its window (the recipe strike).

  A `surface` rule scores fronts by its tuning and penalises a region this body's ledger
  records as blocked.
- **An estimate carries its unit.** The `surface` rule's score is an `opening`; the recipe
  strike's measured net damage is a `net`. Units are not compared with each other.
- **No technique taxonomy** is added until a reader needs one.

```ts
interface Executor extends Skill {
  /** Pure: what an instance of `action` on `effector` holds from its admission. It may give them up as it goes, never take more. */
  needs(action: string, effector: string): readonly Resource[];
  /** Pure: whether `effector` of action `action` could start on `target` now, and if not what would let it.
      It reads the body, its own state and support; the skill set adds resource conflicts. */
  readiness(view: BodyView, action: string, effector: string, target: TargetRef, around: Around): Readiness;
  /** Advance existing instances once, handling missing requests as withdrawals before advancing their phases.
      New requests are not passed here. Returns lifecycle changes for the skill set to apply. */
  update(view: BodyView, continued: readonly ActionRequest[], around: Around, dt: number): readonly LifecycleUpdate[];
  /** Initialise an admitted instance in prepare, stage admitting; no elapsed time is advanced. */
  start(view: BodyView, request: ActionRequest, around: Around): void;
  /** Pure command data for one live instance, containing only its writes and explicit default delegation. */
  command(view: BodyView, id: number, around: Around): Claim;
  /** Pure final writes for that instance, reading the same composed base as every other overlay. */
  overlay?(view: BodyView, id: number, base: Readonly<BodyCommand>, around: Around): CommandPatch | null;
  readonly state: object;
}
```

`LifecycleUpdate` names an existing id and its next phase, stage and held resources, or its
ending. The skill set owns the protocol records and checks every update: no unknown id, resource
acquisition or reversal from `release` to `commit`. Executors own only their motion and shared
timing state. `Claim` and `CommandPatch` are sparse, per-instance data, under the write contract
below; they contain no other instance's commands. An instance's stance-height request is in its
claim, not a single field shared by its executor.

`Around` gains the tactics' walk and stance height (`Intent.move`, `Intent.lower`), which the
recipe strike and the path strike read today.

### The instance protocol

```ts
interface Intent { move; face; guard; lower?; destination?; readonly actions: readonly ActionRequest[] }

interface ActionRequest {
  /** From the body's one counter (`Sight.instance()`, new, held in the skill set's state): increasing, never reused. */
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
  /** prepare: may cancel; commit: performs the action; release: returns control. */
  readonly phase: "prepare" | "commit" | "release";
  /** The executor's own stage, for display (`admitting`, `chamber`, `transfer`, ...). */
  readonly stage: string;
  /** What it holds now: its needs at admission, less what it has given up. */
  readonly holds: readonly Resource[];
  /** The first OBSERVATIONS of its onsets; the summary contains the exact totals. */
  readonly observations: readonly Observation[];
  /** Exact totals from all observations, including those omitted from the history. */
  readonly contacts: ContactSummary;
}
```

The rules, which the skill set enforces:

1. **Start.** A request with an id above every id it has seen asks to start an instance.
   - After updating existing instances, the skill set validates starts in request order and
     rechecks readiness against the resulting state and all reservations made so far. Only
     `ready` is admitted. An invalid request or any other readiness is `refused`, with its
     reason; it reserves nothing and never reaches `start`. A producer retries with a new id,
     rather than leaving a queued start. Nothing silently substitutes another request.
   - Admission reserves the whole `needs` footprint and calls `start` once. The new instance
     commands preparation on this step; its first elapsed-time update is on the next. Braking,
     quiet support, foot placement and settling belong to its bounded `prepare`, not to a
     readiness wait. Startup and cooldown, which expire without owning the body, are `waiting`.
2. **Continue.** A live id listed again continues its instance.
   - Its action, effector, the target's kind and body, and a body target's region may not
     change; a request that changes them throws.
   - A point target's `at` and `direction` may move, since its producer aims.
   - Something new is a new id.
3. **Withdraw.** A live id no longer listed is a withdrawal.
   - In `prepare`, withdrawal prevents commitment and begins cancellation. In `commit`, it
     prevents no part of the committed action; the instance finishes that phase and returns.
     In `release`, it does not restart or abandon the return. The executor may retain resources
     while cancelling or returning; only the resources actually released become available.
   - Withdrawal is latched: listing the id again cannot undo it. An instance cancelled before
     commitment ends `cancelled` after its return, even if requests resume meanwhile.
   - Withdrawals are handled before phase advancement and before starts in the same step.
   - Listing nothing is how a higher-ranked behaviour holds the attack back.
4. **End.** An instance ends as one of:
   - `completed`
   - `cancelled`
   - `refused`
   - `interrupted`: a sub-mind takes the body, the body is idled by its level (`Mind.idle`), or
     the executor must abort because it can no longer physically carry out the action (for
     example, lost support). The reason distinguishes these cases. Takeover and idle end the
     instance at that moment and release every resource, whatever the executor's `releases`.
   - `lost`: a body target is out or no longer sensed before `commit`
   - `stalled`: an executor's own time limit

   A loss or interruption that needs a controlled return first records its pending ending and
   enters `release`; it cannot strike again. A return timeout ends `stalled` with the pending
   reason included. Terminal records are written once, after the last physics interval owned
   by the instance has been observed. The ending says how it ended, not whether it hit.
   Before commitment, loss takes precedence over voluntary cancellation, and cancellation
   over an ordinary preparation timeout on the same step; forced takeover takes precedence
   over all of them. After commitment, a lost sensed target leaves the last valid aim in use,
   never a substitute body. Each executor bounds its commit and return as well as preparation.
   A phase's deadline is measured from first entry, never extended by changing stages,
   retargeting a point, or repeating a request. Resume resets executor motion, not ids, ledger
   records or the body's contact history.

   The skill set keeps a seen-id high-water mark separate from the counter that issues ids.
   Each request list has unique ids and its new ids are in increasing order. A live id
   continues; a non-live id at or below the high-water mark is ignored, even after ledger
   eviction. An issued id above that mark is a start; an unissued id throws. Skipped ids below
   a new high-water mark are retired. These rules need no unbounded id history.
5. **Concurrency.** An instance may start whenever its control footprint is disjoint from every
   live instance's, in any phase. An instance in `release` has usually given up most of
   what it held, which is how combinations overlap. A shared executor's own rules (the path
   strike's one striking hand) still apply.

### Resources, admission and composition

Resources name sets of concrete controls, compiled once from the body and its controllers.
The same map validates claims and detects admission conflicts; no caller invents a second map.

| Resource | Control footprint |
| --- | --- |
| An effector | Its goal slot and the joint channels of its declared chain below its base (`EffectorModel.channels`), plus its hand-pose actuator if it has one. |
| `trunk` | The remaining posture/push channels outside effector chains. |
| `legs` | The stance/locomotion command and every support limb's footprint, including its effector. The support limbs come from the stance controller's body binding. |

- **Footprints, not unequal names, prove independence.** `legs` overlaps either foot, so a foot
  action and another instance's walk or kick cannot both own that leg. Two resources of one
  instance may overlap; their union is its reservation. `needs` must include the chosen
  effector and every resource any stage may write. A whole-body action needs their union.
- **Commands are sparse and owned per instance.** Posture entries and pushes require ownership
  of their joint channels; effector goals and hand poses require their slots. A legs ask,
  stance goal, stance height or heading change requires `legs`. A trunk posture requires only
  the trunk channels it writes; an arm-only posture change does not acquire `trunk`. A copied
  full guard posture is not an action claim. Undeclared writes throw, rather than being dropped.
- **Defaults have the same footprints.** Guard posture, hand cover and arm swing fill only
  unowned controls. An instance may explicitly delegate a held resource to its default for a
  step (for example, a `free` legs ask); it keeps the reservation but writes nothing on that
  footprint. Silence alone means neutral control (no push or effector goal, reference posture,
  open hand and no stance as applicable), not permission to walk or guard. A final overlay
  may replace a delegated service's output only on its own instance's footprint; delegation
  never grants a second instance access.
- **Coupled controllers are indivisible.** Stance and locomotion own all of `legs`; their output
  is never partially filtered to leave a different instance one foot. The holder can request a
  one-foot stance and an effector goal for the other foot, but the final command must never
  put the same foot under both controllers. A direct foot action must therefore also reserve
  `legs` to choose how support is maintained. `Claim.whole` becomes an explicit whole-body
  reservation with stance and other defaults disabled, rather than an arbiter bypass.
- **Support is a service, not another claimant.** A support transition affects both `legs` and
  `trunk`. An action requesting it holds both and delegates those writes to the support skill
  until ready; it then uses the service's current result as the base for its own command.
  The support skill advances once per step, from the selected owner's request or, when both
  resources are free, the tactics' request. It never overwrites another instance's controls.
  Its stage can delay commitment, but acquiring the resources must not require that stage
  already to have been reached. A holder unable to use the current support must request and
  own the transition it needs; otherwise readiness is `blocked`.
- **Release returns control this step.** Dropping a named resource releases only the controls
  no other resource of that instance still covers. A new instance or a default may use them
  immediately. `Holders` reports the effective owner per control and the corresponding
  resource reservations; it cannot report two owners for overlapping names.

The body follows one step sequence. `driveBy` orders decision, update and command generation;
the world owns the physics and observation boundary. Scripts follow the same sequence:

1. **Read and decide.** Read the current body view and the report containing the preceding
   physics interval's observations. Tactics decide once and submit the whole request list.
2. **Update existing instances.** Validate continuations, then call each executor's `update`
   once in registration order, even if it has no requests. It handles withdrawals before
   advancing phases, applies target loss and time limits, and advances only previously live
   instances. Each executor reads the same start-of-step support report. Apply all lifecycle
   updates before examining starts; record endings and release controls now.
3. **Admit starts.** Recheck readiness and footprints in request order against that updated
   state. Reserve before calling `start`; each following request sees the reservation and any
   shared executor state the start established. Refused requests have no executor side effects;
   the executor's normal update still happens independently of them.
4. **Compose without advancing instances.** Read each instance's pure claim. Build default and
   action posture, pushes and effector goals under the ownership rules; then advance the
   selected locomotion/support services once and build the stance. Apply pure overlays last,
   each reading the same immutable base command and writing only its own footprint. This
   allows a kick to derive its stance from the base height and heading. Validate the complete
   command and save its attribution snapshot before the motor acts. Composition cannot
   change phase, release controls, or admit more work.
5. **Observe after physics.** Sample and attribute the completed interval as specified below,
   without changing commands or advancing executors. The next control step reads those facts.

The world provides a post-physics observation phase (`World.afterPhysics`, new), after advancing
its step counter and before its existing `afterStep` callbacks. Body feedback and attribution
run there, so an event callback can end, idle or remove a fighter only after its last interval
has been observed. This ordering is a world contract, not a dependency on callback registration
order. Observers are disposed with the body and never command it from that phase.

A selector may discover an ordinary release on its next decision; it never runs twice in a
step. A replacement already requested, including one accompanying a withdrawal, can be admitted
on the release step. No released resource is held for an extra step by the arbiter. Final writes
are disjoint, so changing the iteration order of composition cannot change the command; request
order remains the intentional admission priority.

### Readiness and the window

```ts
type Readiness =
  /** May acquire resources and start preparation now; not a promise that the strike starts now. */
  | { readonly kind: "ready" }
  /** Ready once the target is in `window`: footwork's to bring about. */
  | { readonly kind: "position"; readonly window: Window }
  /** Another owner or an independent clock must change: held resources, startup, cooldown. */
  | { readonly kind: "waiting"; readonly reason: string }
  /** Cannot from here: out of the height band, no such region, the holdings. */
  | { readonly kind: "blocked"; readonly reason: string };

interface Window {
  /** The aim point the window is for, in world space. */
  readonly at: Vec3;
  /** Where `at` must lie in the body's ground frame: from the stance centre, along and across the facing, in metres. */
  readonly along: readonly [number, number];
  readonly across: readonly [number, number];
  /** The most the facing may differ from the bearing to `at`, in radians. */
  readonly facing: number;
  /** The most the stance centre may move, in m/s. */
  readonly speed: number;
}
```

- **Readiness is admission readiness.** It reads the body, executor state, holdings, support and
  reservations, and changes nothing. Structural impossibility is `blocked`; another instance's
  reservation or an independently expiring startup/cooldown is `waiting`; an unmet approach
  window is `position`; otherwise it is `ready`. The skill set exposes this combined predicate
  to selectors and calls it again for admission. Executors supply their own capabilities,
  timing and geometry; the skill set alone adds footprint conflicts. There is no special
  admission path for a script or a kick.
- **Preparation makes its own prerequisites.** Braking, changing support, quiet standing for a
  duration (`COMBAT.settle`, `KICK_SELECTION.hold`), chambering and grip closure happen after
  admission, while the instance owns the controls needed to achieve them. An ongoing default
  walk is not a reservation by another instance. A ready kick acquires `legs`, commands a stop,
  and waits in `prepare` until measured support is quiet. Every preparation stage has a finite
  deadline; failure returns control with `stalled`, rather than reserving the body forever.
  `waiting` may never mean a condition that requires this unadmitted instance to act.
- **The window bounds entry, not completion of preparation.** Its speed limit is the largest
  speed from which the executor can prepare; footwork brakes to enter that envelope. It is not
  the quiet-support threshold or a dwell timer. Once admitted, an instance owns local movement
  and preparation; a moving target that makes preparation impossible ends it or exhausts its
  deadline. It does not retain resources while asking an unowned footwork controller to fix it.
- **Height.** A target outside the executor's height band (`StrikeWindow.up`) is `blocked`. No
  footwork in this plan changes the stance's height to reach one.
- **Each executor states its window from its own geometry:**
  - the recipe strike from its recipe windows;
  - the placed blow from its `WITHIN`;
  - the straight punch from its stand-off;
  - the kick from `KICK_SELECTION`, offset to the kicking foot.
- **The executor owns everything inside its window**, including the local step it takes there
  (`APPROACH`). Outside the window it reports `position` and does not walk the body.
  One footwork controller then brings any action's target into its window.

### Observations, attribution and the ledger

```ts
interface Observation {
  /** The completed physics step and its ending world time. */
  readonly step: number;
  readonly time: number;
  readonly phase: "prepare" | "commit" | "release";
  /** By `contactResponse` against the target's body; a point target without a body has only `incidental` and `world`. */
  readonly kind: "target" | "block" | "incidental" | "world";
  /** The body and segment struck; null for the world or an object. */
  readonly struck: { readonly body: string; readonly segment: string } | null;
  /** This body's segment that struck. A held item is on its hand's rigid body, so whether the item or the hand struck is not known. */
  readonly by: string;
}

interface ContactSummary {
  /** Exact onset counts, by phase and classification, folded from every observation. */
  readonly counts: Readonly<Record<Phase, Readonly<Record<ContactKind, number>>>>;
  /** Any external positive load in a committed interval, including a contact begun earlier. */
  readonly loadedInCommit: boolean;
  /** Intended target segments blocked in commit, unique in the target spec's segment order. */
  readonly blockedSegments: readonly string[];
  /** Latest target onset in commit, for follow-up timing; null until one occurs. */
  readonly lastTarget: number | null;
}

interface Ended {
  readonly sequence: number;
  readonly id: number; readonly action: string; readonly effector: string; readonly target: TargetRef;
  readonly began: number; readonly ended: number;
  readonly ending: { readonly kind: "completed" | "cancelled" | "refused" | "interrupted" | "lost" | "stalled"; readonly reason?: string };
  /** Whether it reached `commit`: an attempt, for whatever counts attempts. */
  readonly committed: boolean;
  readonly contacts: ContactSummary;
  /** The first `OBSERVATIONS` of them, for inspection only. */
  readonly observations: readonly Observation[];
  /** Total onsets, the sum of contacts.counts; independent of the display-history limit. */
  readonly observed: number;
}
```

`Phase` and `ContactKind` are the unions used by `Observation`, shared rather than duplicated.

- **Observation is after physics, before lifecycle changes.** Before each physics step the
  skill set saves a plain-data snapshot of each instance's id, target, phase and attribution
  effector for the command actually submitted. The body's feedback sampler reads the completed
  step once in `World.afterPhysics`, then the skill set attributes against that snapshot. The
  phase is the one that produced the interval, never the next phase reported by an executor.
  The completed-step number prevents duplicate ingestion. Feedback remains available to the
  next body view; the driver's `look` does not resample a different contact list.
- **An observation is the first load of a contact episode.** The key is this body's effector
  segment plus the other body's id and segment, an object's id, or a fixed collider's detached
  stable id. The trusted feedback adapter supplies these identities, never engine handles;
  unknown dynamic objects also need stable detached keys. All manifolds of that pair are
  deduplicated. An episode persists while the pair remains in the engine's contact list,
  including zero-impulse steps. It produces one onset at its first positive normal impulse,
  and becomes eligible for another only after a sampled separation. This describes sampled
  contacts, not unobservable contacts between solver substeps.
- **Contact history belongs to the body.** The sampler keeps each effector's current pairs and
  whether they have loaded, even with no live actions, during recovery and while the mind is
  idle. It does not reset on admission, cancellation, resource release or resume. Thus a hand
  already resting against a target cannot give a new instance a fresh hit. Presence is sampled
  before filtering for positive impulse, unlike the present strongest-contact feedback.
- **Attribution is common code** in the skill set, using the whole contact list. A sole's ground
  contact cannot mask the target. Only the instance whose snapshot owns the striking effector
  receives an onset. A torso bump is not its effector. An instance must retain that effector
  until its last attributable interval; after giving it up, it receives no more contacts from
  it, even if another part of its return is still live. An onset in a default or sub-mind's
  interval updates pair history but belongs to no action.
- **Endings cannot steal the last interval.** A final swing contact is recorded before the next
  update changes `commit` to `release` or ends the instance. Takeover and idle flush no guessed
  contact: the preceding completed step has already been observed. They end the instance and
  clear its attribution for subsequent steps. The ledger copies the complete summary and the
  bounded history once; a late contact never mutates an ended record.
- **Fold every observation, retain only a bounded history.** A common reducer updates the
  exact counts, the blocked-segment set and the latest committed target time before applying
  the `OBSERVATIONS` display limit. These aggregates are bounded by the phase/kind enums and
  the one target's anatomy, not by contact frequency or bout length. They live in both status
  and terminal record. The history reports how many events it omits; it is never a statistics
  source. The reducer also marks `loadedInCommit` from every committed interval's full loaded
  contact list, even when no onset occurs. A sustained contact that began in preparation can
  never be mistaken for a clean miss merely because no new episode began in commit.
- **Facts, then predicates.** The attribution module exports `landed` (committed target count
  above zero), `blocked` (committed block count above zero, with its segments), and `cleanMiss`
  (`completed`, committed, and no load in any committed interval). A guard followed by a
  target is both blocked and landed. Preparation contact cannot count as landed. Follow-up
  reads `lastTarget`; surface penalties read `blockedSegments`; range learning uses only
  `cleanMiss`. No reader infers absence of contact from the retained history. These predicates
  describe contact, not damage or proof that the requested region was hit.
- **Feedback for every fighter.** Every fighter's body reads this complete feedback for its
  action effectors. Reuse that sample for executor control and reporting. The existing
  allocation gate applies; no timing measurement or new reference record is required here.
- **The ledger is short-term.** The skill set keeps the last `LEDGER_LENGTH` records in its
  state, each with a sequence number, so a reader takes what is newer than it last read. A reader
  whose last read is older than the oldest record kept knows how many it missed.
- **Statistics are their reader's.** A selector that learns keeps its own counts in its state,
  updated as it reads; the ledger's length never resets them. A rolling history, if a selector
  wants one, is that selector's stated rule.
- **Damage stays with the rules.** Wounds stay in the rules' blow record (`watchBlows`). Joining a
  wound to an instance waits until a reader needs it.
- **Readers:**
  - the `scored` selector, and the follow-up rule, which reads another instance's live summary;
  - the `surface` aim rule's blocked penalty, by the region of the blocked segment;
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

Stickiness is a choice of rules, made in each configuration: `[ordered, current, nearest]` keeps
its foe, and `[ordered, nearest]` takes the nearest every step, as today's tactics do.

**2. `choose`: one action selector over the candidates for the focus.**

- **The pending candidate.** It keeps one until that candidate is admitted (the instance then
  owns it through `prepare` and after), is refused, becomes `blocked`, runs out of `patience`,
  or the focus changes. A `waiting` candidate stays pending; the selector may pass over it for a
  `ready` one.
- **Cost.** It rebuilds the whole candidate table at most every `rethink` seconds. Today's
  openings rethink every 0.12 s. It reads the pending candidate's readiness every step, and
  rechecks any cached alternative before choosing it. Cached readiness is never authority to
  start. Alternatives are reconsidered at the next rebuild; that bounded delay is deliberate.
- **Kinds:**
  - `first-ready`: the list order, the first `ready`, else the first `position`;
  - `rotate`: the next after the last started;
  - `rules`: ranked conditions. The conditions are one registry, which Move's rules then share;
  - `scored`: by its own counts, `(landed + 1) / (committed + 2)` for each action;
  - `estimate`: by the candidates' estimates. Its faults refuse a list whose actions give no
    estimate or estimates in more than one unit, so the openings' `opening` and Seek's `net`
    (its `pays`) are each a list of their own.
- **Concurrency.** It may start a candidate while another instance is live when what the
  candidate needs is free.

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
- `cover`, with `pose`, `cover` and `predictive`: continuous guard tracking of the hands no
  instance holds.
- `ground`: ground positioning at the focus remains a continuous behaviour. Its attacks use
  the same requests and windows, with low-support preparation owned by their instances.

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
| `aim: head/body/pays` | An action's `regions`; `pays` through `estimate` in `net`. |
| `hands: alternate` | An action's two effectors under `rotate`. |
| Openings' `strikes`; linear's straight/cross alternation | Which path-strike actions are in the list; `rotate` over a straight and a cross. |
| `openingSelector`, the blocked surface | The `surface` aim rule and `estimate` in `opening`; the `blocked` predicate. |
| `defence: predictive`, evade | `cover` with `predictive`; `evade`. |
| `combinations: follow-up` | A `rules` condition: another instance's live summary records a committed target touch within its time window. |
| `combinations: overlap`, `PathStrikeConfig.overlap` | Starting on free resources, under the shared executor's rules. |
| `spacing`, `spacingStep` | `approach`'s spacing, adapted from the ledger's clean misses. |
| Boundary exit, pressure escape, three blocks | `clear-of-walls`, `break-clinch`, the blocked penalty. |
| `groundCombat` | `ground`, on the focus and the protocol. |
| `kickTactics` admission, approach, deadline, cooldown | The kick's `admitting` and `waiting`, `approach`, `stalled`, a `rules` condition. |
| `chooseSkill` | Selector kinds; its counts become the selector's own. |
| The Lab's `choose()` | The fighter's focus rules; a click is an order. |

### State and determinism

- **New memory is plain data in `state` objects** (`src/core/state.ts`): the body's id counter,
  seen-id high-water mark, live instances, pending endings, contact summaries, bounded histories,
  current contact episodes, command attribution snapshot and last observed step, the ledger,
  pending candidate and selectors' counts. Seeded selection, when it comes, uses `randomStream`.
- **Candidate order is stable:** the action list, then each action's effectors, then its regions,
  then the spec's segment order.
- **Allocation.** The step stays under `tests/core-step-cost.test.mjs`'s allocation ceiling;
  retained observations are bounded by `OBSERVATIONS` per instance. Current contact episodes
  contain only present pairs, and each terminal record has anatomy-bounded aggregates. Command
  footprints are compiled once. Scratch buffers are reused and hold no cross-step memory.

### Rules this design holds to as it grows

- One protocol for every attack, defence and effector. A new kind is one module and one
  registration.
- Existing instances advance once; admission precedes a new instance's execution. Executor
  command and overlay generation is pure, services tick once, and a refused start never runs.
- Resources are the only arbitration between executors. A conflict refuses; it never merges or
  substitutes. A claim writes only what its instance holds.
- Shared state is named: an action's executor, never a match of settings.
- Selectors see candidates and the ledger; behaviours see the focus, the pending candidate and
  statuses; neither sees an executor's kind or internals.
- Observations belong to the physics interval that produced them. Predicates read exact
  aggregates; truncating inspection history never changes a decision or statistic.
- Readiness permits preparation; it cannot wait for work that only admission can enable.
- A target's geometry has one owner: the aim rules.
- Focus is whom this body attacks; proximity is who threatens it.
- Names, not places in a list, identify actions and executors.
- No compatibility aliases. What a step replaces, it deletes.

## Steps

Each step lands as commits that each pass the gate (`npm run check`, `npm test`, plus `npm run
build` when browser code changes). Every step updates the editor, the inspector, every caller and
the documents it makes wrong.

### 1. The action protocol, ownership and contact feedback

The protocol and resource arbiter land together: a temporary hand/foot-slot protocol would
give the new interface a second set of lifecycle rules. Split the implementation into small
commits by executor and caller, keeping each migrated path complete. Behaviour may change;
preserving the old slot ordering or cancellation quirks is not a requirement.

What it does:

- `FighterConfig.executors` and `.actions` (named) replace `blow`, `kick` and `choose-blow`, with
  the behaviours' own blow and kick slots. Every preset is migrated:
  - Scrapper's lists hold its path-strike executor, its families and the ground's downward blow
    as actions on it;
  - Classic's hold its recipe strike.
- `ActionRequest`, ids, statuses, exact contact summaries, bounded histories and the ledger,
  with one post-physics feedback sample and attribution path for every fighter, are built.
- The compiled resource footprints, per-instance sparse claims, lifecycle update before
  admission, and pure command/overlay composition replace the slots. `Holders` reports their
  effective ownership. Readiness for point targets uses the same admission predicates as
  later body targets; braking and support preparation start after admission.
- Every executor exposes its entry window. One approach controller brings a pending point
  into that window; the existing producers use it when readiness says `position`. Executors
  keep only the local steps within their windows. Scripts that request an unreachable point
  receive an explicit refusal, not an unbounded walk or resource reservation.
- Each executor maps its technique to `prepare`, `commit` and `release`: admission/settling,
  placement, transfer and chambering are preparation; the stroke or defensive commitment is
  commit; recovery is release. Withdrawal prevents a prepared stroke, cannot truncate a
  commitment, and never cancels the return. Physical aborts remain possible and are reported.
  Each stage states its resource footprint and deadline. The phase mapping is covered by
  executor tests, rather than inferred from old counters. A returning hand remains a separate
  instance when another hand starts; both use the common resource rules.
- Every producer of an Intent emits requests:
  - the old tactics: Seek, Openings, `kickTactics`, ground combat and the behaviours;
  - the Lab's scripts and blow;
  - the research scripts.

  The old tactics use point targets carrying today's point, `targetId` and direction, and name
  their actions.
- `Orders` is unchanged until step 3. The old tactics are migrated to the protocol, without
  retaining a second arbitration path. A producer handles refusal and readiness explicitly.
- The Lab shows the ledger's counts beside its physical impact count.

Checks:

- Every migrated executor can prepare, commit and return on a suitable core-stand fixture;
  preparation that cannot finish relinquishes control within its deadline. The smoke bout
  wounds both sides and replays deterministically. Changed trajectories need no fingerprint
  comparison. A brief browser look checks visible command hand-offs; the owner judges motion.
- Tests on the core stand:
  - every ending, each asserted as a whole ledger record;
  - a changed request throws; an ended id listed again is ignored, also after its record has
    left the ledger; an id never issued throws;
  - a hand touching a body other than the target's is `incidental`, a torso bump is no
    observation, a club's contact is attributed to its hand, and a guard then the target are
    two observations, `blocked` and `landed`;
  - contact in `prepare` is not `landed`;
  - a final committed contact is counted before return or ending, and never credited to a
    replacement admitted on the next control step;
  - a sustained touch spanning admission, a zero-impulse interval, or takeover/resume creates
    no second onset until separation and renewed load;
  - a contact begun in preparation and still loaded during commit is neither a new landed
    onset nor a clean miss;
  - contacts filling and exceeding the history limit, followed by a committed target contact
    and a block, still produce the correct totals, `landed`, `blocked`, follow-up time and
    `cleanMiss` result; changing the history limit changes no selector decision;
  - a takeover or idle ends the live instance `interrupted` at once, after recording the last
    completed interval; later sub-mind contacts do not change that ended record;
  - an `afterStep` callback ending or removing a fighter observes the final interval already
    recorded, regardless of callback registration order;
  - a fork in the middle of a contact episode and an instance (`tests/arena-fork.test.mjs`)
    preserves phase attribution, totals, onsets, ownership and subsequent motion.
- Ownership checks on the core stand assert the composed command and motion, not only claims:
  - a right-hand attack with left-hand guard, and the reverse, bare and holding a club;
  - two attacks with disjoint footprints run at once, and composition order leaves the
    resulting command identical;
  - conflicting trunk claims and `legs` versus foot claims refuse the later start without
    calling `start` or altering that executor beyond its ordinary once-per-step update;
  - a foreign arm's posture entry, an undeclared push, and a stance/effector double owner throw;
  - withdrawal on the commitment boundary prevents launch; cancellation retains only the
    resources needed to return; resubmitting its id cannot revive it;
  - an actual release during update permits a requested replacement that step; with none,
    the default resumes that step; composition cannot release another resource or tick twice;
  - a kick admitted from a moving default gait stops it, establishes quiet support and then
    commits; an impossible preparation stalls and restores default control;
  - support can lower and rise on behalf of an instance holding both resources, without
    overwriting a different instance or waiting for its own unrequested transition.

### 2. Decisions in the behaviours tactics

What it does:

- Body targets with regions and aim rules, focus rules, the selectors and `attack` are built.
  `approach` wraps the shared window controller as a behaviour; the other footwork behaviours
  join it. Body and point targets use the same readiness and preparation contract.
- The Behaviours preset moves onto them; the other presets retain their tactics until step 3.
- The front kick is the second action under the same selection.

Checks:

- An ordered body stays the focus while another is nearer; its loss before commitment ends the
  instance as `lost`, and no other body is taken. A committed instance retains its last valid
  aim if sensing is lost, completes or physically aborts, and never substitutes another body.
- A region the target lacks is `blocked`, and the action's next region is chosen.
- Punch and kick each report their own window; footwork brings each target into it on the stand.
- A kick in cooldown is `waiting`, and a ready punch is chosen over it.
- A ready kick selected while walking is admitted and reaches quiet support in preparation;
  it is not left pending on a quiet timer it cannot advance. Cached alternatives are rechecked
  before selection, and admission rechecks again after lifecycle updates.
- An admitted instance keeps its target through `prepare`; the selector starts nothing on its
  resources meanwhile.
- A move order withdraws an instance; it stops in `prepare` and runs on in `commit`.
- Selection and the candidate table replay the same after a fork.

### 3. Presets on the shared decisions, and orders by identity

What it does:

- Classic, Puncher, Scrapper and Behaviours become behaviours configurations.
- Every preset uses the shared `approach` behaviour for entry into an executor's window,
  including Puncher; its straight-punch executor owns only preparation and local execution.
- `ground` takes the focus and keeps its own positioning. It is Scrapper's today, held by
  `docs/reference/ground-combat.md`'s fixtures; its downward action owns the support service's
  preparation under the same resource and deadline rules as a standing action.
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
  instances with phase, stage, holds, exact contact totals and bounded observation histories,
  and the ledger's counts. It labels omitted history. It drops its own target choice; a click
  is an order.
- The editor offers the executors and actions lists, the focus rules and the selector from the
  registrations.
- `docs/architecture.md` (Minds and the skill set), the roadmap's Tactics item and `README.md`'s
  Arena controls are updated, and this plan is deleted.

Checks:

- A brief look in a browser.
- A clicked target stays the focus.
- A target removed after a torso bump does not raise the ledger's target count.
