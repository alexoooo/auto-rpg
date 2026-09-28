import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCryptDungeon} from '../src/dungeon/crypt-dungeon.ts';
import {findPath,walkable} from '../src/dungeon/map.ts';
import {companionSpawn} from '../src/dungeon/party-placement.ts';

test('connected crypt seeds have four reachable chambers, doors and encounters beyond a safe entrance',()=>{
  const layouts=new Set();
  for(let seed=0;seed<40;seed++){
    const plan=generateCryptDungeon(seed),map=plan.map;
    assert.deepEqual(plan,generateCryptDungeon(seed));
    assert.equal(map.rooms.length,4);assert.equal(map.doors.length,6);
    assert.equal(map.spawns.length,6);assert.equal(plan.torches.length,8);
    assert.equal(map.obstacles.length,4);
    layouts.add(JSON.stringify(map.doors.map(d=>d.point)));
    for(const target of [map.exit,...map.spawns,...map.rooms.map(r=>r.centre)]){
      assert.ok(walkable(map,target,.65));assert.ok(findPath(map,map.start,target,.65).length);
    }
    assert.ok(Math.hypot(map.exit.x-map.start.x,map.exit.z-map.start.z)>=20);
    assert.ok(map.spawns.every(p=>Math.hypot(p.x-map.start.x,p.z-map.start.z)>15));
    const party=[map.start];for(let i=0;i<3;i++){const p=companionSpawn(map,party);assert.ok(p);party.push(p);}
    for(const door of map.doors){
      assert.equal(walkable(map,door.point,.65,true),false);
      door.open=true;assert.equal(walkable(map,door.point,.65,true),true);
      assert.ok(plan.placements.some(p=>p.piece==='portal'&&p.x===door.point.x&&p.z===door.point.z));
    }
  }
  assert.ok(layouts.size>20);
});
