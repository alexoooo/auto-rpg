/**
 * Named action lifecycles and physical outcomes in Arena bouts, read from the common report.
 * Per-instance phase time, preparation, verified endings and contact totals are independent of
 * executor kind. Nearby wound records are physical correlations, not action-attributed damage.
 * Node core world, Rapier, 120 Hz, the arena's rulebook; one sequential loop per worker.
 *
 * node research/skills/strikes/strike-bouts.mjs --models man --gaps 3 --held empty --seconds 8 --workers 1
 *
 * Every model fights every model of `--models`, the humanoids where none are named; with `--against`
 * (`--models rat --against man`), each of `--models` fights each of those instead, on either side.
 *
 * Each action is read apart by side: begun, committed, committed with a foot off the ground (the
 * lead foot, the one opposite the striking hand, among them), touched (a wound dealt at all),
 * landed (at least `LANDED`), and the damage its touching blows took (the wounds its effector
 * dealt, a blow's sum).
 *
 * `--set <path>=<JSON>` has both sides fight their model's own mind (`defaultMind`) with what is at
 * `path` replaced by the JSON, or by the JSON file it names (`replacedAt`, as `evaluate --ablate`);
 * `--set left:<path>=<JSON>`, that side's alone, and `--set rat:<path>=<JSON>` that body's on
 * whichever side it fights; one flag a setting, each in turn. The few terms at aggression 3,
 * `chooser.objective={"kind":"few-terms","aggression":3}`; a foe's pressure as its strikes' rate
 * alone, `predictions={"kind":"measured","pressure":"rate"}`.
 *
 * A saved bout keeps its winner, each side's life left (`bars`), when each went down, and each
 * side's decisions (`decisions`): at each of a mind that reports its offers (`Engagement.offers`),
 * the offer it chose, its terms and worth, the best worth of each kind on offer, the life each side
 * had then, and where on the ground each body's centre stood, named as each is pushed below: what
 * `bout-readings.mjs` reads the prices against. And each strike each side threw at the other's body, read as the Strike drill reads a
 * sparring trial (`readFought`) and made a profile's trial as its sparring's are (`strikeTrial`),
 * under the key its profile is found by and the digests it came from (`strikeKey`): what
 * `bout-profiles.mjs` builds profiles from (`strikes`).
 *
 * A bout is saved and found under its bodies, gap, what they held, its seconds and a digest of
 * both minds.
 *
 * A saved bout keeps as well each stretch either body was down (`grounded`, s, from the step one went
 * down to the step both stood): what `bout-readings.mjs` splits a silence by; and what each body's
 * right hand held (`held`, the left empty).
 *
 * A bout whose body's control throws is a fault: named and counted, and left out of what is saved
 * and read; the others play on.
 */
