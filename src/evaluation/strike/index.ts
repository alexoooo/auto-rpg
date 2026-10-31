/**
 * **The Strike drill**: does a strike skill, thrown once, land on
 * the mark it was asked, and come back without felling the striker? Each rung is a protocol (rung
 * 0, `still`: a still target; rung 1, `moving`: a pad carried on a rail; rungs 2 to 4, `stepping`, `guarding`, `punching`: a drill opponent;
 * rung 5, `walk`: one walked to, asked settled or still walking), its trials laid out by body, mark, hand, offset and range. The
 * subject is a mind and one of its actions (`puncher/strike`), and what its striker holds where
 * it names a loadout (`vanguard-warrior/strike@buckler,empty`, its left hand first); the drill puts its own tactics in
 * the mind's tactics slot, so the skill, its executor's settings and the body's other parts are
 * the mind's.
 */
import type { AttributeOverrides } from "../../core/character-attributes.ts";
import { MINDS } from "../../entrants/game.ts";
import { HELD, loadoutFaults, loadoutKey, type Held, type Loadout } from "../../core/items/held.ts";
import { recordingKey } from "../../core/recording.ts";
import { mindSubject, type Evaluation, type Json, type Subject, type SubjectChoice } from "../evaluation.ts";
import { sha256Text } from "../sha256.ts";
import { limbOf, STRIKE_CASES, type StrikeCondition } from "./cases.ts";

/** Where a trial was thrown: the still rung's offset and gap (and its target, and how it moves, where it names them), or a fight's foe and moment. */
const whereOf = (condition: StrikeCondition) => "foe" in condition ? `${condition.foe}, moment ${condition.moment}`
  : `${condition.target ? `${condition.target}, ` : ""}${condition.direction ? `moving ${condition.direction} at ${condition.speed} m/s, ` : ""}across ${condition.across} m, gap ${condition.gap} m${condition.start ? `, ${condition.start}` : ""}`;
import { meetsBar, type StrikeReading } from "./read.ts";
import { barScore } from "./score.ts";

/** The strikes drilled when none is named: each empty-handed strike skill of the fighting minds. */
const DRILLED = ["puncher/strike", "vanguard-warrior/strike"];

/**
 * A subject given whole (a file or JSON): its mind and action, and the character its bodies take
 * where it names one (`character`, as a preset's).
 */
function givenSubject(one: { readonly id: string; readonly label: string; readonly value: Json }): Subject {
  const character = (one.value as { readonly character?: AttributeOverrides } | null)?.character;
  return { id: one.id, label: one.label, parts: [{ id: `strike:${one.id}`, value: one.value }], value: one.value, ...(character === undefined ? {} : { character }) };
}

/** The loadout `key` names, its left hand first (`buckler,club`), as `loadoutKey` writes it. */
function loadoutNamed(key: string): Loadout {
  const [left, right, ...more] = key.split(",");
  const loadout = { left: left as Held, right: right as Held }, faults = more.length || right === undefined ? ["name both hands, left first"] : loadoutFaults(loadout);
  if (faults.length) throw new Error(`${key} is no loadout: ${faults.join("; ")} (${HELD.join(", ")})`);
  return loadout;
}

/** A strike named (`<mind>/<action>`, `actionSubject`) or given whole (`givenSubject`), as a subject; `none` where nothing is named. */
export const strikeSubjects = (choice: SubjectChoice, none: readonly string[]): readonly Subject[] =>
  (choice.length > 0 ? choice : none).map((one) => typeof one !== "string" ? givenSubject(one) : actionSubject(one));

/**
 * A preset's action as a subject: `<mind>/<action>`, its parts the mind's config and the action's
 * name; with `@<left>,<right>`, its striker holding that loadout, a part of its own.
 */
