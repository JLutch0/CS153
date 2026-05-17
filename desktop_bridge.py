from __future__ import annotations

import argparse
import json
from datetime import date, datetime
from typing import Any

from src.agents.ensemble_insights import ModelEnsemble
from src.config import SIM, UNIVERSE
from src.data.source_scanner import gather_source_headlines, load_sources
from src.pipeline import run_full_backtest


def _serialize_backtest(result) -> dict[str, Any]:
    equity_curve = []
    if not result.equity_curve.empty:
        for _, row in result.equity_curve.iterrows():
            row_date = row["date"]
            if hasattr(row_date, "date"):
                row_date = row_date.date().isoformat()
            else:
                row_date = str(row_date)
            equity_curve.append({"date": row_date, "total_equity": float(row["total_equity"])})

    trades = []
    if not result.trades.empty:
        trades = result.trades.tail(200).to_dict(orient="records")

    benchmark_curves = {}
    for name, frame in result.benchmark_curves.items():
        benchmark_curves[name] = [
            {
                "date": (row["date"].date().isoformat() if hasattr(row["date"], "date") else str(row["date"])),
                "total_equity": float(row["total_equity"]),
            }
            for _, row in frame.iterrows()
        ]

    traces = []
    for trace in result.traces[-20:]:
        trace_trades = []
        for trade in trace.trades:
            trace_trades.append(
                {
                    "symbol": trade.symbol,
                    "side": trade.side,
                    "quantity": trade.quantity,
                    "fill_price": trade.fill_price,
                    "gross_value": trade.gross_value,
                    "costs": trade.costs,
                }
            )
        traces.append(
            {
                "trade_date": trace.trade_date.isoformat(),
                "research_output": trace.research_output,
                "target_weights": trace.target_weights,
                "trades": trace_trades,
                "equity": trace.equity,
            }
        )

    return {
        "universe": UNIVERSE,
        "metrics": result.metrics,
        "equity_curve": equity_curve,
        "trades": trades,
        "benchmark_summary": result.benchmark_summary.to_dict(orient="records"),
        "benchmark_curves": benchmark_curves,
        "traces": traces,
    }


def run_backtest_command(args: argparse.Namespace) -> None:
    start = datetime.strptime(args.start, "%Y-%m-%d").date()
    end = datetime.strptime(args.end, "%Y-%m-%d").date()
    result = run_full_backtest(start_date=start, end_date=end, initial_cash=args.initial_cash)
    print(json.dumps(_serialize_backtest(result)))


def run_stock_insight_command(args: argparse.Namespace) -> None:
    sources = load_sources(path=args.sources_file)
    headlines = gather_source_headlines(sources=sources, max_headlines=args.max_headlines)
    ensemble = ModelEnsemble()
    insight = ensemble.stock_world_impact(
        ticker=args.ticker.upper(),
        headlines=headlines,
        source_domains=sources,
    )
    payload = {
        "ticker": args.ticker.upper(),
        "sources": sources,
        "headline_count": len(headlines),
        "headlines": headlines,
        "ensemble_analysis": insight,
    }
    print(json.dumps(payload))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Electron bridge for hedge fund MVP.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    backtest = subparsers.add_parser("backtest", help="Run full backtest and return JSON.")
    backtest.add_argument("--start", default=SIM.start_date.isoformat())
    backtest.add_argument("--end", default=SIM.end_date.isoformat())
    backtest.add_argument("--initial-cash", type=float, default=SIM.initial_cash)
    backtest.set_defaults(func=run_backtest_command)

    insight = subparsers.add_parser("stock-insight", help="Scan sources and summarize stock impact.")
    insight.add_argument("--ticker", required=True)
    insight.add_argument("--sources-file", default="sources.txt")
    insight.add_argument("--max-headlines", type=int, default=30)
    insight.set_defaults(func=run_stock_insight_command)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
