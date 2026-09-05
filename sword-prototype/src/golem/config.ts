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
 * The plate terminal: a slab of stone on the end of an arm, which blocks by being in the way.
 *
 * **It is a buckler's hold and not a heater shield's, and that is the one real decision in this
 * block.** `docs/design.md` records both, and they are different mounts rather than different
 * sizes: a strapped shield's face is square *across* the forearm and needs a hand frame, a
 * radial seed and a reach ceiling to keep the board off its owner's own chest, while a buckler
 * "faces wherever the arm points, which is always directly away from its owner, and that is the
 * whole of the rule the owner asked for". A golem has no hand to strap anything to, and the
 * session plan asks for exactly the second rule: the plate points away from its owner's centre
 * along the sphere of the chain's reach, as squarely as the chain allows. So the plate's own +Y
 * is its face normal -- `Weapon`'s shield convention, unchanged -- and it welds through the
 * chain's ordinary `LIMB_MOUNT`, which puts that normal out along the limb.
 *
 * What `roll` then means on a wrist chain is the pair rather than the roll alone: rolling about
 * the limb's own axis spins a square board about its own normal and shows nothing, and the
 * *bend* is what tips the normal off the limb -- so the roll chooses the direction the face
 * tips and the bend chooses how far. On rungs 1 and 2 the facing is a function of the pose and
 * there is no command that changes it, which is the same honest limitation rung 2 already has
 * about a blade's edge.
 */
