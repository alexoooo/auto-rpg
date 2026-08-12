# Smart AI tactical policy

**Purpose:** Preserve the tactical controller's measured behavioral-gate result and downstream blocker.
**Status:** current
**Canonical source:** this record and `crates/policy/src/articulated_tactics.rs`.
**Update when:** Tactical threat assessment, phase transitions, strike planning, or contact-energy behavior changes.

**Measured:** 2026-08-11, native MSVC x86-64.

## Result

The stationary-target corpus sampled more than 400 mirrored rows before the full run
hit the command's 120-second execution limit. Every sampled row named a region and
crossed it before tick 1,800; command refusals and solver rejections were both zero.
This supports the controller's geometric claim but is not the required outcome gate,
and it is explicitly a partial sample rather than a completed 100-seed result. Session
05 subsequently closed `revise`: changing the billing boundary could not create energy
the contacts did not carry.

The moving-fight diagnostic was:

```powershell
cargo run --release -p lab -- articulated --seeds 10 --mirrored --policy tactical
```

After `Seek` was corrected to advance along the subject's observed body yaw, the 20
runs produced 34,386 contact resolutions: 30,906 weapon/body, 1,845 weapon/shield and
1,635 weapon/weapon. They produced three severances and zero refused submissions.
All 20 reached tick 3,600 and were scored on points; zero were decided by a body.

The policy therefore fails the session's `95/100` body decisions before tick 1,800.
That threshold is not reduced. The result is `revise`: deliberate geometry and legal
commands exist, but the current contact-energy behavior does not turn them into timely
fight outcomes.
