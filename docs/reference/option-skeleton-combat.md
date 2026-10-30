# The independent Skeleton's combat

The independent `option-skeleton` is below the owner's greater-than-90% target against every
Arena entrant. Its current mixed panel wins 11 of 16, against the initial 6. The blade guard adds
two narrow wins to the low front kick and the cost of offence foregone while down. Falls and
recovery remain weaknesses. The [campaign](../plans/2026-10-30-option-skeleton.md) defines
the work and final field.

## What is used

- The 15 kg Skeleton, empty-handed, flat feet and Balance 0, at default attributes.
- Its independent controller, private chooser and options under `src/core/entrants/option-skeleton/`.
- The game's verdict and cap, reaction delay 0.15 s, seed 0; both sides on the open stage at 4 m.
- The tournament's eight-member default panel for the initial reading. It is a development
  screen, not the complete Arena field, and omits Vanguard.
- The `skeleton-combat` evaluation enumerates the complete legal field: 246 opponents across
  11 mind presets at `c62d0d62`, Vanguard and legacy minds included, under all legal hand
  assignments. Its standard protocol plays both sides at 4 m on the open stage. The full field
  has no combat reading yet; the reserved confirmation conditions remain separate work.

## Measurement

Node core bout world, `rapier-coordinate`, 120 Hz. Each figure below names its code.

| Reading | Result |
| --- | --- |
| Initial panel at `0bd473d1` | 6 wins, 10 losses, no draws |
| Panel at `7a4014ab` | 9 wins, 7 losses, no draws; score difference +0.188, 95% interval -0.125 to +0.563 |
| Panel at `c5ce647b` | 11 wins, 5 losses, no draws; mean life margin +0.017 |
| Mean life margin, initial / `7a4014ab` | -0.096 / +0.014 |
| Reptile pair at `0bd473d1` | 2 losses, final life margins -0.8095 and -0.8098 |
| Reptile pair with low kick at `b19f628e` | 1 win, 1 loss; life margins +0.0653 and -0.0973 |
| Time down in the low-kick pair | 97.7 of 116.1 s on the left; 89.1 of 108.5 s on the right |
| Reptile pair at `7a4014ab`, including offence foregone while down | 2 wins; life margins +0.1397 and +0.0466; still down 92.3 and 96.2 s |
| Vanguard's empty-handed Skeleton at `c62d0d62` | 2 wins; mean life margin +0.026 |

The initial panel's [record](../../assets/evaluations/tournament/2026-10-30-0bd473d1-6ae8eb13.jsonl)
keeps every recipe, trace digest and verdict. Its
[paired successor](../../assets/evaluations/tournament/2026-10-30-7a4014ab-23ee982f.jsonl)
has the same shared context and opponents, verified by `npm run compare` with the subject
`option-skeleton/crypt-skeleton/empty,empty`. The eight paired units are opponents, each played
on both sides. The short screens and the low-kick pair are kept
locally in `research/runs/option-skeleton-combat/screens.jsonl`, with recipes, per-second
diagnostics, blows, digests and wall times. The pair takes 25.3 s on two worker threads.
The exact Vanguard opponent is read through the complete-field evaluation in its
[record](../../assets/evaluations/skeleton-combat/2026-10-30-c62d0d62-0bd6da30.jsonl).

A 30 s diagnostic at `0bd473d1` shows no attempted action against the Reptile. Against the
Rogue with sword and buckler, the Skeleton is down by 11 s, and step-up times out after 16 s.
The low-kick pair remains below the target and qualifies no skill rung.

The starting isolation check, a ten-second empty-handed Skeleton duel against Duellist, has
the same pose digest for the reference and the independent controller: `0958ea8067b2cb32`.
The standard fingerprint also records the new entrant at `0bd473d1`.

## Blade guard and first exchange

At `c5ce647b`, the private `skeleton-guard` starts in the ordinary posture and raises its arms
when a sensed enemy holds an edge or point. It reads physical equipment, never the opponent's
mind name. Its three arm angles live in `assets/entrants/option-skeleton/guard.json`; its mutable
posture lives in saved state and remains the same object read by the arbiter and punch. Against
blades, the chooser values a positive life lead from the start of the fight. Other opponents
retain the ordinary late-fight lead rule. The body, muscles, assists and default step-up remain
unchanged.

The [panel record](../../assets/evaluations/tournament/2026-10-30-c5ce647b-5c996c27.jsonl)
keeps all 16 cases. The ten non-blade bouts have exactly the same pose digests and readings as
`7a4014ab`. The two added wins are the left-side Rogue with sword and buckler, life margin
+0.0000249, and the right-side Skeleton sword duel, +0.0021186. These leads are fragile;
the complete field and reserved conditions have no reading on this version.

`npm run compare` reports a descriptive score difference of +0.125 over eight matched opponent
units, with a 95% interval of 0 to +0.250. Its shared-context check flags the intervening
complete-field evaluation tooling changes, so this is not an automatically qualified causal
comparison. The protocol, physical recipes and opponent configurations match; the earlier
toolkit change also retains the standard fingerprint.

