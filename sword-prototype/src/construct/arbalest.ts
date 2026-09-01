import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { validateControlGraph, type ConstructControlGraph } from "./actions.ts";
import { validateBlueprint, type AttachmentFrame, type ConstructBlueprint,
  type ModuleSpec } from "./blueprint.ts";
import { saveConstruct, type SavedConstruct } from "./codec.ts";
import { groundedConstructOriginY, resolveConstructBindTransforms } from "./compile.ts";
import { humanoidBlueprint, humanoidControl, humanoidProfileMetrics,
  HUMANOID_SENSORS } from "./humanoid.ts";
import type { ConstructProgram } from "./program.ts";
import type { SensorSpec } from "./sensors.ts";
import { humanoidLocomotionRules, humanoidOpponentAligned } from "./humanoid-locomotion-program.ts";

const I = Object.freeze([0, 0, 0, 1] as const);
const frame = (positionM: readonly [number, number, number] = [0, 0, 0]): AttachmentFrame =>
  Object.freeze({ positionM: Object.freeze([...positionM]) as [number, number, number],
    rotation: I });
type ModuleGeometrySpec = ModuleSpec["geometry"][number];
const geometry = (id: string, shape: ModuleGeometrySpec["shape"],
  positionM: readonly [number, number, number] = [0, 0, 0],
  style: ModuleGeometrySpec["shell"]["style"] = "plate"): ModuleGeometrySpec => Object.freeze({
  id, frame: frame(positionM), shape: Object.freeze(shape),
  shell: Object.freeze({ style, visualClearanceM: style === "bearing" ? 0.002 : 0.006 }),
});

/**
 * One explicit compact hardware bill rather than balance hidden in a controller.
 *
 * The 2.4 kg magazine is twelve 0.12 kg bolts plus a 0.96 kg torso carrier. The
 * 0.65 s reload and the bolt's mass, dimensions and 42 m/s launch speed are the
 * existing Warden projectile geometry and cadence; the compact 3.2 kg hand-mount,
 * twelve-round carrier and 1.90 heavy-bolt damage scale are explicit chassis choices. Combat pacing belongs to the Mind:
 * it gives a newly fallen opponent a recovery window, then finishes a body that
 * remains incapacitated instead of waiting for the bout cap. Pool size is recycling
 * capacity, not ammunition.
 */
export const ARBALEST_HARDWARE = Object.freeze({
  launcherMassKg: 3.2,
  magazineMassKg: 2.4,
  ammunition: 12,
  carrierMassKg: 0.96,
  reloadSeconds: 0.65,
  maxHeatJ: 1200,
  coolingW: 65,
  heatPerShotJ: 85,
  energyPerShotJ: 160,
  projectile: Object.freeze({ poolSize: 16, massKg: 0.12, radiusM: 0.018,
    lengthM: 0.34, muzzleSpeedMps: 42, damageScale: 1.90 }),
});

/** V1 remains named evidence; assisted locomotion is a distinct qualification claim. */
export const ARBALEST_HISTORICAL_QUALIFIER_ID = "arbalest-fatal-arrow-v1";
export const ARBALEST_ASSISTED_QUALIFIER_ID = "arbalest-assisted-support-v2";

/**
 * The 2026-08-29 x0.10 mirrored sweep retained the fixed -0.10 m lane: it produced
 * 2/8 raw wins where fixed negative 0.06, 0.12, 0.15 and 0.20 m magnitudes produced
 * 1, 0, 0 and 0. A 2026-08-30 recovery-aware cadence sweep found no hardware-only
 * compromise: 0.72/0.80/0.88 s won the first 4/4 with zero Warrior recoveries;
 * 0.96 s recovered 4/4 and won 0/4; 0.90 s centre aim passed that half-corpus but
 * fell to 3/8 qualified on the full mirrors. The Mind therefore retains proven
 * hardware cadence. The recovery-aware 2026-08-31 sweep instead selects the lane opposite the
 * blocker relative to the opponent's centre and uses 0.07 m, with a -0.05 m vertical trim. The
 * later outboard launcher mount needed 0.12 m to keep that same blocker-relative lane visibly
 * open; 0.07 m let the full-health follow-up draw repeatedly feed the buckler. That
 * live sight fact feeds the mount without changing Action parameters mid-draw. The same corpus
 * rejected both the old
 * 1.80 m retreat boundary (one damaging arrow landed after support was lost) and wider guesses:
 * 2.00 and 2.20 m introduced new contact/posture timing failures, while 2.40 m happened to pass
 * only that single cell. The narrower 1.90 m correction qualified all eight mirrors under the
 * superseded rule that let a supported carrier walk through a fallen body. Once a living fallen
 * body retained recovery space, the same Mind spent all twelve bolts and drew at 9.99% Warrior
 * vitality. A fresh 2026-08-31 1.90/2.20/2.40 m bracket retained 2.40 m: only that cell restored
 * the full-health seeded win, with the Construct supported at root-up 0.99786 after the fatal shot.
 * The x0.10 mirrored damage bracket then rejected 1.85 at only 5/8 posture-qualified wins and
 * retained 1.90 at 8/8; all eight winners remained upright and spent exactly two bolts.
 * Fragile hardware spends its immediate follow-up during the bounded rise; the separately delayed
 * prone-finisher remains common to both hardware profiles. After the mount moved, a six-height
 * fixed-seed prone sweep found +0.15 m was the only prompt torso-finishing lane near centre;
 * lower rows fed fallen limbs and +0.35 m drew.
 */
