import { standReady, tumbling, type GroundReading } from "../../control/ground-reading.ts";
import type { Sight } from "../decider.ts";
import type { TechniquePart } from "../../skills/recovery/shared/technique.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { PartConfig } from "../../parts/parts.ts";
import type { OptionRecord } from "./record.ts";

/** A body standing ready this long (`standReady`) with no try under way has risen, s: its rise is over. */
const READY_HOLD = .1;

/** **The steady's try**, s: how long the steady holds the body on its feet before its try is over, the rise over where it stands, else a try begun afresh. */
export const STEADY_TRY = 2;

/**
 * How upright a body on its feet holds its trunk (`GroundReading.upright`, the cosine of its lean):
 * a squat or a climb holds it above, a body lying on its back with its feet planted below, however
 * its supports read on a step its trunk does not bear: on its feet means the trunk within 60
 * degrees of upright.
 */
const TRUNK_UP = .5;

/** **On its feet**: read standing or crouched, or its feet bearing it (`GroundReading.onFeet`) while its position is read between, its trunk up (`TRUNK_UP`). */
export const onFeet = (g: GroundReading): boolean => (g.onFeet || g.position === "standing" || g.position === "crouch") && g.upright >= TRUNK_UP;

/**
 * **What a body's reader keeps of its rise**, read once a decision, each count the seconds since
 * the decision before (the world's time, `BodyView.time`): whether its rise runs, from the decision the body is down until it has stood
 * ready (`standReady`, `READY_HOLD`) with no try under way, an action neither ended nor a mode of
 * the ground's (`TechniquePart.mode`), the steady not climbing
 * (`TechniquePart.mode.climbing`), or its steady's try is over with the body standing; the seconds it has been braced
 * tumbling off its feet (`TechniquePart.mode`, `tumbling`) since the rise began or a try in `record` last
 * ended; and the seconds the steady has held it in its try (`TechniquePart.mode`, `STEADY_TRY`).
 */
export function riseMemory(record: OptionRecord, parts: PartLookup, techniques: readonly PartConfig[]) {
  const modes = new Map<string, NonNullable<TechniquePart["mode"]>>();
  for (const config of techniques) {
    const mode = parts.of("technique", config).mode;
    if (mode) modes.set(config.kind, mode);
  }
  const state = { rising: false, ready: 0, tumbled: 0, steadied: 0, noted: record.state.version, at: null as number | null };
  return {
    state,
    read(sight: Sight): void {
      const view = sight.view, g = view.ground, dt = state.at === null ? 0 : view.time - state.at;
      state.at = view.time;
      if (state.noted !== record.state.version) { state.noted = record.state.version; state.tumbled = 0; }
      if (!state.rising && view.down) { state.rising = true; state.ready = 0; state.tumbled = 0; state.steadied = 0; }
      if (!state.rising) return;
      let steady = false, climbing = false, trying = false, bracing = false;
      for (const action of sight.report.actions) {
        const mode = modes.get(action.action);
        if (mode?.kind === "steady") { steady = true; climbing ||= action.stage === mode.climbing; }
        bracing ||= mode?.kind === "brace";
        trying ||= mode === undefined && !action.stage.startsWith("ended:");
      }
      state.steadied = steady ? state.steadied + dt : 0;
      if (state.steadied >= STEADY_TRY) {
        state.steadied = 0;
        if (g?.position === "standing" && !view.down) { state.rising = false; return; }
      }
      if (bracing && g && !onFeet(g) && tumbling(g)) state.tumbled += dt;
      state.ready = !trying && standReady(view) ? state.ready + dt : 0;
      if (state.ready >= READY_HOLD && !climbing) state.rising = false;
    },
  };
}

/** **A body's rise memory** (`riseMemory`). */
export type RiseMemory = ReturnType<typeof riseMemory>;
