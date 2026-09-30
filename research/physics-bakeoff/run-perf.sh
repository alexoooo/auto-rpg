#!/usr/bin/env bash
# The scaling runs of REPORT.md, one after another (never in parallel: they are timings). Node harness.
set -e
cd "$(dirname "$0")/../.."
P="node --expose-gc --max-semi-space-size=64 research/physics-bakeoff/perf.mjs"
N="--n 1,2,4,8,16,32,48,64"
FEET100='{"foot.left":100,"foot.right":100}'
$P mujoco '{"substeps":2}' --cond "$FEET100" --tag mujoco $N
$P mujoco '{"substeps":1,"timeconst":0.03}' --cond "$FEET100" --tag mujoco-1step $N
$P rapier '{"substeps":1,"iterations":16,"pgs":2}' --cond "$FEET100" --tag rapier $N
$P rapier-simd '{"substeps":1,"iterations":16,"pgs":2}' --cond "$FEET100" --tag rapier-simd $N
# MuJoCo's threaded build (@mujoco/mujoco/mt) at the chosen MuJoCo setting, with a pool of T threads.
for T in 1 2 4 8; do
  $P mujoco-mt "{\"substeps\":2,\"threads\":$T}" --cond "$FEET100" --tag mujoco-mt-t$T $N
done
# MuJoCo that holds the pile: armature on every hinge and 4 sub-steps (mujoco-armature.mjs).
$P mujoco '{"substeps":4,"armature":0.001}' --cond "$FEET100" --tag mujoco-pile $N
