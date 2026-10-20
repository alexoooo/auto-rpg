import type { BuiltBody, BuiltSegment } from "../core/build/build-body.ts";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { recoveryMeasurement } from "../core/control/recovery-measurement.ts";
import { observeBody } from "../core/observation.ts";
import { clockSenses, createSenses } from "../core/mind/senses.ts";
import { standIntent } from "../core/mind/intent.ts";
import { STAND_ORDERS } from "../core/mind/orders.ts";
import type { Orders } from "../core/mind/orders.ts";
import { rulebook } from "../core/rules/rulebook.ts";
import { deepFreeze } from "../core/state.ts";
import { mulberry32 } from "../rng.ts";
import type { Actor } from "./actor.ts";
import type { LabAddress } from "./scenarios.ts";
import { groundMeter } from "./ground-meter.ts";
import { shoveBody } from "./stance-mode.ts";
import { dummySpec, hangDummy } from "./targets.ts";
import { startWind } from "./wind.ts";
import { groundEnvironment } from "./ground-environment.ts";
import { addArenaSolids } from "../arena/room.ts";
import { solidSenses } from "../core/mind/object-senses.ts";

/**
 * **How a stand is verified**: from its recovery's takeover, upright and loaded on both feet,
 * quiet for `quiet` s (`recoveryMeasurement`); then holding `standing` s and walking forward at
 * `pace` m/s for `walking` s, its host in command at the end and never down meanwhile. A recovery
 * not quiet `cap` s after its takeover has failed.
 */
export const STAND_CHECK = deepFreeze({ quiet: .5, standing: 2, walking: 1, pace: .3, cap: 30 });
/** The owner's target's shove: N s for each kg of the body, once, at the chest. */
const TARGET_SHOVE = 1.5;
/** A round's falls: sixteen ways round, 22.5 degrees apart, the target's directions. */
export const ROUND_FALLS = 16;
/**
 * When a round's first shove comes, s; how long after a verified stand, or a body back on its
 * feet, the next does; and how long after a shove a body not taken over is counted as not felled.
 */
const ROUND_FIRST = 1, ROUND_REST = 1, ROUND_UNFELLED = 3;
/** How long a round waits after a verdict for a body still down to get up, s, before it ends there. */
const ROUND_DOWN = STAND_CHECK.cap;

/** Reproducible disturbance parameters, with explicit controls taking precedence over the draw. */
export function groundShove(address: Pick<LabAddress, "seed" | "ground">) {
  const random = mulberry32(address.seed);
  const degrees = random() * 360, impulse = 40 + random() * 50;
  return { degrees: address.ground.degrees ?? degrees, impulse: address.ground.impulse ?? impulse };
}

/** The target's shove for `built`, N s: `TARGET_SHOVE` for each kg. */
export const targetImpulse = (built: BuiltBody): number => TARGET_SHOVE * [...built.segments.values()].reduce((sum, part) => sum + part.rigid.mass, 0);

/**
 * Where a stand's verification is: not taken over, rising, holding, walking, or its verdict: stood,
 * down after it was verified, up but not its host's at the end, or not quiet by the cap.
 */
type CheckStage = "standing" | "rising" | "holding" | "walking" | "stood" | "fell after verification" | "failed" | "cap";

/**
 * A stand's verification (`STAND_CHECK`), read once a step after the meter: what the Lab's
 * readout shows and the rising bed counts. `orders` are what the check asks of the host: standing,
 * then the walk.
 */
