# Reptile anatomy and control

The quadrupeds' bodies (`assets/reptile/body.json`, `assets/rat/body.json`, both read by
`reptileSpec`, `src/core/bodies/quadruped/spec.ts`), what their controllers' settings serve, and
their place in the Crypt. The numbers are in the body files, the fit scripts and the tuning
records; this page says what is an estimate and why each fit departs from its art.

## Anatomical model

The reptile is a low, sprawling quadruped, 8 kg with 1 HP and zero Steadiness: a game creature,
not a reconstruction of a species. Its geometry is fitted to art; its relative segment masses,
joint limits, torque ceilings, unloaded speeds and teeth are the authored quadruped's
(`assets/quadruped/authored-body.json`), from which the rat's body is fitted too.

Every proportion, mass weight, joint excursion, torque ceiling and speed there is an explicit
estimate for a gap in anatomical evidence, not a measurement of a specimen. Monitor-lizard muscle
architecture informs the sprawling limbs and the separate fore- and hindlimb chains (Dick and
Clemente 2016, https://doi.org/10.1186/s12983-016-0141-5; Cieri et al. 2020,
https://pmc.ncbi.nlm.nih.gov/articles/PMC7704238/); their measurements are not transcribed as
torque ceilings.

- **Mass and inertia**: each segment's declared weight over the sum of weights, times the body's
  mass, its centre of mass at the midpoint; a box has the uniform cuboid's moments, a capsule a
  uniform cylinder's. Collision geometry does not change the masses.
- **Leg speed**: every leg joint runs to 20 rad/s unloaded (40 on the rat), set for travel at
  1 m/s or more: the unloaded speed is what lets the legs carry the trunk at speed.
- **Surfaces**: an estimated 17,000 N/m, not a borrowed human table.
- **Teeth**: three lower-jaw pyramids, colliders of their own with an authored 10,000,000 N/m
  surface, adding no mass, inertia or strength: game estimates, not enamel stiffness or bite
  forces. A fitted body carries them scaled and tipped onto its own jaw's tip. A tooth wounds by
  its press (`pointLoadDamage`, `src/combat/rulebook.ts`).

## The grass lizard

The reptile is fitted to the posed grass lizard (`scripts/reptile/fit.mjs`,
[its art](../art/reptile.md#the-body-fitted-to-the-art)): its trunk, head, jaw, legs and tail
where the posed art's are. Where the fit departs from the scan or the authored quadruped:

- **Its scale keeps the authored front leg's reach**, girdle to wrist, and its paws the authored
  footprint; the scan's long body and short legs make it about 1.95 m from snout to tail tip.
- **The tail is .28 of the scan's** (`TAIL`, `scripts/reptile/pose.mjs`), so that a generated
  Crypt room holds a three-reptile pack ([encounters](#encounters)).
- **The tail is light and its joints carry it** (.27 kg against the authored .76, its joints'
  peaks raised), so the trot does not drag it to a stop.
- **The neck's torque ceiling scales** with the head and jaw's weighted lever about it, as the
  rat's does.
- **Each elbow and knee bends about its own leg's plane's normal**, not the body's z.

## The rat

The rat is fitted to Poly Haven's Street Rat (`scripts/rat/fit.mjs`,
[its art](../art/rat.md#the-body-fitted-to-the-art)). Its teeth, paw footprint and joint ranges
are the authored quadruped's but for its girdles', knees' and elbows'; its controller settings are
the reptile's but for its righting. What is its own is set for a trot at 1 m/s, each constant's
comment saying why:

- **Legs raised** (`LEG_RAISE`, `scripts/rat/landmarks.mjs`): the art holds its hips where a trot
  at 1 m/s is a gallop's pace.
- **The head carried above the art's** (`HEAD_RAISE`), so the jaw opened to the bite's gape clears
  the floor.
- **Legs' muscles twice the authored quadruped's, at 40 rad/s** (`LEG_STRENGTH`, `LEG_SPEED`): a
  trot at 1 m/s swings each paw at about twice that, its stance on two legs.
- **Its weight carried forward** (`WEIGHTS`: a heavier head, a lighter tail), or the trot tips
  back onto its hind pair.
- **Elbows and knees bend fore and aft**, about the body's x, and the girdles' second and third
  axes reach ±1.6 rad, the range its righting needs to lever it off its side.
- **It rights itself by recipe** (`righting-recipe`: poses for the body on its side and on its
  back, `assets/skills/recovery/righting/righting.json`, searched offline by
  `scripts/skills/recovery/righting/righting.mjs`), because its knees' and hips' ranges do not
  hold the angles of the reptile's way, by routes (`righting-routes`).

## Controller settings

Controller choices live with their capabilities, each record a line of values whose comment says
what each group of them serves: `PAW_SUPPORT` and `PAW_TRAVEL`
(`src/control/quadruped/tuning.ts`), `REPTILE_TROT`, `REPTILE_CRAWL` and the paw legs' `PAW_LEGS`
(`src/skills/locomotion/shared/quadruped/tuning.ts`), the bite's (`BITE_SETTINGS`,
`src/skills/strikes/bite/bite/bite.ts`), the righting recipe's (`RightingRecipe`,
`src/skills/recovery/righting-recipe/righting-recipe/recipe.ts`) and `REPTILE_RECOVERY`
(`src/skills/recovery/righting-routes/righting-routes/tuning.ts`). They are not a measured
optimum or evidence of a real animal's locomotion.

## Encounters

Every model's place in the Crypt is a `CryptModel` (`cryptModel`, `src/game/dungeon/actors.ts`):
its footprint's radius, how near its target it stands to fight and whether a fall ends its fight.
A quadruped's radius is the furthest its colliders reach from its centre in the floor's plane,
tail included. No body's fall ends its fight: it stays in and gets up.

Generated layouts alternate skeleton rooms and three-reptile packs (`ENCOUNTER_MODELS`,
`populateEncounters`, `src/game/dungeon/encounters.ts`), the pack's spacing and door clearance
`ENCOUNTERS`. Pack points lie more than 15 m from the party's start (`outsidePartyStart`),
walkable with closed doors and reachable from the start at the body's radius; a generated
candidate without the space is rejected before the run is built.
