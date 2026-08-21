# Combat control extensions -- overview

**Status:** future host-authority topic. The rear-envelope mechanics are complete and
durable; swept self-collision moved into the live responsive-arena topic after the owner
demonstrated that the envelope did not stop a blade crossing its owner.

The playable arena still installs Human or policy control at fight construction. The
remaining change here is live takeover and release. It is a host/controller transition;
it does not alter the arm law or solve self-collision.

The completed rear limit is recorded in [Combat design](../design/combat.md). The stronger
own-body and held-weapon constraint is now session 02 of the
[responsive arena](arena-response-00-overview.md), where it blocks feel calibration. A
green authority transition proves neither of those mechanics, so it remains separate.

## Session order

| session | lands | depends on |
|---|---|---|
| [01](combat-control-extensions-01-live-authority.md) | policy -> Human -> policy transitions during one live fight, with exact next-tick ownership and replay | responsive arena closed |

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
