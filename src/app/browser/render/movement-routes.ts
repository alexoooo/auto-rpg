import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { GroundPoint } from "../../../skills/intent/movement.ts";

/** Current navigation paths above the ground; their origins follow the moving bodies. */
export function movementRoutes(scene: Scene) {
  const state = { mesh: null as LinesMesh | null, signature: "", lines: [] as Vector3[][] };
  const cool = Color3.FromHexString("#70d8e0"), warm = Color3.FromHexString("#dec693"), height = .06;
  const dispose = () => { state.mesh?.dispose(); state.mesh = null; state.signature = ""; state.lines = []; };
  return {
    update(routes: readonly { readonly from: GroundPoint; readonly points: readonly GroundPoint[]; readonly forced: boolean }[]): void {
      const shown = routes.filter(route => route.points.length);
      const signature = JSON.stringify(shown.map(route => [route.forced, route.points]));
      if (signature !== state.signature) {
        dispose(); state.signature = signature;
        if (!shown.length) return;
        state.lines = shown.map(route => [new Vector3(route.from.x, height, route.from.z), ...route.points.map(point => new Vector3(point.x, height, point.z))]);
        state.mesh = MeshBuilder.CreateLineSystem("movement route", {
          lines: state.lines, colors: shown.map((route, i) => state.lines[i]!.map(() => (route.forced ? cool : warm).toColor4())), updatable: true,
        }, scene);
        state.mesh.isPickable = false;
      } else if (state.mesh) {
        shown.forEach((route, i) => state.lines[i]![0]!.set(route.from.x, height, route.from.z));
        MeshBuilder.CreateLineSystem("movement route", { lines: state.lines, instance: state.mesh }, scene);
      }
    },
    dispose,
  };
}
