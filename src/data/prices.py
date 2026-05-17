from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path

import pandas as pd
import yfinance as yf

from src.config import DATA, ensure_directories


@dataclass
class PriceDataStore:
    prices_dir: Path = DATA.prices_dir

    def __post_init__(self) -> None:
        ensure_directories()

    def _path_for_symbol(self, symbol: str) -> Path:
        return self.prices_dir / f"{symbol}.csv"

    def load_symbol(
        self,
        symbol: str,
        start_date: date,
        end_date: date,
        force_refresh: bool = False,
    ) -> pd.DataFrame:
        path = self._path_for_symbol(symbol)
        if path.exists() and not force_refresh:
            data = pd.read_csv(path, parse_dates=["Date"])
        else:
            data = self._download_symbol(symbol, start_date, end_date)
            data.to_csv(path, index=False)

        mask = (data["Date"].dt.date >= start_date) & (data["Date"].dt.date <= end_date)
        return data.loc[mask].reset_index(drop=True)

    def _download_symbol(self, symbol: str, start_date: date, end_date: date) -> pd.DataFrame:
        # yfinance uses exclusive end dates, so request one extra day.
        request_end = pd.Timestamp(end_date) + pd.Timedelta(days=1)
        df = yf.download(
            symbol,
            start=start_date.isoformat(),
            end=request_end.date().isoformat(),
            auto_adjust=False,
            progress=False,
        )
        if df.empty:
            raise ValueError(f"No price data returned for symbol {symbol}")

        df = df.reset_index()[["Date", "Open", "High", "Low", "Close", "Adj Close", "Volume"]]
        df.columns = ["Date", "Open", "High", "Low", "Close", "AdjClose", "Volume"]
        return df

    def load_universe(
        self,
        symbols: list[str],
        start_date: date,
        end_date: date,
        force_refresh: bool = False,
    ) -> dict[str, pd.DataFrame]:
        return {
            symbol: self.load_symbol(symbol, start_date, end_date, force_refresh=force_refresh)
            for symbol in symbols
        }

    @staticmethod
    def get_latest_price_on_or_before(data: pd.DataFrame, as_of: date) -> float | None:
        filtered = data[data["Date"].dt.date <= as_of]
        if filtered.empty:
            return None
        return float(filtered.iloc[-1]["Close"])
