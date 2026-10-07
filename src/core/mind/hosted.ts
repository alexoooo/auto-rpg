import type { BuiltBody } from "../build/build-body.ts";
import type { AssistCeiling } from "../control/assist.ts";
import { physicalBody, type PhysicalBody } from "../physical-body.ts";
import type { World } from "../world.ts";
import { embody, type OwnBody } from "./mind.ts";
import { clockSenses, type Senses } from "./senses.ts";
import { hosting, type HostMind, type SubMind } from "./sub-mind.ts";

/**
 * **A hosted mind as its maker makes it**: the host, the sub-minds it hands the body to in rank
 * order (`hosting`), and how the body reads whether it is down.
 */
interface Hosted {
  readonly host: HostMind;
  readonly subs: readonly SubMind[];
  readonly down: () => boolean;
}

/**
 * **`built` under a host and its sub-minds**: embodied, hosted, and given to the fight as a
 * `PhysicalBody`. `make` builds the mind from the body it owns and what it senses.
 */
export function hostedBody(built: BuiltBody, world: World, options: { readonly senses?: () => Senses; readonly assist?: AssistCeiling },
  make: (own: OwnBody, senses: () => Senses) => Hosted): PhysicalBody {
  const senses = options.senses ?? clockSenses(world);
  let down!: () => boolean;
  const { own, mind, state, dispose } = embody(built, world, (body) => {
    const made = make(body, senses);
    down = made.down;
    return hosting(made.host, made.subs);
  }, senses, options.assist);
  return physicalBody(own, world, senses, () => mind.has, state, dispose, down);
}
