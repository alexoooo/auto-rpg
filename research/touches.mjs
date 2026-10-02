/**
 * **The touches a body makes** (`watchTouches`, `src/core/touches.ts`): every segment of each core
 * body read, a touch lasting as long as the two are in contact (`lasts: "contact"`), on the ground
 * or on another body, each priced (`TouchWatch.priced`). The Lab's modes on the Node stand as the
 * page runs them (`labActor`, the loadout the address gives by default, the balance the
 * character's own unless `--balance` gives another), each case in a stand of its own, and three
 * arena bouts to their verdicts (`buildBout`, `bout.mjs`).
 *
 *   node research/touches.mjs [--case stand,walk,run,shove,fall,routine,blow,bouts] [--model <id>]
 *     [--balance <per cent>] [--floor <J>] [--air <m/s>] [--list]
 *
 * The cases, for each model:
 * - `stand`: standing 10 s (`startStance`, no orders).
 * - `walk`: standing 3 s, then 10 s walking forward at 0.2 and at 0.5 m/s.
 * - `run`: the Run on each of its tracks, 30 s (`startRun`).
 * - `shove`: standing 2 s, then a shove of 20 to 60 N s from behind, and 4 s.
 * - `fall`: standing 2 s, then a shove of 80 N s from the front, and 6 s.
 * - `routine`: the Routine to the end of its first loop, or 150 s (`startRoutine`), with the
 *   touches of each target it hangs on the body, which are not the ground's and are no row.
 * - `blow`: each of the Blow's stored blows that is the model's, with what it was found with in
 *   its hand, at its target body (`throwBlow`, `watchBlow`, `LAB_BLOWS`), to 1.5 s after its
 *   pushes begin, where the page pauses it; with the target's touches on the body, as the Routine's.
 * - `bouts`: three arena bouts, a pair of bodies heard once, from its earlier body.
 *
 * It prints the harness and each side's balance, then a markdown table for each case. A row is the
 * groups of segments that touched the ground, and in the fall each group (left and right together;
 * a hand that holds, as the hand or as what it holds, whichever shape the touch's point is
 * nearest): its touches, touches a
 * second, their energies' least, median and most, J, their closing speeds' median, m/s, the mass
 * the part met them with (`ofKg`), kg, and how many are under `--floor` (0.0094 J unless given).
 * - A run's reading ends with its air (`airOf`, `src/audio/body-sounds.ts`): its fastest point's
 *   greatest speed, m/s, the part that point was of, and for how long it was over `--air` (5 m/s
 *   unless given), while the body was up and while it was down. The first second of a run's world
 *   is left out: a body built in its reference pose takes its guard in it.
 * - A body that went down has its touches while up and while down in rows of their own
 *   (`BodyView.down`), each a second of the time it was so.
 * - A body's touches on itself, which `watchTouches` reads as it reads another body's unless
 *   `counts` refuses them, are a row of their own outside the row of all, a pair counted once.
 * - A touch before a case's clock starts (the standing before a walk or a shove) is counted in
 *   the row's reading and nowhere else.
 * - A bout's row has its steps, how it ended and its trace's digest, to set beside
 *   `node research/bout-trace.mjs <left> <right> Infinity`: listening changes no bout.
 *
 * `--list` prints every touch under its table: where its point is over the ground and from its
 * part's centre of mass, which is what the mass it meets turns on.
 */
