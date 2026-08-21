# Arena response 04 -- the fight is in your hand

**Status:** planned; depends on sessions 01--03.
**Outcome:** Run the visible fight protocol, record the owner's verdict, and either close
the responsive Arena topic or insert one narrowly named follow-up before deleting plans.

## Foreground protocol

Run `npm run dev` attached in a visible browser and stop it afterward. Record browser,
renderer, display refresh, device-pixel ratio, mouse model/polling rate, viewport and power
mode in the Arena human-control artifact.

For Fixed and Relative three-quarter cameras:

1. park the sword at five guards and hold each for one second;
2. make slow and fast left-to-right, right-to-left, overhead and diagonal cuts to paired
   endpoints;
3. make two full circular mouse paths around the character while watching the torso,
   head, opposite arm, shield and sword;
4. turn in place with Q/E while holding the sword at each rear-limit boundary;
5. fight Neutral, Tactical and learned-roster for at least one minute each;
6. open and close Eyes, Plans, Replay and Details once, use cursor zoom and pan, and repeat
   one fast slash after every camera transition; and
7. retain the FPS/3D/worst-interval capture plus command/achieved latency report.

The owner answers, in their words:

- Did any body part or held item pass through its owner?
- Did the fight remain at the display's expected cadence, and were visible hitches
  accompanied by the meter?
- Did a quick mouse stroke feel like a quick sword-hand stroke rather than a delayed chase?
- Could slow and fast strokes still be distinguished?
- Did movement feel slow after frame pacing and arm response were repaired? If yes, was
  the complaint footwork, turn rate, camera, or the 60 Hz authoritative clock?

## Pass, route or refuse

Automated tests cannot answer those questions. A pass requires the retained visible
artifact and the owner's explicit verdict. On failure, classify it before editing:

- a display/renderer failure returns to session 01;
- an impossible pose returns to session 02;
- accepted-command age or achieved-hand lag returns to session 03;
- footwork or body-turn feel creates a new measured mechanics session here; and
- camera/feedback/art direction routes to concept production.

Do not delete the plan that names a failed acceptance. On a pass, move the final values,
captures, limitations and owner wording into durable architecture/design/performance
documents, repoint the live roadmap to the next topic, and delete this five-file plan set
in the same patch.

## Files

- `docs/performance/arena-human-control.md` -- retained foreground rows and owner verdict.
- `docs/performance/v2-arena-matrix.md` -- frame/render bracket and visible result.
- `docs/design/combat.md` -- final self-constraint and actuator semantics.
- `docs/architecture/browser-runtime.md` -- final draw/pacing ownership.
- `docs/reference/hashes.md` -- final measured mechanics pin provenance.
- `AGENTS.md`, `README.md`, `DESIGN.md` -- next live roadmap only after a pass.
- `docs/plans/arena-response-*.md` -- deleted only on that pass.

## Acceptance

1. No observed or automated circular/rear/turning path crosses the owner's solid anatomy.
2. The meter is legible, truthful and tied to retained foreground evidence.
3. No ordinary active rAF performs more than one Babylon render and the foreground p95
   interval meets the recorded display budget.
4. Sample-to-accept is at most one authoritative tick when not stopped/starved; the sword
   response meets session 03's eight-tick bound.
5. The owner says the fast slash feels immediate enough to fight with and can still produce
   a deliberately slower slash.
6. Full native, exact-law, wasm, replay, client, ABI, docs and dependency gates pass, and
   the default wasm artifact is built last.

## Verification

Run the complete gate in `AGENTS.md`, plus the session-specific response sweep, 400-seed
mirrored behavior comparison and attached visible-browser protocol. Report any known test
warning separately from the release build; `cargo build --release` must have zero Rust
warnings.

