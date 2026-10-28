# Body layer: the toolkit's baseline below the chooser

The toolkit's body layer, for [Kinetic](2026-10-27-kinetic.md) and every mind built on the
toolkit's skills: **one body layer**, the arbiter's ownership of the body's controls (`skillSet`,
`src/core/skills/arbiter.ts`); **one claim** in the body's own terms (`BodyCommand`), its legs asked
in **one legs goal**, a stance goal in part, that only the legs complete; and **the body's
controllers saying what they did not carry out**. Kinetic keeps its chooser, percepts and
commitments and gives up its own composer: two body layers become one, and no mind needs to police
what its skills write.

**It is a baseline, not a rule.** A Mind's contract stays its boundary: its senses and its own body
in, muscle commands and granted grip requests out
([Kinetic](2026-10-27-kinetic.md#what-stays-free)). A mind uses this layer whole, uses a part of it,
swaps a part by configuration, or drives the muscles its own way; nothing in the core requires it.
The probes say whether an implementation honours the legs goal, so it can join the toolkit's
registries; they bind no mind.

## Why

- **The claim grows a field a symptom.** An action's claim (`ActionClaim`,
  `src/core/skills/action.ts`) asks the legs in a `LegsAsk` of four kinds, plus `lower`, `steer`,
  `shift`, a `halt` in the walk, `support` and `delegate`. `shift` and `halt` were added for one
  punch symptom each. They are applied by editing the stance goal after the legs made it
  (`stanceAsked`), and so are the support fold (`SupportSkill.apply`, `support-fold.ts`) and the
  kick, whose `overlay` replaces the whole stance goal (`kick.ts`). Another legs implementation
  would get its goal rewritten under it.
- **A skill's variants multiply with it.** The learned punch has two layouts (`steered`: its leg
  outputs as pushes, or as asks of the stance), two data keys (`learned-punch`, `stance-punch`), and
  a `halts` setting in three parts' key lists; its outputs are a list written by hand
  (`punchChannels`, `src/core/skills/learned-punch.ts`) in metres (`STANCE_FULL`).
- **Two body layers do one job.** The arbiter owns the body by concrete control (each channel,
  effector, hand pose and the stance), fills the free ones with the defaults, and lets an action
  hand some back (`delegate`). Kinetic's composer (`src/core/entrants/kinetic/composer.ts`) does
  the same with four coarser parts, and every change to the claim lands in both (`stanceAsked`).
