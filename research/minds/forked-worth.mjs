/**
 * **A fork's worth** (the forked record's step 3): what a fork of a banked state (`fork-bank.mjs`)
 * was worth to the side that took the Option, priced as that side's Mind prices a line. The life
 * dealt and taken in about the fork's first `h` s, each counted as the Mind's objective weighs it
 * by when it came (`Objective.weigh`), then the rest of the Mind's horizon read by the fitted value
 * at the side's last search by then (`fittedOver`, as its fitted leaf reads the end of a line), the
 * whole priced by the objective as of the state forked (its lead and lateness). Life is the bar
 * (`Duel.life`), as the record's: past the clock's drain it falls for both, alike for every Option
 * at a state but one whose fork the bout's end cut short. It imports the Mind's code.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FEW_TERMS_PART } from "../../src/minds/option/choosers/objectives.ts";
import { HORIZON } from "../../src/minds/option/choosers/parts.ts";
import { featuresOf, fittedOver } from "../../src/minds/option/predictions/value/fitted-value.ts";
import { readingOf } from "./record.mjs";

const VALUE = fileURLToPath(new URL("../../assets/minds/fitted-value.json", import.meta.url));

/**
 * **How the Mind of `config` (an Option Mind's) prices a fork**: its objective (the few terms,
 * `FEW_TERMS_PART`, as its chooser's config sets them) and its horizon, with the fitted value the
 * game reads now. An error where its chooser's objective is not the few terms.
 */
export function pricing(config) {
  const chooser = config.chooser ?? {}, objective = chooser.objective ?? { kind: "few-terms" };
  if (objective.kind !== "few-terms") throw new Error(`a fork is priced by the few terms, not ${objective.kind}`);
  return { objective: FEW_TERMS_PART.make(objective), horizon: chooser.horizon ?? HORIZON, value: JSON.parse(readFileSync(VALUE, "utf8")) };
}

/** The life `side` lost, and its foe, from one lives entry (`[clock, left, right]`) to the next. */
const losses = (was, now, side) => side === "left" ? [was[1] - now[1], was[2] - now[2]] : [was[2] - now[2], was[1] - now[1]];

/**
 * **What `fork` (a fork's row) was worth to `side`**, life, priced by `pricing` with its first `h`
 * s as played and the rest read: played up to the clock of the side's last search by `h` (its
 * readings `every` s apart), whose reading the fitted value reads for the rest of the horizon, so
 * nothing is counted twice; played to `h` where the bout ended first, and nothing read after.
 * Null where there is no search to read: none in the fork, or none by `h`.
 */
export function forkedWorth(fork, side, h, every, { objective, horizon, value }) {
  const w = fork.watched, k = Math.round(h / every) - 1, weigh = (which, from, span) => objective.weigh ? objective.weigh(which, from, span, horizon) : 1;
  // A fork reads each `every` s while its bout runs: fewer readings are the bout's end, else the fork was not played that far.
  if (k >= w.marks.length && !fork.verdict) throw new Error(`a fork read ${w.marks.length} times, ${every} s apart, has no reading ${h} s on`);
  const mark = w.marks[k];
  if (!w.start || mark === null) return null;
  const until = mark ? mark.t - w.t0 : h;
  let dealt = 0, taken = 0;
  for (let j = 1; j < w.lives.length; j++) {
    const from = w.lives[j][0] - w.t0;
    if (from > until + 1e-9) break;
    const [own, foe] = losses(w.lives[j - 1], w.lives[j], side);
    dealt += weigh("dealt", from, 0) * foe; taken += weigh("taken", from, 0) * own;
  }
  if (mark) {
    const followed = fittedOver(value, featuresOf(readingOf(mark)), horizon - until);
    dealt += weigh("dealt", until, horizon - until) * followed.dealt; taken += weigh("taken", until, horizon - until) * followed.taken;
  }
  return objective.worth({ dealt, taken, orders: 0, seconds: horizon, end: null }, { lead: w.start.lead, lateness: w.start.lateness }, { metre: 0, foe: 0 });
}