The fixed guard search reads 16 candidates in 83.7 s on four workers, using both Rogue sides
for 20 s at 4 m. Its winning angles feed the conditional guard. A further adaptive-posture
search reads 32 candidates in 320.8 s, but its best short-screen pose loses three of four full
sword confirmations and is rejected. Search rows remain in
`research/runs/option-skeleton-combat/`; harnesses and logs are in its `exchange/` folder.

The recorded failures are inspected in the browser: at 10 s against the Rogue the Skeleton is
down while the Rogue stays clear; at 20 s in the Skeleton sword duel both bodies are down and
struggling to rise. Their health readings match the Node records exactly at those times.
The baseline Rogue approach and fall are also inspected. These are partial failure-reel
inspections, not complete-bout viewing or skill qualification.

## Experimental recovery

At `5d3a5869`, the private `skeleton-recovery` technique is available through the entrant's
`ground` list. The default remains `step-up`: the experiment does not recover the actual Rogue
fight falls. The open question is how to transfer the roll from placed starts to those falls.
Its code and data stay in the entrant's folders; other minds cannot name its private part.

`ROLL` (`roll.ts`, `assets/entrants/option-skeleton/roll.json`) drives two searched poses, then
flattens with bent knees once the pelvis faces down. It retains the existing roll's loaded-front
predicate for 0.1 s. `RECOVERY` (`recovery.ts`, `assets/entrants/option-skeleton/recovery.json`)
sets the fold, tuck and prop times, scales the kneeling and step-through times, and sets the
stance's climb after the half kneel. The normal standing predicate and two-second follow-up
remain fixed. The muscles, anatomy, attributes and assists are unchanged.

The local Node stand uses `rapier-coordinate`, 120 Hz, Balance 0, flat feet, placed front and back
starts with 0.02 joint-range spread. The pose search plays 528 candidates on two back starts in
108.6 s on four workers; flattening completes both training rolls. The timing search stops at
48 candidates in 26.3 s once front and back seed 2 both stand and remain up for two seconds.
Across seeds 0–3, six of eight starts remain standing; four of the six reserved starts do.
These are local screens, not the owner's full recovery target or a qualified drill.

The paired 45 s Rogue sword-and-buckler screen still has life margins -0.0093 on the left and
-0.0016 on the right, with 35.67 and 36.68 s down, equal to the default's margins and down times.
Skipping the wind-up on a side entry also fails to transfer. The fixtures, recipes, diagnostics
and search rows are retained locally under `research/runs/option-skeleton-combat/`; the harness
sources and logs are under its `recovery/` folder. Its motion has not been watched, and it
qualifies no skill rung.

## Tried and not kept

The current controller is the reference for these local screens, on the same harness and with
the same physical conditions. Their rows stay in `research/runs/option-skeleton-combat/`.

| Alternative | Reading and decision |
| --- | --- |
| Toed Warrior sit-back techniques on the flat-footed Skeleton | Construction refuses the requested ankle angle, 0.7 rad, against the Skeleton's maximum 0.3892; no fight is played |
| Staged recovery alongside step-up | The 45 s Rogue sword-and-buckler pair chooses step-up; equal trace digests to the same-duration reference |
| Staged recovery alone | Both full Rogue bouts still lose, life margins -0.0113 and -0.0016; not kept |
| Higher, more upright straight punch | In four 20 s sword screens, none falls, but three exchanges are negative, the Rogue's -0.0323 and -0.0611; not kept |
| The more upright punch aimed at the belly | In the same four screens, three exchanges are negative, the Rogue's -0.0042 and -0.0523; not kept |
| Punch settings searched at close range | 48 candidates, four 8 s sword exchanges each at 1.5 m, in 208 s on four workers, no invalid candidate; the best loses three of four full held-out 4 m fights, the Rogue's margins -0.0994 and -0.0173; not kept |
| Cover the predicted trunk threat | The 30 s Rogue exchanges are unchanged; the full Skeleton sword pair still loses twice, margins -0.0023 and -0.0110; not kept |
| Preserve a positive lead from the start | The 30 s Rogue exchanges are unchanged; the Skeleton sword exchanges remain negative, -0.0148 and -0.0260; not kept |
| Sit-back targets clamped to the Skeleton's joint range | One of two placed front starts reaches standing, but reserved starts and actual fight falls remain unreliable; the symmetric route is not kept |
| Separate leg-directed kick and earlier kick entry | The four 20 s sword exchanges remain negative; the earlier entry also loses both Rogue screens; not kept |
| Fixed raised guard and early lead protection against everyone | 8 of 16 panel wins; non-blade regressions reject the universal policy |
| Raised construction pose, lowering against non-blades | 9 of 16 panel wins, with non-blade regressions; retain ordinary construction instead |
| Adaptive guard angles selected by four short sword exchanges | Best of 32 candidates wins only one of four full confirmations; retain the earlier guard angles |
