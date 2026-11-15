# A better punch, faster

The one plan. It holds the owner's goal in the owner's words, then what is known and built that
bears on it, each reading with the command that reads it again. It proposes no step: what is
worked is what the owner asks.

## The goal, in the owner's words

> my goal is to increase development velocity, to build a better punch.
> we identified these obstactles:
> - skills were keyed incorrectly, which resulted in needless repeated re-calculations
> - skills were coupled to the legs, which meant re-learning leg control repeatedly
> - the punch in a fight mostly just waited, it didn't actually punch much
> - the braced walk is not particularly effective
>
> we determined these potential resolutions:
> - skills should be keyed by that changes them, and always fall back to existing stale entries
>   instead of re-calculating (i.e. re-calculate only on request or when absolutely necessary)
> - new punch should be decoupled from the legs, sending them indirect commands, to avoid
>   re-learning legs for a strike
> - train the new punch to be thrown in (indirect) coordination with the legs, to punch while
>   moving (like a human) instead of wasting time on steadying

> i don't have any constraints on the punch reading the legs, i just don't want to have to
> repeatedly re-train footwork as part of every skill -- we will have dozens of skills and i
> want to increase development velocity (right now we've spent weeks and don't even have 1 good
> strike yet).

Said of the punch before: a separate punch "to be able to see v1 vs v2 in a fight"; and of the
installed one, "it kind of looked like dive jumping into the punch but in a very clumsy way
which didn't look like a serious punch".

## Saved results and what finds them

