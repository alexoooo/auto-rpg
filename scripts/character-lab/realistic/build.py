"""Character workshop: customized CC0 MPFB anatomy and authored equipment/motion.
Run through rebuild.ps1, which downloads MPFB under .tools/mpfb and runs Blender from the repository root.
"""
import bpy, bmesh, sys, math, json, hashlib
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'.tools/mpfb/mpfb2-master/src'))
sys.path.insert(0,str(Path(__file__).resolve().parent))
import mpfb
bpy.utils.extension_path_user=lambda *a,**k:str(ROOT/'.tools/mpfb/user')
mpfb.get_preference=lambda k:{'mpfb_user_data':str(ROOT/'.tools/mpfb/user'),'mpfb_second_root':str(ROOT/'.tools/mpfb/assets'),'mpfb_shelf_label':'Workshop'}.get(k)
mpfb.register()
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
ASSETS=ROOT/'.tools/mpfb/assets'
OUT=ROOT/'public/assets/character-lab';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'assets/character-lab'

def material(name,color,metal=0,rough=.6,texture=True):
 m=bpy.data.materials.new(name);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if texture:
  # Packed UV maps remain ordinary glTF textures; no runtime procedural shader.
  import numpy as np
  n=512;y,x=np.mgrid[0:n,0:n];rng=np.random.default_rng(819)
  grain=rng.normal(0,.06,(n,n));weave=.055*np.cos(x*math.pi)*np.cos(y*math.pi) if metal==0 else .025*np.sin(y*.5)
  a=np.ones((n,n,4),dtype=np.float32)
  for j,c in enumerate(color):a[:,:,j]=np.clip(c*(1+grain+weave),0,1)
  im=bpy.data.images.new(name+' colour',width=n,height=n);im.pixels.foreach_set(a.ravel());im.pack()
  tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im;m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
  height=grain+weave;gy,gx=np.gradient(height);norm=np.stack((-gx,-gy,np.ones_like(gx)*2),axis=-1);norm/=np.linalg.norm(norm,axis=-1,keepdims=True)
  pixels=np.ones((n,n,4),dtype=np.float32);pixels[:,:,:3]=norm*.5+.5
  normal=bpy.data.images.new(name+' normal',width=n,height=n);normal.colorspace_settings.name='Non-Color';normal.pixels.foreach_set(pixels.ravel());normal.pack()
  node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=normal;convert=m.node_tree.nodes.new('ShaderNodeNormalMap');m.node_tree.links.new(node.outputs['Color'],convert.inputs['Color']);m.node_tree.links.new(convert.outputs['Normal'],p.inputs['Normal'])
 return m

def mesh(name,verts,faces,mat,rig,bone=None,weights=None):
 d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
 for f in d.polygons:f.use_smooth=True
 if bone:weights=[{bone:1} for _ in verts];o['rigidBone']=bone
 if weights:
  for key in set(k for row in weights for k in row):
   g=o.vertex_groups.new(name=key)
   for i,row in enumerate(weights):
    if row.get(key,0)>0:g.add([i],row[key],'REPLACE')
 o.parent=rig;o.modifiers.new('Deform','ARMATURE').object=rig
 # Stable planar UVs for metal/leather surfaces generated in anatomical space.
 uv=d.uv_layers.new(name='UVMap')
 for f in d.polygons:
  for li in f.loop_indices:
   v=d.vertices[d.loops[li].vertex_index].co;uv.data[li].uv=(v.x*2+v.y,v.z*2)
 return o

def tube(name,points,radii,mat,rig,bone,n=12):
 points=[Vector(p) for p in points];verts=[];prev=None
 for i,p in enumerate(points):
  t=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
  if prev is None:
   ref=min([Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))],key=lambda v:abs(v.dot(t)))
   u=t.cross(ref).normalized()
  else:u=(prev-t*prev.dot(t)).normalized()
  v=t.cross(u);prev=u;r=radii[i] if isinstance(radii,list) else radii
  for j in range(n):verts.append(p+r*(u*math.cos(j*2*math.pi/n)+v*math.sin(j*2*math.pi/n)))
 faces=[]
 for i in range(len(points)-1):
  for j in range(n):a=i*n+j;b=i*n+(j+1)%n;faces.append((a,b,b+n,a+n))
 faces.extend([tuple(reversed(range(n))),tuple((len(points)-1)*n+j for j in range(n))])
 return mesh(name,verts,faces,mat,rig,bone)

