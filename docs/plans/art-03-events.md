# art-03 — the frame learns to say what happened

**Goal:** the frame carries every transition the animation and the sound will need — deaths,
releases, phase changes, footfalls, shoves, the portal, the descent — plus the two per-body
numbers a walk cycle and an impact voice cannot be honest without: velocity and mass.

**Leaves the game:** pixel-identical and sound-identical, because nothing consumes any of it
yet. That is the point. This is the only session that touches Rust and its acceptance test is
that the screen does not change.

**Depends on:** nothing, but **must land alone**, on the same argument `iso-01` had to. It is the
one place in this project where a determinism failure can enter, and a bug in it found three
sessions later would be found while three other things are also new.

---

## 0. Baseline first, and record it

```
cargo run --release -p lab -- hash               # write the number down
cargo test --workspace                            # write the count down
node --test tools/wasm_check.js                   # write the count down
cargo run --release -p lab -- verify --seeds 200
```

Do not compare against a number in any document, including this one. `iso-00-overview.md` quotes
a `lab hash` that has been stale since gameplay landed; the current five live in
`tools/wasm_check.js` and are the only authority.

## 1. Where each event lives, and why almost none of them go in the sim

`Sim::advance` (`crates/web/src/lib.rs:1323`) runs `for _ in 0..frames` and sees **every tick**,
where the page sees at best one frame in one. It already differences three things across each
step: the hero handle, the dungeon fingerprint, and a per-entity `Swing` table in
`note_declares` (`:1592`), whose doc comment states the whole argument — a five-tick windup can
begin and end between two `requestAnimationFrame` callbacks, so a page differencing columns
would never see it happen.

That is the pattern. Sort the brief's list by it:

| event | where | why |
|---|---|---|
| blow landed | **exists** | `Event::Damage` → `EVENT_DAMAGE` |
| block | **exists** | `Event::Block` → `EVENT_BLOCK` |
| parry | **exists** | `Event::Parry` → `EVENT_PARRY` |
| attack declared | **exists** | derived in `note_declares` → `EVENT_DECLARE` |
| death | `crates/web` | `Event::Death` exists and is discarded; forward it |
| projectile launch | `crates/web` | `Event::Loose` exists and is discarded; forward it |
| projectile impact | **exists** | a landed shot is `Damage`, a stopped one is `Block` — `event.rs:55-59` argues this deliberately and it stays |
| phase transition | `crates/web` | `note_declares`' table generalised; one comparison already written |
| action swap | `crates/web` | `Swing::Swap` **is** a phase (code 4), so the phase event covers it and no separate kind is needed |
| footstep | `crates/web` | a stride accumulator over `velocity`; see §4, which makes it the walk cycle's clock as well |
| moving/stopped | — | **not an event.** It is a state, it is `velocity`, and it is in the frame as of this session |
| portal open | `crates/web` | difference `portal_state()`, already computed each frame |
| level descent | `crates/web` | difference `self.depth`, already a field |
| stagger | **`crates/sim`** | the one thing that genuinely cannot be derived — see §2 |

## 2. The three changes to `crates/sim`, and the proof they are inert

**`UnitView.velocity: Vec2`** (`crates/sim/src/world.rs:3260`). `self.vel[i]` exists and is
already hashed as state; the view simply stops hiding it. The walk cycle needs it, the footstep
clock needs it, and the momentum lean the brief asks for is exactly this quantity differenced.

**`UnitView.mass: Fx`.** `self.mass[i]` exists. The page needs it for the impact voice's
resonant pitch — a Brute hit must sound heavier than a Skitterer hit *because it is*.

> It would be one line in the page to write `mass = f(radius)`, because `DESIGN.md` says mass is
> geometry unless stated otherwise. **Do not.** That is precisely the mirrored-formula bug
> `loadRegistry`'s post-mortem is about and that `sight_range` was moved into the frame to kill
> (`crates/web/src/lib.rs:166-172`): a formula copied into the page describes a body that can
> change underneath it, and `Body::mass` has an "unless stated otherwise" clause in its own
> documentation.

