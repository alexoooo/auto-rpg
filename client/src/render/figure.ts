// The procedural figure `#/game` draws when an authored combatant is unsupported
// or unavailable, behind the same semantic seam as the authored dress.
//
// **The binding is the durable part, not the meshes.** `poseFigure` maps the
// published legacy frame row onto the durable combatant node names
// (`rig-names.ts`). The authored Fighter and Brute and the primitive fallback
// implement the same mapping, so a load failure changes the dress rather than
// the presentation contract.
//
// **Every pose the sim has an opinion about comes out of the snapshot**, on
// the Canvas rig's own driving rules (`web/main.js` `drawRig`, `web/rig.js`):
// `stridePhase` is the walk clock the sim publishes for exactly this,
// `vx`/`vy` are whether it is walking at all, `limbSwing`/`limbSwingLeft`/
// `swingSpan` are the attack phase, and `limbAngle`/`limbReach` are where the
// hand and the blade actually are. The two invented quantities are the legs'
// swing shape and the off arm's carry pose, both fractions of published
// numbers -- and unlike the Canvas rig there is no idle-breath clock here, so
// a pinned snapshot pins the whole pose.
//
// The world-to-scene mapping is this page's: world `(x, y)` to scene
// `(x, z)`, yaw negated (see `ActorPresentation#pose`). With the root at
// `rotation.y = -facing`, root-local `+X` is the body's `along` (its facing)
// and root-local `+Z` is its anatomical left -- `actuator::shoulder` puts
// `LimbSlot::LeftArm` at `(-sin yaw, cos yaw)`, which is what local `+Z` maps
// to under that rotation. The root is uniformly scaled by the published
// radius, so every proportion below is a fraction of `UNIT_RADIUS` and a
// Brute and a Fighter scale from one table.

import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { buildRigNodes } from "./rig-nodes.js";
import type { PresentationUnit } from "./presentation.js";

const TAU = Math.PI * 2;

// Swing phases and action roles, as `web/main.js` names the same frame
// columns. Not imported: that file is a classic script on the Canvas page.
const SWING_SWAP = 4;
const ROLE_STRIKE = 0;
const ROLE_GUARD = 1;
const ROLE_MOVE = 2;
const ROLE_SHOOT = 3;
/** `SLOT_EMPTY` narrowed to the frame's float column (`crates/web/src/lib.rs`). */
const SLOT_EMPTY = 255;

/**
 * Body heights in **radii**, from `web/main.js` `BODY_H` -- the presentation
 * heights the Canvas page's health bars, pick boxes and reviewed art already
 * measure from. Height is presentation only; the sim has no opinion.
 */
const BODY_HEIGHT_RADII: Readonly<Record<number, number>> = Object.freeze({
  0: 3.0, 1: 3.2, 2: 2.7, 3: 1.1,
});

export function figureBodyHeightRadii(kind: number): number {
  return BODY_HEIGHT_RADII[kind] ?? BODY_HEIGHT_RADII[0] ?? 3.0;
}

/** The Skitterer is the one shipped kind that is not an upright humanoid. */
const KIND_SKITTERER = 3;

// The upright proportions, all fractions of published quantities, following
// `web/rig.js` `RIG_UPRIGHT` (side offsets, joint heights as fractions of the
// shoulder) and its named constants. Where that table quotes a billboard
// half-width, the diameter here was set by eye at the same review size.
const SHOULDER_OF_HEIGHT = 0.72;
const HIP_OF_SHOULDER = 0.46;
/** `web/rig.js` `RIG_HAND`: a hand at the shoulder reads as a salute. */
const HAND_OF_SHOULDER = 0.8;
const LEG_SIDE = 0.38;
const ARM_SIDE = 0.62;
/** Off-arm neutral carry: `RIG_UPRIGHT`'s arm row `a1`/`h1`. */
const CARRY_ALONG = 0.1;
const CARRY_OF_SHOULDER = 0.44;
/** Leg/arm swing amplitudes and foot lift: `RIG_UPRIGHT` rows + `RIG_FOOT`. */
const LEG_SWING = 0.42;
const ARM_SWING = 0.24;
const FOOT_LIFT_OF_SHOULDER = 0.09;
/** `web/rig.js` `RIG_WALK_FULL`: full stride at this speed per radius. */
const WALK_FULL_SPEED_PER_RADIUS = 0.05;
/** `web/rig.js` `RIG_SHIELD_OUT`: the guard buckler rides past the hand. */
const SHIELD_OUT = 1.15;

