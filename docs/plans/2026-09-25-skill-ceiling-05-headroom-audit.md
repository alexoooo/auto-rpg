# Session 05: the headroom audit

## Goal

Use the expert to answer three questions for every body, and for every attribute:

- Is there skill to be had in this body?
- Does skill beat size?
- Does this attribute pay?

The output is a list: bodies that are dead ends, attributes that do not pay, and the specific
places where physics leaves skill no leverage. Session 07 acts on it.

## Headroom

For every family (stone, human, skeleton), every effector on the shelf, every locomotion module,
and the named builds: the expert's score and each naive mind's score, against the same opponent set.
Report headroom above walker and above the duelist, per weapon class, with the expert's
compute curve beside every figure.

Modules combine, so the unit of the audit is the **module**. The measurement covers a stratified
sample of builds in which every module appears, plus every named build. A module's headroom is
read across the builds that contain it. Every family gets the same audit, and a family added later
runs it before its modules ship.

A body is **flagged as a dead end** when both hold:

- its headroom is small, and the expert's curve on it has flattened;
- both instruments agree.

The threshold is set from the distribution across bodies and written here. It is not a figure
chosen in advance. A flagged body is not removed in this session.

## The three orderings

Measured on stone, and on every family that can vary size:

| matchup | measured |
|---|---|
| equal minds (walker vs walker, duelist vs duelist, expert vs expert), size x1 against x1.25 | the bigger body's share |
| equal bodies, the expert against the duelist | the expert's share |
| the expert at x1 against the duelist at x1.25 (about 2x mass) | the expert's share |

The owner states what "clearly" and "most" mean from this table. Session 07 is judged against those
numbers.

The idle-dummy gate carried in from physical contact is re-measured here with the expert: can every
body, played by the expert, beat an idle dummy of every family? A cell that is still at zero is a
body that cannot win, not a mind that does not know how.

## The skill-leverage checks

These are the places where precision and timing pay out of proportion to mass. If one is missing,
no mind can overcome size. Each gets a bench or a drill, and a number:

1. **Balance as state.** The ratio of the fall impulse (`fallImpulseNs`) at a body's most vulnerable
   moment (mid-step, committed on one foot, rising, pushed along the narrow axis of its base) to its
   least vulnerable. A ratio near 1 means there is no off-balancing to be had. The `off-balance`
   drill is the live test. This also covers the undiagnosed idle stone felled on almost nothing.
2. **The cost of commitment.** After a full-power stroke that misses, how long the striker is
   vulnerable, and whether the swing's reaction reaches its balance at all. The standing carrier
   follows a virtual gait, so it may not. The `punish the miss` drill is the live test.
3. **Precision pays.** Damage per joule at the best target and edge quality against the worst.
   If damage is close to proportional to energy, the heavier arm wins by arithmetic.
4. **Deflection over blocking.** A guard angled to redirect a heavy blow against one square to it:
   the energy that reaches the defender in each case.
5. **Footwork.** How much the expert gains from strafing and range against a version of itself
   whose movement is restricted to forward and back. It is a lower bound on what footwork is worth
   under today's controls, and the case for session 06's footwork controls.

## The attribute audit

For each of the nine attributes (`movement`, `turning`, `stability`, `recovery`, `armour`,
`toughness`, `armSpeed`, `weight`, `size`), swept over its range:

- **It pays:** the expert with the attribute moved, against the expert unmodified. The share moves
  across the range, by weapon class.
- **The expert uses it:** the expert's behaviour changes with it. Each attribute names the
  behaviour it should move and that is measured, for example stand-off against reach, pressing
  against the mass ratio, and time committed against arm speed.
- **Balance:** the win-share change per step of each attribute, set side by side. An attribute
  worth a tenth of the others per step, or ten times, is flagged.
- **The naive mind against the expert, on the same sweep.** Where the duelist gains as much from an
  attribute as the expert does, the attribute is raw power rather than something skill can use.
  That is not wrong in itself, and it is reported.

Old attribute figures are not compared as regressions. They were measured with the probe minds and
the old size law.

## Output

`docs/analysis/2026-09-XX-headroom.md` holds:

- the tables;
- the dead-end list;
- the attributes that do not pay, or are out of balance;
- the leverage checks that came out missing.

Each item has a proposed change for session 07, and the owner chooses among them.

## Depends on

Session 04.

## Result

Ran on 2026-09-26; the write-up is `docs/analysis/2026-09-26-headroom.md`. Every figure is Node and
headless, on the bout runner unless named. The ruler was `expert@c8,h1`, 151 lane-hours in about
9.5 h of wall time. Nothing was removed and nothing was retuned.

- **Headroom.** 30 bodies: every named build plus a stratified sample that covers every module.
  1920 bouts; the drills ran 40 starts each.
  - The ruler wins every bout against the reference on 26 bodies.
  - One dead end, `human-unarmed`, against thresholds taken from the distribution: 1.26 bars on
    bouts and +13.5 points on drills.
  - `skeleton-fists` and `skeleton-whip` cannot win against the reference.
  - Persistence headroom is zero on the humans, skeletons, fists and capped ram.
  - The compute curve still climbs on the humans and whips.
- **Orderings** at x1.1 (x1.25 is past the row), stone and skeleton, 480 bouts each.
  - Skill over size: 100 % on both.
  - Mind over mind: 100 % on both.
  - Size over size: 84 % under the expert on stone; 32 to 57 % for the naive minds; 32 to 55 % for
    every mind on the skeleton.
- **Idle gate**, 248 bouts at 60 s.
  - 50 of 124 cells have no win inside the mark.
  - `ram-capped` cannot hurt an idle body.
  - The humans cannot finish one in 60 s.
  - The skeleton's old zeros were the mind's.
- **Leverage.**
  - Balance: a window exists in the biped gait. The idle stone is felled by the waist lean motor
    folding (`TORSO_WAIST.leanTorque`, 0 falls at the doc table's value).
  - Commitment: time out of guard, 0.7 to 1.3 s, and no balance cost.
  - Precision: through the edge, 7x; blunt damage is linear in energy.
  - Deflection: physical against an edge, not against a mace.
  - Footwork: 22 points head to head, a lower bound.
- **Attributes.**
  - Toughness, arm speed, weight and size pay 3.3 to 4.2 points a step.
  - Movement, turning, stability, recovery and armour pay a quarter or less, and movement runs
    backwards.
  - Toughness is raw power.
  - Size divides by weapon for the duelist.
  - Only weight changes the ruler's plan.

Seventeen proposals for session 07 are in the write-up's section 6.
