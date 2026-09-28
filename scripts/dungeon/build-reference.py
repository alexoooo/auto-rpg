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

floor=set((x,z) for x in range(4,16) for z in range(5,14))
floor.update((x,z) for x in range(8,11) for z in list(range(2,5))+list(range(14,19)))
boundary=set((x+dx,z+dz) for x,z in floor for dx,dz in [(1,0),(-1,0),(0,1),(0,-1)] if (x+dx,z+dz) not in floor)

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

# The visual paving is independent of the gameplay cell grid.
for xmin,xmax,zmin,zmax in [(3.5,15.5,4.5,13.5),(7.5,10.5,1.5,4.5),(7.5,10.5,13.5,18.5)]:
    z=zmin
    while z<zmax-.01:
        endz=min(zmax,z+rng.uniform(.43,.69))
        if zmax-endz<.2: endz=zmax
        x=xmin
        while x<xmax-.01:
            endx=min(xmax,x+rng.uniform(.48,1.04))
            if xmax-endx<.20: endx=xmax
            flagstone(x,endx,z,endz); x=endx
        z=endz
    box('mortar.bed',((xmin+xmax)/2,-.055,(zmin+zmax)/2),(xmax-xmin,.015,zmax-zmin),'earth',0,shade=.7)

LEFT_NICHES=[6,9,12]
BACK_NICHES=[5,12,15]

def opening(t,y,centres):
    return any(abs(t-c)<.81 and y<1.66+math.sqrt(max(0,.81**2-(t-c)**2)) for c in centres)

# Cores are recessed 40 cm; main courses are actually absent behind each arch.
for x,z in sorted(boundary):
    left=x==3 and 5<=z<=13
    back=z==14 and (4<=x<=7 or 11<=x<=15)
    box('wall.recess.back' if left or back else 'wall.core',
        (2.79 if left else x,1.37,14.23 if back else z),
        (.38 if left else (.68 if any((x+dx,z) in floor for dx in [-1,1]) else .96),
         2.74,.38 if back else (.68 if any((x,z+dz) in floor for dz in [-1,1]) else .96)),
        'wall',0,shade=.62)
    for course in range(8):
        for dx,dz in [(1,0),(-1,0),(0,1),(0,-1)]:
            if (x+dx,z+dz) not in floor: continue
            for t,w in ([(-.25,.48),(.25,.48)] if course%2==0 else [(-.375,.23),(0,.48),(.375,.23)]):
                y=.175+course*.34
                if left and any(opening(z+t+q,y-.15,LEFT_NICHES) for q in [-w/2,0,w/2]): continue
                if back and any(opening(x+t+q,y-.15,BACK_NICHES) for q in [-w/2,0,w/2]): continue
                p=(x+dx*.27+(t if dz else 0),y,z+dz*.27+(t if dx else 0))
                box('masonry',p,(w,.32,.27) if dz else (.27,.32,w),'wall',rng.uniform(.02,.045))
    box('cutaway.sill',(x,.83,z),(.99,.04,.99),'trim',.012)
    box('coping.lower',(x,2.73,z),(.99,.09,.99),'trim',.016)
    box('coping.crown',(x,2.815,z),(.98,.08,.98),'trim',.024)

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

for z in LEFT_NICHES: arch(3.25,z,math.pi/2)
for x in BACK_NICHES: arch(x,13.75,math.pi)
# Shallow segmental arch ABOVE the unchanged three-metre working door clearance.
for x in [7.32,10.68]:
    for k in range(7): box('portal.pier',(x,.18+k*.35,14),(.30,.33,.90),'trim',.025)
    box('portal.capital',(x,2.47,14),(.34,.06,.94),'trim',.012)
for i in range(11):
    x0=7.5+i*3/11+.006; x1=7.5+(i+1)*3/11-.006
    def rise(x): return 2.51+.17*(1-((x-9)/1.5)**2)
    verts=[(x,y,z) for z in [13.55,14.45] for x,y in [(x0,rise(x0)),(x1,rise(x1)),(x1,2.86),(x0,2.86)]]
    mesh_object('portal.segment',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'trim')

