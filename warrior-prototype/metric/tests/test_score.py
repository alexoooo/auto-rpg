import json
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from score import (  # noqa: E402
    ANNOTATIONS_PATH,
    NeuralMetrics,
    PARTS,
    VIEWS,
    aggregate_distances,
    landmark_distance,
    part_distance,
    score_view,
    silhouette_distance,
)


def fixture_view():
    parts = np.zeros((120, 100), dtype=np.uint8)
    parts[20:105, 25:75] = PARTS["body_armour"]
    parts[10:35, 40:60] = PARTS["head_hair"]
    parts[35:90, 15:30] = PARTS["shield"]
    parts[45:110, 72:78] = PARTS["sword"]
    parts[65:100, 43:57] = PARTS["tabard"]
    image = np.zeros((120, 100, 3), dtype=np.uint8)
    image[parts == PARTS["body_armour"]] = (55, 57, 58)
    image[parts == PARTS["head_hair"]] = (80, 48, 35)
    image[parts == PARTS["shield"]] = (35, 36, 38)
    image[parts == PARTS["sword"]] = (155, 158, 160)
    image[parts == PARTS["tabard"]] = (90, 20, 18)
    landmarks = {
        "crown": [50, 10], "chin": [50, 35], "left_shoulder": [30, 40],
        "right_shoulder": [70, 40], "sword_tip": [75, 109], "shield_bottom": [20, 89],
    }
    return {"beauty": Image.fromarray(image), "parts": parts, "landmarks": landmarks}


class VisualDistanceTests(unittest.TestCase):
    def test_every_review_angle_has_an_existing_reference_source(self):
        annotations = json.loads(ANNOTATIONS_PATH.read_text(encoding="utf-8"))
        self.assertEqual(tuple(annotations["views"]), VIEWS)
        for name in VIEWS:
            source = annotations["views"][name].get("source", annotations["source"])
            self.assertTrue((ANNOTATIONS_PATH.parent / source).is_file(), name)

    def test_an_identical_view_has_zero_classical_distance(self):
        view = fixture_view()
        result, _ = score_view(view, view, None)
        self.assertAlmostEqual(result["distance"], 0.0, places=12)

    def test_identical_pixels_short_circuit_neural_distance_to_zero(self):
        image = fixture_view()["beauty"]
        unloaded = NeuralMetrics.__new__(NeuralMetrics)
        self.assertEqual(unloaded.distances(image, image), (0.0, 0.0))

    def test_a_missing_sword_increases_the_part_and_total_distances(self):
        reference = fixture_view()
        candidate = fixture_view()
        candidate["parts"][candidate["parts"] == PARTS["sword"]] = PARTS["body_armour"]
        result, _ = score_view(reference, candidate, None)
        self.assertGreater(result["parts"]["sword"], 0.99)
        self.assertGreater(result["distance"], 0.0)

    def test_a_shifted_outline_is_farther_than_the_same_outline(self):
        mask = fixture_view()["parts"] > 0
        shifted = np.roll(mask, 12, axis=1)
        self.assertEqual(silhouette_distance(mask, mask), 0.0)
        self.assertGreater(silhouette_distance(mask, shifted), 0.1)

    def test_a_missing_part_has_maximum_iou_loss(self):
        parts = fixture_view()["parts"]
        candidate = parts.copy()
        candidate[candidate == PARTS["shield"]] = 0
        total, values = part_distance(parts, candidate)
        self.assertEqual(values["shield"], 1.0)
        self.assertGreaterEqual(total, 0.2)

    def test_a_moved_landmark_increases_landmark_distance(self):
        landmarks = fixture_view()["landmarks"]
        same, _ = landmark_distance(landmarks, landmarks)
        moved = {name: list(point) for name, point in landmarks.items()}
        moved["crown"][1] += 100
        different, _ = landmark_distance(landmarks, moved)
        self.assertEqual(same, 0.0)
        self.assertGreater(different, 0.1)

    def test_the_worst_view_cannot_disappear_inside_the_mean(self):
        all_good = aggregate_distances([0.1] * 8)
        one_bad_values = [0.1] * 7 + [1.0]
        one_bad = aggregate_distances(one_bad_values)
        plain_mean = np.mean(one_bad_values)
        self.assertGreater(one_bad, plain_mean)
        self.assertGreater(one_bad, all_good)


if __name__ == "__main__":
    unittest.main()
