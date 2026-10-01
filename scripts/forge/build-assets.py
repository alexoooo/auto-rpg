"""Blender 4.5 LTS: --background --python scripts/forge/build-assets.py

The Forge's kit (public/assets/forge/forge-kit.glb) and its textures, generated deterministically.
Babylon (x,y,z) -> Blender (x,z,y); the glTF importer restores left handedness.
Procedural textures are baked to ordinary images, never exported as Blender shader nodes.
"""
import bpy, bmesh, math, random
from pathlib import Path
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/forge'
OUT.mkdir(parents=True, exist_ok=True)
random.seed(713)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for data in list(bpy.data.materials): bpy.data.materials.remove(data)

def save_image(name, rgb, data=False):
    h, w = rgb.shape[:2]
    image = bpy.data.images.new(name, width=w, height=h, alpha=False)
    if data: image.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(rgb, 0, 1)
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = str(OUT / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    bpy.data.images.remove(image)

def noise(n, cells, seed):
    rng = np.random.default_rng(seed)
    grid = rng.random((cells, cells)).astype(np.float32)
    t = np.arange(n, dtype=np.float32) * cells / n
    i = np.floor(t).astype(int)
    f = t - i
    f = f*f*(3-2*f)
    a = grid[i[:,None] % cells, i[None,:] % cells]
    b = grid[i[:,None] % cells, (i[None,:]+1) % cells]
    c = grid[(i[:,None]+1) % cells, i[None,:] % cells]
    d = grid[(i[:,None]+1) % cells, (i[None,:]+1) % cells]
    return (a*(1-f[None,:])+b*f[None,:])*(1-f[:,None]) + (c*(1-f[None,:])+d*f[None,:])*f[:,None]

def textures():
    n = 2048
    broad, medium, grain = noise(n, 5, 1), noise(n, 36, 2), noise(n, 240, 3)
    fine = noise(n, 650, 4)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32) / n
    veins = np.exp(-np.abs(np.sin(xx*math.tau*3 + broad*9 + yy*math.tau*2))*60)
    value = .60 + (broad-.5)*.20 + (medium-.5)*.10 + (grain-.5)*.055 - veins*.13
    rgb = np.stack([value*1.035, value, value*.93], axis=-1)
    save_image('stone-color', rgb)
    height = medium*.22 + grain*.11 + fine*.028 - veins*.15
    dx = (np.roll(height, -1, 1)-np.roll(height, 1, 1))*2.0
    dy = (np.roll(height, -1, 0)-np.roll(height, 1, 0))*2.0
    normals = np.stack([-dx, -dy, np.ones_like(dx)], axis=-1)
    normals /= np.linalg.norm(normals, axis=-1)[:,:,None]
    save_image('stone-normal', normals*.5+.5)
    save_image('stone-orm', np.stack([1-veins*.20, .78+medium*.16, np.zeros_like(value)], axis=-1))
    metal = .72+(broad-.5)*.14+(grain-.5)*.06
    save_image('bronze-color', np.stack([metal,metal*.79,metal*.48], axis=-1))
    save_image('bronze-orm', np.stack([np.ones_like(value), .25+medium*.24, np.ones_like(value)], axis=-1))

textures()

def refined_textures():
    n=2048
    yy,xx=np.mgrid[0:n,0:n].astype(np.float32)/n
    # Periodic jittered mineral cells: angular boundaries, with interrupted fine fractures.
    cells=19; rng=np.random.default_rng(821)
    points=rng.uniform(.12,.88,(cells,cells,2)).astype(np.float32)
    shades=rng.uniform(-1,1,(cells,cells)).astype(np.float32)
    x=xx*cells;y=yy*cells;ix=x.astype(int);iy=y.astype(int)
    first=np.full((n,n),100,dtype=np.float32);second=first.copy();mineral=np.zeros_like(first)
    for oy in [-1,0,1]:
        for ox in [-1,0,1]:
            px=(ix+ox)%cells;py=(iy+oy)%cells
            dist=(ix+ox+points[py,px,0]-x)**2+(iy+oy+points[py,px,1]-y)**2
            closer=dist<first
            second=np.minimum(second,np.where(closer,first,dist))
            mineral=np.where(closer,shades[py,px],mineral);first=np.minimum(first,dist)
    edge=second-first
    medium=noise(n,48,26);grain=noise(n,350,27);fine=noise(n,850,28)
    cracks=np.exp(-edge*105)*np.clip((noise(n,7,29)-.25)*2.5,0,1)
    pores=np.clip((.27-fine)*4,0,.4)
    value=.59+mineral*.016+(medium-.5)*.05+(grain-.5)*.035-cracks*.12-pores*.055
    height=mineral*.002+medium*.016+grain*.013-cracks*.055-pores*.018
    dx=(np.roll(height,-1,1)-np.roll(height,1,1))*4
    dy=(np.roll(height,-1,0)-np.roll(height,1,0))*4
    normal=np.stack([-dx,-dy,np.ones_like(dx)],axis=-1)
    normal/=np.linalg.norm(normal,axis=-1)[:,:,None]
    save_image('carved-normal',normal*.5+.5,True)
    save_image('carved-orm',np.stack([1-cracks*.22,.64+medium*.19+cracks*.12,np.zeros_like(value)],axis=-1),True)

