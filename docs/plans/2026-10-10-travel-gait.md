# A travel gait: a person's pace, then a run

## Outcome

A gait for getting about, not for fighting:

- forward at a person's comfortable walk (1.39 m/s, `PERSON_PACE.forward`), on the Lab's lines
  and its square under 50 N gusts;
- the other ways as near a person's as the levers reach (back 0.83, sideways 0.58);
- then a run, forward at 2 to 3 m/s.

A fighter that falls more on it is acceptable (owner, 2026-10-10): this gait is for moving about
and for speed. A fight keeps the stance's walk. The stride (`src/core/skills/stride.ts`) is the
travel gait, and it may leave the guard.

The plan is sized for one unattended run of 12 hours or more. Its sessions go in order. Each one
keeps going after a finding instead of stopping to ask. Eye checks and the owner's choices go to
the list at the end.

## Why, from what is measured

All figures are from the Node stand, Rapier, 120 Hz (`research/locomotion-run.mjs`). The
[roadmap](../roadmap.md#body-and-motor-control) has the detail.

- **The stride holds about 0.8 m/s forward**, and asked 1.4 it falls. The stance's own walk holds
  1.2 forward with no envelope, and 0.5 to 0.7 the other ways.
- **Each lever tried on its own moved the pace held by about 0.03 m/s or less.** That covers
  push-off, lift, swing time, double support, `paced`, `lands`, twist, knee bend, the yaw's weight
  in the share, and the sole.
- **The early swing is where the soles fall short.** There the stance asks a yaw of 50 N m at
  1 m/s and 125 at 1.4. That is about the reaction to a 12 kg leg accelerated at the minimum-jerk
  peak (5.77 D/T², about 45 m/s² for 0.7 m in 0.3 s) a tenth of a metre off the stance foot. The
  swinging hip is at full flexion. A person cancels this with an arm swing; the guard holds the
  arms still.
- **The stride swings faster than a leg swings by itself.** A free leg swings in about half its
  pendulum period, 0.35 to 0.45 s (Mochon and McMahon 1980, ballistic walking). The stride's 0.3 s
  has to be driven all the way.
- **A shoe's sole helps a walk under gusts, but the stance cannot hold it still.** Shod, bodies
  fell less often walking under 50 and 80 N gusts:
  - the stance's walk 1,076 times against 1,103 in 1,920 paired runs (the runs only one of them
    fell in: 62 shod, 89 bare; sign test p 0.034);
  - the stride 1,197 against 1,225 (65 against 93, p 0.031);
  - most of all walking backward: 198 against 238 on the stance's walk.

  Standing under gusts, shoves standing or after a walk, and the speed held did not change. On
  the game's bodies, though, it fails 10 of the fast tests. The Rogue holding two clubs cannot
  stand: its feet's load swings from about 80 to 580 N between one 120 Hz step and the next. At
  240 Hz it stands. A foot of about a kilogram on the sole's 328 kN/m rings near 80 Hz, above what
  a 120 Hz control step can follow; that is the hypothesis session 02 tests. A shod body is now
  built sunk into its soles by its weight, so it does not spring a foot off the ground as it first
  settles.
- **Unproven: that the yaw is the cap.** Weighing the yaw less moved nothing. Session 03 strips
  each limit in turn before anything is built on that claim.

## Decided

- **The stride is the travel gait. `stance-walk` and `STANCE_GAIT` do not change.** A shared stance
  change is additive and holds the fingerprint (`scripts/fingerprint.mjs`: "no pose moved").
- **No league gate.** The stride is judged on the locomotion harness, not on bouts.
- **No toe joint** ([passive toes](../reference/man-passive-toes.md)).
- **The rules hold.**
  - No assist in anything kept. A session-03 probe may use one, metered and named, and nothing it
    shows is kept as a body or a setting.
  - No strength raised for feel.
  - Every number of the body, the rules or a material carries its source. A skill's constant is
    tuned freely.
  - Each change runs `npm run check` and `npm test`; `npm run build` too when the Lab's editor
    fields change. `test:all` is CI's.
- **A lever is a setting, off by default, until it earns its place.** It earns it on the
  scorecard (session 01). It goes on in the stride's defaults (`STRIDE`) only when it lifts the
  pace held without more falls, on both models.

## Sessions

### 01: the scorecard

One fixed reading that every session quotes, so that two levers are compared on the same thing.

- **`research/locomotion-pair.mjs`** reads two runs of the harness paired run by run, matched by
  model, track, pace, wind and seed. It reports falls in each, the runs only one of them fell in
  (with a sign test), the mean speed over the runs both held, and the time up.
