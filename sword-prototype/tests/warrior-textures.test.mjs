import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkWarrior, checkWarriorBuilder } from "../scripts/check-warrior.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const warrior = await readFile(process.env.SWORD_WARRIOR_UNDER_TEST ?? resolve(ROOT, "public/assets/warrior.glb"));
const dimensions = JSON.parse(await readFile(resolve(ROOT, "asset-src/dimensions.json"), "utf8"));
const provenance = JSON.parse(await readFile(resolve(ROOT, "asset-src/armour-sources.json"), "utf8"));

test("every_imported_character_source_has_a_pinned_cc0_license_record", async () => {
  assert.ok(Array.isArray(provenance.selected));
  assert.deepEqual(provenance.selected, [
    "quaternius-modular-character-outfits-fantasy-standard-2026",
    "blender-human-base-meshes-1.4.1",
    "poly-haven-rubber-boots-1k-2026",
  ]);
  for (const id of provenance.selected) {
    const selected = provenance.sources.find((source) => source.id === id);
    assert.ok(selected, `selected character source ${id} has a row`);
    assert.equal(selected.license, "CC0-1.0");
    assert.match(selected.officialPage, /^https:\/\/(?:www\.blender\.org|quaternius\.com|polyhaven\.com)\//);
    assert.match(selected.licenseUrl, /creativecommons\.org\/publicdomain\/zero\/1\.0/);
    assert.match(selected.archiveSha256, /^[0-9a-f]{64}$/);
    assert.ok(selected.selectedObjects.length >= 1);
    assert.ok(Object.keys(selected.extracts).length >= 1);
    assert.ok(Object.values(selected.extracts).every((value) => /^[0-9a-f]{64}$/.test(value)));
    assert.ok(selected.adaptations.some((entry) => /render-only/.test(entry)));
    for (const [filename, expected] of Object.entries(selected.extracts)) {
      const bytes = await readFile(resolve(ROOT, selected.extractRoot, filename));
      const actual = createHash("sha256").update(bytes).digest("hex");
      assert.equal(actual, expected, `${filename} matches its selected-extract pin`);
    }
    if (selected.licenseEvidence === "bundled-notice") {
      const notice = await readFile(resolve(ROOT, selected.extractRoot, "LICENSE.txt"), "utf8");
      assert.match(notice, /CC0 1\.0 Universal/);
      assert.match(notice, /creativecommons\.org\/publicdomain\/zero\/1\.0/);
    } else {
      assert.equal(selected.licenseEvidence, "official-page");
      assert.ok("SOURCE.txt" in selected.extracts);
    }
  }
});

const objComponentCount = (source) => {
  const vertices = [];
  const faces = [];
  for (const raw of source.split(/\r?\n/)) {
    const fields = raw.trim().split(/\s+/);
    if (fields[0] === "v") vertices.push(vertices.length);
    if (fields[0] === "f") faces.push(fields.slice(1).map((field) => Number(field.split("/")[0]) - 1));
  }
  const neighbours = vertices.map(() => new Set());
  for (const face of faces) {
    for (let index = 1; index < face.length; index += 1) {
      neighbours[face[0]].add(face[index]);
      neighbours[face[index]].add(face[0]);
    }
  }
  const seen = new Set();
  let components = 0;
  for (const vertex of vertices) {
    if (seen.has(vertex) || neighbours[vertex].size === 0) continue;
    components += 1;
    const pending = [vertex];
    seen.add(vertex);
    while (pending.length > 0) {
      for (const next of neighbours[pending.pop()]) {
        if (seen.has(next)) continue;
        seen.add(next);
        pending.push(next);
      }
    }
  }
  return components;
};

test("the_human_torso_is_one_connected_body_without_landmark_poison", async () => {
  const human = provenance.sources.find((source) => source.id === "blender-human-base-meshes-1.4.1");
  const torso = await readFile(resolve(ROOT, human.extractRoot, "human-torso.obj"), "utf8");
  assert.equal(objComponentCount(torso), 1,
    "the torso extract cannot carry stray face islands that poison its fitting landmarks");
});

test("the_human_source_covers_every_articulated_limb", () => {
  const human = provenance.sources.find((source) => source.id === "blender-human-base-meshes-1.4.1");
  const required = [
    "human-forearm-l.obj", "human-forearm-r.obj",
    "human-upper-arm-l.obj", "human-upper-arm-r.obj",
    "human-thigh-l.obj", "human-thigh-r.obj",
    "human-shin-l.obj", "human-shin-r.obj",
  ];
  for (const filename of required) {
    assert.ok(filename in human.extracts, `${filename} is part of the selected continuous anatomy`);
  }
});

test("the_shipping_warrior_is_built_only_from_pinned_source_meshes", async () => {
  const source = await readFile(resolve(ROOT, "asset-src/build_warrior.py"), "utf8");
  assert.deepEqual(checkWarriorBuilder(source, provenance), []);

  const buildAt = source.indexOf("\ndef build(dimensions):");
  const importedAt = source.indexOf("imported_obj(", buildAt);
  const mutated = source.slice(0, importedAt) + "box(" + source.slice(importedAt + "imported_obj(".length);
  assert.ok(checkWarriorBuilder(mutated, provenance).some((failure) => failure.includes("generated box geometry")));

  const donorHand = source.replace('source_material == "MI_Ranger"', 'source_material != "MI_Ranger"');
  assert.ok(checkWarriorBuilder(donorHand, provenance).some((failure) => failure.includes("exclude donor-body material")));

  const unregistered = source.replace('"ranger-body.obj"', '"unregistered.obj"');
  assert.ok(checkWarriorBuilder(unregistered, provenance).some((failure) => failure.includes("not a selected pinned OBJ")));
});

test("the_warrior_has_no_dead_geometry_payload", () => {
  const failures = checkWarrior(warrior, dimensions).failures.filter((failure) => /dead|binary payload/.test(failure));
  assert.deepEqual(failures, []);
});

function mutateJson(buffer, mutate) {
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength));
  const binHeader = 20 + jsonLength;
  const binLength = buffer.readUInt32LE(binHeader);
  const bin = Buffer.from(buffer.subarray(binHeader + 8, binHeader + 8 + binLength));
  mutate(json, bin);
  const raw = Buffer.from(JSON.stringify(json));
  const padded = Buffer.concat([raw, Buffer.alloc((4 - raw.length % 4) % 4, 0x20)]);
  const out = Buffer.alloc(20 + padded.length + 8 + bin.length);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(padded.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(out, 20);
  const next = 20 + padded.length;
  out.writeUInt32LE(bin.length, next);
  out.writeUInt32LE(0x004e4942, next + 4);
  bin.copy(out, next + 8);
  return out;
}

