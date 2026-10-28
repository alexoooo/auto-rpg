# Kinetic, general: one body layer, one vocabulary

The target below the chooser, for [Kinetic](2026-10-27-kinetic.md) and every mind built on the
toolkit's skills: **one body layer**, the arbiter's ownership of the body's controls (`skillSet`,
`src/core/skills/arbiter.ts`); **one claim** in the body's own terms (`BodyCommand`), its legs asked
in **one legs goal** that only the legs make a stance of; and **the body's controllers saying what
they did not carry out**. Kinetic keeps its chooser, percepts and commitments and gives up its own
composer: two body layers become one, and no mind needs to police what its skills write.

## Why

- **The claim grows a field a symptom.** An action's claim (`ActionClaim`,
  `src/core/skills/action.ts`) asks the legs in a `LegsAsk` of four kinds, plus `lower`, `steer`,
  `shift`, a `halt` in the walk, `support` and `delegate`. `shift` and `halt` were added for one
  punch symptom each. They are applied by editing the stance goal after the legs made it
  (`stanceAsked`), and so are the support fold (`SupportSkill.apply`, `support-fold.ts`) and the
  kick, whose `overlay` replaces the whole stance goal (`kick.ts`). Another legs implementation
  would get its goal rewritten under it.
- **Two body layers do one job.** The arbiter owns the body by concrete control (each channel,
  effector, hand pose and the stance), fills the free ones with the defaults, and lets an action
  hand some back (`delegate`). Kinetic's composer (`src/core/entrants/kinetic/composer.ts`) does
  the same with four coarser parts, and every change to the claim lands in both (`stanceAsked`).
- **Refusals police what the body already decides.** A push on a leg the stance drives is
  overwritten by the step's solve (`solveBody`, `src/core/control/solve.ts`), silently; Kinetic
  refuses such writes instead of the body saying it overrode them. A leg the stance does not drive
  is the posture's or an effector goal's (`StanceGoal.feet`, `swing`), as the kick uses, so "no
  write on a leg" is wrong as a rule.
- **Not one weighted solve for everything.** One bounded torque solve over every task
  (`wholeBodyTracking`) was tried and not kept: it stands to 0.2 N s/kg against the stance's 0.6,
  its punch reaches 4.3 m/s against the 6.8 asked, and it costs five to six times as much a step
  ([whole-body spike](../reference/whole-body-spike.md)). The game's controller (the stance and the
  step's solve) stays, and its input is the vocabulary.

## The target

