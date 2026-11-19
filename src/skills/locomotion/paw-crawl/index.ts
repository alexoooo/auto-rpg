import { REPTILE_CRAWL } from "../shared/quadruped/tuning.ts";
import { pawGaitPart } from "../shared/quadruped/parts.ts";
import { crawl, validCrawl } from "./paw-crawl/crawl.ts";

/** **The crawl** as a gait (`pawGaitPart`): the quadruped's close and careful steps. */
export const CRAWL_PART = pawGaitPart({ kind: "paw-crawl", label: "Crawl",
  // A paw print.
  icon: "M12 11.5a5 4.2 0 0 1 0 8.4a5 4.2 0 0 1 0-8.4ZM5.5 8a2 2 0 0 1 0 4a2 2 0 0 1 0-4ZM9.5 3.8a2 2 0 0 1 0 4a2 2 0 0 1 0-4ZM14.5 3.8a2 2 0 0 1 0 4a2 2 0 0 1 0-4ZM18.5 8a2 2 0 0 1 0 4a2 2 0 0 1 0-4Z",
  gait: "crawl", settings: REPTILE_CRAWL, valid: validCrawl, make: crawl });

declare module "../shared/quadruped/parts.ts" {
  interface PawGaitConfigs {
    readonly "paw-crawl": PawGaitConfig<"paw-crawl", typeof REPTILE_CRAWL>;
  }
}
