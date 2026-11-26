/** A character's configurable capabilities, before its model turns them into sourced anatomy. */
export interface CharacterAttributes {
  readonly size: number;
  readonly weight: number;
  readonly strength: number;
  readonly speed: number;
  readonly hp: number;
  readonly steadiness: number;
  readonly haste: number;
  /** How late it sees every other body, s (`AttributeSpec.reaction`). */
  readonly reaction: number;
}

export type AttributeOverrides = Readonly<Partial<CharacterAttributes>>;
export type AttributeName = keyof CharacterAttributes;
/** The physical attribute keys, in declaration order. */
export const ATTRIBUTE_NAMES = Object.freeze(["size", "weight", "strength", "speed", "hp", "steadiness", "haste", "reaction"] as const);

/** Why an attribute's value cannot build a character; null for a valid value. */
export function attributeError(name: AttributeName, value: unknown): string | null {
  const label = name === "hp" ? "Hit points" : name[0]!.toUpperCase() + name.slice(1);
  if (typeof value !== "number" || !Number.isFinite(value)) return `${label} must be a finite number.`;
  switch (name) {
    case "steadiness": return value >= 0 ? null : "Steadiness must be zero or greater.";
    case "haste": return value > -100 ? null : "Haste must be greater than −100 %.";
    case "reaction": return value >= 0 && value <= 1 ? null : "Reaction must be from 0 to 1 s.";
    case "size": case "weight": case "strength": case "speed": case "hp":
      return value > 0 ? null : `${label} must be greater than zero.`;
    default: { const never: never = name; throw new Error(`unknown attribute ${String(never)}`); }
  }
}

/** Why supplied attributes cannot build a character, including malformed programmatic keys. */
export function attributesError(attributes: AttributeOverrides): string | null {
  if (typeof attributes !== "object" || attributes === null || Array.isArray(attributes)) return "Attributes must be a record.";
  for (const [name, value] of Object.entries(attributes)) {
    if (!ATTRIBUTE_NAMES.some((known) => known === name)) return `Unknown attribute: ${name}`;
    if (value === undefined) continue;
    const error = attributeError(name as AttributeName, value);
    if (error) return error;
  }
  return null;
}
