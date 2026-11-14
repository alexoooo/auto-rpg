import type { Locomotion } from "../../../framework/locomotion-part.ts";
import type { Body } from "../../../../control/body.ts";
import { footOn } from "../../../../control/support.ts";
import { rootSegment } from "../../../../core/bodies/read-body.ts";
import { Vector3 } from "../../../../core/math/vector.ts";
import { sin, cos } from "../../../../core/math/real.ts";
import { recoveryNetwork, networkFaults, type Network } from "../../../../core/math/learning/recovery-network.ts";
import { legOf } from "../../shared/leg.ts";
import type { RunTrim } from "./cycle-run.ts";
import type { WalkRunState } from "./walk-run.ts";
import { act, ask, learnerOf, start } from "../../../../core/math/learning/learner.ts";

const JOINTS = Object.freeze(["hip flexion", "hip abduction", "hip internal rotation", "knee flexion", "ankle dorsiflexion", "ankle inversion"]);
const SIDES = Object.freeze(["left", "right"] as const);
const ROLES = Object.freeze(["stance", "swing"]);
const REFERENCE_INPUTS = Object.freeze(["command", "playback", "phase sin", "phase cos", "forward speed", "side speed", "vertical speed",
  "up forward", "up side", "up vertical", "facing sin", "facing cos", "spin forward", "spin side", "spin up", "height", "cross track",
  ...ROLES.flatMap(role => [`${role} contact`, `${role} foot forward`, `${role} foot side`, `${role} foot height`,
    ...JOINTS.flatMap(joint => [`${role} ${joint} angle`, `${role} ${joint} speed`])])]);
const STANCE_CONTROLS = Object.freeze(["height", "heading"] as const);

/** Named observations and actions shared by the game, seed transfer and scripted-order training. */
export const TRAVEL_LAYOUT = Object.freeze({
  inputs: Object.freeze([...REFERENCE_INPUTS, "requested forward", "requested side", "requested facing sin", "requested facing cos", "running", "move asked"]),
  outputs: Object.freeze([...ROLES.flatMap(role => JOINTS.map(joint => `${role} ${joint} velocity`)), ...STANCE_CONTROLS.map(name => `stance ${name}`)]),
});

/** One actor's bounded corrections around a native walk/run record at its trained decision interval. */
export interface LearnedRunSettings {
  readonly travel: Network;
  readonly reference: Network;
  readonly velocityScale: number;
  readonly referenceScale: number;
  /** Seconds between decisions. */
  readonly interval: number;
  readonly entry: "landing" | "first-lift";
  readonly trim: RunTrim;
  /** Native stance height correction in metres and heading correction in radians. */
  readonly stanceScale: Readonly<Record<typeof STANCE_CONTROLS[number], number>>;
}

/** Admission for one travel actor, its frozen reference and bounded native-controller corrections. */
export function learnedRunFaults(value: unknown): readonly string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["learned run settings must be an object"];
  const settings = value as LearnedRunSettings, faults: string[] = [];
  for (const [name, inputs, actions] of [["travel", TRAVEL_LAYOUT.inputs.length, TRAVEL_LAYOUT.outputs.length], ["reference", 49, 12]] as const) {
    const read = networkFaults(settings[name]);
    if (read.faults.length || read.inputs !== inputs || settings[name]?.actions !== actions) faults.push(`learned run ${name} needs a ${inputs}-input, ${actions}-action network`);
  }
  if (![settings.velocityScale, settings.referenceScale].every(x => Number.isFinite(x) && x >= 0)) faults.push("learned run scales must be finite and nonnegative");
  if (!(settings.interval > 0) || !Number.isFinite(settings.interval)) faults.push("learned run interval must be a finite positive number of seconds");
  if (settings.entry !== "landing" && settings.entry !== "first-lift") faults.push("learned run entry must be landing or first-lift");
  if (!["continuous", "at-pace", "after-pace"].includes(settings.trim)) faults.push("invalid learned run trim");
  const scales = settings.stanceScale;
  if (!scales || typeof scales !== "object" || Array.isArray(scales)
    || Object.keys(scales).length !== STANCE_CONTROLS.length
    || !STANCE_CONTROLS.every(name => Number.isFinite(scales[name]) && scales[name] >= 0)) faults.push("learned run stance scales need finite nonnegative bounds");
  return faults;
}