export const ARBALEST_TACTICS = Object.freeze({ blockerClearanceM: 0.12,
  targetHeightOffsetM: -0.05, reacquireAfterReloadS: 0.10,
  finishDownedAfterS: 1.25, finishTargetHeightOffsetM: 0.15, desperateLauncherHealth: 9 });
export const ARBALEST_LOCOMOTION = Object.freeze({ retreatBelowM: 2.40, closeAtM: 6.00 });
export const ARBALEST_LEFT_SWORD_GUARD = Object.freeze({
  shoulder: -0.35, elbow: -0.65, wrist: 0.35, palm: -0.15,
});

export const ARBALEST_SENSORS: readonly SensorSpec[] = Object.freeze([
  ...HUMANOID_SENSORS.map((sensor) => Object.freeze({ ...sensor })),
  Object.freeze({ id: "opponent-upright", unit: "boolean", source: "opponent" } as const),
  Object.freeze({ id: "opponent-rising", unit: "boolean", source: "opponent" } as const),
  Object.freeze({ id: "opponent-aim-local-x", unit: "metres", source: "opponent" } as const),
  Object.freeze({ id: "module-max-health-effigy-arbalest", unit: "scalar", source: "self" } as const),
]);

const TARGET_HEIGHT_PARAMETER = Object.freeze({ kind: "number" as const,
  min: -0.5, max: 0.75, unit: "metres" as const });
const TARGET_LATERAL_PARAMETER = Object.freeze({ kind: "number" as const,
  min: -0.6, max: 0.6, unit: "metres" as const });

const launcherModule = (): ModuleSpec => Object.freeze({
  id: "effigy-arbalest", kind: "launcher", socket: "socket-sword-hand",
  compatibilityTag: "dorsal-weapon",
  geometry: Object.freeze([
    geometry("stock", { kind: "box", sizeM: [0.14, 0.14, 0.28] }, [0, 0, -0.05]),
    geometry("rail", { kind: "box", sizeM: [0.06, 0.06, 0.32] }, [0, 0.05, 0.05], "bearing"),
    geometry("bow", { kind: "box", sizeM: [0.24, 0.05, 0.06] }, [0, 0.05, 0.08], "bearing"),
  ]),
  massKg: ARBALEST_HARDWARE.launcherMassKg, health: 90, armour: 12,
  maxHeatJ: ARBALEST_HARDWARE.maxHeatJ, coolingW: ARBALEST_HARDWARE.coolingW,
  reloadSeconds: ARBALEST_HARDWARE.reloadSeconds,
  heatPerShotJ: ARBALEST_HARDWARE.heatPerShotJ,
  energyPerShotJ: ARBALEST_HARDWARE.energyPerShotJ,
  projectile: ARBALEST_HARDWARE.projectile,
});

const magazineModule = (): ModuleSpec => Object.freeze({
  id: "effigy-arbalest-magazine", kind: "magazine", socket: "socket-arbalest-magazine",
  compatibilityTag: "magazine",
  geometry: Object.freeze([
    geometry("carrier", { kind: "box", sizeM: [0.16, 0.28, 0.10] }),
    geometry("feed", { kind: "box", sizeM: [0.08, 0.08, 0.14] }, [0.07, 0, 0], "bearing"),
  ]),
  massKg: ARBALEST_HARDWARE.magazineMassKg, health: 90, armour: 12,
  ammunition: ARBALEST_HARDWARE.ammunition,
});

