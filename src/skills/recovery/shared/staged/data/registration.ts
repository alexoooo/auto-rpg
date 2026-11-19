import { bodyRecord } from "../../../../framework/records.ts";
import { stanceCalibration } from "../../../../locomotion/shared/stance/calibration.ts";
import type { DataLoader, DataLoaders } from "../../../../../core/data/store.ts";

/**
 * A staged per-body record loader: a body's identity is its row (`bodyRecord`) with the stance
 * calibration its record was measured under (`stanceCalibration`), where its body has one.
 */
function stagedRecords(load: () => Promise<unknown>): DataLoader {
  return Object.assign(load, {
    identity(data: unknown, body: string) {
      const record = bodyRecord(data, body), calibration = stanceCalibration(body);
      return calibration === undefined ? record : { record, calibration };
    },
  });
}

/** The staged rise's per-body records. */
export const STAGED_DATA = {
  "step-up": stagedRecords(() => import("./step-up.ts").then((m) => m.STEP_UP_RECORDS)),
  "sit-back": stagedRecords(() => import("./sit-back.ts").then((m) => m.SIT_BACK_RECORDS)),
} satisfies DataLoaders;
