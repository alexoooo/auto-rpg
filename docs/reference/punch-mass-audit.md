# Punch contact-mass audit

Whether the blow rule's free-joint contact mass (`contactMass`) matches a fist's measured response.
It does for a free, floating arm; motors and support raise the inferred mass, but no validated
constrained-contact energy exists, so damage keeps free-joint mass, closing-speed energy and
compliance shares, with pool tolerances unchanged.

## Measurement

`research/punch-mass-audit.mjs`: Node Warrior impulse-response stand, vendored `rapier-coordinate`,
symmetric actuator law, 120 and 960 Hz, balance 0. A 0.1 or 1 N s pulse along +z at either fist's
strike point; a matched zero-pulse control removes background motion; point velocity is read at the
original world point after 1/120 s. `punch-mass-audit.json` holds all 24 trials and controls.

- **Free**: no gravity or floor, reference pose, muscles limp before the pulse.
- **Braced**: the same, with the sourced bounded velocity motors holding the reference.
- **Grounded guard**: 2 s standing in the ordinary guard on real foot contacts (another pose).

No root is pinned and no assist granted. Left hand, kg (the right is similar):

| Fixture | Rate (Hz) | Free-joint model | 0.1 N s response | 1 N s response |
| --- | ---: | ---: | ---: | ---: |
| Free | 120 | 0.432 | 0.432 | 0.434 |
| Braced | 120 | 0.432 | 0.525 | 0.568 |
| Grounded guard | 120 | 0.240 | 0.297 | 0.315 |
| Free | 960 | 0.432 | 0.433 | 0.437 |
| Braced | 960 | 0.432 | 0.511 | 0.522 |
| Grounded guard | 960 | 0.240 | 0.286 | 0.290 |

The grounded excess mixes bracing and support; the fixture does not isolate the ground. Pad `J/v`
([punch calibration](punch-calibration.md)) includes force delivered during contact, mount motion
and material response, so it is not a passive anatomical mass and does not replace damage energy.
