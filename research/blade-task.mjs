/**
 * **The blade task** (Node, core world, Rapier, 120 Hz, Balance 0): a standing striker with sword
 * and buckler whose only blow is one action of its sword hand at one mark (`high`, `middle`,
 * `legs`): the blade's cut or thrust, or the recipe strike's swing (`swing`), against a
 * standing Warrior with empty hands that only stands, on the open stage, for `seconds`, and on until
 * the swing under way has returned if a blow ended the fight. Each blow of the striker's blade on the
 * target's body is read: the closing speed at contact (driven, before the contact's own impulse),
 * the energy and wound the rules give, the region and mechanism; each action, when it committed and
 * released, how it ended and how long its return took; and whether the striker was down within 2 s
 * of a blow. A swing's cut is the hardest blow of the blade's mechanism on the trunk or head from
 * its commitment to its end; one that met none there cut nothing.
 *
 *   node research/blade-task.mjs [--models workshop-fighter,workshop-rogue] [--styles cut,thrust,swing] [--marks high,middle,legs] [--seconds 12] [--tuning '{"contactSpeed":3}']
 */
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { buildBout } from "../src/evaluation/bout.ts";
import { BOUT_ENGINE } from "./bout.mjs";
import { BEHAVIOURS, CLASSIC, FIGHTING } from "../src/core/mind/config.ts";
import { deepFreeze } from "../src/core/state.ts";

/** Who is struck: a Warrior with empty hands that stands in guard and throws nothing. */
export const STANDS = deepFreeze({ ...CLASSIC, tactics: { kind: "stand" }, actions: [], executors: [] });

/** How far apart the two start, m: a step inside the blade's reach, so the striker steps in to its window. */
const GAP = 1.4;

/** How long after a blow the striker counts as felled by it, s. */
const FELLED = 2;

/** How long the task runs on past its time or the fight's end for the swing under way to return, s. */
const RETURN = 2;

/** The executor each style is thrown by. */
const KINDS = Object.freeze({ cut: "blade-cut", thrust: "blade-thrust", swing: "recipe-strike" });

/** A striker whose only blow is `style` (`KINDS`) at `mark`, with the executor's `tuning` over its defaults. */
export function bladeStriker(style, mark, tuning) {
  const kind = KINDS[style];
  if (!kind) throw new Error(`no style ${style}: one of ${Object.keys(KINDS).join(", ")}`);
  return deepFreeze({ ...BEHAVIOURS, tactics: { ...FIGHTING, choose: { kind: "rotate", rethink: .2, patience: 2 }, list: [{ kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "cover" }] },
    executors: [{ kind, name: kind, ...(tuning ? { tuning } : {}) }],
    actions: [{ name: style, executor: kind, effectors: ["hand.right"], regions: [{ kind: "mark", mark }], aim: { kind: "centre", lead: 0 } }] });
}

/** The task for one striker `model`, `style` and `mark`: its blows on the target and its actions. */
export async function bladeTask({ model = "workshop-fighter", style = "cut", mark = "middle", seconds = 12, tuning } = {}) {
  const { world, duel, dispose } = await buildBout({ left: model, right: "workshop-fighter", gap: GAP, capSeconds: seconds + 1, recoverySeconds: null,
    loadouts: { left: { left: "buckler", right: "sword" }, right: { left: "empty", right: "empty" } },
    minds: { left: bladeStriker(style, mark, tuning), right: STANDS } }, { engine: BOUT_ENGINE });
  try {
    duel.play([]);
    const striker = duel.duelists.left, skills = striker.minded.skills, commits = new Map(), releases = new Map(), downs = [];
    let stop = null;
    while (stop === null || (world.time < stop && skills.report.actions.length > 0)) {
      world.step();
      for (const action of skills.report.actions) {
        if (action.phase === "commit" && !commits.has(action.id)) commits.set(action.id, world.time);
        if (action.phase === "release" && !releases.has(action.id)) releases.set(action.id, world.time);
      }
      if (striker.body.down) downs.push(world.time);
      if (stop === null && (world.time >= seconds || duel.verdict)) stop = world.time + RETURN;
    }
    const blows = duel.blows.filter((blow) => blow.kind === "impact" && blow.sides.some((side) => side.fighter === "left" && side.item === "short sword")
      && blow.sides.some((side) => side.fighter === "right" && side.item === null)).map((blow) => {
      const blade = blow.sides.find((side) => side.fighter === "left"), body = blow.sides.find((side) => side.fighter === "right");
      return { time: blow.time, closing: blow.closing, energy: blow.energy, region: blade.region ?? null, segment: body.segment, mechanism: body.mechanism ?? "blunt",
        damage: body.damage, felled: downs.some((t) => t >= blow.time && t <= blow.time + FELLED) };
    });
    const actions = skills.report.ledger.map((record) => ({ ending: record.ending.kind, committed: commits.get(record.id) ?? null, released: releases.get(record.id) ?? null,
      began: record.began, ended: record.ended, returned: releases.has(record.id) ? record.ended - releases.get(record.id) : null }));
    return { model, style, mark, seconds: world.time, blows, actions, down: striker.body.down, harness: "Node, core world, Rapier, 120 Hz, Balance 0" };
  } finally { dispose(); }
}

