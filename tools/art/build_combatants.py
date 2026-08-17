"""Build or verify the deterministic representative combatant asset."""

import hashlib
import json
import locale
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile

import bpy

from combatants import build_combatant_materials, build_combatants
from export import canonical_bytes, sha256_bytes, write_sidecar


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent.parent
MANIFEST_PATH = SCRIPT_DIR / "combatants-manifest.json"
OUTPUT_DIR = ROOT / "web" / "assets3d"
GENERATED_TS = ROOT / "client" / "src" / "render" / "combatant-asset.generated.ts"


def _export_combatant_glb(path, flags):
    # Normal maps without authored tangents force every consumer to synthesize
    # a basis and make gltf-validator report one warning per primitive.  The
    # combatant asset owns baked normal maps, so its tangent basis is part of
    # the authored payload rather than a renderer-specific reconstruction.
    result = bpy.ops.export_scene.gltf(
        filepath=str(path), export_format=flags["format"], check_existing=False,
        export_yup=flags["exportYup"], export_apply=flags["applyModifiers"],
        use_selection=flags["useSelection"], export_texcoords=True,
        export_normals=True, export_tangents=True,
        export_materials=flags["exportMaterials"], export_cameras=False,
        export_lights=False, export_animations=flags["animations"],
        export_skins=flags.get("skins", False),
        export_morph=flags.get("morphs", False), export_extras=True,
        export_vertex_color=flags.get("vertexColor", "MATERIAL"),
        export_vertex_color_name=flags.get("vertexColorName", ""),
        export_all_vertex_colors=flags.get("allVertexColors", False),
    )
    if result != {"FINISHED"}:
        raise RuntimeError(f"glTF export failed: {result}")


def _manifest():
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def _input_hash(manifest):
    value = dict(manifest)
    value.pop("outputs", None)
    digest = hashlib.sha256(canonical_bytes(value))
    # The recipe is an authored input just as surely as the manifest and source
    # atlases are. Manifest-only provenance stayed unchanged while geometry and
    # UV code moved, which made the old build-input pin unable to identify the
    # artifact it claimed to describe.
    for name in ("combatants.py", "build_combatants.py"):
        digest.update(b"\0" + name.encode("ascii") + b"\0")
        digest.update((SCRIPT_DIR / name).read_bytes())
    return digest.hexdigest()


def _verify_blender(manifest):
    version = ".".join(str(value) for value in bpy.app.version)
    if version != manifest["toolchain"]["blender"]:
        raise RuntimeError(f"Blender is {version}; expected {manifest['toolchain']['blender']}")
    binary = Path(bpy.app.binary_path).resolve()
    digest = hashlib.sha256(binary.read_bytes()).hexdigest()
    if digest != manifest["toolchain"]["blenderBinarySha256"]:
        raise RuntimeError(f"Blender binary SHA-256 is {digest}; expected {manifest['toolchain']['blenderBinarySha256']}")


def _clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    locale.setlocale(locale.LC_ALL, "C")
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.length_unit = "METERS"
    bpy.context.scene.unit_settings.scale_length = 1
    bpy.context.scene.render.fps = 30
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 31


def _node_binary():
    toolchain = json.loads((ROOT / "tools" / "toolchain.json").read_text(encoding="utf-8"))
    path = ROOT / Path(toolchain["downloads"]["nodeWindowsX64Zip"]["localExecutablePath"])
    if not path.is_file():
        raise RuntimeError(f"pinned Node executable is missing: {path}")
    return path


def _run_validator(glb, sidecar, report):
    command = [str(_node_binary()), str(ROOT / "tools" / "validate_combatants.js"), str(glb),
               "--sidecar", str(sidecar), "--manifest", str(MANIFEST_PATH),
               "--report", str(report), "--skip-expected-hashes"]
    completed = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"combatant asset validation failed:\n{completed.stdout}{completed.stderr}")


def _gltf(glb):
    data = Path(glb).read_bytes()
    if data[:4] != b"glTF" or struct.unpack_from("<I", data, 4)[0] != 2:
        raise RuntimeError("combatant export did not produce GLB 2")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError("combatant GLB has no leading JSON chunk")
    return json.loads(data[20:20 + json_length].rstrip(b" \0"))


