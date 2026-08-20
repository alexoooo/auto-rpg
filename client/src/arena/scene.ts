// Three cameras, one scene, one canvas -- and a body made of exactly what the
// contact phase swept.
//
// **3D here rather than a third hand-drawn projection, on purpose, and the
// reason is occlusion.** A flat panel resolves overlap by painting back to
// front, which sorts whole shapes: that is what `fight/view.ts` does with two
// poses at different depths, and it is correct there. Here the shapes
// interpenetrate constantly -- an arm through a torso, a shield across a chest
// -- and a sort over whole capsules has no answer for a pair that is both in
// front of and behind the other, at exactly the ticks this panel exists for. A
// depth buffer settles that per pixel and is correct by construction.
//
// The 3/4 view gives up the shared scale the flat pair is built on, and earns it
// back by answering the one question they cannot: did the plate cover the club
// *from where the club was coming*? The plan and the elevation say where both
// were; only a view down the attack says whether one hid the other, which is
// what made v2-20's shield height a decision taken on this page rather than an
// argument about it.
//
// **Why one engine and not three.** A Babylon `Scene` belongs to one engine, so
// a canvas and an engine per panel means building every mesh three times and
// stepping three scene graphs from one pose stream. Three WebGL contexts is
// within the browser's budget; three copies of this scene is not within this
// page's. So the three panels are three `camera.viewport` rectangles of a single
// context, which is why `web/index.html` puts one canvas across the left and
// middle columns and says in a comment that they must stay contiguous. If a
// later design wants them apart, the fallback is one offscreen engine rendered
// three times and blitted with `drawImage` -- more code, one more copy, the same
// scene. Do not reach for it without a reason.
//
// **What `[Geometry]` is for.** Every shape here is one the simulation
// published: five region capsules at their published radii, hand spheres,
// weapon capsules from hilt to tip, and the shield face rebuilt through
// `shieldCorners()` -- the same four points the 2D panels draw. Nothing is
// modelled, smoothed or filled in. That is what makes this mode the control on
// v2-ui-03: when the proxy character disagrees with the capsules, this is what
// says so, and a mode that had quietly improved on the capsules could not.
//
// **`ActorPresentation` is followed, not reused.** It instances one cylinder per
// unit out of a tile-map-and-units snapshot with no articulated content in it.
// Its shape is right and is copied here -- a source-mesh registry keyed by
// archetype, create/pose/retire against a live key set, counts published to the
// debug registry -- over roughly twenty nodes a body instead of one.
//
// **What `[Texture]` adds, and where the line is.** v2-ui-03 dresses the same
// scene: PBR materials, a key light, a shadow generator and the authored room
// under `arena/environment.ts`, over a proxy body built out of the same published
// rows. Published quantities place things and invented quantities only fill
// between them -- a hand is where the pose says, an elbow is a guess, and a knee
// is a guess about a guess -- so every invented degree of freedom is named at the
// place that invents it, in `geometry.ts` beside the argument for the choice.
//
// **The two modes are one scene and one set of cameras.** Pressing the buttons
// swaps which meshes hang under the rig and turns the environment and the shadow
// casting on or off; it builds no engine, no camera and no scene, and it does not
// touch the transport. What it cannot do is swap materials alone, which is what
// v2-ui-03 asked for: `[Geometry]` draws the published capsules and `[Texture]`
// draws an elbowed arm and two legs, and those are not the same shapes. That
// difference *is* the control -- a `[Texture]` that had quietly kept drawing the
// capsules would agree with `[Geometry]` about everything, including the things
// it got wrong.

import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { buildRigNodes } from "../render/rig-nodes.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
// Every module that calls `createInstance` has to repeat this side-effect
// import; the type-only import beside it does not carry it.
import "@babylonjs/core/Meshes/instancedMesh.js";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh.js";

import type { FightFrame, FightHeader } from "../fight/source.js";
import {
  add, at, length, scale, share, type Pose, type Projectile, type ShieldFace, type V3,
} from "../fight/trace.js";
import { bodyColours, contactColour } from "../fight/view.js";
import {
  createRendererEngine, rendererBackendFromSearch,
  type RendererBackendRequest, type RendererEngineHandle, type RendererEngineLifecycle,
} from "../render/engine.js";
import { createBabylonRightHandedScene } from "../render/scene.js";
import { RendererDebugRegistry } from "../render/debug.js";
import type { RoomAssetFetcher } from "../render/room-assets.js";
import {
  loadCombatantAsset, type CombatantAsset, type CombatantAssetFetcher,
} from "../render/combatant-assets.js";
import {
  combatantMeshRole, copyCombatantRigPose, instantiateCombatantDress, type CombatantDress,
} from "../render/combatant-dress.js";
import { ArenaEnvironment } from "./environment.js";
import type { SideChoice } from "./picker.js";
import { createCombatantPreview, type CombatantPreview } from "./preview.js";
import {
  createStageCamera, type StageCamera, type StageCameraBasis, type StageCameraMode,
} from "./stage-camera.js";
import {
  ARENA_VIEWPORTS, ARM_REGIONS, FAR_PLANE, FIRST_PERSON_FOV_DEGREES, FIRST_PERSON_PITCH_DEGREES,
  FOREARM_REGIONS,
  NEAR_PLANE, OWN_BODY_HIDDEN_REGIONS, RIG_CLIPS, RIG_REGIONS, THREE_QUARTER_FOV_DEGREES,
  armDrawn, blendPose, bodyAxes, capsuleBetween, capsuleCentre, capsuleParts, directionFrame,
  elbowOf, eyeOf, gaitOf, legsOf, regionDrawn, scenePoint, sceneLength, sceneYaw, segmentFrame,
  shieldLimb, shieldQuad, shieldSocketFrame, weaponSocketFrame, yawFrame,
  type CapsuleParts, type Frame3, type Gait, type ScenePoint,
} from "./geometry.js";
import type { ArenaPromotedView } from "./geometry.js";

/** The one owner name this module publishes counts under. */
const DEBUG_OWNER = "arena-geometry";

const ONE = 65536;
const DEGREES = Math.PI / 180;

/**
 * One bit a camera, so a body can be hidden from its own eyes and from nothing
 * else. A mesh renders in a camera when `mesh.layerMask & camera.layerMask` is
 * nonzero, which makes "everything" the union rather than a magic constant.
 */
export const CAMERA_BITS = [0x1, 0x2, 0x4] as const;
const ALL_CAMERAS = CAMERA_BITS[0] | CAMERA_BITS[1] | CAMERA_BITS[2];

/** The page's own background, so the three panels sit on the 2D panels' ground. */
const CLEAR_COLOUR = new Color4(11 / 255, 15 / 255, 20 / 255, 1);

/**
 * `[Texture]`'s background, exposure and contrast: the authored room's own.
 *
 * The same three numbers `applyAuthoredRoomLighting` writes in
 * `render/room-review.ts`, because they are what the owner accepted against the
 * legacy renderer reference on 2026-08-09 and a second set of hand-picked values
 * beside them would be two answers to one question. Restored to the flat pair
 * above when the mode goes back to `[Geometry]`, which has no lighting model for
 * an exposure curve to act on.
 */
const ROOM_CLEAR_COLOUR = new Color4(0.012, 0.016, 0.032, 1);
const ROOM_EXPOSURE = 1.34;
const ROOM_CONTRAST = 1.16;

/** `drawChrome`'s grey, so the floor reads as the same ruler in every panel. */
const GRID_COLOUR = Color3.FromHexString("#1e2733");

/**
 * Half the length of a contact's normal axis, in world units.
 *
 * **It has to reach out of the widest capsule it can be buried in the middle of**,
 * so it is that capsule's published *radius*: the Brute's torso, `radius` 0.400,
 * which is 0.800 across. This said 0.3 under a sentence that called 0.400 and
 * 0.350 the widths of the torso and the legs. They are the radii; read as widths
 * they imply a requirement of 0.200, which 0.3 comfortably met while falling a
 * quarter short of the real one.
 *
 * The requirement is a lower bound and the sweep is the actual justification.
 * Counting a marker as buried when its whole axis stays inside the union of every
 * capsule and hand sphere drawn that tick, over the **5703** weapon-body contacts
 * the three fixtures recorded when this was measured:
 *
 * | half-length | markers no camera can see |
 * |---|---|
 * | 0.30 | 1073 (18.8%) |
 * | 0.35 | 230 (4.0%) |
 * | **0.40** | **97 (1.7%)** |
 * | 0.50 | 16 (0.3%) |
 *
 * **The corpus is now 5512 and this sweep has not been re-run over it.**
 * `web/fight-learned.json` was re-recorded on 2026-08-11 and carries 2099
 * weapon-body contacts where it carried 2290; the other two are unchanged at
 * 1061 and 2352, re-derived under this note. Superseded rather than edited,
 * because a sweep is a measurement and re-running one is the work of a session
 * that wants the answer, not a number to quietly restate -- and nothing about
 * the choice turns on it: the lower bound above is a published radius and the
 * two fixtures that fix 3413 of the 5512 contacts did not move.
 *
 * The residual is contacts inside a stack of overlapping capsules -- an arm
 * against a torso with a club through both -- and the longest escape any of them
 * needs is 0.924, half a body. Buying the last 1.7% at that price is what the
 * second half of the old sentence was right about: a tick can carry nine
 * contacts, and eighteen lines nearly two units long through two bodies is a
 * thicket rather than a picture. That last trade is a judgement and is not
 * tested; `a_contact_axis_clears_the_widest_capsule_the_simulation_publishes`
 * pins the lower bound, against a capsule built at the Brute's published radius.
 */
const CONTACT_AXIS = 0.4;

type SourceShape = "sphere" | "cylinder" | "box";

/** Which mode is on the screen. The mode is a property of the scene, not of a panel. */
export type ArenaMode = "geometry" | "texture";

/**
 * A colour, a name to cache it under, and how it answers a light.
 *
 * `lit: false` is `[Geometry]`'s flat emissive fill -- a shading model there
 * would flatter a shape the simulation never had. `lit: true` is `[Texture]`'s
 * PBR, where `metallic` and `roughness` are the only two knobs, because a
 * dressed body needs steel to read as steel beside cloth and neither of them is
 * a claim about the simulation.
 *
 * **Neither number is measured and neither could be.** A material is set by
 * looking at the picture, and the picture is on the owed list in
 * `docs/performance/v2-arena-matrix.md#owed-visual-judgements`; what is
 * written down instead is the one hard constraint they had to satisfy, at
 * {@link proxyPaint}.
 */
type Paint = Readonly<{
  key: string; colour: Color3; doubleSided: boolean;
  lit: boolean; metallic: number; roughness: number;
}>;

const paint = (key: string, hex: string, doubleSided = false): Paint =>
  Object.freeze({
    key, colour: Color3.FromHexString(hex), doubleSided,
    lit: false, metallic: 0, roughness: 1,
  });

