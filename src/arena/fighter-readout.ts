import { commandsBody } from "../core/body.ts";
import type { PhysicalBody } from "../core/physical-body.ts";
import type { Pool } from "../core/rules/pool.ts";
import type { BodySpec } from "../core/spec/body.ts";
import type { ActionStatus, Ended } from "../core/skills/framework/action.ts";
import { blocked, cleanMiss, landed } from "../core/skills/framework/action-instances.ts";
import type { MindReport } from "../core/mind/report.ts";
import { partLabel } from "../ui/part-label.ts";

/** A front-facing body; screen left is the fighter's anatomical right. */
const HUMAN: Readonly<Record<string, string>> = {
  head: "M40 17a10 13 0 1 0 20 0a10 13 0 1 0-20 0",
  upperTrunk: "M33 34Q50 28 67 34L64 57H36Z",
  middleTrunk: "M37 60H63L61 77H39Z",
  lowerTrunk: "M39 80H61L65 96L50 101L35 96Z",
  "upperArm.right": "M29 35L35 40L24 67L15 64Z",
  "forearm.right": "M14 68L23 71L17 95L9 93Z",
  "hand.right": "M8 97L17 99L16 111L6 109Z",
  "upperArm.left": "M71 35L65 40L76 67L85 64Z",
  "forearm.left": "M86 68L77 71L83 95L91 93Z",
  "hand.left": "M92 97L83 99L84 111L94 109Z",
  "thigh.right": "M35 101L47 105L44 143L31 143Z",
  "shank.right": "M31 147H43L41 182H32Z",
  "foot.right": "M31 186H42L43 196H25L25 191Z",
  "thigh.left": "M65 101L53 105L56 143L69 143Z",
  "shank.left": "M69 147H57L59 182H68Z",
  "foot.left": "M69 186H58L57 196H75L75 191Z",
};

/** A top view separates the reptile's paired legs, jaw and tail. */
const REPTILE: Readonly<Record<string, string>> = {
  trunk: "M38 59Q30 84 38 112Q50 124 62 112Q70 84 62 59Z",
  head: "M39 22Q50 10 61 22L59 43H41Z",
  jaw: "M42 46H58L55 54H45Z",
  "tail.base": "M40 121H60L55 153H45Z",
  "tail.tip": "M45 157H55L50 195Z",
  "upper.front.right": "M34 63L30 75L16 65L20 56Z",
  "lower.front.right": "M16 53L12 62L6 45L12 42Z",
  "paw.front.right": "M5 30H14L14 39L4 40Z",
  "upper.front.left": "M66 63L70 75L84 65L80 56Z",
  "lower.front.left": "M84 53L88 62L94 45L88 42Z",
  "paw.front.left": "M95 30H86L86 39L96 40Z",
  "upper.hind.right": "M34 99L32 111L18 123L12 114Z",
  "lower.hind.right": "M12 119L19 128L13 145L6 142Z",
  "paw.hind.right": "M4 147H14L13 157H3Z",
  "upper.hind.left": "M66 99L68 111L82 123L88 114Z",
  "lower.hind.left": "M88 119L81 128L87 145L94 142Z",
  "paw.hind.left": "M96 147H86L87 157H97Z",
};

/** Every body diagram, each a path by segment name. */
const DIAGRAMS: readonly Readonly<Record<string, string>>[] = [HUMAN, REPTILE];

/** Fixed diagram geometry and current damage, keyed by the pool's actual segments. */
export function damageReadout(spec: BodySpec, pool: Pool) {
  // The diagram that draws every segment the body has: a body family is drawn by its segments, not its name.
  const paths = DIAGRAMS.find(diagram => spec.segments.every(segment => Object.hasOwn(diagram, segment.name)));
  const parts = spec.segments.map(segment => {
    const path = paths?.[segment.name];
    if (!path) throw new Error(`No damage diagram part for ${spec.model}/${segment.name}`);
    return { name: segment.name, label: partLabel(segment.name), path,
      remaining: 1, attached: true, flashUntil: -Infinity, hp: pool.hp(segment.name) };
  });
  return { parts, sample(time: number): void {
    for (const part of parts) {
      const hp = pool.hp(part.name), attached = pool.attached(part.name);
      if (hp < part.hp || part.attached && !attached) part.flashUntil = time + .6;
      part.hp = hp; part.attached = attached;
      part.remaining = Math.max(0, Math.min(1, hp / pool.max(part.name)));
    }
  } };
}

