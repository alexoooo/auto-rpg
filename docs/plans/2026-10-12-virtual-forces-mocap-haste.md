# Virtual forces, motion capture and Haste

The owner asked for this plan on 2026-10-12. It continues the walk/run campaign on the Lab's three
Run tracks (circle, shuttle, square), whose score is the bed below. It has three parts:

- **A. Virtual forces:** the walk holds the speed asked through its stance leg.
- **B. Motion capture:** human reference motion drives the gait's joint targets.
- **C. Haste:** a physically based movement-speed attribute.

The parts are in the order to do them. A is cheap and fixes the measured weakness. C's first
measurement is cheap and can run beside A. B is the largest, and starts with a survey that decides
whether the rest of B is worth doing.

## Where things stand

- **The walk:** SIMBICON (`src/core/skills/simbicon.ts`). Every leg freedom is a speed servo
  (`MusclePush.speed`, its error over `settle`) capped at a share of its strength.
  - The swinging leg places the foot by the inverted pendulum's landing and SIMBICON's balance
    feedback (`cd`, `cv`).
  - The stance knee and ankle go to fixed angles.
  - The stance hip turns the pelvis upright and to the heading.
  - Nothing in the stance leg acts on the body's speed. Speed comes only from where the foot lands.
- **The bed:** `research/locomotion-run.mjs --tracks square,circle,shuttle` on the Warrior, the
  Rogue and the skeleton, seeds 1–6. It scores 0.761 (36afb6c0). Seeds 7–12 validate at 0.759.
  The skeleton falls on 10 of 28 squares.
- **Speed tracking, measured on the battery:**
  - The side walks make 70–75 % of the speed asked, and fail WENT.along 0.7 at 1 m/s.
  - The back walks make 80–85 %, and the 45° walks about 80 %, with drift.
  - The slow forward walk overspeeds: asked 0.4 m/s, it makes 0.6.
  - Two fixes through foot placement both failed: a landing integral, and a trim of the walk the
    feedback aims at. Made exact, the side walk falls.
- **Muscle speed:** the muscles follow Hill's force-velocity curve (`src/core/muscle/force-velocity.ts`).
  A physique already scales every muscle's unloaded speed of shortening (`Physique.speed`,
  `src/core/human/physique.ts`, into `jointSpeed`, `src/core/human/speed.ts`). The Run harness takes
  it already (`--physique '{"speed":1.25}'`).
- **The envelope:** the walk asked is capped at the body's envelope (`simbiconEnvelope`,
  `assets/core/simbicon-envelope.json`). The envelope is measured per model, not per physique.

Every figure below names its harness: the Node core stand, Rapier, 120 Hz.

## A. Virtual forces

Coros, Beaudoin and van de Panne 2010 (already cited for the landing) tune a walk's speed with a
virtual force on the centre of mass, `F = k (v_asked − v)`. The stance leg gives it as joint
torques, `τ = Jᵀ F`. The muscles deliver it, so it is not an assist and needs no Balance.

Our stance leg is driven by speed servos, not torques. So the force's first form here is its
velocity counterpart: the stance leg's joint speeds that move the pelvis over the planted foot at
the correction asked. A torque form comes second, only if the velocity form falls short.

### A1. The pelvis servo through the stance leg (velocity form)

- With the stance foot planted, the pelvis's six freedoms (spin and velocity) and the stance leg's
  six (ankle 2, knee 1, hip 3) are related by a 6×6 Jacobian.
- Ask the pelvis for a twist:
  - **Spin:** what the stance hip asks now, upright and to the heading in `pelvis` s.
  - **Horizontal velocity:** its velocity now plus `vf × (v_asked − v)` forward and `vfSide ×` the
    same to the side, over a step, capped at `vfMost` m/s.
  - **Vertical velocity:** what holds the stance knee's angle, as the knee target does now.
- Solve for the leg's joint speeds, and drive them as the pushes do now, at the same shares of
  strength. The ankle keeps its lower share (`ankle`), so the body still rolls over a foot that
  gives.
- Reuse the core's Jacobian code (`jacobianTo` in `src/core/control/bearing.ts`, or
  `reachJacobianTo` in `src/core/control/kinematics.ts`). The leg's Jacobian is computed the same
  way, with no difference quotients.
- **New settings, each with its dimension:** `vf` and `vfSide` (1/s), `vfMost` (m/s). At
  `vf = vfSide = 0` the gait is today's, to the bit, and the fingerprint shows it.
- **The run:** the run's push-off states keep their torque pushes. The servo acts in the walk's
  states and the run's first state.

**Gate:** the bed against 0.761 with the falls counted, then seeds 7–12. The battery's tracking
table (A2) for each way.

### A2. A tracking table

