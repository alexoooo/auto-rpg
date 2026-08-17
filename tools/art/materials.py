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
    quadrant_x, quadrant_y = spec["sourceQuadrant"]
    crop_width = width // 2
    crop_height = height // 2
    source_pixels = source.pixels[:]
    cropped_pixels = []
    for y in range(crop_height):
        source_y = quadrant_y * crop_height + y
        for x in range(crop_width):
            source_x = quadrant_x * crop_width + x
            offset = (source_y * width + source_x) * 4
            cropped_pixels.extend(source_pixels[offset:offset + 4])
    cropped = bpy.data.images.new(f"room_{name}_source", width=crop_width,
                                  height=crop_height, alpha=True)
    cropped.pixels[:] = cropped_pixels
    bpy.data.images.remove(source)
    cropped.scale(processing["width"], processing["height"])
    pixels = _periodic_pixels(cropped.pixels[:], processing["width"], processing["height"],
                              processing["periodicEdgePixels"])
    image = bpy.data.images.new(f"room_{name}_albedo", width=processing["width"],
                                height=processing["height"], alpha=True)
    image.colorspace_settings.name = processing["colourSpace"]
    image.pixels[:] = pixels
    image.pack()
    bpy.data.images.remove(cropped)
    return image


def _derived_maps(name, albedo, processing, roughness, metallic):
    """Derive periodic tangent relief and packed material response deterministically.

    The reviewed painterly source is neutral diffuse with no baked lighting. A
    bounded central difference gives its brushwork shallow physical relief;
    luminance only perturbs roughness, so neither derivative can invent glossy
    highlights or saturated colour absent from the source.
    """
    width = processing["width"]
    height = processing["height"]
    pixels = albedo.pixels[:]
    normal_pixels = []
    orm_pixels = []
    luminance = [
        pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722
        for index in range(0, len(pixels), 4)
    ]
    for y in range(height):
        north = ((y - 1) % height) * width
        south = ((y + 1) % height) * width
        row = y * width
        for x in range(width):
            west = row + (x - 1) % width
            east = row + (x + 1) % width
            dx = luminance[east] - luminance[west]
            dy = luminance[south + x] - luminance[north + x]
            nx = max(0.08, min(0.92, 0.5 - dx * 1.35))
            ny = max(0.08, min(0.92, 0.5 - dy * 1.35))
            normal_pixels.extend((nx, ny, 0.94, 1.0))
            value = luminance[row + x]
            occlusion = max(0.62, min(1.0, 0.74 + value * 0.26))
            surface_roughness = max(0.58, min(1.0, roughness + (0.5 - value) * 0.16))
            orm_pixels.extend((occlusion, surface_roughness, metallic, 1.0))
    normal = bpy.data.images.new(f"room_{name}_normal", width=width, height=height, alpha=True)
    normal.colorspace_settings.name = "Non-Color"
    normal.pixels[:] = normal_pixels
    normal.pack()
    orm = bpy.data.images.new(f"room_{name}_orm", width=width, height=height, alpha=True)
    orm.colorspace_settings.name = "Non-Color"
    orm.pixels[:] = orm_pixels
    orm.pack()
    return normal, orm


def build_materials(spec, texture_spec, processing, root):
    images = {name: _verified_image(Path(root), name, values, processing)
              for name, values in sorted(texture_spec.items())}
    derived = {}
    for material_name, values in sorted(spec.items()):
        texture_name = values.get("baseColorTexture")
        if texture_name is None or texture_name in derived:
            continue
        derived[texture_name] = _derived_maps(
            texture_name, images[texture_name], processing,
            float(values.get("roughness", "0.5")), float(values.get("metallic", "0.0")),
        )
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
            normal_image, orm_image = derived[texture_name]
            normal_texture = material.node_tree.nodes.new("ShaderNodeTexImage")
            normal_texture.name = f"room_{texture_name}_normal"
            normal_texture.label = normal_texture.name
            normal_texture.image = normal_image
            normal_map = material.node_tree.nodes.new("ShaderNodeNormalMap")
            normal_map.inputs["Strength"].default_value = {
                "wall": 0.08, "floor": 0.30, "wood": 0.24, "overburden": 0.22,
            }.get(texture_name, 0.18)
            material.node_tree.links.new(normal_texture.outputs["Color"], normal_map.inputs["Color"])
            material.node_tree.links.new(normal_map.outputs["Normal"], node.inputs["Normal"])
            orm_texture = material.node_tree.nodes.new("ShaderNodeTexImage")
            orm_texture.name = f"room_{texture_name}_orm"
            orm_texture.label = orm_texture.name
            orm_texture.image = orm_image
            channels = material.node_tree.nodes.new("ShaderNodeSeparateColor")
            channels.mode = "RGB"
            material.node_tree.links.new(orm_texture.outputs["Color"], channels.inputs["Color"])
            material.node_tree.links.new(channels.outputs["Green"], node.inputs["Roughness"])
            material.node_tree.links.new(channels.outputs["Blue"], node.inputs["Metallic"])
        if "emissiveStrength" in values:
            node.inputs["Emission Color"].default_value = material.diffuse_color
            node.inputs["Emission Strength"].default_value = float(values["emissiveStrength"])
        result[name] = material
    return result
