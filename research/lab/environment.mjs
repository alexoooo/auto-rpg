import { createHash } from "node:crypto";
import { createBout, freshHavok } from "../../tests/harness/bout-runner.mjs";
import { namedBuild } from "../../src/golem/roster.ts";
import { labMind, controlledMind, labObservation, validateAction, actionSize, LAB_VERSION,
  OBSERVATION_NAMES } from "../../src/golem/lab-policy.ts";
import { stable, digest } from "../schedule.mjs";
import { fingerprint } from "../fingerprint.mjs";

export const DEFAULT_CONFIG = Object.freeze({ seed: 20260921, hz: 12, maxSeconds: 150,
  leftBuild: "default", rightBuild: "default", surface: "pilot",
  left: { kind: "baseline", name: "golem-driver" }, right: { kind: "baseline", name: "golem-fencer" } });
let active = false;
export function validateConfig(config) {
  if (![12, 30, 60].includes(config.hz) || !Number.isInteger(config.seed) || config.seed < 0
    || !Number.isFinite(config.maxSeconds) || config.maxSeconds <= 0 || config.maxSeconds > 150
    || !namedBuild(config.leftBuild) || !namedBuild(config.rightBuild)) throw new Error("invalid lab configuration");
  actionSize(config.surface);
}
/** One world per realm, fresh wasm per reset. Worker processes provide parallelism. */
export async function createEnvironment(options = {}) {
  if (active) throw new Error("one Havok arena per realm; use separate workers");
  const config = structuredClone({ ...DEFAULT_CONFIG, ...options });
  validateConfig(config);
  active = true;
  let bout;
  try {
    let held = null;
    let external = false;
    const transcript = createHash("sha256");
    const tape = [];
    const trace = options.trace === true;
    const behaviors = Object.fromEntries(["left", "right"].map((side) => [side,
      { attackEdges: 0, retreatSeconds: 0, commandSeconds: 0 }]));
    const previous = { left: [false, false, false], right: [false, false, false] };
    const wrap = (mind, side) => ({ name: mind.name, decide(view, dt) {
      const intent = mind.decide(view, dt);
      {
        const behavior = behaviors[side];
        const gates = [intent.primary.thrust, intent.secondary.thrust, intent.natural.thrust];
        behavior.attackEdges += gates.filter((value, i) => value && !previous[side][i]).length;
        previous[side] = gates;
        behavior.commandSeconds += dt;
        if (intent.forward < -0.1) behavior.retreatSeconds += dt;
      }
      if (trace) transcript.update(stable({ side, dt, observation: labObservation(view), intent }));
      return intent;
    } });
    const baseline = labMind(config.left, config.seed);
    const controlled = controlledMind(config.surface, config.seed, () => held);
    const left = { name: "lab-left", decide(view, dt) {
      // Both histories advance on every step, including replay prefixes. No hidden controller clone.
      const original = baseline.decide(view, dt);
      const candidate = controlled.decide(view, dt);
      return external ? candidate : original;
    } };
    bout = createBout({ left: "golem-driver", right: "golem-fencer", seeds: [config.seed, config.seed ^ 0x123456],
      leftMind: wrap(left, "left"), rightMind: wrap(labMind(config.right, config.seed ^ 0x123456), "right"),
      leftGolem: namedBuild(config.leftBuild).setup, rightGolem: namedBuild(config.rightBuild).setup,
      locomotionMode: "supported", maxSeconds: config.maxSeconds, physics: await freshHavok() });
    // Publish boundary observations from solver-synced fields. Do not call observe():
    // it also begins a locomotion substep, which is simulation authority, not inspection.
    const publish = () => {
      for (const [self, opponent] of [[bout.left, bout.right], [bout.right, bout.left]]) {
        self.describe(self.view.self); opponent.describe(self.view.opponent);
        self.view.measure = opponent.nearestPartTo(self.view.self.shoulder);
        self.view.clock = bout.clock;
        self.view.projectiles.length = opponent.publishProjectiles(self.view.projectiles, 0, "opponent");
      }
    };
    publish();
    let closed = false;
    const observation = () => labObservation(bout.left.view);
    const state = () => {
      const result = bout.result();
      return { observation: observation(), opponentObservation: labObservation(bout.right.view),
        clock: bout.clock, terminated: !bout.active && result.text !== "unfinished", truncated: !bout.active && result.text === "unfinished",
        winner: result.winner, damage: [result.left.damage, result.right.damage],
        vitality: [bout.left.view.self.vitality, bout.right.view.self.vitality],
        trace: trace ? transcript.copy().digest("hex") : null };
    };
    return { config, observation, state, tape, behaviors,
      step(action = null) {
        if (closed || !bout.active) throw new Error("cannot step closed or finished environment");
        if (action !== null) validateAction(config.surface, action);
        held = action === null ? null : [...action]; external = action !== null;
        for (let i = 0; i < 60 / config.hz && bout.active; i++) bout.step();
        publish();
        const next = state();
        const reward = next.terminated ? next.winner === "left" ? 1 : next.winner === "right" ? -1 : 0 : 0;
        if (trace) tape.push({ action: held, ...next });
        return { ...next, reward };
      },
      result() { return structuredClone(bout.result()); },
      close() { if (!closed) { closed = true; try { bout.dispose(); } finally { active = false; } } },
    };
  } catch (error) { bout?.dispose(); active = false; throw error; }
}

/** Full prefix replay reconstructs physics AND both policy histories. No future commands are replayed. */
export async function replay(record, steps = record.steps.length, { deadline = Infinity } = {}) {
  if (record.version !== LAB_VERSION || record.fingerprint !== fingerprint().hash
    || record.id !== digest({ config: record.config, steps: record.steps })
    || !Number.isInteger(steps) || steps < 0 || steps > record.steps.length) throw new Error("incompatible replay record");
  const env = await createEnvironment({ ...record.config, trace: true });
  try {
    for (let i = 0; i < steps; i++) {
      if (Date.now() >= deadline) throw new Error("replay deadline reached");
      const actual = env.step(record.steps[i].action);
      const expected = record.steps[i];
      if (actual.trace !== expected.trace || stable(actual.observation) !== stable(expected.observation)
        || stable(actual.damage) !== stable(expected.damage) || actual.winner !== expected.winner) {
        throw new Error(`replay divergence at decision ${i}`);
      }
    }
    return env;
  } catch (error) { env.close(); throw error; }
}
export function recording(env) {
  if (!env.config.trace) throw new Error("recording requires trace:true");
  const config = structuredClone(env.config), steps = structuredClone(env.tape);
  return { version: LAB_VERSION, fingerprint: fingerprint().hash, config, steps,
    id: digest({ config, steps }), observationNames: OBSERVATION_NAMES };
}
