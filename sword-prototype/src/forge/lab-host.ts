import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

import { CONFIG } from "../config.ts";
import { populateConstructLabArena } from "../construct/lab-arena.ts";
import { prepareConstructBoutJob, runPreparedConstructLabJobInScene } from "../construct/lab-job.ts";
import type { ConstructLabRow } from "../construct/lab-report.ts";
import type { ConstructBoutJob } from "../construct/matchup.ts";
import type { SensorSpec } from "../construct/sensors.ts";
import { attachPhysics } from "../physics.ts";

/** One isolated browser solver world; it never contaminates the visible arena's body census. */
export async function runBrowserConstructLabJob(
  job: ConstructBoutJob,
  sensors: readonly SensorSpec[],
): Promise<ConstructLabRow> {
  const prepared = prepareConstructBoutJob(job, sensors);
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    attachPhysics(scene, await HavokPhysics({ locateFile: () => havokWasmUrl }));
    scene.getPhysicsEngine()?.setSubTimeStep(1000 / CONFIG.world.physicsHz);
    populateConstructLabArena(scene);
    return runPreparedConstructLabJobInScene(scene, job, prepared, sensors);
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

/** Small browser batches are serial and yield between jobs; the Node worker runner owns throughput. */
export async function runBrowserConstructLabBatch(
  jobs: readonly ConstructBoutJob[],
  sensors: readonly SensorSpec[],
  onCommitted?: (row: ConstructLabRow) => void,
): Promise<readonly ConstructLabRow[]> {
  const rows: ConstructLabRow[] = [];
  for (const job of jobs) {
    const row = await runBrowserConstructLabJob(job, sensors);
    rows.push(row);
    onCommitted?.(row);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return Object.freeze(rows);
}
