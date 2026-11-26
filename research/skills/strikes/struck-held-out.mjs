/**
 * **Which measured body a struck body never measured is read as, held out** (over the trials in
 * the assets, nothing played): for each profile of the striker named
 * (`strike-profiles.json`) and each body its trials struck, that body's trials taken away and
 * priced from the rest, by the trials struck at the measured body nearest its stature and mass
 * (`profileAgainst`, `STRUCK_SPANS`) and by those struck at the first body the profile's trials
 * struck (the rule before the struck body was numbers), against what its own trials brought, and
 * by the rest pooled, read as a written form with the struck body's numbers among its terms
 * (`formReading`, `bodyNumbers`), and by its own: its trials split by turns, the even ones read and the odd ones scored, all three
 * rules on the odd ones alone, so its own is what a body loses read from another's. Each
 * trial is read at its own start (`ProfileReading.expect`): the share landed against whether it
 * landed, and the life dealt, a share of the struck body's, against what it dealt; the squared
 * error of each, paired trial by trial, and the difference's spread (twice its standard error).
 * Every body measured is held out in turn, whether or not the nearest and the first read the same.
 *
 * It reads one striker, the one in hand, and pools nothing across strikers: a profile is there for
 * every body its drill ran on, whether or not the skill was developed on that body, and a skill
 * that does not work on its striker says nothing of the bodies it struck. Nor does it say which
 * of the struck bodies fought back with skills developed for them. A held-out body whose trials
 * record other start coordinates than the rest's (a stance, where the rest have none) came from
 * another drill: its line says so, and it is left out of the striker's pooled line.
 *
 *   node --import ./tests/harness/preload-data.mjs research/skills/strikes/struck-held-out.mjs <striker's body> [<skill/variation>]
 */
import { readFileSync } from "node:fs";
import { BODY_MODELS, resolveCharacter } from "../../../src/core/bodies/models.ts";
import { formReading } from "../../../src/skills/framework/form.ts";
import { profileAgainst } from "../../../src/skills/framework/profile/across.ts";
import { readProfile } from "../../../src/skills/framework/profile/reading.ts";
import { struckNumbers } from "../../../src/skills/framework/profile/numbers.ts";
import { mean } from "../../../src/evaluation/stats.ts";

const [body, skill] = process.argv.slice(2);
if (!BODY_MODELS.includes(body)) throw new Error(`usage: struck-held-out.mjs <striker's body: ${BODY_MODELS.join(", ")}> [<skill/variation>]`);
const profiles = JSON.parse(readFileSync("assets/skills/strikes/strike-profiles/strike-profiles.json", "utf8")).profiles
  .filter((profile) => profile.measured.body === body && (skill === undefined || profile.measured.skill === skill));
if (!profiles.length) throw new Error(`no strike profile of ${body}${skill === undefined ? "" : ` throwing ${skill}`}`);
const specs = new Map(BODY_MODELS.map((model) => [model, resolveCharacter({ model }).spec]));
const keyOf = (at) => `${at.stature} ${at.mass}`, modelAt = new Map(BODY_MODELS.map((model) => [keyOf(struckNumbers(specs.get(model))), model]));
/** The start coordinates a trial records, by name: trials of one drill record the same. */
const recorded = (trials) => [...new Set(trials.flatMap((trial) => Object.keys(trial.start)))].sort().join(", ");
const spread = (xs) => { const m = mean(xs); return 2 * Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) / xs.length); };
const RULES = ["own", "nearest", "first", "form"];
const all = { own: [], nearest: [], first: [], form: [], unread: 0 };

for (const profile of profiles) {
  const striker = specs.get(profile.measured.body), bodies = [...new Set(profile.trials.map((trial) => keyOf(trial.start.struck)))];
  for (const out of bodies) {
    const struck = specs.get(modelAt.get(out)), rest = { ...profile, trials: profile.trials.filter((trial) => keyOf(trial.start.struck) !== out) };
    const nearest = profileAgainst([rest], struck), first = { ...rest, trials: rest.trials.filter((trial) => keyOf(trial.start.struck) === keyOf(rest.trials[0].start.struck)) };
    const nearestAt = keyOf(nearest.trials[0].start.struck), firstAt = keyOf(first.trials[0].start.struck);
    const mine = profile.trials.filter((trial) => keyOf(trial.start.struck) === out), own = { ...profile, trials: mine.filter((_, k) => k % 2 === 0) };
    const errors = Object.fromEntries(RULES.map((rule) => [rule, { done: [], dealt: [] }]));
    for (const trial of mine.filter((_, k) => k % 2 === 1)) {
      if (trial.letGo) continue;
      const { levels: _, held: __, ...asked } = trial.start, postures = trial.start.postures;
      const read = (by, reading = readProfile) => reading(by, striker, postures).expect(asked, struck);
      const readings = { own: read(own), nearest: read(nearest), first: read(first), form: read(rest, formReading) };
      if (RULES.some((rule) => !readings[rule])) { all.unread++; continue; }
      const dealt = trial.dealt / struck.wounds.hp.value;
      for (const rule of RULES) { errors[rule].done.push((readings[rule].done - +trial.done) ** 2); errors[rule].dealt.push((readings[rule].dealt - dealt) ** 2); }
    }
    const n = errors.nearest.done.length;
    if (!n) continue;
    const apart = recorded(mine) === recorded(rest.trials) ? "" : ` ANOTHER DRILL, not pooled (its trials record ${recorded(mine)}; the rest ${recorded(rest.trials)})`;
    if (!apart) for (const rule of RULES) all[rule].push(...errors[rule].done.map((done, k) => ({ done, dealt: errors[rule].dealt[k] })));
    console.log(`${profile.measured.body} ${profile.measured.skill} ${profile.measured.limb}, ${modelAt.get(out)} held out (${n} trials)${apart}: nearest ${modelAt.get(nearestAt)}, first ${modelAt.get(firstAt)};`
      + ` ${summary(errors, (rule, key) => errors[rule][key])}`);
  }
}
if (all.nearest.length) console.log(`all of ${body}'s${skill === undefined ? "" : ` ${skill}`}, ${all.nearest.length} trials: ${summary(all, (rule, key) => all[rule].map((one) => one[key]))}; ${all.unread} unread by one rule or more`);

/** Each rule's mean squared error of landed and of dealt, and the nearest's and the first's less the own's, paired, with its spread. */
function summary(_, of) {
  const line = (key, places) => RULES.map((rule) => `${rule} ${mean(of(rule, key)).toFixed(places)}`).join(", ")
    + ` (${RULES.slice(1).map((rule) => { const d = of(rule, key).map((x, k) => x - of("own", key)[k]); return `${rule} less own ${mean(d).toFixed(places)} ± ${spread(d).toFixed(places)}`; }).join(", ")})`;
  return `landed error ${line("done", 4)}; dealt error ${line("dealt", 5)}`;
}
