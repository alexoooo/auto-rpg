import type { Hook } from "../../../core/bodies/step-host.ts";
import type { HostedBody } from "../../../minds/hosted-body.ts";
import type { Skills } from "../../../skills/framework/skills.ts";
import type { World } from "../../../core/world/world.ts";

/**
 * **What a lab body's mind decides, as it changes.** A log holds notes in the order they were
 * made, each at the time its mind saw (`BodyView.time`): a watch of its skills (`watchSkills`)
 * writes one whenever what they are doing changes, and a watch of the body
 * (`watchHas`) whenever who has it changes. Free of the DOM.
 */

/**
 * The maximum notes a log keeps unless told, bounding memory while retaining recent decisions.
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

/** What is said of the skills' report, by kind; null says nothing. The words are the report's own. */
function said({ report }: Pick<Skills, "report">): Readonly<Record<string, string | null>> {
  return {
    actions: report.actions.length ? report.actions.map(action => `#${action.id} ${action.action} ${action.phase}/${action.stage}`).join("; ") : null,
    ended: report.ledger.length ? `${report.ledger.at(-1)!.action} #${report.ledger.at(-1)!.id} ${report.ledger.at(-1)!.ending.kind}` : null,
  };
}

/** Note in `log`, after each of `world`'s steps, each thing said of `skills`' report that is not what was last said of its kind, at the time `body`'s mind saw. */
export function watchSkills(world: World, body: HostedBody, skills: Pick<Skills, "report">, log: MindLog): Hook {
  const last: Record<string, string | null> = {};
  return world.afterStep(() => {
    for (const [kind, text] of Object.entries(said(skills))) {
      if (last[kind] === text) continue;
      last[kind] = text;
      if (text !== null) log.note(body.view.time, text);
    }
  });
}

/** Note in `log` who has `body` (`Body.has`) whenever it is not who last had it, after each of `world`'s steps, at the time its mind saw. */
export function watchHas(world: World, body: HostedBody, log: MindLog): Hook {
  let last = body.has;
  return world.afterStep(() => {
    if (body.has === last) return;
    last = body.has;
    log.note(body.view.time, `${last} has the body`);
  });
}
