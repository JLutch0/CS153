from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import pandas as pd

from src.agents.research_agent import ResearchAgent
from src.agents.trading_agent import TradingAgent
from src.config import SIM
from src.eval.benchmarks import BenchmarkEngine, benchmark_table
from src.eval.metrics import compute_alpha, compute_performance_metrics
from src.sim.simulator import HistoricalMarketSimulator


@dataclass
class BacktestResult:
    equity_curve: pd.DataFrame
    trades: pd.DataFrame
    traces: list
    metrics: dict[str, float]
    benchmark_curves: dict[str, pd.DataFrame]
    benchmark_summary: pd.DataFrame


def run_full_backtest(
    start_date: date = SIM.start_date,
    end_date: date = SIM.end_date,
    initial_cash: float = SIM.initial_cash,
) -> BacktestResult:
    simulator = HistoricalMarketSimulator(start_date=start_date, end_date=end_date, initial_cash=initial_cash)
    research_agent = ResearchAgent()
    trading_agent = TradingAgent()
    sim_out = simulator.run(research_agent=research_agent, trading_agent=trading_agent)

    equity_curve = sim_out["equity_curve"]
    if not equity_curve.empty:
        equity_curve = equity_curve.rename(columns={"date": "date"})
    metrics = compute_performance_metrics(equity_curve)

    benchmark_engine = BenchmarkEngine(price_store=simulator.price_store)
    spy = benchmark_engine.buy_and_hold("SPY", start_date, end_date, initial_cash)
    qqq = benchmark_engine.buy_and_hold("QQQ", start_date, end_date, initial_cash)
    rnd = benchmark_engine.random_strategy("SPY", start_date, end_date, initial_cash)
    mom = benchmark_engine.momentum_strategy("SPY", start_date, end_date, initial_cash)
    benchmark_curves = {"SPY": spy, "QQQ": qqq, "Random": rnd, "Momentum": mom}

    benchmark_summary = benchmark_table(benchmark_curves, equity_curve[["date", "total_equity"]])
    strategy_returns = equity_curve["total_equity"].pct_change().fillna(0.0)
    metrics["alpha_vs_spy"] = compute_alpha(strategy_returns, spy["total_equity"].pct_change().fillna(0.0))

    return BacktestResult(
        equity_curve=equity_curve,
        trades=sim_out["trades"],
        traces=sim_out["traces"],
        metrics=metrics,
        benchmark_curves=benchmark_curves,
        benchmark_summary=benchmark_summary,
    )
