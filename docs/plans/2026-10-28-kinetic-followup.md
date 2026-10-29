# Kinetic follow-up: one mechanism, read from the source

[Kinetic](2026-10-27-kinetic.md)'s design holds; steps 7 to 12 built its general claims for one
case each, beside a list or a copy. This plan makes each claim true as stated, mostly by deleting
code: the values read from the rules and the records, not copies of them; one profile interface;
rest and footwork as options the chooser weighs; the rise chosen by the chooser; letting go
measured across the wind-up; one stand-up bed; one trainer for any part. It lands before Kinetic
step 13, which builds on its goals and options, and before any training run, which optimises
against its values.

## Why

Every training run, profile and fight reading is priced by these values and decided by this
chooser. A copy of a rule drifts when the rule changes; a list drops the entry added later; a
second decision path is a second thing to train and to explain. Each is cheaper to remove now than
after skills are trained against it.

## Where it starts

- **Life is a copy of the rule.** The strike profiles price a hit as `blowDamage(RULES, "blunt",
  energy)` of its one `hit` (`research/strike-profiles.mjs`), while each contact's damage by the
  rules is in the record (`StrikeContact.damage`, `src/evaluation/strike/read.ts`) and `taken` sums
  every contact: a 115 J hit is priced 1.15 HP where the rules dealt 1.01. `lifeOf`
  (`src/core/mind/options/value.ts`) is the same blunt copy on a fixed arena rulebook.
- **Weights beside the one weight.** `ORDERED` (`value.ts`) is a second orders scale;
  `VALUED_DECIDING.keep` (`src/core/mind/options/chooser.ts`) is 1/600 worked out by hand from
  100 J/HP and the Warrior's 6 HP; `CLINCH`, `FOLD_FALLS` (`src/core/mind/options/low.ts`) and `NEAR` (`src/core/mind/options/down.ts`) are
  hand rates and ranges inside worth.
- **A profile is read three ways.** `expect` (`src/core/mind/profile.ts`) returns a raw cell;
  pressure and danger read their own (`cellAt`, `phaseIn`, `src/core/mind/options/percepts.ts`);
  the rise reads `cells[0]` and drops a stale profile silently, in both
  `src/core/mind/options/ground.ts` and `src/core/mind/ground/stand-up.ts`. A cell's phase is a
  hand list of rung names (`PHASES`, `strike-profiles.mjs`), not the `phase` percept; `closing`
  is 0 on every strike cell. A profile names its striker, not its target, and loads only from
  `assets/core/`. The measured model sits under `models["hand-built"]` (`ModelKind`,
  `src/core/mind/options/option.ts`).
- **Fixed code around the chooser.** Kinetic's step (`src/core/entrants/kinetic/tactics.ts`)
  falls back to its own `footwork` when nothing runs, walks a strike to its window (`approach`)
  beside `moveTo("close")`, and offers three goals written by hand; the chooser holds by an
  implicit 0 standing and none down (`top`, `chooser.ts`); `Option.layer` has no reader. A goal is
  only a band of `Reach.apart` (`src/core/mind/options/goals.ts`), its width a fixed 0.25 m (`EDGE.band`), and `close`
  is this body's reach, not a strike's window.
- **The rise is offered one option at a time.** The ground options' plan (`groundOptions`,
  `ground.ts`) picks the single option on offer as Stand up's supervisor did; none yields; the
  fall is priced by hand (`BY_HAND`), no edge being measured on the Warrior.
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

## Steps

Each step: `npm run check` and `npm test`; a toolkit change read with the fingerprint against the
commit before, its message naming the cases that move; a run priced on the pool before it runs.
Each corrects the text of [Kinetic](2026-10-27-kinetic.md), the
[architecture](../architecture.md) and the roadmap that it makes true or wrong.

### 1. Life read from the rules

The strike profiles' `dealt` is the recorded damage of every contact on the target, as `taken`
is; `lifeOf` takes the bout's rulebook and the blow's mechanism. `ORDERED` folds into
`OBEDIENCE`; `OBEDIENCE` and `keep` are written in life as the owner's decisions, not derived by
hand from a body's hit points. One freshness predicate, exported by `profile.ts`, which
`ownModel` calls.

Check: the profiles regenerated from the same records, each cell's `dealt` equal to the records'
summed damage; Kinetic's Strike drill fight rung against the baseline record.

### 2. One profile interface

