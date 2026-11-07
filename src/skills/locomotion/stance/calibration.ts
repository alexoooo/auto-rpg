import records from "../../../../assets/skills/locomotion/stance/stance-calibration.json" with { type: "json" };
import { deepFreeze } from "../../../core/state.ts";
import type { StanceTuning } from "../../../control/stance/stance-tuning.ts";

const calibrations: Readonly<Record<string, { readonly settings: StanceTuning }>> = deepFreeze(records);

/** The stock motor calibration also identifies recovery records measured with that motor. */
export const stanceCalibration = (body: string): StanceTuning | undefined => calibrations[body]?.settings;
