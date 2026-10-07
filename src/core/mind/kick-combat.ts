import { capsuleSurfaceAtHeight } from './openings.ts';
import { lowOpponent } from './sensed-bounds.ts';
import { atan2, hypot, cos, sin } from '../math/real.ts';
import { wrap } from '../skills/locomotion.ts';
import type { KickTuning } from '../skills/kick.ts';
import { GUARD_ACTION, type KickAction } from './intent.ts';
import type { Orders } from './orders.ts';
import type { Sight, Tactics } from './tactics.ts';

/** Low-kick admission trials: `docs/reference/front-kicks.md#arena-selection`. */
const KICK_SELECTION = Object.freeze({ height: .4, ahead: .45, band: .08, across: .16,
  turned: .12, slow: .12, quiet: .1, hold: .1, cooldown: 4, moved: .15, approach: .18, braking: .5, approachLimit: 30 });

/** Optional geometric tactics over the shared executor; ordinary punching and ground combat resume after landing. */
export function kickCombat(base: Tactics, tuning: KickTuning, orders: (sight: Sight) => Orders | null): Tactics {
  const state = { base: base.state ?? null, phase: 'guard', action: null as KickAction | null,
    began: false, ready: 0, approaching: 0, next: 0, deadline: 0, foot: 'right' as 'left' | 'right' };
  const guard = { left: GUARD_ACTION, right: GUARD_ACTION };
  return { name: base.name, state, engagement: state, decide(sight, dt) {
    const { view, report } = sight;
    if (view.resumed) { state.action = null; state.began = false; state.ready = 0; state.approaching = 0; state.next = view.time + KICK_SELECTION.cooldown; }
    const ordered = orders(sight);
    if (state.action && state.began && !report.kick?.foot) {
      state.action = null; state.began = false; state.next = view.time + KICK_SELECTION.cooldown;
      state.foot = state.foot === 'right' ? 'left' : 'right';
    }
    if (state.action) {
      state.began ||= !!report.kick?.foot;
      const foe = view.senses.others.find(o => o.id === state.action!.targetId && !o.out);
      const cancel = !!ordered || view.down || !foe || lowOpponent(view, foe)
        || view.time >= state.deadline || foe.velocity.length() > KICK_SELECTION.moved;
      if (cancel && !report.kick?.foot) { state.action = null; state.began = false; state.next = view.time + KICK_SELECTION.cooldown; }
      else {
        state.phase = `kick ${report.kick?.stage ?? 'prepare'}`;
        return { move: null, face: report.heading, hands: guard, combat: null, kick: cancel ? null : state.action };
      }
    }
    const intent = base.decide(sight, dt); state.phase = base.engagement?.phase ?? 'guard';
    if (ordered || view.down || view.senses.out || report.strike.hand || view.time < state.next
      || (report.support && report.support.stage !== 'stand') || state.phase === 'escape' || state.phase === 'evade') {
      state.ready = 0; state.approaching = 0; return intent;
    }
    const foe = view.senses.others.filter(o => o.side !== view.senses.side && !o.out)
      .reduce<typeof view.senses.others[number] | null>((best, o) => !best || hypot(o.centre.x - view.head.x, o.centre.z - view.head.z)
        < hypot(best.centre.x - view.head.x, best.centre.z - view.head.z) ? o : best, null);
    if (!foe || lowOpponent(view, foe) || foe.velocity.length() > KICK_SELECTION.quiet) { state.ready = 0; state.approaching = 0; return intent; }
    const c = view.stance.centre, height = view.stance.support.y + KICK_SELECTION.height;
    const candidates = ['shank.left', 'shank.right'].map(name => capsuleSurfaceAtHeight(foe, name, [c.x, height, c.z], height));
    const foot = view.stance.soles[state.foot];
    const target = candidates.reduce<typeof candidates[number]>((best, p) => p && (!best || hypot(p[0] - foot.x, p[2] - foot.z)
      < hypot(best[0] - foot.x, best[2] - foot.z)) ? p : best, null);
    if (!target) { state.ready = 0; state.approaching = 0; return intent; }
    const dx = target[0] - c.x, dz = target[2] - c.z, face = atan2(dx, dz);
    const aligned = Math.abs(wrap(face - view.stance.facing)) <= KICK_SELECTION.turned;
    const distance = hypot(target[0] - foot.x, target[2] - foot.z);
    // The lateral check is expressed in the observed approach frame.
    const lateral = hypot(dx, dz) > 0 ? ((target[0] - foot.x) * dz - (target[2] - foot.z) * dx) / hypot(dx, dz) : Infinity;
    const inRange = Math.abs(distance - KICK_SELECTION.ahead) <= KICK_SELECTION.band && Math.abs(lateral) <= KICK_SELECTION.across;
    state.ready = aligned && inRange && view.stance.phase === 'stand' && view.stance.velocity.length() <= KICK_SELECTION.slow
      ? state.ready + dt : 0;
    if (state.ready < KICK_SELECTION.hold) {
      state.approaching += dt;
      if (state.approaching >= KICK_SELECTION.approachLimit) {
        state.approaching = 0; state.ready = 0; state.next = view.time + KICK_SELECTION.cooldown;
        return intent;
      }
      const turn = wrap(face - report.heading), speed = Math.max(-KICK_SELECTION.approach,
        Math.min(KICK_SELECTION.approach, (distance - KICK_SELECTION.ahead) / KICK_SELECTION.braking));
      const sideways = Math.abs(lateral) > KICK_SELECTION.across ? Math.max(-KICK_SELECTION.approach,
        Math.min(KICK_SELECTION.approach, lateral / KICK_SELECTION.braking)) : 0;
      state.phase = 'kick approach';
      return { move: inRange ? null : [speed * cos(turn) - sideways * sin(turn), speed * sin(turn) + sideways * cos(turn)], face, hands: guard, combat: null };
    }
    state.action = { foot: state.foot, target: [...target], targetId: foe.id };
    state.began = false; state.ready = 0; state.approaching = 0; state.deadline = view.time + tuning.setupLimit + tuning.transferLimit
      + tuning.prepareLimit + tuning.returnLimit + tuning.placeLimit + tuning.recenterLimit;
    state.phase = 'kick prepare';
    return { move: null, face, hands: guard, combat: null, kick: state.action };
  } };
}
