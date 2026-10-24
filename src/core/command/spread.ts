import { atan2, cos, sin } from "../math/real.ts";
import type { GroundPoint } from "../mind/movement.ts";
import { distance } from "./goals.ts";
import type { SensedBody } from "./team.ts";

/**
 * How attackers are spread over foes (`spread`), m: what each attacker already given a foe adds to
 * its cost for the next (`load`), and what the foe an attacker fights now takes off its own
 * (`keep`), so that a choice holds from one look to the next.
 */
const SPREAD = Object.freeze({ load: 3, keep: 1 });

/** An attacker to be given a foe: who it is, where it stands, the foe it fights now, and the foes it sees. */
export interface Attacker {
  readonly id: string;
  readonly at: GroundPoint;
  readonly current: string | null;
  readonly seen: readonly SensedBody[];
}

/**
 * **Each attacker's foe, spread over the foes**: in order of how near each stands to the nearest
 * foe it sees (the team's order between equals), each takes the foe it sees that costs it least:
 * its distance, `SPREAD.load` more for each attacker already given that foe, and `SPREAD.keep`
 * less for the one it fights now. An attacker that sees none is given none.
 */
export function spread(attackers: readonly Attacker[]): Map<string, SensedBody> {
  const nearest = (attacker: Attacker) => attacker.seen.reduce((best, foe) => Math.min(best, distance(attacker.at, foe.at)), Infinity);
  const order = attackers.map((attacker, i) => ({ attacker, i, near: nearest(attacker) })).sort((a, b) => a.near - b.near || a.i - b.i);
  const load = new Map<string, number>(), given = new Map<string, SensedBody>();
  for (const { attacker } of order) {
    let chosen: SensedBody | null = null, best = Infinity;
    for (const foe of attacker.seen) {
      const cost = distance(attacker.at, foe.at) + SPREAD.load * (load.get(foe.id) ?? 0) - (foe.id === attacker.current ? SPREAD.keep : 0);
      if (cost < best) { best = cost; chosen = foe; }
    }
    if (!chosen) continue;
    given.set(attacker.id, chosen);
    load.set(chosen.id, (load.get(chosen.id) ?? 0) + 1);
  }
  return given;
}

/** The bearing of `to` from `from`, radians from +z toward +x. */
export const bearingOf = (from: GroundPoint, to: GroundPoint): number => atan2(to.x - from.x, to.z - from.z);

/** The point `metres` from `at` on `bearing`, radians from +z toward +x. */
/**
 * **The bearings round a foe at `at`** given to the attackers about it, radians from +z toward +x:
 * evenly spaced, in the order the attackers stand round it, and turned as a whole as little as it
 * can be from where they stand (the circular mean of each one's offset from its share). One alone
 * is given none: it goes straight in.
 */
export function bearings(at: GroundPoint, attackers: readonly { readonly id: string; readonly at: GroundPoint }[]): Map<string, number> {
  const given = new Map<string, number>(), n = attackers.length;
  if (n < 2) return given;
  const round = attackers.map((attacker, i) => ({ id: attacker.id, i, bearing: bearingOf(at, attacker.at) })).sort((a, b) => a.bearing - b.bearing || a.i - b.i);
  const share = 2 * Math.PI / n;
  let s = 0, c = 0;
  round.forEach(({ bearing }, k) => { s += sin(bearing - k * share); c += cos(bearing - k * share); });
  const base = atan2(s, c);
  round.forEach(({ id }, k) => given.set(id, base + k * share));
  return given;
}
