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
gate). Setup squares the stance in one step: the kicking foot stays where it stands, where the
strike's window was read from, and the bearing foot steps a hip's width beside it, square to the
heading, until each is within `near` of its place.

Transfer needs measured centre-of-mass support inside the bearing sole, and the free foot at zero
ground load for 0.05 s before it chambers. Stance owns the bearing leg and corrects its captured
sole through muscles; IK owns the free leg; both arms stay in the ordinary guard. The stroke and a
held contact drive the free leg firm (`EffectorGoal.firm`): the motion the servo asks, at the
muscles' full strength, so the leg is braced through the blow; the return and the placing may bend
a leg the stroke left straight off its knee's stop (`EffectorGoal.unbend`). No pose, velocity,
strength or assistance is added. The bearing sole may rock during a stroke; flat, quiet
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
| near / slow / hold | 0.04 m / 0.3 m/s / 0.05 s | Endpoint admission |
| returnNear | 0.04 m | How near the chamber the stroke's return comes to be done: the chamber where it lay from the pelvis as the stroke began, carried with the pelvis however the blow moved it, so the foot is withdrawn clear of what it struck before it is placed |
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

## Stomp settings

Kinetic's stomp (`STOMP`, `src/core/entrants/kinetic/mind.ts`) is the front kick's executor with
these settings changed; the rest are `KICK_PATH`'s. They are set for the result, the owner's goal
of a blow down on a body lying ahead; no source pins them. Read on the Strike drill's `stomping`
rung (Node stand, Rapier, 120 Hz; 12 trials, each foot at a limp Warrior and Skeleton lying on its
back, 0.8 to 1.2 m off).

| Setting | Value | Why |
| --- | ---: | --- |
| over | 1 | The chamber over the target, so the stroke comes down on it; at 0.6 to 0.8, 3 trials of 12 fell, and at 0.4 to 0.6 under a 0.7 m lift the chamber was out of reach (9 to 11 abandoned) |
| windup / soleTurn | 0 m / 0 | No draw back and no turn of the sole: a stroke straight down; a sole held flat through the stroke (soleTurn 0.001 to 0.1) met the trunk with its toes, 3.6 to 5.3 J at the median; braced, a sole turned either way through the stroke (0.1 to 0.25 of a quarter turn, toes down or up in the pelvis's frame, which a stomp tilts) met it with the toes too, and 3 to 4 trials of 12 fell |
| lift | 0.7 m | The chamber this far over the strike site: a longer stroke down; at 0.6 the median blow was 4.9 J, at 0.8 9.1 J (within a trial's spread of 0.7's, with less reach to spare), and at 0.9 the chamber went out of reach (5 of 12 abandoned) |
| top | 0.4 | The height band's top low over the sole: a lying body's trunk, never a standing one's |
| alongNear / alongFar / across | 0.55 / 0.8 / 0.2 m | The nearest places where both feet stand clear of a lying Warrior's splayed limbs are about 0.55 m from its trunk's middle: at 0.4 / 0.7, 4 trials of 12 never reached the window; at 0.5 / 0.75, 2 refused and 1 to 2 fell |
| contactSpeed / swingSeconds | 7 m/s / 0.25 s | A faster stroke, the leg braced: the best blow's median 16.7 J and 13.4 kg, against 13.0 J and 9.3 kg at 5 m/s; 6 m/s, and 0.2 s at 5 or 7 m/s, read within a trial's spread of it |
| returnNear | 0.1 m | The leg comes to rest 0.04 to 0.08 m from the chamber after a blow; at 0.04, 6 trials of 12 ended stalled, at 0.1, 4 |

Its trials (`2c92392a`'s rung): 10 of 12 landed, 2 met the body elsewhere (its lower trunk), none
fell or stalled. A trial's best blow: 17.6 kg behind the foot at the median, 23.6 J; on the Warrior
37 J at the median (12 to 63 J), the punch's 25 to 42; on the Skeleton 13 J (1.1 to 23.8 J), its
light trunk meeting the foot with little mass of its own. 0.22 to 0.43 HP dealt a trial on the
Warrior, 0.11 to 0.12 on the Skeleton. The kick takes 5.8 s from its start to its end at the
median: 0.84 s squaring the stance, 0.6 s shifting the weight, 0.6 s chambering, the stroke, then
0.6 to 1.6 s returning, 1.45 s placing and 0.8 s recentring. The profile's trials take 8.8 to
11.2 s from ready to their end, of which 2 to 7.5 s are the drill's walk to its window's middle
before it asks.

- **Braced** (`firm`): under the servo's computed torques a leg coasting down at speed met the trunk
  at activations of 0.03 to 0.3, and the blow found 2 to 6 kg behind the foot, its joints all but
  free; at full strength, 6 to 47 kg. The one blow before that reached 13.5 kg had the hip and knee
  at full activation by chance.
- **Unbent** (`unbend`): the stroke leaves the leg straight at the knee's stop, where the reach's
  solve sees no way to shorten it; the return or the placing then waited out its deadline in 4
  trials of 12, and with the knee begun off its stop in none.
- **Squared in one step**: setting both feet a hip's width about their midpoint took two steps,
  1.6 s of the 3.2 s from the kick's start to its blow; the kicking foot kept, one step brings the
  blow 0.8 s sooner. The bearing foot kept and the kicking foot stepped instead moved the kicking
  foot off where its window was read: 1 trial of 12 fell, 1 stalled, the median blow 13.9 J.
- **Tried and not kept**: a looser square (`near` of 0.08 m changed nothing; at 0.15 m none was
  set, the weight's shift took longer and 6 trials of 12 missed); a shorter chamber (0.4 s) or
  placing (0.6 s), each alone with 1 to 2 trials of 12 fallen, for 0.3 s;
  the stroke's end held within 0.95 or 1 of the leg's length from the hip,
  so the knee is still bent at contact (1 to 2 trials of 12 fell, no stronger blow); a nearer window
  (0.3 to 0.5 / 0.55 to 0.75 m), whose blows with the knee bent 43 to 66 degrees reached 47 to 126 J,
  but where 2 to 3 trials of 12 fell and 2 to 10 never reached the window.

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
