# art-11 — the rest of the soundscape

**Goal:** every remaining voice, the audio telegraph that lasts exactly as long as the telegraph,
and the tuning pass that makes the whole thing one room rather than nine sounds.

**Leaves the game:** finished, for this arc.

**Depends on:** `art-10`.

---

## 1. The windup telegraph, which is the best thing in this session

`EVENT_DECLARE` fires on the tick an attack begins. The declaring unit's row carries `swingSpan`
— the phase's full length in ticks, added in `art-03`. So:

```
duration = swingSpan / TICKS_PER_SECOND    // seconds, exactly
```

A rising, filtered noise-and-tone swell that begins at windup start and **resolves precisely when
the blade commits.** A Brute's axe is 33 ticks, 550 ms, a long climbing creak you have time to
answer. A Punch is 5 ticks, 83 ms, a tick you do not.

**This is the audio version of hard constraint 3 and it is the strongest form of it available.**
The visual telegraph — the amber declared line, the cocked blade — is the single most useful
thing on the canvas (`main.js:7160-7163`). Its audio twin is a sound whose *length is the
information*. A player can learn to dodge by ear, and the AI is scored on reading the same tell.

Pitch and weight scale with the action's mass, which the page has from the registry via the
action code in `amount`.

**Interruption is the part that will be got wrong.** A windup that is cut short — the swinger
dies, is staggered into a swap, or the action changes — must release its envelope immediately,
not run to its scheduled end. Keep one voice handle per entity index; any `EVENT_PHASE` leaving
`SWING_WINDUP`, and any `EVENT_DEATH`, releases it. A telegraph that finishes after the fighter
that started it is worse than no telegraph, because it is a lie the player will act on.

## 2. The rest of the voices

| voice | fires on | parameters, and where from |
|---|---|---|
| **strike** | `PHASE` windup → strike | a short bright whoosh. Speed from the row's `limbSpin`, which is what `drawLimb`'s smear already reads (`main.js:7254`); length from `swingSpan` |
| **recovery** | `PHASE` strike → recover | nothing, deliberately. The most punishable moment in the game is a *silence*, and filling it would hide it |
| **footstep** | `STEP` | filtered thump. Weight from `aux0` (mass), brightness and gain from `amount` (speed). Rate-matched by construction — `art-03` §4 fires the event on the stride wrap, so the sound lands when the foot lands and the leg in `art-05` is on the same clock |
| **swap** | `PHASE` into or out of `SWING_SWAP` | a dull clink and a scrape. Short. A fighter changing its mind is the most punishable it ever gets and the sound should say "busy", not "ready" |
| **string** | `LOOSE` | a snap and a brief air tone. `aux0` carries the line's raw angle if a pitch tilt is wanted; the position is the nock |
| **arrow impact** | `DAMAGE` where `at` is far from the source's position | a thunk with a wooden body rather than the blade family's ring. **Derivable and honest**: `event.rs:55-59` deliberately reports a landed shot as `Damage` so no consumer has to learn archery exists, and the distance between the impact point and `other`'s row is what tells one apart when a consumer wants to |
| **portal** | `PORTAL` / `DESCEND` | a very quiet cold drone: two detuned low tones through a heavy low-pass, started when it opens, stopped on descent or restart. `PAL.cold` is the visual and this is its sonic twin — the only thing in the soundscape that is not warm or dull |
| **descent** | `DESCEND` | one stinger: a low swell and a long dull tail into the new floor's silence |

Every one of them lands in `art-10`'s `VOICES` table. No constant goes inline.

> **The portal drone has a known hole, recorded in `art-03` rather than fixed there.**
> `Sim::descend` calls `open_the_way_out()` *outside* the portal edge test in `Sim::advance`, so a
> floor that arrives already clear opens its way out with **no `EVENT_PORTAL` row behind it** and
> this drone would never start on it. Judged unreachable in play — a generated floor always has
> somebody standing on it, so it is a fixture-only path today — which is why `art-03` left it
> alone rather than papering it over. It stops being free the moment a sound keys off that edge,
> and the fix at that point is to move the edge test *into* `open_the_way_out` so there is one of
> it, not to add a second that can disagree with the first. `crates/web/src/lib.rs`'s `descend`
> carries the same note in place.

## 3. Footsteps need a leash

64 bodies walking is up to five footfalls a frame at `MAX_UNITS`, all of them uninteresting.

- Gate on distance harder than anything else — a footfall past a few units is inaudible and
  should not become a voice at all, rather than becoming a voice at zero gain.
- The hero's own footsteps get a small boost. They are the ones the player is listening for.
- Let `art-10`'s quietest-first voice eviction do the rest; footsteps are exactly what it should
  be dropping when a brawl saturates.

## 4. The question `art-03` deferred: should you hear what you cannot see?

`consumeEvents` filters every row on `actorVisible` (`main.js:8648`), so today's answer is no,
and the audio consumes the same filtered feed.

**Keep it that way in this session.** Hearing an unseen monster is a genuinely good mechanic and
it is a *gameplay* change: it hands the player information the character's perception did not
give them, in a game whose fog is a mechanic and whose AI is scored against what it can perceive.
This project's standing discipline is that a gameplay change gets its own change with its own
before and after — the same reason `iso-07` declined to apply the aim snap to top-down.

So: implement the conservative version, and **write the question into `DESIGN.md`'s open
questions** with the argument on both sides and the one line it would take to try it. That is the
honest deliverable, and it is more useful than either answer chosen silently.

## 5. The tuning pass

The session's real work, and it is listening rather than typing.

- Play a whole floor. Every sound in the game is in one room, at one reverb, at one distance law.
  If any voice sounds like it is in a different room, its send or its filter is wrong.
- **Balance against silence, not against each other.** The concept's mood is oppressive
  darkness; the soundscape's is oppressive quiet, with footsteps and a torch's hiss and then
  something happening. If the room is never quiet, everything is too loud.
- The final check is the same one the palette got: run the game beside `web/assets/CONCEPT.png`
  with the sound on, and ask whether the picture and the noise are describing the same place.

## 6. Write it down

Add a short section to `DESIGN.md` — the file is where this project records what it measured and
what it decided:

- that all audio is synthesised and there are no audio assets, and why that is a feature;
- that voice parameters come from event columns and the tuning table and nowhere else;
- the mass → pitch and energy → brightness laws, so the next person changing `Body::mass` knows
  it changes how the game sounds;
- the open question from §4.

---

## Acceptance test

1. **A Brute's windup is audibly longer than a Rogue's, and both resolve exactly on the strike.**
   Time one against the tick counter.
2. Kill a fighter mid-windup. Its telegraph stops immediately.
3. Footsteps match the legs. Watch a Skitterer and a Brute walk side by side with the sound on;
   the fast feet and the fast sound are the same feet.
4. A bow: string snap at the nock, silence across the room, thunk at the target — and the thunk
   is distinguishable from a sword landing on the same body.
5. Clear a floor. The portal's drone starts at the kill, is quiet enough to sit under everything,
   and stops on descent.
6. Play for five minutes without wanting to press `M`.
7. **Nothing audible is ever a body the player cannot see** — §4's conservative answer, checked
   by walking away from a fight behind a wall.
8. Full-room brawl: no clipping, no dropped frames, the voice cap visible in the console but not
   biting in ordinary play.

## Tripwires

All five. No Rust changed.

## Explicitly not in this session

- Music, ambience beds, or a room tone. The brief asks for event-driven sound and the concept's
  mood is silence with things in it.
- Voice, breathing, or grunts. They are performance rather than physics and there is nothing in
  the sim to derive them from.
- Hearing through the fog. §4.
