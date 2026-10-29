# Option Mind follow-up: one mechanism, read from the source

[Option Mind](2026-10-27-option-mind.md)'s design holds; steps 7 to 12 built its general claims for one
case each, beside a list or a copy. This plan makes each claim true as stated, mostly by deleting
code. Option Mind decides by one mechanism: **options, and one policy that selects among those
available each step** ([the design](#the-design)). Everything it chooses (a strike, a cover, where
to go and at what gait, the rise, holding still) is an option; nothing is chosen beside the policy
(built: the set by claims, `Chooser.decide`, the rest options, `rest.ts`, the rise as options,
`groundOptions`, each edge priced by its expected time to standing; the cover, `covers`,
priced by the share of the blow on the head it keeps off; and an option a gait walking where it
is worth most of the places made from the skills, `walkBy`, `windowPlace` and
`outOfPressure`, each looked past to the best option there, `lookingPast`).
The values the options are priced by are read from the rules and the records, not copies of them
(built: a blow's life is the rules' damage, `blowLife` and the drill's recorded contacts; the
orders one weight), through one profile interface (built: `readProfile`, the profiles mind data);
letting go is measured across the wind-up; every mind is felled on one stand-up bed (built:
`buildFall`); one trainer trains any part (built: the learner seam, `Learner`, and one case
environment, `research/case-learning-environment.mjs`); and the legs bear on whichever ends the
body has. It lands before Option Mind step 13, which builds on its options, and before any training run, which
optimises against its values.

## Why

Every training run, profile and fight reading is priced by these values and decided by this
policy. A copy of a rule drifts when the rule changes; a list drops the entry added later; a
second decision path is a second thing to train and to explain. Each is cheaper to remove now than
after skills are trained against it.

## The design

- **An option is a skill applied to a target**, priced by the skill's profile at that target:

  | Skill | Target | Its profile indexed by |
  | --- | --- | --- |
  | each strike | the focus | range, the foe's phase, progress |
  | each gait: braced, run (`GAITS`, `src/core/skills/gaits.ts`) | a goal | distance to the goal |
  | each cover | a threat | the threat's distance |
  | each ground technique and mode | the body as it lies | the ground posture |
  | following orders | the orders | |
  | rest: hold the position, a hand at its guard, brace | none | worth 0 |

  The options on offer are the skills crossed with the targets available now, made each step,
  not listed. A skill whose behaviour differs (its profile, its entry, its exit) is its own option;
  a target is a dimension of its profile. The gaits stay the two the legs have, braced and run.
- **The policy selects a set**: the best option, then the best of the rest whose resources
  (`claims`) are still free, until every resource is held, a rest option taking whichever of its
  resources nothing else is worth more on. A strike holding the legs and the trunk runs beside the
  cover and the guard on the hand it does not strike with; between strikes, a gait toward a goal
  runs beside them. An option with a choice of targets (a gait's destinations, `Option.targets`)
  is priced at each and run at the best. By worth or
  by rank are two configurations of the one policy (`chooserOf`); by worth breaks a tie by rank,
  a rest option first, so options priced alike, the unmeasured, are taken in rank order.
- **Below the options, not chosen**: what they read (the situation and its percepts); what prices
  them (`worth`, the position's value); how a chosen option is carried out (the legs, the motor,
  balance, the executors and the arbiter, the run giving way to the walk at its next landing); and
  limits on carrying it out (`keepOut`, a walk kept out of a fallen body's reach and a solid's
  clearance, in the walk skill). The test: where the body could do otherwise and the alternatives
  differ in worth, it is an option; how a chosen thing is done is below them.
- **A gait's cost is its exit.** A run leaves the body unbraced until its next landing, so a strike
  or a cover from there waits; the place an option leaves the body names the seconds until it is
  braced (`Place`, `src/core/entrants/option/options/position.ts`), and the position's exchange there is
  discounted by them. A run is taken only where arriving sooner is worth more than arriving
  unready; no distance chooses it.

## Where it starts

- **The legs stand only on feet.** A legs goal names any of the body's bearing ends
  (`BodySpec.ends`), but the legs bear only on its feet and report the rest unmet; a ground
  technique holds the whole body and pushes every muscle as its run drives it (`groundExecutor`),
  and whether the legs can bear on hands and knees is open ([one path](2026-10-27-option-mind.md#one-path-for-every-motion)).
- **An option is narrow** (step 12, built): its entry, claims, model, step and one status
  (`src/core/entrants/option/options/option.ts`), and Option Mind's intent is the set it selected,
  made one intent by the toolkit (`intentOfSet`).
- **Percepts hold predictions.** Beside readings of the senses, `PERCEPTS`
  (`src/core/entrants/option/options/percepts.ts`) computes from the profiles and the rules every step:
  `danger`, `pressure` and `pressing` (which carry profile readings), `downCost`, `blows` and
  `closes`; and `unbraced` reads the rise's own state. Each of those, the strike's model and the
  gaits' has a measured branch and a hand-built one.
- **A place is a range.** Where an option leaves the body (`Place`,
  `src/core/entrants/option/options/position.ts`) is the range head to head, the chance it is down and the
  seconds until braced, so no position value can price a bearing, a wall, a second foe or the
  posture lying.
- **Option Mind's deciding parts are code.** The valued chooser prices by `FEW_TERMS` alone
  (`src/core/entrants/option/options/chooser.ts`), the options are listed in `optionTactics`, `PERCEPTS` is
  one frozen literal, and a profile is read only by `readProfile`.
- **The rise's options are offered by Stand up's supervisor.** `groundOptions` offers, in a fixed
  cascade, the attempt under way alone, else brace, back off, steady, the edges reading motion,
  land, the edges, a reposition, back off; its modes run on timers and counts (`BRACE_LIMIT`,
  `STEADY_LIMIT`, `BACKOFF`, `RETRIES`, `READY_HOLD`). An edge is priced by a search to standing
  (`toStanding`), not by the posture it leaves the body in; unmeasured on toes, every edge is
  priced alike and taken by rank.
- **Entries and limits are flags** (entries, claims, the walk into reach and low support: step 17,
  built). An option's entry reads `now.down` and `focus.down` where its skill's readiness already answers (the punch's: "body is down", "target is outside the arm's
  height band"); a strike claims the legs and the trunk whatever its action needs; the walk into a
  strike's reach is priced from the reach percept (`rangeOf`, a stock right-hand punch, 0 for a body
  without both hands), not the strike's own window; a blow from low support is refused (the
  `lower` filter in `optionTactics`, a config fault). A downed foe is a flag where its models
  should answer: no pressure or pressing (`NO_PRESSURE`), no exchange or rate (`FEW_TERMS`), no
  clinch (`clinched`); the focus is the nearest standing foe by rule; and the walk is kept 0.9 m from
  every fallen body after the choice (`walk.kept` over the set's intent), the focus included, unpriced
  (step 18, built: each read through its models, the focus chosen by worth). Option Mind has no blow
  that reaches a lying foe (step 19).

## Steps

Each step: `npm run check` and `npm test`; a toolkit change read with the fingerprint against the
commit before, its message naming the cases that move; a run priced on the pool before it runs.
Each corrects the text of [Option Mind](2026-10-27-option-mind.md), the
[architecture](../architecture.md) and the roadmap that it makes true or wrong.

### 11. Bearing ends from the body

Built: the ends a body can bear on are its spec's (`BodySpec.ends`, `src/core/spec/body.ts`): a
biped's feet, hands and knees; `BearingEnd` names one, and the swing, the footing, the feet and the
pose's anchors are keyed by it; the stance walk reports a field naming an end it does not stand on
unmet (`onStanceFeet`); the probes ask every legs to bear kneeling and on hands and knees, and each
reports both unmet. Legs asked both shins lower the body onto its knees and hold it there
(`lowering`, `src/core/mind/rise/lowering.ts`, `KNEEL_DOWN`; the probes' kneeling set borne); asked
hands and knees they report the ends unmet, no lowering found
([the kneel-down](../reference/rising.md#the-kneel-down)).

Left: the legs bear on hands and knees, and on any set of the ends from where the body is, carrying
the root over them as the ground techniques do now (`carryRoot`, `bearLimbs`,
`src/core/control/bearing.ts`; the limbs made from the spec's ends in the control layer,
`riseLimbs` moved there). A ground technique then asks its bearing ends in its legs goal and holds only the limbs it moves, so
an arm it does not use is the policy's for a cover or the guard, and no technique writes the
muscles itself (`groundExecutor`, `src/core/mind/ground/held.ts`).

Check: the probes' kneeling and hands-and-knees sets borne, not reported; the baseline's stand-up
on toes, paired against its record (0 of 32); the owner looks at a rise in the Lab's Stand-up mode,
its unused arm at the guard.

### 12. The option's shape

Built: an option is its entry, its claims, its model, its step and one status (`Status`:
committed, yields, at its exit, or over; `begin` and `end` stay its memory's). Its step returns what
it asks and what that holds (`Step`), and Option Mind's intent is the set it selected, each member's
claims, holds and asks (`SelectedAsk`), made one intent by the toolkit (`intentOfSet`,
`src/core/mind/intent.ts`); other minds write the intent as before. `posture` and `near` went:
nothing read them. A strike never walks: reaching a window is a gait's (`windowPlace`), and the sub-mind
option went with the options fighter. `rest` stays the option's own mark: by rank the rest options
are last, the floor, and by worth a rest option wins a tie, so neither its rank nor its model
(brace is priced as a rise that never stands) can say it.

Check: the gate; the fingerprint against the commit before, Option Mind's cases unmoved.

### 13. Percepts and predictions

Built: a percept reads the senses and the body's own state with fixed geometry and kinematics
(`PERCEPTS`, `src/core/entrants/option/options/percepts.ts`); a prediction reads data a drill, a
training run or the rules make (`PREDICTIONS`: `danger`, `pressure`, `pressing`, `downCost`,
`closes`, `blows`), read through one object (`predictor`, `Situation.predictions`) the first time an
option or the position value asks for it in a step. Each hand-built model is a prior read as a
measured one is: the pressure's and the danger's a profile of one cell (`prior`), the strike's its
cell's expectation (`priorOf`), the gait's braced at once and up (`UNMEASURED`); the fall's cost
already was one (`BY_HAND`, `ground.ts`). So the strike, the pressure, the danger and the gaits keep
one branch each.

A percept's value is a number, a name, or a record of them; `focus` and `orders` stay what the
senses give (a foe's sense, the orders), since the options read their fields, and their cues are
names. `unbraced` stays until step 16: it reads the rise's steady, which becomes an option there.
A skill's own profile reading (`readProfile`'s `expect`) stays the option's: it is read at the
option's progress and range, not the situation's.

Check: the gate; the fingerprint against the commit before, the cases that move named; the step's
time read before and after. Read: no pose moved; a 30 s bout of Option Mind against itself, the
Warrior against the Rogue with clubs (Node, Rapier, 120 Hz, the least of five playings a step),
3.079 and 3.055 ms a step before (c8f56406), 3.062 and 2.947 ms after (2704ba4e).

### 14. Where an option leaves the body

Built: an option's exit (`Place`, `src/core/entrants/option/options/position.ts`) is a
prediction of the percepts it leaves, each by its name: the range head to head (the percept
`range`), the chance of `down`, the seconds `unbraced`, and any other percept it names (`posture`,
lying or standing, `Position`; `around`, the bearing around the focus); a percept it does not
name is as now (`atExit`). The position value reads the exit as it reads the situation, so a
learned one is given every percept and `FEW_TERMS` keeps to the range, the chance down and the
seconds unbraced. `posture` is read by the rise's edges (step 16); `around` waits for a position
value that prices a bearing. A profile's cell names the percepts its trials ended in
(`ProfileCell.exit`): the Strike drill records the range head to head where the strike ended, and
a strike leaves the body at its cell's range; an edge's postures are its `ends`.

Check: the gate; the fingerprint against the commit before, the cases that move named; the Strike,
Gait and Cover drills' rungs paired with the step before. Read: no pose moved at any commit of the
step (bbd81957 against 3e9b1fe9, where the profiles were measured again on the trained punch); the
Cover drill's punched and swung rungs play the same; the Strike and Gait drills drive Option Mind by
their own tactics, which read no exit.

### 15. Option Mind's parts by configuration

Built: Option Mind's config names its chooser and, in the valued chooser's slot, its position value
(`FEW_TERMS_PART`, `few-terms`); its predictions (`predictions`: `measured`, the drills' tables, or
`prior`, none, `predictions-part.ts`); and its options, each a part of role `option` making the
options of its kind from what Option Mind gives it (`OPTION_KINDS`, `OptionsGiven`,
`src/core/entrants/option/options/kinds.ts`), in rank order. A drill drives Option Mind by its config
(`Controller.drilled`, `drilledBy`): its options are one script of the drill's tactics
(`scripted`), on offer and committed over the whole body, chosen by Option Mind's chooser on its
percepts, which reports the drill's phase in Option Mind's place; `OptionMindConfig.tactics` is gone.

Two parts of the step stay as they are. The percepts stay Option Mind's own module (`PERCEPTS`): a
part role for them would have one reader. The drill's script stays whole rather than Option Mind's
options narrowed to the skill under test with the drill's orders beside them: orders that name a
skill and its target wait on the orders vocabulary
([Option Mind plan step 13](2026-10-27-option-mind.md#13-footwork-the-guard-and-the-intent)).

Check: the gate; the fingerprint against the commit before, unmoved; the drills read with the
policy in place of the tactics paired with the step before; a person edits Option Mind's options in
the Arena and the link carries them. Read: no pose moved (67cb9f43 against 3e9b1fe9); every Option Mind
drill rung (Cover `punched` and `swung`, Gait `stopped`, Strike `guarding`, `letgo`,
`letgo-punched`, `punching`, `stepping`) plays trial for trial as at eab4ca4d.

The step as asked: Option Mind's config names its position value (`FEW_TERMS` the default), its predictions (the prior,
the measured tables), its options (each a skill kind and its targets, the list `optionTactics`
makes now, in rank order) and the percepts it adds to the toolkit's, an entrant's own as a part is.
A drill drives Option Mind by its config: its subject's options narrowed to the skill under test and a
scripted option for its orders, under the same policy, so `OptionMindConfig.tactics` goes. Each is a
part role the editor shows ([part roles](2026-10-27-option-mind.md#part-roles)).

Check: the gate; the fingerprint against the commit before, unmoved; the drills read with the
policy in place of the tactics paired with the step before; a person edits Option Mind's options in
the Arena and the link carries them.

### 16. The rise chosen by the policy

Built: no supervisor offers Option Mind's rise (`groundOptions`,
`src/core/entrants/option/options/ground.ts`). A technique is on offer where its own entry admits
the body as it lies, once its position is read; a body tumbling is braced its second first
(`BY_HAND.braced`), the one count kept, read from the body: begun on a body still rolling, the
step-up fails more often than begun a second on. Brace, land and steady are options; every way up
is worth where it leaves the body by the position value, a lying posture worth the rise from it
(`riseFrom`, `downCostAt`); a failed attempt moves its way's share done by the rise's record
(`recorded`), in place of `RETRIES` and the back-off. Stand up's supervisor keeps its own; its
search to standing (`toStanding`, `firstEdges`) and the back-off mode went with Option Mind's use.

Read: the gate; the fingerprint against 3e9b1fe9 moves the Option Mind v Option Mind arena case
(empty-handed) and reshapes the club case's state; a bout's step 2.19 ms against 2.13 ms. The
flat-footed stand-up is no longer read (the owner: Option Mind stands on toes); on toes the baseline's
stand-up stands 0 of 32, as before the step: the step-up reaches a crouch and fails, each attempt
priced dearer and tried again. What stands it is the legs bearing on hands and knees (step 11).

The step as asked: each ground technique's entry is its own (`TechniqueRun.admits` on the body as it lies);
brace, land and steady are options worth their models (what a brace saves while tumbling, what the
steady's seconds cost); a failure is the edge's expected cost from that posture, read from its
profile and the attempt's record, in place of `RETRIES` and the back-off; and an edge is worth the
posture it leaves the body in by the position value (step 14), the lying postures among its places,
in place of its search to standing. Stand up's supervisor goes from Option Mind's rise.

Check: the gate; the baseline's stand-up on toes, paired against its record; the owner looks at a
rise in the Lab's Stand-up mode.

### 17. Entries from the skills

Built: an option is on offer where its skill's readiness admits it. The strike's entry is its limbs'
readiness, with no `now.down` or `focus.down` beside it; the legs answer whether they can carry the
body (`legsReadiness`, `src/core/skills/locomotion.ts`), which footwork, hold the position, follow
orders and a hand at its guard ask, and brace the reverse; a hand's cover is on offer down where no
action holds the hand; a strike claims what its blow needs with the limb it strikes with
(`Sight.needs`); the walk into a strike's window is priced over the walk into it
(`windowDistance`, `src/core/mind/action-window.ts`); the reach percept is gone, the pressure's and
the pressing's reach read from their models (`edgeOf`), and each side's prior from its hands'
ranges (both hands, the farther); a blow from low support is a strike like any, the support fold
among Option Mind's skills.
At `629cd10d` the fingerprint moved only Option Mind against Option Mind with clubs; the Strike drill's
five rungs and the Cover drill's two pair with their records at `c5c4bbb0` and `adc1bb47` unchanged
on every figure: both drills drive Option Mind by a script, which none of this reaches.

Check: the gate; the fingerprint against the commit before, the cases that move named; the Strike
and Cover drills' rungs paired with the step before.

### 18. A downed foe through its models

Built: what a foe on the ground brings is read from its models, as a standing foe's is. A profile's
cell names how the two bodies stood as its trials began (`Postures`, `src/core/mind/profile.ts`;
both standing unless named), and `readProfile` reads it at a pair of them; the focus's posture is
read from its sensed root (`sensedPosture`, `src/core/mind/threat.ts`, by `lieBy`, the rise's own
rule) and is a percept (`foePosture`). The pressure reads the focus's strikes at its posture against
the body standing, and the pressing the body's standing against the focus's posture; a prior is of
two standing bodies, so a lying foe with no strike measured from there puts none on the body and
the body's strikes press it only as a profile measured there expects. `FEW_TERMS`, the clinch and
the walk to a goal have no `focus.down` branch: a clinch prices a lying foe's limbs underfoot
([grounded combat](../reference/ground-combat.md#policy-settings)). Each option that asks the legs
keeps its own walk (`Walker.kept`), the focus exempt where it walks to strike, and the strike's
exit prices the clinch at the range it walks to. The focus is chosen by worth: the situation reader
reads at the focus it kept, else the nearest foe, and at each other foe the orders leave open, and
the chooser, with nothing committed, runs its set at the foe whose best option is worth most
(`Chosen.at`). A blow's prior is priced at the segment it aims (`blowLife`'s `at`).
At `b111a4c9` the fingerprint against the commit before each part moved only Option Mind against
Option Mind with clubs (`e210c013`, `43d7cbb4`) and nothing at the focus's choice, every case giving
Option Mind one foe or a Commander's; the Strike drill's five rungs and the Cover drill's two pair with
step 17's records unchanged on every figure.

Check: the gate; the fingerprint against the commit before, the cases that move named; the drills
paired with the step before.

### 19. A blow at a foe on the ground

Built: Option Mind strikes a foe lying within reach of a stomp; the downward blow from low support is
not needed for now (the owner's decision). The stomp is the front kick with its settings as config
keys (`KICK_PART`), its chamber over the target and its height band low
([stomp settings](../reference/front-kicks.md#stomp-settings)), among Option Mind's actions with either
foot at the trunk's middle. A walk into a window on a lying body goes round it to a place beside it
where both feet stand clear of its limbs (`Window.on`, `approachActionWindow`), the body named by
the place it walks to (`MovementRequest`'s `by`) so navigation does not keep it off as a fallen
one. The Strike drill strikes with a hand or a foot, and its `stomping` rung throws each foot at a
Warrior and a Skeleton lying limp on their backs; each reading records the target's posture and
range, which the profiles cut their cells by. A kick returns to its chamber, carried with the
pelvis, before it is placed, so a stomp's foot is withdrawn clear of the body it struck; its stroke
is braced (`EffectorGoal.firm`), and a leg it leaves straight is bent to come back
(`EffectorGoal.unbend`); a kick squares its stance in one step, and has no startup or cooldown
timer: it waits only while one is under way. At `2c92392a` the rung lands 10 of 12, none falls or
stalls; the best blow has 17.6 kg behind the foot at the median, 37 J on the Warrior and 13 J on the
light Skeleton, 0.22 to 0.43 HP a trial on the Warrior (the punch's 0.2 to 1.3), the kick 5.8 s
from its start to its end, and its profile (`2d80df8e`) has Option Mind stomp a lying body under its
own chooser.

Check: the gate; the drill's rungs, the failures watched; the owner watches Option Mind against a
fallen Duellist Skeleton in the Arena.

### 20. Looking one option past

Built: a walk is priced by its gait and the place it leaves the body, and the chooser looks one
option past it. The valued chooser at depth 2 (Option Mind's) adds to a walk the best worth of the
options that answer at the spot it leaves the body (`lookingPast`, `Option.at`), at the situation
the place predicts (`placed`), at the chance the body is up there, less the best of them on offer
now; only a walk names a spot (`Place.at`), so only a walk is looked past. It reads the options'
models at the place, never the world. A strike prices no walk (`through` went): it answers at a
place whose spot lies in its window (`windowHolds`), the ready limb's window carried by its
readiness (`Readiness.window`), after the seconds the gait leaves that strike unready
(`Going.ready`, each gait's profile stopping to throw each strike, by the action). A gait is any of
Move's (`MoveConfig.gaits`, config entries; the stock ones, `STOCK_GAITS`, where it names none).
At `d597bd5b` the stomping rung lands 10 of 12 as at `2c92392a`, none falls, 17.6 kg behind the
foot at the median. Option Mind under its own chooser stomps a lying Skeleton at 0.8, 1 and 1.2 m within
3.3 s, and a lying Warrior at 0.8 and 1 m but not at 1.2 m in 20 s (at `fe82cf01`, first at 9.2 s):
the place beside the body flips between its sides ([roadmap](../roadmap.md#the-ai)). An Option Mind v
Option Mind bout's step (toed Warriors, 30 s; Node, Rapier, 120 Hz) has a mean of 3.23 ms against 3.00
and a median of 2.29 against 2.23; the Crypt runs no Option Mind.

Check: the gate; the fingerprint against the commit before, the cases that move named; the Strike
and Gait drills paired with the step before; Option Mind still walks to a lying Skeleton and stomps it;
the step's time read before and after.

### 21a. Places at distance from the foe

Built: footwork walks to places derived from the skills and the foe's model, each a spot on the
ground (`Spot`), in place of the named goals (`toWindowOf`, `toGoalOf`, `OUT_OF_PRESSURE` and the
`Goal` band went). Each source of places is a kind of option, one option a gait (`walkBy`): into
each strike's window as its readiness gives it (`walk-into-windows`, `windowPlace`), and out of the
focus's pressure on the line from it, past its modelled strikes' reach by what it closes in the
senses' lag (`walk-out-of-pressure`, `outOfPressure`). Holding still is the hold option. A walk is
priced by its route at the gait's pace in each direction to the focus, the foe's pressure while
within its reach on the way, and where it leaves the body; the best option there is the chooser's
(step 20). Each walk stays kept out of every fallen body's reach but the focus's (`Walker.kept`).
Baseline fights (60 bouts: the Duellist and Vanguard on the Warrior, both sides, five loadouts,
three gaps) at `054ed4b3` against `fe82cf01`: a score of 0.383 against 0.417, paired -0.033 +- 0.071;
a margin of -0.032 against -0.048, paired +0.016 +- 0.037. The fingerprint moved only Option Mind v
Option Mind with clubs.

Check: the gate; the fingerprint against the commit before, the cases that move named; the Strike
and Gait drills paired with the step before.

### 21b. A bearing around the foe

In part: a bearing is priced; no place moves the body round the foe. The bearing around the focus
is a percept (`around`) a place predicts (`walkTerms`: the spot's bearing, less what the focus
turns while the walk lasts), and the position value reads it: the foe's pressure waits the time it
takes to turn to face the body (`turning`, at its measured turn, `Predictions.turns`, `turnAt`;
1 rad/s on the Warrior). Tried and not kept: a place behind the focus, round its flank. Two
Option Minds circled each other at the full turn, the walk behind and the walk straight in priced
within a thousandth of a life of each other and swapped every rethink, and neither struck for
1.7 s at 0.9 m; against the Duellist and Vanguard it gained nothing (a score of 0.367 against
0.417, paired -0.05 +- 0.065). Left: bearings from the edges of the foe's striking arc, which its
model gives once a strike profile has bearing as a dimension (a Strike drill rung that strikes from
off the foe's front), so a place aside is on offer only where the foe's arc is narrower than the
body's own.

Check: the gate; the fingerprint against the commit before, the cases that move named; the
baseline fights against their records; the owner watches a bout for circling and dithering.

### 21c. A foe's reach by its limbs and what it holds

Left: a foe with no profile measured on its body is modelled by Option Mind's own strikes (`foeModel`,
"as its own strikes"), read at Option Mind's ranges, and its prior's reach counts its hands alone
(`handsReach`), so a club or a kick reads as a punch. A borrowed profile's ranges and the prior's
reach are read by the limb the strike is of (an arm, a leg, or the held item's points where it is
armed), scaled by the two bodies', and the reading says so (`scaled`). The held item needs the
senses to carry what a body holds. Between bare-handed bodies the arms differ by a few per cent
(the Rogue's hands reach 0.97 of the Warrior's, the Skeleton's 1.12).

Check: the gate; the fingerprint against the commit before, the cases that move named; Option Mind
against an unmeasured foe of another reach, with and without the scaling (`npm run match`).

## Not here

- The downward blow from low support: the stomp strikes a foe on the ground for now (the owner's
  decision).
- A gait beyond braced and run: a new gait is new settings of the legs and its own profile, added
  where a drill shows a place the two lose.
- Other minds' deciding: other minds keep their Move rules, Stand up, their conditions and the
  intent they write, changed only where they share the toolkit.

## Done when

Option Mind decides by one policy over options, each a skill applied to a target and priced by the
skill's profile there, selected as a set by their resources, with nothing chosen beside it: no
default after the choice, no posture branch, no layer, no cover hook, no ordered facing over it, no
gait rule; its goals are made from its skills' entries and the foe's pressure, its gaits braced and
run each an option whose exit names when the body is braced; its rise is options under the same
policy, by rank Stand up fall for fall, by worth by their time to standing. A blow's life is the
rules' damage, read from the records; orders are the one weight; a profile is read through one
interface, names its target, loads from a mind's kit and reports itself stale wherever it is read,
its phase the percept the policy reads; letting go is measured across the wind-up and a running
option priced from where it is; every mind is felled and stood on one bed; one case environment
trains any part on any world kind from a file, the punch's own environment deleted, at a speed read
on what it trains; and the legs bear on the ends the body's spec names, so a ground technique holds
only the limbs it moves and writes no muscle itself. An option is its entry, claims, model, step
and status, and a strike never walks; percepts read the senses alone, and every prediction is
asked of one interface whose prior is a profile, one branch each; an option's exit is the percepts
it leaves, which any position value reads; Option Mind's position value, predictions, options and
added percepts are its config's, and a drill drives it by config, not by tactics in its policy's
place; and the rise is chosen by the policy, each technique on offer by its own entry and worth
the posture it leaves, with no supervisor. Every option's entry is its skill's readiness, its
claims what its action needs, and the walk into its reach priced from its window; a foe on the
ground is priced by its models, the focus chosen by worth and the walk's limits priced in the walk;
and Option Mind strikes a fallen foe. A walk is priced by its gait and where it leaves the body, and the
chooser looks one option past each option that moves the body, on the options' models, never the
world; footwork walks to places at a distance and a bearing from the focus, each derived from a
skill's window or the foe's model, and a bearing is priced by the position value.
