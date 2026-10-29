/**
 * **The baseline evaluation**: each competence of one mind's configuration on the Warrior, its
 * walk, punch, stand-up and fights, in one command (`Evaluation.every`), a record a competence, so
 * a later change reads what it touches against the same record (`npm run compare`). Its opponents
 * are minds' presets outside the subject (`OPPONENTS`), never its own earlier one.
 */
import type { Evaluation, Figure, Json, Table } from "../evaluation.ts";
import type { BuiltCase } from "../evaluation.ts";
import type { FallReading } from "../fall.ts";
import { LOCOMOTION_FIGURES, locomotionSummary, mindSubjects } from "../locomotion/index.ts";
import type { LocomotionCondition } from "../locomotion/cases.ts";
import type { LocomotionReading } from "../locomotion/read.ts";
import { FALL_CAP } from "../fall.ts";
import { fallSummary } from "../rising-target/index.ts";
import { STRIKE } from "../strike/index.ts";
import type { StrikeCondition } from "../strike/cases.ts";
import type { StrikeReading } from "../strike/read.ts";
import { BASELINE_CASES, OPPONENTS, type BaselineFight, type BaselinePart, type BaselineReading, type FightReading } from "./cases.ts";

/** `figures` read on `part`'s readings alone, each named for its competence. */
function partFigures<R>(part: BaselinePart, figures: readonly Figure<R & Json>[]): Figure<BaselineReading>[] {
  return figures.map((figure) => ({ ...figure, name: `${part}: ${figure.name}`,
    of: (reading, side) => reading.part === part ? figure.of(reading as unknown as R & Json, side) : null }));
}

const STRIKE_FIGURES = STRIKE.figures.filter((figure) => ["landed", "landed on the body", "admitted", "fell"].includes(figure.name));

/** A fall's time to stand from its takeover, s: verified on the stand bed, by the fight's down rule on the lone-body bed; one not stood counts at the cap. */
const standTime = (r: FallReading): number => r.stood ? r.verified ?? r.handback ?? FALL_CAP : FALL_CAP;

/** The stand-up read on either bed (`stood` is the bed's own verdict): stood within 6 s, stood, and the failure-inclusive median. */
const STAND_FIGURES: readonly Figure<FallReading & Json>[] = [
  { name: "within 6 s", unit: "share of falls", kind: "rate", better: "higher", of: (r) => standTime(r) <= 6 },
  { name: "stood", unit: "share of falls", kind: "rate", better: "higher", of: (r) => r.stood },
  { name: "time to stand", unit: "s, a fall not stood at the cap", kind: "median", better: "lower", of: standTime },
];

const FIGHT_FIGURES: readonly Figure<FightReading & Json>[] = [
  { name: "score", unit: "a win 1, a draw a half", kind: "mean", better: "higher", of: (r) => r.score },
  { name: "won", unit: "share of bouts", kind: "rate", better: "higher", of: (r) => r.won },
  { name: "margin", unit: "own life less the other's at the verdict", kind: "mean", better: "higher", of: (r) => r.margin },
];

/** Each fight's score by opponent and side. */
function fightSummary({ subjects, cases }: Table<Json, BaselineReading>): { lines: readonly string[]; json: Json } {
  const rows = subjects.flatMap((subject) => OPPONENTS.flatMap((foe) => (["left", "right"] as const).map((side) => {
    const bouts = cases.filter((one) => one.subjects[0] === subject.id && (one.condition as BaselineFight).foe === foe && (one.condition as BaselineFight).side === side);
    const readings = bouts.map((one) => one.reading as FightReading);
    return { subject: subject.id, foe, side, bouts: readings.length, wins: readings.filter((r) => r.won).length, draws: readings.filter((r) => r.score === .5).length,
      score: readings.length ? readings.reduce((sum, r) => sum + r.score, 0) / readings.length : null };
  })));
  return {
    lines: ["| Subject | Opponent | Side | Bouts | Wins | Draws | Score |", "|---|---|---|---|---|---|---|",
      ...rows.map((r) => `| ${r.subject} | ${r.foe} | ${r.side} | ${r.bouts} | ${r.wins} | ${r.draws} | ${r.score === null ? "-" : r.score.toFixed(2)} |`)],
    json: rows as unknown as Json,
  };
}

export const BASELINE: Evaluation<Json, BaselineReading, BuiltCase> = {
  id: "baseline",
  title: "The baseline evaluation",
  group: "fighters",
  question: "What can one mind's configuration do on the Warrior: walk, punch, stand up and fight?",
  protocols: BASELINE_CASES,
  defaultProtocol: "walk",
  every: true,
  schedule: "all",
  analysis: {},
  subjects: (choice) => {
    const chosen = mindSubjects(choice, ["kinetic"]);
    if (chosen.length !== 1) throw new Error("the baseline reads one mind");
    return chosen;
  },
  figures: [
    ...partFigures<LocomotionReading>("walk", LOCOMOTION_FIGURES),
    ...partFigures<StrikeReading>("punch", STRIKE_FIGURES),
    ...partFigures<FallReading>("stand-up", STAND_FIGURES),
    ...partFigures<FightReading>("fight", FIGHT_FIGURES),
  ],
  summary(table) {
    const part = table.cases[0]?.reading.part;
    switch (part) {
      case "walk": return locomotionSummary(table as unknown as Table<LocomotionCondition, LocomotionReading>);
      case "punch": return STRIKE.summary(table as unknown as Table<StrikeCondition, StrikeReading>);
      case "stand-up": return fallSummary(table as unknown as Table<Json, FallReading>, false);
      case "fight": return fightSummary(table);
      case undefined: return { lines: [], json: null };
      default: { const never: never = part; throw new Error(`no baseline competence ${String(never)}`); }
    }
  },
};
