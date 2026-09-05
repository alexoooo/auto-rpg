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
 *
 * **Session 03 arrived and swept them, and both moved.** The tables live in `CHAIN_REACH` beside
 * `anchorForce` and `anchorRate` rather than here, because what they measure is one chain's mass
 * and one chain's lever and neither is a property of this class -- a golem arm nearly three times
 * rung 1's mass wants 3900 N, and its 1.52 m tip turns an anchor rate into something about seven
 * times larger, so 6 m/s here is five times too fast there. These stay as they are: they are the
 * defaults a chain gets if it does not care, and the two chains that do care state their own.
 * 2026-09-04.
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
  /**
   * Block extents in metres: a torso-sized slab. Chosen by eye, 2026-09-04.
   *
   * **`width` narrowed from 0.62 to 0.44 on 2026-09-04 by Session 03**, for a reason that is
   * geometric rather than aesthetic, and it is the same reason `socketSide`'s own comment
   * already gives: "so a limb hangs beside the slab rather than through it."
   *
   * At 0.62 the slab's side face stands at 0.31 and the sockets at 0.34, which is 30 mm of
   * clearance -- less than rung 1's own link radius of 0.062, so **rung 1's link overlapped the
   * slab by 32 mm for the whole of Session 02** (invisibly: the arm layer and the trunk layer do
   * not collide, so there was no contact to notice). Rungs 2 and 3 make it worse, because a
   * three-axis arm can swing inboard: with the ribs at 0.31 the elbow passes through the slab at
   * any inboard swing at all, and the swing limit that would prevent it is 0.15 rad, which is a
   * chain that cannot reach across itself.
   *
   * At 0.44 the face stands at 0.22 and the arithmetic closes. An elbow inside the slab's
   * depth needs its horizontal offset under `depth/2 / cos(swing)`, which at
   * `CHAIN_REACH.swingMin` of -0.50 bounds its lateral offset below `0.34 - 0.20*tan(0.50)`
   * = 0.231 m, outboard of the 0.22 face. A real torso is narrower at the ribs than at the
   * shoulders and this is that, stated as a number.
   *
   * **Rungs 0 and 1's recorded readings are unaffected**, which is why this was safe to move: the
   * stand is `ANIMATED` and massless, so it contributes no dynamics, and both of those chains
   * swing in the sagittal plane about a socket this does not move. Every figure in `CHAIN_PITCH`
   * is a settle, an overshoot, a speed or a wander, and all four are invariant under translating
   * a block sideways that nothing touches.
   */
  width: 0.44,
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
   *
   * Unchanged when Session 03 narrowed `width`: the shoulder line is where a limb hangs from and
   * moving it would move every rung's geometry, so what moved is the ribs. 0.34 against a
   * 0.22 face is 120 mm of clearance, which is where the "plus a little" above now stands.
   * 2026-09-04.
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
  /**
   * The band the readout calls "arrived", in the first published axis's unit.
   *
   * Rung 0 publishes no axis at all, so its target error is identically zero and any positive
   * band gives the same answer -- what this actually decides is only whether the instrument
   * believes the cap has arrived, which is the gate on the noise-floor measurement. 0.02 to agree
   * with the other rungs. Added 2026-09-04 by Session 03, when the band moved onto the envelope
   * so that a chain whose first axis is a *distance* stops borrowing a chain whose first axis is
   * an *angle*.
   */
  settledBand: 0.02,
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
   * How long after a stroke ends the limb is still considered to be in it, seconds.
   *
   * **A stroke does not stop when its last phase does**, and the two readings that are about a
   * limb being *stuck* -- the peak tip-to-command lag and the idle anchor stray -- are worthless
   * without this. A velocity event deliberately drops the drive's force ceiling and lets the limb
   * carry through, so the limb is a long way from its anchor by design; and it is still a long
   * way from it for as long as it takes the restored ceiling to haul it back, which is *after*
   * the phase machine has already said `idle`.
   *
   * Measured in the Node bench on the reach chain's cut, 2026-09-04: the anchor stray peaks at
   * 387.3 mm during the phase after the one the cut runs in, and is back under a millimetre
   * 0.42 s after the stroke's follow phase ends. 0.5 s is that with a margin, and it is the same
   * idiom as the post-contact window above -- an event whose aftermath is not the thing being
   * measured. 2026-09-04.
   */
  strokeExclusionSeconds: 0.5,
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

/**
 * Rung 2, `reach`: a yaw collar, an upper arm and a forearm, driven by a position-only anchor.
 *
 * **Three driven axes, one three-dimensional target, exactly one pose per reachable target.**
 * That is frozen rule 2 and it is the whole of why this rung exists. The recorded Warrior defects
 * -- an elbow that wrapped around the back, a shield hand that swung behind the trunk -- are the
 * overview's *candidate* explanation of a seven-axis chain asked for a six-axis pose: a spare
 * axis means any command near the edge of the envelope resolves to the least-violation pose. Here
 * there is no spare axis to resolve into.
 *
 * **The uniqueness is geometric and it is worth stating as arithmetic rather than as a claim.**
 * The collar yaws about the socket's vertical; the upper arm pitches about the collar's lateral;
 * the elbow bends about that same lateral. So the whole arm lies in one vertical plane through
 * the socket, the plane is chosen by the yaw, and inside it the two remaining angles are a plane
 * two-bone problem with a one-sided elbow. Given a target point:
 *
 * - the yaw is the target's azimuth, exactly (see `reach.ts`'s derivation);
 * - the elbow bend is `acos((r^2 - L1^2 - L2^2) / (2 L1 L2))`, single-valued because the elbow
 *   stop admits only one sign;
 * - the shoulder pitch is what is left.
 *
 * Two consequences fall straight out and both are used. The elbow's position is a single-valued
 * function of the hand target, which is the rope-elbow assertion in `tests/golem-bench.test.mjs`.
 * And the maximum of any linear function over the arm is attained at the socket, the elbow or the
 * hand, because the arm is a two-segment polyline -- which is what lets `swingMin` and `carryMin`
 * below keep the *whole* limb on its own side of the golem by bounding two points.
 */
