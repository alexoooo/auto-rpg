import type { Body } from "../../control/body.ts";
import { footOn } from "../../control/support.ts";
import { rootSegment } from "../../core/bodies/read-body.ts";
import { Vector3 } from "../../core/math/vector.ts";
import { sin, cos } from "../../core/math/real.ts";
import { recoveryNetwork, networkFaults, type Network } from "../../core/math/learning/recovery-network.ts";
import { legOf } from "./gait-scale.ts";
import type { RunTrim } from "./cycle-run.ts";
import type { Locomotion } from "./locomotion.ts";
import type { WalkRunState } from "./walk-run.ts";
import { learnerOf } from "../../core/math/learning/learner.ts";

/** Bounded joint corrections around a walk/run record, evaluated at its trained control cadence. */
export interface LearnedRunSettings {
  readonly velocity: Network;
  readonly braking: Network;
  readonly reference: Network;
  readonly velocityScale: number;
  readonly referenceScale: number;
  readonly decisionSteps: number;
  readonly entry: "landing" | "first-lift";
  readonly trim: RunTrim;
  /** Low-speed actor: full authority through fullPace, fading to the velocity actor at untilPace, m/s. */
  readonly slowVelocity?: { readonly fullPace: number; readonly untilPace: number; readonly network: Network };
  /** Research decisions supplied through saved learner outputs for the selected actor. */
  readonly steered?: "braking" | "velocity" | "slow-velocity";
}

/** Admission for the mirrored 49-input, twelve-channel travel actors and their physical scales. */
export function learnedRunFaults(value: unknown): readonly string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["learned run settings must be an object"];
  const settings = value as LearnedRunSettings, faults: string[] = [];
  for (const name of ["velocity", "braking", "reference"] as const) {
    const read = networkFaults(settings[name]);
    if (read.faults.length || read.inputs !== 49 || settings[name]?.actions !== 12) faults.push(`learned run ${name} needs a 49-input, twelve-action network`);
  }
  if (![settings.velocityScale, settings.referenceScale].every(x => Number.isFinite(x) && x >= 0)) faults.push("learned run scales must be finite and nonnegative");
  if (!Number.isSafeInteger(settings.decisionSteps) || settings.decisionSteps < 1) faults.push("learned run decisionSteps must be a positive whole number");
  if (settings.entry !== "landing" && settings.entry !== "first-lift") faults.push("learned run entry must be landing or first-lift");
  if (!["continuous", "at-pace", "after-pace"].includes(settings.trim)) faults.push("invalid learned run trim");
  const slow = settings.slowVelocity;
  if (slow !== undefined) {
    if (!slow || typeof slow !== "object" || Array.isArray(slow)) faults.push("invalid learned run low-speed actor");
    else {
      const read = networkFaults(slow.network);
      if (read.faults.length || read.inputs !== 49 || slow.network?.actions !== 12) faults.push("learned run low-speed actor needs a 49-input, twelve-action network");
      if (![slow.fullPace, slow.untilPace].every(x => Number.isFinite(x) && x > 0) || slow.fullPace >= slow.untilPace)
        faults.push("learned run low-speed band needs positive increasing paces");
    }
  }
  if (settings.steered !== undefined && settings.steered !== "braking" && settings.steered !== "velocity" && settings.steered !== "slow-velocity") faults.push("learned run steered mode is braking, velocity or slow-velocity");
  if (settings.steered === "slow-velocity" && slow === undefined) faults.push("learned run low-speed steering needs a low-speed actor");
  return faults;
}

const JOINTS = Object.freeze(["hip flexion", "hip abduction", "hip internal rotation", "knee flexion", "ankle dorsiflexion", "ankle inversion"]);
const SIDES = Object.freeze(["left", "right"] as const);

