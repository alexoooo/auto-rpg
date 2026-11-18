/**
 * **Which measured body a struck body never measured is read as, held out** (the numbers plan's bar
 * 4, over the trials in the assets, nothing played): for each strike's profile
 * (`strike-profiles.json`) and each body its trials struck, that body's trials taken away and
 * priced from the rest, by the trials struck at the measured body nearest its stature and mass
 * (`profileAgainst`, `STRUCK_SPANS`) and by those struck at the first body the profile's trials
 * struck (the rule before the struck body was numbers), against what its own trials brought. Each
 * trial is read at its own start (`ProfileReading.expect`): the share landed against whether it
 * landed, and the life dealt, a share of the struck body's, against what it dealt; the squared
 * error of each, paired trial by trial, and the difference's spread (twice its standard error).
 * Where the two rules read the same body there is nothing to tell them apart, and it is left out.
 *
 *   node --import ./tests/harness/preload-data.mjs research/skills/strikes/struck-held-out.mjs
 */
import { readFileSync } from "node:fs";
import { resolveCharacter } from "../../../src/core/bodies/models.ts";
import { profileAgainst, profileReading, struckNumbers } from "../../../src/skills/framework/profile.ts";

const { profiles } = JSON.parse(readFileSync("assets/skills/strikes/strike-profiles/strike-profiles.json", "utf8"));
const MODELS = ["man", "woman", "skeleton"], specs = new Map(MODELS.map((model) => [model, resolveCharacter({ model }).spec]));
const keyOf = (at) => `${at.stature} ${at.mass}`, modelAt = new Map(MODELS.map((model) => [keyOf(struckNumbers(specs.get(model))), model]));
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const spread = (xs) => { const m = mean(xs); return 2 * Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) / xs.length); };
const all = { nearest: [], first: [], unread: { nearest: 0, first: 0 } };

for (const profile of profiles) {
  const striker = specs.get(profile.measured.body), bodies = [...new Set(profile.trials.map((trial) => keyOf(trial.start.struck)))];
  for (const out of bodies) {
    const struck = specs.get(modelAt.get(out)), rest = { ...profile, trials: profile.trials.filter((trial) => keyOf(trial.start.struck) !== out) };
    const nearest = profileAgainst([rest], struck), first = { ...rest, trials: rest.trials.filter((trial) => keyOf(trial.start.struck) === keyOf(rest.trials[0].start.struck)) };
    const nearestAt = keyOf(nearest.trials[0].start.struck), firstAt = keyOf(first.trials[0].start.struck);
    if (nearestAt === firstAt) continue;
    const errors = { nearest: { done: [], dealt: [] }, first: { done: [], dealt: [] } };
    for (const trial of profile.trials) {
      if (keyOf(trial.start.struck) !== out || trial.letGo) continue;
      const { levels: _, held: __, ...asked } = trial.start, postures = trial.start.postures;
      const read = (by) => profileReading(by, striker, postures).expect(asked, struck);
      const [a, b] = [read(nearest), read(first)];
      if (!a || !b) { all.unread.nearest += a ? 0 : 1; all.unread.first += b ? 0 : 1; continue; }
      const dealt = trial.dealt / struck.wounds.hp.value;
      errors.nearest.done.push((a.done - +trial.done) ** 2); errors.first.done.push((b.done - +trial.done) ** 2);
      errors.nearest.dealt.push((a.dealt - dealt) ** 2); errors.first.dealt.push((b.dealt - dealt) ** 2);
    }
    const n = errors.nearest.done.length;
    if (!n) continue;
    all.nearest.push(...errors.nearest.done.map((done, k) => ({ done, dealt: errors.nearest.dealt[k] })));
    all.first.push(...errors.first.done.map((done, k) => ({ done, dealt: errors.first.dealt[k] })));
    const diff = (key) => errors.nearest[key].map((x, k) => x - errors.first[key][k]);
    console.log(`${profile.measured.body} ${profile.measured.skill} ${profile.measured.limb}, ${modelAt.get(out)} held out (${n} trials): nearest ${modelAt.get(nearestAt)}, first ${modelAt.get(firstAt)};`
      + ` landed error ${mean(errors.nearest.done).toFixed(4)} against ${mean(errors.first.done).toFixed(4)} (difference ${mean(diff("done")).toFixed(4)} ± ${spread(diff("done")).toFixed(4)}),`
      + ` dealt ${mean(errors.nearest.dealt).toFixed(5)} against ${mean(errors.first.dealt).toFixed(5)} (${mean(diff("dealt")).toFixed(5)} ± ${spread(diff("dealt")).toFixed(5)})`);
  }
}
if (all.nearest.length) {
  const diff = (key) => all.nearest.map((one, k) => one[key] - all.first[k][key]);
  console.log(`all, ${all.nearest.length} trials: landed error ${mean(all.nearest.map((one) => one.done)).toFixed(4)} nearest against ${mean(all.first.map((one) => one.done)).toFixed(4)} first`
    + ` (${mean(diff("done")).toFixed(4)} ± ${spread(diff("done")).toFixed(4)}); dealt ${mean(all.nearest.map((one) => one.dealt)).toFixed(5)} against ${mean(all.first.map((one) => one.dealt)).toFixed(5)}`
    + ` (${mean(diff("dealt")).toFixed(5)} ± ${spread(diff("dealt")).toFixed(5)}); unread by the nearest ${all.unread.nearest}, by the first ${all.unread.first}`);
}
