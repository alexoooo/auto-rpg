import { describeMind } from "../../minds/catalog/catalog.ts";
import { isRefused } from "../../core/refusal.ts";
/**
 * **The Strike drill**: does a strike skill, thrown once, land on
 * the mark it was asked, and come back without felling the striker? Each rung is a protocol (rung
 * 0, `still`: a still target, and `sampled`, its starts drawn at random, moving or still; rung 1, `moving`: a pad carried on a rail; rungs 2 to 4, `stepping`, `guarding`, `punching`: a drill opponent;
 * rung 5, `walk`: one walked to, asked settled or still walking), its trials laid out by body, mark, hand, offset and range. The
 * subject is a mind and one of its skills (`option/straight-punch`), and what its striker holds where
 * it names a loadout (`option/bonk@buckler,club`, its left hand first); a drill Commander
 * (`DrillCommanderConfig`) orders the skill, so the skill, its executor's settings and the body's
 * other parts are the mind's.
 */
import type { AttributeOverrides } from "../../core/bodies/character-attributes.ts";
import { BODY_MODELS, modelHoldingChecked } from "../../core/bodies/models.ts";
import { HELD, loadoutFaults, loadoutKey, type Held, type Loadout } from "../../core/bodies/items/held.ts";
import { recordingKey } from "../../core/world/recording.ts";
import { mindSubject, type Evaluation, type Json, type Subject, type SubjectChoice } from "../evaluation.ts";
import { sha256Text } from "../sha256.ts";
import type { StrikeReading } from "./read.ts";
import { barScore, releasedScore } from "./score.ts";
import { createStrikeCases, limbOf, type StrikeCondition } from "./cases.ts";
import { type GameContext } from "../../game/arena/context.ts";

/** Where a trial was thrown: the still rung's offset and gap (and its target, and how it moves, where it names them), or a fight's foe and moment. */
const whereOf = (condition: StrikeCondition) => "foe" in condition ? `${condition.foe}, moment ${condition.moment}`
  : `${condition.target ? `${condition.target}, ` : ""}${condition.direction ? `moving ${condition.direction} at ${condition.speed} m/s, ` : ""}${condition.approach ? `moving ${condition.approach.way} degrees off the line at ${condition.approach.speed} m/s for ${condition.approach.seconds} s, ` : ""}across ${condition.across} m, gap ${condition.gap} m${condition.start ? `, ${condition.start}` : ""}`;

/** The strike drilled when none is named: Option Mind's straight punch. */
const DRILLED = ["option/straight-punch"];

/**
 * A subject given whole (a file or JSON): its mind and skill, and the character its bodies take
 * where it names one (`character`, as a preset's).
 */
function givenSubject(one: Exclude<SubjectChoice[number], string>): Subject {
  const value = one.value as { readonly mind: Json; readonly character?: AttributeOverrides };
  const subject = mindSubject(one.id, one.label, value.mind, { ...one, character: one.character ?? value.character });
  return { ...subject, value: one.value };
}

/** The loadout `key` names, its left hand first (`buckler,club`), as `loadoutKey` writes it. */
function loadoutNamed(key: string): Loadout {
  const [left, right, ...more] = key.split(",");
  const loadout = { left: left as Held, right: right as Held }, faults = more.length || right === undefined ? ["name both hands, left first"] : loadoutFaults(loadout);
  if (faults.length) throw new Error(`${key} is no loadout: ${faults.join("; ")} (${HELD.join(", ")})`);
  return loadout;
}

/** Contact outcomes and diagnostic failures; an observation with incomplete motion coverage cannot pass. */
const strikeOutcome = (reading: StrikeReading) => {
  if (reading.motion?.chatter) return { label: "uncontrolled", passed: false };
  if (reading.motion && reading.began !== null) return { label: "unverified", passed: false };
  return { label: reading.outcome, passed: reading.outcome === "landed" };
};

