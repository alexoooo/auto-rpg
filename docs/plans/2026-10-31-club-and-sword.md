# The Warrior's club and sword at a person's level

## Why

The owner wants the Warrior's club and sword blows strong, at a person's level, as the straight
punch is made (2026-10-31). Today no body has a club blow, so no mind swings a club; the sword's
cut and thrust are the Warrior's `BLADE_STRIKE`, an arm's path set by hand, and its cuts are weak
([skill records](../reference/skill-records.md#the-blades),
[sword and buckler](../reference/sword-and-buckler.md#1-a-cut-that-wounds)). The punch reached its
bar as a whole-body motion: a schedule of the trunk's, legs' and arm's pushes, searched, then
steered by a trained network ([learned punch](../reference/learned-punch.md#what-is-used)).

This plan takes the club blow over from [Buckler and club](2026-10-29-buckler-and-club.md)
(its steps 2 and 3) and adds the sword.

## The bar

One bar for a blow with a held item, the Warrior's: the untrained adult's one-handed blow with a
household implement less one SD, **64.8 J** (the crutch's 75.5 ± 10.7 J, Frantz, Sprenger &
Jackowski 2026; [human strike reference](../reference/human-strike-reference.md#2-one-handed-stickclubbaton-and-bats-as-a-two-handed-ceiling)),
the rules' energy (`LandedBlow`'s `energy`), as the club's is today (`BAR.held`,
`src/evaluation/strike/read.ts`). The one-handed sword's peer-reviewed data are thin; the blow
energy quoted for a 1 kg one-handed sword, 60 to 65 J
([human strike reference](../reference/human-strike-reference.md#3-one-handed-sword-cut)), agrees.

A blow lands when, at once:

- it carries the bar's energy;
- it meets with what the item strikes with, as the rules read the contact: the club blunt, the
  sword's cut with its edge and its thrust with its point (`directed`, `src/core/rules/blows.ts`);
- it meets the mark asked, the striker up and its action ended.

Its speed over the last 0.1 m and its time from the action's start are reported, not gated. A blow
is good enough when 90 % of those thrown land on held-out trials at 120 and 480 Hz, none falling,
its window's coverage reported beside it, as the punch's ([Punch](2026-10-28-punch.md#the-bar)).
The game's loadouts hold the buckler in the left hand, so each blow is read holding it. Another
body's bar is the Warrior's scaled, as the punch's will be.

**Decided here, which the owner may reverse**: one energy for every held blow; the sword's blow
judged by the club's source.

## Steps

Each lands green on its own (`npm run check`, `npm test`, the fingerprint against the commit
before, `npm run build` where browser code changes). A search or training run is priced on the
pool from its first trials.

### 1. A whole-body held blow

A held item's blow as a whole-body motion: the straight punch's timed drive (`StraightPunch.timed`,
`driven`) for any held item's striking point, its path its blow's (the club over the shoulder and
down, the sword's cut along its edge, its thrust along its point), its settings the body's record
for each item and blow (`SkillRecord`), a body with none refusing it. Option Mind's Warrior
throws it holding the club or the sword, the buckler in its left hand (actions of its preset); the
Strike drill's still rung holds each loadout. It replaces `BLADE_STRIKE` for the Warrior's sword
where it does better on the bar; a part with no reader left is deleted.

Check: the gate; the Strike drill's still rung plays each blow, each trial read against the bar.

### 2. Searched to the bar, still

Each blow's schedule searched on the Strike drill's still rung against the bar (the punch's
schedule search, `research/punch-drill.mjs`, or `research/skill-search.mjs`), the club first, then
the cut, then the thrust. Where the best is short of the bar, the body's ceiling for that blow is
read, and the body's numbers are set for the result where the body is the limit (sourced as the
owner's decision, with its before and after), as the punch's arms and trunk were
([the punch's body](../reference/punch-body.md)).

Check: the still rung's held-out reading at 120 and 480 Hz, none fallen; the reel watched (the
failures first).

### 3. Steered

Each blow steered as the punch is, a network trained on the general trainer to 90 % held out at
both rates. The owner asked for it now, ahead of Option Mind's design steps (2026-10-31).

Check: the held-out reading; the owner accepts the still rung for each blow.

### 4. Priced and up the ladder

Each blow's profile regenerated from its records (`research/strike-profiles.mjs`), so Option Mind
prices it by measurement; then the fight rung and rungs 1 to 5 in the punch's order
([Punch](2026-10-28-punch.md#2-the-punch-at-its-bar-everywhere)).

Check: each rung's held-out reading at the bar; the owner accepts each rung.

## Done when

The toed Warrior's club blow, sword cut and sword thrust each land 90 % of those thrown at the bar
on held-out trials of the still rung, the fight rung and rungs 1 to 5, at 120 and 480 Hz, none
falling; Option Mind prices each by its measured profile; and the owner has accepted each rung.
