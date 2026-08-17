"""Canonical GLB export and semantic sidecar construction."""

import hashlib
import json
from pathlib import Path
import struct

import bpy


def canonical_bytes(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")


def sha256_bytes(value):
    return hashlib.sha256(value).hexdigest()


def gltf_point(vertex):
    return [vertex.x, vertex.z, -vertex.y]


def mesh_bounds(obj):
    points = [gltf_point(vertex.co) for vertex in obj.data.vertices]
    return [
        [min(point[axis] for point in points) for axis in range(3)],
        [max(point[axis] for point in points) for axis in range(3)],
    ]


# Exact instance counts of the 48 x 32 stress fixture. The 188-face complete
# boundary projects to 94 tile-frequency facade instances on eight merged +X/+Y
# cutaway runs; the two door records add one visible frame apiece. Keep this mirrored with
# room-stress.ts and the runtime validator; it is the residency authority.
INSTANCE_CAPACITIES = {
    "floor_a": 768, "floor_b": 768, "wall_straight": 94,
    "wall_inside": 0, "wall_outside": 0, "wall_end": 0,
    "door_frame": 2, "door_leaf": 2, "torch_bracket": 8,
    "decal_rubble": 4, "decal_root": 4, "prop_barrel": 4,
}


def _exported_contract(glb_path, manifest):
    data = Path(glb_path).read_bytes()
    if data[:4] != b"glTF" or struct.unpack_from("<I", data, 4)[0] != 2:
        raise RuntimeError("export did not produce GLB 2")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError("exported GLB has no leading JSON chunk")
    gltf = json.loads(data[20:20 + json_length].rstrip(b" \0"))
    result = {}
    used_views = set()
    for node in gltf["nodes"]:
        if "mesh" not in node:
            continue
        mesh = gltf["meshes"][node["mesh"]]
        primitive = mesh["primitives"][0]
        position = gltf["accessors"][primitive["attributes"]["POSITION"]]
        indices = gltf["accessors"][primitive["indices"]]
        for accessor_index in list(primitive["attributes"].values()) + [primitive["indices"]]:
            used_views.add(gltf["accessors"][accessor_index]["bufferView"])
        result[node["name"]] = {
            "primitiveCount": len(mesh["primitives"]),
            "vertexCount": position["count"],
            "triangleCount": indices["count"] // 3,
            "bounds": {"min": position["min"], "max": position["max"]},
        }
    source_bytes = sum(gltf["bufferViews"][index]["byteLength"] for index in used_views)
    instance_bytes = sum(capacity * 16 * 4 * 2 for capacity in INSTANCE_CAPACITIES.values())
    shadow_bytes = 1024 * 1024 * 4
    decoded_texture_bytes = (manifest["textureProcessing"]["width"] *
                             manifest["textureProcessing"]["height"] * 4 *
                             len(manifest["textures"]))
    residency = {
        "sourceBufferBytes": source_bytes,
        "decodedTextureBytes": decoded_texture_bytes,
        "instanceBufferBytes": instance_bytes,
        "shadowMapBytes": shadow_bytes,
        "totalBytes": source_bytes + decoded_texture_bytes + instance_bytes + shadow_bytes,
    }
    return result, residency


def semantic_sidecar(manifest, meshes, socket, generator_hash, glb_path):
    exported, residency = _exported_contract(glb_path, manifest)
    specs = {piece["node"]: piece for piece in manifest["pieces"]}
    nodes = []
    for name in sorted(meshes):
        spec = specs[name]
        nodes.append({
            "name": spec["name"],
            "node": name,
            "materialRole": spec["materialRole"],
            **exported[name],
            "collisionDebugBounds": {
                "min": [float(value) for value in spec["bounds"]["min"]],
                "max": [float(value) for value in spec["bounds"]["max"]],
            },
            "pivot": spec["pivot"],
            "allowedQuarterTurns": spec["allowedQuarterTurns"],
        })
    socket_spec = specs["ROOM_torch_bracket"]["socket"]
    result = {
        "schemaVersion": 1,
        "fixtureId": manifest["fixtureId"],
        "buildInputsSha256": generator_hash,
        "coordinates": manifest["coordinates"],
        "runtimeFixture": manifest["runtimeFixture"],
        "styling": {
            "id": manifest["styling"]["id"],
            "mode": manifest["styling"]["mode"],
            "attribute": manifest["styling"]["attribute"],
            "textures": manifest["styling"]["textures"],
        },
        "pieces": nodes,
        "sockets": [{
            "name": socket.name,
            "parent": "ROOM_torch_bracket",
            "translation": [float(value) for value in socket_spec["translation"]],
            "rotation": [float(value) for value in socket_spec["rotation"]],
        }],
        "counts": {
            "nodes": len(meshes) + 1,
            "meshes": len(meshes),
            "materials": len(set(piece["materialRole"] for piece in manifest["pieces"])),
            "vertices": sum(piece["vertexCount"] for piece in nodes),
            "triangles": sum(piece["triangleCount"] for piece in nodes),
        },
        "estimatedGpuResidency": residency,
        "payloadBytes": 0,
    }
    glb_length = Path(glb_path).stat().st_size
    while True:
        payload = glb_length + len(canonical_bytes(result))
        if payload == result["payloadBytes"]:
            return result
        result["payloadBytes"] = payload


def export_glb(path, flags):
    kwargs = {
        "filepath": str(path), "export_format": flags["format"],
        "check_existing": False, "export_yup": flags["exportYup"],
        "export_apply": flags["applyModifiers"], "use_selection": flags["useSelection"],
        "export_texcoords": True, "export_normals": True,
        "export_materials": flags["exportMaterials"], "export_cameras": False,
        "export_lights": False, "export_animations": flags["animations"],
        "export_skins": flags.get("skins", False),
        "export_morph": flags.get("morphs", False), "export_extras": True,
        "export_vertex_color": flags.get("vertexColor", "MATERIAL"),
        "export_vertex_color_name": flags.get("vertexColorName", ""),
        "export_all_vertex_colors": flags.get("allVertexColors", False),
    }
    result = bpy.ops.export_scene.gltf(**kwargs)
    if result != {"FINISHED"}:
        raise RuntimeError(f"glTF export failed: {result}")


def write_sidecar(path, value):
    Path(path).write_bytes(canonical_bytes(value))
