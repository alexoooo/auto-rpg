import type { ReadBody } from "../core/bodies/read-body.ts";
import type { ContactIdentity } from "../core/bodies/contact-identity.ts";
import type { MuscleReading } from "../core/bodies/muscle/driver.ts";
import type { AssistReading } from "../core/bodies/assist.ts";
import type { BodyControl } from "../core/bodies/body-control.ts";
import type { Senses } from "../core/bodies/senses.ts";
import type { Vector3 } from "../core/math/vector.ts";
import type { ObjectSense } from "../core/bodies/object-senses.ts";

/** **The mind's side of a body's mirror**: the body it reads, and what refreshes it and sends its command back. */
export interface Mirror {
  readonly read: ReadBody;
  /** How its fight labels what it touches, as the numbers last read tell it, where it labels any (`MirrorStatics.labelled`). */
  readonly contactIdentity?: ContactIdentity;
  readonly muscles: MuscleReading;
  readonly assist: AssistReading;
  readonly control: BodyControl;
  readonly senses: Senses;
  /** The steps and time of the numbers last read. */
  readonly steps: number;
  readonly time: number;
  /**
   * Read the body from the channel's inbound numbers; with `dynamics`, read the body's dynamics
   * from them as its muscles do before their mind steps. What it senses is read apart (`sense`).
   */
  refresh(options: { readonly dynamics: boolean }): void;
  /** Read what its body senses from the numbers the last refresh read into what its senses show (`seen`), and show it (`senses`) until the next. */
  sense(): void;
  /**
   * **What its senses show**, plain data its bout saves (`MirrorSeen`): what its mind last decided
   * on, which its motor part still reads at a delay (`SplitDriver`).
   */
  readonly seen: MirrorSeen;
  /** Show what its senses show (`seen`) as its senses, as after a load: each body it shows that its numbers have told it of. */
  recall(): void;
  /** Write what its mind asked into the channel's outbound numbers, and forget configuration requests sent. */
  answer(): void;
  /**
   * **What its mind has asked and not yet answered**, plain data its bout saves (`MirrorCommand`):
   * kept from step to step as its body keeps it, read by none but the answer.
   */
  readonly command: MirrorCommand;
  /** Its body has left `full`: what its mind asked is dropped, as its body drops the command it holds. */
  idle(): void;
}

/** What a mirror's mind has asked: its muscles' command, assist and segment/configuration pairs in request order. */
export interface MirrorCommand {
  readonly activation: Float64Array;
  readonly velocity: Float64Array;
  readonly asked: { readonly force: Vector3; readonly moment: Vector3 };
  readonly configurations: number[];
}

/** What a mirror's senses show, as it last read them: the time, whether its body is out, its life, each other body by its id and its numbers, and the objects. */
export interface MirrorSeen {
  time: number;
  out: boolean;
  life: number;
  readonly others: { readonly id: string; readonly numbers: Float64Array }[];
  objects: readonly ObjectSense[] | undefined;
}
