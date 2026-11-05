import type { BuiltBody } from "./build/build-body.ts";
import { checkHandPose, handAt, handCode, handPoseAt, handPoseCode } from "./build/hand-poses.ts";
import type { HandPose } from "./spec/body.ts";
import { rootSegment } from "./read-body.ts";
import { createAssist, type AssistCeiling } from "./assist.ts";
import { delayLine, heldSteps } from "../world/command-delay.ts";

/** The physical assist and hand requests waiting for their command's world step. */
export function commandPipeline(built: BuiltBody, delay: number, ceiling: AssistCeiling) {
  const help = createAssist(built, rootSegment(built), ceiling, heldSteps(delay));
  const line = delayLine(heldSteps(delay));
  const posed = { asked: [] as number[], sent: Array.from({ length: line.size }, () => [] as number[]), line: line.state };
  return {
    help, posed,
    request(hand: "left" | "right", pose: HandPose): void {
      checkHandPose(built.handPoses.model, hand, pose);
      posed.asked.push(handCode(hand), handPoseCode(pose));
    },
    /** Apply this step's assist and carry the hand requests through the same delay. */
    settle(): void {
      help.apply();
      const slot = posed.sent[line.written()]!;
      slot.length = 0;
      for (let i = 0; i < posed.asked.length; i++) slot.push(posed.asked[i]!);
      posed.asked.length = 0;
      const due = line.applied();
      line.advance();
      if (due >= 0) {
        const requests = posed.sent[due]!;
        for (let i = 0; i < requests.length; i += 2) built.handPoses.requestOne(handAt(requests[i]!), handPoseAt(requests[i + 1]!));
        requests.length = 0;
      }
    },
    /** Discard commands in flight when the body leaves full actuation. */
    reset(): void {
      help.reset();
      line.reset();
      posed.asked.length = 0;
      for (const slot of posed.sent) slot.length = 0;
    },
  };
}
