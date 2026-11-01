"""Export reusable metre-space pieces. No reference assets are rewritten."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from crypt_geometry import *

OUT=ROOT/'assets/art/environment/crypt-kit'; SOURCE=ROOT/'assets/crypt-kit'
OUT.mkdir(parents=True,exist_ok=True); SOURCE.mkdir(parents=True,exist_ok=True)
# Additional shared surfaces belong only to the modular kit, not the reference chamber.
for name,color in [('wood',(.25,.13,.055,1)),('cloth',(.22,.045,.035,1))]:
    m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True;mats[name]=m
modules={}

# Stone edges vary independently of layout. Every inset remains inside its module.
stone_rng=random.Random(57721)
plain_box=box
def box(name,p,sz,mat='wall',bevel=.025,turn=0,shade=None):
    if mat in ['wall','trim'] and bevel:
        bevel*=stone_rng.uniform(.7,1.65)
    o=plain_box(name,p,sz,mat,bevel,turn,shade)
    if mat in ['wall','trim'] and bevel:
        for v in o.data.vertices:
            for axis in range(3):
                # Erode corners rather than pushing stone beyond its footprint.
                v.co[axis]*=stone_rng.uniform(.976,1)
    if mat=='wood':
        # Grain follows the long axis of each individual timber, including uprights.
        long=max(range(3),key=lambda axis:sz[axis])
        for poly in o.data.polygons:
            normal=(poly.normal.x,poly.normal.z,poly.normal.y)
            face=max(range(3),key=lambda axis:abs(normal[axis]))
            along=long if face!=long else (long+1)%3
            across=3-face-along
            for li in poly.loop_indices:
                v=o.data.vertices[o.data.loops[li].vertex_index].co
                coords=(v.x,v.z,v.y)
                o.data.uv_layers.active.data[li].uv=(coords[across]*.9,coords[along]*.28)
    return o
def module(name,build):
    before=set(bpy.context.scene.objects); build()
    modules[name]=[o for o in bpy.context.scene.objects if o not in before]

def wall():
    box('core',(0,1.37,-.2),(1,2.74,.55),'wall',0,shade=.62)
    for k in range(8):
        for x,w in ([(-.25,.48),(.25,.48)] if k%2==0 else [(-.375,.23),(0,.48),(.375,.23)]):
            box('course',(x,.175+k*.34,.25),(w,.32,.3),'wall',.025)
    coping(1)
def coping(width):
    box('footing',(0,.065,0),(width,.13,.98),'trim',.018)
    box('sill',(0,.83,0),(width,.04,.98),'trim',.012)
    for i in range(round(width*2)):
        x=-width/2+.25+i*.5
        box('cap',(x,2.73,0),(.49,.09,.98),'trim',.022)
        box('crown',(x,2.807,0),(.48,.095,.97),'trim',.035)
def niche():
    box('back',(0,1.37,-.34),(3,2.74,.3),'wall',0,shade=.62)
    for k in range(8):
        for j in range(6):
            x=-1.25+j*.5; y=.175+k*.34
            if abs(x)<1.03 and y-.15<1.66+math.sqrt(max(0,.81**2-(max(0,abs(x)-.24))**2)):continue
            box('course',(x,y,.25),(.48,.32,.3),'wall',.025)
    arch(0,.25);coping(3)
    for j in range(9):
        size=rng.uniform(.10,.23)
        box('rubble',(rng.uniform(-.7,.7),.17+size*.25,.1),(size,.09+size*.3,size*.8),'wall',.025,rng.random())
def portal():
    for i in range(11):
        x0=-1.5+i*3/11+.006;x1=-1.5+(i+1)*3/11-.006
        def rise(x):return 2.51+.17*(1-(x/1.5)**2)
        v=[(x,y,z) for z in [-.45,.45] for x,y in [(x0,rise(x0)),(x1,rise(x1)),(x1,2.86),(x0,2.86)]]
        mesh_object('header',v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'trim')
def roots():
    for j in range(3):
        x=(j-1)*.15
        pts=[(x,2.77,.41),(x-.12,2.1,.44),(x+.14,1.4,.41),(x-.1,.6,.44),(x+.26,.10,.42)]
        strand('root',pts,.045+j*.006)
        for sign in [-1,1]:strand('branch',[pts[2],(x+sign*.3,.8,.43),(x+sign*.65,.08,.44)],.023)
def paving():
    for z in [-.5,0]:
        split=rng.uniform(-.13,.13)
        if rng.random()<.3:flagstone(-.5,.5,z,z+.5)
        else:
            flagstone(-.5,split,z,z+.5);flagstone(split,.5,z,z+.5)
    box('mortar',(0,-.055,0),(1,.015,1),'earth',0,shade=.7)
def scatter():
    for j in range(6):
        x,z=rng.uniform(-.45,.45),rng.uniform(-.45,.45)
        box('flake',(x,.006,z),(.055,.01,.035),'wall',.004,rng.random()*math.pi)
        ring=[(x+math.cos(i*math.tau/7)*rng.uniform(.02,.07),.005,z+math.sin(i*math.tau/7)*rng.uniform(.02,.07)) for i in range(7)]
        mesh_object('moss.patch',ring,[tuple(range(7))],'earth',.75)
def column():
    box('base',(0,.1,0),(.8,.2,.8),'trim',.03)
    box('plinth',(0,.26,0),(.68,.14,.68),'trim',.02)
    for i in range(6):box('shaft',(0,.5+i*.31,0),(.49,.29,.49),'trim',.018)
    box('capital',(0,2.39,0),(.64,.2,.64),'trim',.025)
    box('abacus',(0,2.58,0),(.8,.14,.8),'trim',.025)

def altar():
    box('altar.base',(0,.1,0),(2.35,.2,1.05),'trim',.025)
    box('altar.body',(0,.52,0),(1.95,.7,.82),'tomb',.035)
    box('altar.table',(0,.94,0),(2.4,.22,1.1),'trim',.03)
    for x in [-.65,0,.65]:
        box('altar.panel',(x,.53,.425),(.46,.45,.025),'trim',.012)
        box('altar.inset',(x,.53,.443),(.32,.32,.012),'tomb',.004)

def bench():
    for x in [-.6,.6]:box('leg',(x,.23,0),(.16,.46,.4),'wood',.012)
    box('stretcher',(0,.18,0),(1.32,.09,.10),'wood',.009)
    for z in [-.18,0,.18]:
        box('seat.plank',(0,.49,z),(1.7,.14,.17),'wood',.016)
        for x in [-.6,.6]:box('nail',(x,.562,z),(.025,.006,.025),'iron',.003)
    for x in [-.64,.64]:
        box('end.strap',(x,.44,0),(.065,.035,.53),'iron',.007)

def rack():
    for x in [-.78,.78]:box('post',(x,.93,0),(.13,1.86,.18),'wood',.012)
    for y in [.3,1.5]:box('rail',(0,y,0),(1.8,.13,.2),'wood',.01)
    for x in [-.5,0,.5]:
        box('blade',(x,1.05,.16),(.09,1.12,.045),'iron',.01,.08)
        box('guard',(x,.46,.16),(.32,.06,.08),'iron',.012)
        box('grip',(x,.31,.16),(.06,.23,.06),'wood',.008)
    for x in [-.78,.78]:box('foot',(x,.045,0),(.24,.09,.6),'wood',.015)
    for x in [-.78,.78]:
        box('finial',(x,1.865,0),(.18,.06,.23),'iron',.012)
        for y in [.28,1.50]:
            box('joint.strap',(x,y,.105),(.14,.22,.018),'iron',.005)
            for yy in [-.07,.07]:box('rivet',(x,y+yy,.118),(.026,.026,.015),'iron',.006)

def banner():
    box('rod',(0,2.45,.46),(1.35,.06,.06),'iron',.01)
    # A continuous folded sheet with a frayed hem, rather than separate rigid strips.
    columns,rows=24,14
    verts=[]
    for j in range(rows+1):
        for i in range(columns+1):
            x=-.59+1.18*i/columns
            hem=.07*math.sin(i*2.8)+(.15 if 10<=i<=13 else 0)
            y=2.36-(1.40-hem)*j/rows
            z=.455+.024*math.sin(i*.78)+.008*math.sin(j*.7+i*.5)
            verts.append((x,y,z))
    faces=[]
    for j in range(rows):
        for i in range(columns):
            a=j*(columns+1)+i;faces.append((a,a+1,a+columns+2,a+columns+1))
    o=mesh_object('cloth',verts,faces,'cloth',.9)
    for poly in o.data.polygons:poly.use_smooth=True
    # Worn embroidery follows the same shallow folds as the cloth.
    strand('sigil.stem',[(0,2.12,.49),(0,1.82,.49),(0,1.48,.49)],.018,'trim')
    strand('sigil.arm',[(-.22,1.94,.49),(0,1.94,.49),(.22,1.94,.49)],.017,'trim')

def cluster():
    for x,z,w,d,h in [(-.35,-.15,.9,.9,.48),(.42,.1,.7,1.1,.36),(-.15,.45,.7,.45,.25)]:
        box('fallen.stone',(x,h/2,z),(w,h,d),'wall',.08)
    for x in [-.5,-.1,.3]:strand('ground.root',[(x,.08,-.65),(x+.12,.48,-.1),(x+.2,.35,.3),(x+.1,.04,.65)],.045)

module('column',column);module('altar',altar);module('bench',bench);module('rack',rack);module('banner',banner);module('cluster',cluster)

def corner(sign):
    wall()
    for k in range(8):box('corner.pier',(sign*.4,.175+k*.34,.40),(.20,.33,.18),'trim',.008)
module('corner-left',lambda:corner(-1));module('corner-right',lambda:corner(1))
module('wall',wall);module('niche',niche);module('portal',portal);module('roots',roots);module('scatter',scatter)
for i in range(4):module('paving'+str(i),paving)

def paving_span(width,depth,broken=False):
    # Independently partition a larger footprint, so joints do not repeat every metre.
    box('mortar',(0,-.025,0),(width,.015,depth),'earth',0,shade=.48)
    if broken:
        # Irregular fracture network, not an ornamental X repeated in every slab.
        sites=[(rng.uniform(-width*.47,width*.47),rng.uniform(-depth*.47,depth*.47)) for _ in range(8 if width==2 else 5)]
        for sx,sz in sites:
            poly=[(-width/2,-depth/2),(width/2,-depth/2),(width/2,depth/2),(-width/2,depth/2)]
            for tx,tz in sites:
                if (tx,tz)==(sx,sz):continue
                nx,nz=tx-sx,tz-sz;limit=(tx*tx+tz*tz-sx*sx-sz*sz)/2
                clipped=[]
                for a,b in zip(poly,poly[1:]+poly[:1]):
                    da=a[0]*nx+a[1]*nz-limit;db=b[0]*nx+b[1]*nz-limit
                    if da<=0:clipped.append(a)
                    if (da<=0)!=(db<=0):
                        t=da/(da-db);clipped.append((a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])))
                poly=clipped
                if not poly:break
            if len(poly)<3:continue
            px=sum(v[0] for v in poly)/len(poly);pz=sum(v[1] for v in poly)/len(poly)
            poly=[(px+(x-px)*.976,pz+(z-pz)*.976) for x,z in poly]
            top=rng.uniform(-.009,.008);n=len(poly)
            verts=[(x,-.028,z) for x,z in poly]+[(x,top-.009,z) for x,z in poly]+[(px+(x-px)*.975,top,pz+(z-pz)*.975) for x,z in poly]
            faces=[tuple(reversed(range(n))),tuple(range(2*n,3*n))]
            for ring in [0,n]:faces += [(ring+i,ring+(i+1)%n,ring+(i+1)%n+n,ring+i+n) for i in range(n)]
            mesh_object('broken.slab',verts,faces,'floor',rng.uniform(.56,.95))

    else:
        rows=[-depth/2,depth/2] if depth==1 else [-depth/2,-.27,.36,depth/2]
        for z0,z1 in zip(rows,rows[1:]):
            cuts=[-width/2,width/2] if rng.random()<.5 else [-width/2,rng.uniform(-.3,.3),width/2]
            for x0,x1 in zip(cuts,cuts[1:]):
                before=set(bpy.context.scene.objects);flagstone(x0,x1,z0,z1)
                # Subtle offsets affect only appearance, never the shared flat floor.
                lift=rng.uniform(-.008,.004)
                for o in set(bpy.context.scene.objects)-before:o.location.z+=lift

def floor_roots():
    for j in range(2):
        pts=[(-.47,.004,-.35+j*.28),(-.2,.004,-.1+j*.2),(.1,.004,.06+j*.16),(.45,.004,.24+j*.14)]
        strand('floor.root',pts,.005)
        strand('floor.feeder',[pts[1],(-.04,.004,-.28),(.23,.004,-.44)],.003)

def wall_detail(kind):
    wall()
    if kind=='pier':
        for k in range(8):box('pilaster',(0,.18+k*.33,.445),(.32,.31,.10),'trim',.013)
        for y in [.14,2.57]:box('capital',(0,y,.445),(.48,.13,.10),'trim',.017)
    elif kind=='panel':
        box('tablet',(0,1.57,.445),(.66,1.14,.10),'trim',.025)
        box('inset',(0,1.57,.496),(.51,.95,.008),'wall',.002,shade=.52)
        for y in [1.25,1.57,1.89]:box('relief',(0,y,.496),(.27,.055,.008),'trim',.002)
    else:
        for k in range(5):
            x=(-.2 if k%2 else .12)
            box('patch',(x,.4+k*.4,.435),(.51,.23,.11),'wall',.027,shade=rng.uniform(.48,.72))
        for x in [-.29,.28]:box('iron.tie',(x,1.9,.497),(.055,.4,.006),'iron',.002)

module('floor-roots',floor_roots)
for name in ['pier','panel','repair']:module('wall-'+name,lambda name=name:wall_detail(name))
for name,w,d,broken in [('slabs-long',2,1,False),('slabs-large',2,2,False),('slabs-broken',2,2,True),('slabs-fractured',1,1,True)]:
    module(name,lambda w=w,d=d,broken=broken:paving_span(w,d,broken))

# Keep the current carved tomb exactly; translate its authored origin into kit space.
with bpy.data.libraries.load(str(ROOT/'assets/dungeon-reference/chamber.blend')) as (data,loaded):
    loaded.objects=[name for name in data.objects if name.startswith('sarcophagus.')]
modules['tomb']=[]
for o in loaded.objects:
    bpy.context.collection.objects.link(o);o.location.x-=12.8;o.location.y+=6.6
    modules['tomb'].append(o)
manifest={}
for name,group in modules.items():
    for o in group:
        if o.type=='CURVE':
            mat=o.data.materials[0].name.split('.')[0]
            bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
            bpy.ops.object.convert(target='MESH');o.data.materials.clear();finish(o,mat)
    buckets={mat:[o for o in group if o.data.materials[0].name.split('.')[0]==mat] for mat in mats}
    for mat,parts in buckets.items():
        if not parts:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in parts:o.select_set(True)
        bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=parts[0];o.name=name+'__'+mat
        o.data.materials.clear();o.data.materials.append(mats[mat])
        for polygon in o.data.polygons:polygon.material_index=0
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        manifest[o.name]={'triangles':sum(len(p.vertices)-2 for p in o.data.polygons)}
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'kit.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'kit.glb'),export_format='GLB',export_animations=False,export_yup=True)
from crypt_surfaces import build_surfaces
textures=build_surfaces(OUT)
(SOURCE/'manifest.json').write_text(json.dumps({'generator':'scripts/dungeon/build-kit.py','pieces':manifest,'textures':textures},indent=2)+'\n')
