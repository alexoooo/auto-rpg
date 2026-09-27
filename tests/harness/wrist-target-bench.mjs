// Physical wrist target bench: build a reachable pose, leave it, then ask the business end to return.
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CONFIG } from "../../src/config.ts";
import { freshBodyCommand, setChannelFlags } from "../../src/body-command.ts";
import { EFFECTOR_TERMINALS } from "../../src/golem/registry.ts";
import { effectorModule } from "../../src/golem/effectors/effector.ts";
import { wristChain } from "../../src/golem/effectors/chains/wrist.ts";
import { skeletalChain } from "../../src/golem/skeleton/body.ts";
import { buildGolemStand, golemLayers } from "../../src/golem/stand.ts";
import { createHeadlessArena } from "./golem-headless-arena.mjs";

export async function wristTargetBench({ family = "stone", slot = "primary", speed = 1, force = 1,
  enabled = true, yaw = .7, impossible = false, returnToAim = false, terminal = "blade", tone = 1 } = {}) {
  const previous = setChannelFlags({ effector: enabled });
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const { scene } = arena;
  const stand = buildGolemStand(scene, { side: "left", facing: Quaternion.RotationAxis(Vector3.Up(), yaw) });
  const chain = family === "skeleton" ? skeletalChain : wristChain;
  const module = effectorModule(chain, EFFECTOR_TERMINALS[terminal]).build({ scene, side: "left", name: "wrist-task",
    socket: stand.socket(slot), companion: stand.socket(slot === "primary" ? "secondary" : "primary"),
    layers: golemLayers("left"), materials: stand.materials, tone: { scale: tone } });
  const plugin = scene.getPhysicsEngine().getPhysicsPlugin();
  for (const part of module.parts) plugin.setActivationControl(part.part.body, 1);
  const wrist = module.parts.find(part => part.id.endsWith(".wrist")).part.mesh;
  const command = freshBodyCommand().effectors.primary;
  command.aim.pointerX = slot === "primary" ? .4 : -.4;
  command.aim.pointerY = .35;
  command.aim.reach = .3;
  command.aim.roll = .2;
  command.aim.wristBend = .3;
  const observer = scene.onBeforePhysicsObservable.add(() => {
    module.commandEffector(command);
    module.step(1 / CONFIG.world.physicsHz);
  });
  const advance = seconds => {
    for (let frame = 0; frame < Math.ceil(seconds * 60); frame++) {
      scene._renderId += 1;
      scene._advancePhysicsEngineStep(1000 / 60);
    }
  };
  try {
    advance(3);
    const legacyAxes = module.view().axes.map(axis => axis.commanded);
    const legacyCommandedTip = module.view().commandedTip.clone();
    const target = { position: module.view().tip.clone(), orientation: wrist.rotationQuaternion.clone(), speed, force };
    if (impossible) target.position.addInPlace(new Vector3(20, 20, -20));
    command.aim.pointerX = 0; command.aim.pointerY = 0; command.aim.reach = 0;
    command.aim.roll = 0; command.aim.wristBend = 0;
    advance(2);
    const before = module.view().tip.clone();
    const initial = module.view().axes.map(axis => axis.commanded);
    command.target = target;
    advance(4);
    const view = module.view();
    const envelope = module.envelope();
    const achieved = wrist.rotationQuaternion;
    const dot = Math.min(1, Math.abs(Quaternion.Dot(target.orientation, achieved)));
    const state = module.captureState().built.captureState();
    const commanded = view.axes.map(axis => axis.commanded);
    const positions = module.parts.map(part => part.part.mesh.position.asArray());
    const tip = view.tip.asArray(), tipError = Vector3.Distance(view.tip, target.position);
    const commandedTip = view.commandedTip.asArray();
    const withinStops = view.axes.every((axis, i) => axis.commanded >= envelope.axes[i].min - .001
      && axis.commanded <= envelope.axes[i].max + .001);
    if (returnToAim) { command.target = null; advance(.1); }
    const restored = returnToAim ? module.captureState().built.captureState() : state;
    return { family, slot, terminal, speed, force, enabled, target: target.position.asArray(),
      before: before.asArray(), tip, tipError, commandedTip,
      legacyCommandedTip: legacyCommandedTip.asArray(), legacyStray: Vector3.Distance(legacyCommandedTip, target.position),
      initial, commanded, legacyAxes, positions,
      orientationError: 2 * Math.acos(dot), channels: module.channels(),
      withinStops,
      taskDrive: { speed: state.taskSpeed, force: state.taskForce },
      restoredDrive: { speed: restored.taskSpeed, force: restored.taskForce } };
  } finally {
    scene.onBeforePhysicsObservable.remove(observer);
    module.dispose(); stand.dispose(); arena.dispose(); setChannelFlags(previous);
  }
}