/** The same colour, lit. Keyed apart from the flat one so a source is never shared. */
const dressed = (
  key: string, hex: string, metallic: number, roughness: number, doubleSided = false,
): Paint => Object.freeze({
  key: `lit:${key}`, colour: Color3.FromHexString(hex), doubleSided,
  lit: true, metallic, roughness,
});

/**
 * Every region gets its own shade of its body's colour, and it is not decoration.
 *
 * Flat unlit fill is the right material for this mode -- a shading model would
 * flatter shapes the simulation never had -- but one flat colour turns fourteen
 * published capsules into a single silhouette, and a silhouette cannot answer
 * the question this mode exists for: which region did that contact land on. So
 * the regions run along a fixed ramp between the body's own `region` and `edge`
 * colours in `regionNames` order, head lightest and legs darkest.
 *
 * It is a key rather than a light: nothing about it varies with the camera, so
 * the same tick is always the same colours in all three panels, and the ramp
 * position is the region index the readout names.
 */
function regionPaint(body: number, index: number, count: number): Paint {
  const colours = bodyColours(body);
  const dark = Color3.FromHexString(colours.region);
  const light = Color3.FromHexString(colours.edge);
  const mix = count <= 1 ? 0 : 1 - index / (count - 1);
  return Object.freeze({
    key: `body:${body}:region:${index}`,
    colour: Color3.Lerp(dark, light, mix * 0.75),
    doubleSided: false, lit: false, metallic: 0, roughness: 1,
  });
}

/**
 * The four dressed materials a proxy body wears.
 *
 * Out of `fight/view.ts`'s palette, exactly as the flat ones are, so "the blue
 * one" means one thing across all five panels in either mode. The two numbers
 * beside each are the whole of the material model: cloth is rough and barely
 * reflective, the blade is smooth and reflective, and the plate sits between
 * them because it is a painted board with a rim in every reading of it.
 *
 * **The metals are held well below 1 and that is a constraint rather than
 * taste.** A Babylon `PBRMaterial` at `metallic: 1` has no diffuse response at
 * all -- everything it shows is a reflection -- and this scene has no environment
 * texture to reflect, because an IBL cubemap is a megabyte of asset the arena has
 * no pipeline for and the authored room's own materials do not use one either.
 * At 0.9 the sword would be a black stick in front of a lit body. The room review
 * route the owner accepted on 2026-08-09 runs the same kit under direct lights
 * alone; this stays inside that.
 */
function proxyPaint(body: number): Readonly<{
  skin: Paint; trim: Paint; steel: Paint; plate: Paint;
}> {
  const colours = bodyColours(body);
  return Object.freeze({
    skin: dressed(`body:${body}:skin`, colours.region, 0, 0.82),
    trim: dressed(`body:${body}:trim`, colours.edge, 0.1, 0.6),
    steel: dressed(`body:${body}:steel`, colours.weapon, 0.25, 0.22),
    plate: dressed(`body:${body}:plate`, colours.shield, 0.3, 0.42, true),
  });
}

/**
 * One drawn node, and whether it went into the shadow generator's render list.
 *
 * The flag is not bookkeeping for its own sake, and it has exactly one reason:
 * `removeShadowCaster` is a linear scan of that list, so without it every one of
 * `[Geometry]`'s forty-odd meshes would scan all 139 casters on the frame it is
 * retired, to discover it was never one.
 *
 * **It used to claim a second reason and the second reason was false.** It said
 * the flag was what made "added and removed rather than toggled" checkable, on
 * the strength of a round trip that reads the render list back after a press.
 * That list empties whether or not `#retire` ever calls `removeShadowCaster`:
 * measured on Babylon 9.18.1, for a `Mesh` and an `InstancedMesh` alike,
 * `dispose()` already splices the mesh out of every shadow generator's render
 * list, and deleting the call in `#retire` leaves every test in
 * `render-contract.test.mjs` green. The call stays because pairing it with
 * `addShadowCaster` is the shape this registry follows and Babylon's disposal
 * behaviour is Babylon's to change, but it is belt and braces rather than the
 * thing that empties the list, and no comment here may say otherwise.
 */
type StageNode = Readonly<{ key: string; mesh: AbstractMesh; caster: boolean }>;

// ------------------------------------------------------- the combatant rig seam

/**
 * One body's named nodes, shared by the geometry proxy and authored dress.
 *
 * Every node here is placed from a **published** row -- the shoulder, the hand,
 * the hilt, the shield's centre -- with two exceptions that are named where they
 * are computed: `arm_*` and `hand_*` point along the invented elbow, because that
 * is what an upper-arm and a forearm bone are, and their *positions* are still
 * published to the raw unit.
 *
 * **Posed in both modes.** `[Geometry]` does not hang anything off these nodes --
 * it draws the published capsules in world space, unmediated, because a control
 * that went through the proxy's own rig would be wrong in exactly the ways the
 * rig was wrong and could not catch any of them -- but it poses them anyway, so
 * the rig is exercised on every frame the page draws rather than only in the mode
 * whose mistakes it would hide.
 */
type BodyRig = Readonly<{
  body: number;
  nodes: ReadonlyMap<string, TransformNode>;
  root: TransformNode;
}>;

/**
 * One body's rig plus the two invented quantities this tick's meshes need.
 *
 * Separate from {@link BodyRig} because the rig outlives the tick and these do
 * not: a gait and a pair of elbows stored on the retained rig would be last
 * frame's answers for anything that read them out of the registry, which is the
 * class of staleness `threeQuarterPlacement` refuses for the camera.
 */
type PosedBody = Readonly<{
  rig: BodyRig;
  /** The gait state this tick, which selects one of the four clip slots. */
  gait: Gait;
  /** The invented elbow of each limb, in scene space, kept for the meshes below. */
  elbows: readonly [ScenePoint, ScenePoint];
}>;

const SCRATCH_POSITION = new Vector3();
const SCRATCH_ROTATION = new Quaternion();

/**
 * Put a node where the world says, whatever its parent is doing.
 *
 * **Babylon composes a child's transform as `local * parent`**, so the local
 * rotation that produces a wanted world rotation is `inverse(parent) * world` --
 * `Quaternion.multiply` in that order. The order was settled by building a
 * two-node tree over a `NullEngine` and reading `absoluteRotationQuaternion`
 * back, rather than by reasoning about conventions, and
 * `the_proxy_rig_carries_the_durable_combatant_node_closure_and_hangs_them_off_published_points`
 * keeps it settled: it reads absolute positions and absolute axes off a rig three
 * levels deep, so an inverted composition fails rather than merely looking odd.
 *
 * A `null` frame means **this shape has no orientation worth writing** -- a
 * sphere -- and it inherits its parent's, which is what a hand's own hand sphere
 * should do anyway. It does not mean "face along the world axes".
 */
function placeWorld(node: TransformNode, at: ScenePoint, frame: Frame3 | null): void {
  if (frame === null) applyWorld(node, at, null);
  else applyWorld(node, at, Quaternion.FromRotationMatrixToRef(frameMatrix(frame), SCRATCH_ROTATION));
}

/**
 * The same, for a shape whose only constraint is which way its `+y` runs.
 *
 * `FromUnitVectorsToRef` is the **minimal** rotation taking `+y` onto the axis,
 * which is what every capsule shaft in this file used before the proxy arrived and
 * is deliberately still what it uses. A general frame would do just as well
 * geometrically and would not be the same picture: the source cylinder is a
 * `tessellation: 10` decagonal prism, so its facet phase is visible in
 * silhouette, and `[Geometry]` is the control -- its output has to be the output
 * it was checked as, not an equally valid rebuild of it.
 */
function alignWorld(node: TransformNode, at: ScenePoint, axis: ScenePoint): void {
  SCRATCH_DIRECTION.set(axis[0], axis[1], axis[2]);
  applyWorld(node, at,
    Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, SCRATCH_DIRECTION, SCRATCH_ROTATION));
}

/**
 * The one place a world transform becomes a local one.
 *
 * The parent's world matrix is forced current first, because both halves of this
 * divide it back out; and this node's is forced afterwards, because the next call
 * may be for its child, and `#poseRig` runs parents first for that reason.
 *
 * **What this does *not* do is make the parent carry the placement.** Every node
 * and every mesh here is written absolutely, so moving a rig node moves nothing
 * under it until the next `show` puts everything back where the published rows
 * say. That is the right shape for a proxy driven entirely from published points
 * -- there is no forward-kinematic chain to be the truth -- and it is the one
 * distinction from the authored dress: its meshes are skinned to their bones,
 * while the proxy seam is the *node set and its parenting*, not a transform
 * hierarchy that drives its geometry.
 */
function applyWorld(node: TransformNode, at: ScenePoint, world: Quaternion | null): void {
  node.rotationQuaternion ??= Quaternion.Identity();
  const parent = node.parent instanceof TransformNode ? node.parent : null;
  parent?.computeWorldMatrix(true);
  if (world === null) node.rotationQuaternion.copyFromFloats(0, 0, 0, 1);
  else if (parent === null) node.rotationQuaternion.copyFrom(world);
  else {
    Quaternion.InverseToRef(parent.absoluteRotationQuaternion, node.rotationQuaternion);
    node.rotationQuaternion.multiplyInPlace(world);
  }
  if (parent === null) node.position.set(at[0], at[1], at[2]);
  else {
    SCRATCH_POSITION.set(at[0], at[1], at[2]);
    node.setAbsolutePosition(SCRATCH_POSITION);
  }
  node.computeWorldMatrix(true);
}

const SCRATCH_MATRIX = Matrix.Identity();
const SCRATCH_DIRECTION = new Vector3();

/** A `Frame3`'s three axes as the rotation matrix Babylon reads rows out of. */
function frameMatrix(frame: Frame3): Matrix {
  Matrix.FromValuesToRef(
    frame.x[0], frame.x[1], frame.x[2], 0,
    frame.y[0], frame.y[1], frame.y[2], 0,
    frame.z[0], frame.z[1], frame.z[2], 0,
    0, 0, 0, 1, SCRATCH_MATRIX,
  );
  return SCRATCH_MATRIX;
}

/**
 * How long the published shield normal actually is, in units of one.
 *
 * **The published normal is not a unit vector and the plate is not built from a
 * unit vector either**, so a box scaled by `halfWidth` alone is not the face the
 * contact phase swept. `shield_face` (`crates/sim/src/combat/geometry.rs:119`,
 * mirrored in `client/src/fight/trace.ts`) builds the face from
 * `left = (-n.y, n.x, 0)` scaled by `half_width`, and `left` is as long as `n`
 * is; the front offset is `n * (thickness/2)` and carries it too. The `up` is
 * `Vec3::Z * half_height` and carries nothing, which is why only two of the three
 * extents are scaled here.
 *
 * Measured over the three recordings' 10542 published plates: `|n_z|` is **zero
 * on every one of them**, and `||n| - 65536|` reaches **1.2534** -- a relative
 * 1.9126e-5, worst at `fight-learned.json` tick 1332 with
 * `n = (-23051, -61347, 0)`. On a 0.25 half-width that is 4.8e-6 world units,
 * which is where the whole of the agreement check's worst reported gap came
 * from: reconstructed in double precision with no Babylon in the loop, the four
 * corner gaps at that row are 4.644e-6 / 4.308e-6 / 4.308e-6 / 4.644e-6 against
 * 1.907e-6 for every other swept quantity the sweep touches. **It was a
 * modelling disagreement wearing a float32 budget's clothes**, and this removes
 * the term rather than budgeting for it: with the length carried, the same
 * double-precision reconstruction over all 10542 plates tops out at 5.6e-17.
 *
 * The zero `n_z` is load-bearing for the box being the right shape at all, not
 * only the right size. A plate whose normal had a `z` component would publish an
 * `up` that is not perpendicular to it, so the swept quad would not be a
 * rectangle in any frame and no box could be it. Nothing publishes one.
 */
