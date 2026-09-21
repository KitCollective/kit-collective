# Ratchet nudge is reviewLoops, not a model

Docs asked the planner to require a ratchet after the same `### Review feedback` class failed twice. The planner is Linear CLI with no Pi, so it cannot judge “class”. The worker treats `reviewLoops >= 2` on the workpad as that signal. Checker-exit writes the nudge; planner may repeat it. Loop cap stays at five. A second fail of a different class still nudges — that is the accepted over-nudge.

Status: accepted
