import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";

import { canonicalBlueprintJson } from "../src/construct/canonical.ts";
import { ConstructDamageTargets } from "../src/construct/damage-target.ts";
import { CONSTRUCT_MATERIAL_PROFILES, applyConstructSurface, constructMaterials } from
  "../src/construct/materials.ts";
import {
  CONSTRUCT_PROCEDURAL_GLSL,
  CONSTRUCT_PROCEDURAL_SURFACE_VERSION,
  ConstructProceduralSurfacePlugin,
  DEFAULT_CONSTRUCT_SURFACE_MODE,
  PROCEDURAL_DAMAGE_WEAR_V1,
  PROCEDURAL_STONE_V1,
  selectConstructSurfaceMode,
} from "../src/construct/procedural-surface.ts";
import {
  ConstructSurfaceRegistry,
  buildConstructPartVisual,
  constructSurfaceSeed,
} from "../src/construct/render.ts";
import { diagnosticsMarkup } from "../src/forge/diagnostics.ts";

const part = (id, style = "plate", shape = { kind: "box", sizeM: [0.6, 0.8, 0.4] }) => ({
  id, shape, massKg: 10, centreOfMassM: [0, 0, 0], restitution: 0.05,
  shell: { style, visualClearanceM: 0.004 }, health: 8, armour: 1,
  vitalityWeight: style === "core" ? 1 : 0, fatal: style === "core", friction: 0.7,
});

const binding = (kind, id, primitive, seed = constructSurfaceSeed(kind, id, primitive, "plate")) => ({
  targetKind: kind, targetId: id, primitiveId: primitive, seed, shapeKind: "box",
  extentsM: [0.6, 0.8, 0.4], relief: "none", healthRatio: 1,
});

test("procedural_surface_capability_refuses_unsupported_GL_with_a_named_fallback", () => {
  assert.deepEqual(selectConstructSurfaceMode("procedural-pbr", {
    glsl: false, highPrecision: true, derivatives: true,
  }), { requested: "procedural-pbr", effective: "mapped-pbr",
    reason: "procedural-pbr requires the pinned GLSL shader path", shaderVersion: 1 });
  assert.match(selectConstructSurfaceMode("procedural-pbr", {
    glsl: true, highPrecision: false, derivatives: true,
  }).reason, /high-precision/);
  assert.match(selectConstructSurfaceMode("procedural-pbr", {
    glsl: true, highPrecision: true, derivatives: false,
  }).reason, /standard derivatives/);
  assert.equal(selectConstructSurfaceMode("procedural-pbr", {
    glsl: true, highPrecision: true, derivatives: true,
  }).effective, "procedural-pbr");

  const engine = new NullEngine();
  const scene = new Scene(engine);
  const audit = { requested: "procedural-pbr", effective: "procedural-pbr", reason: null, shaderVersion: 1 };
  const material = new PBRMaterial("fallback-material", scene);
  const plugin = new ConstructProceduralSurfacePlugin(material, "stone", audit);
  const fallbacks = [];
  assert.equal(plugin.addFallbacks({ CONSTRUCT_PROCEDURAL: true }, {
    addFallback: (rank, define) => fallbacks.push([rank, define]),
  }, 3), 4);
  assert.deepEqual(fallbacks, [[3, "CONSTRUCT_PROCEDURAL"]]);
  const mesh = MeshBuilder.CreateBox("fallback-bind", { size: 1 }, scene);
  plugin.bindForSubMesh({ updateFloat4() {}, updateFloat3() {} }, scene, engine,
    { effect: { defines: "#define NORMAL" }, getMesh: () => mesh });
  assert.deepEqual(audit, { requested: "procedural-pbr", effective: "mapped-pbr",
    reason: "procedural-pbr shader compilation fell back to mapped-pbr", shaderVersion: 1 });
  mesh.dispose(false, false); material.dispose(false, false); scene.dispose(); engine.dispose();
});

