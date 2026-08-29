# Session 17 -- a humanoid construct that fights the Warrior

## Status -- implemented as an experimental chassis (2026-08-29)

The fixed Swordbearer Effigy, genuine biped controllers, planted counter-fighter Mind, mounted
effector perception and direct Setup path are implemented. The real mixed bout proves upright
physical sword damage and rejects production competence: the Effigy deals only 0.074789 damage,
takes 358.431303 raw local damage and falls at 19.5417 seconds. Keep this session open with the
larger Construct topic until a person judges the visual result and a later controller/weapon pass
closes that deficit.

## Landed result

- `src/construct/humanoid.ts` owns the connected primitive body, its exact two-foot sensors, biped
  groups/actions, saved export and committed Mind.
- `src/construct/biped.ts` owns the MotorWriter-only biped experiments; the fixed Effigy exposes
  brace, while physically failed move/turn and recovery remain outside its Action graph.
- `src/construct/swordbearer-duelist.ts` owns the planted mixed-body tactics; no rule writes a joint.
- `src/construct/construct.ts` derives identity/metrics/support from `ConstructProfile` and publishes
  real mounted effectors without fabricating a humanoid hand.
- `src/action-primitives.ts` includes mounted effectors in threat selection.
- `scripts/construct-warrior-bout.mjs` is the real fixed-step Construct/Warrior evidence harness.
- `src/units.ts` exposes **Swordbearer Effigy (Experimental)** beside the existing bodies.

## Acceptance and remaining debt

The anatomy is one connected tree with a head, neck, torso, pelvis, two complete support legs, a
free stabilized arm and a separately articulated sword arm. Only the feet are contact supports.
The body stands for 20 seconds under repeated sweeps and scores real upright damage against a real
Warrior. The mixed result is not good AI yet: it topples late, exposes no recovery claim, and its
damage is not competitive. Do not relabel the current driver as learned or production-ready.

The visual check must reject a prone or disconnected body even when both foot sensors read contact.
The next physical session should measure sword trajectory against the Warrior's live collision
volume and create recovery under opponent contact; it must not add hidden root authority or a third
support limb.

## Verification

~~~powershell
node --test tests/construct-humanoid.test.mjs tests/construct-swordbearer-duelist.test.mjs tests/policy-perception.test.mjs
node scripts/construct-warrior-bout.mjs
npm test
npm run check
npm run build
~~~
