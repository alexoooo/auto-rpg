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
 * - **The anchor**, for a chain that has one. Session 02 left no anchor here because neither of
 *   its chains had one, and said that the honest way to add it was a field on the view rather
 *   than this file reaching into a chain. `EffectorView.anchor` is that field. The reading it
 *   makes visible is the one `AGENTS.md` says to take first: a driven limb that is not within a
 *   few millimetres of its own anchor is not posed wrongly, it is stuck on something.
 */
const CONTACT_MARKS = 8;

/** How many segments a drawn envelope edge is walked in. Enough that a curve reads as one. */
const EDGE_STEPS = 20;

export class BenchOverlay {
  private readonly scene: Scene;
  private readonly nodes: (Mesh | LinesMesh)[] = [];
  private readonly commandedDot: Mesh;
  private readonly achievedDot: Mesh;
  private readonly anchorDot: Mesh;
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
    const anchored = glow("bench.anchor", new Color3(0.45, 1, 0.55));

    const dot = (name: string, diameter: number, material: StandardMaterial): Mesh => {
      const mesh = MeshBuilder.CreateSphere(name, { diameter, segments: 8 }, scene);
      mesh.material = material;
      mesh.isPickable = false;
      this.nodes.push(mesh);
      return mesh;
    };
    this.commandedDot = dot("bench.rig.commanded", 0.07, commanded);
    this.achievedDot = dot("bench.rig.achieved", 0.055, achieved);
    this.anchorDot = dot("bench.rig.anchor", 0.05, anchored);
    this.anchorDot.position.set(0, -50, 0);
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

    const reachable = envelope.reachable;
    if (reachable) {
      // **The envelope, drawn as what it actually is.** Frozen rule 3 says a command lives inside
      // it, and on a chain whose command is a point that shell is not a sphere: it is the region
      // between two radii, clipped by the swing and lift limits *and* by the minimum outboard
      // carry -- which couples the swing to the other two, so the inboard edge is a curve and not
      // a straight line. Two rings at one radius would draw a claim the module does not make.
      //
      // Outboard-signed, exactly as the record is, so this one piece of arithmetic draws either
      // socket without a mirrored copy of itself.
      const swingFloor = (radius: number, lift: number): number => {
        const horizontal = radius * Math.cos(lift);
        if (horizontal <= 1e-6) return reachable.swingMin;
        const floor = Math.asin(
          Math.max(-1, Math.min(1, reachable.carryMin / horizontal)),
        );
        return Math.max(reachable.swingMin, Math.min(floor, reachable.swingMax));
      };
      const on = (radius: number, swing: number, lift: number): Vector3 => {
        const azimuth = socket.outboard * swing;
        const cosLift = Math.cos(lift);
        const point = new Vector3(
          Math.sin(azimuth) * cosLift, Math.sin(lift), Math.cos(azimuth) * cosLift,
        ).scaleInPlace(radius);
        point.rotateByQuaternionToRef(socket.rotation, point);
        return point.addInPlace(socket.world);
      };
      const walk = (name: string, radius: number, colour: Color3, alpha: number): void => {
        const points: Vector3[] = [];
        const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
        for (let i = 0; i <= EDGE_STEPS; i += 1) {
          const t = i / EDGE_STEPS;
          points.push(on(radius, lerp(swingFloor(radius, reachable.liftMax), reachable.swingMax, t),
            reachable.liftMax));
        }
        for (let i = 0; i <= EDGE_STEPS; i += 1) {
          const t = i / EDGE_STEPS;
          points.push(on(radius, reachable.swingMax, lerp(reachable.liftMax, reachable.liftMin, t)));
        }
        for (let i = 0; i <= EDGE_STEPS; i += 1) {
          const t = i / EDGE_STEPS;
          points.push(on(radius, lerp(reachable.swingMax, swingFloor(radius, reachable.liftMin), t),
            reachable.liftMin));
        }
        // The carry curve, walked in lift so the coupling shows.
        for (let i = 0; i <= EDGE_STEPS * 2; i += 1) {
          const lift = lerp(reachable.liftMin, reachable.liftMax, i / (EDGE_STEPS * 2));
          points.push(on(radius, swingFloor(radius, lift), lift));
        }
        const made = line(name, points, colour);
        made.alpha = alpha;
      };
      walk("bench.rig.envelopeOuter", reachable.reachMax, new Color3(0.45, 0.5, 0.6), 0.6);
      walk("bench.rig.envelopeInner", reachable.reachMin, new Color3(0.35, 0.4, 0.5), 0.35);
      // Four spokes at the corners, so the shell reads as a solid rather than as two loops.
      for (const [swing, lift] of [
        [reachable.swingMax, reachable.liftMax], [reachable.swingMax, reachable.liftMin],
        [swingFloor(reachable.reachMax, reachable.liftMax), reachable.liftMax],
        [swingFloor(reachable.reachMax, reachable.liftMin), reachable.liftMin],
      ] as const) {
        const made = line(`bench.rig.spoke${swing.toFixed(2)}${lift.toFixed(2)}`,
          [on(reachable.reachMin, swing, lift), on(reachable.reachMax, swing, lift)],
          new Color3(0.35, 0.4, 0.5));
        made.alpha = 0.35;
      }
    } else if (envelope.reach > 0) {
      // No reachable set published, so the honest drawing is the one thing the envelope does say:
      // how far the business end goes. Two great circles of that sphere, as Session 02 drew them.
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
    // Parked far below the floor when there is no anchor, rather than hidden: a mesh toggled by
    // this file would have to be re-shown by `setShown`, and one boolean owned in two places is
    // how an overlay ends up drawing a stale anchor for a chain that has none.
    if (view.anchor) this.anchorDot.position.copyFrom(view.anchor);
    else this.anchorDot.position.set(0, -50, 0);
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
