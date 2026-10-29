# Kinetic follow-up: one mechanism, read from the source

[Kinetic](2026-10-27-kinetic.md)'s design holds; steps 7 to 12 built its general claims for one
case each, beside a list or a copy. This plan makes each claim true as stated, mostly by deleting
code. Kinetic decides by one mechanism: **options, and one policy that selects among those
available each step** ([the design](#the-design)). Everything it chooses (a strike, a cover, where
to go and at what gait, the rise, holding still) is an option; nothing is chosen beside the policy
(built: the set by claims, `Chooser.decide`, and the rest options, `rest.ts`).
The values the options are priced by are read from the rules and the records, not copies of them
(built: a blow's life is the rules' damage, `blowLife` and the drill's recorded contacts; the
orders one weight), through one profile interface (built: `readProfile`, the profiles mind data);
letting go is measured across the wind-up; every mind is felled on
one stand-up bed (built: `buildFall`); one trainer trains any part; and the legs bear on whichever ends the body has. It
lands before Kinetic step 13, which builds on its options, and before any training run, which
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
  (`claims`) are still free, until every resource is held, a rest option taking a resource nothing
  else is worth more on. A strike holding the legs, the trunk and a hand runs beside the other
  hand's cover; between strikes, a gait toward a goal runs beside both hands' covers. By worth or
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
  braced (`Place`, `src/core/mind/options/position.ts`), and the position's exchange there is
  discounted by them. A run is taken only where arriving sooner is worth more than arriving
  unready; no distance chooses it.

## Where it starts

- **Decisions beside the policy.** Kinetic's strike walks to its window (`approach`) beside
  `moveTo("close")`; its three goals are written by hand; a free hand covers after the choice
  (`cover`) rather than as an option. A goal is only a band of `Reach.apart`
  (`src/core/mind/options/goals.ts`), its width a fixed 0.25 m (`EDGE.band`), and `close` is this
  body's reach, not a strike's window. The gait is chosen by Move's rules (`MoveRule`,
  `src/core/skills/move.ts`): braced within 5 m of a foe or a destination, 8.5 m of an ally, else
  run, 0.5 m past a rule before it lets go (`LEAVING`).
- **The rise is offered one option at a time.** The ground options' plan (`planAt`,
  `groundOptions`, `ground.ts`) picks the single option on offer as Stand up's supervisor did, a
  copy of it; none yields; the fall is priced by hand (`BY_HAND`), no edge being measured on the
  toed Warrior (the edges are measured on the flat-footed fighter).
- **Letting go is measured at one instant.** The Strike drill lets go only at the first decision
  (`LETTING_GO`, `src/evaluation/strike/cases.ts`), and "ready again" is the executor's
  bookkeeping, not the hand back at its guard; a running strike is priced as a fresh one.
- **Two trainers.** The learning server's kinds (`research/run-learning-server.mjs`) are the
  punch's own code (`research/punch-learning-environment.mjs`) and a case environment that
  drives only the bare mind (`research/case-learning-environment.mjs`): its rewards read the bare
  mind's inputs, it finds minds only in duels and lone bodies (`combatantsOf`), it holds no cases
  out, and no environment file names a layout. The speed figure was read on the punch's cheaper
  defaults, not `research/environments/punch.json`, and without the trainer's update.
