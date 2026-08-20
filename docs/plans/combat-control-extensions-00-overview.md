# Combat control extensions -- overview

**Status:** future topic. Begins only after the current arena topic closes, unless session
09 proves the anatomical limit blocks its acceptance and explicitly pulls sessions 02 or
03 forward as measured mechanics prerequisites.

The playable arena deliberately installs Human or policy control at fight construction
and lets the simulator's ordinary arm reach law accept targets behind or through the
owner. The owner has requested three deeper changes: take over and release a live body,
prevent anatomically impossible rear targets, and prevent arms or held weapons sweeping
through their owner. They are related at the screen and unrelated in authority:

- live takeover is a host/controller transition whose replay is still complete commands;
- a rear envelope changes the arm target law; and
- self-collision adds a new deterministic constraint phase.

They are separate sessions because a green host transition proves nothing about collision,
and a target projection must be measurable without a swept-collision solver hiding it.

## Session order

| session | lands | depends on |
|---|---|---|
| [01](combat-control-extensions-01-live-authority.md) | policy -> Human -> policy transitions during one live fight, with exact next-tick ownership and replay | arena topic closed |
| [02](combat-control-extensions-02-the-arm-stays-in-front.md) | anatomy-owned rear bearing projection shared by actuator and publication | independent of 01 |
| [03](combat-control-extensions-03-the-body-is-solid.md) | swept own-body, opposite-arm and held-item constraints without self-damage events | 02 |

## Boundaries

- Host control remains outside `World`, `Scenario::fingerprint` and state digests.
- Sessions 02 and 03 are authoritative fixed-point mechanics. No browser-only clamp may
  claim they are solved.
- Same-owner constraints never enter the hostile contact/damage ledger.
- No session re-records a pin until its exact fixture reaches the changed law in both
  default and `cartesian-recoil` builds.

## Gate

Every session runs the full repository gate in `AGENTS.md`. Sessions 02 and 03 additionally
run the default and exact embodied corpus, deterministic replay sweeps and both wasm
artifacts after their native pins are measured.
