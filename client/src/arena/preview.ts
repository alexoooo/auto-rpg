// The loadout picker drawn into the arena's existing Babylon scene.
//
// There is deliberately no engine, canvas, render loop or ResizeObserver here.
// The picker and the fight are two phases of one route and share all four; the
// only thing that changes between them is `Scene.activeCameras`.

import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";
import type { Scene } from "@babylonjs/core/scene.js";

import {
  ANATOMIES, HAND_ITEMS, type HandName,
} from "../runtime/arena-config.js";
import type { CombatantAsset } from "../render/combatant-assets.js";
import {
  combatantLodForProjectedHeight, instantiateCombatantDress, type CombatantDress,
} from "../render/combatant-dress.js";
import {
  buildFigure, buildFigureSources, figureBodyHeightRadii, poseFigureRest, setFigureDiagnostics,
  type FigureSources,
} from "../render/figure.js";
import type { SideChoice } from "./picker.js";

const ONE = 65536;
const PREVIEW_TURN_TICKS = 480;
const PREVIEW_FOV = Math.PI / 4;
export const PREVIEW_ORBIT_LIMIT_DEGREES = 80;
export const PREVIEW_MIN_RADIUS_HEIGHTS = 1.1;
export const PREVIEW_MAX_RADIUS_HEIGHTS = 2.5;

export const PREVIEW_VIEWPORTS = [
  new Viewport(0, 0, 0.5, 1),
  new Viewport(0.5, 0, 0.5, 1),
] as const;

/** Bits above the stage's three bits, so neither phase can leak into the other. */
export const PREVIEW_CAMERA_BITS = [0x8, 0x10] as const;

export function previewYaw(frame: number): number {
  const tick = ((Math.trunc(frame) % PREVIEW_TURN_TICKS) + PREVIEW_TURN_TICKS) % PREVIEW_TURN_TICKS;
  return (tick / PREVIEW_TURN_TICKS) * Math.PI * 2;
}

type PreviewBody = {
  root: TransformNode;
  dress: CombatantDress | null;
  label: string;
  standingHeight: number;
  projectedHeight: number;
  restRotation: Quaternion;
  dispose(): void;
};

export interface CombatantPreview {
  readonly cameras: readonly [Camera, Camera];
  show(side: 0 | 1, choice: SideChoice): void;
  draw(frame: number): void;
  setActive(active: boolean): void;
  orbit(side: 0 | 1, dx: number, dy: number): boolean;
  zoom(side: 0 | 1, delta: number): boolean;
  reset(side?: 0 | 1): void;
  dispose(): void;
}

export type PreviewDressReporter = (side: 0 | 1, description: string) => void;

/** The exact dimensions read by `arenaConfigOf`, expressed as a Babylon mesh. */
export function buildPreviewItem(
  scene: Scene, side: 0 | 1, hand: 0 | 1, name: HandName, parent: TransformNode,
): AbstractMesh | null {
  const item = HAND_ITEMS[name];
  if (name === "empty") return null;
  const key = `arena-preview:${side}:${hand}:${name}`;
  const mesh = name === "shield"
    ? MeshBuilder.CreateBox(key, {
      width: (item.a * 2) / ONE, height: (item.b * 2) / ONE, depth: item.c / ONE,
    }, scene)
    : MeshBuilder.CreateCylinder(key, {
      height: item.a / ONE, diameter: (item.b * 2) / ONE, tessellation: name === "bow" ? 8 : 16,
    }, scene);
  mesh.parent = parent;
  parent.computeWorldMatrix(true);
  const inherited = parent.absoluteScaling;
  // The body is scaled to its configured standing height. Equipment dimensions
  // are already world dimensions, so cancel that inherited scale rather than
  // shrinking a Brute's club by the authored asset's normalisation factor.
  mesh.scaling.set(1 / inherited.x, 1 / inherited.y, 1 / inherited.z);
  mesh.position.y = name === "shield" ? 0 : -(item.a / ONE) / (2 * inherited.y);
  mesh.layerMask = PREVIEW_CAMERA_BITS[side];
  mesh.isPickable = false;
  return mesh;
}

