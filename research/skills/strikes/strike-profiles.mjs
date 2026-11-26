/**
 * **The strikes' profiles** (`src/skills/framework/profile/profile.ts`, `assets/skills/strikes/strike-profiles/strike-profiles.json`): from
 * the Strike drill's sparring rungs (`npm run evaluate -- strike <subject> --protocol sparring --json <run.json>`,
 * `sparring-laid` for a strike at a body lying, `sparring-feet` for a foot's at one standing, and `sparring-bite` for a bite at its legs), where each strike is thrown from starts drawn
 * at random against Option Mind fighting back. A profile says what a strike brings against a foe
 * that fights back, so no trial at a drill's still target makes one: how well a body throws a
 * strike there is another question, and a run of another rung is refused. Each
 * strike's trials are those on a mark its action aims at, with a limb
 * that throws it with what it holds (`strikesOf`). Sparring's starts drawn from another stream
 * (`DRAWS`: its twin, its training draws, its judge) measure the same rung, on another draw or ten
 * times the starts: a run of one is read as sparring is. A profile a skill and limb on a body, whatever it struck: its measured-on read
 * from each row's world (the left body's spec as the bout builds it, the skill's digest as the mind
 * holds it, the harness's rate and command delay (`harnessRule`), the recipe's sense delay, the rate
 * its mind decides at), each trial recording the right body as numbers (`Start.struck`); its trials those whose strike began (a trial
 * whose action never began measures the fight, not the strike). A strike no trial began has no
 * profile, and its mind prices it by hand.
 *
 * A trial's start (`Start`) is where the striker sensed the target as it began (the reading's
 * `foeAt` and `foePhase`): the range centre to centre, the target's phase and posture, the
 * striker's velocity against the target's (`foeAt.velocity`), and where it stood in its strike's
 * window (`inWindow`, absent where it was not in one), and how each body stood (`foeAt.stance`,
 * absent where the reading had none).
 *
 * What a trial brought: whether it landed; the life the rules take from the target for the
 * striker's touches on it, each segment's damage (`StrikeReading.dealt`) at that
 * segment's cost in life under the recipe's rules (`lifeFactor`), and the damage the striker took
 * over the trial; the seconds its action ran, from its start to its end, when its limb is free to
 * begin another (to the trial's end where it did not end); the seconds from its end until the limb
 * was back at its guard (`recovers`; null where it was not, or the record does not say); whether it
 * ended down; and the range head to head once its limb was back (`exit.range`), and how the two
 * stood apart centre to centre then against as it began: whether within `ARRIVED` of it
 * (`exit.stays`, 1 or 0), and where not, by how much (`exit.moved`, m, apart). A head at a strike's
 * end is leaning or struck, so a change head to head is not the bodies'; a trial of a record from
 * before the centre was read names neither, and is read as staying. A trial whose drill
 * let its strike go (`letGo`) prices letting go alone: the progress of the motion it was let go at
 * (the seconds from its start, to the step), the seconds from the let-go until the hand was back at
 * its guard (the trial's end where it was not), and the hit points the striker lost meanwhile.
 * A profile is of one limb, as one Option strikes with one (`limbAction`), and names it
 * (`Measured.limb`) beside its skill as the body holds it (`strikeSkill`). Where it came from
 * (`Origin`) is the digests of its body and of the action struck with that limb, the Minds that played its rows, both sides' (`Played`),
 * and its rows' commit and day where they share one (`RowOrigin`, each row's own), with whether a build input differed from that commit under any of them.
 *
 *   node --import ./tests/harness/preload-data.mjs research/skills/strikes/strike-profiles.mjs <run.json> ... [--write]
 *
 * `--write` puts the runs' profiles in the asset, each in place of the one measured on the same
 * body, skill and limb; the asset's others stay while a preset still throws their skill on a body
 * the game builds (`profileKeys`), so one skill is measured again without the rest. The asset names
 * the rungs its profiles were measured on (`source.protocols`): those of an asset that names a rung
 * not among these are not kept beside these.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { duelMinds, duelSpec, SIDES } from "../../../src/game/arena/duel.ts";
import { defaultMind } from "../../../src/app/catalog.ts";
import { playedBy, playedOnce } from "../profile-origin.mjs";
import { marksOf, strikeKey, strikesOf } from "./strike-keys.mjs";
import { letGoTrial, strikeTrial } from "../../../src/evaluation/strike/trial.ts";
import { harnessRule } from "../../../src/evaluation/results.ts";
import { profileKey, profileKeys } from "../../../tests/harness/profile-keys.mjs";
import { rulebook } from "../../../src/combat/rulebook.ts";
import { medianOf } from "../../../src/evaluation/stats.ts";
import { covers } from "../../../src/skills/framework/menu.ts";

const OUT = "assets/skills/strikes/strike-profiles/strike-profiles.json", SCRIPT = "research/skills/strikes/strike-profiles.mjs";
/** The Strike drill's rungs a profile is measured on: a strike thrown from drawn starts at a foe fighting back (`SPARRING`, `SPARRING_LAID`, `SPARRING_FEET`, `SPARRING_BITE`, `src/evaluation/strike/cases.ts`). */
const PROTOCOLS = Object.freeze(["sparring", "sparring-laid", "sparring-feet", "sparring-bite"]);
/** Sparring's starts drawn from its other streams (`SPARRING_TWIN`, `SPARRING_DRAWN`, `SPARRING_JUDGE`, and `SPARRING_STANCES`, each body square or staggered): the same rung on another draw, which a profile may be measured on in its place. */
const DRAWS = Object.freeze(["sparring-twin", "sparring-drawn", "sparring-judge", "sparring-stances"]);
const write = process.argv.includes("--write");
const paths = process.argv.slice(2).filter((arg) => arg !== "--write");
if (!paths.length) throw new Error(`name a run of the Strike drill's sparring: npm run evaluate -- strike <subject> --protocol ${PROTOCOLS.join("|")} --json <run.json>`);

