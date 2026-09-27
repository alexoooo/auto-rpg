"""Rebuild the authored reference chamber; Blender --background --python this_file.
Metres, Y-up game coordinates. No external model dependencies. Textures are bound at runtime.
"""
import bpy, bmesh, math, random, json
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[2]
rng=random.Random(271828)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
mats={}
for name,color in [('wall',(.33,.31,.28,1)),('trim',(.43,.40,.34,1)),('floor',(.34,.33,.30,1)),('root',(.13,.09,.045,1)),('earth',(.12,.115,.08,1)),('iron',(.12,.14,.15,1)),('wet',(.16,.19,.19,1)),('tomb',(.4,.38,.32,1))]:
 m=bpy.data.materials.new(name);m.diffuse_color=color;mats[name]=m
objects=[]
def pos(p): return (p[0],-p[2],p[1])
def uv(o):
 if not o.data.uv_layers: o.data.uv_layers.new()
 layer=o.data.uv_layers.active.data
 for poly in o.data.polygons:
  axis=max(range(3),key=lambda i:abs(poly.normal[i]))
  for li in poly.loop_indices:
   v=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co
   layer[li].uv=(v.y/2,v.z/2) if axis==0 else ((v.x/2,v.z/2) if axis==1 else (v.x/2,v.y/2))
def box(name,p,sz,mat='wall',bevel=.025,turn=0):
 mesh=bpy.data.meshes.new(name);bm=bmesh.new();bmesh.ops.create_cube(bm,size=1)
 for v in bm.verts:v.co.x*=sz[0];v.co.y*=sz[2];v.co.z*=sz[1]
 if bevel:bmesh.ops.bevel(bm,geom=list(bm.edges),offset=bevel,segments=2,affect='EDGES')
 bm.to_mesh(mesh);bm.free();mesh.update()
 o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
 o.matrix_world=Matrix.Translation(pos(p))@Matrix.Rotation(-turn,4,'Z')
 uv(o);o.data.materials.append(mats[mat]);objects.append(o);return o

def root(name,pts,r):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=4;curve.bevel_depth=r;curve.bevel_resolution=2
 s=curve.splines.new('BEZIER');s.bezier_points.add(len(pts)-1)
 for i,(b,p) in enumerate(zip(s.bezier_points,pts)):
  b.co=pos(p);b.handle_left_type=b.handle_right_type='AUTO';b.radius=max(.12,1-i/len(pts))
 o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.data.materials.append(mats['root']);objects.append(o)
 return o
floor=set((x,z) for x in range(4,16) for z in range(5,14))
floor.update((x,z) for x in range(8,11) for z in list(range(2,5))+list(range(14,19)))
boundary=set((x+dx,z+dz) for x,z in floor for dx,dz in [(1,0),(-1,0),(0,1),(0,-1)] if (x+dx,z+dz) not in floor)
# Individual chipped flagstones, crowns only millimetres above the support plane.
for x,z in sorted(floor):
 for row in range(2):
  for col in range(2):
   box('flagstone', (x-.25+col*.5,-.018,z-.25+row*.5),(.485,.045,.485),'floor',.018)
# Mortar core and staggered block courses sit wholly within the gameplay wall bounds.
for x,z in sorted(boundary):
 box('wall.core',(x,1.38,z),(.68 if x==3 else .965,2.76,.68 if z==14 else .965),'wall',0)
 for course in range(8):
  for dx,dz in [(1,0),(-1,0),(0,1),(0,-1)]:
   if (x+dx,z+dz) not in floor: continue
   for t,w in ([(-.25,.48),(.25,.48)] if course%2==0 else [(-.375,.23),(0,.48),(.375,.23)]):
    inset=.29 if x==3 or z==14 else .41
    p=(x+dx*inset+(t if dz else 0),.175+course*.345,z+dz*inset+(t if dx else 0))
    sz=(w,.325,.17) if dz else (.17,.325,w)
    o=box('masonry',p,sz,'wall',.028+rng.random()*.01)
 box('cutaway.sill',(x,.83,z),(.99,.04,.99),'trim',.012)
 box('coping',(x,2.75,z),(.99,.1,.99),'trim',.025)
