import { CONFIG } from "../src/config.ts";
import { runConstructWarriorBout } from "./construct-warrior-bout.mjs";

export function runCombinedArmsQualificationBout(job, options = {}) {
  return runConstructWarriorBout({ saved: job.saved, sensors: job.definition.sensors,
    warriorPolicy: "duelist", warriorSeed: job.seed, constructSide: job.constructSide,
    warriorLoadout: job.warriorLoadout,
    maxSteps: options.maxSteps ?? CONFIG.world.physicsHz * 30 });
}
