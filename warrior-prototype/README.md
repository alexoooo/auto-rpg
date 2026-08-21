# Warrior prototype

An independent browser rendering experiment: one original armored warrior in a lit,
interactive turntable. It deliberately has no source, runtime, asset, or build dependency
on the auto-rpg game beside sharing this repository.

```powershell
npm ci
npm run dev
```

Drag or swipe to orbit, use the wheel or a pinch to zoom, press Space to pause or resume,
and press R to reset. A reduced-motion preference starts the turntable paused.

## Asset work

`asset-src/build_warrior.py` is the editable source for `public/assets/warrior.glb`.
Regenerate and validate it with:

```powershell
$env:BLENDER_PATH = "C:\path\to\blender.exe" # optional
npm run asset:build
npm run asset:validate
```

The build script also writes eight ignored review renders under `.review/`.
`concept/warrior-angles-2.png` supplies the cardinal views for the v1 rigid-equipment
target, and `concept/warrior-angles-2_45.png` supplies the intermediate views.
`concept/warrior-angles.png` retains the matching cloth-bearing direction for a future
cloth profile. These are source references only and are not loaded by the web app.

## Visual distance

The review benchmark compares deterministic Blender renders at 45-degree increments
with the two annotated `rigid-v1` concept turnarounds. Cloth pixels and the
authored tabard part are masked from this profile rather than making one render
satisfy contradictory cloth-present and cloth-absent references. Zero means identical and a larger
number means more different; the scale is deliberately arbitrary, so compare only
results carrying the same formula version. The aggregate keeps the component and
per-view distances beside it -- those diagnostics are usually more useful than the
headline number.

Install the pinned Python environment and perceptual model weights once, then score
the current authored model:

```powershell
npm run similarity:setup
npm run similarity
```

The canonical score uses deterministic CPU DreamSim and LPIPS inference. A faster
classical-only smoke report is available as `npm run similarity:classical`, but its
number is not comparable to the canonical score. Reports and mask overlays are
written to `.review/similarity/`.

To record an easier human A/B judgment between two saved review directories, run
the following command in the foreground, open the printed local URL in a visible
browser, make the choice, and stop it with Ctrl+C:

```powershell
npm run similarity:compare -- path\to\candidate-a path\to\candidate-b
```

The comparison tool randomizes the two sides and records only `left`, `right`, or
`tie`. It never asks for a numerical human score. Candidate directories containing
a `similarity/report.json` also contribute their component vectors; inspect current
agreement and, after 30 non-tied choices, a regularized weight proposal with
`npm run similarity:compare:report`. A proposal never changes the formula silently.
The eight references substantially reduce the blind spots between cardinal views.
They still measure fixed projections rather than the complete 3D surface, so animation,
lighting changes, and unseen geometry need separate review.

Scored asset changes follow the pre-registered, one-factor iteration loop in
[`experiments/README.md`](experiments/README.md). Each accepted or rejected attempt
gets a tracked record, while its full render evidence is snapshotted under the ignored
`.review/experiments/` directory.

```powershell
npm test
npm run build
npm run similarity:test
```
