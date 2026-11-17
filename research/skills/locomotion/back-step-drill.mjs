/**
 * **The back step's drill**: punches thrown at a body that may only step, and what they took.
 * Node core world, Rapier, 120 Hz, the arena's rulebook; a trial a start gap.
 *
 *   node research/skills/locomotion/back-step-drill.mjs --policy stand --policy away:1.2 [--attacker drill|mind] [--gaps 2:3:0.05]
 *     [--pace 1] [--seconds 20] [--model man] [--workers 12] [--save <file>] [--trials]
 *     [--carriage '{"width":0.25,"stagger":0.4}']
 *
 * **The attacker** (left) throws its character's own straight punch, as `--attacker` says:
 * - `drill` (the default): the drills' Option Mind (`option-drill`) under a drill Commander that
 *   walks it into the punch's window at `--pace` m/s and orders the punch the first step it is
 *   ready, walking, at the trunk's middle (a blow of each hand, as its punch goes). It fires from the
 *   window's far edge; the trial runs
 *   `AFTER` s past the first fire.
 * - `mind`: its model's own mind (`defaultMind`), fighting as it does in the Arena under the game's
 *   end rules, for `--seconds` s or until the bout ends. Its punches fire where a fight's do.
 *
 * **The defender** (right) goes where it is ordered, its hands at guard, throwing nothing and
 * covering nothing; this script orders it (`Duel.order`), by a policy:
 * - `stand`: it stands, facing the attacker.
 * - `away:<range>[:<seconds>[:<pace>]]`: it stands until it senses the attacker's centre within
 *   `range` m of its own (what it sees is the bout's reaction time old), then walks straight away
 *   from it, facing it, for `seconds` s (1.5 with none) no faster than `pace` (its legs' own with
 *   none); then it goes back to `BACK` of the attacker for `RETURN` s, and stands to step again.
 * - `seen[:<seconds>[:<pace>]]`: as `away`, begun once a punch of the attacker's has been under way
 *   for the reaction time: the earliest any reading of what the defender sees could tell.
 * - `step:<range>[:<seconds>]`: as `away`, its step the back step (`back-step`,
 *   `src/skills/locomotion/back-step/index.ts`): ordered to stand by that gait, which its Move has
 *   among its gaits (the stock ones and it), for `seconds` s (0.6 with none) and until it is still on
 *   both feet (`STILL`); then back as `away` goes.
 * - `sway:<range>[:<closing>[:<out>[:<rest>[:<beyond>]]]]`: the back step ordered when it senses the attacker
 *   within `range` and coming at `closing` m/s or more (0 with none; over the last `CLOSING` s
 *   of what it sees), held back `out` s (0.4 with none) and brought in over `SWAY_BACK` s, the
 *   order held as long, the centre asked `beyond` m behind the rear sole (the gait's own with none); then it stands for `rest` s (0.3 with none) before it may sway again. It
 *   never walks back in.
 * - `keep:<range>`: from the start it holds `range` to `range` + 0.2 m of the attacker (the legs'
 *   own range keeping).
 * - `shove:<range>:<speed>[:<every>]`: as `away` with no walk: when it senses the attacker within
 *   `range` its whole body is given `speed` m/s away from the attacker by no muscle of its own
 *   (every segment pushed through its centre by its own mass times the speed), no sooner than
 *   `every` s after the last time (0.75 with none), and it stands. No body can do this; it reads
 *   what a step that began at once and left at that speed would be worth, and whether the legs
 *   catch it.
 *
 * With `--carriage` (`Carriage`'s width and stagger, m, the left foot leading) the defender stands
 * in it under every policy, its walk and its back step alike. With `--set <range>` as well it starts
 * square instead, its walk the stock one, and takes the carriage as part of what it is ordered: a
 * gait `set`, the walk in the stance in that carriage, ordered while it senses the attacker within
 * `range` (until `SET_OFF` beyond it), which steps its feet into the carriage; its back step holds
 * the carriage too. It prints, beside, the trials' median seconds from the first `set` order to the
 * feet set (the lead foot `SET_SHARE` of the stagger ahead, standing), and the punches thrown and
 * taken while setting.
 *
 * It prints, a policy a row: trials; punches thrown; **taken**, the punches that took at least
 * `LANDED` hp, and their share of the punches thrown (the drill's number); the median of what a
 * punch took; the life the defender lost a trial, hp; trials the defender went down in, and the
 * attacker; at a punch's fire, how far apart (centres) and how fast the defender was going away,
 * m/s; how far the defender went away from the fire to `REACH` s after it (about when a punch that
 * lands does); how far `STEP` s after its first order to go; of the punches whose defender was
 * farther than `BACK.far` at any time in the `RETURN` s after the fire, how many were within it
 * again in that time, and the median of how long from the fire; and the share of the trial the
 * defender stood within `BACK`. `--trials` prints each trial.
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

/** A landed blow takes at least this much life, HP (`strike-bouts.mjs`). */
const LANDED = .5;
/** From a punch's fire to its blow, where it lands, s: the median of the Warrior mirror's landed punches (0.20 to 0.24). */
const REACH = .225;
/** How far a walk away has gone is read this long after its order, s. */
const STEP = [.25, .5, .75, 1, 1.5];
/** The range a defender is ordered back to, m centre to centre: where the Warrior mirror's punches fire (0.79 to 0.97). */
const BACK = { near: .8, far: .95 };
/** How long a defender that stepped is ordered back before it may step again, and how long after a fire it is read for being back, s. */
const RETURN = 1.5;
/** A back step's order is held until the defender goes slower than this, m/s, on both feet. */
const STILL = .15;
/** A defender ordered `set` is let go back to its square walk once the attacker is this much beyond the set range, m. */
const SET_OFF = .5;
/** The feet are set once the lead sole stands this share of the carriage's stagger ahead of the other. */
const SET_SHARE = .8;
/** How long a sway takes to bring the body back in, s (`back-step`'s `back`). */
const SWAY_BACK = .5;
/** How long a sway's `closing` is read over, s: the attacker's seen approach, from its distance this long before. */
const CLOSING = .1;
/** A drilled trial runs this long past the punch's fire, s, and no longer than this in all. */
const AFTER = 3, CAP = 12;

