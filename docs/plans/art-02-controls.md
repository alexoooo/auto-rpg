# art-02 — W means up the screen

**Goal:** WASD becomes a screen-space intent transformed into the world through the camera's own
inverse, instead of a world-space intent wearing screen-space key labels.

**Leaves the game:** a gameplay bug fixed. Small session, no new subsystem, and it is here rather
than later because every art review from `art-05` on requires driving a body around to look at
its facings, and the control for doing that currently sends it somewhere else.

**Depends on:** nothing. Can land before or after `art-01`.

---

## 1. The bug, derived rather than asserted

`pushInput` (`main.js:3421-3434`) composes the held keys into `(mx, my)` and hands them straight
to `set_input` as thousandths of a **world** vector:

```js
if (held.has("a")) mx -= 1;
if (held.has("d")) mx += 1;
// Screen y grows downward and world y grows downward with it, so "w" is -y.
if (held.has("w")) my -= 1;
if (held.has("s")) my += 1;
```

That comment is true top-down and false under iso, and it is the whole bug. Push world `(0,-1)`
through `PROJ_ISO` — `ax, bx = 1, -1` and `ay, by = 0.5, 0.5`:

```
projX(0,-1) = (1*0 + (-1)*(-1)) * scale =  +scale
projY(0,-1) = (0.5*0 + 0.5*(-1)) * scale = -0.5 * scale
```

Screen `(+1, -0.5)`: **up and to the right, 26.57° above horizontal.** The other three go the
same way round:

| key | today's world intent | where it actually goes on screen |
|---|---|---|
| `W` | `(0,-1)` | up-right |
| `A` | `(-1,0)` | up-left |
| `S` | `(0,+1)` | down-left |
| `D` | `(+1,0)` | down-right |

The four keys are still a coherent, orthogonal set — they are simply **rotated 45° off the
screen**, so the player has to think in the room's diagonals rather than in the screen's axes.
Which is the same class of error `iso-07` fixed for aiming, from the same cause: a page-side
control written before the projection existed and never re-derived under it.

## 2. The fix

Interpret `(mx, my)` as a **screen** direction and put it through the inverse:

```js
  let mx = 0;
  let my = 0;
  if (held.has("a")) mx -= 1;
  if (held.has("d")) mx += 1;
  // A *screen* intent: "w" is up the screen, in every projection. What crosses
  // the wall is the world direction that comes back out of the camera's inverse,
  // which is what keeps the sim ignorant of the camera and the replay ignorant of
  // the zoom -- see the note on replays below.
  if (held.has("w")) my -= 1;
  if (held.has("s")) my += 1;
  if (mx || my) {
    // `unprojX`/`unprojY` and not the four coefficients written out again: this
    // page has one inverse matrix and `groundSpace`'s comment argues at length
    // about what a second copy of a 2x2 costs. They take screen *pixels* and this
    // is a direction, which is the same map -- the inverse is linear, a direction
    // is a difference of two points, and the `1 / scale` they carry divides out in
    // the normalise on the next line. (`scale` is written by `resize` and is never
    // zero.)
    const wx = unprojX(mx, my);
    const wy = unprojY(mx, my);
    // **Unconditionally**, where this used to be `if (len > 1)`. Under iso a unit
    // screen vector comes back with a world length between 0.71 ("d") and 1.41
    // ("w"), so a conditional normalise would make walking across the screen 30%
    // slower than walking up it. Top-down nothing changes: `mx, my` are in
    // {-1,0,1}, so the pre-image lengths are exactly 0, 1 and sqrt(2), and
    // normalising a length-1 vector is the identity. Every value that reaches
    // `milliSigned` in `[tactical]` and `[dev]` is the value it reaches today.
    const len = Math.hypot(wx, wy);
    mx = wx / len;
    my = wy / len;
  }
```

