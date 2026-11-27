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
agent didn't seriously try it and just gave up, we need it for scalability." On 2026-11-26: "We
will revisit PUCT, it's already in the plan -- we will be adding dozens of skills and UCT won't
scale to that many options. I do agree about removing 'kind'." The forks that label every Option
on offer are [the forked record](2026-11-26-forked-record.md)'s; what is fitted from them stays here.

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
   is not on its list. The list is `scripts/inventory-known.json`: the rows that failed on the
   day step 1 landed, which this plan's two tables describe. A row is taken off it when it is
   mended, and one joins it only with the change that says why. And by the
   made-up body (the inventory, below): it has no rows, so a reading it finds as its own was
   found by a name. A lookup that is mended takes a body as its numbers alone, as the struck
   body is taken already (`struckNumbers`), so it cannot see a name.
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
   Today every reading carries it (`Source`, `src/skills/framework/profile/source.ts`): measured
   (for the body and for the target, whose rows they are, whether numbers, a name or a rule
   found them, each number they differ in and by how many of the lookup's spans; whether the
   table had to be measured for the pairing; what has changed since), by hand (which registry
   entries), given, or not priced. A measured asset names what it was measured from (`Origin`,
   `src/skills/framework/profile/profile.ts`): digests of the body and the skill, and each Mind
   that played its trials with a digest of every record that Mind read (`Played`). The
   inventory compares them with today's. The assets measured before this was built name no
   Minds, and the inventory says so of each; none is measured again for it (rule 4). A digest
   is taken when the measuring tool runs, so rows added to a profile by a later run are covered
   by the later run's digests, and a profile's own digest reads "changed since" from the moment
   it is written, which is true: a new measurement makes staler what was played before it.
   The numbers that stand in where nothing measured reads are behind one interface (`Guesses`,
   `src/minds/option/contract/predictors.ts`; `BY_HAND`, `predictions/by-hand.ts`), and a
   Mind's predictions say whether it is built with them: the kind `measured` is, and the kind
   `measured-only` is given none and leaves such an Option unpriced (`standIn`).
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

## One Mind, one set of shared settings

Every body runs the one Option Mind (`kind: "option"`): the same code, offering each body the
registered Options it fits. No body has a Mind of its own. Every body's default config is the
settings every body shares, and a body's own adds only what was chosen for its situation
(`src/app/catalog.ts`, `src/entrants/option/mind.ts`):

| Config | The default of | Its settings |
| --- | --- | --- |
| `option-shared` | the woman, the skeleton, the reptile, and the man holding anything | the settings every body shares: the fitted leaf, which stands aside on a body it was not fitted on; the foe carried on 0.5 s; a walk's start signed and a sway by its own steps; looking at 20 Hz and searching every 0.1 s. A state is worth its best line, the objective at its own defaults |
| `option-lean` | the empty-handed man | the shared settings, with a state worth its lines' mean, aggression 4 and initiative 0.3, read on him |
| `option-presses` | the rat | the shared settings, with a state worth its best line, aggression 5 and initiative 0.3, read on it |

