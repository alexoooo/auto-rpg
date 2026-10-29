# Shared front kicks

The front kick's settings (`KICK_PATH`, `src/core/skills/kick.ts`), the Arena's faster profile
and its selector (`ARENA_KICKS`, `KICKER`, `KICK_SELECTION`, `src/core/mind/config.ts`), and how
both were qualified. The force they deliver against trained adults is
[trained-attack-force.md](trained-attack-force.md)'s.

## Execution settings

`KICK_PATH` is engineering data, independent of anatomy. Either foot uses the named effector
tracker and finite strike cycle shared with punching. Ordinary gait places both soles under the
hip centres; both feet settle before their landing pose is captured (capturing the first gait
contact can keep transient floor penetration and reject a quiet landing by 0.2 mm at the 2 cm
gate).

Transfer needs measured centre-of-mass support inside the bearing sole, and the free foot at zero
ground load for 0.05 s before it chambers. Stance owns the bearing leg and corrects its captured
sole through muscles; IK owns the free leg; both arms stay in the ordinary guard. No pose,
velocity, strength or assistance is added. The bearing sole may rock during a stroke; flat, quiet
double support is required before preparation and after placement.

| Setting | Value | Meaning |
| --- | ---: | --- |
| setupLimit / transferLimit | 8 / 6 s | Finite preparation deadlines |
| lower / lean / transferSeconds | 0.05 m / 0 rad / 0.2 s | Supported lowering, pitch and response |
| transferSlow | 0.12 m/s | Quiet capture, transfer and recentring |
| lift / windup | 0.45 / 0.15 m | Chamber offset from the captured strike site |
| over | 0 | Where the chamber sits across the ground, as a share of the way from the captured strike site to the target: 0 over the foot (a front kick), 1 over the target (a stomp) |
| top | 1 | The height band's top over the kicking sole, as a share of the leg's reach (hip to sole); its bottom is `near` under the sole |
| alongNear / alongFar / across | 0.25 / 0.65 / 0.16 m | The window: the target this far ahead of the kicking sole's place on the body, and within this much either side of it |
| facing / admitSpeed | 0.4 rad / 0.5 m/s | The window's facing toward the target, and the ground speed at most it admits |
| chamberSeconds / swingSeconds / returnSeconds | 0.6 / 0.4 / 0.6 s | Shared tracker paths |
| contactSpeed | 2 m/s | Requested terminal speed, not measured force |
| soleTurn | 0.2 | Fraction of a quarter turn during the stroke |
| prepareLimit / returnLimit | 4 / 2 s | Measured preparation and withdrawal deadlines |
| near / slow / hold | 0.04 m / 0.3 m/s / 0.05 s | Endpoint admission; the home's height over the strike point |
| hover | 0.08 m | The lifted foot's height over where it stood, before the chamber and a set-down: clear of the ground at the toes with the foot pitched as the trunk leans on one leg |
| followSeconds | 0.04 s | Finite ordinary follow-through |
| impactSeconds / impactTravel / normalAlignment | 0.04 s / 0.04 m / 0.5 | Matched-contact ceilings and directional cosine |
| response | 0.1 s | Muscle tracking response, separate from path duration |
| placeSeconds / placeLimit | 1 / 6 s | Flat-foot placement path and deadline |
| placement / placementSpeed | 0.02 m / 0.1 m/s | Actual landing error and speed |
| rotationError | 0.001 | Maximum 1 minus absolute quaternion dot |
| recenterLimit | 4 s | Quiet double-support deadline |
| startup / cooldown | 2 / 1 s | Initial settling and inter-cycle rest |

Withdrawal returns to a home `near` over the captured strike point and restores standing height.
Placement carries the sole `hover` over its captured place while it is more than `placement`
off it across the ground, and sets it down from there; it then checks the captured sole position
and rotation, positive ground load and quiet motion. Recentring needs quiet double support and
the centre of mass within 2 cm of the soles' midpoint. Only the whole sequence counts a returned
kick: a deadline counts a failure, cancellation before a stroke an interruption. Recovery takeover
discards the foot path through the common skill resume list.

## Harness and qualification

