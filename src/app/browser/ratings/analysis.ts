/**
 * **What the Ratings screen derives from results**: minds on common ground from a contest's
 * standings, and a condition as text. No DOM; results come from `results.ts`.
 */
import type { Json } from "../../../evaluation/evaluation.ts";
import type { Standing } from "../../../evaluation/results.ts";
import { mean } from "../../../evaluation/stats.ts";

/** An entrant id's mind and kit, `mind/character/left,right`; null for an id of another shape. */
function entrantParts(id: string): { readonly mind: string; readonly kit: string } | null {
  const parts = id.split("/");
  return parts.length === 3 ? { mind: parts[0]!, kit: `${parts[1]}/${parts[2]}` } : null;
}

/** Two minds on common ground: the mean of the first's entrants' ratings less the second's over the kits both have, and how many kits. */
interface CommonGround {
  readonly minds: readonly string[];
  /** By the row mind, then the column mind; null where they share no kit. */
  readonly cells: readonly (readonly ({ readonly difference: number; readonly kits: number } | null)[])[];
}

/** The minds of the entrants in `standings`, each pair compared on the kits both have, never averaged over the rest. */
export function commonGround(standings: readonly Standing[]): CommonGround {
  const rating = new Map<string, Map<string, number>>();
  for (const one of standings) {
    const parts = entrantParts(one.id);
    if (!parts) continue;
    if (!rating.has(parts.mind)) rating.set(parts.mind, new Map());
    rating.get(parts.mind)!.set(parts.kit, one.rating);
  }
  const minds = [...rating.keys()].sort((a, b) => mean([...rating.get(b)!.values()]) - mean([...rating.get(a)!.values()]));
  const cells = minds.map((row) => minds.map((column) => {
    if (row === column) return null;
    const mine = rating.get(row)!, theirs = rating.get(column)!, kits = [...mine.keys()].filter((kit) => theirs.has(kit));
    return kits.length ? { difference: mean(kits.map((kit) => mine.get(kit)! - theirs.get(kit)!)), kits: kits.length } : null;
  }));
  return { minds, cells };
}

/** A condition field's value as text: a number or text as it is, an object by its values. */
export function fieldText(value: Json | undefined): string {
  if (value === undefined || value === null) return "none";
  if (typeof value !== "object") return String(value);
  return (Array.isArray(value) ? value : Object.values(value)).map((one) => fieldText(one as Json)).join(",");
}

/** A case's condition as text, field by field. */
export const conditionText = (condition: Json): string => condition !== null && typeof condition === "object" && !Array.isArray(condition)
  ? Object.entries(condition).map(([key, value]) => `${key} ${fieldText(value)}`).join(", ") : fieldText(condition);
