import { skillsOf } from "../../../src/minds/option/skills.ts";
/**
 * **The strikes' profiles** (`src/skills/framework/profile.ts`, `assets/skills/strikes/strike-profiles/strike-profiles.json`): from
 * the Strike drill's sparring rungs (`npm run evaluate -- strike <subject> --protocol sparring --json <run.json>`,
 * and `sparring-laid` for a strike at a body lying), where each strike is thrown from starts drawn
 * at random against Option Mind fighting back. A profile says what a strike brings against a foe
 * that fights back, so no trial at a drill's still target makes one: how well a body throws a
 * strike there is another question, and a run of another rung is refused. Each
 * strike's trials are those on a mark its action aims at, with a limb
 * that throws it with what it holds (`strikesOf`). A profile a skill on a body against a target: its measured-on read
 * from each row's world (the left body's spec as the bout builds it, the skill's digest as the mind
 * holds it, the harness's rate and command delay (`harnessRule`), the recipe's sense delay, the rate
 * its mind decides at), its target the right body's; its trials those whose strike began (a trial
 * whose action never began measures the fight, not the strike). A strike no trial began has no
 * profile, and its mind prices it by hand.
 *
 * A trial's start (`Start`) is where the striker sensed the target as it began (the reading's
 * `foeAt` and `foePhase`): the range centre to centre, the target's phase and posture, the
 * striker's velocity against the target's (`foeAt.velocity`), and where it stood in its strike's
 * window (`inWindow`); each absent in a record from before the reading held it. A profile keeps
 * the trials that record the most of their start alone: fresh trials replace the older. A record
 * that does not hold the phase is refused: its rung is played again.
 *
 * What a trial brought: whether it landed; the life the rules take from the target for the
 * striker's touches on it, each segment's damage (`StrikeReading.dealt`) at that
 * segment's cost in life under the recipe's rules (`lifeFactor`), and the damage the striker took
 * over the trial; the seconds its action ran, from its start to its end, when its limb is free to
 * begin another (to the trial's end where it did not end); the seconds from its end until the limb
 * was back at its guard (`recovers`; null where it was not, or the record does not say); whether it
 * ended down; and the range head to head once its limb was back (`exit.range`). A trial whose drill
 * let its strike go (`letGo`) prices letting go alone: the progress of the motion it was let go at
 * (the seconds from its start, to the step), the seconds from the let-go until the hand was back at
 * its guard (the trial's end where it was not), and the hit points the striker lost meanwhile.
 * A profile is of one limb, as one Option strikes with one (`limbAction`): its skill's digest is
 * of the action struck with that limb, and it names the limb (`Profile.limbs`).
 *
 *   node --import ./tests/harness/preload-data.mjs research/skills/strikes/strike-profiles.mjs <run.json> ... [--write]
 *
 * `--write` puts the runs' profiles in the asset, each in place of the one measured on the same
 * body, skill and target; the asset's others stay while a preset still throws their skill on a body
 * the game builds (`profileKeys`), so one skill is measured again without the rest. The asset names
 * the rungs its profiles were measured on (`source.protocols`): those of an asset that names others
 * are not kept beside these.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { duelSpec } from "../../../src/game/arena/duel.ts";
import { partIn, partLookup } from "../../../src/app/catalog.ts";
import { limbAction } from "../../../src/minds/option/kinds.ts";
import { measuredOn, skillDigest, specDigest } from "../../../src/skills/framework/profile.ts";
import { everyOf } from "../../../src/minds/decider.ts";
import { harnessRule } from "../../../src/evaluation/results.ts";
import { profileKeys } from "../../../tests/harness/profile-keys.mjs";
import { lifeFactor } from "../../../src/combat/pool.ts";
import { rulebook } from "../../../src/combat/rulebook.ts";

const OUT = "assets/skills/strikes/strike-profiles/strike-profiles.json", SCRIPT = "research/skills/strikes/strike-profiles.mjs";
/** The Strike drill's rungs a profile is measured on: a strike thrown from drawn starts at a foe fighting back (`SPARRING`, `SPARRING_LAID`, `src/evaluation/strike/cases.ts`). */
const PROTOCOLS = Object.freeze(["sparring", "sparring-laid"]);
const write = process.argv.includes("--write");
const paths = process.argv.slice(2).filter((arg) => arg !== "--write");
if (!paths.length) throw new Error(`name a run of the Strike drill's sparring: npm run evaluate -- strike <subject> --protocol ${PROTOCOLS.join("|")} --json <run.json>`);

