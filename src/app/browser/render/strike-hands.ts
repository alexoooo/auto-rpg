import { HAND_CONFIGURATION } from "../../../core/bodies/human/hand-configurations.ts";
import type { ConfigurationName } from "../../../core/bodies/spec/body.ts";
import type { Side } from "../../../core/bodies/bilateral.ts";

/**
 * **A body's fingers**, as it holds its hands (`Configurations.state`, a built body's or a puppet's,
 * `puppetBody`): closed in its fist or on what it grips, open else. Every skill set closes a bare hand
 * for its blow (`closesToStrike`), so the fingers follow the body and no presentation of its own; a
 * body without a hand's pose relaxes it.
 */
export function handsOf(poses: Readonly<Record<string, { readonly applied: ConfigurationName }>>) {
  const closure = (hand: Side) => (poses[`hand.${hand}`]?.applied ?? HAND_CONFIGURATION.open) === HAND_CONFIGURATION.open ? 0 : 1;
  return { closure, snapshot: () => ({ left: closure("left"), right: closure("right") }), dispose() {} };
}
