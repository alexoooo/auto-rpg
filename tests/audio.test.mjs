import test from 'node:test';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import assert from 'node:assert/strict';
import { CueInbox, debrisCues, impactCue, soundPlacement, swishStrength, voiceOf } from '../src/audio/cues.ts';
import { GameAudio } from '../src/audio/game-audio.ts';
const WOUND = { taken: [{ part: 'head', hp: 3 }], severed: [], lost: 0, spent: 3, ending: null };
// A core blow (`LandedBlow`) of 15 J from the hero's club to the enemy's head: `struck` patches the head's side, `patch` the blow.
const blow = (struck = {}, patch = {}) => ({ time: 1, point: [1, 1.6, 2], normal: [0, 0, 1], closing: 4, energy: 15, sides: [
  { fighter: 'hero', segment: 'hand.right', item: 'club', kg: 1, share: 0, damage: 0, wound: null },
  { fighter: 'enemy', segment: 'head', item: null, kg: 5, share: 1, damage: 3, wound: WOUND, ...struck },
], ...patch });

test('what a blow took off is debris, for each side it took something off, as loud as that side\'s share, of a pair of its own', () => {
  const hit = blow(), off = blow({ wound: { ...WOUND, severed: ['forearm.right', 'hand.right'] } }), before = structuredClone(off);
  assert.deepEqual(debrisCues(off), [{ key: 'enemy:debris', kind: 'debris', strength: .5, point: { x: 1, z: 2 } }]);
  // A blow that took nothing off, and a clash, in which neither side took a share.
  assert.deepEqual(debrisCues(hit), []);
  assert.deepEqual(debrisCues(blow({ share: 0, damage: 0, wound: null })), []);
  assert.equal(debrisCues({ ...off, energy: 240 })[0].strength, 1);
  // Both sides lose a part: the hero's side first, as the blow lists them, each as loud as its share.
  const both = structuredClone(off);
  both.sides[0] = { ...both.sides[0], share: .25, damage: 1, wound: { ...WOUND, severed: ['hand.right'] } };
  both.sides[1] = { ...both.sides[1], share: .75 };
  assert.deepEqual(debrisCues(both).map((cue) => [cue.key, cue.strength]), [['hero:debris', Math.sqrt(.25 * 15 / 60)], ['enemy:debris', Math.sqrt(.75 * 15 / 60)]]);
  // Just under and just over the quietest cue.
  assert.deepEqual(debrisCues({ ...off, energy: 60 * .012 ** 2 }), []);
  assert.equal(debrisCues({ ...off, energy: 60 * .013 ** 2 }).length, 1);
  assert.deepEqual(off, before);
});
test('impact windows retain the strongest of a pair, keep pairs apart, bound bursts and drop stale events', () => {
  const inbox = new CueInbox(), cue = impactCue('hero:enemy', 'bone', 15, { x: 1, z: 2 });
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
  const voice=()=>({source:{stop(){stops++;}},gain:{gain:{cancelScheduledValues(){},setTargetAtTime(){}}},level:1});
  audio.voices=new Set(Array.from({length:12},voice));audio.ambience=[voice(),voice()];audio.airs=new Map([['hero',{voice:voice()}]]);
  audio.context={currentTime:0};audio.inbox=new CueInbox();
  const cue=impactCue('hero:enemy','body',15,{x:1,z:2});audio.inbox.add(cue,0);
  audio.play=()=>assert.fail('voice cap must refuse a thirteenth source no louder than the twelve');audio.impact(cue);
  audio.reset();assert.equal(stops,15);assert.equal(audio.voices.size,0);assert.deepEqual(audio.ambience,[]);assert.equal(audio.airs.size,0);assert.deepEqual(audio.inbox.drain(100),[]);
});

