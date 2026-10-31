"""Train a policy with PPO or SAC (Stable-Baselines3) against an environment file's copies on Node
worker threads (research/run-learning-server.mjs, research/environments/), and export it as the core
reads a network (src/core/learning/recovery-network.ts, Network: a straight punch record's `network`,
a bare mind's `network`): ReLU layers, the observation's normalisation folded into the first,
tanh on the outputs (PPO's mean, which the environment squashes; SAC's squashed mean, tanh of its
mean layer). Each line of train.log has the mean of each of `--keywords` over the episodes lately
ended, of those that have it. The latest policy is policy.json, and every `--keep` steps a copy
stays as policy-<steps>.json: the training return does not choose a policy (a run's return can go
on rising as its battery falls), its battery does.

`--start` begins from a trained network (an exported `Network`, or a record whose one entry holds
a `network`, assets/core/<blow>.json), its inputs and outputs matched to this run's by name
through `--start-layout` and the environment's `layout`: a weight of an input the source does not
read starts at zero and an output it lacks starts at zero, so the run starts steering as the source
did. Before anything learns, the source steers `--stats` messages so that the normalisation starts
from this environment's observations, and its first layer is folded through it; the next
`--critic-first` decisions train the critic alone, the policy held, after which its first layer is
folded again through the normalisation as it has come to read. All count among the run's decisions,
and the start as written is kept as policy-<decisions>.json. Each chunk tells the server the decisions so
far (`progress`), which an environment's curriculum reads.

  .tools/ai-lab-venv/Scripts/python.exe research/run-train.py --config <configuration.json> --output <dir> [--algo ppo|sac] [--steps N] [--keep N] [--resume] [--keywords stood,seconds] [--start <network.json> --start-layout <layout.json>]
"""
import argparse
import json
import subprocess
import time
from pathlib import Path

import numpy as np
import torch
from gymnasium import spaces
from stable_baselines3 import PPO, SAC
from stable_baselines3.common.vec_env import VecEnv, VecMonitor, VecNormalize