import { parseArgs } from "node:util";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { SIDES } from "../src/arena/duel.ts";
import { airOf } from "../src/audio/body-sounds.ts";
import { balanceCeiling, balancePercent, isBalance, rulebook } from "../src/core/rules/rulebook.ts";
import { FIST } from "../src/core/skills/strikes.ts";
import { watchTouches } from "../src/core/touches.ts";
import { PHYSICS_HZ } from "../src/core/world.ts";
import { labActor } from "../src/lab/actor.ts";
import { inFrameOf, throwBlow, watchBlow } from "../src/lab/blow.ts";
import { LAB_BLOWS } from "../src/lab/blows.ts";
import { loadoutBalance, loadoutSpec } from "../src/lab/loadout.ts";
import { startRoutine } from "../src/lab/routine.ts";
import { startRun } from "../src/lab/run-mode.ts";
import { labAddress, MODELS } from "../src/lab/scenarios.ts";
import { startStance } from "../src/lab/stance-mode.ts";
import { hardestOn } from "../src/lab/targets.ts";
import { TRACK_IDS, TRACKS, trackOf } from "../src/lab/track.ts";
import { CORE_ENGINE, coreStand } from "../tests/harness/core-stand.mjs";
import { traceOf } from "../tests/harness/trace.mjs";
import { BOUT_HARNESS, buildBout } from "./bout.mjs";

// Each stand's engine prints its banner otherwise, into the table.
Logger.LogLevels = Logger.ErrorLogLevel;

const KINDS = ["stand", "walk", "run", "shove", "fall", "routine", "blow", "bouts"];
const BOUTS = [["workshop-fighter", "workshop-rogue"], ["crypt-skeleton", "workshop-fighter"], ["workshop-rogue", "crypt-skeleton"]];
const WALKS = [0.2, 0.5], SHOVES = [20, 30, 40, 50, 60], FALL_SHOVE = 80;
/** Seconds after the Blow's pushes begin at which the page pauses its world (`HOLD`, `src/lab/blow-scenario.ts`). */
const BLOW_HOLD = 1.5;
/** What a per cent of balance is: the arena's, as the Lab's page has it. */
const RULES = rulebook("arena"), PERCENT = balancePercent(RULES);
/** The ground's side on the stand, m: the stand's own. */
const GROUND = 20;

const { values } = parseArgs({ options: {
  case: { type: "string" }, model: { type: "string" }, balance: { type: "string" },
  floor: { type: "string", default: "0.0094" }, air: { type: "string", default: "5" }, list: { type: "boolean", default: false },
} });
const kinds = values.case ? values.case.split(",") : KINDS;
for (const kind of kinds) if (!KINDS.includes(kind)) throw new Error(`no case ${kind}: one of ${KINDS.join(", ")}`);
const models = MODELS.map((m) => m.id).filter((id) => !values.model || id === values.model);
if (models.length === 0) throw new Error(`no model ${values.model}: one of ${MODELS.map((m) => m.id).join(", ")}`);
/** The balance asked, per cent of each body's weight; null is each character's own. */
const balance = values.balance === undefined ? null : Number(values.balance);
if (balance !== null && !isBalance(balance)) throw new Error(`a balance is a per cent, none or more, not ${values.balance}`);
/** The energy a touch is counted quiet under, J: a cue of strength 0.0125 of 60 J unless given. */
const FLOOR = Number(values.floor);
/** The speed a body's air is counted sounding over, m/s. */
const AIR = Number(values.air);
/** Seconds of a world's start whose air is left out: the body takes its guard from its reference pose. */
const AIR_LEAD = 1;

/** A segment's name without its side: the two feet are `foot`. */
const groupOf = (name) => name.replace(/\.(left|right)$/, "");

/** The capsules of each segment's rigid body in the segment's own frame: its own shape first, then what it holds; null for another shape. */
const capsules = new WeakMap();
function capsulesOf(segment) {
  let found = capsules.get(segment);
  if (!found) {
    found = segment.rigid.shapes.map((shape) => shape.kind === "capsule"
      ? { from: inFrameOf(segment, shape.from.value), to: inFrameOf(segment, shape.to.value), radius: shape.radius.value } : null);
    capsules.set(segment, found);
  }
  return found;
}

/**
 * What of `part` a touch at `point` (world) is: its segment's group, or the item it holds when the
 * point is nearer one of the item's capsules than the hand's own. The two are one rigid body, and
 * a contact's point is the mean of what met, so a hand and its club both down read as one of them.
 */
