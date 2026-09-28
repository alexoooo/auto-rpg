import { TERMINAL_FIST } from "../config.ts";
import { bladeDefinition } from "../effectors/terminals/blade.ts";
import { fistDefinition } from "../effectors/terminals/fist.ts";
import { humanShield } from "./shield.ts";
import type { EffectorTerminalDefinition, TerminalId } from "../module.ts";

// Equipment fitted for a human grip. Mass belongs to the terminal and therefore reaches
// both Havok and impact scoring; no post-construction mass override can leave them apart.
// A human carries a sword, a shield, a bow or nothing: the mace, maul and whip went with the
// legacy human on 2026-09-27.
type Carried = Extract<TerminalId, "blade" | "plate" | "fist">;
const labels: Record<Carried | "bow", string> = { bow: "Bow (two hands)", blade: "Arming sword", plate: "Heater shield", fist: "Empty hand" };
const fitted: Record<Carried, EffectorTerminalDefinition> = {
  blade: bladeDefinition(0.065),
  fist: fistDefinition({ ...TERMINAL_FIST, radius: 0.045, mass: 0.35 }),
  plate: humanShield,
};
const carried = (id: TerminalId): id is Carried => Object.hasOwn(fitted, id);
export const humanEquipment = (terminal: EffectorTerminalDefinition): EffectorTerminalDefinition => {
  if (terminal.id === "bow") return terminal;
  if (!carried(terminal.id)) throw new Error(`A human does not carry ${terminal.id}`);
  return { ...fitted[terminal.id], label: labels[terminal.id], attachment: terminal.id === "plate" ? "forearm" : "hand",
    partRole: terminal.id === "fist" ? "body" : "equipment",
    ...(terminal.id === "fist" ? { appearance: "human" as const } : {}) };
};
