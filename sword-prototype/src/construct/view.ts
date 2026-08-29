import type { ActiveActionDiagnostic, ControllerView, JointReading, SchedulerEvent } from "./scheduler.ts";

export interface ConstructPartView {
  readonly id: string;
  readonly health: number;
  readonly maxHealth: number;
  readonly attached: boolean;
}

export interface ConstructModuleView {
  readonly id: string;
  readonly installed: boolean;
  readonly available: boolean;
  readonly reason: string | null;
}

export interface ConstructView extends ControllerView {
  readonly parts: Readonly<Record<string, ConstructPartView>>;
  readonly modules: Readonly<Record<string, ConstructModuleView>>;
  readonly active: readonly ActiveActionDiagnostic[];
  readonly recent: readonly SchedulerEvent[];
}

export function constructControllerView(
  joints: Readonly<Record<string, JointReading>>,
  facts: Readonly<Record<string, number | boolean | string>>,
): ControllerView {
  return Object.freeze({ joints, facts });
}