export type FigureTone = "skin" | "trim" | "steel";
type FigureShape = "box" | "sphere" | "cylinder" | "taper";

export type FigureSources = Readonly<{
  meshes: ReadonlyMap<string, Mesh>;
  dispose(): void;
}>;

export type Figure = Readonly<{
  root: TransformNode;
  nodes: ReadonlyMap<string, TransformNode>;
  /** Every instanced mesh of this figure, for registries, picking and shadows. */
  parts: readonly InstancedMesh[];
}>;

/**
 * How many instanced meshes one figure owns -- the number the actor registry
 * counts move by. Bounded from both sides by the parts each build call makes:
 * upright is pelvis, torso, head, crest, two arms, two hands, two legs, blade
 * and shield; the crawler is body, head, four legs and its bite. The blade and
 * shield exist from birth and are enabled per pose, so the count never varies
 * with the sample and retirement stays one disposal.
 */
export const FIGURE_UPRIGHT_PARTS = 15;
export const FIGURE_CRAWLER_PARTS = 10;

export function figurePartCount(kind: number): number {
  return kind === KIND_SKITTERER ? FIGURE_CRAWLER_PARTS : FIGURE_UPRIGHT_PARTS;
}

/**
 * One hidden source mesh per shape and tone, shared by every figure of one
 * `faction:kind` -- the same lifecycle `ActorPresentation` gave its cylinder
 * source, so the registry arithmetic (sources versus instances) is unchanged
 * in kind. The skin takes the faction colour the cylinder had; the trim is a
 * lighter cut of it for the head, helmet crest and hands; the steel is
 * faction-free so a blade reads as a blade on either side.
 */
export function buildFigureSources(scene: Scene, key: string, faction: number): FigureSources {
  const skinColour = faction === 0 ? new Color3(0.2, 0.55, 0.95) : new Color3(0.75, 0.25, 0.18);
  const trimColour = faction === 0 ? new Color3(0.62, 0.78, 1.0) : new Color3(0.95, 0.62, 0.45);
  const steelColour = new Color3(0.62, 0.64, 0.68);
  const materials = new Map<FigureTone, StandardMaterial>();
  for (const [tone, colour] of [["skin", skinColour], ["trim", trimColour], ["steel", steelColour]] as const) {
    const material = new StandardMaterial(`actor-material:${key}:${tone}`, scene);
    material.diffuseColor = colour;
    material.specularColor = tone === "steel" ? new Color3(0.3, 0.3, 0.3) : Color3.Black();
    materials.set(tone, material);
  }
  const meshes = new Map<string, Mesh>();
  const source = (shape: FigureShape, tone: FigureTone): void => {
    const name = `actor-source:${key}:${shape}:${tone}`;
    const mesh = shape === "box" ? MeshBuilder.CreateBox(name, { size: 1 }, scene)
      : shape === "sphere" ? MeshBuilder.CreateSphere(name, { diameter: 1, segments: 8 }, scene)
      : shape === "taper"
        // The torso: shoulders wider than the waist, which is most of the
        // "warrior, not a bollard" read at review size.
        ? MeshBuilder.CreateCylinder(name, { height: 1, diameterTop: 1, diameterBottom: 0.72, tessellation: 10 }, scene)
        : MeshBuilder.CreateCylinder(name, { height: 1, diameter: 1, tessellation: 10 }, scene);
    const material = materials.get(tone);
    if (material === undefined) throw new Error(`figure tone ${tone} has no material`);
    mesh.material = material;
    mesh.isVisible = false;
    mesh.isPickable = false;
    meshes.set(`${shape}:${tone}`, mesh);
  };
  source("taper", "skin");
  source("cylinder", "skin");
  source("box", "skin");
  source("sphere", "skin");
  source("sphere", "trim");
  source("box", "trim");
  source("cylinder", "steel");
  return Object.freeze({
    meshes,
    dispose(): void {
      for (const material of materials.values()) material.dispose();
      for (const mesh of meshes.values()) mesh.dispose();
      meshes.clear();
    },
  });
}

