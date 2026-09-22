"""Run with Blender --background --disable-autoexec Knight.blend --python this.py -- bind.json output.glb.
CC0 source: crownjoshua, https://opengameart.org/content/knight-rigged-mid-poly
Exports a standard skinned GLB with semantic physics bindings in extras. No imported scripts run.
"""
import bpy, json, math, struct, sys
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
    up = ((b-a) if key.split('.')[0] in ['head','torso'] or key.endswith('pelvis') else (a-b)).normalized()
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
    if 'shoulder' in name: return 'torso.core'
    if 'upper_arm' in name: return slot+'.upper'
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
    return target_matrix(key) @ p

# Each slot is a separate mesh; intact skin shares weights across module seams.
# Runtime severing rebinds the achieved shape before removing cross-cut influences.
buckets={}
keep={'Man','Belt','BreastPlate','cuisse','Gauntlets','Helmet','Shoes','Shoulder-Plate','eyes-Left','eyes-Right'}
for obj in list(bpy.data.objects):
    if obj.name not in keep: continue
    for mod in obj.modifiers:
        if mod.type=='ARMATURE': mod.show_viewport=False
    deps=bpy.context.evaluated_depsgraph_get(); evaluated=obj.evaluated_get(deps)
    mesh=evaluated.to_mesh(); mesh.calc_loop_triangles()
    defaults={'Belt':'locomotion.pelvis','BreastPlate':'torso.core','Helmet':'head.head','eyes-Left':'head.head','eyes-Right':'head.head'}
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
    parent=list(range(len(mesh.vertices)))
    def root(i):
        while parent[i]!=i:
            parent[i]=parent[parent[i]]; i=parent[i]
        return i
    for edge in mesh.edges:
        a,b=edge.vertices; parent[root(a)]=root(b)
    owners={}
    for vi,pairs in enumerate(weights):
        sums=owners.setdefault(root(vi),{})
        for k,w in pairs: sums[k]=sums.get(k,0)+w
    owners={i:max(sums,key=sums.get) for i,sums in owners.items()}
    # Convert each shared vertex exactly once, before assigning triangles to modules.
    converted=[sum((convert(p,k)*w for k,w in pairs),Vector()) for p,pairs in zip(points,weights)]
    for tri in mesh.loop_triangles:
        combined={}
        for vi in tri.vertices:
            for k,w in weights[vi]: combined[k.split('.')[0]]=combined.get(k.split('.')[0],0)+w
        slot=max(combined,key=combined.get)
        mat=mesh.materials[tri.material_index].name if tri.material_index < len(mesh.materials) and mesh.materials[tri.material_index] else 'Steel'
        if any(max(weights[vi],key=lambda p:p[1])[0].endswith('.hand') for vi in tri.vertices): continue
        if obj.name.startswith('eyes-'): mat='Pupil' if mat=='Eye' else 'Eye white'
        if obj.name=='Man':
            mat='Skin' if slot=='head' else 'Padded cloth'
        if obj.name != 'Man':
            # Plates are rigid. Do not shear a pauldron across unrelated source bones.
            owner=owners[root(tri.vertices[0])]
            if obj.name in defaults: owner=defaults[obj.name]
            elif obj.name=='Shoulder-Plate': owner=('primary' if sum(points[vi].x for vi in tri.vertices)<0 else 'secondary')+'.upper'
            elif obj.name=='Gauntlets': owner=('primary' if sum(points[vi].x for vi in tri.vertices)<0 else 'secondary')+'.fore'
            slot=owner.split('.')[0]
        else: owner=None
        group=buckets.setdefault((slot,mat,obj.name),dict(positions=[],joints=[],weights=[],indices=[]))
        for vi in tri.vertices:
            pairs=[(owner,1)] if owner else weights[vi]
            p=convert(points[vi],owner) if owner else converted[vi]
            group['positions'].extend([p.x,p.y,-p.z]) # glTF right-handed
            group['joints'].extend([keys.index(k) for k,w in pairs]+[0]*(4-len(pairs)))
            group['weights'].extend([w for k,w in pairs]+[0]*(4-len(pairs)))
        n=len(group['positions'])//3
        group['indices'].extend([n-3,n-1,n-2])
    evaluated.to_mesh_clear()

