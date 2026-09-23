import type { Mind } from "../../mind.ts";
import { golemDuelistMind } from "../golem-policies.ts";

/**
 * The skeleton's button policy: the golem duelist's tactics, under the skeleton's own name.
 *
 * A separate name because `assessPolicy` refuses a policy on a family it was not built and
 * measured on, and a family button whose policy is refused cannot start a bout. Nothing has been
 * tuned for a skeleton yet; what this name records is that the duelist is the policy the skeleton
 * is played and measured with from here on.
 */
export function skeletonDuelist(seed?: number): Mind {
  return { ...golemDuelistMind(seed), name: "skeleton-duelist" };
}
