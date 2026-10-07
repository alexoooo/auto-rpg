import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {buildBout} from '../research/bout.mjs';
import {combatContact,combatTrial} from '../research/arena-combat.mjs';
import {KICKER,SCRAPPER} from '../src/core/mind/config.ts';
import {STAND_ORDERS} from '../src/core/mind/orders.ts';
import {loadEngine,DEFAULT_ENGINE} from '../src/core/engine/engines.ts';
import {readMinds} from '../src/arena/matchup.ts';
import {capsuleSurfaceAtHeight} from '../src/core/mind/openings.ts';
import {frameOf} from '../src/core/spec/body.ts';
import {centreOfToRef} from '../src/core/control/support.ts';
import {traceOf} from './harness/trace.mjs';

const recipe={left:'workshop-fighter',right:'workshop-fighter',gap:1.4,capSeconds:60,recoverySeconds:null,
  balance:{left:0,right:0},held:{left:'empty',right:'empty'},minds:{left:KICKER,right:SCRAPPER}};
const make=async()=>buildBout(recipe,{physicsEngine:await loadEngine(DEFAULT_ENGINE)});

test('foot scoring requires the active moving foot and preserves actual native wounds',()=>{
  const blow={normal:[0,0,1],closing:2,energy:3,sides:[{fighter:'left',segment:'foot.right',wound:{taken:[{hp:.1}]}},
    {fighter:'right',segment:'shank.left',wound:{taken:[{hp:.2}]}}]};
  const witness={phase:null,hand:null,down:false,foeLow:false,kick:{foot:'right',phase:'swing',relativeVelocity:{right:[0,0,2]}}};
  assert.deepEqual(combatContact(blow,'left',witness),{driven:true,kind:'target',outgoing:.2,incoming:.1,energy:3,grounded:false,nativeKick:true});
  assert.deepEqual(combatContact({...blow,closing:.8},'left',witness),{driven:false,kind:'incidental-body',outgoing:.2,incoming:.1,energy:3,grounded:false,nativeKick:true});
  for(const kick of [{...witness.kick,phase:'return'},{...witness.kick,foot:'left'},
    {...witness.kick,relativeVelocity:{right:[0,0,-2]}}])assert.equal(combatContact(blow,'left',{...witness,kick}).driven,false);
  assert.equal(combatContact(blow,'left',{...witness,down:true}).driven,false);
});

test('the selectable Arena profile completes either-foot native strikes and keeps the retained profiles unchanged',async()=>{
  assert.deepEqual(readMinds('?control=kicker,scrapper'),{left:KICKER,right:SCRAPPER});
  assert.equal(SCRAPPER.kicks,false);
  for(const side of ['left','right']){
    const row=await combatTrial({left:side==='left'?KICKER:'scrapper',right:side==='right'?KICKER:'scrapper',
      recipe:{capSeconds:90},tape:[{step:0,side:side==='left'?'right':'left',orders:STAND_ORDERS}]});
    const r=row.sides[side];assert.equal(r.falls,0);assert.deepEqual(r.assist,{force:0,moment:0});
    assert.equal(r.kicks.failed,0);assert.ok(r.kicks.returned.left>=1&&r.kicks.returned.right>=1,JSON.stringify(r));
    assert.ok(r.nativeKickContacts>=1&&r.nativeKickDamage>0,JSON.stringify(r));
    assert.ok(r.drivenKicks>=1&&r.kickDamage>0,JSON.stringify(r));
  }
});

test('a native Arena kick forks through preparation, impact and verified landing, and orders withdraw it',async()=>{
  const a=await make(),b=await make();
  try{
    a.duel.order('right',STAND_ORDERS);const skills=a.duel.duelists.left.minded.skills;
    while(a.duel.clock<15&&skills.report.kick.phase!=='swing')a.world.step();
    assert.ok(a.duel.clock<15);const swinging=a.duel.save();b.duel.load(swinging);
    const ta=traceOf(Object.values(a.duel.duelists).map(d=>d.built)),tb=traceOf(Object.values(b.duel.duelists).map(d=>d.built));
    for(let i=0;i<600;i++){a.world.step();b.world.step();ta.take();tb.take();}
    assert.equal(ta.digest(),tb.digest());assert.deepEqual(a.duel.save().state,b.duel.save().state);
    assert.ok(skills.report.kick.returned.right>=1);assert.equal(a.duel.duelists.left.body.down,false);
    a.duel.load(swinging);a.duel.order('left',STAND_ORDERS);
    a.world.step(600);assert.equal(skills.report.kick.foot,null);assert.equal(skills.report.strike.hand,null);
    assert.equal(a.duel.duelists.left.body.down,false);assert.equal(a.duel.verdict,null);
  }finally{a.dispose();b.dispose();}
});

test('capsule targeting reads a rotated native collider and returns a point on its side or cap',async()=>{
  const s=await make();
  try{
    for(const side of ['left','right'])s.duel.order(side,STAND_ORDERS);
    s.world.step(240);const view=s.duel.duelists.left.body.view,foe=view.senses.others[0];
    const name='shank.left',spec=foe.spec.segments.find(s=>s.name===name),frame=frameOf(spec),part=foe.segments.get(name);
    const world=q=>{const d=new Vector3(...q).subtractInPlace(new Vector3(...frame.origin));
      const local=new Vector3(Vector3.Dot(d,new Vector3(...frame.x)),Vector3.Dot(d,new Vector3(...frame.y)),Vector3.Dot(d,new Vector3(...frame.z)));
      return local.applyRotationQuaternion(part.rotation).addInPlace(part.position);};
    const a=world(spec.shape.from.value),b=world(spec.shape.to.value),axis=b.subtract(a);
    for(const height of [.35,.4,.45]){
      const p=capsuleSurfaceAtHeight(foe,name,[view.stance.centre.x,height,view.stance.centre.z],height);assert.ok(p,height);
      const q=new Vector3(...p),u=Math.max(0,Math.min(1,Vector3.Dot(q.subtract(a),axis)/axis.lengthSquared()));
      assert.ok(Math.abs(Vector3.Distance(q,a.add(axis.scale(u)))-spec.shape.radius.value)<1e-12);
    }
    assert.equal(capsuleSurfaceAtHeight(foe,name,[0,3,0],3),null);
  }finally{s.dispose();}
});

test('an actual fall interrupts the kick and yields to recovery in a continuing Arena bout',async()=>{
  const s=await make();
  try{
    s.duel.order('right',STAND_ORDERS);const d=s.duel.duelists.left,skills=d.minded.skills;
    while(s.duel.clock<15&&skills.report.kick.stage!=='unload')s.world.step();assert.ok(s.duel.clock<15);
    const trunk=d.built.segments.get('upperTrunk');trunk.body.applyImpulse(new Vector3(0,0,80),centreOfToRef(trunk,new Vector3()));
    let down=false,recovery=false;
    for(let i=0;i<1200;i++){s.world.step();down ||= d.body.down;recovery ||= d.body.has.startsWith('recovery:');}
    assert.ok(down&&recovery);assert.ok(skills.report.kick.interrupted>=1);assert.equal(skills.report.kick.foot,null);
    assert.equal(s.duel.verdict,null,'a fall does not end a continuing bout');
    assert.ok(d.body.assist.meter.force===0&&d.body.assist.meter.moment===0);
  }finally{s.dispose();}
});