export function createStrikeIndex(context: GameContext) {
  const { minds: MINDS } = context.catalog;
  const { STRIKE_CASES } = createStrikeCases(context);

  /** A strike named (`<mind>/<skill>`, `skillSubject`) or given whole (`givenSubject`), as a subject; `none` where nothing is named. */
  const strikeSubjects = (choice: SubjectChoice, none: readonly string[]): readonly Subject[] =>
    (choice.length > 0 ? choice : none).map((one) => typeof one !== "string" ? givenSubject(one) : skillSubject(one));

  /**
   * A preset's strike as a subject: `<mind>/<skill>`, a skill its Options strike by, its parts the
   * mind's config and the skill; with `@<left>,<right>`, its striker holding that loadout, a part of its own.
   */
  function skillSubject(name: string): Subject {
    const at = name.lastIndexOf("@"), named = at < 0 ? name : name.slice(0, at), held = at < 0 ? undefined : loadoutNamed(name.slice(at + 1));
    const slash = named.indexOf("/"), id = slash < 0 ? named : named.slice(0, slash), preset = Object.hasOwn(MINDS, id) ? MINDS[id]! : null;
    if (!preset) throw new Error(`${name} is no strike: name a mind and its skill, <mind>/<skill>[@<left>,<right>] (${Object.keys(MINDS).join(", ")})`);
    const skills: readonly string[] = [...new Set(BODY_MODELS.filter(model => !preset.models || preset.models.includes(model)).flatMap(model => {
      const spec = modelHoldingChecked(model, held ?? { left: "empty", right: "empty" }, preset.character);
      if (isRefused(spec)) return [];
      return describeMind(context.catalog, spec, preset.config)?.executors.map(executor => executor.kind) ?? [];
    }))];
    const skill = slash < 0 ? skills[0] : named.slice(slash + 1);
    if (skill === undefined || !skills.includes(skill)) throw new Error(`${id} has no skill ${skill ?? ""}: one of ${skills.join(", ") || "none"}`);
    const value = { mind: preset.config as unknown as Json, skill, ...(held === undefined ? {} : { held }) };
    const subject = mindSubject(id, preset.label, value.mind, preset), holding = held === undefined ? "" : loadoutKey(held);
    return { ...subject, id: `${id}/${skill}${held === undefined ? "" : `@${holding}`}`, label: `${preset.label}: ${skill}${held === undefined ? "" : `, holding ${holding}`}`, value };
  }

  const STRIKE: Evaluation<StrikeCondition, StrikeReading> = {
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
     * A learning environment's terms: the human-reference comparison score, a bonk's as its swing
     * lets go (`releasedScore`), whether the completed
     * action landed physically, and, where
     * the limb met nothing on the mark, how far short of its aim it stayed at its nearest, m, to 0.5.
     */
    terms: {
      score: (reading, condition) => barScore(reading, "hand" in condition ? condition.hand : null),
      released: (reading) => releasedScore(reading),
      met: (reading) => reading.outcome === "landed" ? 1 : 0,
      short: (reading) => reading.hit ? 0 : Math.min(reading.nearest ?? Infinity, .5),
    },
    /**
     * A learning environment's percepts, each a second: `unmet`, how many fields of their last goal
     * the striker's legs left undone (`LegsReport.unmet`), 0 for a mind that runs no skills.
     */
    percepts: {
      unmet: (built) => built.duel.duelists.left.minded.skills?.report.legs.unmet.fields.length ?? 0,
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
      { name: "unobstructed wrist chatter", unit: "share of observed swings", kind: "rate", better: "lower", of: (r) => r.motion?.chatter ?? null },
      { name: "settled at ownership release", unit: "share of observed releases", kind: "rate", better: "higher", of: (r) => r.motion?.guard.settledAtRelease ?? null },
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
          ...rows.filter(row => row.subject === subject.id && row.motion).flatMap(row => [
            `${row.mark}: motion observation; course, clearance and physical stroke-end coverage incomplete.`, "",
            "| Executor phase | From, s | To, s | Club travel, deg | Chest travel, deg | Largest wrist reversal lower bound, deg | Contact steps |",
            "|---|---|---|---|---|---|---|",
            ...row.motion!.intervals.map(interval => `| ${interval.label} | ${f(interval.from)} | ${f(interval.to)} | ${f(interval.clubTravel * 180 / Math.PI)} | ${f(interval.chestTravel * 180 / Math.PI)} | ${f(Math.max(...interval.wrist.map(channel => channel.leastReversal)) * 180 / Math.PI)} | ${interval.contactSteps} |`),
            "", `Settled at ownership release: ${row.motion!.guard.settledAtRelease ?? "unreached"}; verified guard hold at ${f(row.motion!.guard.recovered)} s.`, "",
          ]),
        ]),
        json: rows.map(({ subject, model, mark, limb, where, outcome }) => ({ subject, model, mark, limb, where, outcome })) as unknown as Json,
      };
    },
  };

  return { strikeSubjects, STRIKE };
}