def patch(body,name,predicate,offset,mat,rig,bone=None,smooth=0):
 # Copy real surface topology, UVs and skin weights; preserve shared seam vertices.
 source=body.data;selected=[f for f in source.polygons if predicate(f.center)]
 ids=sorted(set(i for f in selected for i in f.vertices));mapping={v:i for i,v in enumerate(ids)}
 verts=[source.vertices[i].co+source.vertices[i].normal*offset for i in ids]
 faces=[tuple(mapping[i] for i in f.vertices) for f in selected]
 weights=[{body.vertex_groups[g.group].name:g.weight for g in source.vertices[i].groups if body.vertex_groups[g.group].name in rig.data.bones} for i in ids]
 o=mesh(name,verts,faces,mat,rig,bone,weights)
 if source.uv_layers.active:
  for dst,src in zip(o.data.polygons,selected):
   for dl,sl in zip(dst.loop_indices,src.loop_indices):o.data.uv_layers.active.data[dl].uv=source.uv_layers.active.data[sl].uv
 if smooth:
  bm=bmesh.new();bm.from_mesh(o.data)
  for _ in range(smooth):bmesh.ops.smooth_vert(bm,verts=list(bm.verts),factor=.25,use_axis_x=True,use_axis_y=True,use_axis_z=True)
  bm.to_mesh(o.data);bm.free()
 solid=o.modifiers.new('Seam thickness','SOLIDIFY');solid.thickness=.003 if 'armour' not in name else .006;solid.offset=0
 return o

def body_and_rig(kind):
 for old in list(bpy.data.objects):bpy.data.objects.remove(old,do_unlink=True)
 for a in list(bpy.data.actions):bpy.data.actions.remove(a)
 female=kind=='rogue';d=TargetService.get_default_macro_info_dict();d.update(gender=0.0 if female else 1.0,age=.38 if female else .52,muscle=.55 if female else .78,weight=.43 if female else .57,height=.55,proportions=.65)
 d['race']={'caucasian':.75,'asian':.15,'african':.10}
 body=HumanService.create_human(macro_detail_dict=d)
 skinfolder='young_caucasian_female' if female else 'middleage_caucasian_male'
 HumanService.set_character_skin(str(ASSETS/'skins'/skinfolder/(skinfolder+'.mhmat')),body,skin_type='GAMEENGINE')
 skin=body.data.materials[0];principled=skin.node_tree.nodes.get('Principled BSDF')
 for link in list(principled.inputs['Alpha'].links):skin.node_tree.links.remove(link)
 principled.inputs['Alpha'].default_value=1
 rig=HumanService.add_builtin_rig(body,'game_engine')
 for folder,file,typ in [('eyes','low-poly','Eyes'),('eyebrows','eyebrow001','Eyebrows'),('eyelashes','eyelashes01','Eyelashes'),('teeth','teeth_base','Teeth'),('hair','ponytail01' if female else 'short02','Hair')]:
  path=next((ASSETS/folder).rglob(file+'.mhclo'))
  HumanService.add_mhclo_asset(str(path),body,asset_type=typ,material_type='GAMEENGINE')
 # Bake macro shape keys/helper masks in rest pose, retaining source weights and UVs.
 deps=bpy.context.evaluated_depsgraph_get()
 for o in list(bpy.context.scene.objects):
  if o.type!='MESH':continue
  evaluated=o.evaluated_get(deps);data=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=deps)
  o.modifiers.clear();o.data=data;o.modifiers.new('Deform','ARMATURE').object=rig
  o.name='base__'+('anatomy' if o==body else o.name.replace(' ','_'))
  for p in o.data.polygons:p.use_smooth=True
 h=max(v.co.z for v in body.data.vertices);factor=(1.73 if female else 1.88)/h
 for o in bpy.context.scene.objects:
  if o.type=='MESH':
   for v in o.data.vertices:v.co*=factor
 bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
 for b in rig.data.edit_bones:b.head*=factor;b.tail*=factor
 bpy.ops.object.mode_set(mode='OBJECT');bpy.context.view_layer.update()
 rig.name='WorkshopRig';body.data.update()
 for o in bpy.context.scene.objects:
  if o.type=='MESH':o.data.name=o.name
 return body,rig

