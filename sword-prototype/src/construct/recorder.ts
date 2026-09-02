import type { ConstructCommand } from "./actions.ts";
import type { SchedulerEvent } from "./scheduler.ts";
import type { BoutRecorder } from "../recorder.ts";
import type { ControlRecordingPort } from "../control-host.ts";
import type { Side } from "../physics.ts";

export interface ConstructActionRecord {
  readonly step: number;
  readonly kind: "request" | SchedulerEvent["kind"];
  readonly action: string;
  readonly group: string | null;
  readonly reason: string | null;
}

/**
 * Records the public command/scheduler boundary. It deliberately receives no driver object or
 * source label, so a debug button and a Mind are observationally identical here.
 */
export class ConstructRecorder implements ControlRecordingPort {
  readonly rows: ConstructActionRecord[] = [];
  private readonly retainRows: boolean;
  private stepIndex = 0;
  private recorder: BoutRecorder | null = null;
  private side: Side | null = null;
  private readonly pending: Readonly<{
    step: number;
    command: ConstructCommand;
    events: readonly SchedulerEvent[];
  }>[] = [];
  private lastBoundary: Readonly<{ dt: number; clock: number }> = Object.freeze({ dt: 0, clock: 0 });

  constructor(retainRows = true) { this.retainRows = retainRows; }

  attach(recorder: BoutRecorder, side: Side): void {
    if (this.recorder && (this.recorder !== recorder || this.side !== side)) {
      throw new Error("construct recording port is already attached to another bout");
    }
    this.recorder = recorder;
    this.side = side;
  }

  record(command: ConstructCommand, events: readonly SchedulerEvent[]): void {
    if (this.retainRows) {
      for (const request of command.requests) {
        this.rows.push({ step: this.stepIndex, kind: "request", action: request.request.action, group: null, reason: null });
      }
      for (const event of events) this.rows.push({ step: this.stepIndex, ...event });
    }
    if (this.recorder) this.pending.push(Object.freeze({ step: this.stepIndex, command,
      events: Object.freeze(events.map((event) => Object.freeze({ ...event }))) }));
    this.stepIndex += 1;
  }

  sample(dt: number, clock: number): void {
    this.lastBoundary = Object.freeze({ dt, clock });
    this.flush();
  }

  /**
   * A lifecycle edge can close the host's active-sampling gate. Publish it against the last
   * host boundary now: waiting for another sample would make verdict/dispose unobservable.
   */
  flush(): void {
    if (!this.recorder || !this.side) return;
    for (const pending of this.pending.splice(0)) this.recorder.control(this.side, "construct-v3", {
      step: pending.step, dt: this.lastBoundary.dt, clock: this.lastBoundary.clock,
      command: pending.command,
      scheduler: pending.events,
    });
  }

  detach(): void {
    this.flush();
    this.recorder = null;
    this.side = null;
    this.lastBoundary = Object.freeze({ dt: 0, clock: 0 });
  }
}
