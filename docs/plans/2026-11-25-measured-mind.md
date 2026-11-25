# The Option Mind, measured for every body

**Begun 2026-11-25, by the owner's order**, after the rat's work ([the rat plan](2026-11-24-rat.md))
found the Option Mind keeping the rat at the edge of the Warrior's reach, and an audit of
`src/minds/option/` found that wait made by guesses written in by hand.

## The goal, in the owner's words

"Since it's broken for every character (regardless of we only notice it on some but not others),
then what we need is a general fix." And: "I want a comprehensive plan to fix all of these ad-hoc
hacks with general and simple mechanisms." And on the action prior: "I want action prior for PUCT and
other uses in the plan. My guess is that the agent didn't seriously try it and just gave up, we
need it for scalability."

So every number the Option Mind predicts with comes from fights the game's own bodies have played,
read by a few mechanisms that are the same for every body. A number written in by hand is kept only
where nothing has been measured, and then it is listed and reported where it is used. The rat
then fights well on the Mind every body uses, and needs no Mind of its own.

## The idea

The Mind imagines lines of Options and prices each by the life it deals and the life it takes. The
guesses all sit in what it imagines: how long an Option takes, what it deals and takes, where it
leaves the body, where the foe goes meanwhile, and what the place a line ends in is worth. And
with many Options, the search has to know which to look at first. Five mechanisms answer these
for every body, from one record of fights:

1. **The fight record.** One collector plays the pairings the game offers, the game's Minds on
   both sides, and keeps every decision: the state, the Option chosen, and what followed. That
   means the life dealt and taken, falls, the posture each body ended in, and where the foe went.
   It grows from what exists: `research/minds/fitted-value.mjs collect` (decision states),
   `research/skills/strikes/strike-bouts.mjs --save` (bout records, which the pressure tables are
   read from) and `research/minds/foe-placement.mjs collect` (where the foe went).
2. **What each Option does, measured.** The strike profiles already price a strike by the nearest
   measured trials (`src/skills/framework/profile/`). The same reading is used for every kind of
   Option: walks, holds, the ways up, the brace, the cover. Each kind's profile holds how long it
   took, what it dealt and took, and how it left the body (standing, or down in which posture),
   read at the nearest recorded situations.
3. **Where the foe goes, measured.** The foe does what the action prior (5) says a body like him
   does in his place: his Options, built from his own body, each weighted by its chance, each
   moving him as its measured model says. Every line reads the foe's pressure at the distance the
   foe will be, whether the body is standing or lying. A direct fit of where the foe is a moment
   later (`research/minds/foe-placement.mjs`) is measured beside it, and kept only if better.
4. **What the end of a line is worth, measured.** The fitted value
   (`src/minds/option/fitted-value.ts`) prices what follows a state from what followed such states
   in fights. It prices the end of every line, including one the horizon cuts and an open Option
   (a hold, a guard). It is fitted on every pairing, with the bodies read as numbers (weight,
   height, reach) rather than by name, so it reads for any body.
5. **What a body does here, learned: the action prior.** For a state and each Option on offer, the
   chance a body takes it. It reads an Option by what it is and what its model says (its kind,
   whether it is open, its seconds, what it deals and takes, its price), never by its name, so a
   new skill has a prior the day it is added. It is used four ways: to guide the search (PUCT), to
   predict the foe (3), to narrow a wide body's Options before the search, and to decide alone,
   with no search, for a body that cannot afford one.

## What is guessed now, and what replaces it

From the audit, checked in the code. Each guess shapes every body's choices, though so far only
the rat's fights have shown it.

