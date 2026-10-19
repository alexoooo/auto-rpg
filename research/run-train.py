"""Train a learned skill's policy with PPO (Stable-Baselines3) against its environments on Node
worker threads (research/run-learning-server.mjs: the learned run's, or the learned rise's with
"environment": "rise"), and export it as the core reads it (src/core/skills/learned-run.ts,
RunPolicy; src/core/mind/ground/learned-rise.ts, RisePolicy): ReLU layers, the observation's
normalisation folded into the first, tanh on the outputs. Each line of train.log has the mean of
each of `--keywords` over the episodes lately ended, of those that have it. The latest policy is
policy.json, and every `--keep` steps a copy stays as policy-<steps>.json: the training return
does not choose a policy (a run's return can go on rising as its battery falls), its battery does.

  .tools/ai-lab-venv/Scripts/python.exe research/run-train.py --config <configuration.json> --output <dir> [--steps N] [--keep N] [--resume] [--keywords stood,seconds]
"""
import argparse
import json
import subprocess
import time
from pathlib import Path

import numpy as np
import torch
from gymnasium import spaces
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import VecEnv, VecMonitor, VecNormalize

parser = argparse.ArgumentParser()
parser.add_argument('--config', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--steps', type=int, default=20_000_000)
parser.add_argument('--keep', type=int, default=1_000_000, help='steps between the policies kept')
parser.add_argument('--hidden', type=int, default=256)
parser.add_argument('--rollout', type=int, default=256, help='decisions each environment gathers per update')
parser.add_argument('--resume', action='store_true')
parser.add_argument('--threads', type=int, default=4)
parser.add_argument('--log-std', type=float, default=-1.0)
parser.add_argument('--lr', type=float, default=3e-4)
parser.add_argument('--keywords', default='along,command,down', help='the episode infos train.log averages')
options = parser.parse_args()
output = Path(options.output); output.mkdir(parents=True, exist_ok=True)
torch.set_num_threads(options.threads)


class RunEnvs(VecEnv):
    """The server's environments as one vectorised environment."""

    def __init__(self, config):
        self.server = subprocess.Popen(['node', 'research/run-learning-server.mjs', config], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                       stderr=(output / 'server.log').open('a'), text=True, bufsize=1)
        ready = self._receive()
        n = ready['workers']; obs, act = ready['ready'][0]['observationSize'], ready['ready'][0]['actionSize']
        super().__init__(n, spaces.Box(-np.inf, np.inf, (obs,), np.float32), spaces.Box(-3.0, 3.0, (act,), np.float32))
        self.actions = None

    def _receive(self):
        line = self.server.stdout.readline()
        if not line: raise RuntimeError('the run server exited; see server.log')
        answer = json.loads(line)
        if 'error' in answer: raise RuntimeError(answer['error'])
        return answer

    def _call(self, message):
        self.server.stdin.write(json.dumps(message) + '\n'); self.server.stdin.flush()
        return self._receive()

    def reset(self):
        return np.asarray(self._call({'op': 'reset'})['observations'], np.float32)

    def step_async(self, actions):
        self.actions = actions

    def step_wait(self):
        a = self._call({'op': 'step', 'actions': np.asarray(self.actions, np.float64).tolist()})
        infos = []
        for info in a['infos']:
            if 'terminal' in info: info['terminal_observation'] = np.asarray(info.pop('terminal'), np.float32)
            info['TimeLimit.truncated'] = info.get('truncated', False)
            infos.append(info)
        return np.asarray(a['observations'], np.float32), np.asarray(a['rewards'], np.float32), np.asarray(a['dones'], bool), infos

    def close(self):
        try: self._call({'op': 'close'})
        except Exception: pass
        try: self.server.wait(timeout=60)
        except subprocess.TimeoutExpired: self.server.kill()

    def get_attr(self, name, indices=None): return [None] * self.num_envs
    def set_attr(self, name, value, indices=None): pass
    def env_method(self, name, *args, indices=None, **kwargs): return [None] * self.num_envs
    def env_is_wrapped(self, wrapper, indices=None): return [False] * self.num_envs
    def seed(self, seed=None): return [None] * self.num_envs


def export(model, normalize, path):
    """The policy's mean as the core's RunPolicy: the normalisation folded into the first layer."""
    mean, var = normalize.obs_rms.mean, normalize.obs_rms.var
    scale = 1.0 / np.sqrt(var + normalize.epsilon)
    linears = [m for m in model.policy.mlp_extractor.policy_net if isinstance(m, torch.nn.Linear)] + [model.policy.action_net]
    layers = []
    for k, linear in enumerate(linears):
        w = linear.weight.detach().cpu().double().numpy(); b = linear.bias.detach().cpu().double().numpy()
        if k == 0: b = b - w @ (mean * scale); w = w * scale[None, :]
        layers.append({'weights': w.tolist(), 'bias': b.tolist()})
    path.write_text(json.dumps({'actions': int(model.action_space.shape[0]), 'layers': layers}))


keywords = tuple(options.keywords.split(','))
monitored = VecMonitor(RunEnvs(options.config), info_keywords=keywords)
envs = VecNormalize(monitored, norm_obs=True, norm_reward=True, clip_obs=10.0, gamma=0.99)
saved = output / 'model.zip'
if options.resume and saved.exists():
    envs = VecNormalize.load(str(output / 'normalize.pkl'), monitored)
    model = PPO.load(str(saved), env=envs, device='cpu')
else:
    model = PPO('MlpPolicy', envs, device='cpu', n_steps=options.rollout, batch_size=4096, n_epochs=5, learning_rate=options.lr, gamma=0.99, gae_lambda=0.95,
                clip_range=0.2, ent_coef=0.0, target_kl=0.03, verbose=0,
                policy_kwargs={'net_arch': {'pi': [options.hidden, options.hidden], 'vf': [options.hidden, options.hidden]}, 'activation_fn': torch.nn.ReLU, 'log_std_init': options.log_std})

started = time.monotonic()
done = 0
chunk = options.rollout * envs.num_envs * 8
log = (output / 'train.log').open('a')
while done < options.steps:
    model.learn(chunk, reset_num_timesteps=False, progress_bar=False)
    done += chunk
    infos = model.ep_info_buffer
    model.save(str(saved)); envs.save(str(output / 'normalize.pkl')); export(model, envs, output / 'policy.json')
    if model.num_timesteps // options.keep > (model.num_timesteps - chunk) // options.keep:
        export(model, envs, output / f'policy-{model.num_timesteps}.json')
    line = {'steps': int(model.num_timesteps), 'minutes': round((time.monotonic() - started) / 60, 1),
            'return': round(float(np.mean([i['r'] for i in infos])), 2) if infos else None, 'length': round(float(np.mean([i['l'] for i in infos])), 1) if infos else None,
            **{k: (round(float(np.mean([float(i[k]) for i in infos if i.get(k) is not None])), 3) if any(i.get(k) is not None for i in infos) else None) for k in keywords},
            'std': round(float(torch.exp(model.policy.log_std).mean()), 3)}
    log.write(json.dumps(line) + '\n'); log.flush(); print(json.dumps(line), flush=True)
envs.close()
