/**
 * **Case C: one whole human on both feet, 10 s** (`standingHuman`), under each chosen setting
 * (`src/physics-bench/chosen.ts`) and the 16-sub-step references. An observation with no bar: it
 * says whether the humans the scaling tables time are standing. Node harness.
 *
 *     node research/physics-bakeoff/case-c.mjs
 */
import { writeFileSync } from "node:fs";
import { load } from "./engines.mjs";
import { standingHuman } from "../../src/physics-bench/cases.ts";
import { CHOSEN } from "../../src/physics-bench/chosen.ts";

const FEET = (k) => ({ "foot.left": k, "foot.right": k });
const rows = [
  ...CHOSEN,
  ...CHOSEN.filter((c) => c.engine === "mujoco").map((c) => ({ ...c, tag: `${c.tag} x100`, conditioning: FEET(100) })),
  { engine: "mujoco", tag: "mujoco-16", settings: { hz: 120, substeps: 16 } },
  { engine: "mujoco", tag: "mujoco-16 x100", settings: { hz: 120, substeps: 16 }, conditioning: FEET(100) },
  { engine: "rapier", tag: "rapier-16", settings: { hz: 120, substeps: 16 } },
  { engine: "rapier", tag: "rapier-16 x100", settings: { hz: 120, substeps: 16 }, conditioning: FEET(100) },
];
const engines = new Map();
const out = [];
for (const r of rows) {
  if (!engines.has(r.engine)) engines.set(r.engine, await load(r.engine));
  const res = standingHuman(engines.get(r.engine).factory, r.settings, r.conditioning, 10);
  out.push({ tag: r.tag, settings: r.settings, conditioning: r.conditioning ?? null, ...res });
  console.log(`${r.tag.padEnd(20)} com ${res.comAtHalf.toFixed(3)} -> ${res.comAtEnd.toFixed(3)} m, drift ${res.comDrift.toFixed(1)} mm, max speed after 1 s ${res.maxSpeedLate.toFixed(2)} m/s`);
}
writeFileSync(new URL("./results/case-c.json", import.meta.url), JSON.stringify({ harness: `Node ${process.version}`, rows: out }, null, 2) + "\n");
