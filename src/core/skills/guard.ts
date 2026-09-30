import type { Pose } from "../control/motor.ts";

/** **The guard**: fists up before the chin, elbows in; the arms' posture when no skill owns them. */
export const GUARD: Pose = Object.freeze({
  "shoulder.right flexion": 0.5, "shoulder.right abduction": -0.2, "elbow.right flexion": 1.3,
  "shoulder.left flexion": 0.5, "shoulder.left abduction": -0.2, "elbow.left flexion": 1.3,
});
