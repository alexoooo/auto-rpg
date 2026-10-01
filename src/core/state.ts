import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

/**
 * **State**: what a step writes and a later step reads, as plain data that saves and loads whole.
 *
 * A module's memory is one object, its `state`, and the states of everything in a bout hang on one
 * root. `saveState` copies what is under a root; `loadState` puts a copy back in place, so whoever
 * holds an object of the state holds it still, with the saved values in it. Two slots that held one
 * object at the save hold one object after the load.
 *
 * State is numbers, strings, booleans, null, plain objects, arrays, typed arrays, a `Map` or `Set`
 * keyed by strings or numbers, `Vector3` and `Quaternion`. A function, a node, a body, or an object
 * with a getter is not state, and `saveState` refuses it by its path.
 *
 * A constant a state points at is frozen (`deepFreeze`): a load never writes into a frozen object,
 * it puts a copy in the slot.
 */

/** A saved state: plain data sharing nothing with what it was saved from, good for `loadState` and for another thread. */
export type Saved = unknown;

/** The key that marks a saved vector or turn, which a thread boundary would strip of its class. */
const TAG = "~";
type Typed = Float64Array | Float32Array | Int32Array | Uint8Array;
const isTyped = (value: unknown): value is Typed => ArrayBuffer.isView(value) && !(value instanceof DataView);
const isPlain = (value: object): boolean => { const p: unknown = Object.getPrototypeOf(value); return p === Object.prototype || p === null; };
const isKey = (key: unknown): boolean => typeof key === "string" || typeof key === "number";

/**
 * A copy of the state under `root`: what `loadState` puts back. It throws, naming the path, at
 * anything that is not state: a function, a getter, a node or any object of a class other than
 * the ones a state may hold.
 */
export function saveState(root: object): Saved {
  const made = new Map<object, unknown>();
  const copy = (value: unknown, path: string): unknown => {
    if (typeof value === "function" || typeof value === "symbol") throw new Error(`${path} is a ${typeof value}, which is not state`);
    if (value === null || typeof value !== "object") return value;
    if (made.has(value)) return made.get(value);
    const keep = <T>(out: T): T => { made.set(value, out); return out; };
    if (value instanceof Vector3) return keep({ [TAG]: "vector", at: [value.x, value.y, value.z] });
    if (value instanceof Quaternion) return keep({ [TAG]: "turn", at: [value.x, value.y, value.z, value.w] });
    if (isTyped(value)) return keep(value.slice());
    if (Array.isArray(value)) {
      const list = keep([] as unknown[]);
      value.forEach((item, i) => list.push(copy(item, `${path}[${i}]`)));
      return list;
    }
    if (value instanceof Map) {
      const map = keep(new Map<unknown, unknown>());
      for (const [key, item] of value) {
        if (!isKey(key)) throw new Error(`${path} is keyed by an object, which is not state`);
        map.set(key, copy(item, `${path}.get(${String(key)})`));
      }
      return map;
    }
    if (value instanceof Set) {
      for (const item of value) if (!isKey(item)) throw new Error(`${path} holds an object, which is not state`);
      return keep(new Set(value));
    }
    if (!isPlain(value)) throw new Error(`${path} is a ${value.constructor?.name ?? "classed object"}, which is not state`);
    const record = keep({} as Record<string, unknown>);
    for (const [key, d] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (d.get || d.set) throw new Error(`${path}.${key} is computed, which is not state`);
      record[key] = copy(d.value, `${path}.${key}`);
    }
    return record;
  };
  return copy(root, "state");
}

/**
 * Put `saved` (a `saveState`) into the state under `live`, in place: an object of `live`'s that
 * is of the saved one's kind, not frozen and not already filled is filled, and any other slot is
 * given a new one; two slots that shared an object at the save share one after.
 */
export function loadState(live: object, saved: Saved): void {
  const made = new Map<object, unknown>(), filled = new Set<object>();
  const usable = (was: unknown): was is object => typeof was === "object" && was !== null && !filled.has(was) && !Object.isFrozen(was);
  const fill = (was: unknown, value: unknown): unknown => {
    if (value === null || typeof value !== "object") return value;
    if (made.has(value)) return made.get(value);
    const keep = <T extends object>(out: T): T => { made.set(value, out); filled.add(out); return out; };
    const tag = isPlain(value) ? (value as Record<string, unknown>)[TAG] : undefined;
    if (tag === "vector") {
      const [x, y, z] = (value as { at: [number, number, number] }).at;
      return keep(usable(was) && was instanceof Vector3 ? was.set(x, y, z) : new Vector3(x, y, z));
    }
    if (tag === "turn") {
      const [x, y, z, w] = (value as { at: [number, number, number, number] }).at;
      return keep(usable(was) && was instanceof Quaternion ? was.set(x, y, z, w) : new Quaternion(x, y, z, w));
    }
    if (isTyped(value)) {
      if (usable(was) && isTyped(was) && was.constructor === value.constructor && was.length === value.length) { was.set(value); return keep(was); }
      return keep(value.slice());
    }
    if (Array.isArray(value)) {
      const list = keep(usable(was) && Array.isArray(was) ? was as unknown[] : []), old = list.slice();
      list.length = value.length;
      value.forEach((item, i) => { list[i] = fill(old[i], item); });
      return list;
    }
    if (value instanceof Map) {
      const map = keep(usable(was) && was instanceof Map ? was as Map<unknown, unknown> : new Map<unknown, unknown>()), old = new Map(map);
      map.clear();
      for (const [key, item] of value) map.set(key, fill(old.get(key), item));
      return map;
    }
    if (value instanceof Set) {
      const set = keep(usable(was) && was instanceof Set ? was as Set<unknown> : new Set<unknown>());
      set.clear();
      for (const item of value) set.add(item);
      return set;
    }
    const record = keep(usable(was) && isPlain(was) ? was as Record<string, unknown> : {});
    for (const key of Object.keys(record)) if (!(key in (value as object))) delete record[key];
    for (const [key, item] of Object.entries(value as object)) record[key] = fill(record[key], item);
    return record;
  };
  if (fill(live, saved) !== live) throw new Error("a state loads into a state of its own kind");
}

/** `value` frozen, and everything it holds: a constant a state may point at (`loadState` never writes into one). */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
