/**
 * **The buckler task**: does a defender's cover put the buckler in a sword's way before its body?
 * The Duellist with sword and buckler, facing its attacker head on and 45 degrees either way, is
 * swung at the head, the trunk and the sword arm, with and without its own swing under way. The
 * subject is the defender's cover; the reference is the Duellist's.
 */
import { MINDS } from "../../core/mind/controllers.ts";
import { recordingKey } from "../../core/recording.ts";
import type { Evaluation, Json, Subject } from "../evaluation.ts";
import { sha256Text } from "../sha256.ts";
import { BUCKLER_CASES, type BucklerCondition, type BucklerReading } from "./cases.ts";

/** A cover as a subject. */
const coverSubject = (id: string, label: string, value: Json): Subject => ({ id, label, parts: [{ id: `cover:${id}`, value }], value });

/** The cover of mind `id`, a fighter's whose tactics have one. */
function coverOf(id: string): Json {
  const tactics = (MINDS[id]?.config as { tactics?: { list?: readonly { kind: string }[] } } | undefined)?.tactics;
  const cover = tactics?.list?.find((behaviour) => behaviour.kind === "cover");
  if (!cover) throw new Error(`${id} is no mind with a cover: name one (${Object.keys(MINDS).join(", ")}), or give a cover as JSON`);
  return cover as unknown as Json;
}

/** A case's summary: its swings, those that touched the defender, those the buckler met first, the wound taken and what each touched first. */
export function bucklerSummary(reading: BucklerReading) {
  const touched = reading.swings.filter((swing) => swing.touched);
  return { swings: reading.swings.length, touched: touched.length, met: touched.filter((swing) => swing.met).length,
    wound: reading.swings.reduce((sum, swing) => sum + swing.wound, 0), firsts: touched.map((swing) => swing.first), down: reading.down };
}

export const BUCKLER: Evaluation<BucklerCondition, BucklerReading> = {
  id: "buckler",
  title: "The buckler task",
  group: "skills",
  question: "Does a defender's cover put the buckler in a sword's way before its body, by facing, target and its own swing?",
  protocols: BUCKLER_CASES,
  defaultProtocol: "standard",
  schedule: "all",
  analysis: {},
  /** The covers named: a mind's by its id, or a cover given whole. None names the Duellist's. */
  subjects(choice) {
    return (choice.length > 0 ? choice : ["duellist"]).map((one) => typeof one !== "string" ? coverSubject(one.id, one.label, one.value)
      : coverSubject(one, `${MINDS[one]?.label ?? one}'s cover`, coverOf(one)));
  },
  figures: [
    { name: "met first", unit: "share of swings that touched", kind: "mean", better: "higher", of: (r) => { const s = bucklerSummary(r); return s.touched ? s.met / s.touched : null; } },
    { name: "wound", unit: "HP", kind: "mean", better: "lower", of: (r) => bucklerSummary(r).wound },
    { name: "down", unit: "share of cases", kind: "rate", better: "lower", of: (r) => r.down },
  ],
  /** Each subject's cases as a table, then the buckler's share of swings met first by defender and own swing. */
  summary({ subjects, cases }) {
    const rows = cases.map(({ subjects: [id], condition, reading }) => ({ subject: id, ...condition, ...bucklerSummary(reading) }));
    const totals = subjects.flatMap((subject) => {
      const mine = rows.filter((row) => row.subject === subject.id);
      return [...new Set(mine.map((row) => `${row.model} ${row.own}`))].map((held) => mine.filter((row) => `${row.model} ${row.own}` === held));
    }).map((these) => {
      return { subject: these[0].subject, model: these[0].model, own: these[0].own, met: these.reduce((sum, row) => sum + row.met, 0), touched: these.reduce((sum, row) => sum + row.touched, 0) };
    });
    return {
      lines: subjects.flatMap((subject) => [
        `${subject.label} (${sha256Text(recordingKey(subject.value)).slice(0, 16)}): ${recordingKey(subject.value)}`, "",
        "| Defender | Angle | At | Own cut | Swings | Touched | Met first | Wound, HP | First touches | Down |", "|---|---|---|---|---|---|---|---|---|---|",
        ...rows.filter((row) => row.subject === subject.id).map((s) =>
          `| ${s.model} | ${s.angle} | ${s.at} | ${s.own} | ${s.swings} | ${s.touched} | ${s.met} | ${s.wound.toFixed(3)} | ${s.firsts.join(", ")} | ${s.down} |`),
        "", "| Defender | Own swing under way | Met first / touched |", "|---|---|---|",
        ...totals.filter((total) => total.subject === subject.id).map((t) =>
          `| ${t.model} | ${t.own ? "yes" : "no"} | ${t.met} / ${t.touched}${t.touched ? ` (${(100 * t.met / t.touched).toFixed(0)} %)` : ""} |`),
        "",
      ]),
      json: { cases: rows, totals } as unknown as Json,
    };
  },
};
