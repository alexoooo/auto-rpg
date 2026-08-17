# Visual recovery 06 -- integrated foreground acceptance

**Status:** planned. Depends on sessions 01 through 05. This session changes no
simulation, ABI or authored geometry unless review finds a defect and reopens the
owning session.

The previous visual work was repeatedly closed from green tests and narrow
screenshots. This session makes closure an explicit product decision. It does not
paper over a failed row with prose or move a screenshot criterion after seeing it.

## Fixed comparison matrix

On default WebGPU and forced WebGL2, use a foreground 1536 x 936 browser and capture:

1. paused reset in World;
2. the same snapshot in Tactical;
3. hero beside each of the four wall orientations;
4. hero walking one loop that changes current tiles to remembered;
5. open and shut door spans;
6. two current torches and their remembered locations;
7. Fighter and Brute at 100, 160 and 250 vertical pixels;
8. compact 390 x 844 HUD with Systems and capture closed and open.

Place every World capture beside a crop from `web/assets/CONCEPT.png` and score these
predeclared rows pass/fail in `docs/performance/v2-room-matrix.md`:

- complete stable architecture;
- local cutaway without whole-side deletion;
- no disclosure pop or identity churn;
- recognizable human silhouette and equipment;
- ground-cue clearance;
- sconce and flame recognition;
- surface variation without obvious tiling;
- warm-fire/cool-dark value hierarchy;
- FPS and Tactical availability;
- HUD obstruction and compact layout;
- clean console and asset fallback naming.

A fail reopens the owning session. It is forbidden to mark a row pass because a test
with the same noun passes.

## Performance record

Use the visible foreground capture control already owned by `web/index.html` and
`client/src/render/performance.ts`. Record the required warmup/sample window, backend,
OS/CPU/GPU/driver/browser/power metadata, FPS distribution, worst frame, draws,
triangles, lights, shadows, asset bytes and peak GPU estimate. Repeat the baseline as
the final control. Automated hidden-browser results do not count because rAF stops.

Budget remains at most 64 MiB compressed assets and 512 MiB estimated peak GPU. A
budget failure reopens the asset session; do not hide meshes or weaken visibility to
make the number pass.

## Final regression matrix

Run:

```powershell
cargo test --workspace --no-fail-fast
cargo test --workspace --features cartesian-recoil --no-fail-fast
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node --test client/test/wasm-memory.test.mjs
node --test client/test/render-contract.test.mjs
node --test client/test/studio-shell.test.mjs
node --test client/test/worker-protocol.test.mjs
npm run check
npm run build
node tools/check_toolchain.js
node tools/validate_assets.js web/assets3d/room_slice.glb
node tools/validate_combatants.js web/assets3d/combatants.glb
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
git diff --check
```

Rebuild the default wasm again after the exact workspace gate before trusting
`wasm_check.js`. Never run `cargo fmt`.

## Closure

Update the room, arena and reference matrices with artifact paths and the owner's
decision. Retire all `visual-recovery-*` plans only in the commit that closes every
row and moves durable facts into architecture/reference/performance docs.

The topic closes only after the owner accepts the foreground World result as belonging
to the same stylistic family as `CONCEPT.png`, confirms walls remain stable during
movement, recognizes Fighter and Brute without debug labels, and confirms FPS and
Tactical are restored. If that review is unavailable, status is pending human review,
not complete.