function plateNormalLength(shield: ShieldFace): number {
  return Math.hypot(shield.normal[0], shield.normal[1], shield.normal[2]) / ONE;
}

export type ArenaStageCounts = Readonly<{
  sources: number; instances: number; shadowCasters: number;
}>;

/** One instant, as the panels are asked to draw it. */
export type ArenaStageView = Readonly<{
  header: FightHeader;
  frame: FightFrame;
  /** The tick after `frame`, or `frame` itself at the end of the recording. */
  next: FightFrame;
  /** The playback loop's own sub-tick carry; zero at 1x and on every scrub. */
  alpha: number;
  /** Positive only from requestAnimationFrame; synchronous redraws pass zero. */
  cameraDt?: number;
  /** The point the 2D panels are centred on, raw world units. */
  focus: V3;
  /** The world width the 2D panels are showing, raw world units. */
  span: number;
  /** The heading the elevation panel is drawn along, radians. Turns this too. */
  azimuth: number;
  /** The transport's `contacts` toggle, so all five panels show or hide together. */
  contacts: boolean;
}>;

// ---------------------------------------------------------------- the content

/**
 * The scene's meshes and cameras, with no engine and no canvas in sight.
 *
 * Split out so a `NullEngine` test can build the whole thing and ask it where
 * the eye ended up and which regions it drew, which is most of what this session
 * can be checked on without a rasteriser.
 */
export class ArenaContent {
  readonly #scene: Scene;
  readonly #debug: RendererDebugRegistry;
  readonly #sources = new Map<string, Mesh>();
  readonly #materials = new Map<string, Material>();
  readonly #nodes = new Map<string, StageNode>();
  readonly #rigs = new Map<number, BodyRig>();
  readonly #dresses = new Map<number, CombatantDress>();
  readonly #dressCasters = new Set<AbstractMesh>();
  readonly #combatantAbort = new AbortController();
  readonly firstPerson: readonly [FreeCamera, FreeCamera];
  readonly threeQuarter: FreeCamera;
  readonly stageCamera: StageCamera;
  #floor: LinesMesh | null = null;
  #floorKey = "";
  #mode: ArenaMode = "geometry";
  #phase: "select" | "fight" = "fight";
  /** Built on the first press of `[Texture]` and kept; null while it is unpressed. */
  #environment: ArenaEnvironment | null = null;
  /** The last instant drawn, so a mode change or a late room can redraw it. */
  #view: ArenaStageView | null = null;
  #combatants: CombatantAsset | null = null;
  #combatantLoad: Promise<void> | null = null;
  #follow: "both" | 0 | 1 = "both";

