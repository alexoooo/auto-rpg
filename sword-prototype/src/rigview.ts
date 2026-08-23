import { PhysicsViewer } from "@babylonjs/core/Debug/physicsViewer.js";
// Side effect, and load-bearing in exactly the way the physics, outline and
// `Culling/ray` imports already documented in AGENTS.md are. `PhysicsViewer`
// calls `enableEdgesRendering()` on the inertia box and on the constraint cage,
// and without this the tree-shaken build has no such method: the call throws the
// bare string "EdgesRenderer needs to be imported before as it contains a
// side-effect required by your code" -- not an Error, so it carries no stack and
// no message. `tsc` and the build are both perfectly happy; the overlay simply
// throws the first time `G` is pressed and never appears.
import "@babylonjs/core/Rendering/edgesRenderer.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { UtilityLayerRenderer } from "@babylonjs/core/Rendering/utilityLayerRenderer.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { PhysicsConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import type { PhysicsEngine as PhysicsEngineV2 } from "@babylonjs/core/Physics/v2/physicsEngine.js";

import { CONFIG } from "./config";
import type { Combat } from "./combat";
import type { Fighter } from "./fighter";
import type { Side } from "./physics";

/** The three numbers the readout gains while the overlay is up. */
export interface RigReadout {
  /** Distance from the hand anchor to the hand it is dragging, millimetres. */
  errorMm: number;
  /** Path the solved elbow point has travelled in the last second, millimetres. */
  elbowDriftMm: number;
  /** Blade tip speed, metres per second. */
  tipSpeed: number;
  /**
   * Which arm the three above describe.
   *
   * It stopped being obvious the moment session 07 let the player change bodies
   * mid-bout, and three unlabelled millimetre figures that can quietly change
   * subject are worse than none: every one of them was measured against the left
   * fighter's arm and would be read that way by habit.
   */
  side: Side;
}

/** What `audit()` answers. */
export interface RigAudit {
  /** Live physics bodies, from the engine rather than from a mesh count. */
  bodies: number;
  /** Meshes in the main scene. The overlay's own meshes live here too. */
  meshes: number;
  /** How many complete on/off cycles were run to get that agreement. */
  cycles: number;
}

/**
 * Overlay meshes go in a rendering group of their own so they draw over the
 * scene rather than inside it. Babylon clears the depth buffer between
 * rendering groups by default, so group 1 is unconditionally on top -- which is
 * what an instrument wants. A line that disappears inside the forearm capsule
 * exactly when the arm is doing something interesting is worse than no line.
 */
const OVERLAY_GROUP = 1;

const colour = (rgb: number[]): Color3 => new Color3(rgb[0], rgb[1], rgb[2]);

/** One drawn contact: where, how fast, and which way the edge was pointing. */
interface ContactSlot {
  ball: Mesh;
  velocity: LinesMesh;
  edge: LinesMesh;
}

/** Everything drawn for one fighter and for the blade it is holding. */
interface Drawn {
  fighter: Fighter;
  combat: Combat;
  anchorX: LinesMesh;
  anchorY: LinesMesh;
  anchorZ: LinesMesh;
  error: LinesMesh;
  aim: LinesMesh;
  chain: LinesMesh;
  pole: LinesMesh;
  elbow: Mesh;
  contacts: ContactSlot[];
}

/**
 * The rig you can see.
 *
 * The prototype's subject is a simulated arm, and until this landed the arm was
 * the one thing in the scene that could not be looked at. The torso capsule has
 * been invisible since the cosmetic figure landed; both control anchors are
 * massless, collide with nothing, and are drawn by nobody; and the distance
 * between the hand anchor and the hand -- the single most diagnostic quantity
 * here, and what both the wobble complaint and the rope-elbow complaint turned
 * out to be readings of -- took a bench harness and console instrumentation to
 * answer. One key now answers it.
 *
 * Two halves, and the split matters. Babylon's `PhysicsViewer` draws collision
 * shapes, joint frames and the inertia box, and it is worth using precisely
 * because `showBody` builds its mesh from `body.getGeometry()` -- the shape the
 * solver holds, not the mesh the renderer draws. That is what makes it evidence
 * rather than a second copy of the picture: the sword is five meshes and three
 * boxes, and only one of those two facts is visible in the normal view. The
 * other half is drawn here, because it is about *commands* rather than about
 * bodies: where the anchor was told to be, where the hand actually got to, where
 * the inverse kinematics put the elbow, and what the last few contacts were.
 *
 * The viewer renders into a `UtilityLayerRenderer` -- a second scene with its
 * own camera -- so nothing it creates appears in `scene.meshes`, which
 * conveniently keeps it out of the shadow render list and out of the readout's
 * mesh count for free. It is handed an explicit `null` layer so that it builds
 * and owns one instead of borrowing the shared default, because a layer it owns
 * is a layer its `dispose()` tears down again. That matters here: this overlay
 * is toggled, and a toggle that leaks is a toggle that changes the thing it is
 * supposed to be measuring.
 *
 * The meshes drawn *here* do go into the main scene, are named `rig.*` so
 * `refreshShadowCasters` skips them by the prefix rule it already applies to
 * `aim.` and `target.`, and are disposed outright on toggle-off rather than
 * merely hidden -- so that "off" is genuinely off and `audit()` can pin a mesh
 * count as well as a body count.
 */
export class RigView {
  private readonly scene: Scene;
  /**
   * Every fighter in the ring, each beside the combat that watches its blade.
   *
   * All of it is drawn for both sides, because an instrument that could only be
   * pointed at one of two identical things would be answering "what is my
   * fighter doing" when the question in a bout is "what is happening". The three
   * *numbers*, though, describe one arm alone: they are one arm's diagnostics,
   * they are what `config.ts`'s arm tables were measured with, and doubling them
   * would make the panel unreadable to say something nobody has asked yet.
   *
   * **Which arm was session 07's to decide, and it decided: the one being
   * driven.** Every other number in the readout -- the tip-speed gauge, the edge
   * alignment -- already follows the player, so leaving these three pinned to the
   * left fighter would have made the panel describe two different bodies at once
   * the first time somebody pressed `C`, silently, with no mark on it. `update`
   * takes the side and the readout carries it, so the panel names its own
   * subject. It falls back to the first entry when nobody is driving, which is
   * the same fighter the camera takes in that case.
   */
  private sides: { fighter: Fighter; combat: Combat }[] = [];
  /** The side the three numbers are currently describing. */
  private reporting: Side | null = null;

  private visible = false;
  private viewer: PhysicsViewer | null = null;
  private drawn: Drawn[] = [];

  /** Exactly what the viewer is currently showing, so it can be undone. */
  private readonly shownBodies: PhysicsBody[] = [];
  private readonly shownConstraints: PhysicsConstraint[] = [];
  /** A cheap fingerprint of the set the viewer *ought* to be showing. */
  private viewerStamp = -1;
  /** Bumped whenever the bout is rebuilt, so the fingerprint changes with it. */
  private epoch = 0;

  /** Costume pieces this overlay hid, so exactly those can be put back. */
  private readonly hidden: AbstractMesh[] = [];

  private readonly materials: StandardMaterial[] = [];

  private readonly reading: RigReadout = {
    errorMm: 0,
    elbowDriftMm: 0,
    tipSpeed: 0,
    side: "left",
  };

  /**
   * The elbow's recent travel, as per-frame steps stamped with the time they
   * were taken. Summed over the last second this is the "elbow drift" the
   * config's pole-vector table quotes: 127 mm with the hand completely still was
   * the rope, and 0 mm is what the pole vector bought. A live reading of the same
   * quantity means the next regression does not need the harness again.
   *
   * It is taken from the **real** elbow -- the hinge between the upper arm and
   * the forearm -- and not from the elbow anchor, which is the mistake that was
   * nearly made here. `driveElbow` keyframes the anchor onto its analytic
   * solution every step whether or not the arm follows, so an anchor-derived
   * drift reads a flat zero even with `arm.elbowPoleForce` set to zero, which is
   * precisely the configuration that produced the rope. A number that cannot go
   * wrong when the thing it measures is broken is not an instrument.
   */
  private readonly driftSteps: { at: number; step: number }[] = [];
  private driftClock = 0;
  private hasElbow = false;

  private errorLow = Color3.Green();
  private errorHigh = Color3.Red();

  private readonly scratch = {
    shoulderLocal: new Vector3(),
    shoulder: new Vector3(),
    anchor: new Vector3(),
    hand: new Vector3(),
    elbow: new Vector3(),
    elbowLocal: new Vector3(),
    elbowActual: new Vector3(),
    lastElbow: new Vector3(),
    pole: new Vector3(),
    axis: new Vector3(),
    offset: new Vector3(),
    // One shared pair of endpoints for every two-point line. `CreateLines` with
    // an `instance` copies the points straight into the vertex buffer as it is
    // called, so the same array can be filled and handed over again for the next
    // line in the same frame.
    pair: [new Vector3(), new Vector3()],
    triple: [new Vector3(), new Vector3(), new Vector3()],
  };

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Point the overlay at a bout.
   *
   * Both fighters are rebuilt on every reset, and this holds handles on their
   * bodies and their constraints, so it has to be told -- before the next frame
   * is drawn, or it syncs a freed constraint. It must also be **down** when it is
   * told, because taking it down is what hands those handles back, and the
   * caller is the one that knows whether the old bodies are still alive. The
   * defensive `hide` here is for the caller who forgets; `main.ts` takes the
   * overlay down before it disposes anything, which is the order that works.
   */
  attach(sides: { fighter: Fighter; combat: Combat }[]): void {
    if (this.visible) this.hide();
    this.sides = sides;
    this.epoch += 1;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;

    // The costume comes off, both of them. Drawing armour and capsules on top of
    // each other is how you end up believing the armour, which is the exact
    // failure this instrument exists to make impossible. Asked for by identity
    // rather than found by a name prefix, because a fighter knows what it is
    // wearing and a string match only knows what things are called.
    for (const side of this.sides) {
      for (const mesh of side.fighter.costume) {
        if (!mesh.isVisible) continue;
        mesh.isVisible = false;
        this.hidden.push(mesh);
      }
    }

    // An explicit `null` rather than an omitted argument: the constructor
    // defaults this parameter to the *shared* `DefaultUtilityLayer`, and a
    // default parameter only fires for `undefined`. Only `null` makes the viewer
    // build a layer of its own, which is the one its `dispose()` will take down
    // again. The cast is because the published signature says the parameter is
    // optional rather than nullable, while the implementation tests it for
    // truthiness -- there is no honest type for "pass null on purpose".
    this.viewer = new PhysicsViewer(
      this.scene,
      CONFIG.rigView.jointAxesScale,
      null as unknown as UtilityLayerRenderer,
    );
    this.viewerStamp = -1;
    this.syncViewer();

    this.build();

    this.driftSteps.length = 0;
    this.driftClock = 0;
    this.hasElbow = false;
    this.reading.errorMm = 0;
    this.reading.elbowDriftMm = 0;
    this.reading.tipSpeed = 0;
    // Forgotten on purpose, so the first `update` after the overlay comes back
    // up takes the subject afresh rather than trusting one from before it went
    // down -- during which the player may well have changed bodies.
    this.reporting = null;
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;

    this.teardownViewer();

    for (const drawn of this.drawn) {
      for (const slot of drawn.contacts) {
        slot.ball.dispose();
        slot.velocity.dispose();
        slot.edge.dispose();
      }
      const { anchorX, anchorY, anchorZ, error, aim, chain, pole, elbow } = drawn;
      for (const mesh of [anchorX, anchorY, anchorZ, error, aim, chain, pole, elbow]) mesh.dispose();
    }
    this.drawn.length = 0;
    for (const material of this.materials) material.dispose();
    this.materials.length = 0;

    for (const mesh of this.hidden) mesh.isVisible = true;
    this.hidden.length = 0;
  }

  /** Null while the overlay is down, so the readout knows to drop its panel. */
  readout(): RigReadout | null {
    return this.visible ? this.reading : null;
  }

  /**
   * The pin that stands in for a test.
   *
   * `tests/` cannot run Babylon, so the boundary that matters most about this
   * overlay -- that it creates no body, no shape and no constraint -- cannot be
   * asserted where the rest of the rules are asserted. It is asserted here
   * instead, in the page, against the physics engine's own body list rather than
   * against a mesh count that would answer the wrong question. The mesh count is
   * checked beside it because the overlay's own meshes are the thing most likely
   * to leak across a toggle, and a debug view that grows the scene every time you
   * press its key is a debug view that eventually changes the frame rate it is
   * being used to read.
   *
   * Ten cycles by default, which is the acceptance criterion the session was
   * written against. Whatever state the overlay was in is restored before the
   * comparison is made, so a failure still leaves a usable page.
   */
  audit(cycles = 10): RigAudit {
    const wasVisible = this.visible;
    if (wasVisible) this.hide();

    const bodies = this.bodyCount();
    const meshes = this.scene.meshes.length;
    for (let i = 0; i < cycles; i += 1) {
      this.show();
      this.hide();
    }
    const bodiesAfter = this.bodyCount();
    const meshesAfter = this.scene.meshes.length;

    if (wasVisible) this.show();

    if (bodiesAfter !== bodies) {
      throw new Error(
        `rig overlay changed the physics body count: ${bodies} before, ${bodiesAfter} after ${cycles} toggles`,
      );
    }
    if (meshesAfter !== meshes) {
      throw new Error(
        `rig overlay leaked meshes: ${meshes} before, ${meshesAfter} after ${cycles} toggles`,
      );
    }
    return { bodies, meshes, cycles };
  }

  /**
   * Draw one frame.
   *
   * Everything read here is read through `computeWorldMatrix(true)`, which is not
   * belt and braces: `getWorldMatrix()` short-circuits on the render id, so a
   * reading taken outside the render pass -- which this is, since it runs before
   * `scene.render()` -- silently freezes at whatever it was the first time it was
   * asked. Whole console sweeps have come back as exactly 0.0 for this reason.
   */
  /**
   * @param driving which fighter the three numbers should describe, or null when
   *   nobody is driving one -- in which case it falls back to the first side,
   *   the same one the camera takes.
   */
  update(dt: number, driving: Side | null = null): void {
    if (!this.visible) return;
    this.syncViewer();

    const subject = driving ?? this.sides[0]?.fighter.side ?? "left";
    if (subject !== this.reporting) {
      this.reporting = subject;
      // The drift figure is a *windowed path length*, so a subject that changed
      // mid-window would fold the distance between two different fighters'
      // elbows into it -- two and a half metres, once, reported as a millimetre
      // reading of one arm's steadiness. Start the window again, and let the
      // panel show the same zeros it shows when the overlay has just come up.
      this.driftSteps.length = 0;
      this.driftClock = 0;
      this.hasElbow = false;
      this.reading.errorMm = 0;
      this.reading.elbowDriftMm = 0;
      this.reading.tipSpeed = 0;
      this.reading.side = subject;
    }

    for (const drawn of this.drawn) {
      this.drawSide(drawn, dt, drawn.fighter.side === subject);
    }
  }

  private drawSide(drawn: Drawn, dt: number, reporting: boolean): void {
    const R = CONFIG.rigView;
    const s = this.scratch;
    const fighter = drawn.fighter;

    const torsoWorld = fighter.torso.mesh.computeWorldMatrix(true);
    const anchorWorld = fighter.handAnchor.mesh.computeWorldMatrix(true);
    const upperWorld = fighter.upperArm.mesh.computeWorldMatrix(true);
    fighter.hand.mesh.computeWorldMatrix(true);
    fighter.elbowAnchor.mesh.computeWorldMatrix(true);
    fighter.sword.root.computeWorldMatrix(true);

    s.anchor.copyFrom(fighter.handAnchor.mesh.absolutePosition);
    s.hand.copyFrom(fighter.hand.mesh.absolutePosition);
    // Two elbows, and the distance between them is the whole point of drawing
    // either. `s.elbow` is where `driveElbow` *asked* for one: the elbow anchor is
    // keyframed onto its analytic solution every step, and the solver syncs an
    // animated body's transform back to its node, so this is that solution read
    // out of the solver rather than recomputed from the same inputs.
    s.elbow.copyFrom(fighter.elbowAnchor.mesh.absolutePosition);
    // `s.elbowActual` is where the arm's elbow actually is -- the hinge, which the
    // elbow joint pins at the upper arm's local -Y end. The pole drive is a weak
    // orientation motor and is meant to be outvoted by the grip, so these two
    // never coincide exactly, and how far apart they sit is the reading.
    s.elbowLocal.set(0, -CONFIG.arm.upperLength / 2, 0);
    Vector3.TransformCoordinatesToRef(s.elbowLocal, upperWorld, s.elbowActual);

    // The shoulder in world space. `Fighter` keeps its own copy of this offset
    // privately, so it is rebuilt here from the same three config numbers and the
    // torso centre the fighter publishes -- a duplicate, and worth naming as one:
    // if the shoulder ever moves, this moves with it only because it is derived
    // from the same constants rather than from a copied literal.
    const F = CONFIG.fighter;
    s.shoulderLocal.set(F.shoulderSide, F.shoulderHeight - fighter.torsoCentre, F.shoulderFront);
    Vector3.TransformCoordinatesToRef(s.shoulderLocal, torsoWorld, s.shoulder);

    // ---- the anchor cross ----
    const cross = R.crossSize;
    s.pair[0].copyFrom(s.anchor);
    s.pair[1].copyFrom(s.anchor).addInPlaceFromFloats(
      anchorWorld.m[0] * cross,
      anchorWorld.m[1] * cross,
      anchorWorld.m[2] * cross,
    );
    drawn.anchorX = this.redraw(drawn.anchorX, s.pair);

    s.pair[1].copyFrom(s.anchor).addInPlaceFromFloats(
      anchorWorld.m[4] * cross,
      anchorWorld.m[5] * cross,
      anchorWorld.m[6] * cross,
    );
    drawn.anchorY = this.redraw(drawn.anchorY, s.pair);

    s.pair[1].copyFrom(s.anchor).addInPlaceFromFloats(
      anchorWorld.m[8] * cross,
      anchorWorld.m[9] * cross,
      anchorWorld.m[10] * cross,
    );
    drawn.anchorZ = this.redraw(drawn.anchorZ, s.pair);

    // ---- commanded versus achieved ----
    const error = Vector3.Distance(s.anchor, s.hand);
    s.pair[0].copyFrom(s.anchor);
    s.pair[1].copyFrom(s.hand);
    drawn.error = this.redraw(drawn.error, s.pair);
    Color3.LerpToRef(
      this.errorLow,
      this.errorHigh,
      Math.min(1, error / Math.max(R.errorSpan, 1e-6)),
      drawn.error.color,
    );

    // ---- what the arm was asked for ----
    // `targetPosition()` is the hand target at `reach`, which is a shorter and
    // different thing from the aim indicator's projection: the indicator stakes
    // out where the *point of the blade* is being sent, and this is where the
    // *hand* is being sent. Drawing the indicator's line here instead would show
    // a segment the arm is not being asked for.
    const target = fighter.targetPosition();
    s.pair[0].copyFrom(s.shoulder);
    s.pair[1].copyFrom(target);
    drawn.aim = this.redraw(drawn.aim, s.pair);

    // The arm the inverse kinematics asked for, as a kinked line through the
    // commanded elbow. A lone dot in mid-air is not readable, and the kink is; the
    // ball then marks where the real elbow ended up, so the two are read against
    // each other rather than one at a time.
    s.triple[0].copyFrom(s.shoulder);
    s.triple[1].copyFrom(s.elbow);
    s.triple[2].copyFrom(target);
    drawn.chain = this.redraw(drawn.chain, s.triple);
    drawn.elbow.position.copyFrom(s.elbowActual);

    // And the pole vector the elbow came from, in world space.
    const P = CONFIG.arm.elbowPole;
    s.pole.set(P.x, P.y, P.z);
    Vector3.TransformNormalToRef(s.pole, torsoWorld, s.pole);
    s.pole.normalize();
    s.offset.copyFrom(s.pole).scaleInPlace(R.poleLength);
    s.pair[0].copyFrom(s.shoulder);
    s.pair[1].copyFrom(s.shoulder).addInPlace(s.offset);
    drawn.pole = this.redraw(drawn.pole, s.pair);

    const anchorsOn = R.anchors;
    for (const mesh of [drawn.anchorX, drawn.anchorY, drawn.anchorZ, drawn.error]) {
      mesh.setEnabled(anchorsOn);
    }
    for (const mesh of [drawn.aim, drawn.chain, drawn.pole]) mesh.setEnabled(anchorsOn);
    drawn.elbow.setEnabled(anchorsOn);

    this.drawContacts(drawn);

    if (!reporting) return;

    // ---- the three numbers ----
    if (this.hasElbow) {
      this.driftClock += dt;
      this.driftSteps.push({
        at: this.driftClock,
        step: Vector3.Distance(s.lastElbow, s.elbowActual),
      });
    }
    s.lastElbow.copyFrom(s.elbowActual);
    this.hasElbow = true;

    const cutoff = this.driftClock - R.driftWindow;
    while (this.driftSteps.length > 0 && this.driftSteps[0].at < cutoff) this.driftSteps.shift();
    let travel = 0;
    for (const sample of this.driftSteps) travel += sample.step;

    this.reading.errorMm = error * 1000;
    this.reading.elbowDriftMm = travel * 1000;
    this.reading.tipSpeed = fighter.sword.tipSpeed();
  }

  /**
   * The last few contacts, newest first.
   *
   * `combat.log` keeps twenty-four and this draws the first several of them, each
   * as the point itself, the blade's velocity there, and the edge axis at that
   * instant. The edge is drawn symmetrically because the blade is double-edged:
   * both -X and +X cut, so a one-sided arrow would claim a distinction the damage
   * model does not make.
   */
  private drawContacts(drawn: Drawn): void {
    const R = CONFIG.rigView;
    const s = this.scratch;
    const log = drawn.combat.log;
    const showing = R.contacts ? Math.min(drawn.contacts.length, log.length) : 0;

    for (let i = 0; i < drawn.contacts.length; i += 1) {
      const slot = drawn.contacts[i];
      if (i >= showing) {
        slot.ball.setEnabled(false);
        slot.velocity.setEnabled(false);
        slot.edge.setEnabled(false);
        continue;
      }
      const hit = log[i];
      slot.ball.setEnabled(true);
      slot.velocity.setEnabled(true);
      slot.edge.setEnabled(true);
      slot.ball.position.copyFrom(hit.point);

      s.offset.copyFrom(hit.velocity).scaleInPlace(R.contactVelocityScale);
      s.pair[0].copyFrom(hit.point);
      s.pair[1].copyFrom(hit.point).addInPlace(s.offset);
      slot.velocity = this.redraw(slot.velocity, s.pair);

      s.axis.copyFrom(hit.edge).scaleInPlace(R.contactEdgeLength);
      s.pair[0].copyFrom(hit.point).subtractInPlace(s.axis);
      s.pair[1].copyFrom(hit.point).addInPlace(s.axis);
      slot.edge = this.redraw(slot.edge, s.pair);
    }
  }

  /**
   * Keep `PhysicsViewer` showing the set it ought to be showing.
   *
   * Four things change that set: the `shapes` and `joints` sub-toggles, a limb
   * coming off (which disposes the constraint that held it), a sword arm being
   * lost (which disposes the grip and the pole drive along with it), and a reset
   * replacing both fighters outright. All of them are folded into one integer,
   * and the whole set is rebuilt when it moves. Rebuilding wholesale rather than
   * differencing is the deliberate choice: `hideConstraint` in this version of
   * Babylon both splices the entry out *and* then swaps the last entry into the
   * hole it just closed, which corrupts the list unless the entry being removed
   * happens to be the last one -- so constraints are always taken down from the
   * end, and taken down together.
   *
   * The alternative was leaving a shown constraint in place after `sever`
   * disposes it. The viewer's per-frame sync checks bodies for disposal and does
   * not check constraints, so that reads a freed handle once a frame, forever.
   */
  private syncViewer(): void {
    if (!this.viewer) return;
    const R = CONFIG.rigView;

    let severed = 0;
    let disarmed = 0;
    for (const side of this.sides) {
      for (const limb of side.fighter.limbs) if (limb.severed) severed += 1;
      if (!side.fighter.armed) disarmed += 1;
    }
    const stamp =
      (R.shapes ? 1 : 0) +
      (R.joints ? 2 : 0) +
      (R.anchors ? 4 : 0) +
      disarmed * 8 +
      severed * 32 +
      this.epoch * 4096;
    if (stamp === this.viewerStamp) return;
    this.viewerStamp = stamp;

    for (let i = this.shownConstraints.length - 1; i >= 0; i -= 1) {
      this.viewer.hideConstraint(this.shownConstraints[i]);
    }
    this.shownConstraints.length = 0;
    for (const body of this.shownBodies) this.viewer.hideBody(body);
    this.shownBodies.length = 0;
    for (const side of this.sides) this.viewer.hideInertia(side.fighter.sword.body);

    if (R.shapes) {
      for (const side of this.sides) {
        const fighter = side.fighter;
        for (const limb of fighter.limbs) this.shownBodies.push(limb.part.body);
        this.shownBodies.push(fighter.sword.body);
        // The two control frames are bodies like any other and it is worth
        // seeing that they exist at all -- they are two-centimetre spheres that
        // collide with nothing, which is exactly the sort of thing you stop
        // believing in.
        if (R.anchors) this.shownBodies.push(fighter.handAnchor.body, fighter.elbowAnchor.body);
      }
      // The arena is left out on purpose. The ground is a sixty-metre box and its
      // debug mesh would sit over the whole view; the posts are decoration whose
      // shape is their render mesh. Neither is a thing anyone is going to
      // disbelieve, which is the test for whether it earns a place here.
      for (const body of this.shownBodies) this.viewer.showBody(body);

      // The swords' inertia boxes, which are the ones worth drawing: the
      // transverse and roll moments differ by about three orders of magnitude,
      // and that ratio is the entire reason `arm.gripAngularDamping` has to be
      // scaled by the principal moments before it is applied.
      for (const side of this.sides) this.viewer.showInertia(side.fighter.sword.body);
    }

    // Every joint of both fighters, the sword arm's included -- which is new, and
    // is the whole of what the layer was missing. Three of the arm's four arrive
    // through `limb.attachment`, because the shoulder, the elbow hinge and the
    // wrist are each what holds a severable piece on; the grip and the elbow's
    // pole drive are not attachments of anything and are asked for by name. They
    // are only reachable at all because `Fighter` publishes them: a
    // `Physics6DoFConstraint` registers itself nowhere, a `PhysicsBody` cannot be
    // asked what constrains it, and the V2 engine keeps no list.
    if (R.joints) {
      for (const side of this.sides) {
        for (const limb of side.fighter.limbs) {
          if (limb.severed || !limb.attachment) continue;
          this.shownConstraints.push(limb.attachment);
        }
        // Both go the moment any piece of the arm is cut off, and a shown
        // constraint that has been disposed is read once a frame, forever.
        if (side.fighter.armed) {
          this.shownConstraints.push(side.fighter.grip, side.fighter.elbowDrive);
        }
      }
      for (const constraint of this.shownConstraints) this.viewer.showConstraint(constraint);
    }
  }

  private teardownViewer(): void {
    if (!this.viewer) return;
    // Constraints first, from the end, and by hand: `dispose()` takes down
    // impostors, bodies and inertia meshes but walks straight past the constraint
    // list, so a constraint left shown here leaks both its meshes and the
    // before-render function that syncs them, once per toggle, forever.
    for (let i = this.shownConstraints.length - 1; i >= 0; i -= 1) {
      this.viewer.hideConstraint(this.shownConstraints[i]);
    }
    this.shownConstraints.length = 0;
    this.viewer.dispose();
    this.viewer = null;
    this.shownBodies.length = 0;
    this.viewerStamp = -1;
  }

  private bodyCount(): number {
    // `IPhysicsEngine` is the version-agnostic interface and does not carry a
    // body list; the V2 engine this build runs does. The cast is narrowing to the
    // engine that is actually there rather than widening to one that might be.
    const engine = this.scene.getPhysicsEngine() as PhysicsEngineV2 | null;
    return engine ? engine.getBodies().length : 0;
  }

  private build(): void {
    const R = CONFIG.rigView;
    this.errorLow = colour(R.colours.errorLow);
    this.errorHigh = colour(R.colours.errorHigh);

    // One material per colour, shared by both sides' glyphs. The two fighters
    // are drawn in the same colours on purpose: the overlay says what the solver
    // is doing, and which body it is doing it to is answered by where the lines
    // are, which is unambiguous. Colouring the sides differently would spend the
    // legend on a question the picture already answers.
    const markerMaterial = this.glow("rig.marker", R.colours.elbow);
    const contactMaterial = this.glow("rig.contactGlow", R.colours.contact);
    const depth = Math.max(1, Math.min(24, Math.round(R.contactHistory)));

    for (const side of this.sides) {
      const tag = side.fighter.side;
      const at = side.fighter.handAnchor.mesh.absolutePosition;
      const pair = [at.clone(), at.clone()];
      const triple = [at.clone(), at.clone(), at.clone()];

      const elbow = MeshBuilder.CreateSphere(
        `rig.${tag}.elbow`,
        { diameter: R.markerSize, segments: 8 },
        this.scene,
      );
      this.dress(elbow);
      elbow.material = markerMaterial;

      const slots: ContactSlot[] = [];
      for (let i = 0; i < depth; i += 1) {
        const ball = MeshBuilder.CreateSphere(
          `rig.${tag}.contact${i}`,
          { diameter: R.markerSize * 0.8, segments: 6 },
          this.scene,
        );
        this.dress(ball);
        ball.material = contactMaterial;
        slots.push({
          ball,
          velocity: this.line(`rig.${tag}.contactVelocity${i}`, pair, R.colours.contactVelocity),
          edge: this.line(`rig.${tag}.contactEdge${i}`, pair, R.colours.contactEdge),
        });
      }

      this.drawn.push({
        fighter: side.fighter,
        combat: side.combat,
        anchorX: this.line(`rig.${tag}.anchorX`, pair, R.colours.axisX),
        anchorY: this.line(`rig.${tag}.anchorY`, pair, R.colours.axisY),
        anchorZ: this.line(`rig.${tag}.anchorZ`, pair, R.colours.axisZ),
        error: this.line(`rig.${tag}.error`, pair, R.colours.errorLow),
        aim: this.line(`rig.${tag}.aim`, pair, R.colours.aim),
        chain: this.line(`rig.${tag}.chain`, triple, R.colours.chain),
        pole: this.line(`rig.${tag}.pole`, pair, R.colours.pole),
        elbow,
        contacts: slots,
      });
    }
  }

  private glow(name: string, rgb: number[]): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.emissiveColor = colour(rgb);
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.disableLighting = true;
    this.materials.push(material);
    return material;
  }

  private line(name: string, points: Vector3[], rgb: number[]): LinesMesh {
    const mesh = MeshBuilder.CreateLines(name, { points, updatable: true }, this.scene);
    mesh.color = colour(rgb);
    mesh.alpha = CONFIG.rigView.alpha;
    this.dress(mesh);
    return mesh;
  }

  /** Rebuilding a line every frame allocates a mesh every frame; `instance`
   *  rewrites the vertex buffer in place instead, which is what `aim.ts` does
   *  for the same reason. The call returns the instance it was handed. */
  private redraw(mesh: LinesMesh, points: Vector3[]): LinesMesh {
    return MeshBuilder.CreateLines(mesh.name, { points, instance: mesh }, this.scene);
  }

  private dress(mesh: Mesh): void {
    mesh.isPickable = false;
    mesh.renderingGroupId = OVERLAY_GROUP;
  }
}
