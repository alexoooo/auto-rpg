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
| Focus | The sensed body this fighter attacks, or none. Decided once a step, before anything else. |
| Proximity | Any foe near this body. Move's gait rule and the guard's threat read proximity, never the focus. |
| Action | A named entry of the fighter's `actions`: the executor it uses, its own settings, the effectors it may use, the regions it aims at and its aim rule. Immutable. |
| Executor | A named entry of the fighter's `executors`: the skill that carries out the actions that name it, and the state they share. |
| Resource | An effector of the body, `trunk` or `legs`. Exclusive: one instance holds it at a time. |
| Region | A mark of the target's spec (`high`, `middle`, `legs`), `any`, or one named segment. |
| Candidate | Action × effector × region for the focus, with its readiness and an optional estimate. Plain data. |
| Readiness | `ready`, `position` (the window the target must be brought into), `waiting` or `blocked` (each with a reason). Pure. |
| Instance | One admitted request, with an id. It holds its resources from admission, gives them up as it goes, and owns its action, effector and target until it ends. |
| Observation | One contact an instance's effector began, attributed: when, in which phase, what it struck. |
| Ledger | One record for each ended instance: how it ended, whether it reached `commit`, and its observations. |
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
  step 4 deletes them, the old tactics also use point targets, carrying exactly what they carry
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
  the body's resources. Tuning an executor never changes which actions inhibit one another; only
  editing an action's `executor` does.
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
      It may read the body, its own state and what live instances hold; it changes nothing. */
  readiness(view: BodyView, action: string, effector: string, target: TargetRef, held: readonly Resource[]): Readiness;
  /** Called every step in registration order, with the admitted requests addressed to it (possibly none): one claim over its instances. */
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
  /** prepare: withdrawal stops it. commit: withdrawal does not cut it short. release: winding down. */
  readonly phase: "prepare" | "commit" | "release";
  /** The executor's own stage, for display (`admitting`, `chamber`, `transfer`, ...). */
  readonly stage: string;
  /** What it holds now: its needs at admission, less what it has given up. */
  readonly holds: readonly Resource[];
  /** Its observations so far (below). */
  readonly observations: readonly Observation[];
}
```

The rules, which the skill set enforces:

1. **Start.** A request with an id above every id it has seen asks to start an instance.
   - The skill set admits or refuses it before any executor runs (below). It is `refused` if it
     is invalid, the body or its holdings cannot carry it, or its needs meet what a live
     instance holds or an earlier start of the step needs. A refused start never reaches its
     executor. Nothing silently falls back to another action, effector or target.
   - Conditions that pass with time do not refuse. These are the executor's startup, cooldown,
     quiet support and settling. An admitted instance waits in `prepare` (stage `admitting`),
     holding what it needs, as today's kick stops the walk before it begins. Its executor's time
     limits bound the wait. A selector avoids this wait by reading `waiting` readiness.
2. **Continue.** A live id listed again continues its instance.
   - Its action, effector, the target's kind and body, and a body target's region may not
     change; a request that changes them throws.
   - A point target's `at` and `direction` may move, since its producer aims.
   - Something new is a new id.
3. **Withdraw.** A live id no longer listed is a withdrawal.
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

   The ending says how the instance ended, not whether it hit. An id below the counter's next
   that is not live has ended, and listing it again is ignored, since a producer reads the
   report one step late; this needs no history, so it holds after the ledger has dropped the
   record. An id the counter has not issued throws.
5. **Concurrency.** An instance may start whenever what it needs is disjoint from what every
   live instance holds, in any phase. An instance in `release` has usually given up most of
   what it held, which is how combinations overlap. A shared executor's own rules (the path
   strike's one striking hand) still apply.

### Resources, admission and composition

- **Resources** are the body's effector names plus `trunk` and `legs`, and they are exclusive.
  An executor's `needs` names the most its instance can use: a blow that drives the posture
  needs `trunk`; one that may place or hold the feet needs `legs`; the kick needs its foot,
  `legs` and `trunk`; `Claim.whole` needs every resource.
- **Sharing a resource takes a declared composition rule** for it, and none is declared here.
  Different hand names do not make two actions compatible, and muscle commands are never merged.
  The granularity is revisited when a dual-wielding case needs, say, the trunk shared.
- **The support skill is not an instance.** Its transition (lowering, rising) is a condition an
  executor waits on in `admitting`, or reports as `waiting`, as the kick's does today.
- **Each step, in order:**
  1. **Admit.** Withdrawals, then starts in request order, as the protocol says.
  2. **Execute.** Every executor is commanded in registration order, with its admitted
     requests, as every skill is now. A claim covers only what its instances hold.
  3. **Compose**, in three passes:
     1. **Base claims.** Hands, posture, pushes, closed hands and legs asks, each written only
        by the instance that holds the resource. A holder may leave a resource to its default:
        a `free` legs ask leaves the legs to the tactics' walk, as today.
     2. **Stance.** The walk or the legs ask of the claim that holds `legs`, then the support
        skill and the walk's arm swing over what no instance holds. The support reads the
        trunk-holding instance's `lower` as the last command left it, as it reads the blow's now.
     3. **Overlays.** A claim's stance and effector overlay, laid last because it reads the
        composed stance (the kick reads its height and heading). It writes only what its
        instance holds. This is where today's kick goes: its admission conditions become its
        `admitting` stage, and its stance overlay becomes its claim's overlay.
- **Writes are disjoint**, so the order among claims does not change the command. A resource an
  instance gives up returns to its default (the guard, the walk, the support) on that step.
- **The guard covers any hand no instance holds.**
- **`Holders` becomes a record by resource**, naming the instance or the default that holds each.

### Readiness and the window

```ts
type Readiness =
  | { readonly kind: "ready" }
  /** Ready once the target is in `window`: footwork's to bring about. */
  | { readonly kind: "position"; readonly window: Window }
  /** Will pass with time: a cooldown, a resource a live instance holds, a support transition. */
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

