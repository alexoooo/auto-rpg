import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import HavokPhysics from "@babylonjs/havok";

import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";

import { CONFIG } from "../src/config.ts";
import { attachPhysics, COLLIDES, LAYER } from "../src/physics.ts";
import { FIGURE_SIDE_COLOURS } from "../src/figure.ts";
import { ROOM_METRES, TEXTURED_SURFACES } from "../src/materials.ts";
import {
  ROOM,
  ROOM_GROUPS,
  buildArenaColliders,
  buildArenaWorld,
  buildCosmeticRoom,
  refreshShadowCasters,
  validateRoomPlacements,
  validateVisualColliderPairs,
} from "../src/arena-room.ts";

const havokWasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);

const makeMaterial = (scene, name, colour) => {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor.set(...colour);
  material.diffuseTexture = RawTexture.CreateRGBATexture(
    new Uint8Array([colour[0] * 255, colour[1] * 255, colour[2] * 255, 255]), 1, 1, scene,
  );
  return material;
};

const makeMaterials = (scene) => {
  const ground = makeMaterial(scene, "proof.ground", [0.15, 0.14, 0.12]);
  const wall = makeMaterial(scene, "proof.wall", [0.20, 0.19, 0.17]);
  const timber = makeMaterial(scene, "proof.timber", [0.20, 0.12, 0.065]);
  const banner = makeMaterial(scene, "proof.banner", [0.25, 0.19, 0.16]);
  wall.alpha = TEXTURED_SURFACES.roomWall.opacity;
  return {
    ground, wall, timber, banner,
    steel: timber, edge: timber, brass: timber, leather: timber, wood: timber,
    paintedWood: timber, bowString: timber, arrowAccent: banner,
  };
};

const setup = async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(havokWasm) }));
  return { engine, scene, materials: makeMaterials(scene) };
};

const bodies = (scene) => scene.getPhysicsEngine().getBodies().length;
const rounded = (values) => values.map((value) => Math.round(value * 1e6) / 1e6);

test("cosmetic_room_dressing_creates_no_physics_body", async (t) => {
  const { engine, scene, materials } = await setup();
  t.after(() => engine.dispose());
  const colliders = buildArenaColliders(scene, materials);
  assert.equal(bodies(scene), 15, "the old ground plus fourteen post bodies remain the whole world");
  const ground = scene.getMeshByName("ground");
  assert.deepEqual(rounded(ground.getBoundingInfo().boundingBox.minimum.asArray()), [-30, -0.5, -30]);
  assert.deepEqual(rounded(ground.getBoundingInfo().boundingBox.maximum.asArray()), [30, 0.5, 30]);
  assert.deepEqual(rounded(ground.position.asArray()), [0, -0.5, 0]);
  for (let index = 0; index < 14; index += 1) {
    const post = scene.getMeshByName(`post${index}`);
    const shape = post.physicsBody.shape;
    const angle = index / 14 * Math.PI * 2;
    assert.deepEqual(rounded(post.position.asArray()), rounded([
      Math.sin(angle) * 9.5, 0.75, Math.cos(angle) * 9.5,
    ]));
    assert.deepEqual(rounded(post.getBoundingInfo().boundingBox.minimum.asArray()), [-0.085, -0.75, -0.085]);
    assert.deepEqual(rounded(post.getBoundingInfo().boundingBox.maximum.asArray()), [0.085, 0.75, 0.085]);
    assert.equal(post.physicsBody.getMassProperties().mass, 0);
    assert.equal(shape.filterMembershipMask, LAYER.WORLD);
    assert.equal(shape.filterCollideMask, COLLIDES.WORLD);
  }
  const before = bodies(scene);
  const room = buildCosmeticRoom(scene, materials);
  assert.equal(bodies(scene), before, "floor, walls, beams, banners, racks and debris add no body");
  room.dispose();
  assert.equal(bodies(scene), before, "cosmetic disposal cannot disturb authoritative bodies");
  colliders.dispose();
});