export function arbalestBlueprint(): ConstructBlueprint {
  const base = structuredClone(humanoidBlueprint());
  const sight = base.modules.find(({ id }) => id === "effigy-sight");
  const ordinarySword = base.modules.find(({ id }) => id === "effigy-sword");
  const torso = base.parts.find(({ id }) => id === "torso");
  if (!ordinarySword || torso?.shape.kind !== "box") {
    throw new Error("Arbalest requires the humanoid sword and box torso");
  }
  const modules = base.modules.filter(({ id }) => id !== "effigy-sword").map((module) =>
    module.id === sight?.id ? { ...module, sensorChannels: ARBALEST_SENSORS.map(({ id }) => id)
      .filter((id) => !id.startsWith("contact-") && !id.startsWith("slip-")) } : module);
  return validateBlueprint({ ...base, id: "arbalest-effigy",
    parts: base.parts,
    joints: base.joints,
    sockets: [...base.sockets.map((socket) => socket.id === "socket-sword-hand"
      ? { ...socket, frame: frame([0.20, socket.frame.positionM[1], 0.20]) }
      : socket),
      { id: "socket-arbalest-magazine", part: "torso",
        frame: frame([-0.18, -0.04, -0.19]), accepts: ["magazine"] },
      { id: "socket-arbalest-left-sword", part: "left-hand",
        frame: frame([0, 0, 0.10]), accepts: ["dorsal-weapon"] }],
    modules: [...modules, launcherModule(), magazineModule(),
      { ...ordinarySword, id: "effigy-left-sword", socket: "socket-arbalest-left-sword" }] });
}

export function arbalestControl(): ConstructControlGraph {
  const base = structuredClone(humanoidControl());
  const armJoints = ["left-shoulder", "left-elbow", "left-wrist", "left-palm"];
  const groups = base.groups.map((group) => group.id === "posture" ? {
    ...group, joints: group.joints.filter((joint) => !armJoints.includes(joint)),
  } : group.id !== "sword-arm" ? group : {
    id: "arbalest-arm", joints: group.joints,
    modules: ["effigy-arbalest", "effigy-arbalest-magazine"],
    bindings: {
      yaw: { joints: ["sword-yaw"], modules: [] },
      pitch: { joints: ["sword-pitch"], modules: [] },
      output: { joints: [], modules: ["effigy-arbalest", "effigy-arbalest-magazine"] },
      launcher: { joints: [], modules: ["effigy-arbalest"] },
    },
  }).concat([{ id: "left-sword-guard", joints: armJoints, modules: ["effigy-left-sword"], bindings: {} }]);
  const support = base.actions.filter(({ id }) =>
    ["hold", "stabilize", "move", "limp-left", "limp-right", "turn", "brace", "recover", "aim"].includes(id))
    .map((action) => action.id === "aim" ? { ...action, group: "arbalest-arm" } : action);
  return validateControlGraph({ version: 1, groups, actions: [...support,
    { id: "track", controller: "track-target", group: "arbalest-arm",
      claims: ["module:effigy-arbalest", "resource:power-mount", "resource:sensor-line-of-sight"],
      parameters: { "target-height-offset": TARGET_HEIGHT_PARAMETER,
        "target-lateral-offset": TARGET_LATERAL_PARAMETER } },
    { id: "fire", controller: "fire-projectile", group: "arbalest-arm",
      claims: ["module:effigy-arbalest", "module:effigy-arbalest-magazine", "resource:power-mount",
        "resource:ammo-effigy-arbalest-magazine", "resource:sensor-line-of-sight"],
      parameters: { "target-height-offset": TARGET_HEIGHT_PARAMETER,
        "target-lateral-offset": TARGET_LATERAL_PARAMETER } },
    { id: "guard-left-sword", controller: "arbalest-left-sword-guard", group: "left-sword-guard",
      claims: ["module:effigy-left-sword", "resource:power-left-guard"],
      parameters: Object.fromEntries(Object.keys(ARBALEST_LEFT_SWORD_GUARD).map((name) => [name,
        { kind: "number", min: -1.25, max: 0.95, unit: "radians" }])) },
  ] });
}

const constant = (value: number | boolean) => Object.freeze({ op: "constant" as const, value });
const sensor = (id: string) => Object.freeze({ op: "sensor" as const, id });
const active = (action: string) => Object.freeze({ op: "active" as const, action });