# All tomb relief stays inside the established 2.5 x 1.15 x 1.1 collision box.
box('sarcophagus.base',(12.8,.09,6.6),(2.5,.18,1.15),'tomb',.04)
box('sarcophagus.plinth',(12.8,.23,6.6),(2.38,.10,1.04),'tomb',.025)
box('sarcophagus.body',(12.8,.57,6.6),(2.20,.60,.90),'tomb',.03)
box('sarcophagus.cornice',(12.8,.88,6.6),(2.39,.12,1.06),'tomb',.028)
box('sarcophagus.lid',(12.8,.975,6.6),(2.5,.07,1.15),'tomb',.02)
box('sarcophagus.lid.relief',(12.8,1.027,6.6),(2.17,.045,.85),'tomb',.015)
for side in [-1,1]:
    for x in [11.78,12.28,12.8,13.32,13.82]: box('sarcophagus.pilaster',(x,.57,6.6+side*.48),(.075,.55,.09),'tomb',.014)
    for x in [12.04,12.54,13.06,13.57]:
        box('sarcophagus.panel',(x,.57,6.6+side*.456),(.36,.37,.026),'tomb',.012,shade=.58)
        for sign in [-1,1]: strand('sarcophagus.carving',[(x-.14,.48,6.6+side*.48),(x,.57+sign*.09,6.6+side*.48),(x+.14,.65,6.6+side*.48)],.012,'tomb')
box('sarcophagus.sword',(12.8,1.0725,6.6),(1.42,.055,.075),'tomb',.017)
box('sarcophagus.guard',(12.36,1.07,6.6),(.065,.055,.36),'tomb',.012)
box('sarcophagus.pommel',(12.13,1.075,6.6),(.095,.05,.11),'tomb',.015)
for side in [-1,1]:
    strand('sarcophagus.laurel',[(12,1.066,6.6+side*.25),(12.8,1.066,6.6+side*.33),(13.58,1.066,6.6+side*.24)],.014,'tomb')
    for x in [12.15,12.4,12.65,12.9,13.15,13.4]: box('sarcophagus.leaf',(x,1.07,6.6+side*.27),(.15,.03,.06),'tomb',.014,side*.65)

# Four branching colonies following mortar joints; substantial debris stays in rock cells.
for side,centre in [('left',7.5),('left',10.5),('back',6.5),('back',13.5)]:
    def at(t,y,d): return (3.35+d,y,t) if side=='left' else (t,y,13.65-d)
    for j in range(3):
        t=centre+(j-1)*.11
        pts=[at(t,2.77,0),at(t-.12,2.1,.035),at(t+.14,1.40,.01),at(t-.1,.6,.045),at(t+.26,.12,.04)]
        strand('root.trunk',pts,.045+j*.009)
        for sign in [-1,1]:
            strand('root.branch',[pts[2],at(t+sign*.26,.80,.02),at(t+sign*.45,.23,.055),at(t+sign*.75,.07,.07)],.029)
            strand('root.feeder',[pts[1],at(t+sign*.26,1.55,.025),at(t+sign*.47,1.29,.03)],.016)
for x,z in sorted(boundary):
    nearleft=x==3 and 5<=z<=13; nearback=z==14 and (4<=x<=7 or 11<=x<=15)
    if not (nearleft or nearback): continue
    for j in range(rng.randrange(2,5)):
        size=rng.uniform(.075,.17); t=rng.uniform(-.36,.36)
        px,pz=(3.38-size*.55,z+t) if nearleft else (x+t,13.62+size*.55)
        # Niches have a 13 cm threshold: their rubble rests on it, not hidden underneath.
        box('fallen.stone',(px,.14+size*.40,pz),(size,size*.8,size*.85),'wall',.025,rng.random()*math.pi)
    for j in range(3):
        t=rng.uniform(-.42,.42); px,pz=(3.46,z+t) if nearleft else (x+t,13.54)
        box('moss.joint',(px,.065,pz),(.045,.03,.17) if nearleft else (.17,.03,.045),'earth',.01)

# Fragments of memorial tablets accumulated INSIDE the blind niches.
for side,centres in [('left',LEFT_NICHES),('back',BACK_NICHES)]:
    for centre in centres:
        for j in range(5):
            t=centre+rng.uniform(-.62,.62); size=rng.uniform(.12,.24)
            px,pz=(3.25,t) if side=='left' else (t,13.75)
            box('niche.rubble',(px,.18+size*.25,pz),(size,.09+size*.3,size*.75),'trim',.03,rng.uniform(-.4,.4))


# Flat surface scatter adds age without introducing unmodelled obstacles. Separate RNG
# preserves the established architecture and its material variation when this pass changes.
detail_rng=random.Random(314159)
def patch(name,x,y,z,rx,rz):
    ring=[]
    for i in range(9):
        a=i*math.tau/9; r=detail_rng.uniform(.65,1)
        ring.append((x+math.cos(a)*rx*r,y,z+math.sin(a)*rz*r))
    mesh_object(name,ring,[tuple(range(9))],'earth',detail_rng.uniform(.48,.84))