**One claim in that comment is weaker than it reads, and the landed comment says so instead.**
"Top-down nothing changes" is exact for the cardinals and for no key at all — `hypot(a, 0)` is
`|a|` and `a / a` is 1 in IEEE, so `(mx, my) / scale` normalises back to `(mx, my)` bit for bit —
and it is *one ulp* off for the diagonals, because `a / hypot(a, a)` and `1 / hypot(1, 1)` round
differently at about one `scale` in twenty (`0.7071067811865476` against `...475`). Nothing
downstream can see it: `milliSigned` rounds to a thousandth, `707.107` is nowhere near a
boundary, and a sweep of 1.8M cases over `scale` and all nine key combinations moved **zero**
integers. So the load-bearing half — every value `[tactical]` and `[dev]` push across `set_input`
is the value they pushed before — holds; "bit for bit" was the overstatement and is not what the
code claims.

Three properties this has and the old code did not:

- **Diagonals are not faster**, and now neither are cardinals. `W+D` under iso comes back as
  world `(-0.316, -0.949)`, unit length, pointing exactly up-right on screen.
- **World speed is uniform in every screen direction**, which is what `move_speed` means.
- **Screen speed is not uniform, and must not be.** Pressing `D` carries the body across the
  screen at `1.41 * scale` px per world unit travelled; pressing `W` carries it up the screen at
  `0.71 * scale`. That is a factor of two and it is **correct perspective** — the same reason the
  brief says screen-vertical travel will look slower and must not be compensated. Expect it to be
  reported as a bug; it is the projection, and compensating it would mean the character's world
  speed changed with which way it was pointing.

## 3. The keybind audit

The brief asks for a collision report rather than a silent rebinding. Here it is, from
`bindInput` (`main.js:3630-3729`), which is the whole of the page's key map:

| key | bound to | collides with WASD |
|---|---|---|
| `w` `a` `d` | movement, gated on `CONTROL_FEET` | nothing — unbound otherwise |
| `s` | movement while the feet are held; **spawn a skitterer** otherwise (`Shift+S` spawns eight) | **yes, and already resolved** |
| `c` `v` `x` | the three driving toggles: Movement, Action, Aim | no |
| `q` `e` | the enemy and hero rails | no |
| `b` | spawn a brute | no |
| `f` `r` | free will, restart | no |
| `1` `2` | which action is in hand | no |
| `y` `g` `p` | vision discs, view mode, frame breakdown | no |
| `Space` | pause | no |
| `?` `Escape` | keys overlay, back out | no |

**One collision, and it was resolved before this session existed**: `main.js:3651` gates the
whole WASD arm on `controlMask & CONTROL_FEET` and early-returns, so `s` spawns a skitterer
exactly when the player is not driving. That is the documented, non-surprising behaviour the
brief asks for and it should not be changed. Two things to do about it rather than to it:

- **Say so in the keys overlay.** A player who takes the Movement channel silently loses the
  spawn key; that belongs in `#keys-overlay` beside the WASD row, not in a code comment. As
  landed the `S`/`B` row gains a one-clause cross-reference too: it promised the spawn
  unconditionally, and prose that is now incomplete is the same problem one step smaller.
- **`Shift+S` (spawn eight, the profiling instrument, `main.js:3686-3696`) is shadowed the same
  way.** Leave it — it is used with the feet released, by someone measuring rather than playing
  — and note it in the same overlay row.

**One wrinkle worth fixing while here.** `w`, `a` and `d` are unbound outside the movement arm,
so gating their *capture* on the control mask buys nothing and costs one small surprise: press
and hold `W`, then press `C` to take the feet, and nothing moves until the key is released and
pressed again, because the keydown that would have added it to `held` was discarded. Capture
`w`, `a` and `d` unconditionally and leave only `s` behind the gate; `pushInput` already returns
early when no channel is held, and `drive_hero` (`crates/web/src/lib.rs:1639`) ignores the vector
without `CONTROL_FEET`, so there are two independent reasons an uncaptured-but-held key can do
no harm.

`held` is emptied on `blur` (`main.js:3585-3589`) and `keyup` deletes unconditionally
(`main.js:3626`), so there is no path to a stuck key. Leave both alone.

## 4. Twin-stick already works; prove it rather than build it

