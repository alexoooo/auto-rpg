/** **Schedules**: which subjects of a contest meet. */
import type { Subject } from "./evaluation.ts";

/** Every pair (`all`), or every subject against every member of a panel and the members not among themselves (`versus`). */
export type Schedule = { readonly kind: "all" } | { readonly kind: "versus"; readonly panel: readonly string[] };

/** The pairs `schedule` makes of `subjects`, the first of each on the left first, in the subjects' order. */
export function pairsOf(subjects: readonly Subject[], schedule: Schedule): [Subject, Subject][] {
  switch (schedule.kind) {
    case "all": return subjects.flatMap((a, i) => subjects.slice(i + 1).map((b): [Subject, Subject] => [a, b]));
    case "versus": {
      const member = (subject: Subject) => schedule.panel.includes(subject.id);
      return subjects.filter((one) => !member(one)).flatMap((a) => subjects.filter(member).map((b): [Subject, Subject] => [a, b]));
    }
    default: {
      const never: never = schedule;
      throw new Error(`no schedule ${JSON.stringify(never)}`);
    }
  }
}

/** A schedule as a record's header names it. */
export const scheduleName = (schedule: Schedule): string => schedule.kind === "all" ? "all" : `versus ${schedule.panel.join(",")}`;
