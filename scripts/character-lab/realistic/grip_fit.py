"""Fit finger flexion against a finite handle using the actual weighted skin.

Optimization is authoring-time only. It evaluates linear blend skinning directly,
so its collision samples are skin vertices, not reconstructed bone capsules.
"""
import math,numpy as np
def fit(rig,skin,side,frame,centre,radius,half=.065,hook=False):
 w,u,v,n=frame;basis=np.array([list(u),list(v),list(n)]);origin=np.array(w)
 points=np.array([list(p.co) for p in skin.data.vertices]);points=(points-origin)@basis.T
 names=[g.name for g in skin.vertex_groups];result={}
 for digit in ['index','middle','ring','pinky']:
  bones=[f'{digit}_{j:02}_{side}' for j in [1,2,3]]
  allweights=np.array([[sum(g.weight for g in vert.groups if names[g.group]==bone) for bone in bones] for vert in skin.data.vertices])
  keep=allweights.sum(axis=1)>.12;p=points[keep];weights=allweights[keep]
  heads=np.array([list(rig.data.bones[bone].head_local) for bone in bones]);heads=(heads-origin)@basis.T
  def evaluate(angles,report=False):
   out=p*(1-weights.sum(axis=1))[:,None];head=heads[0].copy();cumulative=0
   for j,angle in enumerate(angles):
    cumulative+=angle;c=math.cos(cumulative);s=math.sin(cumulative);rot=np.array([[1,0,0],[0,c,-s],[0,s,c]])
    out+=((p-heads[j])@rot.T+head)*weights[:,j,None]
    if j<2:head=head+rot@(heads[j+1]-heads[j])
   d=out-np.array(centre);radial=np.linalg.norm(d[:,1:],axis=1)-radius;axial=np.abs(d[:,0])-half
   gap=np.hypot(np.maximum(radial,0),np.maximum(axial,0))+np.minimum(np.maximum(radial,axial),0)
   if report:return gap.min()
   penetration=np.maximum(.0006-gap,0)
   distal=out[weights[:,2]>.5].mean(axis=0);dist=np.linalg.norm((distal-np.array(centre))[1:])
   return 300*np.mean(penetration**2)+100*np.max(penetration)**2+4*np.min(abs(gap-.0006))**2+2*(dist-radius-.006)**2+2e-6*np.sum((angles-np.radians([5,75,40] if hook else [55,40,55]))**2)
  best=None
  for seed in [[55,40,55],[25,85,40],[80,25,55],[55,35,65]]:
   a=np.radians(seed);score=evaluate(a)
   for degrees in [20,10,5,2,1,.4]:
    for repeat in range(5):
     changed=False
     for j in range(3):
      for direction in [-1,1]:
       candidate=a.copy();candidate[j]=np.clip(candidate[j]+math.radians(degrees)*direction,0,math.radians([90,95,70][j]));value=evaluate(candidate)
       if value<score:a=candidate;score=value;changed=True
     if not changed:break
   if best is None or score<best[0]:best=(score,a)
  result[digit]=list(np.degrees(best[1]));print('GRIP FIT',side,digit,result[digit],'min mm',evaluate(best[1],True)*1000,flush=True)
 return result

def fit_thumb(rig,skin,side,frame,centre,radius):
 from mathutils import Matrix
 names=[g.name for g in skin.vertex_groups];bones=[f'thumb_{j:02}_{side}' for j in [1,2,3]]
 pts=np.array([list(p.co)+[1] for p in skin.data.vertices]);weights=np.array([[sum(g.weight for g in p.groups if names[g.group]==name) for name in bones] for p in skin.data.vertices])
 keep=weights.sum(axis=1)>.12;pts=pts[keep];weights=weights[keep]
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
  p=(out[:,:3]-origin)@basis.T;d=p-np.array(centre);radial=np.linalg.norm(d[:,1:],axis=1)-radius;axial=np.abs(d[:,0])-.065
  gap=np.hypot(np.maximum(radial,0),np.maximum(axial,0))+np.minimum(np.maximum(radial,axial),0);penetration=np.maximum(.0005-gap,0)
  return 300*np.mean(penetration**2)+150*np.max(penetration)**2+5*np.min(abs(gap-.0005))**2+2e-7*np.sum(values**2)
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
