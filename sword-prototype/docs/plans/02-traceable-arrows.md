# Session 02 -- an arrow leaves a readable line

## Outcome

Make every live arrow readable from both cameras with a high-contrast head/fletch and a short
pooled flight trail. The effect follows the projectile people need to see; it does not alter
the arrow body, collision, arrival velocity or scoring.

## Implement

1. In `src/config.ts:452-520`, add `arrow.visual` with initial values:

   ```ts
   visual: {
     emissive: { r: 1.0, g: 0.46, b: 0.08 },
     trailSeconds: 0.18,
     trailDiameter: 0.018,
     fadeSeconds: 0.12,
   }
   ```

   Keep these cosmetic and outside every scoring calculation.
2. In `src/arena.ts:48-145`, add one unlit emissive arrow-accent material to `Palette`.
   Thread it through `WeaponMaterials` at `src/weapon.ts:41` rather than constructing one per
   arrow.
3. In `src/arrow.ts:80-223`, give each pooled `Arrow` its own prebuilt trail geometry and use
   the accent on the head and fletch. Prefer Babylon's `TrailMesh`; if its tree-shaken module
   needs a side-effect import, record it in `AGENTS.md` beside the existing Babylon list.
   Creation happens only in the constructor. `loose()` resets and shows it, `step()` advances
   and fades it, `park()` hides and clears it, and `dispose()` owns it.
4. The trail is a render child/observer only: no `PhysicsBody`, collision shape, pick target,
   shadow caster or entry in `Fighter.strikers`. Its root must be disabled while parked so 24
   pooled arrows cost no draw calls at rest.
5. In `src/aim.ts:70-95`, pass dashed-line shape options only on creation, not together with
   `instance`, closing owed item 17's two-warnings-per-frame noise before visual acceptance.
6. Update the bow paragraph in `README.md` and record the visible-browser verdict in
   `docs/measurements.md` with camera mode and zoom.

## Tests that must exist first

In `tests/arrow.test.mjs`, add:

- `a_parked_arrow_has_no_visible_trace`
- `loosing_restarts_one_pooled_trace_from_the_nock`
- `a_struck_arrow_fades_its_trace_and_is_collected`
- `a_hundred_traced_shots_create_no_mesh_body_or_observer_growth`
- `arrow_highlighting_does_not_change_flight_or_arrival_speed`

The last test compares positions and cached arrival velocity with the visual nodes disabled.
Break `park()`'s trail reset and replace the accent with the ordinary wood material; the
lifecycle and material assertions must fail respectively.

## Acceptance

From Fixed and Overhead cameras, loose arrows across the 2.4 m start and at least 10 m. The
head/fletch must identify the projectile at rest and the trail must make the flight path
traceable without forming an opaque beam. Confirm the browser console stays quiet across one
minute.

This session is cosmetic: the standard corpus must be byte-for-byte identical in outcomes,
damage, arrows landed and shot speed.

```powershell
npm test
npm run check
npm run build
npm run measure -- --seed 20260823
```
