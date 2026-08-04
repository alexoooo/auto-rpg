# Units and actions: splitting the body from what it is holding

**Status: landed.** Phase 1 complete. `Run` and `Bow` have since landed too —
see [Phase 2](#phase-2-run-and-bow) at the bottom.

## Why

Two problems, and they were the same problem.

`UnitKind` was a god-enum. One variant carried a body radius, a density, a stat
template, a weapon *and* a shield arc as a single indivisible fact, so a
Skitterer did not carry a knife — it *was* one. "What does a Brute with a knife
play like" was a question with no representation anywhere in the codebase.

And **blocking was free**. `World::block_leak` was a passive geometry query
against an off-hand that nothing charged for, so every policy in the crate held a
shield out permanently, unconditionally, in all eight stances. A test comment in
`duel.rs` recorded the consequence as a measurement: answering a telegraph was a
*losing* strategy, "because the shield is braced every tick regardless of stance,
so defending and pressing are not the alternatives they look like". That was a
modelling error rather than a tuning one.

## What landed

* **`Body`** — Fighter (was Warrior), Rogue (was Scout), Brute, Skitterer. Size,
  weight, stat sheet. Discriminants preserved, so `hash_into` and the frame's
  `kind` column did not move.
* **`ActionKind` / `ActionSpec` / `ACTIONS`** — a registry of mechanics with a
  `Role` the sim branches on, plus `ready`, the swap cost. Punch, knife,
  shortsword, sword, club, shield; run and bow reserved.
* **One limb.** `HANDS`/`SWORD`/`SHIELD` deleted; `World.hands` → `World.limb`.
  A guard has no blade and cannot parry; a blade cannot block.
* **`Loadout`** — up to two actions, one in hand. `Swing::Swap` is the fifth
  phase, entered only from `Guard`, during which nothing is live.
* **`ActionMind` + a meta selector** — `BladeMind` and `GuardMind` in
  `policy/src/minds.rs`; `DuelistPolicy` scores every filled slot and drives the
  mind of whatever is *actually in hand*.
* **The page** — a loadout panel, a spawn selector that pairs a body with a kit,
  and three control toggles (feet / attack / action). The rotten `ARCHETYPES`
  mirror is gone; every menu is built from the registry across the wall.

## The three things that were got wrong first

Worth keeping, because each was a plausible answer that measurement refuted.

**The swap budget was set against telegraphs.** A club announces for 33 ticks and
a knife for 7, so `Shield.ready: 8` looked generous against one and impossible
against the other. Both numbers are real and neither is operative: a cut has to
*travel* after it is declared, and contact lands well into the strike. The
measured windows are **24 ticks for a knife and 62 for a club**. At 8 a fighter
could answer anything in the game. `ready: 14` restores the ladder.

**The Rogue's blade was retired into `Knife`.** Measured, that put a duelling
Rogue at 6.7% against a Brute — 0.75 units of total reach against 2.15 is not an
archetype, it is a body that cannot participate. Handing it a `Sword` fixed the
number (48%) and cost the thing the number was for. The retired Scout blade came
back as `Shortsword`, which is what a registry is *for*, and the Rogue sits at
64.7%.

**Loadout hysteresis was applied per decision.** A sharp fighter re-decides
twelve times as often as a dim one, so it flipped its loadout twelve times as
readily and spent the fight mid-swap: dull 14%, capable 73%, sharp **46%**. More
intellect made a worse fighter. A swap costs the same ticks whoever throws it, so
what has to be constant is flips per *second* — see `REFERENCE_PERIOD`.

## What it cost

The difficulty ladder moved down: three character sheets that won 33 / 91 / 99
percent now win **14 / 73 / 88**. That is the subsidy being withdrawn, and the
fighter that benefited most from a free defence was the one too slow to arrange
its own. `the_same_swordsman_on_three_character_sheets_spans_a_real_difficulty_range`
now pins the ordering and the spread directly rather than three absolute floors,
because a version of this policy where more intellect made a *worse* fighter
passed the old bounds and would have shipped.

A re-evolution over the full roster scored 75 held-out against the hand table's
41 and was **not** adopted: it drove `evasion` to its ceiling and `caution` to
zero, drew a third of its mirror matches, and its dim sheet won 68%. What it was
right about is the shape — moderate hysteresis, not none.

## Verification

```bash
cargo test                                    # 285 pass
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js               # 9 pass
node tools/serve.js                           # and play it
```

Goldens re-recorded three times (2a, 2b, 3). `GOLDEN_STATE_HASH` in
`determinism.rs`, then the four in `web/src/lib.rs`, then `tools/wasm_check.js`
copied from those — in that order, because the constants are duplicated and going
backwards produces a green suite against a stale number.

## Phase 2: Run and Bow

Both reserved rows are now playable. The reservation paid off exactly as
intended: **no discriminant, no feature layout and no frame stride moved for the
rows themselves**, and `FEATURE_LAYOUT_VERSION` is still 10.

### How it was sequenced

Exactly one edit in the whole change moves a golden hash, so the work was ordered
to make that a *test* rather than a hope. Run and all shared prep landed first
and left every golden standing; then the bow's mechanics, still standing; then
the frame and the `state_hash` projectile block, which moved them once. Each
stage was verified before the next. That is why the re-record below is a single
event with a single cause.

### Run

Genuinely the one-row edit predicted. `apply_movement` already multiplied by
`move_bonus` and `Hand::drive` already tracked a `Move` limb inertly, so the sim
needed nothing. Two things were missing and neither was in the sim:

* **`obs.move_speed` did not carry `move_bonus`.** `DuelistPolicy` divides by it
  in the `sqrt(2·a·d)` braking law, so a runner would have braked for a walk and
  slid through every mark it aimed at. Hash-neutral to fix, because the bonus is
  exactly `1.0` for every row that was playable before.
* **`mind_for` mapped `Role::Move` to `IdleMind`**, which appraises to zero — and
  the selector takes an argmax, so a Run slot was unselectable *by construction*.
  `RunMind` scores it on ground to cover (measured against the redraw, so legs
  stop being worth holding slightly before they stop being useful) and on
  breaking off, reading `Stance::Retreat`'s own criterion so the two cannot
  disagree.

`RunMind::drive` parks the limb at `obs.limb.angle` rather than using
`LimbCommand::TUCKED`, which pins bearing zero. That is not tidiness:
`blade_momentum` has no role gate, so a limb hauled round the compass costs
footing through `apply_recoil`, and a runner shoving itself sideways with its own
empty hand would have read as physics.

**Measured: 46%** for `(Sword, Run)` against a `(Sword, Shield)` mirror. Neither
dead weight nor a free win, which is the whole bar for a second slot.

### Bow

Real projectiles, not hitscan. New struct-of-arrays columns on `World` with their
own free list — not entities, which carry health, stats, a limb and a decision
clock that an arrow has none of. `resolve_shots` runs after `apply_recoil` and
before `reap_dead`, so an arrow and a cut landing on the same tick both count.

Everything about a shot is frozen at the release, for the reason `Hand::line` is:
an arrow is a fact about the past. `shot_owner` is a generational `EntityId`, so
an arrow outlives its archer and cannot be re-credited to whoever refills the
slot.

**No new columns on `ActionSpec`, and no authored damage.** Speed comes from
`Arm::reachable_spin` — the work the draw stored — and damage goes through
`rules::blow_damage` with the bow's own `mass`, so `peak_damage`,
`Contact::threat`, `Contact::frailty` and `knockback_taken` are all correct for
an archer for free. Range is the archer's `sight_range`, which makes "is this
enemy in bow range" identical to "do I perceive it".

Three things had to be got right that were not obvious from the plan:

* **`shot_speed` must read `reachable_spin`, never `limb.spin`.** `Hand::track`
  brakes to arrive at rest, so the hand is nearly stationary at the release edge.
  An arrow launched off the live spin does **zero** damage — not less, none, on
  every body — and nothing anywhere else looks wrong. Pinned by
  `a_drawn_bow_is_at_rest_when_it_looses`, which asserts the cost rather than a
  threshold so the claim cannot rot.
* **`swing::press` gates on the role**, and under the old `is_live_capable` test
  a bow would draw, aim and never loose, silently. That is what `Role::can_attack`
  exists to separate: "can this attack" is not "is this a blade".
* **`swing::landing` replays a blade arc**, which for a bow reaches 0.75 units and
  so returned `None` at every real range — no policy would ever have raised a
  guard against an archer. It now traces the declared ray, and returns the
  **entry point on the body surface** rather than closest approach, because
  `GuardMind` takes `.angle()` of it and closest approach to a well-aimed arrow
  is the body's own centre, i.e. noise.

Arrows are stopped by `block_leak` unchanged — the same braced-versus-snapped
rule a blade meets, rather than a second defensive mechanic to balance against
the first.

### What is not finished

**A pure archer measures 93%**, against a sword-and-board mirror that scores 47%
whatever it puts in its second slot. `(Bow, Sword)` sits at a reasonable 59%, so
carrying *no* answer for close quarters is better than carrying one — which is
backwards, and is the open problem this row ships with. It is recorded in
`duel.rs` rather than papered over, and the test bounds are deliberately loose:
they catch a bow that has stopped working, not a balance that has not been
earned.

Two dead ends worth keeping:

* **Slowing the row down is a cliff, not a slope.** `move_bonus` 0.70 wins 80%,
  0.50 wins 16%, 0.35 wins 2%. Outrunning a pursuer is a threshold, so every
  value is either "uncatchable" or "dead" and the row would be hypersensitive to
  a footspeed change made elsewhere for another reason. It stays at `1.0`.
* **Planting the archer while it draws** — the rule `GuardMind` already keeps —
  fixed `(Bow, Sword)` from 72% to 59%, and *raised* the pure archer from 80% to
  93%, because an archer that no longer moves between aiming and releasing hits
  far more often. Kept anyway: it is the honest price and it is right on its own
  terms.

The real gap is that **a bow has no dead zone**. Every blade in the game is bad
at its own hilt; a bow is as good point-blank as at twenty units, so there is no
range at which closing on one is a *win* rather than merely survivable. That is a
mechanic and not a constant, and it belongs with the roster re-measure below —
the genome running today was evolved in a world with no bows in it.

### Verification

```bash
cargo test                                    # 304 pass
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js               # 10 pass
```

Goldens re-recorded **once**, in the order below, and only because `state_hash`
grew an unconditionally-written projectile block. Writing it only when non-empty
would have spared the re-record and left a fingerprint blind to a broken column
until something was already in the air.

`BOW_HASH` is new and is the point of the tenth wasm check: the other four
scripts never loose an arrow, so until it existed the cross-target suite made no
claim about `Vec2::length`, `segment_circle`'s staged dot products or
`tangential_speed`'s saturating multiply. Portable fixed-point is a claim about
code that runs.

## Next

* Give a bow a dead zone, or some other reason that closing on one is a win, and
  re-measure the pure-archer number above.
* Re-measure the roster matrix and consider re-evolving with the ladder in the
  fitness function rather than beside it — and with bows in the world, which the
  current genome has never seen.
