# Punch contact-mass audit

Node Warrior impulse-response stand, vendored `rapier-coordinate`, symmetric actuator law,
120 and 960 Hz, balance zero. `research/punch-mass-audit.mjs` applies 0.1 and 1 N s along +z
at either physical fist's strike point. A matched zero-pulse control subtracts background
gravity/motor motion. The point velocity is read at the original world point after 1/120 s
at both rates. `punch-mass-audit.json` retains all 24 pulse trials and their matched controls.

Free and braced fixtures have no gravity or floor and share the reference anatomical pose.
The free fixture switches muscles to limp before the pulse. Braced retains the sourced,
bounded velocity motors holding the reference. The grounded fixture stands for two seconds
in the ordinary guard with real foot contacts; its pose differs from the floating fixtures.
No root is pinned and no assist is granted. These are local response tests, not punch impacts.

Representative left-hand results, kg; the right hand gives similar results:

| Fixture | Rate | Free-joint model | Measured 0.1 N s response | Measured 1 N s response |
| --- | ---: | ---: | ---: | ---: |
| Free | 120 | 0.432 | 0.432 | 0.434 |
| Braced | 120 | 0.432 | 0.525 | 0.568 |
| Grounded guard | 120 | 0.240 | 0.297 | 0.315 |
| Free | 960 | 0.432 | 0.433 | 0.437 |
| Braced | 960 | 0.432 | 0.511 | 0.522 |
| Grounded guard | 960 | 0.240 | 0.286 | 0.290 |

The independently measured free response supports `contactMass` under its stated free-joint,
floating assumption. Keeping motors active increases the mass inferred over this finite
response window. The grounded guard also exceeds its own free-joint model. That difference
combines active bracing and support; the fixture does not isolate a ground-only effect.
Different pulse sizes need not infer the same mass under bounded motors and changing pose.

This does **not** validate replacing damage energy with impulse divided by approach speed.
Pad momentum includes force delivered during contact, mount motion and material response;
`J/v` from it is not a passive instantaneous anatomical mass. Motor impulse is not motor work.
There is no independently validated constrained-contact energy replacement yet, so damage
continues to use the existing free-joint mass, closing-speed energy and compliance shares.
Head/body pool tolerances and energy shares are unchanged; no injury or head multiplier is added.
