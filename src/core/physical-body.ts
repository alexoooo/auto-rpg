import type { BuiltBody } from "./build/build-body.ts";
import type { Assist } from "./control/assist.ts";
import type { OwnBody } from "./mind/mind.ts";
import type { EquipmentPort } from "./mind/equipment-port.ts";
import type { Senses } from "./mind/senses.ts";
import type { BodyLevel, MuscleDriver } from "./muscle/driver.ts";
import { observeBody, physicalReading, type BodyObservation } from "./observation.ts";
import type { World } from "./world.ts";

/** Game-facing lifecycle shared by every controller. Physics handles stay on the trusted side. */
export interface PhysicalBody {
  readonly built: BuiltBody;
  readonly muscles: MuscleDriver;
  readonly assist: Assist;
  readonly physical: ReturnType<ReturnType<typeof physicalReading>>;
  /**
   * Whether the body is down, by the fight's one rule for every body: its spec's (`DownSpec`) read
   * from the body alone at the step's first look (`physicalReading`), whatever its mind asks of it.
   */
  readonly down: boolean;
  readonly has: string;
  readonly level: BodyLevel;
  readonly state: object;
  observe(): BodyObservation;
  setLevel(level: BodyLevel): void;
  /** Releases control; the builder owns physical-body disposal. */
  dispose(): void;
}

/** Adapt an embodied mind without constructing any stance, skill or motion controller. */
export function physicalBody(built: BuiltBody, own: OwnBody, world: World, senses: () => Senses, has: () => string, state: object, dispose: () => void,
  equipment?: EquipmentPort): PhysicalBody {
  const read = physicalReading(built), physical = read();
  const hook = world.beforeStep(() => { if (own.muscles.level === "full") read(); });
  return {
    built, muscles: own.muscles, assist: own.assist, state: { ...state, physical }, physical,
    get down() { return physical.down; },
    get has() { return own.muscles.level === "full" ? has() : "nobody"; },
    get level() { return own.muscles.level; },
    setLevel: (level) => own.muscles.setLevel(level),
    observe: observeBody(built, own.muscles, world, senses, equipment ? () => equipment.observe() : undefined),
    dispose() { hook.dispose(); dispose(); },
  };
}
