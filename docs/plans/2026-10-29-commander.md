# The general Commander: team options, priced by the life left at the exit

## Why

Option Mind is a general mind: options, each a skill applied to a target, chosen as a set whose claims
do not overlap, each priced in the verdict's unit, by a chooser that is a part. The Commanders are
not general: `mob`, `independent`, `party` and `clearer` (`src/core/command/`) are each a rule
written by hand, and `clearer`'s `POLICY` numbers are first guesses. None weighs one course
against another.

This plan builds one Commander in Option Mind's shape one level up, the **Option Commander**: the members are
its resources, a team option claims members, each option is priced by what it is expected to leave
at the exit, and its chooser is configured. The four kinds stay, as opponents and baselines.

**The owner's decisions** (2026-10-29):

- **The Crypt's score is the life left at the exit**, and a **drain** makes it dense: the player's
  life drains steadily from the start, so time and wounds are one unit, every run ends without a
  cap, and a Commander's value is a prediction of the life it will have at the exit.
- **The drain is for AI experiments only.** The game's Crypt has none by default: a person playing
  is never drained. Only an evaluation's protocol, or a page address that asks for it, turns it on.
- **The player's side is one unit for now**: nothing prices members lost or left behind.

**Decided here, which the owner may reverse**: the drain's length from the level's own route
(not a time written down); the drain on the player's side only; the name.

**What must not move**: the game's Crypt with no drain (its fingerprint cases, before and after
step 1); Option Mind's fingerprint through step 3; the Commander contract's boundary
(`tests/core-boundary.test.mjs`, `COMMAND_BARRED`).

## The design

### The verdict: life at the exit

A run's reading is the hero's life as it reaches the exit (`DungeonRun.status` `won`), and 0 for a
run lost (`dead`). Life is the pool's bar (`Pool.bar`) less what the drain has taken, as the
Arena's is (`Duel.life`). A run drained to nothing is lost by the drain.

### The drain

- **Its length comes from the level**: the drain takes the full life over `perMetre` s for each
  metre of the level's route from the start to the exit (`findPath`, `src/dungeon/map.ts`, at the
  hero's radius), so a long level is not lost to the clock for being long. `perMetre` is the
  drain's one setting, the protocol's to choose (step 2).
- **It starts at once**, unlike the Arena's (`DRAIN_END`, from 60 s): the point is a signal from
  the first second.