- **Readiness is pure, not only geometric.** It reads the body, the executor's own state
  (cooldown), what live instances hold, the holdings and the support's stage. It changes
  nothing. Holding still for a time (`COMBAT.settle`, `KICK_SELECTION.hold`) is the executor's
  `admitting`: admission is what stops the walk so the stance can quieten.
- **Height.** A target outside the executor's height band (`StrikeWindow.up`) is `blocked`. No
  footwork in this plan changes the stance's height to reach one.
- **Each executor states its window from its own geometry:**
  - the recipe strike from its recipe windows;
  - the placed blow from its `WITHIN`;
  - the straight punch from its stand-off;
  - the kick from `KICK_SELECTION`, offset to the kicking foot.
- **The executor owns everything inside its window**, including the local step it takes there
  (`APPROACH`). Outside the window it reports `position` and, from step 4, does not walk the body.
  One footwork controller then brings any action's target into its window.

### Observations, attribution and the ledger

```ts
interface Observation {
  readonly time: number;
  readonly phase: "prepare" | "commit" | "release";
  /** By `contactResponse` against the target's body; a point target without a body has only `incidental` and `world`. */
  readonly kind: "target" | "block" | "incidental" | "world";
  /** The body and segment struck; null for the world or an object. */
  readonly struck: { readonly body: string; readonly segment: string } | null;
  /** This body's segment that struck. A held item is on its hand's rigid body, so whether the item or the hand struck is not known. */
  readonly by: string;
}

interface Ended {
  readonly sequence: number;
  readonly id: number; readonly action: string; readonly effector: string; readonly target: TargetRef;
  readonly began: number; readonly ended: number;
  readonly ending: { readonly kind: "completed" | "cancelled" | "refused" | "interrupted" | "lost" | "stalled"; readonly reason?: string };
  /** Whether it reached `commit`: an attempt, for whatever counts attempts. */
  readonly committed: boolean;
  /** The first `OBSERVATIONS` of them, and how many there were in all. */
  readonly observations: readonly Observation[];
  readonly observed: number;
}
```

- **An observation is a contact's onset**: a pair of this body's effector segment and what it
  struck that was not in contact the step before. An instance records them from admission to its
  end, live in its status and then in its ledger record, by the same code.
- **Attribution is common code** in the skill set. It reads each instance's effector's whole
  contact list, so a sole's ground contact cannot mask the target. It is never an executor's
  private count. A torso bump is not the effector, so it is no observation.
- **Facts, then predicates.** What a reader decides is derived from the observations by
  predicates the attribution module exports: `landed` (a `target` observation in `commit`),
  `blocked` (a `block` observation in `commit`, and the segment it struck). Contact in `prepare`,
  such as a fist brushing the foe while it chambers, never counts as landed. A guard touched and
  then the target is both.
