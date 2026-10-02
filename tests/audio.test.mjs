import test from 'node:test';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import assert from 'node:assert/strict';
import { blowCue, blowCues, ImpactInbox, soundPlacement } from '../src/audio/cues.ts';
import { GameAudio } from '../src/audio/game-audio.ts';
const WOUND = { taken: [{ part: 'head', hp: 3 }], severed: [], lost: 0, spent: 3, ending: null };
// A core blow (`LandedBlow`) of 15 J from the hero's club to the enemy's head: `struck` patches the head's side, `patch` the blow.
const blow = (struck = {}, patch = {}) => ({ time: 1, point: [1, 1.6, 2], normal: [0, 0, 1], closing: 4, energy: 15, sides: [
  { fighter: 'hero', segment: 'hand.right', item: 'club', kg: 1, share: 0, damage: 0, wound: null },
  { fighter: 'enemy', segment: 'head', item: null, kg: 5, share: 1, damage: 3, wound: WOUND, ...struck },
], ...patch });

test('a blow sounds as the surface it struck, a clash as wood on wood, and a graze not at all', () => {
  const hit = blow(); const before = structuredClone(hit);
  assert.deepEqual(blowCue(hit, 'bone'), { key: 'hero:enemy', kind: 'bone', strength: .5, severed: false, point: { x: 1, z: 2 } });
  assert.equal(blowCue(hit, 'body').kind, 'body');
  // A clash: neither side took a share.
  const clash = blow({ share: 0, damage: 0, wound: null });
  assert.equal(blowCue(clash, 'body').kind, 'shield');
  assert.equal(blowCue(blow({ wound: { ...WOUND, severed: ['head'] } }), 'body').severed, true);
  assert.equal(blowCue(blow({}, { energy: 240 }), 'body').strength, 1);
  // Just under and just over the quietest cue.
  assert.equal(blowCue(blow({}, { energy: 60 * .034 ** 2 }), 'body'), null);
  assert.ok(blowCue(blow({}, { energy: 60 * .036 ** 2 }), 'body'));
  assert.equal(blowCue(blow({}, { energy: 0 }), 'body'), null);
  assert.deepEqual(hit, before);
});
test('a blow is heard once for each side it wounded, on that side\'s surface, and a clash once', () => {
  const surfaces = { hero: 'body', enemy: 'bone' }, surfaceOf = (fighter) => surfaces[fighter] ?? null;
  const hit = blow();
  assert.deepEqual(blowCues(hit, surfaceOf), [blowCue(hit, 'bone')]);
  // Both sides wounded: the hero's side first, as the blow lists them.
  const both = blow();
  both.sides[0] = { ...both.sides[0], share: .5, damage: 1, wound: WOUND };
  assert.deepEqual(blowCues(both, surfaceOf).map((cue) => cue.kind), ['body', 'bone']);
  const clash = blow({ share: 0, damage: 0, wound: null });
  assert.deepEqual(blowCues(clash, surfaceOf), [blowCue(clash, 'body')]);
  assert.deepEqual(blowCues(clash, surfaceOf).map((cue) => cue.kind), ['shield']);
  // A fighter the listener does not know is not heard; nor is a graze.
  assert.deepEqual(blowCues(hit, () => null), []);
  assert.deepEqual(blowCues(blow({}, { energy: 0 }), surfaceOf), []);
});
test('impact windows retain the strongest, distinguish attackers, bound bursts and drop stale events', () => {
  const inbox = new ImpactInbox(), cue = blowCue(blow(), 'bone');
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
test('browser audio voice limit and reset discard pending sounds and stop all sources', () => {
  // Exercise the resource owner without creating a browser or an audio device.
  const audio=Object.create(GameAudio.prototype); let stops=0;
  audio.listener={x:0,z:0};audio.toward={x:0,z:1};audio.dungeon=false;
  const voice=()=>({source:{stop(){stops++;}},gain:{gain:{cancelScheduledValues(){},setTargetAtTime(){}}}});
  audio.voices=new Set(Array.from({length:12},voice));audio.ambience=[voice(),voice()];audio.context={currentTime:0};audio.inbox=new ImpactInbox();
  const cue=blowCue(blow(),'body');audio.inbox.add(cue,0);
  audio.play=()=>assert.fail('voice cap must refuse a thirteenth source');audio.impact(cue);
  audio.reset();assert.equal(stops,14);assert.equal(audio.voices.size,0);assert.deepEqual(audio.ambience,[]);assert.deepEqual(audio.inbox.drain(100),[]);
});

test('synthesized buffers are finite, bounded, cached and have silent seams', () => {
  const audio=Object.create(GameAudio.prototype); audio.buffers=new Map(); let seed=123;
  audio.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  audio.context={sampleRate:48000,createBuffer:(_,n)=>{const data=new Float32Array(n);return {getChannelData:()=>data};}};
  for(const kind of ['bone','body','shield','debris','air','fire','drip']){
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
    audio.impact({...blowCue(blow(),'bone'), point:{x:15,z:20}});
    assert.deepEqual(played,[{kind:'bone',gain:(.08+.5*.5)*(dungeon?(1-5/18)**2:1),pan:-.5}]);
  }
});
