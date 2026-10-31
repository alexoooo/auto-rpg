import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { COMMAND, commandRefusal, type Body, type BodyCommand, type BodyDriver, type BodyView, type Fist, type LayerOptions } from "../body.ts";
import type { Clock } from "../clock.ts";
import type { OwnBody } from "../mind/mind.ts";
import { NOTHING_SENSED, type Senses } from "../mind/senses.ts";
import type { HostMind } from "../mind/sub-mind.ts";
import { centreReading } from "../observation.ts";
import type { ReadBody, ReadSegment } from "../read-body.ts";
import { groundReading } from "../recovery/ground/reading.ts";
import type { Side } from "../spec/body.ts";
import { dot } from "../spec/vec.ts";
import { effectorFeedback } from "./effector-feedback.ts";
import { uprightness } from "./ground.ts";
import { rootFrameToRef } from "./kinematics.ts";
import { carrying, motorControl, type EffectorGoal, type PointTask } from "./motor.ts";
import { stanceEnvelope } from "./stance-envelope.ts";
import { standingHeight } from "./support.ts";

/**
 * **The command layers as a mind** (`commandLayers`): motor control under a driver that hands it
 * goals (`BodyDriver`), seen through a view. Each step it reads the view (`look`), then asks the
 * driver for a command and gives the command to motor control, which writes the muscles (`act`).
 * A mind that hands its body over hosts them (`HostMind`): released, motor control forgets what was
 * under way, so while another has the body the view shows no stance asked and the body is down by
 * its standing height; resumed, the driver is told (`BodyView.resumed`).
 */
