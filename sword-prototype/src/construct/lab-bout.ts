import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";

import type { Side } from "../physics.ts";
import { Combat, type CombatReportEvent } from "../combat.ts";
import type { FighterMaterials } from "../fighter.ts";
import { stepControlledPair, type ControlledBody } from "../control-host.ts";
import { Construct, type ConstructDefinition } from "./construct.ts";
import { type ConstructControlSnapshot } from "./control.ts";
import type { SavedConstruct } from "./codec.ts";
import type { SensorSpec } from "./sensors.ts";
import type { ConstructInitialCondition } from "./matchup.ts";

export interface ConstructLabBodySample {
  readonly side: Side;
  readonly rangeM: number;
  readonly snapshot: ConstructControlSnapshot;
  readonly vitality: number;
  readonly combat: readonly CombatReportEvent[];
  readonly availableGroups: readonly string[];
}

export interface ConstructLabStepSample {
  readonly step: number;
  readonly left: ConstructLabBodySample;
  readonly right: ConstructLabBodySample;
}

export interface ConstructLabRootPositions {
  readonly left: Vector3;
  readonly right: Vector3;
}

class LabBody {
  readonly side: Side;
  readonly body: Construct;
  readonly combat: Combat;
  private readonly reports: CombatReportEvent[] = [];

  constructor(scene: Scene, side: Side, saved: SavedConstruct, sensors: readonly SensorSpec[],
    position: Vector3, facing: number, materials: FighterMaterials) {
    this.side = side;
    const definition: ConstructDefinition = Object.freeze({ blueprint: saved.blueprint, control: saved.control,
      program: saved.program, sensors });
    this.body = new Construct({ scene, side, origin: position, facing, materials,
      policyName: "construct-program" }, definition);
    this.combat = new Combat(side, this.body.strikers, (event) => this.reports.push(event));
  }

  get control() { return this.body.control; }
  rootPosition(): Vector3 { return this.body.centre(); }

  sample(rangeM: number): ConstructLabBodySample {
    const combat = Object.freeze(this.reports.splice(0).map((event) => Object.freeze(event)));
    const snapshot = this.control.snapshot();
    const availableGroups = Object.freeze([...new Set(snapshot.capabilities.filter(({ available }) => available)
      .map(({ group }) => group))].sort());
    return Object.freeze({ side: this.side, rangeM, snapshot,
      vitality: this.body.vitality, combat, availableGroups });
  }

  dispose(): void { this.combat.dispose(); this.body.dispose(); }
}

/**
 * `LabBody` owns combat reports and sampling in addition to a Construct, so it
 * is deliberately not made to impersonate the host's controlled-body seam.
 * This adapter is the one narrow translation owned by the bout: the shared
 * pair scheduler sees two ordinary endpoints while observation still receives
 * the real opposing Construct.
 */
class LabControlledBodyAdapter implements ControlledBody {
  private readonly owner: LabBody;

  constructor(owner: LabBody) { this.owner = owner; }

  get control() { return this.owner.control; }
  get locomotion() { return (this.owner.body as ControlledBody).locomotion ?? null; }

  observe(opponent: ControlledBody, clock: number): void {
    if (!(opponent instanceof LabControlledBodyAdapter)) {
      throw new Error("construct lab pair adapter requires another construct lab body");
    }
    this.owner.body.observe(opponent.owner.body, clock);
  }
}

/**
 * Shared page/headless construct driver. The host owns scene creation, but commands, solver
 * stepping and trace sampling are one implementation in both environments.
 */
export class ConstructLabBout {
  private readonly scene: Scene;
  private readonly left: LabBody;
  private readonly right: LabBody;
  private readonly leftAdapter: LabControlledBodyAdapter;
  private readonly rightAdapter: LabControlledBodyAdapter;
  private stepIndex = 0;
  private disposed = false;
  private readonly material: StandardMaterial;

  constructor(
    scene: Scene,
    left: SavedConstruct,
    right: SavedConstruct,
    sensors: readonly SensorSpec[],
    separationM: number,
    originY = 0,
    initialCondition: ConstructInitialCondition = Object.freeze({
      lateralOffsetM: 0, separationOffsetM: 0, yawOffsetRad: 0,
    }),
  ) {
    this.scene = scene;
    this.material = new StandardMaterial("construct.lab.shared-material", scene);
    const materials: FighterMaterials = { flesh: this.material, cloth: this.material, steel: this.material,
      leather: this.material, brass: this.material, hide: this.material, wood: this.material,
      arrowAccent: this.material };
    const lateral = initialCondition.lateralOffsetM;
    const separation = separationM + initialCondition.separationOffsetM;
    this.left = new LabBody(scene, "left", left, sensors, new Vector3(-lateral / 2, originY, 0),
      initialCondition.yawOffsetRad, materials);
    this.leftAdapter = new LabControlledBodyAdapter(this.left);
    try {
      this.right = new LabBody(scene, "right", right, sensors,
        new Vector3(lateral / 2, originY, separation), Math.PI - initialCondition.yawOffsetRad, materials);
      this.rightAdapter = new LabControlledBodyAdapter(this.right);
      this.left.combat.attach(this.right.body);
      this.right.combat.attach(this.left.body);
    } catch (error) {
      this.left.dispose();
      throw error;
    }
  }

  step(dt: number): ConstructLabStepSample {
    if (this.disposed) throw new Error("construct lab bout cannot step after disposal");
    if (!Number.isFinite(dt) || dt <= 0) throw new Error("construct lab bout dt must be finite and positive");
    stepControlledPair(this.leftAdapter, this.rightAdapter, dt, this.left.combat.now);
    const sceneInternals = this.scene as unknown as { _renderId: number; _advancePhysicsEngineStep(milliseconds: number): void };
    sceneInternals._renderId += 1;
    sceneInternals._advancePhysicsEngineStep(1000 * dt);
    this.left.combat.advance(dt);
    this.right.combat.advance(dt);
    const rangeM = Vector3.Distance(this.left.rootPosition(), this.right.rootPosition());
    const result = Object.freeze({
      step: this.stepIndex,
      left: this.left.sample(rangeM),
      right: this.right.sample(rangeM),
    });
    this.stepIndex += 1;
    return result;
  }

  rootPositions(): ConstructLabRootPositions {
    return Object.freeze({ left: this.left.rootPosition().clone(), right: this.right.rootPosition().clone() });
  }

  /** Learning adapters may install a public command source; combat and stepping stay here. */
  construct(side: Side): Construct { return side === "left" ? this.left.body : this.right.body; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.right.dispose();
    this.left.dispose();
    this.material.dispose(false, false);
  }
}
