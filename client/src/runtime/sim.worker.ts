import {
  DUNGEON_OBJECT_LAYOUT_VERSION, DUNGEON_OBJECT_STRIDE, EVENT_STRIDE,
  FRAME_LAYOUT_VERSION, FRAME_MAX, FURNITURE_MAX,
  FURNITURE_STRIDE, HEADER_LEN, MAP_MAX, MAX_DUNGEON_OBJECTS, SHOT_STRIDE, UNIT_STRIDE,
} from "../protocol/abi.generated.js";
import type { WorkerMessage } from "../protocol/messages.js";
import type { LegacyPublication } from "../state/snapshot.js";
import { SimWorkerHost, type WasmAdapter } from "./sim-worker-host.js";
import { ARENA_EXPORTS, createArenaAdapter, type ArenaExports } from "./arena-recorder.js";

type U32Export = () => number;
type RawExports = WebAssembly.Exports & ArenaExports & {
  memory: WebAssembly.Memory;
  init(seed: number): void;
  set_control(mask: number): void;
  control(): number;
  set_input(moveXMilli: number, moveYMilli: number, aimRaw: number, reachMilli: number, slot: number, strike: number, turnMilli: number): void;
  spawn_monster(kindCode: number, primary: number, secondary: number): number;
  swap_in_hero(kindCode: number, primary: number, secondary: number): number;
  step(ticks: number): void;
  tick: U32Export;
  frame_ptr: U32Export; frame_len: U32Export; frame_layout_version: U32Export;
  header_len: U32Export; unit_stride: U32Export; shot_stride: U32Export; event_stride: U32Export;
  map_ptr: U32Export; map_len: U32Export; map_cols: U32Export; map_rows: U32Export;
  map_tile_size_milli: U32Export; map_revision: U32Export;
  vis_ptr: U32Export; vis_len: U32Export; vis_revision: U32Export;
  furniture_ptr: U32Export; furniture_len: U32Export; furniture_stride: U32Export;
  furniture_revision: U32Export;
  dungeon_object_ptr: U32Export; dungeon_object_len: U32Export; dungeon_object_stride: U32Export;
  dungeon_object_capacity: U32Export; dungeon_objects_dropped: U32Export;
  dungeon_object_layout_version: U32Export;
};

// Every export this adapter calls, checked before a single one is used.
//
// The comment this list used to carry is still the reason it exists: `undefined
// >>> 0` is `0` and `NaN` never grows, so an unchecked export turns every
// assertion below it into a vacuous pass. **The arena names join it here and not
// earlier on purpose** -- v2-ui-05 landed seven configured-duel exports and
// v2-ui-08 eight checkpoint ones, and both closing notes disclosed that none of
// them was listed, because the worker's adapter called none of them and a name
// in this list that nothing calls is a promise the list does not otherwise make.
// This is the session with a caller.
const requiredFunctions = [
  "init", "set_control", "control", "set_input", "spawn_monster", "swap_in_hero", "step", "tick",
  "frame_ptr", "frame_len", "frame_layout_version", "header_len", "unit_stride",
  "shot_stride", "event_stride", "map_ptr", "map_len", "map_cols", "map_rows",
  "map_tile_size_milli", "map_revision", "vis_ptr", "vis_len", "vis_revision",
  "furniture_ptr", "furniture_len", "furniture_stride", "furniture_revision",
  "dungeon_object_ptr", "dungeon_object_len", "dungeon_object_stride",
  "dungeon_object_capacity", "dungeon_objects_dropped", "dungeon_object_layout_version",
  ...ARENA_EXPORTS,
] as const;

async function instantiateWasm(): Promise<RawExports> {
  const response = await fetch("/web.wasm", { cache: "no-store" });
  if (!response.ok) throw new Error(`cannot fetch /web.wasm: HTTP ${response.status}`);
  const fallback = response.clone();
  let instance: WebAssembly.Instance;
  try {
    ({ instance } = await WebAssembly.instantiateStreaming(response, {}));
  } catch (_streamingError) {
    ({ instance } = await WebAssembly.instantiate(await fallback.arrayBuffer(), {}));
  }
  const exports = instance.exports as Partial<RawExports>;
  if (!(exports.memory instanceof WebAssembly.Memory)) throw new RangeError("wasm ABI has no exported memory");
  for (const name of requiredFunctions) {
    if (typeof exports[name] !== "function") throw new RangeError(`wasm ABI is missing ${name}()`);
  }
  return exports as RawExports;
}