function partOf(part, point) {
  const { segment, body } = part, group = groupOf(segment.spec.name);
  const held = body.built.spec.held?.find((h) => h.segment === segment.spec.name);
  if (!held) return group;
  const local = new Vector3(...point).subtractInPlace(segment.node.position).applyRotationQuaternion(Quaternion.Inverse(segment.node.rotationQuaternion));
  const gaps = capsulesOf(segment).map((capsule) => {
    if (!capsule) return Infinity;
    const along = capsule.to.subtract(capsule.from), t = Math.max(0, Math.min(1, Vector3.Dot(local.subtract(capsule.from), along) / along.lengthSquared()));
    return Vector3.Distance(local, capsule.from.add(along.scale(t))) - capsule.radius;
  });
  return gaps.indexOf(Math.min(...gaps)) > 0 ? held.item.name.split(" ").at(-1) : group;
}

/** How far `point` (world) is from the centre of mass of `segment`'s rigid body, m. */
function leverOf(segment, point) {
  const centre = inFrameOf(segment, segment.rigid.centre).applyRotationQuaternion(segment.node.rotationQuaternion).addInPlace(segment.node.position);
  return Vector3.Distance(centre, new Vector3(...point));
}

/** What something fixed is, by the touch's normal into it: the ground under a normal that points down, else a wall or a post. */
const fixedOf = (normal) => normal[1] < -0.7 ? "ground" : "wall";

/**
 * Hear `bodies` (each `{ name, built, body }`) in `world`: every touch that `counts`, priced as it
 * lands. A touch is its body's, the part that met and what it met, its time, closing speed, masses
 * and energy, and whether its body was down. Every touch is priced before any is left out, and one
 * that was not closing, or has no energy, stops the run.
 */
function listen(world, bodies, counts = () => true, touches = []) {
  const places = new Map(bodies.flatMap((body) => [...body.built.segments.values()].map((segment, k) => [segment, k])));
  const watch = watchTouches(world, bodies, { lasts: "contact", counts }, (touch) => {
    const { ofKg, onKg, energy } = watch.priced(touch), of = touch.of.segment.spec.name;
    if (!(touch.closing > 0) || !(energy >= 0) || !Number.isFinite(energy) || !(ofKg > 0)) {
      throw new Error(`${touch.of.body.name}'s ${of} at ${touch.time} s: closing ${touch.closing} m/s, ${ofKg} kg on ${onKg} kg, ${energy} J`);
    }
    // Two segments of one body are each read, and each hears the other: the touch is the earlier segment's.
    if (touch.on?.body === touch.of.body && places.get(touch.on.segment) < places.get(touch.of.segment)) return;
    touches.push({
      time: touch.time, by: touch.of.body.name, segment: of, part: partOf(touch.of, touch.point),
      on: touch.on ? { by: touch.on.body.name, segment: touch.on.segment.spec.name, part: partOf(touch.on, touch.point) } : null,
      fixed: touch.on ? null : fixedOf(touch.normal), height: touch.point[1], lever: leverOf(touch.of.segment, touch.point),
      closing: touch.closing, energy, ofKg, onKg, down: touch.of.body.body.view.down,
    });
  });
  return { touches, dispose: () => watch.dispose() };
}

/**
 * Read the air of `body` (`{ built, body }`) after every step of `world` past its first second:
 * while it is up and while it is down, its fastest point's greatest speed, the part that point was
 * of, and the steps it was over `AIR`.
 */
