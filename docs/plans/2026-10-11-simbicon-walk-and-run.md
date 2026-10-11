# SIMBICON walk and run: a gait that vaults, not a pendulum held level

## Outcome

A locomotion skill of a new class, offered as an experimental part beside the stride and the run,
that on the Warrior and the Rogue, with their own muscles and no assist:

- walks forward at a person's comfortable pace (1.27 m/s, the walk competency's threshold,
  [competencies](../reference/competencies.md#walk)), stops, stands, and turns at 2 rad/s;
- runs at 2 m/s and beyond, and changes from the walk to the run and back on the pace asked;
- stays up on the Lab's lines and square under 20 N gusts (`research/locomotion-run.mjs`);
- travels by it and fights by the stance's walk (`travel.ts`), so a bout is untouched until the
  owner chooses otherwise.

And an answer either way: if this class cannot reach the threshold on this body, the session that
finds it out names the channel that binds (a hip, knee or ankle at full activation) and shows
whether twice the strength lifts the cap (`--physique`), so the body is named as the cap with a
measurement, not a guess.

## Why, from what is measured

Every figure is from the Node stand, Rapier, 120 Hz, and is in the
[roadmap](../roadmap.md#body-and-motor-control) with its harness.

- **The walk is a third of a person's.** The stance's walk and the stride hold 0.5 to 0.7 m/s
  every way; the competency suite reads 0.40 m/s travelled against 1.27 asked; the run holds about
  1 m/s whatever pace is asked.
- **The last 25 locomotion commits tuned one controller.** Seventeen settings were added to the
  stride, each searched; each moved the pace by about 0.03 m/s. That is a controller class at its
  ceiling, not an under-tuned one.
- **The class forbids a person's mechanisms.** Both walks and the run are capture-point walking on
  a linear inverted pendulum (`gait.ts`, `stride.ts`, `planAcross` in `stance.ts`): the centre of
  mass held at one height with the knee kept bent (`STANCE_KNEE_BEND`), the pivot kept inside a
  flat sole with a margin (`SOLE_MARGIN`), the swinging sole carried on a prescribed path and
  tracked, the torques solved by inverse dynamics each step. Constant height forbids the vault over
  a straight stance leg; pivot-in-sole on a flat foot forbids heel strike and a real toe-off, so the
  ankle gives 4 to 7 % of the stride's positive work where a person's gives about half
  (`research/gait-audit.mjs`, Winter 1983); the swing is a tracking task fighting its own dynamics;
  and nothing cancels the swing's yaw, so the running pelvis yaws some 0.8 rad a step and the hip
  hits its stop.
- **Running cannot come from it.** The pendulum assumes constant height and a foot on the ground.
  The run bolts a flight onto a stance that holds height, and the two fight.
- **The structure is in the stance controller**, which every skill shares. The stride and the run
  could re-plan footsteps and nothing else: the knobs were in the wrong layer.
- **The search objective pulled the wrong way.** "The fastest pace held under gusts" rewards
  stiffness. The proxy crept up while the owner's eye stayed red, as with the sword prototype.

## What is built

SIMBICON (Yin, Loken and van de Panne 2007, "SIMBICON: Simple Biped Locomotion Control",
SIGGRAPH), with the speed and steering of its generalisation (Coros, Beaudoin and van de Panne
2010, "Generalized Biped Walking Control", SIGGRAPH). It is a few hundred lines and a handful of
parameters, and the same framework walks and runs on torque-limited bodies in a physics engine. It
plans no centre of mass, holds no height and prescribes no foot path: the body vaults over its
stance leg as a pendulum, and balance is a feedback on where the swing foot goes.

- **A finite-state machine over the legs**, two states a stance leg. Walking, the first state
  lasts a set time and the second until the swinging sole meets the ground, then the legs swap
  roles. Running has one state a leg (the stance) and a flight between, the swing foot's contact
  ending it. Each state names a target angle for every leg channel: the swing hip's flexion and
  abduction, the swing knee, both ankles, the stance knee.
- **The legs are driven by torques the gait computes, not by the servo.** Each leg channel's
  torque is the paper's PD toward its state's target, kp (target - angle) - kd rate, with the gains
  in N m/rad as the paper states them. Each is given as a torque source: a `MusclePush` at the
  torque over the channel's strength that way (`Body.muscles.strength`, as the whole-body strike
  does), which is how the servo hands the driver its own torques. A torque source gives what the
  muscles' force-velocity curve allows, as the servo's do.
- **Why not the servo.** With no stance goal the servo takes the pelvis to be held, so a channel's
  stiffness is the inertia of what hangs below it times n squared, and the body's weight coming up
  through the sole is left to the angle's error. On the Warrior (Node stand, Rapier, 120 Hz,
  `SERVO_SECONDS` 0.1) that is about 300 N m/rad at the hip's flexion and abduction, 45 at the knee,
  6 at the hip's rotation and 1 at the ankle; the paper's are a few hundred at every joint. On the
  servo a stance knee would bend a radian under the body's weight, the ankle would be limp, and
  the hip's rotation would turn nothing. The trunk and the arms stay on the servo, hanging from the
  pelvis as it assumes.