test('a louder blow takes the quietest voice when every voice is playing', () => {
  const audio = Object.create(GameAudio.prototype), stopped = [], played = [];
  audio.listener = { x: 0, z: 0 }; audio.toward = { x: 0, z: 1 }; audio.dungeon = false; audio.context = { currentTime: 0 };
  const voice = (level) => ({ level, source: { stop() { stopped.push(level); } }, gain: { gain: { cancelScheduledValues() {}, setTargetAtTime() {} } } });
  // Twelve voices, the quietest at .1 in the middle of them.
  audio.voices = new Set([.5, .4, .3, .1, .2, .6, .5, .4, .3, .2, .6, .5].map(voice));
  audio.play = (kind, level) => { played.push([kind, level]); audio.voices.add(voice(level)); };
  // A cue of strength .04 plays at .08 + .5 * .04 = .1: no louder than the quietest, and dropped.
  audio.impact({ key: 'a', kind: 'body', strength: .04, point: { x: 0, z: 0 } });
  assert.deepEqual([stopped, played, audio.voices.size], [[], [], 12]);
  // One of strength .5 plays at .33, in the quietest's place.
  audio.impact({ key: 'a', kind: 'bone', strength: .5, point: { x: 0, z: 0 } });
  assert.deepEqual([stopped, played, audio.voices.size], [[.1], [['bone', .08 + .5 * .5]], 12]);
  // With a voice to spare, nothing is stopped.
  audio.voices.delete([...audio.voices][0]);
  audio.impact({ key: 'a', kind: 'bone', strength: .04, point: { x: 0, z: 0 } });
  assert.deepEqual([stopped.length, played.length, audio.voices.size], [1, 2, 12]);
});

test('debris plays at its own gain, and a cue of no known kind is refused', () => {
  const audio = Object.create(GameAudio.prototype), played = [];
  audio.listener = { x: 0, z: 0 }; audio.toward = { x: 0, z: 1 }; audio.dungeon = false; audio.voices = new Set();
  audio.play = (kind, level, pan) => played.push([kind, level, pan]);
  audio.impact({ key: 'enemy:debris', kind: 'debris', strength: .5, point: { x: 5, z: 0 } });
  audio.impact({ key: 'hero:enemy', kind: 'body', strength: .5, point: { x: 5, z: 0 } });
  assert.deepEqual(played, [['debris', .18 * .5, -.5], ['body', .08 + .5 * .5, -.5]]);
  assert.throws(() => audio.impact({ key: 'a', kind: 'air', strength: .5, point: { x: 0, z: 0 } }), /no gain for a cue of air/);
});

test('the softer surface decides the voice', () => {
  const voice = { flesh: 'body', bone: 'bone', wood: 'shield' }, order = ['flesh', 'bone', 'wood', 'stone'];
  for (const a of order) for (const b of order) {
    if (a === 'stone' && b === 'stone') { assert.throws(() => voiceOf(a, b), /stone on stone/); continue; }
    assert.equal(voiceOf(a, b), voice[order[Math.min(order.indexOf(a), order.indexOf(b))]], `${a} on ${b}`);
  }
});

test('a touch is as loud as the root of its energy over 60 J, and one too quiet is no cue', () => {
  assert.deepEqual(impactCue('hero:ground', 'body', 15, { x: 1, z: 2 }), { key: 'hero:ground', kind: 'body', strength: .5, point: { x: 1, z: 2 } });
  assert.equal(impactCue('a', 'bone', 600, { x: 0, z: 0 }).strength, 1);
  // The quietest footfall measured, 0.0099 J, is heard; the hardest a sole was laid down, 0.0083 J, is not.
  assert.ok(Math.abs(impactCue('a', 'bone', .0099, { x: 0, z: 0 }).strength - Math.sqrt(.0099 / 60)) < 1e-12);
  assert.equal(impactCue('a', 'bone', .0083, { x: 0, z: 0 }), null);
  assert.equal(impactCue('a', 'bone', NaN, { x: 0, z: 0 }), null);
  // The point is copied: a Babylon vector's coordinates sit behind getters, and it moves on.
  const at = new Vector3(3, 1, 4), cue = impactCue('a', 'body', 15, at); at.x = 99;
  assert.deepEqual(cue.point, { x: 3, z: 4 });
});

test("air is nothing under a walk and all of it at a club's end", () => {
  assert.deepEqual([4.4, 5, 12.5, 20, 25].map(swishStrength), [0, 0, .5, 1, 1]);
});

