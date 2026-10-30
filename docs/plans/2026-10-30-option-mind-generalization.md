# Generalize Option Mind and replace the Skeleton fork

## Why

The owner wants one Option Mind that can use relevant configured options on any body and for
different purposes. Option Mind combines a reusable selection mechanism with one combat model
and humanoid control. Changing its option list still constructs walking, hand-covering and
recovery machinery; changing prediction data does not replace the prediction formulas.

The Skeleton can use compatible existing humanoid skills. Its copied implementation is
unnecessary, but replacing it with a preset alone does not make Option Mind body- and
purpose-agnostic.

One implementation separates these responsibilities:

- **Decision mechanism:** admission, lifecycle, resource conflicts, commitment, selection,
  reconsideration and seeded randomness, without anatomy or combat assumptions.
- **Body connection:** observations and execution through existing skills and motors. Humanoid
  and quadruped connections retain their native control implementations.
- **Context and models:** what options observe and predict, with individual models such as
  recovery valuation independently replaceable.
- **Evaluation:** what outcomes are worth for the configured purpose. Combat valuation and
  movement toward a destination are separate implementations.
- **Options:** their requirements, lifecycle, predictions and requests. Only dependencies of
  the selected configuration are constructed.

Use the existing part registry and validation, adding explicit contracts where seams are
missing. Introduce no second registry or ownership exceptions. Common machinery stays in the
Option implementation; distinctive configuration and components stay in their packages. A
skill's anatomical requirements and trained-policy coverage belong to that skill, not the
selector.

The [Skeleton combat plan](2026-10-30-option-skeleton.md) depends on this rollout. This plan owns
generalization and removal of its fork; that plan owns subsequent skill and policy improvement
and the greater-than-90% combat target. Completing generalization does not complete that campaign.

## Steps

1. **Establish the baseline and boundaries.** Record the current fingerprint and separate
   selection, combat modeling and body control. Coordinate the decision boundary with
   [Layering](2026-10-29-layering.md); the [Commander-driven drill migration](2026-10-30-drills-by-orders.md)
   remains in its existing effort. Check: dependencies and the baseline cases are explicit.
2. **Separate the mechanism while preserving the Warrior.** Extract body-independent lifecycle
   and selection code. Move combat observation, valuation, lookahead and command composition
   into configured components. Keep the Warrior's option order, timing, randomness and behavior.
   Check: paired fingerprints and the existing gate; investigate unexpected pose changes and
   report state-layout changes separately.
3. **Expose hard-coded models.** Make recovery valuation independently selectable. Preserve the
   Warrior's current model and the Skeleton's lost-offence alternative as explicit
   configurations. Do not promote the `max(...)` heuristic into a universal fix. Keep missing
   measurements and fallback assumptions visible in diagnostics. Check: reuse the demonstrated
   recovery-valuation regression against its extracted model; add no casual unit tests or
   trajectory expectations.
4. **Replace the Skeleton fork.** Retain `option-skeleton` as a preset of the common controller,
   with its unlearned punch configuration, low kick, blade guard, tuning data and flat-footed
   recovery. Delete copied chooser, options, perception, valuation and assembly code. Its skills
   remain replaceable; this step qualifies neither its placeholder punch nor its win rate.
   Check: existing configuration, orders, reporting, fork and replay contracts; no duplicated
   Option machinery in the Skeleton package.
5. **Demonstrate four bodies and another purpose.** Require configurations for Warrior, Rogue,
   Skeleton and Reptile. Preserve the Warrior and Skeleton preset IDs; add Rogue and Reptile
   configurations using compatible existing skills. Reuse quadruped crawl, bite and recovery
   without copying their control implementation. Demonstrate destination movement without an
   opponent or combat-based scoring. Check: existing execution paths and contract checks for
   the rollout presets, and brief browser inspection of all four bodies and the movement task.

Each landable change passes `npm run check`, the full `npm test` gate and `npm run build` where
browser code changes. Behavior-preserving stages use paired fingerprints. Existing limits on
run duration, retained evidence and temporary servers apply. No tournament or new win-rate
claim is needed for this generalization.

Keep archived measurements tied to their source versions: the historical 11/16 panel does not
qualify the generalized revision. Keep the README unchanged; update architecture, roadmap and
campaign descriptions concisely.

## Done when

One Option mechanism runs Warrior, Rogue, Skeleton and Reptile through configured components.
Models and objectives can be replaced without editing that mechanism. The Skeleton package
contains no duplicated Option machinery, and the existing state and control contracts hold.

This work reuses native body controls without changing anatomy, physics, muscle limits or
assists. It does not require every skill to work on every body. Combat qualification remains
the Skeleton campaign's responsibility.
