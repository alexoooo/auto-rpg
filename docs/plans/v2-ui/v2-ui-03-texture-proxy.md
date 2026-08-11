# v2-ui-03 — `[Texture]`, and an honest account of what it invents

**Goal:** a fighter that reads as a fighter — lit, shadowed, standing in a real room —
built from primitives at published dimensions, with every invented degree of freedom
named.

**Depends on:** `v2-ui-02` (the scene, the cameras, `[Geometry]` as the control).

**Golden expectation:** no pin moves. Presentation only — which is also `v2-18`'s
stated expectation, and for the same reason.

## What the simulation actually gives a renderer

Five capsules, two hand positions, two weapon segments, one shield quad, and **one
rotation**. No spine, no pitch, no roll, no head turn, no independent legs, no stride
phase. The legs are a *single* capsule.

So a character is mostly invented, and the honest question is not whether to invent but
where the line is drawn and who can see it. The line: **published quantities place
things; invented quantities only fill between them.** A hand is where the pose says. An
elbow is a guess. A knee is a guess about a guess.

`[Geometry]` stays one click away as the control. That is what makes this safe to build
— any suspicion that the proxy is lying is answerable in a keystroke.

## Build it to `v2-18`'s node contract

[`v2-18`](../v2-18-combatant-integration.md) already specifies the semantic names the
authored rigs will carry:

```text
root pelvis torso head
arm_left hand_left arm_right hand_right
socket_weapon_left socket_weapon_right socket_shield
region_head region_torso region_left_arm region_right_arm region_legs
idle walk stagger fall
```

The proxy uses these names for its transform nodes and sockets. Then landing `v2-18` is
swapping what hangs under each node, not rewriting the presentation layer — and the
socket contract gets exercised, and its mistakes found, a whole session before there is
an asset pipeline to blame them on.

`v2-18`'s rules apply here verbatim and are the reason this session is safe:
authoritative hands, weapon and shield are driven from pose rows; no animation creates a
hit; reactions begin only from events; **cosmetics never feed back into simulation.**

## What is published, and what is invented

| part | source |
|---|---|
| body position, yaw | published |
| head | published capsule (degenerate — extent is `radius`) |
| torso | published capsule |
| hands | published |
| weapon hilt and tip | published |
| shield centre, normal, extents | published (thickness from the fight header) |
| **elbow** | invented — two-bone IK between the published shoulder and hand |
| **legs** | invented — one published capsule split into two, gait from body velocity |
| **wrist orientation** | invented — derived from the weapon segment, which is published |

The arm capsule runs shoulder to hand and its own length is the extension, so the IK has
a real target and a real root and only the bend plane is chosen. Pick the plane away
from the torso and record the choice; a plane chosen toward the torso puts the elbow
inside the chest at guard.

The legs are the weakest claim on the page. One capsule, no stride, no per-foot contact.
A walk cycle driven from body speed will desynchronise from any notion of a footfall
because there is no notion of a footfall. Two consequences to accept openly: feet may
slide, and no visual on the legs may ever be read as evidence about footwork. If a
reader needs to judge footwork, `[Geometry]` shows the one capsule that is actually
there.

## Materials and environment

- PBR materials, one per faction, following the existing hero/monster palette so the
  five panels agree on which body is which.
- A directional light and the existing `ShadowGenerator`. Shadows are what make the 3/4
  view read as a place rather than a diagram, and they are the single largest visual
  return in this session.
- The authored room via `render/room-assets.ts` and `render/room-environment.ts`, behind
  the same asset contract and the same validator the greybox page uses. If the GLB is
  absent the mode must still render — a missing asset degrades to the procedural floor,
  it does not throw.

Toggling `[Texture]`/`[Geometry]` swaps materials and enables or disables the
environment and shadow casting on one scene. It does not rebuild the scene, and it does
not touch the cameras — all three 3D panels change together because the mode is a
property of the scene.

## Verification

```powershell
npm run check
npm run build
node tools/validate_assets.js web/assets3d/room_slice.glb
node tools/check_docs.js
cargo test
```

By hand, and this is the whole point of the session:

- **The agreement check.** At five ticks spread across a fight, toggle
  `[Texture]`/`[Geometry]` and confirm the proxy's hands, weapon tip and shield plate sit
  on the published ones. Any drift is a bug in the proxy, never a reason to move a
  published value.
- **The severance check.** A trace with a severed region — if none exists, say so, since
  no fight has ever severed anything — must drop the same limb in both modes.
- **The silhouette check**, from `v2-18`: the fighter reads at 100–250 vertical pixels
  without outlines. That is roughly the first-person panel's size.
- **The missing-asset check.** Rename the room GLB and confirm `[Texture]` still renders.

**Performance measured on the user's machine**, with shadows on, all three panels
live, and compared against the `[Geometry]` number from `v2-ui-02`. Write both into
this file. Shadow casting on ~28 nodes is the plausible regression and the reason the
comparison is worth having.

## Decision

Record `pass`, `revise` or `stop`. A `pass` needs the agreement check written down with
its five ticks, and both frame times.

Deferred even on a pass: authored rigs and skinning (`v2-18`), animation clips beyond
the velocity-driven gait, per-material wear or damage state, and audio.
