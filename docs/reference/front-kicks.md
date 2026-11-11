# The stomp's settings

The stomp's executor (`stompExecutor`, `src/skills/strikes/stomp.ts`) takes its settings
from its body's record (`assets/skills/strikes/stomp/stomp.json`, by `bodyKey`), and each record is whole: it holds
every key `STOMP_PATH` names (`research/skills/skill-records.mjs` writes no other). A body with no record
throws no stomp (`recordFault`, `src/skills/framework/records.ts`), unless an experiment's
research `tuning` is whole in its place (`wholeStomp`, `stomp-part.ts`); a research `tuning` sets
settings over the record's (`tunedSettings`). `STOMP_PATH`'s values are the ones the records share
outside [stomp settings](#stomp-settings); a search starts from a body's record, or the Warrior's
where it has none (`research/skills/strikes/stomp/skill-search.mjs`).

## Execution settings

`STOMP_PATH` is control data, not anatomy. A stomp runs in stages: setup squares the stance in one
step (the stomping foot stays where its window was read, the bearing foot steps a hip's width
beside it, square to the heading); transfer moves the centre of mass inside the bearing sole;
unload holds the free foot `hover` over where it stood at zero ground load; the stroke runs the
effector tracker shared with punching, the leg firm (`EffectorGoal.firm`) from `brace` before the
path's end and through a held contact; the return starts at rest, carried with the hip, and may bend
a leg the stroke left straight (`EffectorGoal.unbend`); placement and recentring end it. A return
that lets the centre of mass off the bearing foot ends the stomp (`interrupted`), and the stance
steps to catch the body. A deadline ends it as `stalled`.

| Setting | Value | Meaning |
| --- | ---: | --- |
| setupLimit / transferLimit | 8 / 6 s | Deadlines to square the stance, and to shift the weight and unload the foot |
| lower / lean / transferSeconds | 0.05 m / 0 rad / 0.2 s | How far the pelvis is lowered and pitched from the transfer to the return, and the time a pitch is asked over |
| transferSlow | 0.12 m/s | The most centre-of-mass speed at which the stance counts as quiet |
| lift / windup | 0.45 / 0.15 m | The chamber's height over the strike point, and how far it is drawn back along the heading |
| over | 0 | Where the chamber sits across the ground, as a share of the way from the strike point to the target: 0 over the foot, 1 over the target |
| top | 1 | The height band's top over the stomping sole, as a share of the leg's reach (hip to sole); its bottom is `near` under the sole |
| alongNear / alongFar / across | 0.25 / 0.65 / 0.16 m | The window: the target this far ahead of the stomping sole, and within `across` either side of it |
| facing / admitSpeed | 0.4 rad / 0.5 m/s | The most the heading may differ from the target's bearing, and the most ground speed the window admits |
| chamberSeconds / swingSeconds / returnSeconds | 0.6 / 0.4 / 0.6 s | The tracker's paths to the chamber, down the stroke, and back |
| contactSpeed | 2 m/s | The foot's asked speed at the end of the stroke |
| brace | 0 s | How long before the stroke's path ends the leg is driven firm; 0 braces the held contact alone |
| soleTurn | 0.2 | The sole's turn during the stroke, as a share of a quarter turn |
| prepareLimit / returnLimit | 4 / 2 s | Deadlines to reach the chamber and to return from the stroke |
| near / slow / hold | 0.04 m / 0.3 m/s / 0.05 s | A place is reached within `near`, slower than `slow`, held `hold` |
| returnNear | 0.04 m | How near the chamber the return comes to be done |
| hover | 0.08 m | The lifted foot's height over where it stood, before the chamber and before a set-down |
| followSeconds | 0.04 s | The follow-through after contact |
| impactSeconds / impactTravel / normalAlignment | 0.04 s / 0.04 m / 0.5 | The longest a contact is held, the farthest the foot travels in it, and the least cosine between the stroke and the surface's normal |
| response | 0.1 s | The muscles' tracking response, apart from a path's duration |
| placeSeconds / placeLimit | 1 / 6 s | The flat-foot placement's path and deadline |
| placement / placementSpeed | 0.02 m / 0.1 m/s | The most landing error and foot speed a placement accepts |
| rotationError | 0.001 | The most 1 minus the absolute quaternion dot between the placed sole and where it stood |
| recenterLimit | 4 s | The deadline for quiet double support with the centre of mass back between the feet |

## Stomp settings

Each toed body's row of `assets/skills/strikes/stomp/stomp.json` differs from `STOMP_PATH` in these settings and
agrees with it in the rest. Each is set for a blow down on a body lying ahead: its stroke and window
(`contactSpeed`, `swingSeconds`, `chamberSeconds`, `lift`, `over`, `alongNear`, `alongFar` and
`brace`) searched on the Strike drill's `stomping` rung
(`research/skills/strikes/stomp/skill-search.mjs`, each row's `made`), the Rogue's `across` and `returnNear` the
Warrior's scaled by its stature. The Skeleton has no record and throws no stomp.

| Setting | Warrior | Rogue | Why |
| --- | ---: | ---: | --- |
| over | 0.9496 | 1 | The chamber over the target, so the stroke comes down on it |
| windup / soleTurn | 0 m / 0 | 0 m / 0 | A stroke straight down, the sole level with the pelvis: a turned sole meets the trunk with its toes |
| lift | 0.6329 m | 0.8025 m | A long stroke down, short of where the chamber leaves the hip's reach |
| top | 0.4 | 0.4 | The height band low over the sole: a lying body's trunk, never a standing one's |
| alongNear / alongFar | 0.55 / 0.8 m | 0.4653 / 0.8895 m | Where the target lies ahead of the stomping sole: places where both feet stand clear of a lying body's splayed limbs |
| across | 0.2 m | 0.184 m | How far to either side of the sole the target may lie |
| contactSpeed / swingSeconds / chamberSeconds | 8.0377 m/s / 0.2927 s / 0.7616 s | 10.4386 m/s / 0.2596 s / 0.6935 s | A fast stroke down |
| brace | 0.0756 s | 0.1193 s | Braced before contact, more mass is behind the foot |
| returnNear | 0.1 m | 0.092 m | The leg comes to rest short of the chamber after a blow; a nearer mark stalls the return |

**Measurement** (the Strike drill's `stomping` rung; Node, core world, `rapier-coordinate`,
120 Hz, each command 1 step late): the Warrior's blows at a lying Warrior carry 15 to 52 J. Braced at contact alone
and with a slower stroke (`brace` 0, `contactSpeed` 7 m/s, `swingSeconds` 0.25 s, `chamberSeconds`
0.6 s, `lift` 0.7 m, `over` 1), they carry 9.7 to 26.6 J.
