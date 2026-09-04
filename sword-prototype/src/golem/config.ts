/**
 * The golem tuning surface: one exported block per module or subsystem id.
 *
 * **One block per id, never one nested object.** Sessions 03, 05 and 07 each append a sibling
 * block here -- `CHAIN_REACH`, `LOCOMOTION_BIPED`, `TORSO_PLAIN` -- and 05 and 07 may run in
 * parallel. A single nested `GOLEM_CONFIG` would put every one of those sessions into the
 * middle of the same object; a flat file of `export const`s puts them at the end of it.
 *
 * **The house rule applies to every number here.** No feel complaint is fixed by raising a
 * motor ceiling without a measured before/after table beside the number. Every number in
 * `CONFIG.arm` carries one, and so does every number here: a short table when it was swept, a
 * one-line statement of how it was chosen when it was not, and the date either way.
 *
 * Units are SI throughout -- metres, kilograms, seconds, radians, newtons, newton-metres.
 *
 * Explicit `.ts` on intra-directory imports: Node loads this graph directly. This file imports
 * nothing, which is the cheapest way to keep that true.
 */

/**
 * The reusable anchor drive: a massless keyframed frame that drags a body about.
 *
 * These are the *defaults*. A chain hands `AnchorDrive` its own parameters, and the ones here
 * are what a chain gets if it does not care -- copied from `CONFIG.arm`'s measured Warrior
 * numbers and then scaled for stone, so that the first chain to use them starts from something
 * that was measured rather than from a guess.
 *
 * **No page-side reader in Session 02.** Rung 0 has no drive and rung 1 drives a hinge motor
 * directly, so the reader that spends these is Session 03's `reach` chain, which is the first
 * one whose target is a point rather than an angle. That is a named reader that is coming
 * rather than a field nobody has ever read, which is the distinction `AGENTS.md` draws before
 * anything is deleted for having no reader.
 * `tests/golem-bench.test.mjs` drives one on the bench stand and asserts that the
 * force cap and the rate limit each do what they say, so these numbers are exercised rather
 * than merely declared.
 */
export const ANCHOR_DRIVE = {
  /**
   * Diameter of the anchor's own sphere, metres.
   *
   * `CONFIG.arm`'s anchors are 0.02 and this is the same number for the same reason: it is
   * massless, on no collision layer, and invisible, so the only thing the size decides is how
   * big the dot is when the rig overlay draws it. 2026-09-04.
   */
  markerDiameter: 0.02,

  /**
   * Linear force ceiling, newtons.
   *
   * `CONFIG.arm.linearMotorForce` is 850 N against a Warrior arm of 2.70 + 1.80 + 0.65 kg
   * carrying a 1.35 kg sword -- 6.50 kg driven. Rung 1's link and blade are 10.70 kg, which the
   * Node bench prints, so the mass ratio is 1.646 and 850 x 1.646 is 1400 N: the same
   * authority per kilogram rather than a new decision. It is a ceiling, not a stiffness -- the
   * lag and follow-through that make a limb read as heavy come from the ceiling being finite.
   *
   * **A starting point, not a measurement.** Nothing on the page spends it in this session, so
   * it has been proved to hold a body against gravity and to be genuinely finite, and not to
   * feel like anything. Session 03 has to sweep it against its own chain's mass and write its
   * own table here. 2026-09-04.
   */
  linearForce: 1400,

  /**
   * Angular force ceiling, newton-metres.
   *
   * `CONFIG.arm.wristMotorForce` is 110 N.m, set from a measured re-aim time (0.42 s to 0.07 s
   * going from 42 to 110, and nothing above 110 improved it). Scaled by the same 1.646 mass
   * ratio as the linear cap: 181, rounded to 185. Same caveat as above. 2026-09-04.
   */
  angularForce: 185,

  /**
   * How fast the *commanded* point may move, metres per second.
   *
   * The Warrior's anchor has no rate limit at all: it is teleported to wherever the cursor
   * says and `setTargetTransform` gives the constraint a velocity from the difference. That is
   * exactly what makes a Warrior arm keyframe onto its commanded pose on the first control
   * step and read 77 m/s of tip speed in a fighter that never swings. A golem's command is
   * rate-limited instead, so the first step is a move and not a snap.
   *
   * 6 m/s is `CHAIN_PITCH.targetRate`'s swept 6 rad/s carried across at rung 1's 1.14 m reach,
   * which is 6.8 m/s at the tip -- so this is the same ceiling in the units an anchor works in,
   * rounded down. It has not been swept in its own right, for the reason the force caps give
   * above. 2026-09-04.
   */
  linearRate: 6,

  /**
   * How fast the *commanded* frame may turn, radians per second.
   *
   * Same argument as `linearRate`. 8 rad/s is about 460 deg/s, which is a fast wrist and well
   * inside what the angular cap can actually deliver against stone. 2026-09-04.
   */
  angularRate: 8,
};

