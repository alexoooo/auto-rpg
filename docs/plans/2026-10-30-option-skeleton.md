# Empty-handed Skeleton combat

## Why

The owner wants an Option Mind entrant, `option-skeleton`, that beats every existing Arena entrant
more than 90% of the time, armed opponents included. It is a preset of the common Option Mind
with parts of its own where it needs them, in `src/core/entrants/option-skeleton/` with its data
in `assets/entrants/option-skeleton/`; nothing of Option Mind is copied. The body's anatomy,
attributes, assists and fight rules are fixed: the 15 kg Skeleton on toes, rising by the game's
Stand up. Saved recipes and Git keep the baselines.

It starts after the [AI testbed layout](2026-10-30-ai-testbed-layout.md) step 5, which makes the
Skeleton a preset and deletes the copied package. A gap in the shared
model found here is fixed there, for every mind, never in the preset.

## Steps

1. **The preset on the common mind.** The low kick and the game's rise.
   Check: the gate and build; the preset fits the body and builds in the Arena; no Option
   machinery in its folder.
2. **Its straight punch.** A record for its body (`PunchRecord`): the schedule searched on it
   (`research/punch-drill.mjs`), the steer trained over it (`research/environments/punch.json`
   with its body's subjects), written by `research/punch-export.mjs`.
   Check: the Strike drill's link for its punch at the record's version; the reel watched.
3. **Rising on toes.** The game's Stand up on the Skeleton, read on the stand-up target's falls
   beside the Warrior ([rising](../reference/rising.md#the-owners-target)); its edges' profiles
   measured on its body so its route is priced, not guessed.
   Check: the Skeleton's falls stood and their median, against the Warrior's.
4. **Screen a small mixed panel**, on both sides, to find the failure that decides the next
   change. Keep the rows and watch the losses. The [combat record](../reference/option-skeleton-combat.md)
   holds the readings and their scope.
5. **Improve one implementation at a time**: its strikes' profiles measured on its body, low
   targets, the punch's exchange, threat prediction, approach and retreat, then option selection
   as the fights require. Each iteration names its question, changes one part, and is read
   paired against the version before. Search and training are offline; execution keeps to the
   Mind contract and replayable state.
6. **Widen the panel to the whole Arena field**: every valid mind, body and loadout, Vanguard,
   legacy minds and armed loadouts included, the candidate and drill-only controllers excluded,
   candidate against the field only, as explicit case recipes in the existing evaluation
   machinery.
7. **Confirm on reserved conditions**: both sides, other gaps and bearings, and the obstacle
   court. Strict wins and their uncertainty per opponent, draws apart; an unchanged recipe
   repeated is no new evidence. The sampling and stopping rule are fixed before the
   confirmation; a field-wide claim accounts for every opponent tested. Watch the worst fights.

Every run is priced from its first trials' rate, cut into runs of about ten minutes or less, and
keeps its rows. Code changes pass `npm run check`, `npm test` and `npm run build`, and land as
separate commits. A skill's qualification still needs its drill and the owner's acceptance.

## Done when

The Skeleton preset runs on the common Option Mind in the Arena, its parts and saved state keep
the common contracts, and held-out evidence supports a strict win rate above 90% against each
entrant in the declared field. The report lists every opponent and every failure left; a
mixed-panel average alone does not meet the target.
