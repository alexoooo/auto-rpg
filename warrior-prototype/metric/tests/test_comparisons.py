import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from evaluate_comparisons import agreement, fit  # noqa: E402
from score import COMPONENT_WEIGHTS  # noqa: E402


def metric(values):
    return {"formulaVersion": 1, "distance": 0.0, "components": values}


class ComparisonTests(unittest.TestCase):
    def test_agreement_uses_lower_distance_as_the_human_choice(self):
        closer = {name: 0.1 for name in COMPONENT_WEIGHTS}
        farther = {name: 0.8 for name in COMPONENT_WEIGHTS}
        records = [{
            "choice": "left",
            "left": {"metric": metric(closer)},
            "right": {"metric": metric(farther)},
        }]
        self.assertEqual(agreement(records, COMPONENT_WEIGHTS), 1.0)

    def test_fitted_weights_stay_non_negative_and_sum_to_one(self):
        records = []
        names = list(COMPONENT_WEIGHTS)
        for index in range(6):
            closer = {name: 0.2 for name in names}
            farther = {name: 0.2 for name in names}
            farther[names[index]] = 0.9
            records.append({
                "choice": "right",
                "left": {"metric": metric(farther)},
                "right": {"metric": metric(closer)},
            })
        weights = fit(records)
        self.assertAlmostEqual(sum(weights.values()), 1.0, places=8)
        self.assertTrue(all(value >= 0.0 for value in weights.values()))


if __name__ == "__main__":
    unittest.main()
