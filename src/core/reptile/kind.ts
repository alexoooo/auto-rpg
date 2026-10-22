import { QUADRUPED, type QuadrupedConfig } from "../mind/config.ts";
import { controller, NO_POSTURE } from "../mind/controller.ts";
import { slotOne } from "../mind/parts.ts";
import { deepFreeze } from "../state.ts";
import { QUADRUPED_PARTS, quadrupedMind } from "./mind.ts";
import { fitsQuadruped } from "./parts.ts";
import { REPTILE_BITE } from "./tuning.ts";

/** **The quadruped** (`quadrupedMind`): crawling, biting and righting itself on four paws. */
export const QUADRUPED_MIND = controller<QuadrupedConfig>({
  role: "mind", label: "Quadruped", stage: "game", fields: [], defaults: QUADRUPED, tuning: ["bite"],
  slots: [slotOne("motor", "Motor", "support-motor", true, "Paw support"), slotOne("travel", "Travel", "gait", true, "Trot"),
    slotOne("crawl", "Crawl", "gait", true, "Crawl"), slotOne("bite", "Bite", "bite", true, "Jaw snap"),
    slotOne("tactics", "Tactics", "quadruped-tactics", true, "Stalk and bite"), slotOne("navigation", "Navigation", "navigation", true, "Visibility routes")],
  keys: { kind: true, motor: true, travel: true, crawl: true, bite: true, tactics: true, navigation: true, tuning: true },
  fits: fitsQuadruped,
  // It strikes with what its bite does (`Part.strikes`): its own where the slot holds none.
  strikes: (spec, config, parts) => parts.of("bite", config.bite ?? QUADRUPED_PARTS.bite).strikes?.(spec, config.bite ?? QUADRUPED_PARTS.bite, parts),
  faults: config => Object.entries(config.tuning?.bite ?? {}).flatMap(([key, value]) =>
    !(key in REPTILE_BITE) || !Number.isFinite(value) || (key === "closeRate" || key === "biteInset" || key === "contactAt" || key === "biteLead" || key === "neckRetract" ? value < 0 : value <= 0)
    || key === "open" && value > REPTILE_BITE.open || key === "contactAt" && value > 1 || key === "biteSamples" && !Number.isInteger(value)
      ? [`invalid bite setting ${key}`] : []),
  presets: deepFreeze({ crawl: { label: "Crawl and bite", config: QUADRUPED } }),
  builtIn: () => NO_POSTURE,
  create: (host, config, wiring) => quadrupedMind(host, wiring, config),
});
