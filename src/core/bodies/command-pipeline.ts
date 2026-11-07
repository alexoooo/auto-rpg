import type { BuiltBody } from "./build/build-body.ts";
import { checkConfiguration } from "./build/configurations.ts";
import type { ConfigurationName } from "./spec/body.ts";
import { rootSegment } from "./read-body.ts";
import { createAssist, type AssistCeiling } from "./assist.ts";
import { delayLine, heldSteps } from "./command-delay.ts";

/** The physical assist and configuration requests waiting for their command's world step. */
export function commandPipeline(built: BuiltBody, delay: number, ceiling: AssistCeiling) {
  const help = createAssist(built, rootSegment(built), ceiling, heldSteps(delay));
  const line = delayLine(heldSteps(delay));
  const posed = { asked: [] as number[], sent: Array.from({ length: line.size }, () => [] as number[]), line: line.state };
  return {
    help, posed,
    request(segment: string, configuration: ConfigurationName): void {
      const code = checkConfiguration(built.configurations.model, segment, configuration);
      posed.asked.push(code, built.configurations.model[code]!.configurations.indexOf(configuration));
    },
    /** Apply this step's assist and carry the configuration requests through the same delay. */
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
        for (let i = 0; i < requests.length; i += 2) {
          const entry = built.configurations.model[requests[i]!]!;
          built.configurations.requestOne(entry.segment, entry.configurations[requests[i + 1]!]!);
        }
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