- **The scorecard** runs on the Warrior and the Rogue:
  - the four lines at 0.7, 1.0, 1.2, 1.4, 1.7 and 2.0 m/s under 1:20 N gusts (noise, so that seeds
    differ), 10 seeds;
  - the square and the circle at 0.5, 0.7 and 1.0 under 1:50, 10 seeds.

  It reports the fastest pace on each line at which 9 seeds in 10 hold, and the paired falls
  against the stride's defaults. Its cost is measured and written in the script's header; it is
  expected to take minutes.
- **The baseline:** the stride's defaults and the stance's walk, each read once and kept in
  `.snap/` for every later pairing.

### 02: the stance on a shoe's sole

The owner's rule: keep the sole if it helps. It helps a walk, and costs a body that stands. Fix the
cost, then keep it.

- **Find the loop that rings.** Read, step by step at 120 Hz, a shod body standing: each bearing
  foot's vertical velocity, its contact load, and what the bearing task (`bearLimbs`,
  `bearing.ts`) and the stance's foot holding ask of it. Confirm, or replace, the hypothesis that
  the foot's ring on the sole is faster than the control step.
- **Fix it in the controller, not the sole.** The sole's numbers are a measured shoe's. Candidates:
  - the bearing task holds the foot where the sole lets it rest, and leaves the sole's own give
    to the sole, instead of damping the foot's motion at its rate;
  - the foot's motion is read through the step's average rather than its last substep;
  - the stance reads a shod foot's tilt in the sole as the foot's own, so a lean does not pass
    through the give uncorrected.
- **Gates:** `npm test` green with the Warrior and the Rogue shod (`humanSpec` wraps `withSoles`);
  the same paired gust A/B (`.snap/sole2/gust.sh`, kept in `research/` if it is to be run
  again) still shows fewer falls; and the Lab's edge leans no longer step where a bare body does
  not.
- **Then the sole goes into the game**, since the owner asked for it if it helps. The reference
  numbers it moves are measured again: the club's best blow, standing height, the smoke bout.
  Every bout changes, so the change lands as its own commit.
- If no controller fix holds within the session, the sole stays an option, and the findings go to
  the roadmap.

### 03: what caps the walk (probes, nothing kept)

Strip one limit at a time, and read how much faster the stride holds on the scorecard's lines.
The owner's way: separate a bug from an artificial constraint before tuning anything.

- **A perfect ground wrench.** A metered assist on the root that gives what the soles missed
  (`StanceReading.shortfall`), uncapped. If the stride still falls at 1.4, the cap is the plan or
  the steps, not the wrench.
- **The yaw alone.** The same assist, giving only the missed yaw moment. This tests the roadmap's
  claim directly.
- **More grip.** Friction 1.0 in place of `CONTACT_FRICTION` 0.5, as a probe flag of the harness.
  A sole's twist resistance grows with it.
- **Light legs.** Leg segments at half their mass, by a probe physique. The swing's reaction
  scales with the leg's mass.
- **Twice the rate.** 240 Hz. Read the faster rate at the slower one's spacing before calling a
  difference physical.
- **Ankles that never saturate.** The bearing ankle's dorsiflexion is saturated late in the
  swing; double its peak, as a probe physique.

The table of these says which of sessions 04 to 09 binds first, and they go in that order. All of
them are still tried, since a cap that lifts reveals the next.

### 04: arms that swing

The travel gait leaves the guard. The arms swing against the legs: each shoulder flexes as the
other side's hip does, the elbows bent near a right angle, as a person walking briskly does. Arm
swing cuts the ground's vertical moment by most of its size (Collins, Adamczyk and Kuo 2009;
Park 2008).

- A setting of the stride, `arms`: `"guard"` (today) or `"swing"`. With `"swing"` it gives a
  posture goal for each arm, phased on the stance's step (`StanceReading.phase`, the swing's
  progress). The amplitude grows with the pace asked.
- Read: the yaw shortfall in the early swing, then the scorecard.
- If a swinging arm is too light to cancel a leg (in a person it is about a third of it), the
  next session takes the rest.

### 05: the upper body takes the swing's reaction

