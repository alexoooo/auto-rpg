import type { BuiltBody } from "../build/build-body.ts";
import type { AssistCeiling } from "../control/assist.ts";
import { physicalBody, type PhysicalBody } from "../physical-body.ts";
import type { World } from "../world.ts";
import { embody, type OwnBody } from "./mind.ts";
import { clockSenses, type Senses } from "./senses.ts";
import { hosting, type HostMind, type SubMind } from "./sub-mind.ts";
import type { SheetLog } from "./sheets.ts";

/**
 * **A hosted mind as its maker makes it**: the host and the sub-minds it hands the body to in rank
 * order (`hosting`). Whether the body is down is the fight's reading (`PhysicalBody.down`), not the mind's.
 */
export interface Hosted {
  readonly host: HostMind;
  readonly subs: readonly SubMind[];
}

/**
 * **`built` under a host and its sub-minds**: embodied, hosted, and given to the fight as a
 * `PhysicalBody`. `make` builds the mind from the body it owns and what it senses. Given a `log`,
 * its order sheets are written in it.
 */
export function hostedBody(built: BuiltBody, world: World, options: { readonly senses?: () => Senses; readonly assist?: AssistCeiling; readonly log?: SheetLog },
  make: (own: OwnBody, senses: () => Senses) => Hosted): PhysicalBody {
  const senses = options.senses ?? clockSenses(world);
  const { own, mind, state, dispose } = embody(built, world, (body) => {
    const made = make(body, senses);
    return hosting(made.host, made.subs);
  }, senses, options.assist, options.log);
  return physicalBody(built, own, world, senses, () => mind.has, state, dispose);
}