/** A run's header and rows (`npm run evaluate -- ... --json`). */
const read = (path) => {
  const { header, cases } = JSON.parse(readFileSync(path, "utf8"));
  return [header, ...cases];
};
const round = (x) => Number(x.toFixed(4));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length ? s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 : null; };

/** Each side's body's spec as the bout builds it (`duelSpec`): its character, the variations it holds, its attributes and its loadout; by what of the recipe it reads. */
const specs = new Map();
function specOf(recipe, side = "left") {
  const key = JSON.stringify([recipe[side], recipe.characters?.[side], recipe.attributes?.[side], recipe.balance?.[side], recipe.haste?.[side],
    recipe.skills?.[side], recipe.surfaces, recipe.loadouts?.[side]]);
  if (!specs.has(key)) specs.set(key, duelSpec(recipe, side));
  return specs.get(key);
}

/**
 * **The strikes a record's `mind` throws on a body of `spec`**, its executors and their actions: as
 * its Options name them (`skillsOf`), or, in a record whose mind lists its executors and actions,
 * those the body can use, each on the limbs its executor strikes with as the body holds what it holds.
 */
function strikesOf(spec, mind) {
  if (Array.isArray(mind.options) && !mind.executors) return skillsOf(partLookup, spec, mind.options);
  const executors = mind.executors.filter((executor) => partLookup.of("executor", executor).fits(spec, executor, partLookup) === null);
  const has = (limb) => spec.effectors?.some((one) => one.segment === limb) ?? false;
  return { executors, actions: (mind.actions ?? []).flatMap((action) => {
    const executor = executors.find((one) => one.name === action.executor);
    if (!executor) return [];
    const part = partLookup.of("executor", executor), effectors = action.effectors.filter((limb) => has(limb) && (part.strikesWith?.(spec, executor, limb) ?? true));
    return effectors.length === action.effectors.length ? [action] : effectors.length ? [{ ...action, effectors }] : [];
  }) };
}

/** The marks `action` aims at, or null where it aims at other regions too. */
const marksOf = (action) => (action.regions ?? []).every((region) => region.kind === "mark") ? action.regions.map((region) => region.mark) : null;

