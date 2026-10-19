/**
 * **How the Arena scores a kick** (`combatContact`, `research/arena-combat.mjs`): only the active
 * foot, moving in, drives a blow, and the wounds are the blow's own.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {combatContact} from '../research/arena-combat.mjs';

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
