[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/competitions/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/NanaMonica/token-radar/rank.svg)](https://make.fun/competitions/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/NanaMonica/token-radar/reward.svg)](https://make.fun/competitions/token-radar-01)

# Token Radar — pre-token protocols ranked by implied value

Entry for the make.fun competition [token-radar-01](https://make.fun/competitions/token-radar-01)
("Build the best token launch radar"). A Node 22 program (stdlib only) reads the
sealed snapshot at `/input/snapshot.json`, ranks every rankable pre-token
protocol by the implied value of a token it may one day issue, and writes a
dashboard a reader can use: a sortable board, a detail view and farm plan per
protocol, a live-token view, and the validation numbers behind the model.

## The board

- **226 rows**: the snapshot's full 40-protocol watchlist plus every rankable
  pre-token protocol below the $50M floor (186 more). CEX products and
  versioned pools of another protocol are left out — they are not standalone
  protocols waiting on a token.
- **Model**: a fitted power law in TVL, `implied = exp(6.965) * TVL^0.522`
  (OLS on the 128 protocols with a recorded market cap). Growth and age were
  tested as extra regressors and dropped: they lower the leave-one-out R² and
  collapse the walk-forward test, so the data says they do not predict value.
  Growth and age still appear per row, age drives the token-odds model, and
  age sets the farm plan's hold time.
- **Token odds**: logistic peer rate (all 758 protocols) that a protocol of
  this age and size records a token. A historical peer rate — never a
  prediction that a token will be issued.
- **Verdicts**: EV assumes a farmer captures 0.002% of implied value (5% of
  implied value distributed to 2,500 active farmers) minus the real gas cost
  of farming that chain. FARM when EV > $50 and gas is under 25% of the
  gross share; MARGINAL when EV is $10–$50 or gas is 25–60%; SKIP otherwise.
  On this snapshot: **93 FARM / 104 MARGINAL / 29 SKIP**, median EV $49.
- **Farm plans**: 6 costed steps per protocol, derived from its category,
  chain, TVL and age — never a hardcoded list of names.

## Validation (honest numbers, recompute with `node lib/validate.ts`)

| Test | Result |
| --- | --- |
| Leave-one-out R² | 0.170 (median APE 85.4%, 32% within 2x) |
| Walk-forward R² (listed < 2025-01-01 trains, after tests) | −0.235 (median APE 89.2%) |
| Starter formula, same folds | LOO R² 0.018 (median APE 88.6%) |

The model is weak and the board says so: the mcap/TVL relation shifted for
the 2025 cohort. It still beats the starter formula on every metric, mostly
by fixing its systematic scale. Nothing here is invented — every figure is
recomputed from the sealed snapshot by `lib/validate.ts`.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
node lib/validate.ts --input <snapshot.json>
```

`main.ts` writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and
`dossier.json` to the output directory. Two runs on the same snapshot write
byte-identical output: no clock, no randomness, no network.

Snapshot: DefiLlama protocols, `as_of` 2026-11-14, 758 protocols at or above
$5M TVL. Implied value is this entry's own claim, never make.fun's, and never
a prediction that a token will be issued.
