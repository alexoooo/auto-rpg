import {
  EVENT_STRIDE, FOCUS_NONE, FRAME_LAYOUT_VERSION, FRAME_MAX, FRAME_OFFSET, FURNITURE_MAX,
  FURNITURE_OFFSET, FURNITURE_STRIDE, HEADER_LEN, MAP_MAX, MAP_OFFSET,
  MAX_EVENTS, MAX_SHOTS, MAX_UNITS, SHOT_STRIDE, SNAPSHOT_BUFFER_BYTES,
  UNIT_STRIDE, VIS_OFFSET,
} from "../protocol/abi.generated.js";
import {
  LEGACY_WORKER_PROTOCOL_VERSION, WORKER_PROTOCOL_VERSION, isU32, type SnapshotMessage,
} from "../protocol/messages.js";

export const MAP_UNKNOWN = 255;
const ORDER_FOCUS = 3;
const HEADER_ORDER_KIND = 2;
const HEADER_ORDER_X = 3;
const HEADER_ORDER_Y = 4;
const HEADER_UNIT_COUNT = 6;
const HEADER_SHOT_COUNT = 7;
const HEADER_EVENT_COUNT = 8;
const UNIT_VISIBLE = 28;
const UNIT_ENTITY_INDEX = 9;
const UNIT_ENTITY_GENERATION = 10;
const EVENT_X = 1;
const EVENT_Y = 2;
const EVENT_ACTOR_INDEX = 4;
const EVENT_OTHER_INDEX = 5;

export type LegacyPublication = {
  frameLayoutVersion: number; headerLength: number; unitStride: number;
  shotStride: number; eventStride: number; furnitureStride: number;
  frame: Float32Array; map: Uint8Array; vis: Uint8Array; furniture: Uint8Array;
  frameLength: number; mapLength: number; visLength: number; furnitureLength: number;
  mapCols: number; mapRows: number; mapTileSizeMilli: number;
  mapRevision: number; visRevision: number; furnitureRevision: number;
  focusEntityIndex: number; focusEntityGeneration: number;
};

export type FilteredPublication = Omit<SnapshotMessage,
  "kind" | "version" | "epoch" | "tick" | "lastAppliedSequence" |
  "coalescedSnapshots" | "coalescedSnapshotsSaturated" | "bufferId" | "leaseToken" |
  "poolAllocationsTotal" | "buffersFree" | "buffersOutstanding" | "queuedCommands" | "buffer">;

const arraysEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
export class RevisionExhaustedError extends Error {}
const nextRevision = (revision: number): number => {
  if (revision === 0xffff_ffff) throw new RevisionExhaustedError("filtered snapshot revision exhausted");
  return revision + 1;
};
const finiteInteger = (value: number): boolean => Number.isFinite(value) && Number.isInteger(value);
const numberAt = (values: ArrayLike<number>, index: number): number => {
  const value = values[index];
  if (value === undefined) throw new RangeError("publication view is shorter than its metadata");
  return value;
};

export class SnapshotFilterState {
  private rememberedMap = new Uint8Array(MAP_MAX).fill(MAP_UNKNOWN);
  private previousMap = new Uint8Array(0);
  private previousFurniture = new Uint8Array(0);
  private previousVis = new Uint8Array(0);
  private mapRevision = 0;
  private visRevision = 0;
  private furnitureRevision = 0;

  reset(): void {
    this.rememberedMap.fill(MAP_UNKNOWN);
    this.previousMap = new Uint8Array(0);
    this.previousFurniture = new Uint8Array(0);
    this.previousVis = new Uint8Array(0);
    this.mapRevision = 0;
    this.visRevision = 0;
    this.furnitureRevision = 0;
  }

