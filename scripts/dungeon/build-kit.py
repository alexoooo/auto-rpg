"""Export reusable metre-space pieces. No reference assets are rewritten."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from crypt_geometry import *

OUT=ROOT/'public/assets/crypt-kit'; SOURCE=ROOT/'assets/crypt-kit'
OUT.mkdir(parents=True,exist_ok=True); SOURCE.mkdir(parents=True,exist_ok=True)
# Additional shared surfaces belong only to the modular kit, not the reference chamber.
for name,color in [('wood',(.25,.13,.055,1)),('cloth',(.22,.045,.035,1))]:
    m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True;mats[name]=m
modules={}
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
    box('cap',(0,2.73,0),(width,.09,.98),'trim',.016)
    box('crown',(0,2.815,0),(width-.02,.08,.98),'trim',.024)
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
    box('seat',(0,.49,0),(1.7,.14,.55),'wood',.02)
    box('broken.back',(-.3,.6,-.19),(1.1,.1,.11),'wood',.01)

def rack():
    for x in [-.78,.78]:box('post',(x,.93,0),(.13,1.86,.18),'wood',.012)
    for y in [.3,1.5]:box('rail',(0,y,0),(1.8,.13,.2),'wood',.01)
    for x in [-.5,0,.5]:
        box('blade',(x,1.05,.16),(.09,1.12,.045),'iron',.01,.08)
        box('guard',(x,.46,.16),(.32,.06,.08),'iron',.012)
        box('grip',(x,.31,.16),(.06,.23,.06),'wood',.008)
    for x in [-.78,.78]:box('foot',(x,.045,0),(.24,.09,.6),'wood',.015)

def banner():
    box('rod',(0,2.45,.46),(1.35,.06,.06),'iron',.01)
    # Thick, folded cloth with a split hem; it stays inside the supporting rock cell.
    for i in range(6):
        x=-.5+i*.2;h=1.4-(.17 if i in [2,3] else 0)
        box('cloth',(x,2.36-h/2,.46+math.sin(i*1.6)*.015),(.205,h,.035),'cloth',.008)
    box('sigil.vertical',(0,1.83,.49),(.07,.55,.014),'trim',.006)
    box('sigil.cross',(0,1.92,.49),(.4,.06,.014),'trim',.006)

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
(SOURCE/'manifest.json').write_text(json.dumps({'generator':'scripts/dungeon/build-kit.py','pieces':manifest},indent=2)+'\n')