test("every_reachable_solid_visual_names_an_existing_collider", async (t) => {
  assert.deepEqual(validateRoomPlacements(ROOM_GROUPS), []);
  const moved = structuredClone(ROOM_GROUPS);
  const rack = moved.find((group) => group.role === "rack").placements[0];
  rack.position = [0, rack.position[1], 0];
  rack.solid = true;
  assert.match(validateRoomPlacements(moved).join("\n"), /room\.rack\.ne is an opaque solid below reach clearance/);
  const lowered = structuredClone(ROOM_GROUPS);
  const beam = lowered.find((group) => group.role === "beam").placements[0];
  beam.position = [beam.position[0], 2, beam.position[2]];
  assert.match(validateRoomPlacements(lowered).join("\n"), /room\.beam\.n1 is an opaque solid below reach clearance/);

  const { engine, scene, materials } = await setup();
  t.after(() => engine.dispose());
  const world = buildArenaWorld(scene, materials);
  assert.deepEqual(validateVisualColliderPairs(scene, world.audit().visualColliderPairs), []);
  assert.match(validateVisualColliderPairs(scene, [{ visual: "room.floor", collider: "missing" }]).join("\n"), /missing collider/);
  assert.match(
    validateVisualColliderPairs(scene, [{ visual: "room.floor", collider: "room.wall.north" }]).join("\n"),
    /has no physics body/,
  );
  assert.match(
    validateVisualColliderPairs(scene, [{ visual: "room.wall.north", collider: "post0" }]).join("\n"),
    /does not geometrically overlap/,
  );
  const dishonestPair = structuredClone(ROOM_GROUPS);
  const pairedRack = dishonestPair.find((group) => group.role === "rack").placements[0];
  pairedRack.position = [0, pairedRack.position[1], 0];
  pairedRack.solid = true;
  pairedRack.collider = "post0";
  assert.throws(
    () => buildArenaWorld(scene, materials, undefined, dishonestPair),
    /room\.rack\.ne does not geometrically overlap collider post0/,
    "a collider declaration is emitted automatically and validated on the ordinary build path",
  );
  for (const mesh of world.room.meshes) {
    const placement = mesh.metadata.roomPlacement;
    if (!placement.solid) continue;
    const half = placement.halfExtent ?? [ROOM.floorSize / 2, 0, ROOM.floorSize / 2];
    const aboveReach = mesh.position.y - half[1] >= ROOM.maxReachHeight;
    assert.ok(placement.collider || aboveReach, `${mesh.name}: admitted by authority or overhead clearance`);
  }

  for (const role of ["rack", "debris"]) {
    const group = ROOM_GROUPS.find((candidate) => candidate.role === role);
    assert.ok(group.placements.every((placement) => !placement.solid && placement.halfExtent[1] === 0));
    for (const placement of group.placements) {
      const bounds = scene.getMeshByName(placement.name).getBoundingInfo().boundingBox;
      assert.ok(bounds.extendSize.y < 1e-6, `${placement.name} is a flat marking, not a pass-through block`);
    }
  }
  world.dispose();
});

const edgeDensities = (mesh) => {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
  const indices = mesh.getIndices();
  const densities = [];
  for (let offset = 0; offset < indices.length; offset += 3) {
    for (const [a, b] of [[indices[offset], indices[offset + 1]], [indices[offset + 1], indices[offset + 2]]]) {
      const pa = a * 3; const pb = b * 3; const ua = a * 2; const ub = b * 2;
      const metres = Math.hypot(
        positions[pa] - positions[pb], positions[pa + 1] - positions[pb + 1], positions[pa + 2] - positions[pb + 2],
      );
      const uv = Math.hypot(uvs[ua] - uvs[ub], uvs[ua + 1] - uvs[ub + 1]);
      if (metres > 1e-5 && uv > 1e-5) densities.push(uv / metres);
    }
  }
  return densities;
};

const segmentIntersectsPlacement = (from, to, placement) => {
  let first = 0;
  let last = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const low = placement.position[axis] - placement.halfExtent[axis];
    const high = placement.position[axis] + placement.halfExtent[axis];
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < 1e-9) {
      if (from[axis] < low || from[axis] > high) return false;
      continue;
    }
    const a = (low - from[axis]) / delta;
    const b = (high - from[axis]) / delta;
    first = Math.max(first, Math.min(a, b));
    last = Math.min(last, Math.max(a, b));
    if (first > last) return false;
  }
  return true;
};