What holds now: a played row, a profile, a fight's start and a trainer's start are each found by
the question they answer, never by the commit or the build
([the code recipe](../recipes/code.md#code), [the architecture](../architecture.md#evaluations),
[what to keep](../recipes/skill.md#what-to-keep)). What follows for the punch:

- **A retrained network or a tuned setting keeps its profile** until its tool measures it again
  (`research/skills/strikes/strike-profiles.mjs`).
- **What a subject's records hold is no part of what finds a trainer's start** (`startBank`,
  `research/starts.mjs`): a start kept before the base or the punch's beginning changed is read
  until its folder in `.cache/starts/` is deleted.

Where something is still computed again, or a stale entry is refused:

- **A new variation's record plays every case of its body whose mind names the skill**, the
  other variations' among them, once: a case's key covers each seated body's row of every record
  its mind's tree names (`treeData`, `loadsOf`), and a part named without a variation reads
  every variation's (`variationReads`). Narrowing the key to the variation the body holds is
  unbuilt.
- **A save refuses a bout whose striker's character holds another variation**
  (`DuelRecipe.skills`), so a new variation is played from starts kept of its own fights.
- **A profile measured at another world rate, mind rate, command delay or reaction time is not
  read** (`staleness`), and a strike thrown holding what none of its profiles was measured
  holding is priced by its prior.
- **The physique's scales are no coordinate of a trial**: a body's spec does not say them.

## The punch and the legs

- **The installed punch drives no leg.** Its network (`assets/skills/strikes/straight-punch/drive.json`:
  59 inputs, two layers of 256, 12 outputs) pushes the trunk and the arm with eight outputs and
  sends the stance three asks and a walk flag with the other four: a heading turn, the centre of
  mass ahead and across, and whether the walk goes on (`stanceAsks`, `keepsWalk`,
  `src/skills/strikes/shared/steer.ts`). What a skill asks of the legs is a `LegsGoal`
  (`src/skills/framework/skill.ts`), carried out by the stance.
- **It reads the legs**: 20 of its 59 inputs are leg-joint angles and speeds and four are
  readings of the stance (each foot's bearing, whether the stance shifts or swings). A change
  under a trained actor makes it a seed to retrain
  ([the skill recipe](../recipes/skill.md#before-the-first-run)), so a change to the legs
  or the stance reaches the punch's network through those inputs.
- **What those inputs and asks carry**, on the Warrior's 240 held-out sparring starts beside the
  installed punch, as the minds priced strikes when it was read: blind to the legs and the
  stance it deals 0.61 of the damage a second (95 % 0.45 to 0.83); asking the stance for nothing,
  0.72 (0.56 to 0.92); the walk flag held on or off moves nothing. Each is a network file made
  by `node research/skills/strikes/straight-punch/punch-sparring.mjs --network <form> --out <file>`
  (`blind-legs`, `no-stance-asks`, `walk-on`, `walk-off`) and read by `--bar <file>`.
- **A form that reads no leg deals what the installed punch deals**: a layer for each of three
  spans of the stroke over 16 inputs (the target from the shoulder, the fist from the target,
  the fist's and the centre's velocity, the arm's angles), its three asks fitted, reads 0.98
  times the installed punch's damage a second on 2,400 starts (95 % 0.92 to 1.05)
  (`--network fit-spans-asks`, then `--bar <file> --on judge`).
- **In fights the asks of the stance fell the body four times in 48**: suppressing only the
  learned heading and centre asks ends those falls.
- **On the footwork gait the installed punch is not told apart**, with no retraining: 0.94
  times the damage a second (95 % 0.69 to 1.29), 99 landed against 107, no fall against 3
  (`--bar <file> --holds stance-walk/footwork`, the file holding `{ "variation": "drive" }`).
- **Only the Option that claims the legs commands them.** Following orders claims the legs
  alone (`src/minds/option/orders.ts`), so a blow that claims none is thrown beside a walk;
  such a strike's Option keeps its site while a hand is ready and while its blow is live
  (`onTheWay`, `src/minds/option/strike.ts`), the walk taking the body there.
- **The punch's `moving` variation leaves the legs** (`straight-punch/moving`,
  `StraightDriveOptions.leavesLegs`): the installed punch's record and network thrown by the
  arm and the trunk. It claims no legs and gives them no goal, turns no hips, waits for no quiet
  stance, and throws none of the record's pushes of the hips, knees and ankles. The network was
  trained standing with those; nothing is trained for this. On the walk rung
  (`npm run evaluate -- strike option-drill/straight-punch option-drill/straight-punch+straight-punch/moving --protocol walk`),
  asked still walking it lands 83 of 96 where the drive lands 70; asked once settled, 54 where
  the drive lands 78 (10 end outside its window, 5 are refused). From the drill's first ready
  step to the mark is a median 0.23 s against 1.59; its fist is as fast (7.1 m/s) with 1.4 kg
  behind it against 4.5. A drill's strike order stands the legs (`strike`,
  `src/minds/command/drill.ts`), so the rung reads its blow at a walk's end, not under a
  walk. No character holds it, it has no profile, and it is unread sparring and in fights.
- **A layout names any of the steer's inputs and outputs** (`SteerLayout`, `checkedLayout`,
  `steer.ts`), so a punch with other inputs is a layout of its own.
- **The bonk's footwork is 1.36 s of its 1.9 s** (`Swing.footing`;
  [the approaches](../approaches.md#weapon-strikes)).

## The punch waits

- **The installed punch begins only from a quiet stance and halts the walk.** Each body's record
  is `poised` and `halts` (`drive.json`): admitted standing, or shifting its weight with the
  centre of mass under 0.25 m/s (`quietToStrike`, `SHIFTING_PACE`,
  `src/skills/strikes/shared/strike-window.ts`). Both are settings of a strike's record.
- **In fights Option Mind begins few punches.** With every strike priced from its sparring, of
  the 144 `fights` trials a subject 132 never reach their moment, and 2 land. The Warrior's 48:
  6 land, 18 miss, four are guarded, four end outside the window, two fall and 14 are unreached
  (`npm run evaluate -- strike option/straight-punch --protocol fights`; neither reading is
  saved).
- **Where it does punch, it mostly misses.** Over 1,869 fight moments on the footwork the
  installed punch lands 375, misses 752, meets the guard 370, never gets into its window 213 and
  falls 68 (the judge's kept fight moments, in `.tmp/worktrees/punch-fights/.cache/starts/`,
  kept while the footwork was a variation of the stance: no subject finds them now).
- **Why it fails in the 48, each trial's first cause** (fights with each strike priced by its
  standing-target profile, 42 reached, 13 landed):

  | Cause | Trials |
  | --- | --- |
  | The fist's delivery: a miss, 0.11 to 0.44 m from its moving aim, or a landing elsewhere | 14 |
  | A fall from the network's heading and centre asks of the stance | 4 |
  | The network's arm pushes | 2 |
  | The foe's guard | 3 |
  | The foe's own blow | 3 |
  | The foe stepping out of the window | 2 |
  | The drill's walk back to the window | 1 |
  | The fight never reaching the moment | 6 |

- **A fight commits the punch from states its training never held.** Of 20 failed `fights`
  commitments, every one holds an input outside every range the still and walked drill plays:
  the centre's velocity in 20, the elbow's flexion in 19, the trunk's rotation in 18, the fist's
  velocity in 17, the target's velocity in 15 (to 4.5 m/s against 0.67). Sixteen of the 20 are
  outside held-out sparring's ranges too, a median 17 of the 59 inputs
  (`punch-sparring.mjs --commitments`).
- **The installed punch at a target that stands**, the table's `punch` row on `man`
  (`npm run evaluate -- table --body man --skill punch`): empty-handed it trades 0.256 hp a
  second, on the mark in 78 of 96 still trials, its fist at 6.94 m/s (a person's rear hand 6.8).
  Sparring, it deals 0.197 a second: of 240 starts 105 land, 55 meet the guard, 46 never come in
  reach and 21 miss.
- **Re-fitting it has not moved it**: its 15 settings searched beside the network read 1.08
  times (95 % 0.79 to 1.47), and its network retrained on 4,800 drawn starts 0.95 (0.76 to 1.19)
  at 3.4 M decisions. Its settings with no network land 20 of 240 against 105.
- **The bar recorded as the owner's for a better punch**: on the held-out sparring starts,
  damage dealt a second over begun punches at least twice the installed punch's, the low end of
  its 95 % interval above 1.5, with no more life lost and no more falls
  (`punch-sparring.mjs --bar`).

## The base under the punch

- **The base is the stance under the whole-body solve** (`src/control/stance/`,
  `src/control/solve.ts`; [motor control](../architecture.md#motor-control)), a skill each
  character holds in a variation (`stance/stance`). The braced walk is the stance's walk
  ([what it has done](../approaches.md#travel)). A balance carries out a stance goal
  (`StanceGoal`, `src/control/stance/goal.ts`): which feet bear, where the centre of mass goes,
  the pelvis's heading, a walk and a foot's swing; a step it is asked for is a weight shift,
  then a swing.
- **A short step takes it about two and a half seconds, where it arrives**
  (`npm run evaluate -- locomotion option --protocol step`: 0.2 or 0.4 m, eight ways, the facing
  held). Of 480 steps 335 arrive, a median 2.4 s after the order, the mean lost 2.8 s. To a side
  60 of 120 arrive; the Warrior's 0.2 m step at 0.7 m/s arrives in 11 of 40.
- **The footwork is a gait of its own** (`stance-walk/footwork`, `src/skills/locomotion/move/gaits.ts`):
  the braced walk begun with the foot whose landing is the further its way
  (`GaitTuning.startsToward`). Held in place of the braced walk, 427 of 480 steps arrive, a
  median 2.0 s, the mean lost 2.0 s, to a side 101 of 120, the Warrior's 0.2 m step at 0.7 m/s
  40 of 40 (`npm run evaluate -- locomotion option option+stance-walk/footwork --protocol step`).
  Straight ahead and back it loses what the braced walk does (1.9 and 2.6 s). No character holds
  it, and it is priced by the braced walk's envelope, its own unmeasured.
- **Following orders walks many short steps by the run**: Move goes by the gait that carries
  the orders out soonest, and the Warrior's 0.4 m step to a side at 0.3 m/s is the run's from
  1.0 to 3.4 s. The run's first foot is its own: with the footwork a setting of the stance the
  run read it too, and 20 more of the 480 arrived (447), 16 of them to a side.
- **Why a step ahead or back still loses two seconds** is traced and not costed: a walk's first
  step is planned at the pace the walk starts from, near nought, and lands beside the bearing
  foot; and as the place closes the navigator's ask falls to nought for a tick or two mid-step
  (`slowFrom`, `src/skills/locomotion/shared/travel.ts`).
- **Other bases, none built and none chosen**: an actor that corrects the stance, trained once
  on one body with no foe, under shoves, pushes at the arms and trunk, and orders to step and
  face; a stepper that places feet by balance.

## What a try costs

- **A training run is one to two and a half days.** PPO on the sparring punch steps about 240
  decisions a second on 32 workers, 0.8 M an hour, and a skill has been trained for 20 to 50 M
  ([the skill recipe](../recipes/skill.md#3-a-native-controller-that-succeeds-on-some-cases)).
- **The steered stroke is about a fifteenth of what a run computes.** The rest is the walk in,
  the play on to the reader's end, the foe's mind and the learner's update; how it divides is
  unread.
- **A run on few starts learns the starts**: on 127 pooled starts it read 1.84 times the
  installed punch there and 0.77 on the half it never played.
- **Reading a try beside the installed punch** (`punch-sparring.mjs --bar <file>`): on 240
  held-out starts a side plays in under 80 s on 30 workers and does not tell a fifth better from
  a fifth worse; on the 2,400 of `--on judge` a side plays in about 480 s and tells a tenth. The
  installed punch's side is found, in 14 s. Landings paired by start, with an exact sign test,
  tell more at the same count.
- **A fight's trial from a kept start is under a second, against seven played whole**
  (`research/starts.mjs`, kept in `.cache/starts/`, outside Git): a trial is saved two steps
  before its moment and reads what its whole trial reads. Three rungs are drawn
  (`fights-twin`, `fights-drawn`, `fights-judge`, `src/evaluation/strike/cases.ts`), played by
  `punch-sparring.mjs --bar <candidate> --on fights-twin` and `--on fights-judge`. The twin's
  starts for the installed punch on the stance are kept here; those kept on the footwork
  were made while it was a variation of the stance, and no subject finds them now.
- **A new idea is a variation of its own** (`RecordedVariation`,
  `src/skills/framework/variations.ts`): its code in its own folder
  (`src/skills/strikes/straight-punch/<variation>/`), its record its own
  (`straight-punch/<variation>`, `straight-punch/data/registration.ts`), held by a character
  beside the installed one (`left.skills=straight-punch/drive,straight-punch/from-guard`). The
  fingerprint shows it moved only its own cases
  (`node scripts/fingerprint.mjs --compare <file> --variation <skill/variation>`).
- **The straight punch's three variations run one code**: each calls one function (`punch`,
  `src/skills/strikes/straight-punch/index.ts`) on one layout (`PUNCH_LAYOUT`), over the
  executor the sword thrust shares (`straightDriveExecutor`,
  `src/skills/strikes/shared/straight-drive.ts`). `from-guard` and `moving` name the
  installed punch's record; the one adds when its drive may begin, the other leaves the legs.
- **The tools are the installed punch's**: `punch-sparring.mjs` holds the Warrior, the straight
  punch and its record (`BODY`, `SKILL`, `record`, `bar`) and takes a variation
  (`--variation`); on the fights' rungs it refuses a variation of its own; the exporter
  (`punch-export.mjs`) and the trainer write the installed punch's record.