export const TERMINAL_PLATE = {
  /**
   * The board, metres: across, through, and along.
   *
   * **Smaller than a Warrior's heater shield, and the size is measured rather than chosen.**
   * `CONFIG.shield` is 0.44 x 0.60 x 0.014 for a board strapped across a forearm; the first draft
   * of this block kept those proportions and the bench refused them. The clearance table beside
   * `limits` below is the whole account: a 0.42 x 0.54 board on a wrist chain reaches 127 mm
   * *inside* the bench stand, and the only narrowing that saves it is pinning the roll -- which
   * is the one command a plate has.
   *
   * 0.32 x 0.42 is what clears on all three chains with the roll left free. The thickness is
   * nearly six times the steel one and is not a scaling: a stone board 14 mm thick is a flagstone
   * edge-on, and the shell that dresses it has a chamfer and a rim to carve. 2026-09-04.
   *
   * `width` is local **Z** -- the arm plane's lateral, which is the axis the board is carried
   * outboard along -- `thickness` is local **Y**, the face normal, and `height` is local **X**,
   * the chain's own swing-plane tangent. That is `Weapon`'s shield frame for the normal, so
   * `RigidStrike` reads a plate's "tip" as the centre of its outer face with no second convention
   * anywhere; the other two are named for what they *are* on a limb rather than for a picture.
   */
  width: 0.32,
  height: 0.42,
  thickness: 0.080,
  /**
   * How far the board's near face stands off the weld, metres.
   *
   * `CONFIG.shield.standOff` is 0.055 and carries the account of why it was halved from 0.11:
   * 110 mm is a plate held clear of the arm on a bar, which is a buckler's hold. A golem plate
   * *is* held out on the end of the limb, so this number is here for the opposite reason -- it is
   * the gap between the wrist bearing and the back of the board, and 80 mm is what keeps that
   * bearing's own shell from being drawn inside the slab. Swept for clearance as well and it is
   * the wrong lever there: pushing the board further out along the limb makes a *bent* wrist
   * worse rather than better, because it lengthens the arm the bend swings the board through --
   * measured, 0.18 m of stand-off took the wrist chain from 127 mm inside the stand to 200 mm.
   * 2026-09-04.
   */
  standOff: 0.080,
  /**
   * How far the board is carried outboard of the limb's own axis, metres, to the board's centre.
   *
   * 0.16 is exactly `width / 2`, which puts the board's **inboard edge on the limb's axis**. That
   * is the largest offset that still reads as a board on the end of an arm rather than a plate
   * floating beside one -- which is the gate's own question about this terminal, so it bounds the
   * number from above as firmly as clearance bounds it from below.
   *
   * **And on a wrist chain it is not a guard at all**, which is worth stating because the first
   * draft treated it as one: the offset runs along the *link's* lateral, and the roll turns that
   * lateral about the limb, so a rolled wrist carries the board wherever the roll points and the
   * word "outboard" stops meaning anything. It is a real guard on rungs 1 and 2, which have no
   * roll, and on rung 3 what does the work is the board's size and the bend cap. 2026-09-04.
   */
  outboardOffset: 0.16,
  /**
   * Mass, kilograms.
   *
   * Arithmetic, like every other mass in this file: 0.32 x 0.42 x 0.080 is 0.010752 m3 and stone
   * at 2600 kg/m3 makes that 28.0 kg, less about a third for the chamfer the shell draws, which
   * is 19. It is deliberately **not** brought down to something an arm would find easy: a golem's
   * shield is a slab, weight comes from a finite force budget against real mass (frozen rule 4),
   * and what a 19 kg board does to a chain tuned against a 1.30 kg blade is a measurement for the
   * bench rather than a number to pre-empt. The static load it adds at the hand is 186 N against
   * an anchor ceiling of 3900, so it is held; what it costs is acceleration, which is the point.
   * 2026-09-04.
   */
  mass: 19.0,
  /**
   * Health and vitality weight.
   *
   * Above the blade's 60 and below the upper arm's 120: a plate is the piece you want to lose
   * before an arm and after a sword. Placeholders until Session 08 scores a golem, declared
   * because the contract requires them. 2026-09-04.
   */
  health: 140,
  vitalityWeight: 0.8,
  /** `CHAIN_REACH`'s pair, unchanged: a slab of stone is not a loose pendulum. 2026-09-04. */
  linearDamping: 0.7,
  angularDamping: 3,
  /**
   * The shell: how far the chamfered face is inset from the board's own edge, metres, and how
   * proud the rim stands as a fraction of the board's thickness.
   *
   * Cosmetic and carrying no authority whatsoever -- the collider is the slab above and nothing
   * in `plateShell` creates a body. Chosen by eye against the stand, 2026-09-04.
   */
  chamferInset: 0.060,
  rimProud: 0.55,
  /**
   * What the board takes away from whatever chain carries it: the wrist's flexion, and nothing
   * else.
   *
   * **This is frozen rule 5 paid for in the currency the rule names.** There is no
   * self-collision pair for a plate -- the held shield needed one because a redundant seven-axis
   * arm could be commanded into its owner's chest, and a low-axis chain with a published envelope
   * cannot -- so if the bench shows a board through its own torso on a legal command, the
   * envelope is wrong and the chain is where it is fixed. Nothing in the solver will ever report
   * it, because the layers forbid the pair; the only way to know is to measure the geometry.
   *
   * Measured in the Node bench, 2026-09-04, by sampling the board's own collider corners from
   * `mesh.position` and `mesh.rotationQuaternion` against the stand's box, over a driven sweep of
   * 32 envelope corners crossed with three rolls and three flexions. Positive is clearance;
   * negative is a board inside the block. The offset is `width / 2` throughout:
   *
   *     board                   bendMax   pitch   reach   wrist
   *     0.42 x 0.54 x 0.05      free       120      76    -127
   *     0.42 x 0.54 x 0.05      0.8        ---     ---     -77
   *     0.34 x 0.44 x 0.08      0.8        103      98      -6
   *     0.32 x 0.42 x 0.08      0.8        106     104       9
   *     0.32 x 0.42 x 0.08      0.7        106     104      28
   *     0.32 x 0.42 x 0.08      0.6        106     104      58
   *     0.30 x 0.38 x 0.08      0.6        109     112      84
   *
   * **Two findings came out of that sweep and neither was expected.** The first is that the
   * *roll* is what breaks it: at 0.42 x 0.54 the only narrowing that clears the wrist chain is
   * `rollMax` 0, because the outboard offset runs along the link's lateral and a roll turns that
   * lateral about the limb -- so a rolled wrist carries the board back over the golem whatever
   * the offset says. Pinning the roll was refused outright: the roll and the bend together are
   * the only command a plate has, and a plate that cannot be turned is a plate on a rung-2 chain
   * with two extra bodies in it. The board was made smaller instead.
   *
   * The second is that `swingMin` stops mattering at this size -- the reach and pitch columns are
   * 104 and 106 mm at every value from the chain's own -0.50 through -0.20 -- so the first
   * draft's cross-body narrowing is gone. A plate keeps the chain's whole swing, reach and
   * elevation, and gives up 0.97 rad of the wrist's 1.57 rad of flexion.
   *
   * 0.6 is taken: 58 mm of clearance on the chain that binds, against 9 mm at 0.8 and a board
   * inside the block at 1.0. It is still 34 degrees of tilt on top of a free roll, which is a
   * face that can be pointed. `tests/golem-bench.test.mjs` re-takes the whole sweep and fails on
   * the sign. 2026-09-04.
   */
  limits: {
    reachMin: null,
    reachMax: null,
    swingMin: null,
    swingMax: null,
    liftMin: null,
    liftMax: null,
    carryMin: null,
    rollMax: null,
    bendMax: 0.6,
  },
};

