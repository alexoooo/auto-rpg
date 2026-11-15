/**
 * Named action lifecycles and physical outcomes in Arena bouts, read from the common report.
 * Per-instance phase time, preparation, verified endings and contact totals are independent of
 * executor kind. Nearby wound records are physical correlations, not action-attributed damage.
 * Node core world, Rapier, 120 Hz, the arena's rulebook; one sequential loop per worker.
 *
 * node research/skills/strikes/strike-bouts.mjs --models man --gaps 3 --held empty --seconds 8 --workers 1
 *
 * `--holds left=straight-punch/moving` has that side's body hold the variation in place of its
 * character's own of the skill (`characterSkills`), one flag a side; each action is then read
 * apart by side: begun, committed, committed with a foot off the ground (the lead foot, the one
 * opposite the striking hand, among them), touched (a wound dealt at all), landed (at least
 * `LANDED`), and the damage its touching blows took (the wounds its effector dealt, a blow's sum).
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

/** A completed action's wound correlation includes a quarter second after its last interval. */
const AFTER = .25;
/** Falls are read for two seconds from commitment; stance recovery continues one second past ending. */
const DOWN = 2, RECOVERY = 1;
/**
 * A landed blow takes at least this much life, HP: half a solid punch (a hit point is 100 J of blunt
 * blow, `Rulebook.unit`), a twelfth of a Warrior's. The owner: "a gentle accidental graze to me is
 * not a 'landed punch'".
 */
const LANDED = .5;
/** Saved results use explicit per-hand equipment and the neutral action protocol. */
const SCHEMA = 3;

