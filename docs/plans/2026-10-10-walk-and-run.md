# Walk and run: closing the gap to a person's

## Outcome

A stride that holds a person's pace every way, under wind, in a fight:

- forward at a person's comfortable walk (1.39 m/s, `PERSON_PACE.forward`), and toward their fast
  walk (2.53 m/s);
- backward at 0.83 m/s and sideways at 0.58 m/s;
- all of it held in the stride's envelope (`assets/core/stride-envelope.json`), and on the Lab's
  square under 50 N gusts;
- a blow thrown from a walk that is moving;
- then a run.

The stride (`src/core/skills/stride.ts`) is what grows. `stance-walk` stays the baseline and the
presets' default until the league says otherwise.

## Why, from what is measured

All figures are from the Node stand, Rapier, 120 Hz (`research/locomotion-run.mjs`,
`research/core-stance-envelope.mjs`, `research/empty-hand-league.mjs`). What they show is in the
[roadmap](../roadmap.md#body-and-motor-control).

- **The controller caps the walk, not the body.** Muscles three times stronger or faster hold no
  more, and no single stance setting lifts the cap.
- **The runaway.** A step lands short of where the capture point needs it, so the next step
  starts further behind and the walk runs away. Holding the swinging foot tighter to its path
  (`SwingGoal.settle`, 0.07 s) cured much of it: the stride holds 0.7 / 0.4 / 0.5 m/s every way
  (Warrior, Rogue, skeleton). It walks forward at about 0.8 m/s.
- **The step's time is fixed** (0.3 s swing, 0.08 s on both feet). Step length is the pace times
  0.38 s. A person lengthens the step *and* quickens the cadence as they speed up. The stride's
  timing only ever shortens a step, to catch the capture point.
- **The swing ends on the clock.** A foot that is late is put down where it is.
- **The soles cannot give what the stance asks.** That is 48 % of control steps at 0.5 m/s, and
  76 % at 1.4 m/s; most of the shortfall is pitch and yaw moments early in a swing. What they
  can't give simply goes missing, and the plan does not know.
- **No push-off.** A person's forward walk gets much of its work from the trailing ankle at
  toe-off (Winter 1983; Kuo 2002, the step-to-step transition). We have heel-off and preswing, but
  no drive. Plantarflexion is the strong channel (152 N m), and dorsiflexion is the one that
  saturates in swing (43 N m).
- **The trunk takes the stride's twist.** The guard is up, so there is no arm swing.
- **Every contact is rigid, at a friction of 0.5** (`CONTACT_FRICTION`). Rubber on a floor
  grips better than that, and a shoe's sole gives a little under load. That spreads the load over
  more of the sole and forgives a landing that is a little off.
- **Why the stride lost the fight.** The straight punch, searched with `settle` 0, drives the
  moment its foe is in range: mid-step on the stride, where the stance-walk Puncher stands. The
  striding Puncher fell 1.84 times a bout against 0.11.
- **A whole-body solve is too dear today.** The spike's solve held the stand at 2.2 to 2.8 ms a
  body a step, five or six times today's ([whole-body spike](../reference/whole-body-spike.md)).
  The soles have to be respected more cheaply.

## Decided

- **The stride grows; `stance-walk` and `STANCE_GAIT` do not change** (owner, 2026-10-10).
  A shared stance change is additive, and `scripts/fingerprint.mjs` shows that no pose moved.
- **No toe joint.** A passive toe was tried and failed on the game's solver at 120 and 480 Hz under
  every load; only the rigid foot passed ([passive toes](../reference/man-passive-toes.md)).
- **A compliant sole is tried**, the owner's idea (2026-10-10). It uses our Rapier patch's
  pair-local compliant contact (`PhysicsHooks.contactLayer`), which today engages only a point
  against a declared material.
- **The rules hold:**
  - no assist (balance 0 %);
  - no strength raised for feel;
  - every number of the body, the rules or a material carries its source;
  - each change is gated on `npm run check` and `npm test`, with `test:all` left to CI;
  - wind is a disturbance, not an assist.
- **Speed over ceremony.** Each session reads its own lines on the harness. The stride's envelope
  is measured again only where a session changes what it holds, and the league is run once, in
  session 08.

## Sessions

### 01: the instrument

`research/locomotion-run.mjs` reads, a step at a time:

- **where each swing lands** against where it was last sent, and against the capture point's
  steady offset;
- **the friction the soles use**: tangential force over normal at each sole, its peak and its
  share of steps over 0.4;
- **the shortfall** by component (force, pitch, roll, yaw) and by phase of the step;
- **step length and cadence** against the pace, beside a person's at the same pace.

This costs no compute. Every later session reads its effect here, and the table says which of
sessions 02 to 06 binds first. If the friction used never nears 0.5, grip is not the cap and
session 02 tries compliance alone.

**Found** (Warrior and Rogue, both walks, four lines, 0.5 to 1.4 m/s asked, 20 s):

- **The cadence is the gap, and the other way round.** The stride steps 2.6 times a second, 0.28
  to 0.38 m a step. A person at the same speed steps 1.2 to 1.5 times a second, 0.43 to 0.54 m
  (`personStep`, the walk ratio). Session 03's steps grow longer *and slower* up to a person's
  walk, quicker only past it.
- **Grip is not the cap.** The friction asked on one foot stays under 0.3 (95th percentile)
  wherever the walk holds, and reaches 0.4 to 0.5 only in the runs that fall. The sole's friction
  stays the contract's.
- **The landing is where it was sent**, within 1 to 2 cm, wherever the walk holds.
- **The shortfall is early in the swing**: forward, force with pitch and yaw (tens of N and N m at
  1 m/s, past 100 at 1.4); sideways, mostly force; backward, pitch.

### 02: a sole that gives, and grips

- **The pair rule.** A foot segment carries a sole material: a layer (stiffness, damping ratio,
  depth) against the arena's fixed ground. The adapter's pair rule (`layerFor`, `src/core/engine/rapier.ts`)
  gains the layer-against-rigid case. Today it needs a point against a layer.
- **Numbers with sources.** The layer comes from a measured shoe midsole and outsole (a
  mechanical test of shoes, entered in `SOURCES` when the session runs). Friction comes from a
  measured rubber-on-floor coefficient, *only if* session 01 shows slip. The contract today gives
  every contact `CONTACT_FRICTION`, so a sole's own friction is a contract change, named as such.
- **An option first.** The Lab and the harness build a body with or without the sole. The
  Warrior's and the Rogue's boots are the candidates; the skeleton's bare bone gets none. Turning
  it on for the game changes every bout, so it is the owner's choice (below).
- **Check before trusting.** The stance reads a sole as a rigid patch: its centre of pressure,
  its height and `StanceReading.shortfall`. A sole that compresses moves all three, and the
  session measures by how much. `MaterialContact.depth` and `.work` give the compression and the
  energy. Measure the step cost as well, because a layer adds solver rows.
- **Reading:** the stride's lines and square with and without the sole: speed held, landing
  error, shortfall.

### 03: land on contact, and a cadence from a source

- **The swing ends when the sole meets the ground.** A late foot goes on down toward its place
  past its time; one that meets the ground early ends its swing. This is additive on `SwingGoal`
  (an option the stance's own steps never set).
- **Cadence and step length from a person's** (Grieve and Gear 1966, step length and frequency
  against speed). The stride's swing and double-support times come from the pace, so steps grow
  longer *and* quicker. The adaptive timing (Khadiv 2016) may lengthen a step as well as shorten
  it.
- **The envelope's speeds** extend to 1.4, 1.8 and 2.5 m/s forward.
- **Gate:** the owner watches the walk on the square and the circle.

### 04: the push-off

- **The trailing ankle drives at toe-off.** During the double support, the bearing foot's
  plantarflexion is pushed toward a moment sized from a person's ankle power burst (Winter 1983),
  so the body is launched into the next step rather than caught by it (Kuo 2002).
- **The knee clears the swing.** Ground clearance comes from knee flexion more than ankle lift,
  taking load off the dorsiflexion channel that saturates.
- **Reading:** speed held forward and back, and the ankle channels' activation.

### 05: an ask the soles can give

- **A small contact-force solve** over the soles' corners, inside the friction pyramid and the
  sole's area, finds the nearest wrench the feet *can* give to the one the stance asks. The
  stance tracks that one, and the stride's next landing absorbs the error, rather than the error
  going missing.
- It runs at a few corner forces a foot, far cheaper than the spike's whole-body solve; its cost
  is measured.
- It is an option on the stance goal (additive), which the stride sets and `stance-walk` never
  does.
- **Reading:** the shortfall's share of steps, and speed held sideways and back, where the
  shortfall is largest.

### 06: the trunk and the height

- **The pelvis turns with the stride, and the chest turns back** to keep the guard facing the
  foe. The twist each step makes is then planned rather than fought.
- **A centre of mass that rises and falls** over a straighter bearing leg (Englsberger et al.
  2015, the virtual repellent point), in place of the constant-height pendulum that forces bent
  knees at speed.
- **Reading:** the yaw shortfall, and speed held forward.

### 07: a blow from a moving walk

- **The punch drives at a landing.** A boxer's lead foot lands with the jab. The straight punch
  gains a timing that waits for the stride's next touchdown, or for both feet, rather than any
  instant. `settle` 0 stays what it is on `stance-walk`.
- **The stride finishes its step** when a blow is waiting, rather than starting another.
- **Reading:** a short run of league bouts of the striding Puncher against Classic and the
  Puncher, reading falls a bout.

### 08: fighting with it

- The empty-hand league under a new epoch: Classic, Puncher and Scrapper, each on `stance-walk` and
  on the stride, with the sole on and off if session 02 kept it.
- The Puncher's `EDGE` is re-tuned on the stride if its footwork changed.
- **If the stride helps fighting, it becomes the presets' default**, and knife-edge slow tests
  are given margin. The owner watches a few bouts.

### 09: running

Only once the walk holds near 1.4 m/s every way.

- **A flight phase** owned by the stride: a stance goal that holds posture with no foot bearing.
  This is the risk the last plan named.
- **A spring leg** (stiffness and touchdown angle from a source) and Raibert's placement.
- **The walk-to-run change** near a Froude number of 0.5.
- **Bursts of 2 to 3 m/s with the guard up.**
- **Gate:** the owner watches it run.

## For the owner, as they come

- **After 02:** whether the boots' sole goes into the game. It changes every bout's contacts.
- **After 03:** the walk, by eye.
- **After 08:** whether the stride becomes the default.
- **After 09:** the run, by eye.

## Risks

- **A compliant sole under a stance built for rigid ones.** The stance's balance reads the sole
  as a rigid patch. If compression moves its centre of pressure too far, the stance needs to read
  the layer, and that is a change to shared code.
- **The layer pair rule touches every foot-ground contact.** It must leave the unconfigured
  path bit for bit (the fingerprint), and its solver rows cost step time.
- **Friction is one number for every contact today.** Raising a sole's friction is a contract
  change, and it can make a fall catch a foot.
- **Session 05 is a solve in the step.** The step's allocation ceiling (`tests/core-step-cost.test.mjs`)
  and its cost apply.
- **Faster walks change every bout's trajectory**, and the kick's transfer reads the stance.
- **Another agent works on rising**, which reads the stance. Pull before each session, and keep
  additions to `src/core/control/` small and separate.
