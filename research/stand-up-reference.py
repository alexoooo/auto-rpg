"""Execute a pinned local upstream checkout without redistributing its code or weights."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument("--reference", default=".tools/get-up-reference")
parser.add_argument("--output", default="research/runs/get-up-learning/reference")
parser.add_argument("--episodes", type=int, default=4)
parser.add_argument("--updates", type=int, default=16)
parser.add_argument("--power", type=float, default=.4)
options = parser.parse_args()
reference = Path(options.reference).resolve()
output = Path(options.output).resolve()
output.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(reference))
os.chdir(reference)
import numpy as np
import torch
import imageio.v2 as imageio
from main import ArgParserTrain
from env import HumanoidStandupEnv
from SAC import SAC
from utils import ReplayBuffer

torch.set_num_threads(2)
# The published files contain tensor state dictionaries; load them on this machine's device.
original_load = torch.load
def load_tensors(path, **kwargs):
    return original_load(path, map_location="cpu", **({"weights_only": True} if int(torch.__version__.split(".")[0]) >= 2 else {}), **kwargs)
torch.load = load_tensors
args = ArgParserTrain().parse_args([])
args.power = args.power_end = args.curr_power = options.power
args.discount = .97
args.actor_lr = 1e-5
args.batch_size = 32
args.to_file = False
args.replay_buffer_size = 4096
args.seed = 120
np.random.seed(args.seed)
torch.manual_seed(args.seed)
env = HumanoidStandupEnv(args, args.seed)
policy = SAC(env.obs_shape, env.action_space, init_temperature=args.init_temperature,
    alpha_lr=args.alpha_lr, actor_lr=args.actor_lr, critic_lr=args.critic_lr, tau=args.tau,
    discount=args.discount, critic_target_update_freq=args.critic_target_update_freq, args=args)
checkpoint = reference / "experiment/pretrained/teacher/model/best_model"
policy.load(str(checkpoint), load_optimizer=False)
buffer = ReplayBuffer(env.obs_shape, env.action_space, args, max_size=4096)
records = []
traces = []
start = time.monotonic()
for episode in range(options.episodes):
    state = env.reset(test_time=True)
    frames = []
    trace = []
    first_standing = None
    quiet = 0
    for step in range(250):
        action = policy.select_action(state)
        next_state, reward, done, _ = env.step(action, test_time=True)
        assert np.isfinite(next_state).all() and np.isfinite(action).all()
        # Upstream horizon is a truncation, not an absorbing failure.
        buffer.add(state, action, next_state, reward, False)
        height = float(env.physics.head_height())
        upright = float(env.physics.torso_upright())
        speed = float(np.linalg.norm(env.physics.center_of_mass_velocity()))
        quiet = quiet + 1 if height >= 1.5 and upright >= .9 and speed < .3 else 0
        if quiet >= 10 and first_standing is None:
            first_standing = (step + 1) * env.env.control_timestep()
        trace.append({"state": state.tolist(), "action": action.tolist(), "reward": float(reward),
            "height": height, "upright": upright, "speed": speed})
        if episode == 0:
            frames.append(env.render())
        state = next_state
        if done:
            break
    if frames:
        imageio.mimsave(output / "teacher.mp4", frames, fps=round(1 / env.env.control_timestep()))
        imageio.imwrite(output / "teacher-final.png", frames[-1])
    record = {"episode": episode, "steps": len(trace), "standingSeconds": first_standing,
        "finalHeight": trace[-1]["height"], "finalUpright": trace[-1]["upright"],
        "return": sum(row["reward"] for row in trace)}
    records.append(record)
    traces.append(trace)
    print(json.dumps(record), flush=True)

before = policy.select_action(state).copy()
for _ in range(options.updates):
    policy.train(buffer, args.batch_size)
after = policy.select_action(state).copy()
assert np.isfinite(after).all() and np.max(np.abs(after-before)) > 0
policy.save(str(output / "smoke"))
buffer.save(str(output / "buffer.npz"))
policy.load(str(output / "smoke"), load_optimizer=True)
assert np.array_equal(policy.select_action(state), after)
# Upstream save omits curriculum/RNG/counters; persist them separately for a complete resume.
np.savez(output / "rng.npz", state=np.array(np.random.get_state(), dtype=object))
torch.save({"rng": torch.get_rng_state(), "total_it": policy.total_it}, output / "training-state.pt")
buffer.load(str(output / "buffer.npz"))
policy.train(buffer, args.batch_size)
assert np.isfinite(policy.select_action(state)).all()
report = {"harness": "upstream dm_control HumanoidStandupEnv; teacher policy; local CPU",
    "revision": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
    "packages": {p: importlib.metadata.version(p) for p in ["torch", "numpy", "mujoco", "dm-control"]},
    "controlTimestep": env.env.control_timestep(), "physicsTimestep": env.physics.timestep(),
    "observations": env.obs_shape, "actions": env.action_space, "power": options.power,
    "records": records, "smokeUpdates": options.updates+1,
    "actionChange": float(np.max(np.abs(after-before))), "resumeActionExact": True,
    "wallSeconds": time.monotonic()-start,
    "files": {str(p.relative_to(reference)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in (reference / "experiment/pretrained").rglob("*.pt")},
    "deviations": ["Python 3.11, PyTorch 2.5.1, MuJoCo 3.1.6 and dm_control 1.0.20 compatibility environment",
        "teacher-only evaluation; no slow student; success reading is a reference diagnostic, not game qualification",
        "short update/save/load smoke, not full training reproduction"]}
(output / "report.json").write_text(json.dumps(report, indent=2)+"\n")
(output / "traces.json").write_text(json.dumps(traces)+"\n")
print(json.dumps(report), flush=True)
