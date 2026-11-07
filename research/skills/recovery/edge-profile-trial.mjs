import { DEFAULT_ENGINE } from "../../../src/core/physics/engines.ts";
import { isRefused } from "../../../src/core/refusal.ts";
/** Ground-profile trials and aggregation shared by calibration and recovery search. */
/** The Options a trial waits through before the next choice: what the body does while it cannot yet choose. */
const WAITS = new Set(["brace while tumbling", "land"]);
/** The worth, life, within which the measuring mind chooses by chance (`Chance`): wide enough that each way up on offer is tried, not only the one its priors rank first. */
const MARGIN = .25;
/** A mean of seconds as the profiles keep it: to the millisecond. */
const round = (x) => Number(x.toFixed(3));

/** One fall played to its end: each ground try as a trial, keyed by the technique it ran. */
export async function edgeTrial(job, given) {
  await import("../../../tests/harness/preload-data.mjs");
  const { buildFall } = await import("../../../src/app/node/evaluation.ts");
  const { MINDS, partLookup, controllerOf } = await import("../../../src/app/catalog.ts");
  const { TECHNIQUES } = await import("../../../src/app/registration/techniques.ts");
  const { tumbling } = await import("../../../src/control/ground-reading.ts");
  const { measuredOn, techniqueDigest } = await import("../../../src/skills/framework/profile.ts");
  const { groundStart } = await import("../../../src/skills/recovery/data/profiles.ts");
  // Its priors alone (`PRIOR_PREDICTIONS`), so what it measures does not depend on what it measured before.
  const template = given ?? MINDS.option.config;
  const mind = { ...template, predictions: { kind: "prior" }, chooser: { ...template.chooser, margin: MARGIN } };
  /** Each ground Option measured and the technique it runs: a way up's and flatten's named as their technique, a brace while tumbling as itself. */
  const skills = new Map();
  for (const option of mind.options ?? controllerOf(mind).defaults.options) {
    if (!option.skill || option.kind === "brace-down" || option.kind === "steadying" || option.kind === "landing") continue;
    skills.set(option.kind === "brace-tumbling" ? "brace while tumbling" : option.skill.kind, option.skill);
  }
  const built = await buildFall({ ...job, mind }, DEFAULT_ENGINE);
  if (isRefused(built)) throw new Error(built.refused);
  const spec = built.combatant.body.built.spec, hz = built.world.hz, delay = built.world.delay;
  const trials = [], open = [], waiting = [];
  const record = built.combatant.minded.state.mind.decider.model.record;
  let phase = null, tried = new Map();
  /** Where `trial`'s Option takes the body: a way up's edge from where it began, flatten's lie. */
  const toOf = (trial) => trial.name === "flatten" ? trial.lie
    : TECHNIQUES[trial.name]?.edges.find((edge) => edge.from === trial.from)?.to ?? null;
  const reached = (trial, g, stood, next) => trial.name === "brace while tumbling" ? next !== null && skills.has(next) && !WAITS.has(next) && next !== "flatten"
    : trial.noted && (toOf(trial) === "standing" ? stood || g === null || g.onFeet : g !== null && g.position === toOf(trial));
  const close = (trial, t, g, stood, next) => {
    const done = reached(trial, g, stood, next), standing = done && (toOf(trial) === "standing");
    trials.push({ skill: skills.get(trial.name), from: trial.from, done, seconds: round(t - trial.at), down: !standing,
      ...(done ? {} : { end: g ? (g.onFeet ? "crouch" : g.position) : "standing" }) });
  };
  try {
    while (!built.ended) {
      built.world.step();
      built.afterStep();
      const c = built.combatant, t = built.world.time, g = c.body.view.ground, now = c.minded.report?.engagement?.phase ?? null;
      // A try noted in the mind's record: its Option's start, done or not.
      for (const entry of record.tried) {
        const key = `${entry.name} ${entry.from}`, was = tried.get(key) ?? { tries: 0, done: 0 };
        if (entry.tries > was.tries) {
          const trial = open.findLast((one) => one.name === entry.name);
          if (trial) { trial.from = entry.from; trial.noted = entry.done > was.done; }
        }
        tried.set(key, { tries: entry.tries, done: entry.done });
      }
      if (now === phase) continue;
      // The tries begun before this one end where the mind chooses again.
      if (!WAITS.has(now)) { for (const trial of waiting.splice(0)) close(trial, t, g, false, now); }
      else if (now === "brace while tumbling" && g && !tumbling(g)) waiting.push({ name: now, at: t, from: g.position });
      if (phase !== null && skills.has(phase) && !WAITS.has(phase)) {
        const i = open.findLastIndex((one) => one.name === phase);
        if (i >= 0) { const [trial] = open.splice(i, 1); if (WAITS.has(now)) waiting.push(trial); else close(trial, t, g, false, now); }
      }
      if (now !== null && skills.has(now) && !WAITS.has(now) && g) open.push({ name: now, at: t, from: g.position, lie: g.lie, noted: false });
      phase = now;
    }
    const r = built.reading(), stood = r.stood && r.verified !== null, g = built.combatant.body.view.ground, t = built.world.time;
    for (const trial of [...open, ...waiting]) close(trial, t, g, stood, null);
    return { job, reading: r, trials: trials.map((trial) => ({ ...trial, measured: measuredOn(spec, techniqueDigest(partLookup, spec, trial.skill), hz, null, hz, delay), postures: groundStart(trial.from) })) };
  } finally { built.dispose(); }
}

/** The measured ground trials grouped in the writer's deterministic order. */
export function edgeProfiles(all) {
  const profiles = new Map();
  for (const trial of all) {
    const key = JSON.stringify(trial.measured), profile = profiles.get(key) ?? { measured: trial.measured, target: null, label: `${trial.measured.body} ${trial.skill.kind}`, trials: [] };
    profiles.set(key, profile);
    profile.trials.push({ start: { range: 0, phase: "clear", postures: trial.postures }, done: trial.done, dealt: 0, taken: 0, seconds: trial.seconds, recovers: null, down: trial.down,
      ...(trial.end ? { end: trial.end } : {}) });
  }
  return [...profiles.values()].sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : a.measured.spec < b.measured.spec ? -1 : 1);
}