function standCheck(actor: Actor, cap: number) {
  const { body, world } = actor, built = body.built;
  const measure = recoveryMeasurement(built, observeBody(built, body.muscles, world, clockSenses(world), undefined, undefined, true));
  const fresh = () => ({ takeover: null as number | null, verifiedAt: null as number | null, verified: null as number | null, quiet: 0,
    walkFrom: null as readonly number[] | null, walked: null as number | null, stage: "standing" as CheckStage });
  const state = fresh();
  let orders: Orders = STAND_ORDERS;
  const done = () => state.stage === "stood" || state.stage === "fell after verification" || state.stage === "failed" || state.stage === "cap";
  return {
    state, done,
    orders: () => orders,
    /** Starts afresh, for the next fall. */
    reset() { Object.assign(state, fresh()); orders = STAND_ORDERS; },
    sample() {
      if (done()) return;
      if (body.has !== "command" && body.has !== "nobody" && state.takeover === null) { state.takeover = world.time; state.stage = "rising"; }
      const reading = measure();
      if (state.takeover !== null && state.verifiedAt === null) {
        state.quiet = reading.ready ? state.quiet + world.dt : 0;
        if (state.quiet + 1e-9 >= STAND_CHECK.quiet) { state.verifiedAt = world.time; state.verified = world.time - state.takeover; state.stage = "holding"; }
      } else if (state.verifiedAt !== null) {
        if (reading.observation.down) { state.stage = "fell after verification"; orders = STAND_ORDERS; return; }
        if (world.time - state.verifiedAt + 1e-9 >= STAND_CHECK.standing) {
          state.walkFrom ??= [...reading.observation.centre];
          orders = { ...STAND_ORDERS, move: { kind: "direct", direction: { x: 0, z: 1 } }, pace: STAND_CHECK.pace }; state.stage = "walking";
        }
        if (world.time - state.verifiedAt + 1e-9 >= STAND_CHECK.standing + STAND_CHECK.walking) {
          const centre = reading.observation.centre, from = state.walkFrom!;
          state.walked = Math.hypot(centre[0] - from[0], centre[2] - from[2]);
          state.stage = body.has === "command" ? "stood" : "failed"; orders = STAND_ORDERS;
          return;
        }
      }
      if (state.takeover !== null && state.verifiedAt === null && world.time - state.takeover >= cap) state.stage = "cap";
    },
  };
}

/** One fall of a round: its direction, the time from takeover to a verified stand (null where it failed), and how it ended: not felled, or the check's verdict. */
interface RoundFall { readonly degrees: number; readonly verified: number | null; readonly end: CheckStage }

/**
 * Run a placed, dropped or shoved body through its own selected mind and read its ground history.
 * Each stand is verified (`STAND_CHECK`). A round shoves the body as the owner's target does
 * (`TARGET_SHOVE`), sixteen ways round one after another (`ROUND_FALLS`), each once it stands
 * again; a body still down `ROUND_DOWN` s after a verdict ends the round. `cap` is the check's, s.
 */