  constructor(scene: Scene, debug: RendererDebugRegistry) {
    this.#scene = scene;
    this.#debug = debug;
    scene.clearColor = CLEAR_COLOUR;
    // Nothing in `[Geometry]` is lit, so nothing here creates a light. The
    // materials below are emissive with lighting disabled, which is a flat fill
    // rather than a shading model that could flatter a shape the simulation
    // never had.
    scene.ambientColor = Color3.Black();

    this.firstPerson = [this.#firstPersonCamera(0), this.#firstPersonCamera(1)];
    this.threeQuarter = new FreeCamera("arena-three-quarter", new Vector3(0, 4, -8), scene);
    this.threeQuarter.fov = THREE_QUARTER_FOV_DEGREES * DEGREES;
    this.threeQuarter.minZ = NEAR_PLANE;
    this.threeQuarter.maxZ = FAR_PLANE;
    this.threeQuarter.layerMask = CAMERA_BITS[2];
    this.threeQuarter.viewport = viewportOf("threeQuarter");
    this.threeQuarter.setTarget(Vector3.Zero());
    this.stageCamera = createStageCamera(
      this.threeQuarter, this.firstPerson,
      () => this.#scene.getEngine().getAspectRatio(this.threeQuarter),
    );

    // The order is the order they are drawn in, and Babylon clears the colour
    // buffer once for the first of them and only depth for the rest -- which is
    // exactly what tiled viewports want, and the reason `autoClear` is left
    // alone here as it is everywhere else in this repository.
    scene.activeCameras = [this.firstPerson[0], this.firstPerson[1], this.threeQuarter];
    scene.activeCamera = this.threeQuarter;
    this.#publishCounts();
  }

  /**
   * Draw one instant.
   *
   * Every node the frame wants is created or re-posed and its key recorded;
   * every node whose key did not come up is retired. A body that lost an arm
   * between two ticks therefore loses the mesh rather than keeping a stale one
   * parked at its last position, which is the failure the live key set exists to
   * make impossible.
   */
  show(view: ArenaStageView): void {
    this.#view = view;
    if (this.#mode === "geometry") this.#floorGrid(view.header);
    else this.#environment?.fit(view.header);
    // Blended once, then used by both the meshes and the eyes. A camera drawn
    // from a differently interpolated pose than the body it belongs to would
    // put a fighter's eye outside its own head at every sub-tick.
    const poses = view.frame.poses.map((raw) => {
      const next = view.next.poses.find((other) => other.id[0] === raw.id[0]);
      return next === undefined ? raw : blendPose(raw, next, view.alpha);
    });
    const live = new Set<string>();
    const bodies = new Set<number>();
    for (const pose of poses) {
      bodies.add(pose.id[0]);
      // The rig is posed in both modes; only `[Texture]` hangs anything off it.
      // See `BodyRig` for why the control does not go through it.
      const posed = this.#poseRig(view, pose);
      if (this.#mode === "texture") {
        if (!this.#drawAuthored(view.header, pose, posed)) this.#drawProxy(view.header, pose, posed, live);
      } else this.#drawBody(view.header, pose, live);
    }
    this.#drawProjectiles(view.frame, view.next, view.alpha, live);
    // Contacts are facts about the decided tick and are never blended: a
    // contact half way to existing is not something the simulation resolved.
    // Drawn in both modes and in the same flat kind colours, because a contact
    // is a published fact rather than part of the dress.
    if (view.contacts) this.#drawContacts(view.frame, view.header, live);
    for (const [key, node] of this.#nodes) {
      if (!live.has(key)) this.#retire(node);
    }
    for (const [body, rig] of this.#rigs) {
      if (!bodies.has(body)) this.#retireRig(rig);
    }
    for (const [body, dress] of this.#dresses) {
      if (!bodies.has(body)) this.#retireDress(body, dress);
    }
    this.#placeCameras(poses, view);
    this.#publishCounts();
  }

  /** Draw the last instant again, after something other than the tick moved. */
  redraw(): void {
    if (this.#view !== null) this.show({ ...this.#view, cameraDt: 0 });
  }

  cameraMode(): StageCameraMode { return this.stageCamera.mode; }
  cameraBasis(): StageCameraBasis { return this.stageCamera.basis; }
  cameraChangeSerial(): number { return this.stageCamera.changeSerial; }
  containsThreeQuarterPoint(x: number, y: number): boolean {
    return this.stageCamera.containsThreeQuarterPoint(x, y);
  }
  follow(target: "both" | 0 | 1): void {
    this.#follow = target;
    if (target === "both") this.stageCamera.refit();
  }
  orbit(buttons: number, dx: number, dy: number): boolean {
    return this.stageCamera.orbit(buttons, dx, dy);
  }
  zoom(delta: number): void { this.stageCamera.zoom(delta); }
  promote(view: ArenaPromotedView): void { this.stageCamera.promote(view); }
  refit(): void { this.stageCamera.refit(); }

  mode(): ArenaMode { return this.#mode; }

  /**
   * `[Texture]` or `[Geometry]`, on one scene and without touching the cameras.
   *
   * Nothing is rebuilt: the engine, the scene, the three cameras, the source
   * meshes and the materials all outlive the press. What changes is which meshes
   * the next `show` asks for -- the live key set retires the other mode's on its
   * own, which is the same machinery a tick with fewer contacts already uses --
   * plus the environment, the shadow casting and the scene's own exposure.
   *
   * The environment is built on the first press and kept, so the second press
   * costs nothing; a reader who never presses `[Texture]` never pays for a
   * 1024-square shadow map or a glTF loader chunk.
   */
  setMode(mode: ArenaMode): void {
    if (mode === this.#mode) return;
    this.#mode = mode;
    if (mode === "texture") this.#environment ??= new ArenaEnvironment(this.#scene);
    const lit = mode === "texture" && this.#phase === "fight";
    this.#environment?.setEnabled(lit);
    for (const dress of this.#dresses.values()) {
      dress.setEnabled(lit);
      if (mode === "geometry") this.#removeDressShadows(dress);
    }
    this.#floor?.setEnabled(mode === "geometry" && this.#phase === "fight");
    this.#scene.clearColor = lit ? ROOM_CLEAR_COLOUR : CLEAR_COLOUR;
    this.#scene.imageProcessingConfiguration.exposure = lit ? ROOM_EXPOSURE : 1;
    this.#scene.imageProcessingConfiguration.contrast = lit ? ROOM_CONTRAST : 1;
  }

  /** Park the fight's environment while the same scene draws the picker. */
  setPhase(phase: "select" | "fight"): void {
    if (phase === this.#phase) return;
    this.#phase = phase;
    const lit = phase === "fight" && this.#mode === "texture";
    this.#environment?.setEnabled(lit);
    this.#floor?.setEnabled(phase === "fight" && this.#mode === "geometry");
    for (const dress of this.#dresses.values()) dress.setEnabled(lit);
    this.#scene.clearColor = lit ? ROOM_CLEAR_COLOUR : CLEAR_COLOUR;
    this.#scene.imageProcessingConfiguration.exposure = lit ? ROOM_EXPOSURE : 1;
    this.#scene.imageProcessingConfiguration.contrast = lit ? ROOM_CONTRAST : 1;
  }

  /**
   * Fetch the authored room, or settle for the procedural floor.
   *
   * Resolves either way -- the caller redraws on whatever it gets, and
   * {@link ArenaEnvironment} says which floor it ended up with on the panel's
   * label.
   *
   * **Nothing at all in `[Geometry]`**, which has no environment to put a room
   * in. `setMode` calls this on every press, so without the guard a reader
   * flicking to `[Geometry]` would start a megabyte of fetch for a mode that
   * draws a line grid. `ArenaEnvironment.load` is memoised on top of that, so the
   * second press of `[Texture]` costs nothing either.
   */
  async loadEnvironment(fetcher?: RoomAssetFetcher, combatantFetcher?: CombatantAssetFetcher): Promise<void> {
    if (this.#mode !== "texture") return;
    await Promise.all([this.#environment?.load(fetcher), this.loadCombatants(combatantFetcher)]);
  }

  /** The one scene-owned authored asset promise shared by preview and fight. */
  async loadCombatants(fetcher?: CombatantAssetFetcher): Promise<CombatantAsset | null> {
    this.#combatantLoad ??= (async () => {
      try {
        this.#combatants = await loadCombatantAsset(
          this.#scene, this.#combatantAbort.signal, fetcher,
        );
      } catch {
        // The arena's texture dress and preview share this deliberate fallback.
        this.#combatants = null;
      }
    })();
    await this.#combatantLoad;
    return this.#combatants;
  }

  /** No fight: the floor and the cameras stay, every body and every rig goes. */
  clear(): void {
    for (const node of [...this.#nodes.values()]) this.#retire(node);
    for (const rig of [...this.#rigs.values()]) this.#retireRig(rig);
    for (const [body, dress] of [...this.#dresses]) this.#retireDress(body, dress);
    this.#publishCounts();
  }

  counts(): ArenaStageCounts {
    const environment = this.#environment?.counts();
    let dressMeshes = 0;
    for (const dress of this.#dresses.values()) dressMeshes += dress.meshes.size;
    return Object.freeze({
      sources: this.#sources.size + (environment?.sources ?? 0) +
        (this.#combatants?.sidecar.counts.meshes ?? 0),
      instances: this.#nodes.size + dressMeshes + (environment?.instances ?? 0),
      // The shadow generator's own render list, so a caster the proxy registered
      // and never removed shows up here rather than as a frame time.
      //
      // **Not zero in `[Geometry]`, and the sentence that said it was is the one
      // the short circuit's removal was meant to stop anybody writing.** Zero
      // only until `[Texture]` is first pressed, because until then there is no
      // environment and no light. After a press the room is *parked* rather than
      // gone, so the honest answer in `[Geometry]` is its 84 wall casters -- see
      // `ArenaEnvironment.counts`, and `describe()` below, which is what stops a
      // reader taking them for a registry that stopped retiring. Measured over
      // one press with the authored room: 0 casters at the start, 139 in
      // `[Texture]`, 84 back in `[Geometry]`.
      shadowCasters: environment?.shadowCasters ?? 0,
    });
  }

  /**
   * What the panel's label says about the dress, beside the backend and the counts.
   *
   * **"room parked" is load-bearing.** The counts beside it are what is retained
   * rather than what is drawn -- see `ArenaEnvironment.counts` for why they must
   * be -- so after a `[Texture]` press the `[Geometry]` label carries five
   * hundred instances and eighty-odd casters that are on the scene and disabled.
   * Two words is what stops a reader taking those for a registry that stopped
   * retiring, which is the exact thing the counts are there to reveal.
   */
  describe(): string {
    if (this.#mode === "geometry") {
      return this.#environment === null ? "geometry" : "geometry, room parked";
    }
    return `texture, ${this.#environment?.description() ?? "no environment"}`;
  }

  keys(): readonly string[] {
    return Object.freeze([...this.#nodes.keys()].sort());
  }

  /** The named nodes of one body, for a test that has to ask where a socket ended up. */
  rig(body: number): ReadonlyMap<string, TransformNode> | null {
    return this.#rigs.get(body)?.nodes ?? null;
  }

  dispose(): void {
    this.clear();
    this.#floor?.dispose();
    this.#floor = null;
    this.#environment?.dispose();
    this.#environment = null;
    this.#combatantAbort.abort();
    this.#combatants?.dispose();
    this.#combatants = null;
    for (const source of this.#sources.values()) source.dispose();
    this.#sources.clear();
    for (const material of this.#materials.values()) material.dispose();
    this.#materials.clear();
    for (const camera of [...this.firstPerson, this.threeQuarter]) camera.dispose();
    this.#debug.removeOwner(DEBUG_OWNER);
  }

  // -------------------------------------------------------------- the cameras

  #firstPersonCamera(slot: 0 | 1): FreeCamera {
    const camera = new FreeCamera(`arena-first-person-${slot}`, new Vector3(0, 1.7, 0), this.#scene);
    camera.fov = FIRST_PERSON_FOV_DEGREES * DEGREES;
    camera.minZ = NEAR_PLANE;
    camera.maxZ = FAR_PLANE;
    camera.layerMask = CAMERA_BITS[slot];
    camera.viewport = viewportOf(slot === 0 ? "firstPersonA" : "firstPersonB");
    return camera;
  }

  /**
   * The eye at the head capsule's centre, turned by body yaw, on a mount tilted
   * a constant `FIRST_PERSON_PITCH_DEGREES` down.
   *
   * **Nothing here tracks, and that is the part v2-ui-02 was right about.** This
   * body has exactly one rotation. There is no pitch, no roll and no head turn;
   * v2-20's guard height is a property of the *arm*, not of the gaze. A camera
   * that tilted to follow an incoming club would be showing the reader a degree
   * of freedom the fighter does not have, and the reader would quite reasonably
   * conclude the fighter had it. So the yaw is the body's and the tilt is the
   * rig's: it is the same number every tick of every fight, in the same sense
   * the field of view is, and neither varies with anything the fighter does.
   *
   * The two levers together are what let this panel answer its question at all;
   * `FIRST_PERSON_FOV_DEGREES` carries the measurement both were set from.
   */
  #placeCameras(poses: readonly Pose[], view: ArenaStageView): void {
    for (const slot of [0, 1] as const) {
      const camera = this.firstPerson[slot];
      const pose = poses.find((candidate) => candidate.id[0] === slot);
      // A slot with no pose keeps the camera where it was. Moving it to an
      // origin nobody is standing at would look like a body that had teleported.
      if (pose === undefined) continue;
      const eye = scenePoint(eyeOf(pose));
      camera.position.set(eye[0], eye[1], eye[2]);
      // **`setTarget` is deliberately not used here.** It nudges `position.z` by
      // `Epsilon` whenever the target shares the camera's `z`, which for a level
      // gaze is exactly the case of a body facing along world `+x` -- and that
      // is where every fixture opens, at yaw zero on tick zero. A millimetre is
      // invisible but it is also not the eye, and "the camera is at the
      // published head capsule's centre" is the one claim this panel makes.
      //
      // The half turn is Babylon's own: in a right-handed scene a camera at
      // `rotation.y = 0` looks along `-z`, so `yaw - pi/2` is what turns it onto
      // `sceneForward(yaw)`. `rotation.x` is negated for the same kind of
      // reason -- a positive `x` tilts a right-handed camera *up* -- so the
      // mount angle is written here as the downward angle it is named for.
      // `the_first_person_camera_sits_at_the_eye_and_keeps_one_fixed_mount_
      // angle_at_every_yaw` checks all of it against the view matrix rather
      // than trusting either side.
      camera.rotation.set(
        -FIRST_PERSON_PITCH_DEGREES * DEGREES, sceneYaw(pose.yaw) - Math.PI / 2, 0,
      );
    }
    // `createFixedIsometricCamera` takes `aspect` as a plain number and is wrong
    // under a viewport; a perspective camera is not, because Babylon's own
    // `getAspectRatio` multiplies the render size by the camera's viewport. This
    // asks Babylon rather than computing it, so the two cannot drift.
    this.stageCamera.fit(view.focus, view.span, view.azimuth);
    if (this.#follow !== "both") {
      const followed = poses.find((candidate) => candidate.id[0] === this.#follow);
      if (followed !== undefined) this.stageCamera.follow(followed, view.cameraDt ?? 0);
    }
  }

  // ---------------------------------------------------------------- the bodies

  #drawBody(header: FightHeader, pose: Pose, live: Set<string>): void {
    const body = pose.id[0];
    const colours = bodyColours(body);
    const anatomy = header.bodies[body]?.anatomy;
    // Only the first two slots have a first-person camera, so only they have
    // anything to hide from themselves. `MAX_POSES` is 64 and nothing below the
    // panels assumes two.
    const ownCamera = body === 0 || body === 1 ? CAMERA_BITS[body] : 0;

    pose.regions.forEach((region, index) => {
      if (!regionDrawn(pose, index)) return;
      const hidden = OWN_BODY_HIDDEN_REGIONS.includes(index) ? ownCamera : 0;
      this.#capsule(`${body}:region:${index}`, regionPaint(body, index, pose.regions.length),
        capsuleParts(region.lower, region.upper, region.radius), ALL_CAMERAS & ~hidden, live);
    });

    // **Everything an arm carries goes when the arm does.** `regionDrawn` alone
    // retires the five region capsules and nothing else, which leaves a hand and
    // a gold plate floating with nothing between them and the shoulder -- and
    // `Pose` publishes a `PosedArm` row for a severed limb, so this is reachable
    // rather than theoretical. `armDrawn` states the rule once; see its comment
    // for why the simulation's own sweep agrees.
    //
    // The hand's radius is the anatomy's, and a header with no row for this body
    // has no radius to draw -- so the hand is left out rather than invented at
    // some plausible size, which is the one thing this mode may never do.
    if (anatomy !== undefined) {
      for (const limb of [0, 1] as const) {
        if (!armDrawn(pose, limb)) continue;
        this.#sphere(`${body}:hand:${limb}`, paint(`body:${body}:edge`, colours.edge),
          scenePoint(pose.arms[limb].hand), sceneLength(anatomy.handRadius), ALL_CAMERAS, live);
      }
    }

    for (const limb of [0, 1] as const) {
      const weapon = pose.weapons[limb];
      if (weapon === null || !armDrawn(pose, limb)) continue;
      this.#capsule(`${body}:weapon:${limb}`, paint(`body:${body}:weapon`, colours.weapon),
        capsuleParts(weapon.hilt, weapon.tip, weapon.radius), ALL_CAMERAS, live);
    }

    const shield = pose.shield;
    // `shieldLimb` reads the holder off the published centre, which is the
    // holding hand exactly. A shield the simulation put somewhere else answers
    // null and is drawn anyway: refusing to draw a published shape would be the
    // worse failure of the two.
    const holder = shield === null ? null : shieldLimb(pose, shield);
    if (shield !== null && (holder === null || armDrawn(pose, holder))) {
      // No centre marker, unlike the 2D panels. Theirs exists so a rectangle
      // rebuilt from `shieldCorners` can be seen to sit on the published pose;
      // here the hand sphere is already at that point -- the shield's `centre`
      // and its arm's `hand` are the same three numbers, by construction in
      // `derive_shield_pose` -- and it is a good deal larger, so a dot would be
      // a node that is never seen.
      this.#shieldFace(`${body}:shield`, paint(`body:${body}:shield`, colours.shield, true),
        shieldQuad(shield), live);
    }
  }

  // --------------------------------------------------- the combatant rig seam

  #rigFor(body: number): BodyRig {
    const existing = this.#rigs.get(body);
    if (existing !== undefined) return existing;
    // The parent chain the combatant contract carries, built by the shared
    // `render/rig-nodes.ts` builder so this proxy and the `#/game` procedural
    // figure cannot drift apart on the seam the authored dress also implements.
    // The region and clip slots ride along as the arena's extras.
    //
    // `socket_shield` comes out parented to `root` and is re-parented to its
    // holder every tick. On all 10542 published poses of the three fixtures the
    // holder is limb 0 -- but which hand holds it is a published fact here (`shieldLimb`
    // matches the plate's centre to a hand to the raw unit) rather than an
    // authoring decision, so it is read rather than assumed. `root` is where
    // it waits when no hand is at the centre.
    const built = buildRigNodes(this.#scene, `arena:${body}:`, [...RIG_REGIONS, ...RIG_CLIPS]);
    const rig = Object.freeze({ body, nodes: built.nodes, root: built.root });
    this.#rigs.set(body, rig);
    return rig;
  }

  /**
   * Put every named node where this tick's published rows say.
   *
   * Parents before children, and each node's world matrix is forced current as it
   * is written, because {@link placeWorld} divides the parent's world transform
   * back out of the child's -- a stale parent matrix would put the child in last
   * frame's frame of reference and the error would be invisible on a body that
   * had not turned.
   */
  #poseRig(view: ArenaStageView, pose: Pose): PosedBody {
    const body = pose.id[0];
    const anatomy = view.header.bodies[body]?.anatomy;
    const { forward, left } = bodyAxes(pose.yaw);
    const frame = yawFrame(pose.yaw);
    const legs = at(pose.regions, 4);
    // **The tick, not a counter.** `frame.t + alpha` is where the transport is,
    // and `gaitOf` turns it into a phase without remembering anything -- see its
    // comment for why a page that scrubs may not integrate a gait.
    const gait = gaitOf(view.frame.t + view.alpha, length(pose.vel));

    // The elbows first, because four other nodes point along them.
    //
    // **Read when the simulation publishes one, invented only when it does
    // not.** A body whose arms have an elbow publishes a forearm capsule, and
    // that capsule's `lower` *is* the elbow -- the same point the contact phase
    // swept, to the raw unit. `elbowOf` stays as the fallback for the bodies
    // that have no second link, and its own doc records how bad a guess it was:
    // overruled on 43-68% of the recorded arm rows, because the published hand
    // is further from the shoulder than two half-arm bones can span.
    const elbowFor = (limb: 0 | 1): ScenePoint => {
      const region = pose.regions[ARM_REGIONS[limb]];
      const hand = scenePoint(pose.arms[limb].hand);
      const forearm = pose.regions[FOREARM_REGIONS[limb]];
      if (forearm !== undefined && forearm.present) return scenePoint(forearm.lower);
      // No published shoulder or no published arm length is no solve: the elbow
      // collapses onto the hand and the arm is drawn as the one capsule the
      // simulation gave, which is the same refusal to invent a dimension that
      // leaves an unpublished hand radius undrawn.
      if (region === undefined || anatomy === undefined) return hand;
      const shoulder = scenePoint(region.lower);
      // The outward direction is the horizontal one from the body's own axis out
      // through the published shoulder, which is the anatomical left or right.
      const side = limb === 0 ? 1 : -1;
      const outward: ScenePoint = [left[0] * side, left[1] * side, left[2] * side];
      return elbowOf(shoulder, hand, outward, sceneLength(anatomy.armLength) / 2);
    };
    const elbows: readonly [ScenePoint, ScenePoint] = [elbowFor(0), elbowFor(1)];

    const rig = this.#rigFor(body);
    const node = (name: string): TransformNode => {
      const found = rig.nodes.get(name);
      if (found === undefined) throw new Error(`arena rig ${body} has no ${name}`);
      return found;
    };

    // `root` at the published ground point under the body, carrying the body's
    // one rotation. Everything below it is placed from a published row and has
    // its own orientation written absolutely, so this is the only node whose
    // rotation is the yaw and nothing inherits a rotation by accident.
    //
    // **`pose.body[2]` is dropped for a literal zero and that is a choice.** The
    // third component is the body origin's height, and a rig root belongs on the
    // ground the body is standing on rather than at whatever height the origin
    // happens to carry -- the authored rigs have their origin at
    // the floor-contact plane, exactly as the room kit's pieces are. It costs
    // nothing on any recorded fight, where the published height is zero on all
    // 21083 poses, and it is the right answer the day it is not.
    placeWorld(node("root"), scenePoint([pose.body[0], pose.body[1], 0]), frame);
    // The hip is the published leg capsule's upper end. The capsule is vertical
    // on all 21083 published poses of the three recordings, so this is a height
    // rather than a direction.
    placeWorld(node("pelvis"), scenePoint(legs.upper), frame);
    placeWorld(node("torso"), capsuleCentre(at(pose.regions, 1).lower, at(pose.regions, 1).upper), frame);
    // The eye, and the same point the first-person camera is placed from -- so a
    // head node that drifted from the camera would be a visible disagreement
    // rather than a quiet one.
    placeWorld(node("head"), scenePoint(eyeOf(pose)), frame);

    for (const limb of [0, 1] as const) {
      const region = pose.regions[ARM_REGIONS[limb]];
      const hand = scenePoint(pose.arms[limb].hand);
      const elbow = elbows[limb];
      const shoulder = region === undefined ? hand : scenePoint(region.lower);
      // **The two node origins are published; the elbow between them is
      // published too on a jointed body and invented on a single-link one.**
      // That second half is what changed: an upper-arm bone points at the elbow
      // and a forearm bone points at the hand from the elbow, and on a body that
      // publishes a forearm capsule the joint they meet at is the simulation's
      // own, not this file's triangle. `elbowFor` above is where the choice is
      // made. The shoulder and the hand were always exact to the raw unit, which
      // is what the agreement check reads.
      placeWorld(node(limb === 0 ? "arm_left" : "arm_right"), shoulder,
        segmentFrame(shoulder, elbow, forward));
      placeWorld(node(limb === 0 ? "hand_left" : "hand_right"), hand,
        segmentFrame(elbow, hand, forward));
      const weapon = pose.weapons[limb];
      const socket = node(limb === 0 ? "socket_weapon_left" : "socket_weapon_right");
      // An empty socket sits in the hand pointing the way the hand does, which is
      // where an authored grip would be if the body picked something up.
      if (weapon === null) placeWorld(socket, hand, segmentFrame(elbow, hand, forward));
      else placeWorld(socket, scenePoint(weapon.hilt), weaponSocketFrame(weapon.hilt, weapon.tip, elbow));
    }

    pose.regions.forEach((region, index) => {
      const name = RIG_REGIONS[index];
      if (name === undefined) return;
      placeWorld(node(name), capsuleCentre(region.lower, region.upper),
        segmentFrame(scenePoint(region.lower), scenePoint(region.upper), forward));
    });

    const shield = pose.shield;
    const socket = node("socket_shield");
    const holder = shield === null ? null : shieldLimb(pose, shield);
    const wanted = holder === null
      ? rig.root
      : node(holder === 0 ? "hand_left" : "hand_right");
    if (socket.parent !== wanted) socket.parent = wanted;
    if (shield === null) placeWorld(socket, scenePoint(pose.arms[0].hand), frame);
    else placeWorld(socket, scenePoint(shield.centre), shieldSocketFrame(shield));

    // One clip slot enabled, and only ever `idle` or `walk`: see `RIG_CLIPS`.
    for (const clip of RIG_CLIPS) node(clip).setEnabled(clip === gait.clip);
    return Object.freeze({ rig, gait, elbows });
  }

  // -------------------------------------------------------------- the proxy

  /**
   * A fighter that reads as a fighter, out of the same published rows.
   *
   * Read the table under `The arena's two dresses` in
   * `docs/architecture/browser-runtime.md` beside this:
   * the head, the torso, the hands, the weapon and the shield plate are the
   * published shapes at their published dimensions and the only thing this mode
   * changes about them is the material and the shadow. The elbow, the split legs
   * and the wrist roll are the inventions, each named in `geometry.ts` at the
   * function that computes it.
   *
   * **Every mesh is parented to its rig node and then placed absolutely**, which
   * is worth stating precisely because the obvious reading is wrong: the node is
   * not driving the mesh. Nothing here is forward kinematics -- every shape has a
   * published point of its own to stand on, and inventing a chain to derive those
   * points from would be inventing degrees of freedom the pose already fixes.
   * What the parenting buys is the *contract*: the node set, names and parent
   * chain are shared with the authored rigs, whose corresponding bones are
   * checked against the same published rows. See {@link applyWorld}.
   */
  #drawProxy(header: FightHeader, pose: Pose, posed: PosedBody, live: Set<string>): void {
    const body = pose.id[0];
    const anatomy = header.bodies[body]?.anatomy;
    const dress = proxyPaint(body);
    const ownCamera = body === 0 || body === 1 ? CAMERA_BITS[body] : 0;
    const node = (name: string): TransformNode | null => posed.rig.nodes.get(name) ?? null;
    const key = (rest: string): string => `proxy:${body}:${rest}`;

    // The head and the torso are published capsules, drawn where they are
    // published, and hidden from their own first-person camera for the same
    // reason `[Geometry]` hides them: the eye is inside both. The head takes the
    // lighter of the two body colours and the torso the darker, which is the
    // direction `regionPaint`'s ramp runs in `[Geometry]`, so a reader who
    // presses the buttons does not see the two swap.
    if (regionDrawn(pose, 0)) {
      const head = at(pose.regions, 0);
      this.#capsule(key("head"), dress.trim, capsuleParts(head.lower, head.upper, head.radius),
        ALL_CAMERAS & ~ownCamera, live, node("head"));
    }
    if (regionDrawn(pose, 1)) {
      const torso = at(pose.regions, 1);
      this.#capsule(key("torso"), dress.skin, capsuleParts(torso.lower, torso.upper, torso.radius),
        ALL_CAMERAS & ~ownCamera, live, node("torso"));
    }
    // **The legs hang off `region_legs` and not off a bone, because the durable
    // contract names no semantic leg bone.** The simulation publishes one leg
    // capsule, so the two invented proxy legs hang off the node for the capsule
    // they were split out of -- the only semantic node that stands for them.
    if (regionDrawn(pose, 4)) {
      const region = at(pose.regions, 4);
      legsOf(region.lower, region.upper, region.radius, pose.yaw, posed.gait)
        .forEach((leg, index) => {
          this.#capsule(key(`leg:${index}`), dress.skin,
            capsuleBetween(leg.foot, leg.hip, leg.radius), ALL_CAMERAS, live, node("region_legs"));
        });
    }

    for (const limb of [0, 1] as const) {
      if (!armDrawn(pose, limb)) continue;
      const region = pose.regions[ARM_REGIONS[limb]];
      if (region === undefined) continue;
      const shoulder = scenePoint(region.lower);
      const hand = scenePoint(pose.arms[limb].hand);
      const elbow = posed.elbows[limb];
      const radius = sceneLength(region.radius);
      const side = limb === 0 ? "left" : "right";
      this.#capsule(key(`upper_arm:${side}`), dress.skin, capsuleBetween(shoulder, elbow, radius),
        ALL_CAMERAS, live, node(limb === 0 ? "arm_left" : "arm_right"));
      this.#capsule(key(`forearm:${side}`), dress.skin, capsuleBetween(elbow, hand, radius),
        ALL_CAMERAS, live, node(limb === 0 ? "hand_left" : "hand_right"));
      // The hand's radius is published or the hand is not drawn -- the same rule
      // `[Geometry]` follows, and for the same reason: a plausible size is still
      // an invented one and this is a shape the simulation swept.
      if (anatomy !== undefined) {
        this.#sphere(key(`hand:${side}`), dress.trim, hand, sceneLength(anatomy.handRadius),
          ALL_CAMERAS, live, node(limb === 0 ? "hand_left" : "hand_right"));
      }
      const weapon = pose.weapons[limb];
      if (weapon === null) continue;
      this.#capsule(key(`weapon:${side}`), dress.steel,
        capsuleParts(weapon.hilt, weapon.tip, weapon.radius), ALL_CAMERAS, live,
        node(limb === 0 ? "socket_weapon_left" : "socket_weapon_right"));
    }

    const shield = pose.shield;
    const holder = shield === null ? null : shieldLimb(pose, shield);
    if (shield !== null && (holder === null || armDrawn(pose, holder))) {
      this.#shieldPlate(key("shield"), dress.plate, shield, live, node("socket_shield"));
    }
  }

  /** Hang a checked skinned archetype on the already-published arena rig. */
  #drawAuthored(header: FightHeader, pose: Pose, posed: PosedBody): boolean {
    const body = pose.id[0];
    const info = header.bodies[body];
    const lower = info?.kind.toLowerCase();
    const kind = lower?.includes("fighter") ? "fighter" : lower?.includes("brute") ? "brute" : null;
    if (kind === null || this.#combatants === null) return false;
    let dress = this.#dresses.get(body);
    if (dress === undefined) {
      try {
        dress = instantiateCombatantDress(this.#combatants, kind, "arena:" + body + ":authored");
        this.#dresses.set(body, dress);
      } catch {
        return false;
      }
    }
    // The arena publishes first-person and three-quarter cameras together, so
    // its shared dress keeps the high LOD needed by the two close arm/equipment
    // views. The game page can select lower LODs from one active camera.
    dress.setLod("high");
    dress.setEnabled(true);
    const ownCamera = body === 0 || body === 1 ? CAMERA_BITS[body] : 0;
    for (const [semantic, mesh] of dress.meshes) {
      const role = combatantMeshRole(semantic);
      const visible = role === "head" ? regionDrawn(pose, 0)
        : role === "torso" ? regionDrawn(pose, 1)
        : role === "legs" ? regionDrawn(pose, 4)
        : role === "arm_left" ? armDrawn(pose, 0)
        : role === "arm_right" ? armDrawn(pose, 1)
        : role === "weapon" ? pose.weapons.some((weapon) => weapon !== null)
        : pose.shield !== null && (shieldLimb(pose, pose.shield) === null ||
            armDrawn(pose, shieldLimb(pose, pose.shield) ?? 0));
      dress.setSemanticEnabled(semantic, visible);
      mesh.isVisible = visible;
      mesh.isPickable = false;
      mesh.layerMask = (role === "head" || role === "torso") ? ALL_CAMERAS & ~ownCamera : ALL_CAMERAS;
      if (visible && !this.#dressCasters.has(mesh)) {
        this.#environment?.addShadowCaster(mesh);
        this.#dressCasters.add(mesh);
      } else if (!visible && this.#dressCasters.delete(mesh)) {
        this.#environment?.removeShadowCaster(mesh);
      }
    }
    // Reactions are never inferred from health or elapsed presentation time.
    // A severed mesh disappears through the published region/arm presence
    // above; the event row is the only thing allowed to open a reaction slot.
    const contacts = this.#view?.frame.contacts ?? [];
    const eventForBody = contacts.some((contact) => contact.a[0] === body || contact.b[0] === body);
    const fallen = eventForBody && (this.#view?.frame.health[body] ?? 1) <= 0;
    const clip = fallen ? "fall" : eventForBody ? "stagger" : posed.gait.clip;
    dress.sampleClip(clip, eventForBody ? 0 : posed.gait.phase);
    copyCombatantRigPose(dress, posed.rig.nodes,
      (info?.anatomy.standingHeight ?? Math.round(dress.contract.height * ONE)) / ONE);
    for (const name of RIG_CLIPS) dress.nodes.get(name)?.setEnabled(name === clip);
    return true;
  }

  /**
   * The plate with its published thickness, which the flat quad cannot show.
   *
   * `[Geometry]` draws `shieldCorners`' four points and nothing else, because
   * four points is what the 2D panels draw and the two must be the same face. A
   * lit mode cannot use that: a zero-thickness quad has one normal, so the plate
   * goes black from behind and the edge-on view of it disappears. Every dimension
   * here is still published, and the box is built from the published normal **as
   * published** rather than from a unit vector it is not -- see
   * {@link plateNormalLength}. `the_textured_proxy_agrees_with_the_published_
   * pose_at_five_ticks_of_a_fight` measures the box's front-face corners against
   * `shieldCorners`.
   */
  #shieldPlate(
    key: string, colour: Paint, shield: ShieldFace, live: Set<string>, parent: TransformNode | null,
  ): void {
    const mesh = this.#instance(key, "box", colour, live, parent);
    placeWorld(mesh, scenePoint(shield.centre), shieldSocketFrame(shield));
    const swept = plateNormalLength(shield);
    // `halfWidth` and the half-thickness are both measured along the published
    // normal and so both carry its length; `halfHeight` is not, because the
    // simulation's own `up` is `Vec3::Z * half_height` with no normal in it.
    mesh.scaling.set(
      sceneLength(shield.halfWidth) * 2 * swept, sceneLength(shield.halfHeight) * 2,
      sceneLength(shield.thickness) * swept,
    );
    mesh.layerMask = ALL_CAMERAS;
  }

  /**
   * The contacts of this tick, where the simulation put them, **with depth**.
   *
   * Without these the 3/4 panel cannot be checked against the readout at all:
   * "the contact point sits on the region the readout names" needs the point on
   * screen. But they are drawn in the ordinary rendering group and occlude like
   * everything else, and the temptation to make them an always-on-top overlay
   * -- which is what the 2D panels do, drawing their rings last -- was tried and
   * rejected. It puts a marker for a contact behind one body on top of the
   * other one, so the reader reads the wrong body, which is precisely the
   * failure a depth buffer was chosen to prevent. If a contact is on the far
   * side, it is hidden, and that is the true answer.
   *
   * The point itself is usually *inside* the capsule it landed on -- tick 858
   * is 0.066 under the Brute's left-arm surface -- so what a reader actually
   * sees is the normal, and it is drawn as an **axis through** the point rather
   * than as a ray out of it. The published normal is the collision normal and
   * points into the struck body about as often as out of it: at tick 858 it is
   * `(-0.70, -0.68, 0.21)` against a radial direction of `(0.78, 0.63, 0)`, so
   * `drawContact`'s one-sided ray in the published direction has to travel 0.904
   * units before it is clear of every capsule, while the other way out is 0.068.
   * Measured over the three fixtures' then-5703 weapon-body contacts at the
   * length `CONTACT_AXIS` fixes, a one-sided ray is buried for **63.3%** of them
   * and the two-sided axis for **1.7%**. The half that escapes is the half facing
   * wherever the Azimuth slider has been put. Both percentages are the same
   * superseded sweep `CONTACT_AXIS` records: the corpus is 5512 since
   * `web/fight-learned.json` was re-recorded, and it has not been re-run.
   *
   * The sphere is sized the way `drawContact` sizes its ring, out of the share
   * this one fact was allocated against the floor deducted from exactly that
   * share, so a contact that could never have paid for a wound reads as the
   * pinprick it is here too.
   */
  #drawContacts(frame: FightFrame, header: FightHeader, live: Set<string>): void {
    frame.contacts.forEach((contact, index) => {
      const colour = paint(`contact:${contact.kind}`, contactColour(contact.kind));
      const over = share(contact) / Math.max(1, header.contactEnergyFloor);
      const radius = 0.03 + Math.min(0.09, Math.log2(1 + over) * 0.02);
      this.#sphere(`contact:${index}`, colour, scenePoint(contact.point), radius, ALL_CAMERAS, live);
      this.#capsule(`contact:${index}:normal`, colour, capsuleParts(
        add(contact.point, scale(contact.normal, -CONTACT_AXIS)),
        add(contact.point, scale(contact.normal, CONTACT_AXIS)), ONE / 36,
      ), ALL_CAMERAS, live);
    });
  }

  /** Live arrows, interpolated only while the stable slot generation agrees. */
  #drawProjectiles(
    frame: FightFrame, next: FightFrame, alpha: number, live: Set<string>,
  ): void {
    const arrowPaint = this.#mode === "texture"
      ? dressed("projectile:arrow", "#9d7448", 0.05, 0.82)
      : paint("projectile:arrow", "#f1d09a");
    for (const projectile of frame.projectiles) {
      const following = next.projectiles.find((other) =>
        other.id[0] === projectile.id[0] && other.id[1] === projectile.id[1]);
      const position: V3 = following === undefined ? projectile.position : [
        projectile.position[0] + (following.position[0] - projectile.position[0]) * alpha,
        projectile.position[1] + (following.position[1] - projectile.position[1]) * alpha,
        projectile.position[2] + (following.position[2] - projectile.position[2]) * alpha,
      ];
      const speed = length(projectile.velocity);
      const tail = speed === 0 ? position : add(
        position, scale(projectile.velocity, -Math.min(0.45 * ONE / speed, 1)),
      );
      this.#capsule(
        `projectile:${projectile.id[0]}:${projectile.id[1]}`,
        arrowPaint,
        capsuleParts(tail, position, Math.max(projectile.radius, ONE / 100)),
        ALL_CAMERAS,
        live,
      );
    }
  }

  #capsule(
    key: string, colour: Paint,
    parts: CapsuleParts, layerMask: number, live: Set<string>,
    parent: TransformNode | null = null,
  ): void {
    this.#sphere(`${key}:lower`, colour, parts.lower, parts.radius, layerMask, live, parent);
    if (parts.upper !== null) {
      this.#sphere(`${key}:upper`, colour, parts.upper, parts.radius, layerMask, live, parent);
    }
    const shaft = parts.shaft;
    if (shaft === null) return;
    const mesh = this.#instance(`${key}:shaft`, "cylinder", colour, live, parent);
    // The source cylinder runs along its own `+y`, and this is the minimal
    // rotation taking that axis onto the capsule's -- see {@link alignWorld} for
    // why "minimal" rather than "any frame with the right `y`".
    alignWorld(mesh, shaft.centre, shaft.direction);
    mesh.scaling.set(parts.radius * 2, shaft.length, parts.radius * 2);
    mesh.layerMask = layerMask;
  }

  #sphere(
    key: string, colour: Paint, at: ScenePoint,
    radius: number, layerMask: number, live: Set<string>,
    parent: TransformNode | null = null,
  ): void {
    const mesh = this.#instance(key, "sphere", colour, live, parent);
    // A sphere has no orientation to get wrong, so it takes whatever its parent
    // gives it and only its centre is written.
    placeWorld(mesh, at, null);
    // The published diameter and nothing else. `ActorPresentation` clamps its
    // cylinders to a floor of 0.01 because a greybox proxy for a unit may be
    // drawn at whatever size reads; `[Geometry]` may not, and a radius the
    // simulation published as tiny has to be drawn tiny or the mode is lying
    // about the one thing it exists to show. Nothing this is called with is
    // anywhere near the 0.002 floor that used to be here: the smallest published
    // radius on any fixture is the Fighter's sword at 2621 raw (0.040), and the
    // two computed ones are smaller but bounded -- the contact sphere at 0.03
    // and up, and the contact axis's own end spheres at a fixed `ONE / 36`
    // (0.028). So this removes a fudge factor rather than a safeguard.
    mesh.scaling.setAll(radius * 2);
    mesh.layerMask = layerMask;
  }

