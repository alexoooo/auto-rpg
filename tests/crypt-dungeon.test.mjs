import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCryptDungeon} from '../src/dungeon/crypt-dungeon.ts';
import {findPath,walkable} from '../src/dungeon/map.ts';
import {CRYPT_FURNITURE} from '../src/dungeon/crypt-archetypes.ts';
import {companionSpawn} from '../src/dungeon/party-placement.ts';

test('connected crypt seeds have four reachable chambers, doors and encounters beyond a safe entrance',()=>{
  const layouts=new Set(),variants=new Set();
  for(let seed=0;seed<100;seed++){
    const plan=generateCryptDungeon(seed),map=plan.map;
    assert.deepEqual(plan,generateCryptDungeon(seed));
    assert.equal(map.rooms.length,4);assert.equal(map.doors.length,6);
    assert.equal(map.spawns.length,6);assert.equal(plan.torches.length,8);
    assert.equal(map.obstacles.length,18);
    assert.deepEqual(plan.archetypes.map(a=>a.kind).sort(),['burial','chapel','guard','rootbound']);
    assert.equal(plan.archetypes.find(a=>a.room===0).kind,'guard');
    for(const type of plan.archetypes)variants.add(type.kind+type.variant);
    for(const o of map.obstacles){
      const p=plan.placements.find(p=>p.obstacleId===o.id);assert.ok(p);
      const [w,d,h]=CRYPT_FURNITURE[p.piece],rotated=Math.abs(Math.sin(p.turn))>.5;
      assert.equal(o.width,rotated?d:w);assert.equal(o.depth,rotated?w:d);assert.equal(o.height,h);
      assert.equal(p.x,o.x);assert.equal(p.z,o.z);
      assert.ok(map.doors.every(door=>Math.hypot(Math.max(0,Math.abs(door.point.x-o.x)-o.width/2),Math.max(0,Math.abs(door.point.z-o.z)-o.depth/2))>=.65));
    }
    const root=map.rooms[plan.archetypes.find(a=>a.kind==='rootbound').room];
    assert.equal(map.floor[root.min.z*map.size+root.min.x],0);
    const chapel=map.rooms[plan.archetypes.find(a=>a.kind==='chapel').room];
    assert.ok(chapel.max.z-chapel.min.z>chapel.max.x-chapel.min.x);
    assert.ok(plan.damp.length>0);
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
  assert.ok(layouts.size>20);assert.equal(variants.size,12);
});
