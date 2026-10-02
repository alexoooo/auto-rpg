# Rising 04: the staged riser

## Goal

A sub-mind that gets a fallen body to its feet with its own muscles: `{ kind: "staged-rise" }`. It
lies slack until still, reads how it lies, rolls to its front if it is not on it, and plays stages
that are data: poses first, then bearings solved by the bearing solve (`bearing.ts`) on the
recipe's limbs. It is scored on the battery (`research/core-rise.mjs`) beside the body that lies
(`rising.md#lying`), and the lab offers it. The game's default does not change here: `FIGHTER`
still lies, and a fall still takes a body out. Plan 05 changes both.

What is fixed is the structure: the patches, the kinds of limb, the two kinds of stage, the
player, its state, its tests. What a body bears on and what it does are the recipe's, data: its
limbs and its stages. The recipe may change shape (a limb or a stage added, split or reordered)
without the player changing; another body's rise, or a rise with a hand kept off the ground for
what it holds, is another recipe.

**The rise stops on knees and hands.** The stand's gate for the bearing stages, a body fallen
forward stands, is missed: the Warrior and the skeleton come to `fours` and nothing stands them
up from there; the Rogue does not reach it (`rising.md#where-the-rise-stops`). So the bar below
is missed before the battery is run, chunk D lands under it, and plan 05 does not land.

One chunk is left:

| | Lands | Gate |
|---|---|---|
| D | the roll; the battery's row and the bar; the lab's choice; the documents | the bar below |

## Files

| File | Change |
|---|---|
| `src/core/mind/rise/stages.ts` | The roll. |
| `src/lab/scenarios.ts`, `minds.ts`, `actor.ts`, `main.ts`, `hud/character-section.ts` | `LAB_DOWN_IDS`, `LAB_DOWN`, the address's `down`, the Character section's choice. |
| `tests/core-rise.test.mjs` | The roll's test. |
| `tests/lab-scenarios.test.mjs`, `lab-actor.test.mjs` | `down` rides the address; the actor's sub-minds are its options'. |
| `docs/reference/rising.md`, `docs/architecture.md`, `docs/roadmap.md`, `README.md` | See Documents. |

## What stands

The player, the pose stages, the limbs and the bearing stage are in, and
`docs/reference/rising.md#stages` is their record. What chunk D builds on, where it is not what a
reader would guess:

- **A posture is written from each freedom's own zero** (`Posture`, `stages.ts`; `DofSpec.bind`),
  not from the reference pose as a `Pose` is (`motor.ts`): the reference poses differ (the
  skeleton's elbows are bound at a right angle), and one recipe fits all three of `BODY_MODELS`
  only so. A channel a posture does not name goes to that zero, which is not the reference pose.
  `stageFaults` holds every channel of every stage to its range, named or not.
- **The recipe is `{ limbs, roll, rise }`**, a `Stage` is a `PoseStage` or a `BearStage`, a roll
  is pose stages, and `RISE.rise` is `fold` (1 s), `tuck` (2 s), `prop` (1.5 s) and `fours` (a
  bearing: each shin 0.33, each hand 0.17). Without `fold` the Warrior does not prop.
- **The limbs are two kinds** (`LimbSpec`): an end (a hand, where its capsule touches) and a
  propped limb (a shin from its knee to where its foot stands on its toes). No limb is a foot on
  its sole, since no stage kept bears on one: a standing stage adds that kind (`riseLimbs`
  switches on the kind with a `never` default).
- **A limb bears once it is down**, where it came down, and until then is the servo's. A stage
  cannot move a limb to a place: a limb it leaves (`BearStage.leave`) bears until the centre of
  mass has been over the others and then goes where the posture puts it.
- **A bearing stage is done** when its limbs are down, those it leaves are let go, the centre of
  mass is within `NEAR` of its aim and slow, and the pelvis within `TURNED` of its pitch; at its
  `limit` the attempt is over and the riser lies slack again.
- **The player** (`stagedRise`): `idle`, `settle`, `roll`, `rise`. A stage's time is counted to
  the nearest step. After the rise's last stage it is `idle`, and if the body is still down the
  next step is `settle`: another attempt, `tries` up. `furthest` is raised by the rise's stages
  only.
- **The pose drive is the speeds**: the servo read worse on the ground (`rising.md#stages`).
- **A body propped is not on its front**: its pelvis is pitched up, so `lieOf` reads a side.
  The lie is read only after the body has lain slack, which lays it down again.
- **The Rogue's arms do not raise its chest** (0.26 m at `prop`'s end; the Warrior's 0.44, the
  skeleton's 0.41), and on `fours` it is asked 0.65 of its weight that its patches cannot give.
- **A shoved fighter turns as it falls**: 69 of the battery's 95 shoved falls end on the back,
  16 on the front, 10 on a side. A test that needs a body on its front topples it stiff
  (`toppled`, `research/core-rise-trials.mjs`; `level` builds it on a floor over the arena's),
  and `core-rise-poses.mjs --lie` does the same, for stages of either kind. A body toppled stiff
  to a side is on its front or back by the time the riser has it.
- **`tests/core-rise.test.mjs`** has thirteen tests: a recipe's faults; how a body lies; the
  wait, and a roll's hand-back to it; the pose stages' bars by model; a riser taken from begins
  again; knees and hands, both bodies that reach them; a stage given up at its limit; what a
  stage is done by; the ground it reads; a limb off the ground; a limb a stage leaves; what a
  shin and a hand bear on; a foot's own. `tests/core-fork.test.mjs` forks a body as it rises.
- **The battery's row** has `lie` and `stage`, and its second table is by the way of lying
  (`rising.md#battery`).

## Chunk D: the roll, the bar, the lab

### The roll

`RISE.roll`: pose stages for `back`, `left` and `right`, found with `research/core-rise-poses.mjs`
before any is written into the table. The back's carries the bar: 69 of the battery's 95 shoved
falls end on it. The instrument topples its body stiff, so `--lie left` and `right` give a body
that has rolled on to its front or back already: a side's roll is found from the back's, which
passes through a side, or on the battery's own shoves that end on one (`shoved`). The first
candidates, each to be tried on both humans:

- from a side: the upper leg's hip flexed and brought across, the upper arm reached across, the
  trunk turned toward the ground (lumbar and thoracic rotation), then both legs straightened;
- from the back: one knee drawn up and dropped across the other leg with the trunk turned after
  it, the far arm reached across; then as from that side.

A roll that ends not on the front is not a failure: the riser lies slack, reads again, and plays
the roll of the lie it finds.

### The row and the bar

`node research/core-rise.mjs --mind '{"kind":"fighter","subs":[{"kind":"staged-rise"}]}'`, beside
`#lying`'s table. The bar, set and not swept, written in `rising.md#staged` with the table:

- each human, each loadout (`LOADOUTS`: club and empty today): risen within the watch in at least
  three falls of four of the sixteen shoves;
- no way of lying under half, either human;
- the bout falls: at least half risen;
- the skeleton: reported, not held to the bar;
- nothing flung: `peak` no worse than `#driven`'s (a fighter that hands its body to nobody).

Under the bar, chunks A to C stand, the lab offers the riser as it is, the table says where it
stops (`stage`), and plan 05 does not land. What is tried next is the table's: the stage most
attempts stop at.

The rise ends at `fours`, so no fall rises and the bar is missed; the row is run for what it
says of the falls: how many reach `fours` by the way they lay, with and without a club, and that
nothing is flung on the way.

### The lab

- `scenarios.ts`: `LAB_DOWN_IDS = ["lie", "rise"] as const`, `LabDownId`; `LabAddress.down`, the
  key `down` in `KEYS`, read and written as `mind` is; `"lie"` unless given.
- `minds.ts`: `LAB_DOWN: Readonly<Record<LabDownId, { readonly name: string; readonly subs: readonly SubMindConfig[] }>>`:
  `lie: { name: "Lies", subs: [{ kind: "lie" }] }`, `rise: { name: "Rises", subs: [{ kind: "staged-rise" }] }`.
- `actor.ts`: `ActorOptions.subs`, in place of `FIGHTER.subs`; `main.ts` passes
  `subMindsOf(LAB_DOWN[to.down].subs)`.
- `hud/character-section.ts`: a choice "Down" after "Type".
- The Thinking section already says who has the body (`watchHas`).

Tests: `lab-scenarios`' whole address record gains `down`, there and back through a link, and an
unknown `down` reads as `"lie"`; `lab-actor`: an actor made with `LAB_DOWN.rise.subs` has
`body.has` `"staged-rise"` after a shove, and with `LAB_DOWN.lie.subs`, `"lie"`.

**Eye gate.** The lab's Stance, `down=rise`, shoved from the front, the back and a side, each
human: the owner watches how far it gets.

## What may not work, and what then

- **The roll.** Untried. If no pose sequence turns a body over, the roll becomes bearing stages
  (a side-lying body bears on a hand and a knee), or the table says the back is where it stops.
- **A club in the hand.** The hand's point is the hand's; a club under it is not known. The
  battery's club row shows what that costs. If it costs `fours`, the armed hand's limb is an end
  on the forearm, which is a row of the recipe, and which recipe a body plays is then
  `StagedRiseConfig`'s field, chosen where the mind's config is written.
- **The Rogue and the skeleton.** They play the Warrior's recipe, their names being its, and its
  numbers do not suit the Rogue; a recipe of its own is chosen the same way.
- **From knees and hands on** is not this plan's: `rising.md#where-the-rise-stops` has what was
  read of each way on and what a way on asks, a limb moved to a place.

## Documents

- `docs/reference/rising.md`: `## Stages` gains the roll (the table as it lands, each number's
  reading); `## Staged` (the battery's table, the bar, the harness line; each side's balance,
  0 %), in place of the pose stages' battery table.
- `docs/architecture.md`: the Minds section's sub-minds gain the riser; the Motor control section
  says a limb may hang from a stem and a patch may be a point; the lab's Character section.
- `docs/roadmap.md`: "Rising after a fall" reads as built as far as knees and hands, for the lab;
  the open items are the way on from there (a limb moved to a place), the Rogue's recipe, and
  the searched and the learned riser; the fights take rising up once the bar is met (plan 05).
- `README.md`: the lab's "Down" choice.

## Verification

```powershell
node scripts/fingerprint.mjs > before.txt
node research/bout-trace.mjs
node research/bout-trace.mjs crypt-skeleton crypt-skeleton 60
npm test
npm run check
npm run build
node scripts/fingerprint.mjs > after.txt      # no line differs: nothing in a fight rises yet
node research/bout-trace.mjs                  # the same digests
node research/bout-trace.mjs crypt-skeleton crypt-skeleton 60
node research/core-rise.mjs --mind '{"kind":"fighter","subs":[{"kind":"staged-rise"}]}'
node research/body-cost.mjs                   # a rising body's step, beside a standing one's
```