async function createAdapter(): Promise<WasmAdapter> {
  const wasm = await instantiateWasm();
  return {
    // The arena facet is the same instance seen through `arena-recorder.ts`'s
    // interface, and it is a free function over the exports precisely so a Node
    // test can build the identical adapter over the identical artifact without
    // a worker, a `fetch` or a `self`.
    arena: createArenaAdapter(wasm),
    init: (seed) => wasm.init(seed),
    setControl: (mask) => wasm.set_control(mask),
    control: () => wasm.control() >>> 0,
    setInput: (moveXMilli, moveYMilli, aimRaw, reachMilli, slot, strike, turnMilli) =>
      wasm.set_input(moveXMilli, moveYMilli, aimRaw, reachMilli, slot, strike, turnMilli),
    spawnMonster: (kindCode, primary, secondary) => wasm.spawn_monster(kindCode, primary, secondary),
    swapInHero: (kindCode, primary, secondary) => wasm.swap_in_hero(kindCode, primary, secondary),
    step: (ticks) => wasm.step(ticks),
    tick: () => wasm.tick() >>> 0,
    readPublication: () => {
      // All wasm calls precede every view construction. Nothing may re-enter wasm
      // until the host has copied these four views into one transferable snapshot.
      const frameLayoutVersion = wasm.frame_layout_version() >>> 0;
      const headerLength = wasm.header_len() >>> 0;
      const unitStride = wasm.unit_stride() >>> 0;
      const shotStride = wasm.shot_stride() >>> 0;
      const eventStride = wasm.event_stride() >>> 0;
      const furnitureStride = wasm.furniture_stride() >>> 0;
      const framePointer = wasm.frame_ptr() >>> 0;
      const frameLength = wasm.frame_len() >>> 0;
      const mapPointer = wasm.map_ptr() >>> 0;
      const mapLength = wasm.map_len() >>> 0;
      const mapCols = wasm.map_cols() >>> 0;
      const mapRows = wasm.map_rows() >>> 0;
      const mapTileSizeMilli = wasm.map_tile_size_milli() >>> 0;
      const mapRevision = wasm.map_revision() >>> 0;
      const visPointer = wasm.vis_ptr() >>> 0;
      const visLength = wasm.vis_len() >>> 0;
      const visRevision = wasm.vis_revision() >>> 0;
      const furniturePointer = wasm.furniture_ptr() >>> 0;
      const furnitureLength = wasm.furniture_len() >>> 0;
      const furnitureRevision = wasm.furniture_revision() >>> 0;
      const dungeonObjectPointer = wasm.dungeon_object_ptr() >>> 0;
      const dungeonObjectLength = wasm.dungeon_object_len() >>> 0;
      const dungeonObjectStride = wasm.dungeon_object_stride() >>> 0;
      const dungeonObjectCapacity = wasm.dungeon_object_capacity() >>> 0;
      const dungeonObjectsDropped = wasm.dungeon_objects_dropped() >>> 0;
      const dungeonObjectLayoutVersion = wasm.dungeon_object_layout_version() >>> 0;
      const memory = wasm.memory.buffer;
      const mapCells = mapCols * mapRows;

      if (frameLayoutVersion !== FRAME_LAYOUT_VERSION || headerLength !== HEADER_LEN
        || unitStride !== UNIT_STRIDE || shotStride !== SHOT_STRIDE
        || eventStride !== EVENT_STRIDE || furnitureStride !== FURNITURE_STRIDE
        || dungeonObjectLayoutVersion !== DUNGEON_OBJECT_LAYOUT_VERSION
        || dungeonObjectStride !== DUNGEON_OBJECT_STRIDE
        || dungeonObjectCapacity !== MAX_DUNGEON_OBJECTS) {
        throw new RangeError("wasm publication layout disagrees with generated ABI");
      }
      if (frameLength < HEADER_LEN || frameLength > FRAME_MAX || mapLength > MAP_MAX
        || visLength !== mapLength || !Number.isSafeInteger(mapCells) || mapCells !== mapLength
        || mapTileSizeMilli === 0 || furnitureLength > FURNITURE_MAX
        || dungeonObjectLength > MAX_DUNGEON_OBJECTS) {
        throw new RangeError("wasm publication shape exceeds generated ABI");
      }
      const sections = [
        ["frame", framePointer, frameLength * Float32Array.BYTES_PER_ELEMENT, Float32Array.BYTES_PER_ELEMENT],
        ["map", mapPointer, mapLength, 1],
        ["VIS", visPointer, visLength, 1],
        ["furniture", furniturePointer, furnitureLength * furnitureStride, 1],
        ["dungeon objects", dungeonObjectPointer,
          dungeonObjectLength * dungeonObjectStride * Uint32Array.BYTES_PER_ELEMENT,
          Uint32Array.BYTES_PER_ELEMENT],
      ] as const;
      for (const [name, pointer, bytes, alignment] of sections) {
        const end = pointer + bytes;
        if (pointer % alignment !== 0 || !Number.isSafeInteger(bytes) || !Number.isSafeInteger(end)
          || end > memory.byteLength) {
          throw new RangeError(`wasm ${name} publication pointer or extent is invalid`);
        }
      }

      return {
        frameLayoutVersion, headerLength, unitStride, shotStride, eventStride,
        furnitureStride, frameLength, mapLength, visLength, furnitureLength,
        dungeonObjectLayoutVersion, dungeonObjectStride, dungeonObjectLength, dungeonObjectsDropped,
        mapCols, mapRows, mapTileSizeMilli, mapRevision, visRevision,
        furnitureRevision,
        frame: new Float32Array(memory, framePointer, frameLength),
        map: new Uint8Array(memory, mapPointer, mapLength),
        vis: new Uint8Array(memory, visPointer, visLength),
        furniture: new Uint8Array(memory, furniturePointer, furnitureLength * furnitureStride),
        dungeonObjects: new Uint32Array(memory, dungeonObjectPointer,
          dungeonObjectLength * dungeonObjectStride),
      } as LegacyPublication;
    },
  };
}

const host = new SimWorkerHost(createAdapter, (message: WorkerMessage, transfer = []) => {
  self.postMessage(message, { transfer: [...transfer] });
}, () => self.close());

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  void host.handle(event.data).catch((error: unknown) => {
    try {
      host.handleUnhandledError(error);
    } catch (_reportingError) {
      // A failed postMessage means no lease-aware diagnostic exchange remains.
      self.close();
    }
  });
});
