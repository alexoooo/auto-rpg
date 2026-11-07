import { rigidPoints } from "../core/bodies/build/rigid.ts";
import type { BodyControl } from "../core/bodies/body-control.ts";
import { Quaternion, Vector3 } from "../core/math/vector.ts";
import { COMMAND, type Body, type BodyCommand, type BodyView, type PointMotion, type LayerOptions, type SplitDriver } from "../control/body.ts";
import type { Clock } from "../core/world/clock.ts";
import type { OwnBody } from "../core/bodies/own-body.ts";
import { NOTHING_SENSED, type Senses } from "../core/bodies/senses.ts";
import { centreReading } from "../control/observation.ts";
import type { ReadBody, ReadSegment } from "../core/bodies/read-body.ts";
import { groundReading } from "../control/ground-reading.ts";
import { dot } from "../core/bodies/spec/vec.ts";
import { effectorFeedback } from "../control/effector-feedback.ts";
import { uprightness } from "../control/ground.ts";
import { rootFrameToRef } from "../control/kinematics.ts";
import { carries, carrying, sameEffectorGoal, type EffectorGoal, type FreedomPath, type PointTask } from "../control/motor.ts";
import type { Mind } from "./mind.ts";

/**
 * Motor control under a split driver. `think` queues decisions; `act` reads the current body and
 * carries the due decision into motor commands. `observe` samples completed physics before any
 * holder acts. Releasing clears pending work and motor goals; resuming tells the driver.
 */
