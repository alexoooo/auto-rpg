import { biteMeter } from "./bite-work.mjs";
import { pathToFileURL } from "node:url";
import { coreStand } from "../tests/harness/core-stand.mjs";
import { reptileSpec } from "../src/core/reptile/spec.ts";
import { createQuadrupedMind } from "../src/core/reptile/mind.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { modelSpec, modelInfo } from "../src/core/models.ts";
import { createMind } from "../src/core/mind/minds.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { createSenses } from "../src/core/mind/senses.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { createPool } from "../src/core/rules/pool.ts";
import { watchBlows } from "../src/core/rules/blows.ts";
import { REPTILE_CRAWL, REPTILE_TROT, REPTILE_MOTOR, REPTILE_TRAVEL, REPTILE_BITE } from "../src/core/reptile/tuning.ts";
import { sourced } from "../src/core/spec/quantity.ts";
import { deepFreeze } from "../src/core/state.ts";

/** Node core stand, Rapier coordinates, 120 Hz, zero balance: a real jaw against an opposing fixed body. */
export async function biteTrial({ bite = REPTILE_BITE, point = [0, .1925, .485], autonomous = false, target = true, seconds = 10, hz = 120, fixed = true, material, repeats = 1,
  targetPosition = [0, 0, .97], targetModel = "reptile", targetRotation = [0, 1, 0, 0], obstacle } = {}) {
  const spec = original => !material ? original : deepFreeze({ ...original, segments: original.segments.map(segment => !segment.surface.layer ? segment : ({ ...segment,
    surface: { ...segment.surface, layer: { stiffness: sourced(material.stiffness, "N/m", "reptile-contact-sweep", "stiffness cell"),
      dampingRatio: sourced(material.dampingRatio, "1", "reptile-contact-sweep", "damping-ratio cell"), depth: segment.surface.layer.depth } } })) });
  const stand = await coreStand(spec(reptileSpec()), { engine: "rapier-coordinate", hz, joints: { jaw: [bite.open] } });
  const enemy = target ? buildBody(spec(modelSpec(targetModel)), stand.world, { position: targetPosition, rotation: targetRotation }) : null;
  if (obstacle) stand.world.physics.addFixedBox(obstacle.position, obstacle.size);
  if (enemy && fixed) for (const segment of enemy.segments.values()) segment.body.setFixed(true);
  const targetMind = enemy && !fixed ? createMind(enemy, stand.world, modelInfo(targetModel).mind, { orders: () => STAND_ORDERS }) : null;
  const hub = createSenses(stand.world), see = hub.add({ id: "reptile", side: "one", built: stand.built, out: () => false });
  if (enemy) hub.add({ id: "target", side: "two", built: enemy, out: () => false });
  const enemyParts = new Map(enemy ? [...enemy.segments.values()].map(s => [s.body, s.spec.name]) : []);
  const contactIdentity = other => enemyParts.has(other) ? { kind: "body", body: "target", segment: enemyParts.get(other), guard: false } : { kind: "world" };
  let cancelled = false;
  const mind = createQuadrupedMind(stand.built, stand.world,
    { orders: () => cancelled ? STAND_ORDERS : autonomous ? null : { ...STAND_ORDERS, attack: point }, senses: see, contactIdentity },
    { crawl: REPTILE_CRAWL, trot: REPTILE_TROT, motor: REPTILE_MOTOR, travel: REPTILE_TRAVEL, bite });
  const rules = rulebook("arena"), mine = createPool(stand.built.spec, rules), theirs = enemy && createPool(enemy.spec, rules);
  const jaw = mind.body.muscles.channel("jaw axis0"), state = mind.body.state.mind.host.bite;
  const meter = biteMeter(stand.world, [{ id: "reptile", body: mind.body }], enemy ? { target: enemy } : {});
  let seen = 0;
  const hits = [], samples = [], own = new Set([...stand.built.segments.values()].map(s => s.body));
  const loaded = () => ["head", "jaw"].some(name => stand.world.physics.contactsOf(stand.built.segments.get(name).body)
    .some(c => (!c.other || !own.has(c.other)) && c.impulse > 0));
  let before, struck = false, down = false, peak = null, returnedAtHit = 0, admission = null, completed = 0, worldContact = false, compression = 0;
  const watch = enemy && watchBlows(stand.world, [{ id: "reptile", side: "one", built: stand.built, pool: mine },
    { id: "target", side: "two", built: enemy, pool: theirs }], rules, blow => {
    hits.push({ blow, before: blow.work === undefined ? before : admission ?? before,
      phase: blow.work === undefined ? state.cycle.phase : admission?.phase ?? state.cycle.phase, goal: [...state.jaw.sample] });
    if (!struck && blow.sides[0].segment === "jaw" && state.cycle.phase === "swing" && before.rate < 0) {
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
      for (const contact of stand.world.physics.materialContacts()) compression = Math.max(compression, contact.depth);
      if (!struck && before.phase === "swing" && before.rate < 0 && stand.world.physics.materialContacts().some(c => {
        const jawPart = stand.built.segments.get("jaw"), shape = c.first === jawPart.body ? c.mine : c.second === jawPart.body ? c.theirs : -1;
        const owner = jawPart.rigid.owners[shape]; return owner?.kind === "region" && owner.region.surface.point;
      })) {
        struck = true; admission = before; returnedAtHit = state.returned;
      }
      if (struck && state.cycle.phase === "return") cancelled = true;
      if (state.cycle.phase === "swing" || before.phase === "swing") samples.push({ ...before, goal: [...state.jaw.sample] });
      if (struck && state.returned > returnedAtHit && state.cycle.phase === null) {
        if (++completed >= repeats) break;
        cancelled = false; struck = false; admission = null;
      }
      if (!target && state.launched && state.cycle.phase === "return") break;
    }
    return { harness: "Node core stand", engine: "rapier-coordinate", hz: stand.world.hz, balances: [0, 0],
      point, autonomous, fixed, material, seconds: stand.world.time, peak, hits, samples, down, clear: !loaded(), worldContact, compression,
      cycles: meter.cycles[0],
      cycle: { launched: state.launched, returned: state.returned, failed: state.failed, phase: state.cycle.phase },
      bars: [mine.bar(), theirs?.bar() ?? null], assist: { ...mind.body.assist.meter } };
  } finally { watch?.dispose(); mind.body.dispose(); targetMind?.body.dispose(); hub.dispose(); enemy?.dispose(); stand.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--materials")) {
    for (const stiffness of [250, 500, 1000, 2000]) for (const dampingRatio of [.25, .5, 1]) {
      const material = { stiffness, dampingRatio }, rows = [];
      for (const fixed of [true, false]) {
        const row = await biteTrial({ fixed, material, repeats: 3, seconds: 40 });
        rows.push({ fixed, seconds: row.seconds, down: row.down, clear: row.clear, compression: row.compression,
          cycle: row.cycle, work: row.cycles.filter(cycle => cycle.release !== null && !cycle.failed).map(cycle => cycle.energy) });
      }
      console.log(JSON.stringify({ material, rows }));
    }
  } else {
  const cases = process.argv.includes("--sweep")
    ? [[0, 0], [.5, 0], [.5, 4]].map(([contactAt, closeRate]) => ({ bite: { ...REPTILE_BITE, contactAt, closeRate } }))
    : [{}, { autonomous: true }, { target: false }];
  for (const options of cases) {
    const row = await biteTrial(options); delete row.samples; row.hits = row.hits.filter(h => h.phase === "swing");
    console.log(JSON.stringify({ contactAt: (options.bite ?? REPTILE_BITE).contactAt, closeRate: (options.bite ?? REPTILE_BITE).closeRate, ...row }));
  }
  }
}
