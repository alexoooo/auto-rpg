# Reliable arena engagement

Improve the real Point fighter's approach, preparation, strike, return and repositioning against
moving opponents. Prefer stable cycles over attack frequency. Keep recovery, defensive cover,
physics profiles, strength and assistance unchanged. Classic and the independent AI interface
remain available.

1. Land `research/arena-engagement.mjs` and its worker runner with the reference controller's
   32-case development record and documented scoring. Preserve failures and verdict durations.
2. In `src/core/mind/point-fighter.ts`, introduce replaceable tracked engagement using the chosen
   hand's range, bounded target prediction, hand-independent cycle tracking and range hysteresis.
   Explicit orders override autonomous pursuit. Save all engagement memory in the bout state.
   Add physical moving-opponent and fresh-world replay tests before enabling it by default.
3. Expose engine-free hand contact/point-motion feedback through the body, and consume it in
   `src/core/skills/strike.ts` for new-contact returns. Keep duration, contact, miss, cancellation,
   timeout and interruption outcomes distinct. Verify preparation range again before release.
   Add contact-edge, obstruction, cancellation and recovery-interruption tests, mutation controls,
   and a mid-contact replay. Update the existing HUD and reference documentation.
4. Freeze the candidate, run the mirrored held-out cases and compare the documented acceptance
   gates. Do not promote a failing candidate. Run existing recovery/static-cycle tests, the full
   suite, type check and production build, inspect the built arena in a browser and stop the
   owned preview server. Record measurements, update architecture/roadmap and delete this plan
   when all work is complete.

Each landable chunk runs `npm test`, `npm run check`, `npm run build`, and the normal versus
ignore-CR line-ending diff gate, then commits. No separate items, two-hand coordination, recovery
acceleration, new defensive tactics or whole-body solver changes belong to this phase.
