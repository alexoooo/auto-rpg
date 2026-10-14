import type { SubMind } from "../sub-mind.ts";
import type { DownOption } from "./option.ts";

/** Whether the body is the down half's (`downHalf`): handed to it by the body's host, and not yet taken back. */
interface Half { current: boolean }

/**
 * **A down option** named `name`, carried out by `mind`, a sub-mind of the body: on offer while
 * `mind` would have the body, giving way while it does not hold it. Its sub-mind is begun when the
 * option is, if the body is the down half's, or else when the down half is handed the body
 * (`start`); and ended when the option is, or when the down half gives the body up (`stop`).
 */
export function downOption(name: string, mind: SubMind, half: Half): DownOption & { start(): void; stop(): void } {
  const state = { begun: false };
  const start = (): void => { if (!state.begun) { mind.begin(); state.begun = true; } };
  const stop = (): void => { if (state.begun) { mind.end(); state.begun = false; } };
  return {
    name, posture: "down", mind, state,
    available: (now) => mind.wants(now.sight.view.senses),
    yields: () => !(mind.holds?.() ?? false),
    ended: () => false,
    begin() { if (half.current) start(); },
    end: stop,
    start,
    stop,
  };
}

/**
 * **The down half**: the one sub-mind of a body under a meta-controller, which hands the body to
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
