"""Render exported achieved geometry: blender --background --python this.py -- pose.json image.png [body] [front|side|rear|top]."""
import bpy,json,sys
from mathutils import Vector
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:]
args[1]=str(Path(args[1]).resolve())
bpy.ops.wm.read_factory_settings(use_empty=True)
for row in json.load(open(args[0])):
    if 'body' in args[2:] and row['layer']!='body': continue
    mesh=bpy.data.meshes.new(row['name']); idx=row['indices']; mesh.from_pydata(row['vertices'],[],[(idx[i],idx[i+2],idx[i+1]) for i in range(0,len(idx),3)]); mesh.update()
    obj=bpy.data.objects.new(row['name'],mesh); bpy.context.collection.objects.link(obj)
    mat=bpy.data.materials.new(row['name']); mat.use_nodes=True; bsdf=mat.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Base Color'].default_value=(*row['colour'],1); bsdf.inputs['Metallic'].default_value=row['metallic']; bsdf.inputs['Roughness'].default_value=.55; mesh.materials.append(mat)
    for poly in mesh.polygons: poly.use_smooth=row['layer']=='body'
scene=bpy.context.scene
view=args[-1]; location={'rear':(2,-4,2.2),'side':(4,0,2.1),'top':(0,.01,5)}.get(view,(-2.5,4,2.2))
bpy.ops.object.camera_add(location=location);cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.95))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.3;scene.camera=cam
if view=='grip':
    hand=next(o for o in scene.objects if '.primary.Hand.' in o.name)
    target=sum((hand.matrix_world@Vector(v) for v in hand.bound_box),Vector())/8
    cam.location=target+Vector((-.2,.35,.2));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.38
for pos,power,size in [((2,-3,4),650,4),((-3,-1,3),500,3),((1,3,4),800,3)]:
    bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.world=bpy.data.worlds.new('World');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.07,.08,.1,1)
scene.render.resolution_x=900;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.filepath=args[1];bpy.ops.render.render(write_still=True)
