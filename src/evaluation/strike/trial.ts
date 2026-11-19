/**
 * **A strike's reading as a profile's trial** (`Trial`): one row, whether a drill's sparring wrote it
 * or a bout (`readFought`).
 */
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { lifeFactor } from "../../combat/pool.ts";
import type { Rulebook } from "../../combat/rulebook.ts";
import { startHeld, struckNumbers, trialExit } from "../../skills/framework/profile/numbers.ts";
import { type Trial } from "../../skills/framework/profile/profile.ts";
import type { StrikeReading } from "./read.ts";

const round = (x: number): number => Number(x.toFixed(4));

/** **The bodies a strike's trial was between**: the striker's (`spec`) and the struck one's (`struck`). */
type Bodies = { readonly spec: BodySpec; readonly struck: BodySpec };

/**
 * **Where the trial `r` started**, the strike by a body of `spec` at one of `struck`: where the
 * striker sensed the target as it began (`StrikeReading.foeAt`, `foePhase`, `inWindow`), what each
 * held (`startHeld`) and the body struck (`struckNumbers`); null where its start was not sensed or
 * its action never began.
 */
function trialStart(r: StrikeReading, { spec, struck }: Bodies): { readonly start: Trial["start"]; readonly began: number; readonly apart: number } | null {
  if (r.foePhase === null || r.foeAt === null || r.began === null) return null;
  const posture = r.foeAt.posture ?? "standing", held = startHeld(spec, struck);
  const start = { range: round(r.foeAt.apart), phase: r.foePhase, ...(posture === "standing" ? {} : { postures: { own: "standing", target: posture } }),
    ...(r.foeAt.velocity ? { velocity: r.foeAt.velocity.map(round) as [number, number] } : {}), ...(r.inWindow ? { window: r.inWindow.map(round) as [number, number] } : {}),
    ...(r.foeAt.stance ? { stance: r.foeAt.stance } : {}), ...(held ? { held } : {}), struck: struckNumbers(struck) };
  return { start, began: r.began, apart: r.foeAt.apart };
}

/**
 * **The trial `r` was**, of a strike by a body of `spec` at one of `struck` under `rules`, from
 * where it started (`trialStart`; null where it has none): whether it landed, the life the rules
 * take from the target for what it dealt (`lifeFactor`), the damage the striker took, the seconds
 * its action ran, how long until its limb was back at its guard, whether it ended down, and where
 * it left the two (`trialExit`).
 */
export function strikeTrial(r: StrikeReading, { spec, struck, rules }: Bodies & { readonly rules: Rulebook }): Trial | null {
  const started = trialStart(r, { spec, struck });
  if (!started) return null;
  let dealt = 0;
  for (const [on, damage] of Object.entries(r.dealt)) dealt += damage * lifeFactor(rules, struck, on);
  return { start: started.start, done: r.outcome === "landed", dealt: round(dealt), taken: round(r.taken ?? 0), seconds: round((r.ended ?? r.seconds) - started.began),
    recovers: r.recovers === undefined || r.recovers === null ? null : round(r.recovers), down: r.down, ...(r.exit ? { exit: trialExit(r.exit, started.apart) } : {}) };
}

/**
 * **The let-go trial `r` was**, of a strike by a body of `spec` at one of `struck`, its world at
 * `hz`, from where it started (`trialStart`): it prices letting go alone (`Trial.letGo`), so null
 * where its strike was not let go, or has no start.
 */
export function letGoTrial(r: StrikeReading, { spec, struck, hz }: Bodies & { readonly hz: number }): Trial | null {
  const started = trialStart(r, { spec, struck });
  // Past its point of no return, a strike is not let go: such a trial prices nothing.
  if (!started || !r.letGo) return null;
  return { start: started.start, done: false, dealt: 0, taken: round(r.taken ?? 0), seconds: round((r.ended ?? r.seconds) - started.began), recovers: null, down: r.down,
    letGo: { progress: round(Math.round((r.letGo.at - started.began) * hz) / hz), seconds: round((r.letGo.again ?? r.seconds) - r.letGo.at), taken: round(r.letGo.opening) } };
}