const profiles = new Map();
for (const path of paths) {
  const [header, ...rows] = read(path);
  if (header.evaluation !== "strike" || !PROTOCOLS.includes(header.protocol))
    throw new Error(`${path} is a run of ${header.evaluation} ${header.protocol}: a profile is measured on the Strike drill's sparring rungs, ${PROTOCOLS.join(" and ")}`);
  const rule = harnessRule(header.harness);
  if (!rule) throw new Error(`${path}: no rate in its harness, ${header.harness}`);
  const { hz, delay } = rule;
  for (const row of rows) {
    const recipe = row.world?.recipe, mind = recipe?.minds?.left, led = recipe?.commanders?.left;
    // The drill Commander's config (naming its skill, or, in a record from before orders named skills, its action), or, in a record from before it, the drill's tactics in the mind.
    const drill = led?.kind === "drill" ? { kind: "drill", skill: led.skill, action: led.action, effector: led.limb, letGo: led.letGo } : partIn(mind, "drill");
    if (row.fault || !row.reading || row.world.kind !== "bout" || drill?.kind !== "drill") continue;
    const spec = specOf(recipe), { executors, actions } = strikesOf(spec, mind);
    const action = actions.find((one) => drill.skill === undefined ? one.name === drill.action : executors.find((executor) => executor.name === one.executor)?.kind === drill.skill);
    // A body that does not throw the action (a rung's other model) was refused it, and measures nothing.
    if (!action && row.reading.outcome === "refused" && row.reading.reason === "no such choice on its menu") continue;
    if (!action) throw new Error(`${path}: ${drill.skill ?? drill.action} is not a strike its body throws`);
    if (!action.effectors.includes(drill.effector)) continue;
    const limbed = limbAction(action, drill.effector), marks = marksOf(action);
    if (marks && !marks.includes(row.condition.mark)) continue;
    const reaction = Math.round((recipe.senseDelay ?? 0) * hz) / hz;
    const struck = specOf(recipe, "right"), target = { body: struck.model, spec: specDigest(struck) };
    const measured = measuredOn(spec, skillDigest(partLookup, spec, executors, limbed), hz, reaction, hz / everyOf(mind.rate, hz), delay), key = JSON.stringify([measured, target]);
    const profile = profiles.get(key) ?? { measured, target, label: `${spec.model} ${drill.skill ?? drill.action} with ${drill.effector} on ${struck.model}`, effectors: limbed.effectors, limbs: new Set(), trials: [] };
    profiles.set(key, profile);
    profile.limbs.add(drill.effector);
    const r = row.reading;
    if (r.foePhase === undefined) throw new Error(`${path}: no foePhase in its readings; play its rung again`);
    if (r.foePhase === null || r.foeAt === null || r.began === null) continue;
    const posture = r.foeAt.posture ?? "standing";
    const start = { range: round(r.foeAt.apart), phase: r.foePhase, ...(posture === "standing" ? {} : { postures: { own: "standing", target: posture } }),
      ...(r.foeAt.velocity ? { velocity: r.foeAt.velocity.map(round) } : {}), ...(r.inWindow ? { window: r.inWindow.map(round) } : {}) };
    if (drill.letGo !== undefined) {
      // Past its point of no return, a strike is not let go: such a trial prices nothing.
      if (r.letGo) profile.trials.push({ start, done: false, dealt: 0, taken: round(r.taken ?? 0), seconds: round((r.ended ?? r.seconds) - r.began), recovers: null, down: r.down,
        letGo: { progress: round(Math.round((r.letGo.at - r.began) * hz) / hz), seconds: round((r.letGo.again ?? r.seconds) - r.letGo.at), taken: round(r.letGo.opening) } });
      continue;
    }
    const rules = rulebook("arena", recipe.rules);
    let dealt = 0;
    for (const [on, damage] of Object.entries(r.dealt)) dealt += damage * lifeFactor(rules, struck, on);
    profile.trials.push({ start, done: r.outcome === "landed", dealt: round(dealt), taken: round(r.taken ?? 0), seconds: round((r.ended ?? r.seconds) - r.began),
      recovers: r.recovers === undefined || r.recovers === null ? null : round(r.recovers), down: r.down, ...(r.exit ? { exit: { range: round(r.exit.range) } } : {}) });
  }
}

/** How much of its start a trial records: its velocity, and where it stood in its window. */
const recorded = (trial) => (trial.start.velocity ? 1 : 0) + (trial.start.window ? 1 : 0);
// A strike no fight began has no profile: its mind prices it by hand.
for (const [key, profile] of profiles) if (!profile.trials.length) { console.log(`${profile.label}: begun in no fight, so it has no profile`); profiles.delete(key); }
for (const profile of profiles.values()) {
  const most = Math.max(...profile.trials.map(recorded));
  profile.trials = profile.trials.filter((trial) => recorded(trial) === most);
}
const order = (a, b) => (a.start.postures?.target ?? "").localeCompare(b.start.postures?.target ?? "") || a.start.phase.localeCompare(b.start.phase) || a.start.range - b.start.range;
const made = [...profiles.values()].map((profile) => ({ measured: profile.measured, target: profile.target,
  limbs: profile.effectors.filter((limb) => profile.limbs.has(limb)), trials: [...profile.trials].sort(order) }));
