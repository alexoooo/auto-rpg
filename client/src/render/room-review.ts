import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  FURNITURE_DOOR, FURNITURE_DOOR_OPEN, FURNITURE_DOOR_SHUT, FURNITURE_TORCH,
  MAP_OPEN, MAP_SOLID, TORCH_FACE_POS_X, TORCH_FACE_POS_Y,
} from "../protocol/abi.generated.js";
import type { PresentationFurniture, PresentationSnapshot, PresentationUnit } from "./presentation.js";
import type { RoomStressDecoration } from "./room-stress.js";

export const ROOM_REVIEW_COLS = 16;
export const ROOM_REVIEW_ROWS = 10;
export const ROOM_REVIEW_SOLID_TILES = 48;
export const ROOM_REVIEW_UNIT_COUNT = 8;

export type CompactRoomReviewFixture = PresentationSnapshot & Readonly<{
  fixtureId: "v2-room-review-1";
  roomDecorations: readonly RoomStressDecoration[];
}>;

const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze(value);

function unit(index: number): PresentationUnit {
  const positions = [[3.5, 3.5], [5.5, 3.5], [7.5, 3.5], [9.5, 3.5],
    [4.5, 6.5], [6.5, 6.5], [8.5, 6.5], [10.5, 6.5]] as const;
  const [x, y] = positions[index] ?? positions[0];
  return freeze({
    key: `${index}:1`, index, generation: 1, x, y, facing: index * Math.PI / 4,
    radius: index === 0 ? 0.35 : 0.4, hp: 10, maxHp: 10, faction: index === 0 ? 0 : 1,
    kind: index === 0 ? 0 : 1 + index % 2, intent: 0, visible: true,
    limbAngle: 0, limbReach: 0.75, limbSpin: 0, actionLength: 0, actionArc: 0,
    hitFlash: 0, blockFlash: 0, parryFlash: 0, limbSwing: 0, limbSwingLeft: 0,
    limbLine: 0, actionKind: 0, actionRole: 0, slot: 0, slot0Action: 0,
    slot1Action: 0, sightRange: 8, vx: 0, vy: 0, stridePhase: 0, swingSpan: 0,
  });
}

function furniture(kind: number, tx: number, ty: number, state: number): PresentationFurniture {
  return freeze({ key: `${kind}:${tx}:${ty}`, kind, tx, ty, state });
}

export function createCompactRoomReviewFixture(): CompactRoomReviewFixture {
  const map = new Array<number>(ROOM_REVIEW_COLS * ROOM_REVIEW_ROWS).fill(MAP_OPEN);
  for (let ty = 0; ty < ROOM_REVIEW_ROWS; ty++) for (let tx = 0; tx < ROOM_REVIEW_COLS; tx++) {
    if (tx === 0 || ty === 0 || tx === ROOM_REVIEW_COLS - 1 || ty === ROOM_REVIEW_ROWS - 1) {
      map[ty * ROOM_REVIEW_COLS + tx] = MAP_SOLID;
    }
  }
  const decorations = (["decal_rubble", "decal_root", "prop_barrel"] as const).flatMap((piece, row) =>
    Array.from({ length: 4 }, (_, index): RoomStressDecoration => freeze({
      key: `${piece}:${index}`, piece, tx: 3 + index * 3, ty: 2 + row * 2,
      quarterTurns: (row + index) % 4 as 0 | 1 | 2 | 3,
    })));
  return freeze({
    fixtureId: "v2-room-review-1", epoch: 1, tick: 0,
    mapCols: ROOM_REVIEW_COLS, mapRows: ROOM_REVIEW_ROWS, tileSize: 1,
    mapRevision: 1, visRevision: 1, furnitureRevision: 1,
    map: freeze(map), vis: freeze(new Array<number>(map.length).fill(2)),
    units: freeze(Array.from({ length: ROOM_REVIEW_UNIT_COUNT }, (_, index) => unit(index))),
    shots: freeze([]), events: freeze([]),
    furniture: freeze([
      furniture(FURNITURE_DOOR, 4, 0, FURNITURE_DOOR_OPEN),
      furniture(FURNITURE_DOOR, 11, ROOM_REVIEW_ROWS - 1, FURNITURE_DOOR_SHUT),
      furniture(FURNITURE_TORCH, 1, 1, TORCH_FACE_POS_X),
      furniture(FURNITURE_TORCH, 14, 1, TORCH_FACE_POS_Y),
      furniture(FURNITURE_TORCH, 14, 8, TORCH_FACE_POS_X),
      furniture(FURNITURE_TORCH, 1, 8, TORCH_FACE_POS_Y),
    ]),
    roomDecorations: freeze(decorations),
  });
}

export function applyAuthoredRoomLighting(scene: Scene): Readonly<{ dispose(): void }> {
  const previousClear = scene.clearColor.clone();
  const previousExposure = scene.imageProcessingConfiguration.exposure;
  const previousContrast = scene.imageProcessingConfiguration.contrast;
  scene.clearColor = new Color4(0.012, 0.016, 0.032, 1);
  scene.imageProcessingConfiguration.exposure = 1.34;
  scene.imageProcessingConfiguration.contrast = 1.16;
  const fill = new HemisphericLight("authored-room:hemispheric-fill", new Vector3(0, 1, 0), scene);
  fill.diffuse = new Color3(0.68, 0.60, 0.50);
  fill.groundColor = new Color3(0.08, 0.065, 0.055);
  fill.intensity = 0.58;
  return Object.freeze({ dispose: () => {
    fill.dispose();
    scene.clearColor.copyFrom(previousClear);
    scene.imageProcessingConfiguration.exposure = previousExposure;
    scene.imageProcessingConfiguration.contrast = previousContrast;
  } });
}
