"""Reshape a steered punch's training run (research/run-train.py's model.zip) from a steer of one
output a channel (18: the trunk's 4, the legs' 10, the arm's 4) to the stance layout
(src/core/skills/learned-punch.ts, `punchActions("stance")`: the trunk's 4, the stance's 3 asks,
the arm's 4). The trunk's and arm's outputs keep their weights, their spread and their optimiser
moments; the stance's asks start at zero, so the reshaped policy steers as the old one did with its
legs' outputs dropped (which moved nothing: the stance's solve overwrites a bearing leg's pushes),
their spread `spread` (a standard deviation before the tanh; the kept outputs' mean where not
given), so that they are explored. The observation and its normalisation are unchanged; the
normalisation's record of the action space is the new one's.

  .tools/ai-lab-venv/Scripts/python.exe research/punch-reshape.py <run dir> <new run dir> [spread]
"""
import pickle
import sys
from pathlib import Path

import numpy as np
import torch
from gymnasium import spaces
from stable_baselines3.common.save_util import load_from_zip_file, save_to_zip_file

TRUNK, LEGS, ARM, ASKS = 4, 10, 4, 3
source, target = Path(sys.argv[1]), Path(sys.argv[2])
target.mkdir(parents=True, exist_ok=True)
data, params, variables = load_from_zip_file(str(source / 'model.zip'), device='cpu')
old = data['action_space']
if old.shape != (TRUNK + LEGS + ARM,): raise SystemExit(f'{source}: a steer of {old.shape}, not one output a channel')
kept = list(range(TRUNK)) + list(range(TRUNK + LEGS, TRUNK + LEGS + ARM))


def reshaped(tensor, fill):
    """`tensor`'s rows in the stance layout: the trunk's, `ASKS` rows of `fill`, the arm's."""
    rows = tensor[kept]
    return torch.cat([rows[:TRUNK], torch.full((ASKS, *tensor.shape[1:]), fill, dtype=tensor.dtype), rows[TRUNK:]])


policy = params['policy']
names = list(policy.keys())
changed = {'action_net.weight', 'action_net.bias', 'log_std'}
spread = float(np.log(float(sys.argv[3]))) if len(sys.argv) > 3 else float(policy['log_std'][kept].mean())
for name in changed:
    policy[name] = reshaped(policy[name], spread if name == 'log_std' else 0.0)
# The optimiser's state is by parameter, in the order the policy holds them (its state dict's order).
optimiser = params['policy.optimizer']
for index, name in enumerate(names):
    if name in changed and index in optimiser['state']:
        state = optimiser['state'][index]
        for key in ('exp_avg', 'exp_avg_sq'): state[key] = reshaped(state[key], 0.0)
data['action_space'] = spaces.Box(float(old.low[0]), float(old.high[0]), (TRUNK + ASKS + ARM,), np.float32)
save_to_zip_file(str(target / 'model.zip'), data=data, params=params, pytorch_variables=variables)
with (source / 'normalize.pkl').open('rb') as file: normalize = pickle.load(file)
normalize.action_space = data['action_space']
# Pickled as `VecNormalize.save` does: without the environment it wraps, which it drops.
normalize.venv, normalize.class_attributes, normalize.returns = None, {}, None
with (target / 'normalize.pkl').open('wb') as file: pickle.dump(normalize, file)
print(f'{source} -> {target}: {old.shape[0]} outputs to {TRUNK + ASKS + ARM}, the asks\' log std {spread:.3f}')
