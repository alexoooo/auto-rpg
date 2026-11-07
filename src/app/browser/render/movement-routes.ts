import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { GroundPoint } from "../../../skills/framework/movement.ts";

/** Flat chalk strokes share floor-anchored grain as their paths change. */
export function movementRoutes(scene: Scene) {
  const state = { strokes: [] as { mesh: Mesh; path: GroundPoint[] }[] };
  // Clear the floor's inlays; feather a nine-centimetre stroke into the stone.
  const height = .03, halfWidth = .045, edges = [0, .7, 1, .7, 0];
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!, pixels = context.createImageData(128, 128);
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
    pixels.data[i + 3] = Math.random() < .2 ? 0 : 80 + Math.random() * 175;
  }
  context.putImageData(pixels, 0, 0);
  // Uneven deposits remain visible beyond the fine dust's mip level.
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = "rgba(0,0,0,.55)";
  for (let i = 0; i < 100; i++) {
    context.beginPath();
    context.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 7, 0, Math.PI * 2);
    context.fill();
  }
  const grain = new DynamicTexture("route chalk grain", canvas, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  grain.hasAlpha = true; grain.wrapU = grain.wrapV = Texture.WRAP_ADDRESSMODE;
  grain.anisotropicFilteringLevel = 8;
  grain.update();
  const material = (name: string, color: string) => {
    const surface = new StandardMaterial(name, scene);
    surface.disableLighting = true; surface.emissiveColor = Color3.FromHexString(color);
    surface.opacityTexture = grain;
    surface.backFaceCulling = false;
    return surface;
  };
  const cool = material("forced movement route", "#70d8e0"), warm = material("movement route", "#ffe2a4");
  const attack = material("attack route", "#ed6258");
  const draw = (mesh: Mesh, path: readonly GroundPoint[]) => {
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
    const normal = (a: GroundPoint, b: GroundPoint) => {
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      return { x: -(b.z - a.z) / length, z: (b.x - a.x) / length };
    };
    path.forEach((point, i) => {
      const before = normal(path[Math.max(0, i - 1)]!, path[Math.max(1, i)]!);
      const after = normal(path[Math.min(i, path.length - 2)]!, path[Math.min(i + 1, path.length - 1)]!);
      const length = Math.hypot(before.x + after.x, before.z + after.z);
      const join = length > .001 ? { x: (before.x + after.x) / length, z: (before.z + after.z) / length } : after;
      const width = halfWidth / Math.max(.5, join.x * after.x + join.z * after.z);
      edges.forEach((alpha, lane) => {
        const offset = width * (lane / (edges.length - 1) * 2 - 1);
        const x = point.x + join.x * offset, z = point.z + join.z * offset;
        positions.push(x, height, z); normals.push(0, 1, 0);
        // World UVs keep the chalk stationary while the start and destination move.
        uvs.push(x * 4, z * 4); colors.push(1, 1, 1, alpha);
        if (i && lane) {
          const at = i * edges.length + lane;
          indices.push(at - edges.length - 1, at - 1, at, at - edges.length - 1, at, at - edges.length);
        }
      });
    });
    const data = new VertexData();
    Object.assign(data, { positions, normals, uvs, colors, indices });
    data.applyToMesh(mesh, true);
  };
  return {
    update(routes: readonly { readonly from: GroundPoint; readonly points: readonly GroundPoint[]; readonly forced: boolean; readonly attacking: boolean }[]): void {
      const shown = routes.map(route => ({ ...route, points: [route.from, ...route.points]
        .filter((point, i, points) => i === 0 || point.x !== points[i - 1]!.x || point.z !== points[i - 1]!.z) })).filter(route => route.points.length > 1);
      while (state.strokes.length > shown.length) state.strokes.pop()!.mesh.dispose(false, false);
      shown.forEach((route, i) => {
        let stroke = state.strokes[i];
        if (!stroke) {
          const mesh = new Mesh("movement route", scene);
          mesh.isPickable = false; mesh.hasVertexAlpha = true;
          stroke = state.strokes[i] = { mesh, path: [] };
        }
        if (stroke.path.length !== route.points.length || route.points.some((point, j) => point.x !== stroke.path[j]!.x || point.z !== stroke.path[j]!.z)) {
          stroke.path = route.points.map(point => ({ x: point.x, z: point.z }));
          draw(stroke.mesh, stroke.path);
        }
        stroke.mesh.material = route.forced ? cool : route.attacking ? attack : warm;
      });
    },
    dispose(): void {
      for (const { mesh } of state.strokes) mesh.dispose(false, false);
      state.strokes = [];
      cool.dispose(); warm.dispose(); attack.dispose(); grain.dispose();
    },
  };
}
