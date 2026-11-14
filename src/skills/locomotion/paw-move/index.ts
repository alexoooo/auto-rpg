import { variationFault, variedMake, type Varied } from "../../framework/variations.ts";
import type { Locomotion } from "../../framework/locomotion-part.ts";
import { SUPPORT_REFERENCE } from "../../../control/support-reference.ts";
import type { Body } from "../../../control/body.ts";
import type { ConfigFor } from "../../../parts/lookup.ts";
import { fitsAll, slotOne } from "../../../parts/parts.ts";
import { whenEmpty } from "../../../parts/tree.ts";
import type { Legs, LocomotionPart } from "../../framework/locomotion-part.ts";
import { deepFreeze } from "../../../core/state.ts";
import { fitsPaws } from "../../../control/quadruped/fit.ts";
import { type Gait } from "../shared/quadruped/parts.ts";
import { pawEndpoints, pawReader } from "../../../control/quadruped/paws.ts";
import { GAIT_NAMES, pawLegs, type PawGaitName } from "./paw-move/paw-legs.ts";

/** **The paw legs**' config: the gait it travels by and the one it crawls by (`PawGaitPart`), the stock ones where it names none. */
interface PawMoveConfig extends Varied { readonly kind: "paw-move"; readonly trot?: ConfigFor<"paw-gait">; readonly crawl?: ConfigFor<"paw-gait"> }

/** The stock gaits: the trot to travel, the crawl close in and while the paws are placed again. */
const STOCK = deepFreeze({ trot: { kind: "paw-trot" }, crawl: { kind: "paw-crawl" } });

/** What each gait is called. */
const LABELS: Readonly<Record<PawGaitName, string>> = Object.freeze({ trot: "Trot", crawl: "Crawl" });

/** The paw legs' slots: a gait part for the trot and one for the crawl, each the stock one (`STOCK`) where empty. */
const PAW_SLOTS = Object.freeze([slotOne("trot", "Trot", "paw-gait", true), slotOne("crawl", "Crawl", "paw-gait", true)]);

/** The paw legs' variations: the paw legs. */
const VARIATIONS = {
  "paw-move"(body: Body, config: PawMoveConfig, legs: Legs): Locomotion {
    const built = body.built, root = body.muscles.dynamics.root.segment, reading = pawReader(built).state, names = pawEndpoints(built).map((paw) => paw.segment);
    const reads = { centre: reading.centre, velocity: reading.velocity, feet: reading.endpoints };
    const gait = (name: PawGaitName): Gait => {
      const given = config[name] ?? STOCK[name];
      return legs.parts.of("paw-gait", given).make(built, root, reads, names, given);
    };
    return pawLegs(body, gait("trot"), gait("crawl"));
  },
};

/** **The paw legs** (`pawLegs`) as a kind of locomotion: a body on three paws or more (`fitsPaws`), its gaits the parts its config names (`PawGaitPart`). */
export const PAW_MOVE = deepFreeze<LocomotionPart<PawMoveConfig>>({
  role: "locomotion", requires: [SUPPORT_REFERENCE], label: "Paw gaits", stage: "game", fields: [], defaults: { kind: "paw-move" }, keys: { kind: true, variation: true, trot: true, crawl: true },
  slots: PAW_SLOTS, supplies: (config) => whenEmpty(PAW_SLOTS, config, STOCK),
  fits: fitsAll(variationFault("paw-move", "paw gaits", VARIATIONS), fitsPaws), faults: () => [],
  gaits: (config) => GAIT_NAMES.map((name) => ({ name, label: LABELS[name], legs: config[name] ?? STOCK[name] })),
  make: variedMake("paw-move", VARIATIONS, (body, config) => [body.built.spec, config]),
  skillGroup: "Travel", variations: Object.keys(VARIATIONS),
});

declare module "../../config.ts" {
  interface LocomotionConfigs {
    readonly "paw-move": PawMoveConfig;
  }
}
