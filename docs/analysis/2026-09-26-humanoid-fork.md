# The human duelist's hidden tactical state

Found while continuing skill-ceiling session 06's effector experiment. Harness: the Node bout
runner, the exact-fork harness and the offline expert. No browser behaviour or tuning changed.

`humanoidDuelist` wraps `golemTactics` in a closure and adjusts the resulting hand orientations.
Its wrapper previously exposed neither the enclosed tactical state nor its random stream to the
snapshot graph. A fresh rollout began those tactics again; a reused rollout carried them forward
from the previous candidate. Copying the physical world's heap could not repair the missing mind.

The symptom appeared with task targets disabled too: the expert's predicted human bout poses
disagreed with live execution at successive decisions. With reuse disabled, the first prediction
matched, but later ones still disagreed. Exposing `tactics` through the wrapper's `captureState`
lets the existing graph restore it in place. The wrapper owns no additional clocks to restore.

Validation:

- A closure audit of human sword/shield versus mace/fist duelists, followed by an exact fork
  at 0.75 s and 120 matching frames of commands and physical poses.
- The expert's selected rollout predictions match live execution against the human duelist,
  both with and without task proposals.
- Replacing the snapshot record with an empty record makes the regression test fail.
- Six six-second crossed human/stone control bouts have unchanged trajectories, behaviour
  hashes and outcomes against `ac8020b6`. The standard 45-bout command-null set is also identical.

Earlier **full-model expert evaluations against `humanoid-duelist`** need to be repeated. This
does not invalidate ordinary human duelist bouts, which never restored a mind, or expert results
whose opponent was a different, correctly snapshotted policy. The effector screening set is run
with this repair on both the channel expert and its ruler control.
