import test from 'node:test';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { impactCue, ImpactInbox, soundPlacement } from '../src/audio-cues.ts';
import { GameAudio } from '../src/game-audio.ts';
import { createBout, freshHavok } from './harness/bout-runner.mjs';
import { createHeadlessArena } from './harness/golem-headless-arena.mjs';
import { DungeonRun } from '../src/dungeon/run.ts';
import { classicDungeon } from './fixtures/classic-dungeon.mjs';
import { CONFIG } from '../src/config.ts';
const event = (patch = {}, extra = {}) => ({ blocked: false, ...extra, report: { energyJ: 15, speed: 4, solverImpulse: 1, point: { x: 1, z: 2 }, key: 'head', targetId: 'enemy', severed: false, ...patch } });

test('audio classifies real report distinctions without mutating reports', () => {
  const hit = event(); const before = structuredClone(hit);
  assert.equal(impactCue(hit, 'hero', 'golem').kind, 'stone');
  assert.equal(impactCue(hit, 'hero', 'skeleton').kind, 'bone');
  assert.equal(impactCue(hit, 'hero', 'human').kind, 'body');
  assert.equal(impactCue(event({}, { guarded: true }), 'hero', 'human').kind, 'metal');
  for (const key of ['block:shield','block:buckler'])
    assert.equal(impactCue(event({key,energyJ:0,damage:0},{blocked:true}),'hero','golem').kind,'shield');
  const blocked = impactCue(event({ energyJ: 0, damage: 0 }, { blocked: true }), 'hero', 'golem');
  assert.equal(blocked.kind, 'metal'); assert.ok(blocked.strength > 0);
  assert.equal(impactCue(event({ key: 'block:empty' }, { blocked: true }), 'hero', 'human').kind, 'body');
  assert.equal(impactCue(event({ severed: true }), 'hero', 'golem').severed, true);
  assert.equal(impactCue(event({ energyJ: 0, speed: 0, solverImpulse: 0 }), 'hero', 'golem'), null);
  assert.deepEqual(hit, before);
});
test('impact windows retain the strongest, distinguish attackers, bound bursts and drop stale events', () => {
  const inbox = new ImpactInbox(), cue = impactCue(event(), 'a', 'golem');
  inbox.add(cue, 0); inbox.add({ ...cue, strength: .9 }, 30); inbox.add({ ...cue, strength: .1 }, 40);
  inbox.add({ ...cue, key: 'b' }, 0);
  assert.deepEqual(inbox.drain(59), []);
  assert.deepEqual(inbox.drain(60).map(c => [c.key, c.strength]), [[cue.key, .9], ['b', cue.strength]]);
  inbox.add(cue, 100); assert.deepEqual(inbox.drain(301), []);
  for(let i=0;i<100;i++) inbox.add({ ...cue, key: String(i) }, 400);
  assert.equal(inbox.drain(460).length, 12);
  inbox.add(cue, 500); inbox.clear(); assert.deepEqual(inbox.drain(560), []);
});
test('camera bearings reverse sound pan and distant dungeon events are silent', () => {
  const p = {x: 5,z: 0}, origin = {x:0,z:0};
  assert.equal(soundPlacement(p, origin, {x:0,z:1}, false).pan, -.5);
  assert.equal(soundPlacement(p, origin, {x:0,z:-1}, false).pan, .5);
  assert.equal(soundPlacement({x:18,z:0}, origin, {x:0,z:1}, true).gain, 0);
});
function trace(hash, bodies) {
  for(const body of bodies) for(const limb of body.limbs) {
    const p=limb.part.mesh.position, q=limb.part.mesh.rotationQuaternion;
    hash.update(JSON.stringify([p.x,p.y,p.z,q.x,q.y,q.z,q.w,limb.health,limb.severed]));
  }
}
test('sound interpretation leaves real bout and dungeon trajectories identical', async () => {
  let reports = 0;
  async function bout(withAudio) {
    const hash=createHash('sha256'); const inbox=new ImpactInbox();
    const run=createBout({ left:'golem-duelist',right:'golem-duelist',seeds:[7,11],maxSeconds:4, locomotionMode:'supported', physics:await freshHavok(),
      onSample: ({left,right}) => trace(hash,[left,right]),
      onEvent: withAudio ? e => { reports++; const c=impactCue(e,e.side,'golem');if(c) inbox.add(c,e.report.at*1000); inbox.drain(e.report.at*1000); } : null });
    try { for(let i=0;i<240;i++) run.step(); return hash.digest('hex'); } finally {run.dispose();}
  }
  assert.equal(await bout(false),await bout(true)); assert.ok(reports>0,'the bout must actually exercise audio reports');
  reports=0;
  async function dungeon(withAudio) {
    const arena=await createHeadlessArena({populateDefaultGeometry:false}); const map=classicDungeon(42);
    map.spawns=[{x:map.start.x+2,z:map.start.z}]; const hash=createHash('sha256');
    const run=new DungeonRun(arena.scene,42,'default',false,map,undefined,[],()=> 'default',withAudio ? (id,e)=> { reports++; impactCue(e,id,'golem'); } : undefined);
    arena.scene.onBeforePhysicsObservable.add(()=>run.step(1/CONFIG.world.physicsHz));
    try { for(let i=0;i<240;i++){arena.scene._renderId++;arena.scene._advancePhysicsEngineStep(1000/60);trace(hash,run.actors.map(a=>a.body));} return hash.digest('hex'); }
    finally {run.dispose();arena.dispose();}
  }
  assert.equal(await dungeon(false),await dungeon(true)); assert.ok(reports>0,'the dungeon must actually forward reports');
});
test('browser audio voice limit and reset discard pending sounds and stop all sources', () => {
  // Exercise the resource owner without creating a browser or an audio device.
  const audio=Object.create(GameAudio.prototype); let stops=0;
  audio.listener={x:0,z:0};audio.toward={x:0,z:1};audio.dungeon=false;
  const voice=()=>({source:{stop(){stops++;}},gain:{gain:{cancelScheduledValues(){},setTargetAtTime(){}}}});
  audio.voices=new Set(Array.from({length:12},voice));audio.ambience=[voice(),voice()];audio.context={currentTime:0};audio.inbox=new ImpactInbox();
  const cue=impactCue(event(),'hero','golem');audio.inbox.add(cue,0);
  audio.play=()=>assert.fail('voice cap must refuse a thirteenth source');audio.impact(cue);
  audio.reset();assert.equal(stops,14);assert.equal(audio.voices.size,0);assert.deepEqual(audio.ambience,[]);assert.deepEqual(audio.inbox.drain(100),[]);
});

