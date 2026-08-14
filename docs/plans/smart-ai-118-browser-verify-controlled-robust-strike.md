# Smart AI 118 -- verify the controlled Robust Strike in the Arena

**Status:** complete. Two consecutive visible Arena runs produced the same controlled
event, wound and final state. A screenshot was captured. This satisfies the requested
visible strong-attack demonstration, not the blocked generalized 95/100 Tactical gate.

## A -- production receipt and visible route

Build, then run the Vite viewer attached in the foreground:

```powershell
npm run build
npm run view
```

Record `dist/index.html` and `dist/web.wasm` byte lengths and SHA-256, server PID and
port. Open `/#/arena` in a visible browser and choose `Robust Strike (controlled)`.
Before pressing Run, capture the exact summary: Fighter hero, left shield, right
2-unit sword, Tactical code 5, spawn `(9.5,7)`; neutral Brute with club at `(12,8)`;
Legs; 28 chamber + up to 28 strike ticks, stopping after contact; seed 0. The page must still call
`composed/composed` the ordinary custom default. No Worker or wasm fight may start
before the button.

## B -- exact visible attack and publication join

Press **Run selected fight** once and wait for its 54-frame recording. Use synchronous
scrubbing even if automation runs in a hidden tab:

1. Inspect frames 0, 27, 28 and 53 and show the right sword move from the declared
   minus-eighth chamber to the plus-eighth 15/16-reach commit while the Brute remains
   neutral.
2. Use **Next contact** to select the uniquely attributed hero-right-sword
   `WeaponBody` event. Require the event panel to name Brute Legs, nonzero incoming
   and dissipated energy, and nonzero cut or thrust.
3. Use **Next wound** and require the same Brute Legs row to show positive integrity
   loss. Capture the geometry, marker, event panel and anatomy panel on that frame.
4. Run the preset again in a fresh fight and require identical config receipt, frame
   count, event tick/key/region/energy/damage words and final integrity words.
5. Return to `Custom fight` and confirm the default is still composed/composed and no
   controlled-preset copy remains attached to it.

The hidden-tab limitation is explicit: controls and scrubbing are synchronous and can
be automated, but hidden `requestAnimationFrame` cannot prove real-time playback or
frame rate. A person in the visible browser records only that the playback visibly
animates; no performance threshold is introduced.

## C -- handoff and cleanup

Retain screenshots and one text receipt naming route, browser, build SHAs, exact
preset summary, 53 submitted ticks / 54-frame count, contact tick/key/Legs, dissipation,
cut/thrust and matching integrity loss. Re-run:

```powershell
node --test client/test/studio-shell.test.mjs
npm run test:worker
npm run test:wasm-memory
node tools/check_docs.js
git diff --check
```

Stop the foreground server and verify its port has no listener. A pass satisfies the
requested visible strong-attack demonstration only. It does not reopen Smart104,
claim generalized smart-AI competence, authorize a different seed/loadout/target,
retune policy or solver, or move a pin. A failure records the first exact config,
worker, publication, UI or visual boundary and stops.

## Completed browser receipt

The visible preset read `Robust Strike (controlled)` and locked the Tactical Fighter
with left shield and 2-unit right sword at `(9.5,7)` against the neutral Brute at
`(12,8)`. Its fingerprint was `0x82012ef80cd9be11`; the recording ended at tick 53
with 54 frames. **Next contact** landed at `53/53` and displayed:

```text
weaponBody · 0/1 → 1 body (legs)
share 278 vs floor 144
cut 133, thrust 0, pressure 145
group 346 → 68
wounding
```

The Brute anatomy panel showed Legs integrity `0.94`, wound `0.06`, and total health
`0.989`. Two consecutive runs were semantically identical; their recording wall
times were 3,182 ms and 2,480 ms, which are receipts rather than a performance gate.
A screenshot of the visible result was captured during acceptance.

This demonstration uses the same stop law as source 41: raw contact event tick 52 is
published at frame 53 and ends the controlled run. It does not run ticks 54--56,
because those ticks did not select the corpus row and admit a later rejection. The
ordinary Arena remains composed/composed. None of this changes Smart115's result:
general Tactical measured only `21/100` strict zero-refusal body decisions and
`55/100` outcome-only, both below 95.