export const CHAIN_REACH = {
  /**
   * The yaw collar: a stone ball at the socket, carrying the whole arm's yaw.
   *
   * Two hinges in series rather than one two-axis shoulder joint, which the session plan offers
   * as an alternative and which was refused for a measured-risk reason rather than a taste one:
   * a `Physics6DoFConstraint` with two free angular axes decomposes the relative rotation in an
   * order this directory has never established, and the envelope arithmetic above depends on the
   * decomposition being exactly yaw-then-pitch. A hinge is one free angular axis with the other
   * two locked, which is the shape rung 1 already proved.
   *
   * Centred **on** the socket, so both pivots are the same point and the kinematics are spherical
   * coordinates about it with nothing left over. 0.16 x 0.070 is a ball that reads as a shoulder;
   * chosen by eye against the stand, 2026-09-04.
   */
  collarLength: 0.16,
  collarRadius: 0.070,
  /**
   * Mass, kilograms.
   *
   * A capsule 0.16 m tip to tip at radius 0.070 is a 0.02 m cylinder plus a sphere:
   * 0.000308 + 0.001437 = 0.001745 m3, and stone at 2600 kg/m3 makes that 4.5 kg. Arithmetic,
   * like every other mass in this file. 2026-09-04.
   */
  collarMass: 4.5,
  collarHealth: 70,
  collarVitalityWeight: 0.6,

  /**
   * The upper arm and the forearm: length, radius, mass.
   *
   * 0.42 + 0.36 = 0.78 m of arm, against a Warrior's 0.69 m of upper arm, forearm and hand
   * together. Thirteen per cent longer on a golem whose shoulders are 0.68 m apart against a
   * Warrior's 0.42 m, which is deliberately *not* proportional: an arm scaled with the shoulder
   * line would be 1.10 m and the blade on the end of it would sweep the floor. Chosen by eye
   * against the stand with the blade on, 2026-09-04.
   *
   * The radii taper, 0.070 to 0.058, because a limb that does not is a pair of pipes. Slender is
   * the frozen rule and both are inside rung 1's 0.062 at the distal end.
   *
   * Masses are arithmetic at stone's 2600 kg/m3, as everywhere else here: the upper arm is a
   * 0.28 m cylinder plus a sphere (0.004310 + 0.001437 = 0.005747 m3, 14.9 kg) and the forearm a
   * 0.244 m cylinder plus a sphere (0.002579 + 0.000817 = 0.003396 m3, 8.8 kg). 2026-09-04.
   */
  upperLength: 0.42,
  upperRadius: 0.070,
  upperMass: 14.9,
  upperHealth: 120,
  upperVitalityWeight: 1.2,

  foreLength: 0.36,
  foreRadius: 0.058,
  foreMass: 8.8,
  foreHealth: 100,
  foreVitalityWeight: 1,

  /**
   * The envelope's reach shell, metres from the socket to the hand point.
   *
   * `reachMax` is 0.70 against a full extension of 0.78, which is 90 % -- the Warrior's own
   * `reachMax` is 0.61 of 0.69, or 88 %. The margin is not politeness: at full extension the
   * two-bone problem is singular and the elbow sits on its own stop, which is a motor and a limit
   * pushing at each other, and it is the failure rung 1's `jointMin` table records arriving
   * through a joint limit.
   *
   * `reachMin` is 0.38, which is an elbow bent 2.137 rad against a stop at 2.35. It is
   * proportionally much longer than the Warrior's `reachGuard` of 0.28/0.69 = 41 %, and that is
   * forced rather than chosen: two bones of 0.42 and 0.36 fold to 0.06 m, so the *stop* is what
   * decides how close the hand may come and a golem's elbow does not fold flat.
   *
   * `reachGuard` at 0.42 and `reachNeutral` at 0.60 are 0.18 m apart, which matters for a reason
   * that is about the instrument rather than the limb: `BENCH_READOUT.stepThreshold` is 0.15 in
   * the first published axis's own unit, and the first axis here is the reach in metres, so a
   * guard step closer together than that would never be *detected* as a step and the bench would
   * report no settle time at all. Chosen by eye and then checked against that. 2026-09-04.
   */
  reachMin: 0.30,
  reachMax: 0.72,
  reachGuard: 0.36,
  reachNeutral: 0.54,
  reachThrust: 0.66,
  /**
   * How fast the commanded reach follows the button, as a first-order response in 1/s.
   *
   * `CONFIG.arm.reachResponse` is 9 and this is that unchanged. The session plan freezes the
   * mapping's *shape* as the Warrior's `Arm.aim`, and the reach lag is the one part of that shape
   * which is a response rather than a ceiling: a rate limit moves at the same speed whether the
   * command jumped a millimetre or a metre, and what a button press wants is a move that starts
   * fast and eases in. The anchor's own `anchorRate` is the ceiling on top of it, and the two are
   * in series on purpose -- see that number for which one binds. 2026-09-04.
   */
  reachResponse: 9,

  /**
   * The envelope's angular limits, radians, **outboard-signed**.
   *
   * `swing` is the azimuth multiplied by the socket's own outboard sign, so positive is always
   * away from the golem whichever socket the module is in and one number serves both. That is the
   * mirroring trap taken out at the root: the stroke geometry in `policies.ts` is written for a
   * right arm and has to be mirrored for the other, and a sign got backwards there does not look
   * like a hand held wrong, it looks like an arm coming apart -- 504 mm of hand-to-anchor stray.
   *
   * `swingMin` of -0.50 is the number that keeps the **elbow** out of the stand, and it is
   * arithmetic rather than eye: an elbow inside the slab's depth needs a horizontal offset under
   * `depth/2 / cos(swing)`, which bounds its lateral offset below `socketSide - (depth/2)
   * tan(|swingMin|)` = 0.34 - 0.109 = 0.231 m, outboard of the narrowed slab's 0.22 face. See
   * `BENCH_STAND.width`. Past about 0.54 rad that closes and the elbow goes through the ribs.
   *
   * `swingMax` of 1.30 is `CONFIG.arm.azMax` exactly; the golem reaches as far outboard as a
   * Warrior does. `liftMin` and `liftMax` are -0.95 and 1.05 against a Warrior's -1.05 and 1.25,
   * clipped at the bottom for floor clearance: at `reachMax` and `liftMin` the blade's point sits
   * 0.50 m off the floor, and a contact would open a 0.25 s tip-speed exclusion window on every
   * stroke. `tests/golem-bench.test.mjs` asserts zero contacts over the whole scripted sequence,
   * which is that clearance checked rather than claimed. 2026-09-04.
   */
  swingMin: -0.50,
  swingMax: 1.30,
  liftMin: -0.95,
  liftMax: 1.05,

  /**
   * The minimum outboard carry, metres, measured from the socket.
   *
   * **This is the mechanism, not a guard**, and it is the whole of frozen rule 3 in one number.
   * The Warrior refuses an across-the-body command inside its controller -- `Arm.aim` reads
   * `signedShieldAzimuth < -0.60` and substitutes a different azimuth -- so a policy could ask
   * for a pose that had to be argued with. Here the pose is simply not in the envelope: the
   * mapping clamps the swing up until the target's outboard offset from its own socket is at
   * least this, **before the anchor is ever handed a target**, so there is no refusal branch
   * anywhere and nothing downstream has to know the rule exists.
   *
   * -0.24 against a `socketSide` of 0.34 leaves the hand at least 0.10 m outboard of the golem's
   * centreline, and because the arm is a two-segment polyline in one vertical plane, bounding the
   * hand and the elbow bounds every point on it.
   *
   * It bites where a cross-body command is *long* and not where it is short, which is the
   * coupling that makes it an envelope rather than an azimuth limit: at `reachMax` and level, the
   * floor on the swing is `asin(-0.24 / 0.70)` = -0.35 rad, so a cursor at the inboard edge is
   * clamped by 0.15 rad -- about 100 mm at the hand. At `reachGuard` the floor is -0.61 rad,
   * outside `swingMin` entirely, so a short guard may cross as far as the anatomy allows.
   * 2026-09-04.
   */
  carryMin: -0.24,

  /**
   * The joint stops, radians. **The stop is not the envelope**, and every one of these stands
   * outside the range the mapping can command.
   *
   * Session 02 found a stop that did not admit its own build pose -- `jointMin` at 0.10 against a
   * link built at 0 -- and Havok cleared the violation on step one by throwing the blade tip at
   * 9.95 m/s from a motionless stand. So each of these is stated against the pose the chain is
   * *built* in as well as against the range it is commanded over. The chain is built with the
   * collar at yaw 0, the arm hanging straight down (pitch 0) and the elbow straight (bend 0).
   *
   * - **Yaw**: commanded over `[swingMin, swingMax]` carried into the joint by the outboard sign,
   *   so the stops are mirrored per socket in `reach.ts` and widened by `jointMargin`. Build pose
   *   0 is inside both.
   * - **Pitch**: the *upper arm's* pitch, which is not the target's elevation -- the two-bone
   *   solution puts the upper arm `alpha` above the shoulder-to-hand line, and `alpha` runs from
   *   0.420 rad at `reachMax` to 0.929 rad at `reachMin`. So the commanded pitch spans
   *   `[liftMin + pi/2 - 0.929, liftMax + pi/2 - 0.420]` = [-0.308, 2.201], and the stops stand
   *   0.20 outside that. Build pose 0 is 0.51 inside the bottom stop.
   * - **Elbow**: bend runs 0.916 rad at `reachMax` to 2.137 rad at `reachMin`, and the stop is
   *   2.35. The `-0.05` at the other end is the hyperextension slack that keeps the *build* pose
   *   off its own stop, and it cannot reintroduce a second solution: a bend of -0.05 is a hand
   *   0.780 m out and `reachMax` is 0.70, so that window is not inside the envelope at all.
   * 2026-09-04.
   */
  jointMargin: 0.20,
  pitchJointMin: -0.60,
  pitchJointMax: 2.46,
  elbowJointMin: -0.05,
  elbowJointMax: 2.60,

  /**
   * The anchor's linear force ceiling, newtons. **Swept; the table is below.**
   *
   * `ANCHOR_DRIVE.linearForce` is 1400 N, derived in Session 02 by scaling `CONFIG.arm`'s
   * measured 850 N by rung 1's mass ratio, and its own comment says plainly that it is a starting
   * point rather than a measurement because nothing had ever spent it. This chain is its first
   * reader, and 1400 N is wrong for it: the driven mass here is 28.2 kg of arm plus 1.30 kg of
   * blade against rung 1's 10.7 kg. The same authority per kilogram would be 3860 N.
   *
   * Swept in the Node bench, `--sweep force`, over the scripted reach sequence, at the rate
   * below. "lag" is the peak tip-to-command distance outside the startup window and outside every
   * stroke; "idle stray" is the peak hand-to-anchor distance under the same exclusions, which is
   * the reading `AGENTS.md` says to take first:
   *
   *     force N   peak tip on the guard step   lag mm   wander mm   idle stray mm   stuck
   *      1400              10.63 m/s             71.1     11.323        13.00          0
   *      2400               9.10                 60.2     11.834         6.75          0
   *      3900               8.71                 60.0     11.605         3.73          0
   *      6000               8.71               1704.9     10.151       563.15         43
   *      9000               8.71                 59.9     11.605         3.28          0
   *     14000               8.71                 59.9     11.605         3.29          0
   *
   * **Above 3900 N the ordinary move stops changing at all** -- 8.71 m/s, 59.9 mm and 11.605 mm
   * are the same figures at 9000 and at 14000 -- which says the *rate limit* and not the force is
   * what shapes a commanded move here, and 3900 is the smallest ceiling at which that is true. It
   * is also, to two significant figures, the number the Warrior's 850 N gives carried across at
   * the same authority per kilogram: 130.8 N/kg against 28.2 kg of arm and 1.30 kg of blade is
   * 3860 N. The derivation and the sweep agree, which is the only reason both are quoted.
   *
   * **The 6000 N row is an outlier and it reproduces exactly.** Run four times it gives the same
   * 1704.9 / 563.15 / 43 every time, and 5000 and 7000 N both give 59.9 / 3.2 / 0. Traced, it is
   * one interval during the `chamber` phase -- a fast traverse from the inboard edge with the
   * guard held -- where the limb hangs for about a second and then frees itself. It is not the
   * setting and it has not been chased down; it is recorded because a measurement that surprises
   * you and is left out of the table is a measurement nobody can follow up. 2026-09-04, the Node
   * bench.
   */
  anchorForce: 3900,
  /**
   * The ceiling on how fast the commanded hand point may move, metres per second. **Swept.**
   *
   * The same argument as `CHAIN_PITCH.targetRate` in the units an anchor works in: past the rate
   * at which the command outruns the limb, what moves the limb stops being the command and
   * becomes the motor closing a large error, and the motion stops being shaped by anything a
   * person did. That is the "robot arm" failure in its exact mechanical form.
   *
   * Swept in the Node bench, `--sweep reachRate`, read at the guard step:
   *
   *     rate m/s   peak tip on the step   lag mm   wander mm   idle stray mm
   *        1.0             7.26 m/s        43.9      4.248         2.83
   *        1.2             8.71            60.0     11.605         3.73
   *        1.5            10.90            70.3     15.765         5.73
   *        1.8            13.33            76.4     16.768         9.32
   *        2.2            17.77           102.5     15.030        14.59
   *        3.0            24.73           168.4     26.107        29.47
   *
   * **1.2 m/s at the hand is about 7 m/s at the tip**, and that multiplier is the finding: the
   * blade's point is 1.52 m from the socket and the hand 0.72 m, and the forearm turns about the
   * elbow as well, so an anchor rate carried across to the tip is amplified about sevenfold at the
   * peak. `ANCHOR_DRIVE.linearRate`'s 6 m/s -- derived in Session 02 by carrying rung 1's swept
   * 6 rad/s across at *that* chain's reach -- is therefore five times too fast here, and measured
   * it produced a guard raise that peaked at **34.46 m/s** and took 0.05 s. A stone arm does not
   * raise its guard in a twentieth of a second.
   *
   * 1.2 is taken: the fastest rate whose guard step stays inside the band rung 1's own guard step
   * occupies (8.71 m/s here against 9.10 there), whose lag stays at the order of the Warrior's own
   * anchor readings, and above which the residual wander climbs and does not come back. A full
   * traverse of the envelope takes about 1.2 s at this rate, which is slow -- and slow is what a
   * finite force budget against 29.5 kg of stone is supposed to look like. 2026-09-04, the Node
   * bench.
   */
  anchorRate: 1.2,

  /**
   * Damping on the three links, per `CONFIG.arm`'s pair and rung 1's.
   *
   * 0.7 and 3 unchanged. Copied rather than re-derived for the reason rung 1 gives: there is
   * nothing in a chain of stone capsules on hinges that the Warrior's numbers were not already
   * about. 2026-09-04.
   */
  linearDamping: 0.7,
  angularDamping: 3,

  /**
   * The band the readout calls "arrived", in the first published axis's unit.
   *
   * The first axis here is the **reach, in metres**, so this is 20 mm at the hand -- the same
   * order as rung 1's 0.02 rad, which is 23 mm at that chain's tip, and the same order as every
   * Warrior anchor reading in `docs/measurements.md`. It is published on the envelope rather than
   * read out of `CHAIN_PITCH` by both harnesses, because a constant whose *unit* depends on which
   * option happens to be on the stand is a number waiting to be quoted wrongly. 2026-09-04.
   */
  settledBand: 0.02,

  /**
   * `cover`: what `guard` holds the limb at.
   *
   * A **level and not a stroke**, which is the rule `src/buttons.ts` states for a press and which
   * matters here because the two are wired to the same hand: holding `guard` is a pose, and
   * pressing `thrust` while it is held is the cut. `guardLift` of 0.80 rad is the limb up and
   * forward with the blade high, which is what a guard is, and it is short of `liftMax` so a
   * guard is a pose and not a limit. The swing is left to the cursor, so a guard can be held
   * high-inboard or high-outboard. Chosen by eye, 2026-09-04.
   */
  guardLift: 0.80,

  /**
   * `thrust`: a velocity event along the current aim, with follow-through and return.
   *
   * The anchor's analogue of rung 1's motor-velocity chop, and the same three phases. `drive`
   * sends the commanded hand to `reachMax` with the rate ceiling lifted to `strokeRate`, so the
   * command really does move and the limb is chasing something that is going somewhere. `follow`
   * holds that command with the anchor's **force** dropped to `followForce`, so the limb coasts
   * on its own momentum and decelerates against gravity rather than against the motor. Then the
   * full ceiling comes back and the limb returns to whatever the cursor has been asking for the
   * whole time.
   *
   * **The follow phase is what makes it a stroke rather than a pose**, and the evidence is the
   * same shape as rung 1's: the furthest the hand reaches is past where the drive left it. The
   * drive always ends at 0.6742 m; what varies is how far past that the limb carries.
   *
   *     followSeconds   furthest reach   carried past the drive
   *          0.00           0.6878 m            0.0136 m
   *          0.02           0.7087              0.0345
   *          0.04           0.7209              0.0467
   *          0.06           0.7213              0.0471
   *          0.10           0.7213              0.0471
   *
   * Three and a half times the follow-through at an eighth of the drive's force ceiling, which is
   * the whole claim; it saturates at 0.06 and 0.10 buys nothing. **And it stops at 0.7213 m, which
   * is `reachMax`** -- the envelope's own outer edge -- rather than at the arm's extension.
   *
   * `driveSeconds` is 0.03 for the reason rung 1's is 0.05: a stroke may overshoot into the margin
   * but it must not *arrive* at a stop.
   *
   *     driveSeconds   reach at the drive's end   furthest reach   what happens
   *         0.02                0.6184 m               0.7811 m     arrives at full extension
   *         0.03                0.6742                 0.7213       stops at the envelope's edge
   *         0.04                0.6783                 0.6794       the follow has nothing left
   *         0.05                0.6591                 0.6794       likewise
   *         0.07                0.6604                 0.6794       likewise
   *         0.10                0.6599                 0.6794       likewise
   *
   * The 0.02 row is the failure: 0.7811 m against a full extension of 0.780, which is the arm
   * straight and jammed against the elbow's own stop. Past 0.03 the opposite happens -- the
   * command arrives at `reachThrust` while the drive is still running at full force, so the drive
   * *brakes* the limb and the follow phase inherits nothing to carry. That is a pose sequence with
   * extra steps, and it is what the first draft of this block shipped.
   *
   * `strokeRate` is 5 m/s, read at the thrust mark:
   *
   *     strokeRate   peak tip on the thrust
   *          3             15.92 m/s
   *          5             20.58
   *          8             14.15
   *         12             10.13
   *         16             10.30
   *
   * **The turn at 8 is rung 1's own finding again in different units**: past 5 m/s the command
   * outruns the limb, the drive ends with the limb still being accelerated by a motor closing an
   * error rather than by anything a person did, and the stroke gets *slower*. 5 is the knee, and
   * 20.58 m/s sits between rung 1's chop at 15.07 and the Warrior duelist's own driven peak of
   * mean 16.00 m/s over the standard 120-bout corpus. 2026-09-04, the Node bench.
   */
  thrust: {
    driveSeconds: 0.03,
    followSeconds: 0.06,
    /** The rate ceiling during a stroke, m/s. Lifted, not removed: see `anchorRate`. */
    strokeRate: 5,
    /**
     * The follow-through's force ceiling, newtons.
     *
     * Not zero. Zero is a limb that has been let go of, and the difference between letting go and
     * easing off is the whole of what follow-through means -- rung 1 says the same thing about
     * its own 40 N.m against 320. 500 N against 3900 is about an eighth, which is the same
     * fraction. 2026-09-04.
     */
    followForce: 500,
  },

  /**
   * `cut`: the target swept along an arc inside the envelope, also as a velocity event.
   *
   * Down and inboard, which is the classic diagonal cut, and **mirrored for free** because
   * `swing` is outboard-signed: one set of rates serves both sockets and there is no place for a
   * sign to be got backwards.
   *
   * It is triggered by `thrust` **while `guard` is held**, which is not an extra control surface:
   * `guard` is already a level and `thrust` already an edge, and a chambered guard is where a cut
   * starts from anyway. That also settles what would otherwise be a real problem -- a cut swept
   * from wherever the cursor happens to be has nowhere to go when the cursor is already at the
   * inboard edge -- because `cover` puts the limb high before the cut runs.
   *
   * The clamp applies to a stroke's target exactly as it does to a cursor's: frozen rule 3 has no
   * exception for strokes, so a cut that would carry the hand across the sternum stops at the
   * envelope rather than being refused.
   *
   * The follow-through, measured as the swing and lift the limb carries past where the drive left
   * it. The drive always ends at swing 0.0450 and lift 0.2490:
   *
   *     followSeconds   furthest swing   lowest lift   swing carried past the drive
   *          0.00          -0.0046         0.1982              0.050 rad
   *          0.03          -0.2033         0.0351              0.248
   *          0.07          -0.3261        -0.1029              0.371
   *          0.12          -0.3396        -0.1394              0.385
   *          0.20          -0.3396        -0.1394              0.385
   *
   * Seven times the carry of no follow phase at all, saturating at 0.12; 0.07 is the knee.
   *
   *     driveSeconds   swing at the drive's end   furthest swing   what happens
   *         0.05                0.5912                 0.2301       barely leaves the chamber
   *         0.08                0.2528                -0.2747
   *         0.11                0.0450                -0.3261       0.17 rad inside `swingMin`
   *         0.15               -0.1461                -0.4538       0.05 rad inside it
   *         0.22               -0.4954                -0.6881       arrives at the yaw stop
   *
   * 0.11 is taken, and the 0.22 row is why the table exists: the *achieved* swing is not clamped
   * -- only the command is -- so a long enough drive carries the limb through the envelope and
   * into the joint stop 0.20 rad outside it, which is a motor and a limit pushing at each other.
   *
   * `strokeRate` is 3 m/s, read at the cut mark:
   *
   *     strokeRate   peak tip on the cut   anchor stray during the stroke
   *          3            22.20 m/s                 164.03 mm
   *          5            32.57                     365.54
   *          8            36.59                     348.63
   *         12            28.63                     369.40
   *         16            28.02                     376.36
   *
   * 3 is taken, and the column that decides it is the second rather than the first: above 3 the
   * cut throws the limb a third of a metre from its own anchor and peaks past 30 m/s, which is
   * beyond the Warrior duelist's mean committed cut of 16.00 m/s and most of the way to its
   * recorded maximum of 43.13. 22.20 m/s is a heavy stone limb cutting hard; 36.59 is a limb being
   * flung. 2026-09-04, the Node bench.
   */
  cut: {
    driveSeconds: 0.11,
    followSeconds: 0.07,
    /** How fast the commanded swing travels inboard during the drive, rad/s. */
    swingRate: 9,
    /** And how fast it falls, rad/s. The two together are the diagonal. */
    liftRate: 7,
    /** The rate ceiling during the sweep, m/s, and the follow-through's force, newtons. */
    strokeRate: 3,
    followForce: 500,
  },
};

