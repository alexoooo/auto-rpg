import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

import type { EffectorView, GolemSocket, ModuleEnvelope } from "../golem/module.ts";

/**
 * The bench's own rig overlay.
 *
 * `src/rigview.ts` is typed on the concrete `Fighter` -- it walks limbs, weapons and a
 * fighter's constraint set -- so a golem module cannot use it without that class being widened
 * into something that serves two bodies. This is the small one instead, and Session 08 decides
 * which of the two survives in the arena.
 *
 * **It creates no body, shape or constraint**, which is the house rule the Warrior's overlay
 * carries and the reason both of them can be toggled mid-run without changing a single reading.
 * Everything here is a line or an unpickable sphere on no collision layer at all.
 *
 * What it shows:
 *
 * - **The socket frame**, as three short axes. A module is built in the frame its socket hands
 *   it, and a weld whose two frames disagree at construction is the failure this directory has
 *   paid for most often -- so being able to see the frame is worth three lines.
 * - **The envelope**, as two rings at the module's own published reach. Frozen rule 3 says a
 *   command lives inside the envelope; this is what the envelope is.
 * - **The commanded tip and the achieved tip**, with a line between them. That line's *length*
 *   is the target error carried out to the tip, which is the reading a person can actually see.
 * - **Contact points**, the most recent few, as small marks. A contact is what opens the 0.25 s
 *   tip-speed exclusion window, so seeing where one happened is what makes an excluded peak
 *   legible rather than mysterious.
 *
 * There is deliberately no anchor here, because neither of Session 02's chains has one:
 * `AnchorDrive` builds an invisible massless sphere and nothing in the module contract
 * publishes it. Session 03 is the first session with an anchor to draw, and the honest way to
 * add it is a field on the view rather than this file reaching into a chain.
 */
const CONTACT_MARKS = 8;

export class BenchOverlay {
  private readonly scene: Scene;
  private readonly nodes: (Mesh | LinesMesh)[] = [];
  private readonly commandedDot: Mesh;
  private readonly achievedDot: Mesh;
  private readonly contactDots: Mesh[] = [];
  private errorLine: LinesMesh;
  private readonly errorPoints = [new Vector3(), new Vector3(0, 0.001, 0)];
  private nextContact = 0;
  private shown = false;

  constructor(scene: Scene, socket: GolemSocket, envelope: ModuleEnvelope) {
    this.scene = scene;

    const glow = (name: string, colour: Color3): StandardMaterial => {
      const material = new StandardMaterial(name, scene);
      material.emissiveColor = colour;
      material.diffuseColor = Color3.Black();
      material.specularColor = Color3.Black();
      material.disableLighting = true;
      return material;
    };
    const commanded = glow("bench.commanded", new Color3(0.35, 0.85, 1));
    const achieved = glow("bench.achieved", new Color3(1, 0.78, 0.3));
    const contact = glow("bench.contact", new Color3(1, 0.32, 0.28));

    const dot = (name: string, diameter: number, material: StandardMaterial): Mesh => {
      const mesh = MeshBuilder.CreateSphere(name, { diameter, segments: 8 }, scene);
      mesh.material = material;
      mesh.isPickable = false;
      this.nodes.push(mesh);
      return mesh;
    };
    this.commandedDot = dot("bench.rig.commanded", 0.07, commanded);
    this.achievedDot = dot("bench.rig.achieved", 0.055, achieved);
    for (let index = 0; index < CONTACT_MARKS; index += 1) {
      const mark = dot(`bench.rig.contact${index}`, 0.05, contact);
      mark.position.set(0, -50, 0);
      this.contactDots.push(mark);
    }

    const line = (name: string, points: Vector3[], colour: Color3): LinesMesh => {
      const made = MeshBuilder.CreateLines(name, { points, updatable: true }, scene);
      made.color = colour;
      made.isPickable = false;
      this.nodes.push(made);
      return made;
    };

    // The socket's own three axes, carried into the world by its build rotation.
    const axis = (local: Vector3, colour: Color3, name: string): void => {
      const end = new Vector3();
      local.rotateByQuaternionToRef(socket.rotation, end);
      line(name, [socket.world.clone(), socket.world.add(end.scale(0.25))], colour);
    };
    axis(new Vector3(1, 0, 0), new Color3(1, 0.3, 0.3), "bench.rig.socketX");
    axis(new Vector3(0, 1, 0), new Color3(0.3, 1, 0.3), "bench.rig.socketY");
    axis(new Vector3(0, 0, 1), new Color3(0.3, 0.5, 1), "bench.rig.socketZ");

    // The reach, as two rings through the socket: one in the sagittal plane the swing lives in
    // and one horizontal. Two great circles of the reach sphere say "this far and no further"
    // without this file having to know what the module's axes mean.
    const ring = (name: string, first: Vector3, second: Vector3): void => {
      const points: Vector3[] = [];
      for (let step = 0; step <= 48; step += 1) {
        const angle = (step / 48) * Math.PI * 2;
        const point = first.scale(Math.cos(angle) * envelope.reach)
          .addInPlace(second.scale(Math.sin(angle) * envelope.reach));
        point.rotateByQuaternionToRef(socket.rotation, point);
        points.push(point.addInPlace(socket.world));
      }
      const made = line(name, points, new Color3(0.45, 0.5, 0.6));
      made.alpha = 0.45;
    };
    if (envelope.reach > 0) {
      ring("bench.rig.reachSagittal", new Vector3(0, 1, 0), new Vector3(0, 0, 1));
      ring("bench.rig.reachHorizontal", new Vector3(1, 0, 0), new Vector3(0, 0, 1));
    }

    this.errorLine = line("bench.rig.error", this.errorPoints, new Color3(1, 1, 1));
    this.setShown(false);
  }

  get visible(): boolean {
    return this.shown;
  }

  toggle(): boolean {
    this.setShown(!this.shown);
    return this.shown;
  }

  /** Where a contact happened. Called from a collision observer, not from the render loop. */
  markContact(point: Vector3): void {
    const mark = this.contactDots[this.nextContact % this.contactDots.length];
    this.nextContact += 1;
    mark.position.copyFrom(point);
  }

  /**
   * Follow the module.
   *
   * Reads the published view and nothing else, which is what keeps the overlay from being a
   * second, subtly different reader of the same bodies -- and, because the view itself only
   * touches `mesh.position` and `mesh.rotationQuaternion`, keeps it from stamping a render id
   * that would freeze every later reader in the frame.
   */
  update(view: EffectorView | null): void {
    if (!this.shown || !view) return;
    this.commandedDot.position.copyFrom(view.commandedTip);
    this.achievedDot.position.copyFrom(view.tip);
    this.errorPoints[0].copyFrom(view.commandedTip);
    this.errorPoints[1].copyFrom(view.tip);
    // Babylon refuses a line whose two points coincide, so nudge the second one when the limb
    // is exactly where it was asked to be -- which on rung 0 is every single frame.
    if (Vector3.DistanceSquared(this.errorPoints[0], this.errorPoints[1]) < 1e-12) {
      this.errorPoints[1].y += 0.001;
    }
    this.errorLine = MeshBuilder.CreateLines(
      "bench.rig.error", { points: this.errorPoints, instance: this.errorLine }, this.scene,
    );
  }

  dispose(): void {
    for (const node of this.nodes) node.dispose(false, true);
    this.nodes.length = 0;
    this.contactDots.length = 0;
  }

  private setShown(shown: boolean): void {
    this.shown = shown;
    for (const node of this.nodes) node.isVisible = shown;
  }
}
