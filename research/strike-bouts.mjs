/**
 * **What the strike skill does in a bout.** Arena bouts of every pair of `BODY_MODELS` at each of
 * `--gaps`, each side's mind the fighter, read step by step from its skills' report
 * (`StrikeReport`): the time each side spends in each strike phase; each attempt (from the skill
 * taking a hand's attack up to its blow thrown, dropped or cut by the verdict), how long it took to
 * set up (to its chamber), how often its feet were set again; where the foe's head stood against
 * the chosen recipe's window when the throw was committed and when its pushes began, and how far
 * the point its tactics held to attack (`fighterTactics`) was from that head then; whether the
 * throw landed a blow of the thrower's hand or what it holds on the foe, and on what part; the
 * steps the thrower's stance took to catch it from the commit to a second after the throw; and
 * whether it was down within `DOWN` seconds of the commit, and the hit points its foe's blows took
 * from it from the commit until then.
 *
 * Node core world, Rapier, 120 Hz, the arena's rulebook; each bout on a worker of its own.
 *
 *   node research/strike-bouts.mjs [--gaps 3,4,5] [--held club,empty] [--workers 14] [--save rows.json] [--load rows.json]
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

/** Seconds after a throw's end a blow is still its throw's; seconds after the commit within which a fall is the throw's. */
const AFTER = 0.25, DOWN = 2;
/** The longest a bout is played, s. */
const CAP = 120;

