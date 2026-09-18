import { advance, type BoutState, type Phase, type Ring } from "./bout.ts";

/** The two pieces of authority a side loses when a bout is decided. */
export interface FightAuthoritySide {
  fighter: { stopFighting(): void };
  combat: { stop(): void };
}

/**
 * Own the one-shot transition from a live fight to a decided one.
 *
 * This is a per-bout object rather than a module flag: rebuilding the fighters
 * necessarily builds fresh authority with them. The latch is still valuable
 * even though `main.ts` normally reports the edge only once. It makes repeated
 * delivery harmless and keeps the rule true if another host drives the bout.
 */
export class FightEnd {
  private revoked = false;
  private readonly sides: readonly FightAuthoritySide[];

  constructor(sides: readonly FightAuthoritySide[]) {
    this.sides = sides;
  }

  get isActive(): boolean {
    return !this.revoked;
  }

  /** Return true only for the transition that actually revoked authority. */
  transition(before: Phase, after: Phase): boolean {
    if (this.revoked || before !== "fight" || after !== "over") return false;
    this.revoked = true;
    for (const side of this.sides) side.fighter.stopFighting();
    for (const side of this.sides) side.combat.stop();
    return true;
  }
}

/** Advance the pure bout rule and deliver its resulting phase edge. */
export function advanceFight(
  state: BoutState,
  ring: Ring,
  dt: number,
  ending: FightEnd,
): BoutState {
  const next = advance(state, ring, dt);
  ending.transition(state.phase, next.phase);
  return next;
}
