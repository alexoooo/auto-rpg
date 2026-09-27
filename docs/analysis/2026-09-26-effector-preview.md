# Effector proposal preview, 2026-09-26

> **Deleted 2026-09-27.** The page path below, `src/effector-preview*.ts`, `src/channel-query.ts`
> and the channel panel in `src/channel-experiments.ts` went with the next-phase cleanup; tag
> `pre-next-phase-cleanup` holds them. The proposals themselves remain in
> `src/effector-trajectories.ts` for the offline expert and its benches.

Session 06 now has an opt-in browser demonstration of the offline expert's three arm proposals.
Open `/?play=arena&channels=effector&effector-preview=soft`, choose a human left contender and
start the bout. The collapsed experimental panel selects `sweep`, `point`, `soft` or Off.
Applying preserves the matchup and seeds and reloads the page. Disabling effector removes the
preview request too. No shipped channel default or policy changed.

This demonstrates a proposal, not the expert's search or a measured winning policy. The base
policy still handles orders, movement and its other channels. Every two physics-clock seconds,
the wrapper overlays a 0.6-second trajectory after a 0.3-second lead-in, then returns to the base
policy. It alternates preferred hands, falling back to the other live hand only if it declares
task targets. Currently that means anatomical blade, fist and mace arms. Shields, paired grips,
stone and skeleton arms remain unsupported. Pause freezes the trajectory with the simulation;
rebuilding the bout constructs a fresh wrapper.

`src/effector-trajectories.ts` is the common recipe used by the browser wrapper and the offline
expert. Its requests still pass through the physical actuator's limits. The browser has no
offline search dependency. The wrapper exposes its base policy and elapsed time to exact forks.

Validation:

- 1,073 tests, `npm run check` and `npm run build` pass after the incoming audio/workshop merge.
- The Node command-null harness retains all 45 original bout hashes with effector enabled but
  unwritten. Each of the three extracted trajectories retains identical commands and body pose
  hashes over 120 frames against the human duelist, compared with the pre-extraction main tree.
- A mid-sweep physical fork follows the original for 150 frames, including the return to policy
  and the next hand's cycle. Tests also cover URL admission, orders, full command copying and
  clearing the overlay between cycles. Four deliberate breaks are caught: dropped overlay,
  lost clock, hidden base state and never alternating hands.
- Browser: human/stone arena renders; pause stays compact; Replay is available; selecting point
  from soft reloads with the same matchup and seeds; disabling effector clears the preview and
  reports experiments off. The normal arena has no experimental panel. The browser eye check
  remains the owner's; these checks do not establish combat quality or headroom.

Local validation evidence is under `research/runs/effector-expert/` in the command-surface
worktree. The temporary server on 5182 was stopped after checking; the owner's 5180 was untouched.
