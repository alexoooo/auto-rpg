import type { createReachTask } from "./reach.ts";

/** The reach demonstration's optional feedback policy, consuming only the public observation. */
export function reachAction(observation: ReturnType<ReturnType<typeof createReachTask>["observe"]>,
  controller: "actuator" | "layered", seconds: number, speed: number): Parameters<ReturnType<typeof createReachTask>["act"]>[0] {
  switch (controller) {
    case "layered": return { kind: "posture", targets: { [observation.goal.channel]: observation.goal.angle } };
    case "actuator": return { kind: "velocity", activation: observation.body.joints.map(() => 1),
      velocity: observation.body.joints.map((joint) => Math.max(-speed, Math.min(speed,
        ((joint.name === observation.goal.channel ? observation.goal.angle : 0) - joint.angle) / seconds))) };
    default: throw new Error(`unknown reach controller ${controller satisfies never}`);
  }
}

/** A portable observation trace retains negative zero; timing and renderer state are not observations. */
export function reachFrame(result: unknown): string {
  return JSON.stringify(result, (_, value) => typeof value === "number" && Object.is(value, -0) ? "-0" : value);
}
