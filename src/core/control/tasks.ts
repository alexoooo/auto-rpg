import type { GripAction } from "../mind/equipment-port.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";

/** A named physical frame; neither the objective nor its author receives a mutable body. */
type MotionFrame = { readonly kind: "segment"; readonly name: string } | { readonly kind: "item"; readonly id: string };

interface Feedback { readonly seconds: number; readonly weight: number }
interface VectorGoal extends Feedback { readonly target: Vec3; readonly velocity: Vec3; readonly acceleration: Vec3 }
interface RotationGoal extends Feedback {
  readonly target: readonly [number, number, number, number];
  /** World angular velocity and acceleration. */
  readonly velocity: Vec3;
  readonly acceleration: Vec3;
}

/** Motion objectives are independent of the algorithm used to track them. */
export interface MotionCommand {
  readonly joints: readonly (Feedback & { readonly channel: string; readonly angle: number; readonly rate: number; readonly acceleration: number })[];
  readonly frames: readonly {
    readonly id: string;
    readonly frame: MotionFrame;
    /** Point in the named body's local frame, m. */
    readonly at: Vec3;
    readonly translation?: VectorGoal;
    /** Orientation of the named body, independent of the point selected by `at`. */
    readonly orientation?: RotationGoal;
  }[];
  readonly grips: readonly GripAction[];
  /** Desired support is separate from contact: free frames may still physically touch. */
  readonly supports?: readonly { readonly frame: MotionFrame; readonly mode: "auto" | "free" }[];
}

export interface MotionModel {
  readonly channels: readonly { readonly name: string; readonly min: number; readonly max: number }[];
  readonly frames: readonly MotionFrame[];
}

/** Canonical identity shared by validation, tracking and reports. */
export function motionFrameKey(frame: MotionFrame): string {
  switch (frame.kind) {
    case "segment": return `segment:${frame.name}`;
    case "item": return `item:${frame.id}`;
    default: { const never: never = frame; throw new Error(`unknown motion frame ${JSON.stringify(never)}`); }
  }
}

/** Copy a complete objective before commands are applied; grip authority is checked by the host. */
export function checkedMotionCommand(command: MotionCommand, model: MotionModel): MotionCommand {
  if (!command || !Array.isArray(command.joints) || !Array.isArray(command.frames) || !Array.isArray(command.grips)) throw new Error("invalid motion command");
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const vector = (v: Vec3): Vec3 => {
    if (!Array.isArray(v) || v.length !== 3 || !Array.from(v).every(finite)) throw new Error("invalid motion vector");
    return [v[0], v[1], v[2]];
  };
  const feedback = (goal: Feedback) => {
    if (!finite(goal.seconds) || goal.seconds <= 0 || !finite(goal.weight) || goal.weight <= 0) throw new Error("invalid motion feedback");
    return { seconds: goal.seconds, weight: goal.weight };
  };
  const channels = new Set<string>(), frames = new Set<string>();
  const joints = command.joints.map((goal) => {
    const channel = model.channels.find((c) => c.name === goal.channel);
    if (!channel || channels.has(goal.channel) || ![goal.angle, goal.rate, goal.acceleration].every(finite)
      || goal.angle < channel.min || goal.angle > channel.max) throw new Error("invalid motion joint goal");
    channels.add(goal.channel);
    return { channel: goal.channel, angle: goal.angle, rate: goal.rate, acceleration: goal.acceleration, ...feedback(goal) };
  });
  const goals = command.frames.map((goal) => {
    const key = motionFrameKey(goal.frame);
    if (typeof goal.id !== "string" || !goal.id || frames.has(goal.id) || !model.frames.some((f) => motionFrameKey(f) === key) || (!goal.translation && !goal.orientation)) throw new Error("invalid motion frame goal");
    frames.add(goal.id);
    const translation = goal.translation ? { target: vector(goal.translation.target), velocity: vector(goal.translation.velocity),
      acceleration: vector(goal.translation.acceleration), ...feedback(goal.translation) } : undefined;
    let orientation: RotationGoal | undefined;
    if (goal.orientation) {
      const g = goal.orientation, q = g.target;
      if (!Array.isArray(q) || q.length !== 4 || !Array.from(q).every(finite)) throw new Error("invalid motion orientation");
      const length = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
      if (!(length > 0) || !Number.isFinite(length)) throw new Error("invalid motion orientation");
      orientation = { target: [q[0] / length, q[1] / length, q[2] / length, q[3] / length],
        velocity: vector(g.velocity), acceleration: vector(g.acceleration), ...feedback(g) };
    }
    return { id: goal.id, frame: { ...goal.frame }, at: vector(goal.at), ...(translation ? { translation } : {}), ...(orientation ? { orientation } : {}) };
  });
  if (command.supports !== undefined && !Array.isArray(command.supports)) throw new Error("invalid support requests");
  const requested = new Set<string>();
  const supports = command.supports?.map((s) => {
    const key = motionFrameKey(s.frame);
    if (requested.has(key) || !model.frames.some((f) => motionFrameKey(f) === key) || (s.mode !== "auto" && s.mode !== "free")) throw new Error("invalid support request");
    requested.add(key); return { frame: { ...s.frame }, mode: s.mode };
  });
  return deepFreeze({ joints, frames: goals, grips: command.grips.map((g) => ({ ...g })), ...(supports ? { supports } : {}) });
}