  /**
   * The shield, as four world points rather than as a placed rectangle.
   *
   * The vertices are written straight from `shieldQuad`, so "rebuilt the same
   * way the 2D panels rebuild it" is literal rather than approximate: there is
   * no centre-plus-basis-plus-extent round trip in between to disagree with the
   * corners. Back faces are kept because the first-person camera of the body
   * holding it is looking at the *inside* of the plate, which is exactly the
   * view the panel exists to give.
   */
  #shieldFace(key: string, colour: Paint, corners: readonly ScenePoint[], live: Set<string>): void {
    live.add(key);
    const positions = new Float32Array(12);
    corners.forEach((corner, index) => {
      positions[index * 3] = corner[0];
      positions[index * 3 + 1] = corner[1];
      positions[index * 3 + 2] = corner[2];
    });
    const existing = this.#nodes.get(key);
    if (existing !== undefined) {
      (existing.mesh as Mesh).updateVerticesData(VertexBuffer.PositionKind, positions, true);
      return;
    }
    const mesh = new Mesh(`arena:${key}`, this.#scene);
    const data = new VertexData();
    data.positions = positions;
    data.indices = [0, 1, 2, 0, 2, 3];
    data.applyToMesh(mesh, true);
    mesh.material = this.#material(colour);
    mesh.isPickable = false;
    mesh.layerMask = ALL_CAMERAS;
    // Never a caster: this is `[Geometry]`'s flat quad, and `[Geometry]` has no
    // light. `[Texture]`'s plate is a box through `#shieldPlate` instead, because
    // a zero-thickness quad has one normal and goes black from behind.
    this.#nodes.set(key, Object.freeze({ key, mesh, caster: false }));
  }

