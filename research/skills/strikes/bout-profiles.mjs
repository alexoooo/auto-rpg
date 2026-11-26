/**
 * **Strikes' profiles from bouts** (`Profile`, `src/skills/framework/profile/profile.ts`): each strike a
 * bout's side threw at the other's body, read as the Strike drill reads a sparring trial and made a
 * trial the one way (`strikeTrial`), merged by the key a profile is found by (`strikeKey`) over the
 * records `strike-bouts.mjs --save` wrote. The profiles are in the strikes' table's format
 * (`strike-profiles.mjs`), so a mind can read them in its place:
 *
 *   node --import ./tests/harness/preload-data.mjs research/skills/strikes/bout-profiles.mjs <bouts.json> ... --out <profiles.json>
 *
 * A key whose bodies or skill a record digests otherwise (`Origin`) was played on other code: the
 * records are refused rather than mixed. Each profile names the Minds that played its bouts, both sides' (`Played`). Its trials are in the order they were thrown; a profile is
 * read by its trials nearest a start, in any order.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { savedBouts } from "./bout-save.mjs";
import { playedOnce } from "../profile-origin.mjs";

const SCRIPT = "research/skills/strikes/bout-profiles.mjs";
const { values, positionals } = parseArgs({ options: { out: { type: "string" } }, allowPositionals: true });
if (!positionals.length) throw new Error("name the bouts strike-bouts.mjs saved: bout-profiles.mjs <bouts.json> ... [--out <profiles.json>]");

const profiles = new Map(), round = (x) => Number(x.toFixed(4)), mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
let bouts = 0;
for (const path of positionals) for (const [, result] of savedBouts(path)) {
  bouts++;
  for (const side of result.strikes) for (const { measured, digests, trials } of side) {
    const key = JSON.stringify(measured), known = profiles.get(key);
    if (known && JSON.stringify(known.digests) !== JSON.stringify(digests)) throw new Error(`${path}: ${measured.body} ${measured.skill} with ${measured.limb} played on other code than an earlier record's`);
    const profile = known ?? { measured, digests, minds: [], trials: [] };
    profiles.set(key, profile);
    profile.minds.push(...result.played);
    profile.trials.push(...trials);
  }
}
console.log(`${bouts} bouts, ${profiles.size} profiles`);
for (const { measured: m, trials } of profiles.values())
  console.log(`  ${m.body} ${m.skill} with ${m.limb}: ${trials.length} trials, landed ${round(mean(trials.map((t) => +t.done)))},`
    + ` dealt ${round(mean(trials.map((t) => t.dealt)))} hp, taken ${round(mean(trials.map((t) => t.taken)))} hp, ${round(mean(trials.map((t) => t.seconds)))} s, down ${round(mean(trials.map((t) => +t.down)))}`);
if (values.out) writeFileSync(values.out, `${JSON.stringify({ source: { script: SCRIPT, bouts: positionals }, profiles: [...profiles.values()].map(({ measured, digests, minds, trials }) => ({ measured, from: { ...digests, minds: playedOnce(minds) }, trials })) }, null, 2)}\n`);
