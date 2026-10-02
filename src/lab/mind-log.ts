import type { Body } from "../core/body.ts";
import type { Hand } from "../core/control/motor.ts";
import type { Intent } from "../core/mind/intent.ts";
import type { Sight, Tactics } from "../core/mind/tactics.ts";
import type { Hook, World } from "../core/world.ts";
import { deciding } from "./minds.ts";

/**
 * **What a lab body's mind decides, as it changes.** A log holds notes in the order they were
 * made, each at the time its mind saw (`BodyView.time`); `logged` tactics write one whenever what
 * they decide, or how their skills are going, is no longer what it was. What they see of their skills
 * is the last step's (`Sight.report`): a strike's phase is noted the step after the skills enter it.
 * Tactics do not decide while a sub-mind has the body, so who has it is noted by a watch of the body
 * (`watchHas`). Free of the DOM.
 */

/**
 * The notes a log keeps unless told. The busiest scenario writes two a second (the Blow; Node
 * stand, Rapier, 120 Hz) and the longest recording the page scrubs through is 30 s: this is
 * several times what one holds.
 */
const CAPACITY = 512;

interface Note {
  readonly time: number;
  readonly text: string;
}

export interface MindLog {
  note(time: number, text: string): void;
  /** The last `count` notes made at or before `time`, oldest first. */
  upTo(time: number, count: number): readonly Note[];
}

/** A log of the last `capacity` notes. */
export function createMindLog(capacity = CAPACITY): MindLog {
  const notes: Note[] = [];
  return {
    note(time, text) {
      notes.push({ time, text });
      if (notes.length > capacity) notes.shift();
    },
    upTo(time, count) {
      let end = notes.length;
      while (end > 0 && notes[end - 1]!.time > time) end -= 1;
      return notes.slice(Math.max(0, end - count), end);
    },
  };
}

const HANDS: readonly Hand[] = ["left", "right"];

/** What is said of a step, by kind; null says nothing. The words are the intent's and the report's own. */
function said({ report }: Sight, intent: Intent): Readonly<Record<string, string | null>> {
  const { phase, blow, chosen } = report.strike;
  return {
    move: intent.move ? `move ${intent.move[0].toFixed(2)} ${intent.move[1].toFixed(2)}` : "stand",
    ...Object.fromEntries(HANDS.map((hand) => [hand, `${hand} ${intent.hands[hand].kind}`])),
    strike: phase && `strike ${phase}${blow ? ` ${chosen?.strike.name ?? blow}` : ""}`,
  };
}

/** `tactics`, noting in `log` each thing said of a step that is not what was last said of its kind. */
export function logged<T extends Tactics>(tactics: T, log: MindLog): T {
  const last: Record<string, string | null> = {};
  return deciding(tactics, (sight, dt) => {
    const intent = tactics.decide(sight, dt);
    for (const [kind, text] of Object.entries(said(sight, intent))) {
      if (last[kind] === text) continue;
      last[kind] = text;
      if (text !== null) log.note(sight.view.time, text);
    }
    return intent;
  });
}

/** Note in `log` who has `body` (`Body.has`) whenever it is no longer who last had it, after each of `world`'s steps, at the time its mind saw. */
export function watchHas(world: World, body: Body, log: MindLog): Hook {
  let last = body.has;
  return world.afterStep(() => {
    if (body.has === last) return;
    last = body.has;
    log.note(body.view.time, `${last} has the body`);
  });
}