/**
 * Rung 3, `wrist`: the reach chain plus a roll ring and a bend link, and nothing else.
 *
 * **Ownership is split by axis, not doubled.** The shoulder and elbow stay on the position-only
 * anchor and own where the hand is; the wrist's two motors own which way the terminal faces; and
 * there is no six-axis hand pin anywhere in a golem. The Warrior's wrist was left angularly free
 * *because* its grip motor already owned orientation and the two fought -- 504 mm of
 * hand-to-anchor stray when a roll sign was wrong, because the shoulder cone refused the twist
 * and the solver paid for the orientation out of the position. Here neither drive can pay for the
 * other's job, because neither is connected to the other's axes.
 *
 * Five driven axes against a five-number command (a point, a roll and a bend), so frozen rule 2
 * holds: every reachable target still has exactly one pose.
 */
export const CHAIN_WRIST = {
  /**
   * The roll ring: a short link hinged about the forearm's own long axis.
   *
   * Two hinges in series again rather than one two-axis wrist, for the reason
   * `CHAIN_REACH.collarLength` gives -- but with a second reason of its own that is worth
   * separating out. The shoulder's decomposition has to be exactly yaw-then-pitch because the
   * envelope arithmetic depends on it. The wrist's does not: both its axes are motorised, so what
   * matters is only that the pair is not degenerate anywhere in the working range, and a
   * two-axis 6DoF joint whose decomposition order this directory has not established could be
   * gimbal-locked at a roll the mapping can command. A hinge cannot be.
   *
   * 0.12 m at radius 0.050 is a bronze collar rather than a bone: 0.02 m of cylinder plus a
   * sphere is 0.000681 m3, 1.8 kg at stone's density. Chosen by eye, 2026-09-04.
   */
  ringLength: 0.12,
  ringRadius: 0.050,
  ringMass: 1.8,
  ringHealth: 50,
  ringVitalityWeight: 0.4,

  /**
   * The wrist link: the last bone, which the terminal welds onto.
   *
   * 0.14 m at radius 0.052: 0.036 m of cylinder plus a sphere is 0.000895 m3, 2.3 kg.
   * 2026-09-04.
   */
  wristLength: 0.14,
  wristRadius: 0.052,
  wristMass: 2.3,
  wristHealth: 60,
  wristVitalityWeight: 0.5,

  /**
   * The roll's commanded range, radians, and its stops.
   *
   * `CONFIG.arm.rollMin` and `rollMax` are +-1.40 and this is +-1.30, which is anatomical
   * pronation rather than an endlessly turning propeller -- the same argument, for a joint that
   * is a bearing rather than a forearm. **Mirrored by the socket's outboard sign**, and that is
   * the one mirror in this block: a roll is a rotation about the limb's own long axis, so the
   * mirror image of a roll of `r` is a roll of `-r`. The bend is *not* mirrored, because a bend
   * about the arm-plane's lateral is a motion inside that plane and the mirror of it is itself.
   * `tests/golem-bench.test.mjs` asserts both halves by driving one intent into both sockets and
   * comparing the two tips as mirror images.
   *
   * The stops stand `jointMargin` outside the commanded range, and the build pose is roll 0 and
   * bend 0, both inside. 2026-09-04.
   */
  rollMin: -1.30,
  rollMax: 1.30,
  /**
   * The bend's commanded range, radians.
   *
   * `CONFIG.arm.wristBendMax` is pi/2 and `HandIntent.wristBend` is normalized 0..1 onto it. Kept
   * exactly, so the same key press bends a golem's wrist as far as it bends a Warrior's. The
   * lower limit is 0 rather than negative: a bend is a flexion and the roll is what chooses which
   * way it flexes. 2026-09-04.
   */
  bendMin: 0,
  bendMax: 1.5708,
  jointMargin: 0.20,

  /**
   * How fast the commanded roll and bend may move, radians per second. **Swept.**
   *
   * The same ceiling `CHAIN_PITCH.targetRate` is, in the wrist's own axes: it is what makes a
   * flicked key a turn rather than a snap.
   *
   * Swept in the Node bench, `--sweep wristRate`, over a quarter-second flick of the roll and
   * bend to 1.1 rad and 0.7 of full bend followed by a hold -- **a flick and not a jump**, because
   * a teleported command gives the blade no momentum to carry and turns the reading from "ten
   * direction changes over 0.68 s" into a clean monotonic settle that says nothing:
   *
   *     rate rad/s   tip wander at rest, mm
   *          1               145.783
   *          2               145.783
   *          4               173.694
   *          8               273.239
   *         16               285.758
   *
   * That column is the residual ring the flick leaves behind, and it doubles between 2 and 8. The
   * floor is reached by 2.
   *
   * **2.5 rather than 2, because of a number that lives in a different file.**
   * `CONFIG.controls.wristSlewPerSecond` is 2.4: `src/input.ts` already slews `roll` and
   * `wristBend` at that rate between the Z/X and T/Y keys, so a module ceiling below 2.4 would
   * limit the *person* twice and one above it would never bind for a person at all. 2.5 sits just
   * above the input's own slew, so a person's key press is not double-limited and a policy writing
   * `roll` directly -- which nothing slews for it -- is held to the same ceiling a person is.
   * 2026-09-04, the Node bench.
   */
  rollRate: 2.5,
  bendRate: 2.5,

  /**
   * The wrist motors' torque ceilings, newton-metres. **Swept.**
   *
   * These two are the *only* owners of the terminal's orientation, so they are what a follow-
   * through in the edge is made of: a ceiling that is finite is what lets a blade lag the roll
   * and come back rather than snapping to it.
   *
   * Swept in the Node bench, `--sweep wristTorque` and `--sweep wristBendTorque`. "lag" is the
   * peak tip-to-command distance outside the startup window and outside every stroke:
   *
   *     rollTorque   peak tip m/s   lag mm   wander mm        bendTorque   peak   lag mm   wander
   *         20          33.53        424.8    82.848              20      14.76  1504.6   368.516
   *         60          26.12        378.3    83.200              60      24.53   653.5    71.534
   *        120          31.31        378.3    83.200             120      31.31   378.3    83.200
   *        200          31.31        378.3    83.200             200      34.41   431.7   131.907
   *        320          31.31        378.3    83.200             320      39.02   559.2   192.757
   *
   * **The two columns pick differently and the reason is what each motor is holding.** The roll
   * turns a blade about its own long axis, where its inertia is about a thousandth of what it is
   * across -- so 60 N.m already saturates and nothing above it changes any figure, which makes 60
   * the smallest ceiling at which the readings stop moving and therefore the one to take. The bend
   * holds 3.6 kg of link and blade out against gravity, and it has a genuine minimum: 20 N.m
   * cannot hold it at all (a metre and a half of lag), 320 N.m is stiff enough to ring (192.8 mm
   * of wander against 83.2), and 120 is where the lag bottoms out.
   *
   * Neither is a headroom argument. Raising either past its own row buys nothing this bench can
   * see, and the house rule is that a ceiling raised without a measured table beside it is not
   * raised. 2026-09-04, the Node bench.
   */
  rollTorque: 60,
  bendTorque: 120,

  /**
   * The wrist hinges' solver damping. **Swept.**
   *
   * A position motor is a spring, and a spring with no damper rings. That is the same finding
   * `CONFIG.arm.gripAngularDamping` records for the Warrior's sword, and the wrist reproduced it
   * exactly: built straight with 3.6 kg of link and blade hanging off two motorised hinges, rung
   * 3 rang for **2.1 s** from its own build pose while rungs 0, 1 and 2 all settled inside 0.5 s,
   * and the readout reported 208.79 mm of "tip wander at rest" that was entirely that decay.
   *
   * `stiffness` and `damping` on a `Physics6DoFLimit` reach Havok's `HP_Constraint_SetAxisStiffness`
   * and `SetAxisDamping`, which are the axis's own spring gains -- so this is the damper the motor
   * did not have, applied inside the solver rather than as an impulse from outside it.
   *
   * Swept in the Node bench, `--sweep wristMotorDamping`:
   *
   *     damping   tip wander at rest, mm   lag mm   settled from the build pose in
   *        0              208.787           465.5              2.1 s
   *        1               82.809           378.3              1.75
   *        3               83.200           378.3              1.75
   *        6               83.200           378.3              1.75
   *       12               83.200           378.3              1.75
   *       30               83.200           378.3              1.75
   *
   * **Only whether it is set matters, not what it is set to**, and that is a fact about the
   * plumbing rather than about the wrist: Babylon writes the value through
   * `if (l.damping) { HP_Constraint_SetAxisDamping(...) }`, so 0 is "leave Havok's own default"
   * and every non-zero value here lands on a solver that has already saturated. The honest reading
   * of this table is therefore two rows -- unset and set -- and the halving of the wander between
   * them is the damper doing its job. 6 is the middle of the range over which nothing changes.
   *
   * **What it does not fix is that rung 3 still rings.** Rungs 0, 1 and 2 all settle from their
   * build pose inside 0.5 s and this one takes 1.75 s, and the link damping is not the lever
   * either (194.0 mm at `angularDamping` 3 against 166.1 at 60, a twentyfold sweep for a seventh
   * of the ring). That is a measurement and not a verdict; whether a wrist that rings for the
   * better part of two seconds reads as weight or as a fault is the owner's to say at the gate.
   * 2026-09-04, the Node bench.
   */
  motorDamping: 6,

  /**
   * Damping on the two wrist links.
   *
   * `CHAIN_REACH`'s pair unchanged, for the same reason it copied `CONFIG.arm`'s. 2026-09-04.
   */
  linearDamping: 0.7,
  angularDamping: 3,
};

