"""Keep original image bytes once, with relative references from Blender masters."""
import bpy, hashlib, os

def unpack_images(source, destination):
    destination.mkdir(parents=True, exist_ok=True)
    for image in bpy.data.images:
        if not image.packed_file:
            continue
        data = bytes(image.packed_file.data)
        extension = '.png' if data.startswith(b'\x89PNG') else '.jpg' if data.startswith(b'\xff\xd8') else None
        if not extension:
            raise ValueError('Unsupported packed source image: ' + image.name)
        target = destination / (hashlib.sha256(data).hexdigest() + extension)
        if not target.exists():
            target.write_bytes(data)
        image.unpack(method='REMOVE')
        image.source = 'FILE'
        image.filepath = '//' + os.path.relpath(target, source.parent).replace('\\', '/')
