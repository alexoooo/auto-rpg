import type { Mind } from "./mind.ts";
import type { Mirror } from "./mirror.ts";

/** Refresh the body, carry the chosen action out and send its command. */
export function answer(mind: Mind, mirror: Mirror): void {
  mirror.refresh({ dynamics: true });
  mind.act(mirror.control);
  mirror.answer();
}

/** Read the senses after the answer, then choose the next command. */
export function think(mind: Mind, mirror: Mirror): void {
  mirror.sense();
  mind.think(mirror.senses);
}
