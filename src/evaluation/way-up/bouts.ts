/**
 * **The way-up drill's falls from bouts** (`docs/reference/rising.md#the-way-up-drill`): the riser's
 * mind, its way up ranked first, fights a copy of itself on the open stage, the same body holding
 * the same loadout, Balance 0, nothing ending the bout but the reader. The first side down is the
 * fall read, from that step: the other side is ordered to stand where it is (`STAND_ORDERS`), the
 * fallen side is given the stand's verification's orders (`standCheck`), and its attempts at its
 * way up are read from its mind's ledger (`groundLedger`), as the fall bed reads them. A bout
 * nobody falls in within `BOUT_WAIT` s is a fall not made (no takeover). The two start a gap
 * apart, the right side moved across the line between them, at each of `BOUT_PLACES`; the twin
 * draws them halfway between (`between`).
 */
import { otherSide, SIDES, type Side } from "../../core/bodies/bilateral.ts";
import type { HumanoidModel } from "../../core/bodies/models.ts";
import type { Loadout } from "../../core/bodies/items/held.ts";
import { deepFreeze } from "../../core/state.ts";
import { HUMANOID_MODELS } from "../../core/bodies/models.ts";
import { standCheck } from "../../game/lab/ground-mode.ts";
import { STAND_ORDERS } from "../../minds/orders.ts";
import { mindOf, sideAttributes, type CaseWorld, type Json, type Reader } from "../evaluation.ts";
import type { BuiltBout } from "../bout.ts";
import { FALL_AFTER, FALL_CAP, groundLedger, type FallReading } from "../fall.ts";
import { REPRESENTATIVE } from "../loadouts.ts";
import { between } from "../twin.ts";
import type { EngineName } from "../../core/physics/engines.ts";
import type { AttributeOverrides } from "../../core/bodies/character-attributes.ts";

/** One bout of the drill: a body holding a loadout against its copy, `gap` m apart, the right side `across` m off the line. */
export type WayUpBoutCondition = {
  readonly model: HumanoidModel; readonly loadout: Loadout; readonly start: "bout"; readonly gap: number; readonly across: number;
};

/** How long a bout is given for a side to fall, s: as long as a fall is given to stand (`FALL_CAP`). */
export const BOUT_WAIT = FALL_CAP;

/** Where the bouts start: each gap, m, with each offset across, m. */
export const BOUT_PLACES = deepFreeze({ gaps: [2, 3, 4], across: [-1, 0, 1] });

/** The longest a bout case runs, s: its wait for a fall, then the fall's cap and what may run past it. */
export const BOUT_SECONDS = BOUT_WAIT + FALL_CAP + FALL_AFTER;

/** Every body in every rated loadout, against its copy at each of `places`. */
export const boutFalls = (places: { readonly gaps: readonly number[]; readonly across: readonly number[] }): WayUpBoutCondition[] =>
  HUMANOID_MODELS.flatMap((model) => REPRESENTATIVE.flatMap((loadout) => places.gaps.flatMap((gap) => places.across.map((across): WayUpBoutCondition =>
    ({ model, loadout, start: "bout", gap, across })))));

/** The twin's places: halfway between the drill's (`between`). */
export const TWIN_PLACES = deepFreeze({ gaps: between(BOUT_PLACES.gaps), across: between(BOUT_PLACES.across) });

/** The bout world of `condition`: `mind` on both sides, each with `character`, the bout ended by the reader alone. */
export function boutFallWorld(mind: Json, condition: WayUpBoutCondition, engine: EngineName, character: AttributeOverrides): CaseWorld {
  const { model, loadout, gap, across } = condition, config = mindOf(mind);
  return { kind: "bout", engine, tape: [],
    recipe: { left: model, right: model, gap, start: { right: { at: [gap / 2, across] } }, capSeconds: BOUT_SECONDS + 1, recoverySeconds: null, entry: [], ends: [],
      balance: { left: 0, right: 0 }, loadouts: { left: loadout, right: loadout }, minds: { left: config, right: config },
      ...sideAttributes({ left: character, right: character }) } };
}

/**
 * **A bout's fall as the fall bed reads one** (`FallReading`): waiting `BOUT_WAIT` s for a side to
 * go down, then that side's stand verified (`standCheck`) and its ground attempts kept from the
 * step it fell, until the verification's verdict or `FALL_CAP` s and `FALL_AFTER` past it.
 */
export function readBoutFall(techniques: Readonly<Record<string, unknown>>, built: BuiltBout): Reader<FallReading> & { readonly fallen: () => Side | null } {
  const { world, duel } = built;
  let fallen: Side | null = null, at = 0, ended = false;
  let check: ReturnType<typeof standCheck> | null = null, ledger: ReturnType<typeof groundLedger> | null = null;
  return {
    fallen: () => fallen,
    afterStep() {
      if (ended) return;
      if (fallen === null) {
        fallen = SIDES.find((side) => duel.duelists[side].body.down) ?? null;
        if (fallen === null) { if (duel.clock >= BOUT_WAIT) ended = true; return; }
        const riser = duel.duelists[fallen];
        at = world.time;
        duel.order(otherSide(fallen), STAND_ORDERS);
        check = standCheck({ body: riser.body, world, takenOver: () => riser.body.down, inCommand: () => true }, FALL_CAP);
        ledger = groundLedger(techniques, riser.minded.report ?? null, () => world.time);
      }
      check!.sample();
      ledger!.sample();
      duel.order(fallen, check!.orders());
      if (check!.done() || world.time - at >= FALL_CAP + FALL_AFTER) ended = true;
    },
    get ended() { return ended; },
    reading(): FallReading {
      const c = check?.state, stood = c?.stage === "stood";
      // Only what ran after the fall: an action ended before it is the fight's.
      const attempts = ledger ? ledger.attempts(world.time).filter((attempt) => attempt.at + attempt.seconds >= at) : [];
      return { status: !c || c.takeover === null ? "no takeover" : stood ? "stood" : c.stage === "fell after verification" ? "fell after verification" : "failed",
        stood, handback: null, takeover: c?.takeover ?? null, verified: c?.verified ?? null, walked: c?.walked ?? null,
        trail: [], attempts: attempts as unknown as Json, phases: {}, assist: null };
    },
  };
}
