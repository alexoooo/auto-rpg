# The Option Mind, measured for every body

**Begun 2026-11-25, by the owner's order**, after the rat's work ([the rat plan](2026-11-24-rat.md))
found the Option Mind keeping the rat at the edge of the Warrior's reach, and an audit of
`src/minds/option/` found that wait made by guesses written in by hand.

**Written again the same day, by the owner's order.** As first written it fitted each model on
every pairing at once, kept the fits current by one command that refitted whatever had changed,
and read every step on two bodies. That is the recalculation the owner does not want back. The
numbers plan (bodies and what they hold as numbers, begun 2026-11-18) is folded in here and
deleted; what it found is in [the approaches](../approaches.md#minds).

## The goal, in the owner's words

**General, not ad hoc** (2026-11-25): "Since it's broken for every character (regardless of we
only notice it on some but not others), then what we need is a general fix." And: "I want a
comprehensive plan to fix all of these ad-hoc hacks with general and simple mechanisms." And on
the action prior: "I want action prior for PUCT and other uses in the plan. My guess is that the
agent didn't seriously try it and just gave up, we need it for scalability."

**At the game's scale** (2026-11-25): "This game will have dozens of bodies and items, with
hundreds of skills. Will the plan allow us to scale up to this while maintaining fast development
velocity?" And: "the entire point of the measured-mind plan is to scalability and development
velocity". Of the numbers plan (2026-11-18): "we can't have a game with O(N^2 ) scaling, that will
never work"; "i don't want anything in this game to be N^2 (or worse)".

**Without measuring again what is not in hand.** Of the testbed (2026-11-17): "I want to avoid
have to re-calculate things, the goal is development velocity so we want to gracefully fall back
to stale data. If we need to do a lot of re-calculation, that will result in weaker fighting due
to fewer iterations vs accepting some degree of staleness." Of the numbers plan (2026-11-18): "i
don't want to waste time on re-training or re-measuring stuff for different body/loadout -- we
are just starting with the empty-handed warrior as a proof-of-concept". Of this plan (2026-11-25):
"when I'm developing the empty-handed warrior, i don't want to waste time on calculations that
are unrelated to the empty-handed warrior. in other cases (e.g. working on the rat), i might want
it vs the empty-handed warrior. there is no single type of measurement that holds up in general,
it purely depends on what we're working on. we've had a lot of problems with wasting days upon
days on pointless re-calculation -- i don't want to bring that back."

**Done meaning done** (2026-11-25): "we've had a repeated pattern: I ask for a general and
scalable implementation, the agent tells me it's done, and later i learn that what was done is an
ad-hoc hard-coded hack that doesn't scale." Of the numbers step built for a body's stature alone,
the rest written down as not built (2026-11-18): "you decided to not build that, even though I
explicitly told you that it's a must-have?"

So three things at once. Every number the Option Mind predicts with comes from fights the game's
bodies have played, read by a few mechanisms that are the same for every body. What it costs
grows with the bodies, items and skills added, never with their pairings. And work on one body
never waits on another, and never measures another again.

## The rules every mechanism keeps

The wording is the agent's, from the owner's words above; the owner's to change. A mechanism that
breaks one is not done, whatever it reads.

1. **No name is a key, and nothing is one a pairing.** What the Mind reads is found by numbers: a
   body by its stature, mass and reach; what it holds by the mass and reach it adds; a skill by
   its kind and what its model says. A measurement belongs to one thing (a body's skill, a
   body's value), never to a pair of bodies or to a loadout.
2. **A body reads its own measurement where it has one, and the nearest body's where it has
   none.** Measuring is adding: rows to a profile, or one more fit beside those already there. So
   measuring one body never moves a body that has its own, and that is checked each time (below).
   A reading borrowed from the nearest body is coarse (the approaches: three measured bodies do
   not price a fourth as its own trials do). It is there so a new body fights on the day it is
   added, not so it fights well.
3. **Every reading says where it came from**: the body's own, borrowed (from which body, and how
   far off in the numbers), stale (what has changed since it was measured), or by hand. The
   strike profiles already say stale and scaled (`staleness`, `ProfileReading.scaled`), and a
   stale one is still read. The game plays on borrowed and stale readings. Nothing waits on a
   measurement.
