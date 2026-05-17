# AI Hedge Fund MVP

This project implements a presentation-ready MVP of a multi-agent hedge-fund-style research and trading system in a **historically constrained** simulation environment.

## What This MVP Includes

- Daily historical replay from `2021-01-01` to `2024-12-31`
- 10-stock large-cap tech universe
- Point-in-time price and news gating
- One research agent (Claude/OpenAI configurable, with rule-based fallback)
- One balanced-risk trading agent
- Portfolio simulator with transaction costs (commission + slippage + spread)
- Evaluation metrics and benchmark comparisons (`SPY`, `QQQ`, random, momentum)
- Electron desktop app for demo storytelling
- Source-driven current-event stock impact analysis from `sources.txt`

## Project Structure

- `src/config.py` - symbols, date window, risk limits, model/data config
- `src/data/` - price/news ingestion and point-in-time snapshotting
- `src/sim/` - portfolio accounting and historical simulator loop
- `src/agents/` - research and trading agents
- `src/agents/ensemble_insights.py` - stock-impact ensemble layer (currently one model)
- `src/eval/` - metrics and benchmark logic
- `src/pipeline.py` - end-to-end backtest orchestration
- `src/data/source_scanner.py` - source scanning and headline ingestion
- `desktop_bridge.py` - JSON bridge consumed by Electron
- `electron/` - desktop app frontend and process bridge
- `sources.txt` - configured world-event sources
- `run_backtest.py` - CLI entrypoint

## Setup

1. Create and activate a virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Copy and fill environment variables:

```bash
cp .env.example .env
```

Required/optional keys:

- `LLM_PROVIDER` (`anthropic` or `openai`; defaults to auto-detect based on keys)
- `ANTHROPIC_API_KEY` (if using Claude)
- `OPENAI_API_KEY` (if using OpenAI)
- `FINNHUB_API_KEY` (optional but recommended for company news)

## Run

### CLI backtest

```bash
python run_backtest.py
```

### Electron desktop app

```bash
cd electron
npm install
npm start
```

## Point-in-Time Integrity Rules

- Data used on each simulation day must have timestamps `<= current_day`
- Prices are read only up to each replay date
- News is filtered by publish time before research analysis
- No forward-filled future events are exposed to agents

## Notes and Limitations

- Free news APIs may be rate-limited or sparse for older windows.
- The research agent is intentionally simple for MVP reliability/cost control.
- This system is educational and not intended for live trading profitability claims.