/**
 * The bench stand: a kinematic block with one socket on each side.
 *
 * Frozen choice from the session plan: an `ANIMATED` stone block at Warrior torso height with
 * one socket frame at shoulder height on each side. It does not move, lean or fall. Session 05
 * puts a real torso under the socket and the socket frame contract does not change.
 */
export const BENCH_STAND = {
  /** Block half-extents in metres: a torso-sized slab. Chosen by eye, 2026-09-04. */
  width: 0.62,
  height: 0.78,
  depth: 0.40,
  /**
   * Where the block's centre sits, metres.
   *
   * `CONFIG.fighter.shoulderHeight` is 1.42 and the sockets sit there, so the block's centre
   * is half its height below that -- the slab's top is the shoulder line. 2026-09-04.
   */
  centreHeight: 1.03,
  /**
   * Socket offset from the block's centreline, metres.
   *
   * `CONFIG.fighter.shoulderSide` is 0.21 for a Warrior. A golem is wider: half the block's
   * width plus a little, so a limb hangs beside the slab rather than through it. 2026-09-04.
   */
  socketSide: 0.34,
  socketHeight: 0.39,
  socketFront: 0.0,
  /**
   * Mass, kilograms. Zero: it is `ANIMATED`, so the solver treats it as infinitely heavy and
   * a limb pushing on it simply stops. 2026-09-04.
   */
  mass: 0,
};

/**
 * Rung 0, `none`: no driven axis at all.
 *
 * It exists so the body plan is complete without effectors, and so the bench's noise floor is
 * measured on something that cannot move. The cap belongs to this chain rather than to a
 * terminal because there is nothing to weld a terminal onto.
 */
export const CHAIN_NONE = {
  /**
   * The cap: a slender capsule bolted rigidly to the socket, so a shove registers.
   *
   * Slender by the frozen rule -- no wider than it needs to be to register the contact it
   * exists for. 90 mm across and 240 mm long is a fist-sized stone knuckle at golem scale.
   * Chosen by eye against the stand, 2026-09-04.
   */
  capLength: 0.24,
  capRadius: 0.045,
  /**
   * Mass, kilograms.
   *
   * A capsule 0.24 m tip to tip at radius 0.045 is a 0.15 m cylinder plus a sphere:
   * 0.000954 + 0.000382 = 0.001336 m3, and stone at 2600 kg/m3 makes that 3.5 kg. Arithmetic
   * rather than a sweep, and nothing on rung 0 moves, so this number decides only what a shove
   * is worth. 2026-09-04.
   */
  capMass: 3.5,
  /** Health and vitality weight for the one part. Placeholders until Session 08 scores a
   *  golem; they are declared because the contract requires them, not because anything reads
   *  them yet. 2026-09-04. */
  capHealth: 40,
  capVitalityWeight: 0.5,
};

/**
 * Rung 1, `pitch`: one hinge at the socket about the side axis, and a short link.
 *
 * For a one-axis chain, task space and joint space are the same number, so what makes this not
 * a robot arm is exactly three things -- the torque cap, the target rate limit and the stroke
 * shape -- and the bench measures exactly those three. Nothing else in this block will save
 * it, which is why every one of the three carries a table.
 */
