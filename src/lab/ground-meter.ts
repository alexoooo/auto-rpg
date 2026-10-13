import type { Body } from "../core/body.ts";
import type { World } from "../core/world.ts";

interface Trail { readonly at: number; readonly position: string; readonly controller: string; readonly mode: string; readonly phase: string }
interface Attempt { readonly at: number; readonly seconds: number; readonly controller: string; readonly end: "hand-back" | "retry" | "cap" }
interface RecoveryState { readonly phase?: string; readonly rise?: { readonly phase?: string; readonly stage?: number; readonly tries?: number } }

/** The phase actually running inside support recovery, without replacing or restarting its controller. */
function recoveryState(body: Body): RecoveryState | undefined {
  return (body.state as { mind?: { subs?: RecoveryState[] } }).mind?.subs?.find(s => s?.rise !== undefined);
}

/** A run's ground history and assist meter, shared by the Lab readout and the Node bed. */
export function groundMeter(body: Body, world: World, balance: number) {
  const indices = Object.fromEntries(body.built.spec.segments.map((s, i) => [s.name, i]));
  const state = {
    from: null as number | null, takeover: null as number | null, handback: null as number | null,
    downSeconds: 0, active: false, falls: 0, previousTry: 0, attemptFrom: 0,
    trail: [] as Trail[], attempts: [] as Attempt[], completions: [] as number[], phases: {} as Record<string, number>,
    forceImpulse: 0, momentImpulse: 0, forcePeak: 0, momentPeak: 0,
  };
  const sample = () => {
    const time = body.view.time, ground = body.view.ground, active = body.has !== "command" && body.has !== "nobody";
    if (body.view.down && (state.from === null || state.handback !== null)) {
      state.from = time; state.takeover = null; state.handback = null; state.falls++;
    }
    if (active && !state.active) { state.takeover ??= time; state.attemptFrom = time; }
    if (state.from !== null && state.handback === null) state.downSeconds = time - state.from;
    const recovery = recoveryState(body), phase = recovery?.phase === "rise" ? recovery.rise?.phase ?? "rise" : recovery?.phase ?? "none";
    const mode = recovery?.phase ?? body.has;
    if (active) state.phases[phase] = (state.phases[phase] ?? 0) + world.dt;
    const tries = recovery?.rise?.tries ?? 0;
    if (tries > state.previousTry && state.previousTry > 0) {
      state.attempts.push({ at: state.attemptFrom, seconds: time - state.attemptFrom, controller: body.has, end: "retry" });
      state.attemptFrom = time;
    }
    state.previousTry = tries;
    if (!active && state.active && !body.view.down && state.from !== null) {
      state.handback = time - state.from; state.completions.push(state.handback);
      state.attempts.push({ at: state.attemptFrom, seconds: time - state.attemptFrom, controller: "support-recovery", end: "hand-back" });
    }
    state.active = active;
    const position = ground?.position ?? (body.view.down ? "between" : "standing"), last = state.trail.at(-1);
    if (!last || last.position !== position || last.controller !== body.has || last.mode !== mode || last.phase !== phase)
      state.trail.push({ at: time, position, controller: body.has, mode, phase });
    const force = body.assist.given.force.length(), moment = body.assist.given.moment.length();
    state.forceImpulse += force * world.dt; state.momentImpulse += moment * world.dt;
    state.forcePeak = Math.max(state.forcePeak, force); state.momentPeak = Math.max(state.momentPeak, moment);
  };
  return {
    state, sample,
    beginFall() {
      state.from = null; state.takeover = null; state.handback = null; state.downSeconds = 0;
      state.previousTry = 0; state.active = false;
    },
    cap() {
      if (state.active) state.attempts.push({ at: state.attemptFrom, seconds: world.time - state.attemptFrom, controller: body.has, end: "cap" });
    },
    frame() {
      const ground = body.view.ground, recovery = recoveryState(body);
      const loads = Object.fromEntries(["hand.left", "hand.right", "foot.left", "foot.right"].map(name => [name, ground?.load[indices[name]!] ?? null]));
      const sorted = [...state.completions].sort((a, b) => a - b), middle = sorted.length >> 1;
      return { time: body.view.time, down: body.view.down, seconds: state.downSeconds, handback: state.handback,
        controller: body.has, mode: recovery?.phase ?? body.has, phase: recovery?.rise?.phase ?? "none", stage: recovery?.rise?.stage ?? null,
        position: ground?.position ?? "standing", loads, balance,
        trail: [...state.trail], attempts: [...state.attempts], phases: { ...state.phases },
        assist: { forcePeak: state.forcePeak, momentPeak: state.momentPeak, forceImpulse: state.forceImpulse, momentImpulse: state.momentImpulse },
        summary: { falls: state.falls, stood: sorted.length, median: sorted.length ? (sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2) : null,
          worst: sorted.at(-1) ?? null } };
    },
  };
}
