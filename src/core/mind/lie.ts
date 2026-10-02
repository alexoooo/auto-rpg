import type { BodyView } from "../body.ts";
import type { OwnBody } from "./mind.ts";
import type { SubMind } from "./sub-mind.ts";

/**
 * **Lying still**: while its body is down (`BodyView.down`), it asks its muscles for nothing.
 * `view` is its host's, read this step before it is asked (`hosting`): the one reading of down,
 * so a body its host holds low on purpose is not taken from it. It asks its assist nothing, so
 * the assist gives nothing.
 */
export function lying(own: OwnBody, view: BodyView): SubMind {
  return {
    name: "lie",
    wants: () => view.down,
    begin() {},
    end() {},
    step() {
      own.muscles.activation.fill(0);
      own.muscles.velocity.fill(0);
    },
  };
}