  filter(publication: LegacyPublication, target: ArrayBuffer): FilteredPublication {
    validateLegacyPublication(publication);
    if (target.byteLength !== SNAPSHOT_BUFFER_BYTES) throw new RangeError("snapshot buffer capacity disagrees with generated ABI");
    new Uint8Array(target).fill(0);

    const src = publication.frame;
    const out = new Float32Array(target, FRAME_OFFSET, FRAME_MAX);
    out.set(src.subarray(0, HEADER_LEN), 0);
    const sourceUnits = numberAt(src, HEADER_UNIT_COUNT);
    const sourceShots = numberAt(src, HEADER_SHOT_COUNT);
    const sourceEvents = numberAt(src, HEADER_EVENT_COUNT);
    let sourceAt = HEADER_LEN;
    let outputAt = HEADER_LEN;
    let unitCount = 0;
    const visibleIndices = new Set<number>();
    const visibleIdentities = new Set<string>();
    for (let row = 0; row < sourceUnits; row++, sourceAt += UNIT_STRIDE) {
      if (src[sourceAt + UNIT_VISIBLE] === 0) continue;
      out.set(src.subarray(sourceAt, sourceAt + UNIT_STRIDE), outputAt);
      visibleIndices.add(numberAt(src, sourceAt + UNIT_ENTITY_INDEX));
      visibleIdentities.add(`${numberAt(src, sourceAt + UNIT_ENTITY_INDEX)}:${numberAt(src, sourceAt + UNIT_ENTITY_GENERATION)}`);
      outputAt += UNIT_STRIDE;
      unitCount++;
    }
    if (out[HEADER_ORDER_KIND] === ORDER_FOCUS
      && (publication.focusEntityIndex === FOCUS_NONE
        || publication.focusEntityGeneration === FOCUS_NONE
        || !visibleIdentities.has(`${publication.focusEntityIndex}:${publication.focusEntityGeneration}`))) {
      out[HEADER_ORDER_X] = 0;
      out[HEADER_ORDER_Y] = 0;
    }

    const mapLength = publication.mapLength;
    const filteredMap = new Uint8Array(mapLength);
    for (let i = 0; i < mapLength; i++) {
      if (numberAt(publication.vis, i) === 2) this.rememberedMap[i] = numberAt(publication.map, i);
      filteredMap[i] = numberAt(publication.vis, i) === 0 ? MAP_UNKNOWN : numberAt(this.rememberedMap, i);
    }
    const tileVisible = (x: number, y: number): boolean => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      const tx = Math.floor(x * 1000 / publication.mapTileSizeMilli);
      const ty = Math.floor(y * 1000 / publication.mapTileSizeMilli);
      return tx >= 0 && ty >= 0 && tx < publication.mapCols && ty < publication.mapRows
        && publication.vis[ty * publication.mapCols + tx] === 2;
    };

    let shotCount = 0;
    for (let row = 0; row < sourceShots; row++, sourceAt += SHOT_STRIDE) {
      if (!tileVisible(numberAt(src, sourceAt), numberAt(src, sourceAt + 1))) continue;
      out.set(src.subarray(sourceAt, sourceAt + SHOT_STRIDE), outputAt);
      outputAt += SHOT_STRIDE;
      shotCount++;
    }
    let eventCount = 0;
    for (let row = 0; row < sourceEvents; row++, sourceAt += EVENT_STRIDE) {
      if (!tileVisible(numberAt(src, sourceAt + EVENT_X), numberAt(src, sourceAt + EVENT_Y))) continue;
      out.set(src.subarray(sourceAt, sourceAt + EVENT_STRIDE), outputAt);
      if (!visibleIndices.has(numberAt(out, outputAt + EVENT_ACTOR_INDEX))) out[outputAt + EVENT_ACTOR_INDEX] = -1;
      if (!visibleIndices.has(numberAt(out, outputAt + EVENT_OTHER_INDEX))) out[outputAt + EVENT_OTHER_INDEX] = -1;
      outputAt += EVENT_STRIDE;
      eventCount++;
    }
    out[HEADER_UNIT_COUNT] = unitCount;
    out[HEADER_SHOT_COUNT] = shotCount;
    out[HEADER_EVENT_COUNT] = eventCount;

    new Uint8Array(target, MAP_OFFSET, mapLength).set(filteredMap);
    new Uint8Array(target, VIS_OFFSET, publication.visLength).set(publication.vis.subarray(0, publication.visLength));