function breathe(world, body) {
  const air = airOf(body.built), at = new Vector3();
  const parents = new Set([...body.built.joints.values()].map((joint) => joint.parent));
  const leaves = [...body.built.segments.values()].filter((segment) => !parents.has(segment));
  const read = { up: { speed: 0, part: "", steps: 0 }, down: { speed: 0, part: "", steps: 0 } };
  const hook = world.afterStep(() => {
    if (world.time <= AIR_LEAD) return;
    const speed = air(at), state = read[body.body.view.down ? "down" : "up"];
    if (speed > AIR) state.steps += 1;
    if (speed <= state.speed) return;
    // The leaf the point is of: the one whose rigid body's centre it is nearest.
    const point = [at.x, at.y, at.z];
    const leaf = leaves.reduce((a, b) => leverOf(a, point) <= leverOf(b, point) ? a : b);
    state.speed = speed;
    state.part = partOf({ segment: leaf, body }, point);
  });
  const words = (state) => `${sig(state.speed)} m/s (${state.part}), over ${AIR} m/s for ${(state.steps * world.dt).toFixed(2)} s`;
  return {
    read,
    words: () => `air ${words(read.up)}${read.down.speed > 0 ? `, and down ${words(read.down)}` : ""}`,
    dispose: () => hook.dispose(),
  };
}

/** The balance of the body of `spec`, per cent of its weight: the one asked, or its character's own. */
const balanceOf = (spec) => loadoutBalance(balance, spec);

/**
 * One of the Lab's modes on a stand of its own: `model` with `held` in its hands, its mode begun by
 * `start(actor, stand)`, stood `lead` seconds, then `begin(session)` and `seconds` more or until
 * `until(session)`, a step at a time. Its row: the touches from `begin` on, the seconds its body
 * was up and was down, when it first went down, the strides and recoveries it took and how far its
 * centre went, and `read`'s words about it.
 */
async function labRun(kind, model, variant, { held = {}, start, lead = 0, begin = () => {}, seconds, until = () => false, read }) {
  const spec = loadoutSpec({ ...labAddress(`?model=${model}`), ...held }), stand = await coreStand(spec, { groundSize: GROUND });
  const actor = labActor(stand.built, stand.world, { assist: balanceCeiling(balanceOf(spec), PERCENT) });
  const { body } = actor, { world } = stand, own = { name: model, built: stand.built, body };
  // A body the mode hangs beside its own: its touches on the body, read from it. Whether its body was down is the body's own.
  const struck = [];
  const hung = (built) => listen(world, [{ name: "target", built, body }, own], (of, on) => of.body !== own && on?.body === own, struck);
  const session = start(actor, stand, hung);
  const heard = listen(world, [own]), breath = breathe(world, { built: stand.built, body });
  const counts = () => ({ strides: body.view.stance.strides, recoveries: body.view.stance.recoveries, x: body.view.stance.centre.x, z: body.view.stance.centre.z });
  try {
    stand.step(stand.seconds(lead));
    const from = world.time, early = heard.touches.length, first = counts();
    begin(session);
    const steps = { up: 0, down: 0 };
    let fell = null;
    for (let i = 0; i < stand.seconds(seconds(session)) && !until(session); i++) {
      stand.step(1);
      steps[body.view.down ? "down" : "up"] += 1;
      if (!fell && body.view.down) fell = { at: world.time - from, ...counts() };
    }
    const last = counts();
    const took = (to) => ({ strides: to.strides - first.strides, recoveries: to.recoveries - first.recoveries, metres: Math.hypot(to.x - first.x, to.z - first.z) });
    const touches = heard.touches.slice(early).map((touch) => ({ ...touch, at: touch.time - from }));
    const run = {
      kind, model, variant, touches, struck, seconds: { up: steps.up * world.dt, down: steps.down * world.dt },
      fell: fell && { at: fell.at, ...took(fell) }, took: took(last),
    };
    const before = early > 0 ? `; in the ${lead} s before, ${tally(heard.touches.slice(0, early), (touch) => touch.on ? "on itself" : "on the ground")}` : "";
    return { ...run, read: `${read(session, run)}${before}; ${breath.words()}` };
  } finally { session.dispose(); breath.dispose(); heard.dispose(); stand.dispose(); }
}

/** `n` of them: `1 stride`, `2 strides`. */
const some = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** How a run ended on its feet or off them, in words. */
const fellWords = (run) => run.fell ? `down at ${run.fell.at.toFixed(2)} s after ${some(run.fell.strides, "stride")}` : "on its feet";
const whole = (run) => (run.seconds.up + run.seconds.down).toFixed(run.kind === "routine" || run.kind === "blow" ? 1 : 0);

