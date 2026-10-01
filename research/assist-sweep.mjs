/**
 * What balance does to how the arena's bouts end: every ordered pair of the core's bodies at each
 * starting gap, each bout to its verdict or the cap in a world of its own on a worker
 * (`bout-pool.mjs`), in three tables.
 *
 *   node research/assist-sweep.mjs [--even 0,10,25,50,100,200] [--shapes "0.01,0.0052;0,0.0026;0.01,0"]
 *     [--uneven "25:0,25:10,50:25"] [--gaps 3,3.2,3.4,3.6,3.8,4,4.2,4.4,4.6,4.8,5] [--workers 14]
 *
 * - **Even**: both sides at the same balance, each per cent the rulebook's. A row is a cell:
 *   its bouts by ending, the bout time, the falls and the wounding blows for each minute of it, the
 *   share at the cap, and the mean assist given a side; then the falls a minute and the mean given
 *   of each model in each cell.
 * - **Shapes**: both sides at `SHAPE_BALANCE` per cent, each per cent another force and moment
 *   (`DuelRecipe.balancePercent`: force in weights, moment in weight-metres), the same columns.
 * - **Uneven** (`more:less`): one side at the greater balance and the other at the lesser, each
 *   matchup both ways round: the share of decided bouts the side with more wins, and each side's
 *   falls a minute.
 *
 * A balance is a per cent of the body's weight (`AttributeSpec.balance`); a cell of the even and shapes tables is every
 * matchup at every gap, and of the uneven table twice that.
 */
import { parseArgs } from "node:util";
import { BODY_MODELS } from "../src/core/human/spec.ts";
import { SIDES } from "../src/arena/duel.ts";
import { BOUT_HARNESS } from "./bout.mjs";
import { defaultLanes, playBouts } from "./bout-pool.mjs";

/** The balance both sides have in the shapes table, %. */
const SHAPE_BALANCE = 100;

const { values } = parseArgs({ options: {
  even: { type: "string", default: "0,10,25,50,100,200" },
  shapes: { type: "string", default: "0.01,0.0052;0,0.0026;0.01,0" },
  uneven: { type: "string", default: "25:0,25:10,50:25" },
  gaps: { type: "string", default: "3,3.2,3.4,3.6,3.8,4,4.2,4.4,4.6,4.8,5" },
  workers: { type: "string" },
} });
const list = (text, separator) => text.split(separator).map((part) => part.trim()).filter((part) => part !== "");
const gaps = list(values.gaps, ",").map(Number);
const even = list(values.even, ",").map(Number);
const shapes = list(values.shapes, ";").map((shape) => { const [force, moment] = shape.split(",").map(Number); return { force, moment }; });
const uneven = list(values.uneven, ",").map((pair) => { const [more, less] = pair.split(":").map(Number); return { more, less }; });

/** Every matchup at every gap with `extra` in its recipe, each job tagged with its `cell`. */
const jobs = [];
function cellOf(cell, extra) {
  for (const gap of gaps) for (const left of BODY_MODELS) for (const right of BODY_MODELS) jobs.push({ cell, recipe: { left, right, gap, ...extra } });
}
even.forEach((balance, k) => cellOf(`even ${k}`, { balance: { left: balance, right: balance } }));
shapes.forEach((balancePercent, k) => cellOf(`shape ${k}`, { balance: { left: SHAPE_BALANCE, right: SHAPE_BALANCE }, balancePercent }));
uneven.forEach(({ more, less }, k) => {
  cellOf(`uneven ${k} left`, { balance: { left: more, right: less } });
  cellOf(`uneven ${k} right`, { balance: { left: less, right: more } });
});

const started = Date.now();
const played = await playBouts(jobs.map(({ recipe }) => ({ recipe })), Number(values.workers ?? defaultLanes()));
const rows = played.map((row, k) => ({ ...row, cell: jobs[k].cell }));
const rowsOf = (cell) => rows.filter((row) => row.cell === cell);
console.log(`${BOUT_HARNESS}; ${rows.length} bouts in ${((Date.now() - started) / 1000).toFixed(0)} s; ${BODY_MODELS.length ** 2} matchups at gaps of ${gaps.join(", ")} m, each to its verdict or the cap`);

