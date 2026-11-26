# The Option Mind, measured for every body

**Begun 2026-11-25, by the owner's order**, after the rat's work ([the rat plan](2026-11-24-rat.md))
found the Option Mind keeping the rat at the edge of the Warrior's reach, and an audit of
`src/minds/option/` found that wait made by guesses written in by hand.

The numbers plan (bodies and what they hold as numbers, begun 2026-11-18) is folded in here: its
open work is in this plan, and what it found is in [the approaches](../approaches.md#minds).

## The goal, in the owner's words

**General, not ad hoc** (2026-11-25): "Since it's broken for every character (regardless of we
only notice it on some but not others), then what we need is a general fix." And: "I want a
comprehensive plan to fix all of these ad-hoc hacks with general and simple mechanisms." And on
the action prior: "I want action prior for PUCT and other uses in the plan. My guess is that the
agent didn't seriously try it and just gave up, we need it for scalability."

**At the game's scale** (2026-11-25): "This game will have dozens of bodies and items, with
hundreds of skills. Will the plan allow us to scale up to this while maintaining fast development
velocity?" And: "the entire point of the measured-mind plan is to scalability and development
velocity". Of the numbers plan (2026-11-18): "doing step 6 is necessary because N^2 doesn't
scale"; "we can't have a game with O(N^2 ) scaling, that will never work"; "do the numbers plan
-- we can't have N^2 anywhere"; "i don't want anything in this game to be N^2 (or worse)";
"remove all N^2 (or worse) bottlenecks from the game -- this is what i think the numbers plan is
doing".

**Without measuring again what is not in hand.** Of the testbed (2026-11-17): "I want to avoid
have to re-calculate things, the goal is development velocity so we want to gracefully fall back
to stale data. If we need to do a lot of re-calculation, that will result in weaker fighting due
to fewer iterations vs accepting some degree of staleness." Of the numbers plan (2026-11-18): "re
the back step on other bodies, we can just focus on the empty-handed Warrior for now (it's a
proof-of-concept)"; "you told the worker to spend time on different load outs, when i explicitly
asked you to focus on the empty-handed warrior first as a proof-of-concept?"; "i don't want to
waste time on re-training or re-measuring stuff for different body/loadout -- we are just
starting with the empty-handed warrior as a proof-of-concept". Of this plan (2026-11-25): "when
I'm developing the empty-handed warrior, i don't want to waste time on calculations that are
unrelated to the empty-handed warrior. in other cases (e.g. working on the rat), i might want it
vs the empty-handed warrior. there is no single type of measurement that holds up in general, it
purely depends on what we're working on. we've had a lot of problems with wasting days upon days
on pointless re-calculation -- i don't want to bring that back."

**Best effort, going stale** (2026-11-25): "re the different measurements, it's impossible to
have "correct" values because it's circular -- for example we can measure the skill profiles,
play with the new profiles, and that will change the fights -- so we'd need to keep going until
we reach some kind of fixed point (and that might not even be possible with rock-paper-scissors
like dynamcics). so really it's fundamentally a best effort, what i want is for existing
measurements to go gradually stale as new measurements are made, and from time to time we can
refresh them."

**A fix is every body's** (2026-11-25): "if the change is fixing something that's broken, then it
should apply to all minds -- we don't want to knowingly keep broken or bad code. same goes for a
change that improves scalability or performance. but if the change is specific to one particular
situation that we're working on, that it doesn't really make sense to apply it to all bodies."

And of a fix that reads worse being held back (2026-11-25): "no, if a fix does worse, that's an
indicator that something else is broken -- how does it make sense that fixing something that's
broken would make fighting worse?"

