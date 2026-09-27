"""Fit finger flexion against a finite handle using the actual weighted skin.

Optimization is authoring-time only. It evaluates linear blend skinning directly,
so its collision samples are skin vertices, not reconstructed bone capsules.
"""
import math,numpy as np

def mirror_thumb(rig,rotations):
 from mathutils import Matrix
 reflect=Matrix.Diagonal((-1,1,1,1));bones=rig.data.bones
 right=bones['hand_r'].matrix_local.copy();left=bones['hand_l'].matrix_local.copy();out=[]
 for j,q in enumerate(rotations):
  rn=f'thumb_{j+1:02}_r';ln=f'thumb_{j+1:02}_l'
  rp=bones['hand_r' if j==0 else f'thumb_{j:02}_r'].matrix_local
  lp=bones['hand_l' if j==0 else f'thumb_{j:02}_l'].matrix_local
  rlocal=rp.inverted()@bones[rn].matrix_local;llocal=lp.inverted()@bones[ln].matrix_local
  right=right@rlocal@q.to_matrix().to_4x4()
  target=reflect@(right@bones[rn].matrix_local.inverted())@reflect@bones[ln].matrix_local
  out.append((llocal.inverted()@left.inverted()@target).to_quaternion());left=target
 return out
def fit(rig,skin,side,frame,centre,radius,half=.065,hook=False):
 w,u,v,n=frame;basis=np.array([list(u),list(v),list(n)]);origin=np.array(w)
 points=np.array([list(p.co) for p in skin.data.vertices]);points=(points-origin)@basis.T
 names=[g.name for g in skin.vertex_groups];result={}
 for digit in ['index','middle','ring','pinky']:
  bones=[f'{digit}_{j:02}_{side}' for j in [1,2,3]]
  allweights=np.array([[sum(g.weight for g in vert.groups if names[g.group]==bone) for bone in bones] for vert in skin.data.vertices])
  keep=allweights.sum(axis=1)>.12;p=points[keep];weights=allweights[keep]
  pad=np.array([vert.normal.dot(n)>.1 for vert in skin.data.vertices])[keep] & ((weights[:,1]+weights[:,2])>.65)
  heads=np.array([list(rig.data.bones[bone].head_local) for bone in bones]);heads=(heads-origin)@basis.T
  def evaluate(angles,report=False):
   out=p*(1-weights.sum(axis=1))[:,None];head=heads[0].copy();cumulative=0
   for j,angle in enumerate(angles):
    cumulative+=angle;c=math.cos(cumulative);s=math.sin(cumulative);rot=np.array([[1,0,0],[0,c,-s],[0,s,c]])
    out+=((p-heads[j])@rot.T+head)*weights[:,j,None]
    if j<2:head=head+rot@(heads[j+1]-heads[j])
   d=out-np.array(centre);radial=np.hypot((d[:,1]-.2*d[:,0])/math.sqrt(1.04),d[:,2])-radius;axial=np.abs((d[:,0]+.2*d[:,1])/math.sqrt(1.04))-half
   gap=np.hypot(np.maximum(radial,0),np.maximum(axial,0))+np.minimum(np.maximum(radial,axial),0)
   if report:return gap.min()
   penetration=np.maximum(.0006-gap,0)
   distal=out[weights[:,2]>.5].mean(axis=0)-np.array(centre);dist=np.hypot((distal[1]-.2*distal[0])/math.sqrt(1.04),distal[2])
   pads=gap[pad]
   contact=np.sort(np.abs(pads-.0006))[:max(3,len(pads)//4)]
   return 300*np.mean(penetration**2)+100*np.max(penetration)**2+40*np.mean(contact**2)+.2*(dist-radius-.006)**2+1e-5*np.sum((angles-np.radians([35,70,25] if hook else [55,65,30]))**2)
  best=None
  lo=np.radians([15,40,5] if hook else [25,20,0]);hi=np.radians([90,90,60])
  candidates=[]
  for x in range(25,91,10):
   for y in range(20,91,10):
    z=.65*y;a=np.clip(np.radians([x,y,z]),lo,hi);a[2]=.65*a[1];candidates.append((evaluate(a),[x,y,z]))
  for _,seed in sorted(candidates)[:4]:
   a=np.clip(np.radians(seed),lo,hi);a[2]=.65*a[1];score=evaluate(a)
   for degrees in [20,10,5,2,1,.4]:
    for repeat in range(5):
     changed=False
     for j in range(2):
      for direction in [-1,1]:
       candidate=a.copy();candidate[j]=np.clip(candidate[j]+math.radians(degrees)*direction,lo[j],hi[j]);candidate[2]=.65*candidate[1];value=evaluate(candidate)
       if value<score:a=candidate;score=value;changed=True
     if not changed:break
   if best is None or score<best[0]:best=(score,a)
  result[digit]=list(np.degrees(best[1]));print('GRIP FIT',side,digit,result[digit],'min mm',evaluate(best[1],True)*1000,flush=True)
 return result

def fit_thumb(rig,skin,side,frame,centre,radius,half=.065):
 from mathutils import Matrix
 names=[g.name for g in skin.vertex_groups];bones=[f'thumb_{j:02}_{side}' for j in [1,2,3]]
 pts=np.array([list(p.co)+[1] for p in skin.data.vertices]);weights=np.array([[sum(g.weight for g in p.groups if names[g.group]==name) for name in bones] for p in skin.data.vertices])
 keep=weights.sum(axis=1)>.12;pts=pts[keep];weights=weights[keep]
 pad=np.array([p.normal.dot(frame[3])>.1 for p in skin.data.vertices])[keep] & ((weights[:,1]+weights[:,2])>.65)
 rest=[np.array(rig.data.bones[name].matrix_local) for name in bones];parent=np.array(rig.data.bones['hand_'+side].matrix_local)
 local=[np.linalg.inv(parent if j==0 else rest[j-1])@rest[j] for j in range(3)];inverse=[np.linalg.inv(m) for m in rest]
 seed=[np.array(rig.pose.bones[name].matrix_basis.to_quaternion().to_matrix()) for name in bones]
 w,u,v,n=frame;basis=np.array([list(u),list(v),list(n)]);origin=np.array(w)
 def evaluate(values,output=False):
  out=pts*(1-weights.sum(axis=1))[:,None];world=parent.copy();rotations=[]
  for j in range(3):
   x,y,z=values[j*3:j*3+3];cx,sx=math.cos(x),math.sin(x);cy,sy=math.cos(y),math.sin(y);cz,sz=math.cos(z),math.sin(z)
   rot=seed[j]@np.array([[1,0,0],[0,cx,-sx],[0,sx,cx]])@np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]])@np.array([[cz,-sz,0],[sz,cz,0],[0,0,1]])
   rotations.append(rot);r=np.eye(4);r[:3,:3]=rot;world=world@local[j]@r;out+=(pts@(world@inverse[j]).T)*weights[:,j,None]
  if output:return [Matrix(r.tolist()).to_quaternion() for r in rotations]
  p=(out[:,:3]-origin)@basis.T;d=p-np.array(centre);radial=np.hypot((d[:,1]-.2*d[:,0])/math.sqrt(1.04),d[:,2])-radius;axial=np.abs((d[:,0]+.2*d[:,1])/math.sqrt(1.04))-half
  gap=np.hypot(np.maximum(radial,0),np.maximum(axial,0))+np.minimum(np.maximum(radial,axial),0);penetration=np.maximum(.0005-gap,0)
  contact=np.sort(abs(gap[pad]-.0005))[:max(3,int(pad.sum()*.1))]
  return 300*np.mean(penetration**2)+150*np.max(penetration)**2+40*np.mean(contact**2)+2e-7*np.sum(values**2)
 values=np.zeros(9);score=evaluate(values)
 for degrees in [15,7,3,1,.4]:
  for _ in range(6):
   changed=False
   for j in range(9):
    for direction in [-1,1]:
     candidate=values.copy();candidate[j]=np.clip(candidate[j]+math.radians(degrees)*direction,-.65,.65);cost=evaluate(candidate)
     if cost<score:values=candidate;score=cost;changed=True
   if not changed:break
 return evaluate(values,True)
