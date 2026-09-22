"""Run with Blender --background --disable-autoexec Knight.blend --python this.py -- bind.json output.glb.
CC0 source: crownjoshua, https://opengameart.org/content/knight-rigged-mid-poly
Exports a standard skinned GLB with semantic physics bindings in extras. No imported scripts run.
"""
import bpy, json, math, struct, sys, hashlib
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

args = sys.argv[sys.argv.index('--') + 1:]
bind = json.loads(Path(args[0]).read_text())
output = Path(args[1]); output.parent.mkdir(parents=True, exist_ok=True)
rig = bpy.data.objects['rig']; rig.data.pose_position = 'REST'
bpy.context.view_layer.update()
rows = {r['slot']+'.'+r['id']: r for r in bind}
source = {}

def bone(name): return rig.data.bones[name]
def segment(key, first, last=None):
    a = rig.matrix_world @ bone(first).head_local
    b = rig.matrix_world @ bone(last or first).tail_local
    up = (a-b).normalized()
    forward = Vector((0,1,0)); forward -= up * forward.dot(up); forward.normalize()
    right = up.cross(forward).normalized()
    basis = Matrix((right,up,forward)).transposed()
    source[key] = ((a+b)*.5, basis, (a-b).length)

segment('locomotion.pelvis','DEF-spine')
segment('torso.core','DEF-spine.001','DEF-spine.003')
segment('head.neck','DEF-spine.004','DEF-spine.005')
segment('head.head','DEF-spine.006')
for s, slot, leg in [('L','primary','R'),('R','secondary','L')]:
    segment(slot+'.upper','DEF-upper_arm.'+s,'DEF-upper_arm.'+s+'.001')
    segment(slot+'.fore','DEF-forearm.'+s,'DEF-forearm.'+s+'.001')
    segment(slot+'.hand','DEF-hand.'+s)
    segment('locomotion.thigh'+leg,'DEF-thigh.'+s,'DEF-thigh.'+s+'.001')
    segment('locomotion.shin'+leg,'DEF-shin.'+s,'DEF-shin.'+s+'.001')
    # A boot's physical local Y is upright rather than along the foot bone.
    a=rig.matrix_world @ bone('DEF-foot.'+s).head_local
    b=rig.matrix_world @ bone('DEF-toe.'+s).tail_local
    source['locomotion.foot'+leg]=((a+b)*.5,Matrix(((-1,0,0),(0,0,1),(0,1,0))).transposed(),.24/.43)

keys=list(source)
def region(name):
    if not name.startswith('DEF-'): return None
    suffix = 'L' if '.L' in name else 'R'
    slot = 'primary' if suffix=='L' else 'secondary'
    leg = 'R' if suffix=='L' else 'L'
    if any(t in name for t in ['finger','f_','thumb','palm','hand']): return slot+'.hand'
    if 'upper_arm' in name or 'shoulder' in name: return slot+'.upper'
    if 'forearm' in name: return slot+'.fore'
    if 'thigh' in name: return 'locomotion.thigh'+leg
    if 'shin' in name: return 'locomotion.shin'+leg
    if 'foot' in name or 'toe' in name: return 'locomotion.foot'+leg
    if 'pelvis' in name or name=='DEF-spine': return 'locomotion.pelvis'
    if name in ['DEF-spine.001','DEF-spine.002','DEF-spine.003'] or 'breast' in name: return 'torso.core'
    if name in ['DEF-spine.004','DEF-spine.005']: return 'head.neck'
    return 'head.head'

def target_matrix(key):
    r=rows[key]; q=r['rotation']
    return Matrix.LocRotScale(Vector(r['position']),Quaternion((q[3],q[0],q[1],q[2])),Vector((1,1,1)))

def convert(v,key):
    centre,basis,length=source[key]; r=rows[key]
    p=basis.transposed() @ (v-centre)
    scale=.43
    # Match longitudinal anatomy; transverse dimensions retain realistic source proportions.
    along=r['size'][1]/length
    if key.endswith('core'): along=.46/length
    if '.foot' in key: along=.43
    p=Vector((p.x*scale,p.y*along,p.z*scale))
    # Curl the distal fingers around the fixed grip; there is no runtime inventory pose.
    if key.endswith(".hand") and p.y < -.025:
        theta=min(2.6,(-p.y-.025)/.055*1.8)
        p.y=-.025-.024*math.sin(theta); p.z+=.024*(1-math.cos(theta)); p.x*=.8
    return target_matrix(key) @ p