  /**
   * The node under this key, in this colour -- rebuilt if it was another one.
   *
   * **An instance's material is its source's**, and Babylon has no way to move
   * an existing instance onto a different source. So a node whose key is stable
   * while its colour is not -- `contact:0`, whose index says nothing about the
   * kind that landed there -- keeps the colour of whichever kind reached that
   * index first, for as long as the key stays live. On `web/fight.json` that is
   * 136 of 1491 markers, 350 of 2631 on the windmill fight and **153 of 2195** on
   * the learned one, drawn in the wrong kind's colour beside a `#contacts`
   * readout calling `contactColour` directly and getting it right.
   *
   * The learned figure read "309 of 2966" until `web/fight-learned.json` was
   * re-recorded on 2026-08-11. It is re-derived rather than superseded, because
   * unlike the sweeps in `CONTACT_AXIS` this one is a replay of the recording
   * against the rule above and costs nothing to re-run -- and the same replay
   * returns 136 and 350 on the two fixtures that did not move, which is what says
   * it is the same measurement rather than a new one wearing the old number.
   *
   * It was also **history-dependent**, which is the part that mattered. A key
   * stays live until a tick with fewer contacts retires it, so what colour index
   * 0 is drawn in depends on which kind held it when the run of contact-bearing
   * ticks began -- not on the tick on screen. Reaching tick 430 of `fight.json`
   * through a tick with no contacts at all gave the true colours and stepping
   * into it from 429 gave them swapped, and both are the same page showing the
   * same tick. `threeQuarterPlacement`'s own comment says why that cannot stand:
   * a picture whose content depends on playback history cannot be used to check
   * a geometry claim.
   */
  #instance(
    key: string, shape: SourceShape, colour: Paint, live: Set<string>,
    parent: TransformNode | null = null,
  ): InstancedMesh {
    live.add(key);
    const source = this.#source(shape, colour);
    const existing = this.#nodes.get(key);
    if (existing !== undefined) {
      const instance = existing.mesh as InstancedMesh;
      if (instance.sourceMesh === source) {
        if (instance.parent !== parent) instance.parent = parent;
        return instance;
      }
      this.#retire(existing);
    }
    const mesh = source.createInstance(`arena:${key}`);
    mesh.isPickable = false;
    if (parent !== null) mesh.parent = parent;
    // **Casters are added and removed rather than toggled**, which is the rule
    // `ActorPresentation` follows and the reason a shadow-caster count means
    // anything: a mesh left in the render list after it was retired is a
    // disposed node the shadow pass still walks. Only a lit mesh is one --
    // `[Geometry]` has no light for a shadow to come from -- and only when the
    // environment exists, which it does not until `[Texture]` is first pressed.
    const caster = colour.lit && this.#environment !== null;
    if (caster) this.#environment?.addShadowCaster(mesh);
    this.#nodes.set(key, Object.freeze({ key, mesh, caster }));
    return mesh;
  }

  // ------------------------------------------------------- sources and paint

  /**
   * One source mesh per shape and colour.
   *
   * Instances inherit their source's material, so a source per colour is what a
   * shared unit sphere costs. It stays cheap -- two bodies come to about twenty
   * sources -- and it keeps the registry keyed by archetype, which is the shape
   * `ActorPresentation` uses and the reason its counts mean anything.
   */
  #source(shape: SourceShape, colour: Paint): Mesh {
    const key = `${shape}:${colour.key}`;
    const existing = this.#sources.get(key);
    if (existing !== undefined) return existing;
    const source = this.#build(shape, key);
    source.material = this.#material(colour);
    source.isVisible = false;
    source.isPickable = false;
    // Only a dressed body has anything to receive: `[Geometry]`'s materials
    // disable lighting outright, so a shadow map sampled onto them would be
    // sampled and discarded.
    source.receiveShadows = colour.lit;
    this.#sources.set(key, source);
    return source;
  }

  #build(shape: SourceShape, key: string): Mesh {
    const name = `arena-source:${key}`;
    if (shape === "sphere") {
      return MeshBuilder.CreateSphere(name, { diameter: 1, segments: 8 }, this.#scene);
    }
    // The shield plate, and the one shape here that is not a capsule part: a unit
    // cube scaled to the published width, height and thickness.
    if (shape === "box") return MeshBuilder.CreateBox(name, { size: 1 }, this.#scene);
    // No caps: the two end spheres of every capsule already close it, and a
    // disc hidden inside a sphere is triangles nobody will ever see.
    return MeshBuilder.CreateCylinder(name,
      { height: 1, diameter: 1, tessellation: 10, cap: Mesh.NO_CAP }, this.#scene);
  }

  /**
   * Out of `fight/view.ts`'s own palette either way -- so a body is the same
   * colour in all five panels and "the blue one" means one thing on the page, and
   * a contact is the colour its kind is in the 2D panels.
   *
   * Flat and emissive for `[Geometry]`, where a shading model would flatter a
   * shape the simulation never had. PBR for `[Texture]`, where the shading *is*
   * the point: a lit, shadowed body is what makes the 3/4 view read as a place
   * rather than a diagram, and it is the single largest visual return in this
   * session. The two are keyed apart, so the same colour never shares a source
   * between the modes and pressing the buttons cannot leave one dressed in the
   * other's material.
   */
  #material(colour: Paint): Material {
    const existing = this.#materials.get(colour.key);
    if (existing !== undefined) return existing;
    const material = colour.lit ? this.#pbr(colour) : this.#flat(colour);
    material.backFaceCulling = !colour.doubleSided;
    this.#materials.set(colour.key, material);
    return material;
  }

  #flat(colour: Paint): StandardMaterial {
    const material = new StandardMaterial(`arena-material:${colour.key}`, this.#scene);
    material.disableLighting = true;
    material.emissiveColor = colour.colour;
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    return material;
  }

  #pbr(colour: Paint): PBRMaterial {
    const material = new PBRMaterial(`arena-material:${colour.key}`, this.#scene);
    material.albedoColor = colour.colour;
    material.metallic = colour.metallic;
    material.roughness = colour.roughness;
    return material;
  }

  /**
   * One line a world unit plus the arena's own boundary, and nothing else.
   *
   * The same ruler `drawChrome` draws in the 2D panels, for the same reason:
   * "the club cleared the shield" is a claim about a distance, and a perspective
   * panel with no scale on it cannot support one. Rebuilt only when the arena
   * changes, which is once a fight.
   */
  #floorGrid(header: FightHeader): void {
    const key = `${header.arena[0]}x${header.arena[1]}`;
    if (key === this.#floorKey && this.#floor !== null) return;
    this.#floor?.dispose();
    this.#floorKey = key;
    const width = header.arena[0] / ONE;
    const depth = header.arena[1] / ONE;
    const lines: Vector3[][] = [];
    for (let x = 0; x <= Math.round(width); x += 1) {
      lines.push([new Vector3(x, 0, 0), new Vector3(x, 0, -depth)]);
    }
    for (let y = 0; y <= Math.round(depth); y += 1) {
      lines.push([new Vector3(0, 0, -y), new Vector3(width, 0, -y)]);
    }
    const floor = MeshBuilder.CreateLineSystem("arena-floor", { lines }, this.#scene);
    floor.color = GRID_COLOUR;
    floor.isPickable = false;
    floor.layerMask = ALL_CAMERAS;
    this.#floor = floor;
  }

  #retire(node: StageNode): void {
    // Off the caster list before the mesh goes. A disposed instance left in the
    // shadow generator's render list is walked by every shadow pass afterwards,
    // and the symptom is a frame time rather than a picture.
    if (node.caster) this.#environment?.removeShadowCaster(node.mesh);
    node.mesh.dispose();
    this.#nodes.delete(node.key);
  }

  /** A body that left the recording takes its named nodes with it. */
  #retireRig(rig: BodyRig): void {
    // `root` alone, because `TransformNode.dispose` recurses into descendants by
    // default and `root` is the ancestor of every other node in the map. Walking
    // the map instead would dispose the whole tree on the first entry and then
    // call `dispose` eleven more times on dead nodes -- harmless, and a loop that
    // reads as though it were doing the work when it is not.
    rig.root.dispose();
    this.#rigs.delete(rig.body);
  }

  #removeDressShadows(dress: CombatantDress): void {
    for (const mesh of dress.meshes.values()) {
      if (!this.#dressCasters.delete(mesh)) continue;
      this.#environment?.removeShadowCaster(mesh);
    }
  }

  #retireDress(body: number, dress: CombatantDress): void {
    this.#removeDressShadows(dress);
    dress.dispose();
    this.#dresses.delete(body);
  }

  #publishCounts(): void {
    const counts = this.counts();
    this.#debug.replaceOwnerCounts(DEBUG_OWNER, {
      scene: {
        meshes: counts.sources, instances: counts.instances,
        shadowCasters: counts.shadowCasters,
        lights: this.#environment?.counts().lights ?? 0,
      },
      visibility: { geometry: counts.instances },
    });
  }
}

