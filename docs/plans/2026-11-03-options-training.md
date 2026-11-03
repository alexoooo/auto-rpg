# Options trained body by body

## Why

The owner: the way Options were trained kept known bugs and rejected real gains.

- **Lower-level fixes were dropped for a higher reading.** A fix that broke code above it was
  read as a worse fix, when it exposed a bug above. The code must not do the right thing for the
  wrong reason.
- **The bars were arbitrary and not the body's.** A person's figure less one SD, scaled by mass and
  strength, is a guess with no baseline behind it, too easy or out of reach, and fragile; the
  Skeleton weighs 15 kg against the Warrior's 79.
- **One controller per Option for every body** rejected a gain on one body that did not help the
  others. One framework for every body has not worked, so Options specialize: by Option first,
  reusing skills beneath, then by body where the shared one cannot serve.
- **Option Mind is not yet general.** Its config lists skills (executors, the actions that use
  them, getting-up techniques, gaits) beside its options, and the function that builds its decider
  builds the rise and the strikes itself; the quadruped's frame runs a decision loop of its own,
  with its own chooser, situation and options, a stalk deciding outside them and a righting that
  takes the body. Option Mind is one loop for every body, and everything it does is an Option made
  the same way.

What is wanted is each skill as good as it can be made quickly, with two hard requirements: every
character stands up reliably in under 10 s, and the Warrior and the Rogue run reliably.