- **Gravity compensation and the virtual force** (Coros 2010) are added to the PD: the weight the
  stance leg carries and the force asked of the centre of mass go through the stance leg's Jacobian
  transpose (`reachJacobianTo` over the chain `chainTo` gives) as hip, knee and ankle torques.
- **The swing hip and the pelvis are controlled in the world frame.** The pelvis is the body's
  root (`BodyView.root`), and the hips hang from it, so the paper's torso is the pelvis here. A PD
  on the pelvis's world pitch and roll toward upright gives a torque. The stance hip is given the
  negative of that torque less the swing hip's, the swing hip's being its own PD torque, known
  before either is given. A torque about the pelvis becomes the hip's flexion, abduction and
  rotation torques through the hip's motion axes as they stand (`motionAxesToRef`,
  `joint-state.ts`), the three solved so the joint's torque is that one. The swing hip's target is
  read in the world frame too, so the leg swings to the same place however the pelvis leans.
- **Balance is a feedback on the swing hip's target**: the target plus `cd` times the centre of
  mass's horizontal distance from the stance ankle plus `cv` times its velocity, sagittal and
  coronal each with their own gains. That is the whole of the balance controller. The centre of
  mass, its velocity and the soles are the stance's readings (`StanceReading`), which are read
  every step whether or not a stance goal is given.
- **Speed and steering** (Coros 2010): the swing foot's landing is placed by the inverted
  pendulum, the stance ankle's forward offset v sqrt(h / g) plus a term in the velocity's excess
  over the pace asked; a virtual force on the centre of mass toward the pace asked is given through
  the stance leg's Jacobian transpose as hip, knee and ankle torques; the heading is a yaw target of
  the pelvis's world PD, the stance hip's rotation giving it as a torque.
- **No stance goal while it walks or runs** (`BodyCommand.stance: null`): the stance controller,
  the bearing solve, the assist and the capture point are not in the loop.
- **Standing is the stance's.** Asked to hold or to place, and once a stop has brought the feet
  together, the gait answers as a locomotion does today, with the stance's stand (`goal`, `place`),
  the one competency that meets its bar. It takes the legs from the stance at the first swing and
  gives them back at the stop; the stance's memory is reset when it takes them back
  (`StanceControl.reset`), and goes on from the body as it is.
- **The arms swing** by `armSwing` (`arm-swing.ts`), as the stride's and the run's do.

### The seam in the arbiter

