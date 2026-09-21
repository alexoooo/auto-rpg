import unittest
from rewards import potential, shaping


class RewardTests(unittest.TestCase):
    def observation(self, value):
        row = [0.0] * 48
        row[6] = value
        return row

    def test_discounted_shaping_telescopes(self):
        states = [self.observation(v) for v in [0.2, 0.6, -0.3, 0.9]]
        total = sum(0.99**i * shaping(states[i], states[i + 1], i == 2) for i in range(3))
        self.assertAlmostEqual(total, -potential(states[0]))

    def test_terminal_zero_and_truncation_bootstrap(self):
        a, b = self.observation(0.2), self.observation(0.8)
        self.assertAlmostEqual(shaping(a, b, True), -0.2)
        self.assertAlmostEqual(shaping(a, b, False), 0.99 * 0.8 - 0.2)


if __name__ == "__main__":
    unittest.main()
