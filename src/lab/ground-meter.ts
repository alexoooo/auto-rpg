import type { HostedBody } from "../core/body.ts";
import type { World } from "../core/world.ts";
import type { GroundTechniqueState } from "./ground-technique.ts";
import type { TechniqueEnd } from "../core/mind/ground/techniques.ts";

interface Trail { readonly at: number; readonly position: string; readonly controller: string; readonly mode: string; readonly phase: string }
interface Attempt { readonly at: number; readonly seconds: number; readonly controller: string; readonly end: "hand-back" | "retry" | "cap" | "ready" | "steady-limit" | TechniqueEnd }
interface RecoveryState { readonly phase?: string; readonly rise?: { readonly phase?: string; readonly stage?: number; readonly tries?: number } }
interface StandUpState {
  readonly mode: string; readonly current: { readonly technique: string; readonly side: string; readonly seconds: number } | null;
  readonly techniques: Readonly<Record<string, object>>;
  readonly log: readonly { readonly technique: string; readonly side: string; readonly from: string; readonly to: string;
    readonly seconds: number; readonly end: TechniqueEnd | "ready" | "steady-limit" }[];
  readonly omitted: number; readonly handBack: "ready" | "steady-limit" | null;
}

/** The phase actually running inside support recovery, without replacing or restarting its controller. */
function recoveryState(body: HostedBody): RecoveryState | undefined {
  return (body.state as { mind?: { subs?: RecoveryState[] } }).mind?.subs?.find(s => s?.rise !== undefined);
}

function techniqueState(body: HostedBody): GroundTechniqueState | undefined {
  return (body.state as { mind?: { subs?: GroundTechniqueState[] } }).mind?.subs?.find(s => s?.kind === "ground-technique");
}

function standUpState(body: HostedBody): StandUpState | undefined {
  return (body.state as { mind?: { subs?: StandUpState[] } }).mind?.subs?.find(s => s?.techniques !== undefined && s.log !== undefined);
}

function standUpPhase(body: HostedBody, stand: StandUpState): string {
  return stand.current ? body.has.slice(body.has.indexOf(".") + 1) : stand.mode;
}

/** A run's ground history and assist meter, shared by the Lab readout and the Node bed. */
export function groundMeter(body: HostedBody, world: World, balance: number) {
  const indices = Object.fromEntries(body.built.spec.segments.map((s, i) => [s.name, i]));
  const state = {
    from: null as number | null, takeover: null as number | null, handback: null as number | null,
    downSeconds: 0, active: false, falls: 0, previousTry: 0, attemptFrom: 0,
    techniqueEnd: null as TechniqueEnd | null, controller: "command", standLogRead: 0,
    trail: [] as Trail[], attempts: [] as Attempt[], completions: [] as number[], phases: {} as Record<string, number>,
    forceImpulse: 0, momentImpulse: 0, forcePeak: 0, momentPeak: 0,
  };
  const sample = () => {
    const time = body.view.time, ground = body.view.ground, active = body.has !== "command" && body.has !== "nobody";
    if (body.view.down && (state.from === null || state.handback !== null)) {
      state.from = time; state.takeover = null; state.handback = null; state.falls++;
    }
    if (active && !state.active) { state.takeover ??= time; state.attemptFrom = time; state.controller = body.has; }
    if (state.from !== null && state.handback === null) state.downSeconds = time - state.from;
    const recovery = recoveryState(body), technique = techniqueState(body), stand = standUpState(body);
    const phase = stand ? standUpPhase(body, stand) : technique?.phase ?? (recovery?.phase === "rise" ? recovery.rise?.phase ?? "rise" : recovery?.phase ?? "none");
    const mode = stand?.mode ?? (technique ? "technique" : recovery?.phase ?? body.has);
    if (active) state.phases[phase] = (state.phases[phase] ?? 0) + world.dt;
    const tries = recovery?.rise?.tries ?? 0;
    if (tries > state.previousTry && state.previousTry > 0) {
      state.attempts.push({ at: state.attemptFrom, seconds: time - state.attemptFrom, controller: body.has, end: "retry" });
      state.attemptFrom = time;
    }
    state.previousTry = tries;
    if (technique?.ended && state.techniqueEnd !== technique.ended) {
      state.attempts.push({ at: state.attemptFrom, seconds: technique.time, controller: technique.technique, end: technique.ended });
    }
    state.techniqueEnd = technique?.ended ?? null;
    if (stand) {
      for (let i = Math.max(0, state.standLogRead - stand.omitted); i < stand.log.length; i++) {
        const entry = stand.log[i]!;
        state.attempts.push({ ...entry, at: time - entry.seconds, controller: entry.technique });
      }
      state.standLogRead = stand.omitted + stand.log.length;
    }
    if (!active && state.active && !body.view.down && state.from !== null) {
      state.handback = time - state.from; state.completions.push(state.handback);
      if (!stand) state.attempts.push({ at: state.attemptFrom, seconds: time - state.attemptFrom, controller: state.controller, end: "hand-back" });
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
      const current = standUpState(body)?.current;
      if (state.active) state.attempts.push({ ...(current ?? {}), at: current ? world.time - current.seconds : state.attemptFrom,
        seconds: current?.seconds ?? world.time - state.attemptFrom, controller: current?.technique ?? body.has, end: "cap" });
    },
    frame() {
      const ground = body.view.ground, recovery = recoveryState(body), technique = techniqueState(body), stand = standUpState(body);
      const loads = Object.fromEntries(["hand.left", "hand.right", "foot.left", "foot.right"].map(name => [name, ground?.load[indices[name]!] ?? null]));
      const sorted = [...state.completions].sort((a, b) => a - b), middle = sorted.length >> 1;
      return { time: body.view.time, down: body.view.down, seconds: state.downSeconds, handback: state.handback,
        controller: body.has, mode: stand?.mode ?? (technique ? "technique" : recovery?.phase ?? body.has),
        phase: stand ? standUpPhase(body, stand) : technique?.phase ?? recovery?.rise?.phase ?? "none", stage: recovery?.rise?.stage ?? null,
        handBackReason: stand?.handBack ?? null,
        techniqueEnd: technique?.ended ?? null,
        techniqueReached: technique?.reached ?? null,
        position: ground?.position ?? "standing", loads, balance,
        trail: [...state.trail], attempts: [...state.attempts], phases: { ...state.phases },
        assist: { forcePeak: state.forcePeak, momentPeak: state.momentPeak, forceImpulse: state.forceImpulse, momentImpulse: state.momentImpulse },
        summary: { falls: state.falls, stood: sorted.length, median: sorted.length ? (sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2) : null,
          worst: sorted.at(-1) ?? null } };
    },
  };
}
