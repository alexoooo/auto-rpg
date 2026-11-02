import type { BodyView } from "../core/body.ts";
import type { OwnBody } from "../core/mind/mind.ts";
import type { SubMind } from "../core/mind/sub-mind.ts";
import type { Clock } from "../core/clock.ts";
import { TECHNIQUES } from "../core/recovery/ground/techniques.ts";
import type { TechniqueEnd, TechniqueName, TechniquePart } from "../core/recovery/ground/technique.ts";
import { partLookup } from "../entrants/game.ts";
import { GAME_GUARD, kitOf } from "../core/mind/kit.ts";

/** Detached diagnostic state for the single-technique Lab driver. */
export interface GroundTechniqueState {
  readonly kind: "ground-technique";
  readonly technique: TechniqueName;
  readonly run: object;
  phase: string;
  ended: TechniqueEnd | null;
  reached: boolean;
  time: number;
  active: boolean;
  waiting: boolean;
}

/** A run is made with its host, never added to a saved state tree after the body starts. */
export function groundTechnique(name: TechniqueName, own: OwnBody, view: BodyView, clock: Clock, immediate = true): SubMind {
  const spec: TechniquePart = TECHNIQUES[name];
  const refused = spec.fits(own.spec, spec.defaults, partLookup);
  if (refused !== null) throw new Error(`${spec.label} does not fit ${own.spec.model}: ${refused}`);
  const run = spec.make(own, view, clock, kitOf(partLookup, own.spec, { guard: GAME_GUARD }));
  const state: GroundTechniqueState = { kind: "ground-technique", technique: name, run: run.state, phase: run.phase,
    ended: null, reached: false, time: 0, active: immediate, waiting: !immediate };
  return { name: `technique: ${name}`, state,
    wants() {
      if (state.waiting && view.down) { state.active = true; state.waiting = false; }
      return state.active;
    },
    begin() { state.ended = null; state.reached = false; state.time = 0; run.begin(spec.sides[0]!); state.phase = run.phase; },
    end() { if (!state.ended) { run.end(); state.ended = "interrupted"; } state.active = false; },
    step(senses, dt) {
      if (!view.ground) return;
      state.time += dt;
      state.ended = run.step(view.ground, senses, dt); state.phase = run.phase;
      state.reached = state.ended === "done" && run.reached(view.ground, spec.edges[0]!.to);
      if (state.ended) state.active = false;
    } };
}