const instanceOf = (
  sources: FigureSources, shape: FigureShape, tone: FigureTone, name: string,
  parent: TransformNode, parts: InstancedMesh[],
): InstancedMesh => {
  const source = sources.meshes.get(`${shape}:${tone}`);
  if (source === undefined) throw new Error(`figure sources lack ${shape}:${tone}`);
  const mesh = source.createInstance(name);
  mesh.parent = parent;
  parts.push(mesh);
  return mesh;
};

/**
 * Build one figure: the durable combatant node chain plus the primitive
 * proxies hanging under it. The parts that a pose can hide (blade, shield)
 * are built anyway and toggled with `setEnabled`, so a figure's mesh count is
 * a constant of its kind -- see {@link figurePartCount}.
 *
 * The shield socket is nailed to the off hand rather than re-parented per
 * tick: the legacy frame publishes no holder, the sim's one limb is the main
 * arm, and the guard buckler is the Canvas rig's own convention
 * (`RIG_SLOT_SHIELD` draws on the limb bearing during `Role::Guard`).
 */
export function buildFigure(scene: Scene, sources: FigureSources, name: string, kind: number): Figure {
  const { root, nodes } = buildRigNodes(scene, `${name}:`);
  const parts: InstancedMesh[] = [];
  const node = (at: string): TransformNode => {
    const found = nodes.get(at);
    if (found === undefined) throw new Error(`figure rig has no ${at}`);
    return found;
  };
  if (kind === KIND_SKITTERER) {
    instanceOf(sources, "sphere", "skin", `${name}:body`, node("torso"), parts);
    instanceOf(sources, "sphere", "trim", `${name}:head`, node("head"), parts);
    for (let leg = 0; leg < 4; leg++) {
      instanceOf(sources, "cylinder", "skin", `${name}:leg:${leg}`, root, parts);
    }
    instanceOf(sources, "cylinder", "steel", `${name}:blade`, node("socket_weapon_right"), parts);
    instanceOf(sources, "cylinder", "steel", `${name}:diagnostic:hitbox`, root, parts);
    instanceOf(sources, "cylinder", "steel", `${name}:diagnostic:facing`, root, parts);
    instanceOf(sources, "cylinder", "steel", `${name}:diagnostic:reach`, root, parts);
    return Object.freeze({ root, nodes, parts: Object.freeze(parts) });
  }
  instanceOf(sources, "box", "skin", `${name}:pelvis`, node("pelvis"), parts);
  instanceOf(sources, "taper", "skin", `${name}:torso`, node("torso"), parts);
  instanceOf(sources, "sphere", "trim", `${name}:head`, node("head"), parts);
  instanceOf(sources, "box", "trim", `${name}:crest`, node("head"), parts);
  for (const side of ["left", "right"] as const) {
    instanceOf(sources, "cylinder", "skin", `${name}:arm:${side}`, node(`arm_${side}`), parts);
    instanceOf(sources, "sphere", "trim", `${name}:hand:${side}`, node(`hand_${side}`), parts);
  }
  for (const side of ["left", "right"] as const) {
    instanceOf(sources, "cylinder", "skin", `${name}:leg:${side}`, root, parts);
  }
  instanceOf(sources, "cylinder", "steel", `${name}:blade`, node("socket_weapon_right"), parts);
  instanceOf(sources, "cylinder", "steel", `${name}:shield`, node("socket_shield"), parts);
  instanceOf(sources, "cylinder", "steel", `${name}:diagnostic:hitbox`, root, parts);
  instanceOf(sources, "cylinder", "steel", `${name}:diagnostic:facing`, root, parts);
  instanceOf(sources, "cylinder", "steel", `${name}:diagnostic:reach`, root, parts);
  return Object.freeze({ root, nodes, parts: Object.freeze(parts) });
}

export function setFigureDiagnostics(figure: Figure, enabled: boolean): void {
  for (const mesh of figure.parts) if (mesh.name.includes(":diagnostic:")) mesh.setEnabled(enabled);
}

