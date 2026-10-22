/**
 * **The unseen report**: how far does a mind carry to a loadout no mind is rated on? Each mind on
 * each character and unrated loadout it fits, against the Duellist with sword and buckler on the
 * same character, on each side. Beside the tournament's ratings, never in them.
 */
import { loadoutKey } from "../../core/items/held.ts";
import { CONTROLLERS, MINDS } from "../../core/mind/controllers.ts";
import { partOf } from "../../core/mind/catalog.ts";
import type { Evaluation, Json, Subject } from "../evaluation.ts";
import { UNSEEN_CASES, type UnseenCondition, type UnseenReading } from "./cases.ts";

/** A mind as a subject. */
const mindSubject = (id: string, label: string, value: Json): Subject => ({ id, label, parts: [{ id: `mind:${id}`, value }], value });

export const UNSEEN: Evaluation<UnseenCondition, UnseenReading> = {
  id: "unseen",
  title: "The unseen report",
  group: "fighters",
  question: "How far does a mind carry to a loadout no mind is rated on?",
  protocols: UNSEEN_CASES,
  defaultProtocol: "standard",
  schedule: "all",
  analysis: {},
  /** The minds named, or every game mind a person may pick (`Part.stage`) that fits an unrated loadout on some character. */
  subjects(choice) {
    const subjects = (choice.length > 0 ? choice : Object.keys(MINDS).filter((id) => partOf(MINDS[id]!.config).stage === "game")).map((one) => typeof one !== "string" ? mindSubject(one.id, one.label, one.value)
      : Object.hasOwn(MINDS, one) ? mindSubject(one, MINDS[one].label, MINDS[one].config as unknown as Json)
      : Object.hasOwn(CONTROLLERS, one) ? mindSubject(one, CONTROLLERS[one].label, CONTROLLERS[one].defaults as unknown as Json)
      : (() => { throw new Error(`${one} is no mind`); })());
    const cases = UNSEEN_CASES.standard;
    return choice.length > 0 ? subjects : subjects.filter((subject) => cases.conditions.some((condition) => cases.faults!(subject.value, condition).length === 0));
  },
  figures: [
    { name: "won", unit: "share of bouts", kind: "rate", better: "higher", of: (r) => r.winner === r.side },
    { name: "drawn", unit: "share of bouts", kind: "rate", better: "higher", of: (r) => r.winner === null },
    { name: "lost", unit: "share of bouts", kind: "rate", better: "lower", of: (r) => r.winner !== null && r.winner !== r.side },
  ],
  /** Each mind's won, drawn and lost on each character and loadout. */
  summary({ subjects, cases }) {
    const rows = subjects.flatMap((subject) => {
      const mine = cases.filter((one) => one.subjects[0] === subject.id);
      const keys = [...new Set(mine.map(({ condition }) => `${condition.model} ${loadoutKey(condition.loadout)}`))];
      return keys.map((key) => {
        const these = mine.filter(({ condition }) => `${condition.model} ${loadoutKey(condition.loadout)}` === key).map(({ reading }) => reading);
        const won = these.filter((r) => r.winner === r.side).length, drawn = these.filter((r) => r.winner === null).length;
        return { mind: subject.id, on: key, bouts: these.length, won, drawn, lost: these.length - won - drawn };
      });
    });
    return {
      lines: ["| Mind | Character and hands | Bouts | Won | Drawn | Lost |", "|---|---|---|---|---|---|",
        ...rows.map((row) => `| ${row.mind} | ${row.on} | ${row.bouts} | ${row.won} | ${row.drawn} | ${row.lost} |`)],
      json: rows,
    };
  },
};
