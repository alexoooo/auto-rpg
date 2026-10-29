"""Reshape a steered punch's training run (research/run-train.py's model.zip and normalize.pkl) from
one layout of the learned punch to another (assets/core/learned-punch.layout.json, `PunchLayout`),
input by input and output by output by name. What both name keeps its weights, its spread and its
optimiser moments; an input only the new layout reads starts with zero weight, its normalisation at
mean 0 and variance 1; an output only it has starts at zero, its spread `spread` (a standard
deviation before the tanh; the kept outputs' mean where not given), so that it is explored. The
policy reshaped steers as the old one did.

  .tools/ai-lab-venv/Scripts/python.exe research/punch-reshape.py <run dir> <new run dir> <old layout> <new layout> [spread]
"""
import json
import pickle
import sys
from pathlib import Path

import numpy as np
import torch
from gymnasium import spaces
from stable_baselines3.common.save_util import load_from_zip_file, save_to_zip_file

source, target = Path(sys.argv[1]), Path(sys.argv[2])
old, new = (json.loads(Path(path).read_text(encoding='utf-8')) for path in sys.argv[3:5])
key = lambda output: json.dumps(output, sort_keys=True)
inputs = [old['inputs'].index(name) if name in old['inputs'] else None for name in new['inputs']]
olds = [key(output) for output in old['outputs']]
outputs = [olds.index(key(output)) if key(output) in olds else None for output in new['outputs']]
target.mkdir(parents=True, exist_ok=True)
data, params, variables = load_from_zip_file(str(source / 'model.zip'), device='cpu')
if data['observation_space'].shape != (len(old['inputs']),) or data['action_space'].shape != (len(old['outputs']),):
    raise SystemExit(f'{source}: {data["observation_space"].shape} in and {data["action_space"].shape} out, not the old layout\'s')


def taken(tensor, picks, fill, axis):
    """`tensor` along `axis` as `picks` takes it: a kept index's slice, or one of `fill` for None."""
    moved = tensor.movedim(axis, 0)
    rows = [moved[pick] if pick is not None else torch.full(moved.shape[1:], fill, dtype=tensor.dtype) for pick in picks]
    return torch.stack(rows).movedim(0, axis)


policy = params['policy']
kept = [pick for pick in outputs if pick is not None]
spread = float(np.log(float(sys.argv[5]))) if len(sys.argv) > 5 else float(policy['log_std'][kept].mean())
reshape = {
    'mlp_extractor.policy_net.0.weight': lambda t, fill: taken(t, inputs, fill, 1),
    'mlp_extractor.value_net.0.weight': lambda t, fill: taken(t, inputs, fill, 1),
    'action_net.weight': lambda t, fill: taken(t, outputs, fill, 0),
    'action_net.bias': lambda t, fill: taken(t, outputs, fill, 0),
    'log_std': lambda t, fill: taken(t, outputs, fill, 0),
}
names = list(policy.keys())
for name, change in reshape.items():
    policy[name] = change(policy[name], spread if name == 'log_std' else 0.0)
# The optimiser's state is by parameter, in the order the policy holds them (its state dict's order).
optimiser = params['policy.optimizer']
for index, name in enumerate(names):
    if name in reshape and index in optimiser['state']:
        state = optimiser['state'][index]
        for moment in ('exp_avg', 'exp_avg_sq'): state[moment] = reshape[name](state[moment], 0.0)
data['observation_space'] = spaces.Box(-np.inf, np.inf, (len(new['inputs']),), np.float32)
data['action_space'] = spaces.Box(float(data['action_space'].low[0]), float(data['action_space'].high[0]), (len(new['outputs']),), np.float32)
save_to_zip_file(str(target / 'model.zip'), data=data, params=params, pytorch_variables=variables)
with (source / 'normalize.pkl').open('rb') as file: normalize = pickle.load(file)
rms = normalize.obs_rms
rms.mean = np.array([rms.mean[pick] if pick is not None else 0.0 for pick in inputs])
rms.var = np.array([rms.var[pick] if pick is not None else 1.0 for pick in inputs])
normalize.observation_space, normalize.action_space = data['observation_space'], data['action_space']
# Pickled as `VecNormalize.save` does: without the environment it wraps, which it drops.
normalize.venv, normalize.class_attributes, normalize.returns = None, {}, None
with (target / 'normalize.pkl').open('wb') as file: pickle.dump(normalize, file)
print(f'{source} -> {target}: {len(old["inputs"])} inputs to {len(new["inputs"])}, {len(old["outputs"])} outputs to {len(new["outputs"])}, '
      f'a new output\'s log std {spread:.3f}')
