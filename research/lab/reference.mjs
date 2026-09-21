import { createEnvironment, recording, replay } from "./environment.mjs";
import { oracle, fairPlan } from "./planning.mjs";

/** Offline receding-horizon fight. Commit a short prefix; re-query the changed world.
 * Checkpoints contain command prefixes, never purported solver snapshots.
 */
export async function referenceFight({ tier = "privileged", record = null, config = {}, model = null,
  deadline, maxDecisions = 8, onCheckpoint = () => {} }) {
  if (!["privileged", "fair"].includes(tier) || !Number.isInteger(maxDecisions) || maxDecisions < 1
    || (tier === "fair" && !model)) throw new Error("invalid reference configuration");
  if (!record) {
    const env = await createEnvironment({ ...config, trace: true });
    try { env.step(); record = recording(env); } finally { env.close(); }
  }
  const labels = [];
  let status = "decision-limit";
  for (let i = 0; i < maxDecisions; i++) {
    const state = record.steps.at(-1);
    if (state.terminated || state.truncated) { status = "finished"; break; }
    if (Date.now() >= deadline) { status = "budget"; break; }
    // The fair function is handed only the current public vector and the frozen model.
    const label = tier === "privileged" ? await oracle(record, record.steps.length,
      { deadline, candidates: 4, iterations: 1, horizon: 2, seed: record.steps.length })
      : fairPlan(state.observation, model, { seed: record.steps.length });
    const env = await replay(record, record.steps.length, { deadline });
    try {
      // 0.25 s is shorter than the planned horizon; no frozen opponent future is reused.
      for (let step = 0; step < Math.max(1, Math.round(record.config.hz / 4)); step++) {
        if (Date.now() >= deadline) { status = "budget"; break; }
        const next = env.step(label.action);
        if (next.terminated || next.truncated) { status = "finished"; break; }
      }
      record = recording(env); labels.push(label);
      onCheckpoint({ tier, record, labels, status, information: tier === "privileged"
        ? "known state and responsive known opponent" : "public observations and approximate transition ensemble" });
    } finally { env.close(); }
    if (status !== "decision-limit") break;
  }
  return { tier, record, labels, status };
}
