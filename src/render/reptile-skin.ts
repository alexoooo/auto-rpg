import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { SkinView } from "./skin-view.ts";
import { drawBody } from "./body-shapes.ts";

/** Procedural segment shells and eyes follow physical nodes; art settings live in `docs/art/characters.md`. */
export function dressReptile(built: BuiltBody, scene: Scene): SkinView {
  const shells = drawBody(built, scene, Color3.FromHexString("#78834d")), head = built.segments.get("head")!;
  const eyes = new StandardMaterial(`${head.node.name}.eyes`, scene);
  eyes.diffuseColor = Color3.FromHexString("#171f13"); eyes.specularColor = Color3.FromHexString("#c3bb65");
  const meshes = [...shells.meshes];
  for (const sign of [-1, 1]) {
    const eye = MeshBuilder.CreateSphere(`${head.node.name}.eye.${sign}`, { diameter: .025, segments: 12 }, scene);
    const delta = new Vector3(sign * .055, .285, .34).subtractInPlace(new Vector3(...head.frame.origin));
    eye.position.set(Vector3.Dot(delta, new Vector3(...head.frame.x)), Vector3.Dot(delta, new Vector3(...head.frame.y)), Vector3.Dot(delta, new Vector3(...head.frame.z)));
    eye.parent = head.node; eye.material = eyes; meshes.push(eye);
  }
  return { meshes, setEnabled(enabled) { for (const mesh of meshes) mesh.setEnabled(enabled); },
    wear() {}, dispose() { shells.dispose(); for (const mesh of meshes.slice(shells.meshes.length)) mesh.dispose(false, false); eyes.dispose(); } };
}
