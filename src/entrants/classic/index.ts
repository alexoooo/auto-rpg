import type { Entrant } from "../../core/parts/entrant.ts";
import { deepFreeze } from "../../core/state.ts";
import { BEHAVIOURS, CLASSIC as CLASSIC_FIGHTER, COUNTER_PUNCHER, DUELLIST, PUNCHER } from "./presets.ts";

/** **The classic fighters**: the toolkit's fighter configured; the Duellist is every humanoid's default (`defaultMind`). */
export const CLASSIC: Entrant = deepFreeze({
  name: "classic",
  presets: {
    classic: { label: "Classic fighter", config: CLASSIC_FIGHTER, offered: false },
    puncher: { label: "Puncher", config: PUNCHER },
    counter: { label: "Counter-puncher", config: COUNTER_PUNCHER, offered: false },
    behaviours: { label: "Behaviours", config: BEHAVIOURS, offered: false },
    duellist: { label: "Duellist", config: DUELLIST },
  },
});
