/**
 * **The Crypt-clearing task**: how well does a party Commander bring the hero through generated
 * Crypt levels by itself? Over a fixed set of levels, against each enemy Commander, in repeated
 * trials: the score (`scoreOf`: life at the end less the time's price), the life at the end, the
 * share cleared (the hero standing at the exit) and the time taken. The subject is the party's
 * Commander; the reference is the level-clearer.
 */
import { commanderOf } from "../../core/command/commander.ts";
import { COMMANDERS } from "../../core/command/commanders.ts";
import { recordingKey } from "../../core/recording.ts";
import type { Evaluation, Json, Subject } from "../evaluation.ts";
import { sha256Text } from "../sha256.ts";
import type { BuiltCrypt } from "../crypt.ts";
import { CRYPT_CLEAR_CASES, type CryptCondition, type ClearReading } from "./cases.ts";
import { medianOf } from "../stats.ts";

/** A Commander as a subject. */
const commanderSubject = (id: string, label: string, value: Json): Subject => ({ id, label, parts: [{ id: `commander:${id}`, value }], value });

export const CRYPT_CLEAR: Evaluation<CryptCondition, ClearReading, BuiltCrypt> = {
  id: "crypt-clear",
  title: "Clearing the Crypt",
  group: "decisions",
  question: "How much life does a party Commander bring the hero to the exit of generated Crypt levels with, less a price on the time it takes, against each enemy Commander?",
  protocols: CRYPT_CLEAR_CASES,
  defaultProtocol: "alone",
  schedule: "all",
  analysis: {},
  /** The Commanders named, by kind or given whole. None names the level-clearer. */
  subjects(choice) {
    return (choice.length > 0 ? choice : ["clearer"]).map((one) => typeof one !== "string" ? commanderSubject(one.id, one.label, one.value)
      : commanderOf(one) ? commanderSubject(one, commanderOf(one)!.label, commanderOf(one)!.defaults as unknown as Json)
      : (() => { throw new Error(`${one} is no Commander: name a kind (${Object.keys(COMMANDERS).join(", ")}), or a config`); })());
  },
  figures: [
    { name: "score", unit: "share of full life", kind: "mean", better: "higher", of: (r) => r.score },
    { name: "life", unit: "share of full life, at the end", kind: "mean", better: "higher", of: (r) => r.life },
    { name: "cleared", unit: "share of runs", kind: "rate", better: "higher", of: (r) => r.status === "won" },
    { name: "time", unit: "s, of those cleared", kind: "median", better: "lower", of: (r) => r.status === "won" ? r.seconds : null },
    { name: "foes defeated", unit: "share of the level's", kind: "mean", better: "higher", of: (r) => r.enemies ? r.defeated / r.enemies : null },
  ],
  /** Each subject's runs, by enemy Commander, then each run in the conditions' order. */
  summary({ subjects, cases }) {
    const rows = cases.map(({ subjects: [id], condition, reading }) => ({ subject: id, seed: condition.seed, trial: condition.trial, against: condition.enemies.kind, ...reading }));
    const kinds = [...new Set(rows.map((row) => row.against))];
    return {
      lines: subjects.flatMap((subject) => {
        const own = rows.filter((row) => row.subject === subject.id);
        return [
          `${subject.label} (${sha256Text(recordingKey(subject.value)).slice(0, 16)})`, "",
          "| Enemies | Runs | Score, mean | Life at the end, mean | Cleared | Median time cleared, s | Foes defeated, mean share |", "|---|---|---|---|---|---|---|",
          ...kinds.map((kind) => {
            const of = own.filter((row) => row.against === kind);
            const mean = (values: readonly number[]) => values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
            return `| ${kind} | ${of.length} | ${mean(of.map((row) => row.score)).toFixed(3)} | ${mean(of.map((row) => row.life)).toFixed(3)} | ${of.filter((row) => row.status === "won").length}/${of.length} | ${medianOf(of.filter((row) => row.status === "won").map((row) => row.seconds))?.toFixed(1) ?? "none"} | ${mean(of.map((row) => row.enemies ? row.defeated / row.enemies : 0)).toFixed(2)} |`;
          }),
          "", "| Enemies | Level | Trial | Ended | Score | Life | Seconds | Route left, m, of | Pace, m/s | Foes defeated |", "|---|---|---|---|---|---|---|---|---|---|",
          ...own.map((row) => `| ${row.against} | ${row.seed} | ${row.trial} | ${row.status} | ${row.score.toFixed(3)} | ${row.life.toFixed(3)} | ${row.seconds.toFixed(1)} | ${row.left.toFixed(1)} of ${row.route.toFixed(1)} | ${row.pace.toFixed(2)} | ${row.defeated}/${row.enemies} |`),
          "",
        ];
      }),
      json: rows as unknown as Json,
    };
  },
};
