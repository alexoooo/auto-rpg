"""Authored crypt kit. Blender 4.5 --background --python scripts/dungeon/build-reference.py.
Game metres, Y up. Deterministic geometry and seamless stone maps; no external models.
Solid decoration remains inside rock/tomb footprints; paving crowns are at most 4 mm.
"""
import bpy, bmesh, math, random, json, hashlib
import numpy as np
from pathlib import Path
from mathutils import Matrix

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/dungeon-reference'
SOURCE = ROOT / 'assets/dungeon-reference'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
rng = random.Random(271828)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
mats = {}
for name,color in [('wall',(.40,.39,.36,1)),('trim',(.51,.48,.42,1)),('floor',(.43,.44,.43,1)),
                   ('root',(.19,.13,.07,1)),('earth',(.15,.16,.09,1)),('iron',(.12,.14,.15,1)),('tomb',(.44,.42,.37,1))]:
    m=bpy.data.materials.new(name); m.diffuse_color=color; m.use_nodes=True
    vertex=m.node_tree.nodes.new('ShaderNodeVertexColor'); vertex.layer_name='stone variation'
    m.node_tree.links.new(vertex.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    mats[name]=m
objects=[]

def pos(p): return (p[0],-p[2],p[1])

def finish(o,mat,shade=None):
    o.data.materials.append(mats[mat]); objects.append(o); o.data.update()
    if not o.data.uv_layers: o.data.uv_layers.new()
    color=o.data.color_attributes.new(name='stone variation',type='FLOAT_COLOR',domain='CORNER')
    # Adding a corner attribute reallocates CustomData: only acquire UV handles afterwards.
    layer=o.data.uv_layers.active.data
    shade=rng.uniform(.70,1) if shade is None else shade
    du,dv=rng.random(),rng.random()
    for poly in o.data.polygons:
        normal=o.matrix_world.to_3x3() @ poly.normal
        axis=max(range(3),key=lambda i:abs(normal[i]))
        for li in poly.loop_indices:
            v=o.matrix_world @ o.data.vertices[o.data.loops[li].vertex_index].co
            a,b=(v.y,v.z) if axis==0 else ((v.x,v.z) if axis==1 else (v.x,v.y))
            layer[li].uv=(a/1.35+du,b/1.35+dv)
            color.data[li].color=(shade,shade,shade,1)
    return o

def mesh_object(name,verts,faces,mat,shade=None):
    mesh=bpy.data.meshes.new(name); mesh.from_pydata([pos(p) for p in verts],[],faces)
    bm=bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    # Open surface decals have no enclosed volume to establish outward orientation.
    if name.startswith('moss.') or name=='paving.fracture':
        bm.normal_update()
        for face in bm.faces:
            if face.normal.z<0: face.normal_flip()
    bm.to_mesh(mesh); bm.free()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o)
    return finish(o,mat,shade)

def box(name,p,sz,mat='wall',bevel=.025,turn=0,shade=None):
    mesh=bpy.data.meshes.new(name); bm=bmesh.new(); bmesh.ops.create_cube(bm,size=1)
    for v in bm.verts: v.co.x*=sz[0]; v.co.y*=sz[2]; v.co.z*=sz[1]
    if bevel: bmesh.ops.bevel(bm,geom=list(bm.edges),offset=min(bevel,min(sz)*.35),segments=1,affect='EDGES')
    bm.to_mesh(mesh); bm.free(); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o)
    o.matrix_world=Matrix.Translation(pos(p)) @ Matrix.Rotation(-turn,4,'Z')
    return finish(o,mat,shade)

def strand(name,pts,radius,mat='root'):
    curve=bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'; curve.resolution_u=4
    curve.bevel_depth=radius; curve.bevel_resolution=1
    s=curve.splines.new('BEZIER'); s.bezier_points.add(len(pts)-1)
    for i,(b,p) in enumerate(zip(s.bezier_points,pts)):
        b.co=pos(p); b.handle_left_type=b.handle_right_type='AUTO'; b.radius=max(.08,1-i/(len(pts)-.6))
    o=bpy.data.objects.new(name,curve); bpy.context.collection.objects.link(o)
    o.data.materials.append(mats[mat]); objects.append(o)
    return o

def flagstone(x0,x1,z0,z1):
    x0+=.012; x1-=.012; z0+=.012; z1-=.012
    c=[rng.uniform(.02,.09) for _ in range(8)]
    outline=[(x0+c[0],z0),(x1-c[1],z0),(x1,z0+c[2]),(x1,z1-c[3]),
             (x1-c[4],z1),(x0+c[5],z1),(x0,z1-c[6]),(x0,z0+c[7])]
    cx,cz=(x0+x1)/2,(z0+z1)/2; top=rng.uniform(.0005,.004)
    verts=[(x,-.04,z) for x,z in outline]+[(x,top-.014,z) for x,z in outline]
    verts += [(x+(cx-x)*.035,top,z+(cz-z)*.035) for x,z in outline]
    faces=[tuple(reversed(range(8))),tuple(range(16,24))]
    for ring in [0,8]: faces += [(ring+i,ring+(i+1)%8,ring+(i+1)%8+8,ring+i+8) for i in range(8)]
    mesh_object('paving.chipped',verts,faces,'floor')
    # Hairline fractures sit on the stone surface, not on a floating decal plane.
    if rng.random()<.28:
        start=(x0+.08,z0+.04); end=(x1-.08,z1-.04)
        pts=[start,(cx+rng.uniform(-.12,.12),cz-.06),(cx+.04,cz+.07),end]
        crack=[]
        for x,z in pts: crack.extend([(x-.003,top+.0001,z),(x+.003,top+.0001,z)])
        mesh_object('paving.fracture',crack,[(i,i+1,i+3,i+2) for i in range(0,6,2)],'earth',.32)

def arch(cx,cz,turn=0):
    def at(x,y,d): return (cx+math.cos(turn)*x+math.sin(turn)*d,y,cz-math.sin(turn)*x+math.cos(turn)*d)
    for side in [-1,1]:
        for k in range(5): box('arch.pier',at(side*.95,.18+k*.34,0),(.29,.325,.48),'trim',.03,turn)
        for y,w,h,d in [(.10,.43,.20,.50),(.25,.36,.10,.47),(1.67,.37,.10,.5),(1.76,.43,.09,.5)]:
            box('arch.moulding',at(side*.95,y,0),(w,h,d),'trim',.02,turn)
    for i in range(13):
        a=i*math.pi/13+.008; b=(i+1)*math.pi/13-.008
        verts=[at(r*math.cos(t),1.66+r*math.sin(t),d) for d in [-.24,.24] for r,t in [(.81,a),(1.10,a),(1.10,b),(.81,b)]]
        mesh_object('arch.voussoir',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'trim')
    box('niche.threshold',at(0,.065,0),(1.6,.13,.48),'trim',.02,turn)
    box('niche.tablet',at(0,1.14,-.32),(.6,.76,.07),'wall',.035,turn,.7)
    box('niche.tablet.inset',at(0,1.14,-.275),(.44,.59,.018),'iron',.006,turn,.6)
    for y in [.35,.44]: box('niche.shelf',at(0,y,-.08),(1.28,.08,.3),'trim',.02,turn)