    const visibleFurniture: number[] = [];
    for (let row = 0; row < publication.furnitureLength; row++) {
      const at = row * FURNITURE_STRIDE;
      const tx = numberAt(publication.furniture, at + 1);
      const ty = numberAt(publication.furniture, at + 2);
      if (tx >= publication.mapCols || ty >= publication.mapRows || publication.vis[ty * publication.mapCols + tx] !== 2) continue;
      for (let column = 0; column < FURNITURE_STRIDE; column++) visibleFurniture.push(numberAt(publication.furniture, at + column));
    }
    const furnitureBytes = Uint8Array.from(visibleFurniture);
    new Uint8Array(target, FURNITURE_OFFSET, furnitureBytes.length).set(furnitureBytes);

    const mapMoved = this.previousMap.length === 0
      ? filteredMap.some((value) => value !== MAP_UNKNOWN)
      : !arraysEqual(filteredMap, this.previousMap);
    if (mapMoved) {
      this.mapRevision = nextRevision(this.mapRevision);
    }
    this.previousMap = filteredMap.slice();
    if (!arraysEqual(furnitureBytes, this.previousFurniture)) {
      this.furnitureRevision = nextRevision(this.furnitureRevision);
      this.previousFurniture = furnitureBytes.slice();
    }
    const filteredVis = publication.vis.subarray(0, publication.visLength);
    const visMoved = this.previousVis.length === 0
      ? filteredVis.some((value) => value !== 0)
      : !arraysEqual(filteredVis, this.previousVis);
    if (visMoved) {
      this.visRevision = nextRevision(this.visRevision);
    }
    this.previousVis = filteredVis.slice();

    return {
      frameLayoutVersion: FRAME_LAYOUT_VERSION, headerLength: HEADER_LEN,
      unitStride: UNIT_STRIDE, shotStride: SHOT_STRIDE, eventStride: EVENT_STRIDE,
      furnitureStride: FURNITURE_STRIDE, frameLength: outputAt,
      mapLength, visLength: publication.visLength,
      furnitureLength: furnitureBytes.length / FURNITURE_STRIDE,
      mapCols: publication.mapCols, mapRows: publication.mapRows,
      mapTileSizeMilli: publication.mapTileSizeMilli,
      mapRevision: this.mapRevision, visRevision: this.visRevision,
      furnitureRevision: this.furnitureRevision,
    };
  }
}

export function validateLegacyPublication(value: LegacyPublication): void {
  if (value.frameLayoutVersion !== FRAME_LAYOUT_VERSION || value.headerLength !== HEADER_LEN
    || value.unitStride !== UNIT_STRIDE || value.shotStride !== SHOT_STRIDE
    || value.eventStride !== EVENT_STRIDE || value.furnitureStride !== FURNITURE_STRIDE) {
    throw new RangeError("legacy wasm ABI disagrees with generated ABI");
  }
  const integerFields = [value.frameLength, value.mapLength, value.visLength, value.furnitureLength,
    value.mapCols, value.mapRows, value.mapTileSizeMilli, value.mapRevision, value.visRevision, value.furnitureRevision,
    value.focusEntityIndex, value.focusEntityGeneration];
  if (!integerFields.every((field) => isU32(field))) throw new RangeError("publication metadata is not u32");
  if (value.mapTileSizeMilli === 0 || value.mapCols * value.mapRows !== value.mapLength
    || value.mapLength !== value.visLength || value.mapLength > MAP_MAX) throw new RangeError("map/VIS shape is invalid");
  if (value.furnitureLength > FURNITURE_MAX || value.furniture.length < value.furnitureLength * FURNITURE_STRIDE) throw new RangeError("furniture length is invalid");
  if (value.frameLength < HEADER_LEN || value.frameLength > FRAME_MAX || value.frame.length < value.frameLength) throw new RangeError("frame length is invalid");
  for (let i = 0; i < value.frameLength; i++) if (!Number.isFinite(value.frame[i])) throw new RangeError("frame contains a non-finite value");
  const units = numberAt(value.frame, HEADER_UNIT_COUNT);
  const shots = numberAt(value.frame, HEADER_SHOT_COUNT);
  const events = numberAt(value.frame, HEADER_EVENT_COUNT);
  if (![units, shots, events].every(finiteInteger) || units < 0 || units > MAX_UNITS
    || shots < 0 || shots > MAX_SHOTS || events < 0 || events > MAX_EVENTS
    || HEADER_LEN + units * UNIT_STRIDE + shots * SHOT_STRIDE + events * EVENT_STRIDE !== value.frameLength) {
    throw new RangeError("packed frame counts disagree with frameLength");
  }
  if (value.map.length < value.mapLength || value.vis.length < value.visLength) throw new RangeError("map/VIS view is shorter than metadata");
}