export const CHAIN_PITCH = {
  /**
   * The link: length, radius and mass.
   *
   * 0.34 m of link and a 0.80 m blade puts the tip 1.14 m from the socket, which the Node bench
   * prints back as `reach 1.140 m`. The socket is at 1.42 m, so at the bottom of the pitch
   * range the tip should clear the floor by 0.28 m -- and the lowest the tip goes anywhere in
   * the scripted sequence, chop included, measures **0.2800 m**, with **0 contacts** over the
   * whole run. That matters because a contact opens a 0.25 s tip-speed exclusion window and a
   * chop that hits the floor is not a chop. 2026-09-04, the Node bench.
   */
  linkLength: 0.34,
  linkRadius: 0.062,
  /**
   * Mass, kilograms.
   *
   * A capsule 0.34 m tip to tip at radius 0.062 is a 0.216 m cylinder plus a sphere:
   * 0.00261 + 0.00100 = 0.00361 m3, and stone at 2600 kg/m3 makes that 9.4 kg. Arithmetic, not
   * a sweep -- but it is what every number below was swept against, so moving it moves them.
   * 2026-09-04.
   */
  linkMass: 9.4,
  linkHealth: 90,
  linkVitalityWeight: 1,

  /**
   * The hinge's range, radians, measured as lift from hanging straight down.
   *
   * 0 is hanging down, pi/2 is horizontal and forward, and the ceiling stops short of folding
   * the link back over the stand. 0.30 to 2.15 is 17 deg below the horizontal at the bottom
   * and 123 deg at the top. Chosen by eye against the stand rather than swept: it is an
   * anatomy decision, not a feel one, and the frozen rule is that a command lives inside the
   * envelope so the mapping below simply spans it. 2026-09-04.
   */
  pitchMin: 0.30,
  pitchMax: 2.15,
  /**
   * The hinge's hard limits, radians of pitch, which are wider than the command range.
   *
   * The joint stop is not the envelope. A stop the command sits against is a motor and a limit
   * pushing at each other every step, which is the buzz `arm.ts`'s wrist was rewritten to get
   * rid of -- so the stops stand 0.2 rad outside the commanded range at the top and a stroke
   * that overshoots has somewhere to go.
   *
   * **The bottom stop has to admit the build pose, and getting that wrong is visible from the
   * first solver step.** The link is built hanging straight down, which is pitch 0, and the
   * first draft put the bottom stop at 0.10 -- so the chain was constructed 0.10 rad outside
   * its own limit and Havok cleared the violation on step one by throwing the blade tip at
   * **9.95 m/s** on a stand that was doing nothing. That is the same shape of failure as a weld
   * whose two frames disagree at construction, arriving through a joint limit instead of a
   * weld, and it was caught by the weld-frame assertion in `tests/golem-bench.test.mjs` rather
   * than by looking. -0.05 puts the build pose a shade inside the stop; the commanded floor of
   * 0.30 is 0.35 clear of it. 2026-09-04.
   */
  jointMin: -0.05,
  jointMax: 2.35,

  /** Where the limb rests with the cursor centred: `pointerY` 0 maps to the middle of the
   *  range, so the middle of the window is a limb held level-ish. 2026-09-04. */
  restPitch: 1.225,
  /**
   * `guard` raises to a high preset, radians.
   *
   * 1.95 is 112 deg -- the limb up and forward, the blade high, which is what a guard is. Not
   * `pitchMax`, so a guard is a pose and not a limit. Chosen by eye, 2026-09-04.
   */
  guardPitch: 1.95,

  /**
   * The target rate limit, radians per second. One of the three numbers that decide whether
   * this reads as a limb.
   *
   * The mouse can cross the window in a frame; a stone arm cannot. This is the ceiling on how
   * fast the *commanded* angle moves, not on how fast the limb moves, so it is what makes a
   * flicked cursor a sweep rather than a snap.
   *
   * Swept in the Node bench, `--sweep rate`, on the step from rest to `guardPitch` (0.725 rad):
   *
   *     rate    arrival   peak tip on the step   overshoot   wander at rest
   *      2.5     0.279 s        4.99 m/s          0.008 rad     10.06 mm
   *      4.0     0.175          6.87              0.019         16.01
   *      6.0     0.162          9.10              0.049          2.88
   *      9.0     0.142         12.67              0.054          2.43
   *     14.0     0.192         14.40              0.003          2.79
   *     30.0     0.404          7.35              0.003          2.44
   *
   * **The turn at 14 is the finding, and it is not what was expected.** Past about 9 rad/s the
   * command outruns the limb, and once it does, what moves the limb is no longer the command:
   * it is Havok's position motor closing a large error, which it does at an approach rate of
   * its own of roughly 1.7 rad/s whatever the error is. So a command that arrives instantly
   * makes the limb *slower* -- 0.404 s and 7.35 m/s at rate 30, against 0.162 s and 9.10 m/s at
   * rate 6 -- and the motion stops being shaped by anything a person did. That is the "robot
   * arm" failure in its exact mechanical form, and the rate limit is what prevents it.
   *
   * 6.0 is taken as the setting: the fastest rate at which the command still leads the limb
   * rather than abandoning it, with a step peak of 9.10 m/s that sits inside the band the
   * Warrior's own driven swings occupy. 9.0 arrives marginally sooner and 2.5 and 4.0 are worse
   * on every column including wander. 2026-09-04, the Node bench.
   */
  targetRate: 6.0,

  /**
   * The hinge motor's torque cap, newton-metres. The second of the three.
   *
   * A position motor at the torque needed to move stone is stiff by construction: no lag, no
   * follow-through, no secondary motion. The cap is what buys those back.
   *
   * Swept in the Node bench, `--sweep torque`, step from rest to `guardPitch` and hold:
   *
   *     torque   arrival   overshoot   peak tip on the step   wander at rest
   *       120     0.200 s   0.047 rad         8.76 m/s            2.80 mm
   *       200     0.221     0.096             8.77                2.82
   *       320     0.162     0.049             9.10                2.88
   *       500     0.142     0.037             9.80                4.30
   *       900     0.129     0.024            11.15                5.81
   *
   * **Overshoot falls as the torque rises, which is the opposite of a spring** and is the
   * clearest evidence in this file that the rate limit rather than the motor is what shapes the
   * move: a stronger motor tracks a rate-limited command more exactly and therefore has less
   * momentum to carry past it. The 200 N.m row is the worst of both -- it lags enough to build
   * momentum and is still too weak to arrest it -- and its 0.096 rad is more than twice the
   * overshoot at 320.
   *
   * 320 is taken: the arrival is under a fifth of a second, the limb still carries about 0.05
   * rad past its target and comes back, and the residual wander at rest has not started to
   * climb. Above 500 both the wander and the step peak rise together, which is a motor working
   * harder against gravity rather than a limb behaving better. 2026-09-04, the Node bench.
   */
  motorTorque: 320,

  /**
   * The chop, which is a velocity event and not a pose sequence. The third of the three.
   *
   * `drive` runs the hinge's motor in VELOCITY mode downward at `driveRate` for
   * `driveSeconds`. `follow` keeps the same velocity target with the torque dropped to
   * `followTorque`, so the limb coasts on its own momentum and decelerates against gravity
   * rather than against the motor. Then the position motor takes over again at full torque and
   * brings the limb back to whatever the cursor has been asking for the whole time.
   *
   * **The follow phase is what makes it a stroke rather than a pose, and here is the evidence.**
   * At `driveRate` 12 and `driveSeconds` 0.05 the drive always leaves the limb at 0.905 rad.
   * What varies is how far past that it carries, measured as the deepest pitch the tip ever
   * reaches over the whole stroke:
   *
   *     followSeconds   deepest pitch reached   carried past the drive
   *         0.00              0.520 rad                0.385 rad
   *         0.01              0.434                    0.471
   *         0.02              0.341                    0.564
   *         0.04              0.097                    0.808
   *
   * Twice the follow-through at a **ninth of the drive's torque**, which is the whole claim: the
   * extra 0.42 rad is momentum and gravity, not a motor. A pose sequence stops where the pose
   * says and has no row in this table at all.
   *
   * **`driveSeconds` is 0.05 and not longer because of the joint stop.** The commanded range's
   * floor is 0.30 rad and the hard stop is at -0.05, and a stroke is allowed to overshoot into
   * that margin -- but it must not *arrive* there, because a limb slamming into its own stop is
   * a motor and a limit pushing at each other, which is the buzz `arm.ts`'s wrist was rewritten
   * to get rid of. Measured deepest pitch, `followSeconds` held at 0.04:
   *
   *     driveSeconds   deepest pitch   what happens
   *         0.05           0.097        clears the stop by 0.147 rad
   *         0.06           0.022        clears it by 0.072
   *         0.07          -0.062        arrives at the stop
   *         0.08          -0.081        arrives at the stop and rebounds off it
   *         0.14          -0.088        the drive alone reaches the stop; no follow-through
   *
   * The 0.14 row is the first draft's setting and is why this table exists: the drive ran the
   * whole way to the stop, so the follow phase had nothing left to carry and the stroke was a
   * pose sequence with a bounce on the end of it. `tests/golem-bench.test.mjs` is what found it,
   * by asserting the limb goes *further* during the follow than during the drive.
   *
   * **`driveRate` sets the speed and saturates.** Peak tip speed with the first 0.6 s and 0.25 s
   * after any contact excluded, as the measurement record requires:
   *
   *     driveRate   peak tip on the chop
   *         6             9.31 m/s
   *         9            11.64
   *        12            15.07
   *        16            18.21
   *        22            18.21
   *
   * 16 and 22 return the same figure, which is the torque cap refusing to accelerate 10.7 kg any
   * harder inside 0.05 s -- so above 16 the number in this block stops describing the stroke.
   *
   * 12 is taken, and the comparison it was chosen against is the Warrior duelist's own driven
   * peak over the standard 120-bout corpus: mean 16.00 m/s, range 0.00 to 43.13
   * (`docs/measurements.md`). A golem chop at 15.07 m/s therefore arrives just under a Warrior's
   * average committed cut -- inside the band this directory's own weapons occupy rather than
   * above it. 2026-09-04, the Node bench.
   */
  chop: {
    driveRate: 12,
    driveSeconds: 0.05,
    followSeconds: 0.04,
    /**
     * The follow-through's torque cap, newton-metres.
     *
     * Not zero. Zero is a limb that has been let go of, and the difference between letting go
     * and easing off is the whole of what follow-through means: 40 N.m is about an eighth of
     * the drive, enough to keep the stroke on its line and nowhere near enough to hold it up.
     * 2026-09-04.
     */
    followTorque: 40,
  },

  /**
   * Damping on the link, per `CONFIG.arm`'s pair.
   *
   *
   * `arm.linearDamping` is 0.7 and `arm.angularDamping` is 3, and they bleed off residual
   * ringing in the chain. Copied rather than re-derived: the link is one capsule on one hinge
   * and there is nothing here the Warrior's numbers were not already about. Measured effect at
   * these settings: 2.876 mm of tip wander once the limb has arrived and held for 0.05 s,
   * against 0.0000151 mm on rung 0, which is the harness's own floor. 2026-09-04, the Node
   * bench.
   */
  linearDamping: 0.7,
  angularDamping: 3,

  /**
   * The band the readout calls "arrived", radians.
   *
   * 0.02 rad is about 1.1 deg, which at 1.14 m of reach is 23 mm at the tip -- the same order
   * as the millimetre band every Warrior anchor reading in `docs/measurements.md` is taken
   * against. 2026-09-04.
   */
  settledBand: 0.02,
};

