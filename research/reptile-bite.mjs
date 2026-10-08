import { pathToFileURL } from "node:url";
import { coreStand } from "../tests/harness/core-stand.mjs";
import { reptileSpec } from "../src/core/reptile/spec.ts";
import { createQuadrupedMind } from "../src/core/reptile/mind.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { modelSpec } from "../src/core/models.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { createSenses } from "../src/core/mind/senses.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { createPool } from "../src/core/rules/pool.ts";
import { watchBlows } from "../src/core/rules/blows.ts";
import { REPTILE_CRAWL, REPTILE_TROT, REPTILE_MOTOR, REPTILE_TRAVEL, REPTILE_BITE } from "../src/core/reptile/tuning.ts";

/** Node core stand, Rapier coordinates, 120 Hz, zero balance: a real jaw against an opposing fixed body. */
export async function biteTrial({ bite = REPTILE_BITE, point = [0, .1925, .485], autonomous = false, target = true, seconds = 10, targetPosition = [0, 0, .97], targetModel = "reptile", targetRotation = [0, 1, 0, 0] } = {}) {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate", joints: { jaw: [.3] } });
  const enemy = target ? buildBody(modelSpec(targetModel), stand.world, { position: targetPosition, rotation: targetRotation }) : null;
  if (enemy) for (const segment of enemy.segments.values()) segment.body.setFixed(true);
  const hub = createSenses(stand.world), see = hub.add({ id: "reptile", side: "one", built: stand.built, out: () => false });
  if (enemy) hub.add({ id: "target", side: "two", built: enemy, out: () => false });
  let cancelled = false;
  const mind = createQuadrupedMind(stand.built, stand.world,
    { orders: () => cancelled ? STAND_ORDERS : autonomous ? null : { ...STAND_ORDERS, attack: point }, senses: see },
    { crawl: REPTILE_CRAWL, trot: REPTILE_TROT, motor: REPTILE_MOTOR, travel: REPTILE_TRAVEL, bite });
  const rules = rulebook("arena"), mine = createPool(stand.built.spec, rules), theirs = enemy && createPool(enemy.spec, rules);
  const jaw = mind.body.muscles.channel("jaw axis0"), state = mind.body.state.mind.host.bite;
  const hits = [], samples = [], own = new Set([...stand.built.segments.values()].map(s => s.body));
  const loaded = () => ["head", "jaw"].some(name => stand.world.physics.contactsOf(stand.built.segments.get(name).body)
    .some(c => c.other && !own.has(c.other) && c.impulse > 0));
  let before, struck = false, down = false, peak = null, returnedAtHit = 0;
  const watch = enemy && watchBlows(stand.world, [{ id: "reptile", side: "one", built: stand.built, pool: mine },
    { id: "target", side: "two", built: enemy, pool: theirs }], rules, blow => {
    hits.push({ blow, before, phase: state.cycle.phase, goal: [...state.jaw.sample] });
    if (!struck && blow.sides[0].segment === "jaw" && state.cycle.phase === "swing" && before.rate < 0) {
      struck = true; cancelled = true; returnedAtHit = state.returned;
    }
  });
  try {
    for (let step = 0; step < seconds * stand.world.hz; step++) {
      before = { time: stand.world.time, phase: state.cycle.phase, elapsed: state.cycle.time,
        angle: mind.body.muscles.angle(jaw), rate: mind.body.muscles.rate(jaw) };
      if (!loaded() && !struck && before.phase === "swing" && before.elapsed > 0 && before.rate < (peak?.rate ?? 0)) peak = before;
      stand.step(); down ||= mind.body.down;
      if (state.cycle.phase === "swing" || before.phase === "swing") samples.push({ ...before, goal: [...state.jaw.sample] });
      if (struck && state.returned > returnedAtHit && state.cycle.phase === null) break;
      if (!target && state.launched && state.cycle.phase === "return") break;
    }
    return { harness: "Node core stand", engine: "rapier-coordinate", hz: stand.world.hz, balances: [0, 0],
      point, autonomous, seconds: stand.world.time, peak, hits, samples, down, clear: !loaded(),
      cycle: { launched: state.launched, returned: state.returned, failed: state.failed, phase: state.cycle.phase },
      bars: [mine.bar(), theirs?.bar() ?? null], assist: { ...mind.body.assist.meter } };
  } finally { watch?.dispose(); mind.body.dispose(); hub.dispose(); enemy?.dispose(); stand.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cases = process.argv.includes("--sweep")
    ? [[0, 0], [.5, 0], [.5, 4]].map(([contactAt, closeRate]) => ({ bite: { ...REPTILE_BITE, contactAt, closeRate } }))
    : [{}, { autonomous: true }, { target: false }];
  for (const options of cases) {
    const row = await biteTrial(options); delete row.samples; row.hits = row.hits.filter(h => h.phase === "swing");
    console.log(JSON.stringify({ contactAt: (options.bite ?? REPTILE_BITE).contactAt, closeRate: (options.bite ?? REPTILE_BITE).closeRate, ...row }));
  }
}
