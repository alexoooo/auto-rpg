/**
 * **Forking a stand**: the fixture the fork tests share. A stand that was saved (`saveStand`,
 * `core-stand.mjs`) and a twin loaded with the save are compared in three things: the saved states
 * (`src/core/state.ts`), every segment's pose, velocity and spin, and what the stand's readers show.
 *
 * The engine's bytes are not compared: a world that was loaded saves two bytes other than one run
 * straight to the same poses and velocities.
 */
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { loadState } from "../../src/core/state.ts";
import { loadStand, saveStand } from "./core-stand.mjs";
import { traceOf } from "./trace.mjs";

/** Every segment of `builts` as it stands: its pose's digest, and its velocity and spin. */
function motionOf(builts) {
  const trace = traceOf(builts), v = new Vector3(), w = new Vector3();
  trace.take();
  const speeds = builts.flatMap((built) => [...built.segments.values()].flatMap(({ body }) =>
    [...body.linearVelocityToRef(v).asArray(), ...body.angularVelocityToRef(w).asArray()]));
  return `${trace.digest()} ${speeds.join(",")}`;
}

/**
 * What a stand's readers show (`read`: plain values, vectors and turns), copied as it stands. Two
 * are compared by value (`firstDifference`), whatever order their keys were written in: a load
 * fills an object in place, so its keys stay in the order the loaded stand first wrote them.
 */
const shown = (read) => JSON.parse(JSON.stringify(read(), (_, value) =>
  value instanceof Vector3 || value instanceof Quaternion ? value.asArray()
    : ArrayBuffer.isView(value) ? [...value] : value instanceof Map ? [...value] : value instanceof Set ? [...value]
    : typeof value === "number" && !Number.isFinite(value) ? String(value) : Object.is(value, -0) ? "-0" : value));

/** What a plain object, an array, a typed array or a map holds, by key. */
const entries = (of) => of instanceof Map ? [...of] : ArrayBuffer.isView(of) ? [...of.entries()] : Object.entries(of);