/** A policy from its text (the file's comment). */
function policyOf(text) {
  const [kind, ...rest] = text.split(":"), n = rest.map(Number);
  if (rest.some((one, i) => one !== "" && !Number.isFinite(n[i]))) throw new Error(`--policy ${text}: not numbers`);
  switch (kind) {
    case "stand": return { text, kind };
    case "away": if (!(n[0] > 0)) throw new Error(`--policy ${text}: away:<range>`); return { text, kind, range: n[0], seconds: n[1] || 1.5, pace: n[2] || null };
    case "seen": return { text, kind, seconds: n[0] || 1.5, pace: n[1] || null };
    case "step": if (!(n[0] > 0)) throw new Error(`--policy ${text}: step:<range>`); return { text, kind, range: n[0], seconds: n[1] || .6 };
    case "sway": { if (!(n[0] > 0)) throw new Error(`--policy ${text}: sway:<range>`); const out = n[2] || .4; return { text, kind, range: n[0], closing: n[1] || 0, out, seconds: out + SWAY_BACK + .05, rest: n[3] || .3, beyond: rest[4] === undefined || rest[4] === "" ? null : n[4] }; }
    case "keep": if (!(n[0] > 0)) throw new Error(`--policy ${text}: keep:<range>`); return { text, kind, range: n[0] };
    case "shove": if (!(n[0] > 0 && n[1] > 0)) throw new Error(`--policy ${text}: shove:<range>:<speed>`); return { text, kind, range: n[0], speed: n[1], every: n[2] || .75 };
    default: throw new Error(`--policy ${text}: stand, away, seen, step, sway, keep or shove`);
  }
}

