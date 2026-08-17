import { FURNITURE_DOOR, FURNITURE_DOOR_OPEN, FURNITURE_DOOR_SHUT, FURNITURE_TORCH,
  MAP_OPEN, MAP_SOLID, TORCH_FACE_POS_X, TORCH_FACE_POS_Y } from "../protocol/abi.generated.js";
import type { PresentationFurniture, PresentationSnapshot, PresentationUnit } from "./presentation.js";

export const ROOM_STRESS_FIXTURE_ID = "v2-room-slice-1" as const;
export const ROOM_STRESS_SEED = 1592594996;
export const ROOM_STRESS_COLS = 48;
export const ROOM_STRESS_ROWS = 32;
export const ROOM_STRESS_POPULATION = 64;
export const ROOM_STRESS_CSS_WIDTH = 1920;
export const ROOM_STRESS_CSS_HEIGHT = 1080;
export const ROOM_STRESS_WARMUP_MS = 30_000;
export const ROOM_STRESS_SAMPLE_MS = 120_000;
export const ROOM_STRESS_MAP_SHA256 = "a20ba5f64ef55bd7716c2a7cf17f3065619876d1ded2e81b05199b5282222907" as const;

// Exposed-interface census of the committed 48 x 32 map: 152 faces bound the
// outer enclosure and 36 bound the closed interior ring after two true doorway
// cells replace their faces. Each doorway has a frame on both exposed faces.
export const ROOM_STRESS_PIECE_COUNTS = Object.freeze({
  floor_a: 768, floor_b: 768,
  wall_straight: 188, wall_inside: 0, wall_outside: 0, wall_end: 0,
  door_frame: 4, door_leaf: 2, torch_bracket: 8,
  decal_rubble: 4, decal_root: 4, prop_barrel: 4,
});

export type RoomStressFixture = PresentationSnapshot & Readonly<{
  fixtureId: typeof ROOM_STRESS_FIXTURE_ID;
  generatorSeed: typeof ROOM_STRESS_SEED;
  cssWidth: typeof ROOM_STRESS_CSS_WIDTH;
  cssHeight: typeof ROOM_STRESS_CSS_HEIGHT;
  backingWidth: typeof ROOM_STRESS_CSS_WIDTH;
  backingHeight: typeof ROOM_STRESS_CSS_HEIGHT;
  renderScale: 1;
  trainingWorkers: 0;
  directionalLights: 1;
  torchLights: 8;
  mapSha256: string;
  pieceCounts: typeof ROOM_STRESS_PIECE_COUNTS;
  roomDecorations: readonly RoomStressDecoration[];
}>;

export type RoomStressDecoration = Readonly<{
  key: string;
  piece: "decal_rubble" | "decal_root" | "prop_barrel";
  tx: number;
  ty: number;
  quarterTurns: 0 | 1 | 2 | 3;
}>;

const frozen = <T extends object>(value: T): Readonly<T> => Object.freeze(value);

function mixed(index: number, salt: number): number {
  let value = (ROOM_STRESS_SEED ^ Math.imul(index + 1, 0x9e3779b1) ^ salt) >>> 0;
  value = Math.imul(value ^ value >>> 16, 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ value >>> 13, 0xc2b2ae35) >>> 0;
  return (value ^ value >>> 16) >>> 0;
}

function body(index: number): PresentationUnit {
  const x = 2 + mixed(index, 0x51f15e) % (ROOM_STRESS_COLS - 4) + 0.5;
  const y = 2 + mixed(index, 0xa77ac3) % (ROOM_STRESS_ROWS - 4) + 0.5;
  return frozen({
    key: `${index}:1`, index, generation: 1, x, y,
    facing: (mixed(index, 0x13c6ef) & 0xffff) / 65536 * Math.PI * 2,
    radius: index === 0 ? 0.35 : 0.4, hp: 10, maxHp: 10,
    faction: index === 0 ? 0 : 1, kind: index === 0 ? 0 : 1 + mixed(index, 0x3bd39e) % 2,
    intent: 0, visible: true, limbAngle: 0, limbReach: 0.75, limbSpin: 0,
    actionLength: 0, actionArc: 0, hitFlash: 0, blockFlash: 0, parryFlash: 0,
    limbSwing: 0, limbSwingLeft: 0, limbLine: 0, actionKind: 0, actionRole: 0,
    slot: 0, slot0Action: 0, slot1Action: 0, sightRange: 8,
    vx: 0, vy: 0, stridePhase: 0, swingSpan: 0,
  });
}

