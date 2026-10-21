# Shared-item strikes

The grip preparation and guard geometry of a strike with one club in both hands (`SHARED` in
`src/core/tasks/point-strike.ts`), and its development screens. Warrior and Rogue pass every cell;
the skeleton fails most returns.

`createPointStrikeProbe` takes `shared: {}` for one club in both hands, or
`shared: { release: "left" | "right" }` to let that hand go when the strike enters its return. It
needs the club loadout and both hands, and makes one item attached to the right hand; the left hand
must physically reach its registered grip before `pointStrike` starts, and capture joins the
measured frames without snapping the body. Preparation holds the root pose and asks for the item
and second-hand poses of the standing bar fixture. Then centre control takes over and `pointStrike`
prepares, strikes, follows through and returns the club's swell point, both arms and the body in
one bounded torque solve. An attached arm returns to its posture measured at strike readiness,
clamped to legal ranges; a released arm withdraws to its initial reference
([withdrawal](shared-withdrawal.md)). No policy gets physics mutation authority.

## Fixture inputs and scoring

Harness: Node core world or the built `/control-tasks.html`, Rapier `.4`, adapter 5, 120 Hz,
directional actuation, ordinary ground, zero root and weapon assistance; anatomy, strengths, item
mass and inertia, grip mechanics and the contact tracker unchanged. The skeleton uses placeholder
anatomy.

| Input | Value | Basis |
|---|---|---|
| Second grip along the shaft (`secondary`) | 0.12 m | Standing bar preparation |
| Capture distance / quaternion error (`capture`) | 0.03 m / 0.02 | Standing bar preparation |
| Item origin during capture (`pose`) | (lateral offset, initial root height + 0.1, 0.4) m | Standing bar preparation |
| Capture orientation weight (`rotationWeight`) | 0.2 | Standing bar preparation |
| Shared guard point (`guard`) | (lateral offset, initial root height + 0.75, 0.4) m | Club strike height; depth matches the capture approach |
| Strike destination / obstacle depth | 0.65 / 0.7 m | Point-strike fixture |
| Maximum actual attachment gap (`gripTolerance`) | 0.001 m | Engineering acceptance gate |
| Return tolerance | 0.02 m | Point-strike gate |
| Continued control after return | 10 s in the extended screen | Long-continuation protocol |

Other inputs are those of [point strikes](point-strike.md), [moving strikes](moving-strike.md)
and [centre control](centre-control.md). Capture keeps its root-pose objective until both grips
attach: lowering the pelvis during capture kept the skeleton from its second grip.

`sharedHits` counts qualifying intended-target contacts with both grips attached. The fixture
reads actual attachment gaps, so a desired-frame distance near 0.03 m after capture is not joint
stretch. Release comes after follow-through, with pose, rotation and both velocities checked before
the next integration. Misses must score zero. Finishing the policy is not a pass: the runner checks
final return error, falls, rejected solves, shared contact, release continuity and replay.

## Extended static development screen

Node 24.19, core world, Rapier `.4`/adapter 5, 120 Hz, directional limits, no assists, development
seeds 0 and 1, centre control, 10 s of continued control. Each cell: two hits, two misses.

| Body | Keep both | Release left | Release right | Total |
|---|---:|---:|---:|---:|
| Warrior | 4/4 | 4/4 | 4/4 | 12/12 |
| Rogue | 4/4 | 4/4 | 4/4 | 12/12 |
| Skeleton | 0/4 | 0/4 | 4/4 | 4/12 |

All 36 acquire the second grip, finish, stay up, avoid rejected solves and replay exactly; every hit
contacts with both grips, every miss scores none, all 24 releases keep pose and velocities, and
the largest attachment gap is 0.000786 m. The eight failures are skeleton returns outside 0.02 m:
keep-both 0.0303–0.0328 m, release-left 0.0674–0.0780 m. Run
`research/runs/control-foundation/shared-strike-static-v1`, source SHA256
`c49b3313fbac6b20482ab1e90761ecf91d37ebce701f80f957d273a664d50965`, manifest SHA256
`d3ac2047306459a504ae4a370eabef0a0a2fc7cd9032caf654fc7ea3b98d4623`.

## Moving-target development screen

The same harness against freely swinging targets sensed three steps late; each release mode has
tracked aim, fixed aim and misses. [The 90-trial record](shared-strike.json) holds both runs.

| Body | Keep both | Release left | Release right | Total |
|---|---:|---:|---:|---:|
| Warrior | 6/6 | 6/6 | 6/6 | 18/18 |
| Rogue | 6/6 | 6/6 | 6/6 | 18/18 |
| Skeleton | 0/6 | 0/6 | 4/6 | 4/18 |

The full gate passes 40/54: tracked 13/18, fixed 13/18, misses 14/18, so no tracking advantage
shows. All 54 acquire, finish, stay up, avoid rejected solves and replay; all 18 misses score none;
all 36 releases keep pose and velocities. Every failure is a skeleton return outside 0.02 m, the
largest 0.2907 m (fixed aim, seed 0, release right). Run
`research/runs/control-foundation/shared-strike-moving-v2`, source SHA256
`66d380550158e7c15f281416690e95ade8dabcb4692d0562309205175627a63e`, manifest SHA256
`2b22b0afc25ae8eddaeea5a0dcb4c67a0b8fc57ac9cf03d9c6af9643ed0ad9f2`; its source differs from the
static run's only in the `SHARED` comment.

[Seven browser cases](shared-strike-browser.json) (all bodies, both release sides, static and
moving, hits and misses, two skeleton failures) match their Node trials' trace hashes, step counts
and outcomes exactly.

```powershell
node research/control-foundation.mjs --suite point-strike --shared --centre-control --continue-seconds 10 --actuation directional --samples 2 --workers 3 --out research/runs/control-foundation/shared-strike-static-v1
node research/control-foundation.mjs --suite moving-strike --shared --centre-control --continue-seconds 10 --actuation directional --samples 2 --workers 3 --out research/runs/control-foundation/shared-strike-moving-v2
node --test tests/core-shared-strike.test.mjs tests/research-control-foundation.test.mjs
```

The page selects `Held: One club in both hands` and `Shared grip after strike`, or
`held=shared&release=none|left|right` in its URL.
