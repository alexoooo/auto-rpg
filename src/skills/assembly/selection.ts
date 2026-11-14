import type { PartConfig } from "../../parts/parts.ts";
import { skillName } from "../framework/variations.ts";

/** Name lookup and switching shared by continuous repertoires; their adapters own the saved state. */
export function controllerSelection<T, View = void>({ role, configs, controllers, state, resume, enter }: {
  readonly role: string;
  readonly configs: readonly PartConfig[];
  readonly controllers: readonly T[];
  readonly state: { selected: number };
  readonly resume?: (controller: T, view: View) => void;
  readonly enter?: (controller: T) => void;
}) {
  const names = configs.map(skillName), current = () => controllers[state.selected];
  return {
    current,
    select(name: string | undefined, view: View) {
      if (name === undefined) return;
      const index = names.indexOf(name);
      if (index < 0) throw new Error(`${role} ${name} is not selected`);
      if (index === state.selected) return;
      const previous = current();
      if (previous !== undefined) resume?.(previous, view);
      state.selected = index;
      const next = controllers[index]!;
      resume?.(next, view); enter?.(next);
    },
  };
}