test("unreachable_meshes_and_duplicate_piece_names_are_refused", () => {
  const unreferenced = mutateJson(warrior, (json) => {
    json.meshes.push(structuredClone(json.meshes[0]));
  });
  assert.ok(checkWarrior(unreferenced, dimensions).failures.some((failure) =>
    failure.includes("mesh") && failure.includes("dead payload")));

  const duplicate = mutateJson(warrior, (json) => {
    const source = json.nodes.find((node) => node.name === "surcoat");
    json.nodes.push(structuredClone(source));
    json.scenes[json.scene ?? 0].nodes.push(json.nodes.length - 1);
  });
  assert.ok(checkWarrior(duplicate, dimensions).failures.some((failure) =>
    failure.includes('piece name "surcoat" occurs 2 times')));
});

test("every_selected_source_adaptation_is_present_in_the_shipping_glb", () => {
  assert.deepEqual(checkWarrior(warrior, dimensions).failures.filter((failure) =>
    failure.includes("pinned source adaptation")), []);

  const stripped = mutateJson(warrior, (json) => {
    const node = json.nodes.find((candidate) => candidate.name === "surcoat");
    json.accessors[json.meshes[node.mesh].primitives[0].indices].count = 3;
  });
  assert.ok(checkWarrior(stripped, dimensions).failures.some((failure) =>
    failure.includes('"surcoat"') && failure.includes("pinned source adaptation")));
});