function poseFigureDiagnostics(
  figure: Figure, unit: PresentationUnit, radius: number, rel: number,
): void {
  const diagnostic = (suffix: string): InstancedMesh | undefined =>
    figure.parts.find((mesh) => mesh.name.endsWith(`:diagnostic:${suffix}`));
  const hitbox = diagnostic("hitbox");
  if (hitbox !== undefined) {
    hitbox.position.set(0, 0.025, 0);
    hitbox.scaling.set(2.04, 0.05, 2.04);
  }
  const facing = diagnostic("facing");
  if (facing !== undefined) {
    facing.position.set(1.18, 0.06, 0);
    facing.rotation.set(0, 0, -Math.PI / 2);
    facing.scaling.set(0.07, 1.18, 0.07);
  }
  const reach = diagnostic("reach");
  if (reach !== undefined) {
    const length = Math.max(0.05, unit.actionLength * Math.max(0, unit.limbReach) / radius);
    const along = Math.cos(rel);
    const left = Math.sin(rel);
    reach.position.set(along * length / 2, 0.1, left * length / 2);
    const orientation = new Quaternion();
    Quaternion.FromUnitVectorsToRef(
      Vector3.UpReadOnly, new Vector3(along, 0, left), orientation,
    );
    reach.rotationQuaternion = orientation;
    reach.scaling.set(0.045, length, 0.045);
  }
}

const SCRATCH_DIRECTION = new Vector3();
const SCRATCH_ROTATION = new Quaternion();
const SCRATCH_INVERSE = new Quaternion();

/** Root-local point: `x` along the facing, `z` the anatomical left, `y` up. */
type Local = readonly [number, number, number];

/** Orient a node's local `+Y` onto a root-local direction and place its origin. */
function aimNode(node: TransformNode, at: Local, towards: Local): number {
  const dx = towards[0] - at[0];
  const dy = towards[1] - at[1];
  const dz = towards[2] - at[2];
  const length = Math.hypot(dx, dy, dz);
  node.position.set(at[0], at[1], at[2]);
  const rotation = node.rotationQuaternion;
  if (rotation === null) throw new Error(`figure node ${node.name} lost its quaternion`);
  if (length < 1e-6) rotation.copyFromFloats(0, 0, 0, 1);
  else {
    SCRATCH_DIRECTION.copyFromFloats(dx / length, dy / length, dz / length);
    Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, SCRATCH_DIRECTION, rotation);
  }
  return length;
}

/** A segment-shaped part under an aimed node: centred at half length. */
function stretchPart(part: InstancedMesh, length: number, thickness: number): void {
  part.position.set(0, length / 2, 0);
  part.scaling.set(thickness, Math.max(length, 1e-4), thickness);
}

/**
 * Drive every joint and part from one interpolated frame sample.
 *
 * The blade is not negotiable: hilt at `radius` along `limbAngle` at hand
 * height, tip at `radius + actionLength * limbReach` -- the segment
 * `World::blade` builds and tests against, the same rule `web/main.js`
 * `drawRig` states as the one thing in its rig that may never take garnish.
 */
