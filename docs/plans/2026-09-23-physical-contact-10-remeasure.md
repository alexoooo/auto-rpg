# Physical contact 10: re-measure, write up, and the owner's eye list

## Re-measure

1. **Rerun all nine stat sweeps** on stone with the four probe minds and on the skeleton duelist
   mirror, at 192 blocks and at their current row levels. Every earlier table was measured against
   the old contact model and is void.
2. **Rerun the three giant presets** against x1.
3. **Re-derive each attribute row's `min` and `max`** from the new benches where a bench set them.
   Record any row whose range moves.
4. **x1 balance against session 01:**
   - stone, skeleton and human mirrors;
   - knockdowns, damage, bout length, and time spent down;
   - the stuck-down and downed-target censuses;
   - the stun-lock figures, for the owner's call;
   - the idle-dummy matrix, which must have no cell at zero wins.

## Write-up

- **`docs/analysis/2026-09-23-attribute-measurements.md`** gets a new "Physical contact" part:
  - the baseline;
  - what each session moved;
  - the new sweep tables.

  Each old stat section gets one line saying it was measured against the old contact model, with the
  new table beside it.
- **Row comments** in `src/golem/attributes.ts` take the new figures.
- **`AGENTS.md`** gets a trap or a rule for anything this set paid for.

## Final report

For the owner, in this order:

1. **The headline numbers:**
   - giant against x1;
   - x1 balance;
   - the censuses;
   - the lift and push counts.
2. **Chosen on the owner's behalf.** Every owner-level choice a session made with the recommended
   default, each with where it lives and how to reverse it.
3. **Anything a session stopped on** or left open.
4. **The owner's eye list** below.

## The owner's eye list

Collected from every session. Look at each on the dev server after the set is done. Each item names
the build and what to look for.

- **02:**
  - a body rising beside an opponent standing over it;
  - a body rising off a wall;
  - a skeleton knocked down mid-rise;
  - a grounded body swinging, worse than standing but not limp;
  - the worst stun-lock chain found, by build and seed. The owner decides whether physics alone is
    acceptable here.
- **03:**
  - a standing golem finishing a fallen one with a blade, a mace and a fist;
  - the fallen one swinging and guarding back from the ground, weakly.
- **07:**
  - the all-max giant lifting and launching a x1 from below;
  - pushing one back;
  - two x1 bodies pressing together with neither lifting.
- **10:** the all-max giant against a x1, which should look and win like a giant.
- **Carried from the attributes set**, still unchecked:
  - the attribute sliders in the arena setup corners and the dungeon hero dialog, with Reset and a
    URL round trip through a navigation;
  - the read-only line in the HUD diagnostics;
  - foot slip at movement x1.5 and turning x1.5;
  - the whole body at size x0.8 and x1.25.
