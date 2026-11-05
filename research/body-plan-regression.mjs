/** Node core stand and Duel, rapier-coordinate, 120 Hz: humanoid pose fingerprints and step timings. */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {existsSync,writeFileSync} from 'node:fs';
const base=process.argv[2]??'.';
const module=path=>import(pathToFileURL(resolve(base,path)).href);
const {coreStand}=await module('tests/harness/core-stand.mjs');
const {modelSpec}=await module(existsSync(resolve(base,'src/core/bodies/models.ts'))?'src/core/bodies/models.ts':'src/core/bodies/human/spec.ts');
const {traceOf}=await module(existsSync(resolve(base,'src/evaluation/trace.ts'))?'src/evaluation/trace.ts':'tests/harness/trace.mjs');
const {Duel}=await module(existsSync(resolve(base,'src/app/node/game.ts'))?'src/app/node/game.ts':'src/game/arena/duel.ts');
const {createWorld}=await module('src/core/world/world.ts');
const {freshEngine}=await module('tests/harness/core-stand.mjs');
const {SERVO_SECONDS}=await module('src/control/body.ts');
const {commandedBody}=await module('src/app/commanded-body.ts');
const {driveBy}=await module('src/minds/decider.ts');
const {standingSkills}=await module(existsSync(resolve(base,'src/app/standing-skills.ts'))?'src/app/standing-skills.ts':'src/skills/framework/skills.ts');
const {standIntent}=await module('src/skills/intent/intent.ts');
const output={};
for(const model of ['workshop-fighter','workshop-rogue','crypt-skeleton']){
 const s=await coreStand(modelSpec(model),{engine:'rapier-coordinate'}),b=commandedBody(s.built,s.world,{servoSeconds:SERVO_SECONDS});
 driveBy(b,{name:'standing',decide:()=>standIntent(0)},standingSkills);const trace=traceOf([s.built]);
 s.step(120);let time=0;for(let i=0;i<1200;i++){const start=performance.now();s.step();time+=performance.now()-start;trace.take();}
 output[model]={digest:trace.digest(),milliseconds:time/1200};b.dispose();s.dispose();
}
for(const held of ['club','empty']){
 const world = createWorld(await freshEngine('rapier-coordinate'));
 world.physics.addFixedBox([0,-.5,0],[40,1,40]);const duel=new Duel(world,{left:'workshop-fighter',right:'workshop-rogue',loadouts: { left: { left: "empty", right: held }, right: { left: "empty", right: held } }});
 const trace=traceOf(Object.values(duel.duelists).map(f=>f.built));let time=0;
 for(let i=0;i<2400;i++){const start=performance.now();world.step();time+=performance.now()-start;trace.take();}
 output[held]={digest:trace.digest(),milliseconds:time/2400,verdict:duel.verdict};duel.dispose();world.dispose();
}
writeFileSync(process.argv[3]??'body-plan-regression.json',JSON.stringify(output,null,2));