`node research/front-kicks.mjs` records six cases in `front-kicks.json.gz`: Node unpinned Warrior
stand built in its guard, `rapier-coordinate`, 120 Hz, empty hands, balance 0, symmetric
actuation, 24 s a case, both feet at world (+/-0.1, 0.45, 0.45) m. The sliding compliant pad has
an 8 cm contact window (mass, mount and material law `PUNCH_PAD`'s), any body segment can load it,
and its momentum measures impulse independently; force histories, point motion, support loads and
motor bounds are kept.

A hit case is admitted with three clean impacts and three verified returns, and no loaded launch,
fall, trunk-floor contact, failed cycle or assistance, compression within the pad's 11 cm stroke.
The miss and unrelated-blocker cases are independent gates, and block feedback cannot authorize
the impact interval. Tests fork fresh worlds through unloading, contact and placement, and cancel
committed strokes and check standing after.

`node research/front-kicks.mjs --search` keeps the finite duration and speed search, failures
included, in `front-kicks-search.json.gz`. Admission includes misses and blockers, so hit-only
rows cannot select a faster profile.

| Swing / terminal request | Left hit / miss / block | Right hit / miss / block | Selection |
| --- | --- | --- | --- |
| 0.4 s / 2 m/s | pass / pass / pass | pass / pass / pass | stand reference (`KICK_PATH`) |
| 0.35 s / 2.5 m/s | pass / pass / pass | pass / pass / pass | rejected: built in its reference pose with the foot returned to the ground itself, it fails both hits' returns and the right miss's |
| 0.3 s / 3 m/s | pass / pass / pass | pass / pass / pass | Arena profile (`ARENA_KICKS`) |

At 0.4 s / 2 m/s the four clean left impacts deliver 7.645, 7.775, 7.855 and 7.966 N s, the
right 7.932, 7.714, 7.730 and 7.581 N s; per-step peak forces 229 to 241 N left and 225 to 235 N
right. These are low shin-height contacts; the clipped-window meter takes partial-surface loads
where a foremost corner misses the face.

Not kept: **a tall 40 cm pad at 0.65 m** catches the foot at 0.43 to 0.45 m and shortens the
stroke, and narrowing its window there exposes falls, so neither qualifies a higher kick; **full
sole rotation and faster settings** expose readiness or landing failures.

## Arena selection

`KICKER`, **Kicker (experimental)**, adds an optional kick (`ARENA_KICKS`) selector around
Scrapper's tactics, with the same body, muscles, damage, hands, low attacks and recovery; a downed
or moving foe gets the ground and punch policy. `ARENA_KICKS` is `KICK_PATH` with `swingSeconds`
0.3 and `contactSpeed` 3: its mean clean stand impulses are 10.112 N s left and 10.300 right,
against 7.810 and 7.739 for `KICK_PATH`, on the same Node apparatus, 120 Hz, symmetric actuation,
balance 0, every eligible complete hit in the 24 s trial. A trajectory gain with the anatomy
unchanged, and no claim of human parity.

`KICK_SELECTION` is an engineering trial over the foe's observed shank capsule:

| Setting | Value |
| --- | --- |
| height above support | 0.4 m |
| foot to surface | 0.45 +/- 0.08 m |
| lateral band | 0.16 m |
| facing error | 0.12 rad |
| own speed / foe's speed | 0.12 / 0.1 m/s |
| readiness | 0.1 s |
| approach, radial and lateral | capped at 0.18 m/s, 0.5 s braking |
| approach limit, then cooldown | 30 s, then the ordinary policy for 4 s |

An ordered, fallen, absent, low or displaced foe (centre of mass over 0.15 m/s) cancels the
request; the executor still withdraws and lands before combat resumes. Either foot can be
selected, alternating after each finished request. The selector samples the collider's side or
outward rounded cap (an inward cap normal is projected onto the side, so no target is inside),
ranks surfaces from the attacking foot and corrects lateral approach error. A 6 s approach limit
changes the admission pose and exposes a landing failure in the mirrored fixture, and is not kept.

**In the Arena** (`arena-front-kicks.json.gz`: Node Arena duel, same engine, rate and loadout,
both sides' balance 0, 90 s, mirrored stationary-defender trials and self-play): a strong kick
closes at 1 m/s or more natively with 0.5 m/s of centre-of-mass-relative effector motion along
the normal; slower foot contacts are recorded apart. The mirrored trials land 5 and 4 strong
kicks with no falls or failed cycles, each returning the left foot once and the right twice.
Self-play completes no kick cycle: the quiet-foe gate rarely admits one. The profile establishes
integration and a narrow physical capability, not stronger combat.
`arena-front-kicks-reference.json.gz` keeps `KICK_PATH`'s 45 s rows (no strong kicks; another
bout length, not a contact-rate comparison).

**The set-down.** Setting the foot down from over its place, not bringing it back to the ground
itself (which lands short and is held there by friction against a captured sole a few millimetres
under the surface), removes the returns and placements that time out. `combatTrial`
(`research/arena-combat.mjs`), `rapier-coordinate`, 120 Hz, empty hands, balance 0: the Kicker on
each side against a Scrapper ordered to stand, 90 s, 20 gaps of 3.5 to 4.5 m, 40 bouts a row. A
cycle is a returned or a failed kick.

| Body built in / foot returned | Cycles | Failed | Bouts with a failure | Falls | Native kick contacts | Driven kicks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| reference pose / to the ground | 154 | 12 (7.8 %) | 10 | 1 | 244 | 169 |
| guard / to the ground | 153 | 16 (10.5 %) | 14 | 3 | 241 | 165 |
| guard / over its place, then set down | 161 | 1 (0.6 %) | 1 | 0 | 261 | 182 |

The one failure left is a return that timed out at 2 s.

## Retained hand tracking cost

The kick's foot support and optional response leave the hand's tracking as it was: Node unpinned
Warrior stand, `rapier-coordinate`, symmetric actuation, 120 Hz, empty hands, balance 0, both feet
bearing and one hand reaching 10 cm after two seconds; four alternating playings warm 360 steps
and time the next 720, the first excluded. Milliseconds a step on a quiet machine:

| Playing | Before | With foot support and optional response |
| --- | ---: | ---: |
| 2 | 2.222 | 2.205 |
| 3 | 2.207 | 2.181 |
| 4 | 2.191 | 2.186 |

All eight final pose and velocity digests are
`4380b4ec09ffaa07b680311ad51e323ec708eca29619cf151d565475e232e5ed`. This holds the hand's
trajectory; it does not measure a kick's cost.
