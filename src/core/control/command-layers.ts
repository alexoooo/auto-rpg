import { Quaternion, Vector3 } from "../math/vector.ts";
import { COMMAND, type Body, type BodyCommand, type BodyView, type Fist, type LayerOptions, type SplitDriver } from "../body.ts";
import type { Clock } from "../clock.ts";
import type { OwnBody } from "../mind/mind.ts";
import { NOTHING_SENSED, type Senses } from "../mind/senses.ts";
import type { HostMind } from "../mind/sub-mind.ts";
import { centreReading } from "../observation.ts";
import type { ReadBody, ReadSegment } from "../read-body.ts";
import { groundReading } from "./ground-reading.ts";
import { fistOn, type Side } from "../spec/body.ts";
import { dot } from "../spec/vec.ts";
import { effectorFeedback } from "./effector-feedback.ts";
import { uprightness } from "./ground.ts";
import { rootFrameToRef } from "./kinematics.ts";
import { carries, carrying, motorControl, type EffectorGoal, type FreedomPath, type PointTask } from "./motor.ts";
import { stanceEnvelope } from "./stance-envelope.ts";
import { standingHeight } from "./support.ts";

/**
 * **The command layers as a mind** (`commandLayers`): motor control under a driver that hands it
 * goals (`BodyDriver`), seen through a view. Each step it reads the view (`look`), then asks the
 * driver for a command and gives the command to motor control, which writes the muscles (`act`).
 * At a delay (`OwnBody.delay`) motor control is its motor part (`Mind.act`): it reads the body
 * as it is (`feel`), has the driver carry out what it decided the delay's steps before
 * (`SplitDriver.carry`) and carries the command out, and `act` only asks the driver to decide.
 * A mind that hands its body over hosts them (`HostMind`): released, motor control forgets what was
 * under way, so while another has the body the view shows no stance asked and the body is down by
 * its standing height; resumed, the driver is told (`BodyView.resumed`).
 */
export interface CommandLayers extends HostMind {
  readonly name: string;
  dispose(): void;
  /** The view as the last step left it, or as built before the first. */
  readonly view: BodyView;
  /** The body its drivers have: the one to hand a decider's skills, a skill or a script. */
  readonly body: Body;
  /**
   * Read the body as it stands, once, before the first step: the view a driver first finds. Called
   * after whatever is made over the view, which so finds it as built.
   */
  firstLook(): void;
}

/**
 * **The command layers over `own`** (`CommandLayers`), holding its reference pose until something
 * drives them, on `clock`: motor control of the maker `options` names (the whole-body solve unless
 * given), the view, and the effectors' touch where `options` asks for it (`LayerOptions.feedback`),
 * labelled by the body's own contact labels (`OwnBody.contactIdentity`). They read the body as its
 * spec has it: a fist for each hand with knuckles (`fistOn`), the head where another body aims
 * high (`BodySpec.marks`), and what bears it on the ground (`groundReading`); what their motor
 * cannot drive, it refuses as it is made (the stance a body without soles), and a command that
 * asks a goal their motor does not carry (`MotorControl.carries`), as it is given. Their touch is read
 * after each completed physics interval (`OwnBody.afterPhysics`), before any observer added after
 * them.
 */
