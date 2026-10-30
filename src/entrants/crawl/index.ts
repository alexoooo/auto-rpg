import type { Entrant } from "../../core/parts/entrant.ts";
import { QUADRUPED } from "../../core/mind/config.ts";
import { deepFreeze } from "../../core/state.ts";

/** **Crawl and bite**: the toolkit's quadruped as it starts, the reptile's default (`defaultMind`). */
export const CRAWL: Entrant = deepFreeze({ name: "crawl", presets: { crawl: { label: "Crawl and bite", config: QUADRUPED } } });
