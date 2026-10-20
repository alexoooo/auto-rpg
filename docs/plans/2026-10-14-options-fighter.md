# The options fighter: tactical quality and configuration

## Scope

Develop the options fighter as one Mind in the
[shared controller workshop](2026-10-20-shared-controller-workshop.md). Its current architecture
and configuration are described in [Minds](../architecture.md#minds). This plan owns its open
tactical questions and player choices. Independent component registration, common tasks,
loadouts and experiment infrastructure belong to the workshop plan.

Learned option-model development, lookahead and decision scheduling are separate workshop
experiments. This effort uses the current meta-controller architecture and leaves the recovery
evaluator and physical body/equipment mechanics to their own workstreams.

Use the skills and motor implementation named by each experiment. Tactical work can proceed on
a frozen platform checkpoint while the [whole-body controller](2026-10-17-general-controller.md)
and other components develop. Re-evaluate references when that platform changes.

## Tactical experiments

First read the reference fighter's current failures on declared conditions. The questions are:

- **Targets and blocked attacks.** When should a fighter change its target surface, action or
  approach after meeting a guard? Compare available openings and target regions through the
  shared aiming and action path, retaining the opponent and contact identity.
- **Spacing and commitment.** Improve approach, clinch breaking, circling and follow-up timing
  against moving opponents. Distinguish a poor decision from a skill that cannot execute its
  request, using readiness, terminal records and actual motion.
- **Option models.** Calibrate expected attack value, incoming cost, travel time, falls and
  recovery to the components the fighter actually runs. A model should account for uncertainty
  and temporary inability without reading hidden opponent state.
- **Ground choices.** Compare getting up, moving away, fighting from the ground and waiting on
  the same physical cases. This work selects among recovery components; developing a recovery
  algorithm and establishing the unassisted stand-up goal belong to their own tasks.
- **Meta-control and reflexes.** Compare valued and ranked selection, interruption and reflex
  ownership where a concrete failure suggests them. Preserve ordinary skill admission,
  resource ownership and hand-back.
- **Orders.** Evaluate obedience and tactical self-preservation under explicit orders. An
  autonomous league without orders cannot establish the quality of this trade-off.

Change one decision or model at a time when attributing an effect. Use current action, executor,
guard and reflex configurations. Keep option models local to this Mind or its registered
components; their choice does not alter the shared observation or damage rules.

## Comparison and completion

Each competitive experiment fixes a platform revision, resolved engine profile, bodies,
loadouts, attributes, assists, observation delay, starting cases, opponent implementations,
scoring and budgets. Report the Node core-world harness and rate. Play each condition with the
roles swapped, retain failures, and report results by opponent and condition.

Use `npm run match -- <a> <b>` for the standard paired comparison and `npm run tournament` for a
declared field. The empty-hand promotion comparison uses Classic, Puncher and Scrapper as its
reference opponents (`research/empty-hand-league.mjs`), with at least 384 distinct bouts per
opponent across fresh conditions and both sides. Record that protocol separately from the
standard match; repeating an identical deterministic bout adds no new cases.

Use `research/options-readout.mjs` to diagnose what choices and outcomes occur, and validate a
candidate on fresh conditions before promotion. Re-read the reference at the same checkpoint;
historical standings and measurements are not current baselines.

Competitive completion means leading that declared reference league at its recorded checkpoint,
with the owner's visual acceptance of the bouts. It does not require remaining first as future
entrants arrive. A software change can land under the normal gate while the competitive goal
remains unmet; a claim of improved fighting requires its comparison.

## Player configuration

The remaining configuration work is to expose useful decisions beyond the current obedience,
skill/action and reflex settings:

1. Establish which option-model weights and decisions represent real choices for a player.
   Candidates include caution/aggression, preferred spacing, available options, ground choices
   and the valued/ranked meta-controller. Test trade-offs in the conditions they affect.
2. Make selected option and model choices explicit configurable parts where the workshop's
   component interfaces support them. In particular, remove the fixed ground-choice/model
   list from the Mind when configurable replacements have a working reader and lifecycle.
3. Give each exposed choice its own labels, validation and fields. Use lists for algorithms,
   actions and body parts, and bounded numeric controls for meaningful quantities; authored
   instance names may use text. Internal searched constants remain implementation settings.
4. Add presets for the useful configurations and verify editor/link/save round trips. Preserve
   valid configurations and reject unsupported compositions with useful reasons.

Keep existing selectable fighters as comparison references. Changing a gameplay default follows
the owner's acceptance; retiring an implementation is a separate decision.

## Next work and checks

Choose a concrete tactical failure on a frozen checkpoint, implement and evaluate one candidate,
then expose a player choice only when its effect is understood. Configuration work and tactical
experiments can proceed independently where their interfaces permit it.

Use the normal checks in `AGENTS.md` and the relevant option, action, editor and replay tests for
changed paths. Capability and league comparisons remain separate from software gates. This
plan does not require the run, recovery or strike research to finish before tactics can improve.
