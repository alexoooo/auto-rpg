# Forge rollout — 2026-09-19

The arena, waves, module bench and proof now share the modeled stone, bronze hardware and
texture assets. The default body has 66 visible modeled pieces, including the added wrist
axles, blade ferrule and shield grip/bracket. Other builds use the same carved blocks,
profiled bearings, blade and rune shapes; specialised wheels, lashes and other distinct
geometry retain their silhouettes with the shared material treatment.

The browser appearance adapter runs at module registration. It adds children to the original
physical hosts, hides the old visible surfaces, and gives the new surfaces picking ownership
and live damage-wear bindings. It never replaces collider geometry or changes a physical
transform, mass, joint, control command, or damage rule. The palette retains its damage shaders.

The arena uses shallow modeled paving, emissive seams, masonry within its existing wall
colliders, and flames on existing posts. Walls crossing a protected camera sight line hide;
flames freeze with paused physics. Materials/textures are scene-owned. The UI uses the same
dark stone and bronze treatment on setup, combat, pause and the bench. Setup's automatic
camera movement is now a shallow sway so the two contenders remain readable side by side;
manual camera controls remain available.

## Checks

- `npm test`: 548 tests, 545 pass, the same three failures reproduced before the graphics work.
  The publication source scan matches a comment in `wear.ts`; two ram-head scoring assertions
  expect a blow above the current blunt-energy threshold (4.58 J measured versus 7.84 J).
- `npm run check` and `npm run build`: pass. All three HTML entries are in the build.
- Targeted appearance, art-proof and arena tests: 11/11 pass.
- The new appearance test constructs every offered effector, carrier, torso and head,
  compares physical positions, rotations and masses with/without the installed appearance,
  checks live wear on the visible replacements, and checks mesh/body counts after disposal.
- Browser: default fight produces damage/contact events; pause/resume, setup, Randomize,
  Customize and waves work. A wheel/ram/mace randomized build was inspected.
- Browser bench: wrist blade and paired wrist plates render; repeated rebuilds remain at
  203 meshes / 33 bodies for the tested paired fixture. No console warnings/errors were found
  on the inspected arena and bench navigations.
- Proof inspected in close view with the new weapon connections. Outward winding and original
  envelope tests pass; the refined golem remains within its 19,766-triangle budget.

## Render cost

The main page previously requested 3840×1957 on the test display. Shared forge startup now
caps the render buffer at 1920×1080 while preserving native CSS/UI resolution and aspect ratio.
One manually rendered, GPU-completed frame measured 135.8 ms before and 53.1 ms afterward
(1920×978) on Intel Iris Xe. These are isolated frame samples, **not a sustained FPS benchmark**.
The setup and fight samples also have different poses; they establish the resolution change,
not a controlled speedup ratio. Sustained performance remains unverified under the heavily
loaded browser used for this session. No new SSAO or depth-of-field passes were added.

The assets remain editable/rebuildable through the Blender source and scripts described in
the parent README. The proof page is retained for direct art inspection; no static concept
image substitutes for the live simulation.
