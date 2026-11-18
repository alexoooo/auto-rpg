/**
 * **How the back step's evaluation reads a trial**: each straight punch the attacker throws at the
 * subject, whether it took a landed blow's life, whether the subject was out of its reach after it
 * and in again in time, and whether the subject went down.
 */
import type { Duel } from "../../game/arena/duel.ts";
import type { World } from "../../core/world/world.ts";
import type { Reader } from "../evaluation.ts";
import { atan2, hypot } from "../../core/math/real.ts";
import { wrap } from "../../core/math/turn.ts";
import { centreReading } from "../../control/observation.ts";
import type { Stances } from "../../skills/framework/profile.ts";
import type { HostedBody } from "../../minds/seat/hosted-body.ts";
import { LANDED, sensedFoe } from "../strike/read.ts";
import { stepBlows } from "../contest.ts";

/** The range, m centre to centre, beyond which a punch is out of reach: where the Warrior mirror's punches fire (0.79 to 0.97). */
export const REACH = .95;

/** How long after a punch's fire the subject is read for being in reach again, s. */
const RETURN = 1.5;

/** How far apart the bout's two sides stand, m, centre to centre on the ground. */
export const apartOf = (duel: Duel): number => {
  const a = duel.duelists.right.body.physical.centre, d = duel.duelists.left.body.physical.centre;
  return hypot(a.x - d.x, a.z - d.z);
};

/** The life the bout's left side lost to the blows of the step just played, a second (`stepBlows`). */
export const struckOf = (built: { readonly duel: Duel; readonly world: World }): number => stepBlows(built, (left) => left.damage > 0 ? left.damage : 0);

/** What a trial came to. */
export type BackStepReading = {
  /** The attacker's straight punches fired at the subject, and of them those that took `LANDED` of its life or more. */
  readonly thrown: number;
  readonly taken: number;
  /** The life those punches took, HP. */
  readonly lost: number;
  /** The punches after which the subject was out of reach (`REACH`) within `RETURN` s of the fire, and of them those after which it was in reach again in that time. */
  readonly left: number;
  readonly back: number;
  readonly down: boolean;
  readonly seconds: number;
  /** Where its protocol records them (`spar`), each sway its Commander ordered and saw through (`Sway`). */
  readonly sways?: readonly Sway[];
};

/**
 * **A sway as a profile's trial records it**: when it was ordered, s; the attacker as the subject
 * sensed it then (its phase, `sensedPhase`; its posture; how far apart the two stood, m; the
 * subject's velocity against the attacker's, `startVelocity`; how each stood, `Stances`); the
 * subject's own action under way then, by its name and phase, where one was (`own`); how
 * long it was ordered, s; the life the subject lost meanwhile, HP; where it left the two (`exit`:
 * their range head to head as it was ordered no more, m, as a strike's trial records it, centre
 * to centre, `apart`, and the attacker's phase as the subject sensed it then, `phase`); and
 * how far each moved along the line between them meanwhile (`moved`); how the subject faced the
 * attacker (`facing`); and whether it went down then or within `SETTLE` s of its end.
 */
export type Sway = {
  readonly at: number;
  readonly phase: string;
  readonly foeAt: { readonly posture: string; readonly apart: number; readonly velocity: readonly [number, number]; readonly stance?: Stances };
  readonly own?: string;
  readonly seconds: number;
  readonly lost: number;
  readonly exit: { readonly range: number; readonly apart: number; readonly phase?: string };
  /** How far each moved along the line between them meanwhile, m: the subject toward the attacker, the attacker away from it. */
  readonly moved?: { readonly own: number; readonly foe: number };
  /**
   * How far the subject faced off the attacker, rad, the way its legs face against the line to the
   * attacker's centre, positive with the attacker to its left: as it was ordered (`start`), as it
   * was ordered no more (`end`), and `SETTLE` s after (`later`); and from the order to the end,
   * how far the subject turned (`turned`) and the line to the attacker swung (`swung`), so that
   * `end` is `start` + `swung` - `turned`: the body's yaw apart from the line's swing; and of the
   * swing, what the subject's own move across made of it, the attacker where it was (`stepped`), the
   * rest the attacker's.
   */
  readonly facing?: { readonly start: number; readonly end: number; readonly later: number; readonly turned: number; readonly swung: number; readonly stepped: number };
  readonly down: boolean;
};

