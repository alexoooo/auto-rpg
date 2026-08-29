import { CONFIG } from "../config.ts";
import { canonicalIntegrityJson, integrityDigest, type IntegrityValue } from "./integrity.ts";
import type { SensorSpec } from "./sensors.ts";
import { WARDEN_SENSORS } from "./warden.ts";

export const CONSTRUCT_LAB_ARENA_DIGEST = "construct-null-arena-v1";
export const CONSTRUCT_LAB_BOUT_CAP_STEPS = 60 * CONFIG.world.physicsHz;
export const CONSTRUCT_STUCK_WINDOW_STEPS = Math.round(0.5 * CONFIG.world.physicsHz);
export const CONSTRUCT_LAB_RUNTIME_DIGEST = integrityDigest(canonicalIntegrityJson({
  protocol: 2,
  rowSchema: 1,
  matchupSchema: 2,
  babylon: "9.18.1",
  havok: "1.3.14",
  nodeEngine: ">=22.13.0",
}));

export const constructLabSensorDigest = (sensors: readonly SensorSpec[]): string =>
  integrityDigest(canonicalIntegrityJson([...sensors].sort((a, b) => a.id.localeCompare(b.id)) as unknown as IntegrityValue));

export function constructLabConfigDigest(
  boutCapSteps = CONSTRUCT_LAB_BOUT_CAP_STEPS,
  sensors: readonly SensorSpec[] = WARDEN_SENSORS,
): string {
  return integrityDigest(canonicalIntegrityJson({
    boutCapSteps,
    gravityMps2: CONFIG.world.gravity,
    physicsHz: CONFIG.world.physicsHz,
    separationM: CONFIG.fighter.separation,
    runtimeDigest: CONSTRUCT_LAB_RUNTIME_DIGEST,
    sensorDigest: constructLabSensorDigest(sensors),
  }));
}