if (isMainThread) {
  const { values } = parseArgs({ options: {
    policy: { type: "string", multiple: true, default: ["stand"] }, gaps: { type: "string", default: "2:3:0.05" }, pace: { type: "string", default: "1" },
    attacker: { type: "string", default: "drill" }, seconds: { type: "string", default: "20" },
    model: { type: "string", default: "man" }, carriage: { type: "string" }, set: { type: "string" }, workers: { type: "string" }, save: { type: "string" }, trials: { type: "boolean", default: false },
  } });
  const [from, to, by] = values.gaps.split(":").map(Number), gaps = [];
  for (let i = 0; from + i * by <= to + 1e-9; i++) gaps.push(+(from + i * by).toFixed(4));
  const policies = values.policy.map(policyOf), pace = Number(values.pace), seconds = Number(values.seconds), attacker = values.attacker;
  if (!gaps.length || !(pace > 0) || !(seconds > 0) || !["drill", "mind"].includes(attacker)) throw new Error("--gaps <from>:<to>:<by>, --pace and --seconds over nothing, --attacker drill or mind");
  const jobs = policies.flatMap((policy) => gaps.map((gap) => ({ policy, gap, pace, seconds, attacker, model: values.model, carriage: values.carriage ? { lead: "left", lower: .03, ...JSON.parse(values.carriage) } : null, set: values.set ? Number(values.set) : null })));
  const lanes = Math.min(jobs.length, Number(values.workers ?? Math.max(1, availableParallelism() >> 1)));
  let next = 0;
  await Promise.all(Array.from({ length: lanes }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url));
    worker.once("error", reject);
    const feed = () => {
      if (next >= jobs.length) { worker.terminate(); resolve(); return; }
      const job = jobs[next++];
      worker.once("message", ({ result, error }) => {
        if (error) { worker.terminate(); reject(new Error(error)); return; }
        job.result = result; feed();
      });
      const { result: _, ...settings } = job; worker.postMessage(settings);
    };
    feed();
  })));
  if (values.save) await writeFile(values.save, JSON.stringify(jobs));
  const median = (xs) => { const s = xs.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null; };
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const f = (x, digits = 2) => x === null || x === undefined ? "-" : x.toFixed(digits);
  console.log(`The back step's drill: ${values.model} on ${values.model}, the attacker ${attacker === "drill" ? `drilled, walking in at ${pace} m/s` : `its own mind, ${seconds} s a trial`}, `
    + `${gaps.length} start gaps ${from} to ${to} m; Node core world, Rapier, 120 Hz, the arena's rulebook`);
  console.log(`taken: punches that took at least ${LANDED} hp; gone: how far the defender went away from a fire to ${REACH} s after it, m; back: of the punches it left ${BACK.far} m after, those within it again in ${RETURN} s, and the median s`);
  console.log("policy".padEnd(18), "trials  thrown  taken  share  median hp  lost/trial  down  attacker down  apart at fire  away m/s   gone  " + STEP.map((s) => `step ${s}`).join("  ") + "  in range  back");
  for (const policy of policies) {
    const rows = jobs.filter((job) => job.policy === policy).map((job) => job.result), punches = rows.flatMap((r) => r.punches), taken = punches.filter((p) => p.damage >= LANDED);
    const left = punches.filter((p) => p.left);
    console.log(policy.text.padEnd(18), String(rows.length).padStart(6), String(punches.length).padStart(7), String(taken.length).padStart(6), (punches.length ? `${(100 * taken.length / punches.length).toFixed(0)}%` : "-").padStart(6),
      f(median(punches.map((p) => p.damage))).padStart(10), f(sum(rows.map((r) => r.lost)) / rows.length).padStart(11), String(rows.filter((r) => r.down).length).padStart(5), String(rows.filter((r) => r.attackerDown).length).padStart(14),
      f(median(punches.map((p) => p.apart)), 3).padStart(14), f(median(punches.map((p) => p.away))).padStart(9), f(median(punches.map((p) => p.gone)), 3).padStart(7),
      " " + STEP.map((s, i) => f(median(rows.map((r) => r.steps?.[i] ?? null)), 3).padStart(`step ${s}`.length)).join("  "),
      `${(100 * sum(rows.map((r) => r.inRange)) / sum(rows.map((r) => r.seconds))).toFixed(0)}%`.padStart(9),
      left.length ? ` ${left.filter((p) => p.back !== null).length} of ${left.length}, ${f(median(left.map((p) => p.back)))} s` : " -");
    if (values.set) {
      const setting = punches.filter((p) => p.setting), ordered = rows.filter((r) => r.setOrdered !== null);
      console.log(`${"".padEnd(18)} set: ordered in ${ordered.length} trials, set in ${ordered.filter((r) => r.setDone !== null).length}, a median ${f(median(ordered.map((r) => r.setDone === null ? null : r.setDone - r.setOrdered)))} s after; `
        + `thrown while not set ${setting.length}, taken ${setting.filter((p) => p.damage >= LANDED).length}`);
    }
  }
  if (values.trials) for (const job of jobs) {
    const r = job.result;
    console.log(`${job.policy.text.padEnd(18)} gap ${job.gap.toFixed(2)}: ${f(r.seconds, 1)} s${r.ending ? ` ${r.ending}` : ""}, lost ${f(r.lost)} hp${r.ordered.length ? `, stepped at ${r.ordered.map((t) => f(t)).join(" ")} s` : ""}${r.down ? `, defender down at ${f(r.downAt)} s` : ""}${r.attackerDown ? ", attacker down" : ""}`);
    for (const p of r.punches) console.log(`    ${p.effector} fired ${f(p.fired)} s at ${f(p.apart, 3)} m, away ${f(p.away)} m/s, gone ${f(p.gone, 3)} m, took ${f(p.damage)} hp (${p.parts.join(" ") || "nothing"})${p.left ? `, back ${f(p.back)} s` : ""}`);
  }
} else {
  const [{ buildBout }, { BOUT_ENGINE }] = await Promise.all([import("../../../src/app/node/evaluation.ts"), import("../../bout.mjs")]);
  const { CONTEXT } = await import("../../../src/app/node/context.ts");
  const { createDrillOpponents } = await import("../../../src/evaluation/drill-opponents.ts");
  const { rulebook } = await import("../../../src/combat/rulebook.ts");
  const { Vector3 } = await import("../../../src/core/math/vector.ts");
  const { centreOfToRef } = await import("../../../src/core/bodies/read-motion.ts");
  const guards = createDrillOpponents(CONTEXT).opponentOf("drill-guard").mind;
  /** The defender's mind: the guard drill's without its cover, so it goes where it is ordered, its hands at guard. */
  const DEFENDER = { ...guards, options: guards.options.filter((option) => option.kind !== "covers") };
  const REACTION = rulebook("arena").reaction.value;
  const { withLegs } = await import("../../../src/minds/option/config.ts");
  const { GOING } = await import("../../../src/skills/locomotion/move/index.ts");
  const { STOCK_GAITS } = await import("../../../src/skills/locomotion/move/gaits.ts");
  /** The defender's mind in `carriage` (its own where null), with the back step among its gaits, its sway held out `out` s where given. */
  const stepper = (carriage, out, beyond, set) => withLegs(DEFENDER, { ...GOING, gaits: [...STOCK_GAITS.map((gait) => carriage && !set && gait.legs.kind === "stance-walk" ? { ...gait, legs: { ...gait.legs, carriage } } : gait),
    ...(set ? [{ name: "set", label: "Set", legs: { kind: "stance-walk", variation: "stance-walk", carriage } }] : []),
    { name: "back-step", label: "Back step", legs: { kind: "back-step", ...(carriage ? { carriage } : {}), ...(out ? { out, back: SWAY_BACK } : {}), ...(beyond === null || beyond === undefined ? {} : { beyond }) } }] });
  parentPort.on("message", async ({ policy, gap, pace, seconds, attacker: attacking, model, carriage, set }) => {
    let dispose;
    try {
      const empty = { left: "empty", right: "empty" }, drilled = attacking === "drill", cap = drilled ? CAP : seconds, defending = policy.kind === "step" || policy.kind === "sway" || carriage ? stepper(carriage, policy.out, policy.beyond, set) : DEFENDER;
      if (set && !carriage) throw new Error("--set needs --carriage");
      const bout = await buildBout({ left: model, right: model, gap, capSeconds: cap, loadouts: { left: empty, right: empty },
        start: { left: { at: [-gap / 2, 0], heading: Math.PI / 2 }, right: { at: [gap / 2, 0], heading: -Math.PI / 2 } },
        ...(drilled ? { recoverySeconds: null, entry: [], ends: [], minds: { left: CONTEXT.catalog.minds["option-drill"].config, right: defending },
          commanders: { left: { kind: "drill", skill: "straight-punch", region: { kind: "mark", mark: "middle" }, after: .5, pace, walking: true } } }
          : { minds: { left: CONTEXT.defaultMind(model), right: defending } }) }, { engine: BOUT_ENGINE });
      dispose = bout.dispose;
      const { world, duel } = bout, attacker = duel.duelists.left, defender = duel.duelists.right;
      const centre = (one) => one.body.view.stance.centre;
      const apartNow = () => Math.hypot(centre(attacker).x - centre(defender).x, centre(attacker).z - centre(defender).z);
      /** The way from the attacker to the defender, on the ground, a unit. */
      const wayOut = () => { const a = centre(attacker), d = centre(defender), l = Math.hypot(d.x - a.x, d.z - a.z) || 1; return { x: (d.x - a.x) / l, z: (d.z - a.z) / l }; };
      const facing = () => { const w = wayOut(); return { x: -w.x, z: -w.z }; };
      // Whether the defender is ordered into its carriage (`--set`), and whether its feet are set there.
      let setOn = false, setNow = false;
      const stand = () => ({ move: null, face: facing(), ...(setOn ? { gait: "set" } : {}) });
      /** Whether the defender stands with its lead sole `SET_SHARE` of the stagger ahead of the other, toward the attacker. */
      const isSet = () => { const s = defender.body.view.stance, w = wayOut(), along = Object.fromEntries(Object.entries(s.ends).map(([k, e]) => [k.split(".")[1], -(e.middle.x * w.x + e.middle.z * w.z)]));
        return s.phase === "stand" && !s.own && (along[carriage.lead] - along[carriage.lead === "left" ? "right" : "left"]) >= SET_SHARE * carriage.stagger; };
      const away = () => ({ move: { kind: "direct", direction: wayOut() }, ...(policy.pace ? { pace: policy.pace } : {}), face: facing() });
      const step = () => ({ move: null, face: facing(), gait: "back-step" });
      /** Whether the defender's stance stands on both feet, taking no step of its own, slower than `STILL`. */
      const still = () => { const s = defender.body.view.stance; return s.phase === "stand" && !s.own && Math.hypot(s.velocity.x, s.velocity.z) < STILL; };
      const back = () => ({ move: { kind: "range", focus: attacker.id, near: BACK.near, far: BACK.far }, face: null });
      /** How far the attacker's centre, as the defender sees it, is from the defender's own. */
      const seenApart = () => {
        const seen = defender.senses().others.find((other) => other.id === attacker.id), d = centre(defender);
        return seen ? Math.hypot(seen.centre.x - d.x, seen.centre.z - d.z) : Infinity;
      };
      /** Every segment of the defender given `speed` m/s along `way` more than it has. */
      const shove = (way, speed) => {
        const at = new Vector3();
        for (const segment of defender.built.segments.values()) segment.body.applyImpulse(new Vector3(segment.rigid.mass * speed * way.x, 0, segment.rigid.mass * speed * way.z), centreOfToRef(segment, at));
      };
      const result = { punches: [], lost: 0, down: false, attackerDown: false, ordered: [], steps: null, inRange: 0, seconds: 0, ending: null, setOrdered: null, setDone: null };
      const byId = new Map(), full = defender.pool.bar();
      // Its step: waiting to begin, going, back; since when; the attacker's punches that have begun a step.
      let phase = "waiting", since = 0, first = null, heard = 0, answered = 0;
      const began = [], seen = [];
      duel.order("right", policy.kind === "keep" ? { move: { kind: "range", focus: attacker.id, near: policy.range, far: policy.range + .2 }, face: null } : stand());
      while (!duel.verdict && duel.clock < cap && (!drilled || !result.punches.length || duel.clock < result.punches[0].fired + AFTER)) {
        // Into the carriage and out, where it is ordered so; then the defender's orders, from what it sees and its policy, before the step.
        if (set) {
          const far = seenApart();
          if (!setOn && far <= set) { setOn = true; result.setOrdered ??= duel.clock; }
          else if (setOn && far > set + SET_OFF) setOn = false;
          setNow = setOn && isSet();
          if (setNow && result.setDone === null) result.setDone = duel.clock;
        }
        if (policy.kind === "away" || policy.kind === "seen" || policy.kind === "step" || policy.kind === "sway" || policy.kind === "shove") {
          const apartSeen = seenApart();
          seen.push(apartSeen); if (seen.length > Math.round(CLOSING / world.dt) + 1) seen.shift();
          const closing = (seen[0] - apartSeen) / ((seen.length - 1) * world.dt || 1);
          const due = policy.kind === "seen" ? began.length > answered && duel.clock >= began[answered] + REACTION
            : apartSeen <= policy.range && (policy.kind !== "sway" || closing >= policy.closing);
          if (phase === "waiting" && due) {
            phase = "going"; since = duel.clock; result.ordered.push(duel.clock); answered = began.length;
            if (!first) { first = { x: centre(defender).x, z: centre(defender).z, way: wayOut(), at: duel.clock }; result.steps = []; }
            if (policy.kind === "shove") shove(wayOut(), policy.speed);
          }
          if (policy.kind === "shove") { if (phase === "going" && duel.clock >= since + policy.every) phase = "waiting"; }
          else if (phase === "going" && duel.clock >= since + policy.seconds && (policy.kind !== "step" || still())) { phase = "back"; since = duel.clock; }
          // A punch begun while it stepped begins no step of its own.
          else if (phase === "back" && duel.clock >= since + (policy.kind === "sway" ? policy.rest : RETURN)) { phase = "waiting"; answered = began.length; }
          duel.order("right", policy.kind === "shove" ? stand() : phase === "going" ? (policy.kind === "step" || policy.kind === "sway" ? step() : away()) : phase === "back" && policy.kind !== "sway" ? back() : stand());
        } else if (policy.kind === "stand") duel.order("right", stand());
        world.step();
        const d = centre(defender), now = apartNow();
        if (now >= BACK.near && now <= BACK.far) result.inRange += world.dt;
        if (first && result.steps.length < STEP.length && duel.clock >= first.at + STEP[result.steps.length] - 1e-9)
          result.steps.push((d.x - first.x) * first.way.x + (d.z - first.z) * first.way.z);
        for (const action of attacker.minded.skills.report.actions) {
          if (action.action !== "straight-punch") continue;
          let punch = byId.get(action.id);
          if (!punch) { byId.set(action.id, punch = { effector: action.effector, fired: null, apart: null, away: null, gone: null, damage: 0, parts: [], left: false, back: null }); began.push(duel.clock); }
          if (action.phase === "commit" && punch.fired === null) {
            const way = wayOut(), v = defender.body.view.stance.velocity;
            punch.fired = duel.clock; punch.apart = now; punch.phase = phase; punch.setting = !!set && !setNow; punch.since = duel.clock - since; punch.away = v.x * way.x + v.z * way.z; punch.from = { x: d.x, z: d.z, way };
            result.punches.push(punch);
          }
        }
        for (const punch of result.punches) {
          if (punch.gone === null && duel.clock >= punch.fired + REACH - 1e-9) punch.gone = (d.x - punch.from.x) * punch.from.way.x + (d.z - punch.from.z) * punch.from.way.z;
          if (duel.clock > punch.fired + RETURN) continue;
          if (now > BACK.far) punch.left = true;
          else if (punch.left && punch.back === null) punch.back = duel.clock - punch.fired;
        }
        // What the attacker's hands took of the defender: each blow is the last punch's that fired with that hand.
        for (; heard < duel.blows.length; heard++) {
          const blow = duel.blows[heard], mine = blow.sides.find((part) => part.fighter === attacker.id), theirs = blow.sides.find((part) => part.fighter === defender.id);
          if (!mine || !theirs || !(theirs.damage > 0)) continue;
          const punch = result.punches.findLast((one) => one.effector === mine.segment);
          if (!punch) continue;
          punch.damage += theirs.damage; punch.parts.push(`${theirs.segment} ${theirs.damage.toFixed(2)}`);
        }
        if (defender.body.view.down && !result.down) { result.down = true; result.downAt = duel.clock; }
        if (attacker.body.view.down) result.attackerDown = true;
      }
      for (const punch of result.punches) delete punch.from;
      result.seconds = duel.clock; result.ending = duel.verdict?.ending ?? null;
      result.lost = (full - defender.pool.bar()) * defender.body.built.spec.wounds.hp.value;
      parentPort.postMessage({ result });
    } catch (error) { parentPort.postMessage({ error: String(error?.stack ?? error) }); }
    finally { dispose?.(); }
  });
}
