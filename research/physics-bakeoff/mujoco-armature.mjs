/**
 * **MuJoCo's pile, and the armature that holds it.** In the scaling pile (`layoutOf("pile")`)
 * MuJoCo at the chosen setting blows up when the second layer lands: a light freedom's speed runs
 * to 1e5 rad/s and MuJoCo's automatic reset (BADQVEL) puts the whole world back to its start. It
 * does so with no control at all, so it is not the controller's. Rotor inertia on every hinge
 * (MuJoCo's `armature`, solver conditioning, not anatomy) holds it. This measures what the armature
 * costs in fidelity (cases A, B, C, judged as `fidelity.mjs` judges) and whether the pile then
 * holds: resets counted by MuJoCo's warning counters over a controlled pile. Node harness.
 *
 *     node research/physics-bakeoff/mujoco-armature.mjs
 *
 * Writes `results/mujoco-armature.json`.
 */
import { readFile, writeFile } from "node:fs/promises";
import { load } from "./engines.mjs";
import { deviation, forearmChain, scaling, standingFoot, standingHuman } from "../../src/physics-bench/cases.ts";
import { humanModel, placed } from "../../src/physics-bench/model.ts";
import { judgeA, judgeB } from "./thresholds.mjs";

const out = new URL("./results/", import.meta.url);
const ref = JSON.parse(await readFile(new URL("reference.json", out), "utf8")).elbow;
const e = await load("mujoco");
const cond = { "foot.left": 100, "foot.right": 100 };
const human = humanModel();

/** Warning changes (BADQVEL, BADQACC) over a controlled pile of `humans`: each is a reset of the world. */
function pileResets(settings, humans) {
  let changes = 0;
  const r = scaling(e.factory, settings, "pile", humans, {
    conditioning: cond,
    build: (offsets) => {
      const sim = e.factory({ models: offsets.map((o) => placed(human, o)), ground: true, conditioning: cond }, settings);
      let prev = 0;
      return {
        ...sim,
        step() {
          sim.step();
          const n = sim.data.warning.get(5).number + sim.data.warning.get(6).number;
          if (n !== prev) { changes++; prev = n; }
        },
      };
    },
  });
  return { humans, resets: changes, upright: r.upright, maxSpeed: r.maxSpeed };
}

const rows = [];
/** The settings tried: the chosen MuJoCo row with each armature, then finer steps with the smallest that passes. */
const TRIED = [{}, { armature: 0.0001 }, { armature: 0.001 }, { armature: 0.003 }, { armature: 0.01 },
  { substeps: 4, armature: 0.001 }, { substeps: 2, armature: 0.002 }, { substeps: 4, armature: 0.002 }];
for (const extra of TRIED) {
  const settings = { hz: 120, substeps: 2, ...extra };
  const a = standingFoot(e.factory, settings, 1);
  const b = forearmChain(e.factory, settings);
  const dev = deviation(b.elbow, ref, 120);
  const c = standingHuman(e.factory, settings, cond, 10);
  const piles = [16, 32, 64].map((n) => pileResets(settings, n));
  const row = {
    settings,
    A: { footSpinRms: a.footSpinRms, footTiltMaxLate: a.footTiltMaxLate, comDrift: a.comDrift, ...judgeA(a) },
    B: { handJitterRms: b.handJitterRms, wristJitterRms: b.wristJitterRms, ringRms: b.ringRms, deviation: dev, ...judgeB({ ...b, deviation: dev }) },
    C: c,
    piles,
  };
  rows.push(row);
  console.log(JSON.stringify(extra), `A today=${row.A.today} clean=${row.A.clean}`, `B dev=${dev.toFixed(4)} hand=${b.handJitterRms.toExponential(1)} today=${row.B.today} clean=${row.B.clean}`,
    `C drift=${c.comDrift.toFixed(1)} mm end=${c.comAtEnd.toFixed(3)}`, `pile resets ${piles.map((p) => `${p.humans}:${p.resets}`).join(" ")}`);
}
await writeFile(new URL("mujoco-armature.json", out), JSON.stringify({ harness: `Node ${process.version}`, rows }, null, 1));
process.exit(0);