test('a swish is one voice a key that follows its speed and stops when it is still', () => {
  const audio = Object.create(GameAudio.prototype), log = [];
  audio.listener = { x: 0, z: 0 }; audio.toward = { x: 0, z: 1 }; audio.dungeon = false; audio.context = { currentTime: 7 };
  audio.airs = new Map(); audio.inbox = new CueInbox(); audio.ready = () => true;
  const param = (name) => ({ cancelScheduledValues() {}, setTargetAtTime: (value, at, seconds) => log.push([name, value, at, seconds]) });
  audio.play = (kind, volume, pan, loop) => { log.push(['play', kind, volume, pan, loop]);
    return { source: { playbackRate: param('rate'), stop: (at) => log.push(['stop', at]) }, gain: { gain: param('gain') }, pan: { pan: param('pan') } }; };
  // No faster than a walk's fastest foot: no voice is made.
  audio.swish('hero', 4.4, { x: 0, z: 0 }); audio.update();
  assert.deepEqual([log, audio.airs.size], [[], 0]);
  // At 12.5 m/s, half its air, 5 m to the listener's right: one looping voice from silence, then its gain, pitch and pan.
  audio.swish('hero', 12.5, { x: -5, z: 0 }); audio.swish('hero', 12.5, { x: -5, z: 0 }); audio.update();
  assert.deepEqual(log, [['play', 'swish', 0, 0, true], ['gain', .3 * .5, 7, .04], ['rate', .7 + .8 * .5, 7, .04], ['pan', .5, 7, .04]]);
  // Faster, the same voice follows.
  log.length = 0; audio.swish('hero', 20, { x: 0, z: 0 }); audio.update();
  assert.deepEqual(log, [['gain', .3, 7, .04], ['rate', 1.5, 7, .04], ['pan', 0, 7, .04]]);
  // Still, it fades and stops; and so does one the page stops giving.
  log.length = 0; audio.swish('hero', 2, { x: 0, z: 0 }); audio.update();
  assert.deepEqual([log, audio.airs.size], [[['gain', 0, 7, .008], ['stop', 7.04]], 0]);
  audio.swish('hero', 20, { x: 0, z: 0 }); audio.update(); log.length = 0; audio.update();
  assert.deepEqual([log, audio.airs.size], [[['gain', 0, 7, .008], ['stop', 7.04]], 0]);
  // Not ready (muted, or no gesture yet), nothing is made.
  audio.ready = () => false; log.length = 0; audio.swish('hero', 20, { x: 0, z: 0 });
  assert.deepEqual([log, audio.airs.size], [[], 0]);
});

test('synthesized buffers are finite, bounded, cached and have silent seams', () => {
  const audio=Object.create(GameAudio.prototype); audio.buffers=new Map(); let seed=123;
  audio.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  audio.context={sampleRate:48000,createBuffer:(_,n)=>{const data=new Float32Array(n);return {getChannelData:()=>data};}};
  for(const kind of ['bone','body','shield','debris','air','fire','drip','swish']){
    const buffer=audio.buffer(kind), data=buffer.getChannelData(0);
    assert.equal(audio.buffer(kind),buffer,'buffers are reused');
    assert.ok(data.every(Number.isFinite));
    assert.ok(data.some(v=>Math.abs(v)>.01),`${kind} must be audible`);
    assert.ok(data.every(v=>Math.abs(v)<=1),`${kind} clips`);
    assert.equal(Math.abs(data[0]),0);assert.ok(Math.abs(data.at(-1))<.001,`${kind} has a seam click`);
    // A loop of noise fades through its seam over 50 ms: from 5 to 25 ms it is at a tenth to a half
    // of itself, a third as loud as its middle, where a sound that plays once is whole by 2 ms.
    if(kind==='fire'||kind==='swish'){
      const rms=(from,to)=>Math.sqrt(data.slice(from,to).reduce((sum,v)=>sum+v*v,0)/(to-from));
      const seam=rms(240,1200)/rms(4800,data.length-4800);
      assert.ok(seam>.15&&seam<.55,`${kind}: ${seam} of its middle through its seam`);
    }
  }
});


test('audio copies Babylon vector coordinates before positioning arena and dungeon impacts', () => {
  for (const dungeon of [false,true]) {
    const audio=Object.create(GameAudio.prototype);
    audio.voices=new Set();audio.airs=new Map();audio.dungeon=dungeon;
    const listener=new Vector3(10,0,20), toward=new Vector3(0,0,1);
    audio.setView(listener,toward);
    listener.x=999; toward.z=-1; // The audio view is a snapshot, not a reference.
    const played=[]; audio.play=(kind,gain,pan)=>played.push({kind,gain,pan});
    audio.impact({key:'hero:enemy',kind:'bone',strength:.5,point:{x:15,z:20}});
    assert.deepEqual(played,[{kind:'bone',gain:(.08+.5*.5)*(dungeon?(1-5/18)**2:1),pan:-.5}]);
  }
});
