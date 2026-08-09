"""Deterministic material construction for the representative room slice."""

import hashlib
from pathlib import Path
import struct
import bpy


def _periodic_pixels(pixels, width, height, edge):
    result = list(pixels)
    for y in range(height):
        for distance in range(edge):
            left = (y * width + distance) * 4
            right = (y * width + width - 1 - distance) * 4
            blend = distance / (edge - 1)
            for channel in range(4):
                average = (result[left + channel] + result[right + channel]) * 0.5
                result[left + channel] = average * (1 - blend) + result[left + channel] * blend
                result[right + channel] = average * (1 - blend) + result[right + channel] * blend
    for x in range(width):
        for distance in range(edge):
            bottom = (distance * width + x) * 4
            top = ((height - 1 - distance) * width + x) * 4
            blend = distance / (edge - 1)
            for channel in range(4):
                average = (result[bottom + channel] + result[top + channel]) * 0.5
                result[bottom + channel] = average * (1 - blend) + result[bottom + channel] * blend
                result[top + channel] = average * (1 - blend) + result[top + channel] * blend
    return result


def _verified_image(root, name, spec, processing):
    path = root / spec["path"]
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != spec["sha256"]:
        raise RuntimeError(f"texture {name} SHA-256 differs from the manifest")
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise RuntimeError(f"texture {name} is not a PNG with a leading IHDR")
    width, height = struct.unpack(">II", data[16:24])
    if width != spec["width"] or height != spec["height"]:
        raise RuntimeError(f"texture {name} dimensions differ from the manifest")
    source = bpy.data.images.load(str(path), check_existing=False)
    source.scale(processing["width"], processing["height"])
    pixels = _periodic_pixels(source.pixels[:], processing["width"], processing["height"],
                              processing["periodicEdgePixels"])
    image = bpy.data.images.new(f"room_{name}_albedo", width=processing["width"],
                                height=processing["height"], alpha=True)
    image.colorspace_settings.name = processing["colourSpace"]
    image.pixels[:] = pixels
    image.pack()
    bpy.data.images.remove(source)
    return image


def build_materials(spec, texture_spec, processing, root):
    images = {name: _verified_image(Path(root), name, values, processing)
              for name, values in sorted(texture_spec.items())}
    result = {}
    for name in sorted(spec):
        values = spec[name]
        material = bpy.data.materials.new(name)
        material.diffuse_color = (
            float(values["baseColorR"]), float(values["baseColorG"]),
            float(values["baseColorB"]), 1,
        )
        material.metallic = float(values.get("metallic", "0.0"))
        material.roughness = float(values.get("roughness", "0.5"))
        if "emissiveStrength" in values or "baseColorTexture" in values:
            material.use_nodes = True
            node = material.node_tree.nodes.get("Principled BSDF")
            node.inputs["Base Color"].default_value = material.diffuse_color
            node.inputs["Metallic"].default_value = material.metallic
            node.inputs["Roughness"].default_value = material.roughness
        if "baseColorTexture" in values:
            texture_name = values["baseColorTexture"]
            texture = material.node_tree.nodes.new("ShaderNodeTexImage")
            texture.name = f"room_{texture_name}_albedo"
            texture.label = texture.name
            texture.image = images[texture_name]
            material.node_tree.links.new(texture.outputs["Color"], node.inputs["Base Color"])
        if "emissiveStrength" in values:
            node.inputs["Emission Color"].default_value = material.diffuse_color
            node.inputs["Emission Strength"].default_value = float(values["emissiveStrength"])
        result[name] = material
    return result