export type SnapshotView = {
  frame: Float32Array; map: Uint8Array; vis: Uint8Array; furniture: Uint8Array;
  entityKey(row: number): string;
};

export function parseSnapshot(message: SnapshotMessage): SnapshotView {
  // Either accepted version. The snapshot layout is the same on both -- v2 adds
  // a second kind of *session* rather than a second frame -- and the exact V1
  // sessions `articulated-mechanical-gate.md` commits to accepting are still
  // handed the buffer through this validator.
  if ((message.version !== WORKER_PROTOCOL_VERSION && message.version !== LEGACY_WORKER_PROTOCOL_VERSION)
    || message.buffer.byteLength !== SNAPSHOT_BUFFER_BYTES
    || message.frameLayoutVersion !== FRAME_LAYOUT_VERSION || message.headerLength !== HEADER_LEN
    || message.unitStride !== UNIT_STRIDE || message.shotStride !== SHOT_STRIDE
    || message.eventStride !== EVENT_STRIDE || message.furnitureStride !== FURNITURE_STRIDE) {
    throw new RangeError("snapshot ABI metadata is invalid");
  }
  const ints = [message.epoch, message.tick, message.lastAppliedSequence, message.coalescedSnapshots,
    message.leaseToken, message.frameLength, message.mapLength, message.visLength, message.furnitureLength,
    message.mapCols, message.mapRows, message.mapTileSizeMilli, message.mapRevision, message.visRevision, message.furnitureRevision,
    message.poolAllocationsTotal, message.buffersFree, message.buffersOutstanding, message.queuedCommands];
  if (!ints.every((field) => isU32(field)) || message.epoch === 0 || message.leaseToken === 0
    || (message.bufferId !== 0 && message.bufferId !== 1 && message.bufferId !== 2)
    || typeof message.coalescedSnapshotsSaturated !== "boolean"
    || message.poolAllocationsTotal !== 3 || message.buffersFree > 3 || message.buffersOutstanding > 3
    || message.buffersFree + message.buffersOutstanding !== 3 || message.queuedCommands > 256
    || message.frameLength < HEADER_LEN || message.frameLength > FRAME_MAX
    || message.mapLength !== message.visLength || message.mapLength !== message.mapCols * message.mapRows
    || message.mapLength > MAP_MAX || message.furnitureLength > FURNITURE_MAX || message.mapTileSizeMilli === 0) {
    throw new RangeError("snapshot shape metadata is invalid");
  }
  const frame = new Float32Array(message.buffer, FRAME_OFFSET, message.frameLength);
  for (const value of frame) if (!Number.isFinite(value)) throw new RangeError("snapshot frame contains a non-finite value");
  const units = numberAt(frame, HEADER_UNIT_COUNT);
  const shots = numberAt(frame, HEADER_SHOT_COUNT);
  const events = numberAt(frame, HEADER_EVENT_COUNT);
  if (![units, shots, events].every(finiteInteger) || units < 0 || units > MAX_UNITS
    || shots < 0 || shots > MAX_SHOTS || events < 0 || events > MAX_EVENTS
    || HEADER_LEN + units * UNIT_STRIDE + shots * SHOT_STRIDE + events * EVENT_STRIDE !== message.frameLength) {
    throw new RangeError("snapshot frame counts disagree with metadata");
  }
  const map = new Uint8Array(message.buffer, MAP_OFFSET, message.mapLength);
  const vis = new Uint8Array(message.buffer, VIS_OFFSET, message.visLength);
  const furniture = new Uint8Array(message.buffer, FURNITURE_OFFSET, message.furnitureLength * FURNITURE_STRIDE);
  return {
    frame, map, vis, furniture,
    entityKey(row: number): string {
      if (!Number.isInteger(row) || row < 0 || row >= units) throw new RangeError("unit row is out of bounds");
      const at = HEADER_LEN + row * UNIT_STRIDE;
      return `${numberAt(frame, at + UNIT_ENTITY_INDEX)}:${numberAt(frame, at + UNIT_ENTITY_GENERATION)}`;
    },
  };
}
