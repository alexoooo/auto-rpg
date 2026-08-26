"""Validate blinded v2 comparisons without inventing missing human labels."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / "metric" / "calibration" / "profile.json"
COMPARISONS = ROOT / ".review" / "similarity" / "comparisons.jsonl"
OUTPUT = ROOT / "metric" / "calibration" / "report.json"


def exact_distance(metric: dict) -> float:
    values = [view["distance"] for view in metric["views"].values()]
    if metric["formulaVersion"] == 2:
        return .80 * float(np.mean(values)) + .20 * float(np.mean(sorted(values)[-2:]))
    return .75 * float(np.mean(values)) + .25 * max(values)


def main() -> None:
    profile = json.loads(PROFILE.read_text(encoding="utf-8"))
    records = []
    if COMPARISONS.exists():
        for line_number, line in enumerate(COMPARISONS.read_text(encoding="utf-8").splitlines(), 1):
            record = json.loads(line)
            versions = {record[side]["metric"]["formulaVersion"] for side in ("left", "right")}
            if len(versions) != 1:
                raise ValueError(f"comparison {line_number} mixes formula versions")
            for side in ("left", "right"):
                metric = record[side]["metric"]
                if abs(exact_distance(metric) - metric["distance"]) > 1e-12:
                    raise ValueError(f"comparison {line_number} does not retain the exact aggregate tensor")
            records.append(record)
    non_ties = [record for record in records if record.get("targetChoice") not in {None, "tie"}]
    production = [record for record in records if record.get("productionChoice") not in {None, "tie"}]
    ready = len(non_ties) >= profile["minimumHumanLabels"] and len(production) >= profile["minimumHumanLabels"]
    report = {
        "schemaVersion": 1,
        "comparisonCount": len(records),
        "targetSimilarityLabels": len(non_ties),
        "productionCoherenceLabels": len(production),
        "promotionStatus": "ready-for-held-out-fit" if ready else "provisional-human-calibration-required",
        "reason": None if ready else "The phase-01 pixel evidence was intentionally pruned before v2 existed; collect digest-pinned v2 A/B labels rather than reconstructing preferences from accept/reject status.",
        "acceptanceMargin": profile["globalAcceptanceMargin"],
        "absoluteStoppingBand": None,
    }
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"v2 calibration: {report['promotionStatus']} ({len(non_ties)} target, {len(production)} production labels)")


if __name__ == "__main__":
    main()
