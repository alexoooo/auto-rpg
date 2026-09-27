"""Authored local-space equipment and a deterministic walk/attack/return study."""
import bpy, math
from mathutils import Vector, Matrix, Quaternion

def smooth(x):
 x=max(0,min(1,x));return x*x*(3-2*x)
def author_motion(rig,kind,mats,mesh,tube,weapons=None):
 from rig import prepare,distribute_twist,continuous_keys
 from phases import bow_phase,DRAW_DISTANCE
 prepare(rig)
 leather,steel,trim,blade,wood,string=mats;b=rig.data.bones
 frames={}
 for s in ['l','r']:
  w=b['hand_'+s].head_local.copy();v=(b['middle_01_'+s].head_local-w).normalized()
  u=(b['index_01_'+s].head_local-b['pinky_01_'+s].head_local).normalized();u=(u-v*u.dot(v)).normalized()
  n=u.cross(v).normalized();n*=-1 if s=='l' else 1
  frames[s]=(w,u,v,n)
 from grip_fit import fit,fit_thumb,mirror_thumb
 skin=next(o for o in bpy.context.scene.objects if o.name=='base__skin')
 handScale={s:(b['middle_01_'+s].head_local-frames[s][0]).length/.1209 for s in ['l','r']}
 def fitted_pose(s,centre,radius,hook=False):
  k=handScale[s];return fit(rig,skin,s,frames[s],tuple(v*k for v in centre),radius*k,half=.075*k,hook=hook)
 fitted={'r':fitted_pose('r',(0,.095,.046),.018),'l':fitted_pose('l',(0,.095,.046),.018),
         'bow':fitted_pose('l',(0,.095,.046),.018),'hook':fitted_pose('r',(0,.145,.039),.0015,True)}
 def point(s,x,y,z):
  w,u,v,n=frames[s];return w+(u*x+v*(y+.2*x)+n*z)*handScale[s]
 # All equipment is authored in the same rest frame as its anatomical hand.
 # Grip axis crosses the palm; the blade continues toward the thumb.
 for name,a,c,r,mat in [('grip',-.075,.065,.018,leather),('pommel',-.095,-.075,.023,trim),('guard',.071,.084,.018,trim)]:
  if name=='guard':tube('sword__'+name,[point('r',.08,.005,.046),point('r',.08,.19,.046)],r,mat,rig,'hand_r')
  else:tube('sword__'+name,[point('r',a,.095,.046),point('r',c,.095,.046)],r*handScale['r'],mat,rig,'hand_r')
 verts=[point('r',x,.095+y,.046+z) for x,y,z in [(.085,-.022,0),(.085,0,.006),(.085,.022,0),(.085,0,-.006),(.70,-.015,0),(.70,0,.004),(.70,.015,0),(.70,0,-.004),(.82,0,0)]]
 mesh('sword__blade',verts,[(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0),(4,8,5),(5,8,6),(6,8,7),(7,8,4)],blade,rig,'hand_r')
 # Strapped heater: board parallel to forearm, transverse grip, snug rear loop.
 outline=[(-.24,-.28),(.24,-.28),(.25,.02),(.19,.23),(0,.42),(-.19,.23),(-.25,.02)]
 # Local x is across the palm; y is along the fingers. Board extends back over forearm.
 verts=[point('l',-y,x-.12,z) for z in [-.082,-.102] for x,y in outline]
 faces=[tuple(reversed(range(7))),tuple(range(7,14))]+[(i,(i+1)%7,(i+1)%7+7,i+7) for i in range(7)]
 mesh('shield__board',verts,faces,steel,rig,'hand_l')
 tube('shield__rim',[point('l',-y,x-.12,-.104) for x,y in outline+[outline[0]]],.009,trim,rig,'hand_l')
 tube('shield__grip',[point('l',x,.095,.046) for x in [-.075,.066]],.018*handScale['l'],leather,rig,'hand_l')
 for x in [-.075,.075]:tube('shield__grip_mount',[point('l',math.copysign(.066,x),.095,.046),point('l',x,.095,.031),point('l',x,.095,-.086)],.007,steel,rig,'hand_l')
 for variant,width,depth in [('cloth',.075,.145),('armour',.094,.17)]:
  strap=[point('l',width*math.cos(j*math.pi/32),-.16+dv,-.082+depth*math.sin(j*math.pi/32)) for j in range(33) for dv in [-.018,.018]]
  o=mesh('shield__forearm_strap_'+variant,strap,[(2*j,2*j+1,2*j+3,2*j+2) for j in range(32)],leather,rig,'hand_l')
  o.modifiers.new('Strap thickness','SOLIDIFY').thickness=.004
 # Continuous bow stave. Shape-key flex and string draw are animated with the rig.
 bowpts=[point('l',x,.095+y,.046) for x,y in [(-.70,-.17),(-.60,-.09),(-.38,-.01),(-.13,0),(0,0),(.13,0),(.38,-.01),(.60,-.09),(.70,-.17)]]
 bow=tube('bow__stave',bowpts,[.009,.013,.016,.014,.015,.014,.016,.013,.009],wood,rig,'hand_l',16)
 tube('bow__grip',[point('l',x,.095,.046) for x in [-.075,.065]],.018*handScale['l'],leather,rig,'hand_l')
 bow.shape_key_add(name='Basis');flex=bow.shape_key_add(name='Draw')
 for vert in flex.data:
  delta=vert.co-frames['l'][0];x=delta.dot(frames['l'][1]);vert.co-=frames['l'][2]*(.12*handScale['l']*(abs(x)/(.7*handScale['l']))**1.7)
 stringobj=tube('bow__string',[point('l',-.70,-.075,.046),point('l',.085,-.075,.046),point('l',.70,-.075,.046)],.0015,string,rig,'hand_l',6)
 stringobj.shape_key_add(name='Basis');draw=stringobj.shape_key_add(name='Draw')
 for i,vert in enumerate(draw.data):vert.co-=frames['l'][2]*(DRAW_DISTANCE if 6<=i<12 else .12)*handScale['l']
 # Arrow at the nocking point, directed along the bow's forward axis.
 arrow=tube('bow__arrow',[point('l',.085,-.075,.046),point('l',.085,.72,.046)],.0034,wood,rig,'hand_l',8)
 # Join the broadhead and three feather vanes into the shaft before morphing:
 # flight translates the whole arrow, with the nock seated at the string hook.
 av=[v.co.copy() for v in arrow.data.vertices];af=[tuple(f.vertices) for f in arrow.data.polygons]
 tip=len(av);av.extend([point('l',.085+x,y,.046+z) for x,y,z in [(-.012,.71,0),(.012,.71,0),(0,.71,.005),(0,.71,-.005),(0,.77,0)]])
 af.extend(tuple(tip+i for i in f) for f in [(0,2,4),(2,1,4),(1,3,4),(3,0,4)])
 for a in [0,2*math.pi/3,4*math.pi/3]:
  start=len(av);dx=.014*math.cos(a);dz=.014*math.sin(a)
  av.extend([point('l',.085,-.04,.046),point('l',.085+dx,-.015,.046+dz),point('l',.085+dx,.06,.046+dz),point('l',.085,.085,.046)])
  af.append(tuple(start+i for i in range(4)))
 bpy.data.objects.remove(arrow,do_unlink=True);arrow=mesh('bow__arrow',av,af,wood,rig,'arrow_flight')
 arrow.shape_key_add(name='Basis');flight=arrow.shape_key_add(name='Flight')
 for vert in flight.data:vert.co+=frames['l'][2]*7
 # Small feather vanes, attached to the same animated arrow by shape keys.
 # The shaft itself travels down range; rest of the kit stays socketed to hands.
 pb=rig.pose.bones
 def aim(name,a,c):
  p=pb[name];q=(b[name].tail_local-b[name].head_local).rotation_difference(c-a)
  p.matrix=Matrix.Translation(a)@q.to_matrix().to_4x4()@b[name].matrix_local.to_3x3().to_4x4()
 def chain(aName,bName,endName,target,pole,strict=False):
  a=pb[aName].head.copy();L=(b[aName].tail_local-b[aName].head_local).length;M=(b[bName].tail_local-b[bName].head_local).length
  d=target-a
  if strict and d.length>L+M-.001:raise ValueError(f'Unreachable {endName}: target exceeds usable reach by {1000*(d.length-(L+M-.002)):.1f} mm')
  dist=min(d.length,L+M-.002);axis=d.normalized();side=pole-a;side=(side-axis*side.dot(axis)).normalized()
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
  if closed>.8 and not hook:
   transform=pb['hand_'+s].matrix@b['hand_'+s].matrix_local.inverted()
   cn=.046 if bow and s=='l' else .046;radius=.018
   localTip=point(s,.016,.095+(radius+.006)*.65,cn+(radius+.006)*.76)
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
    bpy.context.view_layer.update()
    thumb_cache[key]=mirror_thumb(rig,thumb_cache['r']) if s=='l' and 'r' in thumb_cache else fit_thumb(rig,skin,s,frames[s],(0,.095*handScale[s],cn*handScale[s]),radius*handScale[s],half=.075*handScale[s])
   for j,q in enumerate(thumb_cache[key]):
    p=pb[f'thumb_{j+1:02}_{s}'];p.matrix_basis=Matrix.Identity(4);p.rotation_mode='QUATERNION';p.rotation_quaternion=q
 H=b['head'].tail_local.z;scale=H/1.88
 def pose(t,weapon,neutral=False):
  for p in pb:p.matrix_basis=Matrix.Identity(4)
  travel=0;turn=0;walk=0;phase=0
  if not neutral:
   if .6<t<3:travel=(t-.6)/2.4*1.6;walk=1;phase=(t-.6)/.6
   elif 3<=t<6.4:travel=1.6
   elif 6.4<=t<8:travel=1.6;turn=math.pi*smooth((t-6.4)/1.6)
   elif 8<=t<10.4:travel=1.6-(t-8)/2.4*1.6;turn=math.pi;walk=1;phase=(t-8)/.6
   elif t>=10.4:turn=math.pi+math.pi*smooth((t-10.4)/1.6)
  rig.location=(0,-travel,0);rig.rotation_euler=(0,0,turn)
  bob=.018*math.sin(phase*2*math.pi)**2*walk
  bowState=bow_phase(t,neutral);bowPull=bowState['draw'];bowLift=bowState['lift']
  stanceYaw=-1.45*bowLift if weapon=='bow' else 0
  stance=Quaternion((0,0,1),stanceYaw)
  attack=smooth((t-3.25)/.6)*(1-smooth((t-5.2)/.8)) if not neutral else 0
  lunge=attack if weapon!='bow' else 0
  pelvisRest=b['pelvis'].matrix_local
  pelvisPosition=pelvisRest.translation+Vector((0,-.08*lunge,bob-.035-.018*lunge))
  pb['pelvis'].matrix=Matrix.Translation(pelvisPosition)@stance.to_matrix().to_4x4()@pelvisRest.to_3x3().to_4x4()
  bpy.context.view_layer.update()
  for s,sign in [('l',1),('r',-1)]:
   ankle=b['foot_'+s].head_local.copy();ankle.x=sign*.105*scale
   p=(phase+(0 if s=='l' else 1))%2
   # Stance foot travels backward relative to root; swing returns it forward.
   if walk:
    local=(t-.6) if t<3 else (t-8)
    envelope=smooth(local/.18)*(1-smooth((local-2.22)/.18))
    ankle.y+=envelope*((-.2+.4*p) if p<1 else (.2-.4*smooth(p-1)));ankle.z+=0 if p<1 else envelope*.075*math.sin(math.pi*(p-1))
   ankle=stance@ankle
   tip=chain('thigh_'+s,'calf_'+s,'foot_'+s,ankle,stance@Vector((sign*.13,-1,.5)))
   pb['foot_'+s].matrix=Matrix.Translation(tip)@stance.to_matrix().to_4x4()@b['foot_'+s].matrix_local.to_3x3().to_4x4()
  cut=smooth((t-4.05)/.32)
  if weapon=='bow':
   # Turn from the feet and hips, then aim the head down range. The torso
   # remains untwisted instead of winding 80 degrees through the waist.
   p=pb['head'];m=p.matrix.copy();p.matrix=Matrix.Translation(m.translation)@Quaternion((0,0,1),-stanceYaw).to_matrix().to_4x4()@m.to_3x3().to_4x4()
   bpy.context.view_layer.update()
  for s,sign in [('l',1),('r',-1)]:
   target=Vector((sign*.28,-.18,1.0))*scale;dv=Vector((0,-.6,-.8));up=Vector((0,-.8,.6))
   if s=='l' and ('shield' in weapon):target=Vector((.16,-.40-(attack*.10 if weapon=='shield' else 0),1.20))*scale;dv=Vector((-.75,-.66,0));up=Vector((0,0,1))
   elif weapon=='bow':
    pull=bowPull
    if s=='l':
     shoulder=pb['upperarm_l'].head.copy();reach=b['upperarm_l'].length+b['lowerarm_l'].length-.004
     height=pb['head'].head.z-.12;dx=-.06*scale;dz=height-shoulder.z
     extended=Vector((shoulder.x+dx,shoulder.y-math.sqrt(reach*reach-dx*dx-dz*dz),height))
     raised=Vector((-.08*scale,-.50*scale,height)).lerp(extended,pull)
     # Carry the nock around the forward shoulder while extending, rather
     # than drawing the fingers through its surface at the halfway pose.
     raised.x-=.075*scale*math.sin(math.pi*pull)
     target=Vector((.36*scale,-.44*scale,1.20*scale)).lerp(raised,bowLift)
    else:
     bw,bu,bv,bn=bowFrame;stringPoint=bw+(bu*.085+bv*(-.075+.2*.085-DRAW_DISTANCE*pull)+bn*.046)*handScale['l']
     target=stringPoint-Vector((.039,-.145,.016))
    # Aim beside the cheek. A straight sagittal draw puts the wrist inside
    # the face even when the nock itself remains in front of it.
    bowDirection=Vector((.10,-.995,0)).normalized()
    if s=='l':bowDirection=Vector((-.30,-.75,.60)).lerp(bowDirection,pull).normalized()
    # Tilt the carried bow forward: an upright string crosses the forearm
    # above the wrist even when the handle itself is held correctly.
    dv=(Vector((.15,-.80,-.58)) if s=='l' else Vector((.7,-.7,0))).lerp(bowDirection,bowLift).normalized();up=Vector((0,0,1))
   elif s=='r' and 'sword' in weapon:
    target=Vector((-.30,-.23,1.08))*scale
    chamber=Vector((-.40,-.42,1.48))*scale;strike=Vector((-.37,-.47,1.36))*scale
    target=target.lerp(chamber.lerp(strike,cut),attack)
    angle=math.radians(-10+attack*(125*(1-cut)))
    dv=Vector((0,-math.sin(angle),-math.cos(angle)));up=Vector((0,-math.cos(angle),math.sin(angle)))
   elif weapon=='empty' and s=='r':target=target.lerp(Vector((-.18,-.68,1.40))*scale,attack);dv=Vector((0,-1,0));up=Vector((1,0,0))
   if walk and weapon!='bow' and not(s=='l' and 'shield' in weapon):target.y+=sign*.055*math.sin(phase*math.pi)
   pole=Vector((.45,-.04,1.20))*scale if weapon=='bow' and s=='l' else Vector((.55,-.05,1.10) if s=='l' and 'shield' in weapon else (sign*.65,.04,.95))*scale
   if weapon=='bow' and s=='l':pole=pole.lerp(Vector(((.22+.10*bowPull)*scale,(-.35-.10*bowPull)*scale,pb['head'].head.z-.36+.16*bowPull)),bowLift)
   if weapon=='bow' and s=='r':pole=Vector((-.50,-.02,1.25))*scale;pole=pole.lerp(Vector((-.30*scale,.40*scale,pb['head'].head.z-.12)),bowLift)
   if s=='r' and 'sword' in weapon:pole=pole.lerp(Vector((-.65,-.05,1.08))*scale,attack*cut)
   if s=='r' and weapon=='bow':
    du=up;dn=du.cross(dv);hookTarget=stringPoint-(dv*.145+dn*.039+du*.016)*handScale['r']
    target=Vector((-.20,-.27,1.20))*scale;target=target.lerp(hookTarget,bowLift)
    # Keep the free drawing hand outside the support arm during transitions.
    target.x=min(target.x,(-.10-.20*math.sin(math.pi*bowLift))*scale)
   try:end=chain('upperarm_'+s,'lowerarm_'+s,'hand_'+s,target,pole,strict=weapon!='empty')
   except ValueError as error:raise ValueError(f'{kind}/{weapon}/{t:.3f}s: {error}') from error
   fore=(end-pb['lowerarm_'+s].head).normalized()
   if 'sword' in weapon and s=='r':
    rotation=fore.rotation_difference(dv.normalized());angle=rotation.angle
    if angle>math.radians(30):rotation=Quaternion().slerp(rotation,math.radians(30)/angle)
    dv=rotation@fore
   if weapon=='empty':dv=(end-pb['lowerarm_'+s].head).normalized()
   if s=='l' and weapon=='bow':
    bu=(up-dv*up.dot(dv)).normalized();bowFrame=(end.copy(),bu,dv,-bu.cross(dv))
   hand(s,end,dv,up)
   distribute_twist(rig,s)
   closed=1 if weapon=='bow' or s=='r' and 'sword' in weapon or s=='l' and 'shield' in weapon else .25
   if weapon=='bow' and s=='r' and not neutral:closed=1-.7*bowState['release']*(1-smooth((t-5.7)/.4))
   if weapon=='bow' and s=='r':closed=.25+(closed-.25)*bowLift
   if weapon=='empty' and s=='r':closed=.25+.75*attack
   fingers(s,closed,weapon=='bow' and s=='r',weapon=='bow')
  return attack
 bpy.context.scene.render.fps=60
 modifiers=[(m,m.show_viewport) for o in bpy.context.scene.objects if o.type=='MESH' for m in o.modifiers]
 for m,_ in modifiers:m.show_viewport=False
 # Calibrate the thumb once in a fixed pose, independent of clip selection/order.
 pose(4,'empty')
 for weapon in weapons or ['empty','sword','shield','sword-shield','bow']:
  for neutral in [False,True]:
   name=('inspection-' if neutral else 'loop-')+weapon
   print('AUTHORING',kind,name,flush=True)
   rig.animation_data_create();rig.animation_data.action=bpy.data.actions.new(name)
   previous={};launch=None
   for obj in [bow,stringobj,arrow]:
    obj.data.shape_keys.animation_data_create();obj.data.shape_keys.animation_data.action=bpy.data.actions.new(name+'-'+obj.name)
   for frame in (range(1,722) if not neutral else [1,3]):
    t=(frame-1)/60;a=pose(t,weapon,neutral)
    bpy.context.view_layer.update()
    arrowPose=pb['hand_l'].matrix@b['hand_l'].matrix_local.inverted()@b['arrow_flight'].matrix_local
    if weapon=='bow' and not neutral and t>=4.8:
     if launch is None:
      launchDirection=arrowPose.to_3x3()@b['arrow_flight'].matrix_local.to_3x3().inverted()@frames['l'][2]
      launch=rig.matrix_world@Matrix.Translation(launchDirection*(-DRAW_DISTANCE*handScale['l']))@arrowPose
     direction=(launch.to_3x3()@b['arrow_flight'].matrix_local.to_3x3().inverted()@frames['l'][2]).normalized()
     pb['arrow_flight'].matrix=rig.matrix_world.inverted()@Matrix.Translation(direction*(t-4.8)*12)@launch
    else:
     drawOffset=-DRAW_DISTANCE*handScale['l']*bow_phase(t,neutral)['draw'] if weapon=='bow' else 0
     direction=arrowPose.to_3x3()@b['arrow_flight'].matrix_local.to_3x3().inverted()@frames['l'][2]
     pb['arrow_flight'].matrix=Matrix.Translation(direction*drawOffset)@arrowPose
    continuous_keys(rig,previous)
    rig.keyframe_insert('location',frame=frame);rig.keyframe_insert('rotation_euler',frame=frame)
    for p in pb:
     p.rotation_mode='QUATERNION';p.keyframe_insert('location',frame=frame);p.keyframe_insert('rotation_quaternion',frame=frame);p.keyframe_insert('scale',frame=frame)
    flex.value=bow_phase(t,neutral)['flex'] if weapon=='bow' else 0;draw.value=flex.value
    flight.value=0
    for key in [flex,draw,flight]:key.keyframe_insert('value',frame=frame)
   for obj in [rig,bow.data.shape_keys,stringobj.data.shape_keys,arrow.data.shape_keys]:
    action=obj.animation_data.action;action.use_fake_user=True
    for curve in action.fcurves:
     for k in curve.keyframe_points:k.interpolation='LINEAR'
   for obj in [bow,stringobj,arrow]:obj.data.shape_keys.animation_data.action=None
 rig.animation_data.action=None
 pose(0,'sword-shield',True)
 for m,visible in modifiers:m.show_viewport=visible
