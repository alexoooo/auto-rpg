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
    /** Havok substeps per rendered frame. Motorised joints holding a heavy
     *  lever arm need more than one or the arm visibly sags under its sword. */
    subSteps: 4,
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
     * The arm is driven at the hand, not joint by joint.
     *
     * Solving per-joint angles and feeding them to motors means getting three
     * constraint frames exactly right and tuning a dozen gains; driving the end
     * effector with one spring-damper and letting the constrained bones follow
     * gives the same anatomy from six numbers -- and it is what produces the lag,
     * overshoot and carried momentum that the whole design rests on.
     */
    stiffness: 1150,
    damping: 62,
    maxForce: 3200,
    /** Fraction of the arm+sword weight cancelled so the guard does not sag. */
    gravityCompensation: 0.92,

    /** Reach envelope, as a distance from the shoulder. */
    reachNeutral: 0.50,
    reachThrust: 0.70,
    reachGuard: 0.32,
    /** How fast reach moves between those stops. */
    reachResponse: 9,

    /** Angular envelope of the hand target, in torso-local space. */
    azMin: -1.15,
    azMax: 1.30,
    elMin: -1.05,
    elMax: 1.25,
    mouseSensitivity: 0.0032,
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
    /**
     * A real arming sword balances a few centimetres ahead of the guard, not at
     * the middle of the blade. Moving the centre of mass down the grip is the
     * single detail that most changes how the weapon handles.
     */
    balancePoint: 0.10,

    /** Orientation controller: how hard the wrist fights to aim the blade. */
    torqueStiffness: 165,
    torqueDamping: 13.5,
    maxTorque: 120,
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
    distance: 3.5,
    height: 1.9,
    /** Camera lag. Lower = the arena swims; higher = rigid and readable. */
    followResponse: 9,
    pitch: 0.20,
    fov: 0.95,
  },
};

export type Config = typeof CONFIG;
