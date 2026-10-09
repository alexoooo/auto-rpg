import type { Scene } from "@babylonjs/core/scene.js";
import type { PhysicsEngine, PhysicsWorld, SegmentBody } from "./engine/engine.ts";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { sourced, type Quantity, type Vec3 } from "./spec/quantity.ts";

/** The fixed step's rate: physics and control run at 120 Hz. */
export const PHYSICS_HZ: Quantity<number> = sourced(120, "Hz", "owner-physics-rate",
  "physics and control at 120 Hz from the release of 2026-09-25");

/**
 * **The world**: one fixed step that owns physics, control and the clock. The page, the Node stand
 * and the research runners all advance it through `step` (or `advance`, which turns elapsed time
 * into whole steps), and nothing else moves its bodies or its clock.
 *
 * A step is: the sensing hooks; the step hooks, in the order they were added (minds, motor control,
 * the muscle driver); then one solver step of `dt`, which writes every body's node; then physical contact work; then the
 * after-step hooks (readings). The physics is the engine's the world was made with (`src/core/engine/engine.ts`),
 * beside the scene, which only carries the nodes: `scene.render()` never advances it, and a page renders what the steps
 * produced. The clock is the count of steps; `time` is that count over the rate, not a sum of deltas.
 *
 * A hook added while its own list runs waits for the next step, but an after-step hook added by a
 * step hook runs in the same step. A hook removed stops at once.
 */
export interface World {
  readonly scene: Scene;
  /** The physics: bodies, joints, ground and gravity. */
  readonly physics: PhysicsWorld;
  /** Steps a second. */
  readonly hz: number;
  /** The step, s. */
  readonly dt: number;
  /** The actuator law shared by every body: symmetric reference bounds or each side's own muscle bounds. */
  readonly actuation: "symmetric" | "directional";
  /** Steps taken since the world was made. */
  readonly steps: number;
  /** Seconds since the world was made: `steps / hz`. */
  readonly time: number;
  /** Its memory (`src/core/state.ts`): the steps taken, the time `advance` owes and active contact work. The physics saves its own (`PhysicsWorld.save`). */
  readonly state: object;
  /** Physical work episodes survive replacement of a fight's observers and are saved with the world. */
  readonly contactWork: { readonly active: Map<string, ContactWork>; readonly released: ContactWork[] };
  /**
   * Run `hook` first in every step, before every `beforeStep` hook, after the sensing hooks added
   * before it: what reads the world for the minds, so that every mind in a step decides on the
   * same moment.
   */
  sense(hook: StepHook): Hook;
  /** Run `hook` before every solver step, after the hooks added before it. */
  beforeStep(hook: StepHook): Hook;
  /** Run `hook` after every solver step, after the hooks added before it. */
  afterStep(hook: StepHook): Hook;
  /** Take `n` steps. */
  step(n?: number): void;
  /**
   * Take the whole steps `seconds` of elapsed time owes, carrying the remainder to the next call,
   * but at most `most`: a page that falls behind runs slow rather than catching up in a burst, and
   * the time it could not take is dropped. Returns the steps taken.
   */
  advance(seconds: number, most?: number): number;
  dispose(): void;
}

/** Called with the step, s. */
type StepHook = (dt: number) => void;

/** Numeric physical episode, independent of fighter registration and observer lifetime. */
interface ContactWork {
  first: number; second: number; mine: number; theirs: number;
  point: Vec3; normal: Vec3; work: number; closing: number;
  pairs: Map<string, { mine: number; theirs: number; work: number }>;
}

export interface Hook {
  dispose(): void;
}

interface WorldOptions {
  /** Steps a second; the game's rate (`PHYSICS_HZ`) unless a finer reference is asked for. */
  readonly hz?: number;
  /** Standard gravity, or none, for reading a body alone. */
  readonly gravity?: boolean;
  readonly actuation?: World["actuation"];
}