/**
 * The waist: the joint every torso option hangs on, and the motors that hold it.
 *
 * A subsystem block rather than a copy in each option, because what differs between a plain
 * torso and a plated one is mass, breadth and range -- **not the hardware**. Sharing the torque
 * cap is the point rather than an economy: frozen rule 4 says weight comes from a finite force
 * budget against real mass, so the same motor against 236 kg of plated stone has to lag more
 * than it does against 139 kg of plain, and giving the heavier option a bigger motor would be
 * exactly the "raise the ceiling until the complaint goes away" move the house rule forbids.
 *
 * **Two hinges in series rather than one two-axis waist**, for the reason
 * `CHAIN_REACH.collarLength` gives: a `Physics6DoFConstraint` with two free angular axes
 * decomposes the relative rotation in an order this directory has never established, and the
 * achieved lean and twist are read back from that decomposition. A hinge is one free angular
 * axis with the other two locked, which is the shape rungs 1 to 3 already proved.
 */
export const TORSO_WAIST = {
  /**
   * The waist ball: a stone bearing centred **on** the mount's socket, so both hinge pivots are
   * the same point and the waist is one place rather than two.
   *
   * The same construction as `CHAIN_REACH.collarLength`, for the same reason. A capsule 0.30 m
   * tip to tip at radius 0.14 is a 0.02 m cylinder plus a sphere: 0.001232 + 0.011494 =
   * 0.012726 m3, and stone at 2600 kg/m3 makes that 33 kg. Arithmetic, like every other mass in
   * this file; chosen by eye against the stand, 2026-09-04.
   */
  ballLength: 0.30,
  ballRadius: 0.14,
  ballMass: 33,
  ballHealth: 120,
  ballVitalityWeight: 1,

  /**
   * The joint stops stand this far outside each option's commanded range, radians.
   *
   * `CHAIN_REACH.jointMargin`'s number and argument unchanged: a command that sits against a
   * joint stop is a motor and a limit pushing at each other every step. **Both hinges are built
   * at joint angle exactly zero**, which is inside every option's stops by at least its own
   * `leanMax`/`twistMax` plus this -- the check `CHAIN_PITCH.jointMin` records paying for.
   * 2026-09-04.
   */
  jointMargin: 0.20,

  /**
   * The waist motors' torque ceilings, newton-metres. **Swept, and they are not the same number.**
   *
   * `--sweep leanTorque`, read at the "lean" mark, with `head.ram` on the neck. "lag" is the peak
   * distance from the neck frame to where it is being asked to be, outside the startup window;
   * "wander" is how far that frame moves once it has arrived and held:
   *
   *     N.m    plain: arrival  overshoot   lag mm   wander mm   stuck | plated: arrival  overshoot   lag mm   stuck
   *      600      (never)       0.2061      342.8    (never)     458  |   0.479 s        0.0250      305.5     541
   *      900       1.417 s      0.2025      169.3     19.950       0  |   1.246          0.1042      112.4       0
   *     1500       0.708        0.0348       61.7     21.748       0  |   0.508          0.0132       64.5       0
   *     2200       0.525        0.0024       41.1     24.370       0  |   0.508          0.0003       42.9       0
   *     3200       0.525        0.0007       30.7     26.852       0  |   0.508          0.0003       34.7       0
   *     5000       0.525        0.0007       24.5     22.768       0  |   0.508          0.0003       28.6       0
   *
   * **A trunk is an inverted pendulum and that is what the table is about.** The core's centre of
   * mass is above the lean hinge, so gravity's moment does not restore a lean, it *deepens* one --
   * and the motor is holding the trunk back rather than holding it up. At 600 N.m it cannot: both
   * options accumulate hundreds of stuck steps, which is the instrument's name for an error that
   * is outside the band and not converging.
   *
   * **900 N.m is where it fails in the more interesting way, and it is why the setting is 1500.**
   * The plain trunk's overshoot there is 0.2025 rad against a commanded 0.42 and a stop that
   * stands `jointMargin` = 0.20 outside it -- so the trunk carries past its target and *arrives at
   * its own joint stop*, which is a motor and a limit pushing at each other and is the buzz
   * `arm.ts`'s wrist was rewritten to get rid of. `tests/golem-torso-head.test.mjs` asserts the
   * overshoot stays inside that margin, and it is red at 900.
   *
   * 1500 is taken: the smallest ceiling at which neither option reaches its stop and neither is
   * stuck, with 0.035 rad of real carry-past left on the plain trunk and 0.013 on the plated one.
   * Above it the overshoot goes to nothing -- 2200 is already 0.0024 -- and the residual wander
   * climbs from 21.7 mm to 26.9. That is a stiffer trunk rather than a better one, and the same
   * shape `CHAIN_PITCH.motorTorque` records: overshoot falls as torque rises, which is the
   * opposite of a spring and is what says the *command* rather than the motor shapes the move.
   *
   * **The twist needs less, and the reason is gravity rather than tuning.** The twist axis is the
   * mount's own vertical, so the trunk's weight exerts no moment about it at all and the motor is
   * only accelerating a yaw inertia. `--sweep twistTorque`, read at the "twist" mark:
   *
   *     N.m    plain: arrival  overshoot | plated: arrival  overshoot
   *      300      0.533 s       0.0073   |   0.517 s        0.0064
   *      600      0.533         0.0041   |   0.517          0.0038
   *      900      0.533         0.0037   |   0.517          0.0037
   *     1500      0.533         0.0037   |   0.517          0.0037
   *     2200      0.533         0.0037   |   0.517          0.0037
   *     3200      0.533         0.0037   |   0.517          0.0037
   *
   * Every column is flat from 900 upward on both options, so 900 is the smallest ceiling at which
   * the readings stop moving. Giving it the lean's 1500 would be headroom bought with nothing
   * measured behind it, which is the move the house rule forbids. 2026-09-04, the Node torso
   * bench.
   */
  leanTorque: 1500,
  twistTorque: 900,

  /**
   * How fast the *commanded* lean and twist may move, radians per second.
   *
   * The same ceiling `CHAIN_WRIST.rollRate` is, and set by the same argument about a number that
   * lives in another file: `CONFIG.controls.postureSlewPerSecond` is 1.8 and `src/input.ts`
   * already slews `trunkLean` and `trunkTwist` at that rate between the arrow keys -- in
   * *normalized* units, so against `TORSO_PLAIN.leanMax` of 0.42 rad a person's own fastest lean
   * is 0.756 rad/s and their fastest twist is 0.99 rad/s. These sit just above both, so a
   * person's key press is not double-limited and a policy writing `posture.trunkLean` directly --
   * which nothing slews for it -- is held to the same ceiling a person is.
   *
   * **So the rate limit is not what makes a trunk read as heavy here, and that is a real
   * difference from the effector rungs.** A mouse can cross its window in one frame, so
   * `CHAIN_PITCH.targetRate` binds hard for a person; an arrow key cannot, so this one binds only
   * for a policy. What is left to carry the weight is the torque cap against real mass, which is
   * why that is the number with the sweep beside it. 2026-09-04.
   */
  leanRate: 0.8,
  twistRate: 1.0,

  /**
   * The waist hinges' solver damping.
   *
   * `CHAIN_WRIST.motorDamping`'s finding carried across: a position motor is a spring and a
   * spring with no damper rings, and Babylon writes the value through `if (l.damping)`, so what
   * matters is whether it is set rather than what it is set to. 6 is that block's setting
   * unchanged. 2026-09-04.
   */
  motorDamping: 6,

  /** `CONFIG.arm`'s damping pair, as every golem link uses. 2026-09-04. */
  linearDamping: 0.7,
  angularDamping: 3,

  /**
   * The band the readout calls "arrived", radians.
   *
   * The first published axis of a torso is the **lean**, in radians, so this is 0.02 rad on an
   * angle exactly as `CHAIN_PITCH.settledBand` is. 2026-09-04.
   */
  settledBand: 0.02,
};

