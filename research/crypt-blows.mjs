/**
 * What lands in a crypt run: the hero explores a generated level (`DungeonRun`, no visuals),
 * `--companions` Warriors following it, until the run ends or `--seconds` of it have passed, and
 * every blow of it is read as it lands.
 *
 *   node research/crypt-blows.mjs [--seeds 1,2,3,4] [--seconds 120] [--companions 0]
 *
 * It prints a row for each seed (how the run stood, its blows, the hit points they took), and
 * over all the seeds a row for each kind of meeting: an item on a body, a bare hand on a body,
 * two bodies with no hand or item between them, an item on an item. Each kind is counted again
 * for the blows in which a side was already out of the fight (down, or its pool ended) as the
 * blow landed, with what the sides still in it lost: a body on the floor is still a fighter to
 * the rule.
 */
import { parseArgs } from "node:util";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { DungeonRun } from "../src/dungeon/run.ts";
import { CORE_ENGINE, freshEngine } from "../tests/harness/core-stand.mjs";

const { values } = parseArgs({ options: { seeds: { type: "string", default: "1,2,3,4" }, seconds: { type: "string", default: "120" }, companions: { type: "string", default: "0" } } });
const seconds = Number(values.seconds), companions = Array.from({ length: Number(values.companions) }, () => "workshop-fighter");

const lost = (side) => side.wound?.taken.reduce((s, taken) => s + taken.hp, 0) ?? 0;
const hpOf = (blow) => blow.sides.reduce((sum, side) => sum + lost(side), 0);
const isHand = (side) => side.item === null && side.segment.startsWith("hand.");
/** What met in `blow`, by its two surfaces. */
function kindOf(blow) {
  const items = blow.sides.filter((side) => side.item !== null).length;
  if (items === 2) return "an item on an item";
  if (items === 1) return blow.sides.some(isHand) ? "an item on a bare hand" : "an item on a body";
  return blow.sides.some(isHand) ? "a bare hand on a body" : "two bodies, no hand or item";
}

async function played(seed) {
  const engine = new NullEngine(), scene = new Scene(engine), landed = [];
  let run = null;
  run = new DungeonRun(scene, {
    seed, engine: await freshEngine(), visuals: false, companions,
    onBlow: (blow) => {
      const alive = blow.sides.map((side) => run.actors.find((actor) => actor.id === side.fighter)?.alive ?? false);
      landed.push({ kind: kindOf(blow), energy: blow.energy, hp: hpOf(blow), out: alive.includes(false), living: blow.sides.reduce((sum, side, k) => sum + (alive[k] ? lost(side) : 0), 0) });
    },
  });
  run.commands.setMode({ keyboard: false, facing: true });
  const hz = run.world.hz;
  let steps = 0;
  for (let s = 0; s < seconds && run.status === "playing"; s++) { run.step(hz); steps += hz; }
  const row = { seed, status: run.status, seconds: steps / hz, built: run.actors.filter((a) => a.fighter).length, landed };
  run.dispose(); scene.dispose(); engine.dispose();
  return row;
}

console.log(`Node, a crypt run with no visuals, ${CORE_ENGINE}, 120 Hz; the hero exploring, ${companions.length} with it; to the run's end or ${seconds} s\n`);
console.log("| Seed | The run | Seconds | Bodies built | Blows | HP taken | Blows with a side out of the fight | HP they took |");
console.log("|---|---|---|---|---|---|---|---|");
const all = [];
for (const seed of values.seeds.split(",").map(Number)) {
  const r = await played(seed), out = r.landed.filter((blow) => blow.out);
  const sum = (some) => some.reduce((s, blow) => s + blow.hp, 0);
  console.log(`| ${r.seed} | ${r.status} | ${r.seconds} | ${r.built} | ${r.landed.length} | ${sum(r.landed).toFixed(3)} | ${out.length} | ${sum(out).toFixed(3)} |`);
  all.push(...r.landed);
}
console.log("\n| What met | Blows | Mean J | Most J | HP taken | With a side out of the fight: blows | HP | Of it, from a side still in the fight |");
console.log("|---|---|---|---|---|---|---|---|");
for (const kind of [...new Set(all.map((blow) => blow.kind))].sort()) {
  const some = all.filter((blow) => blow.kind === kind), out = some.filter((blow) => blow.out);
  const sum = (list, of) => list.reduce((s, blow) => s + of(blow), 0);
  console.log(`| ${kind} | ${some.length} | ${(sum(some, (b) => b.energy) / some.length).toFixed(2)} | ${Math.max(...some.map((b) => b.energy)).toFixed(1)} | ${sum(some, (b) => b.hp).toFixed(3)} | ${out.length} | ${sum(out, (b) => b.hp).toFixed(3)} | ${sum(out, (b) => b.living).toFixed(3)} |`);
}
