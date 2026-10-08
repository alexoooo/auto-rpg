import { pathToFileURL } from "node:url";
import { coreStand, freshEngine } from "../tests/harness/core-stand.mjs";
import { reptileSpec } from "../src/core/reptile/spec.ts";
import { createQuadrupedMind } from "../src/core/reptile/mind.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { buildBout } from "./bout.mjs";
import { REPTILE_CRAWL, REPTILE_TROT, REPTILE_MOTOR, REPTILE_TRAVEL } from "../src/core/reptile/tuning.ts";

/** Node core stand, rapier-coordinate, 120 Hz: locomotion before contact, with fixed anatomy and zero balance. */
export async function motionTrial(tuning, direction = [0, 1], seconds = 10, yaw = 0) {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate", groundSize: 100, rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)] });
  let orders = STAND_ORDERS;
  const mind = createQuadrupedMind(stand.built, stand.world, { orders: () => orders }, tuning);
  try {
    stand.step(240);
    const start = mind.body.observe().centre;
    orders = { move: { x: direction[0], z: direction[1] }, face: { x: Math.sin(yaw), z: Math.cos(yaw) }, attack: null };
    let down = 0, firstDown = null, minHeight = Infinity;
    const phases = {};
    for (let step = 0; step < seconds * stand.world.hz; step++) {
      stand.step();
      if (mind.body.down) { down++; firstDown ??= step / stand.world.hz; }
      minHeight = Math.min(minHeight, mind.body.observe().centre[1]);
      const phase = mind.body.state.mind.host.crawl.phase;
      phases[phase] = (phases[phase] ?? 0) + 1;
    }
    const end = mind.body.observe().centre;
    const host = mind.body.state.mind.host;
    const distance = (end[0] - start[0]) * direction[0] + (end[2] - start[2]) * direction[1];
    return { yaw, direction, seconds, distance, speed: distance / seconds, down, firstDown, minHeight, steps: host.crawl.steps,
      phases, end, assist: { ...mind.body.assist.meter } };
  } finally { mind.body.dispose(); stand.dispose(); }
}

/** Node arena, rapier-coordinate, 120 Hz: autonomous mirror match with driven-jaw contacts distinguished from collisions. */
export async function mirrorTrial(gap = 2, seconds = 30) {
  const bout = await buildBout({ left: "reptile", right: "reptile", gap, capSeconds: seconds }, { physicsEngine: await freshEngine("rapier-coordinate") });
  const { world, duel } = bout;
  const sides = ["left", "right"], falls = [null, null], hits = [];
  let seen = 0;
  try {
    while (!duel.verdict && world.time < seconds) {
      const before = Object.fromEntries(sides.map(side => {
        const body = duel.duelists[side].body;
        return [side, { rate: body.muscles.rate(body.muscles.channel("jaw axis0")), phase: body.state.mind.host.bite.cycle.phase }];
      }));
      world.step();
      sides.forEach((side, i) => { if (duel.duelists[side].body.down) falls[i] ??= world.time; });
      for (const blow of duel.blows.slice(seen)) hits.push({ time: blow.time, energy: blow.energy, closing: blow.closing,
        sides: blow.sides.map(s => ({ fighter: s.fighter, part: s.segment, damage: s.damage,
          phase: duel.duelists[s.fighter].body.state.mind.host.bite.cycle.phase, before: before[s.fighter].phase, jawRate: before[s.fighter].rate })) });
      seen = duel.blows.length;
    }
    return { gap, seconds: world.time, falls, verdict: duel.verdict, bites: sides.map(side => {
      const bite = duel.duelists[side].body.state.mind.host.bite;
      return { launched: bite.launched, returned: bite.returned, failed: bite.failed, phase: bite.cycle.phase };
    }), centres: sides.map(side => duel.duelists[side].body.observe().centre), bars: sides.map(side => duel.duelists[side].pool.bar()),
      assist: sides.map(side => ({ ...duel.duelists[side].body.assist.meter })), hits };
  } finally { bout.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--sweep")) {
    for (const [speed, crawlHeight] of [[.25, 1], [.3, 1], [.35, 1], [.4, 1], [.3, .85]]) {
      const tuning = { crawl: REPTILE_CRAWL, trot: { ...REPTILE_TROT, speed, crawlHeight }, motor: REPTILE_MOTOR, travel: REPTILE_TRAVEL };
      console.log(JSON.stringify({ speed, crawlHeight, result: await motionTrial(tuning) }));
    }
  } else {
    console.log(JSON.stringify(await motionTrial()));
    for (const gap of [1.5, 2, 3]) {
      const row = await mirrorTrial(gap);
      row.hitCount = row.hits.length;
      row.hits = row.hits.filter(hit => hit.sides.some(side => side.part === "jaw" && (side.phase === "swing" || side.before === "swing") && side.jawRate < 0));
      console.log(JSON.stringify(row));
    }
  }
}
