/**
 * **A profile read for bodies other than those it measured**: a striker of another stature
 * (`acrossBodies`), a body struck of other numbers (`profileAgainst`), and a body holding past
 * what its trials held (`heldPast`).
 */
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { hypot } from "../../../core/math/real.ts";
import { remembered } from "../../../core/remembered.ts";
import type { ItemNumbers, Profile, Start, StruckNumbers } from "./profile.ts";
import { HELD_SPANS, STRUCK_SPANS } from "./nearest.ts";
import { heldNumbers, struckNumbers } from "./numbers.ts";
import type { ProfileReading } from "./reading.ts";
import type { Gap } from "./source.ts";

/** The held numbers, and the extent of a segment no trial held at. */
const HELD_KEYS = ["mass", "reach"] as const, NONE_HELD = [0, 0] as const;

/** The least and most of each held number `trials` record of one body, by segment; a trial holding nothing there at none. */
type HeldExtent = ReadonlyMap<string, Readonly<Record<keyof ItemNumbers, readonly [number, number]>>>;

/** **What `trials` held of the body `of`** (`HeldExtent`): of each segment any of them records holding, the least and the most of its mass and its reach. Found once a trial list and a body. */
const heldExtent = remembered((trials: readonly { readonly start: Start }[]) => remembered((of: "own" | "target"): HeldExtent => {
  const segments = new Set(trials.flatMap((trial) => Object.keys(trial.start.held?.[of] ?? {})));
  return new Map([...segments].sort().map((segment) => {
    const span = (key: keyof ItemNumbers): readonly [number, number] => {
      let least = Infinity, most = -Infinity;
      for (const trial of trials) { const v = trial.start.held?.[of]?.[segment]?.[key] ?? 0; least = Math.min(least, v); most = Math.max(most, v); }
      return [least, most];
    };
    return [segment, { mass: span("mass"), reach: span("reach") }] as const;
  }));
}));

/**
 * **Where a body of `spec` holds past what `trials` held**, as the body whose skill it is (`own`)
 * or the body struck (`target`): the first of `segments` (every one it or a trial holds at, where
 * none are given) whose mass or reach lies beyond the trials' by over half its span
 * (`HELD_SPANS`), as a gap (`Gap`) from the nearer end of what the trials held; null where none
 * does, or there are no trials. A reading takes the trials begun nearest what each body holds
 * (`bodyNumbers`); past them it reads what nothing measured, so a foe's limb is read throwing a
 * strike only within them (`profilesOn`) and a body's own reading says it is read past them
 * (`ProfileReading.source`).
 */
export function heldPast(trials: readonly { readonly start: Start }[], of: "own" | "target", spec: Pick<BodySpec, "held">, segments?: readonly string[]): Gap | null {
  if (!trials.length) return null;
  const extent = heldExtent(trials)(of), mine = heldNumbers(spec);
  for (const segment of segments ?? [...new Set([...extent.keys(), ...Object.keys(mine ?? {})])].sort()) for (const key of HELD_KEYS) {
    const now = mine?.[segment]?.[key] ?? 0, [least, most] = extent.get(segment)?.[key] ?? NONE_HELD;
    if (now < least - HELD_SPANS[key] / 2 || now > most + HELD_SPANS[key] / 2) {
      const nearer = now < least ? least : most;
      return { number: `${key} held at ${segment}, ${key === "mass" ? "kg" : "m"}`, measured: nearer, asked: now, spans: Math.abs(now - nearer) / HELD_SPANS[key] };
    }
  }
  return null;
}

/**
 * **`reading` of `profile`, for a body of `striker`**: as it is where the profile was measured on
 * that body, else read at ranges scaled by the two bodies' statures (`Measured.stature`,
 * `BodySpec.stature`), what the measured body did at as far for its height. One number of a body,
 * so a body measured on none is fought with by another's trials, coarsely.
 */
export function acrossBodies(profile: Profile, striker: BodySpec, reading: ProfileReading): ProfileReading {
  const from = profile.measured.stature, to = striker.stature.value;
  if (profile.measured.body === striker.model || !(to > 0) || from === to) return reading;
  const ratio = from / to, at = <A extends { readonly range: number }>(asked: A): A => ({ ...asked, range: asked.range * ratio });
  return {
    profile: reading.profile,
    reach: (phase) => reading.reach(phase) / ratio,
    expect: (asked, struck) => reading.expect(at(asked), struck),
    rate: (asked, struck) => reading.rate(at(asked), struck),
    peak: (phase, struck) => reading.peak(phase, struck), fastest: (phase) => reading.fastest(phase), source: (struck) => reading.source(struck),
  };
}

/** **The bodies `profile`'s trials struck** (`Start.struck`), told apart by stature and mass, in the order its trials first struck each; found once a profile. */
const struckBodies = remembered((profile: Profile): readonly StruckNumbers[] => {
  const seen = new Map<string, StruckNumbers>();
  for (const trial of profile.trials) { const at = trial.start.struck; if (at && !seen.has(`${at.stature} ${at.mass}`)) seen.set(`${at.stature} ${at.mass}`, at); }
  return [...seen.values()];
});

/** **`profile`'s trials struck at `body`'s stature and mass**, made once a profile and a body it struck (`struckBodies`), so a reading of them is made once. */
const struckView = remembered((profile: Profile) => remembered((body: StruckNumbers): Profile =>
  Object.freeze({ ...profile, trials: profile.trials.filter((trial) => trial.start.struck?.stature === body.stature && trial.start.struck.mass === body.mass) })));

/**
 * **`profile` read against a body of `struck`**: its trials struck at the body it measured
 * nearest `struck`'s stature and mass (`STRUCK_SPANS`; of bodies as near, the first it struck),
 * which is `struck`'s own where it was measured; the profile itself where its trials struck one
 * body or record none.
 */
function struckAt(profile: Profile, struck: BodySpec): Profile {
  const bodies = struckBodies(profile);
  if (bodies.length < 2) return profile;
  const now = struckNumbers(struck);
  const apart = (at: StruckNumbers): number => hypot((at.stature - now.stature) / STRUCK_SPANS.stature, (at.mass - now.mass) / STRUCK_SPANS.mass);
  return struckView(profile)(bodies.reduce((best, at) => apart(at) < apart(best) ? at : best));
}

/**
 * **The profile among one skill's `profiles` that a body of `struck` is read by**: the first
 * whose trials struck a body of its numbers, else the first; read at the body it measured nearest
 * `struck` (`struckAt`), which its reading's source says where that is not `struck`'s own (`ProfileReading.source`). A
 * skill with no foe has one, read with none struck. Null with none.
 */
export function profileAgainst(profiles: readonly Profile[], struck: BodySpec | null): Profile | null {
  if (!struck) return profiles[0] ?? null;
  const now = struckNumbers(struck);
  const profile = profiles.find((one) => struckBodies(one).some((at) => at.stature === now.stature && at.mass === now.mass)) ?? profiles[0];
  return profile ? struckAt(profile, struck) : null;
}
