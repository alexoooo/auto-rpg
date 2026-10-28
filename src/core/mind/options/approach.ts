import type { Intent } from "../intent.ts";
import { approachActionWindow } from "../action-window.ts";
import type { Asked, Situation } from "./option.ts";

/**
 * **Approach**: footwork whose goal is a commitment's entry region, the window its entry names
 * where it says `position` (`Asked.approach`). Chosen with that commitment, it holds the legs and
 * brings them into the window (`approachActionWindow`) at the orders' pace, keeping the actions
 * asked; its exit is the window, where the commitment's entry is ready. A step that names no
 * window is left as it was asked.
 */
export function approach(now: Situation, asked: Asked): Omit<Intent, "guard"> {
  if (!asked.approach) return asked;
  return { ...approachActionWindow(now.sight.view, asked.approach, now.sight.report.heading, now.orders?.pace ?? Infinity), actions: asked.actions };
}
