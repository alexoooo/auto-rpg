# Skeleton 08 -- measure the fights, then set the numbers

**Depends on:** 07, and on `.review/skeleton-first-fights.md`, the notes from 07's page check.
**Moves:** skeleton bodies only; every stone and human section of the fingerprint must still read
`same`. **Lands:** final skeleton health, armour, mass and radius values, each with the table
that chose it; a report to the owner; and the decisions only the owner can make.

The values from session 06 are arithmetic from the overview, not measurements. This session finds
out whether the skeleton plays the way the owner described:

- harder to hit;
- clubs relatively better than blades;
- limbs that come off easily;
- decapitation survivable;
- a health bar that can still be worn down to zero.

Nothing in shared code changes here. Where a finding points at shared code (the shove, the solver
rate), this session reports it and does not fix it. `AGENTS.md`'s house rule applies: a change to
shared execution-layer code needs a bout on either side of it, and that is its own session.

## The instrument

`.review/skeleton-matrix.mjs`, a script and not a test. `.review/` is gitignored, and this is a
measurement the owner reads, not a gate.

- **Bouts**: `runBout` from `tests/harness/bout-runner.mjs`, `locomotionMode: "supported"`,
  `physics: await freshHavok()` for each bout. Run them sequentially in one process.
  `AGENTS.md` records that two Havok arenas in one realm at once change each other's outcomes.
- **Attackers**, on the left and on `golem-duelist`: the named stone builds `default` (blade),
  `mace`, `maul`, `whip` and `fists`.
- **Targets**, on the right and on their family's policy: `skeleton-warrior`, `default` and
  `human-warrior`.
- **Seeds**: 8 pairs per cell, `[0x5ce1e800 + 2 * i, 0x5ce1e801 + 2 * i]`. That is 5 x 3 x 8 =
  120 bouts. Time one bout with this script's own per-substep recording first. On 2026-09-22 a
  six-second bout took 0.69 s of wall time in the Node harness with no per-substep work, and
  about 1.9 s with session 01's per-substep hashing. Cap `maxSeconds` so the whole matrix takes
  under 30 minutes. A cell that cannot be run to a verdict inside that budget is reported as
  capped. Do not quietly drop it.
- **What to record**, from `onEvent` and `onSample`. Never from `Combat.log`, which keeps only
  the newest 24 entries.
  - For every landed blow: attacker terminal, struck part key, `kind`, `preArmourDamage`,
    `postArmourDamage`, `severed`, and the time. `HitReport` already carries all three damage
    fields, so nothing needs wrapping. Use `preArmourDamage` as the raw figure, not
    `score.damage`: `Combat` multiplies a weapon's score by its `damageScale` before armour.
  - For every bout: `result.ending`, the duration, and which of `beaten()`'s two clauses ended it
    (below).
  - **How the bout ended cannot be read from the result.** `Ending` is `"exhausted" | "time"`,
    and a fatal part and an empty bar are both `"exhausted"`. `deathRegion` is
    `outcome.blow?.limb`, the label of the last blow, so a bar ending names whatever was struck
    last. And the bodies are disposed at the verdict, while `onVerdict` takes no arguments. So
    keep the `left` and `right` units that `onSample` hands over. In `onVerdict`, snapshot the
    loser's limbs (`key`, `label`, `fatal`, `health`, `severed`) and `vitality(limbs)`, then
    classify: **fatal part** if any `fatal` limb is severed or at zero health, otherwise **bar**
    if vitality is 0. Map limb keys to the names used below (ribcage, spine, pelvis, leg,
    skull) by an explicit table in the script. Do not map by label text.
  - Per substep, for the tunnelling probe below: the attacker weapon's hilt and tip, and every
    target bone's axis end points and radius. Read these from `mesh.position` and
    `mesh.rotationQuaternion` only, for the reason `AGENTS.md` gives about `getWorldMatrix()`.
- **Exclusions**, per the tip-speed trap in `AGENTS.md`: skip the first 0.6 s of every bout.

Name the harness in every table ("Node bout harness, 2026-09-2x") and put the script's commit SHA
at the top of its output.

## The questions, in order

### 1. Can a thin bone be hit, or does the blade pass through it?

