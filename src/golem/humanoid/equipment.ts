import { TERMINAL_FIST, TERMINAL_MACE, TERMINAL_MAUL, TERMINAL_PLATE, TERMINAL_WHIP } from "../config.ts";
import { bladeDefinition } from "../effectors/terminals/blade.ts";
import { fistDefinition } from "../effectors/terminals/fist.ts";
import { maceDefinition } from "../effectors/terminals/mace.ts";
import { maulDefinition } from "../effectors/terminals/maul.ts";
import { plateDefinition } from "../effectors/terminals/plate.ts";
import { whipDefinition } from "../effectors/terminals/whip.ts";
import type { EffectorTerminalDefinition, TerminalId } from "../module.ts";

// Equipment fitted for a human grip. Mass belongs to the terminal and therefore reaches
// both Havok and impact scoring; no post-construction mass override can leave them apart.
const fitted: Record<TerminalId, EffectorTerminalDefinition> = {
  blade: bladeDefinition(0.065),
  fist: fistDefinition({ ...TERMINAL_FIST, radius: 0.045, mass: 0.35 }),
  mace: maceDefinition({ ...TERMINAL_MACE, mass: 1.8, gripFromButt: 0.07, haftRadius: 0.012, limits: { ...TERMINAL_MACE.limits, rollMax: null, bendMax: 1.25 } }),
  maul: maulDefinition({ ...TERMINAL_MAUL, mass: 4.5, haftRadius: 0.012, trailingGripOffsetM: 0.12, limits: { ...TERMINAL_MAUL.limits, rollMax: 2.7, bendMax: 1.25 } }),
  plate: plateDefinition({ ...TERMINAL_PLATE, mass: 3.5, outboardOffset: 0.08, gripRadius: 0.012, limits: { ...TERMINAL_PLATE.limits, rollMax: null, bendMax: 1.25 } }),
  whip: whipDefinition({ ...TERMINAL_WHIP, segmentMass: 0.08, segmentRadius: 0.012, gripFromButt: 0.06 }),
};
export const humanEquipment = (terminal: EffectorTerminalDefinition): EffectorTerminalDefinition =>
  fitted[terminal.id];
