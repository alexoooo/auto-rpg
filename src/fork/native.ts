/**
 * The native half of a forkable world: every Havok body and constraint, captured as data and
 * written into a second world built the same way.
 *
 * **Why the plugin is hooked rather than walked.** `HavokPlugin` keeps live bodies in `_bodies`
 * but drops a disposed one from it, and keeps no list of constraint objects at all -- only
 * `_constraintToBodyIdPair`, which never forgets a released joint (see AGENTS.md). A fork has to
 * pair the n-th body of one world with the n-th of another, severed or not, so `trackWorld`
 * wraps `initBody` and `initConstraint` on the plugin instance and records both in creation
 * order. It must run before the first body is made, exactly like `attachPhysics` itself.
 *
 * **What is captured is whatever Havok will hand back.** Every `HP_Body_Get*` with a matching
 * `HP_Body_Set*`, every `HP_Constraint_GetAxis*` with a matching setter over the six axes of a 6DoF joint, and
 * the shape's filter and material, are read and written through `plugin._hknp` by name, so a
 * setter the game starts calling mid-bout is covered as long as Havok has a getter for it. Two
 * setters have none -- `HP_Constraint_SetAxisStiffness`/`SetAxisDamping` and the anchors -- and
 * nothing in `src/` calls them at all -- a joint is given them in its constructor -- which
 * `tests/fork.test.mjs` pins by reading the source.
 *
 * **What the getters do not reach is the solver's memory.** Contact manifolds, warm-start impulses
 * and the broadphase tree live inside Havok with no accessor, so a fork restored through the getters
 * starts cold where the original is warm. That is the fidelity floor of a *teleport* fork, and the
 * teleport itself is part of it: rewriting a body's own transform in place moves a fighting world
 * by millimetres within three frames (`writeIfChanged`).
 *
 * **Or the whole heap.** Havok is one wasm instance and all of its state -- the solver's memory
 * included -- is that instance's linear memory. A capture taken with `{ heap: true }` copies it, and
 * a restore into a world built by the same code *in another, fresh instance* copies it over that
 * instance's, after which the fork is the original to the bit: no divergence at all over four
 * seconds of a fought bout (`docs/analysis/2026-09-25-fork.md`). Two conditions, both checked:
 * the fork's instance is not the original's (the copy would overwrite the original), and every
 * body and joint handle in the fork is the number the original's has, which holds when both worlds
 * were built by the same code into instances with the same history -- fresh ones.
 *
 * The transform is written with `HP_Body_SetQTransform`, which is what the TELEPORT prestep
 * (`disablePreStep = false`) does inside `executeStep`, done at once instead of on the next
 * step; `setTargetTransform` would not do (AGENTS.md, "not a teleport for a DYNAMIC body"). The
 * node's `position` and `rotationQuaternion` are written beside it, because the prestep and
 * every reader in `src/` read the node.
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { PhysicsConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";

/** The six `PhysicsConstraintAxis` values of a 6DoF joint. LINEAR_DISTANCE reads back garbage on one and nothing in src/ uses it. */
const AXES = [0, 1, 2, 3, 4, 5] as const;

/**
 * Per-axis constraint properties, in the order they are written back. Mode and limits before the
 * motor; the motor's type before its targets, because `SetAxisMotorTarget` writes whichever of the
 * position or velocity target the type names.
 */
const AXIS_PROPS = [
  "Mode", "MinLimit", "MaxLimit", "Friction", "MotorType", "MotorMaxForce", "MotorStiffness",
  "MotorDamping", "MotorPositionTarget", "MotorVelocityTarget", "MotorTarget",
] as const;

/** Whole-body properties with a getter and a setter, in the order they are written back. */
const BODY_PROPS = [
  "MotionType", "MassProperties", "GravityFactor", "LinearDamping", "AngularDamping", "EventMask",
  "QTransform", "LinearVelocity", "AngularVelocity", "ActivationState",
] as const;