function viewportOf(panel: keyof typeof ARENA_VIEWPORTS): Viewport {
  const rect = ARENA_VIEWPORTS[panel];
  return new Viewport(rect.x, rect.y, rect.width, rect.height);
}

// ------------------------------------------------------------------ the stage

export type ArenaStageLifecycle = Readonly<{
  /**
   * The engine replaced the canvas because WebGPU initialisation failed.
   *
   * The caller has to hear about it: it is holding a `ResizeObserver` on the
   * element that just left the document, and an observer on a detached canvas
   * reports nothing at all.
   */
  onCanvasReplaced?: (previous: HTMLCanvasElement, replacement: HTMLCanvasElement) => void;
  onTerminal?: (message: string) => void;
  /**
   * The engine, for a test that has no GPU to build one on.
   *
   * `createRendererEngine` needs a real `webgl2` or WebGPU context, so under
   * Node it fails before the first line of this module's own lifecycle runs --
   * which left the half of "does not leak an engine or a render loop" that
   * matters checked by nothing at all. This seam is the whole of the injection:
   * a test hands back a handle over a `NullEngine`, and everything after it here
   * is the shipped path. Production never passes it.
   */
  createEngine?: (
    canvas: HTMLCanvasElement,
    requested: RendererBackendRequest,
    lifecycle: RendererEngineLifecycle<HTMLCanvasElement>,
  ) => Promise<RendererEngineHandle<HTMLCanvasElement, AbstractEngine>>;
  onPreviewDress?: (side: 0 | 1, description: string) => void;
}>;

