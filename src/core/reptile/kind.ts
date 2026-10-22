import { QUADRUPED, type QuadrupedConfig } from "../mind/config.ts";
import { controller, NO_POSTURE } from "../mind/controller.ts";
import { fitsWhen } from "../mind/parts.ts";
import { deepFreeze } from "../state.ts";
import { quadrupedFits, quadrupedMind } from "./mind.ts";
import { REPTILE_BITE, REPTILE_CRAWL, REPTILE_MOTOR, REPTILE_TRAVEL, REPTILE_TROT } from "./tuning.ts";

/** **The quadruped** (`quadrupedMind`): crawling, biting and righting itself on four paws. */
export const QUADRUPED_MIND = controller<QuadrupedConfig>({
  role: "mind", label: "Quadruped", stage: "game", fields: [], slots: [], defaults: QUADRUPED, tuning: ["bite"],
  keys: { kind: true, tuning: true },
  fits: fitsWhen(quadrupedFits, "needs three paws or more, each at the end of a hip, a knee and an ankle, and a jaw on a head"),
  faults: config => Object.entries(config.tuning?.bite ?? {}).flatMap(([key, value]) =>
    !(key in REPTILE_BITE) || !Number.isFinite(value) || (key === "closeRate" || key === "biteInset" || key === "contactAt" || key === "biteLead" || key === "neckRetract" ? value < 0 : value <= 0)
    || key === "open" && value > REPTILE_BITE.open || key === "contactAt" && value > 1 || key === "biteSamples" && !Number.isInteger(value)
      ? [`invalid bite setting ${key}`] : []),
  presets: deepFreeze({ crawl: { label: "Crawl and bite", config: QUADRUPED } }),
  builtIn: () => NO_POSTURE,
  create: (host, config, wiring) => quadrupedMind(host, wiring,
    { crawl: REPTILE_CRAWL, trot: REPTILE_TROT, motor: REPTILE_MOTOR, travel: REPTILE_TRAVEL,
      bite: deepFreeze({ ...REPTILE_BITE, ...config.tuning?.bite }) }),
});