refined_textures()

def mat(name, color, metallic=0, rough=.8):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = rough
    return m

MATS = {'functionalMetal':mat('bronze',(.55,.31,.10),1,.32), 'basalt':mat('basalt',(.12,.14,.17)),
        'banner':mat('banner',(.23,.025,.018))}

def finish(obj, material, bevel, segments=3, uv_offset=(0,0)):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    bmesh.ops.dissolve_limit(bm, angle_limit=.001, verts=list(bm.verts), edges=list(bm.edges))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data); bm.free()
    if bevel:
        mod = obj.modifiers.new('Hand-dressed edges', 'BEVEL')
        mod.width = bevel; mod.segments = segments; mod.affect = 'EDGES'
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # Box projection in metres, preserving detail scale across differently sized parts.
    uv = obj.data.uv_layers.new(name='Surface metres')
    for poly in obj.data.polygons:
        normal = poly.normal
        dominant = max(range(3), key=lambda a:abs(normal[a]))
        axes = [a for a in range(3) if a != dominant]
        for li in poly.loop_indices:
            p = obj.data.vertices[obj.data.loops[li].vertex_index].co
            uv.data[li].uv = (p[axes[0]]*1.8+uv_offset[0], p[axes[1]]*1.8+uv_offset[1])
        poly.use_smooth = True
    mod = obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL'); mod.keep_sharp=True; mod.weight=50
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.clear(); obj.data.materials.append(material)
    obj.select_set(False)
    return obj