/**
 * `torso.plain`: lighter, wider at the waist, and barely armoured.
 *
 * **Mechanical, not cosmetic**, which is the session's frozen choice and the reason there is no
 * third option with a different silhouette: an option that changes nothing physical is a shell.
 * Against `torso.plated` this one is 97 kg lighter, leans half as far again and twists two
 * thirds further, and takes very nearly the whole of any blow that lands on its core.
 *
 * The socket frames are the other half of the difference and they are geometry, not decoration:
 * a broader torso holds its effectors wider and a taller one holds them higher, so the two
 * options really do reach and cover differently.
 */
export const TORSO_PLAIN = {
  /**
   * The core: a carved stone chest, metres.
   *
   * 0.62 x 0.54 x 0.32 against `BENCH_STAND`'s 0.44 x 0.78 x 0.40 slab, which is the
   * Warrior-scale stand-in the effector rungs were benched on. Wider and shallower than that slab
   * and rather shorter, because a golem's chest is a slab of stone across the shoulders rather
   * than a human ribcage. Chosen by eye against the stand, 2026-09-04.
   */
  coreWidth: 0.62,
  coreHeight: 0.54,
  coreDepth: 0.32,
  /**
   * Mass, kilograms.
   *
   * 0.62 x 0.54 x 0.32 is 0.10714 m3, and stone at 2600 kg/m3 would make a **solid** billet of
   * that 279 kg. It is not solid: a golem's trunk is a carved shell around a vitality core, so
   * this is half the box, 0.05357 m3 = 139 kg. The fill fraction is the decision and it is stated
   * rather than hidden in a density -- the same distinction `TERMINAL_BLADE.mass` draws when it
   * refuses to derive a sword's mass from its collider's volume. 2026-09-04.
   */
  coreMass: 139,
  coreHealth: 260,
  coreVitalityWeight: 3,
  /**
   * Armour on the core: the fraction of a scored blow the stone absorbs.
   *
   * Spent through `armouredDamage` in `src/scoring.ts` and applied at `Combatant.applyDamage`,
   * which is the existing seam by which a body turns raw scoring damage into applied damage --
   * so a plated torso is not a special case anywhere in the damage model, it is a different
   * number handed to the same rule.
   *
   * 0.10 is "carved stone and nothing else": a plain torso is thick, and thick is not armour.
   * The whole of the mechanical difference is the gap to `TORSO_PLATED.coreArmour`, and it is
   * measured rather than asserted -- `tests/golem-torso-head.test.mjs` drives one hammer at one
   * speed into both cores through the real `Combat` and compares what each one lost.
   * 2026-09-04.
   */
  coreArmour: 0.10,

  /**
   * Where the two effector sockets sit, in the core's own frame, metres.
   *
   * `socketSide` is 0.34, which is `BENCH_STAND.socketSide` exactly -- so an effector bolted to a
   * plain torso hangs where every rung-0 to rung-3 measurement in this file was taken, and none
   * of them has to be re-taken to be compared with a real body. `socketHeight` is 0.19 of a 0.27
   * half-height, so the shoulders are near the top of the chest and not on top of it.
   * 2026-09-04.
   */
  socketSide: 0.34,
  socketHeight: 0.19,
  socketFront: 0.0,
  /** Where the neck socket sits above the core's centre: the top face. 2026-09-04. */
  neckHeight: 0.27,

  /**
   * The commanded waist range, radians at `|trunkLean| = 1` and `|trunkTwist| = 1`.
   *
   * 0.42 rad is 24 degrees of lean and 0.55 is 32 degrees of twist. Wider than `TORSO_PLATED`'s
   * on both axes, which is this option's half of the trade: it is the lighter, looser trunk and
   * the one that can turn to follow a cut. Chosen by eye against the stand -- an anatomy decision
   * rather than a feel one, and the frozen rule is that a command lives inside the envelope so
   * the mapping simply spans it. 2026-09-04.
   */
  leanMax: 0.42,
  twistMax: 0.55,
};

