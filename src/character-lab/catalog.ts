export type CharacterId = "fighter" | "rogue";
export type WeaponId = "empty" | "sword" | "shield" | "sword-shield" | "bow";
export type PoseId = "inspection" | "loop";
export interface Loadout { boots: boolean; armour: boolean; weapon: WeaponId }

/** The workshop's characters, in the order the page counts them. `armour` is what the page calls each one's. */
export const CHARACTERS = {
  fighter: {
    name: "The Fighter", asset: "fighter.glb", armour: "Plate armour",
    defaults: { boots: true, armour: true, weapon: "sword-shield" },
  },
  rogue: {
    name: "The Rogue", asset: "rogue.glb", armour: "Leather armour",
    defaults: { boots: true, armour: false, weapon: "bow" },
  },
} as const;

/** What can be in the hands. `groups` are the mesh groups a choice shows: a mesh is named `<group>__<part>`. */
export const WEAPONS: Record<WeaponId, { label: string; groups: readonly string[]; note: string }> = {
  empty: { label: "Empty hands", groups: [], note: "Unarmed" },
  sword: { label: "Sword", groups: ["sword"], note: "Right: sword" },
  shield: { label: "Shield", groups: ["shield"], note: "Left: shield" },
  "sword-shield": {
    label: "Sword & shield", groups: ["sword", "shield"],
    note: "Right: sword · Left: shield",
  },
  bow: { label: "Bow", groups: ["bow"], note: "Two-handed" },
};

/** Whether the mesh `name` is shown with `kit`. The shield's forearm strap has a cut for a bare sleeve and one
 * for a bracer. */
export function visiblePart(name: string, kit: Loadout): boolean {
  const shown = WEAPONS[kit.weapon].groups;
  if (name.startsWith("shield__forearm_strap_")) {
    return shown.includes("shield") && name.endsWith(kit.armour ? "_armour" : "_cloth");
  }
  const group = name.split("__")[0];
  switch (group) {
    case "base": return true;
    case "bare": return !kit.boots;
    case "boots": return kit.boots;
    case "armour": return kit.armour;
    default: return shown.includes(group);
  }
}

/** The hand whose grip the page inspects with `weapon`: the one that holds it, and the sword's when both are full. */
export function gripHand(weapon: WeaponId): "l" | "r" {
  switch (weapon) {
    case "empty": case "sword": case "sword-shield": return "r";
    case "shield": case "bow": return "l";
    default: { const never: never = weapon; throw new Error(`Unknown weapon: ${String(never)}`); }
  }
}

export const clipFor = (pose: PoseId, kit: Loadout): string => `${pose}-${kit.weapon}`;
