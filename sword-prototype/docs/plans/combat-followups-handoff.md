# Combat follow-ups handoff -- 2026-08-24

## Where the prototype is

Mechanics, controls, bodies, imported armour, AI research implementations, artifact
deployment and indexed tournament resume are implemented. No learned policy is promoted and
the held-out tournament has not been opened.

Do **not** start the full-budget jobs yet. Review of the actual policy seam found that the
current feature-v3/action-v1 contract is not the interface worth spending multi-day compute
on. The new prerequisite sequence is sessions 15--18.

## Last verified state

From `sword-prototype/` before the new interface work:

- `npm test`: 454 passed.
- `npm run check`: passed.
- `npm run build`: passed.
- `npm run texture:verify`, `npm run armour:verify`, `npm run asset:verify`: passed.
- `npm run measure -- --seed 20260824`: completed in 310.4 s.
- `npm run ai:options -- --seed 20260824`: all 12 frozen legacy/meta parity rows matched.
- Port 5180 has no listener.

The root `node tools/check_docs.js` currently reports 29 stale root-document source anchors.
None is under `sword-prototype`; do not misattribute them to this topic.

## Interface findings that changed the order

- Camera zoom is not an AI action. It is merely present because `Intent` aliases the human
  `InputState`; only `main.ts` reads the human controls' value.
- Learned networks choose five movement options, seven hand actions and persistence. They do
  not choose the hand or aim region. The option adapter normally chooses primary, silently
  falls back, and supplies its own fixed target.
- Learned v3 has exact one-hot weapon identity for both hands on both bodies, so weapon
  awareness itself is present.
- Neither `FighterView` nor v3 carries arrows in flight. An agent knows a bow exists but
  cannot time a block or dodge against its projectile.
- A hand publishes only tip-speed magnitude, and a bare fist publishes zero. Incoming versus
  receding motion is therefore unavailable at the learned boundary.
- The learned controller does not choose crouch/lean/twist; fixed skills choose them.

## Retained smoke evidence

| directory | meaning after the interface correction |
| --- | --- |
| `asset-src/learning/research/session15-workers8-smoke/` | old v3/action-v1 NEAT-QD execution evidence only |
| `asset-src/learning/research/session16-final-workers8/` | old v3/action-v1 DAgger execution evidence only |
| `asset-src/learning/research/session18-minimum/` | old tactical/look-ahead accounting evidence only |

Before session 18 closes, fold any still-useful totals into `docs/measurements.md` and delete
all three directories. Do not carry historical runnable payloads into the new contract.

## What remains

1. Remove camera zoom from combat commands in
   [session 15](combat-followups-15-host-command-boundary.md).
2. Add vector/projectile/morphology perception and feature v4 in
   [session 16](combat-followups-16-policy-perception-v4.md).
3. Add explicit effector and bounded learned stance outputs in
   [session 17](combat-followups-17-tactic-output-v2.md).
4. Freeze the schema digest and adversarially preflight every algorithm in
   [session 18](combat-followups-18-compute-contract-preflight.md).
5. Only then execute sessions 19--22, followed by the one-shot tournament, conditional
   promotion and visible close-out in sessions 23--25.

The old short-run extrapolations -- roughly 86 hours for one NEAT seed and 125 hours for one
DAgger seed on this host -- are scheduling hints only. Re-measure throughput after feature
v4/tactic v2; the old figures are not promises about the wider contract.

## Adversarial constraints

- A camera value must not survive under a renamed combat field or an untyped fixture.
- `FighterView.projectiles` contains facts, not `isIncoming`, `shouldBlock` or a chosen target.
  Threat ranking belongs in the feature writer and must be pinned independently.
- An arrow is live only while `live && !spent`; a planted or pooled arrow is not a threat.
- Publish velocity vectors from the physics body before contact. Do not reuse the arrow's
  arrival-speed scoring cache as perception.
- Mirror mappings must transform vector components and swap left/right stance labels; an
  involution test alone is insufficient unless asymmetric fixtures make every sign matter.
- Action, effector and target are a joint legal choice. Independent argmax followed by
  fallback silently trains one policy and executes another.
- Capability masks may use published equipment/body facts, but may not reveal opponent
  policy, test split, reward, future contacts or tournament labels.
- Any feature/action/version/digest mismatch must fail before a research runner spends its
  first solver step.
- Backwards compatibility is explicitly out of scope. Delete old trainers, codecs, aliases,
  parity harnesses and fixtures; do not build adapters from v1/v3 into the current contract.
- If no candidate passes, add research. Do not ship the least-bad controller.

## First action for the next session

Implement session 15 and watch its new camera/intent separation tests fail against the
current `zoom` field before making them pass. Do not reserve a multi-day compute window yet.