def _normalize_skinned_mesh_roots(glb):
    # Blender requires the armature to parent each authored skinned mesh, while
    # glTF recommends skinned mesh nodes live at scene roots.  The exporter
    # cannot express both: its flatten-object option deliberately exempts these
    # meshes.  Normalize only the JSON graph after export; binary payloads,
    # skin joints, inverse binds, and mesh transforms stay byte-for-byte.
    path = Path(glb)
    data = path.read_bytes()
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if data[:4] != b"glTF" or json_type != 0x4E4F534A:
        raise RuntimeError("combatant normalization needs GLB 2 with leading JSON")
    gltf = json.loads(data[20:20 + json_length].rstrip(b" \0"))
    skinned = sorted(index for index, node in enumerate(gltf.get("nodes", [])) if "skin" in node)
    if not skinned:
        raise RuntimeError("combatant normalization found no skinned mesh nodes")
    skinned_set = set(skinned)
    for node in gltf.get("nodes", []):
        if "children" in node:
            node["children"] = [index for index in node["children"] if index not in skinned_set]
            if not node["children"]:
                del node["children"]
    for scene in gltf.get("scenes", []):
        scene["nodes"] = sorted(set(scene.get("nodes", [])) | skinned_set)
    encoded = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    encoded += b" " * ((-len(encoded)) % 4)
    old_bin_header = 20 + json_length
    bin_length, bin_type = struct.unpack_from("<II", data, old_bin_header)
    if bin_type != 0x004E4942 or old_bin_header + 8 + bin_length != len(data):
        raise RuntimeError("combatant normalization needs one trailing BIN chunk")
    binary = data[old_bin_header + 8:]
    total = 12 + 8 + len(encoded) + 8 + len(binary)
    rebuilt = bytearray(total)
    struct.pack_into("<III", rebuilt, 0, 0x46546C67, 2, total)
    struct.pack_into("<II", rebuilt, 12, len(encoded), 0x4E4F534A)
    rebuilt[20:20 + len(encoded)] = encoded
    bin_header = 20 + len(encoded)
    struct.pack_into("<II", rebuilt, bin_header, len(binary), 0x004E4942)
    rebuilt[bin_header + 8:] = binary
    path.write_bytes(rebuilt)


def _parent_names(gltf):
    result = {}
    for index, node in enumerate(gltf.get("nodes", [])):
        for child in node.get("children", []):
            result[child] = node.get("name", f"node-{index}")
    return result