/** Feed entries persist through action updates; their age starts at termination. */
interface FeedEntry {
  readonly key: string;
  readonly kind: "action" | "behaviour";
  readonly label: string;
  detail: string;
  active: boolean;
  time: number;
}

/** Terminal labels report contact facts independently of the damage pool. */
function result(record: Ended): string {
  const contact = landed(record) ? "Contact" : blocked(record) ? "Blocked" : null;
  switch (record.ending.kind) {
    case "completed": return contact ?? (cleanMiss(record) ? "Missed" : "Completed");
    case "cancelled": return contact ? `${contact} · cancelled` : "Cancelled";
    case "interrupted": return contact ? `${contact} · interrupted` : "Interrupted";
    case "lost": return contact ? `${contact} · lost control` : "Lost control";
    case "stalled": return contact ? `${contact} · stalled` : "Stalled";
    case "refused": return "Refused";
    default: { const never: never = record.ending.kind; throw new Error(`Unknown ending ${never}`); }
  }
}

const title = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const actionLabel = (action: Pick<ActionStatus, "action" | "effector">) => `${title(action.action)} · ${partLabel(action.effector)}`;

/**
 * A bounded presentation history reads reports after every step and never writes to them. Named
 * tactical decisions are quieter than executor stages or per-step control writes, each shown by
 * the label its part gives it (`labels`, `phaseLabels`), and not at all where that is null.
 */
export function actionFeed() {
  const state = { entries: [] as FeedEntry[], sequence: 0, serial: 0, pending: null as string | null,
    since: 0, settled: null as string | null, time: -Infinity };
  let labels: Readonly<Record<string, string | null>> = {};
  const reset = () => {
    state.entries.length = 0; state.sequence = 0; state.serial = 0;
    state.pending = null; state.settled = null; state.since = 0; state.time = -Infinity;
  };
  const prune = (time: number) => {
    for (let i = state.entries.length - 1; i >= 0; i--) {
      const entry = state.entries[i]!;
      if (!entry.active && time - entry.time >= 6) state.entries.splice(i, 1);
    }
  };
  return { reset,
    /** Show phases by `next` (`phaseLabels` of the mind being read). */
    label(next: Readonly<Record<string, string | null>>): void { labels = next; },
    sample(report: Pick<MindReport, "actions" | "ended" | "engagement"> | undefined, body: Pick<PhysicalBody, "has" | "level">, time: number): void {
      if (time < state.time) reset();
      state.time = time; prune(time);
      if (!report) return;
      for (const action of report.actions ?? []) {
        const key = `action:${action.id}`;
        let entry = state.entries.find(row => row.key === key);
        if (!entry) {
          entry = { key, kind: "action", label: actionLabel(action), detail: "", active: true, time };
          state.entries.unshift(entry);
        }
        switch (action.phase) {
          case "prepare": entry.detail = "Preparing"; break;
          case "commit": entry.detail = "Executing"; break;
          case "release": entry.detail = "Recovering"; break;
          default: { const never: never = action.phase; throw new Error(`Unknown phase ${never}`); }
        }
      }
      for (const record of report.ended ?? []) {
        if (record.sequence <= state.sequence) continue;
        state.sequence = record.sequence;
        if (record.ending.kind === "refused") continue;
        const key = `action:${record.id}`, entry = state.entries.find(row => row.key === key);
        if (entry) { entry.active = false; entry.time = record.ended; entry.detail = result(record); }
        else if (time - record.ended < 6) state.entries.unshift({ key, kind: "action", label: actionLabel(record),
          detail: result(record), time: record.ended, active: false });
      }
      const phase = commandsBody(body) ? report.engagement?.phase ?? null : body.level === "full" && body.has !== "nobody" ? body.has : null;
      const behaviour = phase === null || labels[phase] === null ? null : phase;
      if (behaviour !== state.pending) { state.pending = behaviour; state.since = time; }
      if (behaviour === null) { state.settled = null; return; }
      if (behaviour !== state.settled && time - state.since >= .3) {
        state.settled = behaviour;
        state.entries.unshift({ key: `behaviour:${++state.serial}`, kind: "behaviour", label: labels[behaviour] ?? title(behaviour.replaceAll("-", " ")),
          detail: "", active: false, time });
      }
    },
    read(time: number) {
      prune(time);
      return state.entries.slice(0, 5).map(entry => ({ ...entry,
        opacity: entry.active ? 1 : Math.max(0, Math.min(1, (6 - (time - entry.time)) / 2)) }));
    },
  };
}
