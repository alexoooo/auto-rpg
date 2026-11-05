import { heldCommand } from "../../src/skills/recovery/held-body.ts";

/** Saved outputs computed in a research decision and sent by its following action. */
export function pendingControl(channels) {
  const state = { ...heldCommand(channels), ready: false };
  const control = {
    muscles: { activation: state.activation, velocity: state.velocity },
    get assist() { state.assistAsked = true; return state.assist; },
    hands: { request() { throw new Error("a research pending command asks no hand a pose"); } },
  };
  return {
    state, control,
    think() { state.assistAsked = false; state.ready = true; },
    act(target) {
      if (!state.ready) return;
      target.muscles.activation.set(state.activation);
      target.muscles.velocity.set(state.velocity);
      if (state.assistAsked) {
        target.assist.force.copyFrom(state.assist.force);
        target.assist.moment.copyFrom(state.assist.moment);
      }
      state.ready = false;
    },
    interrupt() { state.ready = false; },
  };
}
