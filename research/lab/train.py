"""Bounded pilot trainers and browser export. Invoke through lab CLI for cumulative budget control."""
import argparse
import importlib.metadata
import json
from pathlib import Path
import random
import time

import numpy as np
import torch
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
import neat

from bridge import CombatEnv


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, allow_nan=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def dense_export(layers, env):
    result = []
    for i, layer in enumerate(layers):
        result.append(dict(weights=layer.weight.detach().cpu().tolist(), bias=layer.bias.detach().cpu().tolist(),
                           activation="linear" if i == len(layers) - 1 else "tanh"))
    return dict(version=1, surface=env.config["surface"], hz=12, observationNames=env.names, layers=result)


def parity(env, artifact, predictor, rng):
    observations = rng.uniform(-1, 1, (32, len(env.names))).astype(np.float32)
    js = np.asarray(env.bridge.request("infer", model=artifact, observations=observations.tolist()))
    native = np.asarray([predictor(obs) for obs in observations]).clip(-1, 1)
    error = float(np.max(np.abs(js - native)))
    if error > 1e-5:
        raise RuntimeError(f"browser inference parity failed: {error}")
    return error


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("method", choices=["ppo", "neat", "evolution", "distill"])
    parser.add_argument("--out", required=True)
    parser.add_argument("--surface", choices=["pilot", "direct", "residual"], default="pilot")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--seconds", type=float, default=60)
    parser.add_argument("--episode-seconds", type=float, default=150)
    parser.add_argument("--labels")
    args = parser.parse_args()
    if not 0 < args.seconds <= 600:
        parser.error("smoke run must be at most 600 seconds")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    start = time.monotonic()
    deadline = start + args.seconds
    random.seed(args.seed)
    rng = np.random.default_rng(args.seed)
    torch.manual_seed(args.seed)
    torch.set_num_threads(2)
    env = CombatEnv(args.surface, args.seed, args.episode_seconds)
    artifact = None
    updates = 0
    scores = []
    predictor = None
    try:
        inputs, outputs = len(env.names), env.action_space.shape[0]
        if args.method == "ppo":
            class Deadline(BaseCallback):
                def _on_step(self):
                    return time.monotonic() < deadline
            checkpoint = out / "ppo.zip"
            model = PPO.load(checkpoint, env=env, device="cpu") if checkpoint.exists() else PPO(
                "MlpPolicy", env, seed=args.seed, device="cpu", n_steps=128, batch_size=64,
                n_epochs=4, policy_kwargs=dict(net_arch=dict(pi=[32, 32], vf=[32, 32]), activation_fn=torch.nn.Tanh), verbose=0)
            model.learn(total_timesteps=10**8, callback=Deadline(), reset_num_timesteps=False)
            model.save(checkpoint)
            updates = model._n_updates
            layers = [m for m in model.policy.mlp_extractor.policy_net if isinstance(m, torch.nn.Linear)] + [model.policy.action_net]
            artifact = dense_export(layers, env)
            predictor = lambda obs: model.predict(obs, deterministic=True)[0]
        elif args.method in ["evolution", "distill"]:
            net = torch.nn.Sequential(torch.nn.Linear(inputs, 32), torch.nn.Tanh(), torch.nn.Linear(32, outputs))
            checkpoint = out / "dense.pt"
            if checkpoint.exists():
                net.load_state_dict(torch.load(checkpoint, weights_only=True))
            if args.method == "distill":
                if not args.labels:
                    raise ValueError("distillation requires teacher labels")
                labels = json.loads(Path(args.labels).read_text(encoding="utf-8"))
                usable = [r for r in labels if r.get("action") is not None]
                if not usable:
                    raise ValueError("teacher supplied no controlled action labels; baseline choices are not zero actions")
                x = torch.tensor([r["observation"] for r in usable], dtype=torch.float32)
                y = torch.tensor([r["action"] for r in usable], dtype=torch.float32)
                if y.shape[1] != outputs:
                    raise ValueError("teacher action surface mismatch")
                optimizer = torch.optim.Adam(net.parameters(), lr=0.001)
                while time.monotonic() < deadline and updates < 1000:
                    optimizer.zero_grad(); loss = torch.nn.functional.mse_loss(net(x), y)
                    loss.backward(); optimizer.step(); updates += 1
                scores.append(float(loss.detach()))
            else:
                mean = torch.nn.utils.parameters_to_vector(net.parameters()).detach().numpy().copy()
                scale = np.full_like(mean, 0.15)
                best_score, best = -float("inf"), mean.copy()
                while time.monotonic() < deadline:
                    generation = []
                    for _ in range(8):
                        if time.monotonic() >= deadline:
                            break
                        vector = mean + scale * rng.normal(size=mean.shape)
                        torch.nn.utils.vector_to_parameters(torch.tensor(vector, dtype=torch.float32), net.parameters())
                        obs, _ = env.reset(seed=args.seed + updates)
                        total, done = 0, False
                        while not done and time.monotonic() < deadline:
                            with torch.no_grad(): action = net(torch.tensor(obs)).numpy().clip(-1, 1)
                            obs, reward, terminated, truncated, _ = env.step(action)
                            total += reward; done = terminated or truncated
                        if not done: break  # Interrupted candidates are not losses or draws.
                        generation.append((total, vector)); scores.append(total)
                        if total > best_score: best_score, best = total, vector.copy()
                    if len(generation) < 2: break
                    elite = np.stack([v for _, v in sorted(generation, key=lambda row: row[0], reverse=True)[:2]])
                    mean, scale = elite.mean(axis=0), np.maximum(0.03, elite.std(axis=0))
                    updates += 1
                torch.nn.utils.vector_to_parameters(torch.tensor(best, dtype=torch.float32), net.parameters())
            torch.save(net.state_dict(), checkpoint)
            artifact = dense_export([net[0], net[2]], env)
            predictor = lambda obs: net(torch.tensor(obs)).detach().numpy()
        else:
            text = Path(__file__).with_name("neat.ini").read_text().replace("INPUTS", str(inputs)).replace("OUTPUTS", str(outputs))
            config_path = out / "neat.ini"
            config_path.write_text(text)
            config = neat.Config(neat.DefaultGenome, neat.DefaultReproduction, neat.DefaultSpeciesSet,
                                 neat.DefaultStagnation, str(config_path))
            checkpoints = sorted(out.glob("neat-checkpoint-*"), key=lambda p: int(p.name.rsplit("-", 1)[1]))
            population = neat.Checkpointer.restore_checkpoint(str(checkpoints[-1])) if checkpoints else neat.Population(config)
            population.add_reporter(neat.Checkpointer(generation_interval=1, time_interval_seconds=None,
                                                     filename_prefix=str(out / "neat-checkpoint-")))
            best = None
            class StopPilot(Exception): pass
            def evaluate(genomes, cfg):
                nonlocal best, updates
                for _, genome in genomes:
                    if time.monotonic() >= deadline: raise StopPilot()
                    network = neat.nn.FeedForwardNetwork.create(genome, cfg)
                    obs, _ = env.reset(seed=args.seed + updates)
                    done, total = False, 0
                    while not done:
                        if time.monotonic() >= deadline: raise StopPilot()
                        obs, reward, terminal, truncated, _ = env.step(network.activate(obs))
                        total += reward; done = terminal or truncated
                    genome.fitness = total; scores.append(total)
                    if best is None or total > best.fitness:
                        import copy
                        best = copy.deepcopy(genome)
                updates += 1
            try: population.run(evaluate, 1000000)
            except StopPilot: pass
            if best is None: raise RuntimeError("budget ended before a NEAT candidate completed an episode")
            network = neat.nn.FeedForwardNetwork.create(best, config)
            artifact = dict(version=1, surface=args.surface, hz=12, observationNames=env.names, layers=[],
                            graph=dict(outputs=network.output_nodes, nodes=[dict(id=n, bias=b, response=r, links=links)
                            for n, activation, aggregation, b, r, links in network.node_evals]))
            predictor = network.activate
        error = parity(env, artifact, predictor, rng)
        write_json(out / "model.json", artifact)
        write_json(out / "training.json", dict(method=args.method, seed=args.seed, seconds=time.monotonic() - start,
                   steps=env.steps, simulatedSeconds=env.steps / 12, episodes=env.episodes, outcomes=env.outcomes,
                   updates=updates, scores=scores, inferenceMaxError=error, evaluation="smoke-only; not a strength claim",
                   dependencies={p: importlib.metadata.version(p) for p in ["torch", "numpy", "gymnasium", "stable-baselines3", "neat-python"]}))
        print(json.dumps(dict(method=args.method, updates=updates, steps=env.steps, inferenceMaxError=error)))
    finally:
        env.close()


if __name__ == "__main__":
    main()
