/**
 * **The Strike drill**: does a strike skill, thrown once from where the striker stands, land on
 * the mark it was asked, and come back without felling the striker? Each rung is a protocol (rung
 * 0, `still`: a still target), its trials laid out by body, mark, hand, offset and range. The
 * subject is a mind and one of its actions (`puncher/strike`); the drill puts its own tactics in
 * the mind's tactics slot, so the skill, its executor's settings and the body's other parts are
 * the mind's.
 */
import { MINDS } from "../../core/mind/controllers.ts";
import { recordingKey } from "../../core/recording.ts";
import type { Evaluation, Json, Subject } from "../evaluation.ts";
import { sha256Text } from "../sha256.ts";
import { STRIKE_CASES, type StrikeCondition, type StrikeReading } from "./cases.ts";

/** The strikes drilled when none is named: each empty-handed strike skill of the fighting minds. */
const DRILLED = ["puncher/strike", "scrapper/straight", "scrapper/cross", "duellist/swing high", "vanguard-warrior/strike"];

/** A preset's action as a subject: `<mind>/<action>`, its parts the mind's config and the action's name. */
function actionSubject(name: string): Subject {
  const slash = name.indexOf("/"), id = slash < 0 ? name : name.slice(0, slash), preset = Object.hasOwn(MINDS, id) ? MINDS[id]! : null;
  if (!preset) throw new Error(`${name} is no strike: name a mind and its action, <mind>/<action> (${Object.keys(MINDS).join(", ")})`);
  const config = preset.config as { readonly actions?: readonly { readonly name: string }[] }, actions = (config.actions ?? []).map((action) => action.name);
  const action = slash < 0 ? actions[0] : name.slice(slash + 1);
  if (action === undefined || !actions.includes(action)) throw new Error(`${id} has no action ${action ?? ""}: one of ${actions.join(", ") || "none"}`);
  const value = { mind: preset.config as unknown as Json, action };
  return { id: `${id}/${action}`, label: `${preset.label}: ${action}`, parts: [{ id: `mind:${id}`, value: value.mind }, { id: "action", value: action }], value,
    ...(preset.models === undefined ? {} : { models: preset.models }) };
}

/** What the strip shows a trial as: its outcome, and whether it passed (landed, the striker on its feet). */
export const strikeOutcome = (reading: StrikeReading) => ({ label: reading.outcome, passed: reading.outcome === "landed" });

export const STRIKE: Evaluation<StrikeCondition, StrikeReading> = {
  id: "strike",
  title: "The Strike drill",
  group: "skills",
  question: "Does a strike skill, thrown once from where the striker stands, land on its mark and come back without felling the striker?",
  protocols: STRIKE_CASES,
  defaultProtocol: "still",
  schedule: "all",
  analysis: {},
  subjects(choice) {
    return (choice.length > 0 ? choice : DRILLED).map((one) => typeof one !== "string" ? { id: one.id, label: one.label, parts: [{ id: `strike:${one.id}`, value: one.value }], value: one.value }
      : actionSubject(one));
  },
  outcome: strikeOutcome,
  figures: [
    { name: "landed", unit: "share of trials", kind: "rate", better: "higher", of: (r) => r.outcome === "landed" },
    { name: "admitted", unit: "share of trials", kind: "rate", better: "higher", of: (r) => r.began !== null },
    { name: "to contact", unit: "s from the commitment, the median landed", kind: "median", better: "lower", of: (r) => r.hit && r.committed !== null ? r.hit.time - r.committed : null },
    { name: "closing", unit: "m/s, the median landed", kind: "median", better: "higher", of: (r) => r.hit?.closing ?? null },
    { name: "energy", unit: "J, the median landed", kind: "median", better: "higher", of: (r) => r.hit?.energy ?? null },
    { name: "return", unit: "s from the release, the median", kind: "median", better: "lower", of: (r) => r.released !== null && r.ended !== null ? r.ended - r.released : null },
    { name: "fell", unit: "share of trials", kind: "rate", better: "lower", of: (r) => r.down },
  ],
  /** Each subject's trials as a table, in the conditions' order. */
  summary({ subjects, cases }) {
    const f = (x: number | null | undefined, d = 2) => x === null || x === undefined ? "-" : x.toFixed(d);
    const rows = cases.map(({ subjects: [id], condition, reading }) => ({ subject: id, ...condition, ...reading }));
    return {
      lines: subjects.flatMap((subject) => [
        `${subject.label} (${sha256Text(recordingKey(subject.value)).slice(0, 16)})`, "",
        "| Model | Mark | Hand | Across, m | Gap, m | Outcome | Reason | Committed, s | To contact, s | Closing, m/s | Energy, J | Return, s |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
        ...rows.filter((row) => row.subject === subject.id).map((r) =>
          `| ${r.model} | ${r.mark} | ${r.hand} | ${r.across} | ${r.gap} | ${r.outcome} | ${r.reason || "-"} | ${f(r.committed)} | ${f(r.hit && r.committed !== null ? r.hit.time - r.committed : null)} | ${f(r.hit?.closing)} | ${f(r.hit?.energy)} | ${f(r.released !== null && r.ended !== null ? r.ended - r.released : null)} |`),
        "",
      ]),
      json: rows.map(({ subject, model, mark, hand, across, gap, outcome }) => ({ subject, model, mark, hand, across, gap, outcome })) as unknown as Json,
    };
  },
};
