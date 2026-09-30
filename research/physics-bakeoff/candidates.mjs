/**
 * **Ranks each engine's passing settings by cost on the scaling scene**: 8 humans spaced and 8 in a
 * pile (`scaling`), median ms a step over two runs each, the controller included. The cheapest by
 * the sum is the setting `perf.mjs` runs. Node harness, one engine a process.
 *
 *     node research/physics-bakeoff/candidates.mjs <engine>
 */
import { load } from "./engines.mjs";
import { scaling } from "../../src/physics-bench/cases.ts";

const FEET = (k) => ({ "foot.left": k, "foot.right": k });
/** The settings that passed both cases at the `today` bar (`fidelity.mjs`), cheapest first by case A's cost. */
const CANDIDATES = {
  mujoco: [
    [{ substeps: 2, timeconst: 0.03 }],
    [{ substeps: 2, cone: "elliptic" }],
    [{ substeps: 2, solver: "Newton", iterations: 4, ls_iterations: 8 }],
    [{ substeps: 2, iterations: 1, ls_iterations: 4, timeconst: 0.04 }],
    [{ substeps: 2 }],
    // Fails case B's deviation mark; kept for comparison.
    [{ substeps: 1, timeconst: 0.03 }],
  ],
  rapier: [
    [{ substeps: 1, iterations: 16, pgs: 2 }, FEET(100)],
    [{ substeps: 2, iterations: 8, pgs: 2 }, FEET(100)],
    [{ substeps: 4, iterations: 4, pgs: 2 }, FEET(100)],
    [{ substeps: 2, iterations: 16, pgs: 1 }, FEET(100)],
  ],
};
CANDIDATES["rapier-simd"] = CANDIDATES.rapier;

const engine = process.argv[2];
const e = await load(engine);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
scaling(e.factory, { hz: 120, substeps: 1 }, "spaced", 2); // warm the JIT
const rows = [];
for (const [s, conditioning] of CANDIDATES[engine]) {
  const settings = { hz: 120, ...s };
  const cost = {};
  for (const kind of ["spaced", "pile"]) cost[kind] = median([0, 1].map(() => scaling(e.factory, settings, kind, 8, { conditioning }).total.median));
  rows.push({ settings, conditioning, ...cost, sum: cost.spaced + cost.pile });
  console.log(`${JSON.stringify(s)}${conditioning ? ` feet x${conditioning["foot.left"]}` : ""}: spaced ${cost.spaced.toFixed(3)} pile ${cost.pile.toFixed(3)} ms/step (8 humans)`);
}
