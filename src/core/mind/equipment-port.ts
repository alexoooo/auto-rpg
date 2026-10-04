import type { createEquipment } from "../equipment.ts";
import { deepFreeze } from "../state.ts";

type Equipment = ReturnType<typeof createEquipment>;
export type EquipmentObservation = ReturnType<Equipment["observe"]>;

/** A request on a grip the task has explicitly granted to this controller. */
export interface GripAction { readonly item: string; readonly grip: string; readonly attached: boolean }

/** Trusted host capability. A policy receives only its model and detached observations. */
export interface EquipmentPort {
  readonly model: readonly Equipment["model"][];
  observe(): readonly EquipmentObservation[];
  check(actions: readonly GripAction[]): readonly GripAction[];
  apply(actions: readonly GripAction[]): void;
}

/** Grant only named grips; duplicate item identities and duplicate grants are refused. */
export function equipmentPort(allowed: readonly { readonly item: Equipment; readonly grip: string }[]): EquipmentPort {
  const items = new Map<string, { item: Equipment; grips: Set<string> }>();
  for (const { item, grip } of allowed) {
    if (!item.model.grips.some((g) => g.name === grip)) throw new Error(`unknown equipment grip ${item.id}/${grip}`);
    const entry = items.get(item.id);
    if (entry && entry.item !== item) throw new Error(`duplicate item identity ${item.id}`);
    if (entry?.grips.has(grip)) throw new Error(`duplicate equipment grant ${item.id}/${grip}`);
    const record = entry ?? { item, grips: new Set<string>() };
    record.grips.add(grip); items.set(item.id, record);
  }
  const model = deepFreeze([...items.values()].map(({ item, grips }) => ({ ...item.model,
    grips: item.model.grips.filter((g) => grips.has(g.name)) })));
  return {
    model,
    observe() {
      return deepFreeze([...items.values()].map(({ item, grips }) => {
        const reading = item.observe();
        return { ...reading, grips: reading.grips.filter((g) => grips.has(g.name)) };
      }));
    },
    check(actions) {
      if (!Array.isArray(actions)) throw new Error("equipment actions must be an array");
      const used = new Map<string, Set<string>>();
      return deepFreeze(Array.from(actions, (action) => {
        if (!action || typeof action.item !== "string" || typeof action.grip !== "string" || typeof action.attached !== "boolean"
          || !items.get(action.item)?.grips.has(action.grip)) throw new Error("equipment action is not a granted grip");
        const grips = used.get(action.item) ?? new Set<string>();
        if (grips.has(action.grip)) throw new Error("duplicate equipment action");
        grips.add(action.grip); used.set(action.item, grips);
        return { item: action.item, grip: action.grip, attached: action.attached };
      }));
    },
    apply(actions) {
      for (const action of actions) {
        const item = items.get(action.item)!.item;
        if (action.attached) item.tryGrip(action.grip);
        else item.release(action.grip);
      }
    },
  };
}
