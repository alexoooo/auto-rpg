# Kinetic follow-up: one mechanism, read from the source

[Kinetic](2026-10-27-kinetic.md)'s design holds; steps 7 to 12 built its general claims for one
case each, beside a list or a copy. This plan makes each claim true as stated, mostly by deleting
code. Kinetic decides by one mechanism: **options, and one policy that selects among those
available each step** ([the design](#the-design)). Everything it chooses (a strike, a cover, where
to go and at what gait, the rise, holding still) is an option; nothing is chosen beside the policy.
The values the options are priced by are read from the rules and the records, not copies of them,
through one profile interface; letting go is measured across the wind-up; every mind is felled on
one stand-up bed; one trainer trains any part; and the legs bear on whichever ends the body has. It
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
  (`holds`) are still free, until every resource is held, a rest option taking a resource nothing
  else is worth more on. A strike holding the legs, the trunk and a hand runs beside the other
  hand's cover; between strikes, a gait toward a goal runs beside both hands' covers. By worth or
  by rank are two configurations of the one policy (`chooserOf`); by worth breaks a tie by rank, so
  options priced alike, the unmeasured, are taken in rank order.
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

- **Life is a copy of the rule.** The strike profiles price a hit as `blowDamage(RULES, "blunt",
  energy)` of its one `hit` (`research/strike-profiles.mjs`), while each contact's damage by the
  rules is in the record (`StrikeContact.damage`, `src/evaluation/strike/read.ts`) and `taken` sums
  every contact: a 115 J hit is priced 1.15 HP where the rules dealt 1.01. `lifeOf`
  (`src/core/mind/options/value.ts`) is the same blunt copy on a fixed arena rulebook.
- **Weights beside the one weight.** `ORDERED` (`value.ts`) is a second orders scale;
  `VALUED_DECIDING.keep` (`src/core/mind/options/chooser.ts`) is 1/600 worked out by hand from
  100 J/HP and the Warrior's 6 HP; `CLINCH`, `FOLD_FALLS` (`src/core/mind/options/low.ts`), `NEAR`
  (`src/core/mind/options/down.ts`), `PRIOR` (`value.ts`) and `LANDS`
  (`src/core/mind/options/percepts.ts`) are hand rates, ranges and shares inside worth.
- **A profile is read three ways.** `expect` (`src/core/mind/profile.ts`) returns a raw cell;
  pressure and danger read their own (`cellAt`, `phaseIn`, `percepts.ts`); the rise reads
  `cells[0]` and drops a stale profile silently, in both `src/core/mind/options/ground.ts` and
  `src/core/mind/ground/stand-up.ts`. A cell's phase is a hand list of rung names (`PHASES`,
  `strike-profiles.mjs`), not the `phase` percept; `closing` is 0 on every strike cell. A profile
  names its striker, not its target, and loads only from `assets/core/`. The measured model sits
  under `models["hand-built"]` (`ModelKind`, `src/core/mind/options/option.ts`).
- **Decisions beside the chooser.** Kinetic's step (`src/core/entrants/kinetic/tactics.ts`) falls
  back to its own `footwork` when nothing runs; walks a strike to its window (`approach`) beside
  `moveTo("close")`; offers three goals written by hand; covers a free hand after the choice
  (`cover`); turns to an ordered facing over every option's (`orderedFacing`); and keeps the walk
  out of reach (`keepOut`). The chooser picks one option and holds by an implicit 0 standing and
  none down (`top`, `chooser.ts`); the hands and the legs beside it are layers (`Layer`, which no
  code reads). A goal is only a band of `Reach.apart` (`src/core/mind/options/goals.ts`), its
  width a fixed 0.25 m (`EDGE.band`), and `close` is this body's reach, not a strike's window. The
  gait is chosen by Move's rules (`MoveRule`, `src/core/skills/move.ts`): braced within 5 m of a
  foe or a destination, 8.5 m of an ally, else run, 0.5 m past a rule before it lets go (`LEAVING`).
- **The rise is offered one option at a time.** The ground options' plan (`planAt`,
  `groundOptions`, `ground.ts`) picks the single option on offer as Stand up's supervisor did, a
  copy of it; none yields; the fall is priced by hand (`BY_HAND`), no edge being measured on the
  toed Warrior (the edges are measured on the flat-footed fighter).
- **Letting go is measured at one instant.** The Strike drill lets go only at the first decision
  (`LETTING_GO`, `src/evaluation/strike/cases.ts`), and "ready again" is the executor's
  bookkeeping, not the hand back at its guard; a running strike is priced as a fresh one.
