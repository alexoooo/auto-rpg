import type { BodyObservation } from "../observation.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import type { MotionCommand } from "./tasks.ts";

interface TransitionConfig {
  readonly root: string;
  readonly moving: string;
  readonly support: string;
  readonly joints: MotionCommand["joints"];
  readonly lower: number;
  readonly lift: number;
  readonly placementMargin: number;
  readonly centreGain: number;
  readonly seconds: number;
  readonly rootWeight: number;
  readonly pointWeight: number;
  readonly rotationWeight: number;
  readonly minimumTransfer: number;
  readonly centreTolerance: number;
  readonly unloadFraction: number;
  readonly speedTolerance: number;
  readonly liftTolerance: number;
  readonly placementTolerance: number;
  readonly rotationTolerance: number;
  readonly holdSeconds: number;
}
type Phase = "transfer" | "lift" | "place" | "recenter" | "complete";
const ZERO: Vec3 = [0, 0, 0];
const length = (v: Vec3) => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);

/**
 * Optional upright two-support reference policy. Measurements gate unloading, flight, placement
 * and return to shared support. It requests motion and never changes a collider or body state.
 * This policy assumes a horizontal floor and an initially standing body; it is not recovery.
 */
export function supportTransition(configuration: TransitionConfig) {
  const config = deepFreeze({ ...configuration, joints: configuration.joints.map((j) => ({ ...j })) });
  if (config.root === config.moving || config.root === config.support || config.moving === config.support
    || Object.values(config).some((value) => typeof value === "number" && (!Number.isFinite(value) || value <= 0))
    || config.unloadFraction >= 1) throw new Error("invalid support transition configuration");
  const state = { phase: "transfer" as Phase, time: 0, held: 0,
    initial: null as { root: Vec3; rootRotation: readonly [number, number, number, number];
      foot: Vec3; footRotation: readonly [number, number, number, number] } | null,
    reading: { centreError: 0, loadFraction: 0, rootSpeed: 0, footSpeed: 0, footError: 0 },
    transitions: [] as { phase: Phase; time: number; loadFraction: number }[] };
  const feedback = (weight: number) => ({ velocity: ZERO, acceleration: ZERO, seconds: config.seconds, weight });
  return { name: "support-transition", state, step(observation: BodyObservation, dt: number): MotionCommand {
    state.time += dt;
    const find = (name: string) => {
      const value = observation.segments.find((s) => s.name === name);
      if (!value) throw new Error(`support transition lacks ${name}`);
      return value;
    };
    const root = find(config.root), foot = find(config.moving), standing = find(config.support);
    state.initial ??= { root: [...root.position], rootRotation: [...root.rotation], foot: [...foot.position], footRotation: [...foot.rotation] };
    const initial = state.initial;
    const contacts = observation.contacts.filter((c) => c.fixed !== null);
    const total = contacts.reduce((sum, c) => sum + c.impulse, 0);
    const load = contacts.filter((c) => c.segment === config.moving).reduce((sum, c) => sum + c.impulse, 0);
    const centered = state.phase === "recenter" || state.phase === "complete";
    const aim: Vec3 = centered ? [(foot.centre[0] + standing.centre[0]) / 2, 0, (foot.centre[2] + standing.centre[2]) / 2] : standing.centre;
    const dx = aim[0] - observation.centre[0], dz = aim[2] - observation.centre[2];
    let lift = 0;
    switch (state.phase) {
      case "lift": lift = config.lift; break;
      case "place": lift = -config.placementMargin; break;
      case "transfer": case "recenter": case "complete": break;
      default: { const never: never = state.phase; throw new Error(`unknown support phase ${never}`); }
    }
    const target: Vec3 = [initial.foot[0], initial.foot[1] + lift, initial.foot[2]];
    state.reading = { centreError: Math.sqrt(dx * dx + dz * dz), loadFraction: total > 0 ? load / total : 0,
      rootSpeed: length(root.velocity), footSpeed: length(foot.velocity),
      footError: length([target[0] - foot.position[0], target[1] - foot.position[1], target[2] - foot.position[2]]) };
    const rotationError = 1 - Math.abs(foot.rotation.reduce((sum, v, k) => sum + v * initial.footRotation[k]!, 0));
    const reading = state.reading;
    let ready = false, next = state.phase;
    switch (state.phase) {
      case "transfer":
        ready = state.time > config.minimumTransfer && reading.centreError < config.centreTolerance
          && total > 0 && reading.loadFraction < config.unloadFraction && reading.rootSpeed < config.speedTolerance;
        next = "lift"; break;
      case "lift":
        ready = reading.footError < config.liftTolerance && load === 0 && reading.footSpeed < config.speedTolerance;
        next = "place"; break;
      case "place":
        ready = reading.footError < config.placementTolerance && rotationError < config.rotationTolerance
          && load > 0 && reading.footSpeed < config.speedTolerance;
        next = "recenter"; break;
      case "recenter":
        ready = reading.centreError < config.centreTolerance && load > 0 && reading.rootSpeed < config.speedTolerance
          && contacts.some((c) => c.segment === config.support && c.impulse > 0);
        next = "complete"; break;
      case "complete": break;
      default: { const never: never = state.phase; throw new Error(`unknown support phase ${never}`); }
    }
    state.held = ready ? state.held + dt : 0;
    const frames: MotionCommand["frames"][number][] = [{ id: "root", frame: { kind: "segment", name: config.root }, at: ZERO,
      translation: { ...feedback(config.rootWeight), target: [root.position[0] + config.centreGain * dx,
        initial.root[1] - (centered ? 0 : config.lower), root.position[2] + config.centreGain * dz] },
      orientation: { ...feedback(config.rootWeight), target: initial.rootRotation } }];
    if (state.phase !== "transfer") frames.push({ id: "moving-support", frame: { kind: "segment", name: config.moving }, at: ZERO,
      translation: { ...feedback(config.pointWeight), target }, orientation: { ...feedback(config.rotationWeight), target: initial.footRotation } });
    const command: MotionCommand = { joints: config.joints, frames, grips: [], supports: state.phase === "lift" || state.phase === "place"
      ? [{ frame: { kind: "segment", name: config.moving }, mode: "free" }] : [] };
    if (state.held >= config.holdSeconds && state.phase !== "complete") {
      state.phase = next; state.held = 0;
      state.transitions.push({ phase: next, time: state.time, loadFraction: reading.loadFraction });
    }
    return command;
  } };
}