/**
 * One actor corrects the native walk/run and stop; its reference, muscle ceilings and permissions
 * stay fixed. `steered`, its actor is in learning mode: its network is left out and its learner
 * (`Learner.trained` false) is answered by a trainer, the reference still its record's.
 */
export function learnedRun(body: Body, motion: Locomotion & { readonly state: WalkRunState }, settings: LearnedRunSettings, settle: number, { steered = false }: { readonly steered?: boolean } = {}): Locomotion {
  const faults = learnedRunFaults(settings);
  if (faults.length) throw new Error(faults.join("; "));
  const travel = recoveryNetwork(settings.travel), reference = recoveryNetwork(settings.reference);
  const leg = legOf(body.built.spec), root = rootSegment(body.built);
  const ends = Object.fromEntries(SIDES.map(side => [side, footOn(body.built.spec, side)])) as Record<typeof SIDES[number], string>;
  const names = Object.fromEntries(SIDES.map(side => [side, JOINTS.map(name => {
    const [joint, ...motion] = name.split(" "); return `${joint}.${side} ${motion.join(" ")}`;
  })])) as Record<typeof SIDES[number], string[]>;
  const channels = Object.fromEntries(SIDES.map(side => [side, names[side].map(name => body.muscles.channel(name))])) as Record<typeof SIDES[number], number[]>;
  const up = new Vector3(), forward = new Vector3(), spin = new Vector3();
  const inference = {
    observation: new Array<number>(TRAVEL_LAYOUT.inputs.length).fill(0), referenceObservation: new Array<number>(49).fill(0),
    action: new Array<number>(TRAVEL_LAYOUT.outputs.length).fill(0), referenceAction: new Array<number>(12).fill(0),
    travel: false,
    offsets: { left: new Array<number>(6).fill(0), right: new Array<number>(6).fill(0) },
    origin: { x: body.view.stance.centre.x, z: body.view.stance.centre.z },
    previousCentre: { x: body.view.stance.centre.x, z: body.view.stance.centre.z }, moving: false, face: 0, command: 0,
  };
  const learner = learnerOf(TRAVEL_LAYOUT.inputs.length, settings.interval, { running: true, trained: !steered });
  const state = { motion: motion.state, inference, learner };
  const decide = (): void => {
    const observation = inference.observation;
    for (let i = 0; i < 49; i++) inference.referenceObservation[i] = observation[i]!;
    inference.referenceAction = reference(inference.referenceObservation);
    for (let i = 0; i < observation.length; i++) learner.inputs[i] = observation[i]!;
  };
  const goal: Locomotion["goal"] = (view, asked, dt, context) => {
    const forwardOrder = asked.walk?.[0] ?? 0, sideOrder = asked.walk?.[1] ?? 0;
    const command = Math.sqrt(forwardOrder * forwardOrder + sideOrder * sideOrder), moving = command > 0;
    const inputHeading = motion.heading;
    const requestedX = forwardOrder * sin(inputHeading) + sideOrder * cos(inputHeading);
    const requestedZ = forwardOrder * cos(inputHeading) - sideOrder * sin(inputHeading);
    if (view.down) inference.travel = false;
    else if (moving) inference.travel = true;
    if (moving && !inference.moving) Object.assign(inference.origin, inference.previousCentre);
    else if (moving && asked.face !== inference.face) Object.assign(inference.origin, { x: view.stance.centre.x, z: view.stance.centre.z });
    inference.moving = moving; inference.face = asked.face; inference.command = command;
    const answer = act(learner, steered ? undefined : travel);
    if (answer.length) for (let i = 0; i < inference.action.length; i++) inference.action[i] = answer[i]!;
    const driven = motion.goal(view, asked, dt, context);
    const s = view.stance, phase = motion.state.run.phase, h = motion.state.walkRun.heading;
    const fx = sin(h), fz = cos(h), rx = fz, rz = -fx;
    const side = phase < .5 ? "left" : "right", opposite = side === "left" ? "right" : "left", mirror = side === "left" ? 1 : -1;
    const pushes = driven.kind !== "drive" ? null : driven.pushes.map(push => {
      let i = names[side].indexOf(push.channel);
      if (i < 0) { const other = names[opposite].indexOf(push.channel); i = other < 0 ? -1 : other + 6; }
      if (i < 0 || push.speed === undefined) return push;
      const physical = i < 6 ? side : opposite, channel = i % 6, before = inference.offsets[physical][channel]!;
      const offset = before + Math.min(1, 30 * dt) * (inference.referenceAction[i]! * settings.referenceScale - before);
      inference.offsets[physical][channel] = offset;
      let speed = push.speed + offset / settle + (offset - before) / dt;
      if (inference.action[i] !== 0) speed += inference.action[i]! * settings.velocityScale;
      return { ...push, speed, sense: speed >= 0 ? 1 as const : -1 as const };
    });
    up.set(0, 1, 0).applyRotationQuaternionToRef(view.root.rotation, up);
    forward.set(0, 0, 1).applyRotationQuaternionToRef(view.root.rotation, forward);
    const horizontal = Math.max(1e-9, Math.sqrt(forward.x * forward.x + forward.z * forward.z));
    root.body.angularVelocityToRef(spin);
    const observation = inference.observation;
    observation.length = 0;
    observation.push(command, motion.state.run.pace,
      sin(4 * Math.PI * phase), cos(4 * Math.PI * phase),
      s.velocity.x * fx + s.velocity.z * fz, mirror * (s.velocity.x * rx + s.velocity.z * rz), s.velocity.y,
      up.x * fx + up.z * fz, mirror * (up.x * rx + up.z * rz), up.y,
      mirror * (forward.x * rx + forward.z * rz) / horizontal, (forward.x * fx + forward.z * fz) / horizontal,
      mirror * (spin.x * fx + spin.z * fz), spin.x * rx + spin.z * rz, mirror * spin.y,
      (s.centre.y - Math.min(s.ends[ends.left]!.middle.y, s.ends[ends.right]!.middle.y)) / leg,
      mirror * ((s.centre.x - inference.origin.x) * rx + (s.centre.z - inference.origin.z) * rz) / leg);
    for (const physical of [side, opposite] as const) {
      const foot = s.ends[ends[physical]]!, dx = foot.middle.x - s.centre.x, dz = foot.middle.z - s.centre.z;
      observation.push(foot.touching ? 1 : 0, (dx * fx + dz * fz) / leg, mirror * (dx * rx + dz * rz) / leg, (foot.middle.y - s.centre.y) / leg);
      for (const channel of channels[physical]) observation.push(body.muscles.angle(channel), body.muscles.speed(channel) / 10);
    }
    observation.push(requestedX * fx + requestedZ * fz, mirror * (requestedX * rx + requestedZ * rz),
      mirror * sin(asked.face - h), cos(asked.face - h), motion.state.walkRun.running ? 1 : 0, moving ? 1 : 0);
    inference.previousCentre.x = s.centre.x; inference.previousCentre.z = s.centre.z;
    if (ask(learner, dt)) decide();
    if (driven.kind === "drive") return { ...driven, pushes: pushes! };
    if (driven.kind !== "stance" || !driven.goal || !inference.travel || view.down
      || asked.footing || asked.pose || asked.swing || asked.feet || asked.height !== undefined || asked.heading !== undefined || asked.centre !== undefined) return driven;
    const a = inference.action, scale = settings.stanceScale;
    if (a[12] === 0 && a[13] === 0) return driven;
    return { kind: "stance", goal: { ...driven.goal, height: driven.goal.height + a[12]! * scale.height,
      heading: driven.goal.heading + mirror * a[13]! * scale.heading } };
  };
  const resume: Locomotion["resume"] = (view, heading) => {
    motion.resume(view, heading); start(learner); inference.moving = false; inference.command = 0; inference.travel = false;
    inference.observation.fill(0); inference.referenceObservation.fill(0); inference.action.fill(0); inference.referenceAction.fill(0);
    inference.offsets.left.fill(0); inference.offsets.right.fill(0);
    inference.previousCentre.x = view.stance.centre.x; inference.previousCentre.z = view.stance.centre.z;
  };
  return Object.freeze(Object.create(motion, { state: { value: state }, goal: { value: goal }, resume: { value: resume } })) as Locomotion;
}
