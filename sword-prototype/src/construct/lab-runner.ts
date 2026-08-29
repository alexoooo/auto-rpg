import type { Scene } from "@babylonjs/core/scene.js";

import { CONFIG } from "../config.ts";
import type { SavedConstruct } from "./codec.ts";
import { ConstructLabBout } from "./lab-bout.ts";
import { CONSTRUCT_STUCK_WINDOW_STEPS } from "./lab-config.ts";
import { classifyConstructStuck, type ConstructActionProgressSample,
  type ConstructLabRow, type ConstructSideLabMetrics } from "./lab-report.ts";
import type { ConstructBoutJob } from "./matchup.ts";
import type { SensorSpec } from "./sensors.ts";
import type { ActionCapability } from "./capabilities.ts";

type MutableMetrics = { -readonly [Field in keyof ConstructSideLabMetrics]: ConstructSideLabMetrics[Field] };

const emptyMetrics = (): MutableMetrics => ({
  damage: 0,
  severs: 0,
  requests: 0,
  admissions: 0,
  completions: 0,
  refusals: 0,
  cancellations: 0,
  idleSteps: 0,
  stuckSteps: 0,
  energyJ: 0,
  peakHeatJ: 0,
  capabilityLosses: 0,
});

export function constructCapabilityLosses(
  side: "left" | "right",
  prior: readonly ActionCapability[],
  current: readonly ActionCapability[],
): readonly Readonly<{ id: string; reason: string }>[] {
  const now = new Map(current.map((row) => [`${row.action}/${row.group}`, row]));
  return Object.freeze(prior.flatMap((row) => {
    const next = now.get(`${row.action}/${row.group}`);
    return row.available && next?.available !== true ? [Object.freeze({
      id: `${side}/${next?.group ?? row.group}/${next?.action ?? row.action}`,
      reason: next?.reason ?? "capability row disappeared from the runtime snapshot",
    })] : [];
  }));
}

/** The authoritative per-step loop shared by a visible page host and the Node worker host. */
export function runConstructLabBout(
  scene: Scene,
  job: ConstructBoutJob,
  left: SavedConstruct,
  right: SavedConstruct,
  sensors: readonly SensorSpec[],
): ConstructLabRow {
  const bout = new ConstructLabBout(scene, left, right, sensors, CONFIG.fighter.separation, 0,
    job.matchup.initialCondition);
  try {
    const sides: Record<"left" | "right", MutableMetrics> = { left: emptyMetrics(), right: emptyMetrics() };
    const actionTrace: string[] = [];
    const refusals = new Map<string, Readonly<{ id: string; reason: string }>>();
    const capabilityLosses: Readonly<{ id: string; reason: string }>[] = [];
    const progress: ConstructActionProgressSample[] = [];
    const priorCapabilities: Record<"left" | "right", readonly ActionCapability[]> = {
      left: left.control.actions.map(({ id: action, group }) => Object.freeze({ action, group,
        available: true, reason: null, parameterBounds: Object.freeze({}) })),
      right: right.control.actions.map(({ id: action, group }) => Object.freeze({ action, group,
        available: true, reason: null, parameterBounds: Object.freeze({}) })),
    };
    const initialCharge: Record<"left" | "right", number | null> = { left: null, right: null };
    let minRangeM = Number.POSITIVE_INFINITY;
    let rangeSumM = 0;
    let finalRangeM = 0;
    let executedSteps = 0;
    let winner: "left" | "right" | "draw" = "draw";
    let deathEnding = false;
    const dt = 1 / CONFIG.world.physicsHz;
    for (let step = 0; step < job.matchup.boutCapSteps; step += 1) {
      const sample = bout.step(dt);
      executedSteps += 1;
      finalRangeM = sample.left.rangeM;
      minRangeM = Math.min(minRangeM, finalRangeM);
      rangeSumM += finalRangeM;
      for (const side of ["left", "right"] as const) {
        const snapshot = sample[side].snapshot;
        const charge = snapshot.facts["power-charge-j"];
        if (typeof charge === "number" && Number.isFinite(charge)) {
          if (initialCharge[side] === null) initialCharge[side] = charge;
          sides[side].energyJ = Math.max(sides[side].energyJ, (initialCharge[side] as number) - charge);
        }
        const heat = snapshot.facts["heat-j"];
        if (typeof heat === "number" && Number.isFinite(heat)) sides[side].peakHeatJ = Math.max(sides[side].peakHeatJ, heat);
        const capability = new Map(snapshot.capabilities.map((row) => [`${row.action}/${row.group}`, row]));
        for (const loss of constructCapabilityLosses(side, priorCapabilities[side], snapshot.capabilities)) {
          sides[side].capabilityLosses += 1;
          capabilityLosses.push(loss);
        }
        priorCapabilities[side] = snapshot.capabilities;
        sides[side].requests += snapshot.command.requests.length;
        if (snapshot.active.length === 0) sides[side].idleSteps += 1;
        for (const event of snapshot.events) {
          if (event.kind === "admitted") sides[side].admissions += 1;
          else if (event.kind === "completed") sides[side].completions += 1;
          else if (event.kind === "refused") sides[side].refusals += 1;
          else if (event.kind === "cancelled") sides[side].cancellations += 1;
          if (event.kind === "started" || event.kind === "completed" || event.kind === "cancelled") {
            actionTrace.push(`${sample.step}:${side}:${event.kind}:${event.group}/${event.action}`);
          }
          if (event.kind === "refused") {
            const id = `${side}/${event.group}/${event.action}`;
            refusals.set(`${id}\0${event.reason}`, Object.freeze({ id, reason: event.reason ?? "unspecified refusal" }));
          }
        }
        for (const active of snapshot.active) progress.push(Object.freeze({
          step: sample.step, side, action: active.action, group: active.group, phase: active.phase,
          progress: active.progress, epsilon: active.epsilon,
          capabilityAvailable: capability.get(`${active.action}/${active.group}`)?.available === true,
        }));
        for (const event of sample[side].combat) {
          sides[side].damage += event.report.damage;
          if (!event.report.severed) continue;
          sides[side].severs += 1;
        }
      }
      if (sample.left.vitality <= 0 || sample.right.vitality <= 0) {
        deathEnding = true;
        winner = sample.left.vitality <= 0 && sample.right.vitality <= 0 ? "draw" :
          sample.left.vitality <= 0 ? "right" : "left";
        break;
      }
    }
    const stuck = classifyConstructStuck(progress, CONSTRUCT_STUCK_WINDOW_STEPS);
    for (const side of ["left", "right"] as const) sides[side].stuckSteps = stuck
      .filter((interval) => interval.side === side)
      .reduce((sum, interval) => sum + interval.lastStep - interval.firstStep + 1, 0);
    return Object.freeze({
      version: 1,
      job: job.index,
      matchupDigest: job.matchupDigest,
      seed: job.matchup.seed,
      mirrored: job.matchup.mirrored,
      winner,
      ending: deathEnding ? "death" : "time",
      steps: executedSteps,
      seconds: executedSteps * dt,
      range: Object.freeze({ minM: minRangeM, meanM: rangeSumM / executedSteps, finalM: finalRangeM }),
      left: Object.freeze(sides.left),
      right: Object.freeze(sides.right),
      actionTrace: Object.freeze(actionTrace),
      refusals: Object.freeze([...refusals.values()]),
      capabilityLosses: Object.freeze(capabilityLosses),
      progress: Object.freeze(progress),
      stuck,
      limitation: null,
    });
  } finally {
    bout.dispose();
  }
}