if (isMainThread) {
  const { values } = parseArgs({ options: {
    models: { type: "string" }, gaps: { type: "string", default: "3,4,5" }, held: { type: "string", default: "club" },
    seconds: { type: "string", default: "120" }, workers: { type: "string" }, save: { type: "string" }, load: { type: "string" },
    holds: { type: "string", multiple: true, default: [] },
    drill: { type: "string" }, pace: { type: "string" },
  } });
  // With `--drill stand|guard`, the left side is drilled at the right's trunk's middle with its punch (the Strike drill's Option Mind and Commander,
  // walking into the window at `--pace` m/s, or ordering it where it stands with none), the right a drill opponent (`drill-stand`, `drill-guard`),
  // the two set the gap apart, centre to centre, facing.
  const drill = values.drill === undefined ? null : { opponent: `drill-${values.drill}`, ...(values.pace === undefined ? {} : { pace: Number(values.pace) }) };
  const holds = Object.fromEntries(values.holds.map(one => one.split("=")));
  if (Object.keys(holds).some(side => side !== "left" && side !== "right")) throw new Error("--holds is <left|right>=<skill/variation>");
  const { HUMANOID_MODELS } = await import("../../../src/core/bodies/models.ts");
  const models = values.models?.split(",") ?? HUMANOID_MODELS, gaps = values.gaps.split(",").map(Number), seconds = Number(values.seconds);
  const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2)), helds = values.held.split(",");
  if (!models.length || models.some(model => !HUMANOID_MODELS.includes(model)) || gaps.some(gap => !Number.isFinite(gap) || gap <= 0)
    || !Number.isFinite(seconds) || seconds <= 0 || !Number.isSafeInteger(lanes) || lanes < 1 || helds.some(held => !["club", "empty"].includes(held)))
    throw new Error("invalid models, gaps, seconds, workers or held selection");
  const jobs = [];
  for (const held of helds) for (const gap of gaps) for (const left of models) for (const right of models) jobs.push({ left, right, gap, held, seconds, holds, drill });
  const key = job => `${job.left} ${job.right} ${job.gap} ${job.held} ${job.seconds} ${JSON.stringify(job.drill ? { ...job.holds, drill: job.drill } : job.holds)}`;
  const loaded = new Map(values.load ? JSON.parse(await readFile(values.load, "utf8")) : []);
  for (const job of jobs) {
    job.result = loaded.get(key(job));
    if (job.result && job.result.schema !== SCHEMA) throw new Error("loaded result uses a different action schema");
  }
  const played = jobs.filter(job => !job.result), started = Date.now();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(lanes, played.length) }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url));
    worker.once("error", reject);
    const feed = () => {
      if (next >= played.length) { worker.terminate(); resolve(); return; }
      const job = played[next++];
      worker.once("message", ({ result, error }) => {
        if (error) { worker.terminate(); reject(new Error(error)); return; }
        job.result = result;
        process.stderr.write(`${key(job)}: ${result.seconds.toFixed(1)} s ${result.ending}\n`);
        feed();
      });
      const { result: _, ...settings } = job; worker.postMessage(settings);
    };
    feed();
  })));
  if (values.save) await writeFile(values.save, JSON.stringify(jobs.map(job => [key(job), job.result])));
  const sum = xs => xs.reduce((total, value) => total + value, 0);
  const median = xs => xs.length ? [...xs].sort((a, b) => a - b)[xs.length >> 1] : null;
  for (const held of helds) {
    const bouts = jobs.filter(job => job.held === held).map(job => job.result), sides = bouts.flatMap(bout => bout.sides);
    const attempts = sides.flatMap(side => side.attempts), committed = attempts.filter(attempt => attempt.committed);
    const timings = committed.flatMap(attempt => attempt.commit === null ? [] : [attempt.commit - attempt.began]);
    const endings = {};
    for (const attempt of attempts) { const kind = attempt.record?.ending.kind ?? "live-at-verdict"; endings[kind] = (endings[kind] ?? 0) + 1; }
    console.log(`Held ${held}: ${bouts.length} bouts, ${sum(bouts.map(bout => bout.seconds)).toFixed(1)} s; Node core world, Rapier, 120 Hz, the arena's rulebook`);
    console.log(`  action-seconds: ${["prepare", "commit", "release"].map(phase => `${phase} ${sum(sides.map(side => side.phases[phase])).toFixed(2)}`).join(", ")}; idle side-seconds ${sum(sides.map(side => side.idle)).toFixed(2)}`);
    console.log(`  requests ${attempts.length}, committed ${committed.length}; endings ${JSON.stringify(endings)}; median preparation ${median(timings)?.toFixed(2) ?? "unobserved"} s`);
    for (const model of models) {
      const mine = sides.filter(side => side.model === model).flatMap(side => side.attempts).filter(attempt => attempt.committed);
      console.log(`  ${model}: committed ${mine.length}, target-touch ${mine.filter(attempt => attempt.contacts.counts.commit.target > 0).length}, blocked ${mine.filter(attempt => attempt.contacts.counts.commit.block > 0).length}, `
        + `stance recovery ${mine.filter(attempt => attempt.recoveries > 0).length}, down within ${DOWN} s ${mine.filter(attempt => attempt.down).length}; `
        + `correlated effector wound records ${sum(mine.map(attempt => attempt.wounds.length))}`);
    }
    const minutes = sum(bouts.map(bout => bout.seconds)) / 60;
    for (const side of ["left", "right"]) {
      const theirs = sides.filter(one => one.side === side).flatMap(one => one.attempts), names = [...new Set(theirs.map(attempt => attempt.action))].sort();
      for (const name of names) {
        const all = theirs.filter(attempt => attempt.action === name), committed = all.filter(attempt => attempt.committed);
        const touched = committed.filter(attempt => attempt.wounds.length > 0), damage = touched.map(attempt => sum(attempt.wounds.map(wound => wound.damage)));
        const landed = damage.filter(hp => hp >= LANDED);
        console.log(`  ${side} (${holds[side] ?? "own"}) ${name}: begun ${all.length}, committed ${committed.length}, with a foot off the ground ${committed.filter(attempt => attempt.airborne).length} (the lead ${committed.filter(attempt => attempt.leadUp).length}), `
          + `touched ${touched.length}, landed ${landed.length} (${(landed.length / minutes).toFixed(1)} a minute, each at least ${LANDED} hp), damage a touching blow median ${median(damage)?.toFixed(3) ?? "none"}, `
          + `total ${sum(damage).toFixed(2)}; down within ${DOWN} s ${committed.filter(attempt => attempt.down).length}`);
      }
    }
  }
  console.log(`${jobs.length} bouts, ${played.length} played, in ${((Date.now() - started) / 1000).toFixed(1)} s`);
} else {
  const [{ buildBout }, { BOUT_ENGINE }] = await Promise.all([import("../../../src/app/node/evaluation.ts"), import("../../bout.mjs")]);
  const { SIDES } = await import("../../../src/game/arena/duel.ts");
  const { characterSkills } = await import("../../../src/core/bodies/models.ts");
  const { footOn } = await import("../../../src/control/support.ts");
  const { Vector3 } = await import("../../../src/core/math/vector.ts");
  const { CONTEXT } = await import("../../../src/app/node/context.ts");
  const { createDrillOpponents } = await import("../../../src/evaluation/drill-opponents.ts");
  parentPort.on("message", async ({ left, right, gap, held, seconds, holds, drill }) => {
    let dispose;
    try {
      const skills = Object.fromEntries(Object.entries(holds).map(([side, variation]) => [side, characterSkills(side === "left" ? left : right, [variation])]));
      const drilled = drill ? { recoverySeconds: null, entry: [], ends: [],
        start: { left: { at: [-gap / 2, 0], heading: Math.PI / 2 }, right: { at: [gap / 2, 0], heading: -Math.PI / 2 } },
        minds: { left: CONTEXT.catalog.minds["option-drill"].config, right: createDrillOpponents(CONTEXT).opponentOf(drill.opponent).mind },
        commanders: { left: { kind: "drill", skill: "straight-punch", region: { kind: "mark", mark: "middle" }, after: .5, ...(drill.pace === undefined ? { walking: true } : { pace: drill.pace }) } } } : {};
      const recipe = { left, right, gap, capSeconds: seconds, loadouts: { left: { left: "empty", right: held }, right: { left: "empty", right: held } },
        ...(Object.keys(skills).length ? { skills } : {}), ...drilled };
      // With ACTUATION (`symmetric` or `directional`), the world's muscle law (`World.actuation`); else the world's own.
      const bout = await buildBout(recipe, { engine: BOUT_ENGINE, ...(process.env.ACTUATION ? { actuation: process.env.ACTUATION } : {}) }); dispose = bout.dispose;
      const { world, duel } = bout, track = Object.fromEntries(SIDES.map(side => [side, {
        side, model: side === "left" ? left : right, phases: { prepare: 0, commit: 0, release: 0 }, idle: 0, attempts: [], sequence: 0,
      }]));
      const byId = Object.fromEntries(SIDES.map(side => [side, new Map()]));
      const attemptOf = (side, action) => {
        const existing = byId[side].get(action.id);
        if (existing) return existing;
        const attempt = { id: action.id, action: action.action, effector: action.effector, target: structuredClone(action.target),
          began: "began" in action ? action.began : duel.clock, commit: null, ended: null, committed: false,
          contacts: structuredClone(action.contacts), record: null, cutByVerdict: false, recoveries: 0, down: false,
          from: duel.duelists[side].body.view.stance.recoveries, downAt: null, wounds: [], struck: 0 };
        byId[side].set(action.id, attempt); track[side].attempts.push(attempt); return attempt;
      };
      // The striking arm's shape at each blow of a fist, by the blow: the elbow's bend, the shoulder-to-fist line against the blow's normal, and how far the fist is from the shoulder.
      const arms = new Map(); let heard = 0;
      const armAt = (body, hand, normal) => {
        const at = (name) => body.built.segments.get(name).pose.position, side = hand.slice(hand.indexOf(".") + 1);
        const upper = at(`upperArm.${side}`), fore = at(`forearm.${side}`), fist = at(hand);
        const a = [fore.x - upper.x, fore.y - upper.y, fore.z - upper.z], b = [fist.x - fore.x, fist.y - fore.y, fist.z - fore.z], c = [fist.x - upper.x, fist.y - upper.y, fist.z - upper.z];
        const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], len = (u) => Math.sqrt(dot(u, u));
        return { bend: Math.acos(Math.max(-1, Math.min(1, dot(a, b) / len(a) / len(b)))) * 180 / Math.PI,
          line: Math.acos(Math.max(-1, Math.min(1, Math.abs(dot(c, normal)) / len(c) / len(normal)))) * 180 / Math.PI, out: len(c),
          // The normal's tilt from level, and the level line's turn from the fist's level line, deg; and the fist's line's own tilt (down is negative).
          tilt: Math.asin(Math.min(1, Math.abs(normal[1]) / len(normal))) * 180 / Math.PI,
          turn: Math.acos(Math.max(-1, Math.min(1, Math.abs(c[0] * normal[0] + c[2] * normal[2]) / Math.hypot(c[0], c[2]) / Math.hypot(normal[0], normal[2]) || 0))) * 180 / Math.PI,
          dip: Math.asin(c[1] / len(c)) * 180 / Math.PI };
      };
      // With HOLDS, each side's hands' and upper arms' velocities before the step, world m/s: a blow's speeds are read from them, not from the step that met it.
      const before = new Map();
      while (!duel.verdict && duel.clock < seconds) {
        if (process.env.HOLDS) for (const s of SIDES) for (const name of ["hand.left", "hand.right", "upperArm.left", "upperArm.right"]) {
          const v = new Vector3(); duel.duelists[s].body.built.segments.get(name).body.linearVelocityToRef(v); before.set(`${s} ${name}`, v);
        }
        world.step();
        for (; heard < duel.blows.length; heard++) {
          const blow = duel.blows[heard];
          for (const s of SIDES) for (const part of blow.sides)
            if (part.fighter === duel.duelists[s].id && part.segment.startsWith("hand.")) {
              const shape = armAt(duel.duelists[s].body, part.segment, blow.normal);
              // With HOLDS, each freedom of the striking arm and the trunk as the blow's step left it: its speed, rad/s, and its muscles' ceilings either way, N m (`bounds`).
              if (process.env.HOLDS) {
                const m = duel.duelists[s].body.muscles, hand = part.segment.slice(5);
                shape.holds = m.channels.flatMap((c, i) => c.name.includes(`.${hand} `) && /^(shoulder|elbow|wrist)/.test(c.name) || /^(thoracic|lumbar) /.test(c.name)
                  ? [[c.name, +m.speed(i).toFixed(1), +m.bounds.negative[i].toFixed(0), +m.bounds.positive[i].toFixed(0), +m.strength(i, -1).toFixed(0), +m.strength(i, 1).toFixed(0)]] : []);
                // The fist's and the upper arm's speeds along the blow's normal the step before it, m/s, the fist's way positive.
                const along = (name) => { const v = before.get(`${s} ${name}`), n = blow.normal; return (v.x * n[0] + v.y * n[1] + v.z * n[2]) / Math.hypot(n[0], n[1], n[2]); };
                const fist = along(part.segment), sign = Math.sign(fist) || 1;
                shape.speeds = { fist: +(fist * sign).toFixed(2), shoulder: +(along(`upperArm.${hand}`) * sign).toFixed(2) };
              }
              arms.set(blow, shape);
            }
        }
        for (const side of SIDES) {
          const t = track[side], me = duel.duelists[side], report = me.minded.skills.report;
          if (!report.actions.length) t.idle += world.dt;
          for (const action of report.actions) {
            t.phases[action.phase] += world.dt;
            const attempt = attemptOf(side, action); attempt.contacts = structuredClone(action.contacts);
            // The fist's fastest while committed, m/s, and when, s from the fire.
            if (action.phase === "commit" && action.effector.startsWith("hand.")) {
              const v = new Vector3(); me.body.built.segments.get(action.effector).body.linearVelocityToRef(v);
              const speed = Math.hypot(v.x, v.y, v.z);
              if (!(attempt.fastest?.speed >= speed)) attempt.fastest = { speed, at: duel.clock - attempt.commit };
              // The stroke step by step: s from the fire, the fist's speed, the elbow's and the shoulder's angles, and how far the fist is from the aim, m.
              if (process.env.TRACE && duel.clock - attempt.commit <= .45) {
                const angles = me.body.view.angles, hand = action.effector.slice(5), fist = me.body.built.segments.get(action.effector).pose.position;
                (attempt.trace ??= []).push([+(duel.clock - attempt.commit).toFixed(3), +speed.toFixed(2),
                  ...Object.keys(angles).filter((name) => name.includes(`.${hand} `) && /^(elbow|shoulder)/.test(name) || /^(thoracic|lumbar) (rotation|flexion)/.test(name))
                    .map((name) => `${name.includes(".") ? name.split(" ").slice(1).join(" ") : name} ${angles[name].toFixed(2)}`),
                  `to aim ${Math.hypot(fist.x - action.aim[0], fist.y - action.aim[1], fist.z - action.aim[2]).toFixed(3)}`,
                  ...(() => { const s = me.body.built.segments.get(`upperArm.${hand}`).pose.position, c = me.body.view.stance.centre;
                    return [`shoulder to aim ${Math.hypot(s.x - action.aim[0], s.y - action.aim[1], s.z - action.aim[2]).toFixed(3)}`, `centre to aim ${Math.hypot(c.x - action.aim[0], c.z - action.aim[2]).toFixed(3)}`]; })()]);
              }
            }
            // The fist's nearest pass to its aim while committed: how far, and which way it is off (up, to its right, past along the line from the head), m.
            if (action.phase === "commit" && action.aim && action.effector.startsWith("hand.")) {
              const fist = me.body.built.segments.get(action.effector).pose.position, [ax, ay, az] = action.aim, head = me.body.view.head;
              const d = [fist.x - ax, fist.y - ay, fist.z - az], gone = Math.hypot(...d), fl = Math.hypot(ax - head.x, az - head.z), f = [(ax - head.x) / fl, (az - head.z) / fl];
              if (!(attempt.miss?.gone <= gone)) attempt.miss = { gone, up: d[1], right: d[0] * f[1] - d[2] * f[0], past: d[0] * f[0] + d[2] * f[1], at: duel.clock - attempt.commit };
            }
            if (action.phase === "commit" && attempt.commit === null) {
              attempt.commit = duel.clock; attempt.committed = true; attempt.from = me.body.view.stance.recoveries;
              attempt.airborne = Object.values(me.body.view.stance.ends).some(end => end.touching === false);
              const hand = attempt.effector === "hand.left" ? "left" : attempt.effector === "hand.right" ? "right" : null;
              attempt.leadUp = hand !== null && me.body.view.stance.ends[footOn(me.body.built.spec, hand === "left" ? "right" : "left")]?.touching === false;
              const foe = duel.duelists[side === "left" ? "right" : "left"].body.view, mine = me.body.view;
              attempt.apart = Math.hypot(foe.stance.centre.x - mine.stance.centre.x, foe.stance.centre.z - mine.stance.centre.z);
              attempt.heads = Math.hypot(foe.head.x - mine.head.x, foe.head.z - mine.head.z);
              attempt.pace = Math.hypot(mine.stance.velocity.x, mine.stance.velocity.z);
              attempt.fired = [mine.stance.centre.x, mine.stance.centre.z, foe.stance.centre.x, foe.stance.centre.z];
              if (hand) { attempt.foot = footOn(me.body.built.spec, hand === "left" ? "right" : "left"); const s = mine.stance.ends[attempt.foot].middle; attempt.sole = [s.x, s.z]; }
            }
          }
          for (const record of report.ledger) if (record.sequence > t.sequence) {
            const attempt = attemptOf(side, record);
            attempt.began = record.began; attempt.ended = record.ended; attempt.committed = record.committed;
            attempt.contacts = structuredClone(record.contacts); attempt.record = structuredClone(record); t.sequence = record.sequence;
          }
          for (const attempt of t.attempts) if (attempt.commit !== null) {
            // How far its centre of mass travelled toward the foe's (as the foe stood at the fire) in the 0.2 s from the fire, m.
            if (attempt.fired && attempt.travel === undefined && duel.clock - attempt.commit >= .2) {
              const [x, z, fx, fz] = attempt.fired, d = Math.hypot(fx - x, fz - z), c = me.body.view.stance.centre;
              attempt.travel = d > 0 ? ((c.x - x) * (fx - x) + (c.z - z) * (fz - z)) / d : 0;
            }
            // How far the foot opposite the striking hand went toward the foe in the 0.3 s from the fire, m.
            if (attempt.sole && attempt.stepped === undefined && duel.clock - attempt.commit >= .3) {
              const [x, z, fx, fz] = attempt.fired, d = Math.hypot(fx - x, fz - z), s = me.body.view.stance.ends[attempt.foot].middle;
              attempt.stepped = d > 0 ? ((s.x - attempt.sole[0]) * (fx - x) + (s.z - attempt.sole[1]) * (fz - z)) / d : 0;
            }
            if (attempt.ended === null || duel.clock <= attempt.ended + RECOVERY) attempt.recoveries = me.body.view.stance.recoveries - attempt.from;
            if (!attempt.down && duel.clock <= attempt.commit + DOWN && me.body.view.down) { attempt.down = true; attempt.downAt = duel.clock; }
          }
        }
      }
      for (const side of SIDES) {
        const t = track[side], me = duel.duelists[side];
        for (const attempt of t.attempts) {
          if (attempt.ended === null) { attempt.ended = duel.clock; attempt.cutByVerdict = true; }
          if (attempt.commit !== null) {
            const until = attempt.downAt ?? attempt.commit + DOWN;
            for (const blow of duel.blows) if (blow.time >= attempt.commit) {
              const mine = blow.sides.find(part => part.fighter === me.id), theirs = blow.sides.find(part => part.fighter !== me.id);
              if (!mine || !theirs) continue;
              if (blow.time <= attempt.ended + AFTER && mine.segment === attempt.effector && theirs.damage > 0)
                attempt.wounds.push({ time: blow.time, body: theirs.fighter, part: theirs.segment, damage: theirs.damage, energy: blow.energy });
              if (blow.time <= attempt.ended + AFTER && mine.segment === attempt.effector)
                (attempt.touches ??= []).push({ after: blow.time - attempt.commit, part: theirs.segment, kind: blow.kind, damage: theirs.damage,
                  kg: theirs.kg, own: mine.kg, closing: blow.closing ?? null, energy: blow.energy ?? null, arm: arms.get(blow) ?? null });
              if (blow.time <= until) attempt.struck += mine.damage;
            }
          }
          delete attempt.from; delete attempt.downAt;
        }
        delete t.sequence;
      }
      parentPort.postMessage({ result: { schema: SCHEMA, seconds: duel.clock, ending: duel.verdict?.ending ?? "time", sides: SIDES.map(side => track[side]) } });
    } catch (error) { parentPort.postMessage({ error: String(error?.stack ?? error) }); }
    finally { dispose?.(); }
  });
}