- Read speed made over speed asked for each body, each way (forward, 45°, side, back), at two or
  three speeds. Read it under no gust, and under the battery's gusts.
- It is a few lines in `research/locomotion-run.mjs` or the battery's report. It is not a new
  harness.
- It is the measure A is judged by.
- **Target:** every way within 10 % of asked, up to its envelope, and no slow forward overspeed.

### A3. Search the servo's gains

- Add `vf`, `vfSide` and `vfMost` to the search's dimensions (`WAY_DIMS` in
  `research/locomotion-search.mjs`).
- Search each way with `--objective both` at sigma 0.03 from the hand-set values.
- Once the stance leg holds the speed, retune the leads (`lead`, `leadSide`, `leadOut`). They were
  set to compensate for it.

### A4. The torque form, only if A1 saturates

- If the servo's pushes sit at their strength cap, or the stance foot slips, the velocity form
  has run out.
- Then add a bias torque to a speed push (`MusclePush`, `src/core/control/motor.ts`, and the
  driver's motor, `src/core/muscle/driver.ts`): a speed servo plus a fixed torque within the same
  strength cap. Use `τ = Jᵀ F` as Coros does.
- This is a motor change, so it lands with the fast tier, the smoke bout's fingerprint unchanged
  at zero bias, and its step cost read.

### A5. Re-measure the envelope

- Measure the SIMBICON envelope again (`research/core-stance-envelope.mjs --legs simbicon`).
- The Run asks each body's envelope, so faster, held side and back walks reach the square only
  through it.
- The owner's rule stands: asked faster than it holds, a body goes at its most.
- Fast tests that read the envelope (the lab-run paces, the shuttle) are rechecked.

**Commits:** A1 with A2, A3, A5; A4 only if needed. Each lands with `npm run check` and `npm test`,
and the touched slow tests run by name.

## B. Motion capture as the gait's reference

The idea is to replace SIMBICON's hand-set angles with human joint trajectories by phase, and keep
SIMBICON's balance feedback (foot placement, the stance hip's pelvis) and A's servo on top. This is
the route of Lee, Kim and Lee 2010 ("Data-driven biped control"): track a reference and change it
with feedback as the walk goes.

What it would bring:

- Gaits that change with speed, by blending clips at several speeds.
- Motion that looks human.
- Targets that cite a recording, in place of searched constants.

It is not kinematic playback: the physics drives the body throughout.

### B1. Survey the data (a gate: it decides whether B goes on)

- **The source:** the CMU Graphics Lab database (mocap.cs.cmu.edu). CMU places no restrictions on
  its use. The BVH conversion in github.com/Shriinivas/cmubvh adds none.