for (const profile of profiles.values()) {
  const m = profile.measured, run = profile.trials.filter((t) => !t.letGo), lets = profile.trials.length - run.length;
  console.log(`${profile.label} (${m.body}, spec ${m.spec}, skill ${m.skill}, ${m.hz} Hz${m.rate ? `, its mind at ${m.rate} Hz` : ""}${m.delay ? `, its command ${m.delay} steps late` : ""}, senses ${m.reaction} s late)`);
  if (!run.length) { console.log(`  no trial run; ${lets} let go`); continue; }
  const ranges = run.map((t) => t.start.range), closing = run.map((t) => t.start.velocity?.[0] ?? 0), across = run.map((t) => t.start.velocity?.[1] ?? 0);
  const ahead = run.map((t) => t.start.window?.[0] ?? 0), aside = run.map((t) => t.start.window?.[1] ?? 0);
  const recovered = run.filter((t) => t.recovers !== null).map((t) => t.recovers), seconds = run.map((t) => t.seconds), dealing = run.filter((t) => t.dealt > 0);
  const cycle = seconds.reduce((s, x) => s + x, 0) / seconds.length + (recovered.length ? recovered.reduce((s, x) => s + x, 0) / recovered.length : 0);
  console.log(`  ${run.length} trials run (${lets} let go): range ${Math.min(...ranges)} to ${Math.max(...ranges)} m, closing ${round(Math.min(...closing))} to ${round(Math.max(...closing))} m/s, across ${round(Math.min(...across))} to ${round(Math.max(...across))} m/s;`
    + ` in its window ${round(Math.min(...ahead))} to ${round(Math.max(...ahead))} m ahead, ${round(Math.min(...aside))} to ${round(Math.max(...aside))} m to its right;`
    + ` landed ${round(run.filter((t) => t.done).length / run.length)}, dealt ${round(dealing.length / run.length)} of them, down ${round(run.filter((t) => t.down).length / run.length)};`
    + ` run median ${round(median(seconds))} s; recovers ${recovered.length ? `median ${round(median(recovered))} s, ${round(Math.min(...recovered))} to ${round(Math.max(...recovered))} s, in ${recovered.length} of ${run.length}` : "recorded by none"}; cycle ${round(cycle)} s`);
}
if (write) {
  // Each of the asset's profiles keeps its place; one a run made again is replaced there, and the new follow.
  const keyOf = (profile) => JSON.stringify([profile.measured, profile.target]), current = profileKeys().strike;
  const remade = new Map(made.map((profile) => [keyOf(profile), profile])), kept = [], asset = JSON.parse(readFileSync(OUT, "utf8"));
  // An asset measured on other rungs holds no profile to keep beside these.
  const measuredOnRungs = JSON.stringify(asset.source?.protocols ?? null) === JSON.stringify(PROTOCOLS);
  const others = measuredOnRungs ? asset.profiles : [];
  if (others.length < asset.profiles.length) console.log(`dropped: the asset's ${asset.profiles.length} profiles, measured on ${asset.source?.protocols?.join(" and ") ?? "a drill's targets"}, not on ${PROTOCOLS.join(" and ")}`);
  for (const profile of others) {
    const again = remade.get(keyOf(profile));
    remade.delete(keyOf(profile));
    if (again) kept.push(again);
    else if (current.has(`${profile.measured.body} ${profile.measured.spec} ${profile.measured.skill}`)) kept.push(profile);
    else console.log(`dropped: ${profile.measured.body} (spec ${profile.measured.spec}), skill ${profile.measured.skill}, which no preset throws now`);
  }
  writeFileSync(OUT, `${JSON.stringify({ source: { script: SCRIPT, protocols: PROTOCOLS }, profiles: [...kept, ...remade.values()] }, null, 2)}\n`);
}
