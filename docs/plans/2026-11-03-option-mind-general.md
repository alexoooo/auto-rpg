# Option Mind general, Options developed body by body

## Why

The way Options were developed kept known bugs and rejected real gains, and Option Mind's code is
not one shape.

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
  them, getting-up techniques, gaits, motor control, navigation) beside its options, and the
  function that builds its decider builds the rise and the strikes itself. One kind of option
  makes a strike of every blow the body throws, and the walks carry rules that know other options:
  each strike's window, the foe's reach. The quadruped's frame runs a decision loop of its own,
  with its own view, intent, chooser, situation, objective and options, a stalk deciding outside
  them and a righting that takes the body. Option Mind is one loop for every body, and everything
  it does is an Option made the same way.

This plan fixes the known bugs and restructures Option Mind and the way Options are developed; it
trains no skill. It runs before the other plans in flight. The training follows it: [Options
trained body by body](2026-11-03-options-training.md).

Its bodies: Option Mind general covers every body it plays, the reptile and the rat included; the
table reads the toed Warrior, Rogue and Skeleton with every loadout (empty hands, the club, the
sword, the club and buckler, the sword and buckler). **The Skeleton has no stomp** (the owner's
decision): at 15 kg its blows carry under 3 J against the Warrior's 15 to 52 J ([stomp
settings](../reference/front-kicks.md#stomp-settings)); a held item brings its own mass.

## How it works

### A bug is fixed by its own layer's contract

A lower-level defect is fixed when it is found, judged by what its own layer promises (a step lands,
a walk stops where it was asked, a stand holds its centre where it was asked), never by a reading
above it. What the fix breaks above is a defect there, fixed next in the same push. A cell of the
table that drops meanwhile is named in the commit, not a reason to keep the defect.

A body's settings were searched against the shared code as it was. Where a shared change sets a
body back, that body's settings are searched again on the new code before anything is called a
defect.

### How a skill is developed

- **Stand-up and the run are met or short**, on their definitions: the owner's target
  ([rising](../reference/rising.md#the-owners-target)) on every body and loadout; the run on the
  Warrior and the Rogue in every loadout (`run` in `src/evaluation/table/cells.ts`).
- **Every other cell is best effort**: its drill's score on its body, read first as its baseline,
  then raised by paired readings against the version before; a gain is kept, a loss is not. A
  cell's work, once asked for, gets one search or training run, priced from its first trials and
  under an hour, and the fixes of the bugs it exposes; where an iteration brings no gain, its best
  is kept, its ceiling named from a reading (the body, the controller, or the drill), and the work
  moves on. The person's figures (`BAR`, `src/evaluation/strike/read.ts`;
  [human strike reference](../reference/human-strike-reference.md)) are reported beside each
  reading, as a scale, and gate nothing.
- **Guards**: no push of work ends with stand-up or the run set back (a fix may drop them while
  what it exposes above is fixed); and no Option makes its body fall unless a fall is part of its
  design. An Option that trades a fall for power (a tackle, an all-in kick that falls on a miss)
  states it, and its fall rate by outcome is measured into its profile for the mind to weigh. No
  Option today states one, so every fall is a defect.

### Everything Option Mind does is an Option

- **Two concepts.** A **skill** is how a body does one thing (a punch, a club blow, a gait, a way
  up, a bite), with its body's settings; a person's orders and the drills drive skills directly.
  An **Option** is what Option Mind chooses among: one act with one meaning, one skill used one
  way (its limbs, its target, its aim), with when it can begin, what it claims and what it is
  expected to bring. A club's bonk and its swipe are two Options; a quadruped's bite is its own.
  No kind of Option makes one of each blow; what blows share (entry from a ready limb, a price
  from a profile) is code the Options call. What an action holds today is the Option's.
- **One config.** An Option Mind config is its chooser, what it predicts from, the rate it decides
  at and its Options, each naming its skill. A body builds the skills its Options name that it
  fits, and an Option whose skill it does not fit is not on offer to it. What lies under every
  skill (motor control, the stance, the posture a body is built in) is chosen by the same rule: a
  role no config names is filled by the one game part of that role that fits the body; an
  experiment overrides it by passing a part in. A walk's route is planned by its own skill.
- **One loop.** The chooser and objective are the same for every body. A percept is read the first
  time anything asks for it in a step and kept for the step, as a prediction is; the chooser
  decides afresh when a cued percept its last decision read changes. The decider's builder names
  no kind of Option.
- **Where an Option leaves the body is worth the best Option Mind expects from there**, in life,
  by one rule for every Option, held in the Option's contract: on its feet at a new place, the
  best Option there; in a posture, the best expected over the Options that begin there (lying,
  the life expected lost until it stands), a small table read again only as their profiles or the
  bout's record change. So a blow that may fall and a way up that may fail are priced alike. An
  Option that leaves the body unready says for how long, as a gait does. An Option's record of
  failing from a situation in the bout, and its price where no profile measures it, are the same
  for every Option.
- **Where to walk.** An Option may name its sites: the spots it would begin from, if not where the
  body stands. An Option whose skill cannot begin from here and says where it could (its readiness
  a window, `Readiness`'s `position`) names that window, and one shared rule makes a spot of a
  window for every Option (`windowSpot`: in the window, facing the target, clear of a body lying,
  each side of one held as its own site); an Option with no window names none. Holding, which
  begins anywhere and costs less out of the foe's reach, names the nearest spot out of it. A walk
  is one Option a gait, meaning go to a place by that gait; its places are the sites its mind's
  other Options name, and it knows nothing of them. The chooser prices a walk to a site as the
  walk and the best Option on offer where it ends (`lookingPast`), so the sequence is the
  chooser's.

### One body contract for every family

- **The stance by bearing ends**: the stance reads and holds the centre of mass over the ends a
  body bears on (`BodySpec.ends`), by name; a humanoid's two feet and a quadruped's four paws are
  its ends.
- **One path**: every body is commanded through its layers (`commandedMind`), driven by its
  decider (`driveBy`) over one skill set (`skillSet`), and read through one view (`BodyView`);
  its decisions, late or not, are carried out as every body's are. A family differs only in the
  parts that fit it: its motor, its gaits, its executors.
- **One intent** (`Intent`): where to go, the way to face, the gait, and the actions asked, each
  with its target.
- **A posture names what bears the body**: on its stance's ends it stands; on its trunk it lies,
  named by the side up; between, by the ends that bear. A way up names the postures it begins from
  and reaches; no family keeps a list of its own.

### Bodies told apart in data, never in logic

- **Settings are a record per body** (`SkillRecord`, `src/core/skills/framework/records.ts`),
  searched on that body alone across its loadouts; a held item is a condition the controller reads
  from the body. A body with no record of a skill does not have it (`recordFault`), except where a
  rule derives settings for any body (the gaits scaled to the leg, `scaledGait`): there the rule
  gives the default, and a record overrides it.
- **Other logic for a body is another skill**, which only the bodies with its record fit (a
  part's `fits`), named by an Option of its own.
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

First, the table's stand-up and run cells are read and kept as rows: what the guards and the end
of this plan compare against. Then each bug is fixed to its layer's contract, then what it breaks
above:

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
  stomping rung's approach, and the Rogue holds one side.

A defect found on any later step joins this list and is fixed the same way.

### 2. Option Mind general

Each piece lands on its own, in this order:

1. **The name.** `optionTactics` builds Option Mind's decider; "tactics" is the retired fighter's
   slot and leaves the code and the documents, the roadmap's list of layers included.
2. **One Option per act.** The kind that makes a strike of each blow (`STRIKE_OPTION`, `strikes`)
   goes: the punch, the sword's thrust and the stomp are each an Option kind naming its skill, and
   the function that builds the decider builds no strike.
3. **Percepts read when asked**, once a step, as predictions are (`predictor`); the chooser's cues
   are the cued percepts its last decision read. The reader's special case for a shield
   (`shieldHands`, the ward read only with one) goes.
4. **Where an Option leaves the body**, by the one rule, in the Option's contract
   (`src/core/option/`). The rise's pieces become every Option's: the expected time to standing
   from each lying posture (`riseFrom`, `src/core/option/ground.ts`; `downCost`, `downCostAt`,
   `src/core/option/percepts.ts`) becomes a posture's worth over every Option that begins there;
   the seconds until a body back on its feet is braced (`unbraced`, read by `here`,
   `src/core/option/position.ts`) become the unready seconds the Option that leaves the body
   reports; the bout's record of a way that failed (`recorded`) and the hand-set price of an
   unmeasured one (`BY_HAND`) become every Option's record and prior. `ground.ts` holds the ways
   up alone.
5. **Where to walk.** Options name their sites: the window their skill's readiness gives, made a
   spot by the one shared rule (`windowSpot`), and holding the nearest spot out of the foe's reach.
   The walk kinds that build places from rules about other Options (`WINDOWS_WALK`,
   `PRESSURE_WALK`, `windowPlace`, `outOfPressure`) go; a walk is one Option a gait to the sites
   named. What a gait leaves unready is measured per gait and Option in its profile, and the walk's
   `readies` goes.
6. **The rise as Options.** Each way up, and each of the ground's modes (brace, land, steady,
   flatten, the repositions), is a skill an Option names; the rise's own code goes
   (`groundOptions`; `groundExecutor`, `src/core/recovery/ground/held.ts`; `Deciding.ground`,
   `Rising`). A config that leaves the body no way up from its back or its front stays a fault.
7. **The config is Options.** Each Option kind takes the skill it uses and how it uses it (limbs,
   regions, aim); `OptionMindConfig`'s `executors`, `actions`, `ground`, `locomotion`, `guard`,
   `support`, `motor`, `navigation` and `frame` go (`src/core/option/mind.ts`), and the presets
   list Options. Motor control, the stance and the posture a body is built in are the parts that
   fit the body; navigation is the walk's. A profile is an Option's on a body. A person's order
   names a skill the body has, its limb and its target.
8. **One body contract.** The stance's reading and goal by bearing ends, not by side
   (`StanceReading`'s `soles` and `touching`, `src/core/control/stance.ts`); the ground reading
   names postures by what bears the body. Check: the fingerprint, no humanoid case moved.
9. **The quadrupeds on the one loop.** The quadruped's paw motor is a motor part, its trot and
   crawl gaits of a legs part (finding its footing again after a takeover is its resume), its bite
   an executor whose aim is the first exposed surface along the jaw's arc, and its righting a way
   up the ground executor runs; it is commanded, driven and read as every body is, and its view,
   intent, sight and ask (`QuadrupedView`, `QuadrupedIntent`, `QuadrupedSight`, `QuadrupedAsk`)
   and its handling of late decisions (`late`, `planned`, `move` in `src/core/reptile/layers.ts`)
   go. Its Options are the bite, the walks to sites by its gaits, the orders, holding and the
   righting; the stalk (`src/core/reptile/tactics.ts`) goes, its target choice the bite's aim, its
   approach a walk to the bite's site, its creep a gait. Its chooser, objective, reader and option
   types go (`QUADRUPED_VALUED`, `QUADRUPED_FIGHT`, `quadrupedReader`, `QuadrupedOption`,
   `src/core/reptile/frame.ts`, `options.ts`), with their hand-set prices (`FIGHT`,
   `RIGHTING_SECONDS`, `KEPT`), the frame (`FramePart`, `QUADRUPED_FRAME`) and the framed config
   (`FramedOptionMindConfig`, `AnyOptionMindConfig`, `framed`).
10. **Deciding while down.** The shared decider decides every step the body is down
    (`src/core/mind/decider.ts`); that becomes a cue the Options give, or stays with its reason
    written beside it.

Check: every Option Mind config is a chooser, its predictions, its rate and its Options, on every
body; every Option one act; the decider's builder names no kind of Option, no walk knows another
Option, and no rise or body family has a loop of its own; the fingerprint, each moved case named;
stand-up on the Warrior, the Rogue and the Skeleton, a fall's price, and the reptile's and the
rat's bouts read paired against the version before; the rat and the reptile, laid on a side and
on the back, right themselves and trot on.

### 3. Bodies told apart in data

- Stand-up's settings by body (`STEP_UP`'s table in `src/core/recovery/ground/step-up.ts`, the
  Skeleton's own roll with them) become records per body under `assets/`, and a technique only one
  body's settings time (the sit-back) is fitted by that body alone.
- The walk's and run's settings (`src/core/skills/locomotion/walk-run.ts`, `cycle-run.ts`, searched
  on the three bodies together) stay the default every body takes scaled to its leg; a body's
  record overrides them.
- The Skeleton's stomp record is deleted.

Check: no model named in control code; the fingerprint, no case moved but the Skeleton's stomps,
named.

### 4. How Options are developed

- **The rules that outlive this plan** go into `AGENTS.md`: a bug fixed to its own layer's
  contract and what it breaks above fixed next; a body searched again before a setback is called a
  defect; a cell's work read against its baseline, paired, priced, its ceiling named; the person's
  figures a scale; no fall unless an Option's design states it; what a change is judged on; no body
  named in control code; one act an Option.
- **The table** (`npm run evaluate -- table`, `src/evaluation/table/`) reads stand-up and the run
  as met or short, and every other cell as its score against its baseline (its first reading when
  its work begins, kept as a row), with the person's figure beside it and the version and drill
  link of its best. The Skeleton's stomp cells go.
- **The owner's target on every body and loadout**: the `rising-target` evaluation takes the
  Skeleton and the sword and buckler loadouts.

Check: `npm test`; the table judged from the rows it holds; [rising](../reference/rising.md) and
[the table](../reference/the-table.md) rewritten to match.

## Done when

- The known bugs and what they broke above are fixed, each to its own contract.
- Option Mind is one loop for every body, its config a chooser, its predictions, its rate and its
  Options, each Option one act; the rise, the strikes, the walks and the quadrupeds' acts are
  Options chosen and priced as every Option is.
- Every body family is commanded, driven and read through one body contract.
- No body is named in control code; every difference between bodies is a record or a part only
  that body fits.
- The table reads stand-up and the run as met or short on their definitions, every other cell
  against its baseline; the rules of developing an Option are in `AGENTS.md`.
- Stand-up and the run are no worse than the rows read before step 1.