`option-tail`, the default of the bodies but two before step 2 (the tail's leaf, a state worth its
best line, the objective's own defaults, looking at 60 Hz and searching every 0.2 s), is
pickable and no body's default.

A fourth is pickable and no body's default: `option-measured`, which is `option-lean` built
with no guesses (`predictions.kind: "measured-only"`), so every stand-in is taken away and
nothing is yet in its place. Against `option-lean` over 120 bouts (`npm run match`, at
`25dcc9900`) it scored 0.358 (0.292 to 0.421), with knockouts within 60 s in 8.3 % of bouts
against 25.0 %. Step 10 measures what the stand-ins stood for.

There were three because each was read on one body and installed for that body alone, the fixes
among its settings with the rest. By the owner's rule (the goal) a fix, or a gain in scale or
speed, belongs to every body, and only what is one situation's is a body's own. Step 2 sorted
them into the settings every body shares and each body's own, each such setting named with its
reading (bar 4).

## The inventory

A script that plays no bout (`node scripts/inventory.mjs`). For each body, empty-handed and as
the game arms it, and for the config named (the body's default where none is), it lists each
thing the Mind reads by it and where the reading comes from: its own, borrowed (from which
body), stale, by hand, or a table that had to be measured for the pairing. What depends on the
foe is listed against each foe named. Where none is named, each body stands in front of the
empty-handed man and then he stands in front of each, so every body is listed once as the one
that prices and once as the foe that is priced. It is built from the records the Minds read,
the registry of numbers set by hand, and the lookups the Mind itself uses.

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

**How it reads.** It stands each body in front of the foe as a bout begins, takes its Mind's
first decision (one step of the world), and lists what that decision read and offered, so every
row comes from the code the game runs and none from a second description of it. A row is keyed
by what is read, and holds the standings it fails for (a body in front of a foe), so the list
that fails is one row for a walk's duration by hand, with every standing a body walks in. A
reading that fails in two ways is two rows. Each guess in the registry is a row of its own,
whichever body reads it: most guesses are read only once a fight is on, and a first decision
would not show them. That list is `scripts/inventory-known.json`, held in the gate by
`tests/minds/inventory.test.mjs`: a failing row not on it fails, so does a row on it that no
longer fails, and so does a row that fails for other standings than the list says. So the list
is exactly what fails today.

**What it cannot show**, each said where it prints:

- An Option that is not on offer at a bout's first decision (a strike, a way up, a back step)
  has its readings listed, since the lookups are called when the Mind is made. Its price's six
  answers are not on the list that fails: they are counted over decisions that were played
  (rule 6's trace), and nothing in the gate holds them.
- Only the empty-handed man is stood in front of every body. A body other than him in front of
  a foe other than him is listed where `--foe` asks, and checked against no list.
- A foe's pressure names one source, the weakest of what it read (`weakest`): a bound, not a
  share. So does a line's end: the leaf says once a search where it reads from, a state it has
  no reading of is priced as the tail prices it, and only a line cut at its first step is said
  to have no priced end. What an Option takes names one source too, the weakest of those its
  number reads (`weaker`): the blow already coming, with the foe's pressure for a body on its
  feet, with what a second down costs for one lying, and with the cover's number where a cover
  has a blow to keep off. A back step's is its trials' alone. Where two are as weak, the one
  found more narrowly is named: for the pairing, then by a rule, then by a name. The other can
  fail in a way the row does not say. The man in front of the rat is on the list as taking what
  was measured for the pairing, and the rat's bite found by a name is not named in that row.
  Of two by hand, only one's registry entries are named.
- "Its own", of rows found by a name, means they were measured on a body of this model's name,
  as it is and holding what it holds. A man scaled by his attributes keeps the name "man", so a
  lookup by name calls the unscaled man's rows his own. The made-up body is under another name
  for that reason. Of rows found by numbers it means no number compared differs, which two
  different bodies can share: the reptile reads the rat's pressure table as its own, both being
  0.325 m and 8 kg. A profile's body side compares stature and what is held, and never mass.
- "Stale" counts only the settings a reading was measured at that differ from the Mind's
  (`Source.stale`: the engine's rate, the reaction, the Mind's rate and delay). What has changed
  in a body, a skill or the Minds that played since is listed by record, not by reading, and no
  row in the repository names Minds yet.
- A by-hand source names its registry entries in words. The listing stops with an error where
  one names no entry; nothing checks that the entry named is the one the code read.
- The registry's sorts are a judgment. A session that read them all found none plainly wrong,
  and these arguable: `TRADE` and `REGAIN_TRY` (the Mind's own, or a guess), and `STRUCK_SPANS`,
  `HELD_SPANS` and `NEAREST` (the Mind's own, though each decides which rows count as near).
- The made-up body's Mind is not made as the game makes it: the stance's envelope is found by
  the model's name and a new name has none. That is a row that fails. The listing then stands
  the body with a stance that measures its envelope as it goes, so the rest of its rows can be
  read.

**A made-up body and a made-up item** are listed beside the game's: a model built at a stature
and mass no measured body has, and an item of a mass and reach no trial held. They are made in
the script and no file is added for them. Both must be offered Options and have each priced,
every row borrowed. A row that says "its own" was found by a name. A row that says "none" is a
mechanism that does not reach a new body. Each plays the Mind of the body it copies, so the
two differ in the body or the item alone. A skill the body it copies is given, a record that
body reads, or an Option it is offered, where the made-up thing is not, is a row that fails. So
is what the empty-handed man reads or is offered in front of the body copied and not in front
of the made-up thing. This is the count in "What a new thing costs", run,
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
| A skill | its model, which the action prior reads; its outcomes from the nearest body that has drilled it, marked borrowed | its drill, on the body that has it | another skill measured again |

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
   chance a body takes it. It reads an Option by what its model says (whether it is open, its
   seconds, what it deals and takes, its price), never by its kind or its name (the owner,
   2026-11-26), so a new skill has a prior the day it is added. It is used four ways: to guide the search (PUCT), to
   predict the foe (3), to narrow a wide body's Options before the search, and to decide alone,
   with no search, for a body that cannot afford one. A fit names its bodies, as the fitted
   value's does, and is read by the same rule.

Whether one fit over several bodies reads a new body better than the nearest body's own fit is
read when a body is added that has neither, not before.

## What is guessed now, and what replaces it

From the audit, checked in the code. Each guess shapes every body's choices, though so far only
the rat's fights have shown it.

Many of these are not a number: a zero no one wrote, or a rule. The registry cannot hold such a
guess and its scan cannot see one (`scripts/hand-set.mjs` says what it cannot see), so this table
is where they are listed. "Where" says so of each.

| Now | Where | What it does | Replaced by |
| --- | --- | --- | --- |
| The end of a line is not priced | `objectives.ts` `fewTermsWorth` never reads `path.end`; `space.ts` `cutWorth` | A line cut at the horizon, and every hold or guard, is worth the same ending on its back as on its feet | 4 |
| The fitted value reads only the man | `assets/minds/fitted-value.json` fitted on man against man; `fittedOn` | Every other body, and the man against any other, falls back to the tail's leaf | 1, 4 |
| A second down is priced at the foe's peak | `profile.ts` `downCostOf` (`PressureFields.peak`) | Lying 5 m away costs as much as lying at his feet: 0.075 of the rat's life a second, where its time down in fights cost about 0.004 | 3 |
| The foe stands still in imagined lines, or carries on as he was | `carry` 0 by default, 0.5 s in the settings every body shares; `imagined.ts` | Waiting near a foe who would close looks free, or is priced by where his velocity takes him | 3, 5 |
| The foe's replies are searched only against the same body | `replies.ts` `repliedSearch` (`bodyOf(focus.spec) !== searched.body`) | Against any other body, replies are never searched | 3, 5: the foe's Options built from his own body, weighted by the prior |
| A walk never falls outside a clinch | `places.ts` `walkTerms` | Walks look safer than strikes, whose falls are measured | 2 |
| The clinch | `by-hand.ts` `CLINCH`: 0.65 m centre to centre, 0.2 falls a second, every body | Holds and walks near the foe fall at one rate, rat or Warrior | 2 |
| Ways up and recoveries not measured | `by-hand.ts` `WAYS` (a way up 5 s, 7 in 10; the regain 9 in 10, over the 2 s of `rise-memory.ts` `REGAIN_TRY`; a brace 0.25 s), `BRACED` (1 s) | Getting up is priced by hand only for a technique no body's drill measured, or begun where no trial of it begins; a body without its own drill reads the drill of the body nearest in stature (`profilesFor`), as a strike does. `REGAIN_TRY` is sorted as the Mind's own, a timer, and is also this guess's seconds | 2 |
| Blows not measured | `by-hand.ts` `PRIOR` of `record` (0.3 lands, 0.6 s), `BLOW_SPEED` 5 m/s, `LANDS` 0.3, `RATE` 1 a second | A foe's limb with no profile is priced by hand | 2 |
| The cover | `by-hand.ts` `STOPS` 0.6 | A cover keeps off six tenths of any blow | 2 |
| Where a fall leaves the body | `by-hand.ts` `FALLEN` "back" | Every fall is priced as landing on the back | 2 |
| A foe with no turning measured turns at once | `by-hand.ts` `UNMEASURED_TURN` (Infinity), read by `profile.ts` `turnOf` | Going round a foe is worth nothing | 3, 5 |
| The search weighs every Option evenly | `tree-search.ts` `treeSearch`: UCT, no prior | With dozens of Options, 50 runs spread too thin to find the strong line | 5 |
| Stances read by the model's name | `gaitStance`, `carriageOf` (`places.ts`, `back-step.ts`, `percepts.ts`) | A model with no entry gets no stance and no back step | 2, its stance measured like any Option's |
| The foe is the same at every state of a line | `imagined.ts` `placedWith`: a rule, no number. His posture, his stance and his life are read as at the root | A foe down now is down at the end of every line, and one the line strikes reads no weaker for it | 3, 5 |
| No blow is coming, and nothing of the body's own is under way, past a line's first step | `imagined.ts` `afterDanger` (`danger` 0), `afterActions`, and `placedWith` (`incoming` null): zeros written as a rule | A blow seen coming is priced once at the root. The cover has no model at any later state (`cover.ts`) | 3 |
| A blow seen coming costs nothing where a bout table reads | `profile.ts` `ProfileExchange.danger` returns 0 where `measuredAgainst` finds a table, and `pressure` sets the latency to 0: zeros written as a rule | Against a standing foe of a pairing measured, the cover keeps off a share of nothing, so it is priced as holding. A body lying there is priced by what a second down costs, which does not read the table, so nothing prices the blow coming at it, and its source says "not priced" | 3 |
| The foe's mind is taken for one like this one | `pressure.ts` `pressureBy`: his latency is `RETHINK`, this body's command delay and his fastest blow. `profile.ts` `foeModel` reads his profiles at this mind's rate and delay; `reach-memory.ts` `reachMemory` spends the latency in his reach and restores it out of it. Rules | How soon any foe's first blow comes is this mind's timing, a rat's or a Warrior's | 3, 5 |
| The foe throws his best strike back to back | `pressure.ts` `ProfilePressure.read` and `dealt`: the most of his strikes' rates, times the seconds, where no table reads. `foeModel` gives him every strike measured on his model that his limbs hold as its trials did (`profilesOn`), and guesses each other limb of `default-strike-limbs.ts` `defaultStrikeLimbs`. A rule | Standing in his reach costs his best blow's rate for every second, whatever he holds as a skill | 3, 5 |
| A blow seen coming is priced as his worst strike with that limb, both bodies standing | `profile.ts` `coming`: the postures are `STANDING`, the reading is the most of his measured strikes with the limb, and a range past a strike's reach is read at its reach (as `strike.ts` `expected` reads the body's own). A rule | A blow coming at a body on the ground is priced from trials at a standing one, and at its worst | 3, 5 |
| With no foe in sight, a second down costs what the body's own kind would deal | `profile.ts` `ProfileExchange.down` models a foe of `seen.spec` where there is no focus: a rule | Lying alone in a room has a price | 3 |
| A walk arrives at its spot, at rest, on a rule's time | `places.ts` `walkTerms` (outside a clinch one outcome, `velocity: STILL`; inside one, up at the spot or fallen); `walk.ts` `walker` `seconds` by `travel.ts` `legSeconds` (its `PIECE`; `slowFrom`, which reads the gait's `stopping` and `lag`; `ROUTE_MARGIN` through `cornersOf`: `locomotion.ts` `STANCE_STOPPING`, `STANCE_LAG`); its pace by `stance-envelope.ts` `heldPace`'s ellipse. These files are outside the pricing folders, so the registry holds none of them | A walk's seconds and its end are a braking rule's, no trial's. A gait with no limits is timed as its length over the pace its orders allow | 2 |
| Along a walk the foe stays where he is | `places.ts` `walkTerms`: the pressure along the way is read against the focus where he stands now, and he turns to face for the whole walk (`turns`). A rule | Walking past a foe is priced as walking past a post that turns | 3 |
| A guard and a brace are priced as holding | `rest.ts` `guard` and `brace`: each model is `holding`. A rule | The hands at guard, a shield held between, and a brace on the ground change no price | 2 |
| A way up costs the flat down rate for its whole length | `rise.ts` `downTerms` (`Predictions.down`'s rate times the seconds); `endings` leaves each try still, where it began. Its profile is read with no foe (`recovery/data/profiles.ts` `edgeExpected`, `groundStart`). Rules | Rising at a foe's feet and rising alone take as long and end the same, and a body half up costs as one flat | 2, 3 |
| A strike's own measured cost is dropped, and the back step's is all it pays | `strike.ts` `priceOf`: `taken` is the blow coming and the foe's pressure, never the profile's `Expected.taken`. `back-step.ts` `backStepping`: `taken` is its trials' alone, with no blow coming and no pressure. Rules | The two are priced by different rules, so one cannot be weighed against the other fairly | 2, 3 |
| A profile with no trial in the foe's phase reads its "clear" trials | `reading.ts` `phaseOf`: a rule | A strike at a foe who is striking or rising, never measured so, is priced as at one standing clear | 1, 2 |
| A strike with no recovery recorded recovers at once | `reading.ts` `nearestRun` and `cycleAt`, `form.ts` `formRun`: `recovers` 0 where no trial has one. A zero written as a rule | Such a strike looks quicker than it is, and its rate higher | 1, 2 |
| A guessed blow costs its thrower nothing | `by-hand.ts` `readingOf` (one made-up trial: `taken` 0, never down, read in any phase), `BY_HAND.strike` (`taken` 0, `recovers` 0; down only as a clinch makes it, `clinched`), `BY_HAND.limb` (the foe lands as this body's own record says); `damage.ts` `blowLife` (an edge or a point priced blunt, at the head unless named). Zeros and rules | An unmeasured strike takes nothing and recovers at once; it falls only as a clinch makes it | 2 |
| An Option with no exit recorded leaves the body where it stood | `outcomes.ts` `exitOutcomes` (`stays ?? 1`, `moved ?? 0`), `upOrDown` (a fall is still, where the body stood): a rule | A strike or a sway whose trials kept no exit, and every fall, moves no one | 2 |
| Following orders is priced as standing still | `orders.ts`: for `AHEAD` (1 s), the blow coming and the foe's pressure where the body stands, and no outcome but staying. A rule | A walk ordered toward a foe or away from one costs the same | 2 |
| An Option run again deals and takes the same each try | `again.ts` `again`: a try that leaves the body where it began is run to the horizon, each try as the first. A rule | The foe is taken to let one exchange repeat for the whole horizon | 4 |
| The fitted value ranks the Options on offer at 2 dealt to 1 taken | `fitted-value.ts` `TRADE`, sorted as the Mind's own. It does not follow the aggression a player sets | The value's best-rate features rank by a preference fixed when it was fitted | 4, at its next fit |
| A reading past what was measured goes on as its edge did | `pressure-table.ts` `curveThrough` (past its last horizon, the last span's rate); `fitted-value.ts` `fittedOver` (past its last horizon, the last's); `form.ts` (a range or velocity past its trials, along the fitted line; a body number, at the span's edge). Rules | A long hold, a far start and an odd body are each priced by a rule and marked as measured | 1: rows where the reading is asked |
| Five fields of the mind editor say what happens in a fight, and two settings with no field | `choosers/parts.ts` `carryField`, `REPLIES_FIELD` and `AGAINST_FIELD` (how long the foe keeps moving, how many of his replies are searched, and whether he makes the worst of them or their mean); `part.ts` `walkStart` and `sways` (how a walk starts, where a sway leaves the body), and its `pressure` and `outcomes`, which pick the reading that prices a fight. Each is preset by hand | A player sets what rows could say, so by the test below these are guesses, not preferences | 3, 5 for the foe's three; 2 for the body's |
| What the Mind is shown is cut by thresholds, most of them outside the pricing folders | `threat.ts` `THREAT` and `PREDICTION` (whether a blow is read as coming), `RISING` (whether a foe down reads as rising); `action-window.ts` `SETTLED` (a body still enough to stand); `movement.ts` `ARRIVED` (a try that stays, in `again.ts`). Inside them, sorted as the Mind's own: `rise-memory.ts` `TRUNK_UP`, `READY_HOLD` and `onFeet` (whether the body reads as up), and `strike.ts` `PATIENCE` (how long a strike waits). `back-step/index.ts` `BACK_STEP_SECONDS` is how long the back step is held, not its price | The scan does not read the files outside. A trial's start is labelled by the same code, so a change to one moves the trials and the readings together | None: listed so the scan is not taken to cover them |
| A foe not standing deals nothing | `exchange/profile.ts` `placingAt` (no guess is made of a body lying); `exchange/pressure.ts` (its limbs are marked as not guessed); every strike profile's trials begin with the striker standing, and the bout table is read only for a standing foe. A zero written as a rule | With his posture kept from the root (the row above), a foe down now deals nothing for a whole line | 3 |
| The foe's reply is this body's first step turned round | `exchange/profile.ts` (the reply is the body's own first step reversed); `choosers/replies.ts` (tried in at most four directions; past that step he stands). A rule | What the foe does in answer is drawn from this body's Options, not his | 3, 5 |
| Past a line's first step the bout table is read in any phase | `exchange/pressure.ts` `dealt` (`now.grace === undefined ? measured.doing : null`); of tables as near, the first wins (`pressure-table.ts`). A rule | What the foe was doing is read at the root only | 3 |
| A standing hold is priced with the body still | `rest.ts` `holding` (`velocity: STILL`): what the body was going at is not carried through a hold. A rule | Holding while moving away or in is priced as holding at rest | 2 |
| The rat's own Mind | `option-presses`: best line, aggression 5 | Pushes past the wrong prices for one body | Retired once the rest stands (the owner's word) |

Outside the Mind's prices, the same audit found the trunk opening's aim (`strike-kinds.ts`,
`TRUNK_OPENING`) copied from the Warrior's punch to the sword's thrust. That belongs to the skill
recipe's tuning search, and goes there. Until that search sets it, the registry lists it as a
guess.

**Not guesses.** Two sorts of number set by hand are not predictions, and stay.

**Preferences** are how a body is told to fight, and a player sets them: the objective's
aggression and initiative, the search's horizon and runs. Each is a field in the mind editor,
its default chosen by measuring it. A number that is not such a field is not a preference. The
registry holds a field's preset where it is a constant, the entry naming its field: aggression,
the horizon, the runs and the exploration, and what each level of obedience is worth
(`OBEDIENCE`). The other presets are written in their fields, which the scan lets through as a
player's: initiative's 0 (`objectives.ts`), and in `choosers/parts.ts` the obedience level
"steady", `best` 1, `keeps` 0, `carry` 0, `replies` 0, the leaf "tail" and "worst" against the
foe's replies. `margin` (0) is a setting with no field.

**The Mind's own** are implementation: how the Mind works, the same for every body and keyed by
none. No player sets them (the owner, 2026-11-25: "margin and draw settings are implementation
details, why would a video game player manually select implementation detatils?"). The registry
holds them (`handSet`, `src/core/hand-set.ts`): each is an entry where the code reads it, with
its name, its sort and a sentence that says what it is. So this plan keeps no list of them that
could drift from the code. `HELD_FOE`, `REPLY_LEAST`, `LONGEST` and `AHEAD` are sorted there as
the Mind's own. Their families:

- the objective's shape at the clock and for reaching a place;
- how many trials are nearest and over what spans, and how a written form is fitted;
- the pressure table's reading;
- how many tries a prior counts as against a record;
- how long the Mind keeps what it chose or priced before it reads again;
- caches and tolerances, and how up a trunk and how settled a body count as up;
- the fitted value's caps on a time and a distance;
- how far apart two bodies are in the numbers, and how fast an older row comes to count for
  less, when those are built.

They are in the registry, and the inventory lists and counts them. They are not on the list
that fails.

What tells one of the Mind's own from a guess: a guess says what happens in a fight (how often
a blow lands, how long a way up takes), so rows could say it instead. No row could say one of
the Mind's own. A number that rows could say is a guess, whatever it is called.

## What a name, a pairing or a pooled reading still finds

The numbers plan's census, as the code stands. Rules 1 and 2 ask each of these mended.

| What the Mind reads | Found by | Today | What the rules ask |
| --- | --- | --- | --- |
| The foe's pressure (`pressure-profiles.json`, `pressureTable`) | both bodies' numbers, near within a span in stature and mass, each holding exactly what the measured body held (today, nothing: `holdsAlike`), so a body or a foe holding anything reads no table; a table for each pairing measured, and a pairing near none by the strikes' rate | 3: a man on a man, a man on a rat, a rat on a man | mechanism 3, which needs no table of a pairing |
| A strike's outcomes (`strike-profiles.json`, `profilesFor`, `profileAgainst`) | the striker's model (`Measured.body`); a body with none reads the body nearest in stature alone (`profilesFor`), its ranges scaled by stature (`acrossBodies`); the struck body by its numbers | 18, one a striker's body, skill and limb | the striker by its numbers as the struck body is, its own trials first |
| A strike's skill and limb (`lookup.ts` `profilesFor`: `Measured.skill`, `Measured.limb`) | their names, matched whole | each profile is of one skill, variation and limb by name | a skill by its kind and what its model says (rule 1) |
| Whether a borrowed profile is scaled (`across.ts` `acrossBodies`) | the model's name (`measured.body === striker.model`) | only its ranges scale, by the two statures; what a blow deals and takes is read as measured | by the numbers: scaled wherever they differ, whatever the name |
| A struck body that matches no profile (`across.ts` `profileAgainst`) | the first profile in the file (`profiles[0]`), not the nearest | not met yet: one profile a striker's body, skill and limb | the nearest in the numbers |
| A profile's reach, its peak and its fastest blow (`reading.ts` `reach`, `extremes`) | the trials are cut to the postures read at; then the reach is the farthest start of any, and the peak and the fastest are the most over every run trial's start, whatever was held, how the two stood in their stances, and the body struck | pooled, where a profile's outcomes are read from the nearest trials or its written form (`predictions/part.ts` `OUTCOMES`, "written" by default) | from the rows nearest in the numbers, as its outcomes are (rule 2) |
| The foe's strikes (`profilesOn`) | the foe's model, never across bodies; a foe with none is priced as the reader's own strikes, else by hand | the same asset | a foe with none reads the nearest body's, marked borrowed |
| The foe's strikes as one (`exchange/model.ts` `pooled`) | every measured strike's trials pooled under the first profile's `measured` | a foe's every skill and limb is one reading, which his pressure's rate reads | mechanism 3: each strike read as its own, weighted by the chance he throws it |
| A foe's measured reach (`exchange/model.ts` `measuredReach`) | the foe's model (`measured.body === foe.model`) | read by the back step's evaluation alone (`src/evaluation/back-step/read.ts`) | by numbers, as a strike's |
| The back step's sways (`step-profiles.json`, `backStepping`) | the stepping body's model, else the body nearest in stature (`profilesFor`); offered only to a model with a `SWAYS_FROM` stance (`gaitStance`) | 1, the man's | by numbers, as a strike's |
| How a body stands in a gait (`src/skills/locomotion/move/gaits.ts` `GAIT_STANCES`, `gaitStance`, `carriageOf`; the back step's `SWAYS_FROM`) | the gait and the model, typed in source | the man's | measured as any Option's (the table above) |
| How fast a body walks and a foe turns (`stance/envelope.ts` `stanceEnvelopeOf`, `envelope-table.ts` `envelopeIn`) | the model, and the right hand's item by its name (`heldIn(spec, "right")`); the left hand is not read | the man's, the woman's and the skeleton's, each with four things held. The reptile and the rat have none, so as foes they turn at once | by numbers, as a strike's; a body with none reads the nearest, marked borrowed |
| The edges a body gets up by (`edge-profiles.json`) | the model, else the body nearest in stature (`profilesFor`); the technique by its name (`techniqueSkill`) and the posture begun in | 17: the man's 5 techniques, the woman's and the skeleton's 6 | by numbers, as a strike's |
| A profile's written form (`src/skills/framework/form.ts`) | least squares over all of a profile's trials in a phase, what was held among its terms | the edges' forms fit every loadout's falls at once | read from the rows nearest in the numbers, so rows of one loadout do not move another that has its own (rule 2) |
| The fitted value (`fitted-value.json`) | the names of the body and of its foe (`bodyOf`, `fittedOn`) | 1, the empty-handed man against himself | mechanism 4 |
| Whether a body is offered a skill's Option (`records.ts` `recordFault`, `tunedSettings`; `held-strike.ts`; `staged/records.ts` `STEP_UP_BODIES`) | the model's name among the bodies its record names | a body with no record under its name is offered no such Option; the nearest body's record is never borrowed | the nearest body's that has drilled it, marked borrowed (what a new thing costs) |
| A weapon's strike (`held-face.ts` `heldFace`; the bonk, the club blow, the sword thrust) | the name of the item in the hand ("club", "sword") | an item of another name is offered no weapon strike | the item by what its spec has: its faces, its mass and its reach |
| What an evaluation's saved results are kept by (`lookup.ts` `bodyProfiles`, `records.ts` `bodyRecords`) | the profiles and records under the body's own name | a body that borrows has none, so a change to what it borrowed leaves its saved results standing | a result kept by what the body read, borrowed or its own (rule 3) |
| A body's default Mind (`DEFAULT_MINDS`, `DEFAULT_BODIES`, `src/app/catalog.ts`) | the model, and the body's name | the empty-handed man `option-lean`, the rat `option-presses`, every other `option-shared`: the settings every body shares (step 2), the man and the rat each adding their situation's | a body's entry holding only what is its situation's, the rat's read again on the shared settings (the owner's rule; step 13) |

What a body holds is already numbers on a trial (the mass held and its reach past the hand,
`Start.held`), and no loadout finds a profile. But no trial crosses a loadout with a skill
measured without it, so a body holding a sword reads its own punches' and its stomp's
empty-handed trials, coarse. As a foe, the punch of the hand that grips the sword is dropped
(`limbHoldsAsMeasured`, `lookup.ts`) and that hand is left to a guess. Of the weapons' own strikes
only the bonk with a club has a profile.

Some readings are in plain metres whatever the body's size: the clinch (`CLINCH`, 0.65 m), a
guessed blow's speed (`BLOW_SPEED`, 5 m/s), and the fitted value's ranges, none of whose
features (`FEATURES`) is a body's stature or mass (each body's stance numbers are among them, in
metres). So are several of the Mind's own: the pressure table's span (`SPAN`, 0.1 m), the
nearest trials' span in range (`NEAREST`, 0.1 m), `REPLY_LEAST` (0.01 m), `HELD_FOE`'s 0.3 m,
`FARTHEST` (8 m), and the threat's 1.5 m (`THREAT`).

Outside the Mind, and one a body, not a pairing: each skill controller's record by model
(`dataOf(...)[model]`) and the mind notes, kept by the Mind's preset, then by model and by what
both hands hold. So are the stance's calibration (`stance/calibration.ts` `stanceCalibration`:
the man's and the skeleton's, every other body the stock settings), the walk and run's settings
(its `DEFAULTS` where the model has none), the step-up's settings, found by the model
(`staged/records.ts` `stepUpTuningWith`) and by both hands' item names (`composed`), and what a
model is armed with where a setup says nothing (`EQUIPMENT`, `src/game/model-loadouts.ts`).

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
many Options; a prior refitted on the guided search's own runs; the prior at the root; a prior
that does not read an Option's kind; a target that does not depend on where the search's runs
went; and every use but PUCT. It was read once, on the one body where a prior can help least, at the one run count
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
- **Three targets.** Fitted to where the search's runs went (the search taught by itself, refitted
  on the guided search's runs for two or three rounds, and no further: rule 4); to what bodies did
  in the record; and to each Option's forked worth, a softmax of what each Option on offer was
  worth when the state was forked once for each ([the forked record](2026-11-26-forked-record.md)).
  The last does not depend on where the search's runs went, which is what PUCT changes.
- **No kind.** Every variant reads an Option by its model alone (mechanism 5).
- **Screened on the regret bank first**, where the forked record has built it: each variant's
  regret at the banked states, then a match for those that pass.
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
   step 5); deciding at 10 Hz is no gain: alone it saves a sixth of the thinking and loses to
   60 Hz (0.344, the approaches' "The rate alone"), while 40, 30 and 20 Hz each play 60 Hz even;
   searching every 0.1 s, the clocks apart, 20 Hz still plays 60 Hz even (0.472) for a sixth less
   thinking and 10 Hz still loses (0.378); a shorter search period is a gain (every 0.1 s against
   0.2 s, 0.642, for about 15 % more thinking: the approaches' "The search period");
   the rate and search period every body shares are the cheapest of those that hold on the rat; the backup, the aggression and the initiative were chosen by
   reading one body, so a situation's. Scope: the empty-handed Warrior and the rat against him,
   by the procedure's step 4. Nothing is played for the other bodies: the fingerprint names
   each case moved, and the report lists them as moved and not read.
3. **The fight record and the measuring command, which holds rules 2 and 4.** One row format
   that each fit and profile reads: the decision states `fitted-value.mjs` keeps, with every
   Option on offer and its model (as `move-prior.mjs` keeps them), the share of the search's
   runs each took, the Option run, what followed, and where the foe went; and room for each
   Option's forked worth and what it did, where [the forked record](2026-11-26-forked-record.md)
   has forked the state. The measuring command
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
6. **The action prior** (mechanism 5): fitted on the record, on each target it has (the forked
   worth once the forked record has landed it, the others meanwhile), reading no Option's kind;
   read in the game as an asset, as the fitted value is. Its held-out nats against the price's
   softmax, by how many Options were on offer. Scope: the empty-handed Warrior's record, step 3's.
7. **PUCT with the prior**, tried as the section above says: the prior-weighted mean first, then
   the run counts, the wide body, the refits on its own runs and the bound. Each variant
   screened on the regret bank where it exists, and pickable. Kept as a body's search if it plays as well for less thinking, or better. Scope: the
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
    a fall leaves the body; then the unmeasured blows; then the stances. Where the forked record
    has read each Option's model against its forks, its largest errors go first.
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

## Where it stands

- **Step 1 landed.** It changed no fight: the fingerprint moved no pose, and the empty-handed
  man's mirror played the same 24 bouts to the bit. What it built is in
  [the code recipe](../recipes/code.md#code): the registry and its scan, a reading's and a
  price's source, the inventory and its list. A session that was given the commits and the
  listing, and not the work's report, was told to refute it. It refuted ten claims, and each
  was mended or is said under "What it cannot show" above. A second session was then told to
  refute the mends. It found eight places where they were not as claimed, and each of those
  was mended or is said there as well.
- **The inventory's listing**, 19 standings: the game's five bodies empty-handed and as armed,
  with the made-up body and item, each in front of the empty-handed man, and him in front of
  each. 51 numbers set by hand (34 the Mind's own, 11 guesses, 6 preferences); 109 rows that
  fail, the 11 guesses among them; 4 settings in which the default configs differ, each a
  situation's (the backup, the objective, its aggression and its initiative). 142 readings are
  borrowed. The farthest, 14.45 spans off, are the man's in front of the
  reptile and the rat: his back step read for a target of his own size, and the reptile's
  punches and kicks found by a rule from the man's. The 207 readings stale by their settings
  are every body's, read looking at 20 Hz where they were measured at 60. The first listing stood each
  body only in front of the man and read 56 rows; the foe's side, the guesses, and what is
  missing with a made-up thing on either side were added. The man's kicks were profiled after
  that, under his name: ten more rows, his kick found by a name where it was by hand.
- **What the made-up body met**, which is what a new body costs today and what the mechanisms'
  steps are to mend: no Mind as the game makes one (the stance's envelope is found by the model's name);
  no walk on offer; no punch, kick, stomp, back step or way up, each record being under another
  model's name; and no reading of the foe's fighting in bouts. What it does read, it borrows by
  numbers: the brace from the woman, the flatten from the man. As a foe, its punches are found
  by a rule from the man's, its stomps are not read, and nothing is read of its fighting in
  bouts. The made-up item is read as the rows nearest in what a hand holds,
  1.6 spans off, and is offered no weapon strike, its name not being "sword".
- **Where the prices came from in play**, over all 124,168 offers that had a price, at every
  decision of the man's mirror (24 bouts), played before his kicks were profiled. How long an Option takes: given 26.2 %, its own
  20.0 %, by hand 53.7 %. What it deals: given 98.7 % (most offers deal nothing by what they
  are), its own 0.5 %, by hand 0.8 %. What it takes: its own 1.0 %, by hand 50.4 %, not priced
  48.7 %. Where it leaves the body: given 10.9 %, its own 20.0 %, by hand 67.5 %, not priced
  1.5 %. Where the foe goes meanwhile: by hand 100 %. What the line's end is worth: its own
  73.8 %, which is the fitted value, measured for the one pairing of the man against himself (a
  row that fails); not priced 26.2 %, the lines cut at their first step, every hold and guard
  among them. Nothing was borrowed, since this is the one body everything was measured on.
- **No asset names the Minds that played it yet.** The measuring tools write them from now on;
  the inventory says "not recorded" of each asset measured before, and none is measured again
  for it (rule 4).
- **Next: step 2.** [The forked record](2026-11-26-forked-record.md) runs beside steps 2 to 5,
  which do not need it.

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
- **A profile does not say whether its skill was developed on its body, and "its own" does not
  mean that.** The assets hold the woman's and the skeleton's punch, 7,969 trials of a skill
  developed on the man alone, found and read as any other profile. Step 1 settled what the
  inventory calls a body's own: rows that body played, as it is and holding what it holds.
  They say how the skill goes on that body, well or badly, which is what a price needs; a
  skill need not suit every body, and its rows on a body it does not suit say so in what
  landed. So a reading of how good a skill is, is never taken from a body's own rows of a
  skill developed elsewhere (rule 5), and nothing in the Mind needs to know where a skill was
  developed.
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
