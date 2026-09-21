"""Recover the trained Gaussian from a matching archived PPO checkpoint; never retrain it."""
import argparse
import hashlib
import json
from pathlib import Path

import torch
from stable_baselines3 import PPO
from stable_baselines3.common.distributions import DiagGaussianDistribution


def export_sampling(checkpoint, mean_path, directory):
    mean = json.loads(mean_path.read_text(encoding="utf-8"))
    model = PPO.load(checkpoint, device="cpu")
    if (not isinstance(model.policy.action_dist, DiagGaussianDistribution)
            or model.policy.squash_output or model.policy.use_sde):
        raise ValueError("export requires an unsquashed diagonal Gaussian PPO policy")
    layers = [layer for layer in model.policy.mlp_extractor.policy_net if isinstance(layer, torch.nn.Linear)]
    layers.append(model.policy.action_net)
    exported = [dict(weights=layer.weight.detach().cpu().tolist(), bias=layer.bias.detach().cpu().tolist(),
                     activation="linear" if i == len(layers) - 1 else "tanh") for i, layer in enumerate(layers)]
    if mean.get("layers") != exported or mean.get("samplingStd") is not None:
        raise ValueError("checkpoint does not match the supplied deterministic mean artifact")
    if len(mean["observationNames"]) != model.observation_space.shape[0]:
        raise ValueError("checkpoint observation width mismatch")
    deviations = model.policy.log_std.detach().exp().cpu().tolist()
    if len(deviations) != model.action_space.shape[0] or model.policy.log_std.ndim != 1:
        raise ValueError("checkpoint deviation width mismatch")
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / "stochastic-model.json"
    if destination.exists():
        raise ValueError("preserve existing exports; choose a new directory")
    artifact = dict(mean, samplingStd=deviations)
    encoded = json.dumps(artifact, allow_nan=False, indent=2)
    temporary = destination.with_suffix(".json.tmp")
    temporary.write_text(encoded, encoding="utf-8")
    temporary.replace(destination)
    provenance = dict(checkpoint=str(checkpoint), meanModel=str(mean_path),
                      checkpointSha256=hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
                      meanModelSha256=hashlib.sha256(mean_path.read_bytes()).hexdigest(),
                      stochasticModelFileSha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
                      status="weights matched exactly; no training performed")
    (directory / "sample-export.json").write_text(json.dumps(provenance, indent=2), encoding="utf-8")
    print(json.dumps(provenance))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    export_sampling(args.checkpoint, args.model, args.out)
