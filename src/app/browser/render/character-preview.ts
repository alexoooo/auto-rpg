import { warmScene } from "./ready.ts";
import { canvasScaling } from "./scene-profile.ts";
import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { resolveCharacter, type BodyModel, type CharacterConfig } from "../../../core/bodies/models.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { Quaternion as JointRotation, Vector3 as JointPoint } from "../../../core/math/vector.ts";
import { pointAtToRef, poseAngles, rotationAtToRef, specChainTo } from "../../../control/kinematics.ts";
import { puppetBody, type Puppet } from "./puppet.ts";
import { handsOf } from "./strike-hands.ts";
import { dresserFor } from "./dress.ts";
import { appearanceFor, type Appearance } from "../../../game/appearance/appearance.ts";
import { skinSlot, type SkinSlot } from "./skin-slot.ts";
import { publicAssetUrl } from "../asset-url.ts";

/** The body along its ground-facing axis, including the tail of a long body. */
const depthOf = (spec: BodySpec) => {
  const z = spec.segments.flatMap((s) => [s.proximal.value[2], s.distal.value[2]]);
  return { back: Math.min(...z), front: Math.max(...z) };
};

/** Anatomical angles for a relaxed portrait, in radians. */
const PORTRAIT_ANGLES: Readonly<Partial<Record<string, Readonly<Record<string, number>>>>> = {
  shoulder: { flexion: .03, abduction: .14 },
  elbow: { flexion: .14 },
  wrist: { flexion: .02, "radial deviation": 0 },
  hip: { abduction: .015 },
};

/** Pose the display nodes through the same joint anchors as the body's spec. */
function relaxPortrait(body: Puppet): void {
  const pose: Record<string, number> = {};
  for (const joint of body.spec.joints) {
    const [limb = ""] = joint.name.split(".");
    for (const dof of joint.dofs) {
      const angle = PORTRAIT_ANGLES[limb]?.[dof.positive];
      if (angle !== undefined) pose[`${joint.name} ${dof.positive}`] = angle - dof.bind.value;
    }
  }
  const angles = poseAngles(body.spec, pose), point = new JointPoint(), turn = new JointRotation();
  for (const { spec, frame, node } of body.segments.values()) {
    const chain = specChainTo(body.spec, spec.name);
    if (!chain.length) continue;
    const bends = chain.map(joint => angles[joint.spec.name] ?? joint.dofs.map(() => 0));
    if (!bends.some(joint => joint.some(angle => angle !== 0))) continue;
    pointAtToRef(chain, bends, frame.origin, point);
    const rotation = JointRotation.Identity();
    chain.forEach((joint, index) => rotation.multiplyInPlace(rotationAtToRef(joint, bends[index]!, turn)));
    node.position.set(point.x, point.y, point.z);
    node.rotationQuaternion = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).multiply(node.rotationQuaternion!);
  }
}

/** The game's skins on bodies drawn from their specs (`puppetBody`). Each column has its own camera, so resizing
 * keeps the characters centred. This scene draws on load, selection and resize, with no animation loop.
 * Its lighting (a warm ivory key, a crimson rim), framing and plinth sizes are set by eye.
 * `shapes` is told when a character's skin did not load and it is drawn as its shapes (`dresserFor`). */
