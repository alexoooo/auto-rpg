import type { BodyView } from "../core/body.ts";
import type { OwnBody } from "../core/mind/mind.ts";
import type { SubMind } from "../core/mind/sub-mind.ts";
import type { Clock } from "../core/clock.ts";
import { TECHNIQUES, type TechniqueEnd, type TechniqueName, type TechniqueSpec } from "../core/mind/ground/techniques.ts";
import { plantPostures } from "../core/mind/ground/plant-up.ts";
import type { BodySpec } from "../core/spec/body.ts";
import type { buildBody } from "../core/build/build-body.ts";
import poses from "../../assets/research/posture-holds.json" with { type: "json" };

/** The technique's own anatomical phase goals, built through joint-consistent placement on either human. */
export function plantWaypoint(spec: BodySpec, phase: "brace" | "plant" | "transfer" | "rise"): Parameters<typeof buildBody>[2] {
  const target = plantPostures(spec)[phase], source = poses.find(p => p.model === "workshop-fighter" && p.id === (phase === "transfer" ? "squat" : "fours"))!;
  return { position: [0, 0, 0], rotation: phase === "rise" ? [0, 0, 0, 1] : source.placement.rotation as [number, number, number, number],
    joints: Object.fromEntries(spec.joints.map(j => [j.name, j.dofs.map(d => (target[`${j.name} ${d.positive}`] ?? 0) - d.bind.value)])) };
}

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
  const spec: TechniqueSpec = TECHNIQUES[name];
  if (!spec.fits(own.spec)) throw new Error(`${spec.label} does not fit ${own.spec.model}`);
  const run = spec.make(own, view, clock);
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