At 240 Hz a blade tip at 30 m/s moves 125 mm per solver step, and the thinnest skeleton bone is
32 mm across. "Harder to hit" was accepted; "hit at random" was not.

For each substep pair, sweep each striker's collider from its previous pose to its current one,
and take the closest distance to each bone's axis segment, sampling the sweep at 8 steps. Define
the swept geometry from each striker's own collider, not from one blade model: a segment with a
half-thickness for the blade, a sphere for the fist, and the head's own shape for the mace and
maul. The whip is several bodies; sweep each of its links. A **geometric crossing** is a sweep
that comes within the bone's radius plus the striker's own half-extent.

A **pass-through** is a geometric crossing with no *physical* contact between that striker body
and that bone in the same substep or the next one. Count physical contacts from each striker
body's `getCollisionObservable()`, keyed by `collidedAgainst`. `RigidStrike` already enables the
callback. Do not use `Combat`'s reports for this. `Combat.onContact` drops real contacts on
purpose: inside `hitCooldown` of the last hit on that part, inside `strokeClaimSeconds` for the
same striker on the same part, on a severed part, above `impossibleSpeed`, and through the parry
path. A contact that lasts several substeps is many crossings and one report. The share would
then measure contact duration, which differs between thick stone and thin bone, and the stone
control would not cancel it. Exclude severed bones and debris from the probe.

Report, per attacker and per bone, the number of crossings, the share that are pass-throughs, and
the mean tip speed of each group. Run the same probe against stone forearms as the control: a
stone forearm is thick enough that its pass-through share is the floor of what this probe counts
wrongly.

If the skeleton's pass-through share is well above the stone control, these are the options, all
of them the owner's decision:

- **A collider thicker than the bone that is drawn.** The authority is the collider, and the
  shell is cosmetic, so an upper-arm bone drawn at 22 mm radius over a 35 mm capsule is legal
  under the house rules. It gives up some of "harder to hit", which is the owner's trade.
- **A faster solver.** This is shared, it changes every body, and it is out of this plan.
- **Continuous collision detection** on weapon bodies, if Havok 1.3.14 through Babylon 9.18.1
  exposes it. Nobody has checked. Look in `node_modules/@babylonjs/core/Physics/v2/Plugins/havokPlugin.js`
  before proposing it, and it is shared code in any case.

### 2. Do clubs do relatively better against bone?

For each target, compute each weapon's mean applied damage per landed blow and per second of
bout. Then take mace / blade and maul / blade for each target. The owner's claim holds if both
ratios are higher against `skeleton-warrior` than against `human-warrior`. The overview's
arithmetic predicts about 0.69 against 0.45 on limbs, and above 1 on the ribcage. Report the
fight's numbers beside the prediction. If they disagree, find out why before tuning. The usual
cause is where blows land (more ribcage hits flatter the mace) and not the armour.

### 3. Do limbs come off easily, and is it still a fight?

- Severs per landed limb blow, skeleton against stone, for each attacker.
- Blows to the first sever, and blows to the end of the bout.
- `AGENTS.md`'s design line, quoted in `Golem.sever`'s doc comment: "a game a single blow decides
  is not a game". Count the bouts that ended on the first landed blow. Report that count for the
  skeleton and for stone.

### 4. Can the bar still be worn down?

The owner's rule: winning by chipping the health bar must keep working for every weapon. For each
attacker, count the skeleton losses by the classification in "What to record": a fatal part
(ribcage, spine, pelvis or leg) or the vitality bar reaching 0. Fists never sever: the `empty` row's `severQuality` is 1, a blunt blow
scores quality 1, and the comparison in `severs` is strict. Against a skeleton, then, fists can
only win by emptying a fatal part's health (the ribcage or the pelvis) or the vitality bar. If
fists never beat a skeleton, report it. Do not change the fist's sever rule to make it happen.

### 5. Is decapitation survivable in a fight, not only in a test?

Count the bouts where a skeleton lost its head and then won, or fought on for more than 5 s.
Record how the headless skeleton's crown aim worked (session 07): does its opponent keep landing
blows on the ribcage after the head is gone, or does it swing high and miss?

### 6. What does the spine's lethality do?

