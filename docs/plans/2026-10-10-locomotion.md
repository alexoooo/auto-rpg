# Locomotion: a test bed, and a walk and run that reach a person's

## Outcome

Fighters that move like people: a walk near a person's pace in every direction, a run with a
flight phase, and quick bursts of footwork. The work comes in three parts:

- **A Lab test bed** that tests any walk and run the same way, with gusts of wind to show whether
  it holds up when pushed.
- **A new locomotion skill**, added beside today's walk as a second option.
- **A fighting check** that decides which of the two the presets use.

Today's walk stays exactly as it is, as the baseline to compare against.

## Why, from what is measured

- **The fastest walk held in every direction** is 0.5 m/s for the Warrior and 0.4 m/s for the
  Rogue and the skeleton (`assets/core/stance-envelope.json`). A person's preferred walk is near
  1.4 m/s ([roadmap](../roadmap.md#body-and-motor-control)). Running, a dash and a quick step
  are not built.
- **Today's walk is a statically balanced gait** (`ownStep`, `walkStep`, `transferStep` in
  `src/core/control/gait.ts`, under `STANCE_GAIT`):
  - before each step it shifts the weight onto the bearing foot until the capture point is over
    that sole;
  - then a double support of 0.08 s;
  - then a swing of 0.3 s, no step longer than 0.8 of the leg;
  - the pace goes toward the one asked at no more than 1 m/s².

  A person walking never parks the weight over one foot: the body falls ahead and the next step
  catches it. Running adds a flight phase, with the leg acting as a spring.
- **The Lab's Run** (`src/lab/run-mode.ts`) asks for the body's measured fastest walk, and no
  more. Its tracks are a big circle (radius 4 m) and a shuttle. The Stance scenario offers walks
  of 0.2 to 0.5 m/s as buttons (`SPEEDS`, `src/lab/stance-scenario.ts`).
- **The punch's speed was capped by its controller, not its body**
  ([human-level punch](../reference/punch-calibration.md)). Whether the same holds for the walk
  is not yet measured: session 02 measures it.

## Decided

- **The owner's direction (2026-10-10).** Fighters should move like real fighters, at about a
  person's level. The walk and run is to be tested systematically on a square run W, D, S, A
  under gusts of wind of configurable frequency and strength. The circle's top speed becomes a
  slider with a much higher range.
- **Today's walk is kept as the baseline** (owner, 2026-10-10). The `stance-walk` locomotion
  skill, the stance's own gait and `STANCE_GAIT` stay as they are. The new skill is another kind
  in the fighter's locomotion slot (`FighterConfig.locomotion`). A refactor of shared stance code
  shows with `scripts/fingerprint.mjs` that `stance-walk` moves no pose.
- **The new skill becomes the presets' default only if it helps fighting** (owner, 2026-10-10),
  read in the empty-hand league and by the owner's eye (session 07).
- **The project's rules hold:**
  - no assist (every character's balance stays 0 %);
  - no strength raised for feel;
  - every number in the body's spec or the rules carries its source;
  - each change is gated on `npm run check` and `npm test`, and CI runs the slow tier.
- **Wind is the Lab's disturbance, not an assist.** It pushes the body from outside, as a shove
  does, and nothing meters it against the body's balance.

## Sessions

### 01: the test bed

- **The square.**
  - A track of four straights in the Run scenario (`TRACKS`, `src/lab/track.ts`), its side set by
    a slider (default 6 m).
  - The body faces +z the whole way and walks forward, strafes right, walks backward and strafes
    left: the tactics hold `face` and set `move` in the body's frame.
  - Each corner is a change of direction with no turn, the hardest case.
  - A track piece may name the frame it is walked in, so the circle and the shuttle are unchanged.
- **Wind.**
  - Gusts arrive at random at a configurable rate (gusts a second, slider 0 to 2).
  - Each gust is a horizontal force of configurable strength (N, slider 0 to 200, read as a
    fraction of body weight too), in a random direction.
  - A gust rises and falls as a half-sine over 0.3 s. It is applied each physics step as an
    impulse (`SegmentBody.applyImpulse`) at the upper trunk's centre of mass.
  - The randomness comes from a seed, held in plain data in the run's state, so the Lab's history
    and replay play it again exactly.
  - It is drawn as an arrow at the chest while it blows.
- **A top-speed slider on the Run** (0.2 to 8 m/s), for every track:
  - The Run asks for the slider's pace, past the envelope if need be, because pushing the
    controller past what it holds is the point.
  - Bends still slow to the turn the skill's envelope holds, where it has one.
  - The circle's radius becomes a slider (2 to 20 m): a run at 5 m/s on a 4 m circle asks for
    0.6 g sideways.
  - The Stance scenario's walk buttons become a slider of the same range.
- **The readout:**
  - speed asked and speed reached;
  - step length, steps a second, and the share of time in double support and in flight;
  - falls and distance off the track;
  - per side of the square, the mean speed reached.
- **A Node harness** (`research/locomotion-run.mjs`). It runs the same tactics on the stand
  across body, track, top speed, wind rate and strength, and seed. Its score is the fastest speed
  held with no fall per direction, and the fall rate under each wind.
- **A fast test of the instrument** (`tests/lab-run.test.mjs` or a new fast file):
  - the square's frames and corners;
  - the wind's arrival rate, direction spread, force profile and seeded replay;
  - a control: a strong gust topples the body standing still.
- **Gate:** the owner looks at the square and the wind in the Lab.

### 02: what caps today's walk

The question is a measurement, so it is recorded (Node stand, Rapier, 120 Hz).

- **Baseline.** `stance-walk` on the harness: the fastest pace held forward, sideways and
  backward, on the square and the circle, without wind and under two strengths. This is the
  baseline every later session compares with.
- **Strip one limit at a time**, by a Lab or research override, never a global:
  - the weight shift's wait for the capture point;
  - the swing's 0.3 s;
  - the 1 m/s² acceleration;
  - the longest step;
  - muscle strength and speed (unbounded, as a probe only).

  Each reading is where the walk now fails and how: which foot, the direction of the fall, a
  foot slipping, a muscle at its ceiling, a swing landing late.
- **Joint demand.** The hip, knee and ankle torque and speed the fastest held walk asks for,
  against each muscle's ceiling. If the body caps the speed and not the controller, the fix is a
  body change with sources, and goes to the owner.
- **Output:** a study under `docs/analysis/` naming the binding limit, which sets the order of
  sessions 04 and 05.

### 03: the new skill, beside the old

- **A new locomotion kind**, provisionally `stride` ("Walk and run"):
  - the locomotion slot (`FighterConfig.locomotion`, `src/core/mind/config.ts`) takes a union of
    `StanceWalkConfig` and the new kind;
  - in `fighter.ts`'s skill parts, with its own fields;
  - in the mind editors of the Arena, the Lab and the Crypt.
- **It plans its own steps** and hands the stance one at a time as the goal's `swing` with its
  bearing `feet` (`StanceGoal`, `src/core/control/stance.ts`). It never sets `walk`, so the
  stance's own gait, which `stance-walk` uses, is not touched.
- **What the stance lacks, it gains as new goal forms**, never by changing the old ones: a
  landing time, a push-off, and later no bearing foot (flight). Each is held by the fingerprint.
- **Skills that set their own feet keep them**, as they take the legs today: the strike's
  placing, the kick's transfer, low support and the rise.
- **A fast test:** the new skill walks a body forward 5 m on the stand and stops. A fighter with
  it builds and steps. Its faults refuse a config it cannot carry out.

### 04: walking without the pause

- **Step placement from the divergent component of motion (the capture point)**
  (Englsberger et al., "Three-dimensional bipedal walking control based on divergent component
  of motion", IEEE T-RO 2015; Pratt et al., capture point, 2006). The centre of mass is never
  brought over the bearing sole; each landing is chosen so the body goes on at the pace asked.
- **Step timing adapts to a push** (Khadiv et al., "Step timing adjustment", Humanoids 2016),
  with the swing's duration as well as its place.
- **The ankle pushes off at the trailing foot's toe-off**, building on the stance's roll onto
  the toes and preswing.
- **Targets, each with a `SOURCES` entry when set:**
  - forward: a person's preferred walk (near 1.4 m/s) and a fast walk;
  - sideways and backward: what a person manages, read from a source;
  - all on the square under the session 01 wind.
- **Gate:** the owner watches it on the square and the circle.

### 05: running

- **A flight phase.** The stance gains a goal with no bearing foot, and a stance leg that
  behaves as a spring, with its stiffness and touchdown angle as inputs with sources.
- **Foot placement after Raibert's three-part controller** (Raibert, *Legged Robots That
  Balance*, 1986): the neutral point plus a gain on the velocity error, stance thrust for hop
  height, and hip torque for trunk pitch.
- **The walk-to-run change** at the speed a source gives (near a Froude number of 0.5).
- **Targets with sources:** ground contact time and leg stiffness at a running speed, and top
  speed. Bursts of 2 to 3 m/s matter more to a fight than a sprint.
- **The guard stays up.** Without arm swing, the trunk takes each stride's twist; the square
  shows whether it holds.
- **Gate:** the owner watches it run.

### 06: the new skill's envelope

- **Tactics plan by what a body's locomotion was measured to hold** (`Body.envelope`,
  `stanceEnvelope`, `research/core-stance-envelope.mjs`). The envelope becomes the locomotion
  skill's own: a body measured under each kind, `stance-walk`'s table unchanged.
- The new skill's table: pace every way, turn at each pace, starts, stops, and whatever of a run
  the tactics read.
- The Run's bends and the fighters' tactics read the table of the skill they drive.

### 07: fighting with it

- **The empty-hand league** (`research/empty-hand-league.mjs`) under a new epoch. Classic,
  Puncher and Scrapper each run with `stance-walk` and with the new skill, as separate entrants.
  The figures are win and damage Elo and falls a bout.
- **The Puncher's distance-keeping** (`EDGE`, `src/core/mind/recipe-tactics.ts`) was tuned on
  today's walk; re-tune it on the new one before reading the league.
- **The owner watches** a few bouts with each.
- **If the new skill helps fighting, it becomes the presets' default** (`CLASSIC`, `PUNCHER`,
  `SCRAPPER`); `stance-walk` stays selectable. Every bout then changes, and slow tests whose
  claims ride on one bout's trajectory are given margin, as `d45632b7` did.

## For the owner, as they come

- **After 01:** the square, the wind and the sliders, by eye.
- **After 02:** if the body and not the controller caps the speed, whether to change the body
  (with sources).
- **After 04 and 05:** the walk and the run, by eye.
- **After 07:** whether the new skill becomes the default.

## Risks

- **Running needs the stance to hold no foot.** Its bearing solve assumes at least one sole, so
  flight may need a whole-body layer the stance does not have. Session 05 may split if so.
- **Faster walks change every bout's trajectory**, including the rise's handover and the kick's
  transfer, which read the stance.
- **Wind strong enough to test a run may topple a standing guard.** The sliders' ranges are set
  from session 02's baseline.
