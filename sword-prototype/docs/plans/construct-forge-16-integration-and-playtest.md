# Session 16 -- decide whether this becomes the game

## Outcome

A person completes the whole loop -- build hardware, assign groups/actions, program a Mind, watch
auto-battles, diagnose failure and revise -- without source edits or console work. The session ends
with an explicit product verdict and moves every durable result out of this plan set.

## Entry gate

Sessions 01--12 are complete. Session 15 has either a passing frozen learned candidate or a recorded
negative result. The playtest protocol, assignments and questions are committed before exposing the
player to either candidate.

## Integrate

If session 15 passed, register one `adaptive-construct-v1` driver through the construct control
surface. It loads only the frozen graph/action/policy contract and names unsupported blueprint or
program digests; there is no fallback to the authored Warden Mind. Surface candidate provenance,
active action scores and parameter outputs in the same diagnostics as authored rules.

If session 15 did not pass, integrate no learned entry. The authored Mind editor and auto-battle
loop remain the product; this is a valid outcome because AI programming, not opaque learning alone,
is the core gameplay.

Finish onboarding in the Forge: one guided build of a four-limb Warden, one crossbow-to-sword module
swap, one locomotion group, one attack action, one simple Mind rule, then a visible auto-battle and a
prompt to repair a deliberately weak rule. The guide uses ordinary UI and saved data; it owns no
privileged construction or controller path.

## Human protocol

At minimum test:

1. Can the player explain why the parts became legs/turret without being told they have hidden types?
2. Can they make one meaningful body change and predict its physical consequence?
3. Can they find why an action was refused or stuck from diagnostics?
4. Can they improve an auto-battle by changing hardware, an action or a Mind rule?
5. Does watching the AI feel like watching *their machine think*, rather than a generic policy use
   a skin?
6. Are construction and programming enjoyable before progression, salvage or campaign rewards exist?

Record timing, aborts, confusion points and qualitative answers in `docs/measurements.md`. Do not
turn one enthusiastic comment into a quantitative competence claim.

## Final adversarial and lifecycle gate

- Import malformed/future saves; fail every build phase after partial allocation; rebuild 25 times.
- Sever every topology branch during every active controller phase.
- Run paused, hidden-tab manual-step and visible-browser render checks.
- Compare page/headless traces for authored and learned drivers.
- Re-run existing humanoid null control and all research digest/preflight tests.
- Inspect the Warden from all four bearings with collider/action overlays off and on.

## Decide and close

Choose one, in writing:

- **Pivot:** the Forge/AI loop is the primary game direction; write the next campaign/progression
  topic from the measured player loop.
- **Keep as a mode:** construct auto-battle is valuable but does not replace direct sword combat.
- **Stop:** record which layer failed -- construction, action authoring, AI legibility, physical
  control or battle interest -- and retain only reusable infrastructure.

Fold architecture into `docs/design.md`, evidence into `docs/measurements.md`, player instructions
into `README.md` and new operational traps into `AGENTS.md`. Delete all
`docs/plans/construct-forge-*.md` files in that same closing commit.

~~~powershell
npm test
npm run check
npm run build
npm run measure -- --only duelist-swinger --bouts 120
~~~