const stance = (actor) => startStance(actor);
const LAB = {
  stand: (model) => [labRun("stand", model, "", { start: stance, seconds: () => 10, read: (_, run) => `${whole(run)} s, ${fellWords(run)}` })],
  walk: (model) => WALKS.map((pace) => labRun("walk", model, `${pace} m/s`, {
    start: stance, lead: 3, begin: (session) => { session.orders.forward = pace; }, seconds: () => 10,
    read: (_, run) => `${whole(run)} s, ${some(run.took.strides, "stride")}, ${run.took.metres.toFixed(2)} m from where it set off, ${fellWords(run)}`,
  })),
  run: (model) => TRACK_IDS.map((id) => labRun("run", model, id, {
    start: (actor) => startRun(actor, trackOf(TRACKS[id].pieces)), seconds: () => 30,
    read: (session, run) => {
      const frame = session.frame();
      return `${whole(run)} s, ${some(run.took.strides, "stride")}, ${frame.travelled.toFixed(1)} m round at ${frame.mean.toFixed(2)} m/s, ${fellWords(run)}`;
    },
  })),
  shove: (model) => SHOVES.map((impulse) => labRun("shove", model, `${impulse} N s`, {
    start: stance, lead: 2, begin: (session) => session.shove(impulse, 0), seconds: () => 4,
    read: (_, run) => `${whole(run)} s, ${some(run.took.recoveries, "recovery", "recoveries")}, ${some(run.took.strides, "stride")}, ${run.fell ? `down at ${run.fell.at.toFixed(2)} s` : "caught"}`,
  })),
  fall: (model) => [labRun("fall", model, `${FALL_SHOVE} N s`, {
    start: stance, lead: 2, begin: (session) => session.shove(FALL_SHOVE, 180), seconds: () => 6,
    read: (_, run) => {
      const ground = run.touches.filter((touch) => !touch.on), last = ground.at(-1);
      return `${whole(run)} s, ${run.fell ? `down at ${run.fell.at.toFixed(2)} s` : "not down"}, ${some(ground.filter((touch) => touch.down).length, "touch", "touches")} on the ground while down`
        + (last ? `, the last at ${last.at.toFixed(2)} s` : "");
    },
  })],
  routine: (model) => [labRun("routine", model, "", {
    start: (actor, _, hung) => startRoutine(actor, { hung }), seconds: () => 150, until: (session) => session.tactics.loops >= 1,
    read: (session, run) => `${whole(run)} s, ${some(session.tactics.loops, "loop")}, ${some(session.readings.length, "target")} `
      + `(${session.readings.map((r) => `${r.target.stratum}: ${r.strike ? `${r.strike.name} ${r.strike.peak.toFixed(1)} m/s` : "no strike"}${r.blow ? `, ${sig(r.blow.energy)} J` : ""}`).join("; ") || "none"}), `
      + `${some(run.struck.length, "touch", "touches")} of a target on the body${run.struck.length ? ` (${tally(run.struck, (touch) => touch.on.part)}; ${energies(run.struck)} J)` : ""}, `
      + `${some(run.took.strides, "stride")}, ${fellWords(run)}`,
  })],
  blow: (model) => LAB_BLOWS.filter((stored) => stored.model === model).map((stored) => labRun("blow", model, stored.id, {
    held: { right: "empty", left: "empty", [stored.hand]: stored.held === FIST ? "empty" : "club" },
    start(actor, _, hung) {
      const blow = throwBlow(actor, { hand: stored.hand, strike: stored.strike, place: stored.place, band: stored.band });
      const watch = watchBlow(actor, blow, RULES, { hung });
      return { blow, watch, dispose() { watch.dispose(); blow.dispose(); } };
    },
    seconds: (session) => session.blow.pushing + BLOW_HOLD,
    read({ watch, blow }, run) {
      const { reading } = watch, landed = hardestOn(reading.blows, "dummy");
      return `${whole(run)} s, the pushes at ${blow.pushing.toFixed(2)} s, `
        + (landed ? `landed ${sig(landed.energy)} J, its hardest of ${some(reading.blows.length, "blow")}: ${sig(reading.done)} HP done, ${sig(reading.cost)} cost`
          : reading.nearest === null ? "not thrown" : `missed by ${(100 * reading.nearest).toFixed(1)} cm`)
        + `, ${some(run.struck.length, "touch", "touches")} of the target on the body${run.struck.length ? ` (${tally(run.struck, (touch) => touch.on.part)}; ${energies(run.struck)} J)` : ""}, `
        + fellWords(run);
    },
  })),
};

