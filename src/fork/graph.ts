/**
 * The JavaScript half of a forkable world: the state reachable from a set of roots, captured as a
 * graph and written into the same roots of a second world.
 *
 * **It walks, it does not ask.** Every object reachable through a field, an array slot, a `Map`
 * or a `Set` is captured field by field, so a field added to a class tomorrow is captured
 * tomorrow without anybody listing it. The one thing a walk cannot reach is a closure's `let`,
 * and a closure-built piece therefore implements `Forkable` (`src/forkable.ts`): it hands over a
 * record of its lets and its private objects, and takes one back. The walker treats that record
 * like any other object, so what the piece lists is captured by the same rules as everything else.
 *
 * **References are translated, not copied.** A body, a node, a constraint or the scene is in the
 * world's identity table (`worldIdentities` in `native.ts`) and is captured as its key, restored as
 * the other world's object under the same key. Any other engine object -- a material, an
 * observer, a mesh with no body -- and any function is *structure*: it is never walked into, it is
 * paired with whatever the fork holds at the same path, and it is never copied from one world to
 * the other. A closure from one world handed to the other would drive the wrong bodies.
 *
 * **Restore is in place wherever it can be.** Before anything is written, the captured graph is
 * laid over the fork's graph from the same roots, and every captured object that has a
 * counterpart at the same path -- same kind, same prototype -- is paired with it. Paired objects
 * are overwritten in place, which is what keeps a closure's `const wanted = new Vector3()`, or a
 * `Map` another object holds, the same object it was before; only an object the fork has no
 * counterpart for is built new. Aliasing is kept: an object reached twice is one node.
 *
 * **What is shared rather than copied.** A deeply frozen object is immutable and the fork runs in
 * the same realm, so it is kept by reference, and where the fork already holds an equal one the
 * fork's is kept.
 */

import type { Forkable } from "../forkable.ts";

export function isForkable(value: unknown): value is Forkable {
  return (typeof value === "object" || typeof value === "function") && value !== null
    && typeof (value as Forkable).captureState === "function"
    && typeof (value as Forkable).restoreState === "function";
}

class Ref {
  readonly kind: "node" | "world" | "constant";
  readonly node: number;
  readonly key: string;
  readonly constant: unknown;
  constructor(kind: Ref["kind"], node: number, key: string, constant: unknown) {
    this.kind = kind;
    this.node = node;
    this.key = key;
    this.constant = constant;
  }
}

export type Value = null | undefined | boolean | number | string | bigint | Ref;

type TypedArray = Float64Array | Float32Array | Int32Array | Uint32Array | Int16Array | Uint16Array
  | Int8Array | Uint8Array | Uint8ClampedArray | BigInt64Array | BigUint64Array;

export interface GraphNode {
  readonly id: number;
  /** `external` is structure: paired by path, never written, never copied across. */
  readonly kind: "object" | "array" | "map" | "set" | "typed" | "forkable" | "external";
  readonly proto: object | null;
  readonly frozen: boolean;
  readonly keys: string[];
  readonly values: Value[];
  readonly entries: [Value, Value][];
  readonly typed: TypedArray | null;
  /** Where the walk first met this node: the parent node and the key, for error messages. */
  readonly parent: number;
  readonly via: string;
}

export interface StateGraph {
  readonly nodes: readonly GraphNode[];
  readonly roots: Readonly<Record<string, Value>>;
}

export interface GraphOptions {
  /** World objects captured by key (bodies, nodes, constraints, the scene). */
  readonly identities: ReadonlyMap<object, string>;
  /** Engine structure that is never walked into and never written (materials, observers). */
  readonly structural: (value: object) => boolean;
  /** Filled with every object the walk captured, for an audit of what it did not reach. */
  readonly seen?: Set<object>;
}

const IMMUTABLE = new WeakMap<object, boolean>();

/** Frozen all the way down, with nothing in it that belongs to a world. */
function deeplyImmutable(value: object, options: GraphOptions): boolean {
  const known = IMMUTABLE.get(value);
  if (known !== undefined) return known;
  if (!Object.isFrozen(value) || typeof value === "function" || ArrayBuffer.isView(value)
    || value instanceof Map || value instanceof Set) {
    IMMUTABLE.set(value, false);
    return false;
  }
  IMMUTABLE.set(value, true); // provisional, for cycles
  let result = true;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor)) { result = false; break; }
    const child = descriptor.value as unknown;
    if (child === null || (typeof child !== "object" && typeof child !== "function")) continue;
    if (options.identities.has(child as object) || options.structural(child as object)
      || !deeplyImmutable(child as object, options)) { result = false; break; }
  }
  IMMUTABLE.set(value, result);
  return result;
}