export interface CommandLayers extends HostMind {
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
 * labelled by the body's own contact labels (`OwnBody.contactIdentity`). They read a fist on each
 * side, a box sole under each foot and a head (`commandRefusal`), and refuse a body without them.
 * Their touch is read after each completed physics interval (`OwnBody.afterPhysics`), before any
 * observer added after them.
 */
export function commandLayers(own: OwnBody, options: LayerOptions, clock: Clock): CommandLayers {
  const refused = commandRefusal(own.spec);
  if (refused) throw new Error(`${own.spec.model}: ${refused}`);
  const { servoSeconds, stance, feedback: feedbackEnabled, contacts, motor: makeMotor } = options;
  const { built, muscles } = own;
  // The command layers' vocabulary is every goal a motor may carry out (`BodyCommand`).
  const motor = carrying((makeMotor ?? motorControl)(built, servoSeconds, {}, stance, own.assist), ["effectors", "points", "stance"], "the command layers");
  const feedback = feedbackEnabled ? effectorFeedback(built, motor.effectors.map(e => e.segment), own.contactIdentity,
    segment => contacts?.(segment) ?? []) : null;
  const fists = { left: fistOf(built, "left"), right: fistOf(built, "right") };
  const head = centreReading(built, "head");
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
    fists: { left: fists.left.fist, right: fists.right.fist },
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
  };
  // A hand is asked its pose by its segment; the port names it by its own name.
  const posable = new Map(built.handPoses.model.map((hand) => [hand.segment, hand.hand]));
  const view = {
    handPoses: Object.fromEntries(built.handPoses.model.map((hand) => [hand.segment, built.handPoses.state[hand.hand]!])), effectors,
    get time() { return state.time; },
    get born() { return state.born ?? state.time; },
    senses: NOTHING_SENSED,
    angles,
    fists: state.fists,
    root: state.root,
    head: head.centre,
    stance: motor.stance.reading,
    unmet: motor.unmet,
    standing: standingHeight(built),
    get down() { return state.down; },
    get ground() { return state.groundActive ? ground.state.reading : null; },
    get resumed() { return state.resumed; },
  };
  let driver: BodyDriver | null = null;
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
    for (const task of command.points ?? []) {
      if (command.effectors?.[task.segment]) throw new Error(`two controllers own ${task.segment}`);
      const chain = motor.effectors.find((model) => model.segment === task.segment)?.channels ?? [];
      if (command.pushes.some((push) => chain.includes(push.channel))) throw new Error(`a push on ${task.segment}'s chain while its point is driven`);
      if (command.stance?.feet.some(side => task.segment === `foot.${side}`)) throw new Error(`two controllers own ${task.segment}`);
      if (!task.accel && !task.spin) throw new Error(`a point driven on ${task.segment} needs an acceleration or a spin`);
      if (![...task.accel ?? [], ...task.spin ?? []].every(Number.isFinite)) throw new Error(`a point driven on ${task.segment} needs a finite acceleration and spin`);
    }
    motor.setPushes(command.pushes);
    motor.setPoints(command.points ?? NO_POINTS);
    motor.setStance(command.stance);
    state.held = command.stance ? null : command.held ?? null;
    for (const segment in goals) {
      const goal = command.effectors?.[segment] ?? null, was = goals[segment];
      if (!goal) { if (was) motor.release(segment); }
      else if (!was || !sameGoal(goal, was)) motor.reach(segment, goal);
      goals[segment] = goal;
    }
  };
  obey(restCommand());

  const look = (senses: Senses): void => {
    state.time = senses.time;
    state.born ??= senses.time;
    view.senses = senses;
    muscles.channels.forEach((c, i) => { angles[c.name] = muscles.angle(i); });
    fists.left.update();
    fists.right.update();
    rootFrameToRef(motor.root, state.root);
    for (const segment in effectors) {
      const out = effectors[segment]!, part = built.segments.get(segment)!;
      for (const name in out.points) motor.pointToRef(segment, name, out.points[name]!);
      part.node.rotationQuaternion!.multiplyToRef(Quaternion.InverseToRef(part.rest, inverse), segmentTurn);
      Quaternion.InverseToRef(state.root.rotation, rootTurn).multiplyToRef(segmentTurn, out.rotation).normalize();
    }
    head.update();
    motor.stance.read();
    const standing = motor.standing;
    state.down = upright.down(standing ? standing.height : state.held ?? undefined, standing?.pose !== undefined);
    state.groundActive = state.down || state.released || state.groundActive && standing === null;
    if (state.groundActive) ground.read();
    else ground.reset();
  };
  const act = (dt: number): void => {
    const next = driver?.(view, dt);
    if (next) obey(next);
    motor.control(muscles, dt);
    state.resumed = false;
  };
  const drive: Body["drive"] = (next, onRelease) => { if (driver && driver !== next) released?.(view, "replaced"); driver = next; released = onRelease; };
  own.afterPhysics((step) => { feedback?.read(step); });
  const envelope = !options.measuring && Object.keys(stance ?? {}).length === 0 ? stanceEnvelope(own.spec) : null;
  const body: Body = { built, muscles, assist: own.assist, view, envelope, drive, afterPhysics: own.afterPhysics };
  return {
    name: COMMAND,
    view, body, look, act, state,
    firstLook() {
      feedback?.read(clock.steps);
      look(own.senses());
    },
    step(senses, dt) { look(senses); act(dt); },
    release(reason = "takeover") {
      state.released = true;
      released?.(view, reason);
      motor.reset();
      for (const segment in goals) goals[segment] = null;
    },
    resume() { state.released = false; state.resumed = true; },
    dispose() { drive(null); },
  };
}

/** No point driven. */
const NO_POINTS: readonly PointTask[] = Object.freeze([]);

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
 * The knuckles (`SegmentSpec.points`) of `hand`, where a fist strikes, and their velocity from the
 * hand body's: its centre's (the engine's linear velocity is the centre of mass's), plus its spin
 * across the arm from the centre to the knuckles. Not the segment's far end: the hand segment runs
 * on to the fingertips, where a whip of the wrist would read as a punch. Not differenced from the
 * nodes: the engine moves a body by more than its velocity when it corrects a constraint's error.
 */
function fistOf(built: ReadBody, side: Side): { fist: Fist; update(): void } {
  const hand: ReadSegment | undefined = built.segments.get(`hand.${side}`);
  const knuckles = hand?.spec.points?.knuckles;
  if (!hand || !knuckles) throw new Error(`${built.spec.model} has no ${side} hand with knuckles`);
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
      const turn = hand.node.rotationQuaternion!;
      arm.applyRotationQuaternionToRef(turn, lever);
      centre.applyRotationQuaternionToRef(turn, fist.position).addInPlace(hand.node.position).addInPlace(lever);
      hand.body.linearVelocityToRef(fist.velocity);
      hand.body.angularVelocityToRef(angular);
      fist.velocity.addInPlace(Vector3.CrossToRef(angular, lever, angular));
    },
  };
}
