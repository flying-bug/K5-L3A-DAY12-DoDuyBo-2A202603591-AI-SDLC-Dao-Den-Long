---
name: verify-phase
description: Checklist to verify a lab phase before tagging (tests, headless contract, browser check, honest evidence).
---

Run in this order and report real outputs, not summaries:

1. `npm test` (all green; note the count). Save to `docs/proof/phase-N/npm-test.txt`.
2. Headless sample per new feature: `node src/headless.js --seed 1 --night N --scenario <s.json> --inputs <i.json> --ticks T --out <o.jsonl>`; exit code 0, file ends with an `end` line.
3. Error path: broken inputs/scenario must exit 2.
4. Full night perf: `--ticks 21600` under 30 s.
5. Browser: `node scripts/browser-check.mjs --night N --seconds 8 --out docs/proof/phase-N/nightN.png`; look at the PNG; report avg FPS and JS errors.
6. `game.contract.json` equals `src/config.js` (covered by the first test).
7. Phase 4+: `node scripts/bench.mjs --seed 42 --duration 30 --out bench.json` (avg >= 60, p1-low >= 30, load <= 10 s) and the contract `soak_cmd` (0 crashes, mem_end <= 1.2 x mem_start); `npm run release`, extract the archive elsewhere and start it.
8. README and spec: anything not verified is written as "chưa kiểm chứng".
9. Do not commit or tag; hand the diff to the user.