export async function showHeroLineup(canvas: HTMLCanvasElement,
  characters: readonly CharacterConfig[], signal: AbortSignal, appearances: readonly Appearance[] = [],
  shapes?: (error: unknown) => void): Promise<{
    setCharacter(index: number, character: CharacterConfig, appearance?: Appearance): Promise<void>;
    setAppearance(index: number, appearance: Appearance): Promise<void>;
  }> {
  signal.throwIfAborted();
  const engine = new Engine(canvas, true, { alpha: true, preserveDrawingBuffer: true });
  engine.setHardwareScalingLevel(canvasScaling());
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 0);
  scene.environmentTexture = new HDRCubeTexture(publicAssetUrl("/assets/env.hdr"), scene, 128);
  scene.environmentIntensity = .65;
  const fill = new HemisphericLight("lineup fill", new Vector3(0, 1, 1), scene);
  fill.intensity = .85;
  fill.groundColor = Color3.FromHexString("#322423");
  const key = new DirectionalLight("lineup key", new Vector3(.5, -1, -1), scene);
  key.diffuse = Color3.FromHexString("#ffe1b7"); key.intensity = 2.2;
  const rim = new DirectionalLight("lineup rim", new Vector3(-.5, -.3, 1), scene);
  rim.diffuse = Color3.FromHexString("#d76b52"); rim.intensity = 1.4;
  const stone = new StandardMaterial("lineup plinth", scene);
  stone.diffuseColor = Color3.FromHexString("#292321"); stone.specularColor = Color3.Black();
  const revisions = characters.map(() => 0);
  const bodies: Puppet[] = [], skins: SkinSlot[] = [], cameras: FreeCamera[] = [];
  const framing: { halfHeight: number; halfWidth: number }[] = [];
  const chosen: BodyModel[] = characters.map(({ model }) => model);
  let ready = false;
  const draw = () => {
    if (!ready || signal.aborted || !canvas.checkVisibility()) return;
    engine.resize();
    const aspect = canvas.clientWidth / characters.length / canvas.clientHeight;
    // A full body with headroom; narrow columns retain space for the arms.
    for (let i = 0; i < cameras.length; i++) {
      const camera = cameras[i]!, margin = framing[i]!;
      const halfHeight = Math.max(margin.halfHeight, margin.halfWidth / aspect);
      camera.orthoTop = halfHeight; camera.orthoBottom = -halfHeight;
      camera.orthoLeft = -halfHeight * aspect; camera.orthoRight = halfHeight * aspect;
    }
    scene.render();
  };
  const resize = new ResizeObserver(draw);
  resize.observe(canvas);
  const dispose = () => {
    resize.disconnect();
    for (const skin of skins) skin?.dispose();
    for (const body of bodies) body?.dispose();
    scene.dispose(); engine.dispose();
  };
  signal.addEventListener("abort", dispose, { once: true });
  const setAppearance = async (index: number, appearance: Appearance) => {
    const revision = ++revisions[index], model = chosen[index];
    await skins[index].replace(dresserFor(model, scene, { appearance: appearanceFor(model, appearance), ...shapes && { shapes } }),
      { clothing: { boots: true, armour: true }, closure: handsOf(bodies[index]!.configurations.state).closure });
    if (!ready || signal.aborted || revision !== revisions[index]) return;
    try { await warmScene(scene, signal); } catch (error) { if (signal.aborted) return; throw error; }
    if (!signal.aborted && revision === revisions[index]) draw();
  };
  const characterKeys: string[] = [];
  const setCharacter = async (index: number, character: CharacterConfig, appearance: Appearance = "default") => {
    if (signal.aborted) return;
    const { model } = character, resolved = resolveCharacter(character), key = JSON.stringify(resolved.config);
    if (!bodies[index] || characterKeys[index] !== key) {
      skins[index]?.dispose(); bodies[index]?.dispose();
      chosen[index] = model; characterKeys[index] = key;
      const body = bodies[index] = puppetBody(resolved.spec, scene);
      const { back, front } = depthOf(body.spec), length = front - back, tall = body.spec.stature.value > length;
      if (tall) relaxPortrait(body);
      for (const segment of body.segments.values()) segment.node.position.x += index * 4;
      const scale = Math.max(resolved.config.attributes.size, resolved.config.attributes.size * Math.sqrt(resolved.config.attributes.weight));
      framing[index] = { halfHeight: (tall ? 1.12 : .4) * scale, halfWidth: tall ? .62 * scale : Math.max(.7 * scale, length / 2) };
      const camera = cameras[index]!, x = index * 4;
      if (tall) {
        camera.position.set(x + .2 * scale, 1.05 * scale, 6 * scale); camera.setTarget(new Vector3(x, .95 * scale, 0));
      } else {
        const centre = (back + front) / 2;
        camera.position.set(x + 2 * scale, .9 * scale, centre + 2 * scale); camera.setTarget(new Vector3(x, body.spec.stature.value / 2, centre));
      }
      camera.maxZ = 15 * Math.max(1, scale);
      const skin = skins[index] = skinSlot(body, () => {
        for (const mesh of skin.meshes) mesh.layerMask = 1 << index;
      });
    }
    await setAppearance(index, appearance);
  };
  try {
    characters.forEach((_, index) => {
      const x = index * 4, mask = 1 << index;
      const plinth = MeshBuilder.CreateCylinder(`plinth ${index}`, { diameter: 1.15, height: .06, tessellation: 64 }, scene);
      plinth.position.set(x, -.04, 0); plinth.material = stone; plinth.layerMask = mask;
      const camera = new FreeCamera(`hero ${index}`, new Vector3(x + .2, 1.05, 6), scene);
      camera.setTarget(new Vector3(x, .95, 0));
      camera.mode = Camera.ORTHOGRAPHIC_CAMERA; camera.minZ = .1; camera.maxZ = 15;
      camera.viewport = new Viewport(index / characters.length, 0, 1 / characters.length, 1);
      camera.layerMask = mask;
      cameras.push(camera);
    });
    scene.activeCameras = cameras;
    await Promise.all(characters.map((character, index) => setCharacter(index, character, appearances[index])));
    signal.throwIfAborted();
    ready = true;
    await warmScene(scene, signal);
    draw();
    return { setCharacter, setAppearance };
  } catch (error) {
    if (!signal.aborted) { signal.removeEventListener("abort", dispose); dispose(); }
    throw error;
  }
}
