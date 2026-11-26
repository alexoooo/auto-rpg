/**
 * **How the back step's evaluation reads a trial**: each straight punch the attacker throws at the
 * subject, whether it took a landed blow's life, whether the subject was out of its reach after it
 * and in again in time, and whether the subject went down.
 */
import type { Duel } from "../../game/arena/duel.ts";
import type { World } from "../../core/world/world.ts";
import type { Reader } from "../evaluation.ts";
import { atan2, hypot } from "../../core/math/real.ts";
import { dataOf } from "../../core/data/store.ts";
import { measuredReach } from "../../minds/option/predictions/exchange/model.ts";
import { wrap } from "../../core/math/turn.ts";
import { centreReading } from "../../control/observation.ts";
import type { Stances } from "../../skills/framework/profile/profile.ts";
import type { CommandedBody } from "../../minds/seat/hosted-body.ts";
import { LANDED, sensedFoe } from "../strike/read.ts";
import { stepBlows } from "../contest.ts";

/** What `inReach` keeps of a bout: the attacker's reach of the subject by its phase, and the subject's head. */
const REACHES = new WeakMap<Duel, { readonly by: Map<string, number>; readonly head: ReturnType<typeof centreReading> }>();

/**
 * **Whether the bout's left side, the subject, stands within its attacker's reach**: as near as
 * its attacker's strikes reach it in the phase it senses the attacker in (`measuredReach`, as a
 * Mind reads a foe's reach), centre to centre; a subject with no view reads it clear.
 */
export function inReach(duel: Duel): boolean {
  const subject = duel.duelists.left, attacker = duel.duelists.right;
  let kept = REACHES.get(duel);
  if (!kept) REACHES.set(duel, kept = { by: new Map(), head: centreReading(subject.built, "head") });
  const view = "view" in subject.body ? (subject.body as CommandedBody).view : null;
  if (view) kept.head.update();
  const phase = view ? sensedFoe({ spec: subject.built.spec, senses: subject.senses(), head: kept.head.centre, view, at: view.stance.centre, going: view.stance.velocity }, attacker.id).phase : "clear";
  let reach = kept.by.get(phase);
  if (reach === undefined) kept.by.set(phase, reach = measuredReach(dataOf("strike-profiles"), attacker.built.spec, subject.built.spec, phase));
  return apartOf(duel) <= reach;
}

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
  /** The punches after which the subject was out of reach (`inReach`) within `RETURN` s of the fire, and of them those after which it was in reach again in that time. */
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
 * to centre, `apart`, and the attacker's phase as the subject sensed it then, `phase`); how the
 * subject faced the attacker (`facing`); and whether it went down then or within `SETTLE` s of
 * its end.
 */
