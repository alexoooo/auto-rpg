import { biteMeter } from "./bite-load.mjs";
import { pathToFileURL } from "node:url";
import { coreStand } from "../tests/harness/core-stand.mjs";
import { reptileSpec } from "../src/core/reptile/spec.ts";
import { quadrupedMind } from "../src/core/reptile/mind.ts";
import { hostedMind } from "../src/core/mind/minds.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { modelSpec, modelInfo } from "../src/core/models.ts";
import { createMind } from "../src/core/mind/minds.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { createSenses } from "../src/core/mind/senses.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { createPool } from "../src/core/rules/pool.ts";
import { watchBlows } from "../src/core/rules/blows.ts";
import { REPTILE_BITE } from "../src/core/reptile/tuning.ts";
import { QUADRUPED } from "../src/core/mind/config.ts";

/** Node core stand, Rapier coordinates, 120 Hz, zero balance: a real jaw closes on an exposed fixed jaw corner. */
export async function biteTrial({ bite = REPTILE_BITE, point = [-.028, .1925, .503], autonomous = false, target = true, seconds = 10, hz = 120, fixed = true, repeats = 1,
  targetPosition = [-.38, 0, .55], targetModel = "reptile", targetRotation = [0, Math.SQRT1_2, 0, Math.SQRT1_2], obstacle } = {}) {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate", hz, joints: { jaw: [bite.open] } });
  const enemy = target ? buildBody(modelSpec(targetModel), stand.world, { position: targetPosition, rotation: targetRotation }) : null;
  if (obstacle) stand.world.physics.addFixedBox(obstacle.position, obstacle.size);
  if (enemy && fixed) for (const segment of enemy.segments.values()) segment.body.setFixed(true);
  const targetMind = enemy && !fixed ? createMind(enemy, stand.world, modelInfo(targetModel).mind, { orders: () => STAND_ORDERS }) : null;
  const hub = createSenses(stand.world), see = hub.add({ id: "reptile", side: "one", built: stand.built, out: () => false });
  if (enemy) hub.add({ id: "target", side: "two", built: enemy, out: () => false });
  const enemyParts = new Map(enemy ? [...enemy.segments.values()].map(s => [s.body.id, s.spec.name]) : []);
  const contactIdentity = other => enemyParts.has(other?.id) ? { kind: "body", body: "target", segment: enemyParts.get(other.id), guard: false } : { kind: "world" };
  let cancelled = false;
  const mind = hostedMind(stand.built, stand.world, { orders: () => cancelled ? STAND_ORDERS : autonomous ? null : STAND_ORDERS, ...(autonomous ? {} : { biteTarget: () => cancelled ? null : point }), senses: see, contactIdentity }, (host, wiring) => quadrupedMind(host, wiring, { ...QUADRUPED, tuning: { bite } }));
  const rules = rulebook("arena"), mine = createPool(stand.built.spec, rules), theirs = enemy && createPool(enemy.spec, rules);
  const jaw = mind.body.muscles.channel("jaw axis0"), state = mind.body.state.mind.host.bite;
  const meter = biteMeter(stand.world, [{ id: "reptile", body: mind.body }]);
  let seen = 0;
  const hits = [], samples = [], own = new Set([...stand.built.segments.values()].map(s => s.body));
  const loaded = () => ["head", "jaw"].some(name => stand.world.physics.contactsOf(stand.built.segments.get(name).body)
    .some(c => (!c.other || !own.has(c.other)) && c.impulse > 0));
  let before, struck = false, down = false, peak = null, returnedAtHit = 0, completed = 0, worldContact = false;
  const watch = enemy && watchBlows(stand.world, [{ id: "reptile", side: "one", built: stand.built, pool: mine },
    { id: "target", side: "two", built: enemy, pool: theirs }], rules, blow => {
    hits.push({ blow, before: before,
      phase: state.cycle.phase, goal: [...state.jaw.sample] });
    if (!struck && blow.kind === "load" && blow.sides[1].mechanism === "point" && state.cycle.phase === "swing" && before.rate < 0) {
      struck = true; cancelled = true; returnedAtHit = state.returned;
    }
  });
  try {
    for (let step = 0; step < seconds * stand.world.hz; step++) {
      const prior = meter.before();
      before = { time: stand.world.time, phase: state.cycle.phase, elapsed: state.cycle.time,
        angle: mind.body.muscles.angle(jaw), rate: mind.body.muscles.rate(jaw) };
      if (!loaded() && !struck && before.phase === "swing" && before.elapsed > 0 && before.rate < (peak?.rate ?? 0)) peak = before;
      stand.step(); meter.after(prior, hits.slice(seen).map(h => h.blow)); seen = hits.length; down ||= mind.body.down;
      worldContact ||= ["head", "jaw"].some(name => stand.world.physics.contactsOf(stand.built.segments.get(name).body)
        .some(contact => !contact.other && contact.impulse > 0));
      if (struck && state.cycle.phase === "return") cancelled = true;
      if (state.cycle.phase === "swing" || before.phase === "swing") samples.push({ ...before, goal: [...state.jaw.sample] });
      if (struck && state.returned > returnedAtHit && state.cycle.phase === null) {
        if (++completed >= repeats) break;
        cancelled = false; struck = false;
      }
      if (!target && state.launched && state.cycle.phase === "return") break;
    }
    return { harness: "Node core stand", engine: "rapier-coordinate", hz: stand.world.hz, balances: [0, 0],
      point, autonomous, fixed, seconds: stand.world.time, peak, hits, samples, down, clear: !loaded(), worldContact,
      cycles: meter.cycles[0],
      cycle: { launched: state.launched, returned: state.returned, failed: state.failed, phase: state.cycle.phase },
      bars: [mine.bar(), theirs?.bar() ?? null], assist: { ...mind.body.assist.meter } };
  } finally { watch?.dispose(); mind.body.dispose(); targetMind?.body.dispose(); hub.dispose(); enemy?.dispose(); stand.dispose(); }
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