A profile is read through one interface, `expect(place)`: payoff, duration, exit and the cost of
letting go; the drill table is its first implementation. The strike's model, pressure, danger and
the rise read it; `cellAt`, `phaseIn` and `cells[0]` go, and `models` becomes one `model(now)`.
Every reader reports a stale profile where it loads it. A profile names its target (body key and
spec digest) beside its striker, and reaches a mind through its kit from `assets/core/` and
`assets/entrants/<name>/`, not a module import. A cell's phase is the `phase` percept read on the
striker's senses at the strike's start, so `PHASES` goes; `closing` goes until a drill varies it.

First read whether the strike records hold the foe's state the percept needs; where they do not,
the rungs are played again, priced first.

Check: Kinetic's strikes priced as before wherever the cell is unchanged; the readout says
"measured" only where a cell priced it.

### 3. One stand-up bed

Every mind is felled the same way: on the lone bed, shoved by `targetImpulse` of its own body and
shoved again while it stands (`SHOVED`, `src/lab/ground-mode.ts`), and stood by the target's
verified stand ([rising](../reference/rising.md#the-owners-target)). A fall not made is no
stand-up, not a failure. `FELLING` and the stand bed's separate path go.

Check: the baseline's stand-up read again for Kinetic flat-footed and on toes and for step-up
([the baseline](../reference/baseline.md)), the reference record written with it.

### 4. Rest as an option

Holding the position standing and bracing down are options worth nothing, in the chooser beside
the rest; every mind on the valued chooser lists them, the options fighter as Kinetic. The
chooser's posture branch (`top`) goes, and each mind's `footwork` default with it;
`Option.layer` goes; the body counted down while its rise runs is the
running option's own exit, not a reading rewritten (`Ground.read`).

Check: the fingerprint's moved cases each read on their drill against the baseline record;
`npm run match` of Kinetic against itself at the commit before, a loss fixed or its reason
recorded.

### 5. Goals from the skills

A goal is any percept against a limit read each step (a cue,
[Kinetic](2026-10-27-kinetic.md#percepts-cues-and-goals)), and the footwork options are made from
the skills, not listed: each strike's entry window (its `position`), and out of the foe's pressure
(where its profiles' pressure reaches nothing). A band's width is read from the bodies (the
distance the foe closes in the reaction time), not set. `approach` and the strike's walk into its
window go: a strike is entered from its window, and footwork brings the body there. `GOALS`, the
three `moveTo`s in Kinetic's tactics and `EDGE.band` go. The options fighter is its own mind and
keeps its own footwork (`holdEdge`, `setDistance`).

Check: Kinetic's Strike drill fight rung against the baseline record; `npm run match` of Kinetic
against itself at the commit before, a loss fixed or its reason recorded; a bout looked at.

### 6. The rise chosen by the chooser

Every ground option whose entry admits the body is on offer, each worth its own time and the
expected time to standing from where it ends (`toStanding`, `src/core/mind/ground/graph.ts`) at
the rate of play; the supervisor's limits (`RETRIES`, `BRACE_LIMIT`, `STEADY_LIMIT`) are entry
conditions of the options they limit, and the plan that picks one option goes. An option yields
before its point of no return as a strike does ([letting go](2026-10-27-kinetic.md#letting-go)).

Check: on the baseline's target falls, flat-footed, the chain stands as many as before within a
placebo's spread, in no longer a median; the fingerprint's moved cases named.

### 7. Letting go measured across the wind-up

The Strike drill's letting-go rungs let go at several points of the wind-up, not only the first
decision, and "ready again" is the hand back at its guard, a reading of the body. The profile's
cost of letting go is indexed by the progress of the motion, and a running option is priced from
where it is: its time and payoff left. `keep` stays only where two options alike still change
places step to step without it.

Check: the rungs' readings by progress; the Kinetic plan's measured cost of letting go corrected
to them; `npm run match` of Kinetic against itself at the commit before.

### 8. One trainer for any part

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

## Not here

- The gait chosen by worth in place of Move's rules, and the covers as options: Kinetic step 13.
- The options fighter's own parts (its hand-built strike prices, its edge-hold): it is a separate
  mind, changed only where it shares the toolkit.

## Done when

A blow's life is the rules' damage, read from the records; orders are the one weight; a profile is
read through one interface, names its target, loads from a mind's kit and reports itself stale
wherever it is read, its phase the percept the chooser reads; the chooser has no posture branch,
no fixed default after it, and footwork goals made from the skills' entries and the foe's
pressure; the rise is chosen among every admitted option by its time to standing; letting go is
measured across the wind-up and a running option priced from where it is; every mind is felled
and stood on one bed; and one case environment trains any part on any world kind from a file, the
punch's own environment deleted, at a speed read on what it trains.