const median = (values) => { const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1; return sorted.length ? (sorted[mid] + sorted[(sorted.length - 1) >> 1]) / 2 : null; };

/** Whether `segment` is the trunk's or the head's. */
const upper = (segment) => /^(head|neck|pelvis)|Trunk$/.test(segment);

/**
 * A cell's summary: of its committed swings, how many cut (`aligned`), and the median cut's closing
 * speed and energy, a swing that cut nothing counted as none; the wound its cuts did; its actions'
 * endings and longest return; and whether the striker fell.
 */
export function bladeSummary(row) {
  const mechanism = row.style === "thrust" ? "point" : "edge", swings = row.actions.filter((action) => action.committed !== null);
  const cuts = swings.map((swing) => row.blows.filter((blow) => blow.time >= swing.committed && blow.time <= swing.ended && upper(blow.segment) && blow.mechanism === mechanism)
    .reduce((best, blow) => best === null || blow.energy > best.energy ? blow : best, null));
  const returns = row.actions.map((action) => action.returned).filter((value) => value !== null);
  return { model: row.model, style: row.style, mark: row.mark, blows: row.blows.length, upper: row.blows.filter((blow) => upper(blow.segment)).length,
    swings: swings.length, aligned: cuts.filter((cut) => cut !== null).length,
    closing: median(cuts.map((cut) => cut?.closing ?? 0)), energy: median(cuts.map((cut) => cut?.energy ?? 0)), damage: cuts.reduce((sum, cut) => sum + (cut?.damage ?? 0), 0),
    actions: row.actions.length, completed: row.actions.filter((action) => action.ending === "completed").length,
    longestReturn: returns.length ? Math.max(...returns) : null, felled: row.blows.some((blow) => blow.felled) || row.down };
}

async function main() {
  const { values } = parseArgs({ options: { models: { type: "string", default: "workshop-fighter,workshop-rogue" }, styles: { type: "string", default: "cut,thrust" },
    marks: { type: "string", default: "high,middle" }, seconds: { type: "string", default: "12" }, tuning: { type: "string" }, json: { type: "boolean", default: false } } });
  const tuning = values.tuning ? JSON.parse(values.tuning) : undefined;
  console.log(`Node, core world, Rapier, 120 Hz, Balance 0; tuning ${JSON.stringify(tuning ?? {})}`);
  console.log("| Model | Style | Mark | Blows | On trunk/head | Swings | Cut | Median closing, m/s | Median energy, J | Damage, HP | Actions | Completed | Longest return, s | Felled |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const model of values.models.split(",")) for (const style of values.styles.split(",")) for (const mark of values.marks.split(",")) {
    const row = await bladeTask({ model, style, mark, seconds: Number(values.seconds), tuning }), s = bladeSummary(row);
    if (values.json) console.log(JSON.stringify(row));
    const f = (x, d = 2) => x === null ? "-" : x.toFixed(d);
    console.log(`| ${model} | ${style} | ${mark} | ${s.blows} | ${s.upper} | ${s.swings} | ${s.aligned} | ${f(s.closing)} | ${f(s.energy)} | ${f(s.damage, 3)} | ${s.actions} | ${s.completed} | ${f(s.longestReturn)} | ${s.felled} |`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
