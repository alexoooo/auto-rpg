import {recoveryEnvironment} from './stand-up-environment.mjs';
import {standUpKinematics,solveStandUpPose} from './stand-up-ik.mjs';
import {footStatesOf,soleMiddleToRef} from '../src/core/control/support.ts';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {writeFileSync} from 'node:fs';
const output=process.argv[2];
if(!output)throw new Error('output JSON path required');
const rows=[];
for(const stagger of [-.15,0,.15])for(const width of [.8,1]){
 const e=await recoveryEnvironment({balance:100});
 try{
  const k=standUpKinematics({stand:e.stand,observe:e.observe,stance:e.stance});
  const feet=footStatesOf(e.stand.built),middle=feet.map(f=>soleMiddleToRef(f,new Vector3()));
  const goals=feet.map((f,i)=>({name:f.segment.spec.name,at:f.sole.reduce((s,p)=>s.addInPlace(p),new Vector3()).scaleInPlace(1/f.sole.length).asArray(),target:[middle[i].x*width,middle[i].y,middle[i].z+(i===0?stagger:-stagger)],rotation:f.segment.node.rotationQuaternion.clone()}));
  const patches=feet.map((f,i)=>({corners:f.corners.map(p=>new Vector3(p.x+middle[i].x*(width-1),p.y,p.z+(i===0?stagger:-stagger)))}));
  const solved=solveStandUpPose({...k,retained:[],patches},{variant:'D',target:null,rotation:null,goals,rootRotation:e.stand.built.segments.get('lowerTrunk').node.rotationQuaternion.clone(),rootHeight:e.stand.built.segments.get('lowerTrunk').node.position.y-.02,iterations:60});
  rows.push({stagger,width,solved});writeFileSync(output,JSON.stringify(rows));console.log(JSON.stringify({stagger,width,pass:solved.pass,errors:solved.goalErrors,violations:solved.violations}));
 }finally{e.dispose();}
}