/** A run's header and rows (`npm run evaluate -- ... --json`). */
const read = (path) => {
  const { header, cases } = JSON.parse(readFileSync(path, "utf8"));
  return [header, ...cases];
};
const round = (x) => Number(x.toFixed(4));

/** Each side's body's spec as the bout builds it (`duelSpec`): its character, the variations it holds, its attributes and its loadout; by what of the recipe it reads. */
const specs = new Map();
function specOf(recipe, side = "left") {
  const key = JSON.stringify([recipe[side], recipe.characters?.[side], recipe.attributes?.[side], recipe.steadiness?.[side], recipe.haste?.[side],
    recipe.skills?.[side], recipe.surfaces, recipe.loadouts?.[side]]);
  if (!specs.has(key)) specs.set(key, duelSpec(recipe, side));
  return specs.get(key);
}

const profiles = new Map();
for (const path of paths) {
  const [header, ...rows] = read(path);
  if (header.evaluation !== "strike" || !PROTOCOLS.includes(header.protocol) && !DRAWS.includes(header.protocol))
    throw new Error(`${path} is a run of ${header.evaluation} ${header.protocol}: a profile is measured on the Strike drill's sparring rungs, ${PROTOCOLS.join(" and ")}, or sparring's other draws, ${DRAWS.join(", ")}`);
  const rule = harnessRule(header.harness);
  if (!rule) throw new Error(`${path}: no rate in its harness, ${header.harness}`);
  const { hz, delay } = rule;
  for (const row of rows) {
    const recipe = row.world?.recipe, mind = recipe?.minds?.left, led = recipe?.commanders?.left;
    // The drill Commander's config: the skill it orders, and the limb.
    if (row.fault || !row.reading || row.world.kind !== "bout" || led?.kind !== "drill") continue;
    const spec = specOf(recipe), { executors, actions } = strikesOf(spec, mind);
    const action = actions.find((one) => executors.find((executor) => executor.name === one.executor)?.kind === led.skill);
    // A body that does not throw the action (a rung's other model) was refused it, and measures nothing.
    if (!action && row.reading.outcome === "refused" && row.reading.reason === "no such choice on its menu") continue;
    if (!action) throw new Error(`${path}: ${led.skill} is not a strike its body throws`);
    if (!action.effectors.includes(led.limb)) continue;
    const marks = marksOf(action);
    // A trial at a mark the action takes an order at (`covers`: the bite's `any` takes the legs).
    if (marks && !action.regions.some((region) => covers(region, { kind: "mark", mark: row.condition.mark }))) continue;
    const reaction = Math.round((recipe.senseDelay ?? 0) * hz) / hz;
    const struck = specOf(recipe, "right"), { measured, digests } = strikeKey(spec, mind, executors, action, led.limb, hz, reaction, delay);
    const key = JSON.stringify(measured);
    const profile = profiles.get(key) ?? { measured, label: `${spec.model} ${led.skill} with ${led.limb}`,
      digests, minds: new Set(), commits: new Set(), dates: new Set(), changed: false, trials: [] };
    profiles.set(key, profile);
    // The Minds that played the row, both sides' (`Played`).
    const minds = duelMinds(recipe, defaultMind);
    for (const side of SIDES) profile.minds.add(playedBy(specOf(recipe, side), minds[side]));
    profile.commits.add(row.from.commit);
    profile.dates.add(row.from.date.slice(0, 10));
    profile.changed ||= row.from.changed;
    const trial = led.letGo !== undefined ? letGoTrial(row.reading, { spec, struck, hz }) : strikeTrial(row.reading, { spec, struck, rules: rulebook("arena", recipe.rules) });
    if (trial) profile.trials.push(trial);
  }
}

