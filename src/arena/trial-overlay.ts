/**
 * **A drill trial's overlays**, drawn over a bout the Arena plays from its record: where the
 * striker's actions aim (`ActionStatus.aim`, as its mind reports them, `MindReport`), the
 * target's path (the centre of the region its last action aims at, the middle of the other body
 * before one), each action's effector's path while it is under way, and each contact between the two, a hot mark where the action's own
 * effector met the other body. Read after every step the bout takes, so each step is drawn; nothing
 * here decides anything.
 */
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { regionSegments } from "../core/intent/action-aim.ts";
import { centreOfToRef } from "../core/read-motion.ts";
import type { Region } from "../core/skills/framework/action.ts";
import type { Hook } from "../core/world.ts";
import type { Duel } from "./duel.ts";

/** What the overlays draw in, by what they show. */
const COLOURS = Object.freeze({
  aim: Color3.FromHexString("#ffe066"), target: Color3.FromHexString("#ff7975"), effector: Color3.FromHexString("#6bb4ff"),
  struck: Color3.FromHexString("#ff3b30"), touched: Color3.FromHexString("#b8b8b8"),
});

/** How big a contact's mark and the aim's are, m. */
const MARK = Object.freeze({ contact: .05, aim: .04 });

/** The rendering group the overlays are drawn in: after the scene's, over the bodies they run through. */
const OVER = 1;

/** The middle of a body, where the striker has not yet aimed at a region of it. */
const MIDDLE: Region = Object.freeze({ kind: "mark", mark: "middle" });

/**
 * The overlays of `duel`'s trial, the left side striking the right, drawn on `scene` under
 * `parent` where given (a bout played beside another): `update` redraws what the steps since the
 * last call added; `dispose` takes it all away.
 */
export function trialOverlay(scene: Scene, duel: Duel, parent: TransformNode | null = null) {
  // Over the bodies, clearing the depth they leave but not the stencil the sides' highlights draw by.
  scene.setRenderingAutoClearDepthStencil(OVER, true, true, false);
  const striker = duel.duelists.left, target = duel.duelists.right;
  const segmentsOf = (region: Region) => regionSegments(target.built.spec, region).map((name) => target.built.segments.get(name)!).filter(Boolean);
  let region = MIDDLE, targeted = segmentsOf(region);
  const targetPath: Vector3[] = [], aims: Vector3[] = [];
  /** Each action's effector path, by its id, in the order begun, and the effectors they struck with. */
  const effectors = new Map<number, Vector3[]>(), struckWith = new Set<string>();
  const at = new Vector3();
  let dirty = true, blowsDrawn = 0, lines: LinesMesh | null = null;
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
    mesh.material = materialOf(name); mesh.position.copyFrom(point); mesh.isPickable = false; mesh.parent = parent; mesh.renderingGroupId = OVER;
    marks.push(mesh);
    return mesh;
  };
  let aimMark: Mesh | null = null;
  const hook: Hook = duel.world.afterStep(() => {
    const actions = striker.minded.report?.actions ?? [];
    for (const action of actions) {
      if (action.target.kind !== "body") continue;
      if (JSON.stringify(action.target.region) !== JSON.stringify(region)) { region = action.target.region; targeted = segmentsOf(region); }
      struckWith.add(action.effector);
      const segment = striker.built.segments.get(action.effector);
      if (segment) {
        let path = effectors.get(action.id);
        if (!path) effectors.set(action.id, path = []);
        path.push(centreOfToRef(segment, at).clone());
      }
      if (action.aim) aims.push(new Vector3(...action.aim));
    }
    if (targeted.length) {
      const centre = new Vector3();
      for (const segment of targeted) centre.addInPlace(centreOfToRef(segment, at));
      targetPath.push(centre.scaleInPlace(1 / targeted.length));
    }
    dirty = true;
  });
  return {
    /** Redraws the paths, and marks the contacts and the aim the steps since the last call brought. */
    update(): void {
      if (!dirty) return;
      dirty = false;
      const drawn = [{ path: targetPath, colour: COLOURS.target }, ...[...effectors.values()].map((path) => ({ path, colour: COLOURS.effector })), { path: aims, colour: COLOURS.aim }]
        .filter(({ path }) => path.length > 1);
      lines?.dispose(); lines = null;
      if (drawn.length) {
        lines = MeshBuilder.CreateLineSystem("trial.overlay.paths", { lines: drawn.map(({ path }) => path), colors: drawn.map(({ path, colour }) => path.map(() => Color4.FromColor3(colour))) }, scene);
        lines.isPickable = false; lines.parent = parent; lines.renderingGroupId = OVER;
      }
      const aim = aims.at(-1);
      if (aim) { aimMark ??= mark("aim", aim, MARK.aim); aimMark.position.copyFrom(aim); }
      const blows = duel.blows;
      for (; blowsDrawn < blows.length; blowsDrawn++) {
        const blow = blows[blowsDrawn]!, by = blow.sides.find((side) => side.fighter === striker.side), on = blow.sides.find((side) => side.fighter === target.side);
        if (!by || !on) continue;
        mark(struckWith.has(by.segment) ? "struck" : "touched", new Vector3(...blow.point), MARK.contact);
      }
    },
    dispose(): void {
      hook.dispose();
      lines?.dispose();
      for (const mesh of marks) mesh.dispose();
      for (const material of materials.values()) material.dispose();
    },
  };
}