const SHAPE_PROPS = ["FilterInfo", "Material", "Density"] as const;
const CONSTRAINT_PROPS = ["Enabled", "CollisionsEnabled"] as const;

type Hknp = Record<string, (...args: unknown[]) => unknown[]>;

interface Plugin {
  _hknp: Hknp;
  initBody: (body: PhysicsBody, ...rest: unknown[]) => unknown;
  initConstraint: (constraint: PhysicsConstraint, ...rest: unknown[]) => unknown;
  _constraintAxisToNative(axis: number): unknown;
}

/** One world's bodies and constraints, in the order they were made. */
export interface WorldTrack {
  readonly bodies: PhysicsBody[];
  readonly constraints: PhysicsConstraint[];
  /** The parent and child body each constraint was made between; Babylon's object keeps neither. */
  readonly joins: Map<PhysicsConstraint, readonly [PhysicsBody, PhysicsBody]>;
}

const TRACKS = new WeakMap<Scene, WorldTrack>();

function pluginOf(scene: Scene): Plugin {
  const plugin = scene.getPhysicsEngine()?.getPhysicsPlugin() as unknown as Plugin | undefined;
  if (!plugin?._hknp) throw new Error("a forkable world needs a Havok physics engine on its scene");
  return plugin;
}

/**
 * Start recording a world's bodies and constraints. Call once, straight after `attachPhysics` and
 * before any body exists; a world whose first body predates the call cannot be paired and
 * `worldTrack` says so.
 */
export function trackWorld(scene: Scene): WorldTrack {
  const existing = TRACKS.get(scene);
  if (existing) return existing;
  const plugin = pluginOf(scene);
  if ((plugin as unknown as { _bodies: Map<unknown, unknown> })._bodies.size > 0) {
    throw new Error("trackWorld must run before the first body is created");
  }
  const track: WorldTrack = { bodies: [], constraints: [], joins: new Map() };
  const initBody = plugin.initBody;
  const initConstraint = plugin.initConstraint;
  plugin.initBody = function (body, ...rest) {
    track.bodies.push(body);
    return initBody.call(this, body, ...rest);
  };
  plugin.initConstraint = function (constraint, ...rest) {
    if (!track.joins.has(constraint)) {
      track.constraints.push(constraint);
      track.joins.set(constraint, [rest[0] as PhysicsBody, rest[1] as PhysicsBody]);
    }
    return initConstraint.call(this, constraint, ...rest);
  };
  TRACKS.set(scene, track);
  return track;
}

export function worldTrack(scene: Scene): WorldTrack {
  const track = TRACKS.get(scene);
  if (!track) throw new Error("this world was not tracked from its first body (trackWorld)");
  return track;
}

type Raw = unknown;

export interface BodyState {
  readonly name: string;
  readonly live: boolean;
  readonly native: Record<string, Raw>;
  readonly shape: Record<string, Raw> | null;
  readonly js: {
    readonly prestep: number;
    readonly disableSync: boolean;
    readonly collisionCB: boolean;
    readonly collisionEndedCB: boolean;
    readonly userMassProps: Raw;
  };
  readonly node: { readonly position: readonly number[]; readonly rotation: readonly number[] | null } | null;
}

export interface ConstraintState {
  /** Which joint this is, independent of when it was made (`constraintKeys`). */
  readonly key: string;
  readonly live: boolean;
  readonly bodies: readonly [number, number];
  /** One entry per native joint in `_pluginData`: its whole-joint props, then per-axis props. */
  readonly joints: readonly { readonly props: Record<string, Raw>; readonly axes: readonly Record<string, Raw>[] }[];
}

export interface NativeState {
  readonly bodies: readonly BodyState[];
  readonly constraints: readonly ConstraintState[];
  readonly accumulator: number;
  readonly renderId: number;
  /** Which Havok instance this was captured from, within this process (`instanceId`). */
  readonly instance: number;
  /** The instance's whole linear memory, for an exact fork; null for a teleport fork. */
  readonly heap: Uint8Array | null;
  /** Every live body's and joint's Havok handle, which an exact fork must share with its original. */
  readonly handles: { readonly bodies: readonly Raw[]; readonly constraints: readonly Raw[] };
}