export function commandLayers(own: OwnBody, options: LayerOptions, clock: Clock): CommandLayers {
  const { servoSeconds, stance, feedback: feedbackEnabled, contacts, motor: makeMotor } = options;
  const { built, muscles } = own;
  // The command layers' vocabulary is every goal a motor may carry out (`BodyCommand`): its effectors' places, and whichever of the rest it carries.
  const made = (makeMotor ?? ((b, _m, s, p, t, a) => motorControl(b, s, p, t, a)))(built, muscles, servoSeconds, {}, stance, own.assist);
  const motor = carrying(made, ["effectors"], "the command layers");
  const pointing = carries(made, "points") ? made : null, balancing = carries(made, "stance") ? made : null;
  const supporting = carries(made, "support") ? made : null, pathing = carries(made, "paths") ? made : null;
  // An effector's touch is its segment's and that of the segments that hang from it and are no effector's: a head's, its jaw's.
  const reaching = new Set(motor.effectors.map(e => e.segment));
  const hung = (segment: string): string[] => built.spec.joints.flatMap((joint) => joint.parent === segment && !reaching.has(joint.child) ? [joint.child, ...hung(joint.child)] : []);
  const feedback = feedbackEnabled ? effectorFeedback(built, motor.effectors.map(e => e.segment), own.contactIdentity,
    segment => contacts?.(segment) ?? [], undefined, hung) : null;
  const fists = (["left", "right"] as const).flatMap((side) => { const hand = fistOn(own.spec, side); return hand ? [[side, fistOf(built, hand)] as const] : []; });
  const head = centreReading(built, own.spec.marks.high);
  const angles: Record<string, number> = {};
  const upright = uprightness(built);
  const ground = groundReading(built, clock.dt);
  const goals: Record<string, EffectorGoal | null> = Object.fromEntries(motor.effectors.map(e => [e.segment, null]));
  const effectors = Object.fromEntries(motor.effectors.map(e => [e.segment, {
    points: Object.fromEntries(Object.keys(e.points).map(name => [name, new Vector3()])), rotation: new Quaternion(),
    ...(feedback ? { feedback: feedback.state[e.segment]! } : {}),
  }]));
  const inverse = new Quaternion(), segmentTurn = new Quaternion(), rootTurn = new Quaternion();
  // The view's own fields are the state's: between steps a view shows the step its state is of.
  const state = {
    goals, effectors, time: 0, born: null as number | null, angles,
    fists: Object.fromEntries(fists.map(([side, reading]) => [side, reading.fist])) as Partial<Record<Side, Fist>>,
    root: { position: new Vector3(), rotation: new Quaternion() },
    head: head.centre,
    motor: motor.state,
    down: false,
    /** The height the last command held the body low at with no stance (`BodyCommand.held`), m, or null. */
    held: null as number | null,
    ground: ground.state,
    /** Whether the layers are released (`HostMind.release`): another has the body, and the ground is read whatever the stance. */
    released: false,
    groundActive: false,
    resumed: false,
    /** At a delay, what the driver decided that it has not yet carried out, oldest first: null keeps the command. */
    pending: [] as unknown[],
    /** Whether the body was read this step, by the motor part before the look. */
    felt: false,
  };
  // A hand is asked its pose by its segment; the port names it by its own name.
  const posable = new Map(built.handPoses.model.map((hand) => [hand.segment, hand.hand]));
  // The step's reading: its stamp moves wherever the view may, so it is no state and carries nothing on.
  let stamp = 0;
  const moved = (): void => { stamp++; };
  const reading = { get stamp() { return stamp; } };
  const view = {
    handPoses: Object.fromEntries(built.handPoses.model.map((hand) => [hand.segment, built.handPoses.state[hand.hand]!])), effectors,
    get time() { return state.time; },
    get born() { return state.born ?? state.time; },
    senses: NOTHING_SENSED,
    angles,
    fists: state.fists,
    root: state.root,
    head: head.centre,
    stance: motor.reading,
    unmet: motor.unmet,
    standing: standingHeight(built),
    get down() { return state.down; },
    get ground() { return state.groundActive ? ground.state.reading : null; },
    get resumed() { return state.resumed; },
    reading,
  };
  let driver: SplitDriver<unknown> | null = null;
  let released: ((view: BodyView, reason: "takeover" | "idle" | "replaced") => void) | undefined;

  const obey = (command: BodyCommand): void => {
    for (const [segment, goal] of Object.entries(command.effectors ?? {})) {
      if (!(segment in goals)) throw new Error(`no effector ${segment}`);
      if (goal && command.stance?.feet.some(side => segment === `foot.${side}`)) throw new Error(`two controllers own ${segment}`);
    }
    // A motor asked a speed or level that is not a number would leave its body's island to the engine, which gives it up; an unbounded speed is directional (`MusclePush`).
    for (const push of command.pushes) if (!Number.isFinite(push.level) || Number.isNaN(push.speed)) throw new Error(`a push on ${push.channel} needs a finite level and a speed`);
    if (command.handPoses) own.requestHandPoses(Object.entries(command.handPoses).map(([segment, pose]) => {
      const hand = posable.get(segment);
      if (!hand) throw new Error(`no posable hand ${segment}`);
      return { hand, pose: pose! };
    }));
    motor.setPosture(command.posture);
    const refused = command.points?.length && !pointing ? "driven points" : command.stance && !balancing ? "a stance" : command.support && !supporting ? "a support"
      : command.paths && Object.keys(command.paths).length && !pathing ? "freedoms' paths" : null;
    if (refused) throw new Error(`the command layers' motor carries no ${refused}`);
    for (const task of command.points ?? []) {
      if (command.effectors?.[task.segment]) throw new Error(`two controllers own ${task.segment}`);
      const chain = motor.effectors.find((model) => model.segment === task.segment)?.channels ?? [];
      if (command.pushes.some((push) => chain.includes(push.channel))) throw new Error(`a push on ${task.segment}'s chain while its point is driven`);
      if (command.stance?.feet.some(side => task.segment === `foot.${side}`)) throw new Error(`two controllers own ${task.segment}`);
      if (!task.accel && !task.spin) throw new Error(`a point driven on ${task.segment} needs an acceleration or a spin`);
      if (![...task.accel ?? [], ...task.spin ?? []].every(Number.isFinite)) throw new Error(`a point driven on ${task.segment} needs a finite acceleration and spin`);
    }
    motor.setPushes(command.pushes);
    pointing?.setPoints(command.points ?? NO_POINTS);
    balancing?.setStance(command.stance);
    supporting?.setSupport(command.support ?? null);
    pathing?.setPaths(command.paths ?? NO_PATHS);
    state.held = command.stance || command.support ? null : command.held ?? null;
    for (const segment in goals) {
      const goal = command.effectors?.[segment] ?? null, was = goals[segment];
      if (!goal) { if (was) motor.release(segment); }
      else if (!was || !sameGoal(goal, was)) motor.reach(segment, goal);
      goals[segment] = goal;
    }
  };
  obey(restCommand());

  /** Read the body as it is at `time`: everything the view shows but the senses. */
  const feel = (time: number): void => {
    moved();
    state.time = time;
    // At a delay the body is born on the first step its driver's decision is carried out.
    muscles.channels.forEach((c, i) => { angles[c.name] = muscles.angle(i); });
    for (let i = 0; i < fists.length; i++) fists[i]![1].update();
    rootFrameToRef(motor.root, state.root);
    for (const segment in effectors) {
      const out = effectors[segment]!, part = built.segments.get(segment)!;
      for (const name in out.points) motor.pointToRef(segment, name, out.points[name]!);
      part.pose.rotation.multiplyToRef(Quaternion.InverseToRef(part.rest, inverse), segmentTurn);
      Quaternion.InverseToRef(state.root.rotation, rootTurn).multiplyToRef(segmentTurn, out.rotation).normalize();
    }
    head.update();
    motor.read();
    const standing = balancing?.standing ?? null, held = standing !== null || (supporting?.supported ?? null) !== null;
    state.down = upright.down(standing ? standing.height : state.held ?? undefined, standing?.pose !== undefined);
    state.groundActive = state.down || state.released || state.groundActive && !held;
    if (!state.groundActive) ground.reset();
    else ground.read();
  };
  const look = (senses: Senses): void => {
    // At a delay the motor part read the body before the look.
    if (state.felt) moved();
    else feel(senses.time);
    state.felt = false;
    view.senses = senses;
  };
  const think = (): void => {
    const dt = clock.dt;
    state.pending.push(driver ? driver.decide(view, dt) : null);
    state.resumed = false;
    moved();
  };
  const act = (): void => {
    const dt = clock.dt;
    feel(clock.time);
    state.felt = true;
    if (state.pending.length >= own.delay) {
      const due = state.pending.shift();
      if (due !== null && due !== undefined) state.born ??= clock.time;
      const next = due === null || due === undefined ? null : driver?.carry(view, due, dt);
      if (next) obey(next);
    }
    motor.control(muscles, dt);
    moved();
  };
  const drive: Body["drive"] = (next, onRelease) => {
    const split = typeof next === "function" ? { decide: next, carry: carried } : next;
    if (driver && split?.decide !== driver.decide) { released?.(view, "replaced"); state.pending.length = 0; }
    driver = split;
    released = onRelease;
  };
  own.afterPhysics((step) => { moved(); feedback?.read(step); });
  // What the stance holds walking, for a motor that stands the body by the stance.
  const envelope = balancing && !options.measuring && Object.keys(stance ?? {}).length === 0 ? stanceEnvelope(own.spec) : null;
  const body: Body = { dt: clock.dt, built, muscles, assist: own.assist, view, envelope, drive, afterPhysics: own.afterPhysics, delay: own.delay,
    ...(own.contactIdentity ? { contactIdentity: own.contactIdentity } : {}) };
  return {
    name: COMMAND,
    view, body, look, think, act, state,
    feel() {
        feel(clock.time);
      state.felt = true;
    },
    firstLook() {
      feedback?.read(clock.steps);
      look(own.senses());
    },
    interrupt() { this.release("idle"); },
    release(reason = "takeover") {
      state.released = true;
      state.pending.length = 0;
      released?.(view, reason);
      motor.reset();
      for (const segment in goals) goals[segment] = null;
    },
    resume() { state.released = false; state.resumed = true; },
    dispose() { drive(null); },
  };
}