test("the_authored_hands_meet_their_bracers_without_a_block_or_gap", () => {
  assert.deepEqual(checkWarrior(warrior, dimensions).failures.filter((failure) => /wrist seam/.test(failure)), []);

  const separated = mutateJson(warrior, (json) => {
    const hand = json.nodes.find((node) => node.name === "handR");
    const position = json.accessors[json.meshes[hand.mesh].primitives[0].attributes.POSITION];
    position.min[1] -= 0.1;
    position.max[1] -= 0.1;
  });
  const failures = checkWarrior(separated, dimensions).failures;
  assert.ok(failures.some((failure) => failure.includes('"handR" wrist seam opens')), failures.join("\n"));
});

test("the_anatomical_underlayer_overlaps_every_joint_in_the_bind_pose", () => {
  assert.deepEqual(checkWarrior(warrior, dimensions).failures.filter((failure) =>
    /anatomy does not cross|do not overlap enough/.test(failure)), []);

  const separated = mutateJson(warrior, (json) => {
    const arm = json.nodes.find((node) => node.name === "upperArmSkinR");
    const position = json.accessors[json.meshes[arm.mesh].primitives[0].attributes.POSITION];
    position.min[1] = -0.005;
  });
  assert.ok(checkWarrior(separated, dimensions).failures.some((failure) =>
    failure.includes('"upperArmSkinR"') && failure.includes("does not cross the joint")));

  const uncovered = mutateJson(warrior, (json) => {
    const cover = json.nodes.find((node) => node.name === "elbowCoverR");
    const position = json.accessors[json.meshes[cover.mesh].primitives[0].attributes.POSITION];
    position.max[2] = -0.100;
  });
  assert.ok(checkWarrior(uncovered, dimensions).failures.some((failure) =>
    failure.includes('"elbowCoverR"') && failure.includes("does not surround the elbow pivot")));
});

test("the_human_underlayer_is_dressed_instead_of_erupting_through_the_outfit", () => {
  assert.deepEqual(checkWarrior(warrior, dimensions).failures.filter((failure) =>
    /expected fitted|must not rotate behind/.test(failure)), []);

  const fleshSleeve = structuredClone(dimensions);
  fleshSleeve.pieces.find((piece) => piece.name === "upperArmSkinR").material = "flesh";
  assert.ok(checkWarrior(warrior, fleshSleeve).failures.some((failure) =>
    failure.includes('"upperArmSkinR"') && failure.includes("expected fitted cloth underlayer")));

  const fixedCuff = structuredClone(dimensions);
  fixedCuff.pieces.find((piece) => piece.name === "elbowCoverR").bone = "swordUpperArm";
  assert.ok(checkWarrior(warrior, fixedCuff).failures.some((failure) =>
    failure.includes('"elbowCoverR"') && failure.includes("must follow swordForearm")));

  const loosePlate = structuredClone(dimensions);
  loosePlate.pieces.find((piece) => piece.name === "pauldronR").bone = "swordUpperArm";
  assert.ok(checkWarrior(warrior, loosePlate).failures.some((failure) =>
    failure.includes('"pauldronR"') && failure.includes("must not rotate behind")));
});

