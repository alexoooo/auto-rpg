# art-09 — blows look like blows

**Goal:** a landed blow throws blood, marks the floor, and moves the body it landed on, using
the numbers the sim already measured. Blood is the only saturated thing on screen.

**Leaves the game:** fights that read. This is the session where the combat model, which has been
legible as *geometry* since the swordplay landed, becomes legible as *impact*.

**Depends on:** `art-03` (`DAMAGE` carries mass and radius, `SHOVE` and `DEATH` exist), `art-05`
(something to displace) and `art-04` (both pools emit items; neither touches a context).

**Not** `art-08`. Blood is drawn against whatever body is there, sprite or fallback, and a recoil
tilts a composite sprite exactly as it tilts seven segments. If the character batch has not landed
when this session comes up, it lands anyway.

---

## 1. Randomness comes from the event, not from a clock

The brief says "render-side RNG". This file already has a stronger convention and it should win:
`consumeEvents` jitters overlapping damage floaters with `((i * 7) % 5) / 5 - 0.4` and says why —
*"From the index and not from `Math.random`, so a run looks the same twice"* (`main.js:8656-8660`).

So blood is seeded from the event, not from a free-running stream:

```js
/** A spray's seed: the tick it happened on, who it happened to, and its place in
 *  that tick's feed. Render-side and never the sim's RNG -- but *repeatable*,
 *  which a free-running stream is not: watch the same fight twice and the blood
 *  falls the same way, which is the property `consumeEvents`' floater jitter
 *  already buys and which a replay makes worth having. */
function sprayRng(tick, actor, i) { /* mix into a small xorshift, as grainRandom */ }
```

`grainRandom` (`main.js:4884`) is the xorshift to copy; it is already the file's answer to "a
decision rather than a roll".

## 2. Three pools, all bounded, none allocating per frame

| pool | size | lifetime | space |
|---|---|---|---|
| `sprays` — airborne droplets | 192 | ~450 ms | depth layer |
| `stains` — floor decals | 48 | permanent until evicted, fading over the last quarter of the pool | ground layer |
| `recoils` — per-body displacement | one slot per live body, on `bodies` | ~200 ms | inside the rig |

Preallocated at boot and written in place, on exactly the argument the parse pool makes
(`main.js:786-796`): the render path allocates nothing once the page is running, and 192 objects
a second thrown at the collector is the most likely source of a sawtooth in the worst-frame
column.

`floaters` and `callouts` (`main.js:2103-2104`, `ageEffects:8680`) are the shape to copy for
ageing and eviction: aged on the wall clock, pushed in time order, dropped from the front.

## 3. What each event spawns

| event | reaction |
|---|---|
| `DAMAGE` | droplets along the blow's own direction, count and speed from `amount`, colour `PAL.bloodHot` fading to `PAL.blood`. One stain seeded where they land. `aux0` (target mass) damps the throw: a heavy body absorbs a blow that would spin a light one |
| `BLOCK` | **no blood.** Sparks in `PAL.bone`, short and few, on the rim the blow landed on. A blocked blow drew no health and drawing blood for one would be a lie about the mechanic — the same discipline `drawLimb`'s role gates keep |
| `PARRY` | nothing new. `drawMarks` already puts sparks on both blades at the point they crossed, and `consumeEvents` already declines to float it because a second announcement of the same instant is noise (`main.js:8670-8672`) |
| `SHOVE` | seeds the recoil the rig tilts on. Magnitude straight off the event; **no translation of the feet**, for the reason `art-05` §4 gives |
| `DEATH` | a heavier, slower spray; one large stain under the body; the corpse settle that already exists |

**`hitFlash` stays exactly as it is.** It is a frame column the sim owns, it fires on the tick the
blow lands, and it is one white fill of the silhouette. Blood does not replace it — the flash says
*that* something landed and the blood says *how hard*.

## 4. Where they draw

**Stains go in the ground layer, inside the floor passes' own clips**, alongside `art-07`'s
grime decals and for the same reason: the fog is the authority. A stain on a tile the character
has never seen is not drawn; a stain on a remembered tile fades with the ground at `SEEN_ALPHA`.

Each stain is one fill in `groundSpace(x, y)` — an ellipse on the floor for free, because that is
what the shear does to a circle — with a couple of satellite blobs from the same seed. **No
gradient per stain.** One shared radial gradient built once at module scope, or flat fills at two
alphas; a `createRadialGradient` per stain per frame is 48 gradients a frame in a file whose
render path builds none.

**Sprays go in the depth layer**, emitted with their own ground point as the depth key so a
droplet thrown behind a wall goes behind it — beside the body, corpse and shot items that
`art-04` §6 turned `ITEM_BODY`, `ITEM_CORPSE` and `ITEM_SHOT` (`main.js:8932`) into. Each droplet
is one `ELLIPSE`. Free, per `DESIGN.md`; and specifically **never a `PATH_STROKE`**, which is the
one primitive that is not.

Both go through `groundSpace` where they lie flat, which makes them the fifteenth and sixteenth
entries in **the register in `groundSpace`'s doc comment** (`main.js:4522-4538`). Add them there
in the same commit — `art-00` §2.

## 5. Bounding the stains honestly

48 stains over a long floor is not many, and a floor that never fills up with blood is a floor
where a long fight leaves no trace. The eviction rule matters more than the number:

- evict oldest-first, and **fade the oldest quarter of the pool** rather than popping one out of
  existence;
- clear the pool on descent (`EVENT_DESCEND`) — a new floor is a new floor;
- do **not** merge or bake stains into the floor pattern. That would be a per-level offscreen
  canvas invalidated by every zoom bucket, to save fills that `DESIGN.md` measured as free.

## 6. Saturation discipline

`PAL.blood` and `PAL.bloodHot` are the only chroma this session introduces, and the brief's rule
is that they are the only chroma the room has besides the flame and the two thin team rings.

The check is not a code review, it is a screenshot: take one mid-fight, desaturate it, and the
blood should be the thing that vanishes. If anything else does, that thing has too much colour.

**Record that check in `DESIGN.md`'s "Art direction" section** — two lines, the method and what it
found — as the append `art-01` §7 schedules for this session. The rule that chroma is reserved is
already written there; what this session contributes is the test that makes it enforceable by
somebody who was not here.

---

## Acceptance test

1. A Brute's axe landing on a Fighter throws visibly more blood than a Skitterer's bite, and the
   difference tracks `amount` rather than a constant.
2. A blocked blow throws sparks and **no blood**, at any magnitude.
3. Blood is the only saturated thing in a mid-fight screenshot.
4. Stains accumulate through a long fight, fade at the back of the pool rather than popping, and
   are gone on the next floor.
5. A stain on floor the character has never seen is not drawn. A stain on remembered floor fades
   with the ground.
6. Droplets thrown toward a wall go behind it.
7. **Watch the same fight twice** — same seed, same inputs — and the blood falls the same way.
8. A shove tilts the body and does not move its feet off the collision ring.
9. No frame-rate movement at a full room with a brawl running, measured with a repeated baseline.
10. `[tactical]` and `[dev]` are byte-identical: none of this is drawn with the art off.

## Tripwires

All five. No Rust changed.

## Explicitly not in this session

- Restyling the ghost fade to an ember afterimage. It is allowed by the brief only if equally
  readable, its timings are a gameplay feature, and it is a separate change with its own before
  and after.
- Dismemberment, gibs, or anything that implies a body part the sim does not have.
