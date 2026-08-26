import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from score_v2 import boundary_distance, iou, material_distance
from oracle_v3 import structural_distance
from screen_variant_distance import image_distance
from v2_contract import ROOT, fixed_transform, decode_regions


class V2ContractTests(unittest.TestCase):
    def test_identical_structural_cells_are_zero(self):
        mask = np.zeros((32, 32), dtype=bool)
        mask[8:24, 10:22] = True
        distance, f_score = boundary_distance(mask, mask)
        self.assertEqual(iou(mask, mask), 1.0)
        self.assertEqual(distance, 0.0)
        self.assertEqual(f_score, 1.0)

    def test_unknown_opaque_region_colours_are_refused(self):
        path = ROOT / ".review" / "metric-test-unknown.png"
        try:
            Image.new("RGBA", (4, 4), (0, 0, 0, 255)).save(path)
            with self.assertRaisesRegex(ValueError, "unknown opaque ID colour"):
                decode_regions(path)
        finally:
            path.unlink(missing_ok=True)

    def test_fixed_registration_does_not_follow_a_candidate_extremity(self):
        image = Image.new("RGB", (100, 100), "white")
        ids = np.zeros((100, 100), dtype=np.uint8)
        ids[20:80, 30:70] = 1
        transform = {"sourceBox": [30, 20, 70, 80], "targetOffset": [10, 10], "targetSize": [80, 120]}
        _, baseline = fixed_transform(image, ids, transform, Image.Resampling.NEAREST)
        ids[5, 5] = 1
        _, changed = fixed_transform(image, ids, transform, Image.Resampling.NEAREST)
        np.testing.assert_array_equal(baseline, changed)

    def test_swapping_material_assignment_worsens_a_local_region(self):
        image = np.zeros((32, 32, 3), dtype=np.uint8)
        image[:, :16] = (40, 40, 45)
        image[:, 16:] = (140, 60, 25)
        ids = np.zeros((32, 32), dtype=np.uint8)
        ids[:, :16] = 1
        ids[:, 16:] = 4
        same, _ = material_distance(Image.fromarray(image), Image.fromarray(image), ids, ids)
        swapped = ids[:, ::-1]
        wrong, _ = material_distance(Image.fromarray(image), Image.fromarray(image), ids, swapped)
        self.assertEqual(same, 0.0)
        self.assertGreater(wrong, same)

    def test_an_identity_oracle_scores_zero(self):
        ids = np.zeros((32, 32), dtype=np.uint8)
        ids[4:20, 5:18] = 1
        ids[20:28, 8:24] = 20
        self.assertEqual(structural_distance(ids, ids), 0.0)

    def test_a_view_specific_oracle_is_never_acceptance_eligible(self):
        source = (ROOT / "metric" / "oracle_v3.py").read_text(encoding="utf-8")
        self.assertIn('"acceptanceEligible": False', source)

    def test_shield_field_and_rim_ownership_are_both_visible(self):
        profile = ROOT / "metric" / "reference" / "rigid-v3" / "structural"
        for view in ("front", "front_left", "front_right"):
            ids = np.asarray(Image.open(profile / f"{view}.png"), dtype=np.uint8)
            self.assertGreater(np.count_nonzero(ids == 20), 100)
            self.assertGreater(np.count_nonzero(ids == 21), 100)

    def test_variant_distance_detects_an_image_change(self):
        left = ROOT / ".review" / "variant-left.png"
        right = ROOT / ".review" / "variant-right.png"
        try:
            Image.new("RGB", (8, 8), (0, 0, 0)).save(left)
            Image.new("RGB", (8, 8), (255, 0, 0)).save(right)
            self.assertAlmostEqual(image_distance(left, right), 1 / 3)
        finally:
            left.unlink(missing_ok=True)
            right.unlink(missing_ok=True)

    def test_rigid_v4_labels_every_target_foreground_pixel(self):
        profile = ROOT / "metric" / "reference" / "rigid-v4"
        for view in ("front", "front_left", "left", "back_left",
                     "back", "back_right", "right", "front_right"):
            structural = np.asarray(Image.open(profile / "structural" / f"{view}.png"), dtype=np.uint8)
            materials = np.asarray(Image.open(profile / "material" / f"{view}.png"), dtype=np.uint8)
            np.testing.assert_array_equal(structural > 0, materials > 0)
            self.assertGreater(np.count_nonzero(structural), 10_000)
            self.assertLessEqual(int(structural.max()), 24)
            self.assertLessEqual(int(materials.max()), 9)

    def test_rigid_v4_is_not_derived_from_candidate_evidence(self):
        source = (ROOT / "metric" / "prepare_v4_reference.py").read_text(encoding="utf-8")
        self.assertNotIn('ROOT / ".review"', source)
        self.assertIn('REFERENCE / "proposals"', source)
        self.assertIn("ANNOTATIONS_PATH", source)

    def test_rigid_v4_records_the_complete_visual_review(self):
        profile = ROOT / "metric" / "reference" / "rigid-v4"
        consistency = __import__("json").loads(
            (profile / "consistency.json").read_text(encoding="utf-8"))
        self.assertEqual(consistency["status"], "frozen-target-derived-coarse")
        self.assertEqual(set(consistency["reviewedViews"]), {
            "front", "front_left", "left", "back_left",
            "back", "back_right", "right", "front_right",
        })

    def test_rigid_v5_routes_cardinal_views_by_exact_membership(self):
        source = (ROOT / "metric" / "prepare_v5_reference.py").read_text(encoding="utf-8")
        self.assertIn('CARDINAL_VIEWS = {"front", "left", "back", "right"}', source)
        self.assertIn('view in CARDINAL_VIEWS', source)
        self.assertNotIn('"left" in view or "right" in view', source)

    def test_rigid_v5_keeps_mail_visible_in_every_cardinal_view(self):
        profile = ROOT / "metric" / "reference" / "rigid-v5"
        for view in ("front", "left", "back", "right"):
            materials = np.asarray(
                Image.open(profile / "material" / f"{view}.png"), dtype=np.uint8)
            self.assertGreater(np.count_nonzero(materials == 3), 1_000, view)

    def test_rigid_v5_records_the_complete_visual_review(self):
        profile = ROOT / "metric" / "reference" / "rigid-v5"
        consistency = __import__("json").loads(
            (profile / "consistency.json").read_text(encoding="utf-8"))
        self.assertEqual(consistency["status"], "frozen-consistent-ontology")
        self.assertEqual(set(consistency["reviewedViews"]), {
            "front", "front_left", "left", "back_left",
            "back", "back_right", "right", "front_right",
        })


if __name__ == "__main__":
    unittest.main()
