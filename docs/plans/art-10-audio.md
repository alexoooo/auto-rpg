# art-10 — the audio spine

**Goal:** a Web Audio module that unlocks legally, routes the frame's event feed to synthesised
voices, places every sound in the room, and can be muted — plus the impact family, whose
parameters come from the sim's own physics rather than from constants.

**Leaves the game:** blows have weight. A Brute being hit sounds heavier than a Skitterer being
hit **because it is**, and that is checkable blind.

**Depends on:** `art-03`. Every voice's parameters come out of the event row.

**There are no audio files in this project and there will not be.** Everything is generated.

---

## 1. `web/audio.js`

Classic script before `main.js`, like `rig.js` and `assets.js`. One object, `audio`, with four
methods the page calls: `audio.unlock()`, `audio.fire(event, state)`, `audio.frame(now)`,
`audio.toggleMute()`.

**Nothing outside this file knows Web Audio exists.** `consumeEvents` gains one line.

### Unlock

Browsers refuse to start an `AudioContext` without a gesture. So: no context at boot, and the
first `pointerdown` or `keydown` — the listeners are already bound (`main.js:3528`, `3630`) —
calls `audio.unlock()`, which constructs the context, builds the graph, and detaches itself.

Every event fired before that is **dropped silently**, not queued. A queue would empty a fight's
worth of impacts into the room the instant the player first clicked.

### Degradation

Wrap construction and every node build in `try`/`catch`. On any failure: log once, set
`audio.enabled = false`, and never touch the API again. **Audio may never block rendering or
input** — the brief's last clause on Part 4 and the only hard rule in the whole session.

### The graph

```
voice ──┬─────────────────────────────► dry ──┐
        └── send gain ──► convolver ──► wet ──┴──► master gain ──► destination
```

- **`master`** at a modest default — 0.35 — because a game that arrives loud is a game that gets
  muted before it is heard.
- **One shared convolver, tuned to "stone room."** Its impulse response is *generated*: an
  `AudioBuffer` of two channels of noise under an exponential decay of about 1.1 s, low-passed
  so the tail is dull rather than bright, with a short pre-delay. Built once at unlock. A
  cathedral is a big dull room and a big dull room is the easiest impulse response there is.
- **Wet mix low** — 0.12 to 0.18. The reverb's job is to say the fight is indoors, not to smear
  the transients that carry the physics.

### One shared noise buffer

Every noise transient in the whole soundscape is a `BufferSource` reading from **one**
two-second `AudioBuffer` of white noise, generated at unlock, played from a random offset under a
short gain envelope through a filter.

Generating noise per hit would be the only per-event allocation in the module that mattered, and
it buys nothing: a random offset into two seconds of noise is indistinguishable from fresh noise
and costs a pointer.

### Voice budget

A `Shift+S` full-room brawl can produce eighty event rows in one animation frame. Cap concurrent
voices at **24**, dropping the *quietest* pending sound rather than the oldest — an impact whose
loudness came out near zero is one nobody was going to hear, and the loud ones are the ones that
carry information.

Count them and expose the count, so "the cap does not bite in normal play" is checkable from the
console rather than believed. That is `floorBakes`' instrument again (`main.js:4869`).

## 2. Placement: distance and pan

Every event row carries `x, y`. The camera centre is `cam` (`main.js:1944`).

- **Distance attenuation** from `hypot(event.x - cam.x, event.y - cam.y)` in world units, rolling
  off over roughly the vision range so a fight at the edge of what you can see is faint.
- **Pan** from the *screen* offset, not the world offset. `projX(event.x, event.y) - projX(cam.x,
  cam.y)`, normalised over half the viewport. What the player wants is for a sound on the left of
  their screen to come from the left of their headphones, and under an isometric projection the
  world x-axis is not the screen x-axis. This is `art-02`'s lesson in a different medium and it
  is the same mistake waiting in the same place.
- One `StereoPannerNode` per voice; no `PannerNode`, no HRTF, no listener orientation. The game
  is a fixed-camera 2D room.

## 3. Variation, seeded from the event

Small jitter on pitch (±3%), filter cutoff (±15%) and envelope times (±20%) so repeated hits
never machine-gun.

**From the event's own seed, not from `Math.random`.** `art-09` §1 has the argument and the
function: the same fight watched twice should *sound* the same, which is a property this file's
existing floater jitter already buys and a free-running stream throws away. Reuse `sprayRng`.

