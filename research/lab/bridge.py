"""Gymnasium adapter for the actual Node/Havok environment, not a Python physics clone."""
import json
import os
from pathlib import Path
import queue
import subprocess
import threading

import gymnasium as gym
import numpy as np
from rewards import shaping

ROOT = Path(__file__).resolve().parents[2]


class Bridge:
    def __init__(self):
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        self.process = subprocess.Popen(["node", str(ROOT / "research/lab/server.mjs"), str(os.getpid())],
                                        cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        text=True, encoding="utf-8", creationflags=flags)
        self.messages = queue.Queue()
        self.counter = 0
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.reader.start()

    def _read(self):
        for line in self.process.stdout:
            self.messages.put(line)
        self.messages.put(None)

    def request(self, op, **payload):
        self.counter += 1
        self.process.stdin.write(json.dumps(dict(id=self.counter, op=op, **payload), allow_nan=False) + "\n")
        self.process.stdin.flush()
        line = self.messages.get(timeout=30)
        if line is None:
            raise RuntimeError("Havok worker exited")
        response = json.loads(line)
        if response["id"] != self.counter or not response["ok"]:
            raise RuntimeError(response)
        return response["result"]

    def close(self):
        if self.process.poll() is None:
            self.process.stdin.close()  # EOF disposes the arena and exits the bridge.
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.terminate()
                self.process.wait(timeout=5)
        self.process.stdout.close()
        self.reader.join(timeout=1)


class CombatEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, surface="pilot", seed=1, episode_seconds=150, reward_mode="terminal", baseline="golem-driver"):
        if reward_mode not in ["terminal", "potential"]:
            raise ValueError("unknown reward mode")
        self.reward_mode = reward_mode
        self.bridge = Bridge()
        self.config = dict(surface=surface, seed=seed, maxSeconds=episode_seconds, hz=12, controlBaseline=baseline)
        self.episodes = 0
        self.steps = 0
        self.simulated_seconds = 0.0
        self.previous_clock = 0.0
        self.outcomes = []
        self.base_seed = seed
        try:
            info = self.bridge.request("reset", config=self.config)
        except BaseException:
            self.bridge.close()
            raise
        self.names = info["observationNames"]
        self.version = info["version"]
        self.action_space = gym.spaces.Box(-1, 1, (info["actionSize"],), dtype=np.float32)
        self.observation_space = gym.spaces.Box(-5, 5, (len(self.names),), dtype=np.float32)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        # Training-only pool. Reserved builds/opponents are never accessed here.
        builds = ["default", "two-blades", "mace", "fists"]
        opponents = ["golem-fencer", "golem-duelist", "golem-form", "golem-guardian"]
        index = self.episodes if seed is None else int(seed)
        config = dict(self.config, seed=(self.base_seed + index) % (2**31),
                      leftBuild=builds[index % len(builds)], rightBuild=builds[index % len(builds)],
                      right=dict(kind="baseline", name=opponents[(index // len(builds)) % len(opponents)]))
        result = self.bridge.request("reset", config=config)
        self.episodes += 1
        self.previous_observation = result["observation"]
        self.previous_clock = 0.0
        return np.asarray(result["observation"], dtype=np.float32), {}

    def step(self, action):
        row = self.bridge.request("step", actions=[np.asarray(action, dtype=float).clip(-1, 1).tolist()])[0]
        self.steps += 1
        self.simulated_seconds += row["clock"] - self.previous_clock
        self.previous_clock = row["clock"]
        if row["terminated"] or row["truncated"]:
            self.outcomes.append({k: row[k] for k in ["winner", "terminated", "truncated", "clock"]})
        reward = row["reward"]
        if self.reward_mode == "potential":
            reward += shaping(self.previous_observation, row["observation"], row["terminated"])
        self.previous_observation = row["observation"]
        return np.asarray(row["observation"], dtype=np.float32), reward, row["terminated"], row["truncated"], row

    def close(self):
        self.bridge.close()
