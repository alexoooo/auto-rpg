import { QUADRUPED, type QuadrupedConfig } from "./config.ts";
import { controller, NO_POSTURE } from "../mind/controller.ts";
import { GAME_NAVIGATION } from "../navigation/navigator.ts";
import { slotOne } from "../parts/parts.ts";
import { quadrupedMind } from "./mind.ts";
import { QUADRUPED_PARTS } from "./layers.ts";
import { fitsQuadruped } from "./parts.ts";
import { REPTILE_BITE } from "./tuning.ts";

/** **The quadruped** (`quadrupedMind`): crawling, biting and righting itself on four paws. */
export const QUADRUPED_MIND = controller<QuadrupedConfig>({
  role: "mind", label: "Quadruped", stage: "game", fields: [], defaults: QUADRUPED, tuning: ["bite"],
  slots: [slotOne("motor", "Motor", "support-motor", true, QUADRUPED_PARTS.motor), slotOne("travel", "Travel", "gait", true, QUADRUPED_PARTS.travel),
    slotOne("crawl", "Crawl", "gait", true, QUADRUPED_PARTS.crawl), slotOne("bite", "Bite", "bite", true, QUADRUPED_PARTS.bite),
    slotOne("tactics", "Tactics", "quadruped-tactics", true, QUADRUPED_PARTS.tactics), slotOne("navigation", "Navigation", "navigation", true, GAME_NAVIGATION)],
  keys: { kind: true, motor: true, travel: true, crawl: true, bite: true, tactics: true, navigation: true, tuning: true },
  fits: fitsQuadruped,
  // It strikes with what its bite does (`Part.strikes`): its own where the slot holds none.
  strikes: (spec, config, parts) => parts.of("bite", config.bite ?? QUADRUPED_PARTS.bite).strikes?.(spec, config.bite ?? QUADRUPED_PARTS.bite, parts),
  faults: config => Object.entries(config.tuning?.bite ?? {}).flatMap(([key, value]) =>
    !(key in REPTILE_BITE) || !Number.isFinite(value) || (key === "closeRate" || key === "biteInset" || key === "contactAt" || key === "biteLead" || key === "neckRetract" ? value < 0 : value <= 0)
    || key === "open" && value > REPTILE_BITE.open || key === "contactAt" && value > 1 || key === "biteSamples" && !Number.isInteger(value)
      ? [`invalid bite setting ${key}`] : []),
  builtIn: () => NO_POSTURE,
  create: (host, config, wiring) => quadrupedMind(host, wiring, config),
});