- **Two stand-up beds.** A mind that takes the Lab's script is read on the stand bed (the target's
  impulse, re-shoved, a verified stand); any other on the lone bed, shoved once by `FELLING`
  (237 N s, `src/evaluation/baseline/cases.ts`, a copy of `targetImpulse`'s arithmetic for a
  79 kg body) and stood by the fight's down rule; a shove that does not fell counts as a failed
  rise.
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

### 1. Life read from the rules

The strike profiles' `dealt` is the recorded damage of every contact on the target, as `taken`
is; `lifeOf` takes the bout's rulebook, which reaches a mind through its host, and the blow's
mechanism. `ORDERED` folds into `OBEDIENCE`; `OBEDIENCE` and `keep` are written in life as the
owner's decisions, not derived by hand from a body's hit points. `CLINCH`, `FOLD_FALLS`, `NEAR`,
`PRIOR` and `LANDS` are each read from what measures them (`NEAR` the foe's reach, `FOLD_FALLS`
the low strike's profile, `PRIOR` and `LANDS` the cell where one prices the blow) or sourced as the
owner's decision. One freshness predicate, exported by `profile.ts`, which `ownModel` calls.

Check: the profiles regenerated from the same records, each cell's `dealt` equal to the records'
summed damage; Kinetic's Strike drill fight rung against the baseline record.

### 2. One profile interface

A profile is read through one interface, `expect(place)`: payoff, duration, exit and the cost of
letting go, at a place that includes the motion's progress (step 9 fills it); the drill table is
its first implementation, and every option's skill (strike, gait, cover, ground edge) is priced
through it. The strike's model, pressure, danger and the rise read it; `cellAt`, `phaseIn` and
`cells[0]` go, and `models` becomes one `model(now)`. Every reader reports a stale profile where it
loads it. A profile names its target (body key and spec digest) beside its striker; a foe other
than its target scales its cells by the two bodies (mass, hit points), and the readout says so,
rather than going stale. It reaches a mind through its kit from `assets/core/` and
`assets/entrants/<name>/`, not a module import. A cell's phase is the `phase` percept read on the
striker's senses at the strike's start, so `PHASES` goes; `closing` goes until a drill varies it.

First read whether the strike records hold the foe's state the percept needs; where they do not,
the rungs are played again, priced first.

Check: Kinetic's strikes priced as before wherever the cell is unchanged; the readout says
"measured" only where a cell priced it.

### 3. One stand-up bed

Every mind is felled the same way: on the lone bed, shoved by `targetImpulse` of its own body and
shoved again while it stands (`SHOVED`, `src/lab/ground-mode.ts`), and stood by the target's
verified stand ([rising](../reference/rising.md#the-owners-target)). A fall not made is a trial
that did not reach its case, reported so, not a failed rise; the record gives the falls made beside
the stands. `FELLING` and the stand bed's separate path go.

Check: the baseline's stand-up read again for Kinetic flat-footed and on toes and for step-up
([the baseline](../reference/baseline.md)), the reference record written with it.

### 4. One policy, selecting a set

The policy selects a set of options by their resources ([the design](#the-design)), each resource
nothing else is worth more on held by its rest option, worth nothing: hold the position (the legs,
facing the focus), a hand at its guard, brace (down). The chooser's posture branch (`top`),
Kinetic's `footwork` default, `Layer` and the commitment-and-default-layer split
([Kinetic](2026-10-27-kinetic.md#one-commitment-and-a-default-layer)) go. An ordered facing is
`followOrders`' own, weighed by obedience, and `orderedFacing`'s override goes; `keepOut` moves
into the walk skill. The body counted down while its rise runs is the running option's exit, not a
reading rewritten (`Ground.read`).

Check: down and alive, a rise option outranks bracing (the position charges a fall, `downCost`);
the fingerprint's moved cases each read on their drill against the baseline record; `npm run match`
of Kinetic against itself at the commit before, a loss fixed or its reason recorded.

### 5. The rise as options

Every ground option whose entry admits the body is on offer to the policy. Stand up's supervisor's
branches are the options' entries (tumbling or no ground reading for brace, no route stood for
back off, on its feet for steady), and its limits (`RETRIES`, `BRACE_LIMIT`, `STEADY_LIMIT`)
entry conditions of the options they limit, their counts in the options' memory; its precedence is
the options' rank. By worth, each is worth its own time and the expected time to standing from
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
cost of letting go is indexed by the progress of the motion (step 2's place), and a running option
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