**Done meaning done** (2026-11-25): "we've had a repeated pattern: I ask for a general and
scalable implementation, the agent tells me it's done, and later i learn that what was done is an
ad-hoc hard-coded hack that doesn't scale." Of the numbers step built for a body's stature alone,
the rest written down as not built (2026-11-18): "you decided to not build that, even though I
explicitly told you that it's a must-have?" And of a skill searched for days with no one looking
at it (2026-11-25, [the kick's plan](2026-11-25-kicker-falls.md)): "i don't want to waste
multiple days again, how do we change teh skill development process to force you to follow the
instructions?"

So five things at once. Every number the Option Mind predicts with comes from fights the game's
bodies have played, read by a few mechanisms that are the same for every body. What the game
needs measured grows with the bodies, items and skills added, never with their pairings. Work on
one body never waits on another, and never measures another again. And no measurement is taken
for correct: each is of the game as it was when it was made, grows stale as the game moves on,
and is made again when someone chooses to, never because something else was. A fix, or a gain
in scale or speed, is every body's on the day it lands, read on them or not; only what is one
situation's stays one body's.

## The rules every mechanism keeps

The wording is the agent's, from the owner's words above; the owner's to change. A mechanism that
breaks one is not done, whatever it reads.

Each rule is held by something that refuses, as a skill's search is held by its look
(`requireLook`, `research/look-gate.mjs`). A rule kept only in a document is how the pattern
above happened.

A gate holds that a step was taken, not that its judgment was right: the look's gate passes on a
verdict the agent itself writes. So what an agent judges of its own work (a number's sort, a
setting called one situation's, a step called done) is also put to a reader who did not do the
work, told to refute it (the procedure's step 5).

1. **No name is a key, and nothing has to be measured a pairing.** What the Mind reads is found
   by numbers: a body by its stature, mass and reach; what it holds by the mass and reach it
   adds; a skill by its kind and what its model says. A measurement is rows of one body doing one
   thing, the other body written on each row as numbers. Any pairing fights on what each body has
   of its own. Rows from a pairing that has been played make that pairing read better; none is
   needed for the game to play it, and none is a table to keep. (Put to the owner on 2026-11-18
   as how the trials' square goes, trials coming from fights so the pairs that meet read well
   from play: "your recommendation makes sense".)
   *Held by* the inventory's check, which fails on a name or a pairing that finds a reading and
   is not on its list. The list is this plan's two tables, and once step 1 has audited them
   again it only shrinks. And by the made-up body (the inventory, below): it has no rows, so a
   reading it finds as its own was found by a name. A lookup that is mended takes a body as its
   numbers alone, as the struck body is taken already (`struckNumbers`), so it cannot see a
   name.
2. **A reading is taken from the rows nearest in the numbers.** Those are the body's own where
   it has any, holding what it holds, against the foe nearest the one it faces. Measuring is
   adding: rows to a profile, or one more fit beside those already there. So adding rows moves
   only what was borrowed there. A body with its own rows, against a foe it had measured, reads
   as it did when another body's rows are added. (Its own rows made again do move it: rule 4.)
   A reading that pools every row does not keep this (the written form does so today, below). A
   reading borrowed from the nearest body prices worse than the body's own, by how much is not
   settled ([the approaches](../approaches.md#minds)). It is there so a new body fights on the
   day it is added, not so it fights well.
   *Held by* the measuring command: it reads every body and foe that had their own rows before
   it adds and after, and writes nothing if one moved. It plays nothing to do so.
3. **Every reading says where it came from**, of the body and of the foe: its own, borrowed
   (from which, and how far off in the numbers), or by hand; and how stale it is, which is what
   has changed since it was measured: the body, the skill, the Minds that fought, and what they
   in turn read. Stale is a degree, not a fault. The game plays on borrowed and stale readings.
   Nothing waits on a measurement.
   Today a strike profile says when it was measured at other settings (`staleness`) and when it
   is read for another body (`ProfileReading.scaled`), and keeps digests of the body and skill
   it was measured on (`from`) that nothing compares; the fitted value keeps one line of where
   it came from (`origin`). The numbers that stand in where nothing measured reads are behind
   one interface (`Guesses`, `src/minds/option/contract/predictors.ts`; `BY_HAND`,
   `predictions/by-hand.ts`), and a Mind's predictions say whether it is built with them: the
   kind `measured` is, and the kind `measured-only` is given none and leaves such an Option
   unpriced (`pricedBy`). The numbers read whatever was measured (`CLINCH`, `STOPS`, `FALLEN`,
   `BRACED`, `UNMEASURED_TURN`) are in the same file, behind no interface. Step 1 builds the
   rest.
   *Held by* a reading's type: none is built without its source. Every number set by hand is in
   one registry and read through it alone, so the inventory lists them from the code that reads
   them, never from a search of the source. Each entry has one of three sorts (what is guessed
   now, below): a guess, which is on the list that fails; a preference, which is a field a
   player sets; or the Mind's own, the same for every body. A number written anywhere
   else in the folders the Mind prices in fails a scan of the parsed source, which has a fixture
   that shows it catches one ([the test rules](../../tests/README.md)).
4. **Nothing is measured again unless it is asked for, and nothing is chased to a fixed point.**
   A measuring command is given what is in hand (a body, a skill, a foe) and measures that
   alone. A new measurement changes the fights, so it makes staler everything measured in the
   fights before it. That is written on those measurements and nothing more: none is made again
   because another was. A change to the Mind makes the fitted value and the action prior staler
   the same way, since both are fitted to how the Mind played. From time to time a measurement
   is refreshed, by choice, the inventory listing the stalest. Where rows of the same thing are
   made again, the old ones are kept and count for less as newer ones arrive (the agent's
   reading of "go gradually stale"; the owner's to correct).
   *Held by* the measuring command: it has no way to run on everything, refuses to start without
   what is in hand, and says its price from its first chunk before it plays the rest.
5. **A step is read on what it is about, and reported so.** Each step names the bodies it is read
   on before it runs. Its report gives those readings, and names what it moved and did not read.
   "General" is never said of a reading taken on one body. Of a mechanism it is said only with
   the inventory clean for every body and one body shown fighting on borrowed readings (the
   procedure's step 5).
   *Held by* the report being the tools' own output: the inventory's and the fingerprint's
   comparisons (`--compare`), in the commit message as they print.
6. **Every term of a price says where it came from, and "not priced" is a source.** A line's
   price answers what the Mind imagines (the mechanisms, below): how long each Option takes,
   what it deals and takes, where it leaves the body, where the foe goes meanwhile, and what
   the line's end is worth. Each answer carries its source. One the Mind does not answer is
   written "not priced", never left out. The inventory lists what a lookup would find. It
   cannot show a lookup that is never called (the end of a line today), or a mechanism that is
   built and stands aside in play. So the sources are counted over decisions that were played.
   *Held by* the trace: over a step's looked-at decisions and its bouts it prints the share of
   terms from each source. On the bodies in scope, a step is not done while the term its row
   names is by hand or not priced. Counting costs the game's play nothing where it is not asked
   for ([the ceilings](../reference/step-cost.md#allocation-ceilings)).
7. **Thinking grows no faster than what is on offer.** Measuring is not the only thing that
   scales (the goal: "i don't want anything in this game to be N^2 (or worse)"). One more
   Option, one more foe in the room and one more row kept each cost a decision no more than
   their share. The foe's Options weighed along every line (mechanism 3) are the body's Options
   times his unless they are bounded. Rows kept and counting for less (rule 4) still cost every
   reading unless a reading's time does not grow with them.
   *Held by* the step's naming, which states each of the three as a count, and by the thinking
   read twice, on the man's own Options and on every Option that fits him, both in the report.

## One Mind already, in three configs

Every body runs the one Option Mind (`kind: "option"`): the same code, offering each body the
registered Options it fits. No body has a Mind of its own. What differs by body is the config
it plays by default, three today (`src/app/catalog.ts`, `src/entrants/option/mind.ts`):

| Config | The default of | Its settings |
| --- | --- | --- |
| `option-tail` | the woman, the skeleton, the reptile, and the man holding anything | the tail's leaf, a state worth its best line, the objective's own defaults, decided at 60 Hz |
| `option-lean` | the empty-handed man | the fitted leaf, a state worth its lines' mean, aggression 4, initiative 0.3, the foe carried on 0.5 s, decided at 10 Hz, a walk's start signed and a sway by its own steps |
| `option-presses` | the rat | a state worth its best line, aggression 5, initiative 0.3, decided at 60 Hz; it asks the fitted leaf, which stands aside for the rat |

A fourth is pickable and no body's default: `option-measured`, which is `option-lean` built
with no guesses (`predictions.kind: "measured-only"`), so every stand-in is taken away and
nothing is yet in its place. Against `option-lean` over 120 bouts (`npm run match`, at
`25dcc9900`) it scored 0.358 (0.292 to 0.421), with knockouts within 60 s in 8.3 % of bouts
against 25.0 %. Step 10 measures what the stand-ins stood for.

They are three because each was read on one body and installed for that body alone, the fixes
among its settings with the rest. By the owner's rule (the goal) a fix, or a gain in scale or
speed, belongs to every body, and only what is one situation's is a body's own. So the plan
ends with one set of settings every body shares, a body's own config holding only what was
chosen for its situation, each such setting named with its reading (bar 4). Sorting today's
three is step 2.

## The inventory

A script that plays nothing. For each body, empty-handed and as the game arms it, and for the
config named (the body's default where none is), it lists each thing the Mind reads by it and
where the reading comes from: its own, borrowed (from which body), stale, by hand, or a table
that had to be measured for the pairing. What depends on the foe is listed against each foe
named, the empty-handed man where none is. It is built from the assets, the registry of numbers
set by hand, and the lookups the Mind itself uses.

It is used as the fingerprint is: written before a change (`--json`), compared after
(`--compare`), each row that changed named. Its check fails where a body reads by hand, by a
name or by a pairing something that is not on its list of those known today. It never fails on
staleness: it says how stale each reading is and can list the stalest first, which is what a
refresh is chosen from.

Borrowing always finds something, however far off, so "borrowed" alone says little. Each
borrowed row says how far off it is in the numbers, and the listing can put the farthest first.
Every listing ends with three counts: the registry's numbers by sort, the list that fails, and
the settings in which the bodies' default configs differ. A count that grew is named in the
step's report.

**A made-up body and a made-up item** are listed beside the game's: a model built at a stature
and mass no measured body has, and an item of a mass and reach no trial held. They are made in
the script and no file is added for them. Both must be offered Options and have each priced,
every row borrowed. A row that says "its own" was found by a name. A row that says "none" is a
mechanism that does not reach a new body. This is the count in "What a new thing costs", run,
where a clean listing of five bodies cannot show it. A skill cannot be made up without its code,
so a skill's count is read on the next skill the game adds.

This is what catches a mechanism called general that was built for one body. On its default
config every body's rows must say "its own" or "borrowed"; one that says "by hand" or "none" is
the hack, found without a bout played. It is what is looked at first when work starts on a
body. It replaces any reading taken across every body.

## What a new thing costs

| Added | It fights at once by | Measuring it asks | It never asks |
| --- | --- | --- | --- |
| A body | the settings every body shares, on the nearest body's profiles, value and prior, each marked borrowed | its own skills' drills, and its bouts against the foes in hand | another body measured again; a table for each foe |
| An item | its mass and reach, read from its spec; the trials nearest in those numbers | trials holding it, of the skills that use it | a table for each loadout |
| A skill | its kind and its model, which the action prior reads; its outcomes from the nearest body that has drilled it, marked borrowed | its drill, on the body that has it | another skill measured again |

A skill no body has drilled has no outcomes: its profile is empty, and nothing is written in by
hand to fill it. An Option with no outcomes is not offered in a fight, and the inventory lists
it as not measured. Its drill is part of making the skill
([the skill recipe](../recipes/skill.md#the-procedure)), so it fights once that has run.

Each count is checked against the code when its mechanism lands, and stated in the step's report.

## The mechanisms

The Mind imagines lines of Options and prices each by the life it deals and the life it takes. The
guesses all sit in what it imagines: how long an Option takes, what it deals and takes, where it
leaves the body, where the foe goes meanwhile, and what the place a line ends in is worth. And
with many Options, the search has to know which to look at first. Five mechanisms answer these
for every body.

1. **The fight record.** Every bout and drill played for the work in hand writes rows in one
   format: the state, the Option chosen, and what followed (the life dealt and taken, falls, the
   posture each body ended in, where the foe went), both bodies as numbers on each row, and
   what the game was when it was played (the bodies, the skills, the Minds). Each fit and each
   profile is read from rows. Nothing is played to fill the record: it holds what the
   work in hand played, so a pairing reads better the more it has been worked on. It grows from
   what exists: `research/minds/fitted-value.mjs collect` (decision states),
   `research/skills/strikes/strike-bouts.mjs --save` (a bout's decisions, each with its offers,
   and its strikes as trials), `research/skills/strikes/bout-profiles.mjs` (profiles from those
   trials) and `research/minds/foe-placement.mjs collect` (where the foe went).
2. **What each Option does, measured.** The strike profiles already price a strike by the nearest
   measured trials (`src/skills/framework/profile/`), the struck body as numbers on each trial.
   The same reading is used for every kind of Option: walks, holds, the ways up, the brace, the
   cover. Each kind's profile holds how long it took, what it dealt and took, and how it left the
   body. What has to be measured grows with the skills each body has.
3. **Where the foe goes, and what he deals, measured.** The foe does what the action prior (5)
   says a body like him does in his place: his Options, built from his own body, each weighted by
   its chance, each moving him as its measured model says. What he deals a second is his
   strikes' measured outcomes on a body of the struck one's numbers, each weighted by the chance
   he throws it from there, whether the struck body is standing or lying. This is to stand where
   the pressure tables do, which must be measured a pairing (three today for two bodies), and
   where the strikes' rate does, which overprices. A direct fit of where the foe is a moment
   later (`research/minds/foe-placement.mjs`) is read beside it, and kept only if better.
4. **What the end of a line is worth, measured.** The fitted value
   (`src/minds/option/predictions/value/fitted-value.ts`) prices what follows a state from what followed such states
   in fights. It prices the end of every line, including one the horizon cuts and an open Option
   (a hold, a guard). A fit names the bodies and foes whose bouts it was fitted on, as numbers. A
   state is read by the fit nearest in both, marked borrowed on the side that is not its own:
   today the man's fit is of a man against a man, and against any other foe it stands aside
   (`fittedOn`). A fit from one more collection is one more entry beside the others. What has to
   be fitted grows with the bodies worked on.
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
| The end of a line is not priced | `objectives.ts` `fewTermsWorth` never reads `path.end`; `space.ts` `cutWorth` | A line cut at the horizon, and every hold or guard, is worth the same ending on its back as on its feet | 4 |
| The fitted value reads only the man | `assets/minds/fitted-value.json` fitted on man against man; `fittedOn` | Every other body, and the man against any other, falls back to the tail's leaf | 1, 4 |
| A second down is priced at the foe's peak | `profile.ts` `downRateOf` (`PressureFields.peak`) | Lying 5 m away costs as much as lying at his feet: 0.075 of the rat's life a second, where its time down in fights cost about 0.004 | 3 |
| The foe stands still in imagined lines, or carries on as he was | `carry` 0 by default, 0.5 s on `option-lean`; `imagined.ts` | Waiting near a foe who would close looks free, or is priced by where his velocity takes him | 3, 5 |
| The foe's replies are searched only against the same body | `replies.ts` `repliedSearch` (`bodyOf(focus.spec) !== searched.body`) | Against any other body, replies are never searched | 3, 5: the foe's Options built from his own body, weighted by the prior |
| A walk never falls outside a clinch | `places.ts` `walkTerms` | Walks look safer than strikes, whose falls are measured | 2 |
| The clinch | `by-hand.ts` `CLINCH`: 0.65 m centre to centre, 0.2 falls a second, every body | Holds and walks near the foe fall at one rate, rat or Warrior | 2 |
| Ways up and recoveries not measured | `by-hand.ts` `WAYS` (a way up 5 s, 7 in 10; the regain 9 in 10; a brace 0.25 s), `BRACED` (1 s) | Getting up is priced by hand for any body without a drill | 2 |
| Blows not measured | `by-hand.ts` `PRIOR` of `record` (0.3 lands, 0.6 s, weight 3), `BLOW_SPEED` 5 m/s, `LANDS` 0.3, `RATE` 1 a second | A foe's limb with no profile is priced by hand | 2 |
| The cover | `by-hand.ts` `STOPS` 0.6 | A cover keeps off six tenths of any blow | 2 |
| Where a fall leaves the body | `by-hand.ts` `FALLEN` "back" | Every fall is priced as landing on the back | 2 |
| A foe with no turning measured turns at once | `by-hand.ts` `UNMEASURED_TURN` (Infinity), read by `profile.ts` `turnOf` | Going round a foe is worth nothing | 3, 5 |
| The search weighs every Option evenly | `tree-search.ts` `treeSearch`: UCT, no prior | With dozens of Options, 50 runs spread too thin to find the strong line | 5 |
| Stances read by the model's name | `gaitStance`, `carriageOf` (`places.ts`, `back-step.ts`, `percepts.ts`) | A model with no entry gets no stance and no back step | 2, its stance measured like any Option's |
| The rat's own Mind | `option-presses`: best line, aggression 5 | Pushes past the wrong prices for one body | Retired once the rest stands (the owner's word) |

Outside the Mind's prices, the same audit found the trunk opening's aim (`strike-kinds.ts`,
`TRUNK_OPENING`) copied from the Warrior's punch to the sword's thrust. That belongs to the skill
recipe's tuning search, and goes there.

**Not guesses.** Two sorts of number set by hand are not predictions, and stay.

**Preferences** are how a body is told to fight, and a player sets them: the objective's
aggression and initiative, the search's horizon and runs. Each is a field in the mind editor,
its default chosen by measuring it. A number that is not such a field is not a preference.

**The Mind's own** are implementation: how the Mind works, the same for every body and keyed by
none. No player sets them (the owner, 2026-11-25: "margin and draw settings are implementation
details, why would a video game player manually select implementation detatils?"). They are:

- how the objective is shaped at the clock (`MARGIN`, `DRAW`, `EVEN`) and for reaching a place
  (`REACH`), in `objectives.ts`;
- how many trials are nearest, and over what spans (`NEAREST`, `STRUCK_SPANS`,
  `src/skills/framework/profile/nearest.ts`);
- the pressure table's reading (`MOMENTS`, `SPAN`, `pressure-table.ts`);
- how many tries a prior counts as against a record (`PRIOR.weight`, `by-hand.ts`);
- how far apart two bodies are in the numbers, and how fast an older row comes to count for
  less, when those are built.

They are in the registry, and the inventory lists and counts them. They are not on the list
that fails.

What tells one of the Mind's own from a guess: a guess says what happens in a fight (how often
a blow lands, how long a way up takes), so rows could say it instead. No row could say one of
the Mind's own. A number that rows could say is a guess, whatever it is called.

**Not yet sorted.** A search of `src/minds/option/` on 2026-11-25 found these in neither table:
`HELD_FOE` (`choosers/parts.ts`), `REPLY_LEAST` (`profile.ts`), `LONGEST` (`fitted-value.ts`), `AHEAD`
(`orders.ts`). Both tables came from one audit, so step 1 audits again.

## What a name, a pairing or a pooled reading still finds

The numbers plan's census, as the code stands. Rules 1 and 2 ask each of these mended.

| What the Mind reads | Found by | Today | What the rules ask |
| --- | --- | --- | --- |
| The foe's pressure (`pressure-profiles.json`, `pressureTable`) | both bodies' numbers, near within a span; a table for each pairing measured, and a pairing near none by the strikes' rate | 3: a man on a man, a man on a rat, a rat on a man | mechanism 3, which needs no table of a pairing |
| A strike's outcomes (`strike-profiles.json`, `profilesFor`, `profileAgainst`) | the striker's model (`Measured.body`), across bodies by stature alone (`acrossBodies`); the struck body by its numbers | 18, one a striker's body, skill and limb | the striker by its numbers as the struck body is, its own trials first |
| The foe's strikes (`profilesOn`) | the foe's model, never across bodies; a foe with none is priced as the reader's own strikes, else by hand | the same asset | a foe with none reads the nearest body's, marked borrowed |
| The back step's sways (`step-profiles.json`, `backStepping`) | the stepping body's model | 1, the man's | by numbers, as a strike's |
| How a body stands in a gait (`GAIT_STANCES`, `gaitStance`, `carriageOf`; the back step's `SWAYS_FROM`) | the gait and the model, typed in source | the man's | measured as any Option's (the table above) |
| The edges a body gets up by (`edge-profiles.json`) | the model | 17: the man's 5 techniques, the woman's and the skeleton's 6 | by numbers, as a strike's |
| A profile's written form (`src/skills/framework/form.ts`) | least squares over all of a profile's trials in a phase, what was held among its terms | the edges' forms fit every loadout's falls at once | read from the rows nearest in the numbers, so rows of one loadout do not move another that has its own (rule 2) |
| The fitted value (`fitted-value.json`) | the names of the body and of its foe (`bodyOf`, `fittedOn`) | 1, the empty-handed man against himself | mechanism 4 |
| A body's default Mind (`DEFAULT_MINDS`, `DEFAULT_BODIES`, `src/app/catalog.ts`) | the model, and the body's name | the empty-handed man `option-lean`, the rat `option-presses`, every other `option-tail` | one set of settings every body shares, a body's entry holding only what is its situation's (the owner's rule; steps 2 and 13) |

What a body holds is already numbers on a trial (the mass held and its reach past the hand,
`Start.held`), and no loadout finds a profile. But no trial crosses a loadout with a skill
measured without it, so a body holding a sword reads its punches' and its stomp's empty-handed
trials, coarse. Of the weapons' own strikes only the bonk with a club has a profile.

Outside the Mind, and one a body, not a pairing: each skill controller's record by model
(`dataOf(...)[model]`) and the mind notes by model.

## The procedure every mechanism follows

One procedure, as a skill has ([the skill recipe](../recipes/skill.md#the-procedure)). Each
step's output is the next step's input. A step that fails goes back to step 1, never on.

1. **Name it.** 2. **Build it as a kind.** 3. **Look at its prices.** 4. **Read it on its
scope.** 5. **Install and confirm.**

### 1. Name it

- **The row it replaces**, from the two tables above, and the numbers that will find it.
- **What one more body, item or skill costs to measure**, as a count.
- **What one more Option, one more foe in the room and one more row kept cost a decision**, as
  a count (rule 7). A product of two of them goes back to the design before anything is built.
- **Its sort**, by the owner's rule, with the reason: a fix of something broken, or a gain in
  scale or speed, which is every body's; or one situation's, which is that body's alone. This
  plan's mechanisms are fixes: each stands where a guess prices every body. A setting chosen by
  reading it on one body (an aggression, a backup, a run count) is a situation's.
- **A situation's setting is traced as a fix is.** A fix that reads worse has found something
  else broken (the goal). By the same reasoning a setting that reads better on one body may be
  paying for a wrong price, as `option-presses` does. So before one is set, the prices at the
  decisions it changes are looked at (step 3). Where one is wrong, that price is the work, and
  the setting waits.
- **Its scope**: the bodies it will be read on, which is what the work is on. Today that is the
  empty-handed Warrior, and the rat against him where the step is about what the rat showed.
  Nothing is played for another body or loadout unless the work is on it or the owner asks.

### 2. Build it as a kind

- **A kind a person can pick**, by the config path the kinds already there take. What it stands
  in for stays pickable, and leaves the game only on the owner's word.
- **Behind the interface that asks for it** (`src/minds/option/contract/`,
  [the architecture](../architecture.md#minds)). The choosers and the Options read the future
  only through these, so a mechanism is one more implementation, and no chooser or Option is
  changed to reach it:
  - what the foe and the body do to each other (mechanism 3, and the foe's turning) is an
    `ExchangePredictor` (`predictors.ts`), made by the Mind's predictions part
    (`predictions/part.ts`);
  - what a state is worth where a line stops (mechanism 4) is a `ValuePredictor`, picked by the
    chooser's leaf (`choosers/leaves.ts`);
  - what an Option does (mechanism 2) is the Option's own model (`Option`, `option.ts`), read
    from the outcomes its predictions give it;
  - the action prior (mechanism 5) has no interface yet. It is declared in `contract/` with its
    first reader.
- **What a mechanism remembers is in its state**: the fingerprint with `--relay 127`
  ([the code recipe](../recipes/code.md#code)).
- **The game unmoved where it is unset**, on every commit that changes what a Mind reads: the
  fingerprint, each case it moves named. Where the empty-handed Warrior is claimed unmoved, his
  mirror is played to the bit as well, saved before and compared after
  (`research/skills/strikes/strike-bouts.mjs --models man --held empty --seconds 120 --save`, at
  the scorecard's 24 gaps, 2.65 to 5.41 m by 0.12, given to `--gaps`; about 80 s). The
  fingerprint alone once missed a move there: its empty-handed cases end before a fall's price
  matters (the approaches).

### 3. Look at its prices

- **Before any bout, fit or collection is run for it.** At a few traced decisions of the body in
  hand, the price of each Option on offer before and after, and where each price came from.
- **The price moves for the reason the row names**, and by about what was measured. One that
  does not goes back to step 1.
- **The term the row names has the mechanism as its source** at those decisions (rule 6). One
  that is still by hand or not priced there was built and is not reached: back to step 1.
- The rat's wait at the edge of reach was found by tracing one bout, after three `gaps` readings
  had not shown why (the rat plan).

### 4. Read it on its scope

- **The Warrior**, where he is in scope: a match of 288 warrior-drawn bouts against the game's
  Mind as it stands (`option-lean`), and his knockouts within 60 s on the scorecard beside it.
- **The rat**, where it is in scope: `gaps` against `option-lean` on the man, 1 HP or more by 60 s
  and killed within 60 s, of 48. Before the work, on the rat's Minds at steadiness 25:
  `option-lean` 34 and 19; `option-lean` at best line and aggression 5, 42 and 22;
  `option-presses` 42 and 24. Where a step has changed the man's own Mind, these are read once
  again against it, and the report says so.
- **The thinking**: the Mind's time per simulated second beside `option-lean`'s 135 ms, read
  on the man's own Options and on every Option that fits him (rule 7).
- **The sources**: over these bouts' decisions, the share of terms from each source (rule 6).
- **A run whose readings already answer it is stopped at once** (the skill recipe).

### 5. Install and confirm

- **A fix, or a gain in scale or speed, is set for every body** in the commit that installs it.
  The bodies outside its scope move unread: nothing is played for them, the fingerprint names
  each of their cases it moved, and the report lists them as moved and not read. The config a
  body played before stays pickable.
- **One situation's change is set for that body alone**, as its own config's setting.
- **A fix that reads worse has found something else broken** (the goal). Its prices were looked
  at in step 3 and are right, so it stays, set for every body. One bout where it lost is traced
  to what the old error was covering for, and that is named in the report and mended next, as
  a fix of its own. (A punch priced right once stood off and was walked into: its overprice had
  been paying for a stay that nothing priced. The punch's price was put back, and the stay is
  still not priced.) Only a trace that shows the fix's own prices wrong sends it back to step 1.
- **The inventory clean for every body on its default config**: with the kind set, no body reads
  what this mechanism prices by hand, by a name, or from a table of a pairing. It plays nothing.
- **Shown once on a body with nothing of its own**: one body that has no measurement for this
  mechanism plays a few bouts with the kind set, and must close and throw on readings the
  inventory lists as borrowed. This shows that it fights, not how well, and costs the same
  however many bodies the game has.
- **A headless look at the Arena** with the mind editor open, where a config changes.
- **Read by one who did not do the work.** A fresh session is given the commit, the rules and
  the inventory's listing, and not the worker's report. It is told to refute the step: a name
  that still finds a reading, a number outside the registry, a term the mechanism does not
  reach, a body or the made-up one it does not serve, a cost that is a product. It reads
  read-only and plays nothing. What it finds goes into the report as it wrote it, each answered
  by a reading or a mend. It does not wait on the owner (the second session's rule,
  `AGENTS.md`).
- **The report** (rule 5): its scope, its readings with their spreads, the fingerprint's and the
  inventory's comparisons as they print, the inventory's three counts, the share of terms from
  each source, the thinking read both ways, what the fresh reader found, and each case moved
  and not read.
- A mechanism that reads flat is kept: it removes a guess. That is the goal, the same Mind
  priced from measurement.

## What done is

The agent's bar, from the owner's words above; the owner's to change.

1. **Each row of the two tables above**: for every body its mechanism stands in the row's place,
   under the seven rules, or the owner has struck the row by name. A row written down as not
   built is not met. What a row's mechanism stood in for is listed for the owner's word to
   remove. In the decisions played for its step, the term the row names has the mechanism as
   its source (rule 6).
2. **The inventory is clean for every body on its default config**: nothing read by hand, by a
   name, or from a table that had to be measured for a pairing. Borrowed is allowed, and listed
   with how far off it is. The made-up body and item are offered Options, each priced, and read
   nothing as their own.
3. **Each mechanism was shown once on a body with nothing of its own** (the procedure's step 5).
4. **The bodies' default configs differ only by what is one situation's**, each such setting
   listed with the body it was chosen for and its reading. No body is left without a fix
   because it was not read. Reading every body is not a bar of this plan: each is read when the
   work is on it.
5. **The counts in "What a new thing costs"** hold in the code: a sixth body, a new weapon and a
   new skill each ask what the table says, and nothing of a pairing.
6. **The action prior** is read each way "tried properly" lists, each variant pickable.
7. **The rat's own config holds only what is the rat's situation's** (step 13).
8. **The seven rules are each held by what refuses** (their "held by"), not by this document.
9. **A step's report** is the procedure's step 5, the fresh reader's findings in it and each
   answered. A step is called done only with it, and only of the bodies it was read on.

No bar asks that a measurement be fresh or correct. A mechanism is done when it reads what was
measured by the rules; how stale that is, is the inventory's to say and the owner's to refresh.

The plan is deleted when each of 1 to 8 is met or struck by the owner by name. What was found
moves into the approaches; the rules and the procedure move into a recipe, so they bind the work
after this plan is gone.

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
- **Wide bodies.** The man offered every Option registered that fits him empty-handed, so the
  reading is where scale will be. The body with the most Options the game offers is armed, and
  is read on the owner's word (parked, below).
- **Two targets.** Fitted to where the search's runs went (the search taught by itself, refitted on
  the guided search's runs for two or three rounds, and no further: rule 4), and fitted to what
  bodies did in the record.
- **The bound.** Exploration 0.5 to 8; an untried Option valued at its prior's chance of its
  parent's worth, at the floor, or at the mean; the prior at the root as well as below it.
- **Its other uses, each read on its own**: the foe predicted by it (step 8), a wide body's Options
  narrowed to those carrying most of its chance before the search, and a body deciding by it alone,
  its strength and its thinking against `option-lean`'s.

A variant that reads flat stays pickable, its reading in its note. It leaves the game only on the
owner's word.

## Steps

Each names its scope and follows the procedure. A step measures nothing outside its scope.

Every step runs unattended (the owner, 2026-11-25: "it must be possible to implement anything
unattended"). None waits on the owner. What reads a step in the owner's place is the fresh
reader (the procedure's step 5). The owner's word is asked only to remove something from the
game or to unpark something, and the work goes on meanwhile.

1. **The inventory, and what holds rules 1 and 3.** The registry of numbers set by hand, each
   read through it; a reading's source in its type, of the body and of the foe; each asset
   naming what it was measured from (the body, the skill, the Minds that played and what they
   read), compared when the inventory runs, so how stale it is costs nothing to know; the
   script, its check, and its first listing for the five bodies. It plays nothing. The
   baselines are those in the procedure's step 4, read before this plan.
   With it: each registry entry's sort, and the scan that fails a number written outside the
   registry; the made-up body and item in the listing; and the trace's count of terms by
   source (rule 6), "not priced" among them, read once on the man's mirror as it stands. The
   two tables are audited again by a session that is not given them, over the folders the Mind
   prices in (`src/minds/option/`, `src/skills/framework/profile/`,
   `src/skills/framework/form.ts`). What it finds and the tables lack is added to them. This is
   the one time the list grows.
2. **Today's three configs sorted by the owner's rule** (the goal: a fix is every body's). Each
   setting `option-lean` and `option-presses` hold apart from `option-tail` is named a fix, a
   gain in scale or speed, or one situation's, with its reason. The first two are set for every
   body; the third stays where it was read. The agent's sorting to start from, each checked in
   the code first: a walk's start signed, a sway by its own steps, the foe carried on and the
   fitted leaf are prices made truer, so fixes (off the man the fitted leaf stands aside until
   step 5); deciding at 10 Hz halves the thinking, so speed, if `staleness` shows each body's
   profiles hold at that rate; the backup, the aggression and the initiative were chosen by
   reading one body, so a situation's. Scope: the empty-handed Warrior and the rat against him,
   by the procedure's step 4. Nothing is played for the other bodies: the fingerprint names
   each case moved, and the report lists them as moved and not read.
3. **The fight record and the measuring command, which holds rules 2 and 4.** One row format
   that each fit and profile reads: the decision states `fitted-value.mjs` keeps, with every
   Option on offer and its model (as `move-prior.mjs` keeps them), the share of the search's
   runs each took, the Option run, what followed, and where the foe went. The measuring command
   is given what is in hand, plays that, adds its rows and fits that body's entries, and refuses
   as rules 2 and 4 say. Scope: the empty-handed Warrior's mirror. Its first rows are a new
   collection, its price said from its first chunk: the fitted value's 1044 bouts are in
   `research/runs/`, outside Git and not on every machine, and were not `option-lean`'s.
4. **The end of every line priced** (mechanism 4): the fitted value read at cut lines and open
   Options, through the fitted leaf the man already uses. Scope: the empty-handed Warrior.
5. **The fitted value by the nearest-fit rule** (mechanism 4), as a kind beside `fittedOn`'s
   standing aside: a fit naming its bodies and foes, a state read by the nearest. With it set,
   the Warrior against the rat reads his mirror's fit, marked borrowed, where he read the tail's
   leaf. Then a fit from the rat's bouts against the Warrior, both sides' decisions in it, its
   cost said first against the man's 1044 bouts. Scope: the rat against the Warrior; the
   Warrior's mirror shown unmoved.
6. **The action prior** (mechanism 5): fitted on the record, both targets; read in the game as an
   asset, as the fitted value is. Its held-out nats against the price's softmax, by how many
   Options were on offer. Scope: the empty-handed Warrior's record, step 3's.
7. **PUCT with the prior**, tried as the section above says: the prior-weighted mean first, then
   the run counts, the wide body, the refits on its own runs and the bound. Each variant
   pickable. Kept as a body's search if it plays as well for less thinking, or better. Scope: the
   empty-handed Warrior, and him offered every Option that fits him.
8. **Where the foe goes** (mechanism 3): the foe's Options built from his own body and weighted by
   the prior, read along every line where `carry` and the same-body reply search are read now;
   the direct placement fit beside it; the foe's turning from the same where nothing else
   measured it. Scope: the rat against the Warrior. It may read flat on the Warrior's mirror
   (below), which is read only before it becomes his default.
9. **What the foe deals** (mechanism 3): his strikes' measured outcomes on the struck body's
   numbers, weighted by the prior, standing or lying, where the pressure tables, `Pressure.peak`
   for a second down, and the rate are read now. Read first against the three tables there are,
   on the pairings they measured, with nothing new played. The tables stay pickable
   (`pressure: "measured"`). Scope: the rat against the Warrior, then the Warrior's mirror before
   it becomes his default.
10. **What each Option does** (mechanism 2), one kind at a time, each its own commit and its own
    scope: the walks' falls and the clinch together (where `CLINCH` and the walk's no-fall are
    read now); then the ways up, the regain, the settle and the brace; then the cover; then where
    a fall leaves the body; then the unmeasured blows; then the stances.
11. **The prior's other uses at scale**: a wide body's Options narrowed by the prior before the
    search, and a body deciding by the prior alone, each read for strength and thinking. Scope:
    the empty-handed Warrior offered every Option that fits him. A Crypt room of many is armed
    bodies, read on the owner's word (parked, below).
12. **What a name or a pooled reading still finds** (its table above): the striker's side, the
    foe's strikes across bodies, the sways and the edges found by numbers, and the written form
    read from the rows nearest in the numbers. This is code, and it plays nothing new; the
    struck body held out is read again over the assets' trials, one striker at a time
    (`research/skills/strikes/struck-held-out.mjs <striker's body>`), which plays nothing either. Scope: the
    empty-handed Warrior, read where the form's change moves him.
13. **The rat's own config, read again.** `option-presses` pushes past wrong prices. With the
    prices measured, the rat on the settings every body shares is read against it, by the rat's
    reading. If it is as good, that becomes the rat's default, and retiring `option-presses`
    waits on the owner's word. If not, what the rat keeps is named as its situation's.

## Parked by the owner

Measured when the work is on them, on the owner's word, and not before (the goal). Rules 1 to 3
hold for them meanwhile: they fight on what they borrow, and the inventory lists it.

- **Trials that cross what is held.** The design kept from the numbers plan: a sparring rung of
  its own, `sparring-held`, as `sparring-stances` draws stances, a Warrior on a Warrior, each
  side's loadout taken by turns from the game's (empty; a sword; a club; a buckler and a sword),
  the limbs that hold nothing striking, its price said from its first chunk. A cover's own
  number (its face's size) only where the buckler's trials read apart from what mass and reach
  say.
- **Those trials read held out**: the held trials taken away and priced from the empty-handed,
  against their own; then by bouts, a Warrior holding a sword against one holding a sword.
- **A match set that is not the empty-handed Warrior alone**, bodies and the club crossed. It
  does not exist, and is this plan's to make when it is unparked.
- **The 13 fingerprint cases where a body holds an item** (the arenas' sword and club bouts,
  the reptile against a sword, both Crypt fights), moved by `93f128cab` on no bout's reading.
  They stay unread.
- **The sword thrust's and the club blow's profiles.**
- **The back step's sways and the gait stances on bodies other than the man.**
- **The body with the most Options the game offers, and a Crypt room of many**, for the action
  prior's readings.

**Not a bar of every fit.** The numbers plan's bar 4 read each body by leaving it out. Over the
trials in the assets it was read once, pooled over strikers a skill was never developed on, which
showed nothing (the approaches), and it is read again, one striker at a time, when a
body's trials are added (step 12); by bouts it was parked with what is held. A reading of every
body left out in turn was put to the owner as the bar for every fit on 2026-11-25 and refused
(the goal: "there is no single type of measurement that holds up in general").

## What is known before it starts

- **How coarse a borrowed reading is, is not settled.** Held out one striker at a time over the
  trials in the assets, a struck body read as the nearest measured body priced worse than its
  own trials on landed by 0.058 ± 0.037 (the man's drive punch, bonk and stomp, 168 trials) and
  0.072 ± 0.032 (the rat's bite, 115), and pooling the others as a written form read worse
  still. The figure once here (0.313 against 0.170) pooled a punch on bodies it was never
  developed on, and showed nothing. Only three bodies, all human-shaped, were ever struck
  ([the approaches](../approaches.md#minds)).
- **A profile does not say whether its skill was developed on its body.** The assets hold the
  woman's and the skeleton's punch, 7,969 trials of a skill developed on the man alone, found
  and read as any other profile, and nothing a profile holds says so. That is step 1's to
  settle, with what the inventory lists as a body's own.
- **A reading merged across loadouts moves a body that had its own.** The edges of every loadout
  read together moved the empty-handed mirror in 5 of 24 bouts, and the fingerprint did not show
  it. Its mend, a loadout's own trials first, was deleted in a cleanup, and the written form
  fits every loadout's falls at once again (the approaches). Hence rule 2, its row above, and
  the mirror played to the bit.
- **Modelling the foe changed nothing between two Warriors.** A searched reply, the foe carried on
  for half a second, and a learned model of the foe's strike onset each scored 0.47 to 0.50
  against the game's Mind (`3a7341cb5`, `42690292f`; the approaches' Minds). Between two bodies
  of the same reach, waiting at the edge of reach is about as safe for both, so pricing it better
  moves little. The rat's reach is far shorter than his.
- **The fitted value took 1044 bouts and 623767 states of the man** (fit at `33be0e76f`). A fit
  for another body must reach figures like the man's for far fewer bouts. One whose first chunk
  says it would not is not run: the body keeps its borrowed fit, the price goes in the report,
  and the work goes on (rule 3: nothing waits on a measurement).
- **Measured today**: 18 strike profiles, by body, skill and limb; 3 pressure tables, one a
  pairing; 17 edge profiles; the man's back-step sways; the fitted value, the empty-handed man's.
- **The rat's time down, measured**: up 0.997 of its time at steadiness 25, its downs in fights
  costing about 0.004 of its life a second (the rat plan).