/** How long past a sway's end a fall is still the sway's, s: the catch steps it leaves fell the body within it. */
const SETTLE = .5;

/** A punch as the reader follows it: its effector, when it fired, the life it took, whether the subject has been out of reach and in again since. */
type Punch = { readonly effector: string; readonly fired: number; damage: number; left: boolean; back: boolean };

/**
 * The reader of a trial in which the subject, the bout's left side, meets the right side's straight
 * punches for `seconds` s, or `after` s past the first punch's fire where it is given.
 */
export function readBackStep({ world, duel }: { readonly world: World; readonly duel: Duel }, { seconds, after, sways: recording, chosen }: { readonly seconds: number; readonly after?: number; readonly sways?: boolean; readonly chosen?: boolean }): Reader<BackStepReading> {
  const subject = duel.duelists.left, attacker = duel.duelists.right, foe = attacker.minded.skills;
  if (!foe) throw new Error("the attacker runs no skills");
  const punches: Punch[] = [], seen = new Set<number>(), state = { down: false, heard: 0 };
  /** Each sway seen through (`Sway`), the one under way, and those ended whose `SETTLE` is not over. */
  const sways: Sway[] = [], settling: { sway: Omit<Sway, "down" | "facing">; facing: Omit<NonNullable<Sway["facing"]>, "later"> | null; until: number; down: boolean }[] = [];
  let going: { at: number; phase: string; foeAt: Sway["foeAt"]; own?: string; lost: number; down: boolean; from: Places | null } | null = null;
  /** Where the two stand on the ground now, m, the way the subject's legs face, rad (`LegsReport.heading`, what its strikes' windows read), and the line from it to the attacker; null where the subject has no view or its legs no heading, or it does not see the attacker. */
  type Places = { readonly own: readonly [number, number]; readonly foe: readonly [number, number]; readonly heading: number; readonly line: number };
  const places = (): Places | null => {
    const other = view && subject.senses().others.find((one) => one.id === attacker.id), heading = subject.minded.skills?.report.legs?.heading;
    if (!view || !other || heading === undefined) return null;
    const own = [view.stance.centre.x, view.stance.centre.z] as const;
    return { own, foe: [other.centre.x, other.centre.z], heading, line: atan2(other.centre.x - own[0], other.centre.z - own[1]) };
  };
  /** How the subject faces the attacker from `from` to now (`Sway.facing`, but `later`). */
  const facingFrom = (from: Places | null): Omit<NonNullable<Sway["facing"]>, "later"> | null => {
    const to = places();
    return from && to ? { start: wrap(from.line - from.heading), end: wrap(to.line - to.heading), turned: wrap(to.heading - from.heading), swung: wrap(to.line - from.line),
      stepped: wrap(atan2(from.foe[0] - to.own[0], from.foe[1] - to.own[1]) - from.line) } : null;
  };
  /** How far each moved from `from` to now along the line between them then (`Sway.moved`). */
  const movedFrom = (from: Places | null): Sway["moved"] | null => {
    const to = places();
    if (!from || !to) return null;
    const dx = from.foe[0] - from.own[0], dz = from.foe[1] - from.own[1], length = hypot(dx, dz) || 1, ux = dx / length, uz = dz / length;
    return { own: (to.own[0] - from.own[0]) * ux + (to.own[1] - from.own[1]) * uz, foe: (to.foe[0] - from.foe[0]) * ux + (to.foe[1] - from.foe[1]) * uz };
  };
  const view = "view" in subject.body ? (subject.body as HostedBody).view : null, head = centreReading(subject.built, "head"), theirHead = centreReading(attacker.built, "head");
  /** The attacker as the subject senses it now: its phase, and where it is (`Sway`); null where unseen. */
  const sensed = (): { readonly phase: string; readonly foeAt: Sway["foeAt"] } | null => {
    if (!view) return null;
    head.update();
    const foe = sensedFoe({ spec: subject.built.spec, senses: subject.senses(), head: head.centre, view, at: view.stance.centre, going: view.stance.velocity }, attacker.id);
    return foe.at ? { phase: foe.phase, foeAt: foe.at } : null;
  };
  /** The two heads' range, m, on the ground. */
  const range = (): number => {
    head.update(); theirHead.update();
    return hypot(theirHead.centre.x - head.centre.x, theirHead.centre.z - head.centre.z);
  };
  /** The sways: one begins as the Commander orders it (its task `swaying`) and ends as it stops. */
  const follow = (now: number, lost: number): void => {
    // Ordered by its Commander, or, where `chosen`, taken by its own Mind (its back step's Option).
    const swaying = chosen ? subject.minded.report?.engagement?.phase === "back step" : duel.commanded("left")?.task === "swaying";
    if (going) { going.lost += lost; going.down ||= subject.body.down; }
    for (const one of settling) one.down ||= subject.body.down;
    while (settling.length && settling[0]!.until <= now) {
      const one = settling.shift()!, at = places();
      sways.push({ ...one.sway, ...(one.facing && at ? { facing: { ...one.facing, later: wrap(at.line - at.heading) } } : {}), down: one.down });
    }
    if (going && !swaying) {
      settling.push({ sway: { at: going.at, phase: going.phase, foeAt: going.foeAt, ...(going.own ? { own: going.own } : {}), seconds: now - going.at, lost: going.lost, exit: { range: range(), apart: apartOf(duel), ...((phase) => phase ? { phase } : {})(sensed()?.phase) }, ...((moved) => moved ? { moved } : {})(movedFrom(going.from)) }, facing: facingFrom(going.from), until: now + SETTLE, down: going.down || subject.body.down });
      going = null;
    } else if (!going && swaying) {
      const start = sensed();
      const doing = subject.minded.skills?.report.actions[0];
      if (start) going = { at: now, ...start, ...(doing ? { own: `${doing.action}:${doing.phase}` } : {}), lost: 0, down: subject.body.down, from: places() };
    }
  };
  return {
    afterStep() {
      const now = world.time;
      let lost = 0;
      for (const action of foe.report.actions) {
        if (action.action !== "straight-punch" || action.phase !== "commit" || seen.has(action.id)) continue;
        seen.add(action.id);
        punches.push({ effector: action.effector, fired: now, damage: 0, left: false, back: false });
      }
      const gap = apartOf(duel);
      for (const punch of punches) {
        if (now > punch.fired + RETURN) continue;
        if (gap > REACH) punch.left = true;
        else if (punch.left) punch.back = true;
      }
      // Each blow on the subject is the last punch's that fired with that hand.
      for (; state.heard < duel.blows.length; state.heard++) {
        const blow = duel.blows[state.heard]!, by = blow.sides.find((side) => side.fighter === "right"), on = blow.sides.find((side) => side.fighter === "left");
        if (!by || !on || !(on.damage > 0)) continue;
        lost += on.damage;
        for (let k = punches.length - 1; k >= 0; k--) if (punches[k]!.effector === by.segment) { punches[k]!.damage += on.damage; break; }
      }
      state.down ||= subject.body.down;
      if (recording) follow(now, lost);
    },
    get ended() { return world.time >= seconds || after !== undefined && punches.length > 0 && world.time >= punches[0]!.fired + after; },
    reading() {
      return { thrown: punches.length, taken: punches.filter((one) => one.damage >= LANDED).length, lost: punches.reduce((sum, one) => sum + one.damage, 0),
        left: punches.filter((one) => one.left).length, back: punches.filter((one) => one.back).length, down: state.down, seconds: world.time, ...(recording ? { sways } : {}) };
    },
  };
}
