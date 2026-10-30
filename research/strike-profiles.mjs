/**
 * **The strikes' profiles** (`src/core/mind/profile.ts`, `assets/core/strike-profiles.json`): from
 * Strike drill records (`assets/evaluations/strike/`, and the baseline's punch rows, whose `rung`
 * names theirs), each strike's trials thrown from rest at a gap, on a mark its action aims at, with
 * a limb that throws it with what it holds (`armedActions`). A profile a skill on a body against a
 * target: its measured-on read from each row's world (the left
 * body's spec as the bout builds it, the skill's digest as the mind holds it, the harness's rate,
 * the recipe's sense delay), its target the right body's; a cell a range, the target's phase as
 * the striker sensed it where its trial began (the reading's `foePhase`; a trial with none never
 * reached the drill) and its posture then (`foeAt.posture`, `ProfileCell.postures`; standing in a
 * record from before the reading held it). A target standing is at its condition's gap; one down,
 * at the range the striker sensed it at then, centre to centre (`foeAt.apart`), to the nearest 0.1 m. A record that does not hold that phase is refused: its rung is played again. The `walk`
 * rung is left out: the range it was asked at is not recorded.
 * A trial whose drill lets its strike go (`letGo`) counts only toward its cell's cost of letting go,
 * at the progress of the motion it was let go at (the seconds from its start, to the step).
 *
 * A cell's trials: the share that landed; the hit points the rules took from the target in every
 * contact of the striker's on it (`StrikeContact.damage`), and those the striker lost in them; the seconds from the first step the
 * strike could be thrown to its end, over the trials that could (a cell with none, the trials'
 * own length); the share that ended down; and the range head to head where its strike ended
 * (`exit.range`), over the trials whose strike did. Its cost of letting go, by progress, over the trials
 * let go there: the seconds from the let-go until the hand was back at its guard (the trial's end
 * where it was not), and the hit points the striker lost meanwhile.
 *
 *   node --import ./tests/harness/preload-data.mjs research/strike-profiles.mjs [<record.jsonl> ...] [--write]
 *
 * With none named, the records the profiles name now.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { EMPTY_LOADOUT, withLoadout } from "../src/core/items/held.ts";
import { resolveCharacter } from "../src/core/models.ts";
import { partIn, partLookup } from "../src/core/mind/catalog.ts";
import { armedActions } from "../src/core/mind/action-config.ts";
import { measuredOn, skillDigest, specDigest } from "../src/core/mind/profile.ts";
import { bodyKey } from "../src/core/spec/body.ts";

const OUT = "assets/core/strike-profiles.json", SCRIPT = "research/strike-profiles.mjs";
const write = process.argv.includes("--write");
const named = process.argv.slice(2).filter((arg) => arg !== "--write");
const paths = named.length ? named : JSON.parse(readFileSync(OUT, "utf8")).source.records;

/** A record's header and rows. */
const read = (path) => readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
const round = (x) => Number(x.toFixed(4));

/** Each side's body's spec, by its recipe's model, attributes and loadout: as the bout resolves it (no surfaces, haste or balance in a drill's recipe). */
const specs = new Map();
function specOf(recipe, side = "left") {
  for (const key of ["surfaces", "haste", "balance"]) if (recipe[key] !== undefined) throw new Error(`a drill recipe with ${key} is not read here`);
  const loadout = recipe.loadouts?.[side] ?? EMPTY_LOADOUT, key = JSON.stringify([recipe[side], recipe.attributes?.[side] ?? {}, loadout]);
  if (!specs.has(key)) specs.set(key, withLoadout(resolveCharacter({ model: recipe[side], attributes: recipe.attributes?.[side] ?? {} }).spec, loadout));
  return specs.get(key);
}

/** The marks `action` aims at, or null where it aims at other regions too. */
const marksOf = (action) => (action.regions ?? []).every((region) => region.kind === "mark") ? action.regions.map((region) => region.mark) : null;

