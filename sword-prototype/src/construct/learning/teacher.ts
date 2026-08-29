import type { ConstructCommand } from "../actions.ts";
import { canonicalIntegrityJson, integrityDigest, type IntegrityValue } from "../integrity.ts";
import type { ConstructGraphObservation } from "./observation.ts";

export const CONSTRUCT_TEACHER_VERSION = 1 as const;

export interface ConstructTeacherRow {
  readonly version: 1;
  readonly boundaryIndex: number;
  readonly observation: ConstructGraphObservation;
  readonly requests: readonly Readonly<{ action: string; sourceIndex: number; priority: number;
    parameters: Readonly<Record<string, number | string | boolean>> }>[];
}

const commandSignature = (command: ConstructCommand): string => canonicalIntegrityJson(command as unknown as IntegrityValue);

/** Optional behavior-cloning rows are emitted only when the public command changes. */
export class ConstructTeacherRecorder {
  private signature: string | null = null;
  private boundary = 0;
  private readonly recorded: ConstructTeacherRow[] = [];

  get rows(): readonly ConstructTeacherRow[] { return this.recorded; }

  observe(observation: ConstructGraphObservation, command: ConstructCommand): ConstructTeacherRow | null {
    const signature = commandSignature(command);
    if (signature === this.signature) return null;
    this.signature = signature;
    const row = Object.freeze({ version: CONSTRUCT_TEACHER_VERSION, boundaryIndex: this.boundary,
      observation, requests: Object.freeze(command.requests.map((scheduled) => Object.freeze({
        action: scheduled.request.action, sourceIndex: scheduled.sourceIndex, priority: scheduled.priority,
        parameters: Object.freeze({ ...scheduled.request.parameters }),
      }))) });
    this.boundary += 1;
    this.recorded.push(row);
    return row;
  }
}

export const constructTeacherDigest = (rows: readonly ConstructTeacherRow[]): string =>
  integrityDigest(canonicalIntegrityJson(rows as unknown as IntegrityValue));
