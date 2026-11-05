import type { BodySpec } from "./spec/body.ts";
import type { ReadBody } from "./read-body.ts";
import type { MuscleReading } from "./muscle/driver.ts";
import type { AssistReading } from "./assist.ts";
import type { ContactIdentity } from "./contact-identity.ts";
import type { Senses } from "./senses.ts";
/** Fixed body facts, live readings and the senses shown before its first decision. */
export interface OwnBody {
  readonly spec: BodySpec;
  readonly dt: number;
  /** The steps between its mind's step and its motor part carrying out what the step decided (`World.delay`, `Mind.act`). */
  readonly delay: number;
  readonly built: ReadBody;
  readonly muscles: MuscleReading;
  /** The force and the moment on its root that it is allowed beyond its muscles (`Assist`): none unless it was given a ceiling. */
  readonly assist: AssistReading;
  /** The senses shown at construction, before its first decision. */
  readonly first: Senses;
  /** How it labels the other side of a contact (`ContactIdentity`), where its fight grants one. */
  readonly contactIdentity?: ContactIdentity;
}