/**
 * `torso.plated`: heavier, narrower at the waist, and armoured on the core.
 *
 * Every difference from `TORSO_PLAIN` is physical. It is 70 % heavier, so the shared waist motor
 * has to work harder for less; it leans two thirds as far and twists three fifths as far; and it
 * takes a third of any blow off its own core. It is also broader and taller, so its effectors are
 * held 40 mm wider and 20 mm higher, which is more reach and more cover paid for in mass.
 */
export const TORSO_PLATED = {
  /**
   * The core, metres: the plain chest with slabs on it.
   *
   * 0.70 x 0.60 x 0.36 against the plain torso's 0.62 x 0.54 x 0.32 -- 40 mm wider, 60 mm taller
   * and 40 mm deeper, which is a plate's thickness on every face. Chosen by eye against the
   * stand, 2026-09-04.
   */
  coreWidth: 0.70,
  coreHeight: 0.60,
  coreDepth: 0.36,
  /**
   * Mass, kilograms.
   *
   * 0.70 x 0.60 x 0.36 is 0.1512 m3, which solid would be 393 kg. The fill fraction is 0.60
   * against the plain torso's 0.50 -- the same hollow core with thicker walls and armour slabs
   * over them -- so 0.09072 m3 = 236 kg. 2026-09-04.
   */
  coreMass: 236,
  coreHealth: 320,
  coreVitalityWeight: 3,
  /**
   * Armour on the core.
   *
   * 0.34 against the plain torso's 0.10, so the same scored blow costs this core about three
   * quarters of what it costs a plain one -- 0.66/0.90 = 0.733. That ratio is the assertion
   * `tests/golem-torso-head.test.mjs` makes physically, and the number was chosen to be large
   * enough to feel and small enough that a plated torso is still killed by being hit.
   * 2026-09-04.
   */
  coreArmour: 0.34,

  /** Wider and higher than the plain torso's, because the chest is. 2026-09-04. */
  socketSide: 0.38,
  socketHeight: 0.21,
  socketFront: 0.0,
  /** The top face of a taller core. 2026-09-04. */
  neckHeight: 0.30,

  /**
   * The commanded waist range, radians.
   *
   * 0.28 rad is 16 degrees of lean and 0.34 is 19 degrees of twist, against the plain torso's 24
   * and 32. Armour does not bend, and this is that stated as the option's cost rather than as a
   * comment on a mesh. 2026-09-04.
   */
  leanMax: 0.28,
  twistMax: 0.34,
};

/**
 * The neck: what both head options are carried on, and the motors that hold a head up.
 *
 * A subsystem block for the reason `TORSO_WAIST` is one: the two head options differ by what is
 * bolted to the front of the head and by whether the head can attack at all, **not** by the
 * hardware holding it. Sharing the neck is what makes the ram's extra mass show up as a heavier
 * head on the same motor rather than as a differently-tuned one.
 *
 * **Two hinges in series, and only one of them is commanded.** The pitch is the one a person
 * moves: rest, `guard`, and the ram's lunge are all pitch. The yaw is held at zero on a soft
 * ceiling and nothing ever asks it for anything, which is deliberate -- a head on a single hinge
 * can only bob in the sagittal plane, and what the gate asks about is whether the head bobs and
 * recoils rather than sitting rigid. A blow from the side has to be able to turn it.
 */
