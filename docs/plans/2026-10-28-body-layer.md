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

- **A skill's variants multiply with it.** The learned punch has two layouts (`steered`: its leg
  outputs as pushes, or as asks of the stance), two data keys (`learned-punch`, `stance-punch`), and
  a `halts` setting in three parts' key lists.
- **Two body layers do one job.** The arbiter owns the body by concrete control (each channel,
  effector, hand pose and the stance), fills the free ones with the defaults, and lets an action
  hand some back (`delegate`). Kinetic's composer (`src/core/entrants/kinetic/composer.ts@6b7a7907`) did
  the same with four coarser parts, and every change to the claim landed in both (`legsGoal`).
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
| `legs` | the legs goal (below) | the same |

The body's own rules stay the body's: one of a goal or a point an effector; no push on a point's
chain; no goal or point on a foot the stance bears (`obey`, `src/core/body.ts`, which throws). An
action that holds a foot holds the legs, so the legs goal it writes decides which feet bear.

### One legs goal: a stance goal in part, and a walk

`LegsGoal` is the stance goal's own fields, any of them left out, beside the walk:

- **The walk**: `walk` (the centre of mass's velocity, or none to stand), `face` (the heading a
  walk turns toward), `footing` (where each sole's middle is set), and
  `destination` (where a walk ends, for its stopping). Absent and a walk of none are distinct, as
  today.
- **Any `StanceGoal` field**: `feet`, `centre`, `height`, `heading`, `pose` (its `anchors`
  included), `swing`, `halt`. What the action sets, the legs carry out; what it leaves out, the
  legs fill from the walk as they do today; what they cannot honour, they report (below).
- **What bears is the body's to name**: `feet` names bearing ends the body's spec marks as able
  to bear (a biped's two feet; hands and knees; a quadruped's four), not a side. Legs that cannot
  bear on an end asked report it unmet ([below](#what-the-controllers-did-not-carry-out)), so a
  ground technique and a quadruped's legs ask in the same goal. The game's legs bear on feet.
- **A carriage and a gait, by name**: `carriage`, the fighting pose held standing and kept while
  moving where the gait keeps it (`CARRIAGES`), and `gait`, how the legs move the body (`GAITS`)
  ([Kinetic](2026-10-27-kinetic.md#carriages-and-gaits)). Left out, the legs keep the ones they
  have. A carriage's trunk lean and arms' rest are the trunk's and the arms' owners' posture, read
  from the carriage the legs hold, added when a carriage asks for one; another carriage (orthodox,
  southpaw, low) when a drill asks for it, and a shuffle gait that keeps a carriage's stagger when
  footwork asks for one.

One rule instead of a term a need: a field added to `StanceGoal` is askable by every action with
no new claim term, in the stance's own form.

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

- **the motor** (`MotorControl`, whichever the mind's `motor` slot names): a push on a channel its
  stance drove (a bearing leg, or a foot it swings), a point it could not drive (no stance, no
  solve asked); a posture is a preference under every leg, not a write, and is not reported;
- **the legs**: a field of the legs goal they did not honour, and by how much where it has a size
  (a centre held short of the one asked).

It is read as a percept, not only a log: a skill or the chooser that sees the legs hold the centre
short can step instead of leaning harder. Every mind, the drills, the readouts and the trainers read
it; a learned skill's reward counts what of its asks went unmet, so it learns what the body does.
Kinetic shows it as its `Unmet` detail.

### Each vocabulary term, probed

Each legs-goal field and claim term has a probe: ask it on a body standing or walking, and the body
does it within its task's units and limits, or reports it unmet. The probes run against every legs
and stance implementation the toolkit offers and the swap test's stubs (`tests/swap.test.mjs`), so
another walk or balance controller is swappable by passing them, not by a match.

### A learned skill's inputs and outputs, as data

A learned skill's inputs and outputs are layout files beside its network
(`assets/core/learned-punch.layout.json`, read by `PUNCH_LAYOUT`). Each input is a name: a reading
of the skill's own (the punch's drive: its age, the target from the shoulder, the fist from the
target), which only the skill knows, or a channel's angle or speed; a percept of the registry
([Kinetic](2026-10-27-kinetic.md#percepts-cues-and-goals)) joins them as a name when a skill
reads one. Each output names its claim term (a push on a named channel; the legs goal's `heading`;
its `centre` ahead or across) and its full scale on the leg the file names, scaled by the body's
leg (`legOf`), so a skill trained on one body asks in proportion on another and exactly as trained
on its own. A new layout is data, not code. The general trainer
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
that move. Each code step runs the gate and reads the step's cost before and after. All are
Kinetic's step 2 and land before its baseline evaluation reads the layer
([Kinetic](2026-10-27-kinetic.md) step 6).

### 8. A held control left unwritten

A control an action holds and does not write goes to the defaults, not to neutral; an action that
wants neutral writes its reference; `delegate` goes.

Check: the gate; the fingerprint names the cases that move; each moved case's own reading (the
drill's rung, the kick's, the fold's) no worse, or the step is not kept and the reason recorded.

### 9. The one learned punch

On the toed Warrior (Kinetic's preset, [toes](../reference/toes.md)): the stance layout exported as the
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
unmoved by steps 6 and 7; step 8 is kept or its reason recorded; and there is one learned punch.
