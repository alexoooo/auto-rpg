import { capsuleSurfaceAtHeight } from "./openings.ts";
import { lowOpponent } from "./sensed-bounds.ts";
import { atan2, hypot, cos, sin } from "../math/real.ts";
import { wrap } from "../math/turn.ts";
import type { KickTuning } from "../skills/kick.ts";
import type { Side } from "../spec/body.ts";
import { NO_COVER, type Intent, type KickAttack } from "./intent.ts";
import type { Sight } from "./tactics.ts";
import { nearestFoe } from "./targets.ts";

/** Low-kick admission trials: `docs/reference/front-kicks.md#arena-selection`. */
const KICK_SELECTION = Object.freeze({ height: .4, ahead: .45, band: .08, across: .16,
  turned: .12, slow: .12, quiet: .1, hold: .1, cooldown: 4, moved: .15, approach: .18, braking: .5, approachLimit: 30 });

/** What the kick part asks of the body this step, and the phase it is in. */
interface Kicking { readonly intent: Intent; readonly phase: string }

/**
 * **The opening tactics' kick**, a part of them (`pathTactics`): a low kick at the nearest
 * standing foe's legs (`BodySpec.marks`), with the foot `feet` names or each in turn, approached and admitted by
 * geometry alone; the common skill carries it out. `during` carries on a kick under way; `after`,
 * given what the fighter's own tactics decided, admits one or walks to where one can be.
 */
export function kickTactics(tuning: KickTuning, feet: Side | "alternate" = "alternate") {
  const state = { action: null as KickAttack | null, began: false, ready: 0, approaching: 0, next: 0, deadline: 0, foot: (feet === "left" ? "left" : "right") as Side };
  return {
    state,
    /** The kick under way, carried on or cancelled; null when there is none and the fighter's own tactics decide. */
    during({ view, report }: Sight, ordered: boolean): Kicking | null {
      if (view.resumed) { state.action = null; state.began = false; state.ready = 0; state.approaching = 0; state.next = view.time + KICK_SELECTION.cooldown; }
      if (state.action && state.began && !report.kick?.foot) {
        state.action = null; state.began = false; state.next = view.time + KICK_SELECTION.cooldown;
        if (feet === "alternate") state.foot = state.foot === "right" ? "left" : "right";
      }
      if (!state.action) return null;
      state.began ||= !!report.kick?.foot;
      const foe = view.senses.others.find(o => o.id === state.action!.targetId && !o.out);
      const cancel = ordered || view.down || !foe || lowOpponent(view, foe)
        || view.time >= state.deadline || foe.velocity.length() > KICK_SELECTION.moved;
      if (cancel && !report.kick?.foot) { state.action = null; state.began = false; state.next = view.time + KICK_SELECTION.cooldown; return null; }
      return { phase: `kick ${report.kick?.stage ?? "prepare"}`, intent: { move: null, face: report.heading, guard: NO_COVER, attack: cancel ? null : state.action } };
    },
    /** A kick admitted or approached after the fighter's own tactics decided in `phase`; null leaves what they decided. */
    after({ view, report }: Sight, dt: number, phase: string, ordered: boolean): Kicking | null {
      if (ordered || view.down || view.senses.out || report.strike.hand || view.time < state.next
        || (report.support && report.support.stage !== "stand") || phase === "escape" || phase === "evade") {
        state.ready = 0; state.approaching = 0; return null;
      }
      const foe = nearestFoe(view.senses, view.head, "standing");
      if (!foe || lowOpponent(view, foe) || foe.velocity.length() > KICK_SELECTION.quiet) { state.ready = 0; state.approaching = 0; return null; }
      const c = view.stance.centre, height = view.stance.support.y + KICK_SELECTION.height;
      const candidates = foe.spec.marks.legs.map(name => capsuleSurfaceAtHeight(foe, name, [c.x, height, c.z], height));
      const foot = view.stance.soles[state.foot];
      const target = candidates.reduce<typeof candidates[number]>((best, p) => p && (!best || hypot(p[0] - foot.x, p[2] - foot.z)
        < hypot(best[0] - foot.x, best[2] - foot.z)) ? p : best, null);
      if (!target) { state.ready = 0; state.approaching = 0; return null; }
      const dx = target[0] - c.x, dz = target[2] - c.z, face = atan2(dx, dz);
      const aligned = Math.abs(wrap(face - view.stance.facing)) <= KICK_SELECTION.turned;
      const distance = hypot(target[0] - foot.x, target[2] - foot.z);
      // The lateral check is expressed in the observed approach frame.
      const lateral = hypot(dx, dz) > 0 ? ((target[0] - foot.x) * dz - (target[2] - foot.z) * dx) / hypot(dx, dz) : Infinity;
      const inRange = Math.abs(distance - KICK_SELECTION.ahead) <= KICK_SELECTION.band && Math.abs(lateral) <= KICK_SELECTION.across;
      state.ready = aligned && inRange && view.stance.phase === "stand" && view.stance.velocity.length() <= KICK_SELECTION.slow
        ? state.ready + dt : 0;
      if (state.ready < KICK_SELECTION.hold) {
        state.approaching += dt;
        if (state.approaching >= KICK_SELECTION.approachLimit) {
          state.approaching = 0; state.ready = 0; state.next = view.time + KICK_SELECTION.cooldown;
          return null;
        }
        const turn = wrap(face - report.heading), speed = Math.max(-KICK_SELECTION.approach,
          Math.min(KICK_SELECTION.approach, (distance - KICK_SELECTION.ahead) / KICK_SELECTION.braking));
        const sideways = Math.abs(lateral) > KICK_SELECTION.across ? Math.max(-KICK_SELECTION.approach,
          Math.min(KICK_SELECTION.approach, lateral / KICK_SELECTION.braking)) : 0;
        return { phase: "kick approach", intent: { move: inRange ? null : [speed * cos(turn) - sideways * sin(turn), speed * sin(turn) + sideways * cos(turn)], face, guard: NO_COVER, attack: null } };
      }
      state.action = { kind: "kick", foot: state.foot, target: [...target], targetId: foe.id };
      state.began = false; state.ready = 0; state.approaching = 0; state.deadline = view.time + tuning.setupLimit + tuning.transferLimit
        + tuning.prepareLimit + tuning.returnLimit + tuning.placeLimit + tuning.recenterLimit;
      return { phase: "kick prepare", intent: { move: null, face, guard: NO_COVER, attack: state.action } };
    },
  };
}