// A strike no fight began has no profile: its mind prices it by hand.
for (const [key, profile] of profiles) if (!profile.trials.length) { console.log(`${profile.label}: begun in no fight, so it has no profile`); profiles.delete(key); }
const order = (a, b) => (a.start.postures?.target ?? "").localeCompare(b.start.postures?.target ?? "") || a.start.phase.localeCompare(b.start.phase) || a.start.range - b.start.range;
/** The one value of `values` that is known; undefined where they differ or none is. */
const shared = (values) => values.size === 1 ? [...values][0] ?? undefined : undefined;
const made = [...profiles.values()].map((profile) => {
  const commit = shared(profile.commits), date = shared(profile.dates);
  return { measured: profile.measured, from: { ...profile.digests, minds: playedOnce(profile.minds), ...(commit === undefined ? {} : { commit, changed: profile.changed }), ...(date === undefined ? {} : { date }) }, trials: [...profile.trials].sort(order) };
});
for (const profile of profiles.values()) {
  const m = profile.measured, run = profile.trials.filter((t) => !t.letGo), lets = profile.trials.length - run.length;
  console.log(`${profile.label} (${m.body}, ${m.skill} with ${m.limb}, ${m.hz} Hz${m.rate ? `, its mind at ${m.rate} Hz` : ""}${m.delay ? `, its command ${m.delay} steps late` : ""}, senses ${m.reaction} s late)`);
  if (!run.length) { console.log(`  no trial run; ${lets} let go`); continue; }
  const ranges = run.map((t) => t.start.range), closing = run.map((t) => t.start.velocity?.[0] ?? 0), across = run.map((t) => t.start.velocity?.[1] ?? 0);
  const ahead = run.map((t) => t.start.window?.[0] ?? 0), aside = run.map((t) => t.start.window?.[1] ?? 0);
  const recovered = run.filter((t) => t.recovers !== null).map((t) => t.recovers), seconds = run.map((t) => t.seconds), dealing = run.filter((t) => t.dealt > 0);
  const cycle = seconds.reduce((s, x) => s + x, 0) / seconds.length + (recovered.length ? recovered.reduce((s, x) => s + x, 0) / recovered.length : 0);
  console.log(`  ${run.length} trials run (${lets} let go): range ${Math.min(...ranges)} to ${Math.max(...ranges)} m, closing ${round(Math.min(...closing))} to ${round(Math.max(...closing))} m/s, across ${round(Math.min(...across))} to ${round(Math.max(...across))} m/s;`
    + ` in its window ${round(Math.min(...ahead))} to ${round(Math.max(...ahead))} m ahead, ${round(Math.min(...aside))} to ${round(Math.max(...aside))} m to its right;`
    + ` landed ${round(run.filter((t) => t.done).length / run.length)}, dealt ${round(dealing.length / run.length)} of them, down ${round(run.filter((t) => t.down).length / run.length)};`
    + ` run median ${round(medianOf(seconds))} s; recovers ${recovered.length ? `median ${round(medianOf(recovered))} s, ${round(Math.min(...recovered))} to ${round(Math.max(...recovered))} s, in ${recovered.length} of ${run.length}` : "recorded by none"}; cycle ${round(cycle)} s`);
}
if (write) {
  // Each of the asset's profiles keeps its place; one a run made again is replaced there, and the new follow.
  const keyOf = ({ measured }) => JSON.stringify(measured), current = profileKeys().strike;
  const named = (m) => `${m.body}, ${m.skill}${m.limb ? ` with ${m.limb}` : ""}`;
  const remade = new Map(made.map((profile) => [keyOf(profile), profile])), kept = [], asset = JSON.parse(readFileSync(OUT, "utf8"));
  // An asset measured on other rungs holds no profile to keep beside these; one measured on some of these rungs does.
  const measuredOnRungs = Array.isArray(asset.source?.protocols) && asset.source.protocols.every((protocol) => PROTOCOLS.includes(protocol));
  const others = measuredOnRungs ? asset.profiles : [];
  if (others.length < asset.profiles.length) console.log(`dropped: the asset's ${asset.profiles.length} profiles, measured on ${asset.source?.protocols?.join(" and ") ?? "a drill's targets"}, not on ${PROTOCOLS.join(" and ")}`);
  for (const profile of others) {
    const again = remade.get(keyOf(profile));
    remade.delete(keyOf(profile));
    if (again) kept.push(again);
    else if (current.has(profileKey(profile.measured))) kept.push(profile);
    else console.log(`dropped: ${named(profile.measured)}, which no preset throws now`);
  }
  writeFileSync(OUT, `${JSON.stringify({ source: { script: SCRIPT, protocols: PROTOCOLS }, profiles: [...kept, ...remade.values()] }, null, 2)}\n`);
}