`CONTROL_FEET` and `CONTROL_LIMB` are independent bits (`crates/web/src/lib.rs:256-268` argues
why at length), the page has a toggle for each (`C` and `X`), and `pushInput` fills the movement
vector and the aim bearing in the same call. So WASD-plus-mouse is a feature the page has and
nobody has checked under iso. It goes in the acceptance test, not in the diff.

One thing to look at while checking it: under iso the aim snaps to `unitAt`'s pick when the
cursor is over a body (`main.js:3498`), which is `iso-07`'s correction. Driving with WASD moves
the body *under a stationary cursor*, so the snap can engage and disengage without the mouse
moving. Confirm that reads as helpful rather than as the aim twitching; if it does not, the
finding belongs in `DESIGN.md` and its fix is its own change, not this one.

## 5. Replays stay camera-independent, and the distinction is worth stating

What crosses `set_input` is a **world** vector in thousandths, and `crates/sim/src/replay.rs`
records submitted commands rather than keystrokes. So a replay never learns that a camera
existed and cannot be affected by the zoom, the pan or the projection. This session does not
change that; it is what makes the fix legal.

The confusing half, stated so nobody chases it: **live input is camera-relative and recorded
input is not.** Hold `W` and press `G`. The character's *world* heading changes, because "up the
screen" is a different world direction in the two projections — and its *screen* heading does
not, because that is what "up the screen" means. Both halves are correct. The replay records the
two different world vectors, and replays exactly.

That is also the cleanest available test of the whole session, and it is in the acceptance list
below.

---

## Acceptance test

1. **`W` moves the character up the screen. `A` left, `S` down, `D` right.** In `[world]`, at
   the default zoom, at the top of the zoom range and at the bottom.
2. `[tactical]` and `[dev]` are unchanged — the same keys move the same way they always did.
   This is a code-reading check as much as a play check: §2's arm is the identity there.
3. **Diagonal speed equals cardinal speed in world units.** Walk `W` for five seconds against a
   wall grid, then `W+D` for five seconds; the world distance covered is the same. The *screen*
   distance is not, and §2 is why.
4. **Hold `W` and press `G`.** The body keeps travelling up the screen in both projections; its
   world heading changes at the switch. Nothing stutters and no order is issued.
5. **Twin-stick.** Hold `C` and `X` together. WASD walks, the mouse aims, a click cuts, and the
   two do not fight: the feet keep their heading while the blade tracks the cursor.
6. `S` spawns a skitterer with the feet released and walks the character down-screen with them
   held. The keys overlay says so.
7. A drag-path order and WASD do not fight: pressing a movement key while a queued path is
   walking behaves the way it does today. **Checked, and this is what today is** — nothing on
   this page or in `crates/web` cancels a route or an order for a keypress, so the queue is not
   interrupted; it is *overridden per tick and only per tick*. `drive_hero` replaces
   `command.move_dir` with `input_move` whenever `CONTROL_FEET` is held, so the feet do what the
   keys say while the standing `Order::Goto` and the whole `route` sit untouched behind them.
   `follow_route` keeps running per tick regardless of who is steering: it pops a leg when the
   body comes within `ROUTE_ARRIVE` of it, whoever walked it there, and its `ROUTE_STALL` guard
   (90 ticks without `ROUTE_PROGRESS`) pops one when the body does not move at all. Two
   consequences worth knowing before somebody calls either a bug: **taking Movement and holding
   nothing parks the character**, because `pushInput` pushes `(0, 0)` every frame, and the queue
   then drains itself a leg every 90 ticks down to the last one, which `follow_route` leaves
   standing on purpose; and letting the feet go with `C` hands the remaining path straight back
   to the policy, which walks it. This session changes none of it.

## Tripwires

All five from `art-00-overview.md`. No Rust changed.

## Explicitly not in this session

- Any change to `crates/web`'s input ABI. `set_input`'s signature and units are correct as they
  stand; this is entirely a change to what the page puts in them.
- Gamepad, or a second mouse button for the cut's flank. The flank is an open question in
  `DESIGN.md` and stays one.