| Now | Where | What it does | Replaced by |
| --- | --- | --- | --- |
| The end of a line is not priced | `objective.ts` `fewTermsWorth` never reads `path.end`; `chooser.ts` `cutWorth` | A line cut at the horizon, and every hold or guard, is worth the same ending on its back as on its feet | 4 |
| The fitted value reads only the man | `assets/minds/fitted-value.json` fitted on man against man; `fittedOn` | Every other body falls back to the tail's leaf | 1, 4 |
| A second down is priced at the foe's peak | `percepts.ts` `downRateOf` (`Pressure.peak`) | Lying 5 m away costs as much as lying at his feet: 0.075 of the rat's life a second, where its time down in fights cost about 0.004 | 3, and the pressure read at a lying body |
| The foe stands still in imagined lines | `carry` 0 by default; `option.ts` | Waiting near a foe who would close looks free | 3, 5 |
| The foe's replies are searched only against the same body | `chooser.ts` `repliedSearch` (`bodyOf(focus.spec) !== searched.body`) | Against any other body, replies are never searched | 3, 5: the foe's Options built from his own body, weighted by the prior |
| A walk never falls outside a clinch | `places.ts` `walkTerms` | Walks look safer than strikes, whose falls are measured | 2 |
| The clinch | `value.ts` `CLINCH`: 0.65 m centre to centre, 0.2 falls a second, every body | Holds and walks near the foe fall at one rate, rat or Warrior | 2 |
| Ways up and recoveries not measured | `rise.ts` `WAY_PRIOR` (5 s, 7 in 10), `REGAIN_PRIOR` (9 in 10), `SETTLE_PRIOR` (0.25 s), `BRACED` (1 s) | Getting up is priced by hand for any body without a drill | 2 |
| Blows not measured | `value.ts` record prior (0.3 lands, 0.6 s, weight 3), `BLOW_SPEED` 5 m/s; `percepts.ts` `LANDS` 0.3, `RATE` 1 a second | A foe's limb with no profile is priced by hand | 2 |
| The cover | `cover.ts` `STOPS` 0.6 | A cover keeps off six tenths of any blow | 2 |
| Where a fall leaves the body | `value.ts` `FALLEN` "back" | Every fall is priced as landing on the back | 2 |
| A foe with no turning measured turns at once | `percepts.ts` `turnOf` (Infinity) | Going round a foe is worth nothing | 3, 5 |
| The search weighs every Option evenly | `chooser.ts` `treeSearch`: UCT, no prior | With dozens of Options, 50 runs spread too thin to find the strong line | 5 |
| Stances read by the model's name | `gaitStance`, `carriageOf` (`places.ts`, `back-step.ts`, `percepts.ts`) | A model with no entry gets no stance and no back step | 2, its stance measured like any Option's |
| The rat's own Mind | `option-presses`: best line, aggression 5 | Pushes past the wrong prices for one body | Retired once the rest stands (the owner's word) |

Outside the Mind's prices, the same audit found the trunk opening's aim (`kinds.ts`,
`TRUNK_OPENING`) copied from the Warrior's punch to the sword's thrust. That belongs to the skill
recipe's tuning search, and goes there.

**Not guesses.** The objective's settings are preferences, not predictions: the aggression, the
initiative, the margin, the draw and the reach (`objective.ts`). So are the search's: the horizon
and the runs. They stay as settings a player picks, each default chosen by measuring it.

## Where nothing is measured

One rule for every prediction. Read the record's nearest body, by the body numbers. Where the
record has no body near enough, fall back on the hand-set prior. Every hand-set prior is listed in
one place, and a report names each prior the game's own pairings read. When the work is done, the
game's own pairings read none.

## How each step is judged

- **The Warrior**: a match of 288 warrior-drawn bouts against the game's Mind as it stands
  (`option-lean`). Kept only if the step does not make him worse, and his knockouts within 60 s
  on the scorecard are read beside it.
- **The rat**: `gaps` against `option-lean` on the man, 1 HP or more by 60 s and killed within
  60 s, of 48. Before the work, on the rat's Minds at steadiness 25: `option-lean` 34 and 19;
  `option-lean` at best line and aggression 5, 42 and 22; `option-presses` 42 and 24.