- **Bearing ends are sides.** `BearingEnd` is `Side` (`src/core/spec/body.ts`), so a legs goal
  cannot ask for hands or knees; a ground technique holds the whole body and pushes every muscle
  as its run drives it (`groundExecutor`), and whether the legs can bear on hands and knees is
  open ([one path](2026-10-27-kinetic.md#one-path-for-every-motion)).

## Steps

Each step: `npm run check` and `npm test`; a toolkit change read with the fingerprint against the
commit before, its message naming the cases that move; a run priced on the pool before it runs.
Each corrects the text of [Kinetic](2026-10-27-kinetic.md), the
[architecture](../architecture.md) and the roadmap that it makes true or wrong.

### 5. The rise as options

Every ground option whose entry admits the body is on offer to the policy. Stand up's supervisor's
branches are the options' entries (tumbling or no ground reading for brace, no route stood for
back off, on its feet for steady), and its limits (`RETRIES`, `BRACE_LIMIT`, `STEADY_LIMIT`)
entry conditions of the options they limit, their counts in the options' memory; its precedence is
the options' rank. The body counted down while its rise runs is the running option's exit, not a
reading rewritten (`Ground.read` goes). By worth, each is worth its own time and the expected time to standing from
where it ends (`toStanding`, `src/core/mind/ground/graph.ts`) at the rate of play; unmeasured, as
on toes, the tie goes by rank. `planAt` goes. An option yields before its point of no return as a
strike does ([letting go](2026-10-27-kinetic.md#letting-go)).

Check: by rank, the chain stands the baseline's target falls fall for fall as Stand up does, a
paired difference of 0, before `planAt` is deleted; by worth, flat-footed, it stands as many within
a placebo's spread, in no longer a median; the fingerprint's moved cases named.

### 6. Covers as options

Each cover is an option on its hand, its target the threat it covers from, priced by the blow it is
expected to stop and where it leaves the body (its profile, the Cover drill's); `cover`'s hook
after the choice goes. The Cover drill ([Drills](2026-10-24-drills.md) step 8) lands before it,
reading Kinetic's covers as they are now, the reference this step is paired against.

Check: the Cover drill's rungs paired with the step before; a bout looked at.

### 7. Goals from the skills

A goal is any percept against a limit read each step (a cue,
[Kinetic](2026-10-27-kinetic.md#percepts-cues-and-goals)), and the goals on offer are made from the
skills, not listed: each strike's entry window (its `position`), and out of the foe's pressure
(where its profiles' pressure reaches nothing). A band's width is read from the bodies (the
distance the foe closes in the reaction time), not set. `approach` and the strike's walk into its
window go: a strike is entered from its window, and a gait toward that window brings the body
there, worth the strike the position's exchange counts from it (`pressing`). `GOALS`, the three
`moveTo`s in Kinetic's tactics and `EDGE.band` go. The options fighter is its own mind and keeps
its own footwork (`holdEdge`, `setDistance`).

Check: Kinetic's Strike drill fight rung against the baseline record; `npm run match` of Kinetic
against itself at the commit before, a loss fixed or its reason recorded; a bout looked at.

### 8. Gaits as options

Each gait, braced and run, is an option toward each goal ([the design](#the-design)), its profile
the gait's: top speeds (its envelope, `src/core/control/stance-envelope.ts`), and, measured on the
body by a drill of the two gaits (from each, at its speeds, stopped and asked its strike), the
seconds until it is braced and its strike ready, and the share that fell. The place an option
leaves the body names the seconds until it is braced, and the position discounts its exchange by
them. Move's rules leave Kinetic (`MoveRule`, `LEAVING`; the keep margin holds a gait as it holds
any option); other minds keep theirs.

Check: the gait drill's readings for both gaits on the toed Warrior; the baseline evaluation's
walk against the baseline record; `npm run match` of Kinetic against itself at the commit before,
a loss fixed or its reason recorded; a bout looked at, the owner judging when it runs.

### 9. Letting go measured across the wind-up

The Strike drill's letting-go rungs let go at several points of the wind-up, not only the first
decision, and "ready again" is the hand back at its guard, a reading of the body. The profile's
cost of letting go is indexed by the progress of the motion (a field of the profile's place, `ProfilePlace`), and a running option
is priced from where it is: its time and payoff left. `keep` stays only where two options alike
still change places step to step without it.

Check: the rungs' readings by progress; the Kinetic plan's measured cost of letting go corrected
to them; `npm run match` of Kinetic against itself at the commit before.

### 10. One trainer for any part

A learnable part takes a network or none; with none it publishes its inputs, when it decided, and
reads its outputs from its state, as the bare mind does. The learned punch's `steered` takes that
seam, so one case environment trains any part an environment file names (a mind's configuration
and the path of its part), on any world kind that lists the minds it hosts. Its reward terms are
percepts and the case's readings named in the file, not a learner's inputs; its input and output
layouts are files; its starts are split train and held-out by their keys' digests; its start pool
(saved worlds refreshed when idle) is the punch environment's. The punch's own environment goes.

Check: the punch through the case environment gives the punch environment's observations and
rewards at the commit before to the bit on the same seeds; the trainer's speed read again on
`research/environments/punch.json` with the trainer's update, the
[trainer's speed](../reference/learned-punch.md#the-trainers-speed) and the plan's hours figure
corrected to it.

### 11. Bearing ends from the body

The ends a body can bear on are its spec's, beside its `marks` (`BodySpec`,
`src/core/spec/body.ts`): a biped's feet, hands and knees. `BearingEnd` names one of them, not a
`Side`, and the swing, the footing and the pose's anchors are keyed by it. The legs bear on any set
of them, carrying the root over them as the ground techniques do now (`carryRoot`, `bearLimbs`,
`src/core/control/bearing.ts`), or report an end they cannot bear on unmet. A ground technique asks
its bearing ends in its legs goal and holds only the limbs it moves, so an arm it does not use is
the policy's for a cover or the guard, and no technique writes the muscles itself (`groundExecutor`,
`src/core/mind/ground/held.ts`).

Check: the probes ask the Warrior to bear on each set of ends (standing, kneeling, on hands and
knees), each borne or reported unmet; the baseline's flat-footed stand-up stands its 32 falls, in
no longer a median, paired against its record; the owner looks at a rise in the Lab's Stand-up
mode, its unused arm at the guard.

## Not here

- A gait beyond braced and run: a new gait is new settings of the legs and its own profile, added
  where a drill shows a place the two lose.
- Other minds' deciding: the options fighter keeps its own parts (its hand-built strike prices, its
  edge-hold) and other minds their Move rules and Stand up, changed only where they share the
  toolkit.

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
only the limbs it moves and writes no muscle itself.