/**
 * The mace terminal: one rigid bar, two grips, and the only terminal that claims both sockets.
 *
 * **The measured lesson it is built on is the Warrior club's and it is not negotiable.** Two
 * position motors on one rigid body do not add up, they fight: swept, the trailing grip made
 * every column worse at every setting -- mean commanded-to-actual hand error 34.45 mm with no
 * trailing motor against 90.30 mm at half of one, with the *reversal* rate falling as it got
 * worse, which is what says it is a steady tug-of-war rather than chatter
 * (`CONFIG.club.trailingGrip`). So the primary socket's chain carries the anchor and the
 * secondary socket's chain is unmotorised and held to the bar by a plain ball joint.
 *
 * ## What it costs the chain, which is the whole yaw, and is arithmetic rather than a feel
 *
 * Both chains are built in the same pose, mirrored by their sockets' own `outboard`, so the two
 * weld points are exactly the socket separation apart -- `BENCH_STAND.socketSide` x 2 =
 * **0.68 m** -- and the bar's grip separation `D` is therefore *measured at build* rather than
 * configured. There is no other value it could take: a grip that did not coincide with its weld
 * at construction would be a constraint born violated, which is the violation the solver clears
 * by flinging the thing.
 *
 * That makes the pair a closed loop with exactly three degrees of freedom, the driven arm's.
 * Write the driven weld at azimuth `az`, elevation `l` and reach `r` from its own socket; the
 * bar's own axis is fixed in the driven link's frame, invariant under the shoulder's pitch
 * because that pitch is about the link's own X, and carried round by the yaw. The trailing
 * grip's distance from the trailing socket then comes out as
 *
 *     |v|^2 = r^2 + 2 A r cos(l) sin(az) + 2 A^2 (1 - cos az),   A = 0.68
 *
 * and the two terms in `az` are what kill it. At `az = 0` the whole thing collapses to
 * `|v| = r`: the trailing arm is the driven arm's mirror image, and every reach and every
 * elevation is reachable. Away from zero it is not close:
 *
 *     az rad   |v| at r = 0.30   |v| at r = 0.66   what the trailing arm can do
 *      +0.00        0.300             0.660        both mirror the driven arm exactly
 *      +0.10        0.377             0.729        0.780 m is full extension; the elbow locks
 *      +0.30        0.501             0.921        unreachable
 *      -0.10        0.220             0.590        0.217 m is the elbow's own fold limit
 *      -0.30        0.086             0.451        unreachable: the grip is inside the socket
 *
 * **So a two-socket terminal costs the chain its yaw entirely**, and the honest expression of
 * that is `swingMin = swingMax = 0` rather than a narrow band that would be feasible at one
 * reach and not at another. The lift and the reach survive intact, which is why a mace is still
 * worth having: it raises, falls, pushes out and pulls in over the chain's whole range, and it
 * does it with two arms that are exact mirror images -- which is also what should make the
 * trailing arm look attached rather than dragged.
 *
 * `roll` and `bend` go with the yaw and for the same reason at a shorter lever: a roll of the
 * driven wrist swings the far grip through an arc 0.68 m in radius. The overview's terminal
 * table already says what `roll` means on a mace -- "nothing; a mace has no edge" -- and this is
 * that sentence written as two zeroes.
 *
 * 2026-09-04, arithmetic, checked against the Node bench by the mace assertions in
 * `tests/golem-bench.test.mjs`.
 */