test("procedural_surface_audit_reports_requested_effective_reason_and_version", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const palette = constructMaterials(scene, "left", "procedural-pbr");
  const registry = new ConstructSurfaceRegistry(scene, palette);
  try {
    assert.equal(CONSTRUCT_PROCEDURAL_SURFACE_VERSION, 1);
    assert.equal(palette.surface.requested, "procedural-pbr");
    assert.equal(palette.surface.effective, "mapped-pbr", "NullEngine declares no standard derivatives");
    assert.match(palette.surface.reason, /pinned GLSL|standard derivatives/);
    assert.deepEqual(registry.audit(), {
      meshes: 0, materials: 4, textures: 2, plugins: 4,
      requested: "procedural-pbr", effective: "mapped-pbr",
      fallbackReason: palette.surface.reason, damagedBindings: 0,
    });
  } finally { registry.dispose(); palette.dispose(); scene.dispose(); engine.dispose(); }
});

test("one_shader_fallback_invalidates_every_material_in_the_shared_palette", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const audit = { requested: "procedural-pbr", effective: "procedural-pbr", reason: null,
    shaderVersion: 1 };
  const materials = ["stone", "bronze", "plain", "rune"].map((family) =>
    new PBRMaterial(`coordinated-${family}`, scene));
  const plugins = materials.map((material, index) =>
    new ConstructProceduralSurfacePlugin(material, ["stone", "bronze", "plain", "rune"][index], audit));
  const dirtied = new Set();
  plugins.forEach((plugin, index) => {
    plugin.markAllDefinesAsDirty = () => dirtied.add(index);
  });
  const mesh = MeshBuilder.CreateBox("coordinated-fallback", { size: 1 }, scene);

  plugins[0].bindForSubMesh({ updateFloat4() {}, updateFloat3() {} }, scene, engine,
    { effect: { defines: "#define NORMAL" }, getMesh: () => mesh });

  assert.equal(audit.effective, "mapped-pbr");
  assert.deepEqual([...dirtied].sort(), [0, 1, 2, 3],
    "one failed effect cannot leave already-compiled sibling materials procedural");
  mesh.dispose(false, false);
  for (const material of materials) material.dispose(false, false);
  scene.dispose(); engine.dispose();
});

test("stone_noise_is_object_local_and_does_not_swim_when_a_mesh_moves", () => {
  const vertex = Object.values(CONSTRUCT_PROCEDURAL_GLSL.vertex).join("\n");
  const fragment = Object.values(CONSTRUCT_PROCEDURAL_GLSL.fragment).join("\n");
  assert.match(vertex, /vConstructObjectPosition\s*=\s*positionUpdated/);
  assert.doesNotMatch(fragment, /constructValueNoise\s*\(\s*vPositionW|time|Time|Math\.random/);
  assert.match(fragment, /dFdx\(constructHeight\)/);
  assert.match(fragment, /constructCrackRidge/);
  assert.doesNotMatch(fragment, /discard|gl_Position/);
});

test("procedural_mode_adds_no_material_instance_or_draw_call_per_part", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const palette = constructMaterials(scene, "left", "procedural-pbr");
  const materials = scene.materials.length;
  const meshes = Array.from({ length: 24 }, (_, index) => {
    const mesh = MeshBuilder.CreateBox(`shared-${index}`, { size: 1 }, scene);
    applyConstructSurface(mesh, palette);
    return mesh;
  });
  assert.equal(scene.materials.length, materials);
  assert.equal(new Set(meshes.map((mesh) => mesh.material)).size, 1);
  assert.equal(palette.plugins.length, 4, "one plugin belongs to each shared PBR material, not each part");
  for (const mesh of meshes) mesh.dispose(false, false);
  palette.dispose(); scene.dispose(); engine.dispose();
});

test("bronze_remains_metallic_rough_and_lit_without_an_HDR_environment", () => {
  const profile = CONSTRUCT_MATERIAL_PROFILES["functional-bronze"];
  assert.ok(profile.metallic >= 0.8);
  assert.ok(profile.roughness >= 0.34 && profile.roughness <= 0.58);
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const bronze = constructMaterials(scene, "left").functionalMetal;
  assert.equal(scene.environmentTexture, null);
  assert.equal(bronze.unlit, false);
  assert.equal(bronze.emissiveColor.asArray().every((channel) => channel === 0), true);
  scene.dispose(); engine.dispose();
});

test("rune_inlay_is_non_emissive", () => {
  assert.equal(CONSTRUCT_MATERIAL_PROFILES["rune-inlay"].emissive, false);
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const rune = constructMaterials(scene, "right").rune;
  assert.equal(rune.unlit, false);
  assert.deepEqual(rune.emissiveColor.asArray(), [0, 0, 0]);
  scene.dispose(); engine.dispose();
});

