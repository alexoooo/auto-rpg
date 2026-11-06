import { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { VIEW_CAMERA } from "../render/camera-math.ts";
import { orbitCamera, orbitPosition, type CameraSubject } from "../render/orbit-camera.ts";
import type { ArenaView } from "./view.ts";
import type { ArenaSeat as Side } from "../../../game/arena/seat.ts";

export type ArenaSubjects = Readonly<Record<Side, CameraSubject>>;

/** Arena setup framing, set by eye. */
const OVERVIEW = Object.freeze({ pitch: .78, distance: 39, width: 31 });

/** The Arena supplies its selected fighter or midpoint to the common camera. */
export function arenaCameraRig(camera: FreeCamera, initial: ArenaView) {
  const rig = orbitCamera(camera, initial), target = new Vector3();
  let view = initial;
  return {
    choose(next: ArenaView) { view = next; rig.choose(next); },
    reset: rig.reset, orbit: rig.orbit, zoom: rig.zoom,
    get azimuth() { return rig.azimuth; },
    frame(screen: "setup" | "fight", subjects: ArenaSubjects | null, dt: number, aspect: number) {
      if (screen === "setup") {
        target.set(0, 0, 0); camera.mode = Camera.PERSPECTIVE_CAMERA;
        camera.position.set(...orbitPosition(target, 0, OVERVIEW.pitch, Math.max(OVERVIEW.distance, OVERVIEW.width / aspect)));
        camera.setTarget(target); rig.reset(); return;
      }
      if (!subjects) return;
      const selected = view.focus === "both" ? null : subjects[view.focus];
      const a = subjects.left.position, b = subjects.right.position;
      target.set(selected?.position.x ?? (a.x + b.x) / 2, VIEW_CAMERA.lookHeight, selected?.position.z ?? (a.z + b.z) / 2);
      rig.frame(target, selected, dt, aspect);
    },
  };
}