- **Feedback for every fighter.** Every fighter's body therefore reads feedback with contact
  identity, and the full contact list for its action effectors. This is a step cost, read
  before step 1 lands (`docs/reference/step-cost.md`).
- **The ledger is short-term.** The skill set keeps the last `LEDGER_LENGTH` records in its
  state, each with a sequence number, so a reader takes what is newer than it last read. A reader
  whose last read is older than the oldest record kept knows how many it missed.
- **Statistics are their reader's.** A selector that learns keeps its own counts in its state,
  updated as it reads; the ledger's length never resets them. A rolling history, if a selector
  wants one, is that selector's stated rule.
- **Damage stays with the rules.** Wounds stay in the rules' blow record (`watchBlows`). Joining a
  wound to an instance waits until a reader needs it.
- **Readers:**
  - the `scored` selector, and the follow-up rule, which reads another instance's live
    observations;
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
  openings rethink every 0.12 s. It reads only the pending candidate's readiness every step.
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
- `ground`: today's ground combat, at the focus, through the protocol. Its own positioning stays
  inside it until readiness can express support stages.

`Tactics.engagement` reports the phase, the focus, the pending candidate and the candidate table.
The Arena's status and the Lab read them.

### Orders (step 4)

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
| `combinations: follow-up` | A `rules` condition: another instance's live observations show the target touched within its window. |
| `combinations: overlap`, `PathStrikeConfig.overlap` | Starting on free resources, under the shared executor's rules. |
| `spacing`, `spacingStep` | `approach`'s spacing, adapted from the ledger's clean misses. |
| Boundary exit, pressure escape, three blocks | `clear-of-walls`, `break-clinch`, the blocked penalty. |
| `groundCombat` | `ground`, on the focus and the protocol. |
| `kickTactics` admission, approach, deadline, cooldown | The kick's `admitting` and `waiting`, `approach`, `stalled`, a `rules` condition. |
| `chooseSkill` | Selector kinds; its counts become the selector's own. |
| The Lab's `choose()` | The fighter's focus rules; a click is an order. |

### State and determinism

- **New memory is plain data in `state` objects** (`src/core/state.ts`): the body's id counter,
  live instances and their observations, the ledger, the pending candidate and the selectors'
  counts. Seeded selection, when it comes, uses `randomStream`.
- **Candidate order is stable:** the action list, then each action's effectors, then its regions,
  then the spec's segment order.
- **Allocation.** The step stays under `tests/core-step-cost.test.mjs`'s allocation ceiling;
  observations are bounded by `OBSERVATIONS` per instance.

### Rules this design holds to as it grows

- One protocol for every attack, defence and effector. A new kind is one module and one
  registration.
- Admission precedes execution: a refused start never runs.
- Resources are the only arbitration between executors. A conflict refuses; it never merges or
  substitutes. A claim writes only what its instance holds.
- Shared state is named: an action's executor, never a match of settings.
- Selectors see candidates and the ledger; behaviours see the focus, the pending candidate and
  statuses; neither sees an executor's kind or internals.
- Observations are facts; landed, blocked and attempted are predicates over them.
- A target's geometry has one owner: the aim rules.
- Focus is whom this body attacks; proximity is who threatens it.
- Names, not places in a list, identify actions and executors.
- No compatibility aliases. What a step replaces, it deletes.

## Steps

Each step lands as commits that each pass the gate (`npm run check`, `npm test`, plus `npm run
build` when browser code changes). Every step updates the editor, the inspector, every caller and
the documents it makes wrong.

### 1. Requests, observations and the ledger, with no bout changed

The identity of attacks changes, and nothing they do.

What it does:

- `FighterConfig.executors` and `.actions` (named) replace `blow`, `kick` and `choose-blow`, with
  the behaviours' own blow and kick slots. Every preset is migrated:
  - Scrapper's lists hold its path-strike executor, its families and the ground's downward blow
    as actions on it;
  - Classic's hold its recipe strike.
- `ActionRequest` with the body's id counter, statuses, observations, the ledger, and
  attribution with feedback for every fighter are built.