interface CommandLayers extends LayersMind {
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
 * drives them, on `clock`: motor control of the maker `options` names, the view, and the effectors'
 * touch where `options` asks for it (`LayerOptions.feedback`),
 * labelled by the body's own contact labels (`OwnBody.contactIdentity`). They read the body as its
 * spec has it: motion of each effector's named points, the head where another body aims
 * high (`BodySpec.marks`), and what bears it on the ground (`groundReading`); what their motor
 * cannot drive, it refuses as it is made (the stance a body without soles), and a command that
 * asks a goal their motor does not carry (`MotorControl.carries`), as it is given. Their touch is read
 * before each full-level action (`CommandLayers.observe`), before any observer added after
 * them.
 */
export function commandLayers(own: OwnBody, options: LayerOptions, clock: Clock): CommandLayers {
  const { servoSeconds, stance, feedback: feedbackEnabled, contacts, motor: makeMotor } = options;
  const { built, muscles } = own;
  // The command layers' vocabulary is every goal a motor may carry out (`BodyCommand`): its effectors' places, and whichever of the rest it carries.
  const made = makeMotor.make(built, muscles, servoSeconds, {}, stance, own.assist);
  const motor = carrying(made, ["effectors"], "the command layers");
  const pointing = carries(made, "points") ? made : null, balancing = carries(made, "stance") ? made : null;
  const supporting = carries(made, "support") ? made : null, pathing = carries(made, "paths") ? made : null;
  // An effector's touch is its segment's and that of the segments that hang from it and are no effector's: a head's, its jaw's.
  const reaching = new Set(motor.effectors.map(e => e.segment));
  const hung = (segment: string): string[] => built.spec.joints.flatMap((joint) => joint.parent === segment && !reaching.has(joint.child) ? [joint.child, ...hung(joint.child)] : []);
  const feedback = feedbackEnabled ? effectorFeedback(built, motor.effectors.map(e => e.segment), own.contactIdentity,
    segment => contacts?.(segment) ?? [], undefined, hung) : null;
  const points = (own.spec.effectors ?? []).flatMap((effector) => {
    const segment = built.segments.get(effector.segment);
    if (!segment) throw new Error(`no effector segment ${effector.segment}`);
    return [...rigidPoints(own.spec, segment.spec).keys()]
      .map((name) => ({ segment: effector.segment, name, sample: pointMotionOf(built, effector.segment, name) }));
  });
  const pointMotion = Object.fromEntries((own.spec.effectors ?? []).map((effector) => [effector.segment,
    Object.fromEntries(points.filter((point) => point.segment === effector.segment).map((point) => [point.name, point.sample.motion]))]));
  const endSegments = new Map((own.spec.ends ?? []).map((end) => [end.name, end.segment]));
  const bears = (command: BodyCommand, segment: string): boolean => command.stance?.feet.some((end) => endSegments.get(end) === segment) ?? false;
  const head = centreReading(built, own.spec.marks.high);
  const angles: Record<string, number> = {};
  const upright = uprightness(built);
  const ground = groundReading(built, clock.dt);
  const goals: Record<string, EffectorGoal | null> = Object.fromEntries(motor.effectors.map(e => [e.segment, null]));
  const effectors = Object.fromEntries(motor.effectors.map(e => [e.segment, {
    points: Object.fromEntries(Object.keys(e.points).map(name => [name, new Vector3()])), rotation: new Quaternion(),
    ...(feedback ? { feedback: feedback.state[e.segment]! } : {}),
  }]));
  const segments = Object.fromEntries([...built.segments.keys()].map(name => [name, { position: new Vector3(), rotation: new Quaternion() }]));
  const observedSegments = Object.fromEntries([...built.segments].map(([name, segment]) => [name, { ...segments[name]!,
    rest: Object.freeze({ x: segment.rest.x, y: segment.rest.y, z: segment.rest.z, w: segment.rest.w }) }]));
  const inverse = new Quaternion(), segmentTurn = new Quaternion(), rootTurn = new Quaternion();
  // The view's own fields are the state's: between steps a view shows the step its state is of.
  const state = {
    goals, effectors, segments, time: 0, born: null as number | null, angles,
    pointMotion,
    root: { position: new Vector3(), rotation: new Quaternion() },
    head: head.centre,
    motor: motor.state,
    down: false,
    /** The height the last command held the body low at with no stance (`BodyCommand.held`), m, or null. */
    held: null as number | null,
    ground: ground.state,
    /** Whether the layers are released (`LayersMind.release`): another has the body, and the ground is read whatever the stance. */
    released: false,
    groundActive: false,
    resumed: false,
    /** At a delay, what the driver decided that it has not yet carried out, oldest first: null keeps the command. */
    pending: [] as unknown[],
    /** Whether the body was read this step, by the motor part before the look. */
    felt: false,
    /** The registered driver's memory, including its skills, decider and pacing. */
    driver: null as object | null,
  };
  // The step's reading: its stamp moves wherever the view may, so it is no state and carries nothing on.
  let stamp = 0;
  const moved = (): void => { stamp++; };
  const reading = { get stamp() { return stamp; } };
  const view = {
    configurations: built.configurations.state, effectors, segments: observedSegments,
    get time() { return state.time; },
    get born() { return state.born ?? state.time; },
    senses: NOTHING_SENSED,
    angles,
    pointMotion: state.pointMotion,
    root: state.root,
    head: head.centre,
    stance: motor.reading,
    unmet: motor.unmet,
    standing: makeMotor.reference?.read(built) ?? null,
    get down() { return state.down; },
    get ground() { return state.groundActive ? ground.state.reading : null; },
    get resumed() { return state.resumed; },
    reading,
  };
  let driver: SplitDriver<unknown> | null = null;
  let released: ((view: BodyView, reason: "takeover" | "idle" | "replaced") => void) | undefined;

  let current: BodyControl | null = null;
  const obey = (command: BodyCommand, control?: BodyControl): void => {
    if (command.assist && control) { control.assist.force.copyFrom(command.assist.force); control.assist.moment.copyFrom(command.assist.moment); }
    for (const [segment, goal] of Object.entries(command.effectors ?? {})) {
      if (!(segment in goals)) throw new Error(`no effector ${segment}`);
      if (goal && bears(command, segment)) throw new Error(`two controllers own ${segment}`);
    }
    // A motor asked a speed or level that is not a number would leave its body's island to the engine, which gives it up; an unbounded speed is directional (`MusclePush`).
    for (const push of command.pushes) if (!Number.isFinite(push.level) || Number.isNaN(push.speed)) throw new Error(`a push on ${push.channel} needs a finite level and a speed`);
    if (command.configurations && control) for (const segment in command.configurations) {
      control.configurations.request(segment, command.configurations[segment]!);
    }
    motor.setPosture(command.posture);
    const refused = command.points?.length && !pointing ? "driven points" : command.stance && !balancing ? "a stance" : command.support && !supporting ? "a support"
      : command.paths && Object.keys(command.paths).length && !pathing ? "freedoms' paths" : null;
    if (refused) throw new Error(`the command layers' motor carries no ${refused}`);
    for (const task of command.points ?? []) {
      if (command.effectors?.[task.segment]) throw new Error(`two controllers own ${task.segment}`);
      const chain = motor.effectors.find((model) => model.segment === task.segment)?.channels ?? [];
      if (command.pushes.some((push) => chain.includes(push.channel))) throw new Error(`a push on ${task.segment}'s chain while its point is driven`);
      if (bears(command, task.segment)) throw new Error(`two controllers own ${task.segment}`);
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
      else if (!was || !sameEffectorGoal(goal, was)) motor.reach(segment, goal);
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
    for (let i = 0; i < points.length; i++) points[i]!.sample.update();
    rootFrameToRef(motor.root, state.root);
    for (const name in segments) { const pose = built.segments.get(name)!.pose; segments[name]!.position.copyFrom(pose.position); segments[name]!.rotation.copyFrom(pose.rotation); }
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
  const act = (control: BodyControl): void => {
    current = control;
    const dt = clock.dt;
    feel(clock.time);
    state.felt = true;
    if (state.pending.length >= own.delay) {
      const due = state.pending.shift();
      if (due !== null && due !== undefined) state.born ??= clock.time;
      const next = due === null || due === undefined ? null : driver?.carry(view, due, dt);
      if (next) obey(next, control);
    }
    motor.control(muscles, control, dt);
    moved();
  };
  const drive: Body["drive"] = (next, onRelease) => {
    const split = typeof next === "function" ? { state: {}, decide: next, carry: carried } : next;
    if (driver && split?.decide !== driver.decide) { released?.(view, "replaced"); state.pending.length = 0; }
    driver = split;
    state.driver = split === null ? null : split.state;
    released = onRelease;
  };
  const listeners = new Set<(step: number, time: number) => void>();
  const afterPhysics: Body["afterPhysics"] = listener => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const envelope = makeMotor.envelope(own.spec, options);
  const body: Body = { dt: clock.dt,
    readCommand(out) {
      if (!current) { out.muscles.activation.fill(0); out.muscles.velocity.fill(0); out.assist.force.setAll(0); out.assist.moment.setAll(0); return; }
      out.muscles.activation.set(current.muscles.activation); out.muscles.velocity.set(current.muscles.velocity);
      out.assist.force.copyFrom(current.assist.force); out.assist.moment.copyFrom(current.assist.moment);
    }, built, muscles, assist: own.assist, view, envelope, drive, afterPhysics, delay: own.delay,
    ...(own.contactIdentity ? { contactIdentity: own.contactIdentity } : {}) };
  return {
    name: COMMAND,
    view, body, look, think, act, state,
    observe(control) {
      current = control;
      moved(); feedback?.read(clock.steps);
      for (const listener of listeners) listener(clock.steps, clock.time);
    },
    feel() {
      feel(clock.time);
      state.felt = true;
    },
    firstLook() {
      feedback?.read(clock.steps);
      look(own.first);
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
    dispose() { drive(null); listeners.clear(); },
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

/** A segment's named point and its rigid-body velocity, without differencing corrected poses. */
function pointMotionOf(built: ReadBody, segment: string, point: string): { motion: PointMotion; update(): void } {
  const part: ReadSegment | undefined = built.segments.get(segment);
  const named = part && rigidPoints(built.spec, part.spec).get(point);
  if (!part || !named) throw new Error(`${built.spec.model} has no point ${point} at ${segment}`);
  const { origin, x, y, z } = part.frame;
  const local = (p: readonly number[]) => { const o = p.map((c, i) => c - origin[i]!); return new Vector3(dot(o, x), dot(o, y), dot(o, z)); };
  // The rigid body's centre, and from it to the named point, in the segment's frame.
  const centre = local(part.rigid.centre);
  const arm = local(named.value).subtractInPlace(centre);
  const lever = new Vector3(), angular = new Vector3();
  const motion: PointMotion = { position: new Vector3(), velocity: new Vector3() };
  return {
    motion,
    update() {
      const turn = part.pose.rotation;
      arm.applyRotationQuaternionToRef(turn, lever);
      centre.applyRotationQuaternionToRef(turn, motion.position).addInPlace(part.pose.position).addInPlace(lever);
      part.body.linearVelocityToRef(motion.velocity);
      part.body.angularVelocityToRef(angular);
      motion.velocity.addInPlace(Vector3.CrossToRef(angular, lever, angular));
    },
  };
}

/** The host reads its body before deciding who controls it. */
export interface LayersMind extends Mind {
  look(senses: Senses): void;
  observe(control: BodyControl): void;
  feel(): void;
  release(reason?: "takeover" | "idle"): void;
  resume(): void;
}