- **List from CMU's own index:**
  - forward walks at several speeds, and jogs and runs;
  - backward walks (subject 132 trial 13, and subject 136 trials 11–12 crouched, as secondary sites
    list them; to be checked against CMU's index);
  - side steps, which look scarce (one dance trial, subject 5 trial 11, is listed).
  - For each: frame rate, length, and whether the feet slide.
- Note any other dataset whose licence allows use in the game. A licence is read, never assumed.
- **Outcome:** for each way, a clip or "none". With no side clips, the side way keeps SIMBICON's
  angles and B serves forward and back only.
- Raw downloads go in a scratch directory outside the repo, treated as untrusted data. Only the
  derived tables are committed.

### B2. Import and retarget (a research script that writes an asset)

`research/mocap-import.mjs` does four things:

- **Reads BVH.** It is a text format: a joint hierarchy, then one line a frame. A small parser in
  the script, with no dependency.
- **Maps joints.** CMU's `Hips`, `LeftUpLeg`, `LeftLeg` and `LeftFoot` (and the right side, plus
  the spine for the pelvis's lean) map onto our hip (3), knee (1) and ankle (2).
  - Each joint's rotation is converted into our angles as the joint's limit reads them
    (`jointAngles`, `src/core/build/joint-state.ts`), and clamped to the limits.
  - Pressing each limit checks the conventions before any reading is trusted.
- **Segments cycles.** Contacts come from foot height and speed. Cycles are cut from one landing to
  the next of the same foot, resampled to a fixed number of phases, and averaged per clip. The
  spread across cycles is kept, as a check on how clean the clip is.
- **Scales.** Time scales by the square root of the leg's length (Froude), as `scaledGait` already
  does for SIMBICON.

Its output:

- `assets/core/mocap-gaits.json`: per way and speed, joint angles by phase for stance and swing,
  the cycle's duration, and the walk's speed.
- A `SOURCES` entry for each clip: subject, trial, and the licence statement.

**Check:** the reference posed on each body, frame by frame, keeps the soles off the floor in swing
and on it in stance (no physics). A broken retarget shows here before anything is tuned.

### B3. A tracking gait

The gait is a variant of SIMBICON, so it shares the state machine, the landing and the stance hip.

- **Phase.** Phase runs from the stance foot's landing to the swinging foot's landing, the
  reference's half-cycle stretched to the events, not to the clock.
- **Targets.** The leg's targets are the reference's angles at the phase. The clip is the one for
  the walk asked, or a blend of the two nearest speeds.
- **Feedback.** On top of the reference go the landing and the `cd`/`cv` feedback on the swinging
  thigh and spread, the stance hip's pelvis, and A's servo.
- **Selection.** A setting chooses the reference: none (today's angles) or the asset's. The default
  stays SIMBICON's until B5.

### B4. Search the feedback around the reference

The landing gain, `cd`/`cv`, servo gains and `settle` are searched on the reference gait with
`--objective both`. The reference's angles themselves are not searched; they are what the gait
cites.

### B5. Compare

- Bed and battery against the best SIMBICON gait from A.
- An eye gate in the Lab: the two gaits side by side on each Run track, for the owner to judge.
- Whether the reference gait becomes the default is the owner's choice.

## C. Haste, a physically based speed attribute

### The physical knob

A body moves faster when its muscles can keep their force at higher joint speeds: more power, as
fast-twitch fibre gives a sprinter.

- That is Hill's unloaded speed of shortening (`ForceVelocityCurve.unloadedSpeed`), which
  `Physique.speed` already scales on every muscle.
- Strength at rest, mass and gravity are unchanged.
- So a hasted body swings its legs round faster and pushes off harder at speed. It still falls and
  flies at g, and holds and lifts what it did.

It cannot look like fast-forward, which needs time and gravity scaled together. It cannot float,
since no force acts on it that its muscles do not give through its feet.

**Rejected:** a forward force on the root (an assist). It moves the body without the legs earning
it, which reads as sliding or being pushed.

### C1. Measure the knob with the gait as it is

- Run the bed and the battery with `--physique '{"speed":1.25}'` and `{"speed":1.5}` against ×1.
- The envelope is per model, so the Run still asks today's paces. This first reading says only how
  much more robust a hasted body is at the same speeds.
- Run the battery's envelope at higher asked speeds to see how much faster it can go.
- Also read speed with strength (`{"speed":1.25,"strength":1.1}`). From rest a limb accelerates on
  its isometric torque, which speed alone does not raise.

### C2. The gait uses the headroom

- A gait set for normal muscles keeps its cadence. Its swing time (`seconds`) and servo time
  (`settle`) do not shorten because the muscles could go faster.
- A rule scales the gait's "time" dimensions (`DIMENSION` in `simbicon.ts`) by the body's muscle
  speed against the reference body's, as `scaledGait` scales them by leg length.
- The exponent is measured. Candidates: 0 (no change), ½, 1.
- Running depends most on push-off power. The run's flight, blocked today by the ankle's stop, is
  re-measured under Haste.

### C3. The attribute

- **The stat:** `AttributeSpec` gains `haste`, a per cent, the owner's (an `owner-haste` source), as
  `balance` is. It enters the figure as a speed factor of 1 + haste/100 (`physiqueFigure`).
- **The scope**, the owner's choice:
  - (a) every muscle: a classic haste, with faster blows, guards and rises too;
  - (b) the legs' muscles only, needing a per-region factor: movement speed alone.
- **The envelope:** measured per model at a few haste levels, with the envelope at a haste
  interpolated between them; or a rule scaling it by the C2 exponent, checked against the measured
  levels.
- **Pages:** the Lab and the Arena take `&haste=` beside `&balance=`. Every character's haste is 0
  until the owner sets one.
- **Reporting:** a figure measured on a hasted body names each side's haste, as it names balance.

## Order of work

1. A2, then A1: the table, then the servo. In parallel, C1 (measurement only) and B1 (a survey,
   no code).
2. A3, then A5.
3. C2, then C3 once the owner has chosen the scope.
4. B2 to B5, if B1 finds the data.

The background searches of the 2026-10-11 plan are stopped or finished before A1 changes
`simbicon.ts`. A search's workers read the source once at start, and a change underneath one
voids its scores.

## The owner's choices

- Haste's scope: every muscle, or the legs only (C3).
- Haste's range, and each character's value.
- Whether Haste also raises strength, if C1 shows speed alone does little from rest.
- Whether the mocap gait becomes the default walk (B5, after the eye gate).
- Which datasets beyond CMU, if any (B1).

## Eye gates

- The Lab square (W/D/S/A) on all three bodies after A.
- A hasted body walking and running beside an unhasted one (C2).
- Mocap gait against SIMBICON (B5).