/** A driver that decides its command whole carries out the command it decided. */
const carried = (_view: BodyView, command: unknown): BodyCommand | null => command as BodyCommand | null;

/** No point driven. */
const NO_POINTS: readonly PointTask[] = Object.freeze([]);

/** No freedom carried along a path. */
const NO_PATHS: Readonly<Record<string, FreedomPath>> = Object.freeze({});

/** A command that holds the reference pose. */
const restCommand = (): BodyCommand => ({ posture: {}, pushes: [], stance: null });

const sameGoal = (a: EffectorGoal, b: EffectorGoal): boolean =>
  (a.initialVelocity === b.initialVelocity || (a.initialVelocity !== undefined && b.initialVelocity !== undefined
    && a.initialVelocity.every((v, k) => v === b.initialVelocity![k])))
  && (a.terminalVelocity === b.terminalVelocity || (a.terminalVelocity !== undefined && b.terminalVelocity !== undefined
    && a.terminalVelocity.every((v, k) => v === b.terminalVelocity![k])))
  && (a.curve === b.curve || (a.curve !== undefined && b.curve !== undefined && a.curve.every((v, k) => v === b.curve![k])))
  && (a.orientation === b.orientation || (a.orientation !== undefined && b.orientation !== undefined
    && a.orientation.seconds === b.orientation.seconds && a.orientation.target.every((v, k) => v === b.orientation!.target[k])))
  && a.sequence === b.sequence && a.carried === b.carried
  && a.seconds === b.seconds && a.through === b.through && a.follows === b.follows && a.places.length === b.places.length
  && a.places.every((place, i) => place.point === b.places[i]!.point && place.position.every((v, k) => v === b.places[i]!.position[k]));