/**
 * One arena bout to its verdict, both bodies heard: a touch on something fixed, and a touch on the
 * other body from the earlier of the two. Its row is the bout's, as `playBout` reads it, and the touches.
 */
async function boutRun([left, right]) {
  const recipe = balance === null ? { left, right } : { left, right, balance: { left: balance, right: balance } };
  const { world, duel, dispose } = await buildBout(recipe);
  const bodies = SIDES.map((side) => ({ name: side, built: duel.duelists[side].built, body: duel.duelists[side].body }));
  const heard = listen(world, bodies, (of, on) => on === null || bodies.indexOf(on.body) > bodies.indexOf(of.body));
  const breaths = bodies.map((body) => breathe(world, body));
  try {
    const trace = traceOf(bodies.map((body) => body.built));
    while (!duel.verdict) { world.step(); trace.take(); }
    return {
      kind: "bouts", left, right, steps: world.steps, seconds: duel.clock, winner: duel.verdict.winner ?? "none", ending: duel.verdict.ending,
      digest: trace.digest(), fallen: SIDES.filter((side) => duel.duelists[side].body.view.down),
      balance: SIDES.map((side) => recipe.balance?.[side] ?? duel.duelists[side].built.spec.attributes.balance.value),
      touches: heard.touches.map((touch) => ({ ...touch, at: touch.time })), air: breaths.map((breath) => breath.words()),
    };
  } finally { for (const breath of breaths) breath.dispose(); heard.dispose(); dispose(); }
}

/** `x` to three significant figures. */
function sig(x) {
  return x === 0 ? "0" : String(Number(x.toPrecision(3)));
}
const sorted = (numbers) => [...numbers].sort((a, b) => a - b);
function median(numbers) {
  const s = sorted(numbers), half = s.length >> 1;
  return s.length % 2 ? s[half] : (s[half - 1] + s[half]) / 2;
}

/** The least, the median and the most of `touches`' energies, J. */
function energies(touches) {
  const s = sorted(touches.map((touch) => touch.energy));
  return `${sig(s[0])} / ${sig(median(s))} / ${sig(s.at(-1))}`;
}

/** A row's cells for `touches` over `seconds`: how many, how many a second, their energies, their closing speeds' median, the masses their parts met them with, and how many are quiet. */
function cells(touches, seconds) {
  if (touches.length === 0) return ["0", "0", "", "", "", ""];
  const three = (numbers) => { const s = sorted(numbers); return `${sig(s[0])} / ${sig(median(s))} / ${sig(s.at(-1))}`; };
  return [
    String(touches.length), sig(touches.length / seconds), three(touches.map((touch) => touch.energy)),
    sig(median(touches.map((touch) => touch.closing))), three(touches.map((touch) => touch.ofKg)), String(touches.filter((touch) => touch.energy < FLOOR).length),
  ];
}

