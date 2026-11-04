/**
 * **A skill's records**: each body's settings of a skill tuned per body (`SkillRecord`,
 * `src/core/skills/framework/records.ts`), written as the core reads them into
 * `assets/core/<skill>.json`, each by its body's key (`bodyKey`: `workshop-fighter+toes`) beside the
 * records already there, and the bodies with one into `assets/core/<skill>.meta.json`. A row is
 * refused unless its settings are the skill's whole and valid. A search that tunes a skill on a
 * body writes its row through `writeRecord` (`research/skill-search.mjs`); by hand, a row is
 * written from a file of settings and says how they were made.
 *
 *   node research/skill-records.mjs <skill> <bodyKey> --made "<how it was made>" --settings <settings.json>
 *   node research/skill-records.mjs <skill> <bodyKey> --remove
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { validSitBack, validStepUp } from "../src/core/recovery/ground/step-up.ts";
import { STOMP_PATH, validStompTuning } from "../src/core/skills/strikes/stomp.ts";
import { faceFault, validStraightPunch } from "../src/core/skills/strikes/straight-punch.ts";
import { validSwing } from "../src/core/skills/strikes/swing.ts";
import { validRunCycle } from "../src/core/skills/locomotion/cycle-run.ts";
import { validWalkRun } from "../src/core/skills/locomotion/walk-run.ts";

/** Whether `settings` holds exactly `keys`. */
const whole = (settings, keys) => settings !== null && typeof settings === "object" && Object.keys(settings).sort().join() === [...keys].sort().join();

/** Each skill tuned per body: whether settings are its whole and valid. */
export const SKILLS = Object.freeze({
  stomp: (s) => whole(s, Object.keys(STOMP_PATH)) && validStompTuning(s),
  "step-up": validStepUp,
  "sit-back": validSitBack,
  "walk-run": (s) => whole(s, ["walk", "run"]) && validWalkRun(s.walk) && validRunCycle(s.run),
  "sword-thrust": (s) => s !== null && typeof s === "object" && validStraightPunch(s) && faceFault(s) === null,
  ...Object.fromEntries(["club-blow", "cut"].map((kind) => [kind, (s) => s !== null && typeof s === "object" && validSwing(s)])),
});

const pathOf = (skill) => `assets/core/${skill}`;

/** Every body's records of `skill`, as its file holds them now. */
export const recordsOf = (skill) => existsSync(`${pathOf(skill)}.json`) ? JSON.parse(readFileSync(`${pathOf(skill)}.json`, "utf8")) : {};

/** Write `skill`'s records and the bodies with one. */
function writeRecords(skill, records) {
  const sorted = Object.fromEntries(Object.keys(records).sort().map((body) => [body, records[body]]));
  writeFileSync(`${pathOf(skill)}.json`, `${JSON.stringify(sorted, null, 2)}\n`);
  writeFileSync(`${pathOf(skill)}.meta.json`, `${JSON.stringify({ bodies: Object.keys(sorted) })}\n`);
}

/** Write `body`'s record of `skill`: its `settings`, whole, and how they were `made`. */
export function writeRecord(skill, body, made, settings) {
  const valid = SKILLS[skill];
  if (!valid) throw new Error(`${skill} is no skill tuned per body: one of ${Object.keys(SKILLS).join(", ")}`);
  if (!made) throw new Error("a record says how it was made");
  if (!valid(settings)) throw new Error(`${body}'s ${skill}: its settings are not the skill's whole and valid`);
  writeRecords(skill, { ...recordsOf(skill), [body]: { made, settings } });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals: [skill, body] } = parseArgs({ options: { made: { type: "string" }, settings: { type: "string" }, remove: { type: "boolean" } }, allowPositionals: true });
  if (!skill || !body) throw new Error("usage: <skill> <bodyKey> --made <text> --settings <settings.json> | --remove");
  if (values.remove) {
    const { [body]: _, ...rest } = recordsOf(skill);
    writeRecords(skill, rest);
  } else writeRecord(skill, body, values.made, JSON.parse(readFileSync(values.settings, "utf8")));
  console.log(`${skill}: ${Object.keys(recordsOf(skill)).join(", ")}`);
}