# Each slot is a separate mesh. Skin weights never cross a severable module seam.
buckets={}
keep={'Man','Belt','BreastPlate','cuisse','Gauntlets','Helmet','Shoes','Shoulder-Plate'}
for obj in list(bpy.data.objects):
    if obj.name not in keep: continue
    for mod in obj.modifiers:
        if mod.type=='ARMATURE': mod.show_viewport=False
    deps=bpy.context.evaluated_depsgraph_get(); evaluated=obj.evaluated_get(deps)
    mesh=evaluated.to_mesh(); mesh.calc_loop_triangles()
    defaults={'Belt':'locomotion.pelvis','BreastPlate':'torso.core','Helmet':'head.head'}
    weights=[]; points=[]
    for v in mesh.vertices:
        sums={}
        for g in v.groups:
            if g.group >= len(obj.vertex_groups): continue
            key=region(obj.vertex_groups[g.group].name)
            if key in source: sums[key]=sums.get(key,0)+g.weight
        if not sums: sums={defaults.get(obj.name,'torso.core'):1}
        pairs=sorted(sums.items(),key=lambda p:-p[1])[:4]
        total=sum(w for _,w in pairs); pairs=[(k,w/total) for k,w in pairs]
        weights.append(pairs); points.append(obj.matrix_world @ v.co)
    for tri in mesh.loop_triangles:
        combined={}
        for vi in tri.vertices:
            for k,w in weights[vi]: combined[k.split('.')[0]]=combined.get(k.split('.')[0],0)+w
        slot=max(combined,key=combined.get)
        mat=mesh.materials[tri.material_index].name if tri.material_index < len(mesh.materials) and mesh.materials[tri.material_index] else 'Steel'
        # Hide the source's exposed face behind the helmet; retain neck/cloth and gauntlets.
        if obj.name=='Man' and slot=='head': mat='Mail coif'
        group=buckets.setdefault((slot,mat),dict(positions=[],joints=[],weights=[],indices=[]))
        for vi in tri.vertices:
            pairs=[(k,w) for k,w in weights[vi] if k.split('.')[0]==slot]
            if not pairs:
                nearest=min((k for k in keys if k.startswith(slot+'.')),key=lambda k:(source[k][0]-points[vi]).length)
                pairs=[(nearest,1)]
            total=sum(w for _,w in pairs); pairs=[(k,w/total) for k,w in pairs]
            p=sum((convert(points[vi],k)*w for k,w in pairs),Vector())
            group['positions'].extend([p.x,p.y,-p.z]) # glTF right-handed
            group['joints'].extend([keys.index(k) for k,w in pairs]+[0]*(4-len(pairs)))
            group['weights'].extend([w for k,w in pairs]+[0]*(4-len(pairs)))
        n=len(group['positions'])//3
        group['indices'].extend([n-3,n-1,n-2])
    evaluated.to_mesh_clear()

data=bytearray(); views=[]; accessors=[]
def accessor(values,kind,components,ctype=5126):
    while len(data)%4: data.append(0)
    fmt={5126:'f',5123:'H',5125:'I'}[ctype]; start=len(data)
    data.extend(struct.pack('<'+fmt*len(values),*values)); views.append(dict(buffer=0,byteOffset=start,byteLength=len(data)-start))
    a=dict(bufferView=len(views)-1,componentType=ctype,count=len(values)//components,type=kind)
    if kind=='VEC3': a.update(min=[min(values[i::3]) for i in range(3)],max=[max(values[i::3]) for i in range(3)])
    accessors.append(a); return len(accessors)-1

materials=[]; material_ids={}; meshes=[]; nodes=[]
for key in keys:
    r=rows[key]; x,y,z,w=r['rotation']
    nodes.append(dict(name=key,translation=[r['position'][0],r['position'][1],-r['position'][2]],rotation=[-x,-y,z,w]))
inverse=[]; reflect=Matrix.Diagonal((1,1,-1,1))
for key in keys:
    m=(reflect @ target_matrix(key) @ reflect).inverted()
    inverse.extend([m[r][c] for c in range(4) for r in range(4)])
skin=dict(joints=list(range(len(keys))),inverseBindMatrices=accessor(inverse,'MAT4',16))
for (slot,mat),g in buckets.items():
    if mat not in material_ids:
        lower=mat.lower(); gold='gold' in lower; dark='black' in lower or 'body' in lower or 'coif' in lower; cloth='body' in lower or 'throat' in lower
        colour=[.43,.24,.07,1] if gold else [.045,.055,.065,1] if dark else [.46,.5,.54,1]
        material_ids[mat]=len(materials)
        materials.append(dict(name=mat,pbrMetallicRoughness=dict(baseColorFactor=colour,metallicFactor=0 if cloth else .85,roughnessFactor=.8 if dark else .34),doubleSided=True))
    primitives=[dict(attributes=dict(POSITION=accessor(g['positions'],'VEC3',3),JOINTS_0=accessor(g['joints'],'VEC4',4,5123),WEIGHTS_0=accessor(g['weights'],'VEC4',4)),indices=accessor(g['indices'],'SCALAR',1,5125),material=material_ids[mat])]
    meshes.append(dict(name=slot+'.'+mat,primitives=primitives,extras=dict(slot=slot)))
    nodes.append(dict(name=slot+'.'+mat,mesh=len(meshes)-1,skin=0))
doc=dict(asset=dict(version='2.0',generator='auto-rpg humanoid asset compiler'),buffers=[dict(byteLength=len(data))],bufferViews=views,accessors=accessors,
    materials=materials,meshes=meshes,nodes=nodes,skins=[skin],scenes=[dict(nodes=list(range(len(nodes))))],scene=0,
    extras=dict(physicsBindings=[dict(key=k,**rows[k]) for k in keys],source='https://opengameart.org/content/knight-rigged-mid-poly',license='CC0',author='crownjoshua'))
encoded=json.dumps(doc,separators=(',',':')).encode(); encoded+=b' '*((-len(encoded))%4); data+=bytes((-len(data))%4)
output.write_bytes(struct.pack('<III',0x46546c67,2,28+len(encoded)+len(data))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(data),0x004e4942)+data)
print('EXPORTED',output,len(data),'bytes',len(meshes),'meshes',len(keys),'bones')
