import { variationFault, variedMake, type Varied } from "../../framework/variations.ts";
import type { ReadBody, ReadSegment } from "../../../core/bodies/read-body.ts";
import { REPTILE_CRAWL } from "../shared/quadruped/tuning.ts";
import { deepFreeze } from "../../../core/state.ts";
import { fitsPaws } from "../../../control/quadruped/fit.ts";
import { type PawGaitPart } from "../shared/quadruped/parts.ts";
import type { PawReading } from "../../../control/quadruped/paws.ts";
import { crawl, validCrawl } from "./paw-crawl/crawl.ts";

/** **The crawl**'s config: research settings over `REPTILE_CRAWL`, none in the game. */
interface CrawlConfig extends Varied { readonly kind: "paw-crawl"; readonly tuning?: Partial<typeof REPTILE_CRAWL> }

/** The crawl's variations: the crawl. */
const VARIATIONS = {
  "paw-crawl"(built: ReadBody, root: ReadSegment, reading: PawReading, paws: readonly string[], config: CrawlConfig) {
    const settings = { ...REPTILE_CRAWL, ...config.tuning }, skill = crawl(built, root, reading, paws, settings);
    // A paw's step takes its settle, its shift, its swing and its plant; each paw steps once a stride, and a heading turns a yaw step a stride. It steps any way.
    const stride = paws.length * (settings.settle + settings.shift + settings.swing + settings.plant);
    const reach = { forward: settings.stride / stride, aside: 1, turn: settings.yawStep / stride };
    return { state: skill.state, settings, reach, travel: { speed: reach.forward, stopping: reach.forward / stride }, resume: skill.resume, command: skill.command };
  },
};

/** **The crawl** as a gait: the quadruped's close and careful steps. */
export const CRAWL_PART = deepFreeze<PawGaitPart<CrawlConfig>>({
  role: "paw-gait", label: "Crawl", stage: "game", fields: [], slots: [], defaults: { kind: "paw-crawl" }, keys: { kind: true, variation: true, tuning: true },
  tuning: Object.keys(REPTILE_CRAWL), fits: (spec, config) => variationFault("paw-crawl", "crawl", VARIATIONS)(spec, config)
    ?? fitsPaws(spec) ?? (validCrawl({ ...REPTILE_CRAWL, ...config.tuning }) ? null : "invalid crawl settings"),
  faults: (config: CrawlConfig) => config.tuning === undefined || !!config.tuning && typeof config.tuning === "object" && !Array.isArray(config.tuning)
    && validCrawl({ ...REPTILE_CRAWL, ...config.tuning }) ? [] : ["invalid crawl settings"],
  make: variedMake("paw-crawl", VARIATIONS, (built, _root, _reading, _paws, config) => [built.spec, config]),
  skillGroup: "Travel", variations: Object.keys(VARIATIONS),
});

declare module "../shared/quadruped/parts.ts" {
  interface PawGaitConfigs {
    readonly "paw-crawl": CrawlConfig;
  }
}
