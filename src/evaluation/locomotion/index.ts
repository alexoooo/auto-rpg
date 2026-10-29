/**
 * **The Locomotion drill**: does a mind's body walk where it is told, at the pace told, stop when
 * told, and keep its feet when shoved? A lone body under the subject's mind, given orders and
 * shoves by a script (`cases.ts`), its gaits the ones its mind chooses for them. The subject is a
 * mind that takes orders.
 */
import type { AttributeOverrides } from "../../core/character-attributes.ts";
import { CONTROLLERS, MINDS } from "../../core/mind/controllers.ts";
import type { BodyModel } from "../../core/models.ts";
import { recordingKey } from "../../core/recording.ts";
import { mindSubject, type Evaluation, type Figure, type Json, type Subject, type SubjectChoice, type Table } from "../evaluation.ts";
import type { BuiltLone } from "../lone.ts";
import { sha256Text } from "../sha256.ts";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltSegment } from "../../core/build/build-body.ts";
import type { Orders } from "../../core/mind/orders.ts";
import { LOCOMOTION_CASES, scriptOf, type LocomotionCondition } from "./cases.ts";
import type { LocomotionReading } from "./read.ts";

/**
 * A mind given whole as a subject: a config, or `{ mind, character, models }`, a config with the
 * character its bodies take and the bodies it is calibrated for, as a preset names them.
 */
function givenMind(id: string, label: string, value: Json): Subject {
  const given = value as { readonly mind?: Json; readonly character?: AttributeOverrides; readonly models?: readonly BodyModel[] } | null;
  return given && typeof given === "object" && !Array.isArray(given) && given.mind !== undefined
    ? mindSubject(id, label, given.mind, { ...(given.character ? { character: given.character } : {}), ...(given.models ? { models: given.models } : {}) })
    : mindSubject(id, label, value);
}

/** A mind named or given whole, as a subject: a preset (its calibration and character), a kind's defaults, or a config (`givenMind`). */
export function mindSubjects(choice: SubjectChoice, none: readonly string[]): readonly Subject[] {
  return (choice.length > 0 ? choice : none).map((one) => typeof one !== "string" ? givenMind(one.id, one.label, one.value)
    : Object.hasOwn(MINDS, one) ? mindSubject(one, MINDS[one]!.label, MINDS[one]!.config as unknown as Json, MINDS[one])
    : Object.hasOwn(CONTROLLERS, one) ? mindSubject(one, CONTROLLERS[one]!.label, CONTROLLERS[one]!.defaults as unknown as Json)
    : (() => { throw new Error(`${one} is no mind: name a mind (${Object.keys(MINDS).join(", ")}), a kind (${Object.keys(CONTROLLERS).join(", ")}), or a config`); })());
}

/** Whether a walk came to its pace: along within 0.8 to 1.25 of it, under a quarter of it across, on its feet. */
export const onPace = (r: LocomotionReading): boolean => !r.fell && r.along !== null && r.across !== null && r.along >= .8 && r.along <= 1.25 && Math.abs(r.across) < .25;

/** A figure of the trials of `kinds` alone: null on another kind. */
const only = <T>(kinds: readonly LocomotionReading["kind"][], of: (r: LocomotionReading) => T) => (r: LocomotionReading): T | null => kinds.includes(r.kind) ? of(r) : null;

/** The drill's figures, each of the kinds of trial it reads. */
export const LOCOMOTION_FIGURES: readonly Figure<LocomotionReading>[] = [
  { name: "held", unit: "share of trials on its feet throughout", kind: "rate", better: "higher", of: (r) => !r.fell },
  { name: "on pace", unit: "share of walks 0.8 to 1.25 of the pace along, under a quarter across", kind: "rate", better: "higher", of: only(["walk"], onPace) },
  { name: "stopped", unit: "share of walks, runs and turns standing still at the end", kind: "rate", better: "higher", of: only(["walk", "run", "turn"], (r) => r.stopped) },
  { name: "top speed", unit: "m/s over a second of a run or a turn, the median", kind: "median", better: "higher", of: only(["run", "turn"], (r) => r.top) },
  { name: "shoves held", unit: "share of shoves, standing and after a walk", kind: "rate", better: "higher", of: only(["shove", "shoved-walk"], (r) => !r.fell) },
];

