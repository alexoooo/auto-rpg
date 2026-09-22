"""Fit non-state-dependent controls to the same expanded student dataset."""
import json
import hashlib
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parent.parent
source = root / "research/runs/wave4-2026-09-22-r2/student-labels.json"
out = root / "research/runs/wave4-matched-controls"
out.mkdir(exist_ok=True)
rows = [r for r in json.loads(source.read_text()) if r.get("action") is not None]
template = json.loads((root / "research/runs/wave4-2026-09-22-r2/student-round-2/model.json").read_text())
x = np.asarray([r["observation"] for r in rows], dtype=float)
y = np.asarray([r["action"] for r in rows], dtype=float)
clock = template["observationNames"].index("clock")
width = x.shape[1]
weights = np.zeros((32, width))
weights[:, clock] = 20
bias = -20 * np.linspace(0, 1, 32)
features = np.column_stack([np.tanh(x @ weights.T + bias), np.ones(len(x))])
regularizer = np.eye(33) * 0.001
regularizer[-1, -1] = 0
fit = np.linalg.solve(features.T @ features + regularizer, features.T @ y)
common = {k: template[k] for k in ["version", "surface", "baseline", "hz", "observationNames"]}
common["scope"] = "twin-blades"
models = {
    "constant": dict(common, layers=[dict(activation="linear", weights=np.zeros((22, width)).tolist(), bias=y.mean(axis=0).tolist())]),
    "clock": dict(common, layers=[dict(activation="tanh", weights=weights.tolist(), bias=bias.tolist()),
                                  dict(activation="linear", weights=fit[:-1].T.tolist(), bias=fit[-1].tolist())]),
}
observations = np.random.default_rng(419900001).uniform(-1, 1, (32, width))
predictions = {
    "constant": np.tile(y.mean(axis=0), (32, 1)).clip(-1, 1).tolist(),
    "clock": (np.column_stack([np.tanh(observations @ weights.T + bias), np.ones(32)]) @ fit).clip(-1, 1).tolist(),
}
for name, model in models.items():
    path = out / f"{name}.json"
    if path.exists():
        raise ValueError("preserve existing fitted controls")
    path.write_text(json.dumps(model, allow_nan=False, indent=2))
(out / "parity.json").write_text(json.dumps(dict(observations=observations.tolist(), predictions=predictions)))
(out / "provenance.json").write_text(json.dumps(dict(
    source=str(source), sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), rows=len(rows),
    method="constant mean and fixed 32-tanh clock basis with ridge 0.001; no other observation can affect either control",
    clockColumn=clock), indent=2))