**`Event::Shove { entity, at, impulse: Vec2 }`.** A blow moves bodies (`DESIGN.md`, "Blows move
bodies") and the magnitude is not recoverable from outside: a velocity delta mixes the blow's
impulse with the body's own traction-limited acceleration, and separating them from the page
would be a heuristic dressed as a measurement. Emitted at exactly three sites, all of which
already compute the vector:

| site | today | what it is |
|---|---|---|
| `world.rs:1462` | `self.vel[j] += blow.shove` | a landed blow shoving the target |
| `world.rs:1617` | `self.vel[j] += pierce.shove` | an arrow shoving the target |
| `world.rs:1805` | `self.vel[i] -= along * (slipped * recoil.signum())` | the attacker's own recoil |

**Not** emitted for body-on-body jostling (`world.rs:1174`). Two bodies leaning on each other
produce an impulse every tick, forever, which is a state and not an event, and would be the one
thing in the feed capable of flooding it.

**Why none of the three can move a hash**, stated so nobody has to re-derive it:

1. `state_hash` walks the world's own arrays (`world.rs:2475` and around it). A *view* is a
   read-only struct assembled on demand for callers outside the crate; adding a field to it adds
   no state, mutates nothing, and is not walked.
2. `World::events` is cleared at the top of every `step` (`world.rs:813`) and never read back
   into a decision. `crates/sim`'s own tests assert `w.events.is_empty()` in the places where
   emptiness is the claim; nothing hashes the list. A new variant enlarges `size_of::<Event>()`
   and therefore a `Vec`'s allocation, which is not state either.
3. No emission site is allowed to compute anything. Each of the three above pushes a vector the
   line above it already computed. **If a `Shove` emission requires a new arithmetic expression,
   stop** — that expression is a candidate for being rounded differently than the one beside it,
   and the whole argument collapses.

Check `crates/policy` and `crates/lab` for an exhaustive `match` on `Event` before adding the
variant. At the time of writing there is none — every consumer uses `if let` or `matches!` — but
that is a fact about today, and the compiler will say so either way.

## 3. The ABI

### The event row widens from 5 floats to 8

```
[kind, x, y, amount, actor, other, aux0, aux1]
```

`kind`, `x`, `y`, `amount` and `actor` keep their meaning exactly (`crates/web/src/lib.rs:202`),
so the four existing kinds are unchanged in their first five columns and the page's existing
`consumeEvents` keeps working against them verbatim. The three new columns:

- **`other`** — the second entity index, or `255` for none. Attacker for a blow, killer for a
  death, `b` for a parry. Like `actor` it is `EntityId::index` alone and is **a hint for
  grouping and never an identity**, on exactly the argument `:210-215` makes.
- **`aux0`, `aux1`** — kind-specific, tabulated below and nowhere else.

| kind | code | x, y | amount | actor | other | aux0 | aux1 |
|---|---|---|---|---|---|---|---|
| `DAMAGE` | 0 | impact point | health lost | target | source | target mass | target radius |
| `BLOCK` | 1 | the rim it landed on | absorbed | defender | attacker | defender mass | 0 |
| `PARRY` | 2 | where the blades crossed | 0 | `a` | `b` | 0 | 0 |
| `DECLARE` | 3 | swinger's position | action code | swinger | 255 | 0 | 0 |
| `DEATH` | 4 | where it fell | 0 | the dead | killer | mass | body kind |
| `LOOSE` | 5 | the nock | 0 | archer | 255 | line, raw angle | 0 |
| `PHASE` | 6 | the body | 0 | unit | 255 | phase from | phase to |
| `STEP` | 7 | the foot | speed, units/tick | unit | 255 | mass | 0 |
| `SHOVE` | 8 | the body | impulse magnitude | the shoved | the shover, or 255 | mass | 0 |
| `PORTAL` | 9 | the portal | 0 | 255 | 255 | 0 | 0 |
| `DESCEND` | 10 | the portal | the new depth | 255 | 255 | 0 | 0 |

Codes are **append-only**, on the standing rule (`:322`): a page that has never heard of a kind
skips the row rather than guessing at it, which is what lets an older page run against a newer
module and draw nothing wrong.

**`EVENT_DECLARE` survives even though `EVENT_PHASE` subsumes it**, and that is deliberate. It
carries the action code rather than a phase pair, it applies `note_declares`' `Guard | Recover →
Windup | Strike` rule which is *not* every transition, and `pushCallout` (`main.js:8687`)
consumes it today. Retiring it would be a change to a working readout inside a session whose
gate is that nothing changes.

**Where the brief asks for numbers this table does not carry:**

- *"blade radius at contact"* — not on `Event::Damage`. `aux1` carries the target's radius
  instead, which is what the impact voice actually wants (the thing that rings is the body). If
  the swing's own geometry turns out to be wanted in `art-10`, it is a fourth field on
  `Event::Damage` and its own decision.
- *"the shield-disturbance magnitude that already exists in the collision math"* — `absorbed` is
  what `Event::Block` carries today and it is a monotone stand-in for sharpness. Before adding a
  field, **read the block path in `world.rs:1454` and `1609` and find out whether a distinct
  disturbance figure exists there at all.** If it does and it says something `absorbed` does not,
  add it as an inert fourth sim change on the same terms as `Shove`; if it does not, say so in
  `DESIGN.md` and let `art-10` scale on `absorbed`.
- *"kinetic energy"* — damage **is** kinetic energy times the power multiplier (`DESIGN.md`,
  "Damage is kinetic energy"). `amount` is therefore an honest energy proxy and `art-10` should
  say in one comment that it is a proxy rather than pretending it is the raw figure.

### The unit row widens from 29 floats to 33

Appended, per the standing convention:

- **`29`, `30`: `vx`, `vy`** — world units per tick, straight off `UnitView::velocity`. Signed,
  and small: a Fighter's `move_speed` is about 0.048 units per tick.
- **`31`: `stride`** — the walk cycle's phase, `0 <= stride < 1`, described in §4.
- **`32`: `swing_span`** — how many ticks the *current* phase started with, so the page can turn
  `swing_left` into a fraction. Without it there is no way to draw a windup as a windup: a
  Brute's is 33 ticks and a Punch's is 5, and `swing_left = 4` means "nearly done" in one and
  "just started" in the other.

  **This also kills an eyeballed constant that is in the file today.** `drawLimb`
  (`main.js:7229`) computes `imminent = clamp(1 - unit.swingLeft / 30, 0.15, 1)` — a literal 30
  standing in for every action's windup length, which is the exact species of guess the
  `unit.sight` column was added to retire (`crates/web/src/lib.rs:166-172`). `art-05` replaces
  that expression with `swing_left / swing_span` and the telegraph starts telling the truth for
  a Punch as well as for an axe.

### The header gains one column, and `MAX_EVENTS` quadruples

`HEADER_LEN` 14 → 15, with `frame[14] = events_dropped` — how many rows the cap ate this frame.
It exists so the claim "the cap is generous" can be *checked from the console* instead of
believed, which is the same reason `floorBakes` exists (`main.js:4869`).

`MAX_EVENTS` 32 → **128**. The old cap was sized for "a blow or two and the odd declaration"
(`:218-225`) and phase and footstep rows change the arithmetic: eight ticks of catch-up × up to
64 bodies, with a footfall every dozen ticks or so and a phase change now and then, puts a busy
worst case near eighty. 128 rows × 8 floats is 4 KB of linear memory, once, forever.

Overflow keeps dropping the tail, which is still the right end (`Sim::advance` argues it), and
now says so out loud in the header.

### `FRAME_LAYOUT_VERSION` 6 → 7

And therefore `tools/wasm_check.js`'s mirrors at `:74-91` and `:363-373`, and `main.js`'s at
`:44-75`. The page asserts the version at load and refuses to draw a layout it was not written
against; that is the mechanism that makes this edit safe rather than a mechanism this edit has to
work around.

**None of this is a golden moving.** `wasm_check.js` holds those five constants as its own
mirrors and asserts the module agrees. Editing them is a deliberate, visible, one-line-each
change. The five *hashes* in the same file must come out byte-identical, and that is the gate.

## 4. The stride clock, which is the walk cycle's clock and the footstep's

`Sim` gains `strides: Vec<Fx>`, one per entity index, alongside `swings`. Each tick, for each
live unit:

```
stride[i] += |velocity[i]| / stride_length(radius[i])
if stride[i] >= 1 { stride[i] -= 1; push EVENT_STEP }
```

with `stride_length` proportional to body radius — a Brute's stride is longer than a
Skitterer's because a Brute is bigger. Publish `stride[i]` as unit column 31.

**This is the single most useful thing in the session and the reason it is worth a column
rather than a page-side integral.** One number drives three things that would otherwise drift
apart:

- the legs in `art-05` swing on `stride`, so the pose is sim-truth rather than a wall-clock
  animation;
- the footstep sound in `art-11` fires on the wrap, so it lands when the foot lands;
- a body that is shoved, walled or stopped has its stride stop with it, for free, because it is
  velocity that drives the accumulator and not time.

If the page integrated its own, the sound and the leg would come from two clocks and would
disagree by however much the frame rate wandered — which is the precise failure the brief calls
out as the renderer lying.

`stride` is presentation, lives in `crates/web`, is not state, and is not hashed. Keep it in
`Fx` anyway: `Sim` has no float arithmetic in it today and this is not the session to introduce
the first.

**It wraps, so the page must not lerp it naïvely.** `blendUnit` (`main.js:1252`) interpolates
every unit column between `prev` and `curr`; a straight lerp across the 1 → 0 wrap runs the legs
backwards through a whole cycle in one frame. `lerpAngle` (`main.js:1184`) already solves exactly
this problem for facings — use it, scaled, or write the two-line `lerpWrap01` beside it and say
in its comment that it is `lerpAngle` with a different period.

## 5. The page side

Mechanical, and the gate is that none of it changes a pixel:

- `newUnitRow` (`main.js:822`) gains `vx`, `vy`, `stride`, `swingSpan`; `readUnit` (`:939`) reads
  columns 29–32; `blendUnit` (`:1252`) lerps `vx`/`vy`, wrap-lerps `stride`, and **snaps**
  `swingSpan` rather than lerping it — it is a phase's length and a value halfway between an
  axe's 33 and a punch's 5 describes no action that exists; `snapRow` (`:1215`) is where the
  existing precedent for that lives.
- `newEventRow` (`:863`) gains `other`, `aux0`, `aux1`; `parseFrame` (`:1026`) reads eight
  columns instead of five and the header's fifteenth.
- The eleven `EVENT_*` codes are declared beside the four that exist (`:102-105`).
- `consumeEvents` (`:8643`) is **unchanged apart from its unknown-kind behaviour**, which is
  already correct: it tests for the kinds it knows and falls through the rest. Seven new kinds
  arrive and nothing consumes them until `art-09` and `art-10`.
- If `frame[14]` is ever non-zero, `console.warn` once. Not per frame — once, with the count —
  because a warning that repeats sixty times a second is a warning nobody reads.

## 6. Tests

**In `crates/sim`:** the brief's determinism-of-events test. Run a canned fight twice from one
seed, collect every `Event` from every `step`, and assert the two sequences are identical.
`crates/sim/tests/determinism.rs` is the file and its eight-thread scenario is the shape to
copy — assert the event streams match across threads as well, which is stronger and costs one
line.

**In `crates/web`:** the same at the `Sim` level, which is the one that covers the derived kinds.
Two `Sim`s on one seed, advanced identically, produce identical frame-event blocks — including
phases, footsteps, the portal and the descent. This is the test that would catch a `strides`
accumulator that had picked up an `f32`.

**In `tools/wasm_check.js`:** update the five mirrors, then add coverage the mirrors cannot give:

- a unit's `stride` column advances while it walks and holds still while it stands;
- `vx`/`vy` are zero for a standing body and non-zero for a walking one;
- `swing_span` is zero at guard, equals the phase's full length on the first tick of a windup,
  and never falls below `swing_left`;
- a fight produces at least one row of each of `DEATH`, `PHASE`, `STEP` and `SHOVE`, with `actor`
  inside `0..MAX_UNITS` and `other` either that or `255`;
- `frame[14]` is zero for the canned scripts.

The file's existing "a column added in the middle would leave every hash identical" note
(`:463`) is the reason that last group is worth writing: the hashes cannot see the frame at all.

---

## Acceptance test

1. **All five hashes are byte-identical to the baseline recorded in §0.** This is the gate. If
   one moved, an emission site computed something.
2. `cargo run --release -p lab -- verify --seeds 200` reports every run identical on re-run and
   exact on replay.
3. `cargo test --workspace` passes at the recorded count plus the new tests and no other
   movement.
4. **The game looks and behaves exactly as it did.** Play a floor. Nothing new is drawn, nothing
   is missing, no console warning fires.
5. `frame[14]` stays zero through a `Shift+S` full-room brawl. If it does not, `MAX_EVENTS` was
   sized wrongly and the number to raise is in one place.
6. Read the stride column live in the console while walking a Brute and a Skitterer side by side:
   both advance, the Skitterer's faster, and both stop dead when the bodies do.

## Tripwires

All five, and for this session they are the deliverable rather than a formality.

## Explicitly not in this session

- Consuming any new event. `art-09` takes the shove and the death; `art-10` and `art-11` take
  the rest.
- Any rendering change whatsoever.
- Deciding whether the player should *hear* a body the fog is hiding. `consumeEvents` filters on
  `actorVisible` today and keeps doing so; whether that is right is a design question, it belongs
  in `DESIGN.md`'s open questions, and `art-11` is where it gets answered.
