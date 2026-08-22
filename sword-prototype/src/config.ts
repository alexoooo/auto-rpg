/**
 * Every number that changes how the game feels lives here.
 *
 * The prototype's whole question is whether a physically-simulated sword can be
 * made to feel good in a browser, and that question is answered by iteration
 * count rather than by cleverness. So: one file, no magic numbers scattered
 * through the systems, and a `?tune` overlay that writes back into this object
 * live.
 *
 * Units are SI throughout -- metres, kilograms, seconds, radians.
 */

export const CONFIG = {
  world: {
    gravity: -9.81,
    /**
     * Physics substeps per second, driven by Babylon's fixed-timestep
     * accumulator in `Scene._advancePhysicsEngineStep`.
     *
     * This is the single most important number for how steady the sword looks.
     * Stepping the solver by the raw frame delta means a motorised joint gets a
     * slightly different correction every frame, and the blade visibly shivers
     * in the hand even with the cursor held still -- measured at 40 mm of tip
     * wander under realistic frame jitter, against 0 mm at a fixed step.
     *
     * 240 Hz costs about 2.5 ms a frame and buys a chain that does not care what
     * the frame rate is doing.
     */
    physicsHz: 240,
    /** Clamp: a long stall must not integrate one enormous step. */
    maxFrameSeconds: 1 / 20,
  },

  hero: {
    height: 1.8,
    shoulderHeight: 1.42,
    /** Shoulder offset from the body centreline, in torso-local space. */
    shoulderSide: 0.21,
    shoulderFront: 0.02,
    walkSpeed: 2.9,
    strafeSpeed: 2.2,
    turnSpeed: 2.5,
    /** How quickly locomotion reaches its target speed. Low = skate, high = snap. */
    accelResponse: 11,
  },

  arm: {
    upperLength: 0.30,
    upperRadius: 0.056,
    upperMass: 2.7,

    foreLength: 0.27,
    foreRadius: 0.048,
    foreMass: 1.8,

    handLength: 0.12,
    handRadius: 0.046,
    handMass: 0.65,

    /**
     * The arm is driven by solver motors, not by forces applied from outside.
     *
     * The first version applied a spring-damper to the hand every frame with
     * `applyForce`. That is explicit integration bolted onto an implicit solver,
     * and it shook itself apart: Babylon converts a force to an impulse using
     * `getTimeStep()` while the world actually steps by the real frame delta, so
     * the effective gain flickered frame to frame. Motors live inside the solver,
     * so they are unconditionally stable and do not care about the frame rate.
     *
     * These are force *ceilings*, not stiffnesses. The lag and overshoot that
     * make the weapon feel heavy come from the ceiling being finite -- the motor
     * simply cannot drag the sword instantly -- rather than from a tuned spring.
     */
    linearMotorForce: 850,
    // 110 rather than 42: measured re-aim time after a cursor jump falls from
    // 0.42 s to 0.07 s, and nothing above 110 improves it further.
    angularMotorForce: 110,

    /** Bleeds off residual ringing in the chain. */
    linearDamping: 0.7,
    angularDamping: 3,

    /**
     * Resting muscle tone, in newton-metres.
     *
     * Pinning the hand in all six degrees of freedom still leaves the seven-DoF
     * arm one spare: the elbow can swivel about the line from shoulder to hand
     * without moving the hand at all. Nothing else constrains that axis, so the
     * elbow hangs and swings like a noodle.
     *
     * These ceilings are tiny next to the roughly 400 N.m the grip commands at
     * the shoulder, so they cannot argue with where the hand goes -- they only
     * show up on the axis nothing else was holding.
     */
    // Measured: the shoulder axis needs no help once the timestep is fixed, but a
    // little tone at the elbow gives it a pose to hold instead of dangling, and
    // takes the settling bob at the tip from 48 mm down to 39 mm.
    shoulderTone: 0,
    elbowTone: 6,
    /** The elbow's preferred bend, radians. Slightly bent, like an arm. */
    elbowRest: -0.45,


    /**
     * Reach, measured from the shoulder to the centre of the hand.
     *
     * The chain reaches 0.63 m fully extended, so everything here stays inside
     * that. The first pass let a thrust ask for 0.70 -- past full extension --
     * which pinned the elbow against its stop and buzzed there.
     */
    reachNeutral: 0.45,
    reachThrust: 0.60,
    reachGuard: 0.28,
    reachMax: 0.61,
    reachResponse: 9,

    /** Where the cursor sits maps straight onto where the hand goes. */
    azMin: -1.15,
    azMax: 1.30,
    elMin: -1.05,
    elMax: 1.25,
    /** Wheel notches to wrist roll. */
    rollSensitivity: 0.22,
    rollMin: -2.6,
    rollMax: 2.6,
  },

  sword: {
    bladeLength: 0.84,
    bladeWidth: 0.050,
    bladeThickness: 0.010,
    guardWidth: 0.22,
    gripLength: 0.19,
    mass: 1.35,
    /** The sword's own damping. Follow-through should read as weight, not as a
     *  loose pendulum, and this is what separates the two. */
    swordLinearDamping: 0.5,
    // Damping, not motor strength, is the lever on settling. Raising the angular
    // motor instead makes the bob far worse -- 44 mm at 110 N.m against 234 mm at
    // 800 -- because a stiffer motor simply overshoots harder. Past about 8 the
    // damping starts eating swing power (peak 20.4 -> 15.4 m/s), so this sits
    // just below that.
    swordAngularDamping: 6,
    /**
     * A real arming sword balances a few centimetres ahead of the guard, not at
     * the middle of the blade. Moving the centre of mass down the grip is the
     * single detail that most changes how the weapon handles.
     */
    balancePoint: 0.10,

  },

  combat: {
    /** Below this contact speed nothing cuts; the blade just shoves. */
    minCutSpeed: 3.0,
    /** Contact speed at which a square edge-on hit does full damage. */
    referenceSpeed: 11.0,
    /** How sharply damage falls off as the edge turns away from the cut. */
    edgeExponent: 2.0,
    /** A thrust only counts if it lands within this distance of the tip. */
    thrustTipZone: 0.30,
    damageScale: 46,
    /** Damage past a part's remaining health this far over severs it. */
    severMargin: 1.0,
    /** Impulse delivered to a limb the moment it comes free. */
    severKick: 3.4,
    /** Seconds of cooldown per part, so one contact is not billed 60 times. */
    hitCooldown: 0.09,
  },

  dummy: {
    origin: { x: 0, y: 0, z: 2.6 },
    /** Weak motors: it holds its pose, but a real hit moves it. */
    jointStiffness: 34,
    jointDamping: 4.2,
    partHealth: 100,
  },

  camera: {
    /** Horizontal distance the camera trails behind the hero. */
    distance: 4.0,
    /** Height above the ground. Well above the head, looking down, so you can
     *  read where the blade is in the arena rather than staring at a haircut. */
    height: 3.8,
    /** The camera aims at a point ahead of the hero, not at the hero. */
    lookAhead: 1.8,
    lookHeight: 0.9,
    /** Camera lag. Lower = the arena swims; higher = rigid and readable. */
    followResponse: 9,
    fov: 0.95,
  },
};

export type Config = typeof CONFIG;
