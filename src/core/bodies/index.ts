/** Body facts and readings published to entrant computations. */
export type { BodySpec, HandPose } from "./spec/body.ts";
export type { OwnBody } from "./own-body.ts";
export type { BodyControl } from "./body-control.ts";
export type { Senses, BodySense } from "./senses.ts";
export type { MuscleReading, MuscleCommand } from "./muscle/driver.ts";
export type { AssistReading } from "./assist.ts";
export type { ContactIdentity } from "./contact-identity.ts";
export { rootSegment, type ReadBody, type ReadSegment } from "./read-body.ts";
export { massCentreToRef, partsOn } from "./read-motion.ts";
export { jointTracker } from "./build/joint-state.ts";
