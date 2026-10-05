# Shared physical tasks in the browser

`/control-tasks.html` uses `createSupportProbe`, `createBarProbe` and `createPointStrikeProbe`,
the same builders as the Node runner. It exposes body, selected hands/foot, development seed,
bar support mode, strike equipment and hit/miss target placement,
plus play, single-step, run, save, restore and replay. Real-time play uses `World.advance`;
batch runs call `World.step` and yield through timers independently of rendering. Rendering
never steps the physics. The reach/replacement page remains `/control-foundation.html`.

The body and separate item are drawn from their physical shapes. One item node carries its
meshes through capture and release. Floor and obstacle meshes use the fixture's actual geometry
and have no collision authority. Visual disposal does not dispose item physics or other materials.

## Verification

Harness: visible Chrome page from the built preview, Rapier 0.21.0-auto-rpg.4 / adapter 5,
120 Hz, directional muscles, zero assists, development seed 0. All three bodies were checked
with either moving foot and either shared-bar release on ordinary ground: twelve cases.
[The parity matrix](control-tasks-browser.json) records each browser observation SHA256 and
ending step, checked against [support transitions](support-transition.json) and
[standing bar readiness](standing-bar-readiness.json).

All twelve hashes match Node exactly. Each browser replay also reproduces its saved policy
and task state. The checkpoint is step 240; each digest covers the remaining body observations
through task completion, concatenated without separators, exactly as in the Node runner.
Save/step/restore was separately checked to restore step 1 from step 2. Playback advanced in
the visible tab; screenshots showed the shared grip and the item after release. Browser logs
reported no errors or warnings. The owned preview was stopped after inspection.

These are reproducibility and visual checks, not browser performance measurements. The first
batch implementation yielded through animation frames and was delayed by render scheduling;
timer-based yields remove that dependency without changing the simulation hashes. The tested
capabilities remain controlled upright support and equipment tasks, not recovery or opponent combat.

## Point-strike extension

[The strike parity matrix](point-strike-browser.json) covers all 36 development-seed-0
body/hand/loadout/hit-or-miss combinations from [the Node strike record](point-strike.json).
Every observation hash and ending step matches, and each browser replay matches its policy
and task state. The strike checkpoint is step 60; support and shared-bar checkpoints remain
step 240. The harness is the same built-preview Chrome/Rapier/rate/actuation/assist setup above.

Screenshots were inspected before and after the two-club task. Visible playback advanced
through strike/follow-through and recorded contact. Manual save at step 1, step to 2 and restore
returned to 1. Warrior/left support and shared-bar rechecks also reproduce their archived
hashes. Browser logs contain no errors or warnings. The owned tab and preview were closed.