4. **Nothing is measured again unless it is asked for.** A measuring command is given what is in
   hand (a body, a skill, a foe) and measures that alone. No command looks for what is stale and
   refits it. A change to the Mind makes the fitted value and the action prior stale, since both
   are fitted to how the Mind played; they stay in use, marked stale, until a reading on the
   body in hand says a refit is worth its cost. A measurement's cost is said before it runs, from
   its first chunk's rate.
5. **A step is read on what it is about, and reported so.** Each step names the bodies it is read
   on before it runs. Its report gives those readings, and names what it moved and did not read.
   "General" is said of a mechanism's code (no body named, one path for every body), never of a
   reading taken on one body.

## The inventory

A script that plays nothing. For each body, empty-handed and as the game arms it, it lists each
thing that body's default Mind reads and where the reading comes from: its own, borrowed (from
which body), stale, by hand, or a table of a pairing. It is built from the assets and the
lookups the Mind itself uses.

This is what catches a mechanism called general that was built for one body: the other bodies'
rows still say borrowed or by hand. It is what is looked at first when work starts on a body. It
replaces any reading taken across every body.

## What a new thing costs

| Added | It fights at once by | Measuring it asks | It never asks |
| --- | --- | --- | --- |
| A body | the nearest body's profiles, value and prior, each marked borrowed | its own skills' drills, and its bouts against the foes in hand | another body measured again; a table for each foe |
| An item | its mass and reach, read from its spec; the trials nearest in those numbers | trials holding it, of the skills that use it | a table for each loadout |
| A skill | its kind and its model, which the action prior reads; its outcomes by hand, listed, until its drill | its drill, on the body that has it | another skill measured again |

Each count is checked against the code when its mechanism lands, and stated in the step's report.

## The mechanisms

The Mind imagines lines of Options and prices each by the life it deals and the life it takes. The
guesses all sit in what it imagines: how long an Option takes, what it deals and takes, where it
leaves the body, where the foe goes meanwhile, and what the place a line ends in is worth. And
with many Options, the search has to know which to look at first. Five mechanisms answer these
for every body.