test("mapped_PBR_remains_a_complete_synchronous_fallback", () => {
  assert.equal(DEFAULT_CONSTRUCT_SURFACE_MODE, "mapped-pbr");
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const palette = constructMaterials(scene, "left");
  assert.deepEqual(palette.surface, { requested: "mapped-pbr", effective: "mapped-pbr", reason: null,
    shaderVersion: 1 });
  assert.equal(palette.carvedStone.albedoTexture?.name, "construct.left.stone-grain-albedo");
  assert.equal(palette.carvedStone.bumpTexture?.name, "construct.left.stone-grain-normal");
  assert.equal(palette.carvedStone.getScene(), scene);
  palette.dispose(); scene.dispose(); engine.dispose();
});

test("twenty_rebuilds_dispose_every_palette_plugin_and_texture", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const warm = constructMaterials(scene, "right");
  warm.dispose();
  const baseline = { materials: scene.materials.length, textures: scene.textures.length };
  for (let index = 0; index < 20; index += 1) {
    const palette = constructMaterials(scene, "left", "procedural-pbr");
    assert.equal(palette.plugins.length, 4);
    palette.dispose();
    assert.deepEqual({ materials: scene.materials.length, textures: scene.textures.length }, baseline);
  }
  scene.dispose(); engine.dispose();
});

test("shader_constants_cannot_change_any_saved_or_physics_digest", () => {
  const blueprint = { version: 5, id: "surface-isolation", rootPart: "body",
    parts: [part("body", "core")], joints: [], sockets: [], modules: [] };
  const before = canonicalBlueprintJson(blueprint);
  assert.deepEqual(PROCEDURAL_STONE_V1, {
    lowFrequencyPerM: 1.7, highFrequencyPerM: 11, crackFrequencyPerM: 4.5, crackWidth: 0.055,
    roughnessMin: 0.82, roughnessMax: 0.98, normalStrength: 0.62,
  });
  assert.deepEqual(PROCEDURAL_DAMAGE_WEAR_V1, {
    beginsBelowHealthRatio: 0.75, maximumAtHealthRatio: 0.10, crackDarkeningMax: 0.22,
    freshEdgeLighteningMax: 0.16, normalIncreaseMax: 0.28,
  });
  assert.equal(canonicalBlueprintJson(blueprint), before);
});

test("surface_seed_is_stable_across_build_order_and_absent_from_canonical_blueprints", () => {
  const first = ["left-arm", "right-arm", "body"].map((id) => [id,
    constructSurfaceSeed("part", id, `${id}:shell`, id === "body" ? "core" : "plate")]);
  const second = [...first].reverse().map(([id]) => [id,
    constructSurfaceSeed("part", id, `${id}:shell`, id === "body" ? "core" : "plate")]);
  assert.deepEqual(new Map(first), new Map(second));
  const blueprint = { version: 5, id: "semantic-pattern", rootPart: "body",
    parts: [part("body", "core")], joints: [], sockets: [], modules: [] };
  assert.doesNotMatch(canonicalBlueprintJson(blueprint), /constructSurface|seed|healthRatio/);
});

test("two_semantic_parts_do_not_receive_one_stamped_noise_origin", () => {
  assert.notEqual(constructSurfaceSeed("part", "left-arm", "shell", "plate"),
    constructSurfaceSeed("part", "right-arm", "shell", "plate"));
  assert.notEqual(constructSurfaceSeed("module", "left-blade", "edge", "plate"),
    constructSurfaceSeed("module", "right-blade", "edge", "plate"));
});

test("core_relief_is_limited_to_the_front_of_box_shaped_core_shells", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const palette = constructMaterials(scene, "left");
  const surfaces = new ConstructSurfaceRegistry(scene, palette);
  const owner = new TransformNode("surface-owner", scene);
  const core = buildConstructPartVisual(scene, owner, part("renamed-heart", "core"), palette, surfaces);
  const sphere = buildConstructPartVisual(scene, owner,
    part("round-heart", "core", { kind: "sphere", radiusM: 0.3 }), palette, surfaces);
  const plate = buildConstructPartVisual(scene, owner, part("torso", "plate"), palette, surfaces);
  assert.equal(core.meshes[0].metadata.constructSurfaceBinding.relief, "core-front");
  assert.equal(sphere.meshes[0].metadata.constructSurfaceBinding.relief, "none");
  assert.equal(plate.meshes[0].metadata.constructSurfaceBinding.relief, "none");
  const shader = Object.values(CONSTRUCT_PROCEDURAL_GLSL.fragment).join("\n");
  assert.match(shader, /normalize\(vConstructObjectNormal\)\.z/);
  core.dispose(); sphere.dispose(); plate.dispose(); owner.dispose(false, false);
  surfaces.dispose(); palette.dispose(); scene.dispose(); engine.dispose();
});

