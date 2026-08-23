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

/**
 * Which reading of the arena the camera is giving. The two names are also the
 * keys of the two presets in the `camera` block below, which is what lets the
 * mode select its own framing without a lookup table in between.
 */
export type CameraMode = "overhead" | "fixed";

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

  /**
   * The fighter, as something that moves. What it is made of is in `body`.
   *
   * This block was called `hero` and every number in it is unchanged. The rename
   * is the point of the session it happened in: there is one kind of body in the
   * ring and two of them in a bout, and a block named for the one you happen to
   * be driving would have had to be read twice with different meanings.
   */
  fighter: {
    height: 1.8,
    shoulderHeight: 1.42,
    /** Shoulder offset from the body centreline, in torso-local space. Positive
     *  is the sword side; the free arm mirrors it. */
    shoulderSide: 0.21,
    shoulderFront: 0.02,
    walkSpeed: 2.9,
    strafeSpeed: 2.2,
    turnSpeed: 2.5,
    /** How quickly locomotion reaches its target speed. Low = skate, high = snap. */
    accelResponse: 11,

    /** Strides per second per metre per second. A figure that slides across the
     *  ground reads as a prop, not a person. */
    strideCadence: 2.5,
    /** Hip swing at a full walk, radians. */
    strideSwing: 0.62,

    /**
     * How far apart the two of them start, in metres, facing each other along
     * +Z with the left one at the origin.
     *
     * It is the distance the training dummy stood at, kept deliberately: the
     * camera's framing, the aim indicator's reach and every feel judgement so
     * far were all formed with something to hit at exactly this range, and the
     * session that put a second fighter in the ring is not the session that gets
     * to move it. Two full reaches is about 2.9 m, so they start just inside the
     * distance at which either could touch the other.
     */
    separation: 2.6,
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

    // There was a `minShieldReach` here for an afternoon -- a floor under
    // `reachGuard` for a hand holding a shield, on the argument that a guard
    // pulls the plate into its owner's chest. **The measurement refuted it.**
    // At `reachGuard` the nearest point of the plate is 298 mm from the centre
    // of the torso, which is 108 mm outside it, and lifting the reach to 0.42 m
    // moved the plate *closer* to the head, from 623 mm to 307 mm, rather than
    // further. It stopped nothing and cost a knob, so it is gone.

    /**
     * Where an unused hand rests, as a cursor position.
     *
     * The centre of the window is centre guard: `(0, 0)` puts a hand straight
     * out in front at `reachNeutral`, which is what a fighter *aiming* with that
     * hand wants and is exactly wrong for one that is not using it. With two
     * driven arms and both defaulting to centre, every fighter stood with both
     * arms out in front like a sleepwalker -- and it read as the costume being
     * broken rather than as a pose, because nothing about a person looks like
     * that.
     *
     * The off arm used to hang because it was not driven at all: it was two
     * capsules counterswinging on the gait, and gravity and the stride did this
     * job for free. It is a real arm now and has to be told.
     *
     * `-1` is the bottom of the envelope, and the envelope is what limits it:
     * `elMin` is -1.05 rad, about sixty degrees below the horizontal, so a
     * resting arm angles down and forward rather than hanging plumb. Widening
     * `elMin` would let it hang properly and would also change where every
     * *aimed* low guard can reach, which is a change to the controller and wants
     * its own measurement.
     */
    restPointerX: 0,
    restPointerY: -1,

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

  /**
   * The shield.
   *
   * It scores nothing and is not aimed. What it does is occupy a rectangle in
   * front of the arm holding it, and the collision layers were already saying
   * that an enemy blade and this side's weapons may touch -- so blocking needed
   * no code at all, only a shape. That is the whole design of it: a shield that
   * worked by a rule would be a rule a player has to learn, and one that works
   * by being in the way is one they can see.
   *
   * Nothing here has been played with. The numbers are a real heater shield's:
   * about 60 cm tall, 45 across, lime board a centimetre thick with a steel rim
   * and boss, which comes out around 4 kg. If it turns out to block everything,
   * the honest lever is `width` and `height` rather than a damage rule.
   */
  shield: {
    width: 0.44,
    height: 0.60,
    thickness: 0.014,
    /**
     * How far the face stands out from the fist, along the weapon's +Y.
     *
     * A shield is strapped across the forearm rather than punched out on the end
     * of a straight arm, and this is the whole of what stands in for that. Too
     * small and the plate sits inside the hand; too large and the fighter is
     * carrying a door at arm's length.
     */
    standOff: 0.11,
    /**
     * How far the plate reaches back past the fist, toward the shoulder.
     *
     * The plate is 600 mm long and lies along the forearm, so where the hand
     * sits on it decides whether the inboard end of it is in front of the
     * wearer's chest or inside it. 220 mm puts the fist a little above the
     * plate's centre, which is where the enarmes of a heater shield actually
     * are, and leaves 380 mm hanging on out past the hand.
     *
     * It does not have to carry the whole guarantee on its own -- a shield is on
     * a collision layer its owner's trunk can stop, and `arm.minShieldReach`
     * keeps it from being drawn in that far in the first place -- but it is the
     * one of the three that costs nothing.
     */
    gripInset: 0.22,
    bossDiameter: 0.13,
    gripLength: 0.12,
    mass: 4.0,
    /**
     * How square to the front a shield insists on being, as a sine.
     *
     * Zero roll points the plate's face at the fighter's own front, which is
     * only possible to the extent the arm is *not* pointing there -- the plate
     * contains the forearm. 0.42 is sin 25 degrees: inside that cone the frame
     * is conditioned with the horizontal square to the arm, so a shield in a
     * hopeless pose stands on its edge rather than lying flat. `arm.ts`'s
     * `driveAnchor` has the argument at length.
     */
    minFace: 0.42,
  },

  /**
   * The club: two hands, no edge, and all of its weight at the far end.
   *
   * The one weapon whose `hands` is 2, which is what makes it worth having
   * rather than a heavy sword. Both arms are welded to the same haft and both
   * grips are motorised toward one commanded pose, so the 850 N ceilings add up
   * -- the strength of both arms combined, arrived at physically rather than by
   * doubling a constant somewhere.
   *
   * `balancePoint` is the number that gives it its character. A sword balances a
   * hand's width ahead of the guard so it turns about the wrist; this balances
   * most of the way out, so it takes real time to start and cannot be stopped
   * once it is going. If the club ever feels like a broom, that is the number,
   * and moving it is a change to the feel of the weapon that wants a
   * before-and-after table here.
   */
  club: {
    /**
     * How far the butt sits *behind* the leading hand, in metres.
     *
     * The club is the one weapon whose origin is not its butt but its leading
     * grip, because two hands need shaft on both sides of where the front one
     * holds it. Everything else in this block is measured from that grip.
     */
    buttLength: 0.34,
    haftLength: 0.86,
    haftDiameter: 0.044,
    headLength: 0.24,
    headDiameter: 0.105,
    gripLength: 0.30,
    mass: 3.4,
    /** Along +Y from the origin, in metres. Well out toward the head. */
    balancePoint: 0.62,
    /**
     * How far along the haft from the leading hand the second one sits.
     *
     * Negative: the trailing hand is *behind* the leading one, back toward the
     * butt, which is also back toward the body. That direction is not a
     * stylistic choice -- forward is unreachable. The two shoulders are 0.42 m
     * apart and an arm is 0.63 m long, so a trailing hand placed ahead of the
     * leading one ends up around 0.84 m from its own shoulder and the grip
     * spends the whole bout stretched.
     *
     * Getting this wrong is not subtle once it is measured and is invisible
     * until it is: the first version put both hands at the same angles from
     * their own shoulders, which is two targets 0.42 m apart on a haft that
     * holds the fists 0.26 m apart. Mean commanded-to-actual hand error went
     * from 5.95 mm one-handed to 95.70 mm two-handed -- and the *reversal* rate
     * fell from 73/s to 19/s, which is what says it was a steady tug-of-war
     * rather than the chatter it would be easy to mistake it for.
     */
    secondGrip: -0.26,
    /**
     * What the two grips are worth, as multipliers on `arm.linearMotorForce`
     * and `arm.angularMotorForce`, when a club is held.
     *
     * The obvious design was two motorised grips pulling one haft, so that the
     * 850 N ceilings add up on their own and "the strength of both arms" needs
     * no number at all. **It is refuted by measurement.** Mean commanded-to-
     * actual hand error over the standard sweep, bench harness, trailing grip
     * swept from nothing to full:
     *
     *     trailing   peak mm   mean mm   reversals/s
     *         0.00     121.2     34.45          19.9
     *         0.15     178.3     39.14          33.5
     *         0.30     175.2     61.25          19.5
     *         0.50     217.0     90.30          18.0
     *         0.75     211.7     94.32           8.9
     *         1.00     190.4     87.09          11.9
     *
     * There is no setting at which the second motor helps. It cannot: the two
     * hands hang off two shoulders 0.42 m apart on a torso that does not twist,
     * so the poses the two chains can reach differ, and two position motors
     * asked for poses their chains disagree about pull against each other. The
     * low reversal counts are what say it is a tug-of-war rather than chatter --
     * a fighting motor would reverse *more* often, not less.
     *
     * So the trailing hand is a passive linkage -- welded to the haft, adding
     * its mass and its inertia and no force -- and the strength of both arms is
     * expressed where the solver can actually carry it, on the hand that has the
     * weapon. Sweeping that:
     *
     *     lead   peak mm   mean mm   reversals/s
     *     1.0      121.2     34.45          19.9
     *     1.5      123.7     21.02          49.9
     *     2.0       46.6      4.95          87.3      <- both arms, and the knee
     *     2.5       37.1      3.01         103.5
     *     3.0       77.6      3.02         120.9
     *
     * 2.0 is where the number that is physically right and the number that
     * measures best turn out to be the same one: it is exactly two arms' worth
     * of grip, and it lands the club's tracking on top of the sword's own 4.21
     * mm mean and 45.27 mm peak. Above it the mean stops improving while the
     * peak and the reversal rate both climb, which is the onset of the chatter
     * the two-motor version had all along.
     */
    trailingGrip: 0,
    leadGrip: 2,
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

    /**
     * The club, which does not cut.
     *
     * `crushScale` against `damageScale`'s 46: a club landing square is worth
     * less than a sword landing perfectly, and far more than a sword landing
     * badly. That is the trade the weapon is for -- you cannot place a blow with
     * a club, so it should not need placing, and it should not out-damage a cut
     * that somebody actually aimed.
     *
     * `minCrushSpeed` is below `minCutSpeed` because a blade that arrives slowly
     * is a blade being leaned on and a club that arrives slowly is still several
     * kilograms of wood. Neither number has been played with.
     */
    crushScale: 34,
    minCrushSpeed: 2.2,
  },

  /**
   * Blood, which decides nothing.
   *
   * Every number here is a look rather than a rule, and `src/blood.ts` is on the
   * presentation side of the directory precisely so that it stays that way. The
   * damage a blow scored is an input to this and never an output of it.
   *
   * None of it has been seen by anybody yet -- these are first guesses, set to
   * be legible in a still frame rather than tuned against a fight. The thing to
   * watch for is the opposite failure from the usual one: not too little, but a
   * cut that fills the screen and hides the blow that caused it.
   */
  blood: {
    /**
     * Damage below which a contact draws nothing.
     *
     * A blade at `minCutSpeed` scores near zero and a flat slap scores near
     * zero, so this mostly separates "touched" from "cut". It is expressed in
     * damage rather than in speed so that it moves with the scoring rule instead
     * of having to be re-derived every time `damageScale` changes.
     */
    minSpray: 1.5,
    /** Damage at which a spray is as big as it gets. `partHealth` is 100. */
    fullSpray: 22,

    /** Droplets in the largest single burst. */
    sprayCount: 90,
    /** Metres per second the droplets leave at, before the strength scaling. */
    spraySpeed: 2.6,
    /** Seconds a droplet lives. Gravity does the rest. */
    sprayLife: 0.75,

    /** Droplets in the air at once from one stump. */
    stumpCount: 140,
    /** Droplets per second it sheds while it is still bleeding. */
    stumpRate: 110,
    stumpLife: 1.1,
    /** How long a severed limb goes on bleeding, seconds. */
    stumpSeconds: 2.5,

    /** Metres across, at the largest. A droplet is not a beach ball. */
    dropSize: 0.05,

    /** Fresh, and a few frames old. Linear, not sRGB: the pipeline tone-maps. */
    red: [0.55, 0.02, 0.02],
    dark: [0.18, 0.01, 0.01],
  },

  /**
   * The bout: two of them in the ring, and the rules that end it.
   *
   * The rules themselves are in `src/bout.ts`, as plain data and pure functions
   * with a test that argues with them. This is the one number they need.
   */
  bout: {
    /**
     * How long a bout is allowed to run before it is called a draw, in seconds
     * of simulation time.
     *
     * A cap exists because idle versus idle otherwise stands there forever, and
     * a pairing that never terminates is not a control condition -- it is a hung
     * measurement.
     *
     * **This was 60 and 60 is the bench's number, not a player's.** It was
     * chosen for bulk: `npm run measure` reports each policy as a distribution
     * over N bouts, headless Babylon runs at about 250x real time, and a hundred
     * *capped* bouts at 60 s therefore cost about twenty-five seconds of wall
     * clock. Every word of that argument is about a harness, and none of it is
     * about somebody at a keyboard -- who, driving a body against `idle`, will
     * routinely still be fighting after a minute. What 60 did to them was end
     * the bout underneath them with one line of banner text, and the next
     * `Space` then meant "abandon it" rather than "pause it". That is the whole
     * of the pause bug: see `pauseAction` in `src/bout.ts`.
     *
     * So the cap that ships is a *safety net* -- long enough that no fight
     * anybody is having is cut short, short enough that a forgotten tab does not
     * accumulate an hour of idle-versus-idle -- and `scripts/measure.mjs` sets
     * its own 60 at the top, where the argument for 60 actually lives.
     */
    capSeconds: 600,

    /**
     * How long the takeover hint stays on the banner at the start of a bout.
     *
     * Long enough to be read once without being read twice. The feature it
     * points at is not new -- `C` has taken a body mid-fight since session 07,
     * and the curtain has listed it the whole time -- but a key on a screen you
     * dismissed in order to start playing is a key nobody has, and this is what
     * that cost. Purely a screen number; nothing in the rules reads it.
     */
    hintSeconds: 6,
  },

  /**
   * The fighter, as something that can be hit.
   *
   * Eleven capsules: a keyframed torso and ten dynamic bodies hanging off it on
   * motorised joints. This replaces the `dummy` block, and the geometry replaces
   * the dummy's outright, because the dummy's was wrong in a way that is worth
   * keeping a record of.
   *
   * **The pivot, and why every height in here is absolute.** `rig.ts`'s `joint()`
   * locks all three linear axes, so a joint's two pivots are not a hint about
   * where the parts should be -- they are an instruction, and the solver will
   * drag a part across the arena to obey it. The dummy named a parent anchor at
   * world 0.400 and a child anchor at world 0.850 for the same joint, and duly
   * settled 450 mm lower than it was drawn; its head was authored at 1.700 and
   * sat at 1.243, its legs folded until the shin was *above* the thigh. That was
   * read as a stiffness problem for a long time and it was not: every angular
   * motor in it set to 40 000 N.m -- over a thousand times the 34 below -- moved
   * the head by exactly zero. So every joint here is written as an absolute
   * height above the floor and both pivots are derived from it by subtracting the
   * two parts' own centres, which makes the arithmetic checkable by eye:
   *
   *     part      centre   length   radius   mass     joint      at
   *     torso      1.28     0.52     0.19     68      neck      1.55
   *     head       1.66     0.24     0.105     5      waist     1.06
   *     pelvis     0.96     0.26     0.16     12      shoulder  1.42
   *     off upper  1.28     0.28     0.055    2.5     off elbow 1.14
   *     off fore   1.01     0.26     0.048    1.6     hip       0.90
   *     thigh      0.68     0.44     0.085     8      knee      0.46
   *     shin       0.25     0.42     0.068     4
   *
   * Read the two columns together and every joint lands on the tip of both
   * capsules it joins: the head's lower tip is 1.66 - 0.12 = 1.54 and the neck is
   * at 1.55; the thigh runs 0.46 to 0.90 and the hip and knee are its two ends.
   * The shin stops 40 mm above the floor on purpose -- the boot covers the gap,
   * and a foot that touches would drag its friction against a torso that is
   * driven by velocity and cannot be argued with.
   *
   * The torso's 68 kg is nominal. It is keyframed, so the solver treats it as
   * infinitely massive and the number changes nothing; it is left at the figure
   * the whole hero used to weigh rather than reduced to a chest's worth, because
   * a mass that is ignored is not worth an argument.
   */
  body: {
    torsoCentre: 1.28,
    torsoLength: 0.52,
    torsoRadius: 0.19,
    torsoMass: 68,

    neck: 1.55,
    headCentre: 1.66,
    headLength: 0.24,
    headRadius: 0.105,
    headMass: 5,

    waist: 1.06,
    pelvisCentre: 0.96,
    pelvisLength: 0.26,
    pelvisRadius: 0.16,
    pelvisMass: 12,

    offUpperCentre: 1.28,
    offUpperLength: 0.28,
    offUpperRadius: 0.055,
    offUpperMass: 2.5,
    offElbow: 1.14,
    offForeCentre: 1.01,
    offForeLength: 0.26,
    offForeRadius: 0.048,
    offForeMass: 1.6,

    hip: 0.90,
    hipSide: 0.105,
    thighCentre: 0.68,
    thighLength: 0.44,
    thighRadius: 0.085,
    thighMass: 8,
    knee: 0.46,
    shinCentre: 0.25,
    shinLength: 0.42,
    shinRadius: 0.068,
    shinMass: 4,

    /**
     * The joint springs, as one number and a multiplier each.
     *
     * 34 N.m and the six multipliers below are the dummy's, unchanged, and that
     * is deliberate: this session merged two classes and was not allowed to
     * retune anything on the way through. What they are worth is
     * `jointStiffness x strength`, so the waist holds at 748 N.m and the neck at
     * 204.
     *
     * They are not chosen against resting sag, and nobody should tune them
     * against it. Sag is not what these numbers decide: every part hangs from an
     * anchor with all three linear axes locked, so its position is held by the
     * constraint whatever the motor does, and the only thing a motor can lose is
     * an *angle*. Two arrangements make that visible -- the head sits above its
     * neck joint and so is an inverted pendulum that a weak motor would let tip
     * over, and everything else hangs below its anchor and so is a pendulum that
     * would hold up on its own. What the numbers actually decide is how hard a
     * blow rocks the figure and how quickly it comes back.
     *
     * That table is owed and is not here yet, because it needs a browser and a
     * reference blow rather than arithmetic:
     *
     *     stiffness   head displacement at rest   peak swing from a 14 m/s cut   time to still
     *     ...
     *
     * Take it by striking the right-hand fighter's head square at a measured tip
     * speed with `body.jointStiffness` at 17, 34 and 68 -- calling
     * `__sword.right.applyTuning()` after each change, which is what makes the
     * edit reach the solver at all -- and write the three rows here.
     */
    jointStiffness: 34,
    neckStrength: 6,
    waistStrength: 22,
    offShoulderStrength: 5,
    offElbowStrength: 3,
    hipStrength: 10,
    kneeStrength: 6,

    /**
     * What is left of every joint ceiling once the fighter is dead, as a
     * multiplier on the whole table above.
     *
     * Zero is wrong and it is worth saying why, because zero is the obvious
     * first guess. A body whose joints carry no torque at all is a bag of
     * capsules: the head-end of the spine folds through the pelvis, the knees
     * hyperextend to their stops on the first bounce, and what lands on the
     * floor reads as a dropped puppet rather than as a person who has just been
     * killed. A little tone left in keeps the limbs roughly where limbs go while
     * gravity does the rest.
     *
     * Not yet measured against a person's eye -- nobody has played this. Set at
     * 0.08, which puts the waist at 60 N.m against its usual 748 and the neck at
     * 16 against 204. If a corpse looks stiff, lower it; if it looks boneless,
     * raise it, and write the two readings here. It is live-tunable on a body
     * already on the floor: `__sword.config.body.deadJointStrength = 0.3;
     * __sword.left.applyTuning()`.
     */
    deadJointStrength: 0.08,

    /**
     * Whether the stride drives the hips and knees.
     *
     * The legs are real bodies on motorised joints so that one can be cut off,
     * and the walk feeds them joint targets where it used to write
     * `TransformNode.rotation` on a costume. The risk that buys is a driven joint
     * arguing with the solver, which shows up as a knee that chatters while the
     * fighter walks; the plan for this session named reverting the legs to
     * cosmetic as an acceptable outcome if it did.
     *
     * This is that fallback, kept as a switch rather than as a second code path.
     * Turn it off and the legs stay exactly what they are -- hittable, severable,
     * held straight by the same motors -- and only the stride stops arriving. A
     * second code path would have rotted the first time nobody was using it.
     *
     * Watch the knee at a walk with `G` up and the shapes layer on. If it buzzes,
     * set `__sword.config.body.gaitDrivesLegs = false` (no `applyTuning` needed,
     * this one is read every step) and write here what you saw.
     */
    gaitDrivesLegs: true,

    partHealth: 100,
    /** The torso cannot be severed, so it wants more health than a limb: it is
     *  the biggest target on the body and the one a bout most often ends on. */
    torsoHealth: 2,
    /** The pelvis carries both legs, so losing it is losing the lower half. */
    pelvisHealth: 1.8,
  },

  /**
   * The camera, in two readings of the same arena, on `V`.
   *
   * Exactly one thing separates them: where the forward vector comes from.
   * Overhead reads it off the torso's world matrix, so the camera sits behind
   * whichever way the fighter faces and turning the fighter turns the world.
   * Fixed builds it from `fixedBearing`, a constant world bearing, so turning the
   * fighter turns the fighter. Everything downstream of that vector -- the follow
   * lag, the look-ahead, the zoom, the snap on the first frame -- is one code path
   * serving both, because two camera implementations would agree on the day they
   * were written and drift apart the first time either one of them was tuned.
   *
   * The framing numbers are two named presets rather than one set made to suit
   * both. A trailing chase looking ahead of a fighter and a steep camera looking
   * at one want genuinely different geometry, and a compromise between them is
   * nobody's idea of either. The preset keys are spelled the same as the mode, so
   * `CONFIG.camera[CONFIG.camera.mode]` is the whole of the lookup.
   */
  camera: {
    /**
     * Which reading is live.
     *
     * Overhead is the default, and not only because it is what existed first. The
     * cursor's meaning is body-relative -- `aimArm` maps the pointer to an azimuth
     * and elevation in *torso* space, and every measured number in the `arm` block
     * was set that way -- so under Overhead screen right and body right nearly
     * agree and the mapping is invisible. Under Fixed they part company the moment
     * you turn: the cursor at the right edge of the window still means "arm out to
     * the body's right", which may by then be pointing at the bottom of the
     * screen. What is meant to carry that instead is the ground indicator in
     * `src/aim.ts`, which stakes the aim point out on the floor and needs no
     * agreement between the screen and the body to be read.
     *
     * The alternative was to rebase aim onto the screen under Fixed, and it was
     * rejected: it is cheap to write and immediately more legible to a newcomer,
     * and it quietly turns this into a twin-stick game, because the body stops
     * mediating between the hand and the blade. If body-relative aim reads badly
     * under Fixed the honest fix is a stronger indicator, not a second aim frame.
     * Nobody has played it yet, so that verdict is provisional.
     */
    mode: "overhead" as CameraMode,

    /**
     * The Fixed camera's bearing, in radians.
     *
     * Measured the way `fighter.ts` measures a heading -- zero looks down +Z and
     * it turns toward +X -- so it can be compared against `Math.atan2(forward.x,
     * forward.z)` with no conversion in between.
     *
     * A quarter turn rather than zero. At zero the Fixed camera is the Overhead
     * one with the fighter's turn frozen, and the moment of the switch then reads
     * as though nothing much happened; a quarter turn says at once that the arena
     * has a bearing of its own now. It also puts the other fighter off to one
     * side of the frame rather than directly beyond the near one's head.
     */
    fixedBearing: Math.PI / 4,
    /**
     * How far `[` and `]` swing that bearing, in radians.
     *
     * Forty-five degrees gives eight bearings around the circle, which is as fine
     * as a debugging convenience needs to be -- the point of the keys is to look at
     * the far side of a fight, not to compose a shot. Diablo has no such control;
     * an arena you are trying to read the rig through benefits from one.
     */
    bearingStep: Math.PI / 4,
    /**
     * How long a mode change holds the `#mode` banner, in seconds.
     *
     * The banner is targeting's, and targeting speaks through it in the present
     * tense: `SELECT TARGET` stands for exactly as long as the choice is armed.
     * The camera has no such level worth showing, because which camera you are
     * looking through is the one piece of state you can already see, so it borrows
     * the line as a notice that expires instead. A permanent camera label was the
     * alternative and it is the on-screen version of a comment that restates the
     * code.
     */
    noticeSeconds: 2.2,

    /**
     * Camera lag, shared. Lower = the arena swims; higher = rigid and readable.
     *
     * This is also what carries a mode change. Switching cameras mid-stride moves
     * both goals at once, and at 9 the blend walks across in about a tenth of a
     * second, so nothing has to reach for the snap path -- which exists for the
     * first frame of the page and should stay that way.
     */
    followResponse: 9,
    /** Read once, when `buildArena` constructs the camera, so unlike everything
     *  else in this block it is not live from the console. Shared: the two modes
     *  differ in where they stand, not in what lens they are wearing. */
    fov: 0.95,

    /** Wheel zoom, shared. `distance` and `height` are both scaled, so the camera
     *  slides along its own sight line to the fighter's feet. */
    zoomStep: 0.09,
    zoomMin: 0.45,
    zoomMax: 2.10,
    zoomResponse: 12,

    /**
     * The trailing chase.
     *
     * Every number here is exactly what the prototype had before there was
     * anything to choose between, and that is a requirement rather than an
     * accident: the session that made the framing movable is not the session that
     * gets to retune it, or nobody could tell a regression from an opinion.
     */
    overhead: {
      /** Horizontal distance the camera trails behind the fighter. */
      distance: 4.0,
      /** Height above the ground. Well above the head, looking down, so you can
       *  read where the blade is in the arena rather than staring at a haircut. */
      height: 3.8,
      /** The camera aims at a point ahead of the fighter, not at the fighter. */
      lookAhead: 1.8,
      lookHeight: 0.9,
    },

    /**
     * The Diablo reading: steeper, and looking at the character rather than ahead
     * of it.
     *
     * These are geometry rather than play. Taken against the look point, the sight
     * line drops about 52 degrees below the horizontal where Overhead's drops 27,
     * and the range from camera to look point is 6.2 m against Overhead's 6.5 -- so
     * the two frame a comparable amount of arena while reading it at very different
     * angles. That last part is the reason `distance` is not simply smaller: a
     * steeper camera foreshortens the ground less, so it sees fewer metres of depth
     * per screen at the same range, and pulling in as well would have framed a good
     * deal less of the fight than Overhead does.
     *
     * Nobody has swung a sword under this camera yet. Whoever does should check
     * the two things geometry cannot answer -- whether a blade held high leaves the
     * top of the frame, and whether the arm still reads as attached to a person
     * when screen right and body right have parted company -- and write what they
     * find here.
     */
    fixed: {
      distance: 3.8,
      height: 6.0,
      /**
       * Zero, and it is not the same knob it is above.
       *
       * Under Fixed the forward vector is a constant, so what this scales is no
       * longer "ahead of the fighter": it is a fixed shove of the whole frame
       * toward one corner of the screen, which turns with nothing and means
       * nothing. The only value that leaves the character where the camera is
       * supposedly looking is none at all. It stays a knob because sliding the
       * fighter off centre is a legitimate thing to want; it simply buys something
       * different here than it does above.
       */
      lookAhead: 0,
      /** With no look-ahead this alone decides what sits at the centre of the
       *  frame. The chest, because the volume the blade actually sweeps runs from
       *  about the knee to a little over the head, and its middle is here rather
       *  than at the waist that Overhead's 0.9 aims at from much further ahead. */
      lookHeight: 1.15,
    },
  },

  targeting: {
    /** How hard a fighter turns to keep a locked enemy in front, per radian of
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

  /**
   * Taking a body, on `C`.
   *
   * The interaction reuses `targeting`'s numbers above -- the same ring radius
   * and the same outline width -- because it is deliberately the same two-step
   * gesture with a wider predicate, and two rings that meant the same thing at
   * two sizes would read as two different things.
   */
  takeover: {
    /**
     * How long the commanded cursor takes to walk from the pose a handover found
     * to the pose its new driver is asking for, in seconds.
     *
     * The seed alone -- writing the found pose into the new driver's intent -- is
     * what makes the takeover frame itself exact. Measured in the headless bench
     * (`.review/takeover-probe.mjs`: one fighter sweeping 1.8 cursor units every
     * half second, taken at four different points of the sweep, commanded hand
     * jump on the step after the swap, in millimetres):
     *
     *     tip at the swap   take seeded   take bare   give seeded   give bare
     *       20.49 m/s          0.000         257.2       0.000         270.5
     *       13.42              0.000         365.7       0.000         379.4
     *        9.79              0.000         462.9       0.000         476.9
     *        6.74              0.000         506.4       0.000         520.5
     *
     * Exactly zero, not nearly zero, because the seed is the inverse of the map
     * the arm is about to apply and the round trip is exact. "Bare" is the same
     * swap with the seed taken away, which is what the page did before this
     * session: a quarter to half a metre of hand asked for in a single 1/240 s
     * substep at the 850 N linear ceiling. Note that giving a body *back* to a
     * policy is the worse of the two -- a freshly built `swinger` parks its
     * cursor at centre guard on its first `decide` -- so a session that had
     * seeded only the taking half would have fixed the half that was easier to
     * notice.
     *
     * The blade's own point is not a usable reading here and the same run says
     * why: over the one substep after the swap it moved 21 to 68 mm *seeded* and
     * 27 to 76 mm bare, because a blade at 20 m/s covers 83 mm in a substep no
     * matter who is holding it. A tip figure cannot carry a 20 mm acceptance
     * unless the body is standing still, which is why `__sword.takeover` reports
     * the commanded hand and reports the tip beside it with a warning.
     *
     * What the seed cannot do is survive the *next* frame, because a person's
     * cursor is absolute and `Controls` writes its true position back on the next
     * mouse event, and because a policy handed a body asks for its own cursor
     * immediately. So the blade would not teleport on the frame anybody measured
     * and would teleport on the one after it.
     *
     * This is the width of that bridge. It is a choice rather than a sweep, and
     * the argument for the value is what it implies about hand speed: the aiming
     * envelope is 2.45 rad of azimuth by 2.30 of elevation, so crossing the whole
     * of it at a 0.45 m neutral reach is about 1.1 m of hand travel, and 0.25 s
     * of it is 4.4 m/s. That is brisk -- a walk-in is 2.9 m/s -- and it is well
     * under the 10 to 40 m/s a committed cut puts through the tip, so a rebase
     * can never be mistaken for an attack, and it cannot land one either:
     * `combat.minCutSpeed` is 3.0 m/s at the *tip*, which a hand crossing at 4.4
     * would clear, so this is the one number in the block that somebody should
     * watch in the page. If a takeover is ever seen to cut, halve it.
     *
     * Set it to 0 and the bridge disappears, leaving exactly the seed the plan
     * for session 07 asks for and nothing else. That is kept working on purpose:
     * it is the control condition for any argument about whether the bridge is
     * worth having, and it takes effect on the next handover with nothing to
     * rebuild.
     */
    rebaseSeconds: 0.25,
    /**
     * How much wider than `targeting.ringRadius` a candidate's ring is drawn.
     *
     * Wider than the lock ring's 1.16, so that the two are told apart by size as
     * well as by colour when a lock is up and a takeover is armed at the same
     * time -- which is a state you can be in, because a lock survives a handover.
     *
     * Read once, when the torus is built, like `targeting.ringRadius` beside it:
     * it is geometry rather than a gain, so changing it from the console does
     * nothing until the page is reloaded. `rebaseSeconds` above is the live one.
     */
    ringScale: 1.42,
  },

  /**
   * The rig overlay, on `G`.
   *
   * What Havok is actually solving, drawn over the top of whatever the scene is
   * wearing. The rig is this prototype's entire subject and it was the one thing
   * in the scene that could not be looked at: the torso capsule has been hidden
   * since the cosmetic figure landed, and both control anchors are massless,
   * collide with nothing and are drawn by nobody. Every number in the `arm` block
   * above was measured through a bench harness and console instrumentation
   * because of that, and the two headline ones -- hand-to-anchor error and elbow
   * drift -- are now readable live, in the page, from the same quantities.
   *
   * There is deliberately no `lineWidth` in here, and the absence is the point.
   * Babylon's `LinesMesh` carries a colour and an alpha and nothing else, because
   * WebGL rasterises every line at one pixel regardless of what is asked for. A
   * width knob would therefore be a control that silently cannot be honoured,
   * which is worse than no knob at all. What is tunable instead is how *long* the
   * drawn glyphs are, which is the thing that actually decides whether the
   * overlay can be read at the distance this camera sits at.
   *
   * Frame cost: not recorded yet, and owed. It cannot be taken from an automated
   * or backgrounded tab -- Chrome does not paint WebGL in one at all, so any
   * figure from there measures the wrong thing. Take it at a visible browser as
   * the difference in the readout's `fps` and `physics N ms` figures with the
   * overlay up and down on the same view, bracketed control-subject-control in
   * one sitting rather than as best-of-N across sittings, and write it here.
   */
  rigView: {
    /**
     * Which layers are on.
     *
     * Booleans in this block rather than four more keys on the keyboard. The
     * overlay is one instrument with parts, not four instruments; and a part is
     * the sort of thing you switch off once while chasing something specific and
     * then forget you own, which is a bad fit for a keybinding and a good fit for
     * a line you can see in the config.
     *
     * `shapes` draws collision geometry from `body.getGeometry()` -- the shape
     * the solver holds, not the mesh the renderer draws -- along with the sword's
     * inertia box. `anchors` draws everything about *commands*: the hand anchor's
     * frame, the error line to the hand, the solved elbow and its pole, and the
     * shoulder-to-hand segment the arm is being asked for. `contacts` draws the
     * recent entries of the combat log.
     *
     * `joints` draws joint frames, both fighters', and it now includes the four
     * of the sword arm -- the grip, the shoulder, the elbow hinge and the elbow's
     * pole drive -- which were the interesting ones and were missing. They were
     * missing because a `Physics6DoFConstraint` registers itself nowhere, a
     * `PhysicsBody` cannot be asked what constrains it, and the V2 engine keeps
     * no constraint list, so the only handle on a constraint is whatever object
     * holds the reference; `Hero` held those four privately and the overlay
     * rightly stopped at the boundary rather than reaching in. `Fighter`
     * publishes them, which is the fix, and it is a fix that had to happen in the
     * class rather than in the instrument.
     */
    shapes: true,
    anchors: true,
    joints: true,
    contacts: true,

    /** Arm length of the hand anchor's axis cross, metres. About a third of the
     *  forearm, which is long enough to read the wrist roll off and short enough
     *  that it does not reach the blade and get confused with it. */
    crossSize: 0.09,
    /** How far the elbow's pole ray is drawn out from the shoulder, metres. It is
     *  a direction, not a position, so the length says nothing -- it only has to
     *  be long enough to compare against where the elbow actually went. */
    poleLength: 0.34,
    /** Diameter of the marker balls on the elbow point and on each contact. */
    markerSize: 0.028,
    /**
     * Size scalar handed to Babylon's `PhysicsViewer`, which multiplies 0.4 into
     * both the joint frame's axis length and its angular arc. 0.5 therefore draws
     * a 0.2 m frame -- roughly a forearm bone here, and about as large as it can
     * be before the frames on two adjacent joints overlap and stop being legible.
     */
    jointAxesScale: 0.5,

    /** How many of the combat log's contacts to draw. The log itself keeps 24;
     *  eight is about as many as can be told apart before they pile up on each
     *  other, and a fight rarely lands more than that in one exchange. */
    contactHistory: 8,
    /** Metres of drawn arrow per metre per second of contact speed. A cut does
     *  full damage at 11 m/s, so this puts a good one at 0.22 m -- a quarter of a
     *  blade, which reads as a vector rather than as a smear. */
    contactVelocityScale: 0.02,
    /** Half-length of the edge-axis segment drawn at a contact, metres. Drawn
     *  symmetrically because the blade is double-edged and the damage model makes
     *  no distinction between -X and +X. */
    contactEdgeLength: 0.10,

    /**
     * Where the error line goes fully red, in metres of anchor-to-hand distance.
     *
     * Measured, that distance is 0 mm across the whole aiming envelope at every
     * pole force tried up to 70 N.m -- see `arm.elbowPoleForce` -- so anything
     * visible on this line at all is news, and 30 mm of it is a serious
     * regression rather than a slightly loose grip.
     */
    errorSpan: 0.03,
    /**
     * Seconds of elbow travel the drift number sums. One second, to match the
     * window the pole-vector table's "drift while the hand is still" was taken
     * over: 127 mm without a pole vector, 0 mm with one.
     *
     * Measured on the real elbow, not on the elbow anchor. `driveElbow` keyframes
     * that anchor onto its analytic solution every step whether the arm follows
     * or not, so an anchor-derived drift would read zero even at
     * `elbowPoleForce: 0` -- which is the exact setting that produced the rope.
     */
    driftWindow: 1,

    /** Colours as linear RGB triples, 0..1. */
    colours: {
      /** The anchor cross, in the usual X-red, Y-green, Z-blue convention, so
       *  the frame can be read against Babylon's own gizmos without translation. */
      axisX: [0.95, 0.32, 0.32],
      axisY: [0.42, 0.92, 0.42],
      axisZ: [0.38, 0.58, 0.98],
      /** The error line ramps between these two over `errorSpan`. */
      errorLow: [0.35, 0.95, 0.55],
      errorHigh: [1.0, 0.28, 0.22],
      /** The shoulder-to-hand segment, in the aim indicator's amber, because it
       *  is the same command read at a different point along the blade. */
      aim: [0.98, 0.72, 0.32],
      /** Shoulder to elbow to hand, kinked through the elbow the inverse
       *  kinematics asked for. */
      chain: [0.55, 0.78, 1.0],
      pole: [0.72, 0.45, 0.95],
      /** The ball on the arm's *real* elbow -- the hinge -- which is a different
       *  point from the chain's kink, and the gap between them is the reading. */
      elbow: [0.62, 0.82, 1.0],
      contact: [1.0, 0.86, 0.30],
      contactVelocity: [1.0, 0.55, 0.20],
      contactEdge: [0.40, 0.95, 0.90],
    },
    /** Line opacity. Not fully opaque, so a line crossing the blade still reads
     *  as a line over the blade rather than as a mark on it. */
    alpha: 0.85,
  },
};

export type Config = typeof CONFIG;
