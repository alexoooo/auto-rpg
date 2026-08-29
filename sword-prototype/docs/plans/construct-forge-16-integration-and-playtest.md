# Session 16 -- decide whether this becomes the game

## Status -- UI implementation complete; technical and human verdicts open (2026-08-28)

The ordinary mouse-driven starter, Forge, physical probe, exact saved-revision Setup/Fight path and
causal weak/repaired Lab sequence are implemented. No person has yet completed the visible-browser
protocol. In addition, the replacement seeded corpus rejected the current authored game with eight
time caps, 234,442 stuck steps and two rows without bilateral damage. Its 212 named
resource/hardware transitions are telemetry rather than unexplained capability loss.
The technical entry premise below is therefore not satisfied. No learned candidate is integrated.

## Outcome

A person completes the whole loop -- build hardware, assign groups/actions, program a Mind, watch
auto-battles, diagnose failure and revise -- without source edits or console work. The session ends
with an explicit product verdict and moves every durable result out of this plan set.

## Entry gate

Sessions 01--12 are complete enough to expose the loop, with every measured blocker called out in
its session status. Either session 15 has a passing frozen learned candidate or recorded
negative result, or session 12 has the explicit evidence-backed early-negative entry that blocked
sessions 13--15. Merely not running learning is not a result. The construct playtest protocol,
assignments and questions in `src/construct/playtest.ts` were committed before exposing the player
to any candidate.

## Integrate

If session 15 passed, register one `adaptive-construct-v1` driver through the construct control
surface. It loads only the frozen graph/action/policy contract and names unsupported blueprint or
program digests; there is no fallback to the authored Warden Mind. Surface candidate provenance,
active action scores and parameter outputs in the same diagnostics as authored rules.

If session 15 did not pass, or learning was rejected at session 12's entry gate, integrate no
learned entry. The authored Mind editor and auto-battle
loop remain the product; this is a valid outcome because AI programming, not opaque learning alone,
is the core gameplay.

Finish onboarding in the Forge: one guided build of a four-limb Warden, one crossbow-to-sword module
swap, one locomotion group, one attack action, one simple Mind rule, then a visible auto-battle and a
prompt to repair a deliberately weak rule. The guide uses ordinary UI and saved data; it owns no
privileged construction or controller path.

Implemented 2026-08-28: the guide starts from the ordinary powered core save, and its body predicate
requires four actual connected-fragment attachment events, one per corner. Action probes count only
when the probed action identity differs from the starter graph. Mind repair is causal: weak Save,
weak visible Lab run, real refusal/stuck diagnostic, repaired Save, then a second visible Lab run.
The local guide version was bumped so a prior prebuilt-Warden completion cannot carry forward.
The guide state is now v3 and pins weak, diagnosed and repaired steps to exact three-digest saved
revision IDs and one arena side; opening Lab from the guide preselects that artifact. Body hardware
removal transactionally reconciles stale Actions/Mind rules, so the required ordinary
crossbow-unmount/sword-mount path remains savable and undoable.
This is implementation evidence only; the human protocol and product verdict below remain open.

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
