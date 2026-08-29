import type { Scene } from "@babylonjs/core/scene.js";

import { parseSavedConstruct, type SavedConstruct } from "./codec.ts";
import { runConstructLabBout } from "./lab-runner.ts";
import type { ConstructLabRow } from "./lab-report.ts";
import { canonicalConstructMatchupJson, constructMatchupDigest, type ConstructBoutJob } from "./matchup.ts";
import type { SensorSpec } from "./sensors.ts";
import { constructLabConfigDigest } from "./lab-config.ts";

export interface PreparedConstructBoutJob {
  readonly left: SavedConstruct;
  readonly right: SavedConstruct;
}

/** The page and Node hosts cross the same saved-bytes and matchup-identity boundary. */
export function prepareConstructBoutJob(
  job: ConstructBoutJob,
  sensors: readonly SensorSpec[],
): PreparedConstructBoutJob {
  if (constructMatchupDigest(job.matchup) !== job.matchupDigest) {
    throw new Error(`construct job ${job.index} matchup digest changed before solver work`);
  }
  if (job.matchup.configDigest !== constructLabConfigDigest(job.matchup.boutCapSteps, sensors)) {
    throw new Error(`construct job ${job.index} Lab runtime/schema/sensor config digest is stale`);
  }
  canonicalConstructMatchupJson(job.matchup);
  const left = parseSavedConstruct(job.leftSavedJson, sensors);
  const right = parseSavedConstruct(job.rightSavedJson, sensors);
  for (const [side, saved, identity] of [["left", left, job.matchup.left],
    ["right", right, job.matchup.right]] as const) {
    for (const key of ["blueprint", "control", "program"] as const) {
      const field = `${key}Digest` as const;
      if (saved.digests[key] !== identity[field]) {
        throw new Error(`construct job ${job.index} ${side} ${key} digest does not match matchup identity`);
      }
    }
  }
  return Object.freeze({ left, right });
}

export function runPreparedConstructLabJobInScene(
  scene: Scene,
  job: ConstructBoutJob,
  prepared: PreparedConstructBoutJob,
  sensors: readonly SensorSpec[],
): ConstructLabRow {
  return runConstructLabBout(scene, job, prepared.left, prepared.right, sensors);
}