test("room_instances_share_materials_and_textures", async (t) => {
  const { engine, scene, materials } = await setup();
  t.after(() => engine.dispose());
  const world = buildArenaWorld(scene, materials);
  const audit = world.audit();
  assert.equal(Object.isFrozen(audit), true, "the stable audit view is caller-read-only");
  assert.throws(() => { audit.meshes = 0; }, TypeError);
  assert.equal(audit.instances, 27, "five sources feed every repeated cosmetic prop");
  assert.equal(audit.materials, 4, "the owned census sees floor, wall, timber and banner only");
  assert.equal(audit.textures, 4, "the owned census follows the four reachable material maps");
  assert.equal(new Set(world.room.meshes.map((mesh) => mesh.material)).size, 4, "floor/wall/timber/banner only");
  assert.equal(scene.textures.length, 4, "instances mint no texture wrappers");
  for (const group of ROOM_GROUPS) {
    const meshes = group.placements.map((placement) => scene.getMeshByName(placement.name));
    assert.equal(meshes.filter((mesh) => mesh.getClassName() === "InstancedMesh").length, meshes.length - 1, group.role);
    assert.equal(new Set(meshes.map((mesh) => mesh.material)).size, 1, `${group.role}: one shared material`);
    const source = meshes[0];
    const expected = 1 / group.metresPerRepeat;
    for (const density of edgeDensities(source)) {
      assert.ok(Math.abs(density - expected) < 1e-5, `${group.role}: UVs are measured in physical metres`);
    }
  }
  assert.equal(ROOM.floorMetresPerRepeat, ROOM_METRES.floor);
  assert.equal(ROOM.wallMetresPerRepeat, ROOM_METRES.wall);
  assert.equal(ROOM.timberMetresPerRepeat, ROOM_METRES.timber);
  assert.equal(ROOM.bannerMetresPerRepeat, ROOM_METRES.banner);
  const floor = scene.getMeshByName("room.floor");
  for (const density of edgeDensities(floor)) {
    assert.ok(Math.abs(density - 1 / ROOM.floorMetresPerRepeat) < 1e-5, "floor metre scale");
  }

  const saturation = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b);
  const roomSaturation = [TEXTURED_SURFACES.roomWall, TEXTURED_SURFACES.roomTimber, TEXTURED_SURFACES.roomBanner]
    .map((surface) => saturation(surface.albedo));
  const fighterSaturation = Object.values(FIGURE_SIDE_COLOURS).map(saturation);
  assert.ok(Math.max(...roomSaturation) < Math.min(...fighterSaturation), "room fallback colour stays below team contrast");
  const luminance = ([r, g, b]) => r * 0.2126 + g * 0.7152 + b * 0.0722;
  const arrow = CONFIG.arrow.visual.emissive;
  assert.ok(luminance([arrow.r, arrow.g, arrow.b]) > Math.max(
    ...[TEXTURED_SURFACES.ground, TEXTURED_SURFACES.roomWall, TEXTURED_SURFACES.roomTimber, TEXTURED_SURFACES.roomBanner]
      .map((surface) => luminance(surface.albedo)),
  ), "unlit arrow accent remains the brightest declared moving mark");

  const walls = ROOM_GROUPS.find((group) => group.role === "wall").placements;
  assert.ok(walls.every((placement) => !placement.solid), "translucent scrims never advertise collision");
  assert.ok(materials.wall.alpha <= 0.25, "the wall fallback remains visibly translucent");
  const opaque = ROOM_GROUPS.flatMap((group) => group.placements).filter((placement) => placement.solid);
  let visibleBeamReadings = 0;
  const crossing = { point: new Vector3(-5, 1, 15), active: () => true };
  world.updateOcclusion(new Vector3(-5, 8, 10), [{ ...crossing, active: () => false }]);
  assert.equal(scene.getMeshByName("room.beam.n1").isVisible, true, "a parked pooled-arrow point protects no ray");
  world.updateOcclusion(new Vector3(-5, 8, 10), [crossing]);
  assert.equal(
    scene.getMeshByName("room.beam.n1").isVisible, false,
    "an overhead beam crossing a protected fighter/arrow ray is actually culled",
  );
  let culledBeamReadings = 1;
  for (const mode of ["overhead", "fixed"]) {
    const preset = CONFIG.camera[mode];
    const bearings = mode === "fixed"
      ? Array.from({ length: 8 }, (_, index) => CONFIG.camera.fixedBearing + index * CONFIG.camera.bearingStep)
      : Array.from({ length: 8 }, (_, index) => index * Math.PI / 4);
    for (const zoom of [CONFIG.camera.zoomMin, CONFIG.camera.zoomMax]) {
      for (const focusX of [-25, -15, 0, 15, 25]) {
        for (const focusZ of [-25, -15, 0, 15, 25]) {
          for (const bearing of bearings) {
            const camera = [
              focusX - Math.sin(bearing) * preset.distance * zoom,
              preset.height * zoom,
              focusZ - Math.cos(bearing) * preset.distance * zoom,
            ];
            // These stand for actual live body centres and projectile points,
            // including an opponent and arrow well outside the old +/-2 m stencil.
            const targets = [
              { point: new Vector3(focusX, 0.0, focusZ) },
              { point: new Vector3(focusX, 0.9, focusZ) },
              { point: new Vector3(focusX, 1.8, focusZ) },
              { point: new Vector3(focusX, 1.2, focusZ + 6) },
              { point: new Vector3(focusX - 4, 2.9, focusZ + 9), active: () => true },
            ];
            world.updateOcclusion(new Vector3(...camera), targets);
            for (const placement of opaque) {
              const mesh = scene.getMeshByName(placement.name);
              const intersects = targets.some((target) => segmentIntersectsPlacement(
                camera, target.point.asArray(), placement,
              ));
              if (!mesh.isVisible) culledBeamReadings += 1;
              else {
                visibleBeamReadings += 1;
                assert.equal(intersects, false, `${mode}/${zoom}/${focusX},${focusZ}/${bearing}: visible beam clears combat rays`);
              }
            }
          }
        }
      }
    }
  }
  assert.ok(visibleBeamReadings > 0, "opaque overhead dressing remains visible away from a sight line");
  assert.ok(culledBeamReadings > 0, "the translated sweep exercises runtime culling rather than passing vacuously");

  const report = world.audit();
  const foreignMaterial = makeMaterial(scene, "foreign.material", [0.1, 0.1, 0.1]);
  const foreign = MeshBuilder.CreateBox("foreign.mesh", { size: 1 }, scene);
  foreign.material = foreignMaterial;
  assert.strictEqual(world.audit(), report, "audit returns one stable report object");
  assert.deepEqual(
    { meshes: report.meshes, materials: report.materials, textures: report.textures },
    { meshes: 48, materials: 4, textures: 4 },
    "unowned scene resources do not leak into the arena census",
  );
  foreign.dispose(false, false);
  foreignMaterial.dispose(true, true);
  world.dispose();
});