/** Build the preview inside an already-owned scene. */
export function createCombatantPreview(
  scene: Scene,
  stageCameras: readonly Camera[],
  reportDress: PreviewDressReporter,
  loadAsset: () => Promise<CombatantAsset | null>,
): CombatantPreview {
  const cameras = [0, 1].map((side) => {
    const camera = new FreeCamera(`arena-preview-${side}`, new Vector3(3.4, 1.15, 0), scene);
    camera.fov = PREVIEW_FOV;
    camera.minZ = 0.05;
    camera.maxZ = 20;
    camera.layerMask = PREVIEW_CAMERA_BITS[side] ?? 0;
    camera.viewport = PREVIEW_VIEWPORTS[side] ?? PREVIEW_VIEWPORTS[0];
    camera.setTarget(new Vector3(0, 1, 0));
    return camera;
  }) as [FreeCamera, FreeCamera];
  const light = new HemisphericLight("arena-preview-light", new Vector3(0.5, 1, -0.5), scene);
  light.diffuse = new Color3(1, 0.95, 0.86);
  light.groundColor = new Color3(0.18, 0.2, 0.25);
  const bodies: [PreviewBody | null, PreviewBody | null] = [null, null];
  const generations = [0, 0];
  const initialCamera = cameras.map((camera) => ({
    position: camera.position.clone(), target: camera.getTarget().clone(),
  }));
  const inspection = [0, 1].map(() => ({ azimuth: 0, elevation: 0, manual: false }));
  let disposed = false;
  let active = false;

  const placeCamera = (side: 0 | 1): void => {
    const camera = cameras[side];
    const state = inspection[side]!;
    const target = camera.getTarget();
    const radius = Vector3.Distance(camera.position, target);
    const ground = radius * Math.cos(state.elevation);
    camera.position.set(target.x + Math.cos(state.azimuth) * ground,
      target.y + Math.sin(state.elevation) * radius,
      target.z + Math.sin(state.azimuth) * ground);
    camera.setTarget(target);
  };

  const retire = (side: 0 | 1): void => {
    bodies[side]?.dispose();
    bodies[side] = null;
  };

  const finish = (side: 0 | 1, choice: SideChoice, asset: CombatantAsset | null, generation: number): void => {
    if (disposed || generations[side] !== generation) return;
    retire(side);
    let dress: CombatantDress | null = null;
    let sources: FigureSources | null = null;
    let root!: TransformNode;
    let meshes!: AbstractMesh[];
    let fallbackReason = asset === null ? "authored dress unavailable" : null;
    const anatomy = ANATOMIES.find((row) => row.name === choice.anatomy) ?? ANATOMIES[0];
    if (asset !== null) {
      try {
        dress = instantiateCombatantDress(asset, choice.anatomy, `arena-preview:${side}`);
        dress.setStandingHeight(anatomy.standingHeight / ONE);
        for (const semantic of ["sword", "club", "shield"]) {
          if (dress.meshes.has(semantic)) dress.setSemanticEnabled(semantic, false);
        }
        dress.setEnabled(true);
        root = dress.root;
        meshes = [...dress.allMeshes];
        reportDress(side, `${choice.anatomy} authored rest pose`);
      } catch (error) {
        dress?.dispose();
        dress = null;
        fallbackReason = `authored dress invalid: ${String(error)}`;
      }
    }
    if (dress === null) {
      sources = buildFigureSources(scene, `arena-preview:${side}`, side);
      const figure = buildFigure(scene, sources, `arena-preview:${side}`, choice.anatomy === "brute" ? 1 : 0);
      setFigureDiagnostics(figure, false);
      for (const part of figure.parts) {
        if (part.name.endsWith(":blade") || part.name.endsWith(":shield")) part.setEnabled(false);
      }
      poseFigureRest(figure, choice.anatomy === "brute" ? 1 : 0);
      root = figure.root;
      root.scaling.setAll((anatomy.standingHeight / ONE)
        / figureBodyHeightRadii(choice.anatomy === "brute" ? 1 : 0));
      root.computeWorldMatrix(true);
      meshes = [...figure.parts];
      reportDress(side, `${choice.anatomy} primitive fallback (${fallbackReason})`);
    }
    const nodes = dress?.nodes ?? new Map(root.getChildTransformNodes(false).map((node) => {
      const semantic = node.name.slice(node.name.lastIndexOf(":") + 1);
      return [semantic, node] as const;
    }));
    const itemMeshes: AbstractMesh[] = [];
    for (const hand of [0, 1] as const) {
      const socket = nodes.get(hand === 0 ? "socket_weapon_left" : "socket_weapon_right");
      if (socket === undefined) continue;
      const name = hand === 0 ? choice.left : choice.right;
      const item = buildPreviewItem(scene, side, hand, name, socket);
      if (item !== null) itemMeshes.push(item);
    }
    for (const mesh of meshes) mesh.layerMask = PREVIEW_CAMERA_BITS[side];
    const body: PreviewBody = {
      root, dress,
      label: dress === null
        ? `${choice.anatomy} primitive fallback (${fallbackReason})`
        : `${choice.anatomy} authored rest pose`,
      standingHeight: anatomy.standingHeight / ONE,
      projectedHeight: -1,
      restRotation: root.rotationQuaternion?.clone()
        ?? Quaternion.FromEulerAngles(root.rotation.x, root.rotation.y, root.rotation.z),
      dispose(): void {
        for (const item of itemMeshes) item.dispose();
        if (dress !== null) dress.dispose();
        else {
          for (const mesh of meshes) mesh.dispose();
          root.dispose();
          sources?.dispose();
        }
      },
    };
    bodies[side] = body;
    body.root.setEnabled(active);
  };

  scene.activeCamera = cameras[0];
  const preview: CombatantPreview = {
    cameras,
    show(side, choice): void {
      const generation = (generations[side] ?? 0) + 1;
      generations[side] = generation;
      reportDress(side, `${choice.anatomy} dress loading...`);
      void loadAsset().then(
        (asset) => {
          try {
            finish(side, choice, asset, generation);
          } catch (error) {
            if (!disposed && generations[side] === generation) {
              reportDress(side, `${choice.anatomy} preview unavailable: ${String(error)}`);
            }
          }
        },
        (error: unknown) => {
          if (!disposed) reportDress(side, `${choice.anatomy} preview unavailable: ${String(error)}`);
        },
      );
    },
    draw(frame): void {
      const yaw = previewYaw(frame);
      const renderHeight = scene.getEngine().getRenderHeight();
      for (const [side, body] of bodies.entries()) if (body !== null) {
        if (!inspection[side]!.manual) {
          body.root.rotationQuaternion ??= Quaternion.Identity();
          Quaternion.RotationAxis(Vector3.UpReadOnly, yaw).multiplyToRef(
            body.restRotation, body.root.rotationQuaternion,
          );
        }
        const projected = Math.round(
          renderHeight * body.standingHeight / (2 * 3.4 * Math.tan(PREVIEW_FOV / 2)),
        );
        if (body.projectedHeight !== projected) {
          body.projectedHeight = projected;
          body.dress?.setLod(combatantLodForProjectedHeight(projected));
          reportDress(side === 0 ? 0 : 1, `${body.label} -- ${projected}px projected height`);
        }
      }
    },
    setActive(next): void {
      active = next;
      light.setEnabled(next);
      for (const body of bodies) body?.root.setEnabled(next);
      scene.activeCameras = next ? cameras : [...stageCameras];
      scene.activeCamera = next ? cameras[0] : stageCameras[stageCameras.length - 1] ?? null;
    },
    orbit(side, dx, dy): boolean {
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return false;
      const state = inspection[side]!;
      state.manual = true;
      state.azimuth += dx * 0.006;
      const limit = PREVIEW_ORBIT_LIMIT_DEGREES * Math.PI / 180;
      state.elevation = Math.min(limit, Math.max(-limit, state.elevation + dy * 0.006));
      placeCamera(side);
      return true;
    },
    zoom(side, delta): boolean {
      if (!Number.isFinite(delta) || delta === 0) return false;
      const camera = cameras[side];
      const target = camera.getTarget();
      const height = bodies[side]?.standingHeight ?? 1.8;
      const before = Vector3.Distance(camera.position, target);
      const next = Math.min(height * PREVIEW_MAX_RADIUS_HEIGHTS,
        Math.max(height * PREVIEW_MIN_RADIUS_HEIGHTS, before * Math.exp(delta * 0.001)));
      if (next === before) return true;
      camera.position = target.add(camera.position.subtract(target).normalize().scale(next));
      camera.setTarget(target);
      inspection[side]!.manual = true;
      return true;
    },
    reset(side): void {
      for (const at of side === undefined ? [0, 1] as const : [side]) {
        const camera = cameras[at];
        camera.position.copyFrom(initialCamera[at]!.position);
        camera.setTarget(initialCamera[at]!.target);
        inspection[at]!.azimuth = 0;
        inspection[at]!.elevation = 0;
        inspection[at]!.manual = false;
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      retire(0);
      retire(1);
      light.dispose();
      for (const camera of cameras) camera.dispose();
    },
  };
  preview.setActive(false);
  return preview;
}