def box(name, size, material, bevel=.04):
    bpy.ops.mesh.primitive_cube_add()
    o=bpy.context.object; o.name=name
    o.dimensions=(size[0],size[2],size[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.select_set(False)
    return finish(o,material,bevel)

kit=[]
# A Voronoi pavement: irregular fitted slabs, rather than repeated square tiles.
seeds={(x,y):Vector((x+random.uniform(-.27,.27),y+random.uniform(-.27,.27)))
       for y in range(-6,7) for x in range(-6,7)}
floor_pieces=[]; crack_vertices=[]; crack_faces=[]
for (gx,gy),centre in seeds.items():
    poly=[Vector((-6.6,-6.6)),Vector((6.6,-6.6)),Vector((6.6,6.6)),Vector((-6.6,6.6))]
    for (nx,ny),other in seeds.items():
        if (nx==gx and ny==gy) or abs(nx-gx)>2 or abs(ny-gy)>2:continue
        normal=other-centre; midway=(other+centre)*.5; new=[]
        for i,a in enumerate(poly):
            b=poly[(i+1)%len(poly)];da=(a-midway).dot(normal);db=(b-midway).dot(normal)
            if da<=0:new.append(a)
            if (da<0)!=(db<0):new.append(a+(b-a)*(da/(da-db)))
        poly=new
    # Recessed glowing fragments follow selected joints; no straight grid lines.
    if (gx*7+gy*11)%7==0:
        for a,b in zip(poly,poly[1:]+poly[:1]):
            d=(b-a).normalized();n=Vector((-d.y,d.x))*.016;idx=len(crack_vertices)
            crack_vertices.extend([(p.x,p.y,-.006) for p in [a+n,b+n,b-n,a-n]])
            crack_faces.append((idx,idx+1,idx+2,idx+3))
    poly=[centre+(v-centre)*.971 for v in poly]
    count=len(poly);v=[(p.x,p.y,z) for z in [-.15,.001] for p in poly]
    f=[tuple(range(count-1,-1,-1)),tuple(range(count,count*2))]
    f += [(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
    mesh=bpy.data.meshes.new('cut basalt');mesh.from_pydata(v,[],f);mesh.update()
    o=bpy.data.objects.new('slab',mesh);bpy.context.collection.objects.link(o)
    floor_pieces.append(finish(o,MATS['basalt'],.016))
bpy.ops.object.select_all(action='DESELECT')
for o in floor_pieces:o.select_set(True)
bpy.context.view_layer.objects.active=floor_pieces[0];bpy.ops.object.join()
o=bpy.context.object;o.name='pavement';o.select_set(False);kit.append(o)
mesh=bpy.data.meshes.new('molten joints');mesh.from_pydata(crack_vertices,[],crack_faces);mesh.update()
o=bpy.data.objects.new('fissures',mesh);bpy.context.collection.objects.link(o)
kit.append(finish(o,MATS['functionalMetal'],0))
for i in range(5):
    o=box('slab_'+str(i),(1,.17,1),MATS['basalt'],.045)
    for v in o.data.vertices:
        if abs(v.co.x)>.38 or abs(v.co.y)>.38:
            v.co.x += random.uniform(-.018,.018); v.co.y += random.uniform(-.018,.018)
    kit.append(o)
kit.append(box('masonry',(1,.48,.55),MATS['basalt'],.025))
# Large angular basalt outcrops frame the court behind the masonry.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1)
o=bpy.context.object;o.name='outcrop'
for v in o.data.vertices:
    v.co *= random.uniform(.78,1.05)
o.dimensions=(1.8,1.5,3.4);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
o.select_set(False);kit.append(finish(o,MATS['basalt'],.018))
kit.append(box('coping',(1.06,.16,.66),MATS['basalt'],.035))
kit.append(box('plinth',(.62,.20,.62),MATS['basalt'],.035))
# An octagonal fluted pillar and its bronze bowl are reusable, independent assets.
bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.23,depth=1.2)
o=bpy.context.object;o.name='column';o.select_set(False);kit.append(finish(o,MATS['basalt'],.025))
bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=.19,radius2=.36,depth=.24)
o=bpy.context.object;o.name='brazier';o.select_set(False)
bm=bmesh.new();bm.from_mesh(o.data)
bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.normal.z>.9],context='FACES')
bm.to_mesh(o.data);bm.free()
bpy.context.view_layer.objects.active=o
mod=o.modifiers.new('Cast bowl wall','SOLIDIFY');mod.thickness=.025
bpy.ops.object.modifier_apply(modifier=mod.name)
kit.append(finish(o,MATS['functionalMetal'],.012))
# Cloth with a torn lower hem and a shallow hanging fold; not a flat opaque rectangle.
verts=[];faces=[]
for j in range(13):
    for i in range(9):
        x=(i/8-.5)*.8; y=(.5-j/12)*2
        if j==12: y += abs(x)*.45 + .04*math.sin(i*3.5)
        z=.035*math.cos(i/8*math.tau*2)+.045*math.sin(j/12*math.pi)
        verts.append((x,z,y))
for j in range(12):
    for i in range(8):
        a=j*9+i;faces.append((a,a+1,a+10,a+9))
m=bpy.data.meshes.new('cloth');m.from_pydata(verts,[],faces);m.update()
o=bpy.data.objects.new('banner',m);bpy.context.collection.objects.link(o)
kit.append(finish(o,MATS['banner'],0))

def export(objects,filename):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/filename),export_format='GLB',use_selection=True,
        export_apply=True,export_yup=True,export_normals=True,export_texcoords=True,export_materials='EXPORT',
        export_vertex_color='ACTIVE')
    for o in objects:o.select_set(False)
export(kit,'forge-kit.glb')
# Editable source arranged as an asset shelf; GLBs above keep each template at its local origin.
for i,o in enumerate(kit):o.location=((i%10)*1.5,(i//10)*1.8,0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/forge/forge.blend'))
print('Forge kit exported:',len(kit),'templates')