export const TERMINAL_MACE = {
  /**
   * How far the bar reaches past the **trailing** grip, metres, to the butt.
   *
   * Short on purpose. Every centimetre here moves the centre of mass back toward the arm that
   * has no motor, and an unmotorised arm exerts no joint torque at all -- it is carried, so the
   * driven arm pays for whatever the balance point puts on the far side of the far grip. 0.10 m
   * is a butt that is visible past the second fist and nothing more. 2026-09-04.
   */
  buttReach: 0.10,
  /**
   * How far the bar reaches past the **driven** grip, metres, to the far end of the head.
   *
   * The whole of the weapon's leverage, and the number that decides which side of the driven
   * grip the mass falls on. With the grips 0.68 m apart, a 0.10 m butt and this at 0.44, the bar
   * is 1.22 m tip to tip and its centre of mass lands 25 mm *beyond* the driven grip -- so the
   * driven arm carries the head and the trailing arm steadies the butt, which is the arrangement
   * an unmotorised grip can sustain. Shorter and the balance crosses to the passive side; longer
   * and the head sweeps the floor at `liftMin`. 2026-09-04.
   */
  headReach: 0.44,
  /**
   * The haft's collider radius, metres.
   *
   * Slender, per the frozen rule, and the one leaf the whole terminal has: the head is drawn by
   * the shell and weighed by the mass and the balance point below, because a second leaf would
   * mean a `PhysicsShapeContainer` and a container's own filter is a shape nothing consults that
   * reads back garbage. 2026-09-04.
   */
  haftRadius: 0.045,
  /**
   * What the drawn head measures across, metres.
   *
   * **The one place on a golem where the shell is wider than the collider, and it is stated
   * rather than hidden.** The collider is a single capsule of `haftRadius` for the whole bar, so
   * the drawn head stands 40 mm proud of it on every side: a mace therefore bites along the
   * haft's own line and a glancing contact with the outermost 40 mm of the drawn ball registers
   * nothing. Cosmetics never carry authority, and here that cuts the way that costs rather than
   * the way that cheats -- the head can only ever score *less* than it looks, never more. If
   * that difference ever matters, the answer is a second `GolemPart` for the head with its own
   * body, not a wider capsule: a bar 170 mm across is not a slender collider, and a container
   * with two leaves is the filter trap. Chosen by eye against the stand, 2026-09-04.
   */
  headDiameter: 0.17,
  /**
   * Mass, kilograms.
   *
   * Arithmetic: a 1.22 m capsule of radius 0.045 is 0.007571 m3, and stone at 2600 kg/m3 makes
   * that 19.7 kg; a bronze head of radius 0.085 is 0.002572 m3, and bronze at 8800 kg/m3 makes
   * that 22.6 kg. 42 is the pair, rounded -- and the head being the denser half is the whole of
   * what a maul is. It is heavier than the arm that swings it. 2026-09-04.
   */
  mass: 42.0,
  /**
   * Where it balances, as a fraction of the bar's own length measured from the butt.
   *
   * `CONFIG.club.balancePoint` is the same idea in metres and carries the argument: a sword
   * balances a hand's width ahead of the guard so it turns about the wrist, and this balances
   * most of the way out, so it takes real time to start and cannot be stopped once it is going.
   * Derived rather than felt: a uniform 19.7 kg haft centred at the middle of a 1.22 m bar and a
   * 22.6 kg head centred one head-radius inside the tip put the centre of mass at 0.73 of the
   * length from the butt. Stated as a fraction rather than in metres because the bar's length
   * depends on the socket separation, which is the golem's business and not this block's.
   *
   * **What it has to clear is the driven grip, and by 0.11 m it does.** The driven grip sits at
   * 0.78 m from the butt of a 1.22 m bar, or 0.64 of the length, so the mass falls on the head
   * side of the arm that is actually driving it. An unmotorised arm exerts no joint torque at
   * all, so the driven arm carries the whole bar whatever the balance; what the balance decides
   * is how much of that arrives as a *moment* on the weld rather than as a force at the hand,
   * and 0.11 m of lever is about a seventh of the grip separation. 2026-09-04.
   */
  balanceFraction: 0.73,
  /**
   * The cone the **trailing** grip allows, radians, about each of its three axes.
   *
   * A ball joint and not a weld, and the difference is a degree count. The trailing chain has
   * three axes; a point constraint spends exactly three and leaves the loop determined, while a
   * weld would spend six on a chain that has three, which is a solver asked to satisfy an
   * impossible pose every step. Near pi, so the grip is free rather than limited: what stops the
   * trailing arm going anywhere silly is its own shoulder and elbow stops, which is where a limb
   * limit belongs. 2026-09-04.
   */
  gripCone: 3.0,
  health: 200,
  vitalityWeight: 1.4,
  /** `CHAIN_REACH`'s pair, unchanged. 2026-09-04. */
  linearDamping: 0.7,
  angularDamping: 3,
  /**
   * What the pair takes away from whatever chain carries it. The derivation is in this block's
   * own header, and the table of `|v|` there is what picked the two zeroes.
   *
   * `reachMax` is 0.66 rather than `CHAIN_REACH.reachMax`'s 0.72, and the 60 mm is the
   * follow-through's: a thrust's drive ends at the commanded ceiling and the limb carries about
   * 47 mm past it, which at 0.72 would leave the *trailing* arm at 0.767 m against a full
   * extension of 0.780 -- an elbow arriving at its own stop, which is a motor and a limit
   * pushing at each other. At 0.66 the same overshoot leaves 70 mm of bend in hand. 2026-09-04.
   */
  limits: {
    reachMin: null,
    reachMax: 0.66,
    swingMin: 0,
    swingMax: 0,
    liftMin: null,
    liftMax: null,
    carryMin: null,
    rollMax: 0,
    bendMax: 0,
  },
};

