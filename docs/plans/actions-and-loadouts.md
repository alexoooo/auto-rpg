# Units and actions: splitting the body from what it is holding

**Status: landed.** Phase 1 complete. `Run` and `Bow` are reserved in the
registry and not implemented.

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

## Next

* **Run** — a `Move` role. `apply_movement` already multiplies by
  `spec.move_bonus`, which is exactly `1.0` for every current row, so this is a
  one-row table edit.
* **Bow** — a `Shoot` role, and the projectile entities the world does not have.
  `resolve_shots` slots into `step()` after `resolve_swings`.
* Re-measure the roster matrix and consider re-evolving with the ladder in the
  fitness function rather than beside it.