export type Sway = {
  readonly at: number;
  readonly phase: string;
  readonly foeAt: { readonly posture: string; readonly apart: number; readonly velocity: readonly [number, number]; readonly stance?: Stances };
  readonly own?: string;
  readonly seconds: number;
  readonly lost: number;
  readonly exit: { readonly range: number; readonly apart: number; readonly phase?: string };
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
 * **The attacker's straight punches as a trial follows them**: each as it is committed, whether the
 * subject was out of reach within `RETURN` s of its fire and in again (`inReach`), and the life the
 * blows on the subject took, each the last punch's that fired with that hand. `afterStep` returns
 * the life the step's blows took, HP.
 */
function followPunches(duel: Duel): { readonly punches: readonly Punch[]; afterStep(now: number): number } {
  const foe = duel.duelists.right.minded.skills;
  if (!foe) throw new Error("the attacker runs no skills");
  const punches: Punch[] = [], seen = new Set<number>();
  let heard = 0;
  return {
    punches,
    afterStep(now) {
      for (const action of foe.report.actions) {
        if (action.action !== "straight-punch" || action.phase !== "commit" || seen.has(action.id)) continue;
        seen.add(action.id);
        punches.push({ effector: action.effector, fired: now, damage: 0, left: false, back: false });
      }
      const within = inReach(duel);
      for (const punch of punches) {
        if (now > punch.fired + RETURN) continue;
        if (!within) punch.left = true;
        else if (punch.left) punch.back = true;
      }
      let lost = 0;
      for (; heard < duel.blows.length; heard++) {
        const blow = duel.blows[heard]!, by = blow.sides.find((side) => side.fighter === "right"), on = blow.sides.find((side) => side.fighter === "left");
        if (!by || !on || !(on.damage > 0)) continue;
        lost += on.damage;
        for (let k = punches.length - 1; k >= 0; k--) if (punches[k]!.effector === by.segment) { punches[k]!.damage += on.damage; break; }
      }
      return lost;
    },
  };
}

/** Where the two stand on the ground, m, the way the subject's legs face, rad (`LegsReport.heading`, what its strikes' windows read), and the line from it to the attacker. */
type Places = { readonly own: readonly [number, number]; readonly foe: readonly [number, number]; readonly heading: number; readonly line: number };

/** How the subject faced the attacker over a sway, but `SETTLE` s after it (`Sway.facing`). */
type Facing = Omit<NonNullable<Sway["facing"]>, "later">;

/** A sway under way: as it was ordered (`Sway`), the life lost and whether the subject went down since, and where the two stood then. */
type Going = Pick<Sway, "at" | "phase" | "foeAt" | "own"> & { lost: number; down: boolean; readonly from: Places | null };

/** A sway ended whose `SETTLE` is not over: what it came to so far, until when a fall is still its own. */
type Settling = { readonly sway: Omit<Sway, "down" | "facing">; readonly facing: Facing | null; readonly until: number; down: boolean };

/**
 * **The subject's sways as a trial records them** (`Sway`): one begins as its Commander orders it
 * (its task `swaying`), or, where `chosen`, as its own Mind takes its back step (its Option's
 * phase), and ends as that stops; each is kept once `SETTLE` s past its end. `afterStep` is given
 * the step's time and the life its blows took, HP.
 */
function followSways(duel: Duel, { chosen }: { readonly chosen: boolean }): { readonly sways: readonly Sway[]; afterStep(now: number, lost: number): void } {
  const subject = duel.duelists.left, attacker = duel.duelists.right;
  const view = "view" in subject.body ? (subject.body as CommandedBody).view : null, head = centreReading(subject.built, "head"), theirHead = centreReading(attacker.built, "head");
  const sways: Sway[] = [], settling: Settling[] = [];
  let going: Going | null = null;
  /** Where the two stand now (`Places`); null where the subject has no view or its legs no heading, or it does not see the attacker. */
  const places = (): Places | null => {
    const other = view && subject.senses().others.find((one) => one.id === attacker.id), heading = subject.minded.skills?.report.legs?.heading;
    if (!view || !other || heading === undefined) return null;
    const own = [view.stance.centre.x, view.stance.centre.z] as const;
    return { own, foe: [other.centre.x, other.centre.z], heading, line: atan2(other.centre.x - own[0], other.centre.z - own[1]) };
  };
  /** How the subject faces the attacker from `from` to now (`Facing`). */
  const facingFrom = (from: Places | null): Facing | null => {
    const to = places();
    return from && to ? { start: wrap(from.line - from.heading), end: wrap(to.line - to.heading), turned: wrap(to.heading - from.heading), swung: wrap(to.line - from.line),
      stepped: wrap(atan2(from.foe[0] - to.own[0], from.foe[1] - to.own[1]) - from.line) } : null;
  };
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
  /** The sway `sway` as it ends at `now`: what it came to, settling until `SETTLE` s on. */
  const ended = (sway: Going, now: number): Settling => {
    const exit = { range: range(), apart: apartOf(duel) }, phase = sensed()?.phase;
    return { sway: { at: sway.at, phase: sway.phase, foeAt: sway.foeAt, ...sway.own ? { own: sway.own } : {}, seconds: now - sway.at, lost: sway.lost, exit: { ...exit, ...phase ? { phase } : {} } },
      facing: facingFrom(sway.from), until: now + SETTLE, down: sway.down || subject.body.down };
  };
  return {
    sways,
    afterStep(now, lost) {
      const swaying = chosen ? subject.minded.report?.engagement?.phase === "back step" : duel.commanded("left")?.task === "swaying";
      if (going) { going.lost += lost; going.down ||= subject.body.down; }
      for (const one of settling) one.down ||= subject.body.down;
      while (settling.length && settling[0]!.until <= now) {
        const one = settling.shift()!, at = places();
        sways.push({ ...one.sway, ...(one.facing && at ? { facing: { ...one.facing, later: wrap(at.line - at.heading) } } : {}), down: one.down });
      }
      if (going && !swaying) {
        settling.push(ended(going, now));
        going = null;
      } else if (!going && swaying) {
        const start = sensed(), doing = subject.minded.skills?.report.actions[0];
        if (start) going = { at: now, ...start, ...(doing ? { own: `${doing.action}:${doing.phase}` } : {}), lost: 0, down: subject.body.down, from: places() };
      }
    },
  };
}

/**
 * **What a trial's reader reads**: the punches for `seconds` s, or `after` s past the first punch's
 * fire where it is given; each sway (`sways`, `BackStepReading.sways`), and whether those are
 * taken by the subject's own Mind (`chosen`, its back step's Option) or ordered by its Commander.
 */
export type BackStepReads = { readonly seconds: number; readonly after?: number; readonly sways: boolean; readonly chosen: boolean };

/** The reader of a trial in which the subject, the bout's left side, meets the right side's straight punches (`followPunches`), its sways followed where `reads` says (`followSways`). */
export function readBackStep({ world, duel }: { readonly world: World; readonly duel: Duel }, { seconds, after, sways: recording, chosen }: BackStepReads): Reader<BackStepReading> {
  const { punches, afterStep: struck } = followPunches(duel), swaying = recording ? followSways(duel, { chosen }) : null;
  let down = false;
  return {
    afterStep() {
      const now = world.time, lost = struck(now);
      down ||= duel.duelists.left.body.down;
      swaying?.afterStep(now, lost);
    },
    get ended() { return world.time >= seconds || after !== undefined && punches.length > 0 && world.time >= punches[0]!.fired + after; },
    reading() {
      return { thrown: punches.length, taken: punches.filter((one) => one.damage >= LANDED).length, lost: punches.reduce((sum, one) => sum + one.damage, 0),
        left: punches.filter((one) => one.left).length, back: punches.filter((one) => one.back).length, down, seconds: world.time, ...swaying ? { sways: swaying.sways } : {} };
    },
  };
}
