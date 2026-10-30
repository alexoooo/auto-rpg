import { hypot } from "../../core/math/real.ts";
import type { Intent } from "../../core/mind/intent.ts";
import type { Orders } from "../../core/mind/orders.ts";

/** Preserve stricter intent and ordered ceilings while capping a layer's movement, including a direct step. */
export function limitPace(intent: Intent, orders: Orders | null, limit: number): Intent {
  const pace = Math.min(limit, intent.pace ?? Infinity, orders?.pace ?? Infinity);
  let move = intent.move;
  if (move && !intent.movement) {
    const speed = hypot(move[0], move[1]);
    if (speed > pace) {
      const scale = pace / speed;
      move = pace === 0 ? null : [move[0] * scale, move[1] * scale];
    }
  }
  return { ...intent, move, pace };
}
