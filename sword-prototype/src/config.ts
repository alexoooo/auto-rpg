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

    /** Strides per second per metre per second. The legs are cosmetic, but a
     *  figure that slides across the ground reads as a prop, not a person. */
    strideCadence: 2.5,
    /** Hip swing at a full walk, radians. */
    strideSwing: 0.62,
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
     * The grip's damping term, as a bleed-off rate in reciprocal seconds.
     *
     * A position motor is a spring with no damper, so it overshoots and rings --
     * which is what the settling bob at the tip actually was. Raising the motor
     * force made it worse (44 mm at 110 N.m against 234 mm at 800), because a
     * stiffer spring simply overshoots harder, and raising the blade's own
     * angular damping cost swing power because it fights every rotation, wanted
     * or not.
     *
     * This is the missing derivative term, and it is measured against the
     * anchor rather than against the world: it resists the blade turning
     * *differently* from the way it has been told to turn, so a commanded swing
     * passes through most of the way untouched and the ringing is bled off. A
     * hand grips a sword in exactly that sense.
     *
     * Sweep the cursor across for a quarter-second and then hold it dead still
     * -- which is what a player actually does, and what a cursor *jump* does not
     * reproduce, because a teleport builds no momentum for the blade to carry:
     *
     *     rate    peak swing   direction changes   time to settle
     *        0      32.1 m/s          10               0.68 s
     *       14      30.2                7               0.41
     *       25      28.7                6               0.34
     *       55      26.3                4               0.21
     *       80      25.0                3               0.18
     *      140      22.8                2               0.10
     *
     * 55 is the knee. Three times steadier for a sixth of the swing speed, and
     * 26 m/s is still well over twice the speed a cut needs to do full damage.
     */
    gripAngularDamping: 55,

    /**
     * Resting muscle tone, in newton-metres.
     *
     * This was once the attempted fix for the elbow hanging like a rope, and it
     * was the wrong instrument -- see `elbowPole` below for what the problem
     * actually was. What tone is still good for is agreeing with the inverse
     * kinematics rather than fighting them: a slight standing bend means the
     * solved elbow and the joint's own preference point the same way.
     *
     * Both ceilings are tiny next to the roughly 380 N.m the grip commands at
     * the shoulder, so neither can argue about where the hand goes.
     */
    shoulderTone: 0,
    elbowTone: 6,
    /** The elbow's preferred bend, radians. Slightly bent, like an arm. */
    elbowRest: -0.45,

    /**
     * The elbow's pole vector -- the spare degree of freedom, finally held.
     *
     * Muscle tone was the wrong instrument for this. Pinning the hand in six
     * degrees of freedom leaves the seven-degree-of-freedom arm one axis over:
     * the elbow can swivel freely about the line from shoulder to hand without
     * moving the hand at all. A joint spring cannot fix that, because the
     * elbow's *bend* is already determined by how far the hand is from the
     * shoulder -- what is undetermined is which way round the circle of valid
     * elbow positions it sits, and that is a direction, not an angle. So the
     * elbow is placed analytically instead: two-bone inverse kinematics puts it
     * on that circle, and this vector, in torso space, says where on the circle.
     * Down, a little outboard, a little back -- where a person's elbow goes.
     */
    elbowPole: { x: 0.42, y: -1, z: -0.5 },
    /**
     * How hard the arm insists on that elbow, in newton-metres.
     *
     * Small on purpose. The grip commands something like 380 N.m at the
     * shoulder, so this cannot argue about where the hand goes -- and measured,
     * it does not: hand-to-anchor error stays at 0 mm across the whole aiming
     * envelope at every setting tried, up to 70.
     *
     * What it does fix, measured over a sweep and hold:
     *
     *                        elbow travel   drift while the hand is still
     *     no pole vector        1370 mm              127 mm
     *     45 N.m                 635                   0
     *
     * That 127 mm of elbow with the hand completely stationary was the rope.
     * Past about 45 the returns flatten (612 mm at 70), so this stops there.
     */
    elbowPoleForce: 45,

    /** Wrist roll rate from the roll keys, radians per second. */
    rollRate: 2.4,


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
    // Low, and low on purpose. This used to be the only thing holding the wobble
    // down, and it was a bad instrument for the job: it fights every rotation,
    // including the one the player asked for. Now that `arm.gripAngularDamping`
    // damps the blade against its *commanded* motion instead, this one measurably
    // does nothing for settling and only costs speed -- 0 through 9 all settle in
    // 0.21 s with the same four direction changes, while the peak falls from
    // 27.8 m/s to 26.0. What is left is a light general bleed for when nothing is
    // commanding the blade at all.
    swordAngularDamping: 2,
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

    /** Wheel zoom. `distance` and `height` are both scaled, so the camera slides
     *  along its own sight line and the framing angle never changes. */
    zoomStep: 0.09,
    zoomMin: 0.45,
    zoomMax: 2.10,
    zoomResponse: 12,
  },

  targeting: {
    /** How hard the hero turns to keep a locked enemy in front, per radian of
     *  heading error. */
    lockTurnGain: 7,
    /** Ceiling on that, radians per second. Above the free turn rate, because a
     *  lock that cannot keep up while you circle is worse than no lock. */
    lockTurnMax: 4.2,
    /** Radius of the ring drawn on the ground under a target. */
    ringRadius: 0.62,
    /** Outline thickness on the limb under the cursor. */
    outlineWidth: 0.014,
  },
};

export type Config = typeof CONFIG;
