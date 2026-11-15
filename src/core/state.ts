import { Quaternion, Vector3 } from "./math/vector.ts";

/**
 * **State**: what a step writes and a later step reads, as plain data that saves and loads whole.
 *
 * A module's memory is one object, its `state`, and the states of everything in a bout hang on one
 * root. `saveState` copies what is under a root; `loadState` puts a copy back in place, so whoever
 * holds an object of the state holds it still, with the saved values in it. Two slots that held one
 * object at the save hold one object after the load.
 *
 * State is numbers, strings, booleans, null, plain objects, arrays, typed arrays, a `Map` or `Set`
 * keyed by strings or numbers, `Vector3` and `Quaternion`. A function, a body, or an object
 * with a getter is not state, and `saveState` refuses it by its path.
 *
 * A constant a state points at is frozen (`deepFreeze`): a load never writes into a frozen object,
 * it puts a copy in the slot.
 */

/** A saved state: plain data sharing nothing with what it was saved from, good for `loadState` and for another thread. */
export type Saved = unknown;

/** Internal discriminators; plain records carrying the key are escaped before crossing a thread. */
const TAG = "~";
type Typed = Float64Array | Float32Array | Int32Array | Uint8Array;
const isTyped = (value: unknown): value is Typed => ArrayBuffer.isView(value) && !(value instanceof DataView);
const isPlain = (value: object): boolean => { const p: unknown = Object.getPrototypeOf(value); return p === Object.prototype || p === null; };
const isKey = (key: unknown): boolean => typeof key === "string" || typeof key === "number";

/**
 * A copy of the state under `root`: what `loadState` puts back. It throws, naming the path, at
 * anything that is not state: a function, a getter or any object of a class other than
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
      const list = keep(new Array<unknown>(value.length));
      value.forEach((item, i) => { list[i] = copy(item, `${path}[${i}]`); });
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
    const escaped = Object.hasOwn(value, TAG) || Object.getPrototypeOf(value) === null;
    const record: Record<string, unknown> = {};
    keep(escaped ? { [TAG]: "record", nullPrototype: Object.getPrototypeOf(value) === null, entries: record } : record);
    for (const [key, d] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (d.get || d.set) throw new Error(`${path}.${key} is computed, which is not state`);
      Object.defineProperty(record, key, { value: copy(d.value, `${path}.${key}`), enumerable: true, configurable: true, writable: true });
    }
    return made.get(value);
  };
  return copy(root, "state");
}

/**
 * **The shape of the state under `root`**, 16 hex digits: each record's keys, each container's
 * kind and length, each value's kind and where two slots hold one object; never a value. A state's
 * shape moves as it is stepped (a slot filled, a list grown), so two states are compared as built:
 * of one shape there, their code keeps the same memory, and a save of one fits the other. What
 * hangs on an object of `except` is left out.
 */
export function stateShape(root: object, except: readonly object[] = []): string {
  let a = 0x811c9dc5, b = 0x9e3779b9;
  const put = (text: string): void => {
    for (let i = 0; i < text.length; i++) { const code = text.charCodeAt(i); a = Math.imul(a ^ code, 0x01000193); b = Math.imul(b ^ code, 0x85ebca6b) + 0x9e3779b9 | 0; }
    a = Math.imul(a ^ 0x1f, 0x01000193);
  };
  const seen = new Map<object, number>(), out = new Set(except);
  const walk = (value: unknown): void => {
    if (value === null || typeof value !== "object") { put(value === null ? "null" : typeof value); return; }
    if (out.has(value)) { put("out"); return; }
    const met = seen.get(value);
    if (met !== undefined) { put(`@${met}`); return; }
    seen.set(value, seen.size);
    if (value instanceof Vector3) put("vector");
    else if (value instanceof Quaternion) put("turn");
    else if (isTyped(value)) put(`${value.constructor.name}${value.length}`);
    else if (Array.isArray(value)) { put(`[${value.length}`); for (const item of value) walk(item); }
    else if (value instanceof Map) { put(`map${value.size}`); for (const [key, item] of value) { put(String(key)); walk(item); } }
    else if (value instanceof Set) { put(`set${value.size}`); for (const key of value) put(String(key)); }
    else {
      const keys = Object.keys(value).sort();
      put(`{${keys.length}`);
      for (const key of keys) { put(key); walk((value as Record<string, unknown>)[key]); }
    }
  };
  walk(root);
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/**
 * Put `saved` (a `saveState`) into the state under `live`, in place: an object of `live`'s that
 * is of the saved one's kind, not frozen and not already filled is filled, and any other slot is
 * given a new one; two slots that shared an object at the save share one after. An object of
 * `kept` stays as it is, whatever was saved in its slot: a part of the state that does not load.
 */
export function loadState(live: object, saved: Saved, kept: readonly object[] = []): void {
  const made = new Map<object, unknown>(), filled = new Set<object>(), stays = new Set(kept);
  const usable = (was: unknown): was is object => typeof was === "object" && was !== null && !filled.has(was) && !Object.isFrozen(was);
  const fill = (was: unknown, value: unknown): unknown => {
    if (typeof was === "object" && was !== null && stays.has(was)) {
      if (typeof value === "object" && value !== null) made.set(value, was);
      return was;
    }
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
      for (let i = 0; i < list.length; i++) if (!Object.hasOwn(value, i)) delete list[i];
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
    const escaped = tag === "record" ? value as { nullPrototype: boolean; entries: Record<string, unknown> } : null;
    const entries = escaped?.entries ?? value;
    const prototype = escaped?.nullPrototype ? null : Object.prototype;
    const record = keep(usable(was) && Object.getPrototypeOf(was) === prototype ? was as Record<string, unknown> : Object.create(prototype) as Record<string, unknown>);
    for (const key of Object.keys(record)) if (!Object.hasOwn(entries, key)) delete record[key];
    for (const [key, item] of Object.entries(entries)) Object.defineProperty(record, key, {
      value: fill(Object.hasOwn(record, key) ? record[key] : undefined, item), enumerable: true, configurable: true, writable: true,
    });
    return record;
  };
  if (fill(live, saved) !== live) throw new Error("a state loads into a state of its own kind");
}

/** Verified immutable graphs can be shared by later constants without walking their datasets again. */
const FROZEN = new WeakSet<object>();

/** A deeply frozen constant. Mutable containers belong to state, not constants. */
export function deepFreeze<T>(value: T): T {
  // A value already verified, or none to freeze, costs a lookup and nothing more.
  if (typeof value !== "object" || value === null || FROZEN.has(value)) return value;
  const seen = new Set<object>();
  const freeze = (item: unknown): void => {
    if (typeof item !== "object" || item === null || FROZEN.has(item) || seen.has(item)) return;
    if (item instanceof Map || item instanceof Set || ArrayBuffer.isView(item)) throw new Error("a constant uses immutable records and arrays, not mutable containers");
    seen.add(item);
    // Own enumerable values, as `Object.values` reads them, without an array of them: a published value is frozen at each answer.
    if (Array.isArray(item)) for (let i = 0; i < item.length; i++) freeze(item[i]);
    else for (const key in item) if (Object.hasOwn(item, key)) freeze((item as Record<string, unknown>)[key]);
    Object.freeze(item);
    FROZEN.add(item);
  };
  freeze(value);
  return value;
}