- Every producer of an Intent emits requests:
  - the old tactics: Seek, Openings, `kickTactics`, ground combat and the behaviours;
  - the Lab's scripts and blow;
  - the research scripts.

  The old tactics use point targets carrying today's point, `targetId` and direction, and name
  their actions.
- The arbiter keeps today's order and its hand and foot slots, routing each request to its
  action's executor. One hand instance and one foot instance live at most, with today's
  exclusion between them: a kick asked holds back the blow, and a kick begins only while no blow
  is under way.
- Withdrawal stays as each executor has it. `Orders` is unchanged.
- The Lab shows the ledger's counts beside its physical impact count.

Checks:

- No bout changes: `scripts/fingerprint.mjs`, before and after, on Arena bouts and a Crypt run. If
  feedback for every fighter, or any other piece, moves a fingerprint, that is reported and
  resolved before going on.
- Tests on the core stand:
  - every ending, each asserted as a whole ledger record;
  - a changed request throws; an ended id listed again is ignored, also after its record has
    left the ledger; an id never issued throws;
  - a hand touching a body other than the target's is `incidental`, a torso bump is no
    observation, a club's contact is attributed to its hand, and a guard then the target are
    two observations, `blocked` and `landed`;
  - contact in `prepare` is not `landed`;
  - a takeover ends the live instance `interrupted` at once;
  - a fork in the middle of an instance (`tests/arena-fork.test.mjs`) plays on the same.

### 2. Admission and composition by resource

Arbitration moves from the order of the slots to resources. Bouts may change; each change is
reported against step 1's fingerprints, and is the design's, not an accident of order.

What it does:

- `needs`, admission before execution, progressive release, and the three passes writing only
  what each instance holds. `Holders` by resource.
- The slots go: any number of instances live on disjoint resources. The kick's admission
  conditions become its `admitting` stage, its stance overlay its claim's overlay, and its
  exclusion of the blow a conflict of `trunk` and `legs`.
- `waiting` readiness for cooldowns, held resources and support transitions.

Checks, on the core stand, each asserting the composed command and the motion, not only the
claims:

- a right-hand attack with the left hand guarding, and the reverse, bare and holding a club;
- two attacks on disjoint resources run at once;
- two attacks that both need `trunk` cannot: the later is refused, and its executor's state is
  as it was before the step;
- a resource given up in `release` returns to its default that step, and a start on it is then
  admitted;
- a kick admitted while the body walks holds the walk in `admitting` and kicks once quiet.

### 3. Decisions in the behaviours tactics

What it does:

- Body targets with regions and aim rules, the focus rules, readiness and windows, `approach` and
  the other footwork behaviours, the selectors and the `attack` behaviour are built.
- The Behaviours preset moves onto them; the other presets are unchanged.
- The front kick is the second action under the same selection.

Checks:

- An ordered body stays the focus while another is nearer; its loss ends the instance as `lost`,
  and no other body is taken.
- A region the target lacks is `blocked`, and the action's next region is chosen.
- Punch and kick each report their own window; footwork brings each target into it on the stand.
- A kick in cooldown is `waiting`, and a ready punch is chosen over it.
- An admitted instance keeps its target through `prepare`; the selector starts nothing on its
  resources meanwhile.
- A move order withdraws an instance; it stops in `prepare` and runs on in `commit`.
- Selection and the candidate table replay the same after a fork.

### 4. Presets on the shared decisions, and orders by identity

What it does:

- Classic, Puncher, Scrapper and Behaviours become behaviours configurations.
- Executors are bounded to their windows, so the straight punch no longer walks itself in from
  afar; Puncher closes in by `approach` instead.
- `ground` takes the focus and keeps its own positioning. It is Scrapper's today, held by
  `docs/reference/ground-combat.md`'s fixtures; expressing support stages in readiness is later
  work.
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

### 5. Lab and editor

What it does:

- The Lab's Attack shows the focus, the candidate table with readiness and estimates, the live
  instances with phase, stage, holds and observations, and the ledger's counts. It drops its own
  target choice; a click is an order.
- The editor offers the executors and actions lists, the focus rules and the selector from the
  registrations.
- `docs/architecture.md` (Minds and the skill set), the roadmap's Tactics item and `README.md`'s
  Arena controls are updated, and this plan is deleted.

Checks:

- A brief look in a browser.
- A clicked target stays the focus.
- A target removed after a torso bump does not raise the ledger's target count.