/** The path of the first place two values differ, or null: what a fork that drifts names. */
function firstDifference(a, b, path = "state") {
  if (Object.is(a, b)) return null;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return `${path}: ${String(a)} and ${String(b)}`;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return `${path}: of two kinds`;
  if (a instanceof Set) return a.size === b.size && [...a].every((item) => b.has(item)) ? null : `${path}: [${[...a]}] and [${[...b]}]`;
  const ours = entries(a), theirs = new Map(entries(b));
  if (ours.length !== theirs.size) return `${path}: ${ours.length} entries and ${theirs.size}`;
  for (const [key, value] of ours) {
    if (!theirs.has(key)) return `${path}.${key}: in one only`;
    const found = firstDifference(value, theirs.get(key), `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

/**
 * **The fixture.** `make` builds a stand: `{ world, builts, states, advance, read, watch?, seen?,
 * dispose }`. `advance` takes one step, or one frame of a clock of the stand's own, with whatever
 * the stand does to its bodies from outside as a function of the world's step; `read` gives what
 * its readers show; `watch` is called on the trunk before every advance, to fill `seen`.
 *
 * A trunk runs `from` advances, then `count * every + ahead` more, saved every `every`. A twin is
 * then loaded with each of the first `count` saves in turn and advanced `ahead`: it should stand
 * as the trunk stood then. The twin is wherever the fork before left it, so each load is under controllers at
 * another step, ahead or behind.
 *
 * Returns each fork's difference from the trunk, null where there is none, and what the trunk saw;
 * and, `under` the name of each of `controls`, the first difference a fork under that control
 * shows, or null if none shows one. A control is another way to load: `{ load, changes? }`, given
 * the stand, the save, and a save beside it (the one after, then the one before); a fork it says
 * it does not change is not run.
 */
export async function forks(make, every, ahead, count, controls = {}, from = 0) {
  assert.equal(ahead % every, 0);
  const trunk = await make(), twin = await make();
  try {
    const marks = [], total = from + count * every + ahead;
    for (let step = 0; step <= total; step++) {
      if (step >= from && (step - from) % every === 0) marks.push({ step, save: saveStand(trunk.world, trunk.states), motion: motionOf(trunk.builts), shown: shown(trunk.read) });
      trunk.watch?.();
      if (step < total) trunk.advance();
    }
    const fork = (load, from, to) => {
      load();
      let found = motionOf(twin.builts) === from.motion ? null : "at the load, the bodies are not where they were saved";
      found ??= firstDifference(shown(twin.read), from.shown, "at the load, shown");
      for (let i = 0; i < ahead; i++) twin.advance();
      found ??= firstDifference(saveStand(twin.world, twin.states).state, to.save.state);
      found ??= motionOf(twin.builts) === to.motion ? null : "the bodies stand or move otherwise";
      return found ?? firstDifference(shown(twin.read), to.shown, "shown");
    };
    // A fork that throws differs: the next load puts the twin right again, whatever step it stopped in.
    const one = (load, k, beside) => {
      const from = marks[k], to = marks[k + ahead / every];
      let found;
      try { found = fork(() => load(twin.world, twin.states, from.save, beside.save), from, to); } catch (error) { found = `it throws: ${error.message}`; }
      return found && `from ${from.step} to ${to.step}: ${found}`;
    };
    const differences = marks.slice(0, count).map((_, k) => one(loadStand, k, marks[k + 1])), under = {};
    for (const [name, { load, changes = () => true }] of Object.entries(controls)) {
      under[name] = null;
      for (let k = 0; k < count; k++) {
        for (const beside of k > 0 ? [marks[k + 1], marks[k - 1]] : [marks[k + 1]]) {
          if (!under[name] && changes(marks[k].save, beside.save)) under[name] = one(load, k, beside);
        }
      }
    }
    return { differences, seen: trunk.seen, under };
  } finally { trunk.dispose(); twin.dispose(); }
}

/** The physics alone, and no module's state; and the states alone: what a fork is not. */
export const PHYSICS_ALONE = { load: (world, _states, saved) => world.physics.load(saved.physics) };
export const STATE_ALONE = { load: (world, states, saved) => loadState({ world: world.state, ...states }, saved.state) };

/** The separator of a field's path as it is written: a channel's name holds dots and spaces. */
const STEP = " > ";
const into = (root, keys) => keys.reduce((at, key) => at instanceof Map ? at.get(key) : at[key], root);

/** `value` written over `live` number by number where the two are of one shape, and in its place where not: what the slot then holds. */
function written(live, value) {
  if (value === null || typeof value !== "object" || live === null || typeof live !== "object") return value;
  if (Object.getPrototypeOf(live) !== Object.getPrototypeOf(value) || Object.isFrozen(live)) return value;
  if (value instanceof Vector3 || value instanceof Quaternion) return live.copyFrom(value);
  if (value instanceof Set) return value;
  const ours = entries(live), theirs = entries(value);
  if (ours.length !== theirs.length || ours.some(([key], i) => key !== theirs[i][0])) return value;
  for (const [key, item] of theirs) {
    if (live instanceof Map) live.set(key, written(live.get(key), item));
    else live[key] = written(live[key], item);
  }
  return live;
}

/**
 * **A fork without a field**, for each of `paths` (a field of the stand's state: its keys from
 * `world` or a name of `states`, joined by ` > `), by its path: `loadStand`, but the field holds
 * what it held at the save beside, as it would if it were kept outside the state and the stand had
 * been at that step. The values are written into the loaded objects, so what the state shares it
 * shares still. Only a fork from a save where the field then differs is run.
 *
 * No fork differing under it, the fixture does not reach the field, or every step writes the
 * field before anything reads it.
 */
export const forgetting = (paths) => Object.fromEntries(paths.map((path) => {
  const keys = path.split(STEP), last = keys.pop(), held = (saved) => into(saved.state, keys)[last];
  return [path, {
    changes: (saved, beside) => firstDifference(held(saved), held(beside)) !== null,
    load(world, states, saved, beside) {
      const kept = { at: null };
      loadState(kept, { at: held(beside) });
      loadStand(world, states, saved);
      const holder = into({ world: world.state, ...states }, keys);
      holder[last] = written(holder[last], kept.at);
    },
  }];
}));

/** The path of every field of a stand's state: each value that is not a plain object with keys, by the keys down to it. */
export function fieldsOf(world, states) {
  const fields = [];
  const walk = (value, path) => {
    const record = typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length > 0;
    if (!record) fields.push(path.join(STEP));
    else for (const [key, item] of Object.entries(value)) walk(item, [...path, key]);
  };
  walk({ world: world.state, ...states }, []);
  return fields;
}

/**
 * What is wrong with a sorting of `fields` (`fieldsOf`) into `needed` (paths a fork is shown to
 * need) and `not` (paths that are not memory): each field is under exactly one of the paths, and
 * each path has a field under it. Empty when every field is sorted once.
 */
export function unsorted(fields, needed, not) {
  const paths = [...needed, ...not], under = (field, path) => field === path || field.startsWith(path + STEP);
  const over = (field) => paths.filter((path) => under(field, path));
  return [
    ...fields.filter((field) => over(field).length !== 1).map((field) => `${field}: under ${over(field).length} paths`),
    ...paths.filter((path) => !fields.some((field) => under(field, path))).map((path) => `${path}: no field`),
  ];
}
