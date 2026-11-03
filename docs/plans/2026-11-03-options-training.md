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
  reusing executors beneath, then by body where the shared one cannot serve.

What is wanted is each skill as good as it can be made in a reasonable time, with two hard
requirements: every character stands up reliably in under 10 s, and the Warrior and the Rogue run
reliably.

Built before it: one family of minds, minds in parallel, and the table. Its scope is the owner's:
the toed Warrior, Rogue and Skeleton with every loadout (empty hands, the club, the sword, the club
and buckler, the sword and buckler); the walk, stand-up, the punch and the club, sword and buckler
on all three; the run and the stomp on the Warrior and the Rogue. **The Skeleton has no stomp** (the
owner's decision): at 15 kg its blows carry under 3 J against the Warrior's 15 to 52 J ([stomp
settings](../reference/front-kicks.md#stomp-settings)); a held item brings its own mass. Where each
cell starts: [the table](../reference/the-table.md).

## How it works

### A bug is fixed by its own layer's contract

A lower-level defect is fixed when it is found, judged by what its own layer promises (a step lands,
a walk stops where it was asked, a stand holds its centre where it was asked), never by a reading
above it. What the fix breaks above is a defect there, fixed next in the same push. A cell of the
table that drops meanwhile is named in the commit, not a reason to keep the defect.

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
  then raised by paired readings against the version before; a gain is kept, a loss is not. A
  cell's work ends at a plateau or after four hours of work without a gain, its best kept and its
  ceiling named from a reading (the body, the controller, or the drill). The person's figures
  (`BAR`, `src/evaluation/strike/read.ts`; [human strike reference](../reference/human-strike-reference.md))
  are reported beside each reading, as a scale, and gate nothing.
- **Guards**: no change sets back stand-up or the run; and no Option makes its body fall unless a
  fall is part of its design. An Option that trades a fall for power (a tackle, an all-in kick
  that falls on a miss) states it, and its fall rate by outcome is measured into its profile for
  the mind to weigh. No Option in scope states one, so every fall here is a defect.

### Bodies told apart in data, never in logic

- **Settings per body, for every skill**: each skill, ground technique and gait has a record per
  body (`SkillRecord`, `src/core/skills/framework/records.ts`), searched on that body alone. A
  body with no record of a skill does not have it (`recordFault`).
- **Other logic for a body is another part, chosen by its records.** A slot that holds a skill holds
  a ranked list of parts (`slotSkills`, `src/core/parts/parts.ts`), and a body uses the first
  that has a record for it. A Skeleton's rise of its own is a technique with the Skeleton's record
  alone.
- **The mind does not see which part runs.** An Option is the act (stand up, punch); Option Mind
  reads its profile on that body and nothing else.
- **No body is named in control code**: no model's name or key, and no test that stands for one
  (a mass under 20 kg). A test of what the body can do (it has toes, a hand is free) is a fit.
- **Variants compose the shared pieces** (stance, bearing, pose drive, the step's solve) in their
  own order and with their own settings, and never copy one; a bug fixed in a shared piece is
  fixed for every body.
- **A variant lives while a body uses it.**
- **Records are per body, not per loadout**: a held item is a condition the controller reads from
  the body it holds.
- **What a change is judged on**: a record or a variant on its own body; a shared piece on every
  body. A shared change that helps one body and hurts another is a defect in the hurt body's path,
  or the reason it gets a record or a variant of its own; never the reason to reject the change.

## Steps

Each lands green on its own: `npm run check`, `npm test`, `npm run build` where browser code or
assets change, and a toolkit change's message names the fingerprint cases it moves
(`scripts/fingerprint.mjs`). A search or training run is priced on the pool from its first trials.

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

### 2. Bodies told apart in data

- Stand-up's settings by body (`STEP_UP`'s table in `src/core/recovery/ground/step-up.ts`, the
  Skeleton's own roll with them) and the walk's and run's settings
  (`src/core/skills/locomotion/walk-run.ts`, `cycle-run.ts`, searched on the three bodies together) become records per body under `assets/`, the run's for the
  Warrior and the Rogue.
- The getting-up slot and the gaits hold ranked lists of parts each body uses by its records, as
  the executors do.
- The Skeleton's stomp record is deleted.
- The boundary test refuses a model's name or key in the control folders.

Check: the fingerprint, no case moved but the Skeleton's stomps, named; the boundary test refuses
a model's name planted in a control file.

### 3. The table

The table (`npm run evaluate -- table`, `src/evaluation/table/`) reads stand-up and the run as met
or short, and every other cell as its score against its baseline, with the person's figure beside
it and the version and drill link of its best. Check: every cell read at this step, which is each
cell's baseline; [the table](../reference/the-table.md) rewritten from it.

### 4. Stand-up

To the target on every body and loadout; the shortest first: the Skeleton holding an item (the
club stands 0 of 15), the Rogue (a median of 13.6 s empty-handed; her arms do not straighten on
hands and knees, so a route that does not push up on straight arms), then the Warrior's speed (a
median of 8.7 to 10.7 s). A body gets its own technique where the shared one's ceiling on it is
read short. The legs bear on any set of the ends from where the body is (`BodySpec.ends`,
`carryRoot`, `bearLimbs`, `src/core/control/bearing.ts`), and a ground technique holds only the
limbs it moves. Check: the target on every body and loadout, and on fresh falls; rising in fights
no worse; the owner looks in the Lab's Stand-up mode.

### 5. The run

On toes on the Warrior and the Rogue to the requirement in every loadout, then priced by the Gait
drill (`gait`) so that Option Mind chooses it where it pays. One set of legs stands up and runs a
body, so every leg change is read on that body's stand-up and gait. Where the toes or the body are
the limit, the limit is read and the body's numbers are set for the result, sourced as the owner's
decision with their before and after. Check: the Locomotion drill's run; the stand-up target held;
the owner watches the run in the Lab's Locomotion courses and in the Arena.

### 6. The strikes on every body

Best effort, in order: the punch, the stomp (the Warrior and the Rogue), the club blow, the sword's
cut and thrust, the buckler's cover; each on the Warrior, then on the Rogue and the Skeleton,
seeded from the Warrior's where that starts higher, each body's own record searched or trained on
its own body, and its own variant where the shared one's ceiling is read short. Check: each
cell's held-out reading at 120 and 480 Hz against its baseline and its drill link; its reel
watched, the failures first; the owner accepts each rung.

## Done when

- The known bugs and what they broke above are fixed, each to its own contract.
- No body is named in control code; every difference between bodies is a record or a part chosen by
  one.
- Stand-up meets the owner's target on every body and loadout, and the run its requirement on the
  Warrior and the Rogue in every loadout.
- Every other cell holds its best reading, its baseline and its ceiling named, and the owner has
  accepted its rung.
