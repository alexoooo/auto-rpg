/**
 * The control-surface tag, in a file that imports nothing.
 *
 * It was declared in `golem-control.ts`, beside the endpoint that answers to it, and that is still
 * where a reader would look -- it re-exports from here. The Warrior's `HUMANOID_CONTROL_SURFACE`
 * lived here too until 2026-09-27, long after its endpoint had gone.
 *
 * What moved it is a cycle. `Policy.surface` in `mind.ts` is a control-surface tag, `POLICIES`
 * reads it at module evaluation time, and the endpoint imports `mind.ts` for *values* --
 * `policyMind`. Taking the constant from it would
 * close a run-time loop that happens to work because nobody reads a constant during evaluation,
 * which is precisely the thing `mind.ts`'s own header says stops working the moment somebody moves
 * a line, and stops working in the browser rather than in a test. A leaf with no imports cannot be
 * in a cycle with anything.
 *
 * One string and no second copies: `UnitDefinition.controlSurface`, `ControlEndpoint.surface` and
 * `Policy.surface` are all compared against it.
 */

export const GOLEM_CONTROL_SURFACE = "golem-v1" as const;
