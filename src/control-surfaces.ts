/**
 * The control-surface tags, in a file that imports nothing.
 *
 * They were declared in `humanoid-control.ts` and `golem-control.ts`, beside the endpoints that
 * answer to them, and that is still where a reader would look -- both re-export from here, so
 * every call site that had `HUMANOID_CONTROL_SURFACE` or `GOLEM_CONTROL_SURFACE` still has it.
 *
 * What moved them is a cycle. `Policy.surface` in `mind.ts` is a control-surface tag, `POLICIES`
 * reads it at module evaluation time, and both endpoints import `mind.ts` for *values* --
 * `policyMind`, `splitMind`, `handoverFromCursors`. Taking the constant from either of them would
 * close a run-time loop that happens to work because nobody reads a constant during evaluation,
 * which is precisely the thing `mind.ts`'s own header says stops working the moment somebody moves
 * a line, and stops working in the browser rather than in a test. A leaf with no imports cannot be
 * in a cycle with anything.
 *
 * Two strings and no second copies: `UnitDefinition.controlSurface`, `ControlEndpoint.surface` and
 * `Policy.surface` are all compared against these.
 */

export const HUMANOID_CONTROL_SURFACE = "humanoid-v1" as const;

export const GOLEM_CONTROL_SURFACE = "golem-v1" as const;
