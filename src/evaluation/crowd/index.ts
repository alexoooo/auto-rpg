/**
 * **The crowd task**: does a party keep its feet and get where it is sent with its own side's
 * bodies in the way, moving or fallen? A party reversed away from a resting enemy and back, one
 * body turned back under way, a leader turned back into its follower, paths crossing, a gap that
 * passes one at a time, and a fallen companion in the way, each on several seeds. The subject is
 * the members' mind; the reference is their model's own.
 */
import { CONTROLLERS, MINDS } from "../../entrants/game.ts";
import { recordingKey } from "../../core/recording.ts";
import type { CryptReading } from "../crypt.ts";
import { mindSubject, type Evaluation, type Json } from "../evaluation.ts";
import { sha256Text } from "../sha256.ts";
import { CROWD_CASES, CROWD_MIND, type CrowdCondition } from "./cases.ts";

export const CROWD: Evaluation<CrowdCondition, CryptReading> = {
  id: "crowd",
  title: "The crowd task",
  group: "skills",
  question: "Does a party keep its feet and get where it is sent, with its own side's bodies in the way, moving or fallen?",
  protocols: CROWD_CASES as unknown as Evaluation<CrowdCondition, CryptReading>["protocols"],
  defaultProtocol: "standard",
  schedule: "all",
  analysis: {},
  /** The minds named, by id or kind or given whole. None names the members' own (`modelInfo`). */
  subjects(choice) {
    return (choice.length > 0 ? choice : ["own"]).map((one) => typeof one !== "string" ? mindSubject(one.id, one.label, one.value)
      : one === "own" ? mindSubject("own", "The Warrior's own", CROWD_MIND as unknown as Json)
      : Object.hasOwn(MINDS, one) ? mindSubject(one, MINDS[one].label, MINDS[one].config as unknown as Json, { models: MINDS[one].models })
      : Object.hasOwn(CONTROLLERS, one) ? mindSubject(one, CONTROLLERS[one].label, CONTROLLERS[one].defaults as unknown as Json)
      : (() => { throw new Error(`${one} is no mind: name own, a mind (${Object.keys(MINDS).join(", ")}), a kind, or a config`); })());
  },
  figures: [
    { name: "no fall", unit: "share of cases", kind: "rate", better: "higher", of: (r) => r.falls.length === 0 },
    { name: "falls", unit: "a case", kind: "mean", better: "lower", of: (r) => r.falls.length },
    { name: "done", unit: "share of cases reached", kind: "rate", better: "higher", of: (r) => r.reached ? r.done !== null : null },
    { name: "not reached", unit: "share of cases", kind: "rate", better: "lower", of: (r) => !r.reached },
    { name: "time to done", unit: "s, of those done", kind: "median", better: "lower", of: (r) => r.done },
    { name: "members pushed apart", unit: "steps", kind: "mean", better: "lower", of: (r) => r.contactSteps },
    { name: "pushed on the fallen", unit: "steps", kind: "mean", better: "lower", of: (r) => r.fallenContactSteps },
  ],
  /** Each subject's cases as a table, in the conditions' order. */
  summary({ subjects, cases }) {
    const rows = cases.map(({ subjects: [id], condition, reading }) => ({ subject: id, ...condition, ...reading }));
    return {
      lines: subjects.flatMap((subject) => [
        `${subject.label} (${sha256Text(recordingKey(subject.value)).slice(0, 16)})`, "",
        "| Situation | Seed | Legs | Done, s | Falls | Members pushed apart, steps | On the fallen, steps |", "|---|---|---|---|---|---|---|",
        ...rows.filter((row) => row.subject === subject.id).map((row) =>
          `| ${row.situation} | ${row.seed} | ${row.legs}/${row.of} | ${row.done?.toFixed(2) ?? (row.reached ? "not done" : "not reached")} | ${row.falls.map((fall) => `${fall.member} ${fall.time.toFixed(2)}`).join(", ") || "none"} | ${row.contactSteps} | ${row.fallenContactSteps} |`),
        "",
      ]),
      json: rows as unknown as Json,
    };
  },
};
