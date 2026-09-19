import { blankIntent } from "../policies.ts";
import type { Intent } from "../mind.ts";
import type { Golem } from "../golem/golem.ts";

export const MOTION_SECONDS = 16;
/** A replayable demonstration through the player's command surface, never a pose animation. */
export function proofIntent(time: number): Intent {
  const t = Math.min(time, MOTION_SECONDS);
  const intent = blankIntent();
  intent.secondary.pointerY = .32;
  intent.secondary.pointerX = -.15;
  intent.secondary.reach = .15;
  intent.secondary.guard = true;
  intent.primary.pointerY = -.10;
  intent.primary.pointerX = .24;
  intent.primary.reach = .22;
  if (t >= 4 && t < 7) {
    const sweep = Math.sin((t-4)/3*Math.PI*2);
    intent.primary.pointerX = sweep*.62;
    intent.primary.pointerY = .12 + Math.cos((t-4)/3*Math.PI*2)*.22;
    intent.primary.reach = .35;
    intent.posture.trunkTwist = sweep*.12;
  }
  if (t >= 8 && t < 9) {
    intent.primary.reach = .22 + Math.sin((t-8)*Math.PI)*.65;
    intent.primary.thrust = true;
  }
  if (t >= 10 && t < 11.5) intent.forward = .23*Math.sin((t-10)/1.5*Math.PI);
  if (t >= 12 && t < 13.5) intent.forward = -.23*Math.sin((t-12)/1.5*Math.PI);
  return intent;
}

export function motionLabel(time: number): string {
  if (time >= MOTION_SECONDS) return "Guard · restart to replay";
  const t = time;
  return t < 2 ? "Settling" : t < 4 ? "Guard" : t < 7 ? "Blade sweep" : t < 8 ? "Recover"
    : t < 9 ? "Thrust" : t < 10 ? "Recover" : t < 11.5 ? "Advance" : t < 12 ? "Hold"
    : t < 13.5 ? "Return" : "Guard";
}

/** The production solo control order, also exercised by the existing golem arena harness. */
export function stepProofGolem(golem: Golem, dt: number, time: number): void {
  golem.observe(golem, time);
  golem.locomotion.beginControlStep();
  golem.control.driver.step(dt);
  const proposal = golem.locomotion.proposal(dt);
  const fraction = golem.locomotion.registry.allowedFraction(
    proposal.prior, proposal.next, proposal.footprint, proposal.ownerPartIds);
  golem.locomotion.commitPhysical(proposal, {
    x: proposal.displacement.x*fraction, z: proposal.displacement.z*fraction,
    yaw: proposal.displacement.yaw,
  }, dt);
  golem.afterLocomotion(dt);
}
