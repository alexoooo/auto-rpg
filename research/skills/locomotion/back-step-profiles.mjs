/**
 * **The back step's profiles** (`src/skills/framework/profile.ts`, `assets/skills/locomotion/step-profiles.json`):
 * from the back step's evaluation's sparring (`npm run evaluate -- back-step <subject> --protocol <protocol> --json <run.json>`)
 * against the Warrior's Mind fighting: `spar-chosen`, the subject the Warrior's Mind with the back
 * step taking it where it chooses (`SPAR_CHOSEN`, `src/evaluation/back-step/cases.ts`), which the
 * asset is made of; or `spar` and `spar-fight`, the subject ordered it at drawn ranges, standing in
 * its carriage between or fighting as its own Mind. Ordered sways fall a third as often as chosen
 * ones at alike starts and, pooled with them, read the life a chosen sway loses half as much again
 * as it is (held out by gap); no start the trials record tells them apart. Each sway seen through
 * is a trial (`Sway`): its start where the subject sensed the attacker as it began (the range
 * centre to centre, the attacker's phase and posture, the subject's velocity against the
 * attacker's, how each body stood, and the levels its bodies' characters set, `startLevels`); it
 * deals nothing; the life the subject lost while it swayed, HP; the seconds it swayed; the range
 * head to head it left the two at (`exit.range`), and whether it left them within `ARRIVED` of
 * where they began centre to centre (`exit.stays`), else by how much further apart (`exit.moved`;
 * a head mid-sway leans, so a change head to head is not the bodies'), and of that the subject's own
 * steps' share (`exit.own`, m further apart; `Sway.moved`); and whether it went down then or just after. A
 * trial is done where it stayed up. A profile is a skill on a body against a target: its
 * measured-on read from each row's world as the strikes' is (`strike-profiles.mjs`): the left
 * body's spec as the bout builds it, the harness's rate and command delay, the recipe's sense
 * delay, the rate its mind decides at; its skill the gait's kind (`back-step`); its target the right
 * body's.
 *
 *   node --import ./tests/harness/preload-data.mjs research/skills/locomotion/back-step-profiles.mjs <run.json> ... [--write]
 *
 * `--write` puts the runs' profiles in the asset, each in place of the one measured on the same
 * body, skill and target.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { duelSpec } from "../../../src/game/arena/duel.ts";
import { holdsOf, measuredOn, specDigest, startLevels, trialExit } from "../../../src/skills/framework/profile.ts";
import { everyOf } from "../../../src/minds/decider.ts";
import { harnessRule } from "../../../src/evaluation/results.ts";

const OUT = "assets/skills/locomotion/step-profiles.json", SCRIPT = "research/skills/locomotion/back-step-profiles.mjs", PROTOCOLS = Object.freeze(["spar", "spar-fight", "spar-chosen", "spar-mirror"]);
const SKILL = "back-step";
const write = process.argv.includes("--write");
const paths = process.argv.slice(2).filter((arg) => arg !== "--write");
if (!paths.length) throw new Error("name a run of the back step's sparring: npm run evaluate -- back-step <subject> --protocol spar --json <run.json>");

const round = (x) => Number(x.toFixed(4));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length ? s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 : null; };
const specs = new Map();
/** Each side's body's spec as the bout builds it (`duelSpec`), by what of the recipe it reads. */
function specOf(recipe, side = "left") {
  const key = JSON.stringify([recipe[side], recipe.characters?.[side], recipe.attributes?.[side], recipe.steadiness?.[side], recipe.haste?.[side],
    recipe.skills?.[side], recipe.surfaces, recipe.loadouts?.[side]]);
  if (!specs.has(key)) specs.set(key, duelSpec(recipe, side));
  return specs.get(key);
}

