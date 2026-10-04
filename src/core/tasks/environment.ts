import { deepFreeze, loadState, saveState, type Saved } from "../state.ts";
import { PHYSICS_HZ, type World } from "../world.ts";
import { randomStream } from "../math/random.ts";

/** A shared physical task; controller choice changes its action adapter, not its objective. */
export interface WorldTask<A, O> {
  readonly world: World;
  /** All physical/task/controller settings, including body data and engine revision. Plain finite JSON. */
  readonly configuration: object;
  readonly state: object;
  /** Validate without changing the task; the environment copies the accepted plain-data action. */
  check(action: A): A;
  /** Apply the held action before a physics step. This is not a policy decision callback. */
  act(action: A): void;
  observe(): O;
  evaluate(): { readonly metrics: Readonly<Record<string, number>>; readonly terminated: string | null; readonly invalid: string | null };
  /** Refresh derived views after restoring explicit state. */
  show?(): void;
  dispose(): void;
}

interface Options { readonly policyPeriodSteps: number; readonly maxSteps: number }
interface Snapshot {
  readonly protocol: 1;
  readonly identity: string;
  readonly seed: number;
  readonly physics: Uint8Array;
  readonly state: Saved;
}

/** Stable configuration identity refuses values JSON would silently discard or turn into null. */
function configurationKey(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from(value, configurationKey).join(",")}]`;
  if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${configurationKey((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  throw new Error("task configuration must be finite plain JSON");
}

function finite(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (value === null || typeof value !== "object") return true;
  return Object.values(value).every(finite);
}

/**
 * Seeded reset/observe/act/step/save/load over the task's own World. The factory owns its scene
 * and physics lifetime. Every episode uses the same frozen configuration and fixed policy period.
 * Missing decisions hold the last action; actions are accepted only on decision boundaries.
 */
export function createEnvironment<C extends object, A, O>(configuration: C,
  build: (configuration: C, random: () => number) => WorldTask<A, O>, options: Options) {
  const { policyPeriodSteps, maxSteps } = options;
  if (!Number.isSafeInteger(policyPeriodSteps) || policyPeriodSteps < 1 || !Number.isSafeInteger(maxSteps) || maxSteps < 1) {
    throw new Error("policy period and episode limit must be positive whole steps");
  }
  const config = deepFreeze(JSON.parse(configurationKey(configuration)) as C);
  const make = (seed: number) => {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("seed must be an unsigned 32-bit integer");
    const stream = randomStream(seed);
    const state = { seed, random: stream.state, elapsed: 0, held: null as A | null, terminated: null as string | null, truncated: false, invalid: null as string | null };
    const task = build(config, stream.next);
    try {
      if (task.world.hz !== PHYSICS_HZ.value) throw new Error(`the task environment requires ${PHYSICS_HZ.value} Hz physics`);
      if (!task.world.physics.revision || task.world.physics.revision === "unidentified-rapier") throw new Error("the task environment requires an identified solver artifact");
      const identity = configurationKey({ configuration: config, task: task.configuration, engine: task.world.physics.engine,
        engineRevision: task.world.physics.revision, gravity: task.world.physics.gravity,
        actuation: task.world.actuation, hz: task.world.hz, policyPeriodSteps, maxSteps });
      return { task, state, identity };
    } catch (error) { task.dispose(); throw error; }
  };
  type Episode = ReturnType<typeof make>;
  let episode: Episode | null = null, disposed = false;
  const current = () => {
    if (disposed) throw new Error("the environment was disposed");
    if (!episode) throw new Error("reset the environment before using it");
    return episode;
  };
  const ended = (state: Episode["state"]) => state.terminated !== null || state.truncated || state.invalid !== null;
  const result = () => {
    const { task, state } = current();
    let metrics: Readonly<Record<string, number>> = {}, observation: O | null = null;
    if (state.invalid === null) {
      try {
        const evaluation = task.evaluate();
        metrics = { ...evaluation.metrics };
        state.invalid = evaluation.invalid;
        if (!finite(metrics)) state.invalid = "non-finite task metrics";
        if (state.invalid === null) {
          observation = task.observe();
          if (!finite(observation)) state.invalid = "non-finite observation";
          else state.terminated ??= evaluation.terminated;
        }
      } catch (error) { state.invalid = error instanceof Error ? error.message : String(error); }
    }
    return deepFreeze({ observation: state.invalid === null ? observation : null, metrics, steps: state.elapsed,
      decisionDue: !ended(state) && state.elapsed % policyPeriodSteps === 0,
      terminated: state.terminated !== null, reason: state.terminated,
      truncated: state.truncated, invalid: state.invalid });
  };
  return {
    configuration: config,
    reset(seed: number) {
      if (disposed) throw new Error("the environment was disposed");
      const next = make(seed);
      episode?.task.dispose(); episode = next;
      return result();
    },
    observe: result,
    act(action: A) {
      const { task, state } = current();
      if (ended(state)) throw new Error("the episode has ended");
      if (state.elapsed % policyPeriodSteps !== 0) throw new Error("action is not at a policy boundary");
      const copy = saveState({ action: task.check(action) }) as { action: A };
      state.held = deepFreeze(copy.action);
    },
    step(steps?: number) {
      const { task, state } = current();
      const count = steps ?? policyPeriodSteps - state.elapsed % policyPeriodSteps;
      if (!Number.isSafeInteger(count) || count < 1) throw new Error("step count must be a positive integer");
      if (ended(state)) throw new Error("the episode has ended");
      for (let i = 0; i < count && !ended(state); i++) {
        try {
          if (state.held !== null) task.act(state.held);
          task.world.step(); state.elapsed++;
          result();
          if (!ended(state) && state.elapsed >= maxSteps) state.truncated = true;
        } catch (error) { state.invalid = error instanceof Error ? error.message : String(error); }
      }
      return result();
    },
    save(): Snapshot {
      const { task, state, identity } = current();
      return { protocol: 1, identity, seed: state.seed, physics: task.world.physics.save(),
        state: saveState({ environment: state, world: task.world.state, task: task.state }) };
    },
    load(saved: Snapshot) {
      if (disposed) throw new Error("the environment was disposed");
      if (saved.protocol !== 1) throw new Error("unknown environment snapshot protocol");
      const next = make(saved.seed);
      try {
        if (next.identity !== saved.identity) throw new Error("snapshot belongs to another task configuration");
        next.task.world.physics.load(saved.physics);
        loadState({ environment: next.state, world: next.task.world.state, task: next.task.state }, saved.state);
        next.task.show?.();
      } catch (error) { next.task.dispose(); throw error; }
      episode?.task.dispose(); episode = next;
      return result();
    },
    dispose() { if (disposed) return; disposed = true; episode?.task.dispose(); episode = null; },
  };
}
