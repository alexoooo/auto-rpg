import { REPTILE_CRAWL } from "../shared/quadruped/tuning.ts";
import { pawGaitPart } from "../shared/quadruped/parts.ts";
import { crawl, validCrawl } from "./paw-crawl/crawl.ts";

/** **The crawl** as a gait (`pawGaitPart`): the quadruped's close and careful steps. */
export const CRAWL_PART = pawGaitPart({ kind: "paw-crawl", label: "Crawl", gait: "crawl", settings: REPTILE_CRAWL, valid: validCrawl, make: crawl });

declare module "../shared/quadruped/parts.ts" {
  interface PawGaitConfigs {
    readonly "paw-crawl": PawGaitConfig<"paw-crawl", typeof REPTILE_CRAWL>;
  }
}
