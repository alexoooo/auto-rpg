import { heldCommand } from "../../src/skills/recovery/held-body.ts";

/** Saved outputs computed in a research decision and sent by its following action. */
export function pendingControl(channels) {
  const state = { ...heldCommand(channels), ready: false };
  const control = {
    muscles: { activation: state.activation, velocity: state.velocity },
    get assist() { state.assistAsked = true; return state.assist; },
    configurations: { request(segment, configuration) { state.configurations[segment] = configuration; } },
  };
  return {
    state, control,
    think() { state.assistAsked = false; for (const segment in state.configurations) delete state.configurations[segment]; state.ready = true; },
    act(target) {
      if (!state.ready) return;
      target.muscles.activation.set(state.activation);
      target.muscles.velocity.set(state.velocity);
      if (state.assistAsked) {
        target.assist.force.copyFrom(state.assist.force);
        target.assist.moment.copyFrom(state.assist.moment);
      }
      for (const segment in state.configurations) target.configurations.request(segment, state.configurations[segment]);
      state.ready = false;
    },
    interrupt() { state.ready = false; },
  };
}