export interface ArenaStage {
  /** Backend, dress and counts, short enough to hang on the panel's own label. */
  description(): string;
  show(view: ArenaStageView): void;
  clear(): void;
  resize(): void;
  /**
   * `[Texture]` or `[Geometry]`, on this one scene.
   *
   * The picture has already changed by the time this returns -- the procedural
   * floor is drawn synchronously -- and the promise settles when the authored
   * room has either landed or failed, which is what a caller showing the mode on
   * a label needs to know. Nothing is thrown either way: a missing room is a
   * floor, not an error.
   */
  setMode(mode: ArenaMode): Promise<void>;
  mode(): ArenaMode;
  cameraMode(): StageCameraMode;
  cameraBasis(): StageCameraBasis;
  cameraChangeSerial(): number;
  containsThreeQuarterPoint(x: number, y: number): boolean;
  follow(target: "both" | 0 | 1): void;
  orbit(buttons: number, dx: number, dy: number): boolean;
  zoom(delta: number): void;
  promote(view: ArenaPromotedView): void;
  refit(): void;
  showPreview(side: 0 | 1, choice: SideChoice): void;
  setPhase(phase: "select" | "fight"): void;
  drawPreview(frame: number): void;
  dispose(): void;
}

/**
 * Build the stage, or fail without taking the rest of the arena down with it.
 *
 * `createRendererEngine` owns backend selection, the canvas-replacement dance
 * when WebGPU initialisation fails, context-loss recovery and the terminal-error
 * path. None of that is re-implemented here: context loss on a page holding a
 * five-second recording is precisely the case it already handles, and a
 * hand-rolled `Engine` would be a second, worse copy of it.
 */
export async function createArenaStage(
  canvas: HTMLCanvasElement,
  params: URLSearchParams,
  lifecycle: ArenaStageLifecycle = {},
): Promise<ArenaStage> {
  let terminal = false;
  // `?backend=webgl2` works on this route for the same reason it works on
  // `#/game`: the question "is this the WebGPU path" is asked of a picture, and
  // the arena is now a page with pictures on it.
  const handle = await (lifecycle.createEngine ?? createRendererEngine)(
    canvas, rendererBackendFromSearch(params.toString()), {
      ...(lifecycle.onCanvasReplaced === undefined ? {} : { onCanvasReplaced: lifecycle.onCanvasReplaced }),
      stopRenderingAndInput: () => { terminal = true; },
      onTerminal: (error) => lifecycle.onTerminal?.(error.message),
    },
  );
  const debug = new RendererDebugRegistry();
  let built: Readonly<{ scene: Scene; content: ArenaContent }> | null = null;
  // **Everything between the engine and the returned handle is inside this**,
  // because from `createRendererEngine` returning to the caller holding
  // something with a `dispose` on it there is nobody else who can give the GPU
  // context back. The scene build used to be the only line covered, which left
  // the hardware scaling and the resize below it able to reject with an engine
  // and its device already made and unreferenced -- a leak with no owner and no
  // symptom short of context exhaustion several routes later.
  try {
    built = createBabylonRightHandedScene(handle.engine, (scene) => new ArenaContent(scene, debug));
    // The 2D panels match their backing store to the device pixel ratio, and a
    // blurred 3D panel beside a crisp plan is a panel a reader stops trusting
    // for exactly the measurement this page exists to support. Capped at two:
    // past that the pixel count grows faster than anything a reader can see,
    // and this is the first knob to turn if the frame time measured on real
    // hardware is too high.
    const density = Math.min(2, window.devicePixelRatio || 1);
    handle.engine.setHardwareScalingLevel(1 / density);
    handle.engine.resize();
  } catch (error) {
    // Content first and engine last, which is the order `dispose` below uses.
    // The scene is not disposed explicitly because `handle.dispose` takes it:
    // `AbstractEngine.dispose` disposes every scene it is holding.
    built?.content.dispose();
    handle.dispose();
    throw error;
  }
  const { scene, content } = built;
  const stageCameras = [content.firstPerson[0], content.firstPerson[1], content.threeQuarter];
  let preview: CombatantPreview | null = null;
  const startPreview = (): CombatantPreview => createCombatantPreview(
    scene, stageCameras, lifecycle.onPreviewDress ?? (() => {}), () => content.loadCombatants(),
  );
  let disposed = false;

  const live = (): boolean => !disposed && !terminal && !handle.terminal;

  /**
   * One frame, framed.
   *
   * **`beginFrame` and `endFrame` are not optional and their absence is
   * invisible on WebGL.** `Engine.runRenderLoop` calls them around every
   * `scene.render()`, and this page does not use `runRenderLoop` -- the arena
   * already owns a `requestAnimationFrame` loop and a second one would render
   * ticks nobody asked for. On WebGL a bare `scene.render()` draws anyway,
   * because the default framebuffer is always there. On WebGPU it draws
   * nothing at all: there is no acquired swapchain texture and no submitted
   * command buffer, so the canvas keeps its CSS background and looks exactly
   * like a scene whose camera is pointing the wrong way. That is how this was
   * found, and it is why the two calls live here rather than at three call
   * sites.
   */
  const draw = (): void => {
    handle.engine.beginFrame();
    scene.render();
    handle.engine.endFrame();
  };

  return {
    description(): string {
      if (!live()) return "renderer unavailable";
      const counts = content.counts();
      const selected = handle.diagnostics.selected ?? "no backend";
      return `${selected}, ${content.describe()}, ${counts.sources} sources, `
        + `${counts.instances} instances, ${counts.shadowCasters} shadow casters`;
    },
    show(view: ArenaStageView): void {
      if (!live()) return;
      content.show(view);
      draw();
    },
    clear(): void {
      if (!live()) return;
      content.clear();
      draw();
    },
    mode(): ArenaMode { return content.mode(); },
    cameraMode(): StageCameraMode { return content.cameraMode(); },
    cameraBasis(): StageCameraBasis { return content.cameraBasis(); },
    cameraChangeSerial(): number { return content.cameraChangeSerial(); },
    containsThreeQuarterPoint(x: number, y: number): boolean {
      return live() && content.containsThreeQuarterPoint(x, y);
    },
    follow(target: "both" | 0 | 1): void { content.follow(target); },
    orbit(buttons: number, dx: number, dy: number): boolean {
      if (!live()) return false;
      const consumed = content.orbit(buttons, dx, dy);
      if (consumed) draw();
      return consumed;
    },
    zoom(delta: number): void {
      if (!live()) return;
      const before = content.cameraChangeSerial();
      content.zoom(delta);
      if (content.cameraChangeSerial() !== before) draw();
    },
    promote(view: ArenaPromotedView): void {
      if (!live()) return;
      const before = content.cameraChangeSerial();
      content.promote(view);
      if (content.cameraChangeSerial() !== before) draw();
    },
    refit(): void {
      if (!live()) return;
      content.refit();
      content.redraw();
      draw();
    },
    showPreview(side: 0 | 1, choice: SideChoice): void { preview?.show(side, choice); },
    setPhase(phase: "select" | "fight"): void {
      if (!live()) return;
      content.setPhase(phase);
      if (phase === "select") {
        preview ??= startPreview();
        preview.setActive(true);
      } else if (preview !== null) {
        preview.setActive(false);
        preview.dispose();
        preview = null;
      }
      draw();
    },
    drawPreview(frame: number): void {
      if (!live()) return;
      preview?.draw(frame);
      draw();
    },
    async setMode(mode: ArenaMode): Promise<void> {
      if (!live()) return;
      content.setMode(mode);
      content.redraw();
      draw();
      // **The picture is already on the screen by the line above**, and this is
      // the tail: the authored room is a hashed fetch of about a megabyte, and a
      // button that stayed pressed-but-unchanged for the length of it would read
      // as a broken control. So the procedural floor draws first and the kit
      // upgrades it, or does not, and the caller hears about it either way.
      await content.loadEnvironment();
      if (!live()) return;
      content.redraw();
      draw();
    },
    resize(): void {
      if (!live()) return;
      handle.engine.setHardwareScalingLevel(1 / Math.min(2, window.devicePixelRatio || 1));
      handle.engine.resize();
      draw();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      preview?.dispose();
      preview = null;
      content.dispose();
      scene.dispose();
      handle.dispose();
    },
  };
}

/** Exported for the `NullEngine` tests, which build content without a canvas. */
export function createArenaContent(engine: AbstractEngine, debug: RendererDebugRegistry): Readonly<{
  scene: Scene; content: ArenaContent;
}> {
  return createBabylonRightHandedScene(engine, (scene) => new ArenaContent(scene, debug));
}