test('synthesized buffers are finite, bounded, cached and have silent seams', () => {
  const audio=Object.create(GameAudio.prototype); audio.buffers=new Map(); let seed=123;
  audio.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  audio.context={sampleRate:48000,createBuffer:(_,n)=>{const data=new Float32Array(n);return {getChannelData:()=>data};}};
  for(const kind of ['stone','bone','body','metal','shield','debris','air','fire','drip']){
    const buffer=audio.buffer(kind), data=buffer.getChannelData(0);
    assert.equal(audio.buffer(kind),buffer,'buffers are reused');
    assert.ok(data.every(Number.isFinite));
    assert.ok(data.some(v=>Math.abs(v)>.01),`${kind} must be audible`);
    assert.ok(data.every(v=>Math.abs(v)<=1),`${kind} clips`);
    assert.equal(Math.abs(data[0]),0);assert.ok(Math.abs(data.at(-1))<.001,`${kind} has a seam click`);
  }
});


test('audio copies Babylon vector coordinates before positioning arena and dungeon impacts', () => {
  for (const dungeon of [false,true]) {
    const audio=Object.create(GameAudio.prototype);
    audio.voices=new Set();audio.dungeon=dungeon;
    const listener=new Vector3(10,0,20), toward=new Vector3(0,0,1);
    audio.setView(listener,toward);
    listener.x=999; toward.z=-1; // The audio view is a snapshot, not a reference.
    const played=[]; audio.play=(kind,gain,pan)=>played.push({kind,gain,pan});
    audio.impact({...impactCue(event(),'hero','golem'), point:{x:15,z:20}});
    assert.deepEqual(played,[{kind:'stone',gain:(.08+.5*.5)*(dungeon?(1-5/18)**2:1),pan:-.5}]);
  }
});