test("damage_binding_changes_only_the_exact_part_module_or_joint_damage_target", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const palette = constructMaterials(scene, "left");
  const surfaces = new ConstructSurfaceRegistry(scene, palette);
  const meshes = ["part", "module", "joint", "other"].map((id) => MeshBuilder.CreateBox(id, { size: 1 }, scene));
  const bindings = [binding("part", "arm", "shell"), binding("module", "blade", "edge"),
    binding("joint", "elbow", "bearing"), binding("part", "body", "shell")];
  meshes.forEach((mesh, index) => { surfaces.bind(mesh, bindings[index]); applyConstructSurface(mesh, palette); });
  surfaces.publish({ targetKind: "module", targetId: "blade", remaining: 2, maximum: 8 });
  assert.deepEqual(bindings.map(({ healthRatio }) => healthRatio), [1, 0.25, 1, 1]);
  surfaces.publish({ targetKind: "joint", targetId: "elbow", remaining: -4, maximum: 8 });
  assert.deepEqual(bindings.map(({ healthRatio }) => healthRatio), [1, 0.25, 0, 1]);
  assert.throws(() => surfaces.publish({ targetKind: "part", targetId: "arm", remaining: 1, maximum: 0 }),
    /finite and positive/);
  meshes.forEach((mesh) => mesh.dispose(false, false));
  surfaces.dispose(); palette.dispose(); scene.dispose(); engine.dispose();
});

test("authoritative_damage_description_publishes_only_a_stable_render_key_and_health_tuple", () => {
  const body = {};
  const target = { key: "renamed-arm", maxHealth: 8, health: 8, part: { body } };
  let remaining = 8;
  const state = {
    partHealth: (id) => { assert.equal(id, "renamed-arm"); return remaining; },
    damagePart: (_id, raw) => { remaining = Math.max(0, remaining - raw); return { applied: raw }; },
  };
  const targets = new ConstructDamageTargets({ modules: new Map(), joints: new Map() }, state,
    new Map([[body, target]]));
  assert.equal(targets.applyDamage(target, 3), 3);
  assert.deepEqual(targets.describe(target), {
    targetKind: "part", targetId: "renamed-arm", remaining: 5, maximum: 8,
  });
  assert.deepEqual(Object.keys(targets.describe(target)), ["targetKind", "targetId", "remaining", "maximum"]);
});

test("shared_materials_do_not_share_health_ratio", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const palette = constructMaterials(scene, "left");
  const surfaces = new ConstructSurfaceRegistry(scene, palette);
  const first = MeshBuilder.CreateBox("first", { size: 1 }, scene);
  const second = MeshBuilder.CreateBox("second", { size: 1 }, scene);
  const firstBinding = binding("part", "first", "shell");
  const secondBinding = binding("part", "second", "shell");
  surfaces.bind(first, firstBinding); surfaces.bind(second, secondBinding);
  applyConstructSurface(first, palette); applyConstructSurface(second, palette);
  surfaces.publish({ targetKind: "part", targetId: "first", remaining: 1, maximum: 8 });
  assert.strictEqual(first.material, second.material);
  assert.equal(firstBinding.healthRatio, 0.125);
  assert.equal(secondBinding.healthRatio, 1);
  const writes = [];
  palette.plugins[0].bindForSubMesh({
    updateFloat4: (...values) => writes.push(values), updateFloat3() {},
  }, scene, engine, { getMesh: () => first });
  palette.plugins[0].bindForSubMesh({
    updateFloat4: (...values) => writes.push(values), updateFloat3() {},
  }, scene, engine, { getMesh: () => second });
  assert.equal(writes[0][3], 0.125);
  assert.equal(writes[1][3], 1);
  first.dispose(false, false); second.dispose(false, false);
  surfaces.dispose(); palette.dispose(); scene.dispose(); engine.dispose();
});

