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
 *
 * `--aggression 2` has both sides fight their model's own mind (`defaultMind`) with its chooser's
 * objective the few terms at that aggression (`FewTermsConfig`), and at `--initiative <rate>`
 * where given (`FewTermsConfig.initiative`, a rate a second, which the part bounds); without it, the objective is the
 * mind's own. A saved bout keeps its winner, each side's life left (`bars`), when each went down,
 * and, at each decision of a mind that reports its offers (`Engagement.offers`), the offer it chose
 * and its terms, the life each side had then, and where on the ground each body's centre stood
 * (`decisions`, the side's then the foe's, last in a row): what `bout-readings.mjs` reads the
 * prices against. And each strike each side threw at the other's body, read as the Strike drill
 * reads a sparring trial (`readFought`) and made a profile's trial as its sparring's are
 * (`strikeTrial`), under the key its profile is found by and the digests it came from
 * (`strikeKey`): what `bout-profiles.mjs` builds profiles from (`strikes`).
 *
 * `--carriage left={"lead":"left","width":0.25,"stagger":0.4,"lower":0.1}` has that side's mind (its
 * model's own, at `--aggression` where given) walk its stance-walk gaits in that carriage all bout
 * (`Carriage`), one flag a side; its profiles stay those measured from the square stand.
 *
 * `--back-step left` has that side's mind (its model's own, at `--aggression` where given) fight
 * with the back step, its Option and its gait, which the game's minds do not take yet
 * (`withBackStep`), one flag a side.
 *
 * A saved bout keeps as well each stretch either body was down (`grounded`, s, from the step one went
 * down to the step both stood): what `bout-readings.mjs` splits a silence by; and what each body's
 * right hand held (`held`, the left empty).
 *
 * A bout whose body's control throws is a fault: named and counted, and left out of what is saved
 * and read; the others play on.
 *
 * `--pressure measured` has both sides' minds (their models' own, at `--aggression` where given)
 * read a foe's pressure by what bouts measured (`MeasuredConfig.pressure`,
 * `assets/minds/pressure-profiles.json`) in place of its strikes' rate; `--pressure <table.json>`,
 * by a table `research/minds/pressure-profiles.mjs --out` wrote, in place of the asset's.
 *
 * `--foe-steps <s>` has both sides' minds price a walk's arrival with the foe going on as it goes,
 * its velocity fading over about that long (`MeasuredConfig.foeSteps`), their predictions else the
 * game's; `--foe-steps <table.json>`, as bouts measured the foe's steps (`research/minds/foe-steps.mjs`),
 * in a walk's arrival and where the back step leaves the two.
 *
 * `--chooser <json>` merges those fields into both sides' minds' chooser (`{"keeps":0.5}`, a line's
 * `end`), their minds else the game's.
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { BOUT_SCHEMA, savedBouts } from "./bout-save.mjs";
import { workerJobs } from "../../worker-jobs.mjs";
import { medianOf } from "../../../src/evaluation/stats.ts";

/** A completed action's wound correlation includes a quarter second after its last interval. */
const AFTER = .25;
/** Falls are read for two seconds from commitment; stance recovery continues one second past ending. */
const DOWN = 2, RECOVERY = 1;