const CELLS = ["Touches", "A second", "Energy, J: least / median / most", "Closing, m/s: median", "Its mass met, kg: least / median / most", `Under ${FLOOR} J`];
const line = (row) => `| ${row.join(" | ")} |`;
const head = (columns) => `${line(columns)}\n${line(columns.map(() => "---"))}`;
/** `touches` by `key`, in the order each key first came. */
function by(touches, key) {
  const groups = new Map();
  for (const touch of touches) groups.set(key(touch), [...(groups.get(key(touch)) ?? []), touch]);
  return [...groups];
}
/** How many of each `key` among `touches`, the most first: `foot 12, hand 3`; past the first `most` keys, how many the others are. */
function tally(touches, key, most = Infinity) {
  const groups = by(touches, key).sort((a, b) => b[1].length - a[1].length), named = groups.slice(0, most), rest = groups.slice(most);
  return [...named.map(([name, group]) => `${name} ${group.length}`), ...(rest.length ? [`others ${rest.reduce((sum, [, group]) => sum + group.length, 0)}`] : [])].join(", ");
}
const span = (touches) => touches.length === 0 ? "" : `${touches[0].at.toFixed(2)} to ${touches.at(-1).at.toFixed(2)}`;

function printList(touches) {
  if (!values.list || touches.length === 0) return;
  console.log(`\n${head(["At, s", "Of", "On", "Closing, m/s", "Mass met, kg", "Energy, J", "Height, m", "From its centre, m", "Its body"])}`);
  for (const touch of touches) {
    console.log(line([touch.at.toFixed(3), `${touch.by} ${touch.segment}${touch.part === groupOf(touch.segment) ? "" : ` (${touch.part})`}`,
      touch.on ? `${touch.on.by} ${touch.on.segment}${touch.on.part === groupOf(touch.on.segment) ? "" : ` (${touch.on.part})`}` : touch.fixed,
      sig(touch.closing), `${sig(touch.ofKg)}${touch.on ? ` on ${sig(touch.onKg)}` : ""}`, sig(touch.energy), touch.height.toFixed(3), touch.lever.toFixed(3), touch.down ? "down" : "up"]));
  }
}

/**
 * A Lab case's table: its runs' rows, the parts that touched the ground while its body was up, and
 * while it was down. The fall has a row for each part; another case names its parts in one row.
 */
function printLab(kind, runs) {
  const timed = kind === "fall", named = runs.some((run) => run.variant !== "");
  console.log(`\n### ${kind}\n`);
  console.log(head(["Model", ...(named ? ["Case"] : []), "Reading", "Part that met the ground", ...CELLS, ...(timed ? ["First to last, s after the shove"] : [])]));
  for (const run of runs) {
    const lead = [run.model, ...(named ? [run.variant] : []), run.read];
    const rows = [];
    for (const state of ["up", "down"]) {
      if (state === "down" && run.seconds.down === 0) continue;
      const now = run.touches.filter((touch) => touch.down === (state === "down"));
      const touches = now.filter((touch) => !touch.on), groups = by(touches, (touch) => touch.part), own = now.filter((touch) => touch.on);
      const label = (name) => run.seconds.down > 0 ? `${state}, ${run.seconds[state].toFixed(2)} s: ${name}` : name;
      const row = (name, of) => [label(name), ...cells(of, run.seconds[state]), ...(timed ? [span(of)] : [])];
      if (groups.length === 1) rows.push(row(`${groups[0][0]} (all)`, touches));
      else if (timed || groups.length === 0) rows.push(row("all", touches), ...groups.map(([name, group]) => row(name, group)));
      else rows.push(row(`all (${tally(touches, (touch) => touch.part)})`, touches));
      if (own.length > 0) rows.push(row(`on itself, not in all (${tally(own, (touch) => [touch.part, touch.on.part].sort().join(" and "), 3)})`, own));
    }
    rows.forEach((row, k) => console.log(line([...(k === 0 ? lead : lead.map(() => "")), ...row])));
    const strays = run.touches.filter((touch) => touch.fixed === "wall");
    if (strays.length > 0) throw new Error(`${run.model} ${kind} ${run.variant}: ${strays.length} touches on something other than the ground`);
  }
  if (timed) {
    const most = Math.ceil(Math.max(...runs.map((run) => run.seconds.up + run.seconds.down)));
    console.log(`\nTouches in each second after the shove, and the most energetic, J:\n`);
    console.log(head(["Model", ...Array.from({ length: most }, (_, k) => `${k} to ${k + 1} s`)]));
    for (const run of runs) {
      console.log(line([run.model, ...Array.from({ length: most }, (_, k) => {
        const within = run.touches.filter((touch) => !touch.on && Math.floor(touch.at) === k);
        return within.length === 0 ? "0" : `${within.length} (${sig(Math.max(...within.map((touch) => touch.energy)))})`;
      })]));
    }
  }
  for (const run of runs) {
    if (values.list && run.touches.length > 0) console.log(`\n${run.model} ${kind} ${run.variant}`);
    printList(run.touches);
  }
}

