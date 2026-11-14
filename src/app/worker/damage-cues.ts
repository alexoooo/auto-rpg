import type { LandedBlow } from "../../combat/blows.ts";
import type { Vec3 } from "../../core/quantity.ts";

/** Actual life lost at a contact, dated on the page's frame clock. */
export interface DamageCue {
  readonly fighter: string;
  readonly segment: string;
  readonly point: Vec3;
  readonly time: number;
  /** Life actually lost, HP, after the struck part's factor and remaining-life cap. */
  readonly damage: number;
}

/** Read each new wound once; `begins` is the world time at frame time zero. */
export function damageCues(blows: () => readonly LandedBlow[], begins = 0): () => DamageCue[] {
  const state = { read: 0 };
  return () => {
    const landed = blows(), cues: DamageCue[] = [];
    state.read = Math.min(state.read, landed.length);
    for (; state.read < landed.length; state.read++) {
      const blow = landed[state.read]!;
      for (const side of blow.sides) if (side.wound && side.wound.life > 0) {
        cues.push({ fighter: side.fighter, segment: side.segment, point: blow.point, time: blow.time - begins, damage: side.wound.life });
      }
    }
    return cues;
  };
}