export const HEAD_NECK = {
  /**
   * The neck, metres: a short stone column between the torso's neck socket and the head.
   *
   * A capsule 0.20 m tip to tip at radius 0.075 is a 0.05 m cylinder plus a sphere:
   * 0.000884 + 0.001767 = 0.002651 m3, 6.9 kg at stone's 2600 kg/m3. Chosen by eye against the
   * stand, 2026-09-04.
   */
  neckLength: 0.20,
  neckRadius: 0.075,
  neckMass: 6.9,
  neckHealth: 80,
  neckVitalityWeight: 0.8,

  /**
   * The head block, metres and kilograms. **Shared by both options, which is the point.**
   *
   * 0.34 x 0.32 x 0.36 is 0.039168 m3; at a fill of 0.80 -- a carved block is very nearly solid,
   * unlike a torso -- that is 0.031334 m3 and 81 kg. `HEAD_RAM` adds a plate to the front of this
   * and changes nothing else about it, so the difference the bench measures between the two
   * options is the plate and not a second set of numbers. 2026-09-04.
   */
  headWidth: 0.34,
  headHeight: 0.32,
  headDepth: 0.36,
  headMass: 81,
  headHealth: 140,
  headVitalityWeight: 2,

  /**
   * Armour on the head, as a fraction absorbed. See `TORSO_PLAIN.coreArmour` for the rule.
   *
   * 0.05: a carved block is thick and thick is not armour, and the head is the **fatal** part, so
   * making it hard to kill would be making the golem hard to kill. Shared, because the ram's
   * plate is a weapon rather than a helmet -- giving the ram a tougher head as well would be two
   * changes wearing one name. 2026-09-04.
   */
  headArmour: 0.05,
  /**
   * Where the brow is, metres along the head's own +Z from its centre.
   *
   * The head's business end, which is what the bench readout takes its tip position, tip speed
   * and bob from -- and the point the ram's plate is welded to, so the two options are measured
   * at the same place. Half the block's depth. 2026-09-04.
   */
  browOffset: 0.18,

  /**
   * The commanded pitch range, radians, measured as a nod: 0 is head up and level, positive is
   * chin down and crown forward.
   *
   * `restPitch` is 0. The commanded floor of -0.30 is a little of the head tipped back; the
   * ceiling of 0.75 is the deepest duck either option asks for, and it is short of where a stroke
   * may carry the head. **What `guard` holds is not here**: it is the one pose the two options
   * decide for themselves, because a head with a plate on it presents the plate and a head
   * without one ducks behind its own crown. 2026-09-04.
   */
  pitchMin: -0.30,
  pitchMax: 0.75,
  restPitch: 0,
  /**
   * The pitch hinge's hard stops, radians, which are wider than the commanded range.
   *
   * The stop is not the envelope, and **the stop has to admit the build pose**: the head is built
   * at pitch exactly 0, which is 0.50 inside the bottom stop. `CHAIN_PITCH.jointMin` records what
   * getting that wrong costs -- a chain constructed 0.10 rad outside its own limit threw a blade
   * tip at 9.95 m/s on a stand that was doing nothing. 2026-09-04.
   */
  pitchJointMin: -0.50,
  pitchJointMax: 1.55,

  /**
   * The yaw hinge's stops, radians, either side of the build pose.
   *
   * Nothing commands the yaw; it is held at zero and these are how far a blow may turn the head
   * before the stop takes it. 0.60 rad is 34 degrees each way -- enough to read as a head being
   * knocked round and short of a head on backwards. 2026-09-04.
   */
  yawJointMin: -0.60,
  yawJointMax: 0.60,

  /**
   * How fast the commanded pitch may move, radians per second. **Swept on both options, and they
   * disagree.**
   *
   * The same ceiling `CHAIN_PITCH.targetRate` is: past the rate at which the command outruns the
   * limb, what moves the limb is no longer the command, it is the motor closing a large error --
   * and the motion stops being shaped by anything a person did. `--sweep pitchRate`, on the stand
   * with no trunk under it so the guard step is a step the instrument can see, read at the "guard"
   * mark:
   *
   *     rad/s   plain: arrival  overshoot   lag mm | ram: arrival  overshoot   lag mm
   *      0.8      0.850 s        0.0009      28.9  |  0.475 s      0.0012      432.0
   *      1.4      0.483          0.0034      28.9  |  0.271        0.0046      430.8
   *      2.2      0.308          0.0103      28.9  |  0.450        0.1738      402.4
   *      3.5      0.300          0.0801      42.9  |  0.771        0.5658      434.7
   *      6.0      0.504          0.2891      99.0  |  0.567        0.3246      436.6
   *
   * **The two options put the knee in different places, and the heavier one sets the ceiling.**
   * On the plain head the command still leads the limb at 3.5 -- arrival is still improving -- and
   * abandons it at 6, where arrival gets *worse* while the overshoot triples. On the ram, which
   * carries 21 kg further out, that turn happens one row earlier: at 3.5 the arrival goes from
   * 0.450 s to 0.771 and the overshoot from 0.17 rad to 0.57.
   *
   * 2.2 is taken: the fastest rate at which the ram's command still leads its own head, and the
   * first at which a commanded nod carries visibly past its target and comes back -- 0.174 rad on
   * the ram, which is what the gate's "does the head bob and recoil rather than sit rigid" is
   * about. It costs the plain head 0.037 s of arrival against 1.4 and buys the ram everything.
   * The ram's lag column is a lunge and not a nod: `peakTipErrorMm` excludes the startup window
   * and the half-second after a stroke, and this stroke's return takes longer than that.
   * 2026-09-04, the Node torso bench.
   */
  pitchRate: 2.2,

  /**
   * The neck motors' torque ceilings, newton-metres. **Swept, and the pitch has a ceiling above
   * which the ram stops being a ram.**
   *
   * `--sweep pitchTorque`, on the stand, read at the "guard" mark. "carried" is how far the lunge
   * goes past where its drive left it, which is the whole difference between a velocity event and
   * a pose sequence:
   *
   *     N.m    plain: arrival  overshoot   stuck | ram: arrival  overshoot   deepest   carried
   *       80      (never)       0.8744       507 |  (never)      1.1974      1.6004    0.0008
   *      160       0.579 s      0.1377         0 |  (never)      1.1652      1.6303    0.0000
   *      260       0.308        0.0103         0 |  0.450 s      0.1738      1.3589    0.9088
   *      420       0.308        0.0042         0 |  0.258        0.0278      0.8845    0.4397
   *      700       0.308        0.0042         0 |  0.171        0.0000      0.5902    0.1453
   *     1200       0.308        0.0042         0 |  0.171        0.0000      0.4479    0.0030
   *
   * **The bottom two rows are a head that cannot hold itself up** -- an overshoot above 1.1 rad
   * against a 0.55 guard is a head that has flopped to its stop, and the plain option racks up 507
   * stuck steps doing it. What is more interesting is the top: **a stronger neck motor makes the
   * lunge worse and then abolishes it.** The follow-through is the head coasting on its own
   * momentum until the position motor takes it back, so raising that motor's ceiling is raising
   * the brake: the carry falls from 0.909 rad at 260 to 0.440 at 420 and to 0.003 at 1200, where
   * the stroke is a pose sequence with the pose arriving instantly.
   *
   * 260 is taken: the lowest ceiling at which both options hold their guard, and the highest at
   * which the ram still has a stroke. It is a narrow window and that is worth saying rather than
   * hiding -- there is no headroom here in either direction.
   *
   * **The yaw is a different question entirely: nothing commands it, so what is being set is how
   * far a blow may turn the head.** `--sweep yawTorque`, read at the "shove" mark, where the bench
   * delivers `BENCH_SHOVE`'s 84 N.s across the head as an impulse:
   *
   *     N.m    yaw the shove produced   tip bob mm   decayed to a tenth in
   *       15          0.0690 rad           20.5            0.483 s
   *       30          0.0825               23.3            0.508
   *       60          0.0817               29.1            0.625
   *       90          0.0655               32.2            0.596
   *      200          0.0278               32.8            0.708
   *      900          0.0245               32.5            0.704
   *
   * The excursion collapses between 60 and 200 -- 0.082 rad is a head knocked 4.7 degrees off
   * square and 0.024 is a head that barely notices -- and above 200 nothing moves at all. 60 is
   * taken as the highest ceiling at which a shove still visibly turns the head, and the motor
   * still walks it back inside two thirds of a second. **Whether that reads as a head or as a
   * loose bolt is the owner's to say at the gate**; what the table establishes is only where the
   * compliance is and is not. 2026-09-04, the Node torso bench.
   */
  pitchTorque: 260,
  yawTorque: 60,

  /** `CHAIN_WRIST.motorDamping`'s setting and argument, unchanged. 2026-09-04. */
  motorDamping: 6,
  /** `CONFIG.arm`'s damping pair. 2026-09-04. */
  linearDamping: 0.7,
  angularDamping: 3,
  /** The first published axis of a head is the pitch, in radians. 2026-09-04. */
  settledBand: 0.02,
};

/**
 * `head.plain`: a fatal carved block on a neck, and no attack at all.
 *
 * It is the control condition for the ram in the strictest sense: the same neck, the same head
 * block, the same `guard`, and no `Striking` anywhere. `Intent.natural.thrust` reaches it and it
 * does nothing with it, exactly as a hand slot is inert on a body with no hands.
 */
