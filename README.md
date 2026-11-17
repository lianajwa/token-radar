[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/lianajwa/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/lianajwa/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Radar — pre-token protocols ranked by implied value

Entry for make.fun's **"Build the best token launch radar"** bounty
(`token-radar-01`). One program, `main.ts` (Node 22, standard library only),
reads the sealed DefiLlama snapshot and writes a dashboard that ranks the
protocols that record no token yet by what their launch would be worth — each
with a concrete farm plan.

## The model (`radar-2-comparables`)

Implied value follows from the snapshot's own figures, never from a hand-kept
list of names:

```
implied = round( tvl_usd × comparable multiple
                 × (1 + clamp(change_7d, -50, 150) / 100 × 0.75)
                 × maturity bell × (1 + 0.03 × chains over one) )
```

- **Comparables.** The multiple is the median market-cap-to-TVL ratio of the
  live-token protocols in the snapshot itself — the whole market blended with
  the protocol's own category (geometric mean). A Dex and a lending market do
  not launch at the same multiple, and the snapshot says so.
- **Growth with teeth.** Seven-day TVL growth moves the value, and a fall is
  clamped harder than a rise: a protocol bleeding TVL is not about to launch
  at a premium.
- **A maturity bell, not a ladder.** The multiplier peaks near two and a half
  years with no token and falls on both sides: too young to have proven
  itself, or old enough to have shown it likely never launches.

The board covers the whole 40-protocol watchlist and adds the 160 rankable
pre-token protocols below the floor with the most TVL — 200 rows. The
live-token protocols are set aside in their own view with their market caps,
never mixed into the ranking.

## The dashboard

A dark radar-themed page, no network, no framework: the board with a top-3
spotlight, search, category and chain filters, a watchlist-only toggle,
sortable columns, a live-token tab, a model panel that states the formula and
the computed multiples, and a detail drawer for every protocol with the full
model breakdown (each multiplier, recomputed in the page) and a seven-step
farm plan with cost and time per step.

## How to run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/`
and `out/dossier.json`. The run is deterministic: two runs write the same
bytes. Screenshots live in `screenshots/`: the board, a protocol's detail
view and a filtered view.