if (isMainThread) {
  const { values } = parseArgs({ options: {
    models: { type: "string" }, gaps: { type: "string", default: "3,4,5" }, held: { type: "string", default: "club" },
    seconds: { type: "string", default: "120" }, workers: { type: "string" }, save: { type: "string" }, load: { type: "string" },
    holds: { type: "string", multiple: true, default: [] },
    drill: { type: "string" }, pace: { type: "string" }, aggression: { type: "string" }, initiative: { type: "string" }, carriage: { type: "string", multiple: true, default: [] },
    "back-step": { type: "string", multiple: true, default: [] }, pressure: { type: "string" }, "foe-steps": { type: "string" }, chooser: { type: "string" },
  } });
  if (values.pressure !== undefined && values.pressure !== "rate" && values.pressure !== "measured" && !values.pressure.endsWith(".json")) throw new Error("--pressure is rate, measured or a table research/minds/pressure-profiles.mjs --out wrote");
  const stepsAsked = values["foe-steps"], pressureTable = values.pressure?.endsWith(".json") ? JSON.parse(await readFile(values.pressure, "utf8")).profiles : null, pressure = pressureTable ? "measured" : values.pressure ?? null, chooser = values.chooser === undefined ? null : JSON.parse(values.chooser);
  const foeSteps = stepsAsked === undefined ? null : stepsAsked.endsWith(".json") ? (({ source: _, ...table }) => table)(JSON.parse(await readFile(stepsAsked, "utf8"))) : Number(stepsAsked);
  if (typeof foeSteps === "number" && !(foeSteps > 0)) throw new Error("--foe-steps is seconds over 0, or a table research/minds/foe-steps.mjs wrote");
  const aggression = values.aggression === undefined ? null : Number(values.aggression);
  if (aggression !== null && !(aggression >= 1 && aggression <= 5)) throw new Error("--aggression is a number from 1 to 5");
  const initiative = values.initiative === undefined ? null : Number(values.initiative);
  if (initiative !== null && (aggression === null || !Number.isFinite(initiative))) throw new Error("--initiative is a rate a second, with --aggression");
  // With `--drill stand|guard`, the left side is drilled at the right's trunk's middle with its punch (the Strike drill's Option Mind and Commander,
  // walking into the window at `--pace` m/s, or ordering it where it stands with none), the right a drill opponent (`drill-stand`, `drill-guard`),
  // the two set the gap apart, centre to centre, facing.
  const drill = values.drill === undefined ? null : { opponent: `drill-${values.drill}`, ...(values.pace === undefined ? {} : { pace: Number(values.pace) }) };
  const holds = Object.fromEntries(values.holds.map(one => one.split("=")));
  const carriages = Object.fromEntries(values.carriage.map(one => { const at = one.indexOf("="); return [one.slice(0, at), JSON.parse(one.slice(at + 1))]; }));
  if (Object.keys(carriages).some(side => side !== "left" && side !== "right")) throw new Error("--carriage is <left|right>=<JSON>");
  if (Object.keys(holds).some(side => side !== "left" && side !== "right")) throw new Error("--holds is <left|right>=<skill/variation>");
  const added = Object.fromEntries(values["back-step"].map(side => [side, true]));
  if (Object.keys(added).some(side => side !== "left" && side !== "right")) throw new Error("--back-step is left or right");
  const [{ HUMANOID_MODELS }, { LANDED }] = await Promise.all([import("../../../src/core/bodies/models.ts"), import("../../../src/evaluation/strike/read.ts")]);
  const models = values.models?.split(",") ?? HUMANOID_MODELS, gaps = values.gaps.split(",").map(Number), seconds = Number(values.seconds);
  const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2)), helds = values.held.split(",");
  if (!models.length || models.some(model => !HUMANOID_MODELS.includes(model)) || gaps.some(gap => !Number.isFinite(gap) || gap <= 0)
    || !Number.isFinite(seconds) || seconds <= 0 || !Number.isSafeInteger(lanes) || lanes < 1 || helds.some(held => !["club", "empty"].includes(held)))
    throw new Error("invalid models, gaps, seconds, workers or held selection");
  const jobs = [];
  for (const held of helds) for (const gap of gaps) for (const left of models) for (const right of models) jobs.push({ left, right, gap, held, seconds, holds, drill, aggression, initiative, carriages, added, pressure, pressureTable, foeSteps, chooser });
  const key = job => `${job.left} ${job.right} ${job.gap} ${job.held} ${job.seconds} ${JSON.stringify(job.drill ? { ...job.holds, drill: job.drill } : job.holds)}${job.aggression === null ? "" : ` aggression ${job.aggression}`}${job.initiative == null ? "" : ` initiative ${job.initiative}`}${Object.keys(job.carriages).length ? ` carriages ${JSON.stringify(job.carriages)}` : ""}${Object.keys(job.added ?? {}).length ? ` back step ${Object.keys(job.added).join(",")}` : ""}${job.foeSteps === null ? "" : ` foe steps ${typeof job.foeSteps === "number" ? job.foeSteps : "measured"}`}${job.chooser === null ? "" : ` chooser ${JSON.stringify(job.chooser)}`}`;
  const loaded = new Map(values.load ? savedBouts(values.load) : []);
  for (const job of jobs) job.result = loaded.get(key(job));
  const played = jobs.filter(job => !job.result), started = Date.now();
  await workerJobs(played, { lanes, create: () => new Worker(new URL(import.meta.url)),
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
        console.log(`  ${side} (${holds[side] ?? "own"}) ${name}: begun ${all.length}, committed ${committed.length}, with a foot off the ground ${committed.filter(attempt => attempt.airborne).length} (the lead ${committed.filter(attempt => attempt.leadUp).length}), `
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
  const { characterSkills } = await import("../../../src/core/bodies/models.ts");
  const { footOn } = await import("../../../src/control/support.ts");
  const { CONTEXT } = await import("../../../src/app/node/context.ts");
  const { createDrillOpponents } = await import("../../../src/evaluation/drill-opponents.ts");
  /** A model's own mind with its chooser's objective the few terms at `aggression`, and `initiative` where it is not null. */
  const mindAt = (model, aggression, initiative) => { const mind = CONTEXT.defaultMind(model); return { ...mind, chooser: { ...mind.chooser, objective: { kind: "few-terms", aggression, ...initiative === null ? {} : { initiative } } } }; };
  const { inCarriage: carried, withBackStep } = await import("../../../src/minds/option/config.ts");
  const { loadData } = await import("../../../src/core/data/store.ts");
  parentPort.on("message", async ({ left, right, gap, held, seconds, holds, drill, aggression, initiative = null, carriages = {}, added = {}, pressure = null, pressureTable = null, foeSteps = null, chooser = null }) => {
    let dispose;
    try {
      // A table from a file is the pressure data this worker loads, before any mind asks for the asset's; a worker plays one table.
      if (pressureTable) await loadData(["pressure-profiles"], { "pressure-profiles": async () => pressureTable });
      if ((aggression !== null || Object.keys(carriages).length || Object.keys(added).length || pressure !== null || foeSteps !== null || chooser !== null) && drill) throw new Error("--aggression, --carriage, --back-step, --pressure, --foe-steps and --chooser set both sides' minds; a drill sets its own");
      const skills = Object.fromEntries(Object.entries(holds).map(([side, variation]) => [side, characterSkills(side === "left" ? left : right, [variation])]));
      const drilled = drill ? { recoverySeconds: null, entry: [], ends: [],
        start: { left: { at: [-gap / 2, 0], heading: Math.PI / 2 }, right: { at: [gap / 2, 0], heading: -Math.PI / 2 } },
        minds: { left: CONTEXT.catalog.minds["option-drill"].config, right: createDrillOpponents(CONTEXT).opponentOf(drill.opponent).mind },
        commanders: { left: { kind: "drill", skill: "straight-punch", region: { kind: "mark", mark: "middle" }, after: .5, ...(drill.pace === undefined ? { walking: true } : { pace: drill.pace }) } } } : {};
      const recipe = { left, right, gap, capSeconds: seconds, loadouts: { left: { left: "empty", right: held }, right: { left: "empty", right: held } },
        ...(Object.keys(skills).length ? { skills } : {}), ...drilled, ...(aggression === null && !Object.keys(carriages).length && !Object.keys(added).length && pressure === null && foeSteps === null && chooser === null ? {} : { minds: Object.fromEntries(SIDES.map((side) => {
          const model = side === "left" ? left : right, own = aggression === null ? CONTEXT.defaultMind(model) : mindAt(model, aggression, initiative);
          const pressing = pressure === null ? own : { ...own, predictions: { ...(own.predictions ?? { kind: "measured" }), pressure } };
          const priced = foeSteps === null ? pressing : { ...pressing, predictions: { ...(pressing.predictions ?? { kind: "measured", pressure: "measured" }), foeSteps } };
          const chosen = chooser === null ? priced : { ...priced, chooser: { ...priced.chooser, ...chooser } };
          const mind = added[side] ? withBackStep(chosen) : chosen;
          return [side, carriages[side] ? carried(mind, carriages[side]) : mind];
        })) }) };
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
      // When each side went down; and at each decision of its mind (its offers anew), [s, apart m centre to centre, the offer chosen, its terms'
      // duration s, dealt and taken (life), its own life then, the foe's, holding's price a second (life), each strike offered: [its skill and limb, its terms],
      // what it read the foe doing, where each body's centre stood, its then the foe's, and the kind of the option it runs (`Engagement.kind`)].
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
            const termsOf = (t) => t ? [+t.duration.toFixed(3), +t.dealt.toFixed(5), +t.taken.toFixed(5)] : [null, null, null];
            const hold = offers.find((offer) => offer.name === "hold")?.terms;
            decisions[side].push([+duel.clock.toFixed(4), +Math.hypot(a.x - b.x, a.z - b.z).toFixed(3), engagement.phase, ...termsOf(terms), +me.pool.bar().toFixed(5), +foe.pool.bar().toFixed(5),
              hold && hold.duration > 0 ? +(hold.taken / hold.duration).toFixed(6) : null,
              offers.filter((offer) => offer.kind === "strike").map((offer) => [offer.name, ...termsOf(offer.terms)]), engagement.foe ?? null,
              [+a.x.toFixed(3), +a.z.toFixed(3)], [+b.x.toFixed(3), +b.z.toFixed(3)], engagement.kind ?? null]);
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
