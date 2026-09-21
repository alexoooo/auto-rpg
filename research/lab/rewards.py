"""Training-only potential shaping. Evaluation always scores the actual bout verdict."""
def potential(observation):
    # These v1 prefix indices are retained in v2: self/opponent vitality.
    return float(observation[6] - observation[27])


def shaping(previous, following, terminal, gamma=0.99):
    # Zero terminal potential is essential; truncations retain bootstrap.
    return gamma * (0.0 if terminal else potential(following)) - potential(previous)