/** Wrap the native gait without changing its support planning, muscle ceilings or run permission. */
export function learnedRun(body: Body, motion: Locomotion & { readonly state: WalkRunState }, settings: LearnedRunSettings, settle: number): Locomotion {
  const faults = learnedRunFaults(settings);
  if (faults.length) throw new Error(faults.join("; "));
  const velocity = recoveryNetwork(settings.velocity), braking = recoveryNetwork(settings.braking), reference = recoveryNetwork(settings.reference);
  const slowVelocity = settings.slowVelocity ? recoveryNetwork(settings.slowVelocity.network) : null;
  const leg = legOf(body.built.spec), root = rootSegment(body.built);
  const ends = Object.fromEntries(SIDES.map(side => [side, footOn(body.built.spec, side)])) as Record<typeof SIDES[number], string>;
  const names = Object.fromEntries(SIDES.map(side => [side, JOINTS.map(name => {
    const [joint, ...motion] = name.split(" "); return `${joint}.${side} ${motion.join(" ")}`;
  })])) as Record<typeof SIDES[number], string[]>;
  const channels = Object.fromEntries(SIDES.map(side => [side, names[side].map(name => body.muscles.channel(name))])) as Record<typeof SIDES[number], number[]>;
  const up = new Vector3(), forward = new Vector3(), spin = new Vector3();
  const inference = {
    steps: 0, observation: new Array<number>(49).fill(0), velocityAction: new Array<number>(12).fill(0), referenceAction: new Array<number>(12).fill(0),
    offsets: { left: new Array<number>(6).fill(0), right: new Array<number>(6).fill(0) },
    origin: { x: body.view.stance.centre.x, z: body.view.stance.centre.z },
    previousCentre: { x: body.view.stance.centre.x, z: body.view.stance.centre.z }, moving: false, face: 0, command: 0,
  };
  const learner = settings.steered ? learnerOf(12, false) : null;
  const state = { motion: motion.state, inference, ...(learner ? { learner } : {}) };
  const goal: Locomotion["goal"] = (view, asked, dt, context) => {
    const forwardOrder = asked.walk?.[0] ?? 0, sideOrder = asked.walk?.[1] ?? 0;
    const command = Math.sqrt(forwardOrder * forwardOrder + sideOrder * sideOrder), moving = command > 0;
    const band = settings.slowVelocity, rounding = 8 * Number.EPSILON * Math.max(1, command, band?.untilPace ?? 0);
    const slowShare = !moving || !band || command >= band.untilPace - rounding ? 0
      : command <= band.fullPace + rounding ? 1 : (band.untilPace - command) / (band.untilPace - band.fullPace);
    if (learner) {
      switch (settings.steered) {
        case "velocity": learner.running = moving; break;
        case "slow-velocity": learner.running = moving && slowShare > 0; break;
        case "braking": learner.running = !moving && (learner.running || inference.moving); break;
        case undefined: learner.running = false; break;
        default: { const never: never = settings.steered; throw new Error(`unknown learned run steering ${never}`); }
      }
    }
    if (moving && !inference.moving) Object.assign(inference.origin, inference.previousCentre);
    else if (moving && asked.face !== inference.face) Object.assign(inference.origin, { x: view.stance.centre.x, z: view.stance.centre.z });
    // Rotating the same pace between facing frames must not restart the inference clock.
    if (Math.abs(command - inference.command) > 8 * Number.EPSILON * Math.max(1, command, inference.command)) inference.steps = 0;
    inference.moving = moving; inference.face = asked.face; inference.command = command;
    if (inference.steps % settings.decisionSteps === 0) {
      if (learner?.running) {
        learner.inputs.splice(0, learner.inputs.length, ...inference.observation);
        learner.decisions++;
      }
      if (learner?.running && settings.steered !== "slow-velocity") inference.velocityAction = learner.outputs;
      else if (!moving) inference.velocityAction = braking(inference.observation);
      else if (slowShare === 0) inference.velocityAction = velocity(inference.observation);
      else {
        const slow = learner?.running && settings.steered === "slow-velocity" ? learner.outputs : slowVelocity!(inference.observation);
        if (slowShare === 1) inference.velocityAction = slow;
        else inference.velocityAction = velocity(inference.observation).map((fast, i) => fast + slowShare * (slow[i]! - fast));
      }
      inference.referenceAction = reference(inference.observation);
    }
    inference.steps++;
    const driven = motion.goal(view, asked, dt, context);
    const s = view.stance, phase = motion.state.run.phase, h = motion.state.walkRun.heading;
    const fx = sin(h), fz = cos(h), rx = fz, rz = -fx;
    const side = phase < .5 ? "left" : "right", opposite = side === "left" ? "right" : "left", mirror = side === "left" ? 1 : -1;
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
    inference.previousCentre.x = s.centre.x; inference.previousCentre.z = s.centre.z;
    if (driven.kind !== "drive") return driven;
    const pushes = driven.pushes.map(push => {
      let i = names[side].indexOf(push.channel);
      if (i < 0) { const other = names[opposite].indexOf(push.channel); i = other < 0 ? -1 : other + 6; }
      if (i < 0 || push.speed === undefined) return push;
      const physical = i < 6 ? side : opposite, channel = i % 6, before = inference.offsets[physical][channel]!;
      const offset = before + Math.min(1, 30 * dt) * (inference.referenceAction[i]! * settings.referenceScale - before);
      inference.offsets[physical][channel] = offset;
      let speed = push.speed + offset / settle + (offset - before) / dt;
      if (inference.velocityAction[i] !== 0) speed += inference.velocityAction[i]! * settings.velocityScale;
      return { ...push, speed, sense: speed >= 0 ? 1 as const : -1 as const };
    });
    return { ...driven, pushes };
  };
  const resume: Locomotion["resume"] = view => {
    motion.resume(view); inference.steps = 0; inference.moving = false; inference.command = 0;
    if (learner) { learner.running = false; learner.inputs.length = 0; learner.outputs.fill(0); }
    inference.observation.fill(0); inference.velocityAction.fill(0); inference.referenceAction.fill(0);
    inference.offsets.left.fill(0); inference.offsets.right.fill(0);
    inference.previousCentre.x = view.stance.centre.x; inference.previousCentre.z = view.stance.centre.z;
  };
  return Object.freeze(Object.create(motion, { state: { value: state }, goal: { value: goal }, resume: { value: resume } })) as Locomotion;
}
