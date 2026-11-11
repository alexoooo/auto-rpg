# Sit-back search checkpoint

`workshop-rogue.json` is the Rogue's unfinished CMA search of her sit-back joint angles:
50 generations of 16 candidates, 60 placed trials a candidate, 1,851 seconds. Its best is
-5.59947906573383 at generation 47 (`checkpoint.best.g` is 46). Three
generations since that improvement do not establish the ten-generation plateau.

The first generation is played at `c1deb94d`. The resumed generations use that source with
the plateau-counter correction in `research/skills/skill-search.mjs`, committed with this
checkpoint: resumption retains the saved best's generation and score. The search's `start`
keeps the record it begins from; `checkpoint` keeps its CMA state and random stream.

A later approved run copies `workshop-rogue.json` to `.tmp/skill-search/workshop-rogue.json`
and resumes it with `node research/skills/skill-search.mjs sit-back workshop-rogue --out
.tmp/skill-search/workshop-rogue.json --resume --patience 10 --generations <total>`, where
`<total>` counts the completed generations too. Confirmation uses `--confirm` in place of
`--out`; it reads both the saved start and the best on fresh trials.

`held-out-falls.json` keeps the independent check's 240 fresh-protocol conditions and readings
at `06a851f8`, played once in Node on the game's engine at 120 Hz. Its per-fall readings let a
later comparison reuse this check without replaying it. The older saved fresh result at
`66a46676` has aggregate figures alone and precedes the standard row's `91ab9291` baseline.
