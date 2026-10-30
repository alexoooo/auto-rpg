import type { Minded } from "../core/mind/minds.ts";

/**
 * **A fighter's fingers**, as its body holds its hands (`HandPoses`): closed in its fist or on what
 * it grips, open else. Every skill set closes a bare hand for its blow (`closesToStrike`), so the
 * fingers follow the body and no presentation of its own; a body without a hand's pose relaxes it.
 */
export function fighterHands(fighter: { readonly minded: Pick<Minded, "body"> }) {
  const poses = fighter.minded.body.built.handPoses.state;
  const closure = (hand: "left" | "right") => (poses[hand]?.applied ?? "open") === "open" ? 0 : 1;
  return { closure, snapshot: () => ({ left: closure("left"), right: closure("right") }), dispose() {} };
}