## 4. The tuning table

One object mapping event kind to base parameters, and **every constant in the module lives in
it**:

```js
const VOICES = {
  [EVENT_DAMAGE]: {
    gain: 0.9,
    transient: { hz: 1800, q: 0.9, ms: 18 },   // filtered noise: the contact
    body:      { hz: 190, ms: 260, type: "sine" }, // the thing that rings
    send: 0.16,
  },
  [EVENT_BLOCK]: { … },
  …
};
```

The point is a single surface to tune the whole soundscape from, and the discipline is that a
number tuned by ear ends up here rather than inline. A magic number inside a voice builder is a
number nobody will find in three weeks.

## 5. The impact family, and where each parameter comes from

The rule for every voice in this project: **a parameter is a function of an event column or it is
in `VOICES`, and nothing in between.**

### `DAMAGE` — a blow that took health

Two layers over the shared reverb send.

| parameter | from | why |
|---|---|---|
| loudness | `amount` | damage **is** kinetic energy times the power multiplier (`DESIGN.md`, "Damage is kinetic energy"), so `amount` is an honest energy proxy. Say "proxy" in the comment; do not claim it is the raw figure |
| transient brightness | `amount` | a harder blow is a brighter contact. Map to the bandpass cutoff |
| body pitch | `aux0`, the target's **mass** | `f ∝ 1/sqrt(mass)`. This is the whole feature: a Brute rings low because a Brute is heavy |
| body decay | `aux0` | heavier rings longer |
| position | `x, y` | §2 |

That mass column is the entire reason `art-03` put it on `UnitView` rather than letting the page
compute it from the radius, and this is where it pays: **a Brute hit and a Skitterer hit must be
distinguishable with your eyes shut**, and that is the session's headline gate.

### `BLOCK` — a blow a guard ate

Metallic rather than dull: two or three detuned partials, short, plus a bright noise tick.
Sharpness — cutoff and partial spread — scales with `amount`, which is what the shield absorbed.

**No low body.** A block is a thing hitting a thing that did not give, and giving it the same
resonant body as a landed blow would make the two indistinguishable, which is exactly the
distinction `drawMarks` exists to draw (`main.js:7303-7307`).

### `PARRY` — two blades crossed

Brighter and shorter than a block, two voices, no body at all. One row per pair, never two —
`Event::Parry` reports once with the lower index first and `crates/sim/src/event.rs:42-46` says
why.

### `DEATH` — heavier, longer, and then a fall

The damage voice at a longer decay and a lower body, plus a second sound a beat later: a
low-passed noise swell under a soft thud, the body arriving on the floor. `aux0` is the mass
again and `aux1` is the body kind, so a Skitterer's fall is a scuff and a Brute's is a drop.

## 6. Mood

Dark and dull. Low-passed noise, low sine and triangle bodies, short decays, the stone reverb at
a low mix. No square waves, no detuned saws, nothing arcade-bright.

The test is the same one the palette got: play it beside the concept image and ask whether they
are describing the same room.

## 7. Mute

`M`, which is unbound today — the full key map is audited in `art-02` §3 and there is no
collision. Repeat-guarded like `g` and `p`. It goes in the keys overlay, and the mute state
persists for the session but is not written to storage; this page has no storage and is not
gaining any here.

---

## Acceptance test

1. **No console error on a first load under autoplay restriction**, in Chrome and in Firefox,
   with a fight already running before the first click.
2. **Blind test: a Brute being hit and a Skitterer being hit are distinguishable** with the
   screen off. This is the gate.
3. A blocked blow and a landed blow are distinguishable. A parry is distinguishable from both.
4. A blow across the room is quieter than one at your feet, and one on the left of the screen
   comes from the left.
5. Twenty repeated hits on the same body do not machine-gun.
6. The same fight, replayed, sounds the same.
7. `M` mutes and unmutes. Muted, the module builds no voices at all rather than building them at
   zero gain.
8. A `Shift+S` brawl does not drop the frame rate and does not clip. Check the voice-count
   instrument.
9. Sounds fire from **events only**. Grep the module for any read of a unit column that is not an
   event row's; there should be none in this session.

## Tripwires

All five, plus `node --check web/audio.js`. No Rust changed.

## Explicitly not in this session

- Every other voice. `art-11`.
- Music. There is none and none is planned.
- A settings panel for volume. `M` is the surface; a slider is a HUD change and the HUD is not
  gaining controls.
