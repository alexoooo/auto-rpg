"""Read-only Blender authoring pass: fit scaled hands around fixed-size handles.

blender --background --disable-autoexec assets/character-lab/fighter.blend --python scripts/humanoid/fit-workshop-size-grips.py
Only the grip metadata is written; the .blend, GLB, materials and texture data are untouched.
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Quaternion

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/character-lab/realistic'))
from grip_fit import fit, fit_thumb

source = json.loads((ROOT / 'assets/humanoid/workshop-fighter.json').read_text())
rig = bpy.data.objects['WorkshopRig']
skin = bpy.data.objects['base__skin']
rig.animation_data_clear()
b = rig.data.bones
samples = []
for step in range(13):
    size = round(.8 + step * .025, 3)
    closed = {}
    for side in ['r', 'l']:
        original = {name: value for name, value in source['grips']['sword-shield'].items() if name.endswith('_' + side)}
        if size == 1:
            closed.update(original)
            continue
        for pose in rig.pose.bones:
            pose.matrix_basis.identity()
        for name, value in original.items():
            rig.pose.bones[name].rotation_mode = 'QUATERNION'
            rig.pose.bones[name].rotation_quaternion = Quaternion(value)
        w = b['hand_' + side].head_local.copy()
        v = (b['middle_01_' + side].head_local - w).normalized()
        u = (b['index_01_' + side].head_local - b['pinky_01_' + side].head_local).normalized()
        u = (u - v * u.dot(v)).normalized()
        n = u.cross(v).normalized() * (-1 if side == 'l' else 1)
        frame = (w, u, v, n)
        k = (b['middle_01_' + side].head_local - w).length / .1209
        # In unscaled hand coordinates, the fixed handle shrinks by 1/size.
        centre = (0, .095 * k, .046 * k)
        angles = fit(rig, skin, side, frame, centre, .018 * k / size, half=.075 * k / size)
        for digit, values in angles.items():
            for j, angle in enumerate(values):
                name = f'{digit}_{j+1:02}_{side}'
                axis = b[name].matrix_local.to_3x3().inverted() @ (u * (-1 if side == 'l' else 1))
                closed[name] = list(Quaternion(axis, math.radians(angle)))
        for j, q in enumerate(fit_thumb(rig, skin, side, frame, centre, .018 * k / size, half=.075 * k / size)):
            closed[f'thumb_{j+1:02}_{side}'] = list(q)
    samples.append({'size': size, 'closed': closed})
out = ROOT / 'assets/humanoid/workshop-size-grips.json'
out.write_text(json.dumps({'sourceSha256': source['source']['sha256'], 'samples': samples}, indent=2) + '\n')
print('Wrote', out)