1. **The fight record.** Every bout and drill played for the work in hand writes rows in one
   format: the state, the Option chosen, and what followed (the life dealt and taken, falls, the
   posture each body ended in, where the foe went). Each fit and each profile is read from rows.
   Nothing is played to fill the record: it holds what the work in hand played, so a pairing
   reads better the more it has been worked on. It grows from what exists:
   `research/minds/fitted-value.mjs collect` (decision states),
   `research/skills/strikes/strike-bouts.mjs --save` (bout records),
   `research/skills/strikes/bout-profiles.mjs` (strike trials from bouts, in the tables' format)
   and `research/minds/foe-placement.mjs collect` (where the foe went).
2. **What each Option does, measured.** The strike profiles already price a strike by the nearest
   measured trials (`src/skills/framework/profile/`), the struck body as numbers on each trial.
   The same reading is used for every kind of Option: walks, holds, the ways up, the brace, the
   cover. Each kind's profile holds how long it took, what it dealt and took, and how it left the
   body. It grows with the skills each body has.
3. **Where the foe goes, and what he deals, measured.** The foe does what the action prior (5)
   says a body like him does in his place: his Options, built from his own body, each weighted by
   its chance, each moving him as its measured model says. What he deals a second is his
   strikes' measured outcomes on a body of the struck one's numbers, each weighted by the chance
   he throws it from there, whether the struck body is standing or lying. This takes the place of
   the pressure tables, which are one a pairing (three today for two bodies), and of the strikes'
   rate, which overprices. A direct fit of where the foe is a moment later
   (`research/minds/foe-placement.mjs`) is read beside it, and kept only if better.
4. **What the end of a line is worth, measured.** The fitted value
   (`src/minds/option/fitted-value.ts`) prices what follows a state from what followed such states
   in fights. It prices the end of every line, including one the horizon cuts and an open Option
   (a hold, a guard). A fit names the bodies whose bouts it was fitted on, and reads each body and
   its foe as numbers. A body reads the fit made on its own bouts, else the nearest body's,
   marked borrowed. A fit for one more body is one more entry and moves no other body. It grows
   with the bodies fitted.
5. **What a body does here, learned: the action prior.** For a state and each Option on offer, the
   chance a body takes it. It reads an Option by what it is and what its model says (its kind,
   whether it is open, its seconds, what it deals and takes, its price), never by its name, so a
   new skill has a prior the day it is added. It is used four ways: to guide the search (PUCT), to
   predict the foe (3), to narrow a wide body's Options before the search, and to decide alone,
   with no search, for a body that cannot afford one. A fit names its bodies, as the fitted
   value's does, and is read by the same rule.

Whether one fit over several bodies reads a new body better than the nearest body's own fit is
read when a body is added that has neither, not before.

## What is guessed now, and what replaces it

From the audit, checked in the code. Each guess shapes every body's choices, though so far only
the rat's fights have shown it.

| Now | Where | What it does | Replaced by |
| --- | --- | --- | --- |
| The end of a line is not priced | `objective.ts` `fewTermsWorth` never reads `path.end`; `chooser.ts` `cutWorth` | A line cut at the horizon, and every hold or guard, is worth the same ending on its back as on its feet | 4 |
| The fitted value reads only the man | `assets/minds/fitted-value.json` fitted on man against man; `fittedOn` | Every other body falls back to the tail's leaf | 1, 4 |
| A second down is priced at the foe's peak | `percepts.ts` `downRateOf` (`Pressure.peak`) | Lying 5 m away costs as much as lying at his feet: 0.075 of the rat's life a second, where its time down in fights cost about 0.004 | 3 |
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

## What a name or a pairing still finds

The numbers plan's census, as the code stands. Rule 1 asks each of these gone.

| What the Mind reads | Found by | Today | What rule 1 asks |
| --- | --- | --- | --- |
| The foe's pressure (`pressure-profiles.json`, `pressureTable`) | both bodies' numbers, near within a span; a table for each pairing measured, and a pairing near none by the strikes' rate | 3: a man on a man, a man on a rat, a rat on a man | mechanism 3; the tables go |
| A strike's outcomes (`strike-profiles.json`, `profilesFor`, `profileAgainst`) | the striker's model (`Measured.body`), across bodies by stature alone (`acrossBodies`); the struck body by its numbers | 18, one a striker's body, skill and limb | the striker by its numbers as the struck body is, its own trials first |
| The foe's strikes (`profilesOn`) | the foe's model, never across bodies; a foe with none is priced as the reader's own strikes, else by hand | the same asset | a foe with none reads the nearest body's, marked borrowed |
| The back step's sways (`step-profiles.json`, `backStepping`) | the stepping body's model | 1, the man's | by numbers, as a strike's |
| How a body stands in a gait (`GAIT_STANCES`, `gaitStance`, `carriageOf`; the back step's `SWAYS_FROM`) | the gait and the model, typed in source | the man's | measured as any Option's (the table above) |
| The edges a body gets up by (`edge-profiles.json`) | the model | 17: 3 bodies by 5 or 6 techniques | by numbers, as a strike's |
| The fitted value (`fitted-value.json`) | the body's name (`bodyOf`, `fittedOn`) | 1, the empty-handed man's | mechanism 4 |
| A body's default Mind (`DEFAULT_MINDS`, `DEFAULT_BODIES`, `src/app/catalog.ts`) | the model, and the body's name | the empty-handed man `option-lean`, the rat `option-presses`, every other `option-tail` | one Mind, each body moved to it when it is read on it (step 12 for the rat) |

What a body holds is already numbers on a trial (the mass held and its reach past the hand,
`Start.held`), and no loadout finds a profile. But no trial crosses a loadout with a skill
measured without it, so a body holding a sword reads its punches' and its stomp's empty-handed
trials, coarse. Of the weapons' own strikes only the bonk with a club has a profile.

Outside the Mind, and one a body, not a pairing: each skill controller's record by model
(`dataOf(...)[model]`) and the mind notes by model.

## How a step is judged

- **Its scope is named before it runs.** By the owner's word the standing scope is the
  empty-handed Warrior. The rat against him is read where the step is about what the rat showed.
  Nothing is played for another body or loadout unless the work is on it or the owner asks.
- **It enters as a kind a person can pick**, by the config path the kinds already there take, the
  game unmoved where it is unset. It becomes a body's default on a reading on that body, as
  `option-lean` became the empty-handed man's. A body not read keeps the Mind it has, and the
  inventory says which guesses that Mind still reads.
- **Unmoved is shown, not said.** The fingerprint, each case it moves named; and where the step
  claims the empty-handed Warrior unmoved, his mirror played to the bit before and after
  (`research/skills/strikes/strike-bouts.mjs --models man --held empty`, 24 gaps, about 80 s).
  The fingerprint alone once missed a move there: its empty-handed cases end before a fall's
  price matters (the approaches).
- **The Warrior**, where he is in scope: a match of 288 warrior-drawn bouts against the game's
  Mind as it stands (`option-lean`), and his knockouts within 60 s on the scorecard beside it.
  Kept as his default only if it does not make him worse.
- **The rat**, where it is in scope: `gaps` against `option-lean` on the man, 1 HP or more by 60 s
  and killed within 60 s, of 48. Before the work, on the rat's Minds at steadiness 25:
  `option-lean` 34 and 19; `option-lean` at best line and aggression 5, 42 and 22;
  `option-presses` 42 and 24.
- **The thinking**: the Mind's time per simulated second beside `option-lean`'s 135 ms; a headless
  look at the Arena with the mind editor open where a config changes.
- A step that reads flat is still kept if it removes a guess and makes no body in its scope
  worse. That is the goal: the same Mind, priced from measurement.

## What done is

The agent's bar, from the owner's words above; the owner's to change.

1. **Each row of the two tables above** is replaced by its mechanism under the five rules, or
   struck by the owner by name. A row written down as not built is not met.
2. **For each body a step was read on**, the inventory shows nothing its default Mind reads by
   hand, and no table of a pairing.
3. **Every other body fights**, and the inventory lists what it borrows. Measuring them is not a
   bar of this plan: each is measured when the work is on it.
4. **The counts in "What a new thing costs"** hold in the code: a sixth body, a second weapon and
   a new skill each ask what the table says, and no table of a pairing.
5. **The action prior** is read each way "tried properly" lists, each variant pickable.
6. **The rat fights on the Mind every body uses** (step 12).
7. **A step's report** names its scope, gives its readings with their spreads, names each case it
   moved and did not read, and gives the inventory rows it changed. A step is called done only
   with these, and only of the bodies it was read on.

The plan is deleted when each of 1 to 6 is met or struck by the owner by name, what worked moved
into the approaches and the skill recipe.

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

Each names its scope. A step measures nothing outside it.

1. **The inventory.** The script, and its first listing for the five bodies. It plays nothing.
   The baselines are those in "How a step is judged", read before this plan.
2. **The fight record and the measuring command.** One row format that each fit and profile
   reads: the decision states `fitted-value.mjs` keeps, with every Option on offer and its model
   (as `move-prior.mjs` keeps them), the share of the search's runs each took, the Option run,
   what followed, and where the foe went. The measuring command is given what is in hand, plays
   that, adds its rows and fits that body's entries. Scope: the format read back from bouts
   already kept; nothing new played.
3. **The end of every line priced** (mechanism 4): the fitted value read at cut lines and open
   Options, through the fitted leaf the man already uses. Scope: the empty-handed Warrior.
4. **The fitted value by the nearest-body rule** (mechanism 4): `fittedOn` gone, a fit naming its
   bodies, a body reading its own or the nearest's. Then the rat's own fit, from its bouts
   against the Warrior, its cost said first against the man's 1044 bouts. Scope: the rat against
   the Warrior; the Warrior shown unmoved.
5. **The action prior** (mechanism 5): fitted on the record, both targets; read in the game as an
   asset, as the fitted value is. Its held-out nats against the price's softmax, by how many
   Options were on offer. Scope: the empty-handed Warrior's record.
6. **PUCT with the prior**, tried as the section above says: the prior-weighted mean first, then
   the run counts, the wide bodies, the refits on its own runs and the bound. Each variant
   pickable. Kept as a body's search if it plays as well for less thinking, or better. Scope: the
   empty-handed Warrior, and the wide bodies that section names.
7. **Where the foe goes** (mechanism 3): the foe's Options built from his own body and weighted by
   the prior, read along every line in place of `carry` and of the same-body reply search; the
   direct placement fit beside it; the foe's turning from the same where nothing else measured
   it. Scope: the rat against the Warrior. It may read flat on the Warrior's mirror (below), which
   is read only before it becomes his default.
8. **What the foe deals** (mechanism 3): his strikes' measured outcomes on the struck body's
   numbers, weighted by the prior, standing or lying, in place of the pressure tables,
   `Pressure.peak` for a second down, and the rate. Read first against the three tables there
   are, on the pairings they measured, with nothing new played. Scope: the rat against the
   Warrior, then the Warrior's mirror before it becomes his default.
9. **What each Option does** (mechanism 2), one kind at a time, each its own commit and its own
   scope: the walks' falls and the clinch together (`CLINCH` and the walk's no-fall go); then the
   ways up, the regain, the settle and the brace; then the cover; then where a fall leaves the
   body; then the unmeasured blows; then the stances.
10. **The prior's other uses at scale**: a wide body's Options narrowed by the prior before the
    search, and a body deciding by the prior alone, each read for strength and thinking. Scope:
    the wide bodies, and a Crypt room of many.
11. **What a name still finds** (its table above): the striker's side, the foe's strikes across
    bodies, the sways and the edges found by numbers. This is code, and it measures nothing.
    Scope: the empty-handed Warrior shown unmoved; the inventory's rows for the other bodies,
    which change from "by hand" or "none" to "borrowed".
12. **The rat on the general Mind.** `option-lean` on the rat, against `option-presses`, by the
    rat's reading. If it is as good, the rat's default becomes the general Mind, and retiring
    `option-presses` waits on the owner's word.

## Parked by the owner

Measured when the work is on them, on the owner's word, and not before (the goal). Rules 1 to 3
hold for them meanwhile: they fight on what they borrow, and the inventory lists it.

- **Trials that cross what is held.** The design kept from the numbers plan: a sparring rung of
  its own, as `sparring-stances` draws stances, a Warrior on a Warrior, each side's loadout taken
  by turns from the game's (empty; a sword; a club; a buckler and a sword), the limbs that hold
  nothing striking.
- **The sword thrust's and the club blow's profiles.**
- **The back step's sways and the gait stances on bodies other than the man.**

## What is known before it starts

- **Borrowed readings are coarse.** Held out over the trials in the assets, a struck body read as
  the nearest measured body lost much of what its own trials give (landed: squared error 0.313
  against 0.170). Pooling the others with the body's numbers among the terms read little better
  (0.278). Three measured bodies do not price a fourth
  ([the approaches](../approaches.md#minds)).
- **A reading merged across bodies moves a body that had its own.** The edges of every loadout
  read together moved the empty-handed mirror in 5 of 24 bouts, and the fingerprint did not show
  it (the approaches). Hence rule 2, and the mirror played to the bit.
- **Modelling the foe changed nothing between two Warriors.** A searched reply, the foe carried on
  for half a second, and a learned model of the foe's strike onset each scored 0.47 to 0.50
  against the game's Mind (`3a7341cb5`, `42690292f`; the approaches' Minds). Between two bodies
  of the same reach, waiting at the edge of reach is about as safe for both, so pricing it better
  moves little. The rat's reach is far shorter than his.
- **The fitted value took 1044 bouts and 623767 states of the man** (fit at `33be0e76f`). A fit
  for another body must reach figures like the man's for far fewer bouts, or its cost is put to
  the owner before it is paid.
- **Measured today**: 18 strike profiles, by body, skill and limb; 3 pressure tables, one a
  pairing; 17 edge profiles; the man's back-step sways; the fitted value, the empty-handed man's.
- **The rat's time down, measured**: up 0.997 of its time at steadiness 25, its downs in fights
  costing about 0.004 of its life a second (the rat plan).