interface BodyInternals {
  _pluginData?: { hpBodyId?: unknown; userMassProps?: Record<string, unknown> } | null;
  _prestepType: number;
  disableSync: boolean;
  _collisionCBEnabled: boolean;
  _collisionEndedCBEnabled: boolean;
  _shape: { _pluginData?: unknown } | null;
  transformNode: TransformNode;
}

interface ConstraintInternals {
  _pluginData?: unknown[];
}

/** Deep-copy a Havok return value: nested arrays of numbers, bigints and enum objects. */
function copyRaw(value: Raw): Raw {
  return Array.isArray(value) ? value.map(copyRaw) : value;
}

function read(hknp: Hknp, name: string, ...args: unknown[]): Raw {
  const result = hknp[name](...args);
  return copyRaw(result[1]);
}

/** Two Havok values the same to the bit: numbers by `Object.is`, enums by identity or by value. */
function sameRaw(a: Raw, b: Raw): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameRaw(x, b[i]));
  }
  if (Object.is(a, b)) return true;
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    return "value" in a && "value" in b && Object.is((a as { value: unknown }).value, (b as { value: unknown }).value);
  }
  return false;
}

/**
 * Write one property only if the world does not already hold that value. **A write of the value
 * already there is not a no-op in Havok**: measured in place on an exact replay (Node bout runner,
 * brawler against miser, frame 240, three frames on), rewriting every body's own mass properties
 * moved a part 3.21 mm, its own transform 5.32 mm, and every axis's own motor stiffness or velocity
 * target 0.18 mm; every other property rewrote to 0.00000 mm. So a restore writes the differences
 * and nothing else, and a fork is disturbed only where it has to be.
 */
function writeIfChanged(hknp: Hknp, getter: string, setter: string, wanted: Raw, ...args: unknown[]): void {
  if (sameRaw(read(hknp, getter, ...args), wanted)) return;
  hknp[setter](...args, copyRaw(wanted));
}

const bodyLive = (body: PhysicsBody): boolean =>
  (body as unknown as BodyInternals)._pluginData?.hpBodyId !== undefined;
const constraintLive = (constraint: PhysicsConstraint): boolean =>
  ((constraint as unknown as ConstraintInternals)._pluginData?.length ?? 0) > 0;

function vec(v: { x: number; y: number; z: number }): number[] { return [v.x, v.y, v.z]; }

/**
 * A key per constraint that two worlds built by the same code agree on: the two bodies it joins,
 * by their creation index, and how many joints between that pair came before it. Not the creation
 * index itself, because a joint made mid-bout -- a maul's second hand closing on the haft -- is
 * made at a different moment in a fork that replays it, and two of them can come in either order.
 */
function constraintKeys(track: WorldTrack): string[] {
  const index = new Map<PhysicsBody, number>(track.bodies.map((body, i) => [body, i]));
  const seen = new Map<string, number>();
  return track.constraints.map((constraint) => {
    const pair = track.joins.get(constraint);
    const join = `${pair ? index.get(pair[0]) ?? -1 : -1}>${pair ? index.get(pair[1]) ?? -1 : -1}`;
    const ordinal = seen.get(join) ?? 0;
    seen.set(join, ordinal + 1);
    return `c${join}#${ordinal}`;
  });
}

/** Everything Havok and Babylon's body wrappers hold about one world's physical state. */
export interface NativeCaptureOptions {
  /** Copy the Havok instance's whole memory, for an exact fork into another instance. */
  readonly heap?: boolean;
}

/** A Havok module's linear memory, and the allocator that grows it. */
interface HavokHeap {
  HEAPU8: Uint8Array;
  _malloc(bytes: number): number;
  _free(pointer: number): void;
}

