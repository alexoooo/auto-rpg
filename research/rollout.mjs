/**
 * **A rollout played on a worker**: its environments stepped by the trainer's policy as it stands,
 * each on its own, so that none waits on another's step (`run-learning-server.mjs`'s `collect`).
 * The policy is PPO's: its mean, the actor's ReLU layers on the observation as the trainer
 * normalises it (`mean`, `scale`, clipped at `clip`), its last layer's outputs; an action is that
 * mean with the policy's spread (`std`) drawn about it, the environment given it clipped to the
 * trainer's action bound (`BOUND`), the rollout keeping it as drawn. The trainer values and prices
 * the rollout itself, on the observations it gets back.
 *
 * Between rounds of every environment's step, each environment's `idle` work (a pooled start's
 * walk in) is given a slice, as the server gives it between messages.
 */

/** The bound the trainer's action space holds a PPO action to, before the environment's tanh (`run-train.py`). */
export const BOUND = 3;

/** The policy's mean, as a function of a raw observation (the array it returns is reused). */
export function policyMean({ layers, mean, scale, clip }) {
  const work = layers.map((layer) => new Float64Array(layer.bias.length)), input = new Float64Array(mean.length);
  return (observation) => {
    for (let i = 0; i < input.length; i++) input[i] = Math.max(-clip, Math.min(clip, (observation[i] - mean[i]) * scale[i]));
    let previous = input;
    layers.forEach((layer, k) => {
      const values = work[k], last = k + 1 === layers.length;
      for (let i = 0; i < values.length; i++) {
        const row = layer.weights[i];
        let value = layer.bias[i];
        for (let j = 0; j < previous.length; j++) value += row[j] * previous[j];
        values[i] = last || value > 0 ? value : 0;
      }
      previous = values;
    });
    return previous;
  };
}

/** Standard normal draws on `uniform` (Box and Muller, the second of each pair kept for the next draw). */
export function normalDraws(uniform) {
  let spare = null;
  return () => {
    if (spare !== null) { const value = spare; spare = null; return value; }
    const u = Math.max(uniform(), Number.MIN_VALUE), v = uniform(), radius = Math.sqrt(-2 * Math.log(u));
    spare = radius * Math.sin(2 * Math.PI * v);
    return radius * Math.cos(2 * Math.PI * v);
  };
}

/**
 * Each of `envs` stepped `steps` decisions from `current` (its observation now, kept up to date) by
 * `policy`, an ended episode reset at once: per environment, the observations it acted on, the
 * actions as drawn, the rewards, the ends and which of them a cut (`truncated`), the observation a
 * cut ended on (its value bootstraps the cut), each ended episode's return, length and info, the
 * world steps and seconds played, and its observation after the last step. `episodes` keeps each environment's running return and length
 * across rollouts.
 */
export async function collect(envs, current, episodes, policy, steps, normal) {
  const act = policyMean(policy), std = policy.std, size = current[0].length, actions = std.length;
  const out = envs.map(() => ({ observations: new Float32Array(steps * size), actions: new Float32Array(steps * actions), rewards: new Float32Array(steps),
    dones: new Uint8Array(steps), truncated: new Uint8Array(steps), cuts: [], ended: [], worldSteps: 0, worldSeconds: 0 }));
  const drawn = new Array(actions).fill(0), given = new Array(actions).fill(0);
  for (let t = 0; t < steps; t++) {
    for (let k = 0; k < envs.length; k++) {
      const e = envs[k], o = out[k], observation = current[k], mean = act(observation);
      o.observations.set(observation, t * size);
      for (let a = 0; a < actions; a++) {
        drawn[a] = mean[a] + std[a] * normal();
        given[a] = Math.max(-BOUND, Math.min(BOUND, drawn[a]));
      }
      o.actions.set(drawn, t * actions);
      const r = await e.step(given), done = r.terminated || r.truncated, cut = r.truncated && !r.terminated;
      o.rewards[t] = r.reward; o.dones[t] = done ? 1 : 0; o.truncated[t] = cut ? 1 : 0;
      o.worldSteps += r.info.worldSteps; o.worldSeconds += r.info.worldSeconds;
      episodes[k].r += r.reward; episodes[k].l += 1;
      if (done) {
        if (cut) o.cuts.push({ t, observation: Array.from(r.observation) });
        o.ended.push({ ...r.info, r: episodes[k].r, l: episodes[k].l });
        episodes[k].r = 0; episodes[k].l = 0;
        current[k] = await e.reset();
      } else current[k] = r.observation;
    }
    for (const e of envs) if (e.idle) await e.idle();
  }
  return out.map((o, k) => ({ ...o, last: Float32Array.from(current[k]) }));
}