test("detached_parts_keep_their_last_visual_damage_without_remaining_authoritative", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const palette = constructMaterials(scene, "left");
  const surfaces = new ConstructSurfaceRegistry(scene, palette);
  const debris = MeshBuilder.CreateBox("detached", { size: 1 }, scene);
  const debrisBinding = binding("part", "severed-arm", "shell");
  surfaces.bind(debris, debrisBinding); applyConstructSurface(debris, palette);
  surfaces.publish({ targetKind: "part", targetId: "severed-arm", remaining: 2, maximum: 8 });
  debris.metadata.authoritativeDetached = true;
  assert.equal(debrisBinding.healthRatio, 0.25);
  assert.equal(surfaces.audit().damagedBindings, 1);
  debris.dispose(false, false); surfaces.dispose(); palette.dispose(); scene.dispose(); engine.dispose();
});

test("procedural_surface_metadata_never_enters_saved_Construct_or_policy_facts", async () => {
  const [canonical, observation, control] = await Promise.all([
    readFile(new URL("../src/construct/canonical.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/construct/learning/observation.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/construct/control.ts", import.meta.url), "utf8"),
  ]);
  for (const source of [canonical, observation, control]) {
    assert.doesNotMatch(source, /constructSurfaceBinding|PROCEDURAL_STONE|PROCEDURAL_DAMAGE_WEAR/);
  }
});

test("picking_outlines_shadows_pause_camera_and_rig_overlay_survive_surface_binding", async () => {
  const render = await readFile(new URL("../src/construct/render.ts", import.meta.url), "utf8");
  assert.match(render, /body\.isPickable = true/);
  assert.match(render, /construct\.debug\.material/);
  assert.doesNotMatch(render.slice(render.indexOf("buildConstructDebugOverlay")), /ConstructProceduralSurfacePlugin/);
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const palette = constructMaterials(scene, "left");
  const surfaces = new ConstructSurfaceRegistry(scene, palette);
  const owner = new TransformNode("owner", scene);
  const visual = buildConstructPartVisual(scene, owner, part("body", "core"), palette, surfaces);
  assert.equal(visual.meshes[0].isPickable, true);
  assert.equal(visual.meshes[0].metadata.constructMaterialRecipe, "carved-stone");
  visual.dispose(); owner.dispose(false, false); surfaces.dispose(); palette.dispose(); scene.dispose(); engine.dispose();
});

test("twenty_rebuilds_show_zero_mesh_material_texture_plugin_or_binding_growth", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const palette = constructMaterials(scene, "left");
  const baseline = { meshes: scene.meshes.length, materials: scene.materials.length,
    textures: scene.textures.length, plugins: palette.plugins.length };
  for (let index = 0; index < 20; index += 1) {
    const owner = new TransformNode(`owner-${index}`, scene);
    const surfaces = new ConstructSurfaceRegistry(scene, palette);
    const visual = buildConstructPartVisual(scene, owner, part(`part-${index}`, "core"), palette, surfaces);
    surfaces.publish({ targetKind: "part", targetId: `part-${index}`, remaining: 1, maximum: 8 });
    assert.equal(surfaces.audit().damagedBindings, 1);
    visual.dispose(); owner.dispose(false, false); surfaces.dispose();
    assert.deepEqual({ meshes: scene.meshes.length, materials: scene.materials.length,
      textures: scene.textures.length, plugins: palette.plugins.length }, baseline);
  }
  palette.dispose(); scene.dispose(); engine.dispose();
});

test("surface_render_audit_is_visible_in_the_in_game_diagnostics_markup", () => {
  const markup = diagnosticsMarkup({ at: 1, paused: true, rules: [], scheduler: [], active: [],
    capabilities: [], surface: { meshes: 31, materials: 4, textures: 2, plugins: 4,
      requested: "procedural-pbr", effective: "mapped-pbr", fallbackReason: "test fallback",
      damagedBindings: 3 } });
  assert.match(markup, /Construct surface/);
  assert.match(markup, /31 meshes; 4 shared materials; 2 textures; 4 plugins; 3 damaged bindings/);
  assert.match(markup, /requested procedural-pbr/);
  assert.match(markup, /test fallback/);
});