/**
 * The blade terminal: one slender blade body, welded once to whatever link a chain hands it.
 *
 * It has no control code at all. If a terminal file ever reads `HandIntent`, the chain/terminal
 * factoring has leaked.
 */
export const TERMINAL_BLADE = {
  /**
   * Blade length, metres, from the weld to the point.
   *
   * `CONFIG.sword.bladeLength` is 0.84 for a Warrior's arming sword. 0.80 is that, minus the
   * four centimetres that buy the floor clearance in `CHAIN_PITCH.linkLength`'s table. It is
   * the same weapon at golem scale rather than a bigger one, because the bench exists to judge
   * the *chain* and every chain is benched with this same blade. 2026-09-04.
   */
  length: 0.80,
  /** `CONFIG.sword.bladeWidth` and `bladeThickness` exactly. A golem's blade is still a blade,
   *  and slender is the frozen rule. 2026-09-04. */
  width: 0.050,
  thickness: 0.010,
  /**
   * Mass, kilograms.
   *
   * `CONFIG.sword.mass` is 1.35 for an arming sword 0.84 m in the blade; this is that scaled by
   * length, 1.35 x 0.80 / 0.84 = 1.286, rounded to 1.30. Deliberately **not** derived from the
   * box's own volume: 0.050 x 0.80 x 0.010 m of solid steel would be 3.1 kg, and the Warrior's
   * sword is not 3.3 kg either, because a real blade is tapered and hollow-ground and the
   * collider is a slab standing in for it. The mass is the weapon's; the box is the collider.
   *
   * A stone blade was considered and refused: an edge is the one part of a golem that has a
   * reason to be metal, and the material recipes salvaged from the construct tree already say
   * which recipe that is. 2026-09-04.
   */
  mass: 1.30,
  /**
   * Where the point is along the blade's own +Y from the weld, metres.
   *
   * The whole length: the blade is welded at its base and the tip is the far end. Stated as
   * its own number because `Striking.tipPosition` is what the readout takes tip speed from and
   * a tip offset that quietly disagreed with the geometry would move every speed reading in
   * the file. 2026-09-04.
   */
  tipOffset: 0.80,
  health: 60,
  vitalityWeight: 0.4,
  /** `CONFIG.sword`'s own damping pair, unchanged. Follow-through should read as weight, not
   *  as a loose pendulum. 2026-09-04. */
  linearDamping: 0.5,
  angularDamping: 2,
};

