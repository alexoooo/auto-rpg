import type { BodySpec } from "../../spec/body.ts";
import type { ActionConfig } from "../../mind/config.ts";
import { NO_COVER, type Intent } from "../../mind/intent.ts";
import type { MindWiring } from "../../mind/minds.ts";
import type { Situation, StandingOption } from "../../mind/options/option.ts";
import { strikeLow } from "../../mind/options/low.ts";
import { followOrders } from "../../mind/options/orders.ts";
import { reflexLayer, reflexOf } from "../../mind/options/reflex.ts";
import { situationReader } from "../../mind/options/situation.ts";
import { strike } from "../../mind/options/strike.ts";
import { CLINCH, record } from "../../mind/options/value.ts";
import { walker } from "../../mind/options/walk.ts";
import type { Tactics } from "../../mind/tactics.ts";
import type { TempoConfig } from "./mind.ts";

/**
 * Where it is in its rhythm: resting at the edge of its foe's reach, stepping in, throwing its
 * burst, stepping back out; or striking a foe that is low, or doing as it is told.
 */
type Phase = "wait" | "enter" | "burst" | "exit" | "low" | "orders";

/** The longest it steps back before it rests again, s, wherever it has got to. */
const EXIT_LONGEST = 1.5;

/** How many blows an action of `config` throws: a combination its drives, else one. */
const throws = (config: TempoConfig, action: ActionConfig): number => {
  const executor = config.executors.find((one) => one.name === action.executor);
  return executor?.kind === "combination" ? executor.drives : 1;
};

type Asked = Omit<Intent, "guard">;

/**
 * **Hit and run on a rhythm**, for a body of `spec` under `config`. It rests just outside its
 * focus's reach (from its outer bound to `margin` m past it, head to head; its own reach where the
 * focus has no hands to measure) for `rest` s, then steps in and throws `burst` blows, each with
 * the standing action its own record rates highest of those whose limb is ready, else of those it
 * can walk to the window of (`rate`); then steps back out, at most `EXIT_LONGEST` s. A foe's blow
 * predicted to reach its head, a clinch, or `commit` s in reach since it stepped in or last asked
 * for a blow send it out at once, but never out of a blow already committed. A
 * focus that is low it strikes from low support, where it has a low blow; orders that walk it it
 * follows (`followOrders`). Under all of it, its reflexes patch what it asks (`reflexLayer`). Down,
 * its sub-minds have the body, and it rests again once it is up. Its memory is its phase, when it
 * began, the blows of its burst, the option running and every option's own.
 */