/** The world on `scene`, with a physics of `engine`'s own: make it before any body. The caller loads the engine (`loadEngine`). */
export function createWorld(scene: Scene, engine: PhysicsEngine, { hz = PHYSICS_HZ.value, gravity = true, actuation = "symmetric" }: WorldOptions = {}): World {
  if (actuation !== "symmetric" && actuation !== "directional") throw new Error(`unknown actuation ${String(actuation)}`);
  const physics = engine.createPhysics({ hz, gravity });
  const dt = 1 / hz;
  const sensing: HookEntry[] = [], before: HookEntry[] = [], after: HookEntry[] = [];
  const state = { steps: 0, owed: 0, contactWork: { active: new Map<string, ContactWork>(), released: [] as ContactWork[] } };
  const touched = new Set<string>(), centre = new Vector3(), spin = new Vector3(), one = new Vector3(), two = new Vector3();
  const motion = (body: SegmentBody, point: Vec3, out: Vector3) => {
    centre.set(...body.massProperties.centre).applyRotationQuaternionToRef(body.node.rotationQuaternion!, centre).addInPlace(body.node.position);
    body.linearVelocityToRef(out); body.angularVelocityToRef(spin);
    const x = point[0] - centre.x, y = point[1] - centre.y, z = point[2] - centre.z;
    out.x += spin.y * z - spin.z * y; out.y += spin.z * x - spin.x * z; out.z += spin.x * y - spin.y * x;
  };
  const readWork = () => {
    touched.clear(); state.contactWork.released.length = 0;
    for (const contact of physics.materialContacts()) {
      const reversed = contact.first.id > contact.second.id;
      const first = reversed ? contact.second.id : contact.first.id, second = reversed ? contact.first.id : contact.second.id;
      const mine = reversed ? contact.theirs : contact.mine, theirs = reversed ? contact.mine : contact.theirs;
      const normal: Vec3 = reversed ? [-contact.normal[0], -contact.normal[1], -contact.normal[2]] : contact.normal;
      const key = `${first}:${second}`;
      touched.add(key);
      const episode = state.contactWork.active.get(key) ?? { first, second, mine, theirs, point: contact.point, normal, work: 0, closing: 0,
        pairs: new Map<string, { mine: number; theirs: number; work: number }>() };
      episode.work += contact.work;
      const pair = episode.pairs.get(contact.key) ?? { mine, theirs, work: 0 };
      pair.work += contact.work; episode.pairs.set(contact.key, pair);
      motion(contact.first, contact.point, one); motion(contact.second, contact.point, two);
      episode.closing = Math.max(episode.closing, (one.x - two.x) * contact.normal[0]
        + (one.y - two.y) * contact.normal[1] + (one.z - two.z) * contact.normal[2]);
      state.contactWork.active.set(key, episode);
    }
    for (const [key, episode] of state.contactWork.active) if (!touched.has(key)) {
      state.contactWork.active.delete(key); state.contactWork.released.push(episode);
    }
  };
  let disposed = false;

  const add = (list: HookEntry[], run: StepHook): Hook => {
    const entry: HookEntry = { run, live: true };
    list.push(entry);
    return { dispose: () => { entry.live = false; const i = list.indexOf(entry); if (i >= 0) list.splice(i, 1); } };
  };
  const runAll = (list: HookEntry[]) => {
    // A snapshot, so a hook added to this list now waits for the next step; one removed now is skipped.
    for (const entry of list.slice()) if (entry.live) entry.run(dt);
  };

  const world: World = {
    scene, physics, hz, dt, state, contactWork: state.contactWork,
    get actuation() { return actuation; },
    get steps() { return state.steps; },
    get time() { return state.steps / hz; },
    sense: (hook) => add(sensing, hook),
    beforeStep: (hook) => add(before, hook),
    afterStep: (hook) => add(after, hook),
    step(n = 1) {
      if (disposed) throw new Error("the world was disposed");
      for (let i = 0; i < n; i++) {
        // Babylon caches a node's world matrix per render id; a step is a new moment, so a new id.
        (scene as unknown as { _renderId: number })._renderId += 1;
        runAll(sensing);
        runAll(before);
        physics.step(dt);
        state.steps += 1;
        readWork();
        runAll(after);
      }
    },
    advance(seconds, most = Infinity) {
      state.owed += seconds;
      let taken = 0;
      // A step is owed once its whole length has passed, give or take the float sum's rounding.
      while (state.owed >= dt - 1e-9 && taken < most) { world.step(); state.owed -= dt; taken += 1; }
      if (state.owed >= dt) state.owed %= dt;
      return taken;
    },
    dispose() {
      disposed = true;
      sensing.length = 0;
      before.length = 0;
      after.length = 0;
      physics.dispose();
    },
  };
  return world;
}

interface HookEntry { readonly run: StepHook; live: boolean }