if (isMainThread) {
  const { values } = parseArgs({ options: {
    gaps: { type: "string", default: "3,4,5" }, held: { type: "string", default: "club" }, workers: { type: "string" },
    save: { type: "string" }, load: { type: "string" },
  } });
  const { BODY_MODELS } = await import("../src/core/human/spec.ts");
  const jobs = [];
  for (const held of values.held.split(",")) for (const gap of values.gaps.split(",").map(Number)) {
    for (const left of BODY_MODELS) for (const right of BODY_MODELS) jobs.push({ left, right, gap, held });
  }
  const key = (job) => `${job.left} ${job.right} ${job.gap} ${job.held}`;
  const loaded = new Map(values.load ? JSON.parse(await readFile(values.load, "utf8")) : []);
  for (const job of jobs) job.result = loaded.get(key(job));
  const played = jobs.filter((job) => !job.result);
  const lanes = Number(values.workers ?? Math.max(1, availableParallelism() - 2)), started = Date.now();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(lanes, played.length) }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url));
    const feed = () => {
      if (next >= played.length) { worker.terminate(); resolve(); return; }
      const id = next++;
      worker.once("message", ({ result, error }) => {
        if (error) { reject(new Error(error)); return; }
        played[id].result = result;
        process.stderr.write(`${key(played[id])}: ${result.seconds.toFixed(1)} s ${result.ending}, ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
        feed();
      });
      const { result: _, ...job } = played[id];
      worker.postMessage(job);
    };
    feed();
  })));
  if (values.save) await writeFile(values.save, JSON.stringify(jobs.map((job) => [key(job), job.result])));

  const sum = (xs) => xs.reduce((s, x) => s + x, 0), median = (xs) => xs.length ? [...xs].sort((p, q) => p - q)[xs.length >> 1] : NaN;
  const of = (n, d) => `${n} of ${d}`;
  for (const held of values.held.split(",")) {
    const bouts = jobs.filter((job) => job.held === held).map((job) => job.result), sides = bouts.flatMap((b) => b.sides);
    const attempts = sides.flatMap((s) => s.attempts), committed = attempts.filter((a) => a.commit !== null);
    const phases = Object.keys(sides[0].phases), total = sum(sides.map((s) => sum(Object.values(s.phases))));
    console.log(`Held ${held}: ${bouts.length} bouts, ${sum(bouts.map((b) => b.seconds)).toFixed(0)} s; Node core world, Rapier, 120 Hz, the arena's rulebook`);
    console.log(`  a side's time by strike phase: ${phases.map((k) => `${k} ${(100 * sum(sides.map((s) => s.phases[k])) / total).toFixed(1)} %`).join(", ")}`);
    console.log(`  attempts ${attempts.length}: committed ${committed.length}, thrown ${attempts.filter((a) => a.thrown).length}, `
      + `dropped before the chamber ${attempts.filter((a) => a.commit === null && !a.cut).length}, cut by the verdict ${attempts.filter((a) => a.cut).length}`);
    console.log(`  set-up (attempt begun to chamber), s: median ${median(committed.map((a) => a.commit.time - a.start)).toFixed(2)}; `
      + `feet set again a committed attempt ${(sum(committed.map((a) => a.replaced)) / committed.length).toFixed(2)}`);
    const recipes = committed.filter((a) => a.commit.at !== null);
    const begun = recipes.filter((a) => a.begun !== null);
    console.log(`  the foe's head in the recipe's window: at commit ${of(recipes.filter((a) => a.commit.at.inside).length, recipes.length)}, `
      + `as the pushes began ${of(begun.filter((a) => a.begun.at.inside).length, begun.length)}; its head moved between, cm: median ${(100 * median(begun.map((a) => a.begun.moved))).toFixed(1)}`);
    const aimed = committed.map((a) => a.commit.aimed).filter((d) => d !== null);
    console.log(`  the point the tactics held from the foe's head at commit, cm: median ${(100 * median(aimed)).toFixed(1)}, `
      + `over 5 cm in ${of(aimed.filter((d) => d > 0.05).length, aimed.length)}, over 10 cm in ${aimed.filter((d) => d > 0.1).length}`);
    for (const model of [...new Set(sides.map((s) => s.model))]) {
      const mine = sides.filter((s) => s.model === model).flatMap((s) => s.attempts).filter((a) => a.commit !== null);
      const landed = mine.filter((a) => a.landed.length), headed = mine.filter((a) => a.landed.some((b) => b.part === "head"));
      const stepped = mine.filter((a) => a.recoveries > 0), down = mine.filter((a) => a.down), struck = down.filter((a) => a.struck > 0);
      console.log(`  ${model}: committed ${mine.length}, placed ${mine.filter((a) => a.commit.at === null).length}; landed ${landed.length}, on the head ${headed.length}, `
        + `done ${sum(mine.flatMap((a) => a.landed.map((b) => b.done))).toFixed(2)} HP; the thrower stepped to catch itself in ${stepped.length}, down within ${DOWN} s in ${down.length}, struck by the foe before it in ${struck.length}`);
    }
  }
  console.log(`${jobs.length} bouts, ${played.length} played, in ${((Date.now() - started) / 1000).toFixed(0)} s`);
} else {
  const { buildBout } = await import("./bout.mjs");
  const { SIDES } = await import("../src/arena/duel.ts");
  const { sin, cos, hypot } = await import("../src/core/math/real.ts");
  parentPort.on("message", async ({ left, right, gap, held }) => {
    try {
      const recipe = { left, right, gap, ...(held === "empty" ? { held: { left: "empty", right: "empty" } } : {}) };
      const { world, duel, dispose } = await buildBout(recipe);
      const { dt } = world;
      const track = Object.fromEntries(SIDES.map((side) => [side, {
        side, model: side === "left" ? left : right,
        phases: { none: 0, approach: 0, place: 0, settle: 0, chamber: 0, swing: 0 }, attempts: [], open: null, last: null, thrown: 0,
      }]));
      /** Where the foe's head stands from the thrower's own head, along its heading past the blow's stand-off and across, against the chosen recipe's window. */
      const offsetOf = (me, report, heading, foeHead) => {
        const chosen = report.chosen, head = me.body.view.head;
        if (!chosen) return null;
        const fx = sin(heading), fz = cos(heading), dx = foeHead.x - head.x, dz = foeHead.z - head.z;
        const along = dx * fx + dz * fz - report.distance, across = dx * fz - dz * fx, w = chosen.window;
        return { along, across, inside: w.along[0] <= along && along <= w.along[1] && w.across[0] <= across && across <= w.across[1] };
      };
      while (!duel.verdict && duel.clock < CAP) {
        world.step();
        for (const side of SIDES) {
          const t = track[side], me = duel.duelists[side], foe = duel.duelists[side === "left" ? "right" : "left"];
          const skills = me.minded.skills.report, report = skills.strike, phase = report.phase, foeHead = foe.body.view.head;
          const recoveries = me.body.view.stance.recoveries;
          t.phases[phase ?? "none"] += dt;
          const thrown = report.thrown.right + report.thrown.left;
          if (phase && !t.open) t.open = { start: duel.clock, replaced: 0, commit: null, begun: null, end: null, thrown: false, cut: false, recoveries: 0, down: false, from: null };
          const a = t.open;
          if (a) {
            if (t.last === "settle" && phase === "place") a.replaced += 1;
            if (!a.commit && (phase === "chamber" || phase === "swing")) {
              const aim = me.minded.skills.state.tactics?.aim?.point ?? null;
              a.commit = { time: duel.clock, head: [foeHead.x, foeHead.y, foeHead.z], at: offsetOf(me, report, skills.heading, foeHead),
                aimed: aim && hypot(aim[0] - foeHead.x, aim[1] - foeHead.y, aim[2] - foeHead.z) };
              a.from = recoveries;
            }
            if (a.commit && !a.begun && report.since >= 0) {
              const [x, y, z] = a.commit.head;
              a.begun = { at: offsetOf(me, report, skills.heading, foeHead), moved: hypot(foeHead.x - x, foeHead.y - y, foeHead.z - z) };
            }
            if (thrown > t.thrown || !phase) { a.thrown = thrown > t.thrown; a.end = duel.clock; t.attempts.push(a); t.open = null; }
          }
          // After a throw: the stance's steps to a second past its end, and a fall within `DOWN` of its commit.
          for (const done of t.attempts.slice(-2)) if (done.commit && duel.clock <= done.end + 1) done.recoveries = recoveries - done.from;
          for (const done of t.attempts.slice(-2)) if (done.commit && !done.down && duel.clock <= done.commit.time + DOWN && me.body.view.down) { done.down = true; done.downAt = duel.clock; }
          t.thrown = thrown;
          t.last = phase;
        }
      }
      for (const side of SIDES) { const t = track[side]; if (t.open) { t.open.end = duel.clock; t.open.cut = true; t.attempts.push(t.open); } }
      for (const side of SIDES) {
        const t = track[side], me = duel.duelists[side];
        for (const a of t.attempts) {
          a.landed = !a.commit ? [] : duel.blows.filter((b) => b.time >= a.commit.time && b.time <= a.end + AFTER).flatMap((b) => {
            const mine = b.sides.find((s) => s.fighter === me.id), theirs = b.sides.find((s) => s.fighter !== me.id);
            const striking = mine && (mine.item !== null || mine.segment.startsWith("hand."));
            return striking && theirs && theirs.damage > 0 ? [{ part: theirs.segment, done: theirs.damage, energy: b.energy }] : [];
          });
          // What the foe's blows took from the thrower from the commit to its fall, or to `DOWN` after the commit.
          const until = a.down ? a.downAt : a.commit ? a.commit.time + DOWN : 0;
          a.struck = !a.commit ? 0 : duel.blows.filter((b) => b.time >= a.commit.time && b.time <= until).reduce((sum, b) => {
            const mine = b.sides.find((s) => s.fighter === me.id), theirs = b.sides.find((s) => s.fighter !== me.id);
            return sum + (mine && theirs && (theirs.item !== null || theirs.segment.startsWith("hand.")) ? mine.damage : 0);
          }, 0);
          delete a.from; delete a.downAt;
        }
        delete t.open; delete t.last; delete t.thrown;
      }
      parentPort.postMessage({ result: { seconds: duel.clock, ending: duel.verdict?.ending ?? "none", sides: SIDES.map((side) => track[side]) } });
      dispose();
    } catch (error) { parentPort.postMessage({ error: String(error?.stack ?? error) }); }
  });
}