/** Two deeply immutable values with the same content: interchangeable, so the fork's is kept. */
function sameImmutable(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b) || !Object.isFrozen(a) || !Object.isFrozen(b)) return false;
  const ka = Reflect.ownKeys(a), kb = Reflect.ownKeys(b);
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i += 1) {
    if (ka[i] !== kb[i]) return false;
    const x = (a as Record<PropertyKey, unknown>)[ka[i]!];
    const y = (b as Record<PropertyKey, unknown>)[kb[i]!];
    if (!sameImmutable(x, y)) return false;
  }
  return true;
}

function unwalkable(value: object): boolean {
  return value instanceof WeakMap || value instanceof WeakSet || value instanceof Promise
    || value instanceof DataView || (typeof WeakRef !== "undefined" && value instanceof WeakRef);
}

/**
 * A Babylon `Matrix`'s `updateFlag` is a ticket from one process-wide counter, drawn every time any
 * matrix in any world changes. It says "this matrix changed since you last looked" to a cache that
 * compares tickets, and nothing more, so it is not state of a world: a fork keeps the tickets its
 * own matrices drew, a cache in it at worst recomputes once, and a bout that had forks taken from it
 * draws later tickets than the same bout without and is otherwise the same bout.
 */
const isTicket = (value: object, key: string): boolean =>
  key === "updateFlag" && typeof (value as { markAsUpdated?: unknown }).markAsUpdated === "function";

/**
 * The own data properties a walk captures: string-keyed, not accessors, **enumerable or not**. A
 * behaviour record hides its engagement tracker behind `enumerable: false` so that reporters skip
 * it, and a walk that read only `Object.keys` forked every bout with that tracker at its build
 * state -- which an exact fork showed at once as an engagement count off by one.
 */
