import records from "./data/stance-calibration.json" with { type: "json" };
import { deepFreeze } from "../core/world/state.ts";
import type { StanceTuning } from "../control/stance-tuning.ts";

const calibrations: Readonly<Record<string, { readonly settings: StanceTuning }>> = deepFreeze(records);

/** The stock motor calibration also identifies recovery records measured with that motor. */
export const stanceCalibration = (body: string): StanceTuning | undefined => calibrations[body]?.settings;