test("an_arena_rebuild_returns_every_audit_count_to_its_baseline", async (t) => {
  const { engine, scene, materials } = await setup();
  t.after(() => engine.dispose());
  const light = new DirectionalLight("proof.sun", new Vector3(-1, -2, 1), scene);
  const shadowGenerator = new ShadowGenerator(256, light);
  let shadowAdds = 0;
  let shadowRemoves = 0;
  const shadowRegistry = {
    add: (mesh) => { shadowAdds += 1; shadowGenerator.addShadowCaster(mesh); },
    remove: (mesh) => { shadowRemoves += 1; shadowGenerator.removeShadowCaster(mesh); },
  };
  const shadowBaseline = shadowGenerator.getShadowMap().renderList.length;
  const baseline = {
    meshes: scene.meshes.length, bodies: bodies(scene), materials: scene.materials.length, textures: scene.textures.length,
  };
  for (let cycle = 0; cycle < 10; cycle += 1) {
    const world = buildArenaWorld(scene, materials, shadowRegistry);
    const audit = world.audit();
    assert.deepEqual({
      meshes: audit.meshes, bodies: audit.bodies, instances: audit.instances,
      materials: audit.materials, textures: audit.textures,
    }, {
      meshes: 48, bodies: 15, instances: 27, materials: 4, textures: 4,
    });
    assert.equal(audit.visualColliderPairs.length, 15, "floor and every visible post name authority");
    assert.equal(
      shadowGenerator.getShadowMap().renderList.length, shadowBaseline + 22,
      "opaque room pieces and posts cast; translucent scrims cannot advertise collision through shadows",
    );
    assert.equal(shadowAdds, (cycle + 1) * 22, "each owned caster is registered exactly once");
    const beam = scene.getMeshByName("room.beam.n1");
    world.updateOcclusion(new Vector3(-5, 8, 10), [{ point: new Vector3(-5, 1, 15) }]);
    assert.equal(beam.isVisible, false, "the proof beam begins culled");
    refreshShadowCasters(scene, shadowGenerator);
    assert.equal(
      shadowGenerator.getShadowMap().renderList.length, shadowBaseline + 22,
      "the runtime shadow refresh keeps translucent scrims out too",
    );
    assert.ok(shadowGenerator.getShadowMap().renderList.includes(beam), "refresh retains a temporarily culled solid beam");
    world.updateOcclusion(new Vector3(-5, 8, 10), [{ point: Vector3.Zero() }]);
    assert.equal(beam.isVisible, true, "the beam is revealed after its ray clears");
    assert.ok(shadowGenerator.getShadowMap().renderList.includes(beam), "reveal does not leave the beam shadowless");
    const beforeAudit = [scene.meshes.length, scene.materials.length, scene.textures.length, bodies(scene)];
    for (let reading = 0; reading < 20; reading += 1) assert.strictEqual(world.audit(), audit);
    assert.deepEqual(
      [scene.meshes.length, scene.materials.length, scene.textures.length, bodies(scene)], beforeAudit,
      "the console audit creates no scene resource",
    );
    world.dispose();
    assert.equal(shadowRemoves, (cycle + 1) * 22, "each owned caster is explicitly unregistered exactly once");
    assert.equal(shadowGenerator.getShadowMap().renderList.length, shadowBaseline, "disposed room leaves no shadow caster");
    assert.deepEqual({
      meshes: scene.meshes.length, bodies: bodies(scene), materials: scene.materials.length, textures: scene.textures.length,
    }, baseline, `cycle ${cycle + 1}`);
  }
  shadowGenerator.dispose();
  light.dispose();
});
