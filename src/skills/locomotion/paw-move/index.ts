import { varied, type Varied } from "../../framework/variations.ts";
import type { Locomotion } from "../../framework/locomotion-part.ts";
import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import type { Body } from "../../../control/body.ts";
import type { ConfigFor } from "../../../parts/lookup.ts";
import { slotOne } from "../../../parts/parts.ts";
import { whenEmpty } from "../../../parts/tree.ts";
import type { Legs, LocomotionPart } from "../../framework/locomotion-part.ts";
import { deepFreeze } from "../../../core/state.ts";
import { fitsPaws } from "../../../control/quadruped/fit.ts";
import { pawGaitBody, type Gait } from "../shared/quadruped/parts.ts";
import { GAIT_NAMES, pawLegs, type PawGaitName } from "../shared/quadruped/paw-legs.ts";

/** **The paw legs**' config: the gait it travels by and the one it crawls by (`PawGaitPart`), the stock ones where it names none. */
interface PawMoveConfig extends Varied { readonly kind: "paw-move"; readonly trot?: ConfigFor<"paw-gait">; readonly crawl?: ConfigFor<"paw-gait"> }

/** The stock gaits: the trot to travel, the crawl close in and while the paws are placed again. */
const STOCK: Readonly<Record<PawGaitName, ConfigFor<"paw-gait">>> = deepFreeze({ trot: { kind: "paw-trot" }, crawl: { kind: "paw-crawl" } });

/** What each gait is called. */
const LABELS: Readonly<Record<PawGaitName, string>> = Object.freeze({ trot: "Trot", crawl: "Crawl" });

/** The paw legs' slots: a gait part for each of its gaits (`GAIT_NAMES`), called as `LABELS` calls it, each the stock one (`STOCK`) where empty. */
const PAW_SLOTS = Object.freeze(GAIT_NAMES.map(name => ({ ...slotOne(name, LABELS[name], "paw-gait", true), skills: true })));

/** The gait part `config` names for its gait `name`, the stock one where it names none. */
const gaitOf = (config: PawMoveConfig, name: PawGaitName): ConfigFor<"paw-gait"> => config[name] ?? STOCK[name];

/** The paw legs' variations: the paw legs. */
const VARIATIONS = {
  "paw-move"(body: Body, config: PawMoveConfig, legs: Legs): Locomotion {
    const over = pawGaitBody(body), gaits: Partial<Record<PawGaitName, Gait>> = {};
    for (const name of GAIT_NAMES) {
      const given = gaitOf(config, name), part = legs.parts.of("paw-gait", given);
      if (part.fits(body.built.spec, given, legs.parts) === null) gaits[name] = part.make(over, given);
    }
    return pawLegs(body, gaits);
  },
};

/** **The paw legs** (`pawLegs`) as a kind of locomotion: a body on three paws or more (`fitsPaws`), its gaits the parts its config names (`PawGaitPart`). */
export const PAW_MOVE = deepFreeze<LocomotionPart<PawMoveConfig>>({
  role: "locomotion", requires: [SUPPORT_REFERENCE], label: "Paw gaits", fields: [], defaults: { kind: "paw-move" }, keys: { kind: true, variation: true, trot: true, crawl: true },
  slots: PAW_SLOTS, supplies: (config) => whenEmpty(PAW_SLOTS, config, STOCK),
  ...varied({ skill: "paw-move", label: "paw gaits", variations: VARIATIONS, of: (body, config) => [body.built.spec, config], fits: [fitsPaws,
    (spec, config, parts) => GAIT_NAMES.some(name => {
      const gait = gaitOf(config, name);
      return parts.of("paw-gait", gait).fits(spec, gait, parts) === null;
    }) ? null : "has no enabled paw gait"] }), faults: () => [],
  gaits: (config) => GAIT_NAMES.map((name) => ({ name, label: LABELS[name], legs: gaitOf(config, name) })),
  skillGroup: "Travel",
});

declare module "../../config.ts" {
  interface LocomotionConfigs {
    readonly "paw-move": PawMoveConfig;
  }
}
