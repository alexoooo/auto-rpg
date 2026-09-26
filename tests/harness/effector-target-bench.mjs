// Node/Havok effector stand, fixed solver clock, awake bodies, no rendering.
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CONFIG } from "../../src/config.ts";
import { freshBodyCommand, setChannelFlags } from "../../src/body-command.ts";
import { EFFECTOR_TERMINALS } from "../../src/golem/registry.ts";
import { effectorModule } from "../../src/golem/effectors/effector.ts";
import { anatomicalChain } from "../../src/golem/humanoid/arm.ts";
import { buildGolemStand, golemLayers } from "../../src/golem/stand.ts";
import { ARM_LIMITS, armForward, rotationError, solveArm } from "../../src/golem/humanoid/kinematics.ts";
import { HUMAN_MOUNT } from "../../src/golem/humanoid/grip.ts";
import { createHeadlessArena } from "./golem-headless-arena.mjs";

export async function targetBench({ speed = 1, force = 1, enabled = true, slot = "primary", yaw = 0,
  terminal = "blade", seconds = 3, impossible = false, tone = 1, returnToAim = false } = {}) {
  const previous = setChannelFlags({ effector: enabled });
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const { scene } = arena;
  const stand = buildGolemStand(scene, { side: "left", facing: Quaternion.RotationAxis(Vector3.Up(), yaw) });
  const socket = stand.socket(slot);
  const module = effectorModule(anatomicalChain, EFFECTOR_TERMINALS[terminal]).build({ scene, side: "left", name: "task",
    socket, companion: stand.socket(slot === "primary" ? "secondary" : "primary"),
    layers: golemLayers("left"), materials: stand.materials, tone: { scale: tone } });
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  for (const part of module.parts) plugin.setActivationControl(part.part.body, 1);
  const initial = module.view().axes.map(axis => axis.commanded);
  const limits = module.envelope().reachable;
  const swing = limits.swingMin + .7 * (limits.swingMax - limits.swingMin);
  const lift = limits.liftMin + .6 * (limits.liftMax - limits.liftMin);
  const reach = limits.reachMin + .6 * (limits.reachMax - limits.reachMin);
  const localGoal = new Vector3(socket.outboard * Math.sin(swing) * Math.cos(lift) * reach,
    Math.sin(lift) * reach, Math.cos(swing) * Math.cos(lift) * reach);
  const requested = solveArm(localGoal, null, initial, 160, 0);
  const pose = armForward(requested);
  const rotation = socket.mount.mesh.rotationQuaternion;
  const worldSocket = socket.local.rotateByQuaternionToRef(rotation, new Vector3()).add(socket.mount.mesh.position);
  const orientation = rotation.multiply(pose.rotation);
  const offset = module.envelope().reach - module.envelope().reachable.reachMax;
  const point = pose.point.rotateByQuaternionToRef(rotation, new Vector3()).add(worldSocket)
    .add(HUMAN_MOUNT.perp.scale(offset).rotateByQuaternionToRef(orientation, new Vector3()));
  if (impossible) point.addInPlace(new Vector3(20, 20, -20));
  const command = freshBodyCommand().effectors.primary;
  command.target = { position: point, orientation, speed, force };
  const rates = module.envelope().axes.map(axis => axis.rate);
  let elapsed = 0, peakAxisRate = 0, peakRateFraction = 0, old = initial;
  const observer = scene.onBeforePhysicsObservable.add(() => {
    module.commandEffector(command);
    module.step(1 / CONFIG.world.physicsHz);
    const angles = module.view().axes.map(axis => axis.commanded);
    for (let i = 0; i < angles.length; i++) {
      const rate = Math.abs(angles[i] - old[i]) * CONFIG.world.physicsHz;
      peakAxisRate = Math.max(peakAxisRate, rate);
      if (rates[i] > 0) peakRateFraction = Math.max(peakRateFraction, rate / rates[i]);
    }
    old = angles;
    elapsed += 1 / CONFIG.world.physicsHz;
    if (returnToAim && elapsed >= .5) delete command.target;
  });
  try {
    for (let frame = 0; frame < Math.ceil(seconds * 60); frame++) {
      scene._renderId += 1;
      scene._advancePhysicsEngineStep(1000 / 60);
    }
    const view = module.view();
    const worldOrientation = rotation.multiply(view.orientation);
    return {
      channels: module.channels(), initial, commanded: view.axes.map(axis => axis.commanded),
      withinStops: view.axes.every((axis, i) => axis.commanded >= ARM_LIMITS[i][0] && axis.commanded <= ARM_LIMITS[i][1]),
      tipError: Vector3.Distance(view.tip, point), commandError: Vector3.Distance(view.commandedTip, point),
      orientationError: rotationError(orientation, worldOrientation).length(), peakAxisRate, peakRateFraction,
      positions: module.parts.map(part => part.part.mesh.position.asArray()),
      commandedPalm: armForward(view.axes.map(axis => axis.commanded)).point.asArray(),
      reachable: module.envelope().reachable, outboard: socket.outboard,
      restoredDrive: module.captureState().built.captureState().taskForce,
    };
  } finally {
    scene.onBeforePhysicsObservable.remove(observer);
    module.dispose(); stand.dispose(); arena.dispose(); setChannelFlags(previous);
  }
}