export function tempoTactics(spec: BodySpec, config: TempoConfig, wiring: MindWiring): Tactics {
  const walk = walker(spec), reader = situationReader(spec, (sight) => wiring.orders(sight.view.senses));
  const standing = config.actions.filter((action) => action.lower === undefined), lowAction = config.actions.find((action) => action.lower !== undefined);
  const orders = followOrders(walk, standing), low = lowAction ? strikeLow(lowAction, spec, walk) : null;
  const ready = standing.map((action) => strike(action, walk, false, throws(config, action)));
  const closing = standing.map((action) => strike(action, walk, true, throws(config, action)));
  const strikes: readonly StandingOption[] = [...ready, ...closing];
  const counts = standing.map((action) => throws(config, action));
  const options: readonly StandingOption[] = [orders, ...low ? [low] : [], ...strikes];
  const reflexes = reflexLayer(config.reflexes.map(reflexOf));
  const state = { phase: "wait" as Phase, since: 0, settled: null as number | null, thrown: 0, running: -1,
    situation: reader.state, options: options.map((option) => option.state), reflexes: reflexes.state };

  const current = (): StandingOption | null => state.running < 0 ? null : options[state.running]!;
  /** Whether `option` is a strike that has asked for its blow. */
  const threw = (option: StandingOption): boolean => strikes.includes(option) && (option.state as { readonly id: number | null }).id !== null;
  /** Run `option` (null for none), ending the one running; a strike that asked for its blow is a blow of the burst. */
  const run = (option: StandingOption | null, now: Situation): void => {
    const i = option ? options.indexOf(option) : -1;
    if (state.running === i) return;
    const was = current();
    if (was) { if (threw(was)) state.thrown++; was.end(); }
    state.running = i;
    option?.begin(now);
  };
  const to = (phase: Phase, now: Situation): void => { state.phase = phase; state.since = now.time; state.settled = null; if (phase === "enter") state.thrown = 0; };
  /**
   * What its record says the `k`th standing action is worth: the blows it throws, times the share
   * of its committed blows that landed, a second of its run (`record`). An action not yet tried
   * has the record's prior, so each is tried before the record ranks them.
   */
  const rate = (now: Situation, k: number): number => {
    const { lands, seconds } = record(now.sight.report.ledger, standing[k]!.name);
    return counts[k]! * lands / seconds;
  };
  /** Of `list` (one option for each standing action, in its order), the one on offer its record rates highest; the first of equals. */
  const best = (list: readonly StandingOption[], now: Situation): StandingOption | null => {
    let chosen: StandingOption | null = null, top = -Infinity;
    for (let k = 0; k < list.length; k++) {
      if (!list[k]!.available(now)) continue;
      const value = rate(now, k);
      if (value > top) { top = value; chosen = list[k]!; }
    }
    return chosen;
  };
  /** Whether the running option holds a blow it may not give up. */
  const committed = (now: Situation): boolean => { const running = current(); return running !== null && !running.yields(now); };
  /** Head to head, the edge it rests at: the focus's reach, or its own where the focus has none measured. */
  const edge = (now: Situation): number => now.reach.theirs > 0 ? now.reach.theirs : now.reach.mine;

  const still = (now: Situation): Asked => ({ move: null, face: walk.facing(now), actions: [] });
  /** Toward the focus (`sign` 1) or away from it (-1), facing it. */
  const along = (now: Situation, sign: 1 | -1): Asked => {
    const focus = now.focus!, centre = now.sight.view.stance.centre, x = sign * (focus.centre.x - centre.x), z = sign * (focus.centre.z - centre.z);
    const near = Math.max(0, edge(now) + now.apart - now.reach.apart);
    return { ...sign > 0 ? walk.range(now, near, near + config.margin, walk.facing(now)) : walk.toward(now, x, z, walk.facing(now)), actions: [] };
  };
  /** Stand at the edge, from its bound to `margin` past it, facing the focus. */
  const keepEdge = (now: Situation): Asked => {
    const outside = edge(now), apart = now.reach.apart;
    return apart > outside + config.margin ? along(now, 1) : apart < outside ? along(now, -1) : still(now);
  };
  /** Its burst: the running strike while it goes on, else the first ready, else the first that closes, else a walk in. */
  const attack = (now: Situation, dt: number): Asked => {
    const running = current();
    if (running && (running.ended(now) || !running.available(now))) run(null, now);
    if (state.running < 0 && state.thrown >= config.burst) { to("exit", now); return still(now); }
    if (state.running < 0) run(best(ready, now) ?? best(closing, now), now);
    const chosen = current();
    if (!chosen) return along(now, 1);
    const asking = threw(chosen), asked = chosen.step(now, dt);
    if (asked.actions.length > 0) state.phase = "burst";
    // Asking for a blow starts its time in reach again: a blow slow to set up is given it whole.
    if (!asking && threw(chosen)) state.since = now.time;
    return asked;
  };

  const decide = (now: Situation, dt: number): Asked => {
    if (now.down) { run(null, now); to("wait", now); return still(now); }
    if (!committed(now)) {
      if (orders.available(now)) { run(orders, now); state.phase = "orders"; return orders.step(now, dt); }
      if (low?.available(now)) { run(low, now); state.phase = "low"; return low.step(now, dt); }
      if (current() === orders || current() === low) run(null, now);
    }
    if (!now.focus) { run(null, now); return still(now); }
    const phase = state.phase;
    switch (phase) {
      case "wait": case "low": case "orders": {
        if (phase !== "wait") to("wait", now);
        const apart = now.reach.apart, outside = edge(now);
        if (apart >= outside && apart <= outside + config.margin) state.settled ??= now.time;
        if (state.settled !== null && now.time - state.settled >= config.rest) { to("enter", now); return attack(now, dt); }
        return keepEdge(now);
      }
      case "enter": case "burst": {
        if (!committed(now) && (now.incoming !== null || now.apart < CLINCH.within || now.time - state.since > config.commit)) { run(null, now); to("exit", now); return along(now, -1); }
        return attack(now, dt);
      }
      case "exit": {
        if (committed(now)) return current()!.step(now, dt);
        run(null, now);
        if (now.reach.apart >= edge(now) || now.time - state.since >= EXIT_LONGEST) { to("wait", now); return keepEdge(now); }
        return along(now, -1);
      }
      default: { const never: never = phase; throw new Error(`unknown tempo phase ${JSON.stringify(never)}`); }
    }
  };

  return {
    name: "tempo", state, engagement: { get phase() { return state.phase; } },
    decide(sight, dt) {
      const now = reader.read(sight), asked = decide(now, dt), near = current()?.near?.(now) ?? null;
      const move = walk.constrain(now, asked.move, near);
      const { movement, pace, travelFacing, ...direct } = asked;
      return reflexes.apply(now, { ...(move === asked.move ? asked : direct), move, guard: NO_COVER });
    },
  };
}