function dataKeys(value: object): string[] {
  const keys: string[] = [];
  for (const key of Object.getOwnPropertyNames(value)) {
    if (isTicket(value, key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) keys.push(key);
  }
  return keys;
}

/** Capture everything reachable from `roots`. Reads only: nothing in the world is written. */
export function captureGraph(roots: Record<string, unknown>, options: GraphOptions): StateGraph {
  const nodes: GraphNode[] = [];
  const memo = new Map<unknown, number>();

  const node = (kind: GraphNode["kind"], proto: object | null, frozen: boolean, parent: number, via: string,
    typed: TypedArray | null = null): GraphNode => {
    const made: GraphNode = { id: nodes.length, kind, proto, frozen, keys: [], values: [], entries: [], typed, parent, via };
    nodes.push(made);
    return made;
  };
  const ref = (made: GraphNode): Ref => new Ref("node", made.id, "", undefined);
  const seenBy = options.seen;
  const remember = (object: object, id: number): void => {
    memo.set(object, id);
    seenBy?.add(object);
  };

  const encode = (value: unknown, parent: number, via: string): Value => {
    if (value === null || value === undefined) return value as null | undefined;
    const type = typeof value;
    if (type === "number" || type === "string" || type === "boolean" || type === "bigint") return value as Value;
    if (type === "symbol") throw new Error(`fork: a symbol at ${via} cannot be captured`);
    const object = value as object;
    const seen = memo.get(object);
    if (seen !== undefined) return new Ref("node", seen, "", undefined);
    const identity = options.identities.get(object);
    if (identity !== undefined) return new Ref("world", -1, identity, undefined);
    if (isForkable(object)) {
      const made = node("forkable", null, false, parent, via);
      remember(object, made.id);
      const record = object.captureState();
      for (const key of Object.keys(record)) {
        made.keys.push(key);
        made.values.push(encode(record[key], made.id, key));
      }
      return ref(made);
    }
    if (type === "function" || options.structural(object) || unwalkable(object)) {
      const made = node("external", Object.getPrototypeOf(object), false, parent, via);
      remember(object, made.id);
      return ref(made);
    }
    if (deeplyImmutable(object, options)) return new Ref("constant", -1, "", object);
    if (ArrayBuffer.isView(object)) {
      const typed = object as TypedArray;
      const made = node("typed", Object.getPrototypeOf(typed), false, parent, via, typed.slice() as TypedArray);
      remember(object, made.id);
      return ref(made);
    }
    if (object instanceof Map) {
      const made = node("map", Object.getPrototypeOf(object), false, parent, via);
      remember(object, made.id);
      let i = 0;
      for (const [key, entry] of object) {
        made.entries.push([encode(key, made.id, `<key ${i}>`), encode(entry, made.id, `<value ${i}>`)]);
        i += 1;
      }
      return ref(made);
    }
    if (object instanceof Set) {
      const made = node("set", Object.getPrototypeOf(object), false, parent, via);
      remember(object, made.id);
      let i = 0;
      for (const item of object) {
        made.values.push(encode(item, made.id, `<item ${i}>`));
        i += 1;
      }
      return ref(made);
    }
    const isArray = Array.isArray(object);
    const made = node(isArray ? "array" : "object", Object.getPrototypeOf(object), Object.isFrozen(object), parent, via);
    remember(object, made.id);
    if (isArray) {
      const array = object as unknown[];
      for (let i = 0; i < array.length; i += 1) made.values.push(encode(array[i], made.id, String(i)));
    } else {
      for (const key of dataKeys(object)) {
        made.keys.push(key);
        made.values.push(encode((object as Record<string, unknown>)[key], made.id, key));
      }
    }
    return ref(made);
  };

  const encodedRoots: Record<string, Value> = {};
  for (const key of Object.keys(roots)) encodedRoots[key] = encode(roots[key], -1, key);
  return { nodes, roots: encodedRoots };
}

/** The walk's path to a node, for a message a person can act on. */
export function nodePath(graph: StateGraph, id: number): string {
  const parts: string[] = [];
  let at = id;
  while (at >= 0) {
    const n = graph.nodes[at]!;
    parts.push(n.via);
    at = n.parent;
  }
  return parts.reverse().join(".");
}

export interface RestoreReport {
  /** Captured objects written in place into their counterpart. */
  readonly paired: number;
  /** Captured objects the fork had no counterpart for, built new. */
  readonly built: number;
  /** Structure the fork had no counterpart for: a field left as it was, an item left out. */
  readonly unpairedStructure: readonly string[];
}

/**
 * Write a captured graph into `roots` of another world built by the same code. `lookup` maps an
 * identity key to that world's object. Returns what it did, so a caller can see a fork that built
 * far more than it paired.
 */
export function restoreGraph(
  graph: StateGraph, roots: Record<string, unknown>, lookup: ReadonlyMap<string, object>,
): RestoreReport {
  const nodes = graph.nodes;
  const pair = new Array<object | undefined>(nodes.length);
  const claimed = new Set<object>();
  const live = new Map<number, Record<string, unknown>>();

  const worldObject = (ref: Ref): object => {
    const object = lookup.get(ref.key);
    if (object === undefined) throw new Error(`fork: the fork world has no object "${ref.key}"`);
    return object;
  };

  /** A fork value for a captured key, where one is already known (pass one). */
  const known = (value: Value): unknown => {
    if (!(value instanceof Ref)) return value;
    if (value.kind === "world") return lookup.get(value.key);
    if (value.kind === "constant") return value.constant;
    return pair[value.node];
  };

  const compatible = (n: GraphNode, target: unknown): boolean => {
    if (target === null || (typeof target !== "object" && typeof target !== "function")) return false;
    if (claimed.has(target as object)) return false;
    switch (n.kind) {
      case "forkable": return isForkable(target);
      case "external": return Object.getPrototypeOf(target) === n.proto;
      case "array": return Array.isArray(target) && (n.frozen || !Object.isFrozen(target));
      case "map": return target instanceof Map;
      case "set": return target instanceof Set;
      case "typed": return Object.getPrototypeOf(target) === n.proto && (target as TypedArray).length === n.typed!.length;
      case "object": return !isForkable(target) && Object.getPrototypeOf(target) === n.proto
        && (n.frozen || !Object.isFrozen(target));
    }
  };

  // Pass one: lay the captured graph over the fork's from the same roots, pairing by path.
  const lay = (value: Value, target: unknown): void => {
    if (!(value instanceof Ref) || value.kind !== "node") return;
    const n = nodes[value.node]!;
    if (pair[n.id] !== undefined || !compatible(n, target)) return;
    const object = target as object;
    pair[n.id] = object;
    claimed.add(object);
    switch (n.kind) {
      case "forkable": {
        // A piece that builds part of itself lazily is handed the captured record's plain values
        // first, so that it can build what the capture had before anything is laid over it.
        const prepare = (object as Forkable).prepareState;
        if (typeof prepare === "function") {
          const plain: Record<string, unknown> = {};
          n.keys.forEach((key, i) => { if (!(n.values[i] instanceof Ref)) plain[key] = n.values[i]; });
          prepare.call(object, plain);
        }
        const record = (object as Forkable).captureState();
        live.set(n.id, record);
        n.keys.forEach((key, i) => lay(n.values[i]!, record[key]));
        break;
      }
      case "object":
        n.keys.forEach((key, i) => lay(n.values[i]!, (object as Record<string, unknown>)[key]));
        break;
      case "array":
        n.values.forEach((child, i) => lay(child, (object as unknown[])[i]));
        break;
      case "map": {
        const map = object as Map<unknown, unknown>;
        const forkKeys = [...map.keys()];
        n.entries.forEach(([key], i) => { if (known(key) === undefined) lay(key, forkKeys[i]); });
        for (const [key, child] of n.entries) {
          const forkKey = known(key);
          if (forkKey !== undefined && map.has(forkKey)) lay(child, map.get(forkKey));
        }
        break;
      }
      case "set": {
        const items = [...(object as Set<unknown>)];
        n.values.forEach((item, i) => lay(item, items[i]));
        break;
      }
      default:
        break;
    }
  };
  for (const key of Object.keys(graph.roots)) lay(graph.roots[key]!, roots[key]);

  // Pass two: build what has no counterpart.
  let built = 0;
  const unpairedStructure: string[] = [];
  const resolved = new Array<object | undefined>(nodes.length);
  for (const n of nodes) {
    const existing = pair[n.id];
    if (existing !== undefined) { resolved[n.id] = existing; continue; }
    switch (n.kind) {
      case "forkable":
        throw new Error(`fork: the forkable piece at ${nodePath(graph, n.id)} has no counterpart in the fork world`);
      case "external": break;
      case "array": resolved[n.id] = []; built += 1; break;
      case "map": resolved[n.id] = new Map(); built += 1; break;
      case "set": resolved[n.id] = new Set(); built += 1; break;
      case "typed": resolved[n.id] = n.typed!.slice(); built += 1; break;
      case "object": resolved[n.id] = Object.create(n.proto) as object; built += 1; break;
    }
  }

  const MISSING = Symbol("missing");
  /** The fork's value for a captured one; MISSING for structure the fork has nothing for. */
  const resolve = (value: Value): unknown => {
    if (!(value instanceof Ref)) return value;
    switch (value.kind) {
      case "node": {
        const object = resolved[value.node];
        if (object === undefined) {
          unpairedStructure.push(nodePath(graph, value.node));
          return MISSING;
        }
        return object;
      }
      case "world": return worldObject(value);
      case "constant": return value.constant;
    }
  };
  const field = (value: Value, current: unknown): unknown => {
    const next = resolve(value);
    if (next === MISSING) return current;
    if (value instanceof Ref && value.kind === "constant" && sameImmutable(current, next)) return current;
    return next;
  };

  // Pass three: write every field.
  const records = new Map<number, Record<string, unknown>>();
  const toFreeze: object[] = [];
  for (const n of nodes) {
    const target = resolved[n.id];
    if (target === undefined || n.kind === "external") continue;
    const paired = pair[n.id] !== undefined;
    switch (n.kind) {
      case "forkable": {
        const current = live.get(n.id)!;
        const record: Record<string, unknown> = {};
        n.keys.forEach((key, i) => { record[key] = field(n.values[i]!, current[key]); });
        records.set(n.id, record);
        break;
      }
      case "typed":
        if (paired) (target as TypedArray).set(n.typed as never);
        break;
      case "array": {
        const array = target as unknown[];
        const values = n.values.map((v, i) => field(v, array[i]));
        if (paired && Object.isFrozen(array)) {
          checkFrozen(graph, n, values, array, values.map((_, i) => String(i)));
          break;
        }
        array.length = values.length;
        for (let i = 0; i < values.length; i += 1) if (!Object.is(array[i], values[i])) array[i] = values[i];
        if (!paired && n.frozen) toFreeze.push(array);
        break;
      }
      case "map": {
        const map = target as Map<unknown, unknown>;
        const entries: [unknown, unknown][] = [];
        for (const [k, v] of n.entries) {
          const key = resolve(k), value = resolve(v);
          if (key !== MISSING && value !== MISSING) entries.push([key, value]);
        }
        map.clear();
        for (const [k, v] of entries) map.set(k, v);
        break;
      }
      case "set": {
        const set = target as Set<unknown>;
        const items = n.values.map(resolve).filter((item) => item !== MISSING);
        set.clear();
        for (const item of items) set.add(item);
        break;
      }
      case "object": {
        const object = target as Record<string, unknown>;
        const values = n.keys.map((key, i) => field(n.values[i]!, object[key]));
        if (paired && Object.isFrozen(object)) {
          checkFrozen(graph, n, values, object, n.keys);
          break;
        }
        n.keys.forEach((key, i) => {
          if (!Object.is(object[key], values[i]) || !(key in object)) object[key] = values[i];
        });
        if (paired) {
          const wanted = new Set(n.keys);
          for (const key of dataKeys(object)) if (!wanted.has(key)) delete object[key];
        }
        if (!paired && n.frozen) toFreeze.push(object);
        break;
      }
    }
  }
  for (const object of toFreeze) Object.freeze(object);

  // Pass four: hand every closure piece its record, now that everything it points at is written.
  for (const [id, record] of records) (resolved[id] as unknown as Forkable).restoreState(record);

  return { paired: pair.filter((p) => p !== undefined).length, built, unpairedStructure };
}

function checkFrozen(graph: StateGraph, n: GraphNode, values: unknown[], target: object, keys: string[]): void {
  keys.forEach((key, i) => {
    const current = (target as Record<string, unknown>)[key];
    if (!Object.is(current, values[i]) && !sameImmutable(current, values[i])) {
      throw new Error(`fork: frozen ${nodePath(graph, n.id)} differs at "${key}" and cannot be written`);
    }
  });
}

/**
 * The places two captures disagree, as paths; empty if they are the same state. Identity keys are
 * compared by key and structure by position, so a capture of one world and a capture of its fork
 * compare equal when the fork holds the same state. Returns at most `limit` differences.
 */
export function diffGraphs(a: StateGraph, b: StateGraph, limit = 20): string[] {
  const out: string[] = [];
  const mapped = new Map<number, number>();
  const stack: [Value, Value, string][] = [];
  for (const key of new Set([...Object.keys(a.roots), ...Object.keys(b.roots)])) {
    stack.push([a.roots[key], b.roots[key], key]);
  }
  while (stack.length > 0 && out.length < limit) {
    const [x, y, path] = stack.pop()!;
    if (!(x instanceof Ref) || !(y instanceof Ref)) {
      if (!Object.is(x, y)) out.push(`${path}: ${String(x)} != ${String(y)}`);
      continue;
    }
    if (x.kind !== y.kind) { out.push(`${path}: ${x.kind} != ${y.kind}`); continue; }
    if (x.kind === "world") { if (x.key !== y.key) out.push(`${path}: ${x.key} != ${y.key}`); continue; }
    if (x.kind === "constant") { if (!sameImmutable(x.constant, y.constant)) out.push(`${path}: different constants`); continue; }
    const prior = mapped.get(x.node);
    if (prior !== undefined) {
      if (prior !== y.node) out.push(`${path}: aliasing differs`);
      continue;
    }
    mapped.set(x.node, y.node);
    const m = a.nodes[x.node]!, n = b.nodes[y.node]!;
    if (m.kind !== n.kind || m.proto !== n.proto || m.frozen !== n.frozen) {
      out.push(`${path}: ${m.kind}/${m.frozen} != ${n.kind}/${n.frozen}${m.proto !== n.proto ? " (prototype)" : ""}`);
      continue;
    }
    if (m.kind === "external") continue;
    if (m.typed) {
      const p = m.typed, q = n.typed!;
      if (p.length !== q.length || p.some((v, i) => !Object.is(v, q[i]))) out.push(`${path}: typed array differs`);
      continue;
    }
    if (m.keys.length !== n.keys.length || m.keys.some((k, i) => k !== n.keys[i])) {
      out.push(`${path}: keys [${m.keys.join(",")}] != [${n.keys.join(",")}]`);
      continue;
    }
    if (m.values.length !== n.values.length) { out.push(`${path}: length ${m.values.length} != ${n.values.length}`); continue; }
    if (m.entries.length !== n.entries.length) { out.push(`${path}: size ${m.entries.length} != ${n.entries.length}`); continue; }
    m.values.forEach((v, i) => stack.push([v, n.values[i], `${path}.${m.keys[i] ?? i}`]));
    m.entries.forEach(([k, v], i) => {
      stack.push([k, n.entries[i]![0], `${path}<key ${i}>`]);
      stack.push([v, n.entries[i]![1], `${path}<${i}>`]);
    });
  }
  return out;
}
