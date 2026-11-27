/**
 * **A fork's worth** (the forked record's step 3): what a fork of a banked state (`fork-bank.mjs`)
 * was worth to the side that took the Option, priced as that side's Mind prices a line. The life
 * dealt and taken in the fork's first `h` s, each counted as the Mind's objective weighs it by when
 * it came (`Objective.weigh`), then the rest of the Mind's horizon read by the fitted value at the
 * side's reading `h` s on (`fittedOver`, as its fitted leaf reads the end of a line), the whole
 * priced by the objective as of the state forked (its lead and lateness). Where the bout ended
 * within `h` s, nothing is read after its end. It imports the Mind's code.
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

/** **What `fork` (a fork's row) was worth to `side`**, life, priced by `pricing` with its first `h` s played and the rest read (`every` s apart its readings). */
export function forkedWorth(fork, side, h, every, { objective, horizon, value }) {
  const w = fork.watched, weigh = (which, from, span) => objective.weigh ? objective.weigh(which, from, span, horizon) : 1;
  let dealt = 0, taken = 0;
  for (let k = 1; k < w.lives.length; k++) {
    const from = w.lives[k][0] - w.t0;
    if (from > h + 1e-9) break;
    const [own, foe] = losses(w.lives[k - 1], w.lives[k], side);
    dealt += weigh("dealt", from, 0) * foe; taken += weigh("taken", from, 0) * own;
  }
  // A fork reads each `every` s while its bout runs: a reading missing is the bout's end, else the fork was not played that far.
  const mark = w.marks[Math.round(h / every) - 1];
  if (!mark && !fork.verdict) throw new Error(`a fork read ${w.marks.length} times, ${every} s apart, has no reading ${h} s on`);
  if (mark) {
    const followed = fittedOver(value, featuresOf(readingOf({ reading: mark })), horizon - h);
    dealt += weigh("dealt", h, horizon - h) * followed.dealt; taken += weigh("taken", h, horizon - h) * followed.taken;
  }
  const start = w.start;
  return objective.worth({ dealt, taken, orders: 0, seconds: horizon, end: null }, { lead: start.lead, lateness: start.lateness }, { metre: 0, foe: 0 });
}