# Cap open module cuts with the same cloth/skin surface. Material groups do not split Man.
for (slot,mat,name),g in list(buckets.items()):
    if name!='Man': continue
    points=[tuple(round(x,7) for x in g['positions'][i:i+3]) for i in range(0,len(g['positions']),3)]
    edges={}; representative={p:i for i,p in enumerate(points)}
    for i in range(0,len(g['indices']),3):
        tri=g['indices'][i:i+3]
        for a,b in zip(tri,tri[1:]+tri[:1]):
            pa,pb=points[a],points[b]
            edge=tuple(sorted((pa,pb)))
            if pa!=pb: edges.setdefault(edge,[]).append((pa,pb))
    border=[e[0] for e in edges.values() if len(e)==1]
    loop_number=0
    while border:
        caps=dict(positions=[],joints=[],weights=[],indices=[])
        first,last=border.pop(); loop=[first,last]
        while last!=first:
            match=next((i for i,(a,b) in enumerate(border) if a==last or b==last),None)
            if match is None: break
            a,b=border.pop(match); last=b if a==last else a; loop.append(last)
        if last!=first or len(loop)<4: continue
        loop=loop[:-1]; centre=sum((Vector(p) for p in loop),Vector())/len(loop)
        for a,b in zip(loop,loop[1:]+loop[:1]):
            base=len(caps['positions'])//3
            for p in [b,a,tuple(centre)]:
                sample=representative.get(p,representative[a])
                caps['positions'].extend(p); caps['joints'].extend(g['joints'][sample*4:sample*4+4]); caps['weights'].extend(g['weights'][sample*4:sample*4+4])
            caps['indices'].extend([base,base+1,base+2])
        neighbours=set()
        for point in loop:
            sample=representative[point]
            for j,w in zip(g['joints'][sample*4:sample*4+4],g['weights'][sample*4:sample*4+4]):
                other=keys[j].split('.')[0]
                if w>0 and other!=slot: neighbours.add(other)
        if neighbours and caps['indices']:
            buckets[(slot,mat,'Seam:'+','.join(sorted(neighbours))+':'+str(loop_number))]=caps
            loop_number+=1

# Closed glove geometry authored around the same palm grip frame as Havok.
grip=json.loads((Path(__file__).parents[2]/'assets/humanoid/grips.json').read_text())
grip_axis=Vector(grip['handleAxis']); grip_edge=Vector(grip['edgeAxis'])
grip_basis=Matrix((grip_edge,grip_axis.cross(grip_edge),grip_axis)).transposed()
def glove_ellipsoid(key,centre,radius,name="Hand"):
    group=buckets.setdefault((key.split('.')[0],'Leather glove',name),dict(positions=[],joints=[],weights=[],indices=[]))
    base=len(group['positions'])//3; segments=12; rings=8
    for j in range(rings+1):
        phi=math.pi*j/rings
        for i in range(segments):
            theta=2*math.pi*i/segments
            local=Vector((centre[0]+radius[0]*math.sin(phi)*math.cos(theta),centre[1]+radius[1]*math.cos(phi),centre[2]+radius[2]*math.sin(phi)*math.sin(theta)))
            local=grip_basis@(local-Vector((0,-.028,0)))+Vector(grip['palmCentre'])
            p=target_matrix(key)@local
            group['positions'].extend([p.x,p.y,-p.z]); group['joints'].extend([keys.index(key),0,0,0]); group['weights'].extend([1,0,0,0])
    for j in range(rings):
        for i in range(segments):
            a=base+j*segments+i; b=base+j*segments+(i+1)%segments; c=a+segments; d=b+segments
            group['indices'].extend([a,c,b,b,c,d])
