# Push-off and tendons: a travel gait at a person's pace

## Outcome

A gait for getting about, at a person's speeds:

- **walking** forward at 1.2 m/s reached along the Lab's forward line for the Warrior, and toward a
  person's comfortable 1.39 m/s (`PERSON_PACE.forward`, `src/core/human/gait.ts`), with no more
  falls than the stride's defaults;
- **running** forward at 2 m/s for 10 s, 9 seeds in 10;
- **the presets travel by it** out of a fight and fight in the stance's guard (`travelOrFight`,
  `src/core/skills/travel.ts`).

The plan is sized for one unattended run of about 12 hours. Its sessions go in order. Each session
keeps going after a finding instead of stopping to ask. Eye checks and the owner's choices go to
the list at the end.

## Why, from what is measured

All figures are from the Node stand, Rapier, 120 Hz (`research/locomotion-run.mjs`); the
[roadmap](../roadmap.md#open-items) has the detail.

- **Tuning the stride's settings has run its course.** Across two plans each lever moved the pace
  by about ±0.03 m/s; the search over all of them (`research/locomotion-search.mjs`) gained a
  quarter, to 0.95 m/s along the forward line for the Warrior.
- **The body is strong enough to walk at a person's pace.** Its segment masses are de Leva's and its
  peak torques a person's. Twice the strength gives +16 %; twice the strength and an assist reach
  1.4 m/s. 240 Hz, more friction, lighter legs and stronger ankles give nothing.
- **What the controller asks does not reach the ground.** The bearing solve (`carryRoot`,
  `src/core/control/bearing.ts`) picks a root acceleration the foot's patch can give, yet through
  each swing the realised centre of pressure stays about 3 cm ahead of the bearing sole's middle,
  and asking it elsewhere moves only the place asked. That gap has never been broken down stage by
  stage. If it is a defect in the control path, fixing it helps every body that stands.
- **The stride's push-off is a pose, not a push.** `push` (`src/core/skills/stride.ts`) is an
  offset of 0.15 rad of plantarflexion. A person's walk gets much of its positive work from the
  trailing ankle just before the other foot lands. That push-off is cheaper than the hip's work
  (Kuo 2002; Donelan, Kram and Kuo 2002; Kuo, Donelan and Ruina 2005).
- **The run saturates the ankle and the hip.** One leg's thrust saturates the bearing hip's
  internal rotation (0.63 of readings), the ankle's plantarflexion (0.50) and the hip's extension
  (0.44). A runner's ankle moment is about 2.5 to 3 N m/kg, about 200 to 240 N m here, above the
  152 N m peak. People do it with elastic tendons: the Achilles tendon stores and returns energy,
  and the fibres stay near one length (Alexander 1991; Fukunaga et al. 2001; Lichtwark and Wilson
  2006). The muscle model has no series elasticity (`src/core/muscle/force-velocity.ts`,
  `driver.ts`).

## Decided

- **This locomotion is for getting about** (owner, 2026-10-11). A fight uses the stance's guard,
  as a person walks and runs differently from how they fight. Falling more on this gait is
  acceptable. `stance-walk` and `STANCE_GAIT` do not change for the gait's sake.
- **Tendons are wanted if they help the walk or the run** (owner, 2026-10-11). Every motion may be
  measured again: this is research.
- **A root-cause fix to the shared control path may move every body.** It lands as its own commit,
  with the scorecard and the standing tests before and after, and the stance's envelope measured
  again (`research/core-stance-envelope.mjs`). A change that is only the stride's holds the
  fingerprint (`scripts/fingerprint.mjs --compare`: "no pose moved").
- **Out of scope, with the reasons measured:**
  - toes, a reduced-coordinate (multibody) fork, and MuJoCo: needed only for toes, and nothing
    says toes are needed ([passive toes](../reference/man-passive-toes.md),
    [solver contract](../reference/solver-contract.md#anatomical-joint-shape-compatibility));
  - a foot of smooth shapes: no sign that rolling helps;
  - 240 Hz: it did not move the walk's cap.
- **The rules hold:**
  - no assist in anything kept;
  - no strength raised for feel;
  - every number of the body, the rules or a material carries its source;
  - `npm run check` and `npm test` for each change, plus `npm run build` when the editor's fields
    change;
  - `test:all` is CI's.
- **A lever is a setting, off by default, until it earns its place** on the scorecard
  (`research/locomotion-scorecard.mjs`, paired by `research/locomotion-pair.mjs`), on both models.
- **Speed is the speed reached** along the line, never the pace asked.

## Sessions

### 01: where the ground force is lost (a probe; fixes may be kept)

A new script, `research/locomotion-wrench.mjs`, kept runnable. At each control step it reads the
chain from plan to ground, for each bearing foot:

1. the bearing solve's planned wrench and centre of pressure on the patch;
2. the torques it asks of the muscles (`bearLimbs`);
3. the torques the motors deliver (`MuscleDriver.pulled`), and whether a ceiling bounds them;
4. the ground's wrench and centre of pressure as Rapier gives them.

**Fixtures:**

- **Standing**, asked to shift the centre of pressure slowly forward and back, with no step. This is
  the control: does the gap exist without a gait?
- **The stride** forward at 0.5 and 0.95 m/s, on the Warrior and the Rogue, 5 seeds.

**Read:** the stage where the plan and the ground part, by phase of the step. Candidates, each a
root cause if it holds:

- the force-velocity ceiling read at the step's start;
- velocity motors that do not reach their target in a step;
- a step's delay between solve and motor;
- the foot turning onto its edge, so the patch the solve assumes is not the one that bears;
- `bodyDynamics` and Rapier disagreeing;
- friction and twist sharing (`shareGroundWrench`).

**Then:**

- If the cause is a defect, fix it in place, narrowly, as its own commit, under the shared-path rule
  above.
- If it is a property of the body or the engine, write it down and move on.

**Gate:** the scorecard's forward line before and after any fix.

### 02: the walk beside a person's (a probe)

A new script, `research/gait-audit.mjs`. It reads the stride at 0.95 m/s, and at the fastest pace
held, against a person's normal walk (Winter 2009, *Biomechanics and Motor Control of Human
Movement*; the figures are read from the source in this session and carried with it in the
script's header). Per gait cycle:

- each joint's power at the hip, knee and ankle, and which joint does the positive work;
- the fore-aft ground impulse: braking against propulsion;
- the centre of mass's rise and fall through a step;
- the share of the cycle on both feet;
- when the ankle's moment peaks and its size in N m/kg.

**Read:** the two or three largest differences from a person. They choose session 03's levers.
From memory of the literature, expect a person to do most of the positive work at the ankle
(about 1.5 N m/kg peak, late in the stance) and to rise and fall about 4 to 5 cm. Confirm these
against the source before using them.

### 03: push-off, and what 02 points to

Each lever is a setting of the stride (or of the stance through `SwingGoal`), off by default, and
proved live before any search: a grep that something reads it, and a run at each end of its range
that moves something.

- **A push-off that is a torque.** The trailing ankle is given a plantarflexion moment through the
  late stance and the double support, timed to the leading foot's landing. It is set as a share
  of what the ankle can give, not as a pose.
- **A vaulting stance**, if 02 finds the centre of mass flat. The bearing leg's knee is held
  straighter through the middle of the stance, so that the body rises over the foot. A straighter
  knee alone was tried and not kept. With a real push-off it is a different test.
- **A ballistic swing** (Mochon and McMahon 1980), if 02 finds the hip doing the work. The swing
  leg is driven at its start and then left near free over 0.35 to 0.45 s.
- Whatever else 02 names first.

**Gate:** each lever on its own on the scorecard's forward line, paired against the stride's
defaults.

### 04: the levers together, searched

- Diagonal CMA-ES (`research/cma.mjs`, `research/locomotion-search.mjs`) over the stride's settings
  and every lever 03 kept live. The score is the ladder of speeds reached, as now.
- **Budget:** three hours of the machine.
- The best point is run again on fresh seeds (11 to 20) and on the square, which the search never
  saw. Only that replication is quoted.
- The winner becomes `STRIDE` if both models hold, and the stride's envelope is measured again
  (`research/core-stance-envelope.mjs --legs stride --write`).

**Gate:** the Warrior at least 1.2 m/s reached along the forward line, the Rogue no slower than
now, and no more falls.

### 05: the muscle-tendon unit

A tendon in series with each muscle that has one: data on the muscle's spec, absent by default, so
that a body without it is the same to the bit.

- **The model:**
  - The fibre has a state, the angle it holds.
  - The tendon is a spring between the fibre and the joint, of the stiffness the source gives,
    turned through the joint's moment arm.
  - The joint's motor becomes a spring motor (Rapier's position motor, solved implicitly inside the
    solver). Its target is the fibre's angle, its stiffness the tendon's, and its force bounds what
    the fibre can give at its own speed.
  - Each control step, the driver moves the fibre along the force-velocity curve at the fibre's
    speed, given the tendon's force. When the tendon recoils, the fibre stays near one length and
    keeps its force.
  - The passive toe's probe already showed a spring motor giving angle = torque / stiffness exactly
    ([passive toes](../reference/man-passive-toes.md)).
- **The risk:** a stiff tendon on a slow fibre is a stiff equation (Millard et al. 2013). The fibre's
  update is semi-implicit, or damped as Millard's model is. A damping term that exists for the
  numerics is named as such and kept out of the anatomy.
- **Sources, each read before its number is used:**
  - the Achilles tendon's stiffness and the triceps surae's series elasticity (Hof 1998;
    Lichtwark and Wilson 2005);
  - the Achilles moment arm;
  - the tendon's strain at peak isometric force (Zajac 1989);
  - the patellar tendon's, if the knee extensors get one.

  They go in `SOURCES` (`src/core/sources.ts`).
- **Validated on a fixture first:** a joint alone, a loaded quick release replayed against Hof's
  series-elasticity release curve, and an isometric ramp in which the stretch is torque /
  stiffness.
- The fast tier gains the fixture. Everything else holds the fingerprint, since no body has a
  tendon yet.

### 06: tendons on the bodies

- The ankle's plantar flexors get their tendon in every humanoid spec (`src/core/human/muscle.ts`),
  and the knee's extensors too if they have a source.
- **Kept only if it helps:** the walk on the scorecard, or the run's time up and its share in the
  air (`tests/run.test.mjs`'s fixture, read at length). If it helps neither, it stays a spec field
  that no body sets, and the finding goes to the roadmap.
- **If kept, it lands as its own commit.** Everything that moves is measured again and its tests'
  figures updated:
  - the smoke bout;
  - standing and the stance's envelope;
  - the stride's envelope;
  - the club's best blow and the punch's records where tests hold them.
- The tendon's energy stored and returned per step is read, beside Lichtwark and Wilson's in
  walking and running.

### 07: the run again

On the push-off of 03 and 04, and the tendon of 06:

- **The arms swing against the stride's yaw.** The bearing hip's internal rotation saturates first,
  and a runner counters the legs' yaw with the arms and trunk. The stride's `arms` is the starting
  point.
- **Its settings, scanned live and then searched briefly** (`RUN`, `src/core/skills/run.ts`).
- **Read:** time up, speed reached, flight's share of the stride, and the legs' saturation, beside
  the saturation readings measured before.

**Gate:** 2 m/s forward for 10 s, 9 seeds in 10. Then 3 m/s is tried.

### 08: travel by it

- **Travel picks its gait by pace:** the stride below the pace at which the run holds better, the
  run above it. This lives in `travelOrFight`'s travel slot, as a locomotion of its own kind.
- **The presets travel by Travel, then fight**, as decided above.
  - It is checked on the smoke bout.
  - It is checked on the Crypt on several seeds, since one generated map proves little.
  - An Arena bout that opens within `near` (4 m) does not change.

**Gate:** `npm test` green, and the Crypt's navigation tests green on their seeds.

### 09: close

- Measure the stride's and the run's envelopes again where they changed.
- Correct the roadmap's walking item and the architecture's stride, run and muscle paragraphs.
- Delete this plan.

## The owner's, at the end

- Watch the walk in the Lab (`?play=lab`, Walk set to Walk and run) at its new pace, and the run.
- Watch a fighter travel and then fight, in the Arena from a long gap (`&gap=8`) and in the Crypt.
- Judge whether the tendon's spring shows in standing and striking.
