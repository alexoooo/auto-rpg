import type { SubMind } from "../sub-mind.ts";
import { blocked, READY, type DownOption, type Situation } from "./option.ts";
import { pressureAt } from "./percepts.ts";
import type { Terms } from "./value.ts";

/**
 * How a down option is priced: how long it runs, s; the chance it ends with the body standing;
 * and the share of a near focus's blows it keeps off while it runs.
 */
export interface DownModel {
  readonly seconds: number;
  readonly stands: number;
  readonly shelter: number;
}

/** The terms of a down option of `model`: the blows it does not keep off of a focus within its reach (`Reach.theirs`), the blow coming, and the chance it leaves the body still down where it lies. */
export const downTerms = (model: DownModel) => (now: Situation): Terms => ({ duration: model.seconds, dealt: 0, orders: 0, exit: { apart: now.reach.apart, down: 1 - model.stands },
  taken: now.danger + (now.reach.apart <= now.reach.theirs ? pressureAt(now.pressure, 0, model.seconds * (1 - model.shelter)) : 0) });

/** Whether the body is the down half's (`downHalf`): handed to it by the body's host, and not yet taken back. */
interface Half { current: boolean }

/**
 * **A down option** named `name`, carried out by `mind`, a sub-mind of the body: on offer while
 * `mind` would have the body, giving way while it does not hold it. Its sub-mind is begun when the
 * option is, if the body is the down half's, or else when the down half is handed the body
 * (`start`); and ended when the option is, or when the down half gives the body up (`stop`).
 * Its model is `model`'s (`DownModel`); its memory holds its sub-mind's.
 */
export function downOption(name: string, mind: SubMind, half: Half, model: DownModel): DownOption & { start(): void; stop(): void } {
  const state = { begun: false, mind: mind.state };
  const start = (): void => { if (!state.begun) { mind.begin(); state.begun = true; } };
  const stop = (): void => { if (state.begun) { mind.end(); state.begun = false; } };
  const UNWANTED = blocked(`${name}: its sub-mind does not want the body`);
  return {
    name, posture: "down", layer: "commitment", mind, state,
    entry: (now) => mind.wants(now.sight.view.senses) ? READY : UNWANTED,
    exit: () => null,
    yields: () => !(mind.holds?.() ?? false),
    ended: () => false,
    begin() { if (half.current) start(); },
    end: stop,
    model: downTerms(model),
    start,
    stop,
  };
}

/**
 * **The down half**: the one sub-mind of a body under a chooser (`Chooser`), which hands the body to
 * the down option `running` names (`downOption`). It wants the body while the decision, `decide`,
 * is a down option, holds it while that option's sub-mind does, and steps that sub-mind.
 */
export function downHalf(downs: readonly ReturnType<typeof downOption>[], running: () => ReturnType<typeof downOption> | null,
  decide: () => { readonly posture: string } | null, half: Half): SubMind {
  return {
    get name() { return running()?.mind.name ?? "down"; },
    state: half,
    wants: () => decide()?.posture === "down",
    holds: () => running()?.mind.holds?.() ?? false,
    begin() { half.current = true; running()?.start(); },
    end() { for (const down of downs) down.stop(); half.current = false; },
    step(senses, dt) { running()?.mind.step(senses, dt); },
  };
}