- **Every step**: the fingerprint, each case it moves named; the Mind's thinking per simulated
  second beside `option-lean`'s 135 ms; a headless look at the Arena with the mind editor open
  where a config changes.
- A step that reads flat is still kept if it removes a guess and makes neither body worse. That is
  the goal: the same Mind, priced from measurement.

## At the game's scale

The owner, 2026-11-25: "This game will have dozens of bodies and items, with hundreds of skills.
Will the plan allow us to scale up to this while maintaining fast development velocity?"

So a new body, item or skill must fight sensibly the day it is added, with nothing measured for
it yet, and be measured later by one unattended command. Four rules keep the cost growing with
what is added, not with every pairing of it:

- **Nothing is fitted per pairing.** With dozens of bodies, each holding several items, the
  pairings run to thousands. Each fit reads the two bodies, and what they hold, as numbers: weight,
  height, reach, speed, and the measured strikes' damage and timing. One fit then covers every
  pairing, and a pairing never played is read between the nearest ones. The pressure tables
  already work this way: three tables, matched by the nearest body's height and weight.
- **What is measured is measured per thing, against a few foes.** A skill's profile is measured on
  its own body against a small fixed set of foes, so a new skill costs a fixed number of trials.
  The foe's pressure on a body is read from the foe's own strike profiles and the struck body's
  numbers, not from a table for each pair.
- **The record samples pairings.** Each collection plays pairings drawn at random from what the
  game offers, weighted toward what was added or changed since the last fit, not every pairing.
- **One command keeps it current.** It finds what changed since each asset was fitted (each asset
  names its commit), plays the drills and the sampled bouts for that, refits, and writes a report.
  It runs overnight on the workers. A skill whose data is stale is priced by the nearest-body rule
  meanwhile, and the report names it, so working on a skill never waits on its measurement.

The search's own cost grows with the Options a body has: hundreds of skills mean a body with dozens
on offer, and 50 runs spread evenly over dozens find little. The action prior (5) is what keeps
the search's cost flat as the Options grow.

## The action prior, tried properly

**What was tried before.** PUCT below the root, guided by a prior learned from where searches'
runs went (`7f7b33aff`, `research/minds/move-prior.mjs`): boosted trees over the root's state
and each Option's kind and model, 2.482 nats a root held out against 2.629 for a softmax of the
price. On the man at 50 runs it scored 0.496 against the old game Mind where the same Mind without
it scored 0.646; an even prior read the same, and on the best-line backup PUCT and UCT tied
(0.503). The cause was named: under the mean backup, a state is worth the mean of its lines
weighted by their runs, so PUCT's uneven runs bias that mean toward what the prior likes. It was
removed in the settings' tidy-up (`dca2ce824`).

**What was not tried.** The cause's fix; fewer runs, where a prior earns its keep; a body with
many Options; a prior refitted on the guided search's own runs; the prior at the root; and every
use but PUCT. It was read once, on the one body where a prior can help least, at the one run count
where it is needed least.

**What is tried now, and kept pickable in the game whatever it reads**:

- **The mean weighted by the prior, not by the runs.** A state is worth its lines' worths weighted
  by the prior's chances (as the prior says the body will play), so where the runs go no longer
  moves the mean. With the best-line backup as well.
- **Strength for thinking, not strength at 50 runs.** Each variant at 10, 25 and 50 runs against
  the game's Mind at 50: the point is to play as well for less, so a curve, not one reading.
- **Wide bodies.** The body with the most Options the game offers, and the man offered every
  Option registered that fits him, so the reading is where scale will be.
- **Two targets.** Fitted to where the search's runs went (the search taught by itself, refitted on
  the guided search's runs for two or three rounds), and fitted to what bodies did in the record.
- **The bound.** Exploration 0.5 to 8; an untried Option valued at its prior's chance of its
  parent's worth, at the floor, or at the mean; the prior at the root as well as below it.
