import type { EffectorFeedback } from "../../../control/effector-feedback.ts";

/** Every loaded identity must belong to the selected opponent before a stroke continues. */
export function unintendedContact(feedback: EffectorFeedback | undefined, foe: string | undefined): boolean {
  return feedback?.contacts?.some(target => target.kind !== "body" || target.body !== foe) ?? false;
}

/** Contact response is a policy observation; it changes no blow or wound rule. */
export function contactResponse(feedback: EffectorFeedback | undefined, foe: string): "target" | "block" | "world" | "incidental" | null {
  const target = feedback?.contact?.target;
  if (!target) return null;
  switch (target.kind) {
    case "world": return "world";
    case "object": return target.id === foe ? "target" : "incidental";
    case "body": return target.body !== foe ? "incidental" : target.guard ? "block" : "target";
    default: { const never: never = target; throw new Error(`unknown contact target ${never}`); }
  }
}