for j in range(160):
    left=j%2==0
    t=detail_rng.uniform(5,13) if left else detail_rng.choice([(4.2,7),(11.2,15)])[0]+detail_rng.random()*.7
    x,z=(detail_rng.uniform(3.52,4.05),t) if left else (t,detail_rng.uniform(13.05,13.48))
    if j%3==0:
        patch('moss.margin',x,.005,z,detail_rng.uniform(.035,.12),detail_rng.uniform(.045,.15))
    else:
        size=detail_rng.uniform(.025,.09)
        # Thin, loose flakes: under 12 mm above the floor, not solid rubble piles.
        box('stone.flake',(x,.006,z),(size,.010,size*.65),'wall',.004,detail_rng.random()*math.pi)
for x,z in sorted(boundary):
    if (x+z)%3: continue
    for j in range(3):
        patch('moss.coping',x+detail_rng.uniform(-.33,.33),2.856,z+detail_rng.uniform(-.33,.33),.12,.055)
# Accumulated dirt at the tomb foot, with a few broad stone flakes.
for j in range(36):
    x=detail_rng.uniform(11.5,14.1); z=detail_rng.choice([5.98,7.22])+detail_rng.uniform(-.08,.08)
    patch('moss.tomb.foot',x,.005,z,.10,.045)

# Seamless authored limestone: periodic multiscale noise and pores, baked to ordinary PNG maps.
N=1024
noise_rng=np.random.default_rng(271828)
def noise(size):
    grid=noise_rng.random((size,size)).astype(np.float32)
    coord=np.arange(N)*size/N; lo=coord.astype(int); f=coord-lo; f=f*f*(3-2*f)
    rows=grid[lo[:,None]%size,lo[None,:]%size]*(1-f[None,:])+grid[lo[:,None]%size,(lo[None,:]+1)%size]*f[None,:]
    nextrows=grid[(lo[:,None]+1)%size,lo[None,:]%size]*(1-f[None,:])+grid[(lo[:,None]+1)%size,(lo[None,:]+1)%size]*f[None,:]
    return rows*(1-f[:,None])+nextrows*f[:,None]
coarse=noise(7); medium=noise(29); fine=noise(113); grain=noise_rng.random((N,N))
pores=np.maximum(0,noise(193)-.76)*1.6
height=.45*coarse+.27*medium+.18*fine+.045*grain-pores
tone=np.clip(.48+.26*(coarse-.5)+.20*(medium-.5)+.14*(fine-.5)-pores*.5,.16,.72)
def save_map(name,rgb,data=False):
    rgba=np.ones((N,N,4),dtype=np.float32); rgba[:,:,:3]=rgb
    image=bpy.data.images.new(name,width=N,height=N,alpha=False)
    image.colorspace_settings.name='Non-Color' if data else 'sRGB'
    image.pixels.foreach_set(rgba.ravel()); image.filepath_raw=str(OUT/name); image.file_format='PNG'; image.save()
    bpy.data.images.remove(image)
save_map('stone-albedo.png',np.stack([tone*1.035,tone*1.015,tone*.975],axis=-1))
gx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*2.5
gy=(np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*2.5
normal=np.stack([-gx,-gy,np.ones_like(gx)],axis=-1); normal/=np.linalg.norm(normal,axis=-1)[:,:,None]
save_map('stone-normal.png',normal*.5+.5,True)
save_map('stone-orm.png',np.stack([np.clip(1-pores,.6,1),.72+.20*medium,np.zeros_like(tone)],axis=-1),True)

# Editable source keeps individual components. Runtime export batches per material.
source=SOURCE/'chamber.blend'; bpy.ops.wm.save_as_mainfile(filepath=str(source))
for o in list(objects):
    if o.type=='CURVE':
        mat=o.data.materials[0].name
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
        bpy.ops.object.convert(target='MESH'); o.data.materials.clear(); objects.remove(o); finish(o,mat)
for mat in mats:
    group=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0].name==mat]
    if not group: continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in group: o.select_set(True)
    bpy.context.view_layer.objects.active=group[0]; bpy.ops.object.join(); group[0].name='reference.'+mat
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'chamber.glb'),export_format='GLB',export_animations=False,export_yup=True)
manifest={'generator':'scripts/dungeon/build-reference.py','seed':271828,'units':'metres','source':'assets/dungeon-reference/chamber.blend',
          'materials':list(mats),'textures':[{'file':p.name,'provenance':'Authored periodic limestone noise; generator seed 271828','sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(OUT.glob('stone-*.png'))],
          'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH'),
          'recesses':{'left':LEFT_NICHES,'back':BACK_NICHES,'depthMetres':.40},'floorCrownMaxMetres':.004}
(SOURCE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
