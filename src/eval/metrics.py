from __future__ import annotations

import numpy as np
import pandas as pd


def compute_performance_metrics(equity_curve: pd.DataFrame, risk_free_rate: float = 0.0) -> dict[str, float]:
    if equity_curve.empty or len(equity_curve) < 2:
        return {
            "total_return": 0.0,
            "annualized_return": 0.0,
            "volatility": 0.0,
            "sharpe_ratio": 0.0,
            "max_drawdown": 0.0,
            "win_rate": 0.0,
        }

    curve = equity_curve.copy()
    curve["returns"] = curve["total_equity"].pct_change().fillna(0.0)
    total_return = curve["total_equity"].iloc[-1] / curve["total_equity"].iloc[0] - 1.0
    avg_daily = curve["returns"].mean()
    vol_daily = curve["returns"].std(ddof=0)
    annualized_return = (1 + avg_daily) ** 252 - 1
    volatility = vol_daily * np.sqrt(252)
    sharpe = 0.0 if vol_daily == 0 else ((avg_daily - risk_free_rate / 252) / vol_daily) * np.sqrt(252)

    running_peak = curve["total_equity"].cummax()
    drawdown = curve["total_equity"] / running_peak - 1.0
    max_drawdown = float(drawdown.min())
    win_rate = float((curve["returns"] > 0).sum() / max(len(curve) - 1, 1))

    return {
        "total_return": float(total_return),
        "annualized_return": float(annualized_return),
        "volatility": float(volatility),
        "sharpe_ratio": float(sharpe),
        "max_drawdown": max_drawdown,
        "win_rate": win_rate,
    }


def compute_alpha(strategy_returns: pd.Series, benchmark_returns: pd.Series) -> float:
    aligned = pd.concat([strategy_returns, benchmark_returns], axis=1).dropna()
    if aligned.empty:
        return 0.0
    aligned.columns = ["strategy", "benchmark"]
    excess = aligned["strategy"] - aligned["benchmark"]
    return float(excess.mean() * 252)