The stance knows the path the swinging foot will take, so it knows the angular momentum the leg
will gain. It asks the trunk (the spine's twist) and the arms for the opposite, in place of
asking the soles for a yaw they cannot give.

- An addition to the stance behind a swing setting (`SwingGoal.cancel`). The swinging leg's
  angular momentum rate about the bearing sole comes from the path's acceleration and the leg's
  mass properties (`bodyDynamics`). It is taken off the ground's share
  (`shareGroundWrench`, `contact-wrench.ts`) and given to the root as a moment the upper chain
  produces.
- The hip strategy is the same idea in pitch: a centroidal moment pivot outside the sole, paid for
  by the trunk's angular momentum and returned by the end of the step.
- Fingerprint: "no pose moved", since the setting is off by default.

### 06: a swing the leg can follow

- **The swing starts with the foot's velocity, not from rest.** The path begins at the foot's
  measured state at lift (a quintic with its initial velocity and acceleration), and its
  acceleration begins at heel-off while both soles still bear and give a yaw.
- **A lower peak.** For the same distance and time, a path that holds its acceleration flatter
  than minimum jerk lowers the peak by up to 30 %.
- **The swing's time is the leg's.** A swing setting `natural` takes the swing's time as half the
  leg's pendulum period, from the leg's own mass properties about the hip. That is a rule, not a
  factor. The cadence follows (`paced`). `paced` alone held nothing more; here it comes with the
  path that suits it.
- **Step timing that adapts.** The step's time lengthens as well as shortens with the capture
  point's error (Khadiv et al. 2016, DCM step adjustment). Today it can only shorten.

### 07: the stance's own walk as the travel gait

The stance's walk holds 1.2 m/s forward with no envelope; the stride holds 0.8.

- Read both on the harness's step readings (landing, cadence, shortfall by phase) at 1.0 and
  1.2, and name what differs.
- Port what explains it into the stride; or else make the travel gait a locomotion that walks by
  the stance's walk under an envelope read by direction (forward, back, sideways), so that it
  walks 1.2 forward and 0.5 sideways. A fight's `stance-walk` keeps the one envelope it reads
  today.

### 08: a sole that rolls

The foot is a rigid flat box. A person's foot and shoe roll over a curve from heel to toe, of a
radius about a third of the leg's length (Hansen, Childress and Knox 2004, roll-over shapes).

- A probe first: the foot's collision shape with a rounded heel and toe. The stance reads a sole
  as a flat patch, so its centre-of-pressure limits have to follow the rolling contact; measure
  that before trusting any reading.
- Kept only if it lifts the scorecard, with the shape's source written. The body's geometry is
  open to change; `docs/art/` says what a change to the feet costs the art.

### 09: the levers together, searched

Single levers interact: `paced` failed alone, and may not with a swing that suits it.

- **Diagonal CMA-ES** (`research/cma.mjs`) over the stride's settings and every lever that
  sessions 04 to 08 kept as a setting, in the unit cube. The objective is the scorecard's lines:
  the fastest pace held, then the paired falls.
- **Prove each dimension is live** before searching on it: a grep that something reads it, and a
  run at each end of its range that moves something.
- **Budget:** three to four hours of the machine (30 lanes). The best point is run again on fresh
  seeds and on the square, which the search never saw. Only that replication is quoted.
- The winner becomes the stride's defaults (`STRIDE`) if it holds on both models.

### 10: a run

A run need not wait for a walk at a person's pace. Its flight separates the steps, and a hopping
controller is simple and robust (Raibert 1986, Legged robots that balance):

- the foot placed ahead by half the stance's travel, plus a gain on the speed's error, to set the
  speed;
- a thrust in the stance to set the hop's height;
- the trunk's pitch held through the hip in the stance.

Steps, each read before the next:

1. **A stance that holds no foot.** In flight the stance asks nothing of the ground. It holds the
   posture and places the legs, and reads the next touchdown.
2. **A hop in place on both feet**, then on alternate feet: jogging in place.
3. **A run forward** at 2 m/s, then 3, from a walk at whatever pace it reaches.
4. **Read:** speed held, falls, flight's share of the stride, and the legs' saturation.

The run is a locomotion of its own (`LocomotionConfig`, a union by kind), experimental, beside the
stride.

### 11: travel and fight together

A locomotion that walks by the travel gait (arms swinging, faster) when no foe is within a
distance, and by the stance's walk in the guard when one is. That serves the Crypt's exploring and
an Arena's approach. It is a setting in the mind editor. Whether the presets use it is the owner's
choice.

### 12: close

- If the stride's defaults changed, measure its envelope again
  (`research/core-stance-envelope.mjs --legs stride --write`).
- Correct the roadmap's walking item and the architecture's stride paragraph.
- Delete this plan.

## The owner's, at the end

- Watch the travel gait in the Lab (`?play=lab`, Walk set to Walk and run), arms swinging, at a
  person's pace.
- Watch the run.
- Choose whether the presets travel by the travel gait out of a fight (session 11).
- Choose the foot's shape if session 08 kept a rocker.
