import { PUNCHER } from "../src/core/mind/config.ts";
import { TECHNIQUES } from "../src/core/mind/ground/techniques.ts";

/** The saved bed's exact host and recovery choice; gameplay presets remain unchanged. */
export function risingMind(sub, techniques = Object.keys(TECHNIQUES)) {
  switch (sub) {
    case "support-recovery": return { ...PUNCHER, subs: [{ kind: "support-recovery" }] };
    case "stand-up": return { ...PUNCHER, subs: [{ kind: "stand-up", techniques }] };
    default: throw new Error(`unknown rising sub-mind ${sub}`);
  }
}
