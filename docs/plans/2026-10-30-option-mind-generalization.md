# Option Mind as a framework: entrants built on it, not copied from it

## Why

The owner wants one Option mechanism that any body and any purpose can build on, and several
Option Mind implementations entered beside one another, each its own configuration and parts:
simple, general, extendable.

A first attempt at a Skeleton entrant copied the whole Option Mind package (about 2,600 lines,
its part kinds renamed `skeleton-*`) to change a preset, a guard and one valuation term. Three
things made the copy look necessary, each fixed:

- **Two bugs in the shared model**, each read as a Skeleton need. Where no drill measured a foe,
  its prior struck with two hands only, so a body without hands dealt nothing; and lying down cost
  only the foe's blows, never what a second on one's feet is worth. Fixed in the shared model
  (`19da6608`, `946530a2`), each read on the fingerprint.
- **Toes were optional**, so the Skeleton rose by step-up on flat feet. Every humanoid now has
  toes and the game's Stand up is the toed rise ([Recovery](2026-10-23-recovery.md) step 3).
- **An entrant could not build on shared code.** A preset and a controller's parts lived in that
  controller's own file and part kinds were global, so reusing Option Mind's parts collided on
  their kinds. Fixed: the framework is the toolkit's (`src/core/option/`), each entrant a manifest
  of presets and scoped parts ([Adding an entrant](../architecture.md#adding-an-entrant)), the
  Skeleton a preset, and the objective, percepts and predictions are parts.

The decision mechanism is already body-agnostic: options with claims, entry, status and a model;
the chooser's set selection by claims, commitment, rethinking on cues and a period, letting go,
chance and the look past a walk; part roles for the chooser, the options, the objective, percepts and
predictions. What is fixed to one body and one purpose:

| Gap | Where | General form |
| --- | --- | --- |
| Combat is written into an option's model: `dealt`, `taken`, `orders` | `Terms`, `value.ts` | An option's model is its duration, its payoff and where it leaves the body; the objective prices both. Combat's few terms are one objective (`FEW_TERMS`, `objective.ts`) |
| A place's fields are combat percepts | `Place`, `position.ts` | A place names any percept it changes, a part's included |
| Every mind builds walking, the rise and strikes, which its situation reads, whatever its options | `optionTactics` | The situation reads what its option kinds and objective declare, and each kind makes what it needs |
| The threat reader senses hands only | `src/core/perception/threat.ts` | A foe's blow by any limb it strikes with (`strikersOf`) |
| A skill's settings are one body's, thrown by every body | the front kick, the stomp, the path strike, the blades, Vanguard's punch | A record per skill and body, as the straight punch's (`PunchRecord`); a body without one does not use the skill |

Decided here, which the owner may reverse: the framework's package `src/core/option/`; combat's
few terms stay the reference objective; Option Mind keeps its preset id `option`.

## Steps

1. **A second body family and a second purpose.** A Reptile preset on the framework, its crawl,
   bite and recovery as option kinds, on the command layers (`commandLayers`) like every other
   mind; the threat reader sensing any striking limb. The body's shape read from its spec, which
   the Reptile needs: the skills' and motor control's segments read from the spec's effectors and
   ends, the stance over any set of ends rather than a pair of sides, one field for support ends
   (`BodySpec.ends` for the quadruped's `effectors[].support`), `commandRefusal`
   (`src/core/body.ts`) replaced by the parts' fits, and the quadruped's own host
   (`src/core/reptile/mind.ts`) replaced by the command layers; the layer check's last listed
   import (`UP_STACK`, `parts/parts.ts -> body.ts`) goes with it. A preset whose
   objective is reaching a place, with no foe, in a Lab scenario.
   Check: the Reptile fights a Warrior and a Reptile in the Arena; the walker reaches its place;
   the owner looks at both.
2. **Every skill tuned per body.** A skill's settings are its body's record, as the straight
   punch's are (`PunchRecord`, `src/core/skills/strikes/punch-records.ts`: no setting in a mind, none
   borrowed from another body, a research `tuning` for experiments); a body with none does not
   use the skill and says so. The skills that carry one body's numbers take records the same way,
   each a run that writes its body's row; a new body is rows, not code.
   Check: each skill's fit refuses a body with no record; the fingerprint moves only what the
   records change.

Each change passes `npm run check` and `npm test`, and `npm run build` where browser code
changes; a toolkit change's message names the cases the fingerprint moves. No tournament or
rating is part of this plan: how well a preset plays is the [Skeleton
campaign](2026-10-30-option-skeleton.md)'s and each skill's own.

## Done when

The Option framework is the toolkit's; Option Mind and the Skeleton are presets in their own
folders with no copied code; an objective, a percept or an option kind is replaced by
configuration without editing the framework; a Reptile and a non-combat preset run on it.