/**
 * The whip terminal: a chain of light stone beads on spherical joints, and no new driven axis.
 *
 * **It is physics rather than control**, which is the session plan's frozen choice and is worth
 * stating as what it rules out: there is no lash controller, no per-segment target, and no
 * stroke of its own. The wrist flicks and the beads do what beads do. Offered on the wrist chain
 * alone, because without a roll axis a lash has no start -- `roll` is which way it goes out.
 *
 * **The first bead is welded and the rest are jointed**, which is the same sentence read twice.
 * A whip hung off a spherical joint at the wrist would hang straight down whatever the arm did
 * and `roll` would move nothing at all; welded, the first bead is the arm's, and the lash starts
 * where the wrist points it.
 *
 * **`velocityAt` is the right question here, and the answer is not obvious.** `AGENTS.md`
 * records that `linear + w x r` is right for a blade and wrong for an arrow, and the reason is
 * not rigidity: it is whether the rotation was there *before* the contact. An arrow has none in
 * flight, so any `w` at its contact point was put there by the contact, and over a 0.36 m
 * half-shaft that is tens of metres a second of pure error -- measured, 5.6 m/s reported for a
 * 48 m/s shot. A whip bead is the opposite case in its strongest form: it is turning about the
 * joint above it precisely *because* the lash is cracking, that turn is put there by the chain,
 * and it is the entire reason the end of a whip goes faster than the hand that drives it. So a
 * bead is scored the way a blade is, through `RigidStrike`, and the ordinary post-contact
 * exclusion window is what keeps the frame *after* a hit out of the readings.
 */