const profiles = new Map();
for (const path of paths) {
  const [header, ...rows] = read(path);
  if (header.evaluation !== "strike" && header.evaluation !== "baseline") throw new Error(`${path} is no record of the Strike drill or the baseline`);
  const hz = Number(/(\d+) Hz/.exec(header.harness)?.[1]);
  if (!Number.isFinite(hz)) throw new Error(`${path}: no rate in its harness, ${header.harness}`);
  for (const row of rows) {
    const rung = row.condition.rung ?? header.protocol, recipe = row.world?.recipe, mind = recipe?.minds?.left, drill = partIn(mind, "drill");
    if (row.fault || !row.reading || row.world.kind !== "bout" || drill?.kind !== "drill" || rung === "walk") continue;
    const spec = specOf(recipe), actions = armedActions(partLookup, spec, mind.executors, mind.actions), action = actions.find((one) => one.name === drill.action);
    if (!action) throw new Error(`${path}: ${drill.action} is not an action its body throws`);
    if (!action.effectors.includes(drill.effector)) continue;
    const marks = marksOf(action);
    if (marks && !marks.includes(row.condition.mark)) continue;
    const reaction = Math.round((recipe.senseDelay ?? 0) * hz) / hz;
    const struck = specOf(recipe, "right"), target = { body: bodyKey(struck), spec: specDigest(struck) };
    const measured = measuredOn(spec, skillDigest(partLookup, mind.executors, action), hz, reaction), key = JSON.stringify([measured, target]);
    const profile = profiles.get(key) ?? { measured, target, label: `${spec.model} ${drill.action} on ${struck.model}`, records: new Set(), cells: new Map() };
    profiles.set(key, profile);
    profile.records.add(path);
    if (row.reading.foePhase === undefined) throw new Error(`${path}: no foePhase in its readings; play its rung again`);
    const phase = row.reading.foePhase;
    if (phase === null) continue;
    const posture = row.reading.foeAt?.posture ?? "standing", range = posture === "standing" ? row.condition.gap : Math.round(row.reading.foeAt.apart * 10) / 10;
    const cellKey = JSON.stringify([range, phase, posture]);
    const cell = profile.cells.get(cellKey) ?? { range, phase, posture, trials: 0, done: 0, dealt: 0, taken: 0, timed: 0, seconds: 0, length: 0, down: 0, ranged: 0, exitRange: 0, lets: new Map() };
    profile.cells.set(cellKey, cell);
    const r = row.reading;
    if (drill.letGo !== undefined) {
      if (r.letGo) {
        const progress = Math.round((r.letGo.at - r.began) * hz) / hz, at = cell.lets.get(progress) ?? { n: 0, seconds: 0, taken: 0 };
        cell.lets.set(progress, at);
        at.n++; at.seconds += (r.letGo.again ?? r.seconds) - r.letGo.at; at.taken += r.letGo.opening;
      }
      continue;
    }
    cell.trials++;
    if (r.outcome === "landed") cell.done++;
    for (const contact of r.contacts) cell.dealt += contact.damage;
    cell.taken += r.taken ?? 0;
    if (r.down) cell.down++;
    if (r.exit) { cell.ranged++; cell.exitRange += r.exit.range; }
    if (r.ready !== null && r.ended !== null) { cell.timed++; cell.seconds += r.ended - r.ready; }
    cell.length += (r.ended ?? r.seconds) - r.handed;
  }
}

const out = { source: { script: SCRIPT, records: paths }, profiles: [...profiles.values()].map((profile) => ({ measured: profile.measured, target: profile.target,
  cells: [...profile.cells.values()].filter((c) => c.trials > 0).sort((a, b) => a.posture.localeCompare(b.posture) || a.phase.localeCompare(b.phase) || a.range - b.range).map((c) => ({
    range: c.range, phase: c.phase, trials: c.trials, done: round(c.done / c.trials), dealt: round(c.dealt / c.trials), taken: round(c.taken / c.trials),
    seconds: round(c.timed ? c.seconds / c.timed : c.length / c.trials), down: round(c.down / c.trials), ends: [], ...(c.ranged ? { exit: { range: round(c.exitRange / c.ranged) } } : {}),
    ...(c.posture === "standing" ? {} : { postures: { own: "standing", target: c.posture } }),
    ...(c.lets.size ? { letGo: [...c.lets].sort(([a], [b]) => a - b).map(([progress, at]) => ({ progress: round(progress), seconds: round(at.seconds / at.n), taken: round(at.taken / at.n) })) } : {}) })) })) };
for (const [i, profile] of [...profiles.values()].entries()) {
  console.log(`${profile.label} (${profile.measured.body}, spec ${profile.measured.spec}, skill ${profile.measured.skill}, ${profile.measured.hz} Hz, senses ${profile.measured.reaction} s late)`);
  for (const c of out.profiles[i].cells) console.log(`  ${c.postures ? `${c.postures.target} ` : ""}${c.phase} ${c.range} m: ${c.trials} trials, landed ${c.done}, dealt ${c.dealt} HP, taken ${c.taken} HP, ${c.seconds} s, down ${c.down}${c.letGo ? `; let go: ${c.letGo.map((at) => `at ${at.progress} s, ${at.seconds} s, taken ${at.taken} HP`).join("; ")}` : ""}`);
  for (const c of profile.cells.values()) if (c.trials === 0) console.log(`  ${c.phase} ${c.range} m: let go ${[...c.lets.values()].reduce((n, at) => n + at.n, 0)} times, no trial thrown: left out`);
}
if (write) writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