def build(kind):
 body,rig=body_and_rig(kind);female=kind=='rogue';b=rig.data.bones
 hip=b['thigh_l'].head_local.z;neck=b['neck_01'].head_local.z;wrist=b['hand_l'].head_local
 cloth=material('Woven charcoal linen',(.075,.082,.071) if female else (.14,.115,.08))
 leather=material('Worn saddle leather',(.075,.041,.025),rough=.72)
 steel=material('Blackened steel',(.11,.13,.145),.85,.38)
 trim=material('Aged brass',(.34,.22,.095),.75,.46)
 pants=material('Wool trousers',(.043,.048,.047),rough=.9)
 blade=material('Honed steel',(.47,.51,.53),.9,.23)
 wood=material('Yew heartwood',(.20,.09,.034),rough=.52)
 string=material('Linen string',(.48,.43,.33),rough=.9,texture=False)
 # Fully connected pelvis and legs underneath the jacket.
 def trouser(p):return .13<p.z<hip+.10 and abs(p.x)<.31
 patch(body,'base__trousers',trouser,.012,pants,rig)
 # Tailored jacket follows continuous shoulders, underarms and elbows.
 def torso(p):return p.z>hip-.06 and p.z<neck-.015 and (abs(p.x)<abs(wrist.x)-.065 or p.z>wrist.z+.05)
 jacket=patch(body,'base__jacket',torso,.022,cloth,rig)
 # Relax cut boundaries into sewn hems. Skin topology supplies the fit; the
 # boundary finish avoids a stair-step cut across the source polygon rows.
 def finish_edges(o,mat):
  counts={}
  for f in o.data.polygons:
   for edge in f.edge_keys:counts[edge]=counts.get(edge,0)+1
  links={}
  for (a,c),count in counts.items():
   if count==1:links.setdefault(a,[]).append(c);links.setdefault(c,[]).append(a)
  unseen=set(links);serial=0
  while unseen:
   start=next(iter(unseen));loop=[start];prev=None;cur=start
   while True:
    options=[v for v in links[cur] if v!=prev]
    if not options:break
    nxt=options[0]
    if nxt==start:break
    if nxt in loop:break
    loop.append(nxt);prev,cur=cur,nxt
   unseen.difference_update(loop)
   if len(loop)<5:continue
   pts=[o.data.vertices[i].co.copy() for i in loop]
   for _ in range(4):pts=[p*.5+(pts[(i-1)%len(pts)]+pts[(i+1)%len(pts)])*.25 for i,p in enumerate(pts)]
   for i,p in zip(loop,pts):o.data.vertices[i].co=p
   centre=sum(pts,Vector())/len(pts)
   bone=o.get('rigidBone') or ('lowerarm_'+('l' if centre.x>0 else 'r') if abs(centre.x)>.30 else 'pelvis' if centre.z<hip+.16 else 'neck_01')
   tube(o.name+'_seam'+str(serial),pts+[pts[0]],.005,mat,rig,bone,8);serial+=1
 finish_edges(jacket,cloth)
 # Body coverage is removed only in the exported visible skin, not the source anatomy.
 exposed=patch(body,'base__skin',lambda p:p.z>.12 and not(trouser(p) or torso(p)),.0005,body.data.materials[0],rig)
 exposed.modifiers.remove(exposed.modifiers.get('Seam thickness'))
 feet=patch(body,'bare__feet',lambda p:p.z<.15,0,body.data.materials[0],rig)
 feet.modifiers.remove(feet.modifiers.get('Seam thickness'))
 # Keep the source in the editable file but omit it from runtime export.
 body.hide_render=True;body.hide_set(True);body['authoringOnly']=True
 # Torso shell fitted to the underlying surface, with softened contours.
 chestLimit=b['upperarm_l'].head_local.x*.92
 cuirass=patch(body,'armour__cuirass',lambda p:hip+.065<p.z<neck-.024 and abs(p.x)<chestLimit,.047,leather if female else steel,rig,'spine_03',4)
 finish_edges(cuirass,trim)
 for s,sign in [('l',1),('r',-1)]:
  sh=b['upperarm_'+s].head_local;el=b['lowerarm_'+s].head_local;wr=b['hand_'+s].head_local
  # Layered overlapping shoulder plates, sized from the anatomical shoulder.
  for j in range(3):
   centre=sh.lerp(el,.10+j*.15);axis=(el-sh).normalized();up=Vector((0,-1,0));side=axis.cross(up).normalized()
   if side.dot(Vector((sign,0,1)))<0:side=-side
   verts=[];faces=[];radius=(.098 if female else .118)-j*.007
   for k in range(3):
    for q in range(17):
     a=math.pi*q/16;verts.append(centre+axis*((k-1)*.027)+radius*(up*math.cos(a)+side*math.sin(a)))
   for k in range(2):
    for q in range(16):i=k*17+q;faces.append((i,i+1,i+18,i+17))
   o=mesh('armour__shoulder_'+s+str(j),verts,faces,leather if female else steel,rig,'upperarm_'+s)
   solid=o.modifiers.new('Plate thickness','SOLIDIFY');solid.thickness=.005
   tube('armour__shoulder_edge_'+s+str(j),verts[34:51],.0028,trim,rig,'upperarm_'+s)
  # Fitted forearm cuff built from skin topology, avoiding primitive cuffs cutting the wrist.
  axis=(wr-el).normalized()
  bracer=patch(body,'armour__bracer_'+s,lambda p,el=el,wr=wr,axis=axis,sign=sign:sign*p.x>0 and .25<(p-el).dot(axis)/(wr-el).length<.94 and (p-(el+axis*(p-el).dot(axis))).length<.095,.033,leather if female else steel,rig,'lowerarm_'+s)
  finish_edges(bracer,trim)
  ankle=b['foot_'+s].head_local;calf=b['calf_'+s].head_local
  verts=[];faces=[];weights=[];cx=ankle.x
  for z,cy,rx,ry in [(.016,-.070,.073,.142),(.045,-.070,.075,.145),(.09,-.065,.071,.135),(.15,-.015,.064,.075),(.22,.002,.065,.065),(.36,.002,.081,.076)]:
   for j in range(32):
    a=j*math.pi/16;verts.append((cx+rx*math.cos(a),cy+ry*math.sin(a),z));weights.append({'foot_'+s:1} if z<.15 else {'calf_'+s:1})
  for row in range(5):
   for j in range(32):i=row*32+j;k=row*32+(j+1)%32;faces.append((i,k,k+32,i+32))
  faces.append(tuple(reversed(range(32))))
  mesh('boots__'+s,verts,faces,leather,rig,weights=weights)
  tube('boots__cuff_'+s,verts[-32:]+[verts[-32]],.008,leather,rig,'calf_'+s)
  # Leather cuff edge and knee reinforcement follow the actual leg axis.
  knee=patch(body,'armour__knee_'+s,lambda p,sign=sign,calf=calf:sign*p.x>0 and abs(p.z-calf.z)<.068 and p.y<calf.y-.015,.027,steel,rig,'calf_'+s)
  finish_edges(knee,trim)
 # A proper waist belt, sampled as an ellipse outside the fitted jacket.
 waist=hip+.09
 section=[v.co for v in body.data.vertices if abs(v.co.z-waist)<.018 and abs(v.co.x)<.3]
 rx=max(abs(p.x) for p in section)+.027;lo=min(p.y for p in section);hi=max(p.y for p in section);cy=(lo+hi)/2;ry=(hi-lo)/2+.027
 verts=[(rx*math.cos(j*math.pi/32),cy+ry*math.sin(j*math.pi/32),waist+dz) for dz in [-.022,.022] for j in range(64)]
 belt=mesh('base__belt',verts,[(j,(j+1)%64,(j+1)%64+64,j+64) for j in range(64)],leather,rig,'pelvis')
 thick=belt.modifiers.new('Leather thickness','SOLIDIFY');thick.thickness=.004
 tube('base__buckle',[(-.027,cy-ry-.007,waist-.024),(.027,cy-ry-.007,waist-.024),(.027,cy-ry-.007,waist+.024),(-.027,cy-ry-.007,waist+.024),(-.027,cy-ry-.007,waist-.024)],.004,trim,rig,'pelvis',8)
 collar=[(.071*math.cos(j*math.pi/32),-.017+.063*math.sin(j*math.pi/32),neck-.021) for j in range(65)]
 tube('base__collar',collar,.014,cloth,rig,'neck_01',12)
 from motion import author_motion
 author_motion(rig,kind,(leather,steel,trim,blade,wood,string),mesh,tube)
 # Curves and modifiers are authored in Blender; glTF is the portable runtime format.
 for im in bpy.data.images:
  if im.source=='FILE' and im.size[0]>0:im.pack()
 rig.animation_data.action=None
 for pb in rig.pose.bones:pb.matrix_basis=Matrix.Identity(4)
 bpy.context.scene.frame_set(1)
 bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(kind+'.blend')),compress=True)
 bpy.ops.object.select_all(action='DESELECT')
 for o in bpy.context.scene.objects:
  if not o.get('authoringOnly'):o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(OUT/(kind+'.glb')),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_yup=True,export_extras=True,export_optimize_animation_size=True,export_force_sampling=False)
 from morph_export import add_morph_animation
 add_morph_animation(OUT/(kind+'.glb'))
 print('REALISTIC_COMPLETE',kind,flush=True)

if __name__=='__main__':
 for kind in (sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['fighter','rogue']):build(kind)
