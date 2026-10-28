/**
 * **The Strike drill**: does a strike skill, thrown once, land on
 * the mark it was asked, and come back without felling the striker? Each rung is a protocol (rung
 * 0, `still`: a still target; rung 5, `walk`: one walked to, asked settled or still walking), its trials laid out by body, mark, hand, offset and range. The
 * subject is a mind and one of its actions (`puncher/strike`); the drill puts its own tactics in
 * the mind's tactics slot, so the skill, its executor's settings and the body's other parts are
 * the mind's.
 */
import type { AttributeOverrides } from "../../core/character-attributes.ts";
import { MINDS } from "../../core/mind/controllers.ts";
import { recordingKey } from "../../core/recording.ts";
import { mindSubject, type Evaluation, type Json, type Subject } from "../evaluation.ts";
import { sha256Text } from "../sha256.ts";
import { STRIKE_CASES, type StrikeCondition } from "./cases.ts";

/** Where a trial was thrown: the still rung's offset and gap, or a fight's foe and moment. */
const whereOf = (condition: StrikeCondition) => "foe" in condition ? `${condition.foe}, moment ${condition.moment}`
  : `across ${condition.across} m, gap ${condition.gap} m${condition.start ? `, ${condition.start}` : ""}`;
import type { StrikeReading } from "./read.ts";

/** The strikes drilled when none is named: each empty-handed strike skill of the fighting minds. */
const DRILLED = ["puncher/strike", "duellist/swing high", "vanguard-warrior/strike"];

/**
 * A subject given whole (a file or JSON): its mind and action, and the character its bodies take
 * where it names one (`character`, as a preset's).
 */
function givenSubject(one: { readonly id: string; readonly label: string; readonly value: Json }): Subject {
  const character = (one.value as { readonly character?: AttributeOverrides } | null)?.character;
  return { id: one.id, label: one.label, parts: [{ id: `strike:${one.id}`, value: one.value }], value: one.value, ...(character === undefined ? {} : { character }) };
}

/** A preset's action as a subject: `<mind>/<action>`, its parts the mind's config and the action's name. */
function actionSubject(name: string): Subject {
  const slash = name.indexOf("/"), id = slash < 0 ? name : name.slice(0, slash), preset = Object.hasOwn(MINDS, id) ? MINDS[id]! : null;
  if (!preset) throw new Error(`${name} is no strike: name a mind and its action, <mind>/<action> (${Object.keys(MINDS).join(", ")})`);
  const config = preset.config as { readonly actions?: readonly { readonly name: string }[] }, actions = (config.actions ?? []).map((action) => action.name);
  const action = slash < 0 ? actions[0] : name.slice(slash + 1);
  if (action === undefined || !actions.includes(action)) throw new Error(`${id} has no action ${action ?? ""}: one of ${actions.join(", ") || "none"}`);
  const value = { mind: preset.config as unknown as Json, action };
  const subject = mindSubject(id, preset.label, value.mind, preset);
  return { ...subject, id: `${id}/${action}`, label: `${preset.label}: ${action}`, parts: [...subject.parts, { id: "action", value: action }], value };
}

/** What the strip shows a trial as: its outcome, and whether it passed (landed, the striker on its feet). */
export const strikeOutcome = (reading: StrikeReading) => ({ label: reading.outcome, passed: reading.outcome === "landed" });

export const STRIKE: Evaluation<StrikeCondition, StrikeReading> = {
  id: "strike",
  title: "The Strike drill",
  group: "skills",
  question: "Does a strike skill, thrown once, land on its mark and come back without felling the striker?",
  protocols: STRIKE_CASES,
  defaultProtocol: "still",
  schedule: "all",
  analysis: {},
  subjects(choice) {
    return (choice.length > 0 ? choice : DRILLED).map((one) => typeof one !== "string" ? givenSubject(one) : actionSubject(one));
  },
  outcome: strikeOutcome,
  figures: [
    { name: "landed", unit: "share of trials", kind: "rate", better: "higher", of: (r) => r.outcome === "landed" },
    { name: "landed on the body", unit: "share of blows that met the target past its arms", kind: "rate", better: "higher",
      of: (r) => r.outcome === "landed" || r.outcome === "weak" || r.outcome === "elsewhere" ? r.outcome === "landed" : null },
    { name: "admitted", unit: "share of trials", kind: "rate", better: "higher", of: (r) => r.began !== null },
    { name: "to contact", unit: "s from the action's start to the mark, the median", kind: "median", better: "lower", of: (r) => r.hit && r.began !== null ? r.hit.time - r.began : null },
    { name: "from ready", unit: "s from the first step the drill was ready to the mark, the median", kind: "median", better: "lower", of: (r) => r.hit && r.ready !== null ? r.hit.time - r.ready : null },
    { name: "speed", unit: "m/s over the fist's last 0.1 m to the mark, the median", kind: "median", better: "higher", of: (r) => r.hit?.speed ?? null },
    { name: "mass", unit: "kg the fist met on its own side, the median", kind: "median", better: "higher", of: (r) => r.hit?.kg ?? null },
    { name: "energy", unit: "J on the mark, the median", kind: "median", better: "higher", of: (r) => r.hit?.energy ?? null },
    { name: "return", unit: "s from the release, the median", kind: "median", better: "lower", of: (r) => r.released !== null && r.ended !== null ? r.ended - r.released : null },
    { name: "fell", unit: "share of trials", kind: "rate", better: "lower", of: (r) => r.down },
  ],
  /** Each subject's trials as a table, in the conditions' order. */
  summary({ subjects, cases }) {
    const f = (x: number | null | undefined, d = 2) => x === null || x === undefined ? "-" : x.toFixed(d);
    const rows = cases.map(({ subjects: [id], condition, reading }) => ({ subject: id, ...reading, model: condition.model, mark: condition.mark, hand: condition.hand, where: whereOf(condition) }));
    return {
      lines: subjects.flatMap((subject) => [
        `${subject.label} (${sha256Text(recordingKey(subject.value)).slice(0, 16)})`, "",
        "| Model | Mark | Hand | Where | Outcome | Reason | To contact, s | Speed, m/s | Mass, kg | Straight, cos | Energy, J | Return, s |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
        ...rows.filter((row) => row.subject === subject.id).map((r) =>
          `| ${r.model} | ${r.mark} | ${r.hand} | ${r.where} | ${r.outcome} | ${r.reason || "-"} | ${f(r.hit && r.began !== null ? r.hit.time - r.began : null)} | ${f(r.hit?.speed)} | ${f(r.hit?.kg)} | ${f(r.hit?.straight)} | ${f(r.hit?.energy)} | ${f(r.released !== null && r.ended !== null ? r.ended - r.released : null)} |`),
        "",
      ]),
      json: rows.map(({ subject, model, mark, hand, where, outcome }) => ({ subject, model, mark, hand, where, outcome })) as unknown as Json,
    };
  },
};
