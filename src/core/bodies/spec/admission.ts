import type { Refused } from "../../refusal.ts";
import { isRefused } from "../../refusal.ts";
import type { Quantity } from "./quantity.ts";

type Value = Quantity["value"];

/** Check authored rules under supplied source values before constructing the resulting anatomy. */
export function quantityAdmission(root: object, sourceValue: (quantity: Quantity) => Value | undefined,
  accept: (quantity: Quantity, value: Value) => string | null): Refused | null {
  const values = new Map<Quantity, Value>(), seen = new Set<object>();
  const evaluate = (quantity: Quantity): Value | Refused => {
    const known = values.get(quantity);
    if (known !== undefined) return known;
    const provenance = quantity.provenance;
    let value: Value;
    if (provenance.kind === "source") value = sourceValue(quantity) ?? quantity.value;
    else {
      const inputs: Value[] = [];
      for (const input of provenance.inputs) {
        const read = evaluate(input);
        if (isRefused(read)) return read;
        inputs.push(read);
      }
      const invalid = provenance.admit?.(...inputs as never[]);
      if (invalid) return { refused: invalid };
      if (!provenance.compute) throw new Error(`an authored rule has no computation: ${provenance.rule}`);
      value = provenance.compute(...inputs as never[]);
    }
    const name = provenance.kind === "derived" ? provenance.rule : `${provenance.source} ${provenance.where}`;
    if (!(typeof value === "number" ? Number.isFinite(value) : value.every(Number.isFinite))) return { refused: `${name} is outside finite numeric representation` };
    const invalid = accept(quantity, value);
    if (invalid) return { refused: invalid };
    values.set(quantity, value);
    return value;
  };
  const visit = (value: unknown): Refused | null => {
    if (value === null || typeof value !== "object" || seen.has(value)) return null;
    seen.add(value);
    if ("unit" in value && "value" in value && "provenance" in value) {
      const result = evaluate(value as Quantity);
      return isRefused(result) ? result : null;
    }
    for (const item of Object.values(value)) {
      const invalid = visit(item);
      if (invalid) return invalid;
    }
    return null;
  };
  return visit(root);
}
