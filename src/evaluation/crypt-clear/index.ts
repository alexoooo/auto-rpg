/**
 * **The Crypt-clearing task**: does a party Commander clear generated Crypt levels by itself? Over
 * a fixed set of levels, against each enemy Commander, in repeated trials: the share cleared (a
 * standing member at the exit), the time taken, and the members lost. The subject is the party's
 * Commander; the reference is the level-clearer.
 */
import { COMMANDERS } from "../../core/command/commanders.ts";
import { recordingKey } from "../../core/recording.ts";
import type { Evaluation, Json, Subject } from "../evaluation.ts";
import { sha256Text } from "../sha256.ts";
import type { BuiltCrypt } from "../crypt.ts";
import { CRYPT_CLEAR_CASES, type CryptCondition, type ClearReading } from "./cases.ts";

/** A Commander as a subject. */
const commanderSubject = (id: string, label: string, value: Json): Subject => ({ id, label, parts: [{ id: `commander:${id}`, value }], value });

/** The median of `values`, or null for none. */
const median = (values: readonly number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

export const CRYPT_CLEAR: Evaluation<CryptCondition, ClearReading, BuiltCrypt> = {
  id: "crypt-clear",
  title: "Clearing the Crypt",
  group: "decisions",
  question: "Does a party Commander bring its party through generated Crypt levels to the exit, quickly and without losing members, against each enemy Commander?",
  protocols: CRYPT_CLEAR_CASES,
  defaultProtocol: "standard",
  schedule: "all",
  analysis: {},
  /** The Commanders named, by kind or given whole. None names the level-clearer. */
  subjects(choice) {
    return (choice.length > 0 ? choice : ["clearer"]).map((one) => typeof one !== "string" ? commanderSubject(one.id, one.label, one.value)
      : Object.hasOwn(COMMANDERS, one) ? commanderSubject(one, COMMANDERS[one]!.label, COMMANDERS[one]!.defaults as unknown as Json)
      : (() => { throw new Error(`${one} is no Commander: name a kind (${Object.keys(COMMANDERS).join(", ")}), or a config`); })());
  },
  figures: [
    { name: "cleared", unit: "share of runs", kind: "rate", better: "higher", of: (r) => r.status === "won" },
    { name: "time", unit: "s, of those cleared", kind: "median", better: "lower", of: (r) => r.status === "won" ? r.seconds : null },
    { name: "members lost", unit: "a run", kind: "mean", better: "lower", of: (r) => r.lost },
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
          "| Enemies | Runs | Cleared | Median time cleared, s | Members lost, mean | Foes defeated, mean share |", "|---|---|---|---|---|---|",
          ...kinds.map((kind) => {
            const of = own.filter((row) => row.against === kind);
            const mean = (values: readonly number[]) => values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
            return `| ${kind} | ${of.length} | ${of.filter((row) => row.status === "won").length}/${of.length} | ${median(of.filter((row) => row.status === "won").map((row) => row.seconds))?.toFixed(1) ?? "none"} | ${mean(of.map((row) => row.lost)).toFixed(2)} of ${of[0]?.members ?? 0} | ${mean(of.map((row) => row.enemies ? row.defeated / row.enemies : 0)).toFixed(2)} |`;
          }),
          "", "| Enemies | Level | Trial | Ended | Seconds | Members lost | Foes defeated |", "|---|---|---|---|---|---|---|",
          ...own.map((row) => `| ${row.against} | ${row.seed} | ${row.trial} | ${row.status} | ${row.seconds.toFixed(1)} | ${row.lost}/${row.members} | ${row.defeated}/${row.enemies} |`),
          "",
        ];
      }),
      json: rows as unknown as Json,
    };
  },
};