export function poseFigure(figure: Figure, unit: PresentationUnit): void {
  const root = figure.root;
  root.position.set(unit.x, 0, unit.y);
  const rotation = root.rotationQuaternion;
  if (rotation === null) throw new Error("figure root lost its quaternion");
  Quaternion.RotationYawPitchRollToRef(-unit.facing, 0, 0, rotation);
  const radius = Math.max(0.01, unit.radius);
  root.scaling.setAll(radius);

  const node = (at: string): TransformNode => {
    const found = figure.nodes.get(at);
    if (found === undefined) throw new Error(`figure rig has no ${at}`);
    return found;
  };
  const part = (suffix: string): InstancedMesh => {
    const found = figure.parts.find((mesh) => mesh.name.endsWith(`:${suffix}`));
    if (found === undefined) throw new Error(`figure has no part ${suffix}`);
    return found;
  };

  const height = figureBodyHeightRadii(unit.kind);
  // Speed decides how much of a walk to draw and the published stride clock
  // decides where in it we are -- a walled or shoved body freezes for free
  // because the sim's own numbers stopped moving.
  const walk = Math.min(1, Math.hypot(unit.vx, unit.vy) / (radius * WALK_FULL_SPEED_PER_RADIUS) || 0);
  const phase = unit.stridePhase * TAU;
  const rel = unit.limbAngle - unit.facing;
  const along = Math.cos(rel);
  const left = Math.sin(rel);
  const progress = unit.swingSpan > 0 ? Math.min(1, Math.max(0, 1 - unit.limbSwingLeft / unit.swingSpan)) : 0;
  const swapping = unit.limbSwing === SWING_SWAP;
  const armed = unit.actionRole !== ROLE_MOVE && !swapping;
  const activeAction = unit.slot === 0 ? unit.slot0Action : unit.slot1Action;
  poseFigureDiagnostics(figure, unit, radius, rel);

  if (unit.kind === KIND_SKITTERER) {
    poseCrawler(figure, unit, { node, part, height, walk, phase, along, left, armed, activeAction, radius });
    return;
  }

  const shoulder = SHOULDER_OF_HEIGHT * height;
  const hip = HIP_OF_SHOULDER * shoulder;
  const hand = HAND_OF_SHOULDER * shoulder;
  const headRadius = 0.3;
  const torsoTop = 1.02 * shoulder;
  const torsoBottom = 0.34 * shoulder;

  // The spine chain carries positions only; orientation stays the root's, so
  // the arms' own aims below are stated in one frame.
  const pelvis = node("pelvis");
  pelvis.position.set(0, hip, 0);
  pelvis.rotationQuaternion?.copyFromFloats(0, 0, 0, 1);
  const pelvisPart = part("pelvis");
  pelvisPart.position.set(0, 0, 0);
  pelvisPart.scaling.set(0.8, 0.3, 0.5);
  const torsoNode = node("torso");
  const torsoCentre = (torsoTop + torsoBottom) / 2;
  torsoNode.position.set(0, torsoCentre - hip, 0);
  torsoNode.rotationQuaternion?.copyFromFloats(0, 0, 0, 1);
  const torsoPart = part("torso");
  torsoPart.position.set(0, 0, 0);
  torsoPart.scaling.set(1.05, torsoTop - torsoBottom, 0.66);
  const head = node("head");
  head.position.set(0.05, height - headRadius - torsoCentre, 0);
  head.rotationQuaternion?.copyFromFloats(0, 0, 0, 1);
  const headPart = part("head");
  headPart.position.set(0, 0, 0);
  headPart.scaling.setAll(headRadius * 2);
  // The crest is the helmet read: a thin fore-aft blade over the crown.
  const crest = part("crest");
  crest.position.set(0, headRadius * 0.9, 0);
  crest.scaling.set(headRadius * 1.9, headRadius * 0.9, 0.07);

  // Legs, from the hips to feet that swing with the published stride and lift
  // on the forward half of their own swing -- `web/rig.js`'s walk, in 3D.
  for (const [suffix, side, legPhase] of [["leg:right", -LEG_SIDE, phase], ["leg:left", LEG_SIDE, phase + TAU / 2]] as const) {
    const foot: Local = [
      LEG_SWING * Math.sin(legPhase) * walk,
      FOOT_LIFT_OF_SHOULDER * shoulder * walk * Math.max(0, Math.cos(legPhase)),
      side,
    ];
    placeLimb(part(suffix), [0, hip, side], foot, 0.26);
  }

  // Arms. The main (right) arm reaches for the published hand and stops
  // solving there -- no elbow, on the Canvas rig's own argument that an elbow
  // is invisible at review size. Mid-swap the hand is empty and the arm
  // returns to the carry over the swap's own progress. The off (left) arm
  // holds the carry and swings with the walk.
  const shoulderRight: Local = [0, 0.94 * shoulder, -ARM_SIDE];
  const shoulderLeft: Local = [0, 0.94 * shoulder, ARM_SIDE];
  const carryRight: Local = [CARRY_ALONG, CARRY_OF_SHOULDER * shoulder, -ARM_SIDE];
  const handPoint: Local = [along, hand, left];
  const carry = swapping ? progress : 0;
  // Role alone is not an active pose: at reset the chosen strike role can
  // coexist with zero authoritative reach. Treating that row as a full reach
  // made the visible Fighter freeze in a rigid T-pose before its first action.
  const reaching = unit.actionRole !== ROLE_MOVE && unit.limbReach > 0.05 && !swapping;
  const targetRight: Local = reaching
    ? [handPoint[0] + (carryRight[0] - handPoint[0]) * carry,
      handPoint[1] + (carryRight[1] - handPoint[1]) * carry,
      handPoint[2] + (carryRight[2] - handPoint[2]) * carry]
    : [carryRight[0] + ARM_SWING * Math.sin(phase) * walk, carryRight[1], carryRight[2]];
  const targetLeft: Local = [
    CARRY_ALONG + ARM_SWING * Math.sin(phase + TAU / 2) * walk, CARRY_OF_SHOULDER * shoulder, ARM_SIDE,
  ];
  const torsoOffset: Local = [0, torsoCentre, 0];
  for (const [side, from, to] of [["right", shoulderRight, targetRight], ["left", shoulderLeft, targetLeft]] as const) {
    const arm = node(`arm_${side}`);
    // The arm node is a child of `torso`, so its placement is stated relative
    // to the torso's centre; the torso itself is unrotated, so directions stay
    // in the root frame.
    const length = aimNode(arm,
      [from[0] - torsoOffset[0], from[1] - torsoOffset[1], from[2] - torsoOffset[2]],
      [to[0] - torsoOffset[0], to[1] - torsoOffset[1], to[2] - torsoOffset[2]]);
    stretchPart(part(`arm:${side}`), length, 0.18);
    const handNode = node(`hand_${side}`);
    handNode.position.set(0, length, 0);
    handNode.rotationQuaternion?.copyFromFloats(0, 0, 0, 1);
    const handPart = part(`hand:${side}`);
    handPart.position.set(0, 0, 0);
    handPart.scaling.setAll(0.28);
  }

  // The held item. `bladeLive`'s rule: a strike role with a live reach shows
  // the exact blade segment; a shoot role holds its stave upright at the
  // hand; anything else -- move, guard, swap, an empty slot -- shows nothing.
  const blade = part("blade");
  const strikeLength = (unit.actionLength * unit.limbReach) / radius;
  const shootLength = unit.actionLength / radius;
  const bladeLive = armed && activeAction !== SLOT_EMPTY && (
    (unit.actionRole === ROLE_STRIKE && unit.limbReach > 0.05 && strikeLength > 0)
    || (unit.actionRole === ROLE_SHOOT && shootLength > 0));
  blade.setEnabled(bladeLive);
  const socket = node("socket_weapon_right");
  if (bladeLive) {
    // The socket is a grandchild of the aimed arm node, so its aim is composed
    // against the arm's rotation: local = inverse(arm world-local) * wanted.
    const arm = node("arm_right");
    const armRotation = arm.rotationQuaternion;
    const socketRotation = socket.rotationQuaternion;
    if (armRotation === null || socketRotation === null) throw new Error("figure arm lost its quaternion");
    if (unit.actionRole === ROLE_SHOOT) SCRATCH_DIRECTION.copyFromFloats(0, 1, 0);
    else SCRATCH_DIRECTION.copyFromFloats(along, 0, left);
    Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, SCRATCH_DIRECTION, SCRATCH_ROTATION);
    Quaternion.InverseToRef(armRotation, SCRATCH_INVERSE);
    SCRATCH_INVERSE.multiplyToRef(SCRATCH_ROTATION, socketRotation);
    socket.position.set(0, 0, 0);
    const length = unit.actionRole === ROLE_SHOOT ? shootLength : strikeLength;
    blade.position.set(0, unit.actionRole === ROLE_SHOOT ? -length / 2 + 0.2 : length / 2, 0);
    blade.scaling.set(0.1, length, 0.1);
  }

  // The guard buckler, on the limb's own bearing and not on the off hand --
  // the sim has exactly one limb and it is the one the guard arc is drawn at;
  // a shield on the other arm would claim cover somewhere the sim will not
  // defend (`web/main.js`, `RIG_SLOT_SHIELD`).
  const shield = part("shield");
  const shieldLive = unit.actionRole === ROLE_GUARD && !swapping && activeAction !== SLOT_EMPTY;
  shield.setEnabled(shieldLive);
  const shieldSocket = node("socket_shield");
  if (shieldLive) {
    aimNode(shieldSocket, [along * SHIELD_OUT, hand, left * SHIELD_OUT],
      [along * (SHIELD_OUT + 1), hand, left * (SHIELD_OUT + 1)]);
    shield.position.set(0, 0, 0);
    shield.scaling.set(1.1, 0.12, 1.1);
  } else if (unit.slot0Action === 4 || unit.slot1Action === 4) {
    // The authored dress keeps equipped gear readable between actions. The
    // procedural shield itself stays hidden here, but its durable socket
    // carries the authored plate beside the off hand instead of leaving it at
    // the actor root until the first guard.
    shieldSocket.position.set(CARRY_ALONG, CARRY_OF_SHOULDER * shoulder, ARM_SIDE * 1.06);
    shieldSocket.rotationQuaternion?.copyFromFloats(0, 0, 0, 1);
  }
}