/** What `condition` was, in a few words. */
export const trialText = (condition: LocomotionCondition): string => {
  switch (condition.kind) {
    case "walk": return `walk ${condition.way}° at ${condition.pace} m/s`;
    case "run": return "run";
    case "turn": return `turn ${condition.way}°`;
    case "shove": return `shove ${condition.impulse} N s from ${condition.way}°`;
    case "shoved-walk": return `shove ${condition.impulse} N s from ${condition.way}° after a walk`;
    default: { const never: never = condition; throw new Error(`no locomotion trial ${JSON.stringify(never)}`); }
  }
};

/** Each subject's trials as a table, in the conditions' order. */
export function locomotionSummary({ subjects, cases }: Table<LocomotionCondition, LocomotionReading>): { lines: readonly string[]; json: Json } {
  const f = (x: number | null, d = 2) => x === null ? "-" : x.toFixed(d);
  return {
    lines: subjects.flatMap((subject) => [
      `${subject.label} (${sha256Text(recordingKey(subject.value)).slice(0, 16)})`, "",
      "| Model | Trial | Fell, s | Along | Across | Top, m/s | Stopped | Moved, m |", "|---|---|---|---|---|---|---|---|",
      ...cases.filter((one) => one.subjects[0] === subject.id).map(({ condition: c, reading: r }) =>
        `| ${c.model} | ${trialText(c)} | ${f(r.fellAt)} | ${f(r.along)} | ${f(r.across)} | ${f(r.top)} | ${r.stopped ? "yes" : "no"} | ${f(r.moved)} |`),
      "",
    ]),
    json: cases.map(({ subjects: [subject], condition, reading }) => ({ subject, trial: trialText(condition), model: condition.model, fell: reading.fell, stopped: reading.stopped })) as unknown as Json,
  };
}

/** The orders `condition`'s script has given by `time`, s: its last cue at or before then that gives any; none before the first. */
function ordersAt(condition: LocomotionCondition, time: number): Orders | null {
  let orders: Orders | null = null;
  for (const cue of scriptOf(condition).cues) if (cue.at <= time && cue.orders !== undefined) orders = cue.orders;
  return orders;
}

/** The lone body's root segment: the one no joint moves. */
function rootOf(built: BuiltLone): BuiltSegment {
  const spec = built.body.built.spec, name = spec.segments.find((segment) => !spec.joints.some((joint) => joint.child === segment.name))!.name;
  return built.body.built.segments.get(name)!;
}

/** The root's velocity, world, m/s, into a vector made once. */
const rootVelocity = (() => { const out = new Vector3(); return (built: BuiltLone): Vector3 => rootOf(built).body.linearVelocityToRef(out); })();

/** The ground direction the body is ordered to move, unit; null where it is ordered to stop or not ordered. */
function orderedWay(built: BuiltLone, condition: LocomotionCondition): { readonly x: number; readonly z: number; readonly pace: number } | null {
  const orders = ordersAt(condition, built.world.time), move = orders?.move;
  if (move?.kind !== "direct") return null;
  const length = Math.sqrt(move.direction.x * move.direction.x + move.direction.z * move.direction.z);
  return length > 0 ? { x: move.direction.x / length, z: move.direction.z / length, pace: orders?.pace ?? 0 } : null;
}

export const LOCOMOTION: Evaluation<LocomotionCondition, LocomotionReading, BuiltLone> = {
  id: "locomotion",
  title: "The Locomotion drill",
  group: "skills",
  question: "Does a mind's body walk where and as fast as it is told, stop when told, and keep its feet when shoved?",
  protocols: LOCOMOTION_CASES,
  defaultProtocol: "screen",
  schedule: "all",
  analysis: {},
  subjects: (choice) => mindSubjects(choice, ["option"]),
  figures: LOCOMOTION_FIGURES,
  /**
   * A learning environment's percepts, each a second: `progress`, its root's speed along the ordered
   * way, to the order's pace where it names one (0 unordered); `halt`, less its ground
   * speed where it is not ordered to move (0 ordered); `upright`, its root's up.
   */
  percepts: {
    progress: (built, condition) => {
      const way = orderedWay(built, condition), velocity = rootVelocity(built);
      if (!way) return 0;
      const toward = velocity.x * way.x + velocity.z * way.z;
      return way.pace > 0 ? Math.min(toward, way.pace) : toward;
    },
    halt: (built, condition) => {
      if (orderedWay(built, condition)) return 0;
      const velocity = rootVelocity(built);
      return -Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    },
    upright: (built) => { const turn = rootOf(built).node.rotationQuaternion!; return 1 - 2 * (turn.x * turn.x + turn.z * turn.z); },
  },
  outcome: (r) => ({ label: r.fell ? "fell" : r.stopped ? "stood" : "moving", passed: !r.fell }),
  summary: locomotionSummary,
};
