/**
 * **The standard match**: does one mind beat another, each on each side, over the protocol's
 * bodies, loadouts, levels and gaps? A claim names the match's digest.
 */
import { loadoutKey } from "../../core/items/held.ts";
import { CONTROLLERS, MINDS } from "../../core/mind/controllers.ts";
import { recordingKey } from "../../core/recording.ts";
import type { Side } from "../../core/spec/body.ts";
import type { Evaluation, Json, Subject, Table } from "../evaluation.ts";
import { sha256Text } from "../sha256.ts";
import { CONTEST_FIGURES, type BoutReading } from "../contest.ts";
import { MATCH_CASES, type MatchCondition } from "./cases.ts";

const digest = (value: Json | string): string => sha256Text(typeof value === "string" ? value : recordingKey(value)).slice(0, 16);

/** A mind as a subject: its id, the label shown, and its config whole. */
const mindSubject = (id: string, label: string, value: Json, models?: readonly string[]): Subject =>
  ({ id, label, parts: [{ id: `mind:${id}`, value }], value, ...(models === undefined ? {} : { models }) });

type Bout = Table<MatchCondition, BoutReading>["cases"][number];

/** A's score over `bouts` (a win 1, a draw a half), and its bouts, wins, draws and losses. */
function tally(bouts: readonly { bout: Bout; a: Side }[]) {
  const t = { bouts: bouts.length, wins: 0, draws: 0, losses: 0 };
  for (const { bout, a } of bouts) bout.reading.winner === null ? t.draws++ : bout.reading.winner === a ? t.wins++ : t.losses++;
  return { ...t, score: t.bouts ? (t.wins + t.draws / 2) / t.bouts : null };
}

export const MATCH: Evaluation<MatchCondition, BoutReading> = {
  id: "match",
  title: "The standard match",
  group: "fighters",
  question: "Does one mind beat another, each on each side, over fixed bodies, loadouts, levels and gaps?",
  protocols: MATCH_CASES,
  defaultProtocol: "standard",
  schedule: "all",
  analysis: {},
  subjects(choice) {
    if (choice.length !== 2) throw new Error("a match is of two minds");
    return choice.map((one) => typeof one !== "string" ? mindSubject(one.id, one.label, one.value)
      : Object.hasOwn(MINDS, one) ? mindSubject(one, MINDS[one].label, MINDS[one].config as unknown as Json, MINDS[one].models)
      : Object.hasOwn(CONTROLLERS, one) ? mindSubject(one, CONTROLLERS[one].label, CONTROLLERS[one].defaults as unknown as Json)
      : (() => { throw new Error(`${one} is no mind: name a mind (${Object.keys(MINDS).join(", ")}), a kind (${Object.keys(CONTROLLERS).join(", ")}), or a config`); })());
  },
  figures: CONTEST_FIGURES,
  /**
   * The match's digest over its bouts' digests with the first mind on the left, then the second,
   * each in the conditions' order; each mind's digest; and the first mind's score by what the
   * protocol varies.
   */
  summary({ subjects, cases }) {
    const [a, b] = subjects;
    const bouts = [...cases.filter((bout) => bout.subjects[0] === a.id), ...cases.filter((bout) => bout.subjects[0] === b.id)]
      .map((bout) => ({ bout, a: (bout.subjects[0] === a.id ? "left" : "right") as Side }));
    const other = (side: Side): Side => side === "left" ? "right" : "left";
    const by = (key: (one: { bout: Bout; a: Side }) => string) =>
      Object.fromEntries([...new Set(bouts.map(key))].map((k) => [k, tally(bouts.filter((one) => key(one) === k))]));
    const score = {
      all: tally(bouts),
      side: by((one) => one.a),
      bodies: by(({ bout, a: side }) => `${bout.condition[side]} v ${bout.condition[other(side)]}`),
      loadout: by(({ bout }) => loadoutKey(bout.condition.loadout)),
      level: by(({ bout }) => bout.condition.level),
      gap: by(({ bout }) => `${bout.condition.level} ${bout.condition.gap}`),
      ending: by(({ bout, a: side }) => bout.reading.winner === null ? "draw" : `${bout.reading.winner === side ? "won" : "lost"} by ${bout.reading.ending}`),
    };
    const match = digest(bouts.map(({ bout }) => bout.digest).join());
    const lines = [
      `match ${match}`,
      `a: ${a.label} (${digest(a.value)}); b: ${b.label} (${digest(b.value)})`,
      "",
      "| a's body | b's body | Hands (left,right) | Level | Gap, m | a's side | Winner | Ending | Seconds | Blows | a's bar | b's bar |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|",
      ...bouts.map(({ bout: { condition: c, reading: r }, a: side }) => {
        const bars = { left: r.bars[0], right: r.bars[1] };
        return `| ${c[side]} | ${c[other(side)]} | ${loadoutKey(c.loadout)} | ${c.level} | ${c.gap} | ${side} | ${r.winner === null ? "draw" : r.winner === side ? "a" : "b"} | ${r.ending} | ${r.seconds.toFixed(1)} | ${r.blows} | ${bars[side].toFixed(2)} | ${bars[other(side)].toFixed(2)} |`;
      }),
      "",
      "a's score (a win 1, a draw a half), by what the protocol varies:",
      "",
      "| Over | Bouts | Won | Drawn | Lost | Score |",
      "|---|---|---|---|---|---|",
      ...Object.entries(score).flatMap(([over, table]) => Object.entries(over === "all" ? { all: table } : table).map(([key, t]) =>
        `| ${over === "all" ? "all" : `${over}: ${key}`} | ${t.bouts} | ${t.wins} | ${t.draws} | ${t.losses} | ${t.score!.toFixed(3)} |`)),
    ];
    return { lines, json: { digest: match, minds: { a: { label: a.label, digest: digest(a.value) }, b: { label: b.label, digest: digest(b.value) } }, score } as unknown as Json };
  },
};
