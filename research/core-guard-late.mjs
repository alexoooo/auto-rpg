/**
 * Why a blow meets a covering side's head: for each one in arena bouts with clubs (`bout.mjs`), how
 * long its mind had seen the threat (`threatOf`), and how far each thing it covers with was from
 * the place its cover asks for, at the step before the blow.
 *
 *   node research/core-guard-late.mjs [--gaps 3,3.5,4,4.5,5] [--delay 0] [--models workshop-fighter,workshop-rogue] [--threat '{"within":1.5,"closing":2}'] [--list]
 *
 * It plays each ordered pair of `--models` at each gap twice, once with each side covering, and
 * prints a row a pair and covering side: the blows that side met and those of them its head met;
 * of those, the ones with no threat seen; for the rest, the seconds the threat had been seen and
 * the distance of the left hand's knuckles and of the club's swell from the cover's place (the
 * least, the median and the most); and the share of the bout's steps in which its mind saw a
 * threat, and in which a strike had one of its hands. `--threat` is the covering side's in place of
 * the one set (`THREAT`); `--list` prints each blow.
 */
import { parseArgs } from "node:util";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { SIDES } from "../src/arena/duel.ts";
import { HUMANOID_MODELS } from "../src/core/models.ts";
import { FIGHTER } from "../src/core/mind/config.ts";
import { THREAT, threatReader } from "../src/core/mind/threat.ts";
import { GUARD_COVER } from "../src/core/skills/guard.ts";
import { BOUT_HARNESS, buildBout } from "./bout.mjs";

const { threatOf } = threatReader();

const { values } = parseArgs({ options: {
  gaps: { type: "string", default: "3,3.5,4,4.5,5" }, delay: { type: "string", default: "0" },
  models: { type: "string", default: "workshop-fighter,workshop-rogue" }, threat: { type: "string" }, list: { type: "boolean", default: false },
} });
const gaps = values.gaps.split(",").map(Number), delay = Number(values.delay), models = values.models.split(",");
for (const model of models) if (!HUMANOID_MODELS.includes(model)) throw new Error(`--models names no body: ${model} (one of ${HUMANOID_MODELS.join(", ")})`);
const threat = values.threat ? JSON.parse(values.threat) : THREAT;

/** One bout with `covers` covering: its head's blows as the step before each left them, and the bout's counts. */
async function play(left, right, gap, covers) {
  const mind = (side) => side === covers ? { ...FIGHTER, guard: "cover", threat } : FIGHTER;
  const { world, duel, dispose } = await buildBout({ left, right, gap, senseDelay: delay, minds: { left: mind("left"), right: mind("right") } });
  try {
    const me = duel.duelists[covers], { view } = me.body;
    const toWorld = (p) => p.clone().applyRotationQuaternion(view.root.rotation).addInPlace(view.root.position);
    const counts = { steps: 0, seen: 0, struck: 0, met: 0 }, heads = [];
    let since = null, read = 0;
    while (!duel.verdict) {
      const cover = view.down ? null : threatOf(view, threat);
      if (cover) { since ??= duel.clock; counts.seen++; } else since = null;
      const strike = me.minded.skills.report.strike;
      if (strike.hand) counts.struck++;
      counts.steps++;
      const before = { since, cover, strike: strike.hand ? `${strike.hand} ${strike.phase}` : "none", head: view.head.clone(), knuckles: view.fists.left.position.clone(),
        swell: toWorld(view.effectors["hand.right"].points.swellFrom).add(toWorld(view.effectors["hand.right"].points.swellTo)).scale(0.5) };
      world.step();
      for (; read < duel.blows.length; read++) {
        const blow = duel.blows[read], mine = blow.sides.find((side) => side.fighter === covers);
        counts.met++;
        if (mine.segment !== "head" || mine.item !== null) continue;
        const row = { gap, time: blow.time, energy: blow.energy, strike: before.strike, seen: null };
        if (before.cover) {
          const toward = Vector3.FromArray(before.cover.threat).subtract(before.head), far = toward.length();
          const place = before.head.add(toward.scale(Math.min(GUARD_COVER.out, far) / far));
          Object.assign(row, { seen: blow.time - before.since, far, knuckles: Vector3.Distance(before.knuckles, place), swell: Vector3.Distance(before.swell, place) });
        }
        heads.push(row);
      }
    }
    return { counts, heads };
  } finally { dispose(); }
}

/** The least, the median and the most of `some`, each times `scale` to `digits`. */
function spread(some, scale, digits) {
  if (some.length === 0) return "-";
  const sorted = [...some].sort((a, b) => a - b);
  return [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted.at(-1)].map((v) => (scale * v).toFixed(digits)).join(", ");
}

console.log(`${BOUT_HARNESS}; each side's balance its character's; a club in every right hand; gaps ${gaps.join(", ")} m; what each side senses ${delay} steps old.`);
console.log(`The covering side's threat: ${JSON.stringify(threat)}; its cover: ${JSON.stringify(GUARD_COVER)}. Three figures are the least, the median and the most.`);
console.log("\n| Left | Right | Covers | Blows met | By its head | No threat seen | Threat seen, s | Knuckles from the place, cm | Swell from the place, cm | Steps a threat is seen in, % | Steps a strike has a hand in, % |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const left of models) for (const right of models) for (const covers of SIDES) {
  const total = { steps: 0, seen: 0, struck: 0, met: 0 }, heads = [];
  for (const gap of gaps) {
    const bout = await play(left, right, gap, covers);
    for (const key of Object.keys(total)) total[key] += bout.counts[key];
    heads.push(...bout.heads);
  }
  const seen = heads.filter((row) => row.seen !== null);
  console.log(`| ${left} | ${right} | ${covers} | ${total.met} | ${heads.length} | ${heads.length - seen.length} | ${spread(seen.map((row) => row.seen), 1, 2)} | ${spread(seen.map((row) => row.knuckles), 100, 0)} | ${spread(seen.map((row) => row.swell), 100, 0)} | ${(100 * total.seen / total.steps).toFixed(1)} | ${(100 * total.struck / total.steps).toFixed(1)} |`);
  if (values.list) for (const row of heads) {
    console.log(`    gap ${row.gap}, ${row.time.toFixed(2)} s, ${row.energy.toFixed(0)} J: ${row.seen === null ? "no threat seen" : `seen ${row.seen.toFixed(2)} s, the threat ${row.far.toFixed(2)} m from the head, knuckles ${(100 * row.knuckles).toFixed(0)} cm and swell ${(100 * row.swell).toFixed(0)} cm from the place`}; strike ${row.strike}`);
  }
}