const accessorOffset = (json, accessorIndex, element = 0) => {
  const accessor = json.accessors[accessorIndex];
  const view = json.bufferViews[accessor.bufferView];
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
  return (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + element * (view.byteStride ?? components * bytes);
};

function readIndex(json, bin, accessorIndex, element) {
  const accessor = json.accessors[accessorIndex];
  const at = accessorOffset(json, accessorIndex, element);
  return accessor.componentType === 5121 ? bin.readUInt8(at)
    : accessor.componentType === 5123 ? bin.readUInt16LE(at)
      : bin.readUInt32LE(at);
}

test("every_textured_warrior_primitive_has_non_degenerate_uvs", () => {
  assert.equal(checkWarrior(warrior, dimensions).failures.filter((f) => /UV|TEXCOORD/.test(f)).length, 0);

  let victim = "";
  const broken = mutateJson(warrior, (json) => {
    const node = json.nodes.find((candidate) => candidate.mesh !== undefined);
    victim = node.name;
    delete json.meshes[node.mesh].primitives[0].attributes.TEXCOORD_0;
  });
  const failures = checkWarrior(broken, dimensions).failures;
  assert.ok(failures.some((failure) => failure.includes(victim) && failure.includes("TEXCOORD_0")), failures.join("\n"));

  const wrongShape = mutateJson(warrior, (json) => {
    const primitive = json.meshes[json.nodes.find((node) => node.mesh !== undefined).mesh].primitives[0];
    json.accessors[primitive.attributes.TEXCOORD_0].type = "VEC3";
  });
  assert.ok(checkWarrior(wrongShape, dimensions).failures.some((failure) => failure.includes("float VEC2")));

  const wrongCount = mutateJson(warrior, (json) => {
    const primitive = json.meshes[json.nodes.find((node) => node.mesh !== undefined).mesh].primitives[0];
    json.accessors[primitive.attributes.TEXCOORD_0].count -= 1;
  });
  assert.ok(checkWarrior(wrongCount, dimensions).failures.some((failure) => failure.includes("POSITION count")));

  const degenerate = mutateJson(warrior, (json, bin) => {
    const primitive = json.meshes[json.nodes.find((node) => node.mesh !== undefined).mesh].primitives[0];
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = readIndex(json, bin, primitive.indices, corner);
      const at = accessorOffset(json, primitive.attributes.TEXCOORD_0, vertex);
      bin.writeFloatLE(0.25, at);
      bin.writeFloatLE(0.25, at + 4);
    }
  });
  assert.ok(checkWarrior(degenerate, dimensions).failures.some((failure) => failure.includes("zero-area UV triangle")));

  let densityVictim = "";
  const wrongDensity = mutateJson(warrior, (json, bin) => {
    const node = json.nodes.find((candidate) => candidate.name === "chest");
    densityVictim = node.name;
    const primitive = json.meshes[node.mesh].primitives[0];
    const accessor = json.accessors[primitive.attributes.TEXCOORD_0];
    for (let index = 0; index < accessor.count; index += 1) {
      const at = accessorOffset(json, primitive.attributes.TEXCOORD_0, index);
      bin.writeFloatLE(0.5 + (bin.readFloatLE(at) - 0.5) * 0.5, at);
      bin.writeFloatLE(0.5 + (bin.readFloatLE(at + 4) - 0.5) * 0.5, at + 4);
    }
  });
  const densityFailures = checkWarrior(wrongDensity, dimensions).failures;
  assert.ok(densityFailures.some((failure) => failure.includes(densityVictim) && failure.includes("UV density")), densityFailures.join("\n"));

  const mergedSeams = mutateJson(warrior, (json, bin) => {
    const node = json.nodes.find((candidate) => candidate.name === "surcoat");
    const primitive = json.meshes[node.mesh].primitives[0];
    const positions = primitive.attributes.POSITION;
    const uvs = primitive.attributes.TEXCOORD_0;
    const count = json.accessors[positions].count;
    const firstUvAtPosition = new Map();
    for (let index = 0; index < count; index += 1) {
      const positionAt = accessorOffset(json, positions, index);
      const key = [0, 4, 8].map((offset) => bin.readFloatLE(positionAt + offset).toFixed(6)).join(",");
      const uvAt = accessorOffset(json, uvs, index);
      const canonical = firstUvAtPosition.get(key);
      if (canonical) {
        bin.writeFloatLE(canonical[0], uvAt);
        bin.writeFloatLE(canonical[1], uvAt + 4);
      } else {
        firstUvAtPosition.set(key, [bin.readFloatLE(uvAt), bin.readFloatLE(uvAt + 4)]);
      }
    }
  });
  const seamFailures = checkWarrior(mergedSeams, dimensions).failures;
  assert.ok(seamFailures.some((failure) => failure.includes('"surcoat"') && failure.includes("UV seam")), seamFailures.join("\n"));
});

