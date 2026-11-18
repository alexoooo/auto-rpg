/**
 * **A strike's reading as a profile's trial** (`Trial`): one row, whether a drill's sparring wrote it
 * or a bout (`readFought`).
 */
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { lifeFactor } from "../../combat/pool.ts";
import type { Rulebook } from "../../combat/rulebook.ts";
import { startHeld, startLevels, struckNumbers, trialExit, type Trial } from "../../skills/framework/profile.ts";
import type { StrikeReading } from "./read.ts";

const round = (x: number): number => Number(x.toFixed(4));

/**
 * **The trial `r` was**, of a strike by a body of `spec` at one of `struck` under `rules`, its world
 * at `hz`; null where its start was not sensed or its action never began. Its start is where the
 * striker sensed the target as it began (`StrikeReading.foeAt`, `foePhase`, `inWindow`) and the
 * levels each body was built at (`startLevels`), what each held (`startHeld`) and the body struck (`struckNumbers`). A let-go trial (`letGo`) prices letting go alone,
 * and is null where its strike was not let go. Else what it brought: whether it landed, the life
 * the rules take from the target for what it dealt (`lifeFactor`), the damage the striker took, the
 * seconds its action ran, how long until its limb was back at its guard, whether it ended down, and
 * where it left the two (`trialExit`).
 */
export function strikeTrial(r: StrikeReading, spec: BodySpec, struck: BodySpec, rules: Rulebook, hz: number, letGo = false): Trial | null {
  if (r.foePhase === null || r.foeAt === null || r.began === null) return null;
  const posture = r.foeAt.posture ?? "standing", levels = startLevels(spec, struck), held = startHeld(spec, struck);
  const start = { range: round(r.foeAt.apart), phase: r.foePhase, ...(posture === "standing" ? {} : { postures: { own: "standing", target: posture } }),
    ...(r.foeAt.velocity ? { velocity: r.foeAt.velocity.map(round) as [number, number] } : {}), ...(r.inWindow ? { window: r.inWindow.map(round) as [number, number] } : {}),
    ...(r.foeAt.stance ? { stance: r.foeAt.stance } : {}), ...(levels ? { levels } : {}), ...(held ? { held } : {}), struck: struckNumbers(struck) };
  if (letGo) {
    // Past its point of no return, a strike is not let go: such a trial prices nothing.
    return r.letGo ? { start, done: false, dealt: 0, taken: round(r.taken ?? 0), seconds: round((r.ended ?? r.seconds) - r.began), recovers: null, down: r.down,
      letGo: { progress: round(Math.round((r.letGo.at - r.began) * hz) / hz), seconds: round((r.letGo.again ?? r.seconds) - r.letGo.at), taken: round(r.letGo.opening) } } : null;
  }
  let dealt = 0;
  for (const [on, damage] of Object.entries(r.dealt)) dealt += damage * lifeFactor(rules, struck, on);
  return { start, done: r.outcome === "landed", dealt: round(dealt), taken: round(r.taken ?? 0), seconds: round((r.ended ?? r.seconds) - r.began),
    recovers: r.recovers === undefined || r.recovers === null ? null : round(r.recovers), down: r.down, ...(r.exit ? { exit: trialExit(r.exit, r.foeAt.apart) } : {}) };
}
