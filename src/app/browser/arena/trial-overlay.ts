/**
 * **A drill trial's overlays**, drawn over a bout the Arena plays from its conditions: where the
 * striker's actions aim (`ActionStatus.aim`, as its mind reports them, `MindReport`), the
 * target's path (the centre of the region its last action aims at, the middle of the other body
 * before one), each action's effector's path while it is under way, and each contact between the
 * two, a hot mark where the action's own effector met the other body. What they draw is read after
 * every step the bout takes, where it steps (`trialTrace`, `trial-trace.ts`), so each step is
 * drawn; nothing here decides anything.
 */
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { TrialTrace } from "../../../game/arena/trial-trace.ts";

/** What the overlays draw in, by what they show. */
const COLOURS = Object.freeze({
  aim: Color3.FromHexString("#ffe066"), target: Color3.FromHexString("#ff7975"), effector: Color3.FromHexString("#6bb4ff"),
  struck: Color3.FromHexString("#ff3b30"), touched: Color3.FromHexString("#b8b8b8"),
});

/** How big a contact's mark and the aim's are, m. */
const MARK = Object.freeze({ contact: .05, aim: .04 });

/** The rendering group the overlays are drawn in: after the scene's, over the bodies they run through. */
const OVER = 1;

/**
 * The overlays of a trial drawn on `scene`: `add` takes what its steps added (`trialTrace`),
 * `update` redraws it, `dispose` takes it all away.
 */
export function trialOverlay(scene: Scene) {
  // Over the bodies, clearing the depth they leave but not the stencil the sides' highlights draw by.
  scene.setRenderingAutoClearDepthStencil(OVER, true, true, false);
  const targetPath: Vector3[] = [], aims: Vector3[] = [], effectors = new Map<number, Vector3[]>();
  const contacts: TrialTrace["contacts"][number][] = [];
  let dirty = true, contactsDrawn = 0, lines: LinesMesh | null = null;
  const marks: Mesh[] = [], materials = new Map<string, StandardMaterial>();
  const materialOf = (name: keyof typeof COLOURS) => {
    let material = materials.get(name);
    if (!material) {
      material = new StandardMaterial(`trial.overlay.${name}`, scene);
      material.diffuseColor = COLOURS[name]; material.emissiveColor = COLOURS[name]; material.specularColor = Color3.Black(); material.disableLighting = true;
      materials.set(name, material);
    }
    return material;
  };
  const mark = (name: keyof typeof COLOURS, point: Vector3, size: number): Mesh => {
    const mesh = MeshBuilder.CreateSphere(`trial.overlay.${name}.${marks.length}`, { diameter: size, segments: 8 }, scene);
    mesh.material = materialOf(name); mesh.position.copyFrom(point); mesh.isPickable = false; mesh.renderingGroupId = OVER;
    marks.push(mesh);
    return mesh;
  };
  let aimMark: Mesh | null = null;
  return {
    /** Take what a trial's steps added. */
    add(trace: TrialTrace): void {
      for (const point of trace.target) targetPath.push(Vector3.FromArray(point));
      for (const { id, at } of trace.effectors) {
        let path = effectors.get(id);
        if (!path) effectors.set(id, path = []);
        path.push(Vector3.FromArray(at));
      }
      for (const point of trace.aims) aims.push(Vector3.FromArray(point));
      contacts.push(...trace.contacts);
      dirty = true;
    },
    /** Redraws the paths, and marks the contacts and the aim added since the last call. */
    update(): void {
      if (!dirty) return;
      dirty = false;
      const drawn = [{ path: targetPath, colour: COLOURS.target }, ...[...effectors.values()].map((path) => ({ path, colour: COLOURS.effector })), { path: aims, colour: COLOURS.aim }]
        .filter(({ path }) => path.length > 1);
      lines?.dispose(); lines = null;
      if (drawn.length) {
        lines = MeshBuilder.CreateLineSystem("trial.overlay.paths", { lines: drawn.map(({ path }) => path), colors: drawn.map(({ path, colour }) => path.map(() => Color4.FromColor3(colour))) }, scene);
        lines.isPickable = false; lines.renderingGroupId = OVER;
      }
      const aim = aims.at(-1);
      if (aim) { aimMark ??= mark("aim", aim, MARK.aim); aimMark.position.copyFrom(aim); }
      for (; contactsDrawn < contacts.length; contactsDrawn++) {
        const contact = contacts[contactsDrawn]!;
        mark(contact.struck ? "struck" : "touched", Vector3.FromArray(contact.at), MARK.contact);
      }
    },
    dispose(): void {
      lines?.dispose();
      for (const mesh of marks) mesh.dispose();
      for (const material of materials.values()) material.dispose();
    },
  };
}