test("a_normal_mapped_primitive_has_tangents", () => {
  assert.equal(checkWarrior(warrior, dimensions).failures.filter((f) => /TANGENT/.test(f)).length, 0);

  let victim = "";
  const broken = mutateJson(warrior, (json) => {
    const steel = json.materials.findIndex((material) => material.name === "steel");
    const node = json.nodes.find((candidate) =>
      candidate.mesh !== undefined && json.meshes[candidate.mesh].primitives.some((primitive) => primitive.material === steel));
    victim = node.name;
    const primitive = json.meshes[node.mesh].primitives.find((candidate) => candidate.material === steel);
    delete primitive.attributes.TANGENT;
  });
  const failures = checkWarrior(broken, dimensions).failures;
  assert.ok(failures.some((failure) => failure.includes(victim) && failure.includes("TANGENT")), failures.join("\n"));

  const malformed = mutateJson(warrior, (json) => {
    const steel = json.materials.findIndex((material) => material.name === "steel");
    const primitive = json.meshes.flatMap((mesh) => mesh.primitives).find((candidate) => candidate.material === steel);
    json.accessors[primitive.attributes.TANGENT].type = "VEC3";
  });
  assert.ok(checkWarrior(malformed, dimensions).failures.some((failure) => failure.includes("float VEC4")));

  const wrongCount = mutateJson(warrior, (json) => {
    const steel = json.materials.findIndex((material) => material.name === "steel");
    const primitive = json.meshes.flatMap((mesh) => mesh.primitives).find((candidate) => candidate.material === steel);
    json.accessors[primitive.attributes.TANGENT].count -= 1;
  });
  assert.ok(checkWarrior(wrongCount, dimensions).failures.some((failure) => failure.includes("POSITION count")));

  const nonFinite = mutateJson(warrior, (json, bin) => {
    const steel = json.materials.findIndex((material) => material.name === "steel");
    const primitive = json.meshes.flatMap((mesh) => mesh.primitives).find((candidate) => candidate.material === steel);
    bin.writeFloatLE(Number.NaN, accessorOffset(json, primitive.attributes.TANGENT));
  });
  assert.ok(checkWarrior(nonFinite, dimensions).failures.some((failure) => failure.includes("invalid TANGENT values")));

  const zero = mutateJson(warrior, (json, bin) => {
    const steel = json.materials.findIndex((material) => material.name === "steel");
    const primitive = json.meshes.flatMap((mesh) => mesh.primitives).find((candidate) => candidate.material === steel);
    const at = accessorOffset(json, primitive.attributes.TANGENT);
    bin.writeFloatLE(0, at);
    bin.writeFloatLE(0, at + 4);
    bin.writeFloatLE(0, at + 8);
  });
  assert.ok(checkWarrior(zero, dimensions).failures.some((failure) => failure.includes("invalid TANGENT values")));

  const dead = mutateJson(warrior, (json) => {
    const liveTangent = json.meshes.flatMap((mesh) => mesh.primitives)
      .map((primitive) => primitive.attributes.TANGENT)
      .find((index) => index !== undefined);
    json.accessors.push(structuredClone(json.accessors[liveTangent]));
    json.bufferViews.push(structuredClone(json.bufferViews[json.accessors[liveTangent].bufferView]));
  });
  const deadFailures = checkWarrior(dead, dimensions).failures;
  assert.ok(deadFailures.some((failure) => failure.includes("dead tangent payload")), deadFailures.join("\n"));
  assert.ok(deadFailures.some((failure) => failure.includes("dead binary payload")), deadFailures.join("\n"));
});

test("every_authored_node_names_the_runtime_surface_family", () => {
  assert.deepEqual(checkWarrior(warrior, dimensions).failures.filter((failure) => /material|runtime palette/.test(failure)), []);

  const broken = mutateJson(warrior, (json) => {
    const surcoat = json.nodes.find((node) => node.name === "surcoat");
    const steel = json.materials.findIndex((material) => material.name === "steel");
    json.meshes[surcoat.mesh].primitives[0].material = steel;
  });
  const failures = checkWarrior(broken, dimensions).failures;
  assert.ok(failures.some((failure) => failure.includes('"surcoat"') && failure.includes("cloth_surcoat")), failures.join("\n"));

  const competing = mutateJson(warrior, (json) => {
    json.materials.find((material) => material.name === "cloth").pbrMetallicRoughness.baseColorTexture = { index: 0 };
  });
  assert.ok(checkWarrior(competing, dimensions).failures.some((failure) => failure.includes("runtime palette")));
});

test("the_waist_seam_covers_all_four_lean_and_twist_corners", () => {
  assert.deepEqual(checkWarrior(warrior, dimensions).failures.filter((failure) => /waist seam/.test(failure)), []);
  const impossible = structuredClone(dimensions);
  impossible.body.trunkLeanMax = 1.2;
  const failures = checkWarrior(warrior, impossible).failures;
  assert.ok(failures.some((failure) => failure.includes("waist seam opens")), failures.join("\n"));
});
