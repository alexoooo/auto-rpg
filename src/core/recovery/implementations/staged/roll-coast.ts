import { Quaternion, Vector3 } from "../../../math/vector.ts";
import { turnAboutToRef } from "../../../math/turn.ts";
import type { Vec3 } from "../../../spec/quantity.ts";
import type { PoseStage } from "./stages.ts";

/** A constant-spin forecast through the pose's minimum time or its first quarter-turn, before a backward roll can wrap onto its front. */
export function rollCoast() {
  const work = { delta: new Quaternion(), future: new Quaternion(), way: new Vector3() };
  return (rotation: Quaternion, spin: Vector3, stage: PoseStage, belly: Vec3): boolean => {
    if (!stage.over || !stage.hold) return false;
    const speed = spin.length();
    if (speed > 0) turnAboutToRef(spin, Math.min(speed * stage.seconds, Math.PI / 2), work.delta).multiplyToRef(rotation, work.future);
    else work.future.copyFrom(rotation);
    const far = work.way.set(stage.over === "right" ? -1 : 1, 0, 0).applyRotationQuaternionToRef(work.future, work.way).y;
    const front = work.way.set(belly[0], belly[1], belly[2]).applyRotationQuaternionToRef(work.future, work.way).y;
    return far >= stage.hold.turned || front <= 0;
  };
}