for slot in ['primary','secondary']:
    key=slot+'.hand'; sign=1 if slot=='primary' else -1
    glove_ellipsoid(key,(0,-.028,0),(.023,.018,.03),'Fist')
    glove_ellipsoid(key,(0,.036,0),(.034,.023,.024))
    glove_ellipsoid(key,(0,.013,-.005),(.036,.030,.019))
    # Four fingers wrap across the palm around a Z-axis handle, with visible knuckles.
    for z in [-.019,-.006,.007,.020]:
        for x,y,rx,ry in [(.033,-.025,.011,.020),(.022,-.045,.019,.010),(-.001,-.041,.015,.010)]:
            glove_ellipsoid(key,(sign*x,y,z), (rx,ry,.0065))
    glove_ellipsoid(key,(-sign*.027,-.008,.026),(.013,.025,.011))
    glove_ellipsoid(key,(-sign*.013,-.026,.032),(.020,.011,.010))

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
for (slot,mat,object_name),g in buckets.items():
    if mat not in material_ids:
        lower=mat.lower(); gold='gold' in lower; dark='black' in lower or 'cloth' in lower or 'coif' in lower; cloth=dark or 'skin' in lower or 'glove' in lower or 'eye' in lower or 'pupil' in lower
        colour=[.018,.012,.009,1] if 'pupil' in lower else [.65,.65,.60,1] if 'eye white' in lower else [.40,.24,.15,1] if 'skin' in lower else [.10,.065,.04,1] if 'glove' in lower else [.43,.24,.07,1] if gold else [.045,.055,.065,1] if dark else [.46,.5,.54,1]
        material_ids[mat]=len(materials)
        materials.append(dict(name=mat,pbrMetallicRoughness=dict(baseColorFactor=colour,metallicFactor=0 if cloth else .85,roughnessFactor=.8 if dark else .34),doubleSided=True))
    normals=[0.0]*len(g['positions']); adjacency={}
    for i in range(0,len(g['indices']),3):
        ids=g['indices'][i:i+3]; pts=[Vector(g['positions'][j*3:j*3+3]) for j in ids]
        n=(pts[1]-pts[0]).cross(pts[2]-pts[0]).normalized()
        for j in ids:
            key=tuple(round(x,6) for x in g['positions'][j*3:j*3+3]); adjacency.setdefault(key,[]).append(n)
            for c in range(3): normals[j*3+c]+=n[c]
    for j in range(len(g['positions'])//3):
        n=Vector(normals[j*3:j*3+3]).normalized(); key=tuple(round(x,6) for x in g['positions'][j*3:j*3+3])
        smooth=sum((v for v in adjacency[key] if v.dot(n)>.65),Vector()).normalized()
        normals[j*3:j*3+3]=smooth
    primitives=[dict(attributes=dict(NORMAL=accessor(normals,'VEC3',3),POSITION=accessor(g['positions'],'VEC3',3),JOINTS_0=accessor(g['joints'],'VEC4',4,5123),WEIGHTS_0=accessor(g['weights'],'VEC4',4)),indices=accessor(g['indices'],'SCALAR',1,5125),material=material_ids[mat])]
    meshes.append(dict(name=slot+'.'+object_name+'.'+mat,primitives=primitives,extras=dict(slot=slot,layer='body' if object_name in ['Man','Hand','Fist'] or object_name.startswith('eyes-') or object_name.startswith('Seam:') else 'armour',cap=object_name.startswith('Seam:'),capNear=object_name.split(':')[1].split(',') if object_name.startswith('Seam:') else [],fist=object_name=='Fist')))
    nodes.append(dict(name=slot+'.'+object_name+'.'+mat,mesh=len(meshes)-1,skin=0))
doc=dict(asset=dict(version='2.0',generator='auto-rpg humanoid asset compiler'),buffers=[dict(byteLength=len(data))],bufferViews=views,accessors=accessors,
    materials=materials,meshes=meshes,nodes=nodes,skins=[skin],scenes=[dict(nodes=list(range(len(nodes))))],scene=0,
    extras=dict(physicsBindings=[dict(key=k,**rows[k]) for k in keys],source='https://opengameart.org/content/knight-rigged-mid-poly',license='CC0',author='crownjoshua'))
encoded=json.dumps(doc,separators=(',',':')).encode(); encoded+=b' '*((-len(encoded))%4); data+=bytes((-len(data))%4)
output.write_bytes(struct.pack('<III',0x46546c67,2,28+len(encoded)+len(data))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(data),0x004e4942)+data)
print('EXPORTED',output,len(data),'bytes',len(meshes),'meshes',len(keys),'bones')
