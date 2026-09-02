export type SensorUnit = "boolean" | "scalar" | "metres" | "metres-per-second" | "radians" |
  "radians-per-second" | "seconds" | "joules" | "watts";

export interface SensorSpec {
  readonly id: string;
  readonly unit: SensorUnit;
  readonly source: "self" | "contact" | "opponent";
  /** Explicit combat-unit semantics for saved-program migration; IDs are not a type system. */
  readonly combatValue?: "absolute" | "normalized";
}

export interface SensorValue {
  readonly id: string;
  readonly unit: SensorUnit;
  readonly value: number | boolean;
}

export interface JointSensorChannels {
  readonly axis: "x" | "y" | "z";
  readonly angle: string;
  readonly speed: string;
}

/** One-axis saves keep their v1 IDs; multi-axis joints make the physical axis explicit. */
export function jointSensorChannels(joint: Readonly<{ id: string;
  angularAxes?: readonly Readonly<{ id: "x" | "y" | "z" }>[] }>): readonly JointSensorChannels[] {
  const axes = joint.angularAxes?.length ? joint.angularAxes : Object.freeze([{ id: "x" as const }]);
  const suffixed = axes.length > 1;
  return Object.freeze(axes.map(({ id: axis }) => Object.freeze({ axis,
    angle: `joint-angle-${joint.id}${suffixed ? `-${axis}` : ""}`,
    speed: `joint-speed-${joint.id}${suffixed ? `-${axis}` : ""}`,
  })));
}

/** A saved body's sensor authority is the intersection of its hardware channels and the catalog. */
export function installedSensorsForBlueprint(
  blueprint: Readonly<{
    parts?: readonly Readonly<{ id: string }>[];
    joints?: readonly Readonly<{ id: string;
      angularAxes?: readonly Readonly<{ id: "x" | "y" | "z" }>[] }>[];
    modules: readonly Readonly<{ id: string; kind?: string; sensorChannels?: readonly string[] }>[];
  }>,
  catalog: readonly SensorSpec[],
): readonly SensorSpec[] {
  const available = new Map(catalog.map((sensor) => [sensor.id, sensor]));
  const ids = new Set(blueprint.modules.flatMap((module) => module.sensorChannels ?? []));
  const result = new Map<string, SensorSpec>();
  const inferred = (id: string): SensorSpec | null => {
    if (id.startsWith("contact-")) return { id, unit: "boolean", source: "contact" };
    if (id.startsWith("slip-")) return { id, unit: "metres-per-second", source: "contact" };
    return null;
  };
  for (const id of [...ids].sort()) {
    const sensor = available.get(id) ?? inferred(id);
    if (!sensor) throw new Error(`module sensor channel "${id}" has no installed sensor specification`);
    result.set(id, Object.freeze(sensor));
  }
  // Health, joint state and finite resources are hardware telemetry rather than conclusions.
  // Their stable IDs exist exactly when the corresponding hardware exists.
  for (const part of blueprint.parts ?? []) result.set(`part-health-${part.id}`,
    Object.freeze({ id: `part-health-${part.id}`, unit: "scalar", source: "self",
      combatValue: "normalized" }));
  for (const joint of blueprint.joints ?? []) for (const channel of jointSensorChannels(joint)) {
    result.set(channel.angle, Object.freeze({ id: channel.angle, unit: "radians", source: "self" }));
    result.set(channel.speed, Object.freeze({ id: channel.speed, unit: "radians-per-second", source: "self" }));
  }
  for (const module of blueprint.modules) result.set(`module-health-${module.id}`,
    Object.freeze({ id: `module-health-${module.id}`, unit: "scalar", source: "self",
      combatValue: "normalized" }));
  if (blueprint.modules.some(({ kind }) => kind === "power-core")) result.set("power-charge-j",
    Object.freeze({ id: "power-charge-j", unit: "joules", source: "self" }));
  if (blueprint.modules.some(({ kind }) => kind === "launcher")) {
    result.set("heat-j", Object.freeze({ id: "heat-j", unit: "joules", source: "self" }));
    result.set("overheated", Object.freeze({ id: "overheated", unit: "boolean", source: "self" }));
  }
  for (const module of blueprint.modules.filter(({ kind }) => kind === "magazine")) {
    result.set(`ammo-${module.id}`, Object.freeze({ id: `ammo-${module.id}`, unit: "scalar", source: "self" }));
    result.set(`reload-${module.id}`, Object.freeze({ id: `reload-${module.id}`, unit: "seconds", source: "self" }));
  }
  return Object.freeze([...result.values()].sort((a, b) => a.id.localeCompare(b.id)));
}

export const SENSOR_CATALOG: readonly Omit<SensorSpec, "id">[] = Object.freeze([
  Object.freeze({ unit: "radians", source: "self" }),
  Object.freeze({ unit: "radians-per-second", source: "self" }),
  Object.freeze({ unit: "scalar", source: "self" }),
  Object.freeze({ unit: "boolean", source: "contact" }),
  Object.freeze({ unit: "joules", source: "self" }),
  Object.freeze({ unit: "scalar", source: "self" }),
  Object.freeze({ unit: "watts", source: "self" }),
  Object.freeze({ unit: "metres", source: "opponent" }),
  Object.freeze({ unit: "metres-per-second", source: "opponent" }),
  Object.freeze({ unit: "boolean", source: "opponent" }),
]);

export class SensorFrame {
  private readonly installed: ReadonlyMap<string, SensorSpec>;
  private readonly rows = new Map<string, SensorValue>();

  constructor(installed: readonly SensorSpec[]) {
    this.installed = new Map(installed.map((sensor) => [sensor.id, sensor]));
    if (this.installed.size !== installed.length) throw new Error("installed sensors have duplicate IDs");
  }

  publish(id: string, value: number | boolean): void {
    const sensor = this.installed.get(id);
    if (!sensor) throw new Error(`cannot publish uninstalled sensor "${id}"`);
    if (sensor.unit === "boolean") {
      if (typeof value !== "boolean") throw new Error(`sensor "${id}" must publish boolean`);
    } else if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`sensor "${id}" must publish a finite ${sensor.unit} number`);
    }
    const row = this.rows.get(id) as { id: string; unit: SensorUnit; value: number | boolean } | undefined;
    if (row) row.value = value;
    else this.rows.set(id, { id, unit: sensor.unit, value });
  }

  read(id: string): SensorValue {
    if (!this.installed.has(id)) throw new Error(`program cannot read uninstalled sensor "${id}"`);
    const row = this.rows.get(id);
    if (!row) throw new Error(`installed sensor "${id}" has no value in this decision frame`);
    return row;
  }

  has(id: string): boolean { return this.rows.has(id); }

  clear(): void { this.rows.clear(); }
}
