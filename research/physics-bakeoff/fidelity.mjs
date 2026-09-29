/**
 * **The fidelity sweep**: cases A (the standing foot) and B (the forearm chain) of
 * `src/physics-bench/cases.ts` over a grid of each engine's settings, judged against
 * `thresholds.mjs`. Node, one engine a process, the shared controller at 120 Hz.
 *
 *     node research/physics-bakeoff/fidelity.mjs reference       # the fine references and Havok today
 *     node research/physics-bakeoff/fidelity.mjs havok|mujoco|rapier|rapier-simd
 *
 * Writes research/physics-bakeoff/results/fidelity-<engine>.json and prints one line a run.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { load } from "./engines.mjs";
import { deviation, forearmChain, standingFoot } from "../../src/physics-bench/cases.ts";
import { judgeA, judgeB, REFERENCE } from "./thresholds.mjs";

const HZ = 120;
const out = new URL("./results/", import.meta.url);
await mkdir(out, { recursive: true });

/** Each engine's grid: [case, settings, conditioning?]. */
function grid(engine) {
  const runs = [];
  const both = (s, cond = [1]) => { for (const c of cond) runs.push(["A", s, c]); runs.push(["B", s]); };
  switch (engine) {
    case "havok":
      for (const substeps of [1, 2, 4, 6, 8, 12, 16, 24, 32]) for (const damping of ["default", "zero"]) both({ hz: HZ, substeps, damping }, [1, 30, 100, 300, 1000]);
      break;
    case "mujoco":
      for (const substeps of [1, 2, 4]) {
        for (const solver of ["Newton", "CG", "PGS"]) for (const iterations of [1, 2, 4, 10, 100]) {
          both({ hz: HZ, substeps, solver, iterations, ls_iterations: Math.min(50, Math.max(4, iterations * 2)) });
        }
        for (const integrator of ["implicitfast", "implicit", "RK4"]) both({ hz: HZ, substeps, integrator });
        both({ hz: HZ, substeps, cone: "elliptic" });
        for (const timeconst of [0.01, 0.03, 0.04, 0.06]) both({ hz: HZ, substeps, timeconst });
        for (const iterations of [1, 2, 4]) both({ hz: HZ, substeps, iterations, ls_iterations: 4, timeconst: 0.04 });
      }
      break;
    case "rapier":
    case "rapier-simd":
      for (const substeps of [1, 2, 4, 8, 16]) for (const iterations of [1, 2, 4, 8, 16]) for (const pgs of [1, 2]) both({ hz: HZ, substeps, iterations, pgs }, [1, 100]);
      // The contacts' softness (Rapier's `contact_natural_frequency`), stiffer than its default.
      for (const substeps of [1, 2, 4, 8]) for (const iterations of [4, 8]) for (const contactHz of [60, 120, 240]) both({ hz: HZ, substeps, iterations, contactHz }, [1, 100]);
      // Multibody last: its leg panics inside the wasm (`unreachable`), which may leave the module unusable.
      if (engine === "rapier") for (const substeps of [1, 4, 16]) both({ hz: HZ, substeps, joints: "multibody" });
      break;
    default: throw new Error(`unknown engine ${engine}`);
  }
  return runs;
}

const fmt = (x) => (typeof x === "number" ? +x.toPrecision(3) : x);
const line = (r) => Object.entries(r).filter(([k]) => k !== "elbow").map(([k, v]) => `${k}=${fmt(v)}`).join(" ");

const which = process.argv[2];
if (which === "reference") {
  // The references: every engine at 16 sub-steps (1920 Hz); MuJoCo's is the reference elbow series.
  const results = {};
  for (const name of ["mujoco", "rapier", "havok"]) {
    const e = await load(name);
    const s = { hz: HZ, substeps: 16 };
    results[name] = { A: standingFoot(e.factory, s), B: forearmChain(e.factory, s) };
    console.log(line(results[name].A)); console.log(line(results[name].B));
  }
  const ref = results.mujoco.B.elbow;
  for (const name of ["rapier", "havok"]) console.log(`${name} 1920 Hz elbow deviation from MuJoCo 1920 Hz: ${fmt(deviation(results[name].B.elbow, ref, HZ))} rad`);
  // Havok today: 120 Hz, one step, Havok's default damping; foot x100 for case A.
  const hv = await load("havok");
  const today = { hz: HZ, substeps: 1, damping: "default" };
  const a = standingFoot(hv.factory, today, 100), b = forearmChain(hv.factory, today);
  console.log("Havok today:", line(a)); console.log("Havok today:", line(b), `deviation=${fmt(deviation(b.elbow, ref, HZ))}`);
  await writeFile(new URL("reference.json", out), JSON.stringify({ settings: REFERENCE, elbow: ref, results: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { A: v.A, B: { ...v.B, elbow: undefined } }])),
    today: { A: a, B: { ...b, elbow: undefined, deviation: deviation(b.elbow, ref, HZ) } } }, null, 1));
} else {
  const ref = JSON.parse(await readFile(new URL("reference.json", out), "utf8")).elbow;
  const e = await load(which);
  const rows = [];
  for (const [kind, settings, cond] of grid(which)) {
    let row;
    try {
      if (kind === "A") {
        const r = standingFoot(e.factory, settings, cond);
        row = { kind, settings, cond, ...r, ...judgeA(r) };
      } else {
        const r = forearmChain(e.factory, settings);
        const dev = deviation(r.elbow, ref, HZ);
        row = { kind, settings, ...r, elbow: undefined, deviation: dev, ...judgeB({ ...r, deviation: dev }) };
      }
    } catch (err) {
      row = { kind, settings, cond, label: `${which} ${JSON.stringify(settings)}`, error: String(err?.message ?? err).slice(0, 200), today: false, clean: false };
    }
    rows.push(row);
    console.log(line(row));
  }
  await writeFile(new URL(`fidelity-${which}.json`, out), JSON.stringify({ engine: which, initMs: e.initMs, rows }, null, 1));
}