def _sidecar(manifest, source_hash, glb):
    gltf = _gltf(glb)
    names = {node.get("name"): (index, node) for index, node in enumerate(gltf.get("nodes", []))}
    parents = _parent_names(gltf)
    material_names = [material.get("name") for material in gltf.get("materials", [])]
    skin_by_name = {skin.get("name"): skin for skin in gltf.get("skins", [])}
    archetypes = []
    vertex_total = 0
    triangle_total = 0
    for spec in manifest["archetypes"]:
        prefix = spec["nodePrefix"]
        armature_name = prefix + "armature"
        skin = skin_by_name[armature_name]
        bone_semantics = [
            "root", "pelvis", "torso", "head",
            "arm_left", "hand_left", "socket_weapon_left",
            "arm_right", "hand_right", "socket_weapon_right", "socket_shield",
            "region_head", "region_torso", "region_left_arm", "region_right_arm", "region_legs",
        ]
        bone_nodes = [gltf["nodes"][index]["name"] for index in skin["joints"]]
        expected_bones = [prefix + semantic for semantic in bone_semantics]
        if bone_nodes != expected_bones:
            raise RuntimeError(f"combatant skin {armature_name} bone order drifted")
        semantic_nodes = []
        for semantic in manifest["semanticNames"]:
            node_name = prefix + semantic
            index, node = names[node_name]
            semantic_nodes.append({
                "semantic": semantic, "node": node_name, "parent": parents.get(index),
                "translation": node.get("translation", [0, 0, 0]),
                "rotation": node.get("rotation", [0, 0, 0, 1]),
                "scale": node.get("scale", [1, 1, 1]),
            })
        lods = []
        for lod_spec in spec["lods"]:
            level = lod_spec["level"]
            meshes = []
            lod_triangles = 0
            for semantic in spec["meshNames"]:
                node_name = prefix + "lod_" + level + "_mesh_" + semantic
                index, node = names[node_name]
                mesh = gltf["meshes"][node["mesh"]]
                vertices = 0
                triangles = 0
                bounds_min = [float("inf")] * 3
                bounds_max = [float("-inf")] * 3
                roles = set()
                used_materials = set()
                for primitive in mesh["primitives"]:
                    position = gltf["accessors"][primitive["attributes"]["POSITION"]]
                    vertices += position["count"]
                    indices = gltf["accessors"][primitive["indices"]]
                    triangles += indices["count"] // 3
                    material_name = material_names[primitive["material"]]
                    used_materials.add(material_name)
                    roles.add(manifest["materials"][material_name]["role"])
                    for axis in range(3):
                        bounds_min[axis] = min(bounds_min[axis], position["min"][axis])
                        bounds_max[axis] = max(bounds_max[axis], position["max"][axis])
                if len(roles) != 1 or len(used_materials) != 1:
                    raise RuntimeError(f"combatant mesh {node_name} uses more than one semantic material")
                vertex_total += vertices
                triangle_total += triangles
                lod_triangles += triangles
                meshes.append({
                    "semantic": semantic, "node": node_name, "parent": parents.get(index),
                    "material": next(iter(used_materials)), "materialRole": next(iter(roles)),
                    "primitiveCount": len(mesh["primitives"]),
                    "vertexCount": vertices, "triangleCount": triangles,
                    "bounds": {"min": bounds_min, "max": bounds_max},
                })
            if lod_triangles > lod_spec["maxTriangles"]:
                raise RuntimeError(
                    f"combatant {spec['kind']} {level} triangle budget exceeded: "
                    f"{lod_triangles} > {lod_spec['maxTriangles']}")
            lods.append({
                "level": level, "maxTriangles": lod_spec["maxTriangles"], "meshes": meshes,
            })
        clips = []
        animations = {animation.get("name"): animation for animation in gltf.get("animations", [])}
        for semantic in manifest["clips"]:
            name = prefix + semantic
            animation = animations[name]
            end = max(gltf["accessors"][sampler["input"]].get("max", [0])[0]
                      for sampler in animation["samplers"])
            clips.append({"semantic": semantic, "animation": name, "durationSeconds": end,
                          "looping": semantic in ("idle", "walk")})
        archetypes.append({
            "kind": spec["kind"], "height": float(spec["height"]),
            "nodePrefix": prefix,
            "skeleton": {"node": armature_name, "skin": armature_name, "bones": bone_nodes},
            "nodes": semantic_nodes, "lods": lods, "clips": clips,
        })
    source_bytes = sum(view["byteLength"] for view in gltf.get("bufferViews", []))
    texture_bytes = sum(spec["embeddedWidth"] * spec["embeddedHeight"] * 4 * 3
                        for spec in manifest["textures"])
    residency = {
        "sourceBufferBytes": source_bytes,
        "decodedTextureBytes": texture_bytes,
        "totalBytes": source_bytes + texture_bytes,
    }
    result = {
        "schemaVersion": 2, "fixtureId": manifest["fixtureId"],
        "buildInputsSha256": source_hash, "glbSha256": sha256_bytes(Path(glb).read_bytes()),
        "coordinates": manifest["coordinates"], "semanticNames": manifest["semanticNames"],
        "archetypes": archetypes,
        "counts": {
            "nodes": len(gltf.get("nodes", [])), "meshes": len(gltf.get("meshes", [])),
            "materials": len(gltf.get("materials", [])), "vertices": vertex_total,
            "triangles": triangle_total, "animations": len(gltf.get("animations", [])),
            "skins": len(gltf.get("skins", [])),
        },
        "estimatedGpuResidency": residency, "payloadBytes": 0,
    }
    while True:
        payload = Path(glb).stat().st_size + len(canonical_bytes(result))
        if payload == result["payloadBytes"]:
            return result
        result["payloadBytes"] = payload