import { isMainThread, parentPort } from "node:worker_threads";
import { writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { BOUT_SCHEMA, savedBouts } from "./bout-save.mjs";
import { workerJobs } from "../../worker-jobs.mjs";
import { medianOf } from "../../../src/evaluation/stats.ts";
import { defaultLanes, simulationWorker } from "../../../scripts/lanes.mjs";

/** A completed action's wound correlation includes a quarter second after its last interval. */
const AFTER = .25;
/** Falls are read for two seconds from commitment; stance recovery continues one second past ending. */
const DOWN = 2, RECOVERY = 1;

if (isMainThread) {
  const { values } = parseArgs({ options: {
    models: { type: "string" }, gaps: { type: "string", default: "3,4,5" }, held: { type: "string", default: "club" },
    seconds: { type: "string", default: "120" }, workers: { type: "string" }, save: { type: "string" }, load: { type: "string" },
    set: { type: "string", multiple: true, default: [] }, against: { type: "string" },
  } });
  /** A `--set`: the side or the body it is for (null, both), the path and the value, the JSON given or the JSON file it names. */
  const sets = values.set.map((text) => {
    const at = text.indexOf("="), side = /^(\w+):/.exec(text.slice(0, Math.max(0, at)))?.[1] ?? null, given = text.slice(at + 1);
    if (at <= 0) throw new Error(`--set is [left:|right:|<model>:]<path>=<JSON or a JSON file>: ${text}`);
    return { side, path: text.slice(side === null ? 0 : side.length + 1, at), value: JSON.parse(existsSync(given) ? readFileSync(given, "utf8") : given) };
  });
  const [{ HUMANOID_MODELS, BODY_MODELS }, { LANDED }, { CONTEXT }, { replacedAt }, { recordingKey }, { sha256Text }] = await Promise.all([import("../../../src/core/bodies/models.ts"),
    import("../../../src/evaluation/strike/read.ts"), import("../../../src/app/node/context.ts"), import("../../../src/app/catalog.ts"),
    import("../../../src/core/world/recording.ts"), import("../../../src/evaluation/sha256.ts")]);
  /** Both sides' minds, `left`'s and `right`'s: each its model's own with what `--set` gives that side or its body, in that order; null where it gives nothing. */
  const mindsOf = (left, right) => sets.length === 0 ? null : Object.fromEntries(["left", "right"].map((side) => {
    const model = side === "left" ? left : right;
    return [side, sets.filter((one) => one.side === null || one.side === side || one.side === model).reduce((mind, { path, value }) => replacedAt(mind, path, value), CONTEXT.defaultMind(model))];
  }));
  const models = values.models?.split(",") ?? HUMANOID_MODELS, against = values.against?.split(",") ?? null, gaps = values.gaps.split(",").map(Number), seconds = Number(values.seconds);
  const lanes = Number(values.workers ?? defaultLanes()), helds = values.held.split(",");
  if (!models.length || [...models, ...against ?? []].some(model => !BODY_MODELS.includes(model)) || gaps.some(gap => !Number.isFinite(gap) || gap <= 0)
    || !Number.isFinite(seconds) || seconds <= 0 || !Number.isSafeInteger(lanes) || lanes < 1 || helds.some(held => !["club", "empty"].includes(held)))
    throw new Error("invalid models, gaps, seconds, workers or held selection");
  const unknown = sets.find((one) => one.side !== null && one.side !== "left" && one.side !== "right" && !BODY_MODELS.includes(one.side));
  if (unknown) throw new Error(`--set for ${unknown.side}: neither a side nor a body`);
  const jobs = [];
  // Each model against each, or, with `--against`, each of `models` against each of those, on either side.
  const pairs = against ? models.flatMap((one) => against.flatMap((other) => [[one, other], [other, one]])) : models.flatMap((left) => models.map((right) => [left, right]));
  for (const held of helds) for (const gap of gaps) for (const [left, right] of pairs) jobs.push({ left, right, gap, held, seconds, minds: mindsOf(left, right) });
  /** A bout's key: its bodies, gap, what they hold and its seconds, and a digest of its minds. */
  const key = (job) => `${job.left} ${job.right} ${job.gap} ${job.held} ${job.seconds} ${sha256Text(recordingKey({ minds: job.minds })).slice(0, 16)}`;
  const loaded = new Map(values.load ? savedBouts(values.load) : []);
  for (const job of jobs) job.result = loaded.get(key(job));
  const played = jobs.filter(job => !job.result), started = Date.now();
  await workerJobs(played, { lanes, create: () => simulationWorker(new URL(import.meta.url)),
    message: ({ result: _, ...settings }) => settings,
    result: ({ result, fault }, job) => {
      // A bout whose body's control threw is a fault: counted and named, kept out of what is saved and read, the rest played on.
      if (fault) { job.fault = fault.split("\n")[0]; process.stderr.write(`${key(job)}: faulted, ${job.fault}\n`); return; }
      job.result = result;
      process.stderr.write(`${key(job)}: ${result.seconds.toFixed(1)} s ${result.ending}\n`);
    } });
  const faulted = jobs.filter(job => job.fault);
  if (faulted.length) console.log(`${faulted.length} of ${jobs.length} bouts faulted, left out: ${faulted.map(job => `${key(job)} (${job.fault})`).join("; ")}`);
  jobs.splice(0, jobs.length, ...jobs.filter(job => !job.fault));
  if (values.save) await writeFile(values.save, JSON.stringify(jobs.map(job => [key(job), job.result])));
  const sum = xs => xs.reduce((total, value) => total + value, 0);
  for (const held of helds) {
    const bouts = jobs.filter(job => job.held === held).map(job => job.result), sides = bouts.flatMap(bout => bout.sides);
    const attempts = sides.flatMap(side => side.attempts), committed = attempts.filter(attempt => attempt.committed);
    const timings = committed.flatMap(attempt => attempt.commit === null ? [] : [attempt.commit - attempt.began]);
    const endings = {};
    for (const attempt of attempts) { const kind = attempt.record?.ending.kind ?? "live-at-verdict"; endings[kind] = (endings[kind] ?? 0) + 1; }
    console.log(`Held ${held}: ${bouts.length} bouts, ${sum(bouts.map(bout => bout.seconds)).toFixed(1)} s; Node core world, Rapier, 120 Hz, the arena's rulebook`);
    console.log(`  action-seconds: ${["prepare", "commit", "release"].map(phase => `${phase} ${sum(sides.map(side => side.phases[phase])).toFixed(2)}`).join(", ")}; idle side-seconds ${sum(sides.map(side => side.idle)).toFixed(2)}`);
    console.log(`  requests ${attempts.length}, committed ${committed.length}; endings ${JSON.stringify(endings)}; median preparation ${medianOf(timings)?.toFixed(2) ?? "unobserved"} s`);
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
        console.log(`  ${side} ${name}: begun ${all.length}, committed ${committed.length}, with a foot off the ground ${committed.filter(attempt => attempt.airborne).length} (the lead ${committed.filter(attempt => attempt.leadUp).length}), `
          + `touched ${touched.length}, landed ${landed.length} (${(landed.length / minutes).toFixed(1)} a minute, each at least ${LANDED} hp), damage a touching blow median ${medianOf(damage)?.toFixed(3) ?? "none"}, `
          + `total ${sum(damage).toFixed(2)}; down within ${DOWN} s ${committed.filter(attempt => attempt.down).length}`);
      }
    }
  }
  console.log(`${jobs.length} bouts, ${played.length} played, in ${((Date.now() - started) / 1000).toFixed(1)} s`);
} else {
  const [{ buildBout }, { BOUT_ENGINE }] = await Promise.all([import("../../../src/app/node/evaluation.ts"), import("../../bout.mjs")]);
  const { SIDES } = await import("../../../src/game/arena/duel.ts");
  const [{ readFought }, { strikeTrial }, { senseDelayOf }, { strikeKey, strikesOf }] = await Promise.all([import("../../../src/evaluation/strike/fought.ts"),
    import("../../../src/evaluation/strike/trial.ts"), import("../../../src/game/arena/duel.ts"), import("./strike-keys.mjs")]);
  const { footOn } = await import("../../../src/control/support.ts");
  const { CONTEXT } = await import("../../../src/app/node/context.ts");
  parentPort.on("message", async ({ left, right, gap, held, seconds, minds }) => {
    let dispose;
    try {
      const recipe = { left, right, gap, capSeconds: seconds, loadouts: { left: { left: "empty", right: held }, right: { left: "empty", right: held } },
        ...(minds ? { minds } : {}) };
      const bout = await buildBout(recipe, { engine: BOUT_ENGINE }); dispose = bout.dispose;
      const { world, duel } = bout, track = Object.fromEntries(SIDES.map(side => [side, {
        side, model: side === "left" ? left : right, phases: { prepare: 0, commit: 0, release: 0 }, idle: 0, attempts: [], sequence: 0,
      }]));
      const byId = Object.fromEntries(SIDES.map(side => [side, new Map()]));
      const fought = readFought(bout);
      const attemptOf = (side, action) => {
        const existing = byId[side].get(action.id);
        if (existing) return existing;
        const attempt = { id: action.id, action: action.action, effector: action.effector, target: structuredClone(action.target),
          began: "began" in action ? action.began : duel.clock, commit: null, ended: null, committed: false,
          contacts: structuredClone(action.contacts), record: null, cutByVerdict: false, recoveries: 0, down: false,
          from: duel.duelists[side].body.view.stance.recoveries, downAt: null, wounds: [], struck: 0 };
        byId[side].set(action.id, attempt); track[side].attempts.push(attempt); return attempt;
      };
      // When each side went down; and each decision of its mind (its offers anew).
      const downs = { left: [], right: [] }, wasDown = { left: false, right: false }, grounded = [], state = { groundedSince: null }, decisions = { left: [], right: [] }, offered = { left: null, right: null };
      while (!duel.verdict && duel.clock < seconds) {
        world.step();
        fought.afterStep();
        const either = SIDES.some((side) => duel.duelists[side].body.view.down);
        if (either && state.groundedSince === null) state.groundedSince = duel.clock;
        else if (!either && state.groundedSince !== null) { grounded.push([state.groundedSince, duel.clock]); state.groundedSince = null; }
        for (const side of SIDES) {
          const me = duel.duelists[side], foe = duel.duelists[side === "left" ? "right" : "left"], down = me.body.view.down;
          if (down && !wasDown[side]) downs[side].push(duel.clock);
          wasDown[side] = down;
          const engagement = me.minded.report.engagement, offers = engagement?.offers;
          if (offers && offers !== offered[side]) {
            offered[side] = offers;
            const chosen = offers.find((offer) => offer.name === engagement.phase), terms = chosen?.terms, a = me.body.view.stance.centre, b = foe.body.view.stance.centre;
            /** An offer's terms: how long, s, and the life it deals and takes; null with none. */
            const termsOf = (t) => t ? { duration: +t.duration.toFixed(3), dealt: +t.dealt.toFixed(5), taken: +t.taken.toFixed(5) } : null;
            const hold = offers.find((offer) => offer.name === "hold")?.terms;
            /** The best worth of each kind of offer (`Option.kind`). */
            const bestByKind = (all) => { const best = {}; for (const offer of all) best[offer.kind] = Math.max(best[offer.kind] ?? -Infinity, +offer.worth.toFixed(5)); return best; };
            decisions[side].push({
              t: +duel.clock.toFixed(4),
              /** How far apart the two bodies' centres are, m. */
              apart: +Math.hypot(a.x - b.x, a.z - b.z).toFixed(3),
              chosen: engagement.phase, terms: termsOf(terms),
              /** What the search found the chosen offer worth (`Offer.worth`), and the best of each kind on offer. */
              worth: chosen ? +chosen.worth.toFixed(5) : null, worths: bestByKind(offers),
              /** Its own life then, and the foe's. */
              life: +me.pool.bar().toFixed(5), foeLife: +foe.pool.bar().toFixed(5),
              /** Holding's price a second, life; null where it is not offered or takes no time. */
              holding: hold && hold.duration > 0 ? +(hold.taken / hold.duration).toFixed(6) : null,
              /** Each strike offered, by its skill and limb (`Offer.name`), with its worth and terms. */
              strikes: offers.filter((offer) => offer.kind === "strike").map((offer) => ({ name: offer.name, worth: +offer.worth.toFixed(5), terms: termsOf(offer.terms) })),
              /** What it read the foe doing (`Engagement.foe`). */
              foe: engagement.foe ?? null,
              /** Where its body's centre stood on the ground, and the foe's. */
              at: [+a.x.toFixed(3), +a.z.toFixed(3)], foeAt: [+b.x.toFixed(3), +b.z.toFixed(3)],
              /** The kind of the Option it runs (`Engagement.kind`). */
              kind: engagement.kind ?? null,
            });
          }
        }
        for (const side of SIDES) {
          const t = track[side], me = duel.duelists[side], report = me.minded.skills.report;
          if (!report.actions.length) t.idle += world.dt;
          for (const action of report.actions) {
            t.phases[action.phase] += world.dt;
            const attempt = attemptOf(side, action); attempt.contacts = structuredClone(action.contacts);
            if (action.phase === "commit" && attempt.commit === null) {
              attempt.commit = duel.clock; attempt.committed = true; attempt.from = me.body.view.stance.recoveries;
              attempt.airborne = Object.values(me.body.view.stance.ends).some(end => end.touching === false);
              const hand = attempt.effector === "hand.left" ? "left" : attempt.effector === "hand.right" ? "right" : null;
              attempt.leadUp = hand !== null && me.body.view.stance.ends[footOn(me.body.built.spec, hand === "left" ? "right" : "left")]?.touching === false;
            }
          }
          for (const record of report.ledger) if (record.sequence > t.sequence) {
            const attempt = attemptOf(side, record);
            attempt.began = record.began; attempt.ended = record.ended; attempt.committed = record.committed;
            attempt.contacts = structuredClone(record.contacts); attempt.record = structuredClone(record); t.sequence = record.sequence;
          }
          for (const attempt of t.attempts) if (attempt.commit !== null) {
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
              if (blow.time <= until) attempt.struck += mine.damage;
            }
          }
          delete attempt.from; delete attempt.downAt;
        }
        delete t.sequence;
      }
      // Each side's strikes as profiles' trials, under the key each profile is found by.
      const thrown = fought.done(), reaction = Math.round(senseDelayOf(duel.recipe) * world.hz) / world.hz, specOf = (side) => duel.duelists[side].body.built.spec;
      const strikes = SIDES.map((side) => {
        const spec = specOf(side), struck = specOf(side === "left" ? "right" : "left"), mind = duel.recipe.minds?.[side] ?? CONTEXT.defaultMind(duel.recipe[side]);
        const { executors, actions } = strikesOf(spec, mind), keyed = new Map();
        for (const { action: name, effector, reading } of thrown.filter((one) => one.striker === side)) {
          const action = actions.find((one) => one.name === name), trial = action && strikeTrial(reading, { spec, struck, rules: duel.rules });
          if (!trial) continue;
          const found = strikeKey(spec, mind, executors, action, effector, world.hz, reaction, world.delay), key = JSON.stringify(found.measured);
          if (!keyed.has(key)) keyed.set(key, { ...found, trials: [] });
          keyed.get(key).trials.push(trial);
        }
        return [...keyed.values()];
      });
      parentPort.postMessage({ result: { schema: BOUT_SCHEMA, held, strikes, seconds: duel.clock, ending: duel.verdict?.ending ?? "time", winner: duel.verdict?.winner ?? null,
        bars: SIDES.map(side => duel.duelists[side].pool.bar()), hp: SIDES.map(side => duel.duelists[side].body.built.spec.wounds.hp.value), downs: SIDES.map(side => downs[side]), grounded: state.groundedSince === null ? grounded : [...grounded, [state.groundedSince, duel.clock]], decisions: SIDES.map(side => decisions[side]), sides: SIDES.map(side => track[side]) } });
    } catch (error) { parentPort.postMessage({ fault: String(error?.stack ?? error) }); }
    finally { dispose?.(); }
  });
}