export function startGround(actor: Actor, address: LabAddress, options: {
  readonly pushed?: (segment: BuiltSegment, impulse: Vector3, at: Vector3) => void;
  readonly hears?: (built: BuiltBody) => { dispose(): void };
  readonly cap?: number;
} = {}) {
  const { body, world } = actor, hub = createSenses(world);
  const environment = groundEnvironment(address.ground.level), fixed = addArenaSolids(world.physics, environment.solids);
  const senses = hub.add({ id: "ground-body", side: "ground-body", built: body.built, out: () => false, down: () => body.view.down,
    ...(environment.solids.length ? { solids: solidSenses(environment.solids) } : {}) });
  const dummy = address.ground.foe ? hangDummy(world, dummySpec(body.built.spec), [0, .5, address.ground.foe], rulebook("arena")) : null;
  const sound = dummy ? options.hears?.(dummy.fighter.built) : null;
  if (dummy) hub.add({ id: "ground-foe", side: "ground-foe", built: dummy.fighter.built, out: () => false });
  const check = standCheck(actor, options.cap ?? STAND_CHECK.cap);
  const skills = actor.drive({ name: "ground stand", decide: () => standIntent(0) }, { senses,
    orders: () => environment.approach && address.ground.start === "shoved" && world.time < ROUND_FIRST
      ? { ...STAND_ORDERS, move: environment.approach, pace: STAND_CHECK.pace } : check.orders() });
  const shoving = shoveBody(body, world, () => skills.report.heading, options.pushed), shove = groundShove(address);
  const wind = startWind(body.built, world, address.ground.gusts ? { rate: .7, strength: 45 } : { rate: 0, strength: 0 }, address.seed);
  const meter = groundMeter(body, world, address.balance ?? body.built.spec.attributes.balance.value);
  const round = address.ground.start === "round";
  const state = { status: "running" as "running" | "landed standing" | "cap" | "round done" | "round ended down", shoved: false,
    falls: [] as RoundFall[], next: round ? ROUND_FIRST : null as number | null, shovedAt: null as number | null, verdictAt: 0 };
  const roundImpulse = targetImpulse(body.built);
  const disturbance = world.afterStep(() => {
    if (address.ground.start === "shoved" && !state.shoved && world.time >= 1) {
      shoving.shove(shove.impulse, shove.degrees); state.shoved = true;
    }
  });
  const reading = world.afterStep(() => {
    meter.sample();
    if (address.ground.start === "dropped" && meter.state.from === null && world.time >= 3) state.status = "landed standing";
    if (meter.state.from !== null && meter.state.handback === null && world.time - meter.state.from >= 30 && state.status === "running" && !round) {
      state.status = "cap"; meter.cap();
    }
  });
  const checking = world.afterStep(() => {
    check.sample();
    if (!round) return;
    if (state.status !== "running") return;
    const unfelled = check.state.takeover === null && state.shovedAt !== null && world.time - state.shovedAt >= ROUND_UNFELLED;
    if ((check.state.takeover !== null && check.done() || unfelled) && state.next === null) {
      state.falls.push({ degrees: state.falls.length * 360 / ROUND_FALLS, verified: check.state.stage === "stood" ? check.state.verified : null, end: check.state.stage });
      state.shovedAt = null;
      if (state.falls.length >= ROUND_FALLS) { state.status = "round done"; return; }
      state.next = Infinity; state.verdictAt = world.time;
    }
    if (state.next === Infinity && world.time - state.verdictAt >= ROUND_DOWN && (body.has !== "command" || body.view.down)) { state.status = "round ended down"; return; }
    // The next shove comes once the body is its host's again and on its feet.
    if (state.next === Infinity && body.has === "command" && !body.view.down) state.next = world.time + ROUND_REST;
    if (state.next !== null && world.time >= state.next) {
      state.next = null; state.shovedAt = world.time; check.reset(); meter.beginFall();
      shoving.shove(roundImpulse, state.falls.length * 360 / ROUND_FALLS);
    }
  });
  const roundSummary = () => {
    const stood = state.falls.flatMap((f) => f.verified === null ? [] : [f.verified]), sorted = [...stood].sort((a, b) => a - b);
    // Failures count at the cap, as the target's median counts them.
    const all = state.falls.map((f) => f.verified ?? STAND_CHECK.cap).sort((a, b) => a - b), middle = all.length >> 1;
    return { falls: state.falls.length, of: ROUND_FALLS, stood: stood.length, within6: sorted.filter((t) => t <= 6).length,
      median: all.length ? (all.length % 2 ? all[middle]! : (all[middle - 1]! + all[middle]!) / 2) : null };
  };
  return {
    body, meter, dummy, state, check, environment,
    frame: () => ({ ...meter.frame(), level: address.ground.level, status: state.status, check: { ...check.state }, round: round ? roundSummary() : null }),
    shove() { meter.beginFall(); check.reset(); state.status = "running"; shoving.shove(shove.impulse, shove.degrees); },
    dispose() { checking.dispose(); reading.dispose(); disturbance.dispose(); wind.dispose(); shoving.dispose(); sound?.dispose(); dummy?.dispose(); hub.dispose(); actor.dispose(); for (const collider of fixed) collider.dispose(); },
  };
}