function actionSubject(name: string): Subject {
  const at = name.lastIndexOf("@"), named = at < 0 ? name : name.slice(0, at), held = at < 0 ? undefined : loadoutNamed(name.slice(at + 1));
  const slash = named.indexOf("/"), id = slash < 0 ? named : named.slice(0, slash), preset = Object.hasOwn(MINDS, id) ? MINDS[id]! : null;
  if (!preset) throw new Error(`${name} is no strike: name a mind and its action, <mind>/<action>[@<left>,<right>] (${Object.keys(MINDS).join(", ")})`);
  const config = preset.config as { readonly actions?: readonly { readonly name: string }[] }, actions = (config.actions ?? []).map((action) => action.name);
  const action = slash < 0 ? actions[0] : named.slice(slash + 1);
  if (action === undefined || !actions.includes(action)) throw new Error(`${id} has no action ${action ?? ""}: one of ${actions.join(", ") || "none"}`);
  const value = { mind: preset.config as unknown as Json, action, ...(held === undefined ? {} : { held }) };
  const subject = mindSubject(id, preset.label, value.mind, preset), holding = held === undefined ? "" : loadoutKey(held);
  return { ...subject, id: `${id}/${action}${held === undefined ? "" : `@${holding}`}`, label: `${preset.label}: ${action}${held === undefined ? "" : `, holding ${holding}`}`,
    parts: [...subject.parts, { id: "action", value: action }, ...(held === undefined ? [] : [{ id: "held", value: held }])], value };
}

/**
 * How near its aim the striking limb came for the drill to say it reached it, m: a miss that came
 * this near found the target gone from where it aimed.
 */
const REACHED = .05;

/** The bar's tests a hit failed, in words (`meetsBar`). */
const failedTests = (hit: NonNullable<StrikeReading["hit"]>): string[] => ([["fast", "slow"], ["heavy", "light"], ["square", "glancing"], ["soon", "late"],
  ["lined", "across the arm"], ["extended", "the elbow bent"], ["upright", "leaning"], ["hard", "too little energy"]] as const)
  .filter(([test]) => hit[test] === false).map(([, words]) => words);

/**
 * Why a trial failed, in the drill's words: outside the entry condition (never admitted, the
 * reason its readiness gave), balance lost, blocked by the arms, the target moved (the limb reached
 * where it aimed and the target was not there), short of the aim, off the mark, short of the bar
 * (the tests it failed), or let go before it committed; undefined for one that passed.
 */
function whyFailed(reading: StrikeReading): string | undefined {
  switch (reading.outcome) {
    case "landed": return undefined;
    case "fell": return "balance lost: the striker fell";
    case "guarded": return "blocked: the limb met the target's arms alone";
    case "elsewhere": return `off the mark: the limb met the target's ${reading.contacts.find((one) => one.time >= (reading.began ?? 0))?.on ?? "body"}`;
    case "weak": return `short of the bar: ${reading.hit ? failedTests(reading.hit).join(", ") || "the action did not end" : "no hit"}`;
    case "missed": {
      // A record older than the reading's nearest approach does not say it.
      const nearest = reading.nearest ?? null;
      return nearest !== null && nearest <= REACHED ? "the target moved: the limb reached its aim and the target was not there"
        : `short of the aim${nearest === null ? "" : ` by ${nearest.toFixed(2)} m`}`;
    }
    case "abandoned": return "let go before it committed";
    case "outside": case "refused": case "waiting": case "unreached":
      return `outside the entry condition: ${reading.outcome === "unreached" ? "the fight never came to its moment" : `${reading.phase}${reading.reason ? `, ${reading.reason}` : ""}`}`;
    default: { const never: never = reading.outcome; return never; }
  }
}

/** What the strip shows a trial as: its outcome, whether it passed (landed, the striker on its feet), and why it failed (`whyFailed`). */
const strikeOutcome = (reading: StrikeReading) => {
  const why = whyFailed(reading);
  return { label: reading.outcome, passed: reading.outcome === "landed", ...(why === undefined ? {} : { why }) };
};

