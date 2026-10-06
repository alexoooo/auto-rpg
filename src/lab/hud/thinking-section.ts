import type { MindLog } from "../mind-log.ts";
import { table, type Control } from "../../ui/controls.ts";

/** The notes shown at once. */
const ROWS = 10;

/** What the body's mind has decided by the time shown (`mind-log.ts`), the latest first. */
export function thinkingSection(): Control & { show(log: MindLog, time: number): void } {
  const { element, refresh, write } = table([]);
  element.className = "log";
  let shown: ReturnType<MindLog["upTo"]> | null = null;
  return {
    element, refresh,
    show(log, time) {
      const notes = log.upTo(time, ROWS);
      // The same last note of as many is the same notes.
      if (shown && notes.length === shown.length && notes.at(-1) === shown.at(-1)) return;
      shown = notes;
      write([...notes].reverse().map((note) => [note.time.toFixed(3), note.text]));
    },
  };
}
