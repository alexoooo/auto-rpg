import type { JointKinematics } from "../../build/build-body.ts";
import type { HandPose } from "../../spec/body.ts";

interface ReferenceChannel { name: string; min: number; max: number }
export type ReferenceAction = { kind: "host" } | {
  kind: "muscles"; velocity: (number | "+inf" | "-inf")[]; activation: number[];
  handPoses: Record<string, HandPose>;
};
interface Frame {
  kind: "host" | "muscles"; velocity: (number | "+inf" | "-inf")[]; activation: number[];
  handPoses: Record<string, HandPose>; angles: number[]; speeds: number[];
  gravity: number[]; up: number[]; height: number; loads: Record<string, number>; rootMotion: number[];
}
export interface RiseReference {
  release: number; rootUp: number[]; joints?: JointKinematics[]; frames: Frame[];
  responseMeasurement?: { configuration: { rootMotion?: boolean } };
  responses: { step: number; columns: number[][]; coastColumns?: number[][] }[];
  references: RiseReference[];
}
export interface ReferenceParameters {
  rate?: number; gain?: number; window?: number; poseWeight?: number; rootWeight?: number;
  release?: number; releaseHeight?: number; releaseUp?: number; startPhase?: number;
  terminalAngles?: number[]; minRate?: number; maxRate?: number; localGravity?: boolean;
  phaseHeightWeight?: number; phaseLoadWeight?: number; phaseVelocityWeight?: number;
  terminalGain?: number; terminalAfter?: number; terminalActivation?: number; terminalDamping?: number;
  motionRate?: number; finiteDamping?: number; torqueGain?: number; damping?: number;
  pathGain?: number; responseRootWeight?: number; responseHeightWeight?: number;
  responsePoseWeight?: number; responseSpeedWeight?: number; responseSpinWeight?: number;
  responseLinearWeight?: number; ridge?: number; responseCap?: number; responseGain?: number; coastGain?: number;
  rootMotionWeight?: number; velocityWeight?: number; switchCost?: number; initialOnly?: boolean; blend?: number;
  controllers?: { kind: "path" | "response"; parameters: ReferenceParameters }[];
}
export interface ReferenceArguments {
  channels: readonly ReferenceChannel[]; reference: RiseReference; parameters: ReferenceParameters;
}
