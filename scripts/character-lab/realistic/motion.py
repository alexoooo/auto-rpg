"""Authored local-space equipment and a deterministic walk/attack/return study."""
import bpy, math
from mathutils import Vector, Matrix, Quaternion

def smooth(x):
 x=max(0,min(1,x));return x*x*(3-2*x)
def author_motion(rig,kind,mats,mesh,tube):
 leather,steel,trim,blade,wood,string=mats;b=rig.data.bones
 frames={}
 for s in ['l','r']:
  w=b['hand_'+s].head_local.copy();v=(b['middle_01_'+s].head_local-w).normalized()
  u=(b['index_01_'+s].head_local-b['pinky_01_'+s].head_local).normalized();u=(u-v*u.dot(v)).normalized()
  n=u.cross(v).normalized();n*=-1 if s=='l' else 1
  frames[s]=(w,u,v,n)
 from grip_fit import fit,fit_thumb
 skin=next(o for o in bpy.context.scene.objects if o.name=='base__skin')
 fitted={'r':fit(rig,skin,'r',frames['r'],(0,.108,.043),.014),'l':fit(rig,skin,'l',frames['l'],(0,.108,.043),.014),
         'bow':fit(rig,skin,'l',frames['l'],(0,.108,.050),.017),'hook':fit(rig,skin,'r',frames['r'],(0,.145,.039),.0015,hook=True)}
 def point(s,x,y,z):
  w,u,v,n=frames[s];return w+u*x+v*y+n*z
 # All equipment is authored in the same rest frame as its anatomical hand.
 # Grip axis crosses the palm; the blade continues toward the thumb.
 for name,a,c,r,mat in [('grip',-.065,.065,.014,leather),('pommel',-.085,-.065,.023,trim),('guard',.071,.084,.018,trim)]:
  if name=='guard':tube('sword__'+name,[point('r',.08,.005,.043),point('r',.08,.19,.043)],r,mat,rig,'hand_r')
  else:tube('sword__'+name,[point('r',a,.108,.043),point('r',c,.108,.043)],r,mat,rig,'hand_r')
 verts=[point('r',x,.108+y,.043+z) for x,y,z in [(.085,-.022,0),(.085,0,.006),(.085,.022,0),(.085,0,-.006),(.70,-.015,0),(.70,0,.004),(.70,.015,0),(.70,0,-.004),(.82,0,0)]]
 mesh('sword__blade',verts,[(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0),(4,8,5),(5,8,6),(6,8,7),(7,8,4)],blade,rig,'hand_r')
 # Strapped heater: board parallel to forearm, transverse grip, snug rear loop.
 outline=[(-.24,-.28),(.24,-.28),(.25,.02),(.19,.23),(0,.42),(-.19,.23),(-.25,.02)]
 # Local x is across the palm; y is along the fingers. Board extends back over forearm.
 verts=[point('l',-y,x-.12,z) for z in [-.082,-.102] for x,y in outline]
 faces=[tuple(reversed(range(7))),tuple(range(7,14))]+[(i,(i+1)%7,(i+1)%7+7,i+7) for i in range(7)]
 mesh('shield__board',verts,faces,steel,rig,'hand_l')
 tube('shield__rim',[point('l',-y,x-.12,-.104) for x,y in outline+[outline[0]]],.009,trim,rig,'hand_l')
 tube('shield__grip',[point('l',x,.108,.043) for x in [-.066,.066]],.014,leather,rig,'hand_l')
 for x in [-.075,.075]:tube('shield__grip_mount',[point('l',math.copysign(.066,x),.108,.043),point('l',x,.108,.031),point('l',x,.108,-.086)],.007,steel,rig,'hand_l')
 for variant,width,depth in [('cloth',.075,.145),('armour',.094,.17)]:
  strap=[point('l',width*math.cos(j*math.pi/32),-.16+dv,-.082+depth*math.sin(j*math.pi/32)) for j in range(33) for dv in [-.018,.018]]
  o=mesh('shield__forearm_strap_'+variant,strap,[(2*j,2*j+1,2*j+3,2*j+2) for j in range(32)],leather,rig,'hand_l')
  o.modifiers.new('Strap thickness','SOLIDIFY').thickness=.004
 # Continuous bow stave. Shape-key flex and string draw are animated with the rig.
 bowpts=[point('l',x,.108+y,.050) for x,y in [(-.70,-.17),(-.60,-.09),(-.38,-.01),(-.13,0),(0,0),(.13,0),(.38,-.01),(.60,-.09),(.70,-.17)]]
 bow=tube('bow__stave',bowpts,[.009,.013,.016,.014,.015,.014,.016,.013,.009],wood,rig,'hand_l',16)
 tube('bow__grip',[point('l',x,.108,.050) for x in [-.065,.065]],.017,leather,rig,'hand_l')
 bow.shape_key_add(name='Basis');flex=bow.shape_key_add(name='Draw')
 for vert in flex.data:
  delta=vert.co-frames['l'][0];x=delta.dot(frames['l'][1]);vert.co-=frames['l'][2]*(.12*(abs(x)/.7)**1.7)
 stringobj=tube('bow__string',[point('l',-.70,-.062,.050),point('l',.085,-.062,.050),point('l',.70,-.062,.050)],.0015,string,rig,'hand_l',6)
 stringobj.shape_key_add(name='Basis');draw=stringobj.shape_key_add(name='Draw')
 for i,vert in enumerate(draw.data):vert.co-=frames['l'][2]*(.30 if 6<=i<12 else .12)
 # Arrow at the nocking point, directed along the bow's forward axis.
 arrow=tube('bow__arrow',[point('l',.085,-.062,.050),point('l',.085,.72,.050)],.0034,wood,rig,'hand_l',8)
 # Join the broadhead and three feather vanes into the shaft before morphing:
 # flight translates the whole arrow, with the nock seated at the string hook.
 av=[v.co.copy() for v in arrow.data.vertices];af=[tuple(f.vertices) for f in arrow.data.polygons]
 tip=len(av);av.extend([point('l',.085+x,y,.050+z) for x,y,z in [(-.012,.71,0),(.012,.71,0),(0,.71,.005),(0,.71,-.005),(0,.77,0)]])
 af.extend(tuple(tip+i for i in f) for f in [(0,2,4),(2,1,4),(1,3,4),(3,0,4)])
 for a in [0,2*math.pi/3,4*math.pi/3]:
  start=len(av);dx=.014*math.cos(a);dz=.014*math.sin(a)
  av.extend([point('l',.085,-.04,.050),point('l',.085+dx,-.015,.050+dz),point('l',.085+dx,.06,.050+dz),point('l',.085,.085,.050)])
  af.append(tuple(start+i for i in range(4)))
 bpy.data.objects.remove(arrow,do_unlink=True);arrow=mesh('bow__arrow',av,af,wood,rig,'hand_l')
 arrow.shape_key_add(name='Basis');flight=arrow.shape_key_add(name='Flight')
 for vert in flight.data:vert.co+=frames['l'][2]*7
 # Small feather vanes, attached to the same animated arrow by shape keys.
 # The shaft itself travels down range; rest of the kit stays socketed to hands.
 pb=rig.pose.bones
 def aim(name,a,c):
  p=pb[name];q=(b[name].tail_local-b[name].head_local).rotation_difference(c-a)
  p.matrix=Matrix.Translation(a)@q.to_matrix().to_4x4()@b[name].matrix_local.to_3x3().to_4x4()
 def chain(aName,bName,endName,target,pole):
  a=pb[aName].head.copy();L=(b[aName].tail_local-b[aName].head_local).length;M=(b[bName].tail_local-b[bName].head_local).length
  d=target-a;dist=min(d.length,L+M-.002);axis=d.normalized();side=pole-a;side=(side-axis*side.dot(axis)).normalized()
  x=(L*L-M*M+dist*dist)/(2*dist);el=a+axis*x+side*math.sqrt(max(.00001,L*L-x*x))
  end=a+axis*dist
  restA=b[bName].head_local-b[aName].head_local;restB=b[endName].head_local-b[bName].head_local
  restNormal=restA.cross(restB).normalized();normal=(el-a).cross(end-el).normalized()
  for name,start,finish,restDirection in [(aName,a,el,restA),(bName,el,end,restB)]:
   ry=restDirection.normalized();rz=restNormal;rx=ry.cross(rz).normalized()
   dy=(finish-start).normalized();dz=normal;dx=dy.cross(dz).normalized()
   rotation=Matrix((dx,dy,dz)).transposed()@Matrix((rx,ry,rz)).transposed().transposed()
   pb[name].matrix=Matrix.Translation(start)@rotation.to_4x4()@b[name].matrix_local.to_3x3().to_4x4();bpy.context.view_layer.update()
  return a+axis*dist
 def hand(s,target,direction,up):
  w,u,v,n=frames[s];dv=Vector(direction).normalized();du=Vector(up);du=(du-dv*du.dot(dv)).normalized()
  old=Matrix((u,v,u.cross(v))).transposed();new=Matrix((du,dv,du.cross(dv))).transposed();q=new@old.transposed()
  pb['hand_'+s].matrix=Matrix.Translation(target)@q.to_4x4()@b['hand_'+s].matrix_local.to_3x3().to_4x4()
 thumb_cache={}
 def fingers(s,closed,hook=False,bow=False):
  w,u,v,n=frames[s]
  for digit in ['index','middle','ring','pinky']:
   angles=fitted['hook' if hook and digit!='pinky' else 'bow' if bow and s=='l' else s][digit]
   for j,angle in enumerate(angles):
    p=pb[f'{digit}_{j+1:02}_{s}'];axis=p.bone.matrix_local.to_3x3().inverted()@(u*(-1 if s=='l' else 1))
    p.rotation_mode='QUATERNION';p.rotation_quaternion=Quaternion(axis,math.radians(angle)*closed)
  # Oppose the thumb across the index finger, instead of curling it on a guessed
  # local Euler axis (the source thumb axes differ from the other fingers).
  if closed>.8:
   transform=pb['hand_'+s].matrix@b['hand_'+s].matrix_local.inverted()
   cn=.050 if bow and s=='l' else .043;radius=.017 if bow and s=='l' else .014
   localTip=point(s,.016,.108+(radius+.006)*.65,cn+(radius+.006)*.76)
   p0=transform@b['thumb_01_'+s].head_local
   first=transform@point(s,.055,.058,.027);p1=p0+(first-p0).normalized()*b['thumb_01_'+s].length
   goal=transform@localTip;axis=(goal-p1).normalized();distance=(goal-p1).length
   L=b['thumb_02_'+s].length;M=b['thumb_03_'+s].length;distance=min(distance,L+M-.0001)
   pole=transform@point(s,.065,.105,.085)-p1;side=(pole-axis*pole.dot(axis)).normalized()
   x=(L*L-M*M+distance*distance)/(2*distance);p2=p1+axis*x+side*math.sqrt(max(.000001,L*L-x*x))
   for j,(a,end) in enumerate([(p0,p1),(p1,p2),(p2,goal)]):
    name=f'thumb_{j+1:02}_{s}';bpy.context.view_layer.update()
    rest=transform.to_3x3()@b[name].matrix_local.to_3x3()
    q=(rest@Vector((0,1,0))).rotation_difference(end-a)
    pb[name].matrix=Matrix.Translation(a)@q.to_matrix().to_4x4()@rest.to_4x4()
   key='bow' if bow and s=='l' else s
   if key not in thumb_cache:
    bpy.context.view_layer.update();thumb_cache[key]=fit_thumb(rig,skin,s,frames[s],(0,.108,cn),radius)
   for j,q in enumerate(thumb_cache[key]):
    p=pb[f'thumb_{j+1:02}_{s}'];p.matrix_basis=Matrix.Identity(4);p.rotation_mode='QUATERNION';p.rotation_quaternion=q
 H=b['head'].tail_local.z;scale=H/1.88
 def pose(t,weapon,neutral=False):
  for p in pb:p.matrix_basis=Matrix.Identity(4)
  travel=0;turn=0;walk=0;phase=0
  if not neutral:
   if .6<t<3:travel=(t-.6)/2.4*1.6;walk=1;phase=(t-.6)/.6
   elif 3<=t<6.4:travel=1.6
   elif 6.4<=t<7.2:travel=1.6;turn=math.pi*smooth((t-6.4)/.8)
   elif 7.2<=t<9.6:travel=1.6-(t-7.2)/2.4*1.6;turn=math.pi;walk=1;phase=(t-7.2)/.6
   elif 9.6<=t<10.4:turn=math.pi+math.pi*smooth((t-9.6)/.8)
   elif t>=10.4:turn=2*math.pi
  rig.location=(0,-travel,0);rig.rotation_euler=(0,0,turn)
  bob=.018*math.sin(phase*2*math.pi)**2*walk
  attack=smooth((t-3.25)/.6)*(1-smooth((t-5.2)/.8)) if not neutral else 0
  lunge=attack if weapon!='bow' else 0
  pb['pelvis'].matrix=Matrix.Translation(Vector((0,-.08*lunge,bob-.035-.018*lunge)))@b['pelvis'].matrix_local
  bpy.context.view_layer.update()
  for s,sign in [('l',1),('r',-1)]:
   ankle=b['foot_'+s].head_local.copy();ankle.x=sign*.105*scale
   p=(phase+(0 if s=='l' else 1))%2
   # Stance foot travels backward relative to root; swing returns it forward.
   if walk:
    local=(t-.6) if t<3 else (t-7.2)
    envelope=smooth(local/.18)*(1-smooth((local-2.22)/.18))
    ankle.y+=envelope*((-.2+.4*p) if p<1 else (.2-.4*smooth(p-1)));ankle.z+=0 if p<1 else envelope*.075*math.sin(math.pi*(p-1))
   tip=chain('thigh_'+s,'calf_'+s,'foot_'+s,ankle,Vector((sign*.13,-1,.5)))
   pb['foot_'+s].matrix=Matrix.Translation(tip)@b['foot_'+s].matrix_local.to_3x3().to_4x4()
  cut=smooth((t-4.05)/.32)
  bowPull=smooth((t-3.65)/.8)*(1-smooth((t-5.25)/.6)) if not neutral else 0
  bowLift=smooth((t-3.05)/.5)*(1-smooth((t-5.85)/.45)) if not neutral else 0
  if weapon=='bow':
   bpy.context.view_layer.update()
  for s,sign in [('l',1),('r',-1)]:
   target=Vector((sign*.28,-.18,1.0))*scale;dv=Vector((0,-.6,-.8));up=Vector((0,-.8,.6))
   if s=='l' and ('shield' in weapon):target=Vector((.05,-.40-attack*.13,1.20))*scale;dv=Vector((-1,0,0));up=Vector((0,0,1))
   elif weapon=='bow':
    pull=bowPull
    if s=='l':target=Vector((.16*scale,-.45*scale,1.05*scale)).lerp(Vector((.13*scale,-.55*scale,pb['upperarm_l'].head.z+.17*scale)),bowLift)
    else:
     bw,bu,bv,bn=bowFrame;stringPoint=bw+bu*.085+bv*(-.062-.30*pull)+bn*.050
     target=stringPoint-Vector((.039,-.145,.016))
    dv=Vector((0,-1,0));up=Vector((0,0,1))
   elif s=='r' and 'sword' in weapon:
    target=target.lerp(Vector((-.25+.30*cut,-.36-.22*cut,1.62-.56*cut))*scale,attack);dv=Vector((0,-.6,-.8));up=Vector((0,-.8,.6)).lerp(Vector((-.3,-.65,.70-1.3*cut)),attack)
   elif weapon=='empty' and s=='r':target=target.lerp(Vector((-.18,-.68,1.40))*scale,attack);dv=Vector((0,-1,0));up=Vector((1,0,0))
   if walk and weapon!='bow' and not(s=='l' and 'shield' in weapon):target.y+=sign*.055*math.sin(phase*math.pi)
   pole=target+Vector((0,.5,0)) if weapon=='bow' and s=='l' else Vector((.55,-.05,1.10) if s=='l' and 'shield' in weapon else (sign*.65,.04,.95))*scale
   if weapon=='bow' and s=='r':pole=Vector((-.55,-.04,1.22))*scale;pole= pole.lerp(Vector((-.15,.65,pb['head'].head.z)),bowPull)
   end=chain('upperarm_'+s,'lowerarm_'+s,'hand_'+s,target,pole)
   dv=(end-pb['lowerarm_'+s].head).normalized()
   if s=='l' and weapon=='bow':
    bu=(up-dv*up.dot(dv)).normalized();bowFrame=(end.copy(),bu,dv,-bu.cross(dv))
   if s=='r' and weapon=='bow':
    for _ in range(4):
     du=(up-dv*up.dot(dv)).normalized();dn=du.cross(dv);target=stringPoint-dv*.145-dn*.039-du*.016
     end=chain('upperarm_r','lowerarm_r','hand_r',target,pole);dv=(end-pb['lowerarm_r'].head).normalized()
   hand(s,end,dv,up)
   closed=1 if weapon=='bow' or s=='r' and 'sword' in weapon or s=='l' and 'shield' in weapon else .25
   if weapon=='bow' and s=='r' and not neutral:closed=1-.8*smooth((t-4.8)/.1)*(1-smooth((t-5.85)/.3))
   if weapon=='empty' and s=='r':closed=.25+.75*attack
   fingers(s,closed,weapon=='bow' and s=='r',weapon=='bow')
  return attack
 bpy.context.scene.render.fps=30
 modifiers=[(m,m.show_viewport) for o in bpy.context.scene.objects if o.type=='MESH' for m in o.modifiers]
 for m,_ in modifiers:m.show_viewport=False
 for weapon in ['empty','sword','shield','sword-shield','bow']:
  for neutral in [False,True]:
   name=('inspection-' if neutral else 'loop-')+weapon
   rig.animation_data_create();rig.animation_data.action=bpy.data.actions.new(name)
   for obj in [bow,stringobj,arrow]:
    obj.data.shape_keys.animation_data_create();obj.data.shape_keys.animation_data.action=bpy.data.actions.new(name+'-'+obj.name)
   for frame in (range(1,362,2) if not neutral else [1,3]):
    t=(frame-1)/30;a=pose(t,weapon,neutral)
    rig.keyframe_insert('location',frame=frame);rig.keyframe_insert('rotation_euler',frame=frame)
    for p in pb:
     p.rotation_mode='QUATERNION';p.keyframe_insert('location',frame=frame);p.keyframe_insert('rotation_quaternion',frame=frame);p.keyframe_insert('scale',frame=frame)
    flex.value=a if weapon=='bow' else 0;draw.value=flex.value
    flight.value=0 if t<4.8 or neutral else smooth((t-4.8)/.35)
    for key in [flex,draw,flight]:key.keyframe_insert('value',frame=frame)
   for obj in [rig,bow.data.shape_keys,stringobj.data.shape_keys,arrow.data.shape_keys]:
    action=obj.animation_data.action;action.use_fake_user=True
    for curve in action.fcurves:
     for k in curve.keyframe_points:k.interpolation='LINEAR'
   for obj in [bow,stringobj,arrow]:obj.data.shape_keys.animation_data.action=None
 rig.animation_data.action=None
 pose(0,'sword-shield',True)
 for m,visible in modifiers:m.show_viewport=visible
