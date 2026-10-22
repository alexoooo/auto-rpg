/** **Schedules**: which subjects of a contest meet. */
import type { Subject } from "./evaluation.ts";

/**
 * Every pair (`all`); every subject against every member of a panel and the members not among
 * themselves (`versus`); or the pairs named, by id (`pairs`: a subject against its previous version).
 */
export type Schedule = { readonly kind: "all" } | { readonly kind: "versus"; readonly panel: readonly string[] }
  | { readonly kind: "pairs"; readonly pairs: readonly (readonly [string, string])[] };

/** The pairs `schedule` makes of `subjects`, the first of each on the left first, in the subjects' order. */
export function pairsOf(subjects: readonly Subject[], schedule: Schedule): [Subject, Subject][] {
  switch (schedule.kind) {
    case "all": return subjects.flatMap((a, i) => subjects.slice(i + 1).map((b): [Subject, Subject] => [a, b]));
    case "versus": {
      const member = (subject: Subject) => schedule.panel.includes(subject.id);
      return subjects.filter((one) => !member(one)).flatMap((a) => subjects.filter(member).map((b): [Subject, Subject] => [a, b]));
    }
    case "pairs": {
      const byId = new Map(subjects.map((subject) => [subject.id, subject]));
      return schedule.pairs.map(([a, b]): [Subject, Subject] => {
        const left = byId.get(a), right = byId.get(b);
        if (!left || !right) throw new Error(`no subject ${left ? b : a} to pair`);
        return [left, right];
      });
    }
    default: {
      const never: never = schedule;
      throw new Error(`no schedule ${JSON.stringify(never)}`);
    }
  }
}

/** A schedule as a record's header names it. */
export function scheduleName(schedule: Schedule): string {
  switch (schedule.kind) {
    case "all": return "all";
    case "versus": return `versus ${schedule.panel.join(",")}`;
    case "pairs": return `pairs ${schedule.pairs.map((pair) => pair.join(" v ")).join(",")}`;
    default: {
      const never: never = schedule;
      throw new Error(`no schedule ${JSON.stringify(never)}`);
    }
  }
}