/** The bouts' tables: each bout's row, then each side's feet and its other parts on the ground, on a wall, and the two bodies on each other. */
function printBouts(bouts) {
  console.log(`\n### bouts\n`);
  console.log(head(["Bout", "Steps", "Seconds", "Winner", "Ending", "Down", "Digest", "Balance, %: left, right", "Left's air", "Right's air"]));
  const name = (bout) => `${bout.left} v ${bout.right}`;
  for (const bout of bouts) {
    console.log(line([name(bout), bout.steps, bout.seconds.toFixed(2), bout.winner, bout.ending, bout.fallen.join(", ") || "neither", bout.digest, bout.balance.join(", "), ...bout.air]));
  }
  console.log(`\n${head(["Bout", "Of", "On", ...CELLS, "Which"])}`);
  for (const bout of bouts) {
    const rows = [];
    SIDES.forEach((side) => {
      const mine = bout.touches.filter((touch) => touch.by === side && !touch.on), who = `${side}, ${bout[side]}`;
      const ground = mine.filter((touch) => touch.fixed === "ground"), feet = ground.filter((touch) => touch.part === "foot"), other = ground.filter((touch) => touch.part !== "foot");
      const walls = mine.filter((touch) => touch.fixed !== "ground");
      rows.push([`${who}: feet`, "ground", ...cells(feet, bout.seconds), ""]);
      rows.push([`${who}: other`, "ground", ...cells(other, bout.seconds), tally(other, (touch) => touch.part)]);
      if (walls.length > 0) rows.push([`${who}: any`, "wall or post", ...cells(walls, bout.seconds), tally(walls, (touch) => touch.part)]);
    });
    const met = bout.touches.filter((touch) => touch.on), pair = (touch) => `${touch.part} on ${touch.on.part}`;
    rows.push([`left, ${bout.left}: any`, `right, ${bout.right}`, ...cells(met, bout.seconds), tally(met, pair)]);
    rows.push(["all", "", ...cells(bout.touches, bout.seconds), `${bout.touches.filter((touch) => touch.down).length} of a body that was down`]);
    rows.forEach((row, k) => console.log(line([k === 0 ? name(bout) : "", ...row])));
  }
  for (const bout of bouts) {
    if (values.list) console.log(`\n${name(bout)}`);
    printList(bout.touches);
  }
}

const own = MODELS.map((m) => `${m.id} ${balance ?? loadoutSpec(labAddress(`?model=${m.id}`)).attributes.balance.value} %`).join(", ");
console.log(`Node core stand (tests/harness/core-stand.mjs), ${CORE_ENGINE}, ${PHYSICS_HZ.value} Hz, a ${GROUND} m ground, one body; the bouts: ${BOUT_HARNESS}. `
  + `Balance, per cent of the body's weight, on the stand and on each side of a bout: ${own} (${balance === null ? "each character's own" : "as asked"}; at 0 % the assist gives nothing). `
  + `Every segment read, a touch lasting as long as the contact; one run a row.`);

for (const kind of kinds) {
  process.stderr.write(`${kind}...\n`);
  if (kind === "bouts") {
    const bouts = [];
    for (const pair of BOUTS.filter((b) => !values.model || b.includes(values.model))) bouts.push(await boutRun(pair));
    printBouts(bouts);
    continue;
  }
  const runs = [];
  for (const model of models) for (const run of LAB[kind](model)) runs.push(await run);
  printLab(kind, runs);
}