const INSTANCES = new WeakMap<object, number>();
let nextInstance = 1;
/** A number per Havok instance in this process, so a capture can say which one it came from. */
function instanceId(module: object): number {
  let id = INSTANCES.get(module);
  if (id === undefined) {
    id = nextInstance;
    nextInstance += 1;
    INSTANCES.set(module, id);
  }
  return id;
}

function worldHandles(track: WorldTrack): { bodies: Raw[]; constraints: Raw[] } {
  return {
    bodies: track.bodies.map((body) => (bodyLive(body)
      ? copyRaw((body as unknown as BodyInternals)._pluginData!.hpBodyId) : null)),
    constraints: track.constraints.map((constraint) => (constraintLive(constraint)
      ? copyRaw((constraint as unknown as ConstraintInternals)._pluginData) : null)),
  };
}

/**
 * Copy a captured heap over this world's Havok instance. Everything Havok holds -- every body, joint,
 * contact and warm start of every world in the instance -- becomes the original's.
 */
function copyHeap(scene: Scene, state: NativeState): void {
  const module = pluginOf(scene)._hknp as unknown as HavokHeap;
  if (instanceId(module) === state.instance) {
    throw new Error("fork: an exact fork needs a Havok instance of its own; this is the original's");
  }
  const here = worldHandles(worldTrack(scene));
  const agree = (a: readonly Raw[], b: readonly Raw[]) => a.length === b.length && a.every((x, i) => sameRaw(x, b[i]));
  if (!agree(here.bodies, state.handles.bodies) || !agree(here.constraints, state.handles.constraints)) {
    throw new Error("fork: this world's Havok handles are not the original's -- build both into fresh instances");
  }
  const heap = state.heap!;
  // Grow by asking the allocator for the shortfall; whatever it writes is overwritten below.
  for (let tries = 0; module.HEAPU8.length < heap.length && tries < 8; tries += 1) {
    const pointer = module._malloc(heap.length - module.HEAPU8.length + 65536);
    if (pointer) module._free(pointer);
  }
  if (module.HEAPU8.length < heap.length) throw new Error("fork: could not grow the fork's Havok heap");
  module.HEAPU8.set(heap);
}

export function captureNative(scene: Scene, options: NativeCaptureOptions = {}): NativeState {
  const track = worldTrack(scene);
  const hknp = pluginOf(scene)._hknp;
  const plugin = pluginOf(scene);
  const index = new Map<PhysicsBody, number>(track.bodies.map((body, i) => [body, i]));
  const bodies = track.bodies.map((body): BodyState => {
    const b = body as unknown as BodyInternals;
    const node = b.transformNode;
    const live = bodyLive(body);
    const native: Record<string, Raw> = {};
    let shape: Record<string, Raw> | null = null;
    if (live) {
      const id = b._pluginData!.hpBodyId;
      for (const prop of BODY_PROPS) native[prop] = read(hknp, `HP_Body_Get${prop}`, id);
      const shapeId = b._shape?._pluginData;
      if (shapeId !== undefined) {
        shape = {};
        for (const prop of SHAPE_PROPS) shape[prop] = read(hknp, `HP_Shape_Get${prop}`, shapeId);
      }
    }
    return {
      name: node?.name ?? "",
      live,
      native,
      shape,
      js: {
        prestep: b._prestepType,
        disableSync: b.disableSync,
        collisionCB: b._collisionCBEnabled,
        collisionEndedCB: b._collisionEndedCBEnabled,
        userMassProps: b._pluginData?.userMassProps ? structuredCloneMass(b._pluginData.userMassProps) : null,
      },
      node: node ? {
        position: vec(node.position),
        rotation: node.rotationQuaternion
          ? [node.rotationQuaternion.x, node.rotationQuaternion.y, node.rotationQuaternion.z, node.rotationQuaternion.w]
          : null,
      } : null,
    };
  });
  const keys = constraintKeys(track);
  const constraints = track.constraints.map((constraint, i): ConstraintState => {
    const c = constraint as unknown as ConstraintInternals & { _pluginData: unknown[] };
    const live = constraintLive(constraint);
    const pair = track.joins.get(constraint) ?? [null, null];
    const joints = live ? c._pluginData.map((jointId) => {
      const props: Record<string, Raw> = {};
      for (const prop of CONSTRAINT_PROPS) props[prop] = read(hknp, `HP_Constraint_Get${prop}`, jointId);
      const axes = AXES.map((axis) => {
        const nativeAxis = plugin._constraintAxisToNative(axis);
        const values: Record<string, Raw> = {};
        for (const prop of AXIS_PROPS) values[prop] = read(hknp, `HP_Constraint_GetAxis${prop}`, jointId, nativeAxis);
        return values;
      });
      return { props, axes };
    }) : [];
    return {
      key: keys[i]!,
      live,
      bodies: [pair[0] ? index.get(pair[0]) ?? -1 : -1, pair[1] ? index.get(pair[1]) ?? -1 : -1],
      joints,
    };
  });
  const s = scene as unknown as { _physicsTimeAccumulator: number; _renderId: number };
  const module = hknp as unknown as HavokHeap;
  return {
    bodies, constraints, accumulator: s._physicsTimeAccumulator, renderId: s._renderId,
    instance: instanceId(module),
    heap: options.heap ? module.HEAPU8.slice() : null,
    handles: worldHandles(track),
  };
}