- **The player's side only.** The enemies are not drained; they have no exit to reach.
- **Everything reads the drained life**, as in the Arena, where a team's `MemberView.vitality` is
  already `Duel.life` (`src/arena/team.ts`): the Commander's view, a member's senses (`enlist`'s
  `life`) and whether it is out (`enlist`'s `out` agreeing with `DungeonActor.alive`). So a drained
  run plays differently from an undrained one under every Commander and Mind that reads life:
  `clearer` (its `POLICY.odds` and `hurt`) and Option Mind (its `lead` and `downCostAt`). The Crypt
  gives the senses no verdict time (`createSenses`' `ends`): its end is the exit or death, not a
  judgement of the lead.

### The Option Commander

| Option Mind (one body) | The Option Commander (one team) |
|---|---|
| Resources: legs, trunk, each hand (`Resource`, a string) | Each member, by id |
| An option: a skill applied to a target (`Option`) | A team option: a course applied to a target, its step the orders of the members it claims |
| Rest options (`rest.ts`) | One rest option a member: no orders that move it; its own Mind fights where it stands |
| Its entry (`Readiness`) | A foe seen, a member standing, a frontier or the exit known |
| Its model (`Terms`: time, life dealt and taken, where it leaves the body) | Time, life dealt and taken, where it leaves the team |
| The value of a position (`PositionValue`, `FEW_TERMS`) | The life predicted at the exit from a team's place |
| Its chooser, a part (`ChooserPart`: `valued`, `ranked`) | Its chooser, named by its config (`valued`, `ranked`), over set selection shared with Option Mind |
| Following orders at `OBEDIENCE` | A person's commands, later, as an option weighted alike |

**The team's options**, for one unit first:

- **go on**: walk to the frontier, the exit once seen (`TeamLevel.frontier`), doors on the way
  (`throughDoors`);
- **fight `foe`**, one worth fighting (`worthFighting`): the orders name it and approach it
  (`approach`);
- **pass**: go on with no foe named, striking only what is upon it, as `clearer`'s push;
- **fall back**: walk back along the way come to the latest place clear of the foes seen, as
  `clearer`'s rally;
- **rest**, a member's: no movement ordered.

**The value of a team's place**: on a level with an exit, the life predicted at the exit,
`life - drain * secondsLeft - lifeLostInFightsAhead`, at least 0:

- `secondsLeft`: the route left to the exit (`TeamLevel.route`, step 4) over the member's pace
  (`MemberView.gait`), and, while the exit is unseen, the generator's mean route from start to
  exit in `findPath` metres (measured by a script over the generator's seeds, step 5) less the way
  come, at least the frontier's route; plus each fight ahead's seconds;
- each fight: the foe's life over what the member is expected to deal it a second, and what it is
  expected to take meanwhile (`MemberView.prospects`, step 4), the foes ahead those seen in the way
  and, unexplored, the generator's mean encounters a metre of route.

With no exit (`TeamLevel.frontier` null and no exit known: the Arena's team of one), the place's
value is the lead the fight leaves, the Arena's verdict: own life less the foe's, at the
prospects' rates.

An option's worth is the value where it leaves the team less the value now: a foe killed shortens
the fights ahead, a metre toward the exit the route, a wound or a slow fight lowers the life left.
Falling back costs seconds and pays where the fight it leaves would cost more.

## Steps

Each lands green on its own: `npm run check`, `npm test`; a browser look where it is something to
see. A run is priced on the pool from its first trials before it runs. A step that touches both
the toolkit and Option Mind lands as two commits, the toolkit's first (`node scripts/entrant-check.mjs`).

### 1. The Crypt's drain, an experiment's rule

- `DungeonRunOptions.drain?: { readonly perMetre: number }` (`src/dungeon/run.ts`), absent by
  default. With it, the run reads the route's length once at construction, from the start to the
  exit at the hero's radius (`findPath`, the sum of its legs), and drains the party's members their
  full life over `perMetre * length` s. Without it, nothing is read and nothing moves.
- A member's life (`DungeonActor.vitality`, which `MemberView.vitality` reads) is its pool's bar
  less the drained share, at least 0; a member at 0 is out of the fight (`alive` false, and
  `enlist`'s `out` with it), so the run is lost by it as by its pool. Its senses show that life
  (`enlist`'s `life`).
- `TeamView.drain`: the share of full life the members lose a second now, 0 undrained; the Arena's
  team of one (`teamOfOne`) gives its end rules' rate at the bout's clock (`DRAIN_END`: 0 before
  60 s, then a sixtieth).
- `CryptCase.drain` (`src/evaluation/crypt.ts`) carries it into a case. A drained case ends by its
  drain: both caps, the run's (`CRYPT_CAP`) and the protocol's seconds (`clearCases`), give way to
  the drain's end. The Crypt page reads `&drain=<perMetre>` for watching an experiment; nothing
  else turns it on.
- `docs/architecture.md`'s Command table gains `TeamView.drain`.

Check: the gate; the fingerprint's Crypt cases unchanged; in a browser, `?play=dungeon&drain=4`
with the hero standing still is out when the drain ends, and its bar shows the drain.

### 2. The score: life at the exit

`crypt-clear`'s protocol (the `CRYPT_CLEAR` constant, `src/evaluation/crypt-clear/cases.ts`)
becomes a new protocol: the hero alone (no companions), drained, its reading the hero's life at
the exit (`ClearReading.life`, 0 for a run lost) beside the share cleared and the time; the table
gains its column (`src/evaluation/crypt-clear/index.ts`).

`perMetre` comes from one reading: `clearer` with the hero alone, undrained, on the protocol's
levels (4 runs), its median clear time over the route's length, doubled, so that a run as slow as
that median keeps half its life. Then `clearer` drained is the baseline, played drained, since it
reads the drained life: alone, its strength is below `POLICY.odds` from the first step, so it
takes no fight and pushes past its foes. That is what `clearer` does under the drain, and it is
read as it plays; `clearer` is not changed for it.

Check: `npm run evaluate -- crypt-clear` for `clearer` drained, `--write`, the baseline record.

### 3. The chooser shared: set selection in the toolkit

Option Mind's `chooser` (`src/core/entrants/option/options/chooser.ts`) reads of its options only
their claims, rest mark, targets and aim, entry (`onOffer`), status, begin and end, and of the
situation only its time and its cue (`eventOf`, Option Mind's). Lift it:

- **The toolkit's commit**: `Choice<S extends { readonly time: number }>`
  (`src/core/mind/choice.ts`), the option shape without its step, and `selectSet<S>(choices,
  appraise, deciding, cue, chance)`, the present `chooser` with its cue passed in; `overlaps`,
  `NOTHING`, `WHOLE` with it.
- **Option Mind's commit**: `Option` extends `Choice<Situation>` with `step`; `chooser` is
  `selectSet` with `eventOf`; `VALUED_CHOOSER` and `RANKED_CHOOSER` unchanged in behaviour.

Check: the gate; `scripts/fingerprint.mjs` against the commit before, no case moved (it plays
Option Mind with `valued`); one bout of Option Mind with `ranked`, its digest equal before and after.

### 4. What the team reads: routes and prospects

- `TeamLevel.route(from, to, radius): number | null`, the length of a route a body of `radius`
  walks, doors opened on the way, null where none: the run answers by `findPath`, kept for the
  look it was asked at (A* is dear a decision); the Arena's team by the straight distance.
- **The toolkit's commit**: `MindReport.prospects: readonly Prospect[] | null`
  (`src/core/mind/minds.ts`), each `{ foe, dealt, taken }`: the share of the foe's full life the
  body expects to deal it a second, and of its own it expects to take, at the range head to head
  now; `MemberView.prospects` carries it, null where the Mind publishes none. The architecture's
  Command table gains it.
- **Option Mind's commit**: Option Mind writes its prospects into its `state` when its chooser prices a
  foe: the focus at each decision, and each of `others` where the chooser reads them, from its
  `pressing` and `pressure` at the range now. It reads nothing its valuation does not already, so
  the step costs no more, and a forked bout carries them. A foe it has not priced has none.
- Where a member has no prospect of a foe, the Option Commander prices the fight by the baseline's
  record: the mean life the hero lost a foe defeated (step 2's rows).

Check: the gate; in a Node stand, Option Mind's prospects against a standing Warrior agree with its
own `pressing` and `pressure` that decision (a printout, no test); a forked bout's prospects equal
the original's.

### 5. The Option Commander

`src/core/command/option.ts`, kind `option`, a line in `COMMANDERS`, sides `party`: its options (above), its
place's value (`TeamValue`, its first implementation the terms above), its chooser named by its
config (`chooser: "valued" | "ranked"`, its entry's `faults` checking it) over `selectSet` with no
chance (a `TeamHost` has no seed), its memory in `state`. Its options' orders go through
`throughDoors`; its report names the option each member runs (`MemberReport.task`). It hears no
command yet; a person's commands come later as an option of their own. The generator's means
(the route from start to exit in `findPath` metres, encounters a metre) are read once by a script
over the generator's seeds and cited where the value reads them.

Check: the gate, with `tests/command-contract.test.mjs` leading an Arena bout with it as a team of
one, sending its member at the foe, and replaying it from its orders.

### 6. Read against the clearer

`npm run evaluate -- crypt-clear` with the Option Commander (Option Mind the hero's mind), paired against
step 2's `clearer` record (`npm run compare`); then Option Mind under `clearer` against Option Mind under
the Option Commander, so the mind is the same on both sides. The owner watches a run with
`&party=option&drain=<perMetre>`. An iteration from here is one question on the Option Commander,
one change, paired.

## Done when

The Crypt's drain exists for experiments and the game's Crypt runs as before with none; the
Crypt's score is the life left at the exit; the Option Commander, a chooser over team options priced by
that score, leaves the hero more life at the exit than `clearer` on `crypt-clear`'s drained
protocol, paired, with the same hero mind; and the owner has watched it play a level.
