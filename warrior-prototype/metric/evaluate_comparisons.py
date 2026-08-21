"""Report pairwise agreement and propose weights after enough human choices."""

import json
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

from score import COMPONENT_WEIGHTS, DEFAULT_OUTPUT


COMPARISONS = DEFAULT_OUTPUT / "comparisons.jsonl"
FITTED = DEFAULT_OUTPUT / "fitted-weights.json"


def load_records():
    if not COMPARISONS.exists():
        raise RuntimeError(f"no comparisons at {COMPARISONS}")
    records = []
    for line_number, line in enumerate(COMPARISONS.read_text(encoding="utf-8").splitlines(), 1):
        record = json.loads(line)
        if record["choice"] == "tie":
            continue
        if record["left"].get("metric") is None or record["right"].get("metric") is None:
            print(f"comparison {line_number} has no metric report and is excluded")
            continue
        records.append(record)
    return records


def agreement(records, weights):
    agreed = 0
    for record in records:
        left = record["left"]["metric"]["components"]
        right = record["right"]["metric"]["components"]
        left_distance = sum(weights[name] * left[name] for name in weights)
        right_distance = sum(weights[name] * right[name] for name in weights)
        predicted = "left" if left_distance < right_distance else "right"
        agreed += predicted == record["choice"]
    return agreed / len(records) if records else 0.0


def fit(records):
    names = list(COMPONENT_WEIGHTS)
    prior = np.array([COMPONENT_WEIGHTS[name] for name in names])
    differences = []
    for record in records:
        left = record["left"]["metric"]["components"]
        right = record["right"]["metric"]["components"]
        closer, farther = (left, right) if record["choice"] == "left" else (right, left)
        differences.append(np.array([farther[name] - closer[name] for name in names]))

    def objective(weights):
        margins = np.stack(differences) @ weights
        ranking_loss = np.logaddexp(0.0, -5.0 * margins).mean()
        regularization = 0.5 * np.sum((weights - prior) ** 2)
        return ranking_loss + regularization

    result = minimize(
        objective, prior, method="SLSQP", bounds=[(0.0, 1.0)] * len(names),
        constraints={"type": "eq", "fun": lambda weights: weights.sum() - 1.0},
    )
    if not result.success:
        raise RuntimeError(f"weight fit failed: {result.message}")
    return {name: float(value) for name, value in zip(names, result.x)}


def main():
    records = load_records()
    print(f"scored non-tied comparisons: {len(records)}")
    print(f"formula-v1 agreement: {agreement(records, COMPONENT_WEIGHTS):.1%}")
    if len(records) < 30:
        print(f"need {30 - len(records)} more scored comparisons before fitting weights")
        return
    weights = fit(records)
    output = {
        "schemaVersion": 1,
        "comparisonCount": len(records),
        "agreement": agreement(records, weights),
        "proposedWeights": weights,
    }
    FITTED.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"fitted agreement: {output['agreement']:.1%}")
    print(f"proposal: {FITTED}")


if __name__ == "__main__":
    main()