The spine is part of the torso module, so severing it severs the fatal ribcage (session 06). Count
endings on the spine against endings on the ribcage, by the classification in "What to record".

This question may come back empty. The spine is a 0.035 m capsule, 0.22 m long, centred on the
waist socket, and most of it may sit inside the pelvis and ribcage boxes, where nothing can reach
it. Before the matrix, measure how much of its length is outside both boxes in the standing pose
(the corner-sampling method `AGENTS.md` describes for the plate). If almost none is exposed,
report that rather than a zero count.

The same measurement says something the owner should hear either way. The ribcage collider is a
solid 0.30 x 0.38 x 0.20 box, so a blade that visually passes between two drawn ribs still
strikes it. "Thin colliders" covers the limbs and the neck, not the trunk.

If the spine dominates, the owner should decide between:

- raising the spine's health;
- keeping the spine as a second way to the ribcage, which it is anatomically;
- a separate torso module that splits the spine from the ribcage. That is a structural change
  and out of this plan.

### 7. Is a skeleton knocked down or flung about?

Two different things happen to a struck body, and they have different levers.

- **The fall is already mass-scaled.** Each blow queues its horizontal shove, and
  `stepSupportedLocomotionState` divides it by the supported mass before adding it to the ledger
  that decides a fall. Session 06's arithmetic predicts that one clean cut floors a skeleton at
  the stone `braceCapacityMultiplier`, where a stone golem takes about three, and session 06
  measured the line on the bench. Count, per bout, falls and time spent down. For each landed
  blow, record the ledger's `stability.specificImpulseMps` just before and just after it. Compare
  skeleton against stone.
- **The fling is not.** The physical impulse `Combat` applies to the struck part,
  `speed * 0.11 * (1.35 - quality * 0.7)` N.s for weapons without `authoredSpecificImpulseMps`,
  does not depend on that part's mass, so a light bone is thrown further. Measure, per landed
  blow, the struck part's speed change and the target root's horizontal displacement over the
  next 0.5 s, skeleton against stone.

If a skeleton falls or is flung much more than stone, the options are:

- **A stronger brace for the skeleton alone**: its own `braceCapacityMultiplier`, and perhaps
  `gaitStabilityScaleMin`, in `SKELETON_BIPED`. The biped reads both per table, so stone does not
  move. It changes falls and not the fling. About 5.7 would hold the stone golem's fall line; the
  multileg uses 2.6. Put a small sweep (for example 1.5, 2.6, 4, 5.7) beside the fall counts.
- **Heavier bones.** Skeleton-only, and it helps both. But a heavier part takes more damage per
  blow, because the reduced mass grows with it, so it works against the damage table.
- **A mass-scaled physical shove.** Shared: it moves stone and needs its own session. It changes
  the fling and not the fall.
- **Accepting it as part of the skeleton's feel.** The owner asked for less sturdy.

Say which, and do not choose.

### 8. Does it walk and stand?

Session 06 benched the legs alone. In fights, report falls, the time spent down, and whether a
skeleton ever fails to rise within `riseBudgetSeconds`. Compare with stone.

## Setting the numbers

Only after questions 1 to 8 are answered, and only in `src/golem/skeleton/body.ts`:

- **Health, per part**: set so that question 3's numbers match what the owner asked for. Limbs
  should come off in fewer blows than on stone. The owner has not said how many one-blow bouts are
  too many, so put the stone figure beside the skeleton figure in the report and ask. Do not
  invent a threshold. State the target in the doc comment and put the table under it.
- **`SKELETON_ARMOUR`**: move `cut` and `thrust` only if question 2 misses. Keep `crush: 0` and
  `slap: 0`; they are the owner's rule, not a tuning value.
- **Masses and radii**: move them only if question 1 or 7 says to, and only with the owner's
  answer to the trade.
- **`braceCapacityMultiplier` and `gaitStabilityScaleMin`** in `SKELETON_BIPED`: only with the
  owner's answer to question 7.
- **Vitality weights**: keep the stone weights except the neck and skull, unless question 4 says
  the bar cannot be worn down.

Each changed value gets a doc comment with the before/after table, the harness, the date and the
seed range. This is `AGENTS.md`'s rule for motor ceilings, applied here to every number.

## Tests