- **Refusals police what the body already decides.** A push on a leg the stance drives is
  overwritten by the step's solve (`solveBody`, `src/core/control/solve.ts`), silently; Kinetic
  refuses such writes instead of the body saying it overrode them. A leg the stance does not drive
  is the posture's or an effector goal's (`StanceGoal.feet`, `swing`), as the kick uses, so "no
  write on a leg" is wrong as a rule. A learned punch spent ten outputs on leg pushes that never
  acted, and nothing said so ([learned punch](../reference/learned-punch.md#without-its-leg-pushes-and-from-a-walk)).
- **Not one weighted solve for everything.** One bounded torque solve over every task
  (`wholeBodyTracking`) was tried and not kept: it stands to 0.2 N s/kg against the stance's 0.6,
  its punch reaches 4.3 m/s against the 6.8 asked, and it costs five to six times as much a step
  ([whole-body spike](../reference/whole-body-spike.md)). The game's controller (the stance and the
  step's solve) stays, and its input is the vocabulary.
- **Results where the controller gives them, muscles where it does not.** A skill asks for a
  result (a stance, an effector's path, a point's acceleration) wherever the controller carries
  one out as fast as the muscles would. The punch's arm and trunk stay pushes by measurement, not
  by default: driven along a tracked path its arm landed 0 of 32, and the greedy solve's fist
  reached 3.2 to 4.6 m/s ([tried and not kept](../reference/learned-punch.md#tried-and-not-kept)).
  A push is a term of the vocabulary as a result is; the exception is named where it is made.

## The target

```text
chooser and options (a mind's own) ─▶ Intent: the actions asked, the walk, the facing, the covers
Intent ─▶ the body layer (skillSet): each live action's claim on the controls it holds;
          the defaults (the guard, the walk's arm swing) on the controls left free
claims ─▶ one legs goal, its holder's or the intent's walk ─▶ the legs complete it ─▶ stance goal, or their own drive
everything ─▶ BodyCommand ─▶ the motor (stance, solve) ─▶ what it did not carry out, in its report
the report ─▶ the next step's percepts, the drills, the readouts, a trainer's reward
```

### One claim

An action's claim is the body's command in its own terms, its legs as one goal:

| Term | Says | Today |
| --- | --- | --- |
| `posture` | angles, by channel | the same |
| `pushes` | a channel driven by its muscles (`MusclePush`) | the same |
| `effectors` | where an effector's points go and when: a hand's, a foot's, a held item's | the same |
| `points` | an effector's point accelerated or turned (`PointTask`) | the same |
| `handPoses` | a hand's shape | the same |
| `legs` | the legs goal (below) | `legs`, `lower`, `steer`, `shift`, `support`, `overlay`'s stance |

The body's own rules stay the body's: one of a goal or a point an effector; no push on a point's
chain; no goal or point on a foot the stance bears (`obey`, `src/core/body.ts`, which throws). An
action that holds a foot holds the legs, so the legs goal it writes decides which feet bear.

### One legs goal: a stance goal in part, and a walk

`LegsGoal` is the stance goal's own fields, any of them left out, beside the walk:

- **The walk**: `walk` (the centre of mass's velocity, or none to stand), `face` (the heading a
  walk turns toward), `footing` (where each sole's middle is set, `Locomotion.place`), and
  `destination` (where a walk ends, for its stopping). Absent and a walk of none are distinct, as
  today.
- **Any `StanceGoal` field**: `feet`, `centre`, `height`, `heading`, `pose` (its `anchors`
  included), `swing`, `halt`. What the action sets, the legs carry out; what it leaves out, the
  legs fill from the walk as they do today; what they cannot honour, they report (below).
- **What bears is the body's to name**: `feet` names bearing ends the body's spec marks as able
  to bear (a biped's two feet; hands and knees; a quadruped's four), not a side. Legs that cannot
  bear on an end asked report it unmet ([below](#what-the-controllers-did-not-carry-out)), so a
  ground technique and a quadruped's legs ask in the same goal. The game's legs bear on feet.
- **A carriage and a gait, by name** (step 3): `carriage`, the fighting pose held standing and
  kept while moving where the gait keeps it, and `gait`, how the legs move the body
  ([Kinetic](2026-10-27-kinetic.md#carriages-and-gaits)). Left out, the legs keep the ones they
  have.

One rule instead of a term a need: a field added to `StanceGoal` is askable by every action with
no new claim term. Each field has one form, the stance's:

| Today | In the legs goal |
| --- | --- |
| `steer`, a turn added this step | `heading`, the legs' heading (`ActionAround.heading`) plus the turn; unstored, as the walk's stored heading is the legs' own |
| `shift`, from the stance's support | `centre`, world: the support's middle (`view.stance.support`) plus the shift, computed in the action as `stanceAsked` computes it now |
| `lower`, under standing | `height`: `view.standing` less the lowering |
| the walk's `halt` | `halt` |
| the kick's overlay | `feet`, `centre`, `height`, `heading`, `pose`, `swing`, written by the kick |
| `support`, the fold | `height` and `pose`; its trunk flexion is the trunk's owner's (step 2) |
| the square stance the body was built in, one step pattern (`STANCE_GAIT`) | `carriage` and `gait`, by name |

The legs complete it in one method, `Locomotion.goal(view, goal, dt)`: a stance goal, or, for
legs that drive themselves (a running gait, `LegsDrive`), the posture and pushes they write on the
legs' controls only. Nothing edits their result after.

### Ownership

The arbiter's, unchanged in kind: each control (`channel:`, `effector:`, `pose:`, `stance`,
`actionResources`) has one owner a step, the live action that holds it (`Executor.needs`) or the
defaults. An action writes only what it holds. The defaults write the free controls in a fixed
order: the guard's rest posture, its covers and holds, its hands' poses, the walk's arm swing on a
free arm without a cover. A posture under a goal or point is that chain's preferred angles, not a
competing write: the guard's rest posture stays under its own covers.

Open (step 8): a control an action holds and does not write is neutral (its reference angle) today,
unless the action hands it back (`delegate`). Left to the defaults instead, an action that wants
neutral writes it, and `delegate` goes.

### What the controllers did not carry out

Each controller reports, in its state, what of the last command it did not carry out:

- **the motor** (`MotorControl`, whichever the mind's `motor` slot names): a push or posture on a
  channel its stance drove (a bearing leg, or a foot it swings), a point it could not drive (no
  stance, no solve asked);
- **the legs**: a field of the legs goal they did not honour, and by how much where it has a size
  (a centre held short of the one asked).

It is read as a percept, not only a log: a skill or the chooser that sees the legs hold the centre
short can step instead of leaning harder. Every mind, the drills, the readouts and the trainers read
it; a learned skill's reward counts what of its asks went unmet, so it learns what the body does.
Kinetic's refusals and its `Refused` detail become this report.

### Each vocabulary term, probed

Each legs-goal field and claim term has a probe: ask it on a body standing or walking, and the body
does it within its task's units and limits, or reports it unmet. The probes run against every legs
and stance implementation the toolkit offers and the swap test's stubs (`tests/swap.test.mjs`), so
another walk or balance controller is swappable by passing them, not by a match.

### A learned skill's inputs and outputs, as data

A learned skill's inputs and outputs are layout files beside its network. Each input names a percept
of the registry ([Kinetic](2026-10-27-kinetic.md#percepts-cues-and-goals)), so a skill reads what
the chooser and the drills read, and a new input is a name. Each output names its claim term (a push
on a named channel; the legs goal's `heading`; its `centre` ahead or across) and its full scale in
the body's units (a leg's length for a distance, its length a second for a speed), so a skill
trained on one body asks in proportion on another. `punchChannels` and `STANCE_FULL` become the
output file's reader; a new layout is data, not code. The general trainer
([Kinetic](2026-10-27-kinetic.md#one-trainer-for-any-skill)) takes both.

### What each need becomes

| Need | In the claim |
| --- | --- |
| Footwork, a walk | the intent's walk and facing, the route made a walk by the navigation (`navigated`) |
| The straight punch | arm and trunk pushes; `legs` with `walk` none, `heading` for the hip turn, `centre` for the weight, `halt` to stop |
| Timing by the gait | a percept of the stance's phase in the registry (step 6); no new term |
| A fighting pose | a `carriage` by name: data, kept by every gait that keeps it |
| A kick | `legs` with one foot in `feet`, its `centre`, `pose`; the other foot's effector goal |
| Low support | `legs` with `height` and `pose`; the trunk's flexion by its owner |
| Leaning past the support | the legs' report of the centre held short, read as a percept |
| Another gait: a faster run, a steadier walk, a learned one | another gait implementation, by name in the legs' set: a `LegsGoal` in, a stance goal or its own drive out; passes the probes |
| Another balance controller | another stance: a `StanceGoal` in, the driven legs' torques and `StanceReading` out; passes the probes |
| A weapon in both hands | goals on the item's points, once the controller can move two arms closing on one item (open, [roadmap](../roadmap.md#body-and-motor-control)) |
| Getting up | a chain of ground skills, the chooser's as any other, its hands and knees asked as bearing ends in `feet`; each a commitment holding the whole body until legs bear on them ([Kinetic](2026-10-27-kinetic.md) step 12) |
| A quadruped's legs | the same legs goal over its four bearing ends |

## Changes to Kinetic

- **Its composer goes.** Kinetic's skills are the toolkit's `skillSet` with no support part; its
  four parts, `refusalOf`, the owners table and its refusals are deleted. What it reported refused
  is the motor's and the legs' report.
- **Its tactics and config stay**: the options fighter's chooser over `followOrders` and `strike`,
  the default footwork at the edge of reach, the covers, a drill's tactics in the chooser's place,
  the stand-up in `subs`.
- **What then sets it apart from the options fighter** is configuration alone (low support), so
  the options fighter becomes a Kinetic preset ([Kinetic](2026-10-27-kinetic.md) step 14).

## Changes to the learned punch

- **One learned punch.** Its leg outputs are asks of the legs goal (`heading`, `centre`), retrained
  on the toed Warrior with walking starts. On the toed body it lands the Strike
  drill's still rung no less often than the push layout (30 of 32 against 24) and from a walk
  20 of 32 against 0 (`research/runs/kinetic-punch`, 50.7 M decisions, 120 Hz). It replaces the push
  layout: `steered`'s variants, the 18-output layout and the second data key go once no body
  without toes throws the learned punch.
- **Its asks in the vocabulary**: `heading`, `centre` and `halt` of the legs goal, from its layout
  file, in the body's units.

## Steps

The toolkit steps are read with the fingerprint against the commit before, and name the cases
that move. Each code step runs the gate and reads the step's cost before and after. All nine are
Kinetic's step 2 and land before its baseline evaluation reads the layer
([Kinetic](2026-10-27-kinetic.md) step 6).

### 1. The legs goal

`LegsGoal` (the walk, and `StanceGoal`'s fields in part) and `Locomotion.goal(view, goal, dt)`,
which completes it; `feet` typed by the spec's bearing ends, a human's two feet the ends its
legs bear on (`Side` today); `ActionClaim.legs` the goal, its `lower`, `steer`, `shift` and the walk's
`halt` moved into its `height`, `heading`, `centre` and `halt`, each computed in the action in the
same operations as `stanceAsked` and the legs compute it now; `stanceAsked` deleted. Every legs
implementation and caller (`locomotion.ts`, `move.ts`, `walk-run.ts`, the stand-up's and support
recovery's uses, the swap test's stub legs) and every executor (the straight punch, the
combination, the strike's place, the blade, the combat, the kick, the ground kick) moved to it.

Check: the gate; the fingerprint moves no pose; the Strike drill's still and walk rungs of the
learned puncher and Kinetic the same to the bit.

### 2. Nothing edits the stance after the legs

The kick's `overlay` (and `CommandPatch`) become its legs goal (`feet`, `centre`, `height`,
`heading`, `pose`, `swing`) and its foot's effector goal. The support fold becomes `height` and
`pose` in the legs goal of whatever holds the legs, or the defaults' while none does, and
`ActionClaim.support` goes, Vanguard's committed aim with it (a mixed change: its part and the
toolkit, `node scripts/entrant-check.mjs`). Its trunk flexion (`lumbar flexion`, `thoracic
flexion`) is the trunk's owner's: the defaults' posture while low, which an action holding the
trunk writes over. The question is whether the fold holds a low stance with a punch's trunk over it:
it is read before and after on the fold's own readings (the head's drop, the falls), and where the
punch's trunk loses the low stance, the fold becomes an action holding those two channels instead.
The legs never write the trunk.

Check: the gate; the fingerprint, or where a case moves, the kick's and the fold's own readings
before and after, named in the commit.

### 3. Carriages and gaits by name

A carriage is data in one registry (`CARRIAGES`): the feet relative to the heading (width,
stagger, lead side), the height under standing, the trunk's lean and the arms' rest. The square
stance the body is built in is its one entry; another (orthodox, southpaw, low) is added when a
drill asks for it. A gait is an implementation in one registry (`GAITS`, grown from
`src/core/skills/gaits.ts`): today's stance walk (its step pattern, `STANCE_GAIT`, made the gait's
settings, not the balance controller's constants) and the run (`walk-run`); a shuffle that keeps a
carriage's stagger joins when footwork asks for one. The legs slot
holds a set of gaits and hands over between them at their exits (the run to the walk at a landing,
as `walk-run` does now); the legs goal names a carriage and a gait, or leaves them to the set's
choice. Move's gaits and rules become this set, its rules cues over named goals.

Check: the gate; the fingerprint moves no case that asks the square carriage and today's gaits; a
carriage given as data in a scratch configuration (a wider, staggered stance) held standing and
walked by the stance walk, looked at in the Lab.

### 4. The controllers report what they did not carry out

The motor's and the legs' report, in their state, so a fork or replay carries it; the legs' unmet
centre in the situation as a percept (`PERCEPTS`).

Check: the gate; on the still rung, the learned puncher's push layout through the arbiter reports
its leg pushes unmet on every step the stance drives the leg, and its stance layout none.

### 5. The probes

A probe for each legs-goal field and claim term, run against each gait, carriage and stance
implementation and the swap test's stubs; fast (under about 10 s together), in the swap test's
contract.

Check: the gate; each probe fails on a stub that ignores its field (a positive control), and the
game's own legs pass or report.

### 6. The percepts registry, named goals, and a learned skill's layouts

One registry of percepts ([Kinetic](2026-10-27-kinetic.md#percepts-cues-and-goals)), grown from the
options fighter's (`PERCEPTS`, `src/core/mind/options/percepts.ts`), with the gait's phase
(`view.stance`: `touching`, `velocity`, `plan`), the controllers' report and the foe's phase
(its first phases those the threat readings and the down rule give) beside the chooser's
readings. A cue's limit a number or another percept, and the first named goals as cues over it
(`close`, `at the edge`, `out of reach`, `guard to guard`); Kinetic's default footwork asks
`at the edge` where it computes `toEdge` now. A learned skill's input and output layout files and
their reader: the punch's inputs (`PUNCH_FEATURES`, today a vector written by hand) named as
percepts, its outputs as claim terms in the body's units (`punchChannels` and `STANCE_FULL` read
from the file).

Check: the gate; the walk rung's `asked` fields from the gait percept equal the drill's own; the
learned punch through its layout files gives the same actions to the bit as through the code;
Kinetic's still and walk rungs the same to the bit with its footwork on `at the edge`; each named
goal read on the Warrior and the Rogue gives each its own range, in proportion to its reach; on
the Strike drill's still and fight rungs, the foe's phase read against what the target's body was
doing (its strike's contact, its fall, its rise), step by step, its misreadings counted by
phase.

### 7. Kinetic on the toolkit's body layer

Kinetic's composer deleted; `kineticSkills` is `skillSet` with no support; its refusals detail
reads the report.

Check: the gate; Kinetic's still and walk rungs the same to the bit as before the step; in the
Arena it faces, follows, punches and gets up, looked at.

### 8. A held control left unwritten

A control an action holds and does not write goes to the defaults, not to neutral; an action that
wants neutral writes its reference; `delegate` goes.

Check: the gate; the fingerprint names the cases that move; each moved case's own reading (the
drill's rung, the kick's, the fold's) no worse, or the step is not kept and the reason recorded.

### 9. The one learned punch

On the toed Warrior ([Kinetic](2026-10-27-kinetic.md) step 1): the stance layout exported as the
learned punch from the run's best checkpoint by the still and walk rungs; the push layout,
`steered`'s variants and the second data key deleted once no body without toes throws it. Its
retraining ([Punch](2026-10-28-punch.md) step 1) reads the report, its reward counting unmet
asks.

Check: the gate; the Strike drill's still and walk rungs of the learned puncher and Kinetic,
paired with the push layout on the same cases at 120 and 480 Hz
(`research/punch-policy-check.mjs` for 480 Hz); kept where the walk lands more and the still rung
no less.

## Done when

The toolkit has one body layer, which Kinetic and the arbiter's minds share; an action's legs are
one goal, a stance goal in part, that only the legs complete and nothing edits after, its `feet`
the body's bearing ends; the legs
never write the trunk; the motor and the legs report what they did not carry out, read as a
percept and by the punch's trainer; carriages are data and gaits implementations, each by name
in the legs goal; every gait, carriage and stance implementation passes the probes; one percepts
registry holds the chooser's readings, the gait's phase and the report, and goals are named cues
over it; a learned skill's inputs and outputs are layout files in the body's units; Kinetic has no
composer and no refusals of its own; the learned puncher's and Kinetic's still and walk rungs are
unmoved by steps 1, 3, 4, 6 and 7; the kick and the fold read as before step 2 or as its commit
names; step 8 is kept or its reason recorded; and there is one learned punch.
