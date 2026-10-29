# Kinetic follow-up: one mechanism, read from the source

[Kinetic](2026-10-27-kinetic.md)'s design holds; steps 7 to 12 built its general claims for one
case each, beside a list or a copy. This plan makes each claim true as stated, mostly by deleting
code. Kinetic decides by one mechanism: **options, and one policy that selects among those
available each step** ([the design](#the-design)). Everything it chooses (a strike, a cover, where
to go and at what gait, the rise, holding still) is an option; nothing is chosen beside the policy
(built: the set by claims, `Chooser.decide`, the rest options, `rest.ts`, the rise as options,
`groundOptions`, each edge priced by its expected time to standing; the cover, `covers`,
priced by the share of the blow on the head it keeps off; and an option a gait walking where it
is worth most of the destinations made from the skills, `moveBy`, `toWindowOf` and
`OUT_OF_PRESSURE`).
The values the options are priced by are read from the rules and the records, not copies of them
(built: a blow's life is the rules' damage, `blowLife` and the drill's recorded contacts; the
orders one weight), through one profile interface (built: `readProfile`, the profiles mind data);
letting go is measured across the wind-up; every mind is felled on one stand-up bed (built:
`buildFall`); one trainer trains any part (built: the learner seam, `Learner`, and one case
environment, `research/case-learning-environment.mjs`); and the legs bear on whichever ends the
body has. It lands before Kinetic step 13, which builds on its options, and before any training run, which
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
  braced (`Place`, `src/core/entrants/kinetic/options/position.ts`), and the position's exchange there is
  discounted by them. A run is taken only where arriving sooner is worth more than arriving
  unready; no distance chooses it.

## Where it starts

- **The legs stand only on feet.** A legs goal names any of the body's bearing ends
  (`BodySpec.ends`), but the legs bear only on its feet and report the rest unmet; a ground
  technique holds the whole body and pushes every muscle as its run drives it (`groundExecutor`),
  and whether the legs can bear on hands and knees is open ([one path](2026-10-27-kinetic.md#one-path-for-every-motion)).
- **An option is narrow** (step 12, built): its entry, claims, model, step and one status
  (`src/core/entrants/kinetic/options/option.ts`), and Kinetic's intent is the set it selected,
  made one intent by the toolkit (`intentOfSet`).
- **Percepts hold predictions.** Beside readings of the senses, `PERCEPTS`
  (`src/core/entrants/kinetic/options/percepts.ts`) computes from the profiles and the rules every step:
  `danger`, `pressure` and `pressing` (which carry profile readings), `downCost`, `blows` and
  `closes`; and `unbraced` reads the rise's own state. Each of those, the strike's model and the
  gaits' has a measured branch and a hand-built one.
- **A place is a range.** Where an option leaves the body (`Place`,
  `src/core/entrants/kinetic/options/position.ts`) is the range head to head, the chance it is down and the
  seconds until braced, so no position value can price a bearing, a wall, a second foe or the
  posture lying.
- **Kinetic's deciding parts are code.** The valued chooser prices by `FEW_TERMS` alone
  (`src/core/entrants/kinetic/options/chooser.ts`), the options are listed in `kineticTactics`, `PERCEPTS` is
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
  `lower` filter in `kineticTactics`, a config fault). A downed foe is a flag where its models
  should answer: no pressure or pressing (`NO_PRESSURE`), no exchange or rate (`FEW_TERMS`), no
  clinch (`clinched`); the focus is the nearest standing foe by rule; and the walk is kept 0.9 m from
  every fallen body after the choice (`walk.kept` over the set's intent), the focus included, unpriced
  (step 18, built: each read through its models, the focus chosen by worth). Kinetic has no blow
  that reaches a lying foe (step 19).

## Steps

Each step: `npm run check` and `npm test`; a toolkit change read with the fingerprint against the
commit before, its message naming the cases that move; a run priced on the pool before it runs.
Each corrects the text of [Kinetic](2026-10-27-kinetic.md), the
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
it asks and what that holds (`Step`), and Kinetic's intent is the set it selected, each member's
claims, holds and asks (`SelectedAsk`), made one intent by the toolkit (`intentOfSet`,
`src/core/mind/intent.ts`); other minds write the intent as before. `posture` and `near` went:
nothing read them. A strike never walks: reaching a window is a gait's (`toWindowOf`), and the sub-mind
option went with the options fighter. `rest` stays the option's own mark: by rank the rest options
are last, the floor, and by worth a rest option wins a tie, so neither its rank nor its model
(brace is priced as a rise that never stands) can say it.

Check: the gate; the fingerprint against the commit before, Kinetic's cases unmoved.

### 13. Percepts and predictions

Built: a percept reads the senses and the body's own state with fixed geometry and kinematics
(`PERCEPTS`, `src/core/entrants/kinetic/options/percepts.ts`); a prediction reads data a drill, a
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
time read before and after. Read: no pose moved; a 30 s bout of Kinetic against itself, the
Warrior against the Rogue with clubs (Node, Rapier, 120 Hz, the least of five playings a step),
3.079 and 3.055 ms a step before (c8f56406), 3.062 and 2.947 ms after (2704ba4e).

### 14. Where an option leaves the body

Built: an option's exit (`Place`, `src/core/entrants/kinetic/options/position.ts`) is a
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
Cover drill's punched and swung rungs play the same; the Strike and Gait drills drive Kinetic by
their own tactics, which read no exit.

### 15. Kinetic's parts by configuration

Built: Kinetic's config names its chooser and, in the valued chooser's slot, its position value
(`FEW_TERMS_PART`, `few-terms`); its predictions (`predictions`: `measured`, the drills' tables, or
`prior`, none, `predictions-part.ts`); and its options, each a part of role `option` making the
options of its kind from what Kinetic gives it (`OPTION_KINDS`, `OptionsGiven`,
`src/core/entrants/kinetic/options/kinds.ts`), in rank order. A drill drives Kinetic by its config
(`Controller.drilled`, `drilledBy`): its options are one script of the drill's tactics
(`scripted`), on offer and committed over the whole body, chosen by Kinetic's chooser on its
percepts, which reports the drill's phase in Kinetic's place; `KineticConfig.tactics` is gone.

Two parts of the step stay as they are. The percepts stay Kinetic's own module (`PERCEPTS`): a
part role for them would have one reader. The drill's script stays whole rather than Kinetic's
options narrowed to the skill under test with the drill's orders beside them: orders that name a
skill and its target wait on the orders vocabulary
([Kinetic plan step 13](2026-10-27-kinetic.md#13-footwork-the-guard-and-the-intent)).

Check: the gate; the fingerprint against the commit before, unmoved; the drills read with the
policy in place of the tactics paired with the step before; a person edits Kinetic's options in
the Arena and the link carries them. Read: no pose moved (67cb9f43 against 3e9b1fe9); every Kinetic
drill rung (Cover `punched` and `swung`, Gait `stopped`, Strike `guarding`, `letgo`,
`letgo-punched`, `punching`, `stepping`) plays trial for trial as at eab4ca4d.

The step as asked: Kinetic's config names its position value (`FEW_TERMS` the default), its predictions (the prior,
the measured tables), its options (each a skill kind and its targets, the list `kineticTactics`
makes now, in rank order) and the percepts it adds to the toolkit's, an entrant's own as a part is.
A drill drives Kinetic by its config: its subject's options narrowed to the skill under test and a
scripted option for its orders, under the same policy, so `KineticConfig.tactics` goes. Each is a
part role the editor shows ([part roles](2026-10-27-kinetic.md#part-roles)).

Check: the gate; the fingerprint against the commit before, unmoved; the drills read with the
policy in place of the tactics paired with the step before; a person edits Kinetic's options in
the Arena and the link carries them.

### 16. The rise chosen by the policy

Built: no supervisor offers Kinetic's rise (`groundOptions`,
`src/core/entrants/kinetic/options/ground.ts`). A technique is on offer where its own entry admits
the body as it lies, once its position is read; a body tumbling is braced its second first
(`BY_HAND.braced`), the one count kept, read from the body: begun on a body still rolling, the
step-up fails more often than begun a second on. Brace, land and steady are options; every way up
is worth where it leaves the body by the position value, a lying posture worth the rise from it
(`riseFrom`, `downCostAt`); a failed attempt moves its way's share done by the rise's record
(`recorded`), in place of `RETRIES` and the back-off. Stand up's supervisor keeps its own; its
search to standing (`toStanding`, `firstEdges`) and the back-off mode went with Kinetic's use.

Read: the gate; the fingerprint against 3e9b1fe9 moves the Kinetic v Kinetic arena case
(empty-handed) and reshapes the club case's state; a bout's step 2.19 ms against 2.13 ms. The
flat-footed stand-up is no longer read (the owner: Kinetic stands on toes); on toes the baseline's
stand-up stands 0 of 32, as before the step: the step-up reaches a crouch and fails, each attempt
priced dearer and tried again. What stands it is the legs bearing on hands and knees (step 11).

The step as asked: each ground technique's entry is its own (`TechniqueRun.admits` on the body as it lies);
brace, land and steady are options worth their models (what a brace saves while tumbling, what the
steady's seconds cost); a failure is the edge's expected cost from that posture, read from its
profile and the attempt's record, in place of `RETRIES` and the back-off; and an edge is worth the
posture it leaves the body in by the position value (step 14), the lying postures among its places,
in place of its search to standing. Stand up's supervisor goes from Kinetic's rise.

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
among Kinetic's skills.
At `629cd10d` the fingerprint moved only Kinetic against Kinetic with clubs; the Strike drill's
five rungs and the Cover drill's two pair with their records at `c5c4bbb0` and `adc1bb47` unchanged
on every figure: both drills drive Kinetic by a script, which none of this reaches.

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
At `b111a4c9` the fingerprint against the commit before each part moved only Kinetic against
Kinetic with clubs (`e210c013`, `43d7cbb4`) and nothing at the focus's choice, every case giving
Kinetic one foe or a Commander's; the Strike drill's five rungs and the Cover drill's two pair with
step 17's records unchanged on every figure.

Check: the gate; the fingerprint against the commit before, the cases that move named; the drills
paired with the step before.

### 19. A blow at a foe on the ground

Left: Kinetic strikes a foe lying within reach of a stomp, and of the downward blow from low support
where its target is high enough (the grounded combat record lands almost nothing 0.27 m off the
floor).

- A stomp: the kick executor (`kick.ts`) driving the sole down onto a lying target, with the front
  kick's support transfer, chamber and return; its readiness gives a window beside the lying body.
- The downward blow (`PATH_STRIKES`' `downward`) among Kinetic's actions, from the support fold.
- Each a strike option and a walk into its window, priced by hand, then by a drill: a rung on a
  lying Warrior and a lying Skeleton.

In part: the stomp is built and measured. It is the front kick with its settings as config keys
(`KICK_PART`), its chamber over the target and its height band low
([stomp settings](../reference/front-kicks.md#stomp-settings)), among Kinetic's actions with either
foot at the trunk's middle. A walk into a window on a lying body goes round it to a place beside it
where both feet stand clear of its limbs (`Window.on`, `approachActionWindow`), the body named by
the place it walks to (`MovementRequest`'s `by`) so navigation does not keep it off as a fallen
one. The Strike drill strikes with a hand or a foot, and its `stomping` rung throws each foot at a
Warrior and a Skeleton lying limp on their backs; each reading records the target's posture and
range, which the profiles cut their cells by. A kick returns to its chamber, carried with the
pelvis, before it is placed, so a stomp's foot is withdrawn clear of the body it struck. At
`4157f5d4` the rung lands 9 of 12 and none falls; the blow is 7.6 J at the median (17.2 J the most),
0.04 to 0.10 HP a trial (the punch's 0.2 to 1.3), and its profile (`3cbe501f`) has Kinetic stomp a
lying body under its own chooser. Left: a heavier blow (the foot meets the trunk pointed down, about
2 kg behind it), a stroke quicker than 10 to 15 s (its placement waits out its deadline in a third
of trials, the leg locked straight), and the downward blow from low support.

Check: the gate; the drill's rungs, the failures watched; the owner watches Kinetic against a
fallen Duellist Skeleton in the Arena.

## Not here

- A gait beyond braced and run: a new gait is new settings of the legs and its own profile, added
  where a drill shows a place the two lose.
- Other minds' deciding: other minds keep their Move rules, Stand up, their conditions and the
  intent they write, changed only where they share the toolkit.

## Done when

Kinetic decides by one policy over options, each a skill applied to a target and priced by the
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
it leaves, which any position value reads; Kinetic's position value, predictions, options and
added percepts are its config's, and a drill drives it by config, not by tactics in its policy's
place; and the rise is chosen by the policy, each technique on offer by its own entry and worth
the posture it leaves, with no supervisor. Every option's entry is its skill's readiness, its
claims what its action needs, and the walk into its reach priced from its window; a foe on the
ground is priced by its models, the focus chosen by worth and the walk's limits priced in the walk;
and Kinetic strikes a fallen foe.
