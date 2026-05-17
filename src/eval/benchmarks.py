from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

from src.data.prices import PriceDataStore


@dataclass
class BenchmarkEngine:
    price_store: PriceDataStore

    def price_series(self, symbol: str, start_date: date, end_date: date) -> pd.DataFrame:
        return self.price_store.load_symbol(symbol, start_date=start_date, end_date=end_date)

    def buy_and_hold(self, symbol: str, start_date: date, end_date: date, initial_cash: float) -> pd.DataFrame:
        prices = self.price_series(symbol, start_date, end_date)
        shares = int(initial_cash // prices.iloc[0]["Close"])
        cash = initial_cash - shares * prices.iloc[0]["Close"]
        prices["total_equity"] = cash + shares * prices["Close"]
        prices = prices.rename(columns={"Date": "date"})
        return prices[["date", "total_equity"]]

    def random_strategy(
        self, symbol: str, start_date: date, end_date: date, initial_cash: float, seed: int = 42
    ) -> pd.DataFrame:
        prices = self.price_series(symbol, start_date, end_date).copy()
        rng = np.random.default_rng(seed)
        prices["ret"] = prices["Close"].pct_change().fillna(0.0)
        # Randomly long or flat each day.
        prices["exposure"] = rng.choice([0.0, 1.0], size=len(prices), p=[0.5, 0.5])
        prices["strat_ret"] = prices["ret"] * prices["exposure"]
        prices["total_equity"] = initial_cash * (1 + prices["strat_ret"]).cumprod()
        prices = prices.rename(columns={"Date": "date"})
        return prices[["date", "total_equity"]]

    def momentum_strategy(
        self,
        symbol: str,
        start_date: date,
        end_date: date,
        initial_cash: float,
        lookback: int = 20,
    ) -> pd.DataFrame:
        prices = self.price_series(symbol, start_date, end_date).copy()
        prices["ret"] = prices["Close"].pct_change().fillna(0.0)
        prices["mom"] = prices["Close"] / prices["Close"].shift(lookback) - 1.0
        prices["exposure"] = (prices["mom"] > 0).astype(float)
        prices["strat_ret"] = prices["ret"] * prices["exposure"]
        prices["total_equity"] = initial_cash * (1 + prices["strat_ret"]).cumprod()
        prices = prices.rename(columns={"Date": "date"})
        return prices[["date", "total_equity"]]


def benchmark_table(
    benchmark_curves: dict[str, pd.DataFrame],
    strategy_curve: pd.DataFrame,
) -> pd.DataFrame:
    rows = []
    strat_ret = strategy_curve["total_equity"].pct_change().fillna(0.0)
    for name, curve in benchmark_curves.items():
        bench_ret = curve["total_equity"].pct_change().fillna(0.0)
        aligned = pd.concat([strat_ret, bench_ret], axis=1).dropna()
        alpha = 0.0
        if not aligned.empty:
            aligned.columns = ["strategy", "benchmark"]
            alpha = (aligned["strategy"] - aligned["benchmark"]).mean() * 252
        total_return = curve["total_equity"].iloc[-1] / curve["total_equity"].iloc[0] - 1.0
        rows.append(
            {
                "benchmark": name,
                "total_return": float(total_return),
                "alpha_vs_benchmark": float(alpha),
            }
        )
    return pd.DataFrame(rows)
