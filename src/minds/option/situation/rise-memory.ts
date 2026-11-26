import { standReady, tumbling, type GroundReading } from "../../../control/ground-reading.ts";
import type { Sight } from "../../decider.ts";
import type { TechniquePart } from "../../../skills/recovery/shared/technique.ts";
import type { PartLookup } from "../../../parts/lookup.ts";
import type { PartConfig } from "../../../parts/parts.ts";
import type { OptionRecord } from "../contract/context.ts";
import { handSet } from "../../../core/hand-set.ts";

/** A body standing ready this long (`standReady`) with no try under way has risen, s: its rise is over. */
const READY_HOLD = handSet({
  name: "READY_HOLD", sort: "own",
  says: "How long a body must read as standing ready, s, before the Mind takes its rise as over.",
  value: .1,
});

/** **The regain's try**, s: how long the regain holds the body on its feet before its try is over, the rise over where it stands, else a try begun afresh. */
export const REGAIN_TRY = handSet({
  name: "REGAIN_TRY", sort: "own",
  says: "How long the Mind holds a body regaining its feet before that try is over, s.",
  value: 2,
});

/**
 * How upright a body on its feet holds its trunk (`GroundReading.upright`, the cosine of its lean):
 * a squat or a climb holds it above, a body lying on its back with its feet planted below, however
 * its supports read on a step its trunk does not bear: on its feet means the trunk within 60
 * degrees of upright.
 */
const TRUNK_UP = handSet({
  name: "TRUNK_UP", sort: "own",
  says: "How upright a body on its feet holds its trunk, as the cosine of its lean: within 60 degrees of upright.",
  value: .5,
});

/** **On its feet**: read standing or crouched, or its feet bearing it (`GroundReading.onFeet`) while its position is read between, its trunk up (`TRUNK_UP`). */
export const onFeet = (g: GroundReading): boolean => (g.onFeet || g.position === "standing" || g.position === "crouch") && g.upright >= TRUNK_UP;

/**
 * **What a body's reader keeps of its rise**, read once a decision, each count the seconds since
 * the decision before (the world's time, `BodyView.time`): whether its rise runs, from the decision the body is down until it has stood
 * ready (`standReady`, `READY_HOLD`) with no try under way, an action neither ended nor a mode of
 * the ground's (`TechniquePart.mode`), a mode that regains its feet not climbing
 * (`TechniquePart.mode.climbs`), or its regain's try is over with the body standing; the seconds it has been braced
 * tumbling off its feet (a mode that `braces`, `tumbling`) since the rise began or a try in `record` last
 * ended; and the seconds a mode that regains its feet has held it in its try (`REGAIN_TRY`).
 */
export function riseMemory(record: OptionRecord, parts: PartLookup, techniques: readonly PartConfig[]) {
  const modes = new Map<string, NonNullable<TechniquePart["mode"]>>();
  for (const config of techniques) {
    const mode = parts.of("technique", config).mode;
    if (mode) modes.set(config.kind, mode);
  }
  const state = { rising: false, ready: 0, tumbled: 0, regained: 0, noted: record.state.version, at: null as number | null };
  return {
    state,
    read(sight: Sight): void {
      const view = sight.view, g = view.ground, dt = state.at === null ? 0 : view.time - state.at;
      state.at = view.time;
      if (state.noted !== record.state.version) { state.noted = record.state.version; state.tumbled = 0; }
      if (!state.rising && view.down) { state.rising = true; state.ready = 0; state.tumbled = 0; state.regained = 0; }
      if (!state.rising) return;
      let regain = false, climbing = false, trying = false, bracing = false;
      for (const action of sight.report.actions) {
        const mode = modes.get(action.action);
        if (mode?.climbs) { regain = true; climbing ||= action.stage === mode.climbs; }
        bracing ||= mode?.braces === true;
        trying ||= mode === undefined && !action.stage.startsWith("ended:");
      }
      state.regained = regain ? state.regained + dt : 0;
      if (state.regained >= REGAIN_TRY) {
        state.regained = 0;
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
