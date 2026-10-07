# Shared front kicks

## Execution settings

`KICK_PATH` is immutable engineering data, independent of anatomy. Either foot uses
the named effector tracker and finite strike cycle shared with punching. Ordinary
gait places both soles under the hip centres. Both feet settle before their landing
pose is captured: capturing the first gait contact can preserve transient floor
penetration and reject a quiet landing by 0.2 mm at the 2 cm gate.

Transfer requires measured COM support inside the bearing sole. The free foot must
show zero actual ground load for 0.05 s before chambering. Stance owns the bearing
leg and corrects its captured sole through muscles; IK owns the free leg. Both arms
remain available to the ordinary guard. No pose, velocity, strength or assistance
is added. The bearing sole may rock during a stroke; flat, quiet double support is
required before preparation and after placement.

| Setting | Value | Meaning |
| --- | ---: | --- |
| setupLimit / transferLimit | 8 / 6 s | Finite preparation deadlines |
| lower / lean / transferSeconds | 0.05 m / 0 rad / 0.2 s | Supported lowering, pitch and response |
| transferSlow | 0.12 m/s | Quiet capture, transfer and recentering |
| lift / windup | 0.45 / 0.15 m | Chamber offset from the captured strike site |
| chamberSeconds / swingSeconds / returnSeconds | 0.6 / 0.4 / 0.6 s | Shared tracker paths |
| contactSpeed | 2 m/s | Requested terminal speed, not measured force |
| soleTurn | 0.2 | Fraction of a quarter turn during the stroke |
| prepareLimit / returnLimit | 4 / 2 s | Measured preparation and withdrawal deadlines |
| near / slow / hold | 0.04 m / 0.3 m/s / 0.05 s | Endpoint admission |
| followSeconds | 0.04 s | Finite ordinary follow-through |
| impactSeconds / impactTravel / normalAlignment | 0.04 s / 0.04 m / 0.5 | Matched-contact ceilings and directional cosine |
| response | 0.1 s | Muscle tracking response, separate from path duration |
| placeSeconds / placeLimit | 1 / 6 s | Flat-foot placement path and deadline |
| placement / placementSpeed | 0.02 m / 0.1 m/s | Actual landing error and speed |
| rotationError | 0.001 | Maximum 1 minus absolute quaternion dot |
| recenterLimit | 4 s | Quiet double-support deadline |
| startup / cooldown | 2 / 1 s | Initial settling and inter-cycle rest |

Withdrawal returns toward the captured ground strike point and restores ordinary
standing height. Placement then verifies the captured sole position and rotation,
positive ground load and quiet motion. Recentring requires quiet double support
and COM within 2 cm of the actual sole midpoint. Only the whole sequence counts a
returned kick. Deadlines count failures; cancellation before a stroke counts an
interruption. Recovery takeover discards the foot path through the common skill
resume list.

## Harness and qualification

`node research/front-kicks.mjs` records six cases in
`front-kicks.json.gz`. Harness: Node unpinned Warrior stand, `rapier-coordinate`,
120 Hz, empty hands, balance 0, symmetric actuation, 24 s per case. Both feet target
world (+/-0.1, 0.45, 0.45) m. The sliding compliant pad has an 8 cm high contact
window; its mass, mount and material law retain `punchPad` assumptions. Every actual
body segment can load it. Pad momentum independently measures impulse, and whole
force histories, point motion, support loads and motor bounds are retained.

Admission requires three clean impacts and three verified returns per hit case,
zero loaded launches, falls, trunk-floor contacts, failed cycles or assistance,
and compression within the 11 cm apparatus stroke. Miss and unrelated-blocker
cases are independent physical gates. Block feedback cannot authorize the intended
impact interval. Tests fork fresh worlds through unloading, contact and placement;
they also cancel committed strokes and check physical standing afterwards.

A tall 40 cm pad at nominal height 0.65 m catches the foot around 0.43-0.45 m and
shortens the stroke. Narrowing that window at 0.65 m exposes falls. Those trials do
not qualify higher kicks. Full sole rotation and faster settings also expose
readiness or landing failures. `node research/front-kicks.mjs --search` preserves
the finite duration/speed search, including failures, in `front-kicks-search.json.gz`.
Admission includes misses and blockers, so successful hit-only rows cannot select
a faster profile. This does not establish trained-adult force parity.