export const STRIKE: Evaluation<StrikeCondition, StrikeReading> = {
  id: "strike",
  title: "The Strike drill",
  group: "skills",
  question: "Does a strike skill, thrown once, land on its mark and come back without felling the striker?",
  protocols: STRIKE_CASES,
  defaultProtocol: "still",
  schedule: "all",
  analysis: {},
  subjects: (choice) => strikeSubjects(choice, DRILLED),
  outcome: strikeOutcome,
  /**
   * A learning environment's terms: the bar's score, a hit that meets every test counted landed
   * (the striker's standing left to the drill, `barScore`); whether it met them, 1 or 0; and, where
   * the limb met nothing on the mark, how far short of its aim it stayed at its nearest, m, to 0.5.
   */
  terms: {
    score: (reading, condition) => barScore(reading.hit !== null && meetsBar(reading.hit) ? { ...reading, outcome: "landed" } : reading, "hand" in condition ? condition.hand : null),
    met: (reading) => reading.hit !== null && meetsBar(reading.hit) ? 1 : 0,
    short: (reading) => reading.hit ? 0 : Math.min(reading.nearest ?? Infinity, .5),
  },
  /**
   * A learning environment's percepts, each a second: `unmet`, how many fields of their last goal
   * the striker's legs left undone (`SkillReport.legs`), 0 for a mind that runs no skills.
   */
  percepts: {
    unmet: (built) => built.duel.duelists.left.minded.skills?.report.legs.fields.length ?? 0,
  },
  figures: [
    { name: "landed", unit: "share of trials", kind: "rate", better: "higher", of: (r) => r.outcome === "landed" },
    { name: "landed on the body", unit: "share of blows that met the target past its arms", kind: "rate", better: "higher",
      of: (r) => r.outcome === "landed" || r.outcome === "weak" || r.outcome === "elsewhere" ? r.outcome === "landed" : null },
    { name: "admitted", unit: "share of trials", kind: "rate", better: "higher", of: (r) => r.began !== null },
    { name: "to contact", unit: "s from the action's start to the mark, the median", kind: "median", better: "lower", of: (r) => r.hit && r.began !== null ? r.hit.time - r.began : null },
    { name: "from ready", unit: "s from the first step the drill was ready to the mark, the median", kind: "median", better: "lower", of: (r) => r.hit && r.ready !== null ? r.hit.time - r.ready : null },
    { name: "speed", unit: "m/s over the striking point's last 0.1 m to the mark, the median", kind: "median", better: "higher", of: (r) => r.hit?.speed ?? null },
    { name: "mass", unit: "kg the striking limb met on its own side, the median", kind: "median", better: "higher", of: (r) => r.hit?.kg ?? null },
    { name: "energy", unit: "J on the mark, the median", kind: "median", better: "higher", of: (r) => r.hit?.energy ?? null },
    { name: "return", unit: "s from the release, the median", kind: "median", better: "lower", of: (r) => r.released !== null && r.ended !== null ? r.ended - r.released : null },
    { name: "fell", unit: "share of trials", kind: "rate", better: "lower", of: (r) => r.down },
    { name: "taken", unit: "hit points the striker lost in its contacts with the target, the mean", kind: "mean", better: "lower", of: (r) => r.taken ?? null },
  ],
  /** Each subject's trials as a table, in the conditions' order. */
  summary({ subjects, cases }) {
    const f = (x: number | null | undefined, d = 2) => x === null || x === undefined ? "-" : x.toFixed(d);
    const rows = cases.map(({ subjects: [id], condition, reading }) => ({ subject: id, ...reading, model: condition.model, mark: condition.mark, limb: limbOf(condition), where: whereOf(condition) }));
    return {
      lines: subjects.flatMap((subject) => [
        `${subject.label} (${sha256Text(recordingKey(subject.value)).slice(0, 16)})`, "",
        "| Model | Mark | Limb | Where | Outcome | Reason | To contact, s | Speed, m/s | Mass, kg | Straight, cos | Energy, J | Return, s |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
        ...rows.filter((row) => row.subject === subject.id).map((r) =>
          `| ${r.model} | ${r.mark} | ${r.limb} | ${r.where} | ${r.outcome} | ${r.reason || "-"} | ${f(r.hit && r.began !== null ? r.hit.time - r.began : null)} | ${f(r.hit?.speed)} | ${f(r.hit?.kg)} | ${f(r.hit?.straight)} | ${f(r.hit?.energy)} | ${f(r.released !== null && r.ended !== null ? r.ended - r.released : null)} |`),
        "",
      ]),
      json: rows.map(({ subject, model, mark, limb, where, outcome }) => ({ subject, model, mark, limb, where, outcome })) as unknown as Json,
    };
  },
};