def arch(cx,cz,turn=0):
 # Shallow blind arch on the wall face, recessed panel behind, contained in its rock cell.
 def at(x,y,d):return(cx+math.cos(turn)*x+math.sin(turn)*d,y,cz-math.sin(turn)*x+math.cos(turn)*d)
 for side in [-1,1]:
  for k in range(5):box('arch.pier',at(side*.94,.18+k*.34,0),(.23,.325,.25),'trim',.024,turn)
  box('arch.base',at(side*.94,.13,.015),(.38,.26,.34),'trim',.028,turn)
  box('arch.capital',at(side*.94,1.72,.015),(.36,.18,.32),'trim',.022,turn)
 # Wedge voussoirs, semicircular ring rises to the wall coping.
 for i in range(13):
  a=i*math.pi/13+.012;b=(i+1)*math.pi/13-.012
  verts=[pos(at(r*math.cos(t),1.68+r*math.sin(t),d)) for d in [-.11,.11] for r,t in [(.82,a),(1.08,a),(1.08,b),(.82,b)]]
  mesh=bpy.data.meshes.new('voussoir');mesh.from_pydata(verts,[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]);mesh.update()
  o=bpy.data.objects.new('arch.voussoir',mesh);bpy.context.collection.objects.link(o);o.data.materials.append(mats['trim']);objects.append(o);uv(o)
for z in [6,9,12]:arch(3.31,z,math.pi/2)
for x in [5,12,15]:arch(x,13.69,0)
# Door portal (three-metre opening): piers stay outside the opening.
for x in [7.35,10.65]:
 for k in range(7):box('portal.pier',(x,.19+k*.36,14),(.25,.34,.75),'trim',.025)
# Sarcophagus collision is exactly the bounds below, including its bevelled base and lid.
box('sarcophagus.base',(12.8,.12,6.6),(2.5,.24,1.15),'tomb',.045)
box('sarcophagus.body',(12.8,.60,6.6),(2.34,.72,1.0),'tomb',.035)
box('sarcophagus.lid',(12.8,1.01,6.6),(2.5,.18,1.15),'tomb',.045)
for x in [11.75,12.28,12.81,13.34,13.85]:
 box('sarcophagus.flute',(x,.59,6.08),(.09,.62,.045),'tomb',.015)
box('sarcophagus.cross',(12.8,1.095,6.6),(1.5,.01,.10),'iron',.003)
box('sarcophagus.cross',(12.8,1.095,6.6),(.10,.01,.65),'iron',.003)
# Roots and 3D debris are confined to rock cells, not scattered into walkable space.
for i in range(18):
 z=rng.uniform(5,13);x=3.47+rng.uniform(-.025,.01)
 pts=[(x,2.73,z),(x+.08,2,z+.13),(x-.02,1.15,z-.12),(x+.10,.22,z+.2),(x+.08,.05,z+.5)]
 root('wall.root',pts,rng.uniform(.025,.06))
 for j in range(2):root('root.branch',[pts[2],(x-.06,.7,z-.3-j*.18),(x+.1,.04,z-.5-j*.2)],.018)
for i in range(95):
 x,z=rng.choice(sorted(boundary));px=x+rng.uniform(-.32,.32);pz=z+rng.uniform(-.32,.32)
 box('fallen.chip',(px,.06,pz),(rng.uniform(.08,.22),.12,rng.uniform(.09,.22)),'wall',.025,rng.random()*math.pi)
# Surface wetness geometry stays under 4 mm and owns no obstacle.
for cx,cz,r in [(6,6,1),(7.2,6.8,.7),(10.8,11.7,.8),(5,11,.5)]:
 verts=[pos((cx,.006,cz))]+[pos((cx+math.cos(i*math.tau/24)*r*rng.uniform(.7,1),.006,cz+math.sin(i*math.tau/24)*r*.55*rng.uniform(.7,1))) for i in range(24)]
 mesh=bpy.data.meshes.new('puddle');mesh.from_pydata(verts,[],[(0,(i+1)%24+1,i+1) for i in range(24)]);mesh.update()
 o=bpy.data.objects.new('puddle',mesh);bpy.context.collection.objects.link(o);o.data.materials.append(mats['wet']);objects.append(o);uv(o)
# Keep the editable source unmerged. Export a small number of static material batches.
(ROOT/'assets/dungeon-reference').mkdir(parents=True,exist_ok=True)
(ROOT/'public/assets/dungeon-reference').mkdir(parents=True,exist_ok=True)
source=ROOT/'assets/dungeon-reference/chamber.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source))
for o in list(objects):
 if o.type=='CURVE':
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');uv(o)
for mat in mats:
 group=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0].name==mat]
 if not group:continue
 bpy.ops.object.select_all(action='DESELECT')
 for o in group:o.select_set(True)
 bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();group[0].name='reference.'+mat
out=ROOT/'public/assets/dungeon-reference/chamber.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_animations=False,export_yup=True)
manifest={'generator':'scripts/dungeon/build-reference.py','seed':271828,'units':'metres','source':'assets/dungeon-reference/chamber.blend','materials':list(mats),'textures':'Existing CC0 textures registered in src/textures.json','triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')}
(ROOT/'assets/dungeon-reference/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
