/** Experimental explicit toe segments; their passive coordinates remain outside muscle authority. */
import {segmentFrame} from '../../../src/core/bodies/spec/body.ts';
import {derive,sourced,si} from '../../../src/core/bodies/spec/quantity.ts';
import {add,sub,scale,dot} from '../../../src/core/bodies/spec/vec.ts';
import {deepFreeze} from '../../../src/core/world/state.ts';

const stiffness=sourced(25,'N m/rad','falisse-2022-toes','passive MTP stiffness');
const damping=sourced(2,'N m s/rad','falisse-2022-toes','passive MTP damping');
const rest=sourced(0,'rad','falisse-2022-toes','neutral passive MTP rest');
const min=si(sourced(-90,'deg','opensim-gait2392-mtp','lower MTP coordinate limit'));
const max=si(sourced(90,'deg','opensim-gait2392-mtp','upper MTP coordinate limit'));

export function passiveToeBody(spec) {
  const toes=[],joints=[];
  const segments=spec.segments.map(foot=>{
    if(!foot.toes)return foot;
    if(foot.shape.kind!=='box')throw Error('physical toe prototype needs a box foot');
    const {toes:dimensions,...base}=foot,size=foot.shape.size;
    const frameInputs=[foot.proximal,foot.distal,...(foot.right?[foot.right]:[])];
    const axisOf=key=>derive('1',`foot frame ${key} axis`,frameInputs,(p,d,r)=>segmentFrame(p,d,r)[key]);
    const x=axisOf('x'),y=axisOf('y'),z=axisOf('z');
    const mass=derive('kg','uniform toe slab volume share of foot mass',[foot.mass,size,dimensions.length,dimensions.thickness],
      (m,s,l,t)=>m*l*t/(s[1]*s[2]+l*t));
    const hinge=derive('m','foot box bottom front edge',[foot.shape.centre,size,y,z],
      (c,s,y,z)=>add(c,add(scale(y,s[1]/2),scale(z,s[2]/2))));
    const distal=derive('m','toe tip along foot',[hinge,dimensions.length,y],(p,l,y)=>add(p,scale(y,l)));
    const centre=derive('m','uniform slab centre ahead and above ball',[hinge,dimensions.length,dimensions.thickness,y,z],
      (p,l,t,y,z)=>add(p,add(scale(y,l/2),scale(z,-t/2))));
    const toeSize=derive('m','toe width length and thickness',[size,dimensions.length,dimensions.thickness],(s,l,t)=>[s[0],l,t]);
    const inertia=derive('kg m2','uniform box toe moments',[mass,toeSize],(m,s)=>
      [m*(s[1]*s[1]+s[2]*s[2])/12,m*(s[0]*s[0]+s[2]*s[2])/12,m*(s[0]*s[0]+s[1]*s[1])/12]);
    const remaining=derive('kg','foot mass less toe slab',[foot.mass,mass],(whole,toe)=>whole-toe);
    const remainingCentre=derive('m','remaining foot centre preserving first moment',[foot.mass,foot.centreOfMass,mass,centre,remaining],
      (whole,c,toe,t,left)=>scale(sub(scale(c,whole),scale(t,toe)),1/left));
    const remainingInertia=derive('kg m2','remaining foot moments preserving diagonal inertia',[foot.inertia,inertia,foot.centreOfMass,remainingCentre,centre,remaining,mass,x,y,z],
      (whole,toe,c,p,t,mp,mt,x,y,z)=>{
        const into=v=>[dot(v,x),dot(v,y),dot(v,z)];
        const rp=into(sub(p,c)),rt=into(sub(t,c));
        return whole.map((v,i)=>v-toe[i]-mp*rp.reduce((sum,x,j)=>sum+(i===j?0:x*x),0)-mt*rt.reduce((sum,x,j)=>sum+(i===j?0:x*x),0));
      });
    if(remainingInertia.value.some(v=>v<=0))throw Error('toe split leaves nonpositive foot inertia');
    const name=`toe.${foot.name.split('.').at(-1)}`;
    toes.push({name,proximal:hinge,distal,mass,centreOfMass:centre,inertia,
      ...(foot.right?{right:foot.right}:{}),shape:{kind:'box',centre,size:toeSize},surface:foot.surface});
    const axis=derive('1','toe dorsiflexion axis',[x],x=>scale(x,-1));
    joints.push({name:`mtp.${foot.name.split('.').at(-1)}`,parent:foot.name,child:name,centre:hinge,
      dofs:[{positive:'dorsiflexion',negative:'plantarflexion',axis,min,max,bind:rest,passive:{rest,stiffness,damping}}]});
    return {...base,mass:remaining,centreOfMass:remainingCentre,inertia:remainingInertia};
  });
  const down=spec.down.kind==='touch'?{...spec.down,bearers:[...spec.down.bearers,...toes.map(toe=>toe.name)]}:spec.down;
  const wounds={...spec.wounds,limbs:spec.wounds.limbs.map(limb=>({...limb,
    segments:[...limb.segments,...joints.filter(joint=>limb.segments.includes(joint.parent)).map(joint=>joint.child)]}))};
  return deepFreeze({...spec,variant:'passive-toes',down,wounds,segments:[...segments,...toes],joints:[...spec.joints,...joints]});
}