```text
chooser and options (a mind's own) ─▶ Intent: the actions asked, the walk, the facing, the covers
Intent ─▶ the body layer (skillSet): each live action's claim on the controls it holds;
          the defaults (the guard, the walk's arm swing) on the controls left free
claims ─▶ one legs goal, its holder's or the intent's walk ─▶ the legs ─▶ stance goal, or their own drive
everything ─▶ BodyCommand ─▶ the motor (stance, solve) ─▶ what it did not carry out, in its report
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
| `legs` | the legs goal, whole (below) | `legs`, `lower`, `steer`, `shift`, `support`, `overlay`'s stance |
| `delegate` | controls it holds and hands back to the defaults this step | the same |

The body's own rules stay the body's: one of a goal or a point an effector; no push on a point's
chain; no goal or point on a foot the stance bears (`obey`, `src/core/body.ts`, which throws). An
action that holds a foot holds the legs, so the one legs goal it writes decides which feet bear.

### One legs goal

`LegsGoal`, written whole by the action that holds the legs, or made from the intent's walk and
facing where none does. Absent and a walk of none are distinct, as today.

| Field | Says | Today |
| --- | --- | --- |
| `walk` | the centre of mass's velocity, or none to stand | `LegsAsk` free, hold, walk |
| `face` | the heading a walk turns toward; standing, the pelvis does not turn to it (a pelvis turned over planted feet falls) | the same |
| `steer` | a turn added to the heading this step only, unstored | `ActionClaim.steer` |
| `lower` | the centre of mass under its standing height | `lower` |
| `centre` | the centre of mass's place, world, or a shift from where the legs would hold it | `shift`; the kick's `centre` |
| `footing` | where each sole's middle is set | `LegsAsk` place |
| `bearing`, `swing` | the feet that bear, and the other's landing | the kick's stance |
| `pose` | a supported root pitch, its bearing soles captured | the kick's stance; `StanceGoal.pose` |
| `halt` | stop at once: a step not yet lifted is not taken | `LegsAsk` walk's `halt` |
| `fold` | low support: how low, the trunk folded over the thighs | `ActionClaim.support` |
| `destination` | where a walk ends, for its stopping | `Locomotion.goal`'s `destination` |

The legs make it their command in one method, `Locomotion.goal(view, goal, dt)`: a stance goal,
and where they drive the legs themselves (a running gait, `LegsDrive`) or fold the trunk (the
support fold, made a legs implementation over another), the posture and pushes they write on the
legs' and, folding, the trunk's controls. Nothing edits their result after. A field a legs
implementation cannot honour it reports unmet (below), and the claim is otherwise carried out.

### Ownership

The arbiter's, unchanged in kind: each control (`channel:`, `effector:`, `pose:`, `stance`,
`actionResources`) has one owner a step, the live action that holds it (`Executor.needs`) or the
defaults. An action writes only what it holds; a control it holds and does not write is neutral
(its reference angle) unless it delegates it. The defaults write the free controls in a fixed
order: the guard's rest posture, its covers and holds, its hands' poses, the walk's arm swing on a
free arm without a cover. A posture under a goal or point is that chain's preferred angles, not a
competing write: the guard's rest posture stays under its own covers.

### What the controllers did not carry out

Each controller reports, in its state, what of the last command it did not carry out:

- **the motor** (`MotorControl`, whichever the mind's `motor` slot names): a push or posture on a
  channel its stance drove (a bearing leg, or a foot it swings), a point it could not drive (no
  stance, no solve asked);
- **the legs**: a field of the legs goal they did not honour.

Every mind, the drills, the readouts and the punch's trainer read it. Kinetic's refusals and its
`Refused` detail become this report.

### What each need becomes

| Need | In the claim |
| --- | --- |
| Footwork, a walk | the intent's walk and facing, the route made a walk by the navigation (`navigated`) |
| The straight punch | arm and trunk pushes; `legs` with `walk` none, `steer` for the hip turn, `centre` for the weight, `halt` to stop |
| Timing by the gait | a percept of the stance's phase (`view.stance`: `touching`, `velocity`, `plan`); no new term |
| A kick | `legs` with one foot `bearing`, its `centre`, `pose`; the other foot's effector goal |
| Low support | `legs.fold` |
| A parry | the guard's covers at a blow's predicted crossing (`READINGS`, `predictIntercept`), widened to the body and to a weapon's point |
| Another walk | another legs implementation: a `LegsGoal` in, a stance goal or its own drive out |
| Another balance controller | another stance: a `StanceGoal` in, the driven legs' torques and `StanceReading` out |
| A weapon in both hands | goals on the item's points, once the controller can move two arms closing on one item (step 6, a spike) |
| Getting up | a sub-mind with the whole body (`hosting`) until bearing on hands and knees is in the legs goal (step 7, a spike) |

## Changes to Kinetic

- **Its composer goes.** Kinetic's skills are the toolkit's `skillSet` with no support part; its
  four parts, `refusalOf`, the owners table and its refusals are deleted. What it reported refused
  is the motor's and the legs' report.
- **Its tactics and config stay**: Options' chooser over `followOrders` and `strike`, the default
  footwork at the edge of reach, the covers, a drill's tactics in the chooser's place, the stand-up
  in `subs`.
- **What then sets it apart from Options** is its tactics alone (no reflexes, no low support, no
  look past depth 1): a configuration, which a match against Options reads.

## Steps

The toolkit steps are read with the fingerprint against the commit before, and name the cases
that move. Each code step runs the gate and reads the step's cost before and after.

### 1. The legs goal

`LegsGoal` and `Locomotion.goal(view, goal, dt)`, returning the legs' command; `ActionClaim.legs`
the goal, its `lower`, `steer`, `shift` and the walk's `halt` moved into it; `stanceAsked` deleted.
Every legs implementation and caller (`locomotion.ts`, `move.ts`, `walk-run.ts`, the stand-up's and
support recovery's uses, the swap test's stub legs) and every executor (the straight punch, the
combination, the strike's place, the blade, the combat, the kick, the ground kick) moved to it.

Check: the gate; the fingerprint moves no pose; the Strike drill's still and walk rungs of the
learned puncher and Kinetic the same to the bit.

### 2. Nothing edits the stance after the legs

The kick's `overlay` (and `CommandPatch`) become its legs goal (`bearing`, `centre`, `pose`,
`swing`) and its foot's effector goal; the support fold becomes `fold`, made by a legs
implementation over another, and `ActionClaim.support` goes, Vanguard's committed aim with it (a
mixed change: its part and the toolkit, `node scripts/entrant-check.mjs`).

Check: the gate; the fingerprint, or where a case moves, the kick's and the fold's own readings
before and after, named in the commit.

### 3. The controllers report what they did not carry out

The motor's and the legs' report, in their state, so a fork or replay carries it.

Check: the gate; on the still rung, the learned puncher's push layout through the arbiter reports
its leg pushes unmet on every step the stance drives the leg, and its stance layout none.

### 4. Kinetic on the toolkit's body layer

Kinetic's composer deleted; `kineticSkills` is `skillSet` with no support; its refusals detail
reads the report.

Check: the gate; Kinetic's still and walk rungs the same to the bit as before the step; in the
Arena it faces, follows, punches and gets up, looked at.

### 5. The gait as a percept, and covers that parry

The stance's phase in the situation (`PERCEPTS`), which the Kinetic plan's timing by the gait
reads. The guard's covers read the threat predicted at the body, not the head alone, and a held
weapon's point covers as a hand does.

Check: the gate; the walk rung's `asked` fields from the percept equal the drill's own;
`npm run match -- kinetic options` with the wider covers and without, paired; a bout the owner
watches.

### 6. Spike: one item in two hands

Question: can the step's solve and the effector tracker move two arms closing on one held item
(a closed chain; `bodyEffectors` builds serial chains with no shared channel, and the solve's
inverse dynamics ignore the grip's constraint), with a game fighter granted grips (no fighter has
an equipment port; grips are fixed at build)? Answered on the shared strike's cells
([shared-item strikes](../reference/shared-strike.md)) against the Lab's controller. Its own Done
when: the cells' figures on the game's controller, and the answer recorded; the claim gains a
grip term only with a reader.

### 7. Spike: getting up in the legs goal

Question: can `bearing` name hands and knees as the ground techniques bear on them (`carryRoot`,
`bearLimbs`, the plant's limb kinds), so a technique is a claim that leaves an arm it does not
use to the guard, with no assist and no direct muscle writes (the stand-up writes the muscles'
speed and activation itself, `stand-up.ts`; `poseDrive` reads `muscles.turning`, which no view
shows)? Read on the owner's target ([rising](../reference/rising.md#the-owners-target)) at its
rate, not as "the same": a different actuation stands different falls.

## Done when

The toolkit has one body layer, which Kinetic and the arbiter's minds share; an action's legs are
one goal that only the legs make a command of, and nothing edits it after; the motor and the legs
report what they did not carry out; Kinetic has no composer and no refusals of its own; the
learned puncher's and Kinetic's still and walk rungs are unmoved by steps 1, 3 and 4; the kick and
the fold read as before step 2 or as its commit names; the covers parry by match and a bout the
owner watched; and the two spikes' answers are recorded.