export function arbalestProgram(): ConstructProgram {
  const targetHeightOffset = Object.freeze({ kind: "expression" as const,
    value: Object.freeze({ ...constant(ARBALEST_TACTICS.targetHeightOffsetM), unit: "metres" as const }) });
  const targetLateralOffset = Object.freeze({ kind: "expression" as const,
    value: Object.freeze({ ...constant(0), unit: "metres" as const }) });
  const targetParameters = Object.freeze({ "target-height-offset": targetHeightOffset,
    "target-lateral-offset": targetLateralOffset });
  const finishTargetParameters = Object.freeze({ ...targetParameters,
    "target-height-offset": Object.freeze({ kind: "expression" as const,
      value: Object.freeze({ ...constant(ARBALEST_TACTICS.finishTargetHeightOffsetM),
        unit: "metres" as const }) }) });
  const locomotionBand = Object.freeze({ op: "and" as const, values: Object.freeze([
    humanoidOpponentAligned(),
    Object.freeze({ op: "gte" as const, left: sensor("opponent-range"),
      right: Object.freeze({ ...constant(ARBALEST_LOCOMOTION.retreatBelowM), unit: "metres" as const }) }),
    Object.freeze({ op: "lt" as const, left: sensor("opponent-range"),
      right: Object.freeze({ ...constant(ARBALEST_LOCOMOTION.closeAtM), unit: "metres" as const }) }),
  ]) });
  const launcherReady = Object.freeze({ op: "and" as const, values: Object.freeze([
    sensor("core-upright"), Object.freeze({ op: "lt" as const,
      left: sensor("opponent-range"), right: Object.freeze({ ...constant(8), unit: "metres" as const }) }),
    Object.freeze({ op: "lte" as const, left: sensor("reload-effigy-arbalest-magazine"),
      right: Object.freeze({ ...constant(0), unit: "seconds" as const }) }),
    Object.freeze({ op: "gt" as const, left: sensor("ammo-effigy-arbalest-magazine"),
      right: Object.freeze({ ...constant(0), unit: "scalar" as const }) }),
    Object.freeze({ op: "gt" as const, left: sensor("module-health-effigy-arbalest"),
      right: Object.freeze({ ...constant(0), unit: "scalar" as const }) }),
    Object.freeze({ op: "gt" as const, left: sensor("module-health-effigy-arbalest-magazine"),
      right: Object.freeze({ ...constant(0), unit: "scalar" as const }) }),
    Object.freeze({ op: "gt" as const, left: sensor("power-charge-j"),
      right: Object.freeze({ ...constant(0), unit: "joules" as const }) }),
    Object.freeze({ op: "not" as const, value: sensor("overheated") }),
  ]) });
  return Object.freeze({ version: 1, id: "arbalest-effigy-mind", rules: Object.freeze([
    ...humanoidLocomotionRules(ARBALEST_LOCOMOTION),
    Object.freeze({ id: "fire-in-range", action: "fire", priority: 30, optional: true,
      dwellS: ARBALEST_TACTICS.reacquireAfterReloadS,
      // Once admitted, a draw owns the launcher until it looses or fails. Supported turning can
      // move the line-of-sight sample for one solver row; withdrawing a live draw on that sample
      // produced a cancelled, serial-less attempt before the next exact-fresh support frame.
      condition: Object.freeze({ op: "or" as const, values: Object.freeze([active("fire"),
        Object.freeze({ op: "and" as const, values: Object.freeze([
          Object.freeze({ op: "or" as const, values: Object.freeze([
            sensor("opponent-upright"), Object.freeze({ op: "and" as const, values: Object.freeze([
              sensor("opponent-rising"),
              Object.freeze({ op: "lte" as const, left: sensor("module-max-health-effigy-arbalest"),
                right: Object.freeze({ ...constant(ARBALEST_TACTICS.desperateLauncherHealth),
                  unit: "scalar" as const }) }),
            ]) }),
          ]) }),
          sensor("line-of-sight"), Object.freeze({ op: "or" as const, values: Object.freeze([
            sensor("contact-left-foot"), sensor("contact-right-foot"),
          ]) }), launcherReady,
        ]) }),
      ]) }), utility: constant(20), parameters: targetParameters }),
    // A person may be driving the Warrior and may choose not to request a rise. Waiting forever
    // in that state is not discipline; it is a deadlock. Preserve the readable knockdown beat,
    // refuse fire throughout an actual rise, then admit a finishing draw after a stable prone dwell.
    Object.freeze({ id: "finish-downed-opponent", action: "fire", priority: 29, optional: true,
      dwellS: ARBALEST_TACTICS.finishDownedAfterS,
      condition: Object.freeze({ op: "and" as const, values: Object.freeze([
        Object.freeze({ op: "not" as const, value: sensor("opponent-upright") }),
        Object.freeze({ op: "not" as const, value: sensor("opponent-rising") }),
        // The ordinary sight ray is aimed at an upright vital point and is allowed to
        // disappear into the floor when that point falls. Fresh-foot contact alternates
        // during supported idle as well; after the prone dwell, core-upright is the stable
        // support fact. Requiring either transient reading recreated a 16-second near-timeout.
        launcherReady,
      ]) }), utility: constant(19), parameters: finishTargetParameters }),
    // Use the declared recovery window to acquire the finishing lane. Tracking
    // the old upright lane during that dwell made the fire action spend another
    // two seconds traversing after it was admitted -- and repeatedly feed the
    // same fallen buckler in the meantime.
    Object.freeze({ id: "track-downed-opponent", action: "track", priority: 26, optional: true, dwellS: 0,
      condition: Object.freeze({ op: "and" as const, values: Object.freeze([
        Object.freeze({ op: "not" as const, value: sensor("opponent-upright") }),
        Object.freeze({ op: "not" as const, value: sensor("opponent-rising") }),
        sensor("line-of-sight"),
      ]) }), utility: constant(9), parameters: finishTargetParameters }),
    // Keep following through the reload. Without this disjoint admission phase the mount
    // waited for ammunition before it began reacquiring a clinching opponent, spending
    // another 0.18--0.39 s exposed after every 0.65 s reload.
    Object.freeze({ id: "track-between-shots", action: "track", priority: 25, optional: true, dwellS: 0,
      condition: sensor("line-of-sight"), utility: constant(8), parameters: targetParameters }),
    Object.freeze({ id: "guard-left-sword", action: "guard-left-sword", priority: 22, optional: false, dwellS: 0,
      condition: sensor("line-of-sight"), utility: constant(6), parameters: Object.freeze(Object.fromEntries(
        Object.entries(ARBALEST_LEFT_SWORD_GUARD).map(([name, value]) => [name, Object.freeze({ kind: "expression" as const,
          value: Object.freeze({ ...constant(value), unit: "radians" as const }) })]))) }),
    Object.freeze({ id: "brace", action: "brace", priority: 20, optional: false, dwellS: 0,
      condition: locomotionBand, utility: constant(4), parameters: Object.freeze({}) }),
    Object.freeze({ id: "stabilize", action: "stabilize", priority: 10, optional: false, dwellS: 0,
      condition: constant(true), utility: constant(3), parameters: Object.freeze({}) }),
  ]) });
}