const sum = (items, of) => items.reduce((total, item) => total + of(item), 0);
const minutesOf = (cellRows) => sum(cellRows, (row) => row.seconds) / 60;
const rate = (count, minutes) => minutes > 0 ? (count / minutes).toFixed(2) : "";
/** The mean a side was given over `cellRows`, [N, N m] as text: a side's mean, averaged over sides. */
const given = (cellRows, pick = () => true) => {
  const sides = cellRows.flatMap((row) => row.assist.filter((_, k) => pick(row, SIDES[k])));
  return sides.length ? [0, 1].map((part) => (sum(sides, (side) => side[part]) / sides.length).toFixed(1)) : ["", ""];
};
/** A cell's columns after its label: bouts by ending, time, rates, the cap's share, the mean given. */
function cellColumns(cellRows) {
  const minutes = minutesOf(cellRows), count = (is) => cellRows.filter(is).length;
  const fell = count((row) => row.ending === "fallen"), capped = count((row) => row.ending === "time" || row.ending === "none");
  const [force, moment] = given(cellRows);
  return `${cellRows.length} | ${fell} | ${cellRows.length - fell - capped} | ${capped} | ${(60 * minutes).toFixed(0)} | ${rate(sum(cellRows, (row) => row.fallen.length), minutes)} | ${rate(sum(cellRows, (row) => row.wounding), minutes)} | ${(100 * capped / cellRows.length).toFixed(0)} | ${force} | ${moment} |`;
}
const CELL_HEAD = "Bouts | End by a fall | By a wound | At the cap | Bout time, s | Falls a minute | Wounding blows a minute | At the cap, % | Mean given a side, N | Mean given, N m |";
const rule = (head) => head.split("|").slice(1, -1).map(() => "---").join("|");

if (even.length) {
  const head = `| Balance, % | ${CELL_HEAD}`;
  console.log(`\nEven: both sides at the same balance, each per cent the rulebook's.\n\n${head}\n|${rule(head)}|`);
  even.forEach((balance, k) => console.log(`| ${balance} | ${cellColumns(rowsOf(`even ${k}`))}`));
  const byModel = "| Balance, % | Model | Sides | Its bout time, s | Its falls | Its falls a minute | Mean given, N | Mean given, N m |";
  console.log(`\nEven, by model: a model's sides are every side it fought on, and its bout time those bouts' (a mirror counts twice).\n\n${byModel}\n|${rule(byModel)}|`);
  even.forEach((balance, k) => {
    for (const model of BODY_MODELS) {
      const its = rowsOf(`even ${k}`).flatMap((row) => SIDES.filter((side) => row.recipe[side] === model).map((side) => ({ row, side })));
      const minutes = sum(its, ({ row }) => row.seconds) / 60, falls = its.filter(({ row, side }) => row.fallen.includes(side)).length;
      const [force, moment] = given(rowsOf(`even ${k}`), (row, side) => row.recipe[side] === model);
      console.log(`| ${balance} | ${model} | ${its.length} | ${(60 * minutes).toFixed(0)} | ${falls} | ${rate(falls, minutes)} | ${force} | ${moment} |`);
    }
  });
}

if (shapes.length) {
  const head = `| Balance, % | A per cent's force, weights | A per cent's moment, weight-metres | ${CELL_HEAD}`;
  console.log(`\nShapes: both sides at ${SHAPE_BALANCE} %, each per cent another force and moment.\n\n${head}\n|${rule(head)}|`);
  shapes.forEach(({ force, moment }, k) => console.log(`| ${SHAPE_BALANCE} | ${force} | ${moment} | ${cellColumns(rowsOf(`shape ${k}`))}`));
}

if (uneven.length) {
  const head = "| More, % | Less, % | Bouts | Decided | Won by the side with more | Its share of the decided, % | Falls a minute: the side with more | The side with less | At the cap | Mean given the side with more, N | N m | The side with less, N | N m |";
  console.log(`\nUneven: one side at the greater balance, each matchup both ways round.\n\n${head}\n|${rule(head)}|`);
  uneven.forEach(({ more, less }, k) => {
    const sided = SIDES.flatMap((side) => rowsOf(`uneven ${k} ${side}`).map((row) => ({ row, more: side, less: SIDES.find((other) => other !== side) })));
    const minutes = sum(sided, ({ row }) => row.seconds) / 60;
    const decided = sided.filter(({ row }) => row.winner !== null), won = decided.filter(({ row, more: side }) => row.winner === side).length;
    const falls = (which) => sided.filter((bout) => bout.row.fallen.includes(bout[which])).length;
    const capped = sided.filter(({ row }) => row.ending === "time" || row.ending === "none").length;
    const mean = (which) => [0, 1].map((part) => (sum(sided, (bout) => bout.row.assist[SIDES.indexOf(bout[which])][part]) / sided.length).toFixed(1));
    console.log(`| ${more} | ${less} | ${sided.length} | ${decided.length} | ${won} | ${decided.length ? (100 * won / decided.length).toFixed(0) : ""} | ${rate(falls("more"), minutes)} | ${rate(falls("less"), minutes)} | ${capped} | ${mean("more").join(" | ")} | ${mean("less").join(" | ")} |`);
  });
}