export const TERMINAL_WHIP = {
  /**
   * How many beads, and how long each is, metres.
   *
   * **The length is bounded by the floor rather than by taste, and that is the finding this
   * terminal produced.** Every other terminal here is rigid and stands out along the arm; a lash
   * hangs, so what decides how long it may be is how much room there is under the socket. The
   * wrist chain's weld point sits at **0.705 m** at the bottom corner of its own envelope --
   * `liftMin` and `reachMax` together, arithmetic from `CHAIN_REACH`'s two-bone solution -- and a
   * lash longer than that lies on the floor at rest. That is not a cosmetic problem: a contact
   * opens a 0.25 s tip-speed exclusion window, a lash resting on the ground opens one every step,
   * and every reading the bench takes would then be excluded. A whip that cannot be measured is a
   * whip nobody can argue about.
   *
   * 6 x 0.11 is 0.66 m, and the `limits` below buy the room for it by taking elevation. Together
   * they leave about 0.14 m under the last bead at the worst pose a stroke reaches -- checked as
   * zero contacts over the scripted lash sequence in the Node bench, which is what settles it
   * rather than this paragraph. A longer lash is Session 08's to have, once a golem has a torso
   * that stands taller than a bench stand. 2026-09-04.
   */
  segments: 6,
  segmentLength: 0.11,
  /** Slender, per the frozen rule, and slender is also what makes it read as a lash rather than
   *  as a rope of sausages. Chosen by eye, 2026-09-04. */
  segmentRadius: 0.022,
  /**
   * Mass per bead, kilograms.
   *
   * Arithmetic: a capsule 0.11 m tip to tip at radius 0.022 is 0.0001450 m3, and stone at
   * 2600 kg/m3 makes that 0.377 kg, rounded to 0.38. Six of them is 2.3 kg -- about two blades,
   * which is a lash with real weight in it, and weight is exactly what the gate's own question
   * about this terminal is asking about. 2026-09-04.
   */
  segmentMass: 0.38,
  /**
   * How far each joint may bend and twist, radians.
   *
   * Not free: a bead pair with no limit folds back through itself, which is a self-intersecting
   * rope rather than a heavy chain, and adjacent beads are on a layer whose collide mask does
   * not contain that layer, so nothing would stop it. 0.85 rad is about 49 degrees a joint,
   * which over seven joints is more curl than any command here produces. The twist is tighter,
   * because a twist about the lash's own axis moves nothing visible and only costs the solver
   * work. Chosen by eye, 2026-09-04.
   */
  jointCone: 0.85,
  jointTwist: 0.30,
  /**
   * Damping per bead.
   *
   * Above the arm's 0.7 and 3, deliberately: a chain of eight bodies on seven joints has seven
   * modes to ring in and nothing driving any of them, so what a lash does after a flick is
   * decided here and nowhere else. Chosen by eye against the stand and reported rather than
   * swept -- the sweep that would settle it is a *feel* sweep, and this session ends at a gate
   * a person answers. 2026-09-04.
   */
  linearDamping: 0.6,
  angularDamping: 4.0,
  /**
   * How many beads at the far end actually bite.
   *
   * The session plan's "the last few segments". Three is the last 0.39 m of a 1.04 m lash: the
   * part that is travelling, and the part a person aiming a whip is aiming. Scoring with all
   * eight would let the handle bruise, which is a weapon with an option nobody designed -- the
   * argument `scoring.ts` makes for refusing the buckler its punch. 2026-09-04.
   */
  strikingSegments: 3,
  /** Per bead. Small: a bead is the cheapest thing on a golem to lose. 2026-09-04. */
  health: 24,
  vitalityWeight: 0.15,
  /**
   * What the lash takes from the chain: elevation, and nothing else.
   *
   * The trade this terminal makes, as one number. A lash has no pose it cannot reach -- it hangs
   * -- so nothing here is about the whip's own kinematics; it is about the room under the
   * shoulder. The wrist chain's weld point is a function of the commanded elevation, and the
   * bottom of the lash is that height less the whole lash:
   *
   *     liftMin   lowest weld point   under a 0.66 m lash   under a 0.84 m lash
   *      -0.95          0.705 m              0.05 m               -0.14 m
   *      -0.75          0.86                 0.20                  0.02
   *      -0.55          1.01                 0.35                  0.17
   *      -0.30          1.24                 0.58                  0.40
   *
   * Arithmetic from `CHAIN_REACH`'s two-bone solution at `reachMax`, which is where the weld
   * point is lowest. The rows are not the whole story, because an *achieved* pose is not a
   * commanded one: a cut's follow-through carries the elevation about 0.39 rad past where the
   * drive left it, which from -0.55 reaches about -0.94 and drops the weld to roughly 0.80 m. The
   * 0.66 m lash still clears by about 0.14 m there and the 0.84 m one does not clear at all,
   * which is what picked the two numbers together.
   *
   * -0.55 gives up 0.40 rad of the chain's 2.00 rad of elevation, which is real, and is the
   * honest price of a lash on a shoulder 1.42 m off the ground. Everything else is left alone --
   * a whip needs the roll most of all, because the roll is what the lash starts from. 2026-09-04.
   */
  limits: {
    reachMin: null,
    reachMax: null,
    swingMin: null,
    swingMax: null,
    liftMin: -0.55,
    liftMax: null,
    carryMin: null,
    rollMax: null,
    bendMax: null,
  },
};
