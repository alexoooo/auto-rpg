# Shared physical tasks in the browser

`/control-tasks.html` builds the support, bar and point-strike tasks with the Node runner's own
builders (`createSupportProbe`, `createBarProbe`, `createPointStrikeProbe`), and this records that
the page reproduces Node's runs exactly. The page picks body, hands or foot, development seed, bar
support, strike equipment and target, and has play, single step, run, save, restore and replay.
Play uses `World.advance`; batch runs call `World.step` and yield through timers, so rendering
never steps physics or delays a run. Visuals are drawn from the physical shapes and carry no
collision authority; the reach page is `/control-foundation.html`
([control foundation](control-foundation.md#shared-environment-and-browser-parity)).

## Verification

Harness: Chrome on the built preview, Rapier 0.21.0-auto-rpg.4 / adapter 5, 120 Hz, directional
muscles, zero assists, development seed 0.

| Matrix | Cases | Checkpoint step | Checked against |
|---|---:|---:|---|
| [Support and shared bar](control-tasks-browser.json): three bodies, either foot, either release | 12 | 240 | [support transitions](support-transition.json), [standing bar readiness](standing-bar-readiness.json) |
| [Point strike](point-strike-browser.json): body, hand, loadout, hit or miss | 36 | 60 | [the Node strike record](point-strike.json) |

Every observation SHA256 and ending step matches Node exactly; each digest covers the body
observations from the checkpoint to completion, concatenated as in the Node runner. Each browser
replay reproduces its saved policy and task state, and save, step and restore returns step 1 from
step 2. Screenshots showed the shared grip, the item after release, and the two-club strike's
contact. Browser logs had no errors or warnings. These are reproducibility checks, not browser
performance figures.