Pin what the owner asked for, as rates over several seeds, not as counts from one bout.
`AGENTS.md` explains why: counts taken over a bout are not scale-free.

1. In `tests/scoring.test.mjs`: `blunt_is_relatively_better_against_bone`. Pure arithmetic,
   with no solver. Use `scoreHit` with the blade and the mace at 10 m/s against part masses from
   the skeleton and human tables, then `armouredDamage` with `armourAgainst(SKELETON_ARMOUR, kind)`
   and with the human `0.35`. Assert that mace / blade is higher against the skeleton forearm
   than against the human forearm, and higher again on the ribcage. This is the overview's table
   as a test, so a later change to either table has to face it. Mutation: set `crush` equal to
   `cut` and watch it go red.
2. In `tests/golem-arena.test.mjs`: `a_skeleton_limb_costs_less_of_the_bar_than_its_stone_twin`.
   Sever a skeleton's primary arm, head and one leg (the leg kills), each on a fresh stand. Sever
   the head through the skull, not the neck: `Golem.sever` zeroes only the piece struck, and the
   skull is the dearer of the two. Assert that the arm costs under a third of the bar, which is
   the rule the stone arm test states. Assert that the head costs less than a stone head's sever
   does, measured in the same test on a stone stand, and that it leaves the skeleton unbeaten.
   Do not use a fixed bound: the draft weights put the skull at 0.144 of the bar, and a bound of
   0.15 would go red on the first weight session 08 moves. Pure bookkeeping, fast.
3. No bout-level tuning test. Question 1 to 8's numbers are the owner's to read, and a floor chosen
   by the person tuning is the green test that asserts what its author wanted. Write the matrix's
   output into the doc comments and leave it there.

## The report to the owner

Write `.review/skeleton-fight-report.md`: one table per question, each with its harness named, and
a short answer under each. End it with the decisions below, each with the measurement that bears on
it. Give the owner the report, not a summary of it.

### Decisions only the owner can make

1. **Tunnelling**, if question 1 finds it: a thicker collider, or accept it.
2. **How many clean hits should knock a skeleton down?** As built, one, where a stone golem takes
   about three. Against a clean 10 m/s cut, `braceCapacityMultiplier` in `SKELETON_BIPED` sets it:
   1.5 (as built) is one hit, about 3 is about two, and about 5.7 is about three, like stone. Put
   question 7's fall counts and time spent down beside each value, and say whether a skeleton
   was kept on the ground by blows landing while it rose. The flinging of light parts is a
   separate, smaller question with its own options in question 7.
3. **The spine**, if question 6 finds it dominating.
4. **Skeletons as enemies**: add them to `NAMED_BUILDS` (dungeon floors and waves), which also
   changes the research pools and `tests/research.test.mjs`'s pinned training-pool size.
5. **The pelvis**, which is fatal, so a lost leg ends the fight. The owner liked that and said they
   may revisit it.
6. **The maul**, if session 06 left the skeletal maul off the shelf.
7. **Skeleton weapons**: a lighter bone-and-rust set through `fitTerminal`, as the human family
   has, or the stone set as now. The arm already has a person's lengths (session 06), and each
   stone terminal's reach limits are scaled onto it by `ARM_SCALE`.
8. **A hit effect for bone** (dust or chips). `src/damage-feedback.ts` is one stone burst for
   every body. Nothing bleeds: `src/blood.ts` defines `Blood` and nothing imports it.
9. **The framework's name**. "Golem" is now the name of one of three families. A rename is its own
   change, about 4,900 occurrences in 171 files.

## Verification

```powershell
node tests/harness/body-fingerprint.mjs --out .review/fp-before.json   # before editing
npm test
npm run check
npm run build
node tests/harness/body-fingerprint.mjs --out .review/fp-after.json --against .review/fp-before.json --may-move "skeleton|skeletal|ribcage|skull"
```

Every stone and human section reads `same`. The skeleton sections read `moved (allowed)`, and
nothing reads `GONE`. Then check in the page: start `npm run dev` with `run_in_background`, watch
two skeleton bouts in the arena with the final numbers, stop the server and kill it by PID.
Commit the tables and the tests. The report stays in `.review/` unless the owner asks for it in
the tree.
