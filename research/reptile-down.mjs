// Arena bouts with a reptile on the left (Node, core world, Rapier, 120 Hz): when it is first
// down, and how each bout ends. `node research/reptile-down.mjs [--shard i --of n]` prints one JSON
// row a bout, the grid below cut into `n` shards by index.
import { parseArgs } from "node:util";
import { buildBout } from "./bout.mjs";
import { readMinds } from "../src/arena/matchup.ts";

const { values } = parseArgs({ options: { shard: { type: "string", default: "0" }, of: { type: "string", default: "1" } } });
const shard = Number(values.shard), of = Number(values.of);

/** The reptile against each humanoid controller, with and without a club, and against itself; at nine gaps, 60 s each. */
const OPPONENTS = [
  ...["classic", "combat", "brawler", "scrapper", "kicker"].flatMap((control) =>
    ["empty", "club"].map((held) => ({ right: "workshop-fighter", control, held }))),
  { right: "reptile", control: "crawl", held: "empty" },
];
const GAPS = [2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4];
const grid = OPPONENTS.flatMap((opponent) => GAPS.map((gap) => ({ ...opponent, gap })));

for (const [index, { right, control, held, gap }] of grid.entries()) {
  if (index % of !== shard) continue;
  const minds = readMinds(`?matchup=reptile,${right}&control=crawl,${control}`);
  const { world, duel, dispose } = await buildBout({ left: "reptile", right, gap, capSeconds: 60, held: { left: "empty", right: held }, minds });
  try {
    let down = null;
    while (!duel.verdict) {
      world.step();
      if (down === null && duel.duelists.left.body.down) down = world.steps;
    }
    console.log(JSON.stringify({ index, right, control, held, gap, down, steps: world.steps, winner: duel.verdict.winner, ending: duel.verdict.ending }));
  } finally { dispose(); }
}
