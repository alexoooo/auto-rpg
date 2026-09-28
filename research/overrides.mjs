/**
 * Counterfactual knobs for a research run: a constant moved for one run's bouts and put back after
 * each of them, never a retune (`docs/analysis/2026-09-26-release-2-questions.md` (in git at c76ce6bc)).
 *
 * A run names its knobs in its manifest (`manifest.overrides`, `{ knob: value }`), so the value a
 * run was played at is part of the identity `runJobs` checks on resume, and the worker applies them
 * around each job:
 *
 *     const restore = applyOverrides(manifest.overrides);
 *     try { ...the bout... } finally { restore(); }
 *
 * A manifest without `overrides` plays the shipped tables, exactly as before this file existed.
 * Every knob is a field of a table the bodies read at construction, so it has to be set before the
 * bout is created; each worker realm runs one bout at a time, so setting it there is setting it for
 * that bout alone.
 *
 * This module registers no message handler, so a worker may import it (a worker must never import
 * another worker module: see `research/headroom-worker.mjs`).
 */
import { TORSO_WAIST } from "../src/golem/config.ts";
import { WALKER } from "../src/golem/walker.ts";

/**
 * The knobs, by name. `waist.leanTorque` is the stone waist's lean ceiling in N.m, the product the
 * shipped table writes as `onBody(600)` (1852 N.m). The skeleton's spine (`SPINE`) and the human's
 * waist (`HUMAN_WAIST`) are their own tables and do not move with it. `walker.holdFraction` is
 * where the naive walker stops walking in, as a fraction of its reach (`WALKER` in
 * `src/golem/walker.ts`; release 2's question 5(b)).
 */
export const KNOBS = Object.freeze({
  "waist.leanTorque": Object.freeze({ block: TORSO_WAIST, key: "leanTorque" }),
  "walker.holdFraction": Object.freeze({ block: WALKER, key: "holdFraction" }),
});

/**
 * Set each named knob; returns the function that puts every one back. An unknown knob or a
 * non-finite value throws before anything is set, so a refused manifest leaves the tables shipped.
 */
export function applyOverrides(overrides) {
  const entries = Object.entries(overrides ?? {});
  for (const [name, value] of entries) {
    if (!KNOBS[name]) throw new Error(`no override knob "${name}"; known: ${Object.keys(KNOBS).join(", ")}`);
    if (!Number.isFinite(value)) throw new Error(`override ${name} must be a finite number, not ${value}`);
  }
  const restore = [];
  for (const [name, value] of entries) {
    const knob = KNOBS[name];
    restore.push([knob.block, knob.key, knob.block[knob.key]]);
    knob.block[knob.key] = value;
  }
  return () => { for (const [block, key, value] of restore.reverse()) block[key] = value; };
}
