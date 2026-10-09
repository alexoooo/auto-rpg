/**
 * What a blow part costs a step: each part on the punch stand (`punchStand`), the right hand at the
 * punch competency's place, 8 s of blows from 2 s, each world step timed; the mean and longest wall
 * time of the steps with a blow under way and of those without, ms (Node, the core's world on
 * Rapier). Every cell is played once to compile first, and then `--runs` times, of which the least
 * mean is kept. Read on a quiet machine.
 *
 * node research/blow-cost.mjs [--hz 120] [--runs 3]
 */
import { parseArgs } from "node:util";
import { blowConfig } from "./competencies.mjs";
import { punchStand } from "./punch-calibration.mjs";

const BLOWS = Object.freeze([["path strike", "path-strike", ""], ["driven strike", "driven-strike", ""],
  ["whole-body, timed", "whole-body-strike", ""], ["whole-body, flat out", "whole-body-strike", "drive=flat-out"]]);
const MODELS = Object.freeze([["Warrior", "workshop-fighter"], ["Rogue", "workshop-rogue"]]);

/** One playing of `blow` on `model` at `hz`: the timed steps with a blow under way and without. */
async function play(model, blow, hz) {
  const s = await punchStand({ model, hand: "right", family: "cross", hz, seconds: 8, ahead: 0.55, height: 1.55, armExtension: 0.5,
    pad: { face: "compliant" }, matchedFeedback: true, blow });
  try {
    const striking = [], guarding = [];
    for (let i = 0; i < 8 * hz; i++) {
      const start = performance.now();
      s.world.step();
      const took = performance.now() - start;
      if (s.world.time >= 2) (s.skills.report.strike.phase !== null ? striking : guarding).push(took);
    }
    return { striking, guarding };
  } finally { s.dispose(); }
}

const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const shown = (x) => x === null ? "-" : x.toFixed(2);

const { values } = parseArgs({ options: { hz: { type: "string", default: "120" }, runs: { type: "string", default: "3" } } });
const hz = Number(values.hz), runs = Number(values.runs);
console.log(`| Body | Blow | Striking: mean | longest | steps | Guarding: mean | longest |`);
console.log(`|---|---|---:|---:|---:|---:|---:|`);
for (const [body, model] of MODELS) for (const [name, kind, settings] of BLOWS) {
  const blow = blowConfig(kind, settings);
  await play(model, blow, hz);
  let best = null;
  for (let k = 0; k < runs; k++) {
    const r = await play(model, blow, hz);
    if (!best || mean(r.striking) < mean(best.striking)) best = r;
  }
  console.log(`| ${body} | ${name} | ${shown(mean(best.striking))} | ${shown(Math.max(...best.striking))} | ${best.striking.length} | ${
    shown(mean(best.guarding))} | ${shown(Math.max(...best.guarding))} |`);
}