parser = argparse.ArgumentParser()
parser.add_argument('--config', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--algo', choices=('ppo', 'sac'), default='ppo')
parser.add_argument('--steps', type=int, default=20_000_000)
parser.add_argument('--keep', type=int, default=1_000_000, help='steps between the policies kept')
parser.add_argument('--hidden', type=int, default=256)
parser.add_argument('--rollout', type=int, default=256, help="PPO: decisions each environment gathers per update; both: a chunk is 8 of these")
parser.add_argument('--resume', action='store_true')
parser.add_argument('--threads', type=int, default=4)
parser.add_argument('--log-std', type=float, default=-1.0, help='the spread a policy starts with, before the tanh')
parser.add_argument('--lr', type=float, default=3e-4)
parser.add_argument('--keywords', default='along,command,down', help='the episode infos train.log averages')
parser.add_argument('--start', help='a trained network to begin from')
parser.add_argument('--start-layout', help="the start's layout, its inputs' and outputs' names")
parser.add_argument('--critic-first', type=int, default=None, help='decisions the critic trains alone after a start (one chunk unless given)')
parser.add_argument('--stats', type=int, default=64, help="messages the start steers to read the observations' normalisation")
parser.add_argument('--batch', type=int, default=None, help='a gradient step\'s batch (PPO 4096, SAC 512)')
parser.add_argument('--gradient-steps', type=int, default=8, help='SAC: gradient steps each message (of every environment\'s decision)')
parser.add_argument('--buffer', type=int, default=1_000_000, help='SAC: decisions the replay buffer holds')
parser.add_argument('--device', default='cpu')
options = parser.parse_args()
output = Path(options.output); output.mkdir(parents=True, exist_ok=True)
torch.set_num_threads(options.threads)
configuration = json.loads(Path(options.config).read_text(encoding='utf-8'))
layout_path = {**json.loads(Path(configuration['environment']).read_text(encoding='utf-8')), **configuration}['layout']
squashed = options.algo == 'sac'


class RunEnvs(VecEnv):
    """The server's environments as one vectorised environment; `squashed`, its actions in [-1, 1] as the environment's tanh gives them."""

    def __init__(self, config):
        self.server = subprocess.Popen(['node', 'research/run-learning-server.mjs', config], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                       stderr=(output / 'server.log').open('a'), text=True, bufsize=1)
        ready = self._receive()
        n = ready['workers']; obs, act = ready['ready'][0]['observationSize'], ready['ready'][0]['actionSize']
        bound = 1.0 if squashed else 3.0
        super().__init__(n, spaces.Box(-np.inf, np.inf, (obs,), np.float32), spaces.Box(-bound, bound, (act,), np.float32))
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

    def progress(self, decisions):
        self._call({'op': 'progress', 'decisions': int(decisions)})

    def reset(self):
        return np.asarray(self._call({'op': 'reset'})['observations'], np.float32)

    def step_async(self, actions):
        actions = np.asarray(actions, np.float64)
        self.actions = np.arctanh(np.clip(actions, -1 + 1e-6, 1 - 1e-6)) if squashed else actions

    def step_wait(self):
        a = self._call({'op': 'step', 'actions': self.actions.tolist()})
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


def actor_linears(model):
    """The policy's mean, its linear layers in order: ReLU between them, the last one's outputs before the tanh."""
    if isinstance(model, SAC):
        return [m for m in model.actor.latent_pi if isinstance(m, torch.nn.Linear)] + [model.actor.mu]
    return [m for m in model.policy.mlp_extractor.policy_net if isinstance(m, torch.nn.Linear)] + [model.policy.action_net]


def scaling(normalize):
    """The observation's normalisation: each input's mean and scale (normalised = (raw - mean) * scale)."""
    return normalize.obs_rms.mean, 1.0 / np.sqrt(normalize.obs_rms.var + normalize.epsilon)


def export(model, normalize, path):
    """The policy's mean as the core reads it (`Network`): the normalisation folded into the first layer."""
    mean, scale = scaling(normalize)
    layers = []
    for k, linear in enumerate(actor_linears(model)):
        w = linear.weight.detach().cpu().double().numpy(); b = linear.bias.detach().cpu().double().numpy()
        if k == 0: b = b - w @ (mean * scale); w = w * scale[None, :]
        layers.append({'weights': w.tolist(), 'bias': b.tolist()})
    path.write_text(json.dumps({'actions': int(model.action_space.shape[0]), 'layers': layers}))


def source_network(path):
    """The start's network: the file itself, or the network of the one entry of a record that holds one."""
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    if 'layers' in data: return data
    held = [entry['network'] for entry in data.values() if isinstance(entry, dict) and entry.get('network')]
    if len(held) != 1: raise SystemExit(f'{path}: neither a network nor a record with one network ({len(held)} found)')
    return held[0]


def matched(network, source_layout, layout):
    """`network`'s layers taken onto `layout` by name: each input's column and each output's row the source's, zero where it has none."""
    key = lambda output: json.dumps(output, sort_keys=True)
    ins = [source_layout['inputs'].index(name) if name in source_layout['inputs'] else None for name in layout['inputs']]
    outs_old = [key(o) for o in source_layout['outputs']]
    outs = [outs_old.index(key(o)) if key(o) in outs_old else None for o in layout['outputs']]
    layers = [(np.asarray(l['weights'], np.float64), np.asarray(l['bias'], np.float64)) for l in network['layers']]
    if layers[0][0].shape[1] != len(source_layout['inputs']) or layers[-1][0].shape[0] < len(source_layout['outputs']):
        raise SystemExit('the start does not read and write as its layout names')
    w0, b0 = layers[0]
    first = np.stack([w0[:, i] if i is not None else np.zeros(w0.shape[0]) for i in ins], axis=1)
    wl, bl = layers[-1]
    last = np.stack([wl[o] if o is not None else np.zeros(wl.shape[1]) for o in outs]), np.array([bl[o] if o is not None else 0.0 for o in outs])
    print(f'start: {sum(i is not None for i in ins)} of {len(ins)} inputs and {sum(o is not None for o in outs)} of {len(outs)} outputs the source\'s', flush=True)
    return [(first, b0)] + layers[1:-1] + [last]


def act(layers, raw):
    """The start's outputs before the tanh for the raw observations `raw` (one row each)."""
    x = raw
    for k, (w, b) in enumerate(layers):
        x = x @ w.T + b
        if k + 1 < len(layers): x = np.maximum(x, 0)
    return x


def read_stats(envs, layers):
    """The start steering `--stats` messages, so that the normalisation reads this environment: the decisions made."""
    envs.reset()
    for _ in range(options.stats):
        u = act(layers, envs.get_original_obs().astype(np.float64))
        envs.step(np.tanh(u) if squashed else np.clip(u, -3.0, 3.0))
    return options.stats * envs.num_envs


def write_start(model, envs, layers, first):
    """The start's layers written into the policy, its first through the normalisation as it reads now; `first`, a SAC's spread and target critic set too."""
    mean, scale = scaling(envs)
    linears = actor_linears(model)
    if len(linears) != len(layers) or any(tuple(l.weight.shape) != w.shape for l, (w, _) in zip(linears[1:], layers[1:])):
        raise SystemExit(f"the start's layers {[w.shape for w, _ in layers]} are not this policy's {[tuple(l.weight.shape) for l in linears]}")
    with torch.no_grad():
        for k, (linear, (w, b)) in enumerate(zip(linears, layers)):
            if k == 0: b = b + w @ mean; w = w / scale[None, :]
            linear.weight.copy_(torch.as_tensor(w, dtype=linear.weight.dtype)); linear.bias.copy_(torch.as_tensor(b, dtype=linear.bias.dtype))
        if first and isinstance(model, SAC):
            model.actor.log_std.weight.zero_(); model.actor.log_std.bias.fill_(options.log_std)
            model.critic_target.load_state_dict(model.critic.state_dict())


def hold_policy(model, held):
    """While `held`, the policy's own parameters take no step: the critic learns alone."""
    if isinstance(model, SAC):
        optimizer = model.actor.optimizer
        if held: optimizer.step, optimizer.held = (lambda closure=None: None), optimizer.step
        elif hasattr(optimizer, 'held'): optimizer.step = optimizer.held; del optimizer.held
        return
    for p in [*model.policy.mlp_extractor.policy_net.parameters(), *model.policy.action_net.parameters(), model.policy.log_std]: p.requires_grad_(not held)


keywords = tuple(options.keywords.split(','))
monitored = VecMonitor(RunEnvs(options.config), info_keywords=keywords)
envs = VecNormalize(monitored, norm_obs=True, norm_reward=True, clip_obs=10.0, gamma=0.99)
saved = output / 'model.zip'
Algorithm = SAC if squashed else PPO
net = {'pi': [options.hidden, options.hidden], ('qf' if squashed else 'vf'): [options.hidden, options.hidden]}
started = time.monotonic()
critic_until = 0
layers = None
if options.resume and saved.exists():
    envs = VecNormalize.load(str(output / 'normalize.pkl'), monitored)
    model = Algorithm.load(str(saved), env=envs, device=options.device)
    if squashed and (output / 'replay.pkl').exists(): model.load_replay_buffer(str(output / 'replay.pkl'))
else:
    if squashed:
        model = SAC('MlpPolicy', envs, device=options.device, buffer_size=options.buffer, batch_size=options.batch or 512, learning_rate=options.lr, gamma=0.99, tau=0.005,
                    learning_starts=0 if options.start else 10_000, train_freq=1, gradient_steps=options.gradient_steps, ent_coef='auto_0.1', verbose=0,
                    policy_kwargs={'net_arch': net, 'activation_fn': torch.nn.ReLU, 'log_std_init': options.log_std})
    else:
        model = PPO('MlpPolicy', envs, device=options.device, n_steps=options.rollout, batch_size=options.batch or 4096, n_epochs=5, learning_rate=options.lr, gamma=0.99, gae_lambda=0.95,
                    clip_range=0.2, ent_coef=0.0, target_kl=0.03, verbose=0,
                    policy_kwargs={'net_arch': net, 'activation_fn': torch.nn.ReLU, 'log_std_init': options.log_std})
    if options.start:
        if not options.start_layout: raise SystemExit('a start names its layout (--start-layout)')
        layout = json.loads(Path(layout_path).read_text(encoding='utf-8'))
        layers = matched(source_network(options.start), json.loads(Path(options.start_layout).read_text(encoding='utf-8')), layout)
        model.num_timesteps = read_stats(envs, layers)
        write_start(model, envs, layers, first=True)
        export(model, envs, output / f'policy-{model.num_timesteps}.json')
        critic_until = model.num_timesteps + (options.critic_first if options.critic_first is not None else options.rollout * envs.num_envs * 8)

done = 0
chunk = options.rollout * envs.num_envs * 8
log = (output / 'train.log').open('a')
while done < options.steps:
    held = model.num_timesteps < critic_until
    if not held and layers is not None:
        # The critic has learnt; the policy, held meanwhile, is written again through the normalisation as it now reads.
        write_start(model, envs, layers, first=False); layers = None
    hold_policy(model, held)
    monitored.venv.progress(model.num_timesteps)
    model.learn(chunk, reset_num_timesteps=False, progress_bar=False)
    done += chunk
    infos = model.ep_info_buffer
    model.save(str(saved)); envs.save(str(output / 'normalize.pkl')); export(model, envs, output / 'policy.json')
    if model.num_timesteps // options.keep > (model.num_timesteps - chunk) // options.keep:
        export(model, envs, output / f'policy-{model.num_timesteps}.json')
    spread = float(torch.exp(model.policy.log_std.detach()).mean()) if not squashed else float(torch.exp(model.log_ent_coef.detach()).item())
    line = {'steps': int(model.num_timesteps), 'minutes': round((time.monotonic() - started) / 60, 1),
            'return': round(float(np.mean([i['r'] for i in infos])), 2) if infos else None, 'length': round(float(np.mean([i['l'] for i in infos])), 1) if infos else None,
            **{k: (round(float(np.mean([float(i[k]) for i in infos if i.get(k) is not None])), 3) if any(i.get(k) is not None for i in infos) else None) for k in keywords},
            ('entropy' if squashed else 'std'): round(spread, 3), **({'critic': True} if held else {})}
    log.write(json.dumps(line) + '\n'); log.flush(); print(json.dumps(line), flush=True)
if squashed: model.save_replay_buffer(str(output / 'replay.pkl'))
envs.close()
