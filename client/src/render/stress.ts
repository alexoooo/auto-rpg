import { FURNITURE_TORCH, MAP_OPEN, MAP_SOLID } from "../protocol/abi.generated.js";
import type {
  PresentationFurniture, PresentationSnapshot, PresentationUnit,
} from "./presentation.js";

export const GREYBOX_STRESS_SEED = 0x5eed1234;
export const GREYBOX_STRESS_COLS = 48;
export const GREYBOX_STRESS_ROWS = 32;
export const GREYBOX_STRESS_POPULATION = 64;
export const GREYBOX_STRESS_DIRECTIONAL_LIGHTS = 1;
export const GREYBOX_STRESS_TORCH_LIGHTS = 8;

const frozen = <T extends object>(value: T): Readonly<T> => Object.freeze(value);

function mixed(seed: number, index: number, salt: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ salt) >>> 0;
  value = Math.imul(value ^ value >>> 16, 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ value >>> 13, 0xc2b2ae35) >>> 0;
  return (value ^ value >>> 16) >>> 0;
}

function body(index: number): PresentationUnit {
  const xCell = 2 + mixed(GREYBOX_STRESS_SEED, index, 0x51f15e) % (GREYBOX_STRESS_COLS - 4);
  const yCell = 2 + mixed(GREYBOX_STRESS_SEED, index, 0xa77ac3) % (GREYBOX_STRESS_ROWS - 4);
  const facingRaw = mixed(GREYBOX_STRESS_SEED, index, 0x13c6ef) & 0xffff;
  const faction = index === 0 ? 0 : 1;
  return frozen({
    key: `${index}:1`, index, generation: 1,
    x: xCell + 0.5, y: yCell + 0.5, facing: facingRaw / 65536 * Math.PI * 2,
    radius: index === 0 ? 0.35 : 0.4, hp: 10, maxHp: 10,
    faction, kind: index === 0 ? 0 : 1 + mixed(GREYBOX_STRESS_SEED, index, 0x3bd39e) % 2,
    intent: 0, visible: true, limbAngle: 0, limbReach: 0.75, limbSpin: 0,
    actionLength: 0, actionArc: 0, hitFlash: 0, blockFlash: 0, parryFlash: 0,
    limbSwing: 0, limbSwingLeft: 0, limbLine: 0, actionKind: 0, actionRole: 0,
    slot: 0, slot0Action: 0, slot1Action: 0, sightRange: 8,
    vx: 0, vy: 0, stridePhase: 0, swingSpan: 0,
  });
}

function torch(index: number): PresentationFurniture {
  const positions = [[6, 1], [24, 1], [46, 8], [46, 24], [41, 30], [23, 30], [1, 23], [1, 7]] as const;
  const position = positions[index];
  if (position === undefined) throw new RangeError(`unsupported stress torch ${index}`);
  const [tx, ty] = position;
  return frozen({ key: `${FURNITURE_TORCH}:${tx}:${ty}`, kind: FURNITURE_TORCH, tx, ty, state: index % 2 });
}

export function createGreyboxStressFixture(): PresentationSnapshot {
  const map = new Array<number>(GREYBOX_STRESS_COLS * GREYBOX_STRESS_ROWS);
  const vis = new Array<number>(map.length).fill(2);
  for (let ty = 0; ty < GREYBOX_STRESS_ROWS; ty++) {
    for (let tx = 0; tx < GREYBOX_STRESS_COLS; tx++) {
      const boundary = tx === 0 || ty === 0 || tx === GREYBOX_STRESS_COLS - 1 || ty === GREYBOX_STRESS_ROWS - 1;
      map[ty * GREYBOX_STRESS_COLS + tx] = boundary ? MAP_SOLID : MAP_OPEN;
    }
  }
  const units = Array.from({ length: GREYBOX_STRESS_POPULATION }, (_, index) => body(index));
  const furniture = Array.from({ length: GREYBOX_STRESS_TORCH_LIGHTS }, (_, index) => torch(index));
  return frozen({
    epoch: 1, tick: 0, mapCols: GREYBOX_STRESS_COLS, mapRows: GREYBOX_STRESS_ROWS,
    tileSize: 1, mapRevision: 1, visRevision: 1, furnitureRevision: 1,
    map: frozen(map), vis: frozen(vis), units: frozen(units),
    shots: frozen([]), events: frozen([]), furniture: frozen(furniture),
  });
}
