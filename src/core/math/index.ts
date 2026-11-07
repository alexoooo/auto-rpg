/** Exact arithmetic and numeric learners published to entrants. */
export { Vector3, Quaternion } from "./vector.ts";
export { randomStream } from "./random.ts";
export * from "./real.ts";
export { networkFaults, recoveryNetwork, type Network } from "./learning/recovery-network.ts";
export { act, ask, learnerOf, type Learner } from "./learning/learner.ts";