Built before it: one family of minds, minds in parallel, and the table. Its scope is the owner's:
the toed Warrior, Rogue and Skeleton with every loadout (empty hands, the club, the sword, the club
and buckler, the sword and buckler); the walk, stand-up, the punch and the club, sword and buckler
on all three; the run and the stomp on the Warrior and the Rogue. **The Skeleton has no stomp** (the
owner's decision): at 15 kg its blows carry under 3 J against the Warrior's 15 to 52 J ([stomp
settings](../reference/front-kicks.md#stomp-settings)); a held item brings its own mass. Where each
cell starts: [the table](../reference/the-table.md). Making Option Mind general (step 2) covers
every body it plays, the reptile and the rat included; how well the quadrupeds move is
[the rat](2026-11-01-rat.md)'s.

## How it works

### A bug is fixed by its own layer's contract

A lower-level defect is fixed when it is found, judged by what its own layer promises (a step lands,
a walk stops where it was asked, a stand holds its centre where it was asked), never by a reading
above it. What the fix breaks above is a defect there, fixed next in the same push. A cell of the
table that drops meanwhile is named in the commit, not a reason to keep the defect.

A body's settings were searched against the shared code as it was. Where a shared change sets a
body back, that body's settings are searched again on the new code before anything is called a
defect.

### What is required

- **Stand-up, hard**: the owner's target ([rising](../reference/rising.md#the-owners-target)) on
  every body in every loadout, the Skeleton included: at least 15 of 16 verified recoveries within
  10 s in every group, 61 of 64 overall, every cardinal direction in every group, a
  failure-inclusive median of at most 10 s, unassisted; held again on fresh falls.
- **The run, hard**, on the Warrior and the Rogue in every loadout, calm air and the lab's gusts,
  seeds 1 to 4, none fallen: 3 m/s forward held 10 s, a turn at 1 rad/s at 2 m/s, a stop from
  3 m/s within 1.5 s; read as the slowest second of the hold at 3 m/s, of the turn at 1.8 m/s with
  the way travelled at most 0.35 rad behind the way asked, and a stop asked at 2.7 m/s or more and
  under 0.15 m/s within 1.5 s. 3 m/s is a floor (the owner's decision); faster is better.
- **Every other cell, best effort**: its drill's score on its body, read first as its baseline,
  then raised by paired readings against the version before; a gain is kept, a loss is not. A cell
  gets one search or training run, priced from its first trials and under an hour, and the fixes
  of the bugs it exposes; where an iteration brings no gain, its best is kept, its ceiling named
  from a reading (the body, the controller, or the drill), and the work moves on. The person's
  figures (`BAR`, `src/evaluation/strike/read.ts`;
  [human strike reference](../reference/human-strike-reference.md)) are reported beside each
  reading, as a scale, and gate nothing.
- **Guards**: no change sets back stand-up or the run; and no Option makes its body fall unless a
  fall is part of its design. An Option that trades a fall for power (a tackle, an all-in kick
  that falls on a miss) states it, and its fall rate by outcome is measured into its profile for
  the mind to weigh. No Option in scope states one, so every fall here is a defect.

### Everything Option Mind does is an Option

- **Two concepts.** A **skill** is how a body does one thing (a punch, a club blow, a gait, a way
  up, a bite), with its body's settings; a person's orders and the drills drive skills directly.
  An **Option** is what Option Mind chooses among: one skill used one way (its limbs, its target,
  its aim), with when it can begin, what it claims and what it is expected to bring. What an action
  holds today is the Option's.
- **One config.** An Option Mind config is its chooser, what it predicts from, and its Options,
  each naming its skill. A body builds the skills its Options name that it fits, and an Option
  whose skill it does not fit is not on offer to it. There is no executor, action or getting-up
  list and no frame: what lies under every skill (motor control, the stance, the posture a body is
  built in) is its body family's, chosen by the body.
- **One loop.** The situation reads the percepts its Options and objective declare; the chooser
  and objective are the same for every body. The decider's builder names no kind of Option.
- **Where an Option leaves the body is worth what Option Mind expects from there**, for every
  Option: a lying posture is worth the expected time to standing over the Options that begin
  there, so a blow that may fall and a way up that may fail are priced alike. An Option's record
  of failing from a situation in the bout, and its price where no profile measures it, are the
  same for every Option.

### Bodies told apart in data, never in logic

- **Settings are a record per body** (`SkillRecord`, `src/core/skills/framework/records.ts`),
  searched on that body alone across its loadouts; a held item is a condition the controller reads
  from the body. A body with no record of a skill does not have it (`recordFault`), except where a
  rule derives settings for any body (the gaits scaled to the leg, `scaledGait`): there the rule
  gives the default, and a record overrides it.
- **Other logic for a body is another skill**, which only the bodies with its record fit
  (`Part.fits`), named by an Option of its own.
- **No body is named in control code**: no model's name or key, and no stand-in for one (a mass
  under 20 kg meaning the Skeleton). A test of what the body can do (it has toes, a hand is free)
  is a fit.
- **Variants compose the shared pieces** (stance, bearing, pose drive, the step's solve) and never
  copy one; a bug fixed in a shared piece is fixed for every body. A variant lives while a body
  uses it.
- **What a change is judged on**: a record or a variant on its own body; a shared piece on every
  body. A shared change that sets one body back, once that body is searched again, is a defect in
  its path or the reason it gets a record or a variant of its own; never the reason to reject the
  change.

## Steps

Each lands green on its own: `npm run check`, `npm test`, `npm run build` where browser code or
assets change, and a toolkit change's message names the fingerprint cases it moves
(`scripts/fingerprint.mjs`).

### 1. The known bugs

Each fixed to its layer's contract, then what it breaks above:

- **A walk's step ends on its time with its foot in the air**, and the next shift hands the weight
  to that foot. Landed as a catch's step lands, the Skeleton's shoved walk fell 59 of 600 against
  79, and the walk ran fast and broke the Locomotion drill's stops and runs (stopped 0.951 to 0.863),
  which then read the step that does not land. Check: no step ends in the air (a probe or the
  drill's trials, read at the step's end); the walk's pace and stop on the drill.
- **A walk asked to stand at a place holds the centre of mass over the feet's middle**, not over
  the place: the legs goal's `centre` is left null (`LegsGoal`,
  `src/core/skills/framework/skill.ts`). Held over the place, an
  ordered punch began no strike: the punch's start needs the body quiet over its feet, a defect of
  the punch's entry. Check: the stand's centre where asked; the Mind contract; the punch's drill.
- **A walk to a place beside a body lying overruns it**: the Skeleton asked 0.14 m/s 0.2 m from its
  place walks on at 0.4 to 0.8 m/s, 0.3 m past, and falls on the body; the Rogue's place beside a
  lying Skeleton turns between its sides. Check: the walk stops within its place's tolerance on the
  stomping rung's approach.

A defect found on any later step joins this list and is fixed the same way.

### 2. Option Mind general

Each piece lands on its own:

- **The config is Options.** Each Option kind takes the skill it uses and how it uses it (limbs,
  regions, aim); `OptionMindConfig`'s `executors`, `actions`, `ground`, `locomotion`, `guard`,
  `support` and `frame` go (`src/core/option/mind.ts`), and the presets list Options. A profile is
  an Option's on a body. A person's order names a skill the body has.
- **The body family's layer.** Motor control, the stance and the posture a body is built in come
  from the body's family (the humanoid's, the quadruped's), not from the mind's config.
- **The strikes** are made by their kind, not by the function that builds the decider.
- **The rise as Options.** Each way up, and each of the ground's modes (brace, land, steady,
  flatten, the repositions), is a skill an Option names; the rise's own code goes
  (`groundOptions`, `src/core/option/ground.ts`; `groundExecutor`,
  `src/core/recovery/ground/held.ts`; `Deciding.ground`, `Rising`) once what the rest of Option Mind
  reads from it is general:
  - the expected time to standing from each lying posture (`riseFrom`), which prices every Option's
    chance of leaving the body down (`downCost`, `downCostAt`, `src/core/option/percepts.ts`),
    becomes Option Mind's value of where any Option leaves the body;
  - the seconds until a body back on its feet is braced (`unbraced`), which every place reads
    (`here`, `src/core/option/position.ts`), becomes the reading of whichever Option steadies it;
  - the in-bout record of a way that failed (`recorded`) and the hand-set price of an unmeasured
    one (`BY_HAND`) become every Option's.

  A config that leaves the body no way up from its back or its front stays a fault.
- **The quadrupeds on the one loop.** The reptile's and the rat's Options name their gaits, bite
  and righting; the quadruped's own chooser, situation reader and Option types go
  (`QUADRUPED_VALUED`, `quadrupedReader`, `src/core/reptile/frame.ts`), the stalk's decisions
  (approach, creep, when to bite; `src/core/reptile/tactics.ts`) become Options, and the righting
  is a way up like a humanoid's.
- **The name.** `optionTactics` builds Option Mind's decider; "tactics" is the retired fighter's
  slot and leaves the code and the documents, the roadmap's list of layers included.
- **Deciding while down.** The shared decider decides every step the body is down
  (`src/core/mind/decider.ts`); that becomes a cue the Options give, or stays with its reason
  written beside it.

Check: every Option Mind config is a chooser, its predictions and its Options, on every body; the
decider's builder names no kind of Option, and no rise or body family has a loop of its own; the
fingerprint, each moved case named; the stand-up target on the Warrior, a fall's price, and the
reptile's and the rat's bouts read paired against the version before.

### 3. Bodies told apart in data

- Stand-up's settings by body (`STEP_UP`'s table in `src/core/recovery/ground/step-up.ts`, the
  Skeleton's own roll with them) become records per body under `assets/`, and a technique only one
  body's settings time (the sit-back) is fitted by that body alone.
- The walk's and run's settings (`src/core/skills/locomotion/walk-run.ts`, `cycle-run.ts`, searched
  on the three bodies together) stay the default every body takes scaled to its leg; a body's
  record overrides them, the run's for the Warrior and the Rogue.
- The Skeleton's stomp record is deleted.

Check: the fingerprint, no case moved but the Skeleton's stomps, named.

### 4. The table

The table (`npm run evaluate -- table`, `src/evaluation/table/`) reads stand-up and the run as met
or short, and every other cell as its score against its baseline, with the person's figure beside
it and the version and drill link of its best. Check: every cell read at this step, which is each
cell's baseline; [the table](../reference/the-table.md) rewritten from it.

### 5. Stand-up

To the target on every body and loadout; the shortest first: the Skeleton holding an item (the
club stands 0 of 15), the Rogue (a median of 13.6 s empty-handed; her arms do not straighten on
hands and knees, so a route that does not push up on straight arms), then the Warrior's speed (a
median of 8.7 to 10.7 s). A body gets its own technique where the shared one's ceiling on it is
read short. The legs bear on any set of the ends from where the body is (`BodySpec.ends`,
`carryRoot`, `bearLimbs`, `src/core/control/bearing.ts`), and a ground technique holds only the
limbs it moves. Check: the target on every body and loadout, and on fresh falls; rising in fights
no worse; the owner looks in the Lab's Stand-up mode.

### 6. The run

On toes on the Warrior and the Rogue to the requirement in every loadout, then priced by the Gait
drill (`gait`) so that Option Mind chooses it where it pays. One set of legs stands up and runs a
body, so every leg change is read on that body's stand-up and gait. Where the toes or the body are
the limit, the limit is read and the body's numbers are set for the result, sourced as the owner's
decision with their before and after. Check: the Locomotion drill's run; the stand-up target held;
the owner watches the run in the Lab's Locomotion courses and in the Arena.

### 7. The strikes on every body

Best effort, in order: the punch, the stomp (the Warrior and the Rogue), the club blow, the sword's
cut and thrust, the buckler's cover; each on the Warrior, then on the Rogue and the Skeleton,
seeded from the Warrior's where that starts higher, each body's own record searched or trained on
its own body, and its own variant where the shared one's ceiling is read short. Check: each
cell's held-out reading at 120 and 480 Hz against its baseline and its drill link; its reel
watched, the failures first; the owner accepts each rung.

## Done when

- The known bugs and what they broke above are fixed, each to its own contract.
- Option Mind is one loop for every body, its config a chooser, its predictions and its Options;
  the rise, the strikes and the quadrupeds' acts are Options chosen and priced as every Option is.
- No body is named in control code; every difference between bodies is a record or a part only
  that body fits.
- Stand-up meets the owner's target on every body and loadout, and the run its requirement on the
  Warrior and the Rogue in every loadout.
- Every other cell holds its best reading, its baseline and its ceiling named, and the owner has
  accepted its rung.