export function arbalestProfileMetrics(): Readonly<{ reach: number; crownHeight: number;
  vitalHeight: number; collisionRadius: number }> {
  const blueprint = arbalestBlueprint();
  const body = humanoidProfileMetrics();
  const origin = new Vector3(0, groundedConstructOriginY(blueprint), 0);
  const transforms = resolveConstructBindTransforms(blueprint, origin);
  const root = transforms.get(blueprint.rootPart);
  const launcher = blueprint.modules.find(({ id }) => id === "effigy-arbalest");
  const socket = blueprint.sockets.find(({ id }) => id === launcher?.socket);
  const owner = socket ? transforms.get(socket.part) : undefined;
  if (!root || !launcher?.projectile || !socket || !owner) {
    throw new Error("Arbalest profile metrics require the declared launcher bind geometry");
  }
  const rotation = owner.rotation.multiply(Quaternion.FromArray(socket.frame.rotation)).normalize();
  const moduleRoot = Vector3.FromArray(socket.frame.positionM)
    .rotateByQuaternionToRef(owner.rotation, new Vector3()).addInPlace(owner.position);
  const muzzle = Vector3.Forward().rotateByQuaternionToRef(rotation, new Vector3())
    .scaleInPlace(launcher.projectile.lengthM / 2 + 0.04).addInPlace(moduleRoot);
  // Host framing still needs the articulated arm's full physical envelope; a ranged
  // weapon does not make the body shorter merely because its bind-pose muzzle hangs low.
  return Object.freeze({ ...body, reach: Math.max(body.reach, Vector3.Distance(root.position, muzzle)) });
}

export function arbalestSavedConstruct(): SavedConstruct {
  return saveConstruct("Arbalest Effigy", arbalestBlueprint(), arbalestControl(),
    arbalestProgram(), ARBALEST_SENSORS);
}