A `Locomotion` today answers `goal` with a `StanceGoal`. The skill set (`skillSet`,
`arbiter.ts`) gains one optional method on `Locomotion`, `drive(view, walk, face, dt)`, answering
a `LegsDrive` (each leg channel's torque, N m) or null. While it answers one, the command's
stance is null, the arbiter turns each torque into a push (its sense by its sign, its level the
torque over the channel's strength that way) and appends them, and the leg channels leave the
posture. While it answers null, its `goal` and `place` are used as any locomotion's, so it stands
on the stance. A blow's `LegsAsk` of kind `free` and `walk` are its walk; `hold` and `place` are
the stance's. A kick and a support fold step from the stance mid-walk and are not offered beside it
(`fighterSkills`, `Part.slotsFor`). Nothing else in the arbiter moves.

The stance's reading gains each sole's ground contact (`StanceReading.touching`, by side), read
in `read` from the contacts the stance already reads for `SwingGoal.lands` (`groundContact`), so
the state machine's transitions read no engine handle. The skill is the reader.

The skill is a part of kind `simbicon` (`SKILL_PARTS`, `fighter.ts`; `LocomotionConfig`,
`config.ts`), stage experimental, its states and gains its settings with bounds a panel offers,
its defaults the best found. `research/locomotion-run.mjs --legs '{"kind":"simbicon"}'` runs it on
the bed as it runs the others.

## Decided

- **The SIMBICON class is built, and the stride and the run are not tuned further** (owner,
  2026-10-11). They stay as experimental parts, runnable, with their records.
- **The stance controller does not change.** The skill drives the legs beside it, not through it.
  `scripts/fingerprint.mjs` shows that no bout moved.
- **The rules hold:**
  - no assist (balance 0 %), the gait's own muscles;
  - no strength raised for feel: `--physique` is a probe of what binds, never a setting;
  - every tuned constant of the skill says what it does and is tuned freely (a skill's, not the
    body's); every number of the body or the rules keeps its source;
  - each session is gated on `npm run check` and `npm test`, `test:all` left to CI, and a slow
    test run by name where a session is about what it covers;
  - the core's arithmetic stays exact (`src/core/math/real.ts`; no `Math.sin`, `Math.hypot`,
    `**`).
- **A controller whose cause has not run is a hypothesis.** The old plan's note that a released
  stance chatters at 120 Hz is checked first, in session 01, not designed around.
- **Speed over ceremony.** Each session reads its own lines on the bed. No battery, record or
  envelope until the owner asks; the eye gate is the owner's in the Lab, and when the owner is
  away it goes on the final session's list.

## Owner's choices this plan puts

1. **Whether the walk is judged by the eye before the run is built** (session 03), or the run
   comes first and both are watched together.
2. **Whether this gait replaces the stride as the travelling walk** (`TRAVEL`, `config.ts`), once
   it holds the Lab's lines and square. Until then every humanoid travels by the stride.
3. **Whether to search its settings** (session 04) or keep the paper's and the hand's. A search
   costs compute; the paper's parameters walked and ran on a body like this one.
4. **What to do if the body binds**: the plan's answer in either direction is a measurement, and
   what to change in the body (strength, the sole, the mass ratios) is the owner's.

## Sessions

Each session lands as its own commits, green on the gate, and adds to this file what it found
under its heading. The plan is deleted when the last lands, and what lasts goes to the
architecture, the roadmap and a reference record if the owner asks for one.

### 01: the seam, and a body that stands on it

- `Locomotion.drive`, `LegsDrive` and the arbiter's handling of a locomotion that drives
  (`arbiter.ts`); the kick and support slots not offered beside it (`fighter.ts`).
- `StanceReading.touching`, read in the stance's `read` from the soles' contacts.
- The `simbicon` part, config and fields: standing on the stance's stand, and one driven state,
  both feet down, each leg channel's PD torque toward the stance pose's angles, the gravity
  compensation, and the pelvis's world PD shared between the hips. The hand-over: the stance's to
  the drive, and back with the stance's memory reset.
- `tests/simbicon.test.mjs` (fast): asked to hold, the Warrior stands 10 s on the stance; driven
  2 s and handed back, it stays up, and the driven knees and ankles hold within a few hundredths
  of a radian of their targets under the body's weight (the figure the servo could not give); its
  config refuses a setting no part reads; a fighter with it builds and steps.
- **Reading:** the driven body's lumbar and hip flexion over its 2 s, for the two-step oscillation
  the old plan saw with `stance: null` on planted feet. If it is there, find its cause (the PD's
  gains at 120 Hz, or the servo's trunk on a pelvis that moves) and fix it in place; if it is not,
  the note is wrong and goes.
- **Reading:** the step's cost with no stance solve (`tests/core-step-cost.test.mjs` passes;
  the figure is read, not recorded).

### 02: the walk

- The four walking states, the paper's parameters as the start (its state time, swing hip, swing
  knee, ankles, stance knee, `cd`, `cv`), the pelvis upright, the stance hip's torque by the
  paper's rule, the arms swinging.
- The transition on the swinging sole's contact (`touching`), and a time cap on a swing that never
  lands.
- A walk that starts from the stance's stand (the first swing from both feet).
- `tests/simbicon.test.mjs`: the Warrior walks forward 5 m and stays up. The stop waits for the
  pace (session 03).
- **Reading:** `research/locomotion-run.mjs --legs '{"kind":"simbicon"}'` on the forward line,
  calm and under 20 N gusts, 20 s, both bodies: the speed made, the falls, the cadence and step
  length beside a person's (`personStep`), the legs' demand (the share of steps a hip, knee and
  ankle channel is at full activation). This is the first figure of the plan: what the class does
  on this body with no tuning at all.
- **Eye gate:** the owner watches it in the Lab's Run (`?play=lab&scenario=run`, the mind's Walk
  set to the new part).