export const HEAD_PLAIN = {
  /**
   * What `guard` holds, radians of nod. **One number, and it is the whole of this option.**
   *
   * A block with a single field looks like an oversight and is not: `HEAD_NECK` deliberately
   * holds everything the two options share -- the neck, the head block, its mass, its armour and
   * its brow -- so that the difference the bench measures between plain and ram is the plate and
   * the lunge, and not a second set of numbers that could drift. What is genuinely this option's
   * own is how far it ducks.
   *
   * 0.70 rad is 40 degrees: a deep duck that puts the crown between the enemy and the face, which
   * is what a head with nothing on it does. `HEAD_RAM.guardPitch` is much shallower, because a
   * plate presented at 40 degrees is pointing at the floor. It is a **level** rather than a
   * stroke -- the rule `src/buttons.ts` states -- and it is short of `HEAD_NECK.pitchMax`, so a
   * guard is a pose and not a limit. Chosen by eye against the stand, 2026-09-04.
   */
  guardPitch: 0.70,
};

/**
 * `head.ram`: the plain head with a bronze plate on its brow and one attack.
 *
 * **The risk is the design.** The head is the fatal part, and the ram's whole attack is a
 * velocity event that puts the fatal part into the contact -- a golem built this way gambles the
 * thing that ends it in order to land a blow, and that is deliberate rather than a side effect
 * somebody failed to notice.
 *
 * The centipede is the precedent and the shape is copied rather than reinvented: a striker with
 * `hand` null and a stable `effectorId`, driven from `Intent.natural`, on a body that publishes
 * no hand for it. What is different is that a centipede's bite is its whole locomotion and a
 * ram's lunge is one joint's velocity event.
 */
export const HEAD_RAM = {
  /**
   * The ram plate, metres: a bronze wedge across the brow.
   *
   * 0.30 wide, 0.14 out from the brow, 0.16 tall. It is a separate rigid body welded once to the
   * head, for the reason `TERMINAL_BLADE` is: scoring, severing and Session 10's loot all want a
   * striker to be an identifiable body, and the construct experiment recorded that compound child
   * shapes cannot be told apart by engine handle. Chosen by eye, 2026-09-04.
   */
  plateWidth: 0.30,
  plateLength: 0.14,
  plateThickness: 0.16,
  /**
   * Mass, kilograms.
   *
   * 0.30 x 0.14 x 0.16 is 0.00672 m3 of bronze at 8800 kg/m3, which would be 59 kg for a solid
   * billet. A ram plate is a shell over the stone brow rather than a block of bronze: at a fill
   * of 0.35 that is 0.002352 m3 and 21 kg. 2026-09-04.
   */
  plateMass: 21,
  plateHealth: 90,
  plateVitalityWeight: 0.6,
  /**
   * Where the plate's own leading edge is, metres along its own +Y from the weld.
   *
   * The whole length: the plate is welded at the brow and its point is the far face. Stated as
   * its own number for the reason `TERMINAL_BLADE.tipOffset` is -- `Striking.tipPosition` is what
   * the readout takes lunge tip speed from, and a tip offset that quietly disagreed with the
   * geometry would move every speed reading here. 2026-09-04.
   */
  plateTipOffset: 0.14,

  /**
   * What `guard` holds, radians of nod, against `HEAD_PLAIN.guardPitch`'s 0.70.
   *
   * 0.40 rad is 23 degrees: the plate levelled at whatever is in front, which is a ram's guard
   * and is also the chamber its lunge starts from. A plain head ducks nearly twice as far because
   * it has nothing to present and everything to hide. The same level-not-a-stroke rule applies to
   * both. Chosen by eye against the stand, 2026-09-04.
   */
  guardPitch: 0.40,

  /**
   * The lunge: a velocity event through the neck, not a pose sequence.
   *
   * The same three phases and the same argument as `CHAIN_PITCH.chop`. `drive` runs the pitch
   * motor in VELOCITY mode forward at `driveRate` for `driveSeconds`; `follow` keeps the velocity
   * target with the torque dropped to `followTorque`, so 102 kg of head and plate coasts on its
   * own momentum; then the position motor takes over again at full torque and brings the head
   * back to whatever the buttons are asking for.
   *
   * **The waist half of the lunge is the person's, and that is not a shortfall.** The session
   * plan describes a lunge "through the neck and waist", and a head module cannot command a waist
   * it does not own -- one seam, and `Intent` is not widened for this. What a person actually has
   * is both at once: the arrow keys lean the trunk and the left button fires the neck, and a
   * lunge with the trunk already leaning is longer than one without. Session 09's mind writes the
   * same two channels.
   *
   * **Every setting is bounded by the same thing: the stroke must not *arrive* at the neck's own
   * stop.** A limb slamming into its own limit is a motor and a limit pushing at each other, and
   * `HEAD_NECK.pitchJointMax` is 1.55 rad -- the nod at which a head is pointing straight down.
   * Read on the plain trunk; "deepest" is the deepest pitch the stroke reaches and "carried" is
   * how far past where the drive left it:
   *
   *     driveRate   peak tip   deepest   carried   clears the 1.55 stop by
   *         4        1.52 m/s   0.3927    0.1890         1.157 rad
   *         6        2.22       0.8428    0.5391         0.707
   *         9        3.36       1.4540    1.0077         0.096
   *        13        4.31       1.5630    1.0184        -0.013   arrives at the stop
   *        18        4.34       1.5646    1.0147        -0.015   arrives at the stop
   *        26        4.36       1.5669    1.0124        -0.017   arrives at the stop
   *
   *     driveSeconds   peak tip   deepest   carried   what happens
   *         0.03        2.56 m/s   0.7825    0.5237   barely leaves the chamber
   *         0.05        3.36       1.4540    1.0077   stops 0.096 rad short of the stop
   *         0.07        3.76       1.5622    0.9650   arrives at the stop
   *         0.09        3.80       1.5658    0.7760   arrives at the stop
   *         0.14        3.80       1.5978    0.3621   the drive alone reaches it; no follow left
   *
   *     followSeconds   deepest   carried past the drive
   *         0.00        1.3025           0.8562
   *         0.01        1.3795           0.9332
   *         0.02        1.4540           1.0077
   *         0.04        1.5575           1.1112   arrives at the stop
   *         0.08        1.5687           1.1224   arrives at the stop
   *
   *     driveTorque   peak tip   deepest   carried
   *         260        1.56 m/s   0.3958    0.2046
   *         500        2.57       1.0099    0.6754
   *         900        3.36       1.4540    1.0077
   *        1600        3.38       1.4609    1.0117
   *        2800        3.38       1.4609    1.0117
   *
   *     followTorque   deepest   carried
   *          0         1.4015    0.9552
   *         15         1.4119    0.9656
   *         35         1.4253    0.9790
   *         80         1.4540    1.0077
   *        200         1.5208    1.0745   0.03 rad from the stop
   *
   * `driveRate` 9, `driveSeconds` 0.05 and `followSeconds` 0.02 are each the largest value in
   * their column whose stroke still clears the stop, and together they give **3.36 m/s at the
   * plate's point** with 1.008 rad of the stroke's 1.454 bought by momentum rather than by the
   * drive. `driveTorque` 900 is where the peak stops moving -- 1600 and 2800 return 3.38 -- so it
   * is the smallest ceiling at which the reading has saturated, which is the same rule
   * `CHAIN_WRIST.rollTorque` was set by. `followTorque` 80 is about a ninth of the drive, the same
   * fraction `CHAIN_PITCH.chop.followTorque` takes, and it is the largest that still leaves a
   * tenth of a radian between the stroke and the stop.
   *
   * **`driveTorque` is not `HEAD_NECK.pitchTorque` and that is the one asymmetry here.** The neck
   * holds a head up at 260 N.m because anything stiffer arrests the follow-through; a lunge is the
   * whole body committing and drives at 900. The two numbers are doing opposite jobs on the same
   * hinge, which is why they are two numbers.
   *
   * **What this is worth as a blow is small, and the reason is in the damage model rather than
   * here.** The plate arrives at the *contact* at 1.3 to 1.8 m/s -- slower than the tip, and read
   * after the solver has resolved the contact -- which on the club's own ramp is nothing at all.
   * `CONFIG.combat.ramMinSpeed` and `ramReferenceSpeed` are that ramp re-derived for a head on a
   * hinge, and they carry the arithmetic. 2026-09-04, the Node torso bench.
   */
  lunge: {
    driveRate: 9,
    driveSeconds: 0.05,
    followSeconds: 0.02,
    /**
     * The drive's own torque ceiling, newton-metres, **which is deliberately not
     * `HEAD_NECK.pitchTorque`.** The table is in the block comment above; the short of it is that
     * the neck holds a head up at 260 because anything stiffer arrests the follow-through, and a
     * lunge is the whole body committing. 2026-09-04.
     */
    driveTorque: 900,
    followTorque: 80,
  },
};
