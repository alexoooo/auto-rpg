import { isQuantity, type FromSource, type Quantity } from "./quantity.ts";

/**
 * Walking a spec's provenance: which quantities it holds, which numbers it holds bare, and which
 * sources each quantity finally rests on.
 */

interface SpecInventory {
  /** Every quantity in the tree, by its path (`segments.3.mass`). */
  readonly quantities: ReadonlyMap<string, Quantity>;
  /** The paths of numbers found outside a quantity: each is a number with no provenance. */
  readonly bare: readonly string[];
}

/**
 * Every quantity in `tree` by path, and every number not inside one. A quantity's own inputs are
 * not listed here; `sourcesOf` follows them.
 */
export function inventory(tree: unknown): SpecInventory {
  const quantities = new Map<string, Quantity>();
  const bare: string[] = [];
  const visit = (node: unknown, path: string): void => {
    if (typeof node === "number" || typeof node === "bigint") { bare.push(path); return; }
    if (typeof node !== "object" || node === null) return;
    if (isQuantity(node)) { quantities.set(path, node); return; }
    for (const [key, child] of Object.entries(node)) visit(child, path ? `${path}.${key}` : key);
  };
  visit(tree, "");
  return { quantities, bare };
}

/** The sourced quantities `quantity` rests on, through every derivation. */
export function sourcesOf(quantity: Quantity): ReadonlySet<Quantity & { readonly provenance: FromSource }> {
  const leaves = new Set<Quantity & { readonly provenance: FromSource }>();
  const seen = new Set<Quantity>();
  const visit = (q: Quantity): void => {
    if (seen.has(q)) return;
    seen.add(q);
    if (q.provenance.kind === "source") leaves.add(q as Quantity & { readonly provenance: FromSource });
    else for (const input of q.provenance.inputs) visit(input);
  };
  visit(quantity);
  return leaves;
}

/** Every derivation `quantity` passes through, itself included when it is one. */
export function derivationsOf(quantity: Quantity): readonly Quantity[] {
  const out: Quantity[] = [];
  const seen = new Set<Quantity>();
  const visit = (q: Quantity): void => {
    if (seen.has(q) || q.provenance.kind !== "derived") return;
    seen.add(q);
    out.push(q);
    for (const input of q.provenance.inputs) visit(input);
  };
  visit(quantity);
  return out;
}
