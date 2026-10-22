/**
 * **The tournament**: how strong is each entrant (a mind on a character with a loadout) against
 * the field? Rated by Bradley-Terry on the Elo scale, the field's mean 1500, every game at once.
 * Its schedule is a panel (`versus`); the whole field is played only when the owner asks.
 */
import { CONTEST_FIGURES, type BoutReading } from "../contest.ts";
import type { Evaluation, Table } from "../evaluation.ts";
import { ratingTable, type Game } from "../rating.ts";
import { TOURNAMENT_CASES, type TournamentCondition } from "./cases.ts";
import { entrantSubjects } from "./entrants.ts";

/** Each subject's rating over a table's bouts. */
export function tableRatings({ subjects, cases }: Pick<Table<TournamentCondition, BoutReading>, "subjects" | "cases">) {
  const index = new Map(subjects.map((subject, k) => [subject.id, k]));
  const games: Game[] = cases.map(({ subjects: [left, right], reading }) => ({ i: index.get(left)!, j: index.get(right)!, score: reading.score }));
  return ratingTable(subjects.map((subject) => subject.id), games);
}

export const TOURNAMENT: Evaluation<TournamentCondition, BoutReading> = {
  id: "tournament",
  title: "The tournament",
  group: "fighters",
  question: "How strong is each entrant, a mind on a character with a loadout, against the field?",
  protocols: TOURNAMENT_CASES,
  defaultProtocol: "standard",
  schedule: "versus",
  analysis: {},
  subjects: entrantSubjects,
  figures: CONTEST_FIGURES,
  /** Each subject's rating over the table, its interval and its record, best first. */
  summary(table) {
    const rated = tableRatings(table);
    return {
      lines: [
        "Bradley-Terry on the Elo scale over these bouts, the mean 1500, with its 95 % interval:", "",
        "| | Entrant | Rating | 95 % | Bouts | Won | Drawn | Lost |", "|---|---|---|---|---|---|---|---|",
        ...rated.map((one, k) => `| ${k + 1} | ${one.id} | ${one.rating.toFixed(0)} | ${one.interval.map((x) => x.toFixed(0)).join("-")} | ${one.bouts} | ${one.wins} | ${one.draws} | ${one.losses} |`),
      ],
      json: rated.map((one) => ({ ...one, interval: [...one.interval] })),
    };
  },
};