type CrawlerPose = Readonly<{
  node: (at: string) => TransformNode;
  part: (suffix: string) => InstancedMesh;
  height: number;
  walk: number;
  phase: number;
  along: number;
  left: number;
  armed: boolean;
  activeAction: number;
  radius: number;
}>;

/**
 * The Skitterer: wider than it is tall, a low body on splayed legs with the
 * head carried out in front -- `web/rig.js` `RIG_CRAWLER`'s read, in 3D. Its
 * bite is a blade segment out of `limbAngle` like anybody else's.
 */
function poseCrawler(figure: Figure, unit: PresentationUnit, pose: CrawlerPose): void {
  const { node, part, height, walk, phase } = pose;
  const bodyHeight = 0.6 * height;
  const torsoNode = node("torso");
  // The crawler reuses the chain: pelvis stays at the origin, `torso` carries
  // the low body, `head` rides ahead of it.
  node("pelvis").position.set(0, 0, 0);
  torsoNode.position.set(-0.05, bodyHeight, 0);
  torsoNode.rotationQuaternion?.copyFromFloats(0, 0, 0, 1);
  const body = part("body");
  body.position.set(0, 0, 0);
  body.scaling.set(1.5, 0.55 * height, 0.95);
  const head = node("head");
  head.position.set(0.6, 0.1 * height, 0);
  head.rotationQuaternion?.copyFromFloats(0, 0, 0, 1);
  const headPart = part("head");
  headPart.position.set(0, 0, 0);
  headPart.scaling.setAll(0.5);
  const hips: readonly Local[] = [
    [0.3, 0.85 * bodyHeight, 0.52], [0.3, 0.85 * bodyHeight, -0.52],
    [-0.35, 0.85 * bodyHeight, 0.52], [-0.35, 0.85 * bodyHeight, -0.52],
  ];
  const feet: readonly Local[] = [
    [0.55, 0, 0.98], [0.55, 0, -0.98], [-0.6, 0, 0.95], [-0.6, 0, -0.95],
  ];
  for (let leg = 0; leg < 4; leg++) {
    const hip = hips[leg];
    const foot = feet[leg];
    if (hip === undefined || foot === undefined) continue;
    const legPhase = phase + (leg % 2 === 0 ? 0 : TAU / 2);
    const swung: Local = [
      foot[0] + 0.34 * Math.sin(legPhase) * walk,
      0.09 * height * walk * Math.max(0, Math.cos(legPhase)),
      foot[2],
    ];
    placeLimb(part(`leg:${leg}`), hip, swung, 0.16);
  }
  const blade = part("blade");
  const length = (unit.actionLength * unit.limbReach) / pose.radius;
  const live = pose.armed && pose.activeAction !== SLOT_EMPTY
    && unit.actionRole === ROLE_STRIKE && unit.limbReach > 0.05 && length > 0;
  blade.setEnabled(live);
  if (live) {
    const socket = node("socket_weapon_right");
    // The crawler's socket chain (arm, hand) is left at identity, so the
    // socket aim needs no composition.
    node("arm_right").position.set(0, 0, 0);
    node("hand_right").position.set(0, 0, 0);
    aimNode(socket, [pose.along, 0.5 * height, pose.left],
      [pose.along * 2, 0.5 * height, pose.left * 2]);
    blade.position.set(0, length / 2, 0);
    blade.scaling.set(0.12, length, 0.12);
  }
}

/**
 * Legs are meshes with no semantic leg bone -- the combatant contract names
 * none, consistent with a simulation that publishes one leg capsule -- so the
 * instance doubles as its own joint: centred on the segment, aligned along it,
 * scaled to its length.
 * Written as derived presentation, per the room-view plan: nobody may read a
 * leg angle back as simulation state.
 */
function placeLimb(limb: InstancedMesh, from: Local, to: Local, thickness: number): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  limb.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
  if (limb.rotationQuaternion === null) limb.rotationQuaternion = Quaternion.Identity();
  if (length < 1e-6) limb.rotationQuaternion.copyFromFloats(0, 0, 0, 1);
  else {
    SCRATCH_DIRECTION.copyFromFloats(dx / length, dy / length, dz / length);
    Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, SCRATCH_DIRECTION, limb.rotationQuaternion);
  }
  limb.scaling.set(thickness, Math.max(length, 1e-4), thickness);
}
