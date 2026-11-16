"""A saved PPO model and its normalisation, widened onto a layout with more inputs: each input's
column in the actor's and the critic's first layer is the source's by name, nought for an input it
has none for; the normalisation keeps the source's statistics and count, and an added input's are
taken from a policy that measured them (`--fresh-stats`, its `normalization` read by its layout's
names). The optimizer begins afresh. Writes model.zip, normalize.pkl and layout.json into `--output`
for run-train.py's `--resume <output>/model.zip`.

.tools/ai-lab-venv/Scripts/python.exe research/expand-model.py --model M.zip --normalize N.pkl --from-layout A.json --to-layout B.json --fresh-stats P.json --output DIR
"""
import argparse, json, pickle
from pathlib import Path
import numpy as np, torch
from gymnasium import spaces
from stable_baselines3 import PPO

parser = argparse.ArgumentParser()
for name in ('model', 'normalize', 'from-layout', 'to-layout', 'fresh-stats', 'output'): parser.add_argument(f'--{name}', required=True)
options = parser.parse_args()
old = json.loads(Path(options.from_layout).read_text(encoding='utf-8'))
new = json.loads(Path(options.to_layout).read_text(encoding='utf-8'))
if old['outputs'] != new['outputs'] or old.get('interval') != new.get('interval'): raise SystemExit('only inputs may differ')
ins = [old['inputs'].index(name) if name in old['inputs'] else None for name in new['inputs']]
fresh_policy = json.loads(Path(options.fresh_stats).read_text(encoding='utf-8'))
fresh_policy = fresh_policy if 'layers' in fresh_policy else next(e['network'] for e in fresh_policy.values() if isinstance(e, dict) and e.get('network'))
measured = fresh_policy['normalization']
if len(measured['mean']) != len(new['inputs']): raise SystemExit("the fresh statistics' policy does not read the new layout")

model = PPO.load(options.model, device='cpu')
n = len(new['inputs'])
with torch.no_grad():
    for net in (model.policy.mlp_extractor.policy_net, model.policy.mlp_extractor.value_net):
        first = net[0]
        w = first.weight.detach()
        widened = torch.stack([w[:, i] if i is not None else torch.zeros(w.shape[0]) for i in ins], dim=1)
        replacement = torch.nn.Linear(n, w.shape[0])
        replacement.weight.copy_(widened); replacement.bias.copy_(first.bias.detach())
        net[0] = replacement
box = spaces.Box(-np.inf, np.inf, (n,), np.float32)
model.observation_space = box; model.policy.observation_space = box
model.policy.optimizer = model.policy.optimizer_class(model.policy.parameters(), lr=model.lr_schedule(1), **model.policy.optimizer_kwargs)
out = Path(options.output); out.mkdir(parents=True, exist_ok=True)
model.save(str(out / 'model.zip'))

with open(options.normalize, 'rb') as f: normalize = pickle.load(f)
rms = normalize.obs_rms
mean = np.array([rms.mean[i] if i is not None else measured['mean'][k] for k, i in enumerate(ins)])
var = np.array([rms.var[i] if i is not None else max(0.0, 1 / measured['scale'][k] ** 2 - normalize.epsilon) for k, i in enumerate(ins)])
rms.mean, rms.var = mean, var
normalize.observation_space = box
if hasattr(normalize, 'old_obs'): normalize.old_obs = None
# What VecNormalize's pickling drops, which an unpickled one has not.
for name, value in (('venv', None), ('class_attributes', {}), ('returns', None)): normalize.__dict__.setdefault(name, value)
with open(out / 'normalize.pkl', 'wb') as f: pickle.dump(normalize, f)
(out / 'layout.json').write_text(json.dumps(new), encoding='utf-8')
print(f'{sum(i is not None for i in ins)} of {n} inputs the source\'s; count {rms.count:.0f}; timesteps {model.num_timesteps}')