/** `userMassProps` holds numbers, `Vector3`s and a `Quaternion`, each possibly undefined. */
function structuredCloneMass(props: Record<string, unknown>): Raw {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value instanceof Quaternion) out[key] = { q: [value.x, value.y, value.z, value.w] };
    else if (value instanceof Vector3) out[key] = { v: vec(value) };
    else out[key] = value;
  }
  return out;
}

/**
 * Write a captured world into this one. Both worlds must have been built by the same code, so
 * that the n-th body and constraint of each are the same part; a name that disagrees throws. The
 * topology (which constraints were disposed) must already agree -- a golem replays its severs
 * before this runs -- and a disagreement throws rather than quietly leaving a joint in or out.
 */
export function restoreNative(scene: Scene, state: NativeState): void {
  const track = worldTrack(scene);
  const plugin = pluginOf(scene);
  const hknp = plugin._hknp;
  if (track.bodies.length !== state.bodies.length) {
    throw new Error(`fork: ${track.bodies.length} bodies here against ${state.bodies.length} captured`);
  }
  if (track.constraints.length !== state.constraints.length) {
    throw new Error(`fork: ${track.constraints.length} constraints here against ${state.constraints.length} captured`);
  }
  // An exact fork takes Havok's whole state first; every write below then finds its value already
  // there and is skipped, leaving only the fields Babylon keeps on its side of the boundary.
  if (state.heap) copyHeap(scene, state);
  const byKey = new Map(state.constraints.map((captured) => [captured.key, captured]));
  const keys = constraintKeys(track);
  track.constraints.forEach((constraint, i) => {
    const captured = byKey.get(keys[i]!);
    if (!captured) throw new Error(`fork: constraint ${keys[i]} here was not captured`);
    const live = constraintLive(constraint);
    if (live !== captured.live) {
      throw new Error(`fork: constraint ${keys[i]} is ${live ? "live" : "disposed"} here and was ${captured.live ? "live" : "disposed"}`);
    }
    if (!live) return;
    const joints = (constraint as unknown as { _pluginData: unknown[] })._pluginData;
    joints.forEach((jointId, j) => {
      const joint = captured.joints[j]!;
      AXES.forEach((axis) => {
        const nativeAxis = plugin._constraintAxisToNative(axis);
        const values = joint.axes[axis]!;
        for (const prop of AXIS_PROPS) {
          writeIfChanged(hknp, `HP_Constraint_GetAxis${prop}`, `HP_Constraint_SetAxis${prop}`, values[prop], jointId, nativeAxis);
        }
      });
      for (const prop of CONSTRAINT_PROPS) {
        writeIfChanged(hknp, `HP_Constraint_Get${prop}`, `HP_Constraint_Set${prop}`, joint.props[prop], jointId);
      }
    });
  });
  track.bodies.forEach((body, i) => {
    const captured = state.bodies[i]!;
    const b = body as unknown as BodyInternals;
    const node = b.transformNode;
    if ((node?.name ?? "") !== captured.name) {
      throw new Error(`fork: body ${i} is "${node?.name}" here and was "${captured.name}"`);
    }
    if (bodyLive(body) !== captured.live) throw new Error(`fork: body ${i} ("${captured.name}") liveness differs`);
    b._prestepType = captured.js.prestep;
    b.disableSync = captured.js.disableSync;
    b._collisionCBEnabled = captured.js.collisionCB;
    b._collisionEndedCBEnabled = captured.js.collisionEndedCB;
    if (b._pluginData?.userMassProps && captured.js.userMassProps) {
      const into = b._pluginData.userMassProps;
      for (const [key, value] of Object.entries(captured.js.userMassProps as Record<string, unknown>)) {
        const packed = value as { v?: number[]; q?: number[] } | undefined;
        if (packed && typeof packed === "object" && packed.v) into[key] = new Vector3(...(packed.v as [number, number, number]));
        else if (packed && typeof packed === "object" && packed.q) into[key] = new Quaternion(...(packed.q as [number, number, number, number]));
        else into[key] = value;
      }
    }
    if (node && captured.node) {
      node.position.set(captured.node.position[0]!, captured.node.position[1]!, captured.node.position[2]!);
      const r = captured.node.rotation;
      if (r && node.rotationQuaternion) node.rotationQuaternion.set(r[0]!, r[1]!, r[2]!, r[3]!);
    }
    if (!captured.live) return;
    const id = b._pluginData!.hpBodyId;
    for (const prop of BODY_PROPS) writeIfChanged(hknp, `HP_Body_Get${prop}`, `HP_Body_Set${prop}`, captured.native[prop], id);
    const shapeId = b._shape?._pluginData;
    if (shapeId !== undefined && captured.shape) {
      for (const prop of SHAPE_PROPS) {
        writeIfChanged(hknp, `HP_Shape_Get${prop}`, `HP_Shape_Set${prop}`, captured.shape[prop], shapeId);
      }
    }
  });
  const s = scene as unknown as { _physicsTimeAccumulator: number; _renderId: number };
  s._physicsTimeAccumulator = state.accumulator;
  s._renderId = state.renderId;
}

/** The world-identity table the state graph translates Babylon references through. */
export function worldIdentities(scene: Scene): Map<object, string> {
  const track = worldTrack(scene);
  const ids = new Map<object, string>();
  const plugin = pluginOf(scene);
  ids.set(scene, "scene");
  ids.set(plugin, "plugin");
  const engine = scene.getPhysicsEngine();
  if (engine) ids.set(engine, "physics");
  track.bodies.forEach((body, i) => {
    ids.set(body, `b${i}`);
    const b = body as unknown as BodyInternals;
    if (b.transformNode && !ids.has(b.transformNode)) ids.set(b.transformNode, `n${i}`);
    const shape = (body as unknown as { _shape: object | null })._shape;
    if (shape && !ids.has(shape)) ids.set(shape, `s${i}`);
  });
  const keys = constraintKeys(track);
  track.constraints.forEach((constraint, i) => ids.set(constraint, keys[i]!));
  return ids;
}

/** The inverse table for a world a fork is restored into. */
export function identityLookup(scene: Scene): Map<string, object> {
  const out = new Map<string, object>();
  for (const [object, key] of worldIdentities(scene)) out.set(key, object);
  return out;
}
