# Smart AI 105 -- verify the strong smart attack in the visible Arena

**Status:** superseded by Smart118. Smart104's generalized-competence prerequisite is
blocked at `21/100` strict and `55/100` outcome-only. Smart118 verifies the explicitly
named controlled Robust Strike preset and makes no default-policy claim.

## A -- reproducible production route

Run the production build and then the Vite development server in the foreground:

```powershell
npm run build
npm run view
```

The agent that starts `npm run view` owns it. Record its PID and port, keep it attached,
and stop it before finishing; verify the port has no listener afterward. Open
`/#/arena` in a visible browser. An automated hidden tab may inspect and scrub the
Arena, but it must not claim real-time playback or frame-rate evidence because hidden
`requestAnimationFrame` stops.

Before running, capture a screenshot showing Fighter A `fighter / shield / sword /
tactical`, Fighter B `brute / empty / club / composed`, seed 3, and the status
`Run a fight.`. Assert no checkpoint request appears and the button is enabled.

## B -- run, scrub and show the attack

Press **Run selected fight** and wait for the worker to finish recording. The viewed
fight header and next-fight picker must both name `tactical vs composed, seed 3`; a
stale recording or fallback composed/composed header is a failure.

Use the synchronous controls, which remain testable even in an automated tab:

1. Press **Next contact** until the first Fighter-A right-sword `WeaponBody` event.
2. Confirm the event panel names Fighter A as attacker, Fighter B/Brute as defender,
   a concrete body region, nonzero incoming/dissipated energy, and nonzero cut or
   thrust. Do not accept pressure alone as the strong-attack witness.
3. Press **Next wound** and confirm the matching Brute region loses integrity; if the
   selected seed has no matching wound, Smart105 stops and reports the exact event
   sequence rather than changing policy or choosing a seed after seeing it.
4. Scrub one frame before, at, and one frame after the contact. Capture the geometry,
   contact marker/event panel and wound panel at the contact frame so the user can see
   chamber-to-commit motion and its result.
5. Run the same selected fight a second time and require identical header, frame count,
   first strong-event tick and displayed event words.

This verification does not use damage to select mechanics: ordinal 3144 was already
selected by dissipation. Damage is now a post-selection visible outcome gate. Do not
change seed, loadout, policy, camera, speed, target region or trace to manufacture a
pass.

## C -- handoff

Preserve screenshots and a short receipt with route, build artifact SHAs, visible
browser identity, selected policies, frame count, strong-event tick/key/region,
dissipation, cut/thrust and matching integrity loss. Re-run the nonvisual controls:

```powershell
node --test client/test/studio-shell.test.mjs
npm run test:worker
npm run test:wasm-memory
node tools/check_docs.js
git diff --check
```

Stop the foreground server and prove its port is closed. A pass completes the user's
Arena goal. A failure records the first exact UI, worker, policy, contact or wound
boundary and requires a new predeclared plan; Smart105 authorizes no retune, new seed,
pin update, policy fallback or ABI change.