### 03: speed and steering

- The pace asked, 0 to 1.4 m/s forward: the inverted-pendulum landing and the virtual force
  (Coros 2010), the swing hip's world-frame target from the landing.
- The stop: the pace asked brought to zero, the swing foot set beside the stance foot, and the
  legs given back to the stance's stand once both are down and the centre of mass is slow.
  `tests/simbicon.test.mjs`: the Warrior walks forward 5 m and stops on its feet, as
  `tests/stride.test.mjs` asks of the stride.
- The heading: the pelvis's yaw target, turned toward the facing asked at up to 2 rad/s while
  walking; a turn past what the stance hip gives in one step is taken step by step.
- Backward and sideways: the swing hip's target mirrored; sideways by the hips' abduction. Either
  that fails on the bed is written down and left to the stance's walk, which the travelling gait
  hands to anyway.
- **Reading:** the bed's lines, both bodies, 0.5 to 1.4 m/s asked, the circle and the square under
  gusts; the fastest pace held every way, and forward. If forward falls short of 1.27 m/s: the
  binding channel, and the same lines at `--physique '{"strength":2}'` and `{"speed":2}`. A cap
  that doubles with the strength is the body's; one that does not is the controller's.
- **Eye gate:** the owner watches the walk at 0.5 and 1.3 m/s, the stop, and a turn.

### 04: the search, if the owner asks

- `research/cma.mjs` over the states' targets and the gains, on worker threads
  (`research/rollout-pool.mjs`), the objective the pace held on the forward line under gusts
  together with the falls every way, each candidate on several seeds; the paired criterion
  against the hand's settings (Cohen's d of the paired margin), never a candidate against its own
  noise.
- The best becomes the part's defaults; the search's command and its table go in the commit.

### 05: the run

- The running states: a stance of a set time ending in a push that leaves the ground, a flight
  until the swing foot's contact, the swing leg's hip and knee targets a runner's; the
  inverted-pendulum landing with the velocity term (Raibert 1986, the same rule the run uses
  today); the arms swinging against the legs.
- The change from the walk to the run and back at a pace asked (a person's is near 2 m/s,
  `competencies.md`), between steps.
- `tests/simbicon.test.mjs`: the Warrior runs 10 m and stops on its feet.
- **Reading:** the forward line at 1.5 to 3 m/s asked, calm and under gusts, both bodies: the
  speed made, the falls, the pelvis's yaw a step (the figure that felled today's run), the legs'
  demand.
- **Eye gate:** the owner watches the run and the change from the walk.

### 06: travelling by it

- The part offered in the `travel` slot (`TRAVEL`'s `travel`), the hand-over to the stance's walk
  between steps as `travelOrFight` does it today, the resume from the body as it is
  (`Skill.resume`), both ways.
- The Arena at `&gap=8` and the Crypt: the hero and the skeleton travel by it and fight by the
  stance's walk; a fall travelling is counted on the bed's square, not in a bout.
- `tests/travel.test.mjs` covers the hand-over both ways.
- The owner's choice 2: whether `TRAVEL` names it. If yes, the smoke bout
  (`tests/smoke.test.mjs`) is run and the league once
  (`research/empty-hand-league.mjs`), since every humanoid's opening walk changes.

## Out of scope here

- A learned policy from motion capture (DeepMimic, AMP; a muscle-actuated body in Lee et al.
  2019): the other class. It is decided on after this plan's ceiling is seen, not beside it.
- Fighting on this gait: a blow's footing (`LegsAsk` of kind `place`) and a kick need the stance.
  A fight is the stance's walk until a skill that fights from it is designed.
- The stride's and the run's settings: not touched.
- An envelope for the gait (`StanceEnvelope`): tactics plan by the walk they fight in. If the gait
  becomes the travelling walk, the envelope's figures are measured then
  (`research/core-stance-envelope.mjs`).
