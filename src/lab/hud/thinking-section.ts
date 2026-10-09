import type { MindLog } from "../mind-log.ts";
import { table, type Control } from "../../ui/controls.ts";

/** The notes shown at once. */
const ROWS = 10;

/** What reads the body's mind as it goes (`mindInspector`). */
interface Inspector {
  readonly element: HTMLElement;
  refresh(): void;
}

/**
 * The body's mind: its tree, with who has the body and which of its parts holds each part of it
 * (`inspect`, `mindInspector`), and what it has decided by the time shown (`mind-log.ts`), the
 * latest first.
 */
export function thinkingSection(): Control & { show(log: MindLog, time: number): void; inspect(inspector: Inspector): void } {
  const { element: notes, refresh, write } = table([]);
  notes.className = "log";
  const element = document.createElement("div"), holder = document.createElement("div");
  element.append(holder, notes);
  let shown: ReturnType<MindLog["upTo"]> | null = null, inspector: Inspector | null = null;
  return {
    element, refresh,
    inspect(next) { inspector = next; holder.replaceChildren(next.element); },
    show(log, time) {
      inspector?.refresh();
      const notes = log.upTo(time, ROWS);
      // The same last note of as many is the same notes.
      if (shown && notes.length === shown.length && notes.at(-1) === shown.at(-1)) return;
      shown = notes;
      write([...notes].reverse().map((note) => [note.time.toFixed(3), note.text]));
    },
  };
}