def _build_once(directory, manifest, source_hash):
    _clear_scene()
    materials = build_combatant_materials(manifest, ROOT)
    built = build_combatants(manifest, materials)
    bpy.ops.object.select_all(action="DESELECT")
    for value in built.values():
        for obj in [value["armature"], *value["markers"].values(), *value["meshes"].values()]:
            obj.select_set(True)
    glb = directory / "combatants.glb"
    sidecar = directory / "combatants.json"
    report = directory / "combatants.validator.json"
    _export_combatant_glb(glb, manifest["export"])
    _normalize_skinned_mesh_roots(glb)
    write_sidecar(sidecar, _sidecar(manifest, source_hash, glb))
    _run_validator(glb, sidecar, report)
    return glb, sidecar, report


def _hashes(outputs, source_hash):
    return {
        "buildInputsSha256": source_hash,
        "glbSha256": sha256_bytes(outputs[0].read_bytes()),
        "sidecarSha256": sha256_bytes(outputs[1].read_bytes()),
        "validatorSha256": sha256_bytes(outputs[2].read_bytes()),
    }


def _generated_typescript(manifest, actual):
    lines = [
        "// Generated by tools/art/build_slice.py --target combatants. Do not edit by hand.",
        f'export const COMBATANT_FIXTURE_ID = "{manifest["fixtureId"]}" as const;',
        f'export const COMBATANT_BUILD_INPUTS_SHA256 = "{actual["buildInputsSha256"]}" as const;',
        f'export const COMBATANT_SIDECAR_SHA256 = "{actual["sidecarSha256"]}" as const;',
        f'export const COMBATANT_GLB_SHA256 = "{actual["glbSha256"]}" as const;',
        f'export const COMBATANT_VALIDATOR_SHA256 = "{actual["validatorSha256"]}" as const;',
        "",
    ]
    return "\n".join(lines).encode("ascii")


def run(arguments):
    manifest = _manifest()
    _verify_blender(manifest)
    source_hash = _input_hash(manifest)
    with tempfile.TemporaryDirectory(prefix="combatants-a-") as first_name, \
         tempfile.TemporaryDirectory(prefix="combatants-b-") as second_name:
        first = _build_once(Path(first_name), manifest, source_hash)
        second = _build_once(Path(second_name), manifest, source_hash)
        for left, right in zip(first, second):
            if left.read_bytes() != right.read_bytes():
                raise RuntimeError(f"two independent combatant exports differ: {left.name}")
        actual = _hashes(first, source_hash)
        if arguments.write:
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            for source in first:
                destination = OUTPUT_DIR / source.name
                temporary = destination.with_suffix(destination.suffix + ".tmp")
                shutil.copyfile(source, temporary)
                os.replace(temporary, destination)
            temporary_ts = GENERATED_TS.with_suffix(".ts.tmp")
            temporary_ts.write_bytes(_generated_typescript(manifest, actual))
            os.replace(temporary_ts, GENERATED_TS)
            print(f"combatant candidate hashes: {actual}")
            return
        expected = {
            "buildInputsSha256": source_hash,
            "glbSha256": manifest["outputs"]["glb"]["sha256"],
            "sidecarSha256": manifest["outputs"]["sidecar"]["sha256"],
            "validatorSha256": manifest["outputs"]["validator"]["sha256"],
        }
        if actual != expected:
            raise RuntimeError(f"generated combatant hashes differ: actual={actual} expected={expected}")
        committed = (OUTPUT_DIR / "combatants.glb", OUTPUT_DIR / "combatants.json",
                     OUTPUT_DIR / "combatants.validator.json")
        for generated, saved in zip(first, committed):
            if not saved.is_file() or generated.read_bytes() != saved.read_bytes():
                raise RuntimeError(f"committed combatant output differs: {saved}")
        if not GENERATED_TS.is_file() or GENERATED_TS.read_bytes() != _generated_typescript(manifest, actual):
            raise RuntimeError(f"generated combatant TypeScript differs: {GENERATED_TS}")
        print(f"combatant asset verified: {actual['glbSha256']}")