function furniture(kind: number, tx: number, ty: number, state: number): PresentationFurniture {
  return frozen({ key: `${kind}:${tx}:${ty}`, kind, tx, ty, state });
}

function fixtureMap(): readonly number[] {
  const map = new Array<number>(ROOM_STRESS_COLS * ROOM_STRESS_ROWS).fill(MAP_OPEN);
  for (let ty = 0; ty < ROOM_STRESS_ROWS; ty++) for (let tx = 0; tx < ROOM_STRESS_COLS; tx++) {
    if (tx === 0 || ty === 0 || tx === ROOM_STRESS_COLS - 1 || ty === ROOM_STRESS_ROWS - 1) {
      map[ty * ROOM_STRESS_COLS + tx] = MAP_SOLID;
    }
  }
  // A closed 7 x 5 interior wall ring, not a graph of unexplained posts. The
  // north door is shut/solid and the south door is open/floor, matching the
  // live map/furniture ABI rather than drawing an open door over a solid tile.
  for (let tx = 15; tx <= 21; tx++) {
    map[11 * ROOM_STRESS_COLS + tx] = MAP_SOLID;
    map[15 * ROOM_STRESS_COLS + tx] = MAP_SOLID;
  }
  for (let ty = 12; ty <= 14; ty++) {
    map[ty * ROOM_STRESS_COLS + 15] = MAP_SOLID;
    map[ty * ROOM_STRESS_COLS + 21] = MAP_SOLID;
  }
  map[15 * ROOM_STRESS_COLS + 18] = MAP_OPEN;
  return Object.freeze(map);
}

export function createRoomStressFixture(): RoomStressFixture {
  const map = fixtureMap();
  const vis = Object.freeze(new Array<number>(map.length).fill(2));
  const torches = [[6, 1], [24, 1], [46, 8], [46, 24], [41, 30], [23, 30], [1, 23], [1, 7]] as const;
  const rows: PresentationFurniture[] = [
    furniture(FURNITURE_DOOR, 18, 11, FURNITURE_DOOR_SHUT),
    furniture(FURNITURE_DOOR, 18, 15, FURNITURE_DOOR_OPEN),
    ...torches.map(([tx, ty], index) => furniture(FURNITURE_TORCH, tx, ty,
      index % 2 === 0 ? TORCH_FACE_POS_X : TORCH_FACE_POS_Y)),
  ];
  const decorationPieces = ["decal_rubble", "decal_root", "prop_barrel"] as const;
  const roomDecorations = Object.freeze(decorationPieces.flatMap((piece, kind) =>
    Array.from({ length: 4 }, (_, index): RoomStressDecoration => Object.freeze({
      key: `${piece}:${index}`, piece,
      tx: 6 + index * 10, ty: 5 + kind * 5 + (kind === 2 ? 2 : 0),
      quarterTurns: (index + kind) % 4 as 0 | 1 | 2 | 3,
    }))));
  return frozen({
    fixtureId: ROOM_STRESS_FIXTURE_ID, generatorSeed: ROOM_STRESS_SEED,
    cssWidth: ROOM_STRESS_CSS_WIDTH, cssHeight: ROOM_STRESS_CSS_HEIGHT,
    backingWidth: ROOM_STRESS_CSS_WIDTH, backingHeight: ROOM_STRESS_CSS_HEIGHT,
    renderScale: 1, trainingWorkers: 0, directionalLights: 1, torchLights: 8,
    mapSha256: ROOM_STRESS_MAP_SHA256, pieceCounts: ROOM_STRESS_PIECE_COUNTS, roomDecorations,
    epoch: 1, tick: 0, mapCols: ROOM_STRESS_COLS, mapRows: ROOM_STRESS_ROWS, tileSize: 1,
    mapRevision: 1, visRevision: 1, furnitureRevision: 1,
    map, vis, units: Object.freeze(Array.from({ length: ROOM_STRESS_POPULATION }, (_, index) => body(index))),
    shots: Object.freeze([]), events: Object.freeze([]), furniture: Object.freeze(rows),
  });
}
