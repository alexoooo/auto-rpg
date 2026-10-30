/**
 * Fork B: the held deep squat handed to the game's Stand up (step-up: from a crouch quiet on both
 * flat feet, its planned climb, `CLIMB`) once quiet on flat feet for `quiet` s; verified as the
 * target verifies (`STAND_CHECK`). Node stand, core world, Rapier, 120 Hz, calm, no assist.
 *
 *   node climb.mjs --variant dorsi0.8 --posture posture-dorsi0.8-0.45-arms_to_1.5.json [--control bear|stance] [--seeds 0-7] [--quiet .1] [--held empty]
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { standUp } from "../../../src/core/recovery/ground/stand-up.ts";
import { quietOnFeet } from "../../../src/core/recovery/ground/reading.ts";
import { deepTrial } from "./deep.mjs";

export function climbAfter({ quiet = .1 } = {}) {
  let stand = null;
  return {
    when(g, state, dt) { state.q = quietOnFeet(g) && g.height < .9 ? (state.q ?? 0) + dt : 0; return state.q + 1e-9 >= quiet; },
    step(own, view, clock, kit, _g, dt, state) {
      if (!stand) { stand = standUp(own, view, clock, { kind: "stand-up", techniques: [{ kind: "step-up" }] }, kit); stand.begin(); state.phase = "climb"; }
      if (stand.state.active) stand.step(null, dt);
      else if (state.result.handBack === undefined) { state.result.handBack = +view.time.toFixed(2); state.result.log = stand.state.log.slice(-3).map((e) => `${e.technique}:${e.end}:${(+e.seconds).toFixed(2)}`); state.phase = "host"; }
    },
  };
}

if (process.argv[1]?.endsWith("climb.mjs")) {
  const { values } = parseArgs({ options: { variant: { type: "string" }, posture: { type: "string" }, control: { type: "string" }, seeds: { type: "string" }, quiet: { type: "string" }, held: { type: "string" }, trace: { type: "boolean" }, for: { type: "string" } } });
  const squat = JSON.parse(readFileSync(values.posture, "utf8")).rec;
  const [lo, hi] = (values.seeds ?? "0-7").split("-").map(Number);
  for (let seed = lo; seed <= hi; seed++) {
    const out = await deepTrial({ variant: values.variant ?? "dorsi0.8", control: values.control ?? "bear", seed, seconds: Number(values.for ?? 6), squat, held: values.held ?? "empty", trace: values.trace, after: climbAfter({ quiet: Number(values.quiet ?? .1) }) });
    if (out.rows) console.table(out.rows);
    const { rows: _r, ...rest } = out; console.log(JSON.stringify(rest));
  }
}