| Swing / terminal request | Left hit / miss / block | Right hit / miss / block | Selection |
| --- | --- | --- | --- |
| 0.4 s / 2 m/s | pass / pass / pass | pass / pass / pass | retained |
| 0.35 s / 2.5 m/s | pass / pass / pass | pass / failed return / pass | rejected |
| 0.3 s / 3 m/s | failed impact/return / pass / pass | pass / pass / pass | rejected |

At the retained setting the four clean left impacts deliver 8.065, 1.970, 7.277
and 2.914 N s; the right delivers 8.240, 7.438, 7.678 and 7.721 N s. Per-step peak
forces span 145-321 N on the left and 278-311 N on the right in this apparatus.
These are low shin-height contacts, with substantial left-side variability.

## Arena selection

`ARENA_KICKER`, selectable as **Kicker (experimental)**, adds an optional kick
selector around Scrapper's existing tactics. Both share the same body, muscles,
damage, hands, supported low attacks and recovery. Brawler and Scrapper retain
their configurations. Downed or moving foes use the retained ground/punch policy.

`KICK_SELECTION` is an engineering trial over observed shank capsule geometry:
height 0.4 m above support, foot-to-surface distance 0.45 +/- 0.08 m, lateral band
0.16 m, facing error 0.12 rad, own speed 0.12 m/s, opponent speed 0.1 m/s, readiness
0.1 s. Radial and lateral approach components are capped at 0.18 m/s with 0.5 s
braking. A continuous approach is limited to 30 s, followed by the ordinary policy
and a 4 s cooldown. A 6 s approach limit changes the admission pose and exposes a
landing failure in the mirrored development fixture, so it is rejected. An ordered,
fallen, absent, low or displaced foe cancels the request; displacement here means
observed COM speed above 0.15 m/s. The executor still withdraws and lands before
ordinary combat resumes. Either foot can be selected; the reference policy alternates
after each finished request.

The selector samples the actual collider side or outward rounded cap. An inward
cap normal is projected onto the cylindrical side, preventing an interior target.
It ranks surfaces from the attacking foot and corrects lateral approach error.

`arena-front-kicks.json.gz` records Node Arena Duel, same engine/rate/loadout,
both sides' balance 0, 45 s, mirrored stationary-defender trials and self-play.
Stationary trials complete both feet's returns, record native foot wounds and
remain standing. The retained strong-hit test still requires at least 1 m/s native
closing and 0.5 m/s COM-relative effector motion along the normal. Lower-speed
native foot contacts are recorded separately and never counted as strong attacks.
The mirrored stationary trials record 2 and 4 such contacts, respectively, and
zero strong kicks. Self-play completes zero kick cycles under the quiet-foe gate.
The quiet-opponent gate rarely admits kicks in self-play. This profile establishes
integration and a narrow physical capability, not stronger competitive combat.
Orders, real falls, recovery takeover and bit-exact fresh-world Arena replay have
separate tests. High kicks, roundhouse kicks, stomps and jumping attacks remain open.

Private production preview browser QA renders the selected empty-hand Kicker and
Scrapper, shows punching fallback and the ordered standing-defender kick setup,
and keeps the continuing-recovery option selected. The simulated clock and fighter
poses advance in a visible tab. This visual check does not establish Node/browser
kick force parity.

## Retained hand tracking cost

Node unpinned Warrior stand, `rapier-coordinate`, symmetric actuation, 120 Hz,
empty hands, balance 0. Both feet bear and one hand reaches 10 cm after two seconds.
Four alternating playings warm 360 steps and time the next 720; the first is
excluded. The committed shared punch foundation is the baseline. Milliseconds per
step on the quiet machine are:

| Playing | Before | With foot support and optional response |
| --- | ---: | ---: |
| 2 | 2.222 | 2.205 |
| 3 | 2.207 | 2.181 |
| 4 | 2.191 | 2.186 |

All eight final pose and velocity digests remain
`4380b4ec09ffaa07b680311ad51e323ec708eca29619cf151d565475e232e5ed`.
This holds the retained hand trajectory; it does not measure kick execution cost.