/**
 * The knuckles (`SegmentSpec.points`) of the hand `segment`, where a fist strikes, and their velocity from the
 * hand body's: its centre's (the engine's linear velocity is the centre of mass's), plus its spin
 * across the arm from the centre to the knuckles. Not the segment's far end: the hand segment runs
 * on to the fingertips, where a whip of the wrist would read as a punch. Not differenced from the
 * poses: the engine moves a body by more than its velocity when it corrects a constraint's error.
 */
function fistOf(built: ReadBody, segment: string): { fist: Fist; update(): void } {
  const hand: ReadSegment | undefined = built.segments.get(segment);
  const knuckles = hand?.spec.points?.knuckles;
  if (!hand || !knuckles) throw new Error(`${built.spec.model} has no hand with knuckles at ${segment}`);
  const { origin, x, y, z } = hand.frame;
  const local = (p: readonly number[]) => { const o = p.map((c, i) => c - origin[i]!); return new Vector3(dot(o, x), dot(o, y), dot(o, z)); };
  // The centre of mass (of the hand and what it holds), and from it to the knuckles, in the hand's own frame.
  const centre = local(hand.rigid.centre);
  const arm = local(knuckles.value).subtractInPlace(centre);
  const lever = new Vector3(), angular = new Vector3();
  const fist: Fist = { position: new Vector3(), velocity: new Vector3() };
  return {
    fist,
    update() {
      const turn = hand.pose.rotation;
      arm.applyRotationQuaternionToRef(turn, lever);
      centre.applyRotationQuaternionToRef(turn, fist.position).addInPlace(hand.pose.position).addInPlace(lever);
      hand.body.linearVelocityToRef(fist.velocity);
      hand.body.angularVelocityToRef(angular);
      fist.velocity.addInPlace(Vector3.CrossToRef(angular, lever, angular));
    },
  };
}
