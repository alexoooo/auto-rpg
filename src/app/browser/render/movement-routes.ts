import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { GroundPoint } from "../../../skills/intent/movement.ts";

/** Raised floor strokes keep navigation paths visible over textured ground. */
export function movementRoutes(scene: Scene) {
  const state = { strokes: [] as { mesh: Mesh; path: Vector3[] }[] };
  const height = .06, radius = .03;
  const material = (name: string, color: string) => {
    const surface = new StandardMaterial(name, scene);
    surface.disableLighting = true; surface.emissiveColor = Color3.FromHexString(color);
    return surface;
  };
  const cool = material("forced movement route", "#70d8e0"), warm = material("movement route", "#ffe2a4");
  return {
    update(routes: readonly { readonly from: GroundPoint; readonly points: readonly GroundPoint[]; readonly forced: boolean }[]): void {
      const shown = routes.map(route => ({ ...route, points: [route.from, ...route.points]
        .filter((point, i, points) => i === 0 || point.x !== points[i - 1]!.x || point.z !== points[i - 1]!.z) })).filter(route => route.points.length > 1);
      while (state.strokes.length > shown.length) state.strokes.pop()!.mesh.dispose(false, false);
      shown.forEach((route, i) => {
        let stroke = state.strokes[i];
        if (!stroke || stroke.path.length !== route.points.length) {
          stroke?.mesh.dispose(false, false);
          const path = route.points.map(point => new Vector3(point.x, height, point.z));
          const mesh = MeshBuilder.CreateTube("movement route", { path, radius, tessellation: 6, cap: Mesh.CAP_ALL, updatable: true }, scene);
          mesh.isPickable = false;
          stroke = state.strokes[i] = { mesh, path };
        } else {
          const { mesh, path } = stroke;
          if (route.points.some((point, j) => point.x !== path[j]!.x || point.z !== path[j]!.z)) {
            route.points.forEach((point, j) => path[j]!.set(point.x, height, point.z));
            MeshBuilder.CreateTube("movement route", { path, instance: mesh }, scene);
          }
        }
        stroke.mesh.material = route.forced ? cool : warm;
      });
    },
    dispose(): void {
      for (const { mesh } of state.strokes) mesh.dispose(false, false);
      state.strokes = [];
      cool.dispose(); warm.dispose();
    },
  };
}
