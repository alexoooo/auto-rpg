/**
 * **The scorecard**: how a mind fights itself and how well it knows what its choices bring. Its
 * bouts (how they end, the silence, the falls), each draw's beside the others' so a difference is
 * read against the set's own spread; what its decisions were priced to deal and take against what
 * the bout gave (`readScorecard`), by what the chosen offer was priced to do and by what the mind
 * read the foe doing. Two kinds of mind are read on the same cases; which beats which is the
 * match's (`npm run match`). How long a case took to play is the runner's to say, beside its row.
 */
import { recordingKey } from "../../core/world/recording.ts";
import type { Evaluation, Json } from "../evaluation.ts";
import { sha256Text } from "../sha256.ts";
import { createLocomotionIndex } from "../locomotion/index.ts";
import { createScorecardCases, type ScorecardCondition } from "./cases.ts";
import { longestUnlanded, readingSilence, type Prices, type ScorecardReading } from "./read.ts";
import { KNOCKOUT_WITHIN } from "../contest.ts";
import { type GameContext, perContext } from "../../game/arena/context.ts";

/** Whether a bout ended by a body's life, not by the clock or another rule. */
const knockedOut = (r: ScorecardReading): boolean => r.bars.some((bar) => bar <= 0);

const ratio = (a: number, b: number): string => b > 0 ? (a / b).toFixed(2) : "-";
const pct = (x: number): string => (100 * x).toFixed(1);

export const createScorecardIndex = perContext((context: GameContext) => {
  const { mindSubjects } = createLocomotionIndex(context);
  const { SCORECARD_CASES } = createScorecardCases(context);

  const SCORECARD: Evaluation<ScorecardCondition, ScorecardReading> = {
    id: "scorecard",
    title: "The scorecard",
    group: "decisions",
    question: "How does a mind fight itself, and how well does it know what its choices bring?",
    protocols: SCORECARD_CASES,
    defaultProtocol: "warrior",
    schedule: "all",
    analysis: {},
    subjects: (choice) => mindSubjects(choice, ["option"]),
    figures: [
      { name: "silent", unit: "share of a bout after its first strike in gaps with none begun", kind: "mean", better: "lower", of: (r) => { const s = readingSilence(r); return s && s.fought > 0 ? s.silent / s.fought : null; } },
      { name: "standing silent", unit: "share of a bout after its first strike in gaps with none begun and both bodies standing", kind: "mean", better: "lower", of: (r) => { const s = readingSilence(r); return s && s.fought > 0 ? s.standing / s.fought : null; } },
      { name: "knockout", unit: "share of bouts ended by a body's life", kind: "rate", better: "higher", of: (r) => knockedOut(r) },
      { name: `knockout within ${KNOCKOUT_WITHIN} s`, unit: `share of bouts ended by a body's life within ${KNOCKOUT_WITHIN} s`, kind: "rate", better: "higher", of: (r) => knockedOut(r) && r.seconds <= KNOCKOUT_WITHIN },
      { name: "downs", unit: "falls a bout, both sides", kind: "mean", better: "lower", of: (r) => r.sides[0].downs + r.sides[1].downs },
      { name: "out of reach", unit: "share of a bout with both bodies standing farther apart than either's strikes reach the other", kind: "mean", better: "lower", of: (r) => r.outOfReach / r.seconds },
      { name: "longest unlanded", unit: "the longest stretch of a bout with no blow taking life, s", kind: "mean", better: "lower", of: (r) => longestUnlanded(r) },
    ],
    /** For each subject: its bouts by draw and pooled, and its prices by slice. */
    summary({ subjects, cases }) {
      const lines: string[] = [], json: Record<string, Json> = {};
      for (const subject of subjects) {
        const own = cases.filter((one) => one.subjects[0] === subject.id), draws = [...new Set(own.map((one) => one.condition.draw))].sort((a, b) => a - b);
        const bouts = (rows: typeof own) => {
          let silent = 0, fought = 0, downs = 0, standing = 0;
          for (const { reading } of rows) {
            const s = readingSilence(reading);
            if (s) { silent += s.silent; fought += s.fought; standing += s.standing; }
            downs += reading.sides[0].downs + reading.sides[1].downs;
          }
          return { bouts: rows.length, knockouts: rows.filter((one) => knockedOut(one.reading)).length, silent: fought > 0 ? silent / fought : null, standing: fought > 0 ? standing / fought : null, downs: rows.length ? downs / rows.length : null,
            seconds: rows.length ? rows.reduce((t, one) => t + one.reading.seconds, 0) / rows.length : null };
        };
        const byDraw = draws.map((draw) => ({ draw, ...bouts(own.filter((one) => one.condition.draw === draw)) })), all = bouts(own);
        const prices: Record<string, Prices> = {};
        for (const { reading } of own) for (const side of reading.sides) for (const [slice, p] of Object.entries(side.prices)) {
          const q = prices[slice] ??= { n: 0, taken: 0, lost: 0, dealing: 0, dealt: 0, given: 0 };
          q.n += p.n; q.taken += p.taken; q.lost += p.lost; q.dealing += p.dealing; q.dealt += p.dealt; q.given += p.given;
        }
        const slices = Object.keys(prices).sort((a, b) => (a === "all" ? -1 : b === "all" ? 1 : a.localeCompare(b)));
        const row = (label: string, b: ReturnType<typeof bouts>) => `| ${label} | ${b.bouts} | ${b.knockouts} | ${b.silent === null ? "-" : pct(b.silent)} | ${b.standing === null ? "-" : pct(b.standing)} | ${b.downs?.toFixed(2) ?? "-"} | ${b.seconds?.toFixed(0) ?? "-"} |`;
        lines.push(`${subject.label} (${sha256Text(recordingKey(subject.value)).slice(0, 16)})`, "",
          "| Draw | Bouts | Knockouts | Silent, % | Both standing, % | Downs a bout | Seconds a bout |", "|---|---|---|---|---|---|---|",
          ...byDraw.map((b) => row(String(b.draw), b)), row("all", all), "",
          "Priced against given, each side's choices over the span each ran, % of a life each a mean; a ratio over 1 a price above what the bout gave; dealt read over the choices priced to deal:", "",
          "| Slice | Choices | Priced taken | Lost | Ratio | Dealing | Priced dealt | Given | Ratio |", "|---|---|---|---|---|---|---|---|---|",
          ...slices.map((slice) => { const p = prices[slice]!, d = p.dealing;
            return `| ${slice} | ${p.n} | ${pct(p.taken / p.n)} | ${pct(p.lost / p.n)} | ${ratio(p.taken, p.lost)} | ${d} | ${d ? pct(p.dealt / d) : "-"} | ${d ? pct(p.given / d) : "-"} | ${ratio(p.dealt, p.given)} |`; }), "");
        json[subject.id] = { draws: byDraw, all, prices } as unknown as Json;
      }
      return { lines, json };
    },
  };

  return { SCORECARD };
});
