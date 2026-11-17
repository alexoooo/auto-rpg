/**
 * **How the back step's evaluation reads a trial**: each straight punch the attacker throws at the
 * subject, whether it took a landed blow's life, whether the subject was out of its reach after it
 * and in again in time, and whether the subject went down; the measures of the back step's drill
 * (`research/skills/locomotion/back-step-drill.mjs`).
 */
import type { Duel } from "../../game/arena/duel.ts";
import type { World } from "../../core/world/world.ts";
import type { Reader } from "../evaluation.ts";
import { hypot } from "../../core/math/real.ts";
import { sensedPhase, sensedPosture } from "../../skills/perception/threat.ts";
import { centreReading } from "../../control/observation.ts";
import { ownStance, sensedStance } from "../../skills/perception/stance-numbers.ts";
import { startVelocity, type Stances } from "../../skills/framework/profile.ts";
import { Vector3 } from "../../core/math/vector.ts";
import type { HostedBody } from "../../minds/seat/hosted-body.ts";

/** A landed blow takes at least this much life, HP (`strike-bouts.mjs`). */
export const LANDED = .5;

/** The range, m centre to centre, beyond which a punch is out of reach: where the Warrior mirror's punches fire (0.79 to 0.97). */
export const REACH = .95;

/** How long after a punch's fire the subject is read for being in reach again, s. */
const RETURN = 1.5;

/** How far apart the bout's two sides stand, m, centre to centre on the ground. */
export const apartOf = (duel: Duel): number => {
  const a = duel.duelists.right.body.physical.centre, d = duel.duelists.left.body.physical.centre;
  return hypot(a.x - d.x, a.z - d.z);
};

/** The life the bout's left side lost to the blows of the step just played, over the step's seconds: summed over a decision, each blow paid once as it lands. */
export function struckOf({ duel, world }: { readonly duel: Duel; readonly world: World }): number {
  const blows = duel.blows, now = world.time, dt = 1 / world.hz;
  let lost = 0;
  for (let k = blows.length - 1; k >= 0 && blows[k]!.time > now - dt / 2; k--) {
    const on = blows[k]!.sides.find((side) => side.fighter === "left");
    if (on && on.damage > 0 && blows[k]!.sides.some((side) => side.fighter === "right")) lost += on.damage;
  }
  return lost / dt;
}

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
 * their range head to head as it was ordered no more, m, as a strike's trial records it, and centre
 * to centre, `apart`); and
 * whether it went down then or within `SETTLE` s of its end.
 */
export type Sway = {
  readonly at: number;
  readonly phase: string;
  readonly foeAt: { readonly posture: string; readonly apart: number; readonly velocity: readonly [number, number]; readonly stance?: Stances };
  readonly own?: string;
  readonly seconds: number;
  readonly lost: number;
  readonly exit: { readonly range: number; readonly apart: number };
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
  const sways: Sway[] = [], settling: { sway: Omit<Sway, "down">; until: number; down: boolean }[] = [];
  let going: { at: number; phase: string; foeAt: Sway["foeAt"]; own?: string; lost: number; down: boolean } | null = null;
  const view = "view" in subject.body ? (subject.body as HostedBody).view : null, head = centreReading(subject.built, "head"), theirHead = centreReading(attacker.built, "head"), centre = new Vector3();
  /** The attacker as the subject senses it now: its phase, and where it is (`Sway`); null where unseen. */
  const sensed = (): { readonly phase: string; readonly foeAt: Sway["foeAt"] } | null => {
    if (!view) return null;
    head.update();
    const at = view.stance.centre, senses = subject.senses(), other = senses.others.find((one) => one.id === attacker.id);
    if (!other) return null;
    const phase = sensedPhase({ senses, head: head.centre, stance: { centre: centre.set(at.x, at.y, at.z) } }, attacker.id);
    const dx = other.centre.x - at.x, dz = other.centre.z - at.z, own = view.stance.velocity;
    const mine = ownStance(subject.built.spec, view, other.centre), theirs = sensedStance(other, at);
    const stance = mine || theirs ? { ...(mine ? { own: mine } : {}), ...(theirs ? { target: theirs } : {}) } : null;
    return { phase, foeAt: { posture: sensedPosture(other), apart: Math.sqrt(dx * dx + dz * dz),
      velocity: startVelocity({ x: dx, z: dz }, { x: own.x - other.velocity.x, z: own.z - other.velocity.z }), ...(stance ? { stance } : {}) } };
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
    while (settling.length && settling[0]!.until <= now) { const one = settling.shift()!; sways.push({ ...one.sway, down: one.down }); }
    if (going && !swaying) {
      settling.push({ sway: { at: going.at, phase: going.phase, foeAt: going.foeAt, ...(going.own ? { own: going.own } : {}), seconds: now - going.at, lost: going.lost, exit: { range: range(), apart: apartOf(duel) } }, until: now + SETTLE, down: going.down || subject.body.down });
      going = null;
    } else if (!going && swaying) {
      const start = sensed();
      const doing = subject.minded.skills?.report.actions[0];
      if (start) going = { at: now, ...start, ...(doing ? { own: `${doing.action}:${doing.phase}` } : {}), lost: 0, down: subject.body.down };
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
