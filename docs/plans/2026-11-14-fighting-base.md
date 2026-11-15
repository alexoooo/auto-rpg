# The base under a fight

Notes on the layer under a strike and a guard: what stands the body, steps it and holds it when
it is pushed. They hold what a fight asks of that layer, where the stance stands against it, and
a design under consideration: its cases are built and the stance read on them, and nothing more
of it is. Each part is taken up on the owner's request by a brief of its own. A run that travels is in
[the Warrior's travel](2026-11-05-warrior-travel.md), which leaves the braced walk for fighting.

## Goal

- **The body steps at a fight's pace**: a short step toward a foe, away from it and round it,
  its facing held. The measure is the seconds from an order to the body standing where it asks,
  and its falls, on cases a fight makes.
- **A strike and a guard run over it while it steps.** The arms' own pushes and a blow taken are
  pushes it holds.
- **A strike begins from a body that moves**, where its skill admits it.
- **A base is one of several.** A new one is read beside the stance on the same cases, and moves
  nothing installed until a character chooses it.

## Where it stands

- **The base is the stance under the whole-body solve** (`src/control/stance/stance-balance.ts`,
  `src/control/solve.ts`; [motor control](../architecture.md#motor-control)), the one balance
  registered (`BALANCES`, `src/app/registration/balances.ts`). A balance is a part that makes the
  control carrying out a stance goal (`BalancePart`, `BalanceMaker`,
  `src/control/balance-part.ts`): which feet bear, where the centre of mass goes, the pelvis's
  heading, a walk and a foot's swing (`StanceGoal`, `src/control/stance/goal.ts`).
- **It stands, catches a shove by a step placed from the capture point, and walks to about
  1.7 m/s straight**; a routed walk's turns hold it near 0.7 m/s. It holds a pendulum of constant
  height with no push-off, and its stride settings do not make it faster
  ([the approaches](../approaches.md#travel)).
- **A step it is asked for is a weight shift, then a swing** (`SwingGoal.shift`). The bonk's two
  steps of footing take 1.36 s of its 1.9 s ([the approaches](../approaches.md#weapon-strikes)).
- **What reads low under it is on the roadmap**
  ([body and motor control](../roadmap.md#body-and-motor-control)): the braced walk under shoves,
  the pelvis's yaw at speed, braking.
- **The punch begins from a quiet stance.** Each body's punch is `poised`
  (`assets/skills/strikes/straight-punch/drive.json`): admitted standing, or shifting its weight
  with the centre of mass under 0.25 m/s (`quietToStrike`, `SHIFTING_PACE`,
  `src/skills/strikes/shared/strike-window.ts`).
- **In fights most of the punch's failures are apart from the base.** Of the Warrior's 48
  `fights` trials, 14 are the fist's delivery. Four fall from the network's heading and centre
  asks of the stance and two from its arm pushes; in one the drill's walk back to the window
  does not arrive, the stance's share of that unresolved
  ([the punch's notes](2026-11-10-warrior-punch.md#why-the-punch-does-not-land-in-fights)). Each
  of the 20 commitments read holds a centre velocity outside every range the drill plays
  ([the comparison](2026-11-10-warrior-punch.md#what-a-fight-asks-that-the-drill-does-not)).
  Those fights are of minds that priced a strike from its sparring at one body whatever body it
  struck; none is read as a strike is priced now.
- **What is made on the stance is the stance's.** A change to the controller under a trained
  actor makes it a seed to retrain
  ([the training recipe](../recipes/training.md#before-the-first-run)). The punch's network reads
  the legs and the stance and asks the stance
  ([the skills' notes](2026-11-14-many-skills.md#where-the-time-goes)). The bonk steps each foot
  to a searched place (`Swing.footing`), a way up that ends on its feet hands the body to the
  stance (`handover`, `src/skills/recovery/shared/staged/techniques.ts`), and the run takes the
  body from the stance's walk and hands it back
  ([the Warrior's travel](2026-11-05-warrior-travel.md#start-slow-paces-and-the-stop)). The
  stance's envelope is measured for each body
  (`assets/skills/locomotion/stance/stance-envelope.json`), and the staged ways up's profiles
  are keyed by its calibration (`stance-calibration.json`).
- **The Stand drill reads the base under a shove** in three states: standing in guard, walking
  in, and as the striking limb flies (`guard`, `walking`, `striking`,
  `src/evaluation/stand/cases.ts`). It holds no saved result (`assets/evaluations/stand.json`);
  `npm run evaluate -- stand option/straight-punch --protocol striking` plays a rung.
- **Shoved, the Warrior keeps its feet and is slow to settle.** In guard it stands through all
  96 shoves and settles after 74, in a median 2 steps and 3.8 s. Walking in it stands through
  all 24 and settles after 23, in 4 steps and 0.87 s. As its fist flies it stands through 15 of
  16, finishes every strike and settles after 9, in 3 steps and 4.2 s.
- **The table's walk row reads the Locomotion drill** (`EVERY`,
  `src/evaluation/locomotion/cases.ts`): walks at a pace each of eight ways facing forward,
  turns, a standing body shoved, a shove after a walk, and the walks again in gusts, valued in
  seconds lost against the orders (`npm run evaluate -- table --body man --skill walk`;
  [the table](../reference/the-table.md)).
- **The Locomotion drill's `step` protocol reads a short step** (`STEP`,
  `src/evaluation/locomotion/cases.ts`): each body in every rated loadout ordered to stand at a
  place 0.2 or 0.4 m from where it is put, each of eight ways, within 4 cm, at 0.3 or 0.7 m/s,
  facing forward, for 4 s, then to stop. The order is given again each tenth of a second, as a
  Commander gives one each step, so each tenth the body does not close on the place at the pace
  is lost; a trial's value is its seconds lost, a fall at its price, as a walk's is. Its figures
  are the share of steps that came to stand at the place and the seconds they took
  (`npm run evaluate -- locomotion option --protocol step`).
- **A short step takes the stance about two and a half seconds, where it arrives.** Of 480
  steps the body comes to stand at its place in 335, a median 2.4 s after the order, falls in 3
  and loses a mean 2.8 s against the order. A step that arrives loses 2.2 s and comes 1.8 s
  later than its pace asks; one that does not loses 4.2 s. Forward and back 109 of 120 arrive,
  on the diagonals 166 of 240, and to a side 60 of 120. The Warrior's 0.2 m step at 0.7 m/s
  arrives in 11 of 40, and at 0.3 m/s in 37. With empty hands its centre of mass first goes 2 to
  8 cm the other way, as the weight shifts, for most of a second.
  The three bodies lose 2.9, 2.8 and 2.7 s (Warrior, Rogue, Skeleton).
- **Inside a strike's trial the same step is read by its blow**: the drill Commander orders a
  place to bring the striker into its window, slowing the pace as it closes (`approachPace`,
  `src/skills/intent/action-window.ts`), the reading keeps when it is ready there
  (`StrikeReading.ready`, `src/evaluation/strike/read.ts`), and the trial is valued by its blow.
  The Stand drill's `striking` rung counts the steps a shoved striker takes (`steps`).

## The design

**A fight's cases.** The Stand drill's three rungs and the Locomotion drill's `step` protocol,
which orders a place a fraction of a metre off in each of eight ways with the facing held,
valued as the walk is: the seconds lost against the order, a fall at its price. The stance's
reading on them ([where it stands](#where-it-stands)) is the baseline every base is read
beside, by the same commands.

**A second balance beside the stance.** A part of role `balance`, registered beside the stance
and chosen by a body's config, that carries out the stance goals it is given. What a skill asks
of the legs it asks as now (`LegsGoal`, `src/skills/framework/skill.ts`).

- **One actor, trained once on one body with no foe**: under shoves drawn as a twin of the
  Stand drill's rungs would be (`Cases.twin`, `src/evaluation/twin.ts`; the drill names none),
  under pushes at the arms and the trunk that stand for a strike thrown and a blow taken, and
  under orders to step and to face. Its provenance is an actor whose legs follow a commanded
  root velocity while its upper body follows motions given apart from them (Cheng et al.,
  "Expressive Whole-Body Control for Humanoid Robots", RSS 2024).
- **An actor that corrects the stance.** The learning that has worked here is one actor
  correcting a native controller that already succeeds on some cases
  ([the approaches](../approaches.md#every-skill)), and the stance stands and steps. An actor in
  the stance's place on the legs' muscles is the next size.
- **An episode is the base's own work.** With one body, no foe's mind and no walk in, every
  decision is the actor's
  ([what a strike's run computes](2026-11-14-many-skills.md#starts-kept-from-fights)).

**A strike from a body that moves.** `poised` is a setting of a strike's record. A base that
holds the arm's pushes while it steps is read with the setting off, on the Strike drill's walked
rung (`walk`, its `walking` start) and sparring.

**What a second base waits on.**

- **Strikes apart from the legs**
  ([the skills' notes](2026-11-14-many-skills.md#part-2-a-strike-made-by-search-apart-from-the-legs)):
  until a strike's layout holds no reading of the legs, each strike's network is a seed to
  retrain on another base. The installed punch keeps 0.61 of its damage a second blind to the
  legs and the stance, and 0.72 asking the stance for nothing
  ([the readings](2026-11-14-many-skills.md#the-readings-that-come-first)). So a strike made
  there keeps its heading and centre asks, and a base that answers them as the stance does not
  is a reason to search the strike again on it.
- **A reading of each thing made on the stance**, on the new base, before a character that holds
  it chooses the base: the bonk's footing, each way up, the run's handover, the envelope
  ([the rules](../../AGENTS.md#the-rules)).

## What it would cost

A character on the stance keeps every record, actor and profile it has. A character that chooses
a second base holds on it only what is read there. The training run's cost is unread: what a
step of one body costs, and how many decisions the actor takes.

## Open

- **Why a step to a side arrives in half its trials.** In the Warrior's steps traced, a centre
  that misses its place passes within 6 to 15 cm of it and goes on. Whether that is the pace it
  is asked (a Commander slows a pace as the place closes, and the script's is flat), where the
  swing foot is placed, or the navigator's stop is unread: the trials are read by their figures
  alone.
- **Whether a step's place is given from where the body's centre stands.** The script's is from
  where the body is put, and a standing body's centre of mass is ahead of that (the Warrior's
  by 6.5 cm), so a forward step is that much shorter than its name and a back step longer. The
  seconds lost are read against the way the centre has to go.
- **Whether the base is what holds a fight's blows back.** The punch's traces put the fist's
  delivery first, 14 of 48 trials, and the network's asks of the stance in four. The cases above
  read the base apart from any strike.
- **Whether a stepper built to place feet by balance serves instead of an actor.** The Warrior's
  travel weighs one for the run's start and stop
  ([its candidates](2026-11-05-warrior-travel.md#start-slow-paces-and-the-stop)); whether one
  controller serves both is open with it.
- **What a step costs under each.** The whole-body solve holds the stance and runs each control
  step (`motorControl`, `src/control/solve.ts`); an actor on the muscles runs without it. A
  bout's step by the physics and the rest, and each file's share of it:
  `node research/step-time.mjs --profile`.
- **What the pushes that stand for a strike are**: their sizes and where they meet the body. An
  untrained punch's impulse is 22.8 N s
  ([the strike reference](../reference/human-strike-reference.md)), and the Stand drill shoves
  the Warrior by 8 to 60.
- **The Rogue and the Skeleton**: the Skeleton's shoved walk with the club falls most
  ([the roadmap](../roadmap.md#body-and-motor-control)).

## To pick it up

- **The stance**: `src/control/stance/` (`stance-balance.ts`, `goal.ts`, `stance-tuning.ts`,
  `stance-envelope.ts`); the solve over it, `src/control/solve.ts` and `bearing.ts`; a balance's
  contract, `src/control/balance-part.ts`, and its registry,
  `src/app/registration/balances.ts`.
- **What asks it**: `LegsGoal` in `src/skills/framework/skill.ts`; a strike's asks,
  `src/skills/strikes/shared/steer.ts`; the window, `shared/strike-window.ts`; the stance's walk
  as a gait, `src/skills/locomotion/stance-walk/`.
- **Its readings**: the Stand drill, `src/evaluation/stand/`; the Locomotion drill's walks,
  shoves and short steps, `src/evaluation/locomotion/cases.ts`; the stance's own trials,
  `research/skills/locomotion/stance/stance-trials.mjs`.
- **A learning environment over a drill's cases**: `research/case-learning-environment.mjs`;
  [the training recipe](../recipes/training.md).

## Completion

A base that lands puts its contract into [the architecture](../architecture.md#motor-control) and
what its training took into [the training recipe](../recipes/training.md). These notes are
deleted once it has landed or been dropped.