- **Its other uses, each read on its own**: the foe predicted by it (step 7), a wide body's Options
  narrowed to those carrying most of its chance before the search, and a body deciding by it alone,
  its strength and its thinking against `option-lean`'s.

A variant that reads flat stays pickable, its reading in its note. It leaves the game only on the
owner's word.

## Steps

1. **The baselines and the report of guesses.** The readings above, taken at one commit. A script
   lists each hand-set prior the game's own pairings read, and how often, by body.
2. **The fight record**: the decision states `fitted-value.mjs` keeps, with every Option on offer
   and its model (as `move-prior.mjs` keeps them), the share of the search's runs each took, the
   Option run, what followed, and where the foe went, in one format that each fit reads, over
   pairings sampled from what the game offers. The one command that keeps the record and the fits
   current starts here, with what exists, and grows a fit at a time.
3. **The end of every line priced** (mechanism 4, first half): the fitted value read at cut lines
   and open Options, through the fitted leaf the man already uses. Judged on the man; the rat
   still reads the tail.
4. **The fitted value for every body** (mechanism 4, second half): fitted on the whole record, the
   bodies as numbers in its features, `fittedOn` gone. Judged on both.
5. **The action prior** (mechanism 5): fitted on the record, both targets, the bodies as numbers;
   read in the game as an asset, as the fitted value is. Its held-out nats against the price's
   softmax, by body and by how many Options were on offer.
6. **PUCT with the prior**, tried as the section above says: the prior-weighted mean first, then
   the run counts, the wide bodies, the refits on its own runs and the bound. Each variant
   pickable. Kept as the game's search if it plays as well for less thinking, or better.
7. **Where the foe goes** (mechanism 3): the foe's Options built from his own body and weighted by
   the prior, read along every line in place of `carry` and of the same-body reply search; the
   direct placement fit beside it; the foe's turning from the same where nothing else measured
   it.
8. **A second down** priced as a second standing is: the foe's measured pressure at the distance
   the foe will be, on a lying body, from the record's moments down. `Pressure.peak` is no longer
   read for it. The pressure is read from the foe's strike profiles and the struck body's numbers,
   so no new table is needed for each pairing.
9. **What each Option does** (mechanism 2), one kind at a time, each step its own commit: the
   walks' falls and the clinch together (`CLINCH` and the walk's no-fall go); then the ways up,
   the regain, the settle and the brace; then the cover; then where a fall leaves the body; then
   the unmeasured blows; then the stances by model.
10. **The prior's other uses at scale**: a wide body's Options narrowed by the prior before the
    search, and a body deciding by the prior alone, each read for strength and thinking on the
    wide bodies and in a Crypt room of many.
11. **The rule for what is not measured**, and the report reading none for the game's pairings.
12. **The rat on the general Mind.** `option-lean` on the rat, against `option-presses`, by the
    rat's reading. If it is as good, the rat's default becomes the general Mind, and retiring
    `option-presses` waits on the owner's word.

## What is known before it starts

- **Modelling the foe changed nothing between two Warriors.** A searched reply, the foe carried on
  for half a second, and a learned model of the foe's strike onset each scored 0.47 to 0.50
  against the game's Mind (`3a7341cb5`, `42690292f`; the approaches' Minds). Between two bodies
  of the same reach, waiting at the edge of reach is about as safe for both, so pricing it better
  moves little. The rat's reach is far shorter than his. Step 7 may read flat on the man, and is
  judged on both bodies.
- **The fitted value took 1044 bouts and 623767 states of the man** (fit at `33be0e76f`). It was
  fitted on one pairing; a fit over sampled pairings, read by the bodies' numbers, must reach the
  man's figures without that many bouts for each body.
- **Measured today**: 18 strike profiles, by body and skill; 3 pressure tables, matched by the
  nearest body.
- **The rat's time down, measured**: up 0.997 of its time at steadiness 25, its downs in fights
  costing about 0.004 of its life a second (the rat plan).
