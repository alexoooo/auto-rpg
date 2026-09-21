# Current AI league

Harness: `tests/harness/bout-runner.mjs`, fresh Havok per bout, supported locomotion.

4 complete rating rounds; 17472 rated bouts; 0 failed bouts.

Only complete balanced rounds contribute to ratings. Scores include half a point for a draw.

| Policy | Glicko-2 | RD | Score | Draws | Attack/s | Retreat | Blocks/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| golem-duelist | 1532 | 10.2 | 54.4% | 48 | 0.64 | 40.0% | 3.58 |
| golem-champion | 1523 | 10.1 | 52.8% | 36 | 0.63 | 45.5% | 3.65 |
| golem-planner | 1521 | 10.1 | 52.3% | 44 | 0.60 | 42.8% | 3.66 |
| golem-miser | 1519 | 10.2 | 53.2% | 60 | 1.06 | 15.8% | 3.29 |
| golem-tactician | 1511 | 10.2 | 52.4% | 118 | 0.47 | 77.6% | 3.08 |
| golem-fencer | 1509 | 10.1 | 51.4% | 34 | 0.56 | 38.0% | 3.63 |
| golem-guardian | 1508 | 10.0 | 51.2% | 81 | 0.96 | 33.1% | 3.52 |
| golem-researched-guardian-3-4 | 1500 | 10.1 | 50.7% | 81 | 1.00 | 32.5% | 3.47 |
| golem-researched-form-3-5 | 1499 | 10.1 | 49.9% | 97 | 0.49 | 47.8% | 3.33 |
| golem-reaper | 1499 | 10.2 | 49.5% | 74 | 0.71 | 19.9% | 3.48 |
| golem-brawler | 1494 | 10.1 | 49.6% | 66 | 1.02 | 15.0% | 3.12 |
| golem-skirmisher | 1477 | 10.1 | 45.8% | 112 | 0.45 | 46.5% | 3.39 |
| golem-form | 1475 | 10.2 | 46.0% | 91 | 0.42 | 37.4% | 3.56 |
| golem-driver | 1434 | 10.2 | 40.6% | 94 | 0.36 | 33.3% | 3.59 |

Full matchup, build, side, overtime and behavior breakdowns are in the accompanying JSON (`summary.json` in a run directory; `baseline.json` in published results).