/**
 * The readout's own numbers, which belong to the instrument rather than to any module.
 *
 * These two exclusion windows are not tuning. They are the measurement record's mandatory
 * rule, restated where the code can read it: a peak tip speed that does not say which window
 * it is outside means nothing.
 */
export const BENCH_READOUT = {
  /**
   * The opening exclusion, seconds.
   *
   * A driven limb keyframing onto its commanded pose is worth 77 m/s in a Warrior that never
   * swings, and the page does it too the moment you press Fight. 0.6 s is the number
   * `AGENTS.md` fixes. 2026-09-04.
   */
  startupExclusionSeconds: 0.6,
  /**
   * The post-contact exclusion, seconds.
   *
   * Blade on blade, a glance off a body, or a dropped sword hitting the floor all spin a blade
   * past anything a motor could do -- measured over 100 m/s. 0.25 s is the number `AGENTS.md`
   * fixes. 2026-09-04.
   */
  contactExclusionSeconds: 0.25,
  /**
   * How long a commanded value must hold still before the readout calls the move a step,
   * seconds.
   *
   * A settle time is only meaningful against a target that has stopped moving. 0.05 s is
   * twelve control steps at 240 Hz. 2026-09-04.
   */
  stepHoldSeconds: 0.05,
  /**
   * How much a commanded value must move to count as a step, in the axis's own unit.
   *
   * 0.15 rad is about 8.6 deg, which is well clear of the rate limiter's per-step motion and
   * well below the smallest deliberate move the scripted sequence makes. 2026-09-04.
   */
  stepThreshold: 0.15,
  /**
   * How many consecutive control steps of a non-converging error make a stuck step, and by how
   * little the error has to move to count as non-converging.
   *
   * 24 steps is 0.1 s at 240 Hz, and 1e-4 rad over that window is a limb that is not going
   * anywhere. Stroke steps are excluded outright rather than filtered, because a chop's error
   * is enormous by design. 2026-09-04.
   */
  stuckWindowSteps: 24,
  stuckEpsilon: 1e-4,
  /**
   * Below this rate the command counts as still, in the axis's unit per second.
   *
   * A rate rather than a displacement, and that distinction was paid for: comparing the command
   * against a baseline the same test refreshes means a slow enough ramp never registers as
   * motion at all, and a target rate of 2.5 rad/s then read 796 mm of "wander at rest" on a limb
   * that was travelling through most of its range. 1e-3 rad/s is three orders of magnitude below
   * the slowest rate ever swept here and comfortably above the float noise on a held command,
   * which is exactly zero. 2026-09-04.
   */
  commandStillRate: 1e-3,
};