const profiles = new Map(), read = new Set();
for (const path of paths) {
  const { header, cases: rows } = JSON.parse(readFileSync(path, "utf8"));
  if (header.evaluation !== "back-step" || !PROTOCOLS.includes(header.protocol))
    throw new Error(`${path} is a run of ${header.evaluation} ${header.protocol}: the back step's profile is measured on its evaluation's ${PROTOCOLS.join(" and ")}`);
  read.add(header.protocol);
  const rule = harnessRule(header.harness);
  if (!rule) throw new Error(`${path}: no rate in its harness, ${header.harness}`);
  const { hz, delay } = rule;
  for (const row of rows) {
    const recipe = row.world?.recipe, mind = recipe?.minds?.left;
    if (row.fault || !row.reading?.sways || row.world.kind !== "bout") continue;
    const spec = specOf(recipe), struck = specOf(recipe, "right"), held = holdsOf(struck), target = { body: struck.model, ...(held === undefined ? {} : { holds: held }) };
    const reaction = Math.round((recipe.senseDelay ?? 0) * hz) / hz;
    const measured = measuredOn(spec, SKILL, null, hz, reaction, hz / everyOf(mind.rate, hz), delay), key = JSON.stringify([measured, target]);
    const profile = profiles.get(key) ?? { measured, target, label: `${spec.model} ${SKILL} at ${struck.model}`, digests: { spec: specDigest(spec), target: specDigest(struck) },
      commits: new Set(), dates: new Set(), changed: false, trials: [] };
    profiles.set(key, profile);
    profile.commits.add(row.from.commit);
    profile.dates.add(row.from.date.slice(0, 10));
    profile.changed ||= row.from.changed;
    const levels = startLevels(spec, struck);
    for (const sway of row.reading.sways) {
      const posture = sway.foeAt.posture ?? "standing";
      const start = { range: round(sway.foeAt.apart), phase: sway.phase, ...(posture === "standing" ? {} : { postures: { own: "standing", target: posture } }),
        velocity: sway.foeAt.velocity.map(round), ...(sway.foeAt.stance ? { stance: sway.foeAt.stance } : {}), ...(levels ? { levels } : {}) };
      profile.trials.push({ start, done: !sway.down, dealt: 0, taken: round(sway.lost), seconds: round(sway.seconds), recovers: null, down: sway.down, ...(sway.exit ? { exit: { ...trialExit(sway.exit, sway.foeAt.apart), ...(sway.moved ? { own: round(-sway.moved.own) } : {}) } } : {}) });
    }
  }
}

const order = (a, b) => (a.start.postures?.target ?? "").localeCompare(b.start.postures?.target ?? "") || a.start.phase.localeCompare(b.start.phase) || a.start.range - b.start.range;
const shared = (values) => values.size === 1 ? [...values][0] ?? undefined : undefined;
const made = [...profiles.values()].filter((profile) => profile.trials.length).map((profile) => {
  const commit = shared(profile.commits), date = shared(profile.dates);
  return { measured: profile.measured, target: profile.target, from: { ...profile.digests, ...(commit === undefined ? {} : { commit, changed: profile.changed }), ...(date === undefined ? {} : { date }) }, trials: [...profile.trials].sort(order) };
});
for (const profile of profiles.values()) {
  const t = profile.trials, ranges = t.map((one) => one.start.range), taken = t.map((one) => one.taken);
  const phases = Object.entries(t.reduce((by, one) => ({ ...by, [one.start.phase]: (by[one.start.phase] ?? 0) + 1 }), {})).map(([phase, n]) => `${phase} ${n}`).join(", ");
  console.log(`${profile.label}: ${t.length} sways, range ${Math.min(...ranges)} to ${Math.max(...ranges)} m (median ${round(median(ranges))}); phases ${phases};`
    + ` lost a mean ${round(taken.reduce((s, x) => s + x, 0) / t.length)} HP, any in ${t.filter((one) => one.taken > 0).length}; down in ${t.filter((one) => one.down).length}; median ${round(median(t.map((one) => one.seconds)))} s`);
}
if (write) {
  const keyOf = (profile) => JSON.stringify([profile.measured, profile.target]), remade = new Map(made.map((profile) => [keyOf(profile), profile]));
  const asset = JSON.parse(readFileSync(OUT, "utf8")), kept = asset.profiles.map((profile) => { const again = remade.get(keyOf(profile)); remade.delete(keyOf(profile)); return again ?? profile; });
  writeFileSync(OUT, `${JSON.stringify({ source: { script: SCRIPT, protocols: [...read] }, profiles: [...kept, ...remade.values()] }, null, 2)}\n`);
}
