import { prepareConstructBoutJob, runPreparedConstructLabJobInScene } from "../src/construct/lab-job.ts";
import { WARDEN_SENSORS } from "../src/construct/warden.ts";
import { createConstructHeadlessArena } from "./construct-headless-arena.mjs";

export async function runConstructBoutJob(job, options = {}) {
  const prepared = prepareConstructBoutJob(job, WARDEN_SENSORS, options);
  const arena = await createConstructHeadlessArena();
  try {
    return runPreparedConstructLabJobInScene(arena.scene, job, prepared, WARDEN_SENSORS, options);
  } finally {
    arena.dispose();
  }
}
