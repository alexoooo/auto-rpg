/**
 * **A drill trial's overlays**, drawn over a bout the Arena plays from its record: where the
 * striker's actions aim (`ActionStatus.aim`, as its mind reports them, `MindReport`), the
 * target's path (the centre of the region its last action aims at, the middle of the other body
 * before one), each action's effector's path while it is under way, and each contact between the
 * two, a hot mark where the action's own effector met the other body. What they draw is read after
 * every step the bout takes, where it steps (`trialTrace`), so each step is drawn; nothing here
 * decides anything.
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
import type { Vec3 } from "../core/spec/quantity.ts";
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
 * What a trial's steps added to its overlays since the last were read, plain data a worker sends:
 * the target's path, each action's effector's points by the action's id, the aims, and the
 * contacts, each struck with an action's effector or touched with anything else. World, m.
 */
export interface TrialTrace {
  readonly target: readonly Vec3[];
  readonly effectors: readonly { readonly id: number; readonly at: Vec3 }[];
  readonly aims: readonly Vec3[];
  readonly contacts: readonly { readonly struck: boolean; readonly at: Vec3 }[];
}

/**
 * **What `duel`'s trial draws**, the left side striking the right, read after every step:
 * `take` gives what the steps since the last call added. A listener only reads: a bout with one
 * is the same bout.
 */
export function trialTrace(duel: Duel) {
  const striker = duel.duelists.left, target = duel.duelists.right;
  const segmentsOf = (region: Region) => regionSegments(target.built.spec, region).map((name) => target.built.segments.get(name)!).filter(Boolean);
  let region = MIDDLE, targeted = segmentsOf(region), blowsRead = 0;
  /** The effectors the striker's actions have used: a contact made with one is struck. */
  const struckWith = new Set<string>(), at = new Vector3(), centre = new Vector3();
  let trace = { target: [] as Vec3[], effectors: [] as { id: number; at: Vec3 }[], aims: [] as Vec3[], contacts: [] as { struck: boolean; at: Vec3 }[] };
  const hook = duel.world.afterStep(() => {
    for (const action of striker.minded.report?.actions ?? []) {
      if (action.target.kind !== "body") continue;
      if (JSON.stringify(action.target.region) !== JSON.stringify(region)) { region = action.target.region; targeted = segmentsOf(region); }
      struckWith.add(action.effector);
      const segment = striker.built.segments.get(action.effector);
      if (segment) { centreOfToRef(segment, at); trace.effectors.push({ id: action.id, at: [at.x, at.y, at.z] }); }
      if (action.aim) trace.aims.push([action.aim[0], action.aim[1], action.aim[2]]);
    }
    if (targeted.length) {
      centre.setAll(0);
      for (const segment of targeted) centre.addInPlace(centreOfToRef(segment, at));
      centre.scaleInPlace(1 / targeted.length);
      trace.target.push([centre.x, centre.y, centre.z]);
    }
    const blows = duel.blows;
    for (; blowsRead < blows.length; blowsRead++) {
      const blow = blows[blowsRead]!, by = blow.sides.find((side) => side.fighter === striker.side), on = blow.sides.find((side) => side.fighter === target.side);
      if (by && on) trace.contacts.push({ struck: struckWith.has(by.segment), at: [blow.point[0], blow.point[1], blow.point[2]] });
    }
  });
  return {
    /** What the steps since the last call added, or null where they added nothing. */
    take(): TrialTrace | null {
      const taken = trace;
      if (!taken.target.length && !taken.effectors.length && !taken.aims.length && !taken.contacts.length) return null;
      trace = { target: [], effectors: [], aims: [], contacts: [] };
      return taken;
    },
    dispose(): void { hook.dispose(); },
  };
}

/**
 * The overlays of a trial drawn on `scene` under `parent` where given (a bout played beside
 * another): `add` takes what its steps added (`trialTrace`), `update` redraws it, `dispose` takes
 * it all away.
 */
export function trialOverlay(scene: Scene, parent: TransformNode | null = null) {
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
    mesh.material = materialOf(name); mesh.position.copyFrom(point); mesh.isPickable = false; mesh.parent = parent; mesh.renderingGroupId = OVER;
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
        lines.isPickable = false; lines.parent = parent; lines.renderingGroupId = OVER;
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
