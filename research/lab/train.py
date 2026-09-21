"""Bounded pilot trainers and browser export. Invoke through lab CLI for cumulative budget control."""
import argparse
import importlib.metadata
import json
from pathlib import Path
import random
import time
from functools import partial

import numpy as np
import torch
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.vec_env import SubprocVecEnv
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
    return dict(version=env.version, surface=env.config["surface"], hz=12, observationNames=env.names,
                baseline=env.config["controlBaseline"], layers=result)


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
    parser.add_argument("--distill-updates", type=int, default=1000)
    parser.add_argument("--reward", choices=["terminal", "potential"], default="terminal")
    parser.add_argument("--envs", type=int, choices=[1, 2, 4], default=1)
    parser.add_argument("--fitness-episodes", type=int, choices=[1, 4, 8], default=4)
    parser.add_argument("--baseline", choices=["golem-driver", "golem-duelist"], default="golem-driver")
    parser.add_argument("--log-std", type=float, default=0.0)
    args = parser.parse_args()
    if not 0 < args.seconds <= 3600:
        parser.error("training jobs must be at most 3600 seconds; cumulative authorization is enforced by the lab CLI")
    if not 1 <= args.distill_updates <= 100000:
        parser.error("distillation update limit must be between 1 and 100000")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    protocol = dict(method=args.method, surface=args.surface, seed=args.seed,
                    episodeSeconds=args.episode_seconds, reward=args.reward, envs=args.envs,
                    fitnessEpisodes=args.fitness_episodes, baseline=args.baseline, logStd=args.log_std)
    if args.method == "distill":
        protocol["distillUpdates"] = args.distill_updates
    protocol_path = out / "protocol.json"
    if protocol_path.exists() and json.loads(protocol_path.read_text()) != protocol:
        raise ValueError("training protocol changed; use a new output directory")
    if args.reward != "terminal" and args.method != "ppo":
        raise ValueError("potential shaping currently supports PPO's discounted objective only")
    if args.envs != 1 and args.method != "ppo":
        raise ValueError("parallel environments currently support PPO only")
    write_json(protocol_path, protocol)
    start = time.monotonic()
    deadline = start + args.seconds
    random.seed(args.seed)
    rng = np.random.default_rng(args.seed)
    torch.manual_seed(args.seed)
    torch.set_num_threads(2)
    env = CombatEnv(args.surface, args.seed, args.episode_seconds, args.reward, args.baseline)
    training_env = env
    artifact = None
    updates = 0
    scores = []
    predictor = None
    def fitness(predict, suite_seed):
        values = []
        for episode in range(args.fitness_episodes):
            obs, _ = env.reset(seed=suite_seed + episode * 5)
            done, total = False, 0.0
            while not done:
                if time.monotonic() >= deadline:
                    return None
                obs, reward, terminal, truncated, _ = env.step(predict(obs))
                total += reward
                done = terminal or truncated
            values.append(total)
        return sum(values) / len(values)
    try:
        inputs, outputs = len(env.names), env.action_space.shape[0]
        if args.method == "ppo":
            if args.envs > 1:
                training_env = SubprocVecEnv([partial(CombatEnv, args.surface, args.seed + i * 1000,
                    args.episode_seconds, args.reward, args.baseline) for i in range(args.envs)], start_method="spawn")
            checkpoint = out / "ppo.zip"
            class Deadline(BaseCallback):
                def _on_training_start(self):
                    self.last_checkpoint = time.monotonic()

                def _on_step(self):
                    now = time.monotonic()
                    if now - self.last_checkpoint >= 60:
                        temporary = out / "ppo-next.zip"
                        self.model.save(temporary)
                        temporary.replace(checkpoint)
                        progress = dict(steps=self.num_timesteps, updates=self.model._n_updates,
                                        seconds=now - start, status="training; not evaluation")
                        write_json(out / "progress.json", progress)
                        print(json.dumps(progress), flush=True)
                        self.last_checkpoint = now
                    return now < deadline
            model = PPO.load(checkpoint, env=training_env, device="cpu") if checkpoint.exists() else PPO(
                "MlpPolicy", training_env, seed=args.seed, device="cpu", n_steps=128, batch_size=64,
                n_epochs=4, policy_kwargs=dict(net_arch=dict(pi=[32, 32], vf=[32, 32]), activation_fn=torch.nn.Tanh,
                                              log_std_init=args.log_std), verbose=0)
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
                while time.monotonic() < deadline and updates < args.distill_updates:
                    optimizer.zero_grad(); loss = torch.nn.functional.mse_loss(net(x), y)
                    loss.backward(); optimizer.step(); updates += 1
                scores.append(float(loss.detach()))
            else:
                mean = torch.nn.utils.parameters_to_vector(net.parameters()).detach().numpy().copy()
                scale = np.full_like(mean, 0.15)
                best = None
                while time.monotonic() < deadline:
                    generation = []
                    for candidate_index in range(8):
                        if time.monotonic() >= deadline:
                            break
                        vector = (best.copy() if best is not None else mean.copy()) if candidate_index == 0 else mean + scale * rng.normal(size=mean.shape)
                        torch.nn.utils.vector_to_parameters(torch.tensor(vector, dtype=torch.float32), net.parameters())
                        total = fitness(lambda obs: net(torch.tensor(obs)).detach().numpy().clip(-1, 1), args.seed + updates * 16)
                        if total is None: break  # Incomplete suites are not losses or draws.
                        generation.append((total, vector)); scores.append(total)
                    if not generation: break
                    ranking = sorted(generation, key=lambda row: row[0], reverse=True)
                    # Re-evaluate the incumbent on this generation's matched suite. Never compare
                    # a lucky win on last generation's opponent with this generation's fitness.
                    best = ranking[0][1].copy()
                    if len(generation) < 8: break
                    elite = np.stack([v for _, v in ranking[:2]])
                    mean, scale = elite.mean(axis=0), np.maximum(0.03, elite.std(axis=0))
                    updates += 1
                if best is None: raise RuntimeError("budget ended before a complete evolutionary fitness suite")
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
                generation_best = None
                for _, genome in genomes:
                    if time.monotonic() >= deadline: raise StopPilot()
                    network = neat.nn.FeedForwardNetwork.create(genome, cfg)
                    total = fitness(network.activate, args.seed + updates * 16)
                    if total is None: raise StopPilot()
                    genome.fitness = total; scores.append(total)
                    if generation_best is None or total > generation_best.fitness:
                        import copy
                        generation_best = copy.deepcopy(genome)
                best = generation_best
                updates += 1
            try: population.run(evaluate, 1000000)
            except StopPilot: pass
            if best is None: raise RuntimeError("budget ended before a NEAT candidate completed an episode")
            network = neat.nn.FeedForwardNetwork.create(best, config)
            artifact = dict(version=env.version, surface=args.surface, hz=12, observationNames=env.names,
                            baseline=args.baseline, layers=[],
                            graph=dict(outputs=network.output_nodes, nodes=[dict(id=n, bias=b, response=r, links=links)
                            for n, activation, aggregation, b, r, links in network.node_evals]))
            evaluated = {n[0] for n in network.node_evals}
            # neat-python leaves disconnected outputs at zero; preserve that exact behavior.
            artifact["graph"]["nodes"].extend(dict(id=n, bias=0, response=0, links=[])
                for n in network.output_nodes if n not in evaluated)
            predictor = network.activate
        error = parity(env, artifact, predictor, rng)
        steps, episodes, outcomes, simulated_seconds = env.steps, env.episodes, env.outcomes, env.simulated_seconds
        if args.envs > 1:
            steps = sum(training_env.get_attr("steps"))
            episodes = sum(training_env.get_attr("episodes"))
            outcomes = [row for rows in training_env.get_attr("outcomes") for row in rows]
            simulated_seconds = sum(training_env.get_attr("simulated_seconds"))
        write_json(out / "model.json", artifact)
        if args.method == "ppo":
            # Keep the mean policy for paired comparisons; this second artifact matches
            # the trained Gaussian distribution, with clipping performed after sampling.
            write_json(out / "stochastic-model.json", dict(artifact,
                samplingStd=model.policy.log_std.detach().exp().cpu().tolist()))
        write_json(out / "training.json", dict(method=args.method, seed=args.seed, seconds=time.monotonic() - start,
                   steps=steps, simulatedSeconds=simulated_seconds, episodes=episodes, outcomes=outcomes, envs=args.envs,
                   updates=updates, scores=scores, inferenceMaxError=error, evaluation="training-only; independent evaluation required",
                   observationVersion=env.version, reward=args.reward, episodeSeconds=args.episode_seconds,
                   fitnessEpisodes=args.fitness_episodes,
                   baseline=args.baseline, logStd=args.log_std,
                   dependencies={p: importlib.metadata.version(p) for p in ["torch", "numpy", "gymnasium", "stable-baselines3", "neat-python"]}))
        print(json.dumps(dict(method=args.method, updates=updates, steps=steps, inferenceMaxError=error)))
    finally:
        if training_env is not env:
            training_env.close()
        env.close()


if __name__ == "__main__":
    main()
